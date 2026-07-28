import subprocess
import json
import os
import urllib.request
import urllib.parse

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
    
    # Gaveta temporária para guardar os canais de backup e jogar pro final
    backup_lines = []
    
    cached_referer_base = None
    
    for c in channels:
        nome = c['nome']
        tvg_id = c.get('tvg_id', nome)
        logo = c.get('logo', '')
        cat = c.get('categoria', 'Diversos')
        url_site = c.get('url', '')
        fixo = c.get('provedor_fixo', True)
        provedor_padrao = c.get('provedor', 'api')
        tem_ip_direto = c.get('tem_ip_direto', False)
        
        worker_endpoint = f"{BASE_WORKER_URL}/{nome.replace(' ', '%20')}"
        
        def get_cabecalho(rota):
            nonlocal cached_referer_base
            if rota == "site" and url_site:
                if "canal=" in url_site:
                    canal_id = url_site.split("canal=", 1)[1]
                    if not cached_referer_base:
                        try:
                            # Faz a requisição para obter a URL redirecionada apenas uma vez
                            req = urllib.request.Request(url_site, headers={'User-Agent': 'Mozilla/5.0'})
                            with urllib.request.urlopen(req, timeout=10) as response:
                                final_url = response.geturl()
                                final_parsed = urllib.parse.urlparse(final_url)
                                orig_parsed = urllib.parse.urlparse(url_site)
                                cached_referer_base = orig_parsed._replace(netloc=final_parsed.netloc).geturl().split("canal=", 1)[0] + "canal="
                        except Exception as e:
                            print(f"Aviso: Não foi possível resolver o redirecionamento de {url_site}: {e}")
                            cached_referer_base = url_site.split("canal=", 1)[0] + "canal="
                    return f"|Referer={cached_referer_base}{canal_id}"
                return f"|Referer={url_site}"
            return "|User-Agent=okhttp/4.9.2"
            
        # Nomenclaturas Clássicas Mapeadas
        nome_fhd = f"{nome} FHD"
        nome_hd = f"{nome} HD"
        nome_hd2 = f"{nome} HD 2"

        # Categoria Isolada para os IPs de baixa qualidade (quando flexíveis)
        cat_backup = "Backup"

        if fixo:
            if provedor_padrao == "site":
                # Fixo no Site (Apenas FHD)
                lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_fhd}" tvg-logo="{logo}" group-title="{cat}", {nome_fhd}\n')
                lines.append(f"{worker_endpoint}?rota=site{get_cabecalho('site')}\n")
            else:
                if tem_ip_direto:
                    # 🚨 NOVO: Fixo na API com IP Direto -> As duas opções ficam na categoria principal!
                    lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_fhd}" tvg-logo="{logo}" group-title="{cat}", {nome_fhd}\n')
                    lines.append(f"{worker_endpoint}?rota=api_cdn{get_cabecalho('api')}\n")
                    
                    lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_hd}" tvg-logo="{logo}" group-title="{cat}", {nome_hd}\n')
                    lines.append(f"{worker_endpoint}?rota=api_ip{get_cabecalho('api')}\n")
                else:
                    # Fixo na API, Rota Única (Apenas FHD)
                    lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_fhd}" tvg-logo="{logo}" group-title="{cat}", {nome_fhd}\n')
                    lines.append(f"{worker_endpoint}?rota=api_cdn{get_cabecalho('api')}\n")
        else:
            # Canal Flexível (Tem Site + API CDN)
            
            # 1. Rota da API CDN (FHD - Principal)
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_fhd}" tvg-logo="{logo}" group-title="{cat}", {nome_fhd}\n')
            lines.append(f"{worker_endpoint}?rota=api_cdn{get_cabecalho('api')}\n")
            
            # 2. Rota do Site (HD - Segunda Opção na mesma categoria)
            lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_hd}" tvg-logo="{logo}" group-title="{cat}", {nome_hd}\n')
            lines.append(f"{worker_endpoint}?rota=site{get_cabecalho('site')}\n")

            if tem_ip_direto:
                # 3. Rota API IP Direto (HD 2 - Escondido na gaveta de Backup)
                backup_lines.append(f'#EXTINF:-1 tvg-id="{tvg_id}" tvg-name="{nome_hd2}" tvg-logo="{logo}" group-title="{cat_backup}", {nome_hd2}\n')
                backup_lines.append(f"{worker_endpoint}?rota=api_ip{get_cabecalho('api')}\n")
    
    # Descarrega a gaveta de backup no final do arquivo
    lines.extend(backup_lines)

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.writelines(lines)
        
    print(f"Sucesso! Grade gerada e hierarquizada (em {OUTPUT_PATH})")

if __name__ == "__main__":
    main()