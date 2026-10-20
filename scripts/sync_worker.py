"""
Módulo responsável por:
1. Geração e atualização automática do EPG unificado completo (local_meta.xml):
   - API REST oficial da Claro TV+ para todos os canais nacionais.
   - Scraper HTML oficial da Claro para os canais regionais de Minas Gerais.
   - Gerador de programação contínua para canais OTT e feeds de eventos (Prime Video, HBO Max, Goat, Apple TV, etc.).
2. Resolução do novo domínio de CDN do provedor de canais e atualização dos cabeçalhos Referer em export_data.txt.
3. Commit e push automáticos no repositório GitHub.
"""

import os
import re
import time
import unicodedata
import subprocess
import urllib.parse
import xml.sax.saxutils
from datetime import datetime, timedelta
import pytz
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

# ==========================================
# CONFIGURAÇÕES DE CAMINHOS & REPO
# ==========================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_XML_PATH = os.path.join(BASE_DIR, "local_meta.xml")
EXPORT_DATA_PATH = os.path.join(BASE_DIR, "export_data.txt")
REPO_PATH = os.path.join(BASE_DIR, "src", "repo.js")
ASSETS_BASE = "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets"

GIT_BOT_NAME = "Data Sync Bot"
GIT_BOT_EMAIL = "bot@github.com"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*'
}
TIMEOUT_SECONDS = 30
CLARO_API_BASE_URL = "https://www.clarotvmais.com.br/avsclient/1.2/epg/livechannels"
EPG_DAYS_AHEAD = 4

CHANNEL_ALIASES = {
    'SBT': ['SBT São Paulo'],
    'RECORD HD': ['RECORD - Sao Paulo'],
    'REDE TV! HD': ['REDE TV! São Paulo'],
    'GE TV HD': ['GE'],
}

