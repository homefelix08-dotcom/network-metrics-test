import REPO_CONFIG from './repo.js';

const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const channelName = decodeURIComponent(url.pathname.replace('/play/', ''));
    
    // Captura a intenção da sua Grade IPTV (site ou api)
    const rotaForcada = url.searchParams.get('rota');

    if (!channelName || url.pathname === '/') {
      return new Response("Informe o canal no endpoint /play/{nome}", { status: 400 });
    }

    console.log(`\n========================================`);
    console.log(`[🚀 INIT] Canal: ${channelName.toUpperCase()} | Rota Solicitada: ${rotaForcada ? rotaForcada.toUpperCase() : 'PADRÃO'}`);

    const config = REPO_CONFIG.find(c => c.nome.toLowerCase() === channelName.toLowerCase());
    if (!config) {
      console.log(`[❌ ERRO] Canal '${channelName}' não encontrado no repo.js`);
      return new Response("Canal não mapeado no repo.js", { status: 404 });
    }

    // ==========================================
    // MOTOR DO SITE (EXTRAÇÃO CEGA)
    // ==========================================
    const tentarScraping = async () => {
      if (!config.url) {
        console.log(`[🕷️ SCRAPER] Ignorado. Nenhuma URL de site configurada.`);
        return null;
      }
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) {
        console.log(`[🕷️ SCRAPER] URL direta detectada. Retornando cegamente.`);
        return config.url;
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
              console.log(`[✅ SCRAPER] Link extraído do domínio ${urlTentativa}. Confiando cegamente!`);
              return m3u8Match[1];
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
    // MOTOR DA API (TESTE DE IP + FALLBACK CEGO)
    // ==========================================
    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      console.log(`[⚙️ API] Buscando '${nomeBusca}' na Exploud...`);

      // Validador Ultrarrápido (Tráfego zero, apenas cabeçalhos)
      const testarIpDireto = async (url) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          
          const res = await fetch(url, {
            method: 'HEAD',
            headers: { 'User-Agent': 'TiviMate/4.7.0 (Linux; Android 11)' },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          // 🚨 CORREÇÃO AQUI: O status 403 agora é consagrado como SUCESSO e IP VIVO!
          if (res.ok || res.status === 403) {
            console.log(`[✅ IP VIVO] Status ${res.status}: ${url.substring(0, 40)}...`);
            return url;
          }
          throw new Error(`Status HTTP ${res.status}`);
        } catch (e) {
          console.log(`[❌ IP MORTO] Falha no HEAD para ${url.substring(0, 30)}... Erro: ${e.message}`);
          throw e;
        }
      };

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
            console.log(`[⚙️ API] Encontradas ${canalApi.sources.length} fontes.`);

            const fontesIP = canalApi.sources.filter(s => /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(s.link));
            const fontesCDN = canalApi.sources.filter(s => !/^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(s.link) && !s.link.includes("sinal.cc"));

            // 1. Prioridade Máxima: Validação de IPs Diretos
            if (fontesIP.length > 0) {
              console.log(`[⚙️ API] Detectados ${fontesIP.length} IPs. Disparando pings HEAD simultâneos...`);
              try {
                const ipVencedor = await Promise.any(fontesIP.map(fonte => testarIpDireto(fonte.link)));
                if (ipVencedor) {
                  console.log(`[🏆 VENCEDOR API] IP validado e aprovado!`);
                  return ipVencedor;
                }
              } catch (e) {
                console.log(`[⚠️ API] Todos os IPs falharam no teste. Acionando fallback para CDN...`);
              }
            }

            // 2. Fallback Cego (CDN)
            console.log(`[🔄 EXTRAÇÃO CEGA] Buscando a melhor CDN disponível...`);
            
            if (config.filtro_cdn) {
              const filtrada = canalApi.sources.find(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              if (filtrada) {
                console.log(`[🏆 VENCEDOR API] Retornando CDN filtrada.`);
                return filtrada.link;
              }
            }
            if (fontesCDN.length > 0) {
               console.log(`[🏆 VENCEDOR API] Retornando CDN padrão limpa.`);
               return fontesCDN[0].link;
            }
            
            return canalApi.sources[0].link;

          } else {
            console.log(`[⚠️ ALERTA] Canal não encontrado no JSON.`);
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
    // FLUXO DE REDUNDÂNCIA MESTRE (COM INTERRUPTOR MANUAL)
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      // Lê o controle remoto (TV pediu Site ou a configuração dita que é apenas Site)
      if (rotaForcada === 'site' || (config.provedor === 'site' && !rotaForcada)) {
        console.log(`[🚦 ROTA] Interruptor virado para o SITE.`);
        linkFinal = await tentarScraping();
        traceOrigem = "SITE PRINCIPAL";
        
        // Redundância passiva: Se o site sumiu do mapa, tenta a API.
        if (!linkFinal && !config.provedor_fixo) {
          console.log(`[🔄 FALLBACK CRUZADO] Site evaporou da internet. Tentando API...`);
          linkFinal = await tentarAPI();
          traceOrigem = "API (Salva-Vidas do Site)";
        }
      } 
      // Lê o controle remoto (TV pediu API ou não há instrução)
      else {
        console.log(`[🚦 ROTA] Interruptor virado para a API.`);
        linkFinal = await tentarAPI();
        traceOrigem = "API PRINCIPAL";
        
        if (!linkFinal && !config.provedor_fixo && config.url) {
          console.log(`[🔄 FALLBACK CRUZADO] API falhou internamente. Tentando Site...`);
          linkFinal = await tentarScraping();
          traceOrigem = "SITE (Salva-Vidas da API)";
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

      console.log(`[💀 FIM DA LINHA] Nenhuma rota disponível.`);
      return new Response("Nenhuma fonte online encontrada no momento.", { status: 404 });
    } catch (e) {
      console.log(`[💥 CRASH INTERNO] Erro fatal no script: ${e.message}`);
      return new Response("Erro Interno", { status: 500 });
    }
  }
}