import REPO_CONFIG from './repo.js';

const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const channelName = decodeURIComponent(url.pathname.replace('/play/', ''));

    if (!channelName || url.pathname === '/') {
      return new Response("Informe o canal no endpoint /play/{nome}", { status: 400 });
    }

    console.log(`\n========================================`);
    console.log(`[🚀 INIT] Requisição recebida para o canal: ${channelName.toUpperCase()}`);

    const config = REPO_CONFIG.find(c => c.nome.toLowerCase() === channelName.toLowerCase());
    if (!config) {
      console.log(`[❌ ERRO] Canal '${channelName}' não encontrado no repo.js`);
      return new Response("Canal não mapeado no repo.js", { status: 404 });
    }

    // ==========================================
    // HEALTH CHECK ADAPTADO PARA XTREAM CODES
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];
        console.log(`[🔍 TESTE] Pingando: ${urlPura.substring(0, 50)}...`);

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

        const isVivo = res.status === 200 || res.status === 206 || res.status === 403;
        console.log(`[📡 STATUS] HTTP ${res.status} -> ${isVivo ? '✅ APROVADO' : '❌ DESCARTADO'} (${urlPura.substring(0, 40)}...)`);

        return isVivo;

      } catch (e) {
        console.log(`[🚨 TIMEOUT/FALHA] Teste falhou para o link: ${link.substring(0, 40)}... Erro: ${e.message}`);
        return false;
      }
    };

    // ==========================================
    // MOTOR DA API (BLINDADO CONTRA TIMEOUT E FALSOS POSITIVOS)
    // ==========================================
    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      console.log(`[⚙️ API] Buscando '${nomeBusca}' na Exploud...`);
      
      try {
        const controllerAPI = new AbortController();
        const idAPI = setTimeout(() => controllerAPI.abort(), 3500);

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
            console.log(`[⚙️ API] Encontradas ${canalApi.sources.length} fontes. Iniciando testes paralelos...`);

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
              if (fontesFiltradas.length > 0) console.log(`[⚙️ API] Aplicando filtro de CDN: ${config.filtro_cdn}`);
              
              const linkFiltradoVencedor = await testarEmParalelo(fontesFiltradas);
              if (linkFiltradoVencedor) {
                console.log(`[🏆 VENCEDOR API] Link filtrado aprovado!`);
                return linkFiltradoVencedor;
              }
            }

            // 2. Fallback interno
            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const linkValidoVencedor = await testarEmParalelo(fontesValidas);
            if (linkValidoVencedor) {
              console.log(`[🏆 VENCEDOR API] Link padrão aprovado!`);
              return linkValidoVencedor;
            }

            console.log(`[⚠️ ALERTA] Todos os links da API testados estão mortos.`);
            return null;
          } else {
             console.log(`[⚠️ ALERTA] Canal não encontrado no JSON da API.`);
          }
        } else {
           console.log(`[🚨 ERRO API] Exploud retornou HTTP ${apiRes.status}`);
        }
      } catch (e) {
        console.log(`[🚨 ERRO API] Falha na comunicação com a Exploud: ${e.message}`);
        return null;
      }

      return null;
    };

    // ==========================================
    // MOTOR DO SITE (Sem Health Check, confia no scraper)
    // ==========================================
    const tentarScraping = async () => {
      if (!config.url) {
        console.log(`[🕷️ SCRAPER] Ignorado. Nenhuma URL de site configurada.`);
        return null;
      }
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) {
        console.log(`[🕷️ SCRAPER] URL direta detectada. Retornando imediatamente.`);
        return config.url;
      }

      console.log(`[🕷️ SCRAPER] Iniciando raspagem em: ${config.url}`);
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
          if (m3u8Match) {
            console.log(`[✅ SCRAPER] Link .m3u8 extraído com sucesso!`);
            return m3u8Match[1];
          } else {
            console.log(`[❌ SCRAPER] Nenhum link .m3u8 encontrado no HTML.`);
          }
        } else {
           console.log(`[❌ SCRAPER] Site retornou HTTP ${siteRes.status}`);
        }
      } catch (e) { 
        console.log(`[🚨 ERRO SCRAPER] Falha ao tentar acessar o site: ${e.message}`);
        return null; 
      }
      return null;
    };

    // ==========================================
    // FLUXO DE REDUNDÂNCIA E DEBUG
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      if (config.provedor === "site") {
        console.log(`[🚦 ROTA] Canal forçado a usar o SITE.`);
        linkFinal = await tentarScraping();
        if (linkFinal) traceOrigem = "SITE";
      } else {
        console.log(`[🚦 ROTA] Tentando API Principal...`);
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API";
        }
        else if (!config.provedor_fixo && config.url) {
          console.log(`[🔄 FALLBACK] API falhou. Acionando pneu de estepe (SITE)...`);
          linkFinal = await tentarScraping();
          if (linkFinal) traceOrigem = "SITE (Fallback)";
        }
      }

      if (linkFinal) {
        console.log(`[🎯 ROTEAMENTO FINAL] Sucesso! Mandando TV para: ${traceOrigem}`);
        return new Response(null, {
          status: 302,
          headers: {
            "Location": linkFinal.split('|')[0],
            "X-Debug-Origem": traceOrigem 
          }
        });
      }

      console.log(`[🆘 EMERGÊNCIA] Tudo falhou. Tentando buscar backup no GitHub...`);
      const githubRes = await fetch(`${GITHUB_RAW_BASE}/backup.txt`);
      const backupText = await githubRes.text();
      const match = backupText.match(new RegExp(`tvg-name="${config.nome}".*?\\n(http[^\\s\\|\\n]+)`, "i"));

      if (match) {
        console.log(`[🛡️ BACKUP] Link estático encontrado no GitHub!`);
        return new Response(null, {
          status: 302,
          headers: {
            "Location": match[1],
            "X-Debug-Origem": "GITHUB BACKUP"
          }
        });
      }

      console.log(`[💀 FIM DA LINHA] Nenhum link vivo encontrado para o canal.`);
      return new Response("Nenhuma fonte online encontrada no momento.", { status: 404 });
    } catch (e) {
      console.log(`[💥 CRASH INTERNO] Erro fatal no script: ${e.message}`);
      return new Response("Erro Interno", { status: 500 });
    }
  }
}