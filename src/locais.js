// =========================================================================
// MÓDULO DE CANAIS LOCAIS - WORKER
// =========================================================================

const GLOBO_AUTH_TOKEN = "18f104f386bacf489ba202b511074d9af594f73496763564a6239544c34663075755f70775a48635748505935546e593752765f7171534f7670366a454b536433315955466c312d344d563278594430453030635066466643464a4162576e6f39414a447145673d3d3a303a756f756f78646178736470656c636e656b796b71";
const RECORD_REFRESH_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1dWlkIjoiOGQ3NjA5MWMtMDgyNi00YTViLTgxMTgtZGVlYjY1YmI4YTQ0IiwiZG4iOiJob21lZmVsaXgwOEBnbWFpbC5jb20iLCJ1biI6ImhvbWVmZWxpeDA4QGdtYWlsLmNvbSIsImRhdGUiOiIxNzkyNDUwMTgzODQ4IiwiaWF0IjoxNzkyNDUwMTgzLCJleHAiOjE4MjQwMDc3ODMsImp0aSI6ImU4NDc1MGU4LTMxNjQtNDc0NC1hODIyLTA1YmIwZTYyYTVmYyIsInBqdGkiOiI1NmYzYzgyMi00NDhlLTQ2NWYtODQ0Ni1kZjdlNGJkYjUwMGYifQ.E-Vn0p4p9GsduTnnwx5ZyA3cnlXfO7i4Ki_59StmY64IDUpJId-u8MyeCzXic1R30RGFlDYqfYNDiJZ1_LM7Eg";
let RECORD_AUTH_TOKEN = "eyJhbGciOiJIUzUxMiJ9.eyJ1dWlkIjoiOGQ3NjA5MWMtMDgyNi00YTViLTgxMTgtZGVlYjY1YmI4YTQ0IiwiZG4iOiJob21lZmVsaXgwOEBnbWFpbC5jb20iLCJ1biI6ImhvbWVmZWxpeDA4QGdtYWlsLmNvbSIsImRhdGUiOiIxNzkyNDUwMTgzODQ4IiwiaWF0IjoxNzkyNDUwMzM0LCJleHAiOjE3OTI0NTEyMzQsImp0aSI6IjU2ZjNjODIyLTQ0OGUtNDY1Zi04NDQ2LWRmN2U0YmRiNTAwZiJ9.0DKWOqd-Gq72P1rC84m7KT7IbHrJfgmzRo8pciyZcUYbjDUqCbsY3O2AzVhwmrixP5ccsKGOO-Srk11w_wP_Zg";
const RECORD_CHANNEL_ID = "Y2hhbm5lbCNyNy5jb20jbWc";

const BAND_LIVE_ID = "0195cdf3-d8d8-74b6-9516-6c79c06bcec8";
const REDE_MINAS_URL = "https://8hzcavccys.zoeweb.tv/redeminas/ngrp:redeminas_all/playlist.m3u8";
const SBT_DEFAULT_YOUTUBE_ID = "R0ZJ4uevOd4";

/**
 * 1. GLOBO MG (Globoplay Video Session API)
 */
export async function fetchGloboStream(env) {
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
}

/**
 * 2. BAND MINAS (Spalla CDN API)
 */
export async function fetchBandStream(env) {
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
}

/**
 * 3. REDE MINAS (ZoeWeb Direct Stream)
 */
export function fetchRedeMinasStream(env) {
  return (env && env.REDE_MINAS_URL) || REDE_MINAS_URL;
}

/**
 * 4. RECORD MINAS (RecordPlus API com Refresh Token)
 */
export async function fetchRecordStream(env) {
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
}

/**
 * 5. SBT AO VIVO
 */
export async function fetchSbtStream(env) {
  const defaultId = (env && env.SBT_DEFAULT_YOUTUBE_ID) || SBT_DEFAULT_YOUTUBE_ID;
  try {
    let videoId = defaultId;
    const r = await fetch("https://www.sbt.com.br/ao-vivo", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    if (r.ok) {
      const html = await r.text();
      const m = html.match(/videoID=([a-zA-Z0-9_-]+)/);
      if (m && m[1]) {
        videoId = m[1];
      }
    }
    console.log(`[SBT WORKER] Video ID ativo: ${videoId}`);
  } catch (e) {
    console.log("[SBT WORKER] Erro ao raspar sbt.com.br:", e.message);
  }

  try {
    const apiRes = await fetch("https://explouddev.com.br/api/canais/todos?search=SBT", {
      headers: { "User-Agent": "okhttp/4.9.2" }
    });
    if (apiRes.ok) {
      const list = await apiRes.json();
      const sbt = list.find(c => c.name.toLowerCase().includes("sbt"));
      if (sbt && sbt.sources?.length > 0) {
        const cdn = sbt.sources.find(s => s.name.toLowerCase().includes("sbt mg")) || sbt.sources[0];
        console.log("[SBT WORKER] Retornando fonte CDN de contingência!");
        return cdn.link;
      }
    }
  } catch (e) {
    console.log("[SBT WORKER] Erro fallback:", e.message);
  }
  return null;
}
