// =========================================================================
// MÓDULO DE CANAIS LOCAIS - WORKER COM CACHE DE BORDA
// =========================================================================

const GLOBO_AUTH_TOKEN = "18f104f386bacf489ba202b511074d9af594f73496763564a6239544c34663075755f70775a48635748505935546e593752765f7171534f7670366a454b536433315955466c312d344d563278594430453030635066466643464a4162576e6f39414a447145673d3d3a303a756f756f78646178736470656c636e656b796b71";
const RECORD_REFRESH_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1dWlkIjoiOGQ3NjA5MWMtMDgyNi00YTViLTgxMTgtZGVlYjY1YmI4YTQ0IiwiZG4iOiJob21lZmVsaXgwOEBnbWFpbC5jb20iLCJ1biI6ImhvbWVmZWxpeDA4QGdtYWlsLmNvbSIsImRhdGUiOiIxNzkyNDUwMTgzODQ4IiwiaWF0IjoxNzkyNDUwMTgzLCJleHAiOjE4MjQwMDc3ODMsImp0aSI6ImU4NDc1MGU4LTMxNjQtNDc0NC1hODIyLTA1YmIwZTYyYTVmYyIsInBqdGkiOiI1NmYzYzgyMi00NDhlLTQ2NWYtODQ0Ni1kZjdlNGJkYjUwMGYifQ.E-Vn0p4p9GsduTnnwx5ZyA3cnlXfO7i4Ki_59StmY64IDUpJId-u8MyeCzXic1R30RGFlDYqfYNDiJZ1_LM7Eg";
let RECORD_AUTH_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1dWlkIjoiOGQ3NjA5MWMtMDgyNi00YTViLTgxMTgtZGVlYjY1YmI4YTQ0IiwiZG4iOiJob21lZmVsaXgwOEBnbWFpbC5jb20iLCJ1biI6ImhvbWVmZWxpeDA4QGdtYWlsLmNvbSIsImRhdGUiOiIxNzkyNDUwMTgzODQ4IiwiaWF0IjoxNzkyNDUwMzM0LCJleHAiOjE3OTI0NTEyMzQsImp0aSI6IjU2ZjNjODIyLTQ0OGUtNDY1Zi04NDQ2LWRmN2U0YmRiNTAwZiJ9.0DKWOqd-Gq72P1rC84m7KT7IbHrJfgmzRo8pciyZcUYbjDUqCbsY3O2AzVhwmrixP5ccsKGOO-Srk11w_wP_Zg";
const RECORD_CHANNEL_ID = "Y2hhbm5lbCNyNy5jb20jbWc";

const BAND_LIVE_ID = "0195cdf3-d8d8-74b6-9516-6c79c06bcec8";
const REDE_MINAS_URL = "https://8hzcavccys.zoeweb.tv/redeminas/ngrp:redeminas_all/playlist.m3u8";
const SBT_URL = "https://6836041ea1117.streamlock.net/cverde/cverde/playlist.m3u8";

// =========================================================================
// CAMADA DE CACHE INTELIGENTE (MEMÓRIA DO ISOLATE + CACHE API DA CLOUDFLARE)
// =========================================================================
const memoryCache = {
  globo: { url: null, expires: 0 },
  band: { url: null, expires: 0 },
  record: { url: null, expires: 0 }
};

// Validador inteligente de expiração de tokens JWT ou parâmetros exp= na URL
function isUrlExpired(streamUrl) {
  if (!streamUrl) return true;
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
    const homelabUrl = "https://canais.flxcloud.dev/globo-mg.m3u8";
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const resBridge = await fetch(homelabUrl, {
        method: "GET",
        headers: { "User-Agent": "okhttp/4.9.2" },
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

    // 2. Fallback de Contingência: Chamada direta pelo Worker à API da Globo
    const token = (env && env.GLOBO_AUTH_TOKEN) || GLOBO_AUTH_TOKEN;
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
    const liveId = (env && env.BAND_LIVE_ID) || BAND_LIVE_ID;
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
  return (env && env.REDE_MINAS_URL) || REDE_MINAS_URL;
}

/**
 * 4. RECORD MINAS (RecordPlus API com Refresh Token e Cache de 3 horas)
 */
export async function fetchRecordStream(env, forceFresh = false) {
  return getCachedStream("record", 10800, forceFresh, async () => {
    const refreshToken = (env && env.RECORD_REFRESH_TOKEN) || RECORD_REFRESH_TOKEN;
    const channelId = (env && env.RECORD_CHANNEL_ID) || RECORD_CHANNEL_ID;

    if (refreshToken) {
      try {
        const r = await fetch("https://api-idp.recordplus.com/v1/user/refresh", {
          method: "POST",
          headers: {
            "Authorization": refreshToken,
            "User-Agent": "Mozilla/5.0"
          }
        });

        if (r.ok) {
          const data = await r.json();
          const newToken = data?.bearer?.auth?.token;
          if (newToken) {
            RECORD_AUTH_TOKEN = newToken;
            console.log("[RECORD WORKER] Token renovado com sucesso!");
          }
        } else {
          console.log(`[RECORD WORKER REFRESH ERRO ${r.status}]:`, await r.text());
        }
      } catch (e) {
        console.log(`[RECORD WORKER REFRESH EXCEPTION]:`, e.message);
      }
    }

    if (!RECORD_AUTH_TOKEN) {
      console.log("[RECORD WORKER] Nenhum token de autenticação disponível.");
      return null;
    }

    try {
      const url = `https://api-playback.recordplus.com/v1/playback/${channelId}`;
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Authorization": `Bearer ${RECORD_AUTH_TOKEN}`,
        "Content-Type": "application/json",
        "Origin": "https://www.recordplus.com",
        "Referer": "https://www.recordplus.com/"
      };
      const payload = {
        eventType: "play",
        assetId: channelId,
        assetType: "channel",
        source: "live",
        platform: "web",
        appName: "RecordPlus",
        appVersion: "1.0.0",
        device: { deviceId: crypto.randomUUID() }
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        const contents = data.contents || [];
        if (contents.length > 0 && contents[0].url) {
          console.log("[RECORD WORKER] Sucesso ao obter stream da Akamai!");
          return contents[0].url;
        }
        return data.streamUrl || data.url || null;
      } else {
        console.log(`[RECORD WORKER PLAYBACK ERRO ${res.status}]:`, await res.text());
      }
    } catch (e) {
      console.log(`[RECORD WORKER PLAYBACK EXCEPTION]:`, e.message);
    }
    return null;
  });
}

/**
 * 5. SBT AO VIVO (SBT Satélite / Nacional - Wowza 1080p)
 */
export function fetchSbtStream(env) {
  return (env && env.SBT_URL) || SBT_URL;
}
