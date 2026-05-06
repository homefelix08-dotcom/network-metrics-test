import cloudscraper
import re
import time
import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
from datetime import datetime
import pytz

# Network configs
HEADERS = {
    "X-Forwarded-For": "177.129.1.1",
    "Referer": "https://4embeddecanais.xyz/"
}

# Configurações do nó local (Telemetria/EPG)
SOURCE_TELEMETRY = "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/globo-hd/23-2068"
META_NODE_ID = "GloboMinas"
META_NODE_NAME = "Globo MG"

def build_session():
    """Cria uma sessão HTTP resiliente para extração de dados."""
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )
    
    retentativas = Retry(
        total=3, 
        backoff_factor=1, 
        status_forcelist=[500, 502, 503, 504]
    )
    adaptador = HTTPAdapter(max_retries=retentativas)
    
    scraper.mount('http://', adaptador)
    scraper.mount('https://', adaptador)
    
    return scraper

def load_config(caminho_arquivo="config.json"):
    """Lê o arquivo JSON com as definições dos nós."""
    try:
        with open(caminho_arquivo, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except Exception as e:
        print(f"Erro ao carregar o arquivo {caminho_arquivo}: {e}")
        return {}

def build_local_manifest():
    """Gera o arquivo de metadados locais de forma camuflada."""
    print("Processando telemetria local...")
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        resposta = requests.get(SOURCE_TELEMETRY, headers=headers, timeout=15)
        resposta.raise_for_status()
    except Exception as e:
        print(f"Erro ao buscar telemetria de origem: {e}")
        return

    parsed_dom = BeautifulSoup(resposta.text, 'html.parser')
    meta_nodes = []
    fuso_br = pytz.timezone('America/Sao_Paulo')

    blocos = parsed_dom.find_all('div', class_='cell-item')

    for bloco in blocos:
        try:
            start_sec = int(bloco['data-start']) / 1000.0
            end_sec = int(bloco['data-end']) / 1000.0
            titulo = bloco.find('p', class_='channel-program-item-title').text.strip()
            
            dt_inicio = datetime.fromtimestamp(start_sec, fuso_br)
            dt_fim = datetime.fromtimestamp(end_sec, fuso_br)
            
            str_inicio = dt_inicio.strftime('%Y%m%d%H%M%S %z')
            str_fim = dt_fim.strftime('%Y%m%d%H%M%S %z')
            
            xml_item = f'  <programme start="{str_inicio}" stop="{str_fim}" channel="{META_NODE_ID}">\n'
            xml_item += f'    <title lang="pt">{titulo}</title>\n'
            xml_item += '  </programme>\n'
            
            meta_nodes.append(xml_item)
        except:
            continue
            
    if meta_nodes:
        linhas_xml = [
            '<?xml version="1.0" encoding="UTF-8"?>\n',
            '<tv>\n',
            f'  <channel id="{META_NODE_ID}">\n',
            f'    <display-name>{META_NODE_NAME}</display-name>\n',
            '  </channel>\n'
        ]
        linhas_xml.extend(meta_nodes)
        linhas_xml.append('</tv>\n')
        
        with open('local_meta.xml', 'w', encoding='utf-8') as arquivo:
            arquivo.writelines(linhas_xml)
        print(f"Telemetria local gerada com sucesso: {len(meta_nodes)} blocos registrados.")

def extract_payload(sessao, url_destino):
    """Extração: Busca o payload principal no source."""
    try:
        resposta = sessao.get(url_destino, headers=HEADERS, timeout=15)
        
        payload_busca = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta.text)
        if payload_busca:
            return payload_busca.group(1)
        
        iframes = re.findall(r'<iframe[^>]+src=["\']([^"\']+)["\']', resposta.text, re.IGNORECASE)
        for url_iframe in iframes:
            if url_iframe.startswith('//'):
                url_iframe = 'https:' + url_iframe
            try:
                resposta_frame = sessao.get(url_iframe, headers=HEADERS, timeout=10)
                payload_busca_iframe = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta_frame.text)
                if payload_busca_iframe:
                    return payload_busca_iframe.group(1)
            except:
                continue
                
    except Exception as e:
        print(f"  -> Erro de conexão com o nó {url_destino}: {e}")
    return None

def run_sync():
    """Função mestre que orquestra o pipeline."""
    nodes = load_config("config.json")
    
    if not nodes:
        print("Nenhum nó encontrado. Verifique o arquivo config.json.")
        return

    print("Iniciando sincronização global...")
    
    # 1. Executa a extração da telemetria local (EPG)
    build_local_manifest()

    # 2. Configura os cabeçalhos com múltiplos manifestos de metadados
    manifest_meta_global = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/refs/heads/main/claro.xml"
    manifest_meta_local = "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/local_meta.xml"
    
    linhas_manifest = [f'#EXTM3U x-tvg-url="{manifest_meta_global},{manifest_meta_local}"\n']
    sessao = build_session()
    
    for nome_grupo, lista_nos in nodes.items():
        print(f"\n--- Sincronizando grupo: {nome_grupo} ---")
        
        for no in lista_nos:
            nome_no = no.get('nome')
            id_meta = no.get('tvg_id', '')
            url_origem = no.get('url')
            url_asset = no.get('logo', '')

            print(f"Buscando: {nome_no}...")
            link_payload = extract_payload(sessao, url_origem)
            
            if link_payload:
                linhas_manifest.append(f'#EXTINF:-1 tvg-id="{id_meta}" tvg-logo="{url_asset}" tvg-name="{nome_no}" group-title="{nome_grupo}", {nome_no}\n')
                linhas_manifest.append(f'{link_payload}|Referer={url_origem}\n')
            else:
                print(f"  -> Falha ao resolver o nó {nome_no}.")
                
            time.sleep(2) 
        
    with open("export_data.txt", "w", encoding="utf-8") as arquivo:
        arquivo.writelines(linhas_manifest)
        
    print("\nSincronização concluída! Arquivo de exportação atualizado.")

if __name__ == "__main__":
    run_sync()
