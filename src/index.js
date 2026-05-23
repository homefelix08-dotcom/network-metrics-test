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
    // HEALTH CHECK (O "Teste do Postman")
    // ==========================================
    const testarLinkVivo = async (link) => {
      if (!link) return false;
      try {
        const urlPura = link.split('|')[0];

        // Controlador para matar a requisição se demorar mais de 3 segundos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        // Fazemos um GET idêntico ao do Postman/TiviMate
        const res = await fetch(urlPura, {
          method: 'GET',
          headers: {
            'User-Agent': 'okhttp/4.9.2',
            'Accept': '*/*'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // O SEGREDO: Se a requisição deu sucesso, cancelamos o download do corpo da resposta.
        // Isso evita que o Worker faça download do vídeo, economizando sua banda,
        // mas nos dá a certeza absoluta de que o link responde 200 OK.
        if (res.ok && res.body) {
          res.body.cancel();
        }

        // Se retornar 200 (OK), o link está validado!
        return res.status === 200;

      } catch (e) {
        // Se der timeout ou erro de rede, o link morreu.
        return false;
      }
    };

    // ==========================================
    // MOTOR DA API (COM CORRIDA PARALELA)
    // ==========================================
    const tentarAPI = async () => {
      // 🚨 MODO CAOS ATIVADO: Simula que a API explodiu e retorna erro instantâneo
      return null;
      const nomeBusca = config.nome_api || config.nome;
      try {
        const apiRes = await fetch(`https://explouddev.com.br/api/canais/todos?search=${encodeURIComponent(nomeBusca)}`, {
          headers: { 'User-Agent': 'okhttp/4.9.2' },
          cf: { cacheTtl: 300 }
        });

        if (apiRes.ok) {
          const apiData = await apiRes.json();
          let canalApi = apiData.find(c => c.name.toLowerCase() === nomeBusca.toLowerCase()) ||
            apiData.find(c => c.name.toLowerCase().includes(nomeBusca.toLowerCase()));

          if (canalApi && canalApi.sources?.length > 0) {

            // Função auxiliar de corrida: Testa vários links de uma vez
            const testarEmParalelo = async (fontes) => {
              if (!fontes || fontes.length === 0) return null;
              try {
                // Dispara o teste para todas as fontes simultaneamente. 
                // O primeiro que der 'true' ganha e retorna.
                return await Promise.any(fontes.map(async (fonte) => {
                  const vivo = await testarLinkVivo(fonte.link);
                  if (vivo) return fonte.link;
                  throw new Error("Morto"); // Faz o Promise.any pular pro próximo
                }));
              } catch (e) {
                return null; // Todos os links testados falharam
              }
            };

            // 1. Se tem filtro, testa em paralelo só as que batem com o filtro
            if (config.filtro_cdn) {
              const fontesFiltradas = canalApi.sources.filter(s => s.name.toLowerCase().includes(config.filtro_cdn.toLowerCase()));
              const linkFiltradoVencedor = await testarEmParalelo(fontesFiltradas);
              if (linkFiltradoVencedor) return linkFiltradoVencedor;
            }

            // 2. Fallback interno da API: Se não tem filtro (ou o filtro falhou), 
            // pega os primeiros 5 links válidos (para não estourar a memória do Worker) e testa em paralelo!
            const fontesValidas = canalApi.sources.filter(s => !s.link.includes("sinal.cc")).slice(0, 5);
            const linkValidoVencedor = await testarEmParalelo(fontesValidas);
            if (linkValidoVencedor) return linkValidoVencedor;

            // 3. Último recurso da API (sem teste, confia no primeiro que sobrou)
            if (canalApi.sources.length > 0) {
              return canalApi.sources[0].link;
            }
          }
        }
      } catch (e) { return null; }

      return null; // Se chegou aqui, TODAS as fontes da API deram timeout ou 404. Aciona o Site!
    };

    // ==========================================
    // MOTOR DO SITE (Sem Health Check, confia no scraper)
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
    // FLUXO DE REDUNDÂNCIA E DEBUG
    // ==========================================
    try {
      let linkFinal = null;
      let traceOrigem = "";

      if (config.provedor === "site") {
        linkFinal = await tentarScraping();
        if (linkFinal) traceOrigem = "SITE";
      } else {
        // Tenta a API primeiro com a validação rigorosa
        linkFinal = await tentarAPI();

        if (linkFinal) {
          traceOrigem = "API";
        }
        // A API falhou! Aciona o Fallback para o Site
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
            "X-Debug-Origem": traceOrigem // Aqui você pode checar de onde o Worker puxou o sinal!
          }
        });
      }

      // ÚLTIMO RECURSO: Tenta o backup se tudo explodir
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