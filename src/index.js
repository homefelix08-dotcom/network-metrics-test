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
    // HEALTH CHECK ADAPTADO PARA XTREAM CODES
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const res = await fetch(urlPura, {
          method: 'GET',
          headers: {
            'User-Agent': 'okhttp/4.9.2',
            'Accept': '*/*'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.ok && res.body) {
          res.body.cancel();
        }

        return res.status === 200;

      } catch (e) {
        return false;
      }
    };

    // ==========================================
    // MOTOR DA API (BLINDADO CONTRA TIMEOUT E FALSOS POSITIVOS)
    // ==========================================
    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      try {
        // 1. Proteção contra o "Loading Infinito" da API
        const controllerAPI = new AbortController();
        // Se a API não entregar o JSON em 3.5 segundos, aborta tudo!
        const idAPI = setTimeout(() => controllerAPI.abort(), 3500);

        const apiRes = await fetch(`https://explouddev.com.br/api/canais/todos?search=${encodeURIComponent(nomeBusca)}`, {
          headers: { 'User-Agent': 'okhttp/4.9.2' },
          cf: { cacheTtl: 300 },
          signal: controllerAPI.signal // Liga o cronômetro aqui
        });

        clearTimeout(idAPI); // Sucesso, desliga o cronômetro

        if (apiRes.ok) {
          const apiData = await apiRes.json();
          let canalApi = apiData.find(c => c.name.toLowerCase() === nomeBusca.toLowerCase()) ||
            apiData.find(c => c.name.toLowerCase().includes(nomeBusca.toLowerCase()));

          if (canalApi && canalApi.sources?.length > 0) {

            const testarEmParalelo = async (fontes) => {
              if (!fontes || fontes.length === 0) return null;
              try {
                return await Promise.any(fontes.map(async (fonte) => {
                  const vivo = await testarLinkVivo(fonte.link);
                  if (vivo) return fonte.link;
                  throw new Error("Morto");
                }));
              } catch (e) {
                return null;
              }
            };

            // 1. Testa com filtro
            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              const linkFiltradoVencedor = await testarEmParalelo(fontesFiltradas);
              if (linkFiltradoVencedor) return linkFiltradoVencedor;
            }

            // 2. Fallback interno
            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const linkValidoVencedor = await testarEmParalelo(fontesValidas);
            if (linkValidoVencedor) return linkValidoVencedor;

            // 🚨 REMOVIDO O "PASSO 3" DE CONFIANÇA CEGA.
            // Se testamos e ninguém sobreviveu, retornamos nulo IMEDIATAMENTE.
            return null;
          }
        }
      } catch (e) {
        // Se der timeout na API (AbortError) ou qualquer erro de rede
        return null;
      }

      return null;
    };

    // ==========================================
    // MOTOR DO SITE (Sem Health Check, confia no scraper)
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
        // Tenta a API primeiro com a validação rigorosa
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API";
        }
        // A API falhou! Aciona o Fallback para o Site
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
            "X-Debug-Origem": traceOrigem // Aqui você pode checar de onde o Worker puxou o sinal!
          }
        });
      }

      // ÚLTIMO RECURSO: Tenta o backup se tudo explodir
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
}