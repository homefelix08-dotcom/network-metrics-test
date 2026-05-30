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
    // HEALTH CHECK (COM RAIO-X / CONSOLE LOG)
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];
        console.log(`\n[DEBUG] 🔍 INICIANDO TESTE PARA: ${urlPura}`);

        // Bypass de segurança para IPs diretos
        // if (/^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(urlPura)) {
        //   console.log(`[DEBUG] ⚠️ Bypass de IP ativado. Teste ignorado para: ${urlPura}`);
        //   return true;
        // }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        // Dispara o GET com Range para podermos ler o corpo com segurança
        const res = await fetch(urlPura, {
          method: 'GET',
          headers: {
            'User-Agent': 'okhttp/4.9.2',
            'Accept': '*/*',
            'Range': 'bytes=0-500' // Essencial para o debug ler o texto sem travar
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // LOG 1: STATUS HTTP
        console.log(`[DEBUG] 📡 Status HTTP: ${res.status} ${res.statusText}`);

        // LOG 2: CABEÇALHOS DA RESPOSTA (Ajuda a ver se é bloqueio da Cloudflare)
        const headersObj = {};
        res.headers.forEach((value, key) => { headersObj[key] = value; });
        console.log(`[DEBUG] 📋 Headers Retornados:`, JSON.stringify(headersObj));

        // LOG 3: CORPO DA RESPOSTA (A Prova Definitiva)
        try {
          const texto = await res.text();
          const preview = texto.substring(0, 150).replace(/\n/g, ' '); // Limpa quebras de linha
          console.log(`[DEBUG] 📦 Payload (Primeiros 150 bytes): ${preview}...`);
        } catch (err) {
          console.log(`[DEBUG] ❌ Erro ao ler o payload: ${err.message}`);
        }

        // 200 OK ou 206 Partial Content (devido ao Range) significam sucesso
        return res.status === 200 || res.status === 206;

      } catch (e) {
        console.log(`[DEBUG] 🚨 Falha de Rede ou Timeout no link: ${link} -> Erro: ${e.message}`);
        return false;
      }
    };

    // ==========================================
    // MOTOR DA API (COM CORRIDA PARALELA)
    // ==========================================
    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      try {
        const controllerAPI = new AbortController();
        const idAPI = setTimeout(() => controllerAPI.abort(), 6000);

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

            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              const linkFiltradoVencedor = await testarEmParalelo(fontesFiltradas);
              if (linkFiltradoVencedor) return linkFiltradoVencedor;
            }

            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const linkValidoVencedor = await testarEmParalelo(fontesValidas);
            if (linkValidoVencedor) return linkValidoVencedor;

            if (!config.url || config.provedor_fixo) {
              return canalApi.sources[0].link;
            }
            
            return null;
          }
        }
      } catch (e) {
        return null;
      }

      return null;
    };

    // ==========================================
    // MOTOR DO SITE (SCRAPING DE BACKUP)
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
    // FLUXO DE REDUNDÂNCIA MESTRE
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      if (config.provedor === "site") {
        linkFinal = await tentarScraping();
        if (linkFinal) traceOrigem = "SITE FORÇADO";
      } else {
        
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API PRINCIPAL";
        }
        else if (!config.provedor_fixo && config.url) {
          linkFinal = await tentarScraping();
          if (linkFinal) traceOrigem = "SITE (Fallback Automático)";
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