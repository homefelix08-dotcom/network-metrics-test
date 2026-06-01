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
    // MOTOR DO SITE (COM ROTAÇÃO AUTOMÁTICA DE DOMÍNIO)
    // ==========================================
    const tentarScraping = async () => {
      if (!config.url) {
        console.log(`[🕷️ SCRAPER] Ignorado. Nenhuma URL configurada.`);
        return null;
      }
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) {
        console.log(`[🕷️ SCRAPER] URL direta detectada. Validando integridade...`);
        const vivo = await testarLinkVivo(config.url);
        return vivo ? config.url : null;
      }

      // 🚨 MÁGICA DA ROTAÇÃO: Extrai o número do domínio atual
      const matchDominio = config.url.match(/https:\/\/(\d+)embeddecanais/);
      const numeroBase = matchDominio ? parseInt(matchDominio[1]) : null;

      // Se for o embeddecanais, ele ganha o direito a 3 tentativas (o atual + 2 gerações futuras)
      const tentativasMaximas = numeroBase ? 3 : 1;

      for (let i = 0; i < tentativasMaximas; i++) {
        let urlTentativa = config.url;

        // Se falhou na tentativa anterior (i > 0), incrementa o número e atualiza a URL
        if (numeroBase && i > 0) {
          const novoNumero = numeroBase + i;
          urlTentativa = config.url.replace(`https://${numeroBase}embed`, `https://${novoNumero}embed`);
          console.log(`[🔄 ROTAÇÃO] Domínio falhou. Caçando próxima geração: ${urlTentativa}`);
        } else {
          console.log(`[🕷️ SCRAPER] Iniciando raspagem em: ${urlTentativa}`);
        }

        try {
          // Trava de tempo de 3 segundos para não segurar a TV se o domínio estiver morto
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
              console.log(`[✅ SCRAPER] Link extraído do domínio ${urlTentativa}. Validando com spoofing...`);

              const videoEstaVivo = await testarLinkVivo(linkScrapado, urlTentativa);
              if (videoEstaVivo) {
                console.log(`[🏆 VENCEDOR SITE] O link interno está online e blindado!`);
                return linkScrapado;
              } else {
                console.log(`[❌ SCRAPER] Link do vídeo quebrado dentro do site. Abortando rotação.`);
                return null; // A "xerox" está quebrada. Interrompe as buscas.
              }
            } else {
              console.log(`[❌ SCRAPER] Nenhum link .m3u8 encontrado no HTML. Abortando rotação.`);
              return null;
            }
          } else {
            console.log(`[❌ SCRAPER] Site retornou HTTP ${siteRes.status}. Tentando próximo...`);
            // Falha de servidor (ex: 502 Bad Gateway). O laço 'for' continua e testa o próximo número!
          }
        } catch (e) {
          console.log(`[🚨 ERRO SCRAPER] Domínio inacessível (${e.message}). Tentando próximo...`);
          // Falha de DNS ou Timeout. O laço 'for' continua e tenta o próximo número!
        }
      } // Fim do loop de rotação

      console.log(`[💀 SCRAPER] Todas as gerações de domínio esgotadas.`);
      return null;
    };

    // ==========================================
    // MOTOR DO SITE (AGORA É A PRIORIDADE MÁXIMA)
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
            console.log(`[✅ SCRAPER] Link .m3u8 extraído. Validando com spoofing...`);

            const videoEstaVivo = await testarLinkVivo(linkScrapado, config.url);
            if (videoEstaVivo) {
              console.log(`[🏆 VENCEDOR SITE] O link interno do site está online e aprovado.`);
              return linkScrapado;
            } else {
              console.log(`[❌ SCRAPER] Link do vídeo lá dentro retornou erro no ping.`);
              return null;
            }
          } else {
            console.log(`[❌ SCRAPER] Nenhum link .m3u8 encontrado no HTML.`);
          }
        } else {
          console.log(`[❌ SCRAPER] Site retornou HTTP ${siteRes.status}`);
        }
      } catch (e) {
        console.log(`[🚨 ERRO SCRAPER] Falha ao acessar o site: ${e.message}`);
        return null;
      }
      return null;
    };

    // ==========================================
    // MOTOR DA API (AGORA É O FALLBACK CEGO)
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
            console.log(`[⚙️ API] Encontradas ${canalApi.sources.length} fontes. Retornando primeira válida sem testar...`);

            // Filtro de CDN
            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              if (fontesFiltradas.length > 0) {
                console.log(`[🏆 VENCEDOR API] Link filtrado cego aprovado!`);
                return fontesFiltradas[0].link;
              }
            }

            // Fallback interno da API
            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc"));
            if (fontesValidas.length > 0) {
              console.log(`[🏆 VENCEDOR API] Link padrão cego aprovado!`);
              return fontesValidas[0].link;
            }

            // Se sobrar só lixo, manda o primeiro mesmo
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
    // FLUXO DE REDUNDÂNCIA INVERTIDO
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      console.log(`[🚦 ROTA] Tentando SITE como prioridade (com validação)...`);
      linkFinal = await tentarScraping();

      if (linkFinal) {
        traceOrigem = "SITE PRINCIPAL";
      } else {
        console.log(`[🔄 FALLBACK] Site falhou ou canal não possui url. Tentando API às cegas...`);
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API (Fallback Cego)";
        }
      }

      if (linkFinal) {
        console.log(`[🎯 ROTEAMENTO FINAL] Sucesso! Mandando TV para: ${traceOrigem}`);

        // Retorno Intacto: 302 Redirect Exato
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