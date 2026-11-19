// =========================================================================
// MÓDULO DE CANAIS LOCAIS - WORKER COM CACHE DE BORDA
// =========================================================================

// Variáveis sensíveis (HOMELAB_BRIDGE_URL, HOMELAB_BRIDGE_SECRET, GLOBO_AUTH_TOKEN,
// BAND_LIVE_ID, REDE_MINAS_URL, SBT_URL) são lidas exclusivamente via env / Secrets.

// =========================================================================
// CAMADA DE CACHE INTELIGENTE (MEMÓRIA DO ISOLATE + CACHE API DA CLOUDFLARE)
// =========================================================================
const memoryCache = {
  globo: { url: null, expires: 0 },
  band: { url: null, expires: 0 }
};

// Validador inteligente de expiração de tokens JWT ou parâmetros exp= na URL
function isUrlExpired(streamUrl) {
  if (!streamUrl) return true;
  if (streamUrl.includes("0195cdf3-d8d8-74b6-9516-6c79c06bcec8")) return true;
  try {
    const jwtMatch = streamUrl.match(/\/j\/[^.]+\.([^.]+)\.[^/]+/);
    if (jwtMatch) {
      let b64 = jwtMatch[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const payload = JSON.parse(atob(b64));
      if (payload.exp && (payload.exp * 1000) <= (Date.now() + 180000)) {
        console.log(`[EXPIRADO] Token JWT da Globo expirado em ${new Date(payload.exp * 1000).toISOString()}`);
        return true;
      }
    }
    const expMatch = streamUrl.match(/[?&]hdnts=exp=(\d+)/);
    if (expMatch) {
      const expSec = parseInt(expMatch[1], 10);
      if (expSec && (expSec * 1000) <= (Date.now() + 180000)) {
        return true;
      }
    }
  } catch (e) {}
  return false;
}

async function getCachedStream(key, ttlSeconds, forceFresh, fetchFn) {
  const now = Date.now();

  // 1. Memória rápida do isolate (se ainda válida e não forçado)
  if (!forceFresh && memoryCache[key] && memoryCache[key].url && memoryCache[key].expires > now) {
    if (isUrlExpired(memoryCache[key].url)) { memoryCache[key].url = null; } else {
    const remainingMin = Math.round((memoryCache[key].expires - now) / 60000);
    console.log(`[⚡ CACHE HIT MEMÓRIA] ${key.toUpperCase()} reaproveitada (válida por mais ${remainingMin} min).`);
    return memoryCache[key].url;
    }
  }

  // 2. Cloudflare Cache API (compartilhado entre diferentes isolates/borda)
  const cacheKeyUrl = `https://cache.network-metrics.internal/stream/${key}`;
  let cfCache = null;
  try {
    if (typeof caches !== "undefined" && caches.default) {
      cfCache = caches.default;
      if (!forceFresh) {
        const cachedResponse = await cfCache.match(cacheKeyUrl);
        if (cachedResponse) {
          const streamUrl = await cachedResponse.text();
          if (streamUrl && streamUrl.startsWith("http")) {
            if (!isUrlExpired(streamUrl)) {
              console.log(`[🌐 CACHE HIT EDGE] ${key.toUpperCase()} recuperada do Cache compartilhado da Cloudflare.`);
              memoryCache[key] = { url: streamUrl, expires: now + ttlSeconds * 1000 };
              return streamUrl;
            }
            console.log(`[⚠️ CACHE EXPIRADO] ${key.toUpperCase()} na borda continha URL já expirada. Descartando cache...`);
          }
        }
      }
    }
  } catch (err) {
    console.log(`[CACHE API MATCH AVISO]: ${err.message}`);
  }

  // 3. Cache Miss (ou forceFresh): Executa chamada real à API
  console.log(`[🔄 CACHE MISS] Gerando nova sessão para ${key.toUpperCase()}...`);
  const freshUrl = await fetchFn();
  if (freshUrl) {
    // Atualiza memória rápida
    memoryCache[key] = { url: freshUrl, expires: now + ttlSeconds * 1000 };

    // Persiste no cache compartilhado da Cloudflare
    if (cfCache) {
      try {
        const toCache = new Response(freshUrl, {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            "Cache-Control": `public, max-age=${ttlSeconds}`
          }
        });
        await cfCache.put(cacheKeyUrl, toCache);
      } catch (err) {
        console.log(`[CACHE API PUT AVISO]: ${err.message}`);
      }
    }
  }

  return freshUrl;
}

/**
 * 1. GLOBO MG (Globoplay Video Session com Geo-Bridge no Homelab MG e Cache de 4 horas)
 */
