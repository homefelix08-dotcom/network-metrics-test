"""
Módulo responsável por:
1. Geração e atualização automática do EPG unificado completo (local_meta.xml)
   através da arquitetura híbrida de alta performance:
   - API REST oficial da Claro TV+ para todos os canais nacionais (metadados ricos, sinopses, posters).
   - Scraper HTML oficial da Claro para os 4 canais regionais de Minas Gerais (Globo MG, Record MG, SBT MG / Alterosa, Band MG).
   - Gerador de eventos e programação contínua para os canais de streaming OTT e feeds especiais (Prime Video, HBO Max, Goat, Apple TV, Dazn, Paramount+, Tooncast, Premiere 8).
2. Resolução do novo domínio de CDN do provedor de canais (via redirecionamento de um canal de teste)
   e atualização automática dos cabeçalhos Referer em export_data.txt.
3. Commit e push automáticos no repositório GitHub.
"""

import os
import re
import html
import subprocess
import urllib.parse
from datetime import datetime, timedelta
import time
import xml.sax.saxutils
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup
import pytz

# ==========================================
# CONFIGURAÇÕES DE CAMINHOS
# ==========================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_XML_PATH = os.path.join(BASE_DIR, "local_meta.xml")
EXPORT_DATA_PATH = os.path.join(BASE_DIR, "export_data.txt")
REPO_PATH = os.path.join(BASE_DIR, "src", "repo.js")

# Identidade do bot para os commits automáticos
GIT_BOT_NAME = "Data Sync Bot"
GIT_BOT_EMAIL = "bot@github.com"

# ==========================================
# CONFIGURAÇÕES DE REDE E API
# ==========================================
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
}
TIMEOUT_SECONDS = 30
CLARO_API_BASE_URL = "https://www.clarotvmais.com.br/avsclient/1.2/epg/livechannels"
EPG_DAYS_AHEAD = 4  # Dia atual + 3 dias futuros (4 dias no total)

# Mapeia nomes originais da API Claro para tvg_ids específicos da lista repo.js
CHANNEL_ALIASES = {
    'SBT': ['SBT São Paulo'],
    'RECORD HD': ['RECORD - Sao Paulo'],
    'REDE TV! HD': ['REDE TV! São Paulo'],
    'GE TV HD': ['GE'],
}

# Canais locais regionais de Minas Gerais (raspagem HTML do portal da Claro)
LOCAL_EPG_CONFIGS = [
    {
        "id": "Globo MG",
        "name": "Globo MG",
        "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/globo-hd/23-2068",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/globo_mg.png"
    },
    {
        "id": "Record MG",
        "name": "Record MG",
        "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/record-hd/23-2084",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/record_mg.png"
    },
    {
        "id": "SBT MG",
        "name": "TV Alterosa",
        "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/sbt-tv-alterosa/23-1949",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tv_alterosa.png"
    },
    {
        "id": "Band MG",
        "name": "Band MG",
        "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/band/23-408",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/band.png"
    }
]

# Sinopses e categorias curadas para os telejornais e programas locais mineiros
REGIONAL_SHOWS_METADATA = {
    "bom dia minas": {
        "desc": "Telejornal matutino com as primeiras notícias do dia de Belo Horizonte e do interior de Minas Gerais, trânsito e previsão do tempo.",
        "category": "Jornalismo",
        "rating": "L"
    },
    "mg1": {
        "desc": "Primeira edição do telejornal regional com as notícias do meio-dia em Minas Gerais, prestação de serviço, reportagens comunitárias e os destaques do estado.",
        "category": "Jornalismo",
        "rating": "L"
    },
    "mg2": {
        "desc": "Segunda edição do telejornal regional trazendo o resumo completo dos principais acontecimentos do dia em Minas Gerais e reportagens aprofundadas.",
        "category": "Jornalismo",
        "rating": "L"
    },
    "globo esporte": {
        "desc": "O dia a dia dos principais clubes mineiros (Atlético-MG, Cruzeiro e América-MG), gols da rodada, tabelas e reportagens sobre o esporte de Minas.",
        "category": "Esportes",
        "rating": "L"
    },
    "balanço geral mg": {
        "desc": "Jornalismo dinâmico e popular com os principais acontecimentos de Minas Gerais, notícias policiais, prestação de serviços e entretenimento sob o comando da Record Minas.",
        "category": "Jornalismo",
        "rating": "10"
    },
    "balanco geral mg": {
        "desc": "Jornalismo dinâmico e popular com os principais acontecimentos de Minas Gerais, notícias policiais, prestação de serviços e entretenimento sob o comando da Record Minas.",
        "category": "Jornalismo",
        "rating": "10"
    },
    "alterosa alerta": {
        "desc": "Telejornal tradicional da TV Alterosa trazendo os fatos policiais e as notícias mais importantes das cidades mineiras com agilidade e compromisso.",
        "category": "Jornalismo",
        "rating": "12"
    },
    "alterosa agora": {
        "desc": "Noticiário dinâmico e ao vivo com os fatos da tarde e a prestação de serviços na TV Alterosa / SBT em Minas Gerais.",
        "category": "Jornalismo",
        "rating": "10"
    },
    "donos da bola mg": {
        "desc": "Debates apaixonados, análises polêmicas e os bastidores do futebol mineiro na Band Minas com foco em Galo, Raposa e Coelho.",
        "category": "Esportes",
        "rating": "L"
    },
    "os donos da bola mg": {
        "desc": "Debates apaixonados, análises polêmicas e os bastidores do futebol mineiro na Band Minas com foco em Galo, Raposa e Coelho.",
        "category": "Esportes",
        "rating": "L"
    },
    "brasil urgente mg": {
        "desc": "Cobertura jornalística e policial dos principais acontecimentos de Minas Gerais com foco na segurança pública na Band Minas.",
        "category": "Jornalismo",
        "rating": "12"
    },
    "jornal da alterosa": {
        "desc": "O principal telejornal noturno da TV Alterosa, trazendo um resumo aprofundado dos acontecimentos políticos, econômicos e sociais de Minas Gerais.",
        "category": "Jornalismo",
        "rating": "L"
    }
}

