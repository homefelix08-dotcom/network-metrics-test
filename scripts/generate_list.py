import re
import json

BASE_WORKER_URL = "https://network-metrics-test.homefelix08.workers.dev/play"
REPO_PATH = "src/repo.js"
OUTPUT_PATH = "export_data.txt"

EPG_GLOBAL = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/refs/heads/main/claro.xml"
EPG_LOCAL = "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/local_meta.xml"

def load_repo_js():
    with open(REPO_PATH, "r", encoding="utf-8") as f:
        content = f.read()
        # Busca o conteúdo do array dentro do export default
        match = re.search(r'\[.*\]', content, re.DOTALL)
        return json.loads(match.group(0)) if match else []

def main():
    channels = load_repo_js()
    
    lines = [f'#EXTM3U x-tvg-url="{EPG_GLOBAL},{EPG_LOCAL}"\n']
    
    for c in channels:
        nome = c['nome']
        tvg_id = c.get('tvg_id', nome)
        logo = c.get('logo', '')
        cat = c.get('categoria', 'Diversos')
        
        worker_endpoint = f"{BASE_WORKER_URL}/{nome.replace(' ', '%20')}"
        
        lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome}" tvg-logo="{logo}" group-title="{cat}", {nome}\n')
        lines.append(f"{worker_endpoint}\n")
    
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    print(f"Lista de exportação gerada com sucesso: {len(channels)} canais com EPG configurado.")

if __name__ == "__main__":
    main()
