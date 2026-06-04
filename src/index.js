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
    // HEALTH CHECK (COM VALIDAÇÃO DE CONTEÚDO M3U8)
    // ==========================================
    const testarLinkVivo = async (link, referer = null) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];
        console.log(`[🔍 TESTE SPOOFING] Pingando: ${urlPura.substring(0, 50)}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const newHeaders = new Headers(request.headers);
        newHeaders.set('User-Agent', 'TiviMate/4.7.0 (Linux; Android 11)');
        newHeaders.set('Accept', '*/*');

        // 🚨 REMOVIDA A TRAVA DE RANGE (bytes=0-500). 
        // Vamos baixar o texto do .m3u8 inteiro para auditar o conteúdo.

        if (referer) {
          newHeaders.set('Referer', referer);
        }

        const res = await fetch(urlPura, {
          method: 'GET',
          headers: newHeaders,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // O 403 ainda é a nossa prova de vida para IPs Diretos da API
        if (res.status === 403) {
          console.log(`[📡 STATUS] HTTP 403 -> ✅ APROVADO (IP Direto Xtream Codes)`);
          return true;
        }

        // Se o servidor disse que deu certo (200 ou 206), vamos investigar o que ele entregou
        if (res.ok || res.status === 206) {
          const texto = await res.text();

          // Se for uma playlist de vídeo real, a tag #EXTM3U é obrigatória
          if (texto.includes('#EXTM3U')) {
            console.log(`[📡 STATUS] HTTP ${res.status} + Playlist Válida -> ✅ APROVADO`);
            return true;
          } else {
            console.log(`[📡 STATUS] HTTP ${res.status} MAS sem tag #EXTM3U (Falso Positivo HTML) -> ❌ DESCARTADO`);
            return false;
          }
        }

        console.log(`[📡 STATUS] HTTP ${res.status} -> ❌ DESCARTADO`);
        return false;

      } catch (e) {
        console.log(`[🚨 TIMEOUT/FALHA] Teste falhou para o link: ${link.substring(0, 40)}... Erro: ${e.message}`);
        return false;
      }
    };

    // ==========================================
    // MOTOR DO SITE (PRIORIDADE MÁXIMA)
    // ==========================================
    const tentarScraping = async () => {
      if (!config.url) {
        console.log(`[🕷️ SCRAPER] Ignorado. Nenhuma URL de site configurada.`);
        return null;
      }
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) {
        console.log(`[🕷️ SCRAPER] URL direta detectada. Validando integridade...`);
        const vivo = await testarLinkVivo(config.url);
        return vivo ? config.url : null;
      }

      const matchDominio = config.url.match(/https:\/\/(\d+)embeddecanais/);
      const numeroBase = matchDominio ? parseInt(matchDominio[1]) : null;
      const tentativasMaximas = numeroBase ? 3 : 1;

      for (let i = 0; i < tentativasMaximas; i++) {
        let urlTentativa = config.url;

        if (numeroBase && i > 0) {
          const novoNumero = numeroBase + i;
          urlTentativa = config.url.replace(`https://${numeroBase}embed`, `https://${novoNumero}embed`);
          console.log(`[🔄 ROTAÇÃO] Domínio falhou. Caçando próxima geração: ${urlTentativa}`);
        } else {
          console.log(`[🕷️ SCRAPER] Iniciando raspagem em: ${urlTentativa}`);
        }

        try {
          const controllerScraper = new AbortController();
          const idScraper = setTimeout(() => controllerScraper.abort(), 3000);

          const siteRes = await fetch(urlTentativa, {
            headers: {
              "Referer": urlTentativa,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            signal: controllerScraper.signal
          });

          clearTimeout(idScraper);

          if (siteRes.ok) {
            const html = await siteRes.text();
            const m3u8Match = html.match(/(https?:\/\/[^\s"\'<>]+?\.m3u8[^"\'<>]*)/);

            if (m3u8Match) {
              const linkScrapado = m3u8Match[1];
              console.log(`[✅ SCRAPER] Link extraído do domínio ${urlTentativa}. Validando com ping...`);

              const videoEstaVivo = await testarLinkVivo(linkScrapado, urlTentativa);
              if (videoEstaVivo) {
                console.log(`[🏆 VENCEDOR SITE] O link interno está online e blindado!`);
                return linkScrapado;
              } else {
                console.log(`[❌ SCRAPER] Link do vídeo quebrado dentro do site. Abortando rotação.`);
                return null;
              }
            } else {
              console.log(`[❌ SCRAPER] Nenhum link .m3u8 encontrado no HTML. Abortando rotação.`);
              return null;
            }
          } else {
            console.log(`[❌ SCRAPER] Site retornou HTTP ${siteRes.status}. Tentando próximo...`);
          }
        } catch (e) {
          console.log(`[🚨 ERRO SCRAPER] Domínio inacessível (${e.message}). Tentando próximo...`);
        }
      }

      console.log(`[💀 SCRAPER] Todas as gerações de domínio esgotadas.`);
      return null;
    };

    // ==========================================
    // MOTOR DA API (FALLBACK INTELIGENTE -> CEGO)
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
            console.log(`[⚙️ API] Encontradas ${canalApi.sources.length} fontes. Buscando IPs Reais...`);

            // 1. A CAÇADA PELO IP DIRETO (Prioridade Absoluta na API)
            const fontesIP = canalApi.sources.filter(s => /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(s.link));

            if (fontesIP.length > 0) {
              console.log(`[⚙️ API] Detectadas ${fontesIP.length} fontes de IP Direto. Iniciando validação...`);

              // Testa os IPs encontrados simultaneamente para achar o mais rápido
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

              const ipVencedor = await testarEmParalelo(fontesIP);
              if (ipVencedor) {
                console.log(`[🏆 VENCEDOR API] Link de IP Direto testado e aprovado!`);
                return ipVencedor;
              }
              console.log(`[⚠️ API] Links de IP Direto falharam no teste. Acionando fallback cego...`);
            }

            // 2. O FALLBACK CEGO (Se não houver IPs ou se todos falharem)
            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              if (fontesFiltradas.length > 0) {
                console.log(`[🏆 VENCEDOR API] Link filtrado cego aprovado!`);
                return fontesFiltradas[0].link;
              }
            }

            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc"));
            if (fontesValidas.length > 0) {
              console.log(`[🏆 VENCEDOR API] Link padrão cego aprovado!`);
              return fontesValidas[0].link;
            }

            return canalApi.sources[0].link;
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
    // FLUXO DE REDUNDÂNCIA MESTRE
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      console.log(`[🚦 ROTA] Tentando SITE como prioridade (com validação)...`);
      linkFinal = await tentarScraping();

      if (linkFinal) {
        traceOrigem = "SITE PRINCIPAL";
      } else {
        console.log(`[🔄 FALLBACK] Site falhou ou canal sem url. Tentando API...`);
        linkFinal = await tentarAPI();

        if (linkFinal) {
          // Identifica se a API venceu pelo IP validado ou pelo Cego para o Log
          traceOrigem = /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(linkFinal)
            ? "API (IP Direto Verificado)"
            : "API (Fallback Cego)";
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