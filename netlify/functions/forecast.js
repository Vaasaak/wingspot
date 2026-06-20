// Server-side proxy + Supabase cache pro Open-Meteo předpověď.
// Voláno per-spot: ?spotId=X&lat=Y&lon=Z
// Cache TTL: 1 hodina (sdílená pro všechny uživatele).
// Forecast logika importuje ze shared/forecast-core.js — jeden zdroj pravdy.

import { MODELS, DET_DAYS, ENS_DAYS, processForecast } from "../../shared/forecast-core.js";

const OPENMETEO_BASE     = process.env.OPENMETEO_BASE          ?? "https://api.open-meteo.com";
const OPENMETEO_ENS_BASE = process.env.OPENMETEO_ENSEMBLE_BASE ?? "https://ensemble-api.open-meteo.com";
const OPENMETEO_KEY      = process.env.OPENMETEO_KEY ? `&apikey=${process.env.OPENMETEO_KEY}` : "";
const FORECAST_URL  = `${OPENMETEO_BASE}/v1/forecast`;
const ENSEMBLE_URL  = `${OPENMETEO_ENS_BASE}/v1/ensemble`;
const CACHE_FRESH_MS = 60 * 60 * 1000;       // 1h → HIT (čerstvé)
const CACHE_STALE_MS = 4 * 60 * 60 * 1000;   // 4h → STALE (vrátit okamžitě, warm-cache obnoví)

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": process.env.URL ?? "*",
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS, body: "" };
  }

  const { spotId, lat, lon } = event.queryStringParameters ?? {};
  if (!spotId || !lat || !lon) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: "spotId, lat, lon required" }) };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cacheEnabled = !!(supabaseUrl && serviceKey);

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
            return {
              statusCode: 200,
              headers: { ...CORS, "X-Cache": "HIT", "Cache-Control": "public, max-age=300" },
              body: JSON.stringify(rows[0].data),
            };
          }
          if (age < CACHE_STALE_MS) {
            // Vrátíme zastaralá data okamžitě — warm-cache cron to obnoví do hodiny.
            return {
              statusCode: 200,
              headers: { ...CORS, "X-Cache": "STALE", "Cache-Control": "public, max-age=60" },
              body: JSON.stringify(rows[0].data),
            };
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

    // ── 3. Ulož do cache (fire-and-forget) ────────────────────────────────
    if (cacheEnabled) {
      fetch(`${supabaseUrl}/rest/v1/forecast_cache`, {
        method: "POST",
        headers: { ...sbHeaders(serviceKey), Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ cache_key: spotId, data: forecast, fetched_at: new Date().toISOString() }),
      }).catch(() => {});
    }

    return {
      statusCode: 200,
      headers: { ...CORS, "X-Cache": "MISS", "Cache-Control": "public, max-age=300" },
      body: JSON.stringify(forecast),
    };
  } catch (e) {
    return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
