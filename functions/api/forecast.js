import { MODELS, DET_DAYS, ENS_DAYS, processForecast } from "../../shared/forecast-core.js";

const CACHE_FRESH_MS = 60 * 60 * 1000;
const CACHE_STALE_MS = 4 * 60 * 60 * 1000;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function cors(env) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": env.SITE_URL ?? "*",
  };
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: cors(env) });
  }

  const params = new URL(request.url).searchParams;
  const spotId = params.get("spotId");
  const lat    = params.get("lat");
  const lon    = params.get("lon");

  if (!spotId || !lat || !lon) {
    return new Response(JSON.stringify({ error: "spotId, lat, lon required" }), { status: 400, headers: cors(env) });
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
  const cacheEnabled = !!(supabaseUrl && serviceKey);

  const FORECAST_URL = `${env.OPENMETEO_BASE ?? "https://api.open-meteo.com"}/v1/forecast`;
  const ENSEMBLE_URL = `${env.OPENMETEO_ENSEMBLE_BASE ?? "https://ensemble-api.open-meteo.com"}/v1/ensemble`;
  const OPENMETEO_KEY = env.OPENMETEO_KEY ? `&apikey=${env.OPENMETEO_KEY}` : "";

  // ── 1. Zkontroluj Supabase cache ──────────────────────────────────────────
  if (cacheEnabled) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/forecast_cache?cache_key=eq.${encodeURIComponent(spotId)}&select=data,fetched_at`,
        { headers: sbHeaders(serviceKey) }
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows.length > 0) {
          const age = Date.now() - new Date(rows[0].fetched_at).getTime();
          if (age < CACHE_FRESH_MS) {
            return new Response(JSON.stringify(rows[0].data), {
              status: 200,
              headers: { ...cors(env), "X-Cache": "HIT", "Cache-Control": "public, max-age=300" },
            });
          }
          if (age < CACHE_STALE_MS) {
            fetch(`${supabaseUrl}/rest/v1/spots?id=eq.${encodeURIComponent(spotId)}`, {
              method: "PATCH",
              headers: { ...sbHeaders(serviceKey), Prefer: "return=minimal" },
              body: JSON.stringify({ last_viewed_at: new Date().toISOString() }),
            }).catch(() => {});
            return new Response(JSON.stringify(rows[0].data), {
              status: 200,
              headers: { ...cors(env), "X-Cache": "STALE", "Cache-Control": "public, max-age=60" },
            });
          }
        }
      }
    } catch { /* cache miss → pokračuj */ }
  }

  // ── 2. Stáhni čerstvá data z Open-Meteo ──────────────────────────────────
  try {
    const loc = `&latitude=${lat}&longitude=${lon}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;
    const detUrl =
      `${FORECAST_URL}?hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation` +
      `&daily=sunrise,sunset&models=${MODELS.map(m => m.name).join(",")}&forecast_days=${DET_DAYS}${loc}${OPENMETEO_KEY}`;
    const ensUrl =
      `${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05&forecast_days=${ENS_DAYS}${loc}${OPENMETEO_KEY}`;

    const [det, ens] = await Promise.all([fetchJson(detUrl), fetchJson(ensUrl)]);
    const forecast = processForecast(spotId, det[0] ?? {}, ens[0] ?? {});

    // ── 3. Ulož do cache + aktualizuj last_viewed_at (fire-and-forget) ──────
    if (cacheEnabled) {
      const now = new Date().toISOString();
      fetch(`${supabaseUrl}/rest/v1/forecast_cache`, {
        method: "POST",
        headers: { ...sbHeaders(serviceKey), Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ cache_key: spotId, data: forecast, fetched_at: now }),
      }).catch(() => {});
      fetch(`${supabaseUrl}/rest/v1/spots?id=eq.${encodeURIComponent(spotId)}`, {
        method: "PATCH",
        headers: { ...sbHeaders(serviceKey), Prefer: "return=minimal" },
        body: JSON.stringify({ last_viewed_at: now }),
      }).catch(() => {});
    }

    return new Response(JSON.stringify(forecast), {
      status: 200,
      headers: { ...cors(env), "X-Cache": "MISS", "Cache-Control": "public, max-age=300" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: cors(env) });
  }
}
