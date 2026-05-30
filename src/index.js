import REPO_CONFIG from './repo.js';

const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const channelName = decodeURIComponent(url.pathname.replace('/play/', ''));

    if (!channelName || url.pathname === '/') {
      return new Response("Informe o canal no endpoint /play/{nome}", { status: 400 });
    }

    const config = REPO_CONFIG.find(c => c.nome.toLowerCase() === channelName.toLowerCase());
    if (!config) return new Response("Canal não mapeado no repo.js", { status: 404 });

    // ==========================================
    // 1. BUSCA FONTES DA API (Saca até 3 links rápidos)
    // ==========================================
    const buscarLinksAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      try {
        const controllerAPI = new AbortController();
        const idAPI = setTimeout(() => controllerAPI.abort(), 4000); // 4s máximo para não travar o zapping

        const apiRes = await fetch(`https://explouddev.com.br/api/canais/todos?search=${encodeURIComponent(nomeBusca)}`, {
          headers: { 'User-Agent': 'okhttp/4.9.2' },
          cf: { cacheTtl: 300 },
          signal: controllerAPI.signal
        });
        
        clearTimeout(idAPI);

        if (apiRes.ok) {
          const apiData = await apiRes.json();
          let canalApi = apiData.find(c => c.name.toLowerCase() === nomeBusca.toLowerCase()) ||
                         apiData.find(c => c.name.toLowerCase().includes(nomeBusca.toLowerCase()));

          if (canalApi && canalApi.sources?.length > 0) {
            // Pega até 3 fontes válidas (ignorando o lixo do sinal.cc) para a TV testar
            return canalApi.sources
              .filter(s => !s.link.includes("sinal.cc"))
              .slice(0, 3)
              .map(s => s.link.split('|')[0]); 
          }
        }
      } catch (e) { 
        // Se a API estiver 100% morta (Timeout/500), retorna array vazio
        return []; 
      }
      return [];
    };

    // ==========================================
    // 2. BUSCA O LINK DO SITE (Pneu de Estepe)
    // ==========================================
    const buscarLinkSite = async () => {
      if (!config.url) return null;
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) return config.url; 
      try {
        const siteRes = await fetch(config.url, {
          headers: { "Referer": config.url, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });
        if (siteRes.ok) {
          const html = await siteRes.text();
          const m3u8Match = html.match(/(https?:\/\/[^\s"\'<>]+?\.m3u8[^"\'<>]*)/);
          return m3u8Match ? m3u8Match[1] : null;
        }
      } catch (e) { return null; }
      return null;
    };

    // ==========================================
    // 3. MONTAGEM DA MASTER PLAYLIST E DELEGAÇÃO PRA TV
    // ==========================================
    try {
      // Dispara as duas procuras ao mesmo tempo para o Worker responder em milissegundos
      const [linksApi, linkSite] = await Promise.all([
        config.provedor === "site" ? Promise.resolve([]) : buscarLinksAPI(),
        (!config.provedor_fixo && config.url) ? buscarLinkSite() : Promise.resolve(null)
      ]);

      let playlist = "#EXTM3U\n";
      let bandwidth = 5000000; // Começa com banda alta para forçar a prioridade
      let adicionouAlgo = false;

      // Coloca os links da API no topo (Prioridade Máxima)
      if (linksApi && linksApi.length > 0) {
        linksApi.forEach(link => {
          playlist += `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=${bandwidth}\n${link}\n`;
          bandwidth -= 1000000; // Diminui a banda para a TV entender a hierarquia
          adicionouAlgo = true;
        });
      }

      // Coloca o link do Site por último (Prioridade Mínima / Fallback)
      if (linkSite) {
        const urlSiteLimpa = linkSite.split('|')[0];
        playlist += `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1000000\n${urlSiteLimpa}\n`;
        adicionouAlgo = true;
      }

      // Se achamos qualquer link (API ou Site), devolvemos o arquivo 200 OK
      if (adicionouAlgo) {
        return new Response(playlist, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "X-Debug-Origem": "PLAYLIST MULTIPLA (DELEGADO PRA TV)",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // 4. Último recurso (Salvação do arquivo estático)
      const githubRes = await fetch(`${GITHUB_RAW_BASE}/backup.txt`);
      const backupText = await githubRes.text();
      const match = backupText.match(new RegExp(`tvg-name="${config.nome}".*?\\n(http[^\\s\\|\\n]+)`, "i"));

      if (match) {
        return Response.redirect(match[1], 302);
      }

      return new Response("Nenhuma fonte online encontrada no momento.", { status: 404 });
    } catch (e) {
      return new Response("Erro Interno", { status: 500 });
    }
  }
}