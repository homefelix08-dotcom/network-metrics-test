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
    // HEALTH CHECK (Apenas para fontes da API)
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];
        const res = await fetch(urlPura, {
          method: 'HEAD',
          headers: { 'User-Agent': 'okhttp/4.9.2' },
          cf: { timeout: 2500 } // Desiste rápido da CDN em 2.5s
        });
        return res.status === 200 || res.status === 206;
      } catch (e) {
        return false;
      }
    };

    // ==========================================
    // MOTOR DA API (Itera e testa os links)
    // ==========================================
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
            // 1. Testa os links que batem com o filtro_cdn
            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              for (const fonte of fontesFiltradas) {
                if (await testarLinkVivo(fonte.link)) return fonte.link;
              }
            }

            // 2. Se não achou/falhou no filtro, tenta as outras fontes (ignorando sinal.cc)
            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc"));
            for (const fonte of fontesValidas) {
              if (await testarLinkVivo(fonte.link)) return fonte.link;
            }

            // 3. Último recurso da API
            if (canalApi.sources.length > 0 && await testarLinkVivo(canalApi.sources[0].link)) {
              return canalApi.sources[0].link;
            }
          }
        }
      } catch (e) { return null; }
      return null;
    };

    // ==========================================
    // MOTOR DO SITE (Extração Direta, sem Health Check)
    // ==========================================
    const tentarScraping = async () => {
      if (!config.url) return null;

      // Bypass: Se for um link direto m3u8 ou sua.tv, entrega na hora sem tentar ler HTML
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) {
        return config.url;
      }

      try {
        const siteRes = await fetch(config.url, {
          headers: {
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

    // ==========================================
    // FLUXO DE REDUNDÂNCIA (A REGRA DE OURO)
    // ==========================================
    try {
      let linkFinal = null;

      if (config.provedor === "site") {
        // Regra 1: Se é do site, extrai e manda direto. Sem ping, sem fallback pra API.
        linkFinal = await tentarScraping();
      } else {
        // Regra 2: Se é da API, tenta a API (com pings de vida).
        linkFinal = await tentarAPI();

        // Regra 3: Se a API falhar completamente, faz o fallback pro Site
        // APENAS se o canal não for fixo e possuir uma URL válida para o site.
        if (!linkFinal && !config.provedor_fixo && config.url) {
          linkFinal = await tentarScraping();
        }
      }

      // Entrega o stream
      if (linkFinal) return Response.redirect(linkFinal.split('|')[0], 302);

      // ÚLTIMO RECURSO: Tenta o link salvo no backup.txt (também entregue sem ping)
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