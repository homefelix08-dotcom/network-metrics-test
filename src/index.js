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

    let linkReservaAPI = null;

    // ==========================================
    // HEALTH CHECK (SPOOFING DE CABEÇALHOS - TIVIMATE)
    // ==========================================
    const testarLinkVivo = async (link, referer = null) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];
        console.log(`[🔍 TESTE SPOOFING] Pingando: ${urlPura.substring(0, 50)}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // 🚨 SPOOFING: Clona os cabeçalhos reais da sua requisição e injeta a identidade do TiviMate
        const newHeaders = new Headers(request.headers);
        newHeaders.set('User-Agent', 'TiviMate/4.7.0 (Linux; Android 11)');
        newHeaders.set('Accept', '*/*');
        newHeaders.set('Range', 'bytes=0-500'); // Trava de segurança obrigatória para o Worker não baixar o vídeo

        if (referer) {
          newHeaders.set('Referer', referer);
        }

        const res = await fetch(urlPura, {
          method: 'GET',
          headers: newHeaders,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (res.ok && res.body) {
          res.body.cancel();
        }

        // Confiamos cegamente no que o servidor responder para a nossa falsificação
        const isVivo = res.status === 200 || res.status === 206 || res.status === 403;
        console.log(`[📡 STATUS] HTTP ${res.status} -> ${isVivo ? '✅ APROVADO' : '❌ DESCARTADO'} (${urlPura.substring(0, 40)}...)`);

        return isVivo;

      } catch (e) {
        console.log(`[🚨 TIMEOUT/FALHA] Teste falhou. Erro: ${e.message}`);
        return false;
      }
    };

    // ==========================================
    // MOTOR DA API
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
            
            linkReservaAPI = canalApi.sources[0].link;
            console.log(`[⚙️ API] Encontradas ${canalApi.sources.length} fontes. Iniciando testes de Spoofing...`);

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
              if (fontesFiltradas.length > 0) console.log(`[⚙️ API] Aplicando filtro de CDN: ${config.filtro_cdn}`);

              const linkFiltradoVencedor = await testarEmParalelo(fontesFiltradas);
              if (linkFiltradoVencedor) {
                console.log(`[🏆 VENCEDOR API] Link filtrado aprovado!`);
                return linkFiltradoVencedor;
              }
            }

            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const linkValidoVencedor = await testarEmParalelo(fontesValidas);
            if (linkValidoVencedor) {
              console.log(`[🏆 VENCEDOR API] Link padrão aprovado!`);
              return linkValidoVencedor;
            }

            console.log(`[⚠️ ALERTA] Mesmo com Spoofing, o servidor bloqueou ou deu 404 em todos os links.`);
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
    // MOTOR DO SITE 
    // ==========================================
    const tentarScraping = async () => {
      if (!config.url) {
        console.log(`[🕷️ SCRAPER] Ignorado. Nenhuma URL configurada.`);
        return null;
      }
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) {
        console.log(`[🕷️ SCRAPER] URL direta detectada. Retornando.`);
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
            const linkScrapado = m3u8Match[1];
            console.log(`[✅ SCRAPER] Link .m3u8 extraído. Validando integridade...`);
            
            const videoEstaVivo = await testarLinkVivo(linkScrapado, config.url);
            
            if (videoEstaVivo) {
              console.log(`[🏆 VENCEDOR SITE] O link interno do site está online.`);
              return linkScrapado;
            } else {
              console.log(`[❌ SCRAPER] Link do vídeo lá dentro está quebrado.`);
              return null;
            }
          } else {
            console.log(`[❌ SCRAPER] Nenhum link .m3u8 encontrado.`);
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
    // FLUXO DE REDUNDÂNCIA MESTRE
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      if (config.provedor === "site") {
        console.log(`[🚦 ROTA] Canal forçado a usar o SITE.`);
        linkFinal = await tentarScraping();
        if (linkFinal) traceOrigem = "SITE";
      } else {
        console.log(`[🚦 ROTA] Tentando API Principal com Spoofing...`);
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API";
        }
        else if (!config.provedor_fixo && config.url) {
          console.log(`[🔄 FALLBACK] Spoofing falhou. Acionando pneu de estepe (SITE)...`);
          linkFinal = await tentarScraping();
          if (linkFinal) traceOrigem = "SITE (Fallback)";
        }
      }

      if (!linkFinal && linkReservaAPI) {
        console.log(`[⚠️ APOCALIPSE] Site caiu e spoofing falhou. Tirando API do bolso às cegas!`);
        linkFinal = linkReservaAPI;
        traceOrigem = "API (Bolso / As Cegas)";
      }

      if (linkFinal) {
        console.log(`[🎯 ROTEAMENTO FINAL] Sucesso! Mandando TV para: ${traceOrigem}`);
        
        let urlPura = linkFinal.split('|')[0];
        let miniPlaylist = `#EXTM3U\n`;

        if (traceOrigem.includes("SITE") && config.url) {
          miniPlaylist += `#EXTVLCOPT:http-referrer=${config.url}\n`;
        }

        miniPlaylist += `#EXTINF:-1,${config.nome}\n${urlPura}`;

        return new Response(miniPlaylist, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "X-Debug-Origem": traceOrigem,
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      console.log(`[🆘 EMERGÊNCIA] Tentando buscar backup no GitHub...`);
      const githubRes = await fetch(`${GITHUB_RAW_BASE}/backup.txt`);
      const backupText = await githubRes.text();
      const match = backupText.match(new RegExp(`tvg-name="${config.nome}".*?\\n(http[^\\s\\|\\n]+)`, "i"));

      if (match) {
        console.log(`[🛡️ BACKUP] Link estático encontrado no GitHub!`);
        
        const playlistBackup = `#EXTM3U\n#EXTINF:-1,${config.nome}\n${match[1]}`;
        return new Response(playlistBackup, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
            "X-Debug-Origem": "GITHUB BACKUP"
          }
        });
      }

      console.log(`[💀 FIM DA LINHA] Nenhum link vivo encontrado.`);
      return new Response("Nenhuma fonte online encontrada no momento.", { status: 404 });
    } catch (e) {
      console.log(`[💥 CRASH INTERNO] Erro fatal no script: ${e.message}`);
      return new Response("Erro Interno", { status: 500 });
    }
  }
}