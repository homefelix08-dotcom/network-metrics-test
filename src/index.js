import REPO_CONFIG from './repo.js';
import {
  fetchGloboStream,
  fetchBandStream,
  fetchRedeMinasStream,
  fetchRecordStream,
  fetchSbtStream
} from './locais.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ==========================================
    // 1. LISTA M3U DE CANAIS LOCAIS
    // ==========================================
    if (path === '/canais_locais.m3u' || path === '/locais.m3u' || path === '/canais_locais.txt' || path === '/playlist.m3u' || path === '/playlist.m3u8') {
      const host = url.host;
      const scheme = url.protocol;
      const m3u = `#EXTM3U x-tvg-url="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/local_meta.xml"

#EXTINF:-1 tvg-id="Globo MG" tvg-name="Globo MG FHD" tvg-logo="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/globo_mg.png" group-title="Abertos", Globo MG FHD
${scheme}//${host}/play/Globo%20MG|User-Agent=okhttp/4.9.2

#EXTINF:-1 tvg-id="Rede Minas" tvg-name="Rede Minas FHD" tvg-logo="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/rede_minas.png" group-title="Abertos", Rede Minas FHD
${scheme}//${host}/play/Rede%20Minas|User-Agent=okhttp/4.9.2

#EXTINF:-1 tvg-id="Band MG" tvg-name="Band FHD" tvg-logo="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/band.png" group-title="Abertos", Band FHD
${scheme}//${host}/play/Band%20MG|User-Agent=okhttp/4.9.2

#EXTINF:-1 tvg-id="SBT São Paulo" tvg-name="SBT FHD" tvg-logo="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tv_alterosa.png" group-title="Abertos", SBT FHD
${scheme}//${host}/play/SBT|User-Agent=okhttp/4.9.2

#EXTINF:-1 tvg-id="Record MG" tvg-name="Record MG FHD" tvg-logo="https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/record_mg.png" group-title="Abertos", Record MG FHD
${scheme}//${host}/play/Record%20MG|User-Agent=okhttp/4.9.2
`;
      return new Response(m3u, {
        headers: {
          "Content-Type": "application/x-mpegurl; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }

    // ==========================================
    // 2. ATALHOS DIRETOS .M3U8 (COMPATÍVEL HOMELAB)
    // ==========================================
    const forceFresh = url.searchParams.get('force') === '1' || url.searchParams.get('nocache') === '1';

    const redirectWithCache = (targetUrl) => new Response(null, {
      status: 302,
      headers: {
        "Location": targetUrl,
        "Cache-Control": "private, max-age=1800",
        "X-Cache-Version": "v2-cached"
      }
    });

    if (path === '/globo-mg.m3u8') {
      const stream = await fetchGloboStream(env, forceFresh);
      if (stream) return redirectWithCache(stream);
      return new Response("Erro ao obter stream da Globo MG via Worker", { status: 502 });
    }
    if (path === '/band-minas.m3u8') {
      const stream = await fetchBandStream(env, forceFresh);
      if (stream) return redirectWithCache(stream);
      return new Response("Erro ao obter stream da Band Minas via Worker", { status: 502 });
    }
    if (path === '/rede-minas.m3u8') {
      return redirectWithCache(fetchRedeMinasStream(env));
    }
    if (path === '/record-minas.m3u8') {
      const stream = await fetchRecordStream(env, forceFresh);
      if (stream) return redirectWithCache(stream);
      return new Response("Erro ao obter stream da Record Minas via Worker", { status: 502 });
    }
    if (path === '/sbt.m3u8') {
      const stream = fetchSbtStream(env);
      if (stream) return redirectWithCache(stream);
      return new Response("Erro ao obter stream do SBT via Worker", { status: 502 });
    }

    const channelName = decodeURIComponent(url.pathname.replace('/play/', ''));
    const rotaForcada = url.searchParams.get('rota');

    if (!channelName || url.pathname === '/') {
      return new Response("Informe o canal no endpoint /play/{nome}", { status: 400 });
    }

    const channelNorm = channelName.trim().toLowerCase();

    // ==========================================
    // 3. INTERCEPTADOR DOS CANAIS LOCAIS /play/{nome}
    // ==========================================
    if (channelNorm === 'globo mg' || channelNorm === 'globo minas') {
      console.log(`[🏠 CANAL LOCAL] Acionando motor nativo da Globo MG`);
      const stream = await fetchGloboStream(env, forceFresh);
      if (stream) return redirectWithCache(stream);
      return new Response("Erro ao obter stream da Globo MG via Worker (Geobloqueio ou token expirado)", { status: 502 });
    }
    if (channelNorm === 'band mg' || channelNorm === 'band minas') {
      console.log(`[🏠 CANAL LOCAL] Acionando motor nativo da Band Minas (Spalla)`);
      const stream = await fetchBandStream(env, forceFresh);
      if (stream) return redirectWithCache(stream);
      return new Response("Erro ao obter stream da Band Minas via Worker", { status: 502 });
    }
    if (channelNorm === 'rede minas') {
      console.log(`[🏠 CANAL LOCAL] Acionando motor nativo da Rede Minas (ZoeWeb)`);
      return redirectWithCache(fetchRedeMinasStream(env));
    }
    if (channelNorm === 'record mg' || channelNorm === 'record minas') {
      console.log(`[🏠 CANAL LOCAL] Acionando motor nativo da Record Minas (RecordPlus)`);
      const stream = await fetchRecordStream(env, forceFresh);
      if (stream) return redirectWithCache(stream);
      return new Response("Erro ao obter stream da Record Minas via Worker", { status: 502 });
    }
    if (channelNorm === 'sbt' || channelNorm === 'sbt ao vivo' || channelNorm === 'sbt sp' || channelNorm === 'sbt são paulo' || channelNorm === 'sbt sao paulo' || channelNorm === 'sbt nacional') {
      console.log(`[🏠 CANAL LOCAL] Acionando motor nativo do SBT (Streamlock Wowza)`);
      const stream = fetchSbtStream(env);
      if (stream) return redirectWithCache(stream);
      return new Response("Erro ao obter stream do SBT via Worker", { status: 502 });
    }

    console.log(`\n========================================`);
    console.log(`[🚀 INIT] Canal: ${channelName.toUpperCase()} | Rota: ${rotaForcada ? rotaForcada.toUpperCase() : 'PADRÃO'}`);

    const config = REPO_CONFIG.find(c => c.nome.toLowerCase() === channelName.toLowerCase());
    if (!config) {
      console.log(`[❌ ERRO] Canal '${channelName}' não encontrado no repo.js`);
      return new Response("Canal não mapeado no repo.js", { status: 404 });
    }

    // ==========================================
    // MOTOR DO SITE (AGORA É A ROTA "HD")
    // ==========================================
    const tentarScraping = async () => {
      if (!config.url) {
        console.log(`[🕷️ SCRAPER] Ignorado. Nenhuma URL de site configurada.`);
        return null;
      }
      if (config.url.includes("sua.tv") || config.url.endsWith(".m3u8")) {
        console.log(`[🕷️ SCRAPER] URL direta detectada.`);
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
          console.log(`[🔄 ROTAÇÃO] Domínio falhou. Próxima geração: ${urlTentativa}`);
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
              console.log(`[✅ SCRAPER] Link extraído!`);
              return m3u8Match[1];
            }
          }
        } catch (e) {
          console.log(`[🚨 ERRO SCRAPER] Domínio inacessível (${e.message}).`);
        }
      }
      return null;
    };

    // ==========================================
    // MOTOR DA API (FHD = CDN | HD 2 = IP DIRETO)
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
            console.log(`[⚙️ API] Encontradas ${canalApi.sources.length} fontes.`);

            const fontesIP = canalApi.sources.filter(s => /^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(s.link));
            const fontesCDN = canalApi.sources.filter(s => !/^https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(s.link) && !s.link.includes("sinal.cc"));

            // ROTA HD 2: Exige estritamente o IP Direto
            if (rotaForcada === 'api_ip') {
              if (fontesIP.length > 0) {
                console.log(`[🏆 VENCEDOR API] Retornando IP Direto (Rota Backup).`);
                return fontesIP[0].link;
              }
              return null;
            }

            // ROTA FHD: Exige estritamente a CDN (com filtro respeitado)
            if (rotaForcada === 'api_cdn' || !rotaForcada) {
              if (config.filtro_cdn) {
                const filtrada = canalApi.sources.find(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
                if (filtrada) {
                  console.log(`[🏆 VENCEDOR API] Retornando CDN Filtrada (FHD).`);
                  return filtrada.link;
                }
              }
              if (fontesCDN.length > 0) {
                console.log(`[🏆 VENCEDOR API] Retornando CDN Padrão (FHD).`);
                return fontesCDN[0].link;
              }
              // Se não achou CDN limpa, manda a primeira fonte genérica
              return canalApi.sources[0].link;
            }

          }
        }
      } catch (e) {
        console.log(`[🚨 ERRO API] Falha na comunicação: ${e.message}`);
      }
      return null;
    };

    // ==========================================
    // FLUXO DE REDUNDÂNCIA MESTRE
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      if (rotaForcada === 'site' || (config.provedor === 'site' && !rotaForcada)) {
        console.log(`[🚦 ROTA] Acionando SITE (HD).`);
        linkFinal = await tentarScraping();
        traceOrigem = "SITE PRINCIPAL";

        if (!linkFinal && !config.provedor_fixo) {
          console.log(`[🔄 FALLBACK] Site caiu. Tentando CDN da API...`);
          linkFinal = await tentarAPI(); // Tenta puxar a CDN como resgate
          traceOrigem = "API CDN (Salva-Vidas)";
        }
      }
      else if (rotaForcada === 'api_ip') {
        console.log(`[🚦 ROTA] Acionando IP DIRETO (HD 2 / Backup).`);
        linkFinal = await tentarAPI();
        traceOrigem = "API IP DIRETO";
        // Sem fallback aqui. Se o IP falhou na categoria de backup, deu ruim de vez.
      }
      else {
        console.log(`[🚦 ROTA] Acionando API CDN (FHD).`);
        linkFinal = await tentarAPI();
        traceOrigem = "API CDN PRINCIPAL";

        if (!linkFinal && !config.provedor_fixo && config.url) {
          console.log(`[🔄 FALLBACK] CDN falhou. Tentando raspar o Site...`);
          linkFinal = await tentarScraping();
          traceOrigem = "SITE (Salva-Vidas)";
        }
      }

      if (linkFinal) {
        console.log(`[🎯 ROTEAMENTO FINAL] Sucesso! TV vai para: ${traceOrigem}`);
        return new Response(null, {
          status: 302,
          headers: {
            "Location": linkFinal.split('|')[0],
            "X-Debug-Origem": traceOrigem
          }
        });
      }

      return new Response("Nenhuma fonte online encontrada.", { status: 404 });
    } catch (e) {
      return new Response("Erro Interno", { status: 500 });
    }
  }
}