export async function fetchGloboStream(env, forceFresh = false) {
  return getCachedStream("globo", 14400, forceFresh, async () => {
    // 1. Prioridade Máxima: Obter a sessão via Homelab em Minas Gerais (garante sinal regional globo-bh)
    const bridgeBase = (env?.HOMELAB_BRIDGE_URL || "").replace(/\/+$/, "");
    const bridgeSecret = env?.HOMELAB_BRIDGE_SECRET || "";
    if (bridgeBase && bridgeSecret) {
      const homelabUrl = `${bridgeBase}/globo-mg.m3u8`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const resBridge = await fetch(homelabUrl, {
          method: "GET",
          headers: {
            "User-Agent": "okhttp/4.9.2",
            "X-Bridge-Secret": bridgeSecret
          },
          redirect: "manual",
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const location = resBridge.headers.get("Location") || resBridge.headers.get("location");
        if (location && location.includes(".m3u8")) {
          console.log("[GLOBO WORKER] Sucesso ao obter sinal regional Globo Minas (BH) via Homelab Bridge!");
          return location;
        }
      } catch (e) {
        console.log(`[GLOBO WORKER] Homelab Bridge indisponível (${e.message}). Acionando fallback nativo...`);
      }
    }

    // 2. Fallback de Contingência: Chamada direta pelo Worker à API da Globo
    const token = env?.GLOBO_AUTH_TOKEN;
    if (!token) {
      console.log("[GLOBO WORKER] GLOBO_AUTH_TOKEN não configurado.");
      return null;
    }

    const url = "https://playback.video.globo.com/v5/video-session";
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0",
      "Accept": "*/*",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "Origin": "https://globoplay.globo.com",
      "Referer": "https://globoplay.globo.com/"
    };

    const payload = {
      player_type: "desktop",
      video_id: "4452349",
      quality: "max",
      content_protection: "widevine",
      vsid: crypto.randomUUID(),
      tz: "-03:00",
      capabilities: { low_latency: true, smart_mosaic: true, max_frame_rate: "60", dvr: true },
      consumption: "streaming",
      metadata: { name: "web", device: { type: "desktop", os: {} } },
      version: 2
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const sources = data.sources || [];
        for (const s of sources) {
          if (s.type === "hls" || (s.url && s.url.includes("m3u8"))) {
            console.log("[GLOBO WORKER] Sucesso ao obter stream!");
            return s.url;
          }
        }
        if (sources.length > 0 && sources[0].url) {
          return sources[0].url;
        }
      } else {
        console.log(`[GLOBO WORKER ERRO ${res.status}]:`, await res.text());
      }
    } catch (e) {
      console.log(`[GLOBO WORKER EXCEPTION]:`, e.message);
    }
    return null;
  });
}

/**
 * 2. BAND MINAS (Spalla CDN API com Cache de 4 horas)
 */
export async function fetchBandStream(env, forceFresh = false) {
  return getCachedStream("band", 14400, forceFresh, async () => {
    // 1. Prioridade: Bridge com Homelab (já dinâmico e testado)
    const bridgeBase = (env?.HOMELAB_BRIDGE_URL || "").replace(/\/+$/, "");
    const bridgeSecret = env?.HOMELAB_BRIDGE_SECRET || "";
    if (bridgeBase && bridgeSecret) {
      const homelabUrl = `${bridgeBase}/band-minas.m3u8`;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const resBridge = await fetch(homelabUrl, {
          method: "GET",
          headers: {
            "User-Agent": "okhttp/4.9.2",
            "X-Bridge-Secret": bridgeSecret
          },
          redirect: "manual",
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const location = resBridge.headers.get("Location") || resBridge.headers.get("location");
        if (location && location.includes(".m3u8")) {
          console.log("[BAND WORKER] Sucesso ao obter Band via Homelab Bridge!");
          return location;
        }
      } catch (e) {
        console.log(`[BAND WORKER] Homelab Bridge indisponível (${e.message}). Acionando fallback direto...`);
      }
    }

    // 2. Fallback direto: Descoberta dinâmica de liveId ou Spalla API
    let liveId = env?.BAND_LIVE_ID || "";
    try {
      const pageRes = await fetch("https://www.band.com.br/ao-vivo", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const m = html.match(/live=([0-9a-fA-F-]+)/);
        if (m && m[1]) {
          liveId = m[1];
        }
      }
    } catch (e) {
      console.log(`[BAND WORKER SCRAPER AVISO]: ${e.message}`);
    }
    try {
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": `https://beyond.spalla.io/player/?live=${liveId}`
      };
      const res = await fetch(`https://beyond.spalla.io/cache/config/${liveId}`, { headers });
      if (res.ok) {
        const cfg = await res.json();
        const cdnUrl = cfg?.lm_live_cdns?.[0]?.URL;
        const token = cfg?.lm_live_jwt_token;
        if (cdnUrl && token) {
          const streamUrl = `${cdnUrl}${liveId}/s1/playlist_nova-a.m3u8?sjwt=${token}`;
          console.log("[BAND WORKER] Sucesso ao obter stream Spalla!");
          return streamUrl;
        }
      } else {
        console.log(`[BAND WORKER ERRO ${res.status}]`);
      }
    } catch (e) {
      console.log(`[BAND WORKER EXCEPTION]:`, e.message);
    }
    return null;
  });
}

/**
 * 3. REDE MINAS (ZoeWeb Direct Stream)
 */
export function fetchRedeMinasStream(env) {
  return env?.REDE_MINAS_URL || null;
}

/**
 * 5. SBT AO VIVO (SBT Satélite / Nacional - Wowza 1080p)
 */
export function fetchSbtStream(env) {
  return env?.SBT_URL || null;
}
