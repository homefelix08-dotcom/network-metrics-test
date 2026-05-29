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
    // HEALTH CHECK (COM BYPASS DE RANGE REQUEST)
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return "404";
      try {
        const urlPura = link.split('|')[0];
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(urlPura, {
          method: 'GET',
          headers: { 
            'User-Agent': 'okhttp/4.9.2', 
            'Accept': '*/*',
            // A MÁGICA ACONTECE AQUI: Pede só um fragmento do arquivo para burlar o WAF
            'Range': 'bytes=0-100' 
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.ok && res.body) res.body.cancel();

        // 206 Partial Content é a resposta de sucesso quando usamos o Range
        if (res.status === 200 || res.status === 206) return "200";
        if (res.status === 404) return "404"; 
        
        return "BLOQUEADO";

      } catch (e) {
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
                
                // Se algum teste caiu no falso 404 do WAF mesmo com o truque do Range,
                // entregamos cegamente o link para a TV tentar rodar com o IP residencial.
                if (erros.includes("BLOQUEADO")) return { link: fontes[0].link, todos404: false };
                
                // TODOS os links deram um 404 genuíno. Aciona o Site!
                return { link: null, todos404: true };
              }
            };

            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              const resultadoFiltro = await testarLote(fontesFiltradas);
              if (resultadoFiltro.link) return resultadoFiltro.link;
            }

            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const resultadoGeral = await testarLote(fontesValidas);
            
            if (resultadoGeral.link) return resultadoGeral.link;

            // Se o veredito for a morte total, retorna nulo.
            if (resultadoGeral.todos404) return null;

            return canalApi.sources[0].link;
          }
        }
      } catch (e) {
        return null;
      }
      return null;
    };

    // ==========================================
    // MOTOR DO SITE E SCRAPING
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
    // FLUXO DE ROTEAMENTO (O CÉREBRO)
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      if (config.provedor === "site") {
        linkFinal = await tentarScraping();
        if (linkFinal) traceOrigem = "SITE FORÇADO";
      } else {
        
        // 1. Tenta extrair da fonte soberana e pingar os links
        linkFinal = await tentarAPI();
        
        if (linkFinal) {
          traceOrigem = "API PRINCIPAL";
        } 
        // 2. O canal na API morreu (404 real) ou não existe. Ativa o estepe!
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
}