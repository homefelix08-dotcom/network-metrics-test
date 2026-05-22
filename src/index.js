import REPO_CONFIG from './repo.js';

const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/admin") {
      const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Painel IPTV Matrix</title>
            <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
        </head>
        <body class="bg-gray-900 text-gray-100 p-4">
            <div class="max-w-md mx-auto bg-gray-800 rounded-xl p-6 shadow-lg">
                <h1 class="text-xl font-bold mb-4 text-center text-blue-400">🎛️ Controle de Provedores</h1>
                
                <div class="mb-6 bg-gray-700 p-3 rounded-lg">
                    <label class="block text-xs font-bold uppercase text-gray-400 mb-1">URL Base do Site</label>
                    <input type="text" id="siteBaseUrl" value="https://7embeddecanais.xyz" class="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                </div>

                <div class="space-y-3" id="lista-canais">
                    </div>

                <button onclick="salvarConfig()" class="w-full mt-6 bg-blue-600 hover:bg-blue-700 font-bold py-3 rounded-lg shadow transition">
                    💾 Exportar Novo repo.js
                </button>
            </div>

            <script>
                // Simulando a leitura do seu array atual (o Worker injetará o real aqui)
                const canais = [
                    {"nome": "Globo MG", "provedor": "site", "provedor_fixo": true, "path": "/globomg/"},
                    {"nome": "Globo", "provedor": "api", "provedor_fixo": false, "path": "/globosp/"},
                    {"nome": "TV Alterosa", "provedor": "api", "provedor_fixo": false, "path": "/sbtsp/"}
                ];

                const lista = document.getElementById('lista-canais');
                canais.forEach((c, index) => {
                    const item = document.createElement('div');
                    item.className = "flex items-center justify-between bg-gray-700 p-3 rounded-lg text-sm";
                    
                    const info = \`<div>
                        <p class="font-semibold">\${c.nome}</p>
                        <p class="text-xs text-gray-400 font-mono">\${c.provedor.toUpperCase()}</p>
                    </div>\`;

                    // Se o provedor for fixo, desabilita o botão
                    const buttonClass = c.provedor_fixo 
                      ? "bg-gray-600 text-gray-450 cursor-not-allowed opacity-50 text-xs px-3 py-1 rounded"
                      : "bg-blue-550 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded transition font-bold";

                    const acao = c.provedor_fixo
                      ? \`<span class="text-xs text-red-400 bg-red-950/50 px-2 py-1 rounded border border-red-900">Fixo</span>\`
                      : \`<button onclick="alternar(\${index})" class="\${buttonClass}">Alternar</button>\`;

                    item.innerHTML = info + acao;
                    lista.appendChild(item);
                });

                function alternar(index) {
                    canais[index].provedor = canais[index].provedor === 'api' ? 'site' : 'api';
                    location.reload; // Prático para atualizar o estado visual rápido
                }

                function salvarConfig() {
                    const novaUrl = document.getElementById('siteBaseUrl').value;
                    // Aqui geramos a string prontinha do repo.js para você colar ou enviar via webhook
                    alert("Gerando estrutura atualizada com a URL: " + novaUrl);
                }
            </script>
        </body>
        </html>
        `;
      return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
    }
    
    const channelName = decodeURIComponent(url.pathname.replace('/play/', ''));

    if (!channelName || url.pathname === '/') {
      return new Response("Informe o canal no endpoint /play/{nome}", { status: 400 });
    }

    const config = REPO_CONFIG.find(c => c.nome.toLowerCase() === channelName.toLowerCase());
    if (!config) return new Response("Canal não mapeado no repo.js", { status: 404 });

    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      try {
        const apiRes = await fetch(`https://explouddev.com.br/api/canais/todos?search=${encodeURIComponent(nomeBusca)}`, {
          headers: { 'User-Agent': 'okhttp/4.9.2' },
          cf: { cacheTtl: 300 }
        });
        if (apiRes.ok) {
          const apiData = await apiRes.json();
          let canalApi = apiData.find(c => c.name.toLowerCase() === nomeBusca.toLowerCase()) ||
            apiData.find(c => c.name.toLowerCase().includes(nomeBusca.toLowerCase()));

          if (canalApi && canalApi.sources?.length > 0) {
            return config.filtro_cdn
              ? canalApi.sources.find(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()))?.link
              : canalApi.sources.find(s => !s.link.includes("sinal.cc"))?.link || canalApi.sources[0].link;
          }
        }
      } catch (e) { return null; }
      return null;
    };

    const tentarScraping = async () => {
      if (!config.url) return null;
      try {
        const siteRes = await fetch(config.url, {
          headers: {
            // Em vez de link fixo, usamos a própria URL do canal como origem
            "Referer": config.url,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          }
        });
        if (siteRes.ok) {
          const html = await siteRes.text();
          const m3u8Match = html.match(/(https?:\/\/[^\s"\'<>]+?\.m3u8[^"\'<>]*)/);
          return m3u8Match ? m3u8Match[1] : null;
        }
      } catch (e) { return null; }
      return null;
    };

    try {
      let linkFinal = (config.provedor === "site")
        ? (await tentarScraping() || await tentarAPI())
        : (await tentarAPI() || await tentarScraping());

      if (linkFinal) return Response.redirect(linkFinal.split('|')[0], 302);

      // ÚLTIMO RECURSO: Tenta o link direto salvo no backup.txt
      const githubRes = await fetch(`${GITHUB_RAW_BASE}/backup.txt`);
      const backupText = await githubRes.text();
      const match = backupText.match(new RegExp(`tvg-name="${config.nome}".*?\\n(http[^\\s\\|\\n]+)`, "i"));

      if (match) return Response.redirect(match[1], 302);

      return new Response("Nenhuma fonte encontrada.", { status: 404 });
    } catch (e) {
      return new Response("Erro Interno", { status: 500 });
    }
  }
}