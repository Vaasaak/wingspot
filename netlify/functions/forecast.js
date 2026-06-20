// Server-side proxy + Supabase cache pro Open-Meteo předpověď.
// Voláno per-spot: ?spotId=X&lat=Y&lon=Z
// Cache TTL: 1 hodina (sdílená pro všechny uživatele).
// Forecast logika importuje ze shared/forecast-core.js — jeden zdroj pravdy.

import { MODELS, DET_DAYS, ENS_DAYS, processForecast } from "../../shared/forecast-core.js";

const FORECAST_URL  = "https://api.open-meteo.com/v1/forecast";
const ENSEMBLE_URL  = "https://ensemble-api.open-meteo.com/v1/ensemble";
const CACHE_TTL_MS  = 60 * 60 * 1000;

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
          if (age < CACHE_TTL_MS) {
            return {
              statusCode: 200,
              headers: { ...CORS, "X-Cache": "HIT", "Cache-Control": "public, max-age=300" },
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
      `&daily=sunrise,sunset&models=${MODELS.map(m => m.name).join(",")}&forecast_days=${DET_DAYS}${loc}`;
    const ensUrl =
      `${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05&forecast_days=${ENS_DAYS}${loc}`;

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
