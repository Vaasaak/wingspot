// Naplánovaná funkce: každou hodinu předehřeje forecast_cache pro všechny
// aktivní schválené spoty. Zabrání tomu, aby první uživatel po hodině
// čekal na synchronní Open-Meteo fetch.
//
// Plán: netlify.toml → [functions."warm-cache"] schedule = "@hourly"

import { MODELS, DET_DAYS, ENS_DAYS, processForecast } from "../../shared/forecast-core.js";

const OPENMETEO_BASE     = process.env.OPENMETEO_BASE          ?? "https://api.open-meteo.com";
const OPENMETEO_ENS_BASE = process.env.OPENMETEO_ENSEMBLE_BASE ?? "https://ensemble-api.open-meteo.com";
const OPENMETEO_KEY      = process.env.OPENMETEO_KEY ? `&apikey=${process.env.OPENMETEO_KEY}` : "";
const FORECAST_URL = `${OPENMETEO_BASE}/v1/forecast`;
const ENSEMBLE_URL = `${OPENMETEO_ENS_BASE}/v1/ensemble`;

// Max spotů v jednom batch Open-Meteo requestu (bezpečný limit)
const BATCH_SIZE = 50;

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function warmBatch(spots, supabaseUrl, serviceKey) {
  const lats = spots.map(s => s.lat).join(",");
  const lons = spots.map(s => s.lon).join(",");
  const loc  = `&latitude=${lats}&longitude=${lons}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;

  const detUrl =
    `${FORECAST_URL}?hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation` +
    `&daily=sunrise,sunset&models=${MODELS.map(m => m.name).join(",")}&forecast_days=${DET_DAYS}${loc}${OPENMETEO_KEY}`;
  const ensUrl =
    `${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05&forecast_days=${ENS_DAYS}${loc}${OPENMETEO_KEY}`;

  const [detRes, ensRes] = await Promise.all([fetch(detUrl), fetch(ensUrl)]);
  if (!detRes.ok || !ensRes.ok) throw new Error(`Open-Meteo ${detRes.status}/${ensRes.status}`);

  const detAll = await detRes.json();
  const ensAll = await ensRes.json();

  const detArr = Array.isArray(detAll) ? detAll : [detAll];
  const ensArr = Array.isArray(ensAll) ? ensAll : [ensAll];

  const forecasts = spots.map((spot, i) =>
    processForecast(spot.id, detArr[i] ?? {}, ensArr[i] ?? {})
  );

  // Ulož do Supabase cache (všechny spoty najednou přes upsert)
  const rows = forecasts.map((data, i) => ({
    cache_key: spots[i].id,
    data,
    fetched_at: new Date().toISOString(),
  }));

  await fetch(`${supabaseUrl}/rest/v1/forecast_cache`, {
    method: "POST",
    headers: { ...sbHeaders(serviceKey), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });

  return forecasts.length;
}

export const handler = async () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "missing env vars" }) };
  }

  // Načti všechny schválené spoty
  const spotsRes = await fetch(
    `${supabaseUrl}/rest/v1/spots?status=eq.approved&select=id,lat,lon`,
    { headers: sbHeaders(serviceKey) }
  );
  if (!spotsRes.ok) {
    return { statusCode: 502, body: JSON.stringify({ error: `Supabase ${spotsRes.status}` }) };
  }
  const spots = await spotsRes.json();
  if (!spots.length) {
    return { statusCode: 200, body: JSON.stringify({ warmed: 0, message: "no approved spots" }) };
  }

  // Zpracuj po dávkách
  let warmed = 0;
  const errors = [];
  for (let i = 0; i < spots.length; i += BATCH_SIZE) {
    const batch = spots.slice(i, i + BATCH_SIZE);
    try {
      warmed += await warmBatch(batch, supabaseUrl, serviceKey);
    } catch (e) {
      errors.push({ batch: i / BATCH_SIZE, error: e.message });
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ warmed, total: spots.length, ...(errors.length ? { errors } : {}) }),
  };
};
