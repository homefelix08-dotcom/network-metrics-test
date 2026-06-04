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
        url_site = c.get('url', '')
        fixo = c.get('provedor_fixo', True)
        provedor_padrao = c.get('provedor', 'api')
        
        worker_endpoint = f"{BASE_WORKER_URL}/{nome.replace(' ', '%20')}"
        
        # 🚨 MÁGICA AQUI: O cabeçalho agora se adapta à rota exata daquela linha
        def get_cabecalho(rota):
            if rota == "site" and url_site:
                return f"|Referer={url_site}"
            return "|User-Agent=okhttp/4.9.2"
            
        if fixo:
            # Canal Fixo
            sufixo = "FHD" if provedor_padrao == "api" else "UHD"
            nome_display = f"{nome} {sufixo}"
            cabecalho = get_cabecalho(provedor_padrao)
            
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_display}" tvg-logo="{logo}" group-title="{cat}", {nome_display}\n')
            lines.append(f"{worker_endpoint}{cabecalho}\n")
        else:
            # Canal Flexível
            rota_principal = provedor_padrao
            rota_reserva = "site" if provedor_padrao == "api" else "api"
            
            # 1. Primeira Opção
            sufixo_principal = "FHD" if rota_principal == "api" else "UHD"
            nome_principal = f"{nome} {sufixo_principal}"
            cabecalho_principal = get_cabecalho(rota_principal)
            
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_principal}" tvg-logo="{logo}" group-title="{cat}", {nome_principal}\n')
            lines.append(f"{worker_endpoint}?rota={rota_principal}{cabecalho_principal}\n")
            
            # 2. Segunda Opção
            sufixo_reserva = "FHD" if rota_reserva == "api" else "UHD"
            nome_reserva = f"{nome} {sufixo_reserva}"
            cabecalho_reserva = get_cabecalho(rota_reserva)
            
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_reserva}" tvg-logo="{logo}" group-title="{cat}", {nome_reserva}\n')
            lines.append(f"{worker_endpoint}?rota={rota_reserva}{cabecalho_reserva}\n")
    
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    print(f"Sucesso! Grade IPTV clássica gerada em {OUTPUT_PATH}")

if __name__ == "__main__":
    main()