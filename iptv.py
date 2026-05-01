import requests
import re
import time
import json
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Cabeçalhos para fingir que a requisição vem de um navegador real
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://4embeddecanais.xyz/"
}

def criar_sessao_resiliente():
    """
    Cria uma sessão HTTP blindada. 
    Se o site pirata der erro 502 ou falhar, o script tenta de novo automaticamente 
    até 3 vezes antes de desistir, evitando gerar uma lista vazia por instabilidade passageira.
    """
    sessao = requests.Session()
    retentativas = Retry(
        total=3, 
        backoff_factor=1, 
        status_forcelist=[500, 502, 503, 504]
    )
    adaptador = HTTPAdapter(max_retries=retentativas)
    sessao.mount('http://', adaptador)
    sessao.mount('https://', adaptador)
    return sessao

def carregar_canais(caminho_arquivo="canais.json"):
    """Lê o arquivo JSON com a grade de canais."""
    try:
        with open(caminho_arquivo, "r", encoding="utf-8") as arquivo:
            return json.load(arquivo)
    except Exception as e:
        print(f"Erro ao carregar o arquivo {caminho_arquivo}: {e}")
        return {}

def extrair_m3u8(sessao, url_do_site):
    """Extração corrigida: Tenta a página principal primeiro, depois tenta os iframes."""
    try:
        resposta = sessao.get(url_do_site, headers=HEADERS, timeout=15)
        
        # TENTATIVA 1: Busca o link direto na página principal (como funcionava antes)
        m3u8_busca = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta.text)
        if m3u8_busca:
            return m3u8_busca.group(1)
        
        # TENTATIVA 2: Se não achou na principal, varre todos os iframes da página
        iframes = re.findall(r'<iframe[^>]+src=["\']([^"\']+)["\']', resposta.text, re.IGNORECASE)
        
        for url_iframe in iframes:
            # Arruma links de iframe que vêm incompletos (ex: //dominio.com)
            if url_iframe.startswith('//'):
                url_iframe = 'https:' + url_iframe
            
            try:
                resposta_player = sessao.get(url_iframe, headers=HEADERS, timeout=10)
                m3u8_busca_iframe = re.search(r'(https?://[^\s"\'<>]+?\.m3u8[^"\'<>]*)', resposta_player.text)
                
                if m3u8_busca_iframe:
                    return m3u8_busca_iframe.group(1)
            except:
                # Se esse iframe der erro de conexão (ex: anúncio bloqueado), pula pro próximo
                continue
                
    except Exception as e:
        print(f"  -> Erro de conexão com {url_do_site}: {e}")
        
    return None

def gerar_lista():
    """Função mestre que orquestra todo o processo com suporte a categorias."""
    categorias = carregar_canais("canais.json")
    
    if not categorias:
        print("Nenhum canal encontrado. Verifique o arquivo canais.json.")
        return

    print("Iniciando extração de canais...")
    linhas_m3u = ["#EXTM3U\n"]
    sessao = criar_sessao_resiliente()
    
    # Primeiro loop: passa pelas categorias (TV Aberta, Notícias, etc.)
    for nome_categoria, lista_canais in categorias.items():
        print(f"\n--- Processando categoria: {nome_categoria} ---")
        
        # Segundo loop: passa pelos canais dentro daquela categoria
        for nome_canal, url in lista_canais.items():
            print(f"Buscando: {nome_canal}...")
            link_video = extrair_m3u8(sessao, url)
            
            if link_video:
                # O PULO DO GATO DAS CATEGORIAS: Adicionamos o group-title="{nome_categoria}"
                linhas_m3u.append(f'#EXTINF:-1 tvg-name="{nome_canal}" group-title="{nome_categoria}", {nome_canal}\n')
                
                # Injeta o Referer no final da string para o TiviMate quebrar o bloqueio
                linhas_m3u.append(f'{link_video}|Referer={url}\n')
            else:
                print(f"  -> Falha ao encontrar o link final de {nome_canal}.")
                
            time.sleep(2) # Descanso para não sofrer bloqueio
        
    # Salva a lista pronta para uso
    with open("tv.m3u", "w", encoding="utf-8") as arquivo:
        arquivo.writelines(linhas_m3u)
        
    print("\nSucesso! Arquivo 'tv.m3u' atualizado com categorias e pronto para a TV.")

if __name__ == "__main__":
    gerar_lista()