# Configuração dos canais especiais (streaming OTT, feeds de transbordo e canal infantil descontinuado)
SPECIAL_CHANNELS = [
    {
        "id": "Tooncast",
        "name": "Tooncast",
        "category": "Infantis",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tooncast.png",
        "type": "animation"
    },
    {
        "id": "Canal Goat",
        "name": "Canal Goat",
        "category": "Esportes",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/canal_goat.png",
        "type": "sports",
        "event_title": "Canal Goat - Transmissão Esportiva ao Vivo",
        "event_desc": "Transmissão ao vivo de jogos, competições e programas esportivos no Canal Goat."
    },
    {
        "id": "Apple TV",
        "name": "Apple TV",
        "category": "Esportes",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/apple_tv.png",
        "type": "sports",
        "event_title": "Major League Soccer (MLS) - Ao Vivo",
        "event_desc": "Transmissão ao vivo das partidas da Major League Soccer no MLS Season Pass / Apple TV."
    },
    {
        "id": "Dazn",
        "name": "Dazn",
        "category": "Esportes",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/dazn.png",
        "type": "sports",
        "event_title": "Transmissão Esportiva ao Vivo - DAZN",
        "event_desc": "Transmissão ao vivo de competições e eventos esportivos internacionais no DAZN."
    },
    {
        "id": "Paramount+ Eventos",
        "name": "Paramount+",
        "category": "Esportes",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/paramount.png",
        "type": "sports",
        "event_title": "CONMEBOL Libertadores & Sul-Americana - Ao Vivo",
        "event_desc": "Transmissão ao vivo de partidas da CONMEBOL Libertadores e Copa Sul-Americana no Paramount+."
    },
    {
        "id": "Premiere 8",
        "name": "Premiere 8",
        "category": "Esportes",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_8.png",
        "type": "sports",
        "event_title": "Premiere - Transmissão de Jogos Simultâneos",
        "event_desc": "Canal de transbordo do Premiere para transmissões de partidas simultâneas do Brasileirão."
    }
]

# Prime Video 1 a 5
for idx in range(1, 6):
    SPECIAL_CHANNELS.append({
        "id": f"Prime Video {idx}",
        "name": f"Prime Video {idx}",
        "category": "Esportes",
        "logo": f"https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/amazon_prime_video_{idx}.png",
        "type": "sports",
        "event_title": f"Copa do Brasil & Eventos Prime Video (Feed {idx}) - Ao Vivo",
        "event_desc": f"Transmissão ao vivo de jogos da Copa do Brasil e eventos esportivos exclusivos no Amazon Prime Video (Feed {idx})."
    })

# HBO Max 1 a 6
for idx in range(1, 7):
    suffix = f" {idx}" if idx > 1 else ""
    SPECIAL_CHANNELS.append({
        "id": f"HBO Max{suffix}",
        "name": f"HBO Max{suffix}",
        "category": "Esportes",
        "logo": f"https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_max_{idx}.png" if idx > 1 else "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_max.png",
        "type": "sports",
        "event_title": f"UEFA Champions League & Eventos Max (Feed {idx}) - Ao Vivo",
        "event_desc": f"Transmissão ao vivo de partidas da UEFA Champions League e eventos da TNT Sports na plataforma Max (Feed {idx})."
    })

