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
    // MOTOR DA API (APENAS EXTRAI OS DADOS)
    // ==========================================
    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      try {
        const controllerAPI = new AbortController();
        const idAPI = setTimeout(() => controllerAPI.abort(), 6000); // 6s para a API responder

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
            if (config.filtro_cdn) {
              const linkFiltrado = canalApi.sources.find(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              if (linkFiltrado) return linkFiltrado.link;
            }
            const fonteValida = canalApi.sources.find(s => !s.link.includes("sinal.cc"));
            if (fonteValida) return fonteValida.link;
            return canalApi.sources[0].link;
          }
        }
      } catch (e) { return null; }
      return null;
    };

    // ==========================================
    // MOTOR DO SITE (APENAS EXTRAI OS DADOS)
    // ==========================================
    const tentarScraping = async () => {
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
    // FLUXO MESTRE: REDUNDÂNCIA HLS NATIVA
    // ==========================================
    try {
      if (config.provedor === "site") {
        const linkSiteForcado = await tentarScraping();
        if (linkSiteForcado) {
          return Response.redirect(linkSiteForcado.split('|')[0], 302);
        }
      }

      // Faz a busca na API e no Site AO MESMO TEMPO para ganhar velocidade
      const [linkApi, linkSite] = await Promise.all([
        tentarAPI(),
        (!config.provedor_fixo && config.url) ? tentarScraping() : Promise.resolve(null)
      ]);

      const urlApiLimpa = linkApi ? linkApi.split('|')[0] + "QUEBRADO" : null;
      const urlSiteLimpa = linkSite ? linkSite.split('|')[0] : null;

      // CENÁRIO 1: Temos as duas fontes. Devolvemos a Master Playlist para a TV decidir.
      if (urlApiLimpa && urlSiteLimpa) {
        const masterPlaylist = `#EXTM3U
        #EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=2500000
        ${urlApiLimpa}
        #EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=1500000
        ${urlSiteLimpa}`;

        return new Response(masterPlaylist, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "X-Debug-Origem": "API + SITE (TV Fallback)",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      // CENÁRIO 2: Só a API respondeu (Ex: Futura)
      if (urlApiLimpa) {
        return Response.redirect(urlApiLimpa, 302);
      }

      // CENÁRIO 3: A API caiu de verdade, sobrou o Site
      if (urlSiteLimpa) {
        return Response.redirect(urlSiteLimpa, 302);
      }

      // CENÁRIO 4: Tudo explodiu, busca o backup estático no Github
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