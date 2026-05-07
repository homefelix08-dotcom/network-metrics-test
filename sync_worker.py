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

# ==========================================
# CONFIGURAÇÕES GERAIS
# ==========================================
HEADERS_SITE = {
    "X-Forwarded-For": "177.129.1.1",
    "Referer": "https://4embeddecanais.xyz/"
}
HEADERS_API = {'User-Agent': 'okhttp/4.9.2'}

SOURCE_TELEMETRY = "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/globo-hd/23-2068"
META_NODE_ID = "Globo MG"
META_NODE_NAME = "Globo MG"

# Links dos Guias (EPG)
EPG_GLOBAL = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/refs/heads/main/claro.xml"
EPG_LOCAL = "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/local_meta.xml"

def build_session():
    """Cria uma sessão HTTP resiliente para extração de dados do site."""
    scraper = cloudscraper.create_scraper(
        browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True}
    )
    retentativas = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    adaptador = HTTPAdapter(max_retries=retentativas)
    scraper.mount('http://', adaptador)
    scraper.mount('https://', adaptador)
    return scraper

def build_local_manifest():
    """Gera o arquivo de metadados locais (Guia da Globo MG)."""
    print("Processando telemetria local...")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    
    try:
        resposta = requests.get(SOURCE_TELEMETRY, headers=headers, timeout=15)
        resposta.raise_for_status()
    except Exception as e:
        print(f"Erro ao buscar telemetria de origem: {e}")
        return

    parsed_dom = BeautifulSoup(resposta.text, 'html.parser')
    meta_nodes = []
    fuso_br = pytz.timezone('America/Sao_Paulo')

    for bloco in parsed_dom.find_all('div', class_='cell-item'):
        try:
            start_sec = int(bloco['data-start']) / 1000.0
            end_sec = int(bloco['data-end']) / 1000.0
            titulo = bloco.find('p', class_='channel-program-item-title').text.strip()
            
            str_inicio = datetime.fromtimestamp(start_sec, fuso_br).strftime('%Y%m%d%H%M%S %z')
            str_fim = datetime.fromtimestamp(end_sec, fuso_br).strftime('%Y%m%d%H%M%S %z')
            
            meta_nodes.append(f'  <programme start="{str_inicio}" stop="{str_fim}" channel="{META_NODE_ID}">\n    <title lang="pt">{titulo}</title>\n  </programme>\n')
        except:
            continue
            
    if meta_nodes:
        linhas_xml = [
            '<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n',
            f'  <channel id="{META_NODE_ID}">\n    <display-name>{META_NODE_NAME}</display-name>\n  </channel>\n'
        ]
        linhas_xml.extend(meta_nodes)
        linhas_xml.append('</tv>\n')
        
        with open('local_meta.xml', 'w', encoding='utf-8') as arquivo:
            arquivo.writelines(linhas_xml)
        print(f"Telemetria local gerada: {len(meta_nodes)} blocos registrados.")

def extract_payload(sessao, url_destino):
    """Sua lógica robusta de extração, buscando inclusive nos iframes."""
    try:
        resposta = sessao.get(url_destino, headers=HEADERS_SITE, timeout=15)
        
        # 1. Tenta achar na página principal
        payload_busca = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta.text)
        if payload_busca:
            return payload_busca.group(1)
        
        # 2. Mergulha nos iframes se não achar na principal
        iframes = re.findall(r'<iframe[^>]+src=["\']([^"\']+)["\']', resposta.text, re.IGNORECASE)
        for url_iframe in iframes:
            if url_iframe.startswith('//'):
                url_iframe = 'https:' + url_iframe
            try:
                resposta_frame = sessao.get(url_iframe, headers=HEADERS_SITE, timeout=10)
                payload_busca_iframe = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta_frame.text)
                if payload_busca_iframe:
                    return payload_busca_iframe.group(1)
            except:
                continue
                
    except Exception as e:
        print(f"  -> Erro de conexão no nó {url_destino}: {e}")
    return None

def run_sync():
    """Motor Híbrido: Junta a API com o Scraping."""
    try:
        with open("meus_canais.json", "r", encoding="utf-8") as f:
            meus_canais = json.load(f)
    except Exception as e:
        print(f"Erro ao carregar meus_canais.json: {e}")
        return

    print("Iniciando sincronização global...")
    build_local_manifest()

    print("Baixando cache da API Central...")
    try:
        req_api = requests.get("https://explouddev.com.br/api/canais/todos?search=", headers=HEADERS_API, timeout=15)
        api_cache = req_api.json()
    except Exception as e:
        print(f"Falha ao conectar na API: {e}")
        return

    sessao = build_session()
    linhas_manifest = [f'#EXTM3U x-tvg-url="{EPG_GLOBAL},{EPG_LOCAL}"\n']

    for canal in meus_canais:
        nome_no = canal['nome']
        id_meta = canal.get('tvg_id', '')
        url_asset = canal.get('logo', '')
        link_payload = None
        
        print(f"Processando: {nome_no}...", end=" ", flush=True)

        # ==========================================
        # ROTA 1: EXTRAÇÃO VIA SITE (Se tiver "url")
        # ==========================================
        if "url" in canal:
            url_origem = canal["url"]
            link_payload = extract_payload(sessao, url_origem)
            
            if link_payload:
                linhas_manifest.append(f'#EXTINF:-1 tvg-id="{id_meta}" tvg-logo="{url_asset}" tvg-name="{nome_no}" group-title="{categoria_nome}", {nome_no}\n')
                # A chave mágica que faltava para os sites: o Referer!
                linhas_manifest.append(f'{link_payload}|Referer={url_origem}\n')
                print("[SITE OK]")
            else:
                print("[SITE FALHA]")
            time.sleep(1.5)

        # ==========================================
        # ROTA 2: EXTRAÇÃO VIA API
        # ==========================================
        else:
            dados_api = next((c for c in api_cache if c['name'] == nome_no), None)
            
            if dados_api and "sources" in dados_api:
                filtro_regional = canal.get('filtro_cdn')
                
                # Procura com filtro regional
                if filtro_regional:
                    for fonte in dados_api['sources']:
                        if filtro_regional.lower() in fonte['name'].lower():
                            link_payload = fonte['link']
                            break
                            
                # Fallback para o CDN direto
                if not link_payload:
                    for fonte in dados_api['sources']:
                        if "sinal.cc" not in fonte['link']:
                            link_payload = fonte['link']
                            break

            if link_payload:
                categoria_nome = canal.get("categoria_api", "Diversos")
                linhas_manifest.append(f'#EXTINF:-1 tvg-id="{id_meta}" tvg-logo="{url_asset}" tvg-name="{nome_no}" group-title="{categoria_nome}", {nome_no}\n')
                linhas_manifest.append(f'{link_payload}|User-Agent=okhttp/4.9.2\n')
                print("[API OK]")
            else:
                print("[API FALHA]")

    with open("export_data.txt", "w", encoding="utf-8") as arquivo:
        arquivo.writelines(linhas_manifest)
        
    print("\nSincronização concluída! Arquivo de exportação atualizado.")

if __name__ == "__main__":
    run_sync()
