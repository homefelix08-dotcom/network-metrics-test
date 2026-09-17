"""
Módulo responsável por:
1. Geração e atualização do arquivo local_meta.xml (EPG local dos canais regionais).
2. Resolução do novo domínio de CDN do provedor de canais (via redirecionamento de um canal de teste)
   e atualização automática dos cabeçalhos Referer em export_data.txt.
3. Commit e push automáticos no repositório caso haja alterações.
"""

import os
import re
import html
import subprocess
import urllib.parse
from datetime import datetime
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
# CONFIGURAÇÕES DE REDE
# ==========================================
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
TIMEOUT_SECONDS = 25

# ==========================================
# CONFIGURAÇÕES DO EPG LOCAL
# ==========================================
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


# ==========================================
# 1. ATUALIZAÇÃO DO EPG LOCAL (local_meta.xml)
# ==========================================
def update_local_meta(session: requests.Session) -> bool:
    """Coleta a grade dos canais regionais configurados e atualiza o arquivo local_meta.xml."""
    print("=== [1/2] ATUALIZAÇÃO DO LOCAL_META.XML ===")
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
        print("[ALERTA] Nenhum programa foi coletado. O arquivo local_meta.xml não foi sobrescrito para preservar os dados existentes.\n")
        return False

    linhas = ['<?xml version="1.0" encoding="UTF-8"?>\n<tv>\n'] + xml_channels + xml_programmes + ['</tv>\n']

    with open(OUTPUT_XML_PATH, 'w', encoding='utf-8') as f:
        f.writelines(linhas)

    print(f"[SUCESSO] local_meta.xml atualizado com sucesso em '{OUTPUT_XML_PATH}'. Total de {total_blocos} programas.\n")
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
            # Verifica se já atingiu o host do CDN
            if "cdn" in parsed.netloc:
                cdn_base = f"{parsed.scheme}://{parsed.netloc}/"
                return cdn_base
        else:
            parsed = urllib.parse.urlparse(current_url)
            if "cdn" in parsed.netloc:
                cdn_base = f"{parsed.scheme}://{parsed.netloc}/"
                return cdn_base
            break

    # Se ao final houver redirecionamento para um host diferente
    parsed = urllib.parse.urlparse(current_url)
    if parsed.netloc and parsed.netloc != urllib.parse.urlparse(sample_url).netloc:
        cdn_base = f"{parsed.scheme}://{parsed.netloc}/"
        return cdn_base

    return None


def update_referers_in_file(file_path: str, new_cdn_base: str) -> int:
    """Atualiza todas as ocorrências de Referer no arquivo alvo com o novo domínio CDN."""
    if not os.path.exists(file_path):
        print(f"  [Aviso] Arquivo não encontrado: {file_path}")
        return 0

    with open(file_path, "r", encoding="utf-8") as f:
        lines = f.readlines()

    pattern = re.compile(r'\|Referer=https?://[^/\s|]+/(?:e/index\.php\?canal=)?([^\s|\r\n]+)')
    updated_lines = []
    changes_count = 0
    total_referers = 0

    for line in lines:
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

    if changes_count > 0:
        with open(file_path, "w", encoding="utf-8") as f:
            f.writelines(updated_lines)
        print(f"  [OK] '{os.path.basename(file_path)}': {changes_count} canais com Referer atualizados para {new_cdn_base} (Total: {total_referers}).")
    else:
        print(f"  [INFO] '{os.path.basename(file_path)}': Todos os {total_referers} Referers já estavam atualizados.")

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

        # Adiciona os arquivos modificados
        subprocess.run(["git", "add", "."], cwd=BASE_DIR, check=True, timeout=30)

        # Cria a mensagem de commit com timestamp
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
        commit_msg = f"chore: auto-sync EPG and CDN referers [{timestamp}]"

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

        # Sincroniza com remoto via rebase e autostash antes do push
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

        # Envia para o repositório remoto
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
    update_local_meta(session)
    sync_cdn_referers(session)
    git_commit_and_push()
    print("Todas as rotinas foram finalizadas com sucesso.")


if __name__ == "__main__":
    main()