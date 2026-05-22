import subprocess
import json
import os
import requests
import re

REPO_PATH = "src/repo.js"
ASSETS_DIR = "assets"
GITHUB_RAW_BASE = "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets"

def load_repo_js():
    try:
        with open(REPO_PATH, "r", encoding="utf-8") as f:
            repo_content = f.read()

        # Isola o export para o Node transformar em JSON
        execution_code = repo_content.replace("export default", "const data =")
        execution_code += "\nconsole.log(JSON.stringify(data));"

        temp_filename = "temp_bridge_logos.cjs"
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
            print(f"Erro no Node: {result.stderr}")
            return None, []

        return repo_content, json.loads(result.stdout.strip())
    except Exception as e:
        print(f"Erro ao ler repo.js: {e}")
        return None, []

def sanitize_filename(name):
    # Padroniza o nome do arquivo (ex: "Globo MG" -> "globo_mg")
    name = name.lower().replace(" ", "_")
    return re.sub(r'[^a-z0-9__\-]', '', name)

def update_repo_file(original_content, channels_updated):
    # Cria um dicionário: { "Nome do Canal": "Novo Link do Logo" }
    logo_map = {c['nome']: c['logo'] for c in channels_updated if 'logo' in c}
    
    lines = original_content.splitlines()
    updated_lines = []
    
    canal_atual = None
    
    for line in lines:
        # 1. Tenta identificar em qual canal estamos entrando no laço
        nome_match = re.search(r'"nome"\s*:\s*["\']([^"\']+)["\']', line)
        if nome_match:
            canal_atual = nome_match.group(1)
            
        # 2. Se estivermos dentro de um canal conhecido e acharmos a linha do logo
        if canal_atual and canal_atual in logo_map:
            if '"logo"' in line:
                # Substitui a linha inteira mantendo a indentação original
                indentation = re.match(r'^\s*', line).group(0)
                line = f'{indentation}"logo": "{logo_map[canal_atual]}",'
                # Reseta o canal atual para não alterar linhas de logo erradas por acidente
                canal_atual = None 
                
        updated_lines.append(line)
        
    # Reconstrói o arquivo com as quebras de linha corretas
    with open(REPO_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(updated_lines) + "\n")
def main():
    original_content, channels = load_repo_js()
    if not channels:
        print("Nenhum canal encontrado ou erro ao processar o arquivo.")
        return

    if not os.path.exists(ASSETS_DIR):
        os.makedirs(ASSETS_DIR)

    print(f"=== INICIANDO DOWNLOAD E ATUALIZAÇÃO DO REPO.JS ===\n")
    
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    channels_updated = []

    for c in channels:
        nome = c['nome']
        logo_url = c.get('logo', '')
        new_channel = c.copy()

        # Pula se não houver logo ou se já estiver apontando para o seu GitHub
        if not logo_url or GITHUB_RAW_BASE in logo_url:
            channels_updated.append(new_channel)
            continue

        # Detecta a extensão do arquivo
        ext_match = re.search(r'\.(png|jpg|jpeg|webp|gif|svg)', logo_url.lower())
        ext = ext_match.group(1) if ext_match else "png"
        
        filename = f"{sanitize_filename(nome)}.{ext}"
        local_path = os.path.join(ASSETS_DIR, filename)

        print(f"Processando [{nome}]...", end=" ", flush=True)
        try:
            res = requests.get(logo_url, headers=headers, timeout=15)
            if res.status_code == 200:
                with open(local_path, "wb") as img_file:
                    img_file.write(res.content)
                
                # Define a nova URL com o seu caminho base
                new_channel['logo'] = f"{GITHUB_RAW_BASE}/{filename}"
                print("[DOWNLOAD OK]")
            else:
                print(f"[FALHA HTTP {res.status_code}]")
        except Exception as e:
            print(f"[ERRO - {e}]")
            
        channels_updated.append(new_channel)

    # Grava as alterações diretamente no arquivo original preservando a estrutura JS
    update_repo_file(original_content, channels_updated)
    print("\n=== PROCESSO CONCLUÍDO COM SUCESSO ===")
    print(f"O arquivo '{REPO_PATH}' foi atualizado com os novos caminhos das logos!")

if __name__ == "__main__":
    main()