LOCAL_EPG_CONFIGS = [
    {"id": "Globo MG", "name": "Globo MG", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/globo-hd/23-2068", "logo": f"{ASSETS_BASE}/globo_mg.png"},
    {"id": "Rede Minas", "name": "Rede Minas", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/tv-minas/23-2000", "logo": f"{ASSETS_BASE}/rede_minas.png"},
    {"id": "Record MG", "name": "Record MG", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/record-hd/23-2084", "logo": f"{ASSETS_BASE}/record_mg.png"},
    {"id": "SBT MG", "name": "TV Alterosa", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/sbt-tv-alterosa/23-1949", "logo": f"{ASSETS_BASE}/tv_alterosa.png"},
    {"id": "Band MG", "name": "Band MG", "url": "https://www.claro.com.br/tv-por-assinatura/programacao/grade/programa/band/23-408", "logo": f"{ASSETS_BASE}/band.png"}
]

REGIONAL_SHOWS_METADATA = {
    "mg1": "Aline Aguiar apresenta as noticias do dia e traz informações de serviço, saúde, cultura e cidadania.",
    "mg2": "Mara Pinheiro resume os principais fatos do dia em Minas, além de reportagens e séries especiais.",
    "bom dia minas": "Liliana Junger, Sérgio Marques e Carlos Eduardo Alvim apresentam as primeiras noticias da manhã em todo o estado.",
    "globo esporte": "Maurício Paulucci apresenta as notícias do esporte em Minas Gerais.",
    "mg no ar": "Os principais destaques da noite, da madrugada e da manhã estão no MG no Ar. Apresentado por Eduardo Costa, um dos jornalistas de maior experiência e credibilidade no Estado.",
    "balanco geral": "O programa, que transita entre o jornalismo e o entretenimento, mostra reportagens exclusivas, denúncias, prestação de serviço e assuntos que mexem com o dia a dia da comunidade.",
    "cidade alerta": "Cidade Alerta estará ao lado do cidadão que necessita da atenção do poder público em questões cotidianas das cidades, além dos assuntos de maior repercussão no cenário da segurança.",
    "mg record": "As principais notícias do dia, em um telejornal dinâmico, com informações ao vivo e exclusivas. Reportagens especiais e investigativas em uma cobertura ágil e diferenciada.",
    "alterosa agora": "Álvaro Damião comanda ao vivo o Alterosa Agora um programa jornalístico e de entretenimento que traz todas as notícias do momento.",
    "alterosa esporte": "O Alterosa Esporte reúne todas as torcidas de Minas e tem a cobertura mais completa do cenário esportivo mineiro.",
    "alterosa alerta": "O Alterosa Alerta com Stanley Gusman é o programa que está mais perto do povo.",
    "jornal da alterosa": "O Jornal da Alterosa ocupa o horário nobre da TV, falando diretamente às cidades e regiões do Estado.",
    "band cidade": "O programa mostra as mais variadas informações sobre saúde, política, educação, denúncias e acontecimentos, que fazem parte do dia-a-dia da região.",
    "os donos da bola": "O programa de debate sobre o mundo do futebol mais bem humorado da TV.",
    "brasil urgente": "Os acontecimentos do dia, com foco na segurança, no transporte, na saúde, no trabalho e no comportamento do povo Brasileiro."
}

SPECIAL_CHANNELS = [
    {"id": "Tooncast", "name": "Tooncast", "category": "Infantis", "logo": f"{ASSETS_BASE}/tooncast.png", "type": "animation"},
    {"id": "Canal Goat", "name": "Canal Goat", "category": "Esportes", "logo": f"{ASSETS_BASE}/canal_goat.png", "type": "sports",
     "title": "Canal Goat - Transmissão Esportiva ao Vivo", "desc": "Transmissão ao vivo de jogos, competições e programas esportivos no Canal Goat."},
    {"id": "Apple TV", "name": "Apple TV", "category": "Esportes", "logo": f"{ASSETS_BASE}/apple_tv.png", "type": "sports",
     "title": "Major League Soccer (MLS) - Ao Vivo", "desc": "Transmissão ao vivo das partidas da Major League Soccer no MLS Season Pass / Apple TV."},
    {"id": "Dazn", "name": "Dazn", "category": "Esportes", "logo": f"{ASSETS_BASE}/dazn.png", "type": "sports",
     "title": "Transmissão Esportiva ao Vivo - DAZN", "desc": "Transmissão ao vivo de competições e eventos esportivos internacionais no DAZN."},
    {"id": "Paramount+ Eventos", "name": "Paramount+", "category": "Esportes", "logo": f"{ASSETS_BASE}/paramount.png", "type": "sports",
     "title": "CONMEBOL Libertadores & Sul-Americana - Ao Vivo", "desc": "Transmissão ao vivo de partidas da CONMEBOL Libertadores e Copa Sul-Americana no Paramount+."},
    {"id": "Premiere 8", "name": "Premiere 8", "category": "Esportes", "logo": f"{ASSETS_BASE}/premiere_8.png", "type": "sports",
     "title": "Premiere - Transmissão de Jogos Simultâneos", "desc": "Canal de transbordo do Premiere para transmissões de partidas simultâneas do Brasileirão."}
]

for idx in range(1, 6):
    SPECIAL_CHANNELS.append({
        "id": f"Prime Video {idx}", "name": f"Prime Video {idx}", "category": "Esportes",
        "logo": f"{ASSETS_BASE}/amazon_prime_video_{idx}.png", "type": "sports",
        "title": f"Copa do Brasil & Eventos Prime Video (Feed {idx}) - Ao Vivo",
        "desc": f"Transmissão ao vivo de jogos da Copa do Brasil e eventos esportivos exclusivos no Amazon Prime Video (Feed {idx})."
    })

for idx in range(1, 7):
    suffix = f" {idx}" if idx > 1 else ""
    logo = f"{ASSETS_BASE}/hbo_max_{idx}.png" if idx > 1 else f"{ASSETS_BASE}/hbo_max.png"
    SPECIAL_CHANNELS.append({
        "id": f"HBO Max{suffix}", "name": f"HBO Max{suffix}", "category": "Esportes",
        "logo": logo, "type": "sports",
        "title": f"UEFA Champions League & Eventos Max (Feed {idx}) - Ao Vivo",
        "desc": f"Transmissão ao vivo de partidas da UEFA Champions League e eventos da TNT Sports na plataforma Max (Feed {idx})."
    })

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


# ==========================================
# UTILITÁRIOS
# ==========================================
def create_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504], raise_on_status=False)
    adapter = HTTPAdapter(max_retries=retries)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


def escape_xml(text) -> str:
    return xml.sax.saxutils.escape(str(text)) if text else ""


def format_xmltv_date(ts: float, tz) -> str:
    return datetime.fromtimestamp(ts, tz).strftime("%Y%m%d%H%M%S %z")


def normalize_title(title: str) -> str:
    """Normaliza título para busca insensível a acentos, pontuação e sufixos regionais."""
    t = unicodedata.normalize('NFKD', title.lower()).encode('ASCII', 'ignore').decode('utf-8')
    t = re.sub(r'[^a-z0-9\s]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return re.sub(r'\b(mg|minas|esportes)\b', lambda m: 'esporte' if m.group(1) == 'esportes' else '', t).strip()


def get_regional_metadata(title: str, program_lookup: dict) -> dict:
    t_clean = normalize_title(title)
    if t_clean in program_lookup:
        return program_lookup[t_clean]
    for key, desc in REGIONAL_SHOWS_METADATA.items():
        if key in t_clean:
            return {"desc": desc, "category": "Jornalismo", "rating": "L"}
    return {"category": "Jornalismo", "rating": "L"}


# ==========================================
# 1. COLETADORES DE DADOS DE EPG
# ==========================================
def fetch_claro_api_data(session: requests.Session, days_ahead: int, tz):
    now = datetime.now(tz)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    api_channels, api_programmes, program_info_lookup = {}, {}, {}

    for day_offset in range(days_ahead):
        day_start = start_of_today + timedelta(days=day_offset)
        start_ts, end_ts = int(day_start.timestamp()), int((day_start + timedelta(days=1)).timestamp())
        date_str = day_start.strftime("%d/%m/%Y")
        print(f"  [API Claro] Coletando grade: {date_str} (start={start_ts}, end={end_ts})...")
        url = f"{CLARO_API_BASE_URL}?types=&channelIds=&startTime={start_ts}&endTime={end_ts}&location=SAO%20PAULO,AMAZONAS&channel=PCTV"

        try:
            resp = session.get(url, headers=HEADERS, timeout=TIMEOUT_SECONDS)
            if resp.status_code != 200:
                print(f"    [X] Erro HTTP {resp.status_code} na API da Claro.")
                continue

            live_channels = resp.json().get('response', {}).get('liveChannels', [])
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

                for sch in schedules:
                    t = sch.get('title')
                    if t and t.strip():
                        t_norm = normalize_title(t)
                        if t_norm not in program_info_lookup:
                            img = (sch.get('image') or '').replace('{{image-size-placeholder}}', '420_236') or None
                            rating_val = str(sch['rating']['code']).strip() if isinstance(sch.get('rating'), dict) and sch['rating'].get('code') else None
                            program_info_lookup[t_norm] = {
                                'desc': sch.get('description'),
                                'icon': img,
                                'category': ch.get('type'),
                                'rating': rating_val
                            }
        except Exception as e:
            print(f"    [X] Falha na requisição API Claro ({date_str}): {e}")

    return api_channels, api_programmes, program_info_lookup


def fetch_regional_html_data(session: requests.Session, program_info_lookup: dict, days_ahead: int):
    print("  [Scraper Regional] Coletando canais locais de Minas Gerais (HTML Claro)...")
    regional_channels, regional_programmes = {}, {}

    for config in LOCAL_EPG_CONFIGS:
        c_id, c_name, c_url, c_logo = config["id"], config["name"], config["url"], config["logo"]
        regional_channels[c_id] = {'id': c_id, 'name': c_name, 'logo': c_logo}
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
                    title_elem = item.find('p', class_='channel-program-item-title')
                    if title_elem and title_elem.text.strip():
                        st = int(item['data-start']) / 1000.0 # type: ignore
                        et = int(item['data-end']) / 1000.0 # type: ignore
                        base_items.append((st, et, title_elem.text.strip()))
                except Exception:
                    continue

            print(f"    [OK] {c_id}: {len(base_items)} programas na grade de hoje.")

            for day_offset in range(days_ahead):
                shift = day_offset * 86400.0
                for st, et, title in base_items:
                    info = get_regional_metadata(title, program_info_lookup)
                    regional_programmes[c_id].append({
                        'startTime': int(st + shift),
                        'endTime': int(et + shift),
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
    print("  [Canais Especiais] Gerando grade contínua para canais de streaming e eventos...")
    now = datetime.now(tz)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    special_channels, special_programmes = {}, {}

    sports_blocks = [
        (0, 6, "Melhores Momentos e Compactos da Rodada", "Compactos das últimas partidas, gols e análises esportivas."),
        (6, 11.5, "Especial Esportivo e Reprise de Eventos", "Reprises completas das transmissões recentes e coberturas exclusivas."),
        (11.5, 15.5, "Aquecimento e Noticiário Pré-Jogo", "Análise tática, escalações, entrevistas exclusivas e o aquecimento para as partidas."),
        (15.5, 19, None, None),
        (19, 22.5, None, None),
        (22.5, 24, "Pós-Jogo, Entrevistas e Análise da Rodada", "Repercussão dos resultados, comentários pós-jogo e melhores momentos do dia.")
    ]

    for spec in SPECIAL_CHANNELS:
        c_id, c_name, c_logo, c_cat, c_type = spec["id"], spec["name"], spec["logo"], spec["category"], spec.get("type", "sports")
        special_channels[c_id] = {'id': c_id, 'name': c_name, 'logo': c_logo, 'type': c_cat}
        special_programmes[c_id] = []

        for day_offset in range(days_ahead):
            day_start = start_of_today + timedelta(days=day_offset)
            base_ts = int(day_start.timestamp())

            if c_type == "animation":
                slot_dur = 2700
                slots = 32
                for s_idx in range(slots):
                    st = base_ts + (s_idx * slot_dur)
                    title, desc = TOONCAST_CARTOONS[(day_offset * slots + s_idx) % len(TOONCAST_CARTOONS)]
                    special_programmes[c_id].append({
                        'startTime': st, 'endTime': st + slot_dur, 'title': title,
                        'description': desc, 'icon': c_logo, 'category': 'Infantis', 'rating': 'L'
                    })
            else:
                live_title = spec.get("title", f"{c_name} - Ao Vivo")
                live_desc = spec.get("desc", "Transmissão ao vivo de eventos esportivos e competições.")
                for h_start, h_end, b_title, b_desc in sports_blocks:
                    special_programmes[c_id].append({
                        'startTime': base_ts + int(h_start * 3600),
                        'endTime': base_ts + int(h_end * 3600),
                        'title': b_title or live_title,
                        'description': b_desc or live_desc,
                        'icon': c_logo, 'category': 'Esportes', 'rating': 'L'
                    })

    return special_channels, special_programmes


# ==========================================
# 2. MONTAGEM E GRAVAÇÃO DO XMLTV UNIFICADO
# ==========================================
def iter_unified_programmes(api_progs, api_channels, regional_progs, special_progs):
    """Gera um fluxo único e padronizado de programas para escrita no XML."""
    # 1. Canais da API Claro e Aliases
    for ch_name, progs in api_progs.items():
        cat_default = api_channels.get(ch_name, {}).get('type')
        target_ids = [ch_name] + CHANNEL_ALIASES.get(ch_name, [])
        for p in progs:
            st, et, title = p.get('startTime'), p.get('endTime'), p.get('title')
            if not st or not et or not title:
                continue
            img = (p.get('image') or '').replace('{{image-size-placeholder}}', '420_236') or None
            tv_chs = p.get('tvChannels')
            cat = (tv_chs[0].get('type') if tv_chs else None) or cat_default
            rating = str(p['rating']['code']).strip() if isinstance(p.get('rating'), dict) and p['rating'].get('code') else None

            prog_data = {
                'st': st, 'et': et, 'title': title,
                'sub_title': p.get('episodeName'), 'desc': p.get('description'),
                'icon': img, 'category': cat, 'length': p.get('duration'),
                'season': p.get('seasonNumber'), 'episode': p.get('episodeNumber'),
                'rating': rating
            }
            for ch in target_ids:
                yield ch, prog_data

    # 2. Canais Regionais e Canais Especiais
    for source in (regional_progs, special_progs):
        for ch_id, progs in source.items():
            for p in progs:
                st, et, title = p.get('startTime'), p.get('endTime'), p.get('title')
                if not st or not et or not title:
                    continue
                yield ch_id, {
                    'st': st, 'et': et, 'title': title,
                    'desc': p.get('description'), 'icon': p.get('icon'),
                    'category': p.get('category'), 'rating': p.get('rating')
                }


def build_and_save_xmltv(api_channels, api_progs, regional_channels, regional_progs, special_channels, special_progs, tz) -> bool:
    print(f"  -> Consolidando dados no arquivo '{os.path.basename(OUTPUT_XML_PATH)}'...")
    xml = ['<?xml version="1.0" encoding="utf-8"?>\n',
           '<tv generator-info-name="ClaroEPG - Network Metrics" generator-info-url="https://github.com/homefelix08-dotcom/network-metrics-test">\n']

    all_channels = {}
    for ch_name, data in api_channels.items():
        all_channels[ch_name] = {'name': ch_name, 'logo': data.get('logo')}
        for alias in CHANNEL_ALIASES.get(ch_name, []):
            all_channels[alias] = {'name': alias, 'logo': data.get('logo')}

    for ch_id, data in {**regional_channels, **special_channels}.items():
        all_channels[ch_id] = {'name': data['name'], 'logo': data.get('logo')}

    for ch_id in sorted(all_channels.keys()):
        info = all_channels[ch_id]
        xml.append(f'  <channel id="{escape_xml(ch_id)}">\n    <display-name lang="pt">{escape_xml(info["name"])}</display-name>\n')
        if info.get('logo'):
            xml.append(f'    <icon src="{escape_xml(info["logo"])}" />\n')
        xml.append('  </channel>\n')

    written_count = 0
    seen = set()

    for ch_id, p in iter_unified_programmes(api_progs, api_channels, regional_progs, special_progs):
        key = (ch_id, p['st'], p['et'])
        if key in seen:
            continue
        seen.add(key)

        st_str, et_str = format_xmltv_date(p['st'], tz), format_xmltv_date(p['et'], tz)
        xml.append(f'  <programme start="{st_str}" stop="{et_str}" channel="{escape_xml(ch_id)}">\n')
        xml.append(f'    <title lang="pt">{escape_xml(p["title"])}</title>\n')

        if p.get('sub_title'):
            xml.append(f'    <sub-title lang="pt">{escape_xml(p["sub_title"])}</sub-title>\n')
        if p.get('desc'):
            xml.append(f'    <desc lang="pt">{escape_xml(p["desc"])}</desc>\n')
        if p.get('icon'):
            xml.append(f'    <icon src="{escape_xml(p["icon"])}" />\n')
        if p.get('category'):
            xml.append(f'    <category lang="pt">{escape_xml(p["category"])}</category>\n')
        if p.get('length'):
            xml.append(f'    <length units="seconds">{p["length"]}</length>\n')

        if p.get('season') is not None and p.get('episode') is not None:
            try:
                s_idx, e_idx = max(0, int(p['season']) - 1), max(0, int(p['episode']) - 1)
                xml.append(f'    <episode-num system="xmltv_ns">{s_idx}.{e_idx}.</episode-num>\n')
                xml.append(f'    <episode-num system="onscreen">T{p["season"]} E{p["episode"]}</episode-num>\n')
            except (ValueError, TypeError):
                pass

        if p.get('rating'):
            xml.append(f'    <rating system="Brazil">\n      <value>[{escape_xml(p["rating"])}]</value>\n    </rating>\n')

        xml.append('  </programme>\n')
        written_count += 1

    xml.append('</tv>\n')

    with open(OUTPUT_XML_PATH, 'w', encoding='utf-8') as f:
        f.writelines(xml)

    file_size_mb = os.path.getsize(OUTPUT_XML_PATH) / (1024 * 1024)
    print(f"[SUCESSO] {os.path.basename(OUTPUT_XML_PATH)} gravado ({len(all_channels)} canais, {written_count} programas, {file_size_mb:.2f} MB).")
    return True


def update_epg(session: requests.Session, days_ahead: int = EPG_DAYS_AHEAD) -> bool:
    print(f"=== [1/2] ATUALIZAÇÃO DO EPG UNIFICADO ({days_ahead} DIAS) ===")
    t0 = time.time()
    tz = pytz.timezone('America/Sao_Paulo')

    api_channels, api_progs, prog_lookup = fetch_claro_api_data(session, days_ahead, tz)
    reg_channels, reg_progs = fetch_regional_html_data(session, prog_lookup, days_ahead)
    spec_channels, spec_progs = generate_special_channels_data(tz, days_ahead)

    success = build_and_save_xmltv(api_channels, api_progs, reg_channels, reg_progs, spec_channels, spec_progs, tz)
    print(f"Tempo total de atualização do EPG: {time.time() - t0:.2f} segundos.\n")
    return success


# ==========================================
# 3. SINCRONIZAÇÃO DO CDN REFERER EM EXPORT_DATA.TXT
# ==========================================
def get_sample_channel_url() -> str:
    default_url = "https://embedcanaisdetv.xyz/e/index.php?canal=globomg"
    if os.path.exists(REPO_PATH):
        try:
            with open(REPO_PATH, "r", encoding="utf-8") as f:
                content = f.read()
            base_m = re.search(r'siteBaseUrl\s*=\s*["\']([^"\']+)["\']', content)
            base_url = base_m.group(1) if base_m else "https://embedcanaisdetv.xyz/e/index.php?canal="
            slug_m = re.search(r'siteBaseUrl\}\s*([a-zA-Z0-9_\-]+)', content)
            slug = slug_m.group(1) if slug_m else "globomg"
            return f"{base_url}{slug}"
        except Exception as e:
            print(f"  [Aviso] Falha ao ler {REPO_PATH}: {e}")
    return default_url


def discover_cdn_base(sample_url: str, session: requests.Session) -> str | None:
    print(f"  -> Rastreando CDN através do canal de teste: {sample_url}")
    current_url = sample_url

    for hop in range(5):
        try:
            resp = session.get(current_url, headers=HEADERS, allow_redirects=False, timeout=TIMEOUT_SECONDS)
        except Exception as e:
            print(f"  [X] Erro ao acessar {current_url}: {e}")
            break

        if resp.status_code in (301, 302, 303, 307, 308) and "Location" in resp.headers:
            current_url = urllib.parse.urljoin(current_url, resp.headers["Location"].strip())
            print(f"     Hop {hop + 1}: redirecionado para {current_url}")
            parsed = urllib.parse.urlparse(current_url)
            if "cdn" in parsed.netloc:
                return f"{parsed.scheme}://{parsed.netloc}/"
        else:
            parsed = urllib.parse.urlparse(current_url)
            if "cdn" in parsed.netloc:
                return f"{parsed.scheme}://{parsed.netloc}/"
            break

    parsed = urllib.parse.urlparse(current_url)
    if parsed.netloc and parsed.netloc != urllib.parse.urlparse(sample_url).netloc:
        return f"{parsed.scheme}://{parsed.netloc}/"
    return None


def update_referers_in_file(file_path: str, new_cdn_base: str) -> int:
    if not os.path.exists(file_path):
        print(f"  [Aviso] Arquivo não encontrado: {file_path}")
        return 0

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    epg_header = '#EXTM3U x-tvg-url="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/local_meta.xml"\n'
    header_changed = lines and lines[0].startswith("#EXTM3U") and lines[0] != epg_header
    if header_changed:
        lines[0] = epg_header

    pattern = re.compile(r'\|Referer=https?://[^/\s|]+/(?:e/index\.php\?canal=)?([^\s|\r\n]+)')
    updated_lines, changes_count, total_refs = [], 0, 0

    for idx, line in enumerate(lines):
        if idx == 0 and line.startswith("#EXTM3U"):
            updated_lines.append(line)
            continue
        m = pattern.search(line)
        if m:
            total_refs += 1
            new_line = re.sub(r'\|Referer=https?://[^\s|\r\n]+', f"|Referer={new_cdn_base.rstrip('/')}/{m.group(1).strip('/')}/", line)
            if new_line != line:
                changes_count += 1
            updated_lines.append(new_line)
        else:
            updated_lines.append(line)

    if changes_count > 0 or header_changed:
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(updated_lines)
        print(f"  [OK] '{os.path.basename(file_path)}': {changes_count} canais atualizados para {new_cdn_base} (Total: {total_refs}).")
    else:
        print(f"  [INFO] '{os.path.basename(file_path)}': Todos os {total_refs} Referers e cabeçalho já estavam atualizados.")
    return changes_count


def sync_cdn_referers(session: requests.Session) -> bool:
    print("=== [2/2] SINCRONIZAÇÃO DO CDN REFERER ===")
    sample_url = get_sample_channel_url()
    new_cdn = discover_cdn_base(sample_url, session)
    if not new_cdn:
        print("  [ERRO] Não foi possível obter o novo domínio base do CDN.\n")
        return False
    print(f"  -> Novo domínio base de CDN detectado: {new_cdn}")
    update_referers_in_file(EXPORT_DATA_PATH, new_cdn)
    print("[SUCESSO] Sincronização do CDN Referer concluída com sucesso.\n")
    return True


# ==========================================
# 4. SINCRONIZAÇÃO GIT (COMMIT & PUSH AUTOMÁTICO)
# ==========================================
def run_git(*args, timeout=30):
    env = {
        **os.environ,
        "GIT_TERMINAL_PROMPT": "0",
        "GCM_INTERACTIVE": "never",
        "GIT_AUTHOR_NAME": GIT_BOT_NAME,
        "GIT_AUTHOR_EMAIL": GIT_BOT_EMAIL,
        "GIT_COMMITTER_NAME": GIT_BOT_NAME,
        "GIT_COMMITTER_EMAIL": GIT_BOT_EMAIL
    }
    return subprocess.run(["git", *args], cwd=BASE_DIR, capture_output=True, text=True, env=env, timeout=timeout)


def git_commit_and_push() -> bool:
    print("=== [3/3] SINCRONIZAÇÃO COM O GITHUB (GIT COMMIT & PUSH) ===")
    try:
        status_res = run_git("status", "--porcelain")
        changes = status_res.stdout.strip()
        if not changes:
            print("  [INFO] Nenhuma alteração detectada no repositório. Nada a commitar.\n")
            return False

        print("  -> Alterações detectadas:")
        for line in changes.splitlines():
            print(f"     {line}")

        run_git("add", ".")
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        commit_msg = f"chore: auto-sync unified EPG (local_meta.xml) and CDN referers [{timestamp}]"

        commit_res = run_git(
            "-c", f"user.name={GIT_BOT_NAME}",
            "-c", f"user.email={GIT_BOT_EMAIL}",
            "commit",
            f"--author={GIT_BOT_NAME} <{GIT_BOT_EMAIL}>",
            "-m", commit_msg
        )
        if commit_res.returncode != 0:
            print(f"  [Aviso] Falha ou nada a commitar: {commit_res.stderr.strip()}\n")
            return False

        print(f"  [OK] Commit realizado: '{commit_msg}'")
        print("  -> Sincronizando com o remoto (git pull --rebase --autostash)...")
        pull_res = run_git("pull", "--rebase", "--autostash", timeout=60)
        if pull_res.returncode != 0:
            print(f"  [Aviso] Retorno do git pull: {pull_res.stderr.strip() or pull_res.stdout.strip()}")

        print("  -> Enviando alterações para o remoto (git push)...")
        push_res = run_git("push", timeout=60)
        if push_res.returncode == 0:
            print("  [OK] Git push realizado com sucesso!\n")
            return True

        print(f"  [X] Falha no git push: {push_res.stderr.strip()}\n")
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
