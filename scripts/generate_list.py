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
        print(f"Erro crítico ao interpretar repo.js: {e}")
        return []

def main():
    channels = load_repo_js()
    if not channels:
        return

    lines = [f'#EXTM3U x-tvg-url="{EPG_GLOBAL},{EPG_LOCAL}"\n']
    
    for c in channels:
        nome = c['nome']
        tvg_id = c.get('tvg_id', nome)
        logo = c.get('logo', '')
        cat = c.get('categoria', 'Diversos')
        url_site = c.get('url', '')
        fixo = c.get('provedor_fixo', True)
        provedor_padrao = c.get('provedor', 'api')
        
        worker_endpoint = f"{BASE_WORKER_URL}/{nome.replace(' ', '%20')}"
        
        def get_cabecalho(rota):
            if rota == "site" and url_site:
                return f"|Referer={url_site}"
            return "|User-Agent=okhttp/4.9.2"
            
        # Nomenclaturas Clássicas Mapeadas
        nome_site = f"{nome} FHD"
        nome_api = f"{nome} HD"

        if fixo:
            if provedor_padrao == "site":
                # Fixo no Site (Apenas FHD)
                lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_site}" tvg-logo="{logo}" group-title="{cat}", {nome_site}\n')
                lines.append(f"{worker_endpoint}?rota=site{get_cabecalho('site')}\n")
            else:
                # Fixo na API (Apenas HD)
                lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_api}" tvg-logo="{logo}" group-title="{cat}", {nome_api}\n')
                lines.append(f"{worker_endpoint}?rota=api{get_cabecalho('api')}\n")
        else:
            # Canal Flexível (Tem Site + API)
            # ORDEM FORÇADA AQUI: FHD -> HD
            
            # 1. Rota do Site (FHD)
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_site}" tvg-logo="{logo}" group-title="{cat}", {nome_site}\n')
            lines.append(f"{worker_endpoint}?rota=site{get_cabecalho('site')}\n")

            # 2. Rota da API (HD - O Worker se vira para achar IP ou CDN)
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_api}" tvg-logo="{logo}" group-title="{cat}", {nome_api}\n')
            lines.append(f"{worker_endpoint}?rota=api{get_cabecalho('api')}\n")
    
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    print(f"Sucesso! Grade IPTV limpa (FHD e HD) gerada em {OUTPUT_PATH}")

if __name__ == "__main__":
    main()