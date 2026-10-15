"""
Módulo responsável por:
1. Geração e atualização automática do EPG completo (claro.xml e local_meta.xml)
   consumindo a API oficial da Claro tv+ para todos os canais da lista.
2. Resolução do novo domínio de CDN do provedor de canais (via redirecionamento de um canal de teste)
   e atualização automática dos cabeçalhos Referer em export_data.txt.
3. Commit e push automáticos no repositório caso haja alterações.
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
import pytz

# ==========================================
# CONFIGURAÇÕES DE CAMINHOS
# ==========================================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_CLARO_XML = os.path.join(BASE_DIR, "claro.xml")
OUTPUT_LOCAL_XML = os.path.join(BASE_DIR, "local_meta.xml")
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
EPG_DAYS_AHEAD = 4  # Dia atual + 3 dias à frente (4 dias no total)

# Mapeia nomes originais da API Claro para tvg_ids específicos da lista repo.js
CHANNEL_ALIASES = {
    'GLOBO SP': ['Globo MG'],
    'BAND HD': ['Band MG'],
    'SBT': ['SBT MG', 'SBT São Paulo'],
    'RECORD HD': ['Record MG', 'RECORD - Sao Paulo'],
    'REDE TV! HD': ['REDE TV! São Paulo'],
    'GE TV HD': ['GE'],
}


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


def format_xmltv_date(ts: int, tz) -> str:
    """Converte Unix timestamp para o formato de data padrão do XMLTV (YYYYMMDDHHMMSS +/-HHMM)."""
    dt = datetime.fromtimestamp(ts, tz)
    return dt.strftime("%Y%m%d%H%M%S %z")


# ==========================================
# 1. ATUALIZAÇÃO DO EPG VIA API CLARO TV+
# ==========================================
def update_epg(session: requests.Session, days_ahead: int = EPG_DAYS_AHEAD) -> bool:
    """
    Coleta a grade de programação completa de todos os canais diretamente da API oficial da Claro tv+
    e gera o arquivo XMLTV único (claro.xml e espelho local_meta.xml).
    """
    print(f"=== [1/2] ATUALIZAÇÃO DO EPG VIA API CLARO TV+ ({days_ahead} DIAS) ===")
    start_time_total = time.time()
    tz = pytz.timezone('America/Sao_Paulo')
    now = datetime.now(tz)
    start_of_today = now.replace(hour=0, minute=0, second=0, microsecond=0)

    channels_dict = {}
    programmes_by_channel = {}

    for day_offset in range(days_ahead):
        day_start = start_of_today + timedelta(days=day_offset)
        day_end = day_start + timedelta(days=1)
        start_ts = int(day_start.timestamp())
        end_ts = int(day_end.timestamp())

        date_str = day_start.strftime("%d/%m/%Y")
        print(f"  -> Coletando grade: {date_str} (start={start_ts}, end={end_ts})...")

        url = f"{CLARO_API_BASE_URL}?types=&channelIds=&startTime={start_ts}&endTime={end_ts}&location=SAO%20PAULO,AMAZONAS&channel=PCTV"

        try:
            resp = session.get(url, headers=HEADERS, timeout=TIMEOUT_SECONDS)
            if resp.status_code != 200:
                print(f"     [X] Erro HTTP {resp.status_code} na API da Claro.")
                continue

            data = resp.json()
            live_channels = data.get('response', {}).get('liveChannels', [])
            print(f"     [OK] {len(live_channels)} canais recebidos da API.")

            for ch in live_channels:
                ch_name = ch.get('name')
                if not ch_name:
                    continue

                if ch_name not in channels_dict:
                    channels_dict[ch_name] = {
                        'name': ch_name,
                        'logo': ch.get('logo') or ch.get('channelLogo'),
                        'type': ch.get('type')
                    }
                    programmes_by_channel[ch_name] = []

                schedules = ch.get('schedules', [])
                programmes_by_channel[ch_name].extend(schedules)

        except Exception as e:
            print(f"     [X] Falha na requisição para o dia {date_str}: {e}")

    total_programs = sum(len(p) for p in programmes_by_channel.values())
    if not channels_dict or total_programs == 0:
        print("[ALERTA] Nenhum dado de EPG foi coletado. Os arquivos XML existentes foram preservados.\n")
        return False

    print(f"  -> Montando XMLTV completo ({len(channels_dict)} canais e {total_programs} programas brutos)...")

    xml_lines = ['<?xml version="1.0" encoding="utf-8"?>\n']
    xml_lines.append(f'<tv generator-info-name="ClaroEPG - Network Metrics" generator-info-url="https://github.com/homefelix08-dotcom/network-metrics-test">\n')

    # 1. Definições de Canais (<channel id="...">)
    for ch_name, ch_data in sorted(channels_dict.items()):
        xml_lines.append(f'  <channel id="{escape_xml(ch_name)}">\n')
        xml_lines.append(f'    <display-name lang="pt">{escape_xml(ch_name)}</display-name>\n')
        if ch_data.get('logo'):
            xml_lines.append(f'    <icon src="{escape_xml(ch_data["logo"])}" />\n')
        xml_lines.append(f'  </channel>\n')

    # Adiciona canais alias para bater 100% com a lista repo.js
    for orig_name, aliases in CHANNEL_ALIASES.items():
        if orig_name in channels_dict:
            orig_logo = channels_dict[orig_name].get('logo')
            for alias in aliases:
                xml_lines.append(f'  <channel id="{escape_xml(alias)}">\n')
                xml_lines.append(f'    <display-name lang="pt">{escape_xml(alias)}</display-name>\n')
                if orig_logo:
                    xml_lines.append(f'    <icon src="{escape_xml(orig_logo)}" />\n')
                xml_lines.append(f'  </channel>\n')

    # 2. Definições de Programas (<programme start="..." stop="..." channel="...">)
    total_written_programmes = 0

    for ch_name, progs in programmes_by_channel.items():
        # Remove duplicatas baseadas no intervalo de tempo
        seen_intervals = set()
        unique_progs = []
        for p in progs:
            st = p.get('startTime')
            et = p.get('endTime')
            if not st or not et:
                continue
            interval_key = (st, et)
            if interval_key not in seen_intervals:
                seen_intervals.add(interval_key)
                unique_progs.append(p)

        # Determina todos os IDs de canais alvos (canal original + aliases)
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

                st_str = format_xmltv_date(st, tz)
                et_str = format_xmltv_date(et, tz)

                xml_lines.append(f'  <programme start="{st_str}" stop="{et_str}" channel="{escape_xml(target_ch)}">\n')
                xml_lines.append(f'    <title lang="pt">{escape_xml(title)}</title>\n')

                # Subtítulo / Nome do episódio
                episode_name = p.get('episodeName')
                if episode_name:
                    xml_lines.append(f'    <sub-title lang="pt">{escape_xml(episode_name)}</sub-title>\n')

                # Descrição / Sinopse
                description = p.get('description')
                if description:
                    xml_lines.append(f'    <desc lang="pt">{escape_xml(description)}</desc>\n')

                # Imagem / Poster em boa resolução (420x236)
                image_url = p.get('image')
                if image_url:
                    formatted_image = image_url.replace('{{image-size-placeholder}}', '420_236')
                    xml_lines.append(f'    <icon src="{escape_xml(formatted_image)}" />\n')

                # Categoria
                cat = None
                if p.get('tvChannels') and len(p['tvChannels']) > 0:
                    cat = p['tvChannels'][0].get('type')
                if not cat:
                    cat = channels_dict.get(ch_name, {}).get('type')
                if cat:
                    xml_lines.append(f'    <category lang="pt">{escape_xml(cat)}</category>\n')

                # Duração em segundos
                duration = p.get('duration')
                if duration:
                    xml_lines.append(f'    <length units="seconds">{duration}</length>\n')

                # Número de temporada e episódio (formato xmltv_ns: 0-indexed)
                season = p.get('seasonNumber')
                episode = p.get('episodeNumber')
                if season is not None and episode is not None:
                    try:
                        s_idx = max(0, int(season) - 1)
                        e_idx = max(0, int(episode) - 1)
                        xml_lines.append(f'    <episode-num system="xmltv_ns">{s_idx}.{e_idx}.</episode-num>\n')
                        xml_lines.append(f'    <episode-num system="onscreen">T{season} E{episode}</episode-num>\n')
                    except (ValueError, TypeError):
                        pass

                # Classificação Indicativa Brasileira
                rating = p.get('rating')
                if isinstance(rating, dict) and rating.get('code'):
                    rating_code = str(rating['code']).strip()
                    if rating_code:
                        xml_lines.append(f'    <rating system="Brazil">\n')
                        xml_lines.append(f'      <value>[{escape_xml(rating_code)}]</value>\n')
                        xml_lines.append(f'    </rating>\n')

                xml_lines.append('  </programme>\n')
                total_written_programmes += 1

    xml_lines.append('</tv>\n')

    # Grava o claro.xml principal
    with open(OUTPUT_CLARO_XML, 'w', encoding='utf-8') as f:
        f.writelines(xml_lines)

    # Grava também local_meta.xml como espelho idêntico para evitar links quebrados legados
    with open(OUTPUT_LOCAL_XML, 'w', encoding='utf-8') as f:
        f.writelines(xml_lines)

    elapsed = time.time() - start_time_total
    file_size_mb = os.path.getsize(OUTPUT_CLARO_XML) / (1024 * 1024)
    print(f"[SUCESSO] claro.xml e local_meta.xml atualizados com sucesso!")
    print(f"          Total: {len(channels_dict)} canais, {total_written_programmes} blocos de programação gravados.")
    print(f"          Tamanho: {file_size_mb:.2f} MB em {elapsed:.2f} segundos.\n")
    return True


# ==========================================
# 2. SINCRONIZAÇÃO DO CDN REFERER EM EXPORT_DATA.TXT
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

    single_epg_header = '#EXTM3U x-tvg-url="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/claro.xml"\n'
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
            print("  [OK] Cabeçalho atualizado para apontar exclusivamente para o claro.xml unificado.")
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
# 3. SINCRONIZAÇÃO GIT (COMMIT & PUSH AUTOMÁTICO)
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
        commit_msg = f"chore: auto-sync EPG (Claro TV+ API) and CDN referers [{timestamp}]"

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