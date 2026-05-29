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

    // Variáveis espiãs para descobrir onde a Cloudflare está sendo barrada
    let debugInfo = {
      apiFetch: "NÃO_CHAMADO",
      pingStatus: "NÃO_CHAMADO"
    };

    // ==========================================
    // HEALTH CHECK
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return "404";
      try {
        const urlPura = link.split('|')[0];
        if (/^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(urlPura)) return "200";

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(urlPura, {
          method: 'GET',
          headers: { 'User-Agent': 'okhttp/4.9.2', 'Accept': '*/*' },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (res.ok && res.body) res.body.cancel();

        debugInfo.pingStatus = res.status.toString(); // Registra o HTTP Code da CDN

        if (res.status === 200) return "200";
        if (res.status === 404) return "404";
        return "BLOQUEADO";

      } catch (e) {
        debugInfo.pingStatus = "ERRO_DE_REDE_OU_TIMEOUT"; // Registra se a CDN cortou a linha
        return "BLOQUEADO";
      }
    };

    // ==========================================
    // MOTOR DA API
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
        debugInfo.apiFetch = apiRes.status.toString(); // Registra o HTTP Code do JSON da API

        if (apiRes.ok) {
          const apiData = await apiRes.json();
          let canalApi = apiData.find(c => c.name.toLowerCase() === nomeBusca.toLowerCase()) ||
                         apiData.find(c => c.name.toLowerCase().includes(nomeBusca.toLowerCase()));

          if (canalApi && canalApi.sources?.length > 0) {
            const testarLote = async (fontes) => {
              if (!fontes || fontes.length === 0) return { link: null, todos404: true };
              try {
                const winner = await Promise.any(fontes.map(async (fonte) => {
                  const status = await testarLinkVivo(fonte.link);
                  if (status === "200") return fonte.link;
                  throw new Error(status); 
                }));
                return { link: winner, todos404: false };
              } catch (aggregateError) {
                const erros = aggregateError.errors.map(e => e.message);
                if (erros.includes("BLOQUEADO")) return { link: fontes[0].link, todos404: false };
                return { link: null, todos404: true };
              }
            };

            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              const resultadoFiltro = await testarLote(fontesFiltradas);
              if (resultadoFiltro.link) return resultadoFiltro.link;
              if (resultadoFiltro.todos404 && !config.provedor_fixo && config.url) return null; 
            }

            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const resultadoGeral = await testarLote(fontesValidas);
            
            if (resultadoGeral.link) return resultadoGeral.link;
            if (resultadoGeral.todos404) return null;
            
            return canalApi.sources[0].link;
          }
        }
      } catch (e) {
        debugInfo.apiFetch = "ERRO_DE_REDE_OU_TIMEOUT"; // Registra se a Exploud derrubou a Cloudflare
        return null;
      }
      return null;
    };

    // ==========================================
    // MOTOR DO SITE E FLUXO PRINCIPAL
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

    try {
      let linkFinal = null;
      let traceOrigem = "";

      if (config.provedor === "site") {
        linkFinal = await tentarScraping();
        if (linkFinal) traceOrigem = "SITE";
      } else {
        linkFinal = await tentarAPI();
        if (linkFinal) traceOrigem = "API";
        else if (!config.provedor_fixo && config.url) {
          linkFinal = await tentarScraping();
          if (linkFinal) traceOrigem = "SITE (Fallback)";
        }
      }

      const responseHeaders = {
        "X-Debug-Origem": traceOrigem,
        "X-Debug-API-Fetch": debugInfo.apiFetch,
        "X-Debug-Ping-Status": debugInfo.pingStatus
      };

      if (linkFinal) {
        responseHeaders["Location"] = linkFinal.split('|')[0];
        return new Response(null, { status: 302, headers: responseHeaders });
      }

      const githubRes = await fetch(`${GITHUB_RAW_BASE}/backup.txt`);
      const backupText = await githubRes.text();
      const match = backupText.match(new RegExp(`tvg-name="${config.nome}".*?\\n(http[^\\s\\|\\n]+)`, "i"));

      if (match) {
        responseHeaders["Location"] = match[1];
        responseHeaders["X-Debug-Origem"] = "GITHUB BACKUP";
        return new Response(null, { status: 302, headers: responseHeaders });
      }

      // Se deu 404, devolve os espiões no corpo da resposta para conseguirmos ler
      return new Response(`Nenhuma fonte online. Logs:\nAPI JSON: ${debugInfo.apiFetch}\nPing CDN: ${debugInfo.pingStatus}`, { 
        status: 404, 
        headers: responseHeaders 
      });

    } catch (e) {
      return new Response("Erro Interno", { status: 500 });
    }
  }
}