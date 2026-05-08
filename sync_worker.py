import cloudscraper
import re
import time
import json
import requests
import os
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

# ==========================================
# CONFIGURAÇÕES DO EPG LOCAL
# ==========================================
LOCAL_EPG_CONFIGS = [
    {
        "id": "Globo MG",
        "name": "Globo MG",
        "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/globo-hd/23-2068"
    },
    {
        "id": "Record MG",
        "name": "Record MG",
        "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/record-hd/23-2084"
    },
    {
        "id": "SBT MG",
        "name": "TV Alterosa",
        "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/sbt-tv-alterosa/23-1949"
    },
    {
        "id": "Band MG",
        "name": "Band",
        "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/band/23-408"
    }
]

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
    """Gera o arquivo de metadados locais (Guia regional) para múltiplos canais."""
    print("Processando telemetria local para canais regionais...")
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    fuso_br = pytz.timezone('America/Sao_Paulo')
    
    xml_channels = []
    xml_programmes = []
    total_blocos = 0

    for config in LOCAL_EPG_CONFIGS:
        print(f"  -> Coletando grade: {config['name']}...")
        
        xml_channels.append(f'  <channel id="{config["id"]}">\n    <display-name>{config["name"]}</display-name>\n  </channel>\n')
        
        try:
            resposta = requests.get(config["url"], headers=headers, timeout=15)
            resposta.raise_for_status()
        except Exception as e:
            print(f"     [X] Erro ao buscar telemetria de {config['name']}: {e}")
            continue

        parsed_dom = BeautifulSoup(resposta.text, 'html.parser')
        
        blocos_canal = 0
        for bloco in parsed_dom.find_all('div', class_='cell-item'):
            try:
                start_sec = int(bloco['data-start']) / 1000.0
                end_sec = int(bloco['data-end']) / 1000.0
                titulo = bloco.find('p', class_='channel-program-item-title').text.strip()
                
                str_inicio = datetime.fromtimestamp(start_sec, fuso_br).strftime('%Y%m%d%H%M%S %z')
                str_fim = datetime.fromtimestamp(end_sec, fuso_br).strftime('%Y%m%d%H%M%S %z')
                
                xml_programmes.append(f'  <programme start="{str_inicio}" stop="{str_fim}" channel="{config["id"]}">\n    <title lang="pt">{titulo}</title>\n  </programme>\n')
                blocos_canal += 1
            except:
                continue
                
        total_blocos += blocos_canal
        print(f"     [OK] {blocos_canal} programas adicionados.")

    if xml_channels and xml_programmes:
        linhas_xml = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n']
        linhas_xml.extend(xml_channels)
        linhas_xml.extend(xml_programmes)
        linhas_xml.append('</tv>\n')
        
        with open('local_meta.xml', 'w', encoding='utf-8') as arquivo:
            arquivo.writelines(linhas_xml)
            
        print(f"Telemetria local consolidada: {total_blocos} blocos registrados.\n")
    else:
        print("Aviso: Nenhum dado de EPG pôde ser extraído.\n")

def recuperar_link_cache(id_meta, nome_no):
    """Vasculha o arquivo export_data.txt atual em busca do último link funcional."""
    if not os.path.exists("export_data.txt"):
        return None
    
    try:
        with open("export_data.txt", "r", encoding="utf-8") as f:
            conteudo = f.read()
            # Se tiver ID de EPG, busca por ele. Se não tiver (como os da Amazon/Disney), busca pelo nome.
            if id_meta:
                regex = rf'tvg-id="{re.escape(id_meta)}".*?\n(http[^\s|]+)'
            else:
                regex = rf', {re.escape(nome_no)}\n(http[^\s|]+)'
                
            match = re.search(regex, conteudo)
            if match:
                return match.group(1)
    except Exception as e:
        print(f"  [X] Erro ao ler cache: {e}")
    return None

def extract_payload(sessao, url_destino):
    """Lógica robusta de extração, buscando inclusive nos iframes."""
    try:
        resposta = sessao.get(url_destino, headers=HEADERS_SITE, timeout=15)
        
        # O site bloqueou a conexão (ex: Cloudflare 403)
        if resposta.status_code != 200:
            print(f"  -> Erro HTTP {resposta.status_code} no nó {url_destino}")
            return None

        # 1. Tenta achar na página principal
        payload_busca = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta.text)
        if payload_busca:
            return payload_busca.group(1)
        
        # 2. Mergulha nos iframes
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
        print(f"  -> Falha de conexão/timeout no nó {url_destino}")
    return None

