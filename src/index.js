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
    // HEALTH CHECK (A REGRA DE OURO DO 403)
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];
        console.log(`\n[DEBUG] 🔍 INICIANDO TESTE PARA: ${urlPura}`);

        // Bypass de segurança para IPs diretos
        if (/^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(urlPura)) {
          return true;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

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

        console.log(`[DEBUG] 📡 Status HTTP: ${res.status} ${res.statusText}`);

        if (res.ok && res.body) {
          res.body.cancel();
        }

        // A SUA DESCOBERTA:
        // 200/206 = Sucesso limpo.
        // 403 = Sucesso sujo. O WAF bloqueou o ping do Worker, mas provou que o vídeo EXISTE! A TV vai rodar.
        return res.status === 200 || res.status === 206 || res.status === 403;

      } catch (e) {
        console.log(`[DEBUG] 🚨 Falha de Rede ou Timeout.`);
        return false;
      }
    };

    // ==========================================
    // MOTOR DA API
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
        if (linkFinal) traceOrigem = "SITE FORCADO";
      } else {
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API PRINCIPAL";
        }
        else if (!config.provedor_fixo && config.url) {
          linkFinal = await tentarScraping();
          if (linkFinal) traceOrigem = "SITE (Fallback Automatico)"; // Acento removido para evitar TypeError
        }
      }

      // MONTAGEM DA MINI-PLAYLIST PARA A TV (Resolve o ParserException e o Referer)
      if (linkFinal) {
        let urlPura = linkFinal.split('|')[0];
        let miniPlaylist = `#EXTM3U\n`;

        // Preserva o Referer se o link vier do site
        if (traceOrigem.includes("SITE") && config.url) {
          miniPlaylist += `#EXTVLCOPT:http-referrer=${config.url}\n`;
          urlPura = `${urlPura}|Referer=${config.url}`;
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