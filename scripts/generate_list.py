import subprocess
import json
import os

BASE_WORKER_URL = "https://network-metrics-test.homefelix08.workers.dev/play"
REPO_PATH = "src/repo.js"
OUTPUT_PATH = "export_data.txt"

EPG_GLOBAL = "https://raw.githubusercontent.com/limaalef/BrazilTVEPG/refs/heads/main/claro.xml"
EPG_LOCAL = "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/local_meta.xml"

def load_repo_js():
    try:
        js_bridge_code = f"""
        import re from './{REPO_PATH}';
        console.log(JSON.stringify(re));
        """
        
        with open(REPO_PATH, "r", encoding="utf-8") as f:
            repo_content = f.read()

        execution_code = repo_content.replace("export default", "const data =")
        execution_code += "\nconsole.log(JSON.stringify(data));"

        temp_filename = "temp_bridge.cjs"
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
            print(f"Erro no motor do Node: {result.stderr}")
            return []

        return json.loads(result.stdout.strip())

    except Exception as e:
        print(f"Erro crítico ao interpretar o repo.js com Node: {e}")
        return []

def main():
    channels = load_repo_js()
    
    if not channels:
        print("Aviso: Nenhum canal foi processado. Lista não gerada.")
        return

    lines = [f'#EXTM3U x-tvg-url="{EPG_GLOBAL},{EPG_LOCAL}"\n']
    
    for c in channels:
        nome = c['nome']
        tvg_id = c.get('tvg_id', nome)
        logo = c.get('logo', '')
        cat = c.get('categoria', 'Diversos')
        provedor = c.get('provedor', 'api')
        url_site = c.get('url', '')
        
        worker_endpoint = f"{BASE_WORKER_URL}/{nome.replace(' ', '%20')}"
        
        if provedor == 'site' and url_site:
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome}" tvg-logo="{logo}" group-title="{cat}", {nome}\n')
            lines.append(f"{worker_endpoint}|Referer={url_site}\n")
        else:
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome}" tvg-logo="{logo}" group-title="{cat}", {nome}\n')
            lines.append(f"{worker_endpoint}|User-Agent=okhttp/4.9.2\n")
    
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    print(f"Sucesso! {len(channels)} canais exportados perfeitamente para {OUTPUT_PATH}")

if __name__ == "__main__":
    main()
    