def run_sync():
    """Motor Híbrido: Junta API, Scraping e Camada de Persistência."""
    try:
        with open("config.json", "r", encoding="utf-8") as f:
            meus_canais = json.load(f)
    except Exception as e:
        print(f"Erro ao carregar config.json: {e}")
        return

    print("=== INICIANDO MOTOR COM PROTEÇÃO DE CACHE ===")
    build_local_manifest()

    print("Baixando banco de dados central da API...")
    try:
        req_api = requests.get("https://explouddev.com.br/api/canais/todos?search=", headers=HEADERS_API, timeout=15)
        api_cache = req_api.json()
    except Exception as e:
        print(f"Falha ao conectar na API: {e}")
        return

    sessao = build_session()
    
    # IMPORTANTE: EPG_LOCAL primeiro para forçar prioridade na TV
    linhas_manifest = [f'#EXTM3U x-tvg-url="{EPG_GLOBAL},{EPG_LOCAL}"\n']

    for canal in meus_canais:
        nome_no = canal['nome']
        nome_busca_api = canal.get('nome_api', nome_no)
        
        id_meta = canal.get('tvg_id', '')
        url_asset = canal.get('logo', '')
        link_payload = None
        
        print(f"Processando: {nome_no}...", end=" ", flush=True)

        # ==========================================
        # ROTA 1: EXTRAÇÃO VIA SITE (COM CACHE DE FALHA)
        # ==========================================
        if "url" in canal:
            url_origem = canal["url"]
            link_payload = extract_payload(sessao, url_origem)
            
            if link_payload:
                print("[SITE OK - NOVO]")
            else:
                # O scraping falhou, aciona o mecanismo de defesa
                link_payload = recuperar_link_cache(id_meta, nome_no)
                if link_payload:
                    print("[SITE OK - RECUPERADO]")
                else:
                    print("[SITE FALHA TOTAL]")
            
            if link_payload:
                categoria_nome = canal.get("categoria_api", "Diversos")
                # Usa o id_meta como tvg-name se ele existir, para evitar Fuzzy Match no TiviMate
                tvg_name_final = id_meta if id_meta else nome_no 
                
                linhas_manifest.append(f'#EXTINF:-1 tvg-id="{id_meta}" tvg-logo="{url_asset}" tvg-name="{tvg_name_final}" group-title="{categoria_nome}", {nome_no}\n')
                linhas_manifest.append(f'{link_payload}|Referer={url_origem}\n')
            
            time.sleep(1.5)

        # ==========================================
        # ROTA 2: EXTRAÇÃO VIA API (PADRÃO)
        # ==========================================
        else:
            dados_api = next((c for c in api_cache if c['name'] == nome_busca_api), None)
            
            if dados_api and "sources" in dados_api:
                filtro_regional = canal.get('filtro_cdn')
                
                if filtro_regional:
                    for fonte in dados_api['sources']:
                        if filtro_regional.lower() in fonte['name'].lower():
                            link_payload = fonte['link']
                            break
                            
                if not link_payload:
                    for fonte in dados_api['sources']:
                        if "sinal.cc" not in fonte['link']:
                            link_payload = fonte['link']
                            break

            if link_payload:
                categoria_nome = canal.get("categoria_api", "Diversos")
                tvg_name_final = id_meta if id_meta else nome_no
                
                linhas_manifest.append(f'#EXTINF:-1 tvg-id="{id_meta}" tvg-logo="{url_asset}" tvg-name="{tvg_name_final}" group-title="{categoria_nome}", {nome_no}\n')
                linhas_manifest.append(f'{link_payload}|User-Agent=okhttp/4.9.2\n')
                print("[API OK]")
            else:
                print("[API FALHA]")

    with open("export_data.txt", "w", encoding="utf-8") as arquivo:
        arquivo.writelines(linhas_manifest)
        
    print("\nSincronização concluída! Arquivo de exportação atualizado.")

if __name__ == "__main__":
    run_sync()
