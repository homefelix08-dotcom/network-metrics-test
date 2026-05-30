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
    // HEALTH CHECK (O "TESTE DO POSTMAN" COM GET)
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];

        // BYPASS DE IP REMOVIDO: Todos os links passam pelo teste do GET.

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5s de tolerância máxima

        // Dispara o GET exato do Postman com o Range para ler apenas os cabeçalhos
        const res = await fetch(urlPura, {
          method: 'GET',
          headers: {
            'User-Agent': 'okhttp/4.9.2',
            'Accept': '*/*',
            'Range': 'bytes=0-500'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // O Segredo: Assim que receber a resposta, cancela o corpo (o vídeo em si) 
        // para não desperdiçar banda do Worker nem travar a execução.
        if (res.ok && res.body) {
          res.body.cancel();
        }

        // A REGRA DE OURO ATUALIZADA:
        // 200/206 = Sucesso limpo.
        // 403 = O Firewall da CDN bloqueou o Worker, mas confirmou que o vídeo EXISTE.
        return res.status === 200 || res.status === 206 || res.status === 403;

      } catch (e) {
        // Se der Timeout ou falha de rede (ex: servidor desligado, 404 real)
        return false;
      }
    };

    // ==========================================
    // MOTOR DA API (COM CORRIDA PARALELA)
    // ==========================================
    const tentarAPI = async () => {
      const nomeBusca = config.nome_api || config.nome;
      try {
        // Trava de segurança: Se a Exploud ficar infinita, o Worker aborta em 6s
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

            // Testador em Lote Assíncrono
            const testarEmParalelo = async (fontes) => {
              if (!fontes || fontes.length === 0) return null;
              try {
                // Promise.any devolve o PRIMEIRO link que passar no testarLinkVivo (true)
                return await Promise.any(fontes.map(async (fonte) => {
                  const vivo = await testarLinkVivo(fonte.link);
                  if (vivo) return fonte.link;
                  throw new Error("Morto"); 
                }));
              } catch (e) {
                // Se cair no catch, significa que TODOS os links testados falharam no GET
                return null; 
              }
            };

            // 1. Testa os links da CDN preferida primeiro
            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              const linkFiltradoVencedor = await testarEmParalelo(fontesFiltradas);
              if (linkFiltradoVencedor) return linkFiltradoVencedor;
            }

            // 2. Fallback interno da API: Testa outras CDNs (removendo sinal.cc)
            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const linkValidoVencedor = await testarEmParalelo(fontesValidas);
            if (linkValidoVencedor) return linkValidoVencedor;

            // Se os testes garantiram que não tem link vivo, NÃO retorna cegamente.
            // Retornamos nulo para que o fluxo mestre acione o site de backup.
            // A exceção é se o canal for exclusivo da API (sem site cadastrado).
            if (!config.url || config.provedor_fixo) {
              return canalApi.sources[0].link;
            }
            
            return null;
          }
        }
      } catch (e) {
        // API da Exploud fora do ar (erro 500 ou Timeout)
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
        if (linkFinal) traceOrigem = "SITE FORCADO"; // Acento removido
      } else {
        
        // Passo 1: Busca e testa de forma rigorosa os links da API
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API PRINCIPAL";
        }
        // Passo 2: Fallback Automático ativado se a API estiver fora do ar ou todos os links derem erro
        else if (!config.provedor_fixo && config.url) {
          linkFinal = await tentarScraping();
          if (linkFinal) traceOrigem = "SITE (Fallback Automatico)"; // Acento removido
        }
      }

      // 🚨 GERAÇÃO DA MINI-PLAYLIST (Resolve o ParserException)
      if (linkFinal) {
        let urlPura = linkFinal.split('|')[0];
        let miniPlaylist = `#EXTM3U\n`;

        // Se o link veio do site, injetamos o Referer via tag oficial do VLC.
        // A URL pura PERMANECE pura. Nada de |Referer= misturado nela.
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

      // Passo 3: Salvação estática do GitHub se o site também falhar
      const githubRes = await fetch(`${GITHUB_RAW_BASE}/backup.txt`);
      const backupText = await githubRes.text();
      const match = backupText.match(new RegExp(`tvg-name="${config.nome}".*?\\n(http[^\\s\\|\\n]+)`, "i"));

      if (match) {
        const playlistBackup = `#EXTM3U\n#EXTINF:-1,${config.nome}\n${match[1]}`;
        return new Response(playlistBackup, {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.apple.mpegurl",
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