# Episódios para grade contínua do Tooncast
TOONCAST_CARTOONS = [
    ("Os Flintstones", "As aventuras da família da Idade da Pedra em Bedrock."),
    ("Os Jetsons", "A rotina futurista de George Jetson e sua família no ano 2062."),
    ("O Laboratório de Dexter", "Dexter tenta proteger seu laboratório secreto de sua irmã Dee Dee."),
    ("Johnny Bravo", "Johnny tenta conquistar garotas com seu visual e poses hilárias."),
    ("As Meninas Superpoderosas", "Florzinha, Lindinha e Docinho salvam a cidade de Townsville."),
    ("Scooby-Doo, Cadê Você?", "Scooby e a turma desvendam mistérios e capturam vilões fantasiados."),
    ("Coragem, o Cão Covarde", "Coragem defende seus donos Muriel e Eustácio de perigos sobrenaturais."),
    ("Tom e Jerry", "O gato Tom tenta capturar o esperto rato Jerry em perseguições clássicas."),
    ("A Mansão Foster para Amigos Imaginários", "Mac e Bloo vivem aventuras na mansão para amigos imaginários."),
    ("Corrida Maluca", "Pilotos disputam corridas insanas enquanto Dick Vigarista arquiteta armadilhas.")
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


def escape_xml(text) -> str:
    """Escapa caracteres especiais XML com segurança."""
    if not text:
        return ""
    return xml.sax.saxutils.escape(str(text))


def format_xmltv_date(ts: float, tz) -> str:
    """Converte Unix timestamp para o formato de data padrão do XMLTV (YYYYMMDDHHMMSS +/-HHMM)."""
    dt = datetime.fromtimestamp(ts, tz)
    return dt.strftime("%Y%m%d%H%M%S %z")


# ==========================================
# 1. COLETADORES DE DADOS DE EPG
# ==========================================
def fetch_claro_api_data(session: requests.Session, days_ahead: int, tz):
    """Coleta a grade dos canais nacionais via REST API oficial da Claro tv+."""
    now = datetime.now(tz)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    api_channels = {}
    api_programmes = {}
    program_info_lookup = {}

    for day_offset in range(days_ahead):
        day_start = start_of_today + timedelta(days=day_offset)
        day_end = day_start + timedelta(days=1)
        start_ts = int(day_start.timestamp())
        end_ts = int(day_end.timestamp())

        date_str = day_start.strftime("%d/%m/%Y")
        print(f"  [API Claro] Coletando grade: {date_str} (start={start_ts}, end={end_ts})...")
        url = f"{CLARO_API_BASE_URL}?types=&channelIds=&startTime={start_ts}&endTime={end_ts}&location=SAO%20PAULO,AMAZONAS&channel=PCTV"

        try:
            resp = session.get(url, headers=HEADERS, timeout=TIMEOUT_SECONDS)
            if resp.status_code != 200:
                print(f"    [X] Erro HTTP {resp.status_code} na API da Claro.")
                continue

            data = resp.json()
            live_channels = data.get('response', {}).get('liveChannels', [])
            print(f"    [OK] {len(live_channels)} canais recebidos.")

            for ch in live_channels:
                ch_name = ch.get('name')
                if not ch_name:
                    continue

                if ch_name not in api_channels:
                    api_channels[ch_name] = {
                        'id': ch_name,
                        'name': ch_name,
                        'logo': ch.get('logo') or ch.get('channelLogo'),
                        'type': ch.get('type')
                    }
                    api_programmes[ch_name] = []

                schedules = ch.get('schedules', [])
                api_programmes[ch_name].extend(schedules)

                # Alimenta dicionário global de programas para enriquecer canais locais
                for sch in schedules:
                    t = sch.get('title')
                    if t and t.strip():
                        t_norm = t.strip().lower()
                        if t_norm not in program_info_lookup:
                            img = sch.get('image')
                            if img:
                                img = img.replace('{{image-size-placeholder}}', '420_236')
                            rating_val = None
                            if isinstance(sch.get('rating'), dict) and sch['rating'].get('code'):
                                rating_val = str(sch['rating']['code']).strip()

                            program_info_lookup[t_norm] = {
                                'desc': sch.get('description'),
                                'icon': img,
                                'category': ch.get('type'),
                                'rating': rating_val
                            }
        except Exception as e:
            print(f"    [X] Falha na requisição API Claro para o dia {date_str}: {e}")

    return api_channels, api_programmes, program_info_lookup


def fetch_regional_html_data(session: requests.Session, tz, program_info_lookup: dict, days_ahead: int):
    """Raspa a programação oficial dos canais regionais de MG direto das páginas web da Claro."""
    print("  [Scraper Regional] Coletando canais locais de Minas Gerais (HTML Claro)...")
    regional_channels = {}
    regional_programmes = {}

    for config in LOCAL_EPG_CONFIGS:
        c_id = config["id"]
        c_name = config["name"]
        c_url = config["url"]
        c_logo = config["logo"]

        regional_channels[c_id] = {
            'id': c_id,
            'name': c_name,
            'logo': c_logo
        }
        regional_programmes[c_id] = []

        try:
            resp = session.get(c_url, headers=HEADERS, timeout=TIMEOUT_SECONDS)
            if resp.status_code != 200:
                print(f"    [X] Erro HTTP {resp.status_code} para {c_id}")
                continue

            soup = BeautifulSoup(resp.text, 'html.parser')
            base_items = []
            for item in soup.find_all('div', class_='cell-item'):
                try:
                    st_sec = int(item['data-start']) / 1000.0
                    et_sec = int(item['data-end']) / 1000.0
                    title_elem = item.find('p', class_='channel-program-item-title')
                    if not title_elem:
                        continue
                    title = title_elem.text.strip()
                    base_items.append((st_sec, et_sec, title))
                except Exception:
                    continue

            print(f"    [OK] {c_id}: {len(base_items)} programas na grade de hoje.")

            # Projeta os dias para a frente (dia 0 = hoje, dia 1..3 projetados)
            for day_offset in range(days_ahead):
                shift = day_offset * 86400.0
                for st_sec, et_sec, title in base_items:
                    t_norm = title.lower()
                    info = program_info_lookup.get(t_norm) or REGIONAL_SHOWS_METADATA.get(t_norm) or {}

                    regional_programmes[c_id].append({
                        'startTime': int(st_sec + shift),
                        'endTime': int(et_sec + shift),
                        'title': title,
                        'description': info.get('desc'),
                        'icon': info.get('icon') or c_logo,
                        'category': info.get('category') or 'Jornalismo',
                        'rating': info.get('rating') or 'L'
                    })

        except Exception as e:
            print(f"    [X] Falha ao raspar HTML de {c_id}: {e}")

    return regional_channels, regional_programmes


def generate_special_channels_data(tz, days_ahead: int):
    """Gera grade 24/7 de eventos e programas para canais OTT, streams e Premiere de transbordo."""
    print("  [Canais Especiais] Gerando grade contínua para canais de streaming e eventos...")
    now = datetime.now(tz)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    special_channels = {}
    special_programmes = {}

    for spec in SPECIAL_CHANNELS:
        c_id = spec["id"]
        c_name = spec["name"]
        c_logo = spec["logo"]
        c_cat = spec["category"]
        c_type = spec.get("type", "sports")

        special_channels[c_id] = {
            'id': c_id,
            'name': c_name,
            'logo': c_logo,
            'type': c_cat
        }
        special_programmes[c_id] = []

        for day_offset in range(days_ahead):
            day_start = start_of_today + timedelta(days=day_offset)

            if c_type == "animation":
                # Tooncast: blocos clássicos de 45 min
                slot_duration = 2700
                slots_per_day = 32
                for s_idx in range(slots_per_day):
                    st = int(day_start.timestamp()) + (s_idx * slot_duration)
                    et = st + slot_duration
                    cartoon_title, cartoon_desc = TOONCAST_CARTOONS[(day_offset * slots_per_day + s_idx) % len(TOONCAST_CARTOONS)]
                    special_programmes[c_id].append({
                        'startTime': st,
                        'endTime': et,
                        'title': cartoon_title,
                        'description': cartoon_desc,
                        'icon': c_logo,
                        'category': 'Infantis',
                        'rating': 'L'
                    })
            else:
                # Canais esportivos: 6 blocos contínuos no dia cobrindo as 24h
                event_title = spec.get("event_title", f"{c_name} - Ao Vivo")
                event_desc = spec.get("event_desc", "Transmissão ao vivo de eventos esportivos e competições.")

                time_blocks = [
                    (0, 6, "Melhores Momentos e Compactos da Rodada", "Compactos das últimas partidas, gols e análises esportivas."),
                    (6, 11.5, "Especial Esportivo e Reprise de Eventos", "Reprises completas das transmissões recentes e coberturas exclusivas."),
                    (11.5, 15.5, "Aquecimento e Noticiário Pré-Jogo", "Análise tática, escalações, entrevistas exclusivas e o aquecimento para as partidas."),
                    (15.5, 19, event_title, event_desc),
                    (19, 22.5, event_title, event_desc),
                    (22.5, 24, "Pós-Jogo, Entrevistas e Análise da Rodada", "Repercussão dos resultados, comentários pós-jogo e melhores momentos do dia.")
                ]

                base_ts = int(day_start.timestamp())
                for h_start, h_end, b_title, b_desc in time_blocks:
                    st = base_ts + int(h_start * 3600)
                    et = base_ts + int(h_end * 3600)
                    special_programmes[c_id].append({
                        'startTime': st,
                        'endTime': et,
                        'title': b_title,
                        'description': b_desc,
                        'icon': c_logo,
                        'category': 'Esportes',
                        'rating': 'L'
                    })

    return special_channels, special_programmes


# ==========================================
# 2. MONTAGEM E GRAVAÇÃO DO XMLTV UNIFICADO
# ==========================================
def build_and_save_xmltv(api_channels, api_progs, regional_channels, regional_progs, special_channels, special_progs, tz) -> bool:
    """Combina todas as fontes de dados em um único XMLTV padronizado (local_meta.xml)."""
    print(f"  -> Consolidando dados no arquivo '{os.path.basename(OUTPUT_XML_PATH)}'...")

    xml_lines = ['<?xml version="1.0" encoding="utf-8"?>\n']
    xml_lines.append('<tv generator-info-name="ClaroEPG - Network Metrics" generator-info-url="https://github.com/homefelix08-dotcom/network-metrics-test">\n')

    # 1. Definições de Canais (<channel id="...">)
    all_channel_headers = {}

    # a) Canais da API Claro
    for ch_name, ch_data in api_channels.items():
        all_channel_headers[ch_name] = {
            'name': ch_name,
            'logo': ch_data.get('logo')
        }

    # b) Aliases da API Claro
    for orig_name, aliases in CHANNEL_ALIASES.items():
        if orig_name in api_channels:
            orig_logo = api_channels[orig_name].get('logo')
            for alias in aliases:
                all_channel_headers[alias] = {
                    'name': alias,
                    'logo': orig_logo
                }

    # c) Canais Regionais de MG
    for c_id, c_data in regional_channels.items():
        all_channel_headers[c_id] = {
            'name': c_data['name'],
            'logo': c_data.get('logo')
        }

    # d) Canais Especiais de Streaming / Eventos
    for c_id, c_data in special_channels.items():
        all_channel_headers[c_id] = {
            'name': c_data['name'],
            'logo': c_data.get('logo')
        }

    # Escreve todos os <channel> ordenados
    for ch_id in sorted(all_channel_headers.keys()):
        ch_info = all_channel_headers[ch_id]
        xml_lines.append(f'  <channel id="{escape_xml(ch_id)}">\n')
        xml_lines.append(f'    <display-name lang="pt">{escape_xml(ch_info["name"])}</display-name>\n')
        if ch_info.get('logo'):
            xml_lines.append(f'    <icon src="{escape_xml(ch_info["logo"])}" />\n')
        xml_lines.append('  </channel>\n')

    # 2. Definições de Programas (<programme start="..." stop="..." channel="...">)
    total_written_programmes = 0

    def write_programme_element(st, et, ch_id, title, sub_title=None, desc=None, icon=None, category=None, length=None, season=None, episode=None, rating=None):
        nonlocal total_written_programmes
        st_str = format_xmltv_date(st, tz)
        et_str = format_xmltv_date(et, tz)

        xml_lines.append(f'  <programme start="{st_str}" stop="{et_str}" channel="{escape_xml(ch_id)}">\n')
        xml_lines.append(f'    <title lang="pt">{escape_xml(title)}</title>\n')

        if sub_title:
            xml_lines.append(f'    <sub-title lang="pt">{escape_xml(sub_title)}</sub-title>\n')

        if desc:
            xml_lines.append(f'    <desc lang="pt">{escape_xml(desc)}</desc>\n')

        if icon:
            xml_lines.append(f'    <icon src="{escape_xml(icon)}" />\n')

        if category:
            xml_lines.append(f'    <category lang="pt">{escape_xml(category)}</category>\n')

        if length:
            xml_lines.append(f'    <length units="seconds">{length}</length>\n')

        if season is not None and episode is not None:
            try:
                s_idx = max(0, int(season) - 1)
                e_idx = max(0, int(episode) - 1)
                xml_lines.append(f'    <episode-num system="xmltv_ns">{s_idx}.{e_idx}.</episode-num>\n')
                xml_lines.append(f'    <episode-num system="onscreen">T{season} E{episode}</episode-num>\n')
            except (ValueError, TypeError):
                pass

        if rating:
            xml_lines.append('    <rating system="Brazil">\n')
            xml_lines.append(f'      <value>[{escape_xml(rating)}]</value>\n')
            xml_lines.append('    </rating>\n')

        xml_lines.append('  </programme>\n')
        total_written_programmes += 1

    # a) Programas da API Claro e Aliases
    for ch_name, progs in api_progs.items():
        seen_intervals = set()
        unique_progs = []
        for p in progs:
            st = p.get('startTime')
            et = p.get('endTime')
            if not st or not et:
                continue
            key = (st, et)
            if key not in seen_intervals:
                seen_intervals.add(key)
                unique_progs.append(p)

        target_channel_ids = [ch_name]
        if ch_name in CHANNEL_ALIASES:
            target_channel_ids.extend(CHANNEL_ALIASES[ch_name])

        for target_ch in target_channel_ids:
            for p in unique_progs:
                st = p.get('startTime')
                et = p.get('endTime')
                title = p.get('title')
                if not title:
                    continue

                img = p.get('image')
                if img:
                    img = img.replace('{{image-size-placeholder}}', '420_236')

                cat = None
                if p.get('tvChannels') and len(p['tvChannels']) > 0:
                    cat = p['tvChannels'][0].get('type')
                if not cat:
                    cat = api_channels.get(ch_name, {}).get('type')

                rating_code = None
                if isinstance(p.get('rating'), dict) and p['rating'].get('code'):
                    rating_code = str(p['rating']['code']).strip()

                write_programme_element(
                    st=st,
                    et=et,
                    ch_id=target_ch,
                    title=title,
                    sub_title=p.get('episodeName'),
                    desc=p.get('description'),
                    icon=img,
                    category=cat,
                    length=p.get('duration'),
                    season=p.get('seasonNumber'),
                    episode=p.get('episodeNumber'),
                    rating=rating_code
                )

    # b) Programas Regionais de MG
    for c_id, progs in regional_progs.items():
        seen_intervals = set()
        for p in progs:
            st = p.get('startTime')
            et = p.get('endTime')
            if not st or not et:
                continue
            key = (st, et)
            if key in seen_intervals:
                continue
            seen_intervals.add(key)

            write_programme_element(
                st=st,
                et=et,
                ch_id=c_id,
                title=p['title'],
                desc=p.get('description'),
                icon=p.get('icon'),
                category=p.get('category'),
                rating=p.get('rating')
            )

    # c) Programas Especiais de Streaming / Eventos
    for c_id, progs in special_progs.items():
        seen_intervals = set()
        for p in progs:
            st = p.get('startTime')
            et = p.get('endTime')
            if not st or not et:
                continue
            key = (st, et)
            if key in seen_intervals:
                continue
            seen_intervals.add(key)

            write_programme_element(
                st=st,
                et=et,
                ch_id=c_id,
                title=p['title'],
                desc=p.get('description'),
                icon=p.get('icon'),
                category=p.get('category'),
                rating=p.get('rating')
            )

    xml_lines.append('</tv>\n')

    # Grava no disco
    with open(OUTPUT_XML_PATH, 'w', encoding='utf-8') as f:
        f.writelines(xml_lines)

    file_size_mb = os.path.getsize(OUTPUT_XML_PATH) / (1024 * 1024)
    print(f"[SUCESSO] {os.path.basename(OUTPUT_XML_PATH)} gravado com sucesso!")
    print(f"          Total: {len(all_channel_headers)} canais cadastrados.")
    print(f"          Total: {total_written_programmes} programas registrados.")
    print(f"          Tamanho: {file_size_mb:.2f} MB.")
    return True


def update_epg(session: requests.Session, days_ahead: int = EPG_DAYS_AHEAD) -> bool:
    """Executa a coleta híbrida e constrói o arquivo local_meta.xml."""
    print(f"=== [1/2] ATUALIZAÇÃO DO EPG UNIFICADO ({days_ahead} DIAS) ===")
    start_time_total = time.time()
    tz = pytz.timezone('America/Sao_Paulo')

    # 1. API Claro TV+ (Nacional)
    api_channels, api_progs, prog_info_lookup = fetch_claro_api_data(session, days_ahead, tz)

    # 2. Scraper HTML Regional MG
    regional_channels, regional_progs = fetch_regional_html_data(session, tz, prog_info_lookup, days_ahead)

    # 3. Gerador Contínuo de Streaming / Eventos
    special_channels, special_progs = generate_special_channels_data(tz, days_ahead)

    # 4. Gravação do XMLTV
    success = build_and_save_xmltv(
        api_channels, api_progs,
        regional_channels, regional_progs,
        special_channels, special_progs,
        tz
    )

    elapsed = time.time() - start_time_total
    print(f"Tempo total de atualização do EPG: {elapsed:.2f} segundos.\n")
    return success


# ==========================================
# 3. SINCRONIZAÇÃO DO CDN REFERER EM EXPORT_DATA.TXT
# ==========================================
def get_sample_channel_url() -> str:
    """Extrai a URL base e o slug de um canal a partir de repo.js ou retorna URL padrão."""
    default_url = "https://embedcanaisdetv.xyz/e/index.php?canal=globomg"
    if os.path.exists(REPO_PATH):
        try:
            with open(REPO_PATH, "r", encoding="utf-8") as f:
                content = f.read()

            base_match = re.search(r'siteBaseUrl\s*=\s*["\']([^"\']+)["\']', content)
            base_url = base_match.group(1) if base_match else "https://embedcanaisdetv.xyz/e/index.php?canal="
            slug_match = re.search(r'siteBaseUrl\}\s*([a-zA-Z0-9_\-]+)', content)
            slug = slug_match.group(1) if slug_match else "globomg"
            return f"{base_url}{slug}"
        except Exception as e:
            print(f"  [Aviso] Falha ao ler {REPO_PATH}: {e}")

    return default_url


def discover_cdn_base(sample_url: str, session: requests.Session) -> str | None:
    """
    Faz a requisição para um canal e segue os redirecionamentos HTTP
    até identificar o domínio base do novo CDN para o Referer.
    """
    print(f"  -> Rastreando CDN através do canal de teste: {sample_url}")
    current_url = sample_url
    max_hops = 5

    for hop in range(max_hops):
        try:
            resp = session.get(current_url, headers=HEADERS, allow_redirects=False, timeout=TIMEOUT_SECONDS)
        except Exception as e:
            print(f"  [X] Erro ao acessar {current_url}: {e}")
            break

        if resp.status_code in (301, 302, 303, 307, 308) and "Location" in resp.headers:
            location = resp.headers["Location"].strip()
            current_url = urllib.parse.urljoin(current_url, location)
            print(f"     Hop {hop + 1}: redirecionado para {current_url}")

            parsed = urllib.parse.urlparse(current_url)
            if "cdn" in parsed.netloc:
                cdn_base = f"{parsed.scheme}://{parsed.netloc}/"
                return cdn_base
        else:
            parsed = urllib.parse.urlparse(current_url)
            if "cdn" in parsed.netloc:
                cdn_base = f"{parsed.scheme}://{parsed.netloc}/"
                return cdn_base
            break

    parsed = urllib.parse.urlparse(current_url)
    if parsed.netloc and parsed.netloc != urllib.parse.urlparse(sample_url).netloc:
        cdn_base = f"{parsed.scheme}://{parsed.netloc}/"
        return cdn_base

    return None


def update_referers_in_file(file_path: str, new_cdn_base: str) -> int:
    """Atualiza todas as ocorrências de Referer e garante o cabeçalho único do EPG."""
    if not os.path.exists(file_path):
        print(f"  [Aviso] Arquivo não encontrado: {file_path}")
        return 0

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    single_epg_header = '#EXTM3U x-tvg-url="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/local_meta.xml"\n'
    header_changed = False
    if lines and lines[0].startswith("#EXTM3U"):
        if lines[0] != single_epg_header:
            lines[0] = single_epg_header
            header_changed = True

    pattern = re.compile(r'\|Referer=https?://[^/\s|]+/(?:e/index\.php\?canal=)?([^\s|\r\n]+)')
    updated_lines = []
    changes_count = 0
    total_referers = 0

    for idx, line in enumerate(lines):
        if idx == 0 and line.startswith("#EXTM3U"):
            updated_lines.append(line)
            continue

        m = pattern.search(line)
        if m:
            total_referers += 1
            canal_slug = m.group(1).strip("/")
            new_ref = f"|Referer={new_cdn_base.rstrip('/')}/{canal_slug}/"
            new_line = re.sub(r'\|Referer=https?://[^\s|\r\n]+', new_ref, line)
            if new_line != line:
                changes_count += 1
            updated_lines.append(new_line)
        else:
            updated_lines.append(line)

    if changes_count > 0 or header_changed:
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(updated_lines)
        print(f"  [OK] '{os.path.basename(file_path)}': {changes_count} canais com Referer atualizados para {new_cdn_base} (Total: {total_referers}).")
        if header_changed:
            print("  [OK] Cabeçalho garantido apontando exclusivamente para 'local_meta.xml'.")
    else:
        print(f"  [INFO] '{os.path.basename(file_path)}': Todos os {total_referers} Referers e o cabeçalho já estavam atualizados.")

    return changes_count


def sync_cdn_referers(session: requests.Session) -> bool:
    """Executa a descoberta do CDN e atualiza o arquivo export_data.txt."""
    print("=== [2/2] SINCRONIZAÇÃO DO CDN REFERER ===")
    sample_url = get_sample_channel_url()
    new_cdn_base = discover_cdn_base(sample_url, session)

    if not new_cdn_base:
        print("  [ERRO] Não foi possível obter o novo domínio base do CDN.\n")
        return False

    print(f"  -> Novo domínio base de CDN detectado: {new_cdn_base}")
    update_referers_in_file(EXPORT_DATA_PATH, new_cdn_base)

    print("[SUCESSO] Sincronização do CDN Referer concluída com sucesso.\n")
    return True


# ==========================================
# 4. SINCRONIZAÇÃO GIT (COMMIT & PUSH AUTOMÁTICO)
# ==========================================
def git_commit_and_push() -> bool:
    """Verifica se arquivos foram modificados e realiza git add, commit e push automaticamente."""
    print("=== [3/3] SINCRONIZAÇÃO COM O GITHUB (GIT COMMIT & PUSH) ===")
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GCM_INTERACTIVE"] = "never"
    env["GIT_AUTHOR_NAME"] = GIT_BOT_NAME
    env["GIT_AUTHOR_EMAIL"] = GIT_BOT_EMAIL
    env["GIT_COMMITTER_NAME"] = GIT_BOT_NAME
    env["GIT_COMMITTER_EMAIL"] = GIT_BOT_EMAIL

    try:
        status_res = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            check=True,
            timeout=30
        )
        changes = status_res.stdout.strip()
        if not changes:
            print("  [INFO] Nenhuma alteração detectada no repositório. Nada a commitar.\n")
            return False

        print("  -> Alterações detectadas:")
        for line in changes.splitlines():
            print(f"     {line}")

        subprocess.run(["git", "add", "."], cwd=BASE_DIR, check=True, timeout=30)

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        commit_msg = f"chore: auto-sync unified EPG (local_meta.xml) and CDN referers [{timestamp}]"

        commit_res = subprocess.run(
            [
                "git",
                "-c", f"user.name={GIT_BOT_NAME}",
                "-c", f"user.email={GIT_BOT_EMAIL}",
                "commit",
                f"--author={GIT_BOT_NAME} <{GIT_BOT_EMAIL}>",
                "-m", commit_msg
            ],
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            env=env,
            timeout=30
        )
        if commit_res.returncode != 0:
            print(f"  [Aviso] Falha ou nada a commitar: {commit_res.stderr.strip()}\n")
            return False

        print(f"  [OK] Commit realizado: '{commit_msg}'")

        print("  -> Sincronizando com o remoto (git pull --rebase --autostash)...")
        pull_res = subprocess.run(
            ["git", "pull", "--rebase", "--autostash"],
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            env=env,
            timeout=60
        )
        if pull_res.returncode != 0:
            print(f"  [Aviso] Retorno do git pull: {pull_res.stderr.strip() or pull_res.stdout.strip()}")

        print("  -> Enviando alterações para o remoto (git push)...")
        push_res = subprocess.run(
            ["git", "push"],
            cwd=BASE_DIR,
            capture_output=True,
            text=True,
            env=env,
            timeout=60
        )
        if push_res.returncode == 0:
            print("  [OK] Git push realizado com sucesso!\n")
            return True
        else:
            print(f"  [X] Falha no git push: {push_res.stderr.strip()}\n")
            return False

    except subprocess.TimeoutExpired as e:
        print(f"  [X] Timeout ao executar comando git: {e}\n")
        return False
    except FileNotFoundError:
        print("  [X] O executável do Git não foi encontrado no ambiente.\n")
        return False
    except Exception as e:
        print(f"  [X] Erro ao executar operações do Git: {e}\n")
        return False


# ==========================================
# PONTO DE ENTRADA PRINCIPAL
# ==========================================
def main():
    print(f"Iniciando rotina do sync_worker [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}]...\n")
    session = create_session()
    update_epg(session)
    sync_cdn_referers(session)
    git_commit_and_push()
    print("Todas as rotinas foram finalizadas com sucesso.")


if __name__ == "__main__":
    main()