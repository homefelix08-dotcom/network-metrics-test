"""
Módulo responsável exclusivamente pela geração e atualização do arquivo local_meta.xml (EPG local).
Realiza scraping das grades de programação dos canais regionais na Claro TV e compila no formato XMLTV.
"""

import os
import html
from datetime import datetime
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import pytz

# ==========================================
# CONFIGURAÇÕES
# ==========================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_XML_PATH = os.path.join(BASE_DIR, "local_meta.xml")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
TIMEOUT_SECONDS = 25

LOCAL_EPG_CONFIGS = [
    {"id": "Globo MG", "name": "Globo MG", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/globo-hd/23-2068"},
    {"id": "Record MG", "name": "Record MG", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/record-hd/23-2084"},
    {"id": "SBT MG", "name": "TV Alterosa", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/sbt-tv-alterosa/23-1949"},
    {"id": "Band MG", "name": "Band", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/band/23-408"}
]


def create_session() -> requests.Session:
    """Cria uma sessão HTTP com política de retry para contornar instabilidades transitórias."""
    session = requests.Session()
    retries = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        raise_on_status=False
    )
    adapter = HTTPAdapter(max_retries=retries)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


def update_local_meta() -> bool:
    """Coleta a grade dos canais regionais configurados e atualiza o arquivo local_meta.xml."""
    print("Iniciando atualização do local_meta.xml...")
    session = create_session()
    fuso_br = pytz.timezone('America/Sao_Paulo')

    xml_channels = []
    xml_programmes = []
    total_blocos = 0

    for config in LOCAL_EPG_CONFIGS:
        canal_id = config["id"]
        canal_nome = config["name"]
        url = config["url"]

        print(f"  -> Coletando grade: {canal_nome} ({canal_id})...")
        xml_channels.append(f'  <channel id="{canal_id}">\n    <display-name>{html.escape(canal_nome)}</display-name>\n  </channel>\n')

        try:
            resposta = session.get(url, headers=HEADERS, timeout=TIMEOUT_SECONDS)
            if resposta.status_code != 200:
                print(f"     [X] Erro HTTP {resposta.status_code}")
                continue

            parsed_dom = BeautifulSoup(resposta.text, 'html.parser')
            blocos_canal = 0

            for bloco in parsed_dom.find_all('div', class_='cell-item'):
                try:
                    start_sec = int(bloco['data-start']) / 1000.0
                    end_sec = int(bloco['data-end']) / 1000.0
                    titulo_elem = bloco.find('p', class_='channel-program-item-title')
                    if not titulo_elem:
                        continue

                    titulo = html.escape(titulo_elem.text.strip())
                    str_inicio = datetime.fromtimestamp(start_sec, fuso_br).strftime('%Y%m%d%H%M%S %z')
                    str_fim = datetime.fromtimestamp(end_sec, fuso_br).strftime('%Y%m%d%H%M%S %z')

                    xml_programmes.append(
                        f'  <programme start="{str_inicio}" stop="{str_fim}" channel="{canal_id}">\n'
                        f'    <title lang="pt">{titulo}</title>\n'
                        f'  </programme>\n'
                    )
                    blocos_canal += 1
                except Exception:
                    continue

            total_blocos += blocos_canal
            print(f"     [OK] {blocos_canal} programas coletados.")
        except Exception as e:
            print(f"     [X] Falha na requisição: {e}")

    if not xml_programmes:
        print("[ALERTA] Nenhum programa foi coletado. O arquivo local_meta.xml não foi sobrescrito para preservar os dados existentes.")
        return False

    linhas = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n'] + xml_channels + xml_programmes + ['</tv>\n']

    with open(OUTPUT_XML_PATH, 'w', encoding='utf-8') as f:
        f.writelines(linhas)

    print(f"\n[SUCESSO] local_meta.xml atualizado com sucesso em '{OUTPUT_XML_PATH}'. Total de {total_blocos} programas.")
    return True


if __name__ == "__main__":
    update_local_meta()