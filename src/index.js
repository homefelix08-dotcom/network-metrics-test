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
    // HEALTH CHECK INTELIGENTE (Retorna Estados)
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return "MORTO";
      try {
        const urlPura = link.split('|')[0];

        // Bypass para IP direto (Bypass de Firewall)
        const ipPattern = /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
        if (ipPattern.test(urlPura)) {
          return "VIVO"; 
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 segundos tolerantes

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

        if (res.status === 200) return "VIVO";
        if (res.status === 404) return "404"; // Identifica canal fora do ar de verdade
        return "MORTO";

      } catch (e) {
        // Se deu timeout ou erro de rede, há forte indício de Bloqueio de ASN da Cloudflare
        return "TIMEOUT_OU_BLOQUEIO";
      }
    };

    // ==========================================
    // MOTOR DA API (COM ÚLTIMO RECURSO INTELIGENTE)
    // ==========================================
    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      try {
        const controllerAPI = new AbortController();
        const idAPI = setTimeout(() => controllerAPI.abort(), 10000); // 10 segundos seguros para a API

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
            
            let temSuspeito = false;

            const testarEmParalelo = async (fontes) => {
              if (!fontes || fontes.length === 0) return null;
              try {
                return await Promise.any(fontes.map(async (fonte) => {
                  const resultado = await testarLinkVivo(fonte.link);
                  if (resultado === "VIVO") return fonte.link;
                  
                  if (resultado === "TIMEOUT_OU_BLOQUEIO") {
                    temSuspeito = true; // Alerta que o link pode estar vivo, mas barrou a Cloudflare
                  }
                  throw new Error("Não serve");
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

            // 2. Fallback interno de CDNs válidas
            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const linkValidoVencedor = await testarEmParalelo(fontesValidas);
            if (linkValidoVencedor) return linkValidoVencedor;

            // ==========================================================
            // 🚨 O NOVO "PASSO 3 INTELIGENTE" (ÚLTIMO RECURSO)
            // ==========================================================
            // Se nenhum link retornou 200 OK limpo para a Cloudflare, avaliamos as exceções:
            
            // Caso A: O canal NÃO possui alternativa no site (exclusivo da API, como o Futura).
            // Retornamos o primeiro link da API cegamente, pois é a única chance da TV abrir.
            if (!config.url || config.provedor_fixo) {
              return canalApi.sources[0].link;
            }

            // Caso B: Os testes deram Timeout/Bloqueio (Suspeita de Bloqueio de Datacenter).
            // Se a API está online entregando dados, mas a CDN barrou o Worker, entregamos
            // o link original para a TV tentar rodar com o IP residencial.
            if (temSuspeito) {
              return canalApi.sources[0].link;
            }

            // Caso C: Todos os links retornaram 404 explícito. 
            // Retorna nulo para ativar com segurança o Fallback do Site!
            return null;
          }
        }
      } catch (e) {
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