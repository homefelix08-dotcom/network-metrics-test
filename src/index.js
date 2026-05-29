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
    // HEALTH CHECK: DIFERENCIA 404 DE BLOQUEIO DE CLOUDFLARE
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return "404";
      try {
        const urlPura = link.split('|')[0];

        // Bypass IP direto
        const ipPattern = /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
        if (ipPattern.test(urlPura)) return "200";

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(urlPura, {
          method: 'GET',
          headers: { 'User-Agent': 'okhttp/4.9.2', 'Accept': '*/*' },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.ok && res.body) res.body.cancel();

        if (res.status === 200) return "200";
        if (res.status === 404) return "404"; // A ÚNICA CONDIÇÃO DE MORTE REAL

        // Qualquer outro status (403, 502, etc) é a CDN barrando a Cloudflare
        return "BLOQUEADO";

      } catch (e) {
        // Timeout ou Network Error é a CDN barrando a Cloudflare
        return "BLOQUEADO";
      }
    };

    // ==========================================
    // MOTOR DA API: VISÃO GLOBAL E DELEGAÇÃO CORRETA
    // ==========================================
    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      try {
        const controllerAPI = new AbortController();
        const idAPI = setTimeout(() => controllerAPI.abort(), 8000);

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

            // Função de teste em lote que entende o porquê os links falharam
            const testarLote = async (fontes) => {
              if (!fontes || fontes.length === 0) return { link: null, todos404: true };
              try {
                // Corrida: o primeiro que der 200 OK vence instantaneamente
                const winner = await Promise.any(fontes.map(async (fonte) => {
                  const status = await testarLinkVivo(fonte.link);
                  if (status === "200") return fonte.link;
                  throw new Error(status); // Joga o erro ("404" ou "BLOQUEADO")
                }));
                return { link: winner, todos404: false };

              } catch (aggregateError) {
                // Se caiu aqui, NENHUM link deu 200 OK. Vamos analisar os erros:
                const erros = aggregateError.errors;

                // Se houver algum "BLOQUEADO", a API está viva, mas a Cloudflare foi barrada.
                // O Postman/TV conseguiria abrir. Confiamos na API.
                if (erros.includes("BLOQUEADO")) {
                  return { link: fontes[0].link, todos404: false };
                }

                // Se TODOS os links testados deram explícitamente "404"
                return { link: null, todos404: true };
              }
            };

            // 1. Testa os links do filtro CDN
            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              const resultadoFiltro = await testarLote(fontesFiltradas);
              if (resultadoFiltro.link) return resultadoFiltro.link;
              if (resultadoFiltro.todos404 && !config.provedor_fixo && config.url) return null; // Fallback!
            }

            // 2. Testa os links gerais
            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const resultadoGeral = await testarLote(fontesValidas);

            if (resultadoGeral.link) return resultadoGeral.link;

            // 3. O Veredito
            // Se chegou aqui e todos404 for true, significa que a CDN disse ativamente
            // "esse vídeo não existe mais". Retornamos null para acionar o site.
            if (resultadoGeral.todos404) {
              return null;
            }

            return canalApi.sources[0].link;
          }
        }
      } catch (e) {
        // Se a API global (explouddev) cair inteira (Timeout/502), aciona o site.
        return null;
      }

      return null;
    };

    // ==========================================
    // MOTOR DO SITE
    // ==========================================
    const tentarScraping = async () => {
      if (!config.url) return null;
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) {
        return config.url;
      }

      try {
        const siteRes = await fetch(config.url, {
          headers: {
            "Referer": config.url,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
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
    // FLUXO DE REDUNDÂNCIA E DEBUG
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      if (config.provedor === "site") {
        linkFinal = await tentarScraping();
        if (linkFinal) traceOrigem = "SITE";
      } else {
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API";
        }
        else if (!config.provedor_fixo && config.url) {
          linkFinal = await tentarScraping();
          if (linkFinal) traceOrigem = "SITE (Fallback)";
        }
      }

      if (linkFinal) {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": linkFinal.split('|')[0],
            "X-Debug-Origem": traceOrigem
          }
        });
      }

      const githubRes = await fetch(`${GITHUB_RAW_BASE}/backup.txt`);
      const backupText = await githubRes.text();
      const match = backupText.match(new RegExp(`tvg-name="${config.nome}".*?\\n(http[^\\s\\|\\n]+)`, "i"));

      if (match) {
        return new Response(null, {
          status: 302,
          headers: {
            "Location": match[1],
            "X-Debug-Origem": "GITHUB BACKUP"
          }
        });
      }

      return new Response("Nenhuma fonte online encontrada no momento.", { status: 404 });
    } catch (e) {
      return new Response("Erro Interno", { status: 500 });
    }
  }
};