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
HEADERS_API = {'User-Agent': 'okhttp/4.9.2'}
REPO_PATH = "src/repo.js"

# Links dos Guias (EPG)
EPG_GLOBAL = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/refs/heads/main/claro.xml"
EPG_LOCAL = "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/local_meta.xml"

# ==========================================
# CONFIGURAÇÕES DO EPG LOCAL
# ==========================================
LOCAL_EPG_CONFIGS = [
    {"id": "Globo MG", "name": "Globo MG", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/globo-hd/23-2068"},
    {"id": "Record MG", "name": "Record MG", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/record-hd/23-2084"},
    {"id": "SBT MG", "name": "TV Alterosa", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/sbt-tv-alterosa/23-1949"},
    {"id": "Band MG", "name": "Band", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/band/23-408"}
]

# ==========================================
# FUNÇÕES AUXILIARES
# ==========================================
def build_session():
    scraper = cloudscraper.create_scraper(browser={'browser': 'chrome', 'platform': 'windows', 'desktop': True})
    retentativas = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
    adaptador = HTTPAdapter(max_retries=retentativas)
    scraper.mount('http://', adaptador)
    scraper.mount('https://', adaptador)
    return scraper

def load_repo_js():
    """Lê o arquivo repo.js e extrai o array JSON."""
    try:
        with open(REPO_PATH, "r", encoding="utf-8") as f:
            content = f.read()
            match = re.search(r'\[.*\]', content, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            else:
                print("Erro: Array não encontrado no repo.js")
                return []
    except Exception as e:
        print(f"Erro ao ler {REPO_PATH}: {e}")
        return []

def recuperar_link_cache(id_meta, nome_no):
    """Busca o último link funcional no backup.txt."""
    if not os.path.exists("backup.txt"): return None
    try:
        with open("backup.txt", "r", encoding="utf-8") as f:
            conteudo = f.read()
            regex = rf'tvg-name="{re.escape(nome_no)}".*?\n(http[^\s|]+)'
            match = re.search(regex, conteudo, re.IGNORECASE)
            if match: return match.group(1)
    except Exception: pass
    return None

def extract_payload(sessao, url_destino):
    """Realiza o scraping da página."""
    if not url_destino: return None
    try:
        headers_dinamicos = {
            "X-Forwarded-For": "177.129.1.1",
            "Referer": "https://ww2.embedtv.lat/"
        }
        resposta = sessao.get(url_destino, headers=headers_dinamicos, timeout=15)
        if resposta.status_code != 200: return None
        
        # Página Principal
        busca = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta.text)
        if busca: return busca.group(1)
        
        # Iframes
        iframes = re.findall(r'<iframe[^>]+src=["\']([^"\']+)["\']', resposta.text, re.IGNORECASE)
        for url_iframe in iframes:
            if url_iframe.startswith('//'): url_iframe = 'https:' + url_iframe
            try:
                resp_frame = sessao.get(url_iframe, headers=headers_dinamicos, timeout=10)
                busca_frame = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resp_frame.text)
                if busca_frame: return busca_frame.group(1)
            except: continue
    except Exception: pass
    return None

def buscar_na_api(api_cache, canal):
    """Busca o link no cache da API Exploud."""
    nome_busca = canal.get('nome_api', canal['nome']).lower()
    
    dados_api = next((c for c in api_cache if c['name'].lower() == nome_busca), None)
    if not dados_api:
        dados_api = next((c for c in api_cache if nome_busca in c['name'].lower()), None)
        
    if dados_api and "sources" in dados_api:
        filtro = canal.get('filtro_cdn')
        if filtro:
            for fonte in dados_api['sources']:
                if filtro.lower() in fonte['name'].lower(): return fonte['link']
                
        for fonte in dados_api['sources']:
            if "sinal.cc" not in fonte['link']: return fonte['link']
            
        if dados_api['sources']: return dados_api['sources'][0]['link']
    return None

# ==========================================
# GERAÇÃO DE EPG LOCAL
# ==========================================
def build_local_manifest():
    print("Processando telemetria local para canais regionais...")
    headers = {'User-Agent': 'Mozilla/5.0...'}
    fuso_br = pytz.timezone('America/Sao_Paulo')
    xml_channels, xml_programmes = [], []
    total_blocos = 0

    for config in LOCAL_EPG_CONFIGS:
        print(f"  -> Coletando grade: {config['name']}...")
        xml_channels.append(f'  <channel id="{config["id"]}">\n    <display-name>{config["name"]}</display-name>\n  </channel>\n')
        try:
            resposta = requests.get(config["url"], headers=headers, timeout=15)
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
                except: continue
            total_blocos += blocos_canal
            print(f"     [OK] {blocos_canal} programas.")
        except Exception as e:
            print(f"     [X] Erro: {e}")

    if xml_channels and xml_programmes:
        linhas = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n'] + xml_channels + xml_programmes + ['</tv>\n']
        with open('local_meta.xml', 'w', encoding='utf-8') as f:
            f.writelines(linhas)
        print(f"EPG Local: {total_blocos} programas.\n")

# ==========================================
# MOTOR DE SINCRONIZAÇÃO (BACKUP)
# ==========================================
def run_sync():
    print("=== INICIANDO MOTOR DE BACKUP (SYNC) ===")
    build_local_manifest()

    channels = load_repo_js()
    if not channels:
        print("Cancelando sync. repo.js vazio.")
        return

    print("Baixando cache da API...")
    try:
        api_cache = requests.get("https://explouddev.com.br/api/canais/todos?search=", headers=HEADERS_API, timeout=15).json()
    except Exception as e:
        print(f"Falha na API: {e}")
        api_cache = [] 

    sessao = build_session()
    linhas_manifest = [f'#EXTM3U x-tvg-url="{EPG_GLOBAL},{EPG_LOCAL}"\n']

    for canal in channels:
        nome = canal['nome']
        id_meta = canal.get('tvg_id', nome)
        url_asset = canal.get('logo', '')
        categoria = canal.get('categoria', 'Diversos')
        provedor = canal.get('provedor', 'api')
        url_site = canal.get('url')
        
        link_payload = None
        header_final = ""
        print(f"Verificando: {nome}...", end=" ", flush=True)

        # 1. Tenta Site primeiro se for a preferência
        if provedor == "site" and url_site:
            link_payload = extract_payload(sessao, url_site)
            if link_payload:
                print("[SITE OK]")
                header_final = f"|Referer={url_site}"
            else:
                link_payload = buscar_na_api(api_cache, canal)
                if link_payload:
                    print("[API FALLBACK OK]")
                    header_final = "|User-Agent=okhttp/4.9.2"

        # 2. Tenta API primeiro se for a preferência
        else:
            link_payload = buscar_na_api(api_cache, canal)
            if link_payload:
                print("[API OK]")
                header_final = "|User-Agent=okhttp/4.9.2"
            elif url_site:
                link_payload = extract_payload(sessao, url_site)
                if link_payload:
                    print("[SITE FALLBACK OK]")
                    header_final = f"|Referer={url_site}"

        # 3. Cache se tudo falhar
        if not link_payload:
            link_payload = recuperar_link_cache(id_meta, nome)
            if link_payload:
                print("[CACHE RECUPERADO]")
                # Tentamos manter um User-Agent padrão para links do cache
                header_final = "|User-Agent=okhttp/4.9.2"
            else:
                print("[FALHA TOTAL]")

        # 4. Gravação
        if link_payload:
            linhas_manifest.append(f'#EXTINF:-1 tvg-id="{id_meta}" tvg-name="{nome}" tvg-logo="{url_asset}" group-title="{categoria}", {nome}\n')
            linhas_manifest.append(f'{link_payload}{header_final}\n')
        
        time.sleep(1) # Respeito às APIs

    with open("backup.txt", "w", encoding="utf-8") as arquivo:
        arquivo.writelines(linhas_manifest)
        
    print("\nSincronização concluída! Arquivo backup.txt atualizado.")

if __name__ == "__main__":
    run_sync()