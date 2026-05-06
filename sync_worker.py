import cloudscraper
import re
import time
import json
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Cabeçalhos (O cloudscraper já injeta um User-Agent real por padrão, 
# então só precisamos manter o Referer e o IP falso para enganar o painel)
HEADERS = {
    "X-Forwarded-For": "177.129.1.1",
    "Referer": "https://4embeddecanais.xyz/"
}

def criar_sessao_resiliente():
    """
    Cria uma sessão HTTP blindada usando o Cloudscraper para contornar o WAF. 
    Se o site pirata der erro 502 ou falhar, o script tenta de novo automaticamente 
    até 3 vezes antes de desistir.
    """
    # Cria o scraper imitando um navegador Chrome desktop no Windows
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
    
    # Montamos as regras de resiliência diretamente no scraper
    scraper.mount('http://', adaptador)
    scraper.mount('https://', adaptador)
    
    return scraper

def carregar_canais(caminho_arquivo="canais.json"):
    """Lê o arquivo JSON com a grade de canais."""
    try:
        with open(caminho_arquivo, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except Exception as e:
        print(f"Erro ao carregar o arquivo {caminho_arquivo}: {e}")
        return {}

def extrair_m3u8(sessao, url_do_site):
    """Extração: Tenta a página principal primeiro, depois tenta os iframes."""
    try:
        # Usando a 'sessao' que agora é o nosso cloudscraper
        resposta = sessao.get(url_do_site, headers=HEADERS, timeout=15)
        
        # TENTATIVA 1: Busca o link direto na página principal
        m3u8_busca = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta.text)
        if m3u8_busca:
            return m3u8_busca.group(1)
        
        # TENTATIVA 2: Varre todos os iframes da página
        iframes = re.findall(r'<iframe[^>]+src=["\']([^"\']+)["\']', resposta.text, re.IGNORECASE)
        
        for url_iframe in iframes:
            if url_iframe.startswith('//'):
                url_iframe = 'https:' + url_iframe
            
            try:
                resposta_player = sessao.get(url_iframe, headers=HEADERS, timeout=10)
                m3u8_busca_iframe = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta_player.text)
                
                if m3u8_busca_iframe:
                    return m3u8_busca_iframe.group(1)
            except:
                continue
                
    except Exception as e:
        print(f"  -> Erro de conexão com {url_do_site}: {e}")
        
    return None

def gerar_lista():
    """Função mestre que orquestra todo o processo."""
    categorias = carregar_canais("canais.json")
    
    if not categorias:
        print("Nenhum canal encontrado. Verifique o arquivo canais.json.")
        return

    print("Iniciando extração de canais...")
    url_epg = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/refs/heads/main/claro.xml"
    
    linhas_m3u = [f'#EXTM3U x-tvg-url="{url_epg}"\n']
    
    # Instancia o scraper blindado
    sessao = criar_sessao_resiliente()
    
    for nome_categoria, lista_canais in categorias.items():
        print(f"\n--- Processando categoria: {nome_categoria} ---")
        
        for canal in lista_canais:
            nome_canal = canal.get('nome')
            id_epg = canal.get('tvg_id', '')
            url_origem = canal.get('url')
            # NOVO: Extraindo a logo de forma segura
            url_logo = canal.get('logo', '')

            print(f"Buscando: {nome_canal}...")
            link_video = extrair_m3u8(sessao, url_origem)
            
            if link_video:
                # NOVO: Injetando a tag tvg-logo na formatação da string
                linhas_m3u.append(f'#EXTINF:-1 tvg-id="{id_epg}" tvg-logo="{url_logo}" tvg-name="{nome_canal}" group-title="{nome_categoria}", {nome_canal}\n')
                linhas_m3u.append(f'{link_video}|Referer={url_origem}\n')
            else:
                print(f"  -> Falha ao encontrar o link final de {nome_canal}.")
                
            time.sleep(2) 
        
    with open("tv.m3u", "w", encoding="utf-8") as arquivo:
        arquivo.writelines(linhas_m3u)
        
    print("\nSucesso! Arquivo 'tv.m3u' atualizado.")

if __name__ == "__main__":
    gerar_lista()
