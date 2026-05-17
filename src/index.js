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