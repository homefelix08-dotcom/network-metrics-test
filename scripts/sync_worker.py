import cloudscraper
import re
import time
import json
import requests
import os
import subprocess
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
    try:
        with open(REPO_PATH, "r", encoding="utf-8") as f:
            repo_content = f.read()

        execution_code = repo_content.replace("export default", "const data =")
        execution_code += "\nconsole.log(JSON.stringify(data));"

        temp_filename = "temp_bridge_sync.cjs"
        with open(temp_filename, "w", encoding="utf-8") as f:
            f.write(execution_code)

        result = subprocess.run(
            ["node", temp_filename],
            capture_output=True,
            text=True,
            encoding="utf-8",
            shell=True
        )

        if os.path.exists(temp_filename):
            os.remove(temp_filename)

        if result.returncode != 0:
            print(f"Erro no motor do Node dentro do Sync: {result.stderr}")
            return []

        return json.loads(result.stdout.strip())

    except Exception as e:
        print(f"Erro crítico ao interpretar o repo.js no Sync com Node: {e}")
        return []

def recuperar_link_cache(id_meta, nome_no):
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
    if not url_destino: return None
    
    if "sua.tv" in url_destino or url_destino.endswith(".m3u8"):
        return url_destino

    # 🚨 ROTAÇÃO DE DOMÍNIOS NO PYTHON
    match_dominio = re.search(r'https://(\d+)embeddecanais', url_destino)
    numero_base = int(match_dominio.group(1)) if match_dominio else None
    tentativas = 3 if numero_base else 1

    for i in range(tentativas):
        url_tentativa = url_destino
        if numero_base and i > 0:
            novo_numero = numero_base + i
            url_tentativa = url_destino.replace(f"https://{numero_base}embed", f"https://{novo_numero}embed")
            
        try:
            headers_dinamicos = {"Referer": url_tentativa}
            resposta = sessao.get(url_tentativa, headers=headers_dinamicos, timeout=15)
            
            if resposta.status_code == 200:
                # Busca na Página Principal
                busca = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta.text)
                if busca: return busca.group(1)
                
                # Busca em Iframes
                iframes = re.findall(r'<iframe[^>]+src=["\']([^"\']+)["\']', resposta.text, re.IGNORECASE)
                for url_iframe in iframes:
                    if url_iframe.startswith('//'): url_iframe = 'https:' + url_iframe
                    try:
                        resp_frame = sessao.get(url_iframe, headers=headers_dinamicos, timeout=10)
                        busca_frame = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resp_frame.text)
                        if busca_frame: return busca_frame.group(1)
                    except: continue
        except Exception:
            pass # Falhou, o laço continua para o próximo número
            
    return None

def buscar_na_api(api_cache, canal):
    nome_busca = canal.get('nome_api', canal['nome']).lower()
    
    dados_api = next((c for c in api_cache if c['name'].lower() == nome_busca), None)
    if not dados_api:
        dados_api = next((c for c in api_cache if nome_busca in c['name'].lower()), None)
        
    if dados_api and "sources" in dados_api:
        fontes = dados_api['sources']
        
        # 1. Prioriza IP Direto cegamente
        fontes_ip = [f['link'] for f in fontes if re.match(r'^https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', f['link'])]
        if fontes_ip: return fontes_ip[0]
        
        # 2. Filtro CDN
        filtro = canal.get('filtro_cdn')
        if filtro:
            for f in fontes:
                if filtro.lower() in f['name'].lower(): return f['link']
                
        # 3. Padrão
        for f in fontes:
            if "sinal.cc" not in f['link']: return f['link']
            
        if fontes: return fontes[0]['link']
    return None

# ==========================================
# GERAÇÃO DE EPG LOCAL
# ==========================================
def build_local_manifest():
    print("Processando telemetria local para canais regionais...")
    headers = {'User-Agent': 'Mozilla/5.0'}
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

    sessao = build_session()

    print("Baixando cache da API...")
    try:
        # Usa o cloudscraper para evitar bloqueios de WAF no Cronjob
        api_resp = sessao.get("https://explouddev.com.br/api/canais/todos?search=", headers=HEADERS_API, timeout=15)
        api_cache = api_resp.json() if api_resp.status_code == 200 else []
    except Exception as e:
        print(f"Falha na API: {e}")
        api_cache = [] 

    linhas_manifest = [f'#EXTM3U x-tvg-url="{EPG_GLOBAL},{EPG_LOCAL}"\n']

    for canal in channels:
        nome = canal['nome']
        id_meta = canal.get('tvg_id', nome)
        url_asset = canal.get('logo', '')
        categoria = canal.get('categoria', 'Diversos')
        url_site = canal.get('url')
        
        link_payload = None
        header_final = ""
        print(f"Extraindo: {nome}...", end=" ", flush=True)

        # 1. Tenta API primeiro (Para caçar IPs diretos indestrutíveis)
        link_api = buscar_na_api(api_cache, canal)
        is_ip_direto = bool(link_api and re.match(r'^https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}', link_api))

        if is_ip_direto:
            link_payload = link_api
            print("[API IP DIRETO OK]")
            header_final = "|User-Agent=okhttp/4.9.2"
        else:
            # 2. Se não tem IP direto, o Site é melhor que a CDN camuflada
            link_site = extract_payload(sessao, url_site)
            if link_site:
                link_payload = link_site
                print("[SITE OK]")
                header_final = "|User-Agent=okhttp/4.9.2" if "sua.tv" in url_site else f"|Referer={url_site}"
            elif link_api:
                # 3. Fallback para a CDN da API se o site falhar
                link_payload = link_api
                print("[API CDN OK]")
                header_final = "|User-Agent=okhttp/4.9.2"

        # 4. Restaura do arquivo antigo se tudo falhar
        if not link_payload:
            link_payload = recuperar_link_cache(id_meta, nome)
            if link_payload:
                print("[CACHE RECUPERADO]")
                header_final = "|User-Agent=okhttp/4.9.2"
            else:
                print("[FALHA TOTAL]")

        # 5. Gravação exata para o Worker fazer o regex via tvg-name
        if link_payload:
            linhas_manifest.append(f'#EXTINF:-1 tvg-id="{id_meta}" tvg-name="{nome}" tvg-logo="{url_asset}" group-title="{categoria}", {nome}\n')
            linhas_manifest.append(f'{link_payload}{header_final}\n')
        
        time.sleep(0.5)

    with open("backup.txt", "w", encoding="utf-8") as arquivo:
        arquivo.writelines(linhas_manifest)
        
    print("\nSincronização concluída! Arquivo backup.txt gerado com sucesso.")

if __name__ == "__main__":
    run_sync()