import cloudscraper
import re
import time
import json
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Network configs
HEADERS = {
    "X-Forwarded-For": "177.129.1.1",
    "Referer": "https://4embeddecanais.xyz/"
}

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

def extract_payload(sessao, url_destino):
    """Extração: Busca o payload principal no source."""
    try:
        resposta = sessao.get(url_destino, headers=HEADERS, timeout=15)
        
        # TENTATIVA 1: Busca o bloco na página root
        payload_busca = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta.text)
        if payload_busca:
            return payload_busca.group(1)
        
        # TENTATIVA 2: Varre iframes aninhados
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

    print("Iniciando sincronização de dados...")
    manifest_meta = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/refs/heads/main/claro.xml"
    
    linhas_manifest = [f'#EXTM3U x-tvg-url="{manifest_meta}"\n']
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
