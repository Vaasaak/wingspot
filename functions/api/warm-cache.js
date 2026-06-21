import { MODELS, DET_DAYS, ENS_DAYS, processForecast } from "../../shared/forecast-core.js";

const BATCH_SIZE = 50;

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function warmBatch(spots, supabaseUrl, serviceKey, forecastUrl, ensUrl, openmeteoKey) {
  const lats = spots.map(s => s.lat).join(",");
  const lons = spots.map(s => s.lon).join(",");
  const loc  = `&latitude=${lats}&longitude=${lons}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;

  const detUrl =
    `${forecastUrl}?hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation` +
    `&daily=sunrise,sunset&models=${MODELS.map(m => m.name).join(",")}&forecast_days=${DET_DAYS}${loc}${openmeteoKey}`;
  const ensFullUrl =
    `${ensUrl}?hourly=wind_speed_10m&models=gfs05&forecast_days=${ENS_DAYS}${loc}${openmeteoKey}`;

  const [detRes, ensRes] = await Promise.all([fetch(detUrl), fetch(ensFullUrl)]);
  if (!detRes.ok || !ensRes.ok) throw new Error(`Open-Meteo ${detRes.status}/${ensRes.status}`);

  const detAll = await detRes.json();
  const ensAll = await ensRes.json();
  const detArr = Array.isArray(detAll) ? detAll : [detAll];
  const ensArr = Array.isArray(ensAll) ? ensAll : [ensAll];

  const forecasts = spots.map((spot, i) =>
    processForecast(spot.id, detArr[i] ?? {}, ensArr[i] ?? {})
  );

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

export async function onRequest(context) {
  const { request, env } = context;

  // Volitelné zabezpečení — GitHub Actions posílá secret v hlavičce
  const secret = request.headers.get("x-warm-cache-secret");
  if (env.WARM_CACHE_SECRET && secret !== env.WARM_CACHE_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "missing env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const forecastUrl  = `${env.OPENMETEO_BASE ?? "https://api.open-meteo.com"}/v1/forecast`;
  const ensUrl       = `${env.OPENMETEO_ENSEMBLE_BASE ?? "https://ensemble-api.open-meteo.com"}/v1/ensemble`;
  const openmeteoKey = env.OPENMETEO_KEY ? `&apikey=${env.OPENMETEO_KEY}` : "";

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const spotsRes = await fetch(
    `${supabaseUrl}/rest/v1/spots?status=eq.approved&last_viewed_at=gte.${since}&select=id,lat,lon`,
    { headers: sbHeaders(serviceKey) }
  );
  if (!spotsRes.ok) {
    return new Response(JSON.stringify({ error: `Supabase ${spotsRes.status}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const spots = await spotsRes.json();
  if (!spots.length) {
    return new Response(JSON.stringify({ warmed: 0, message: "no approved spots" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  let warmed = 0;
  const errors = [];
  for (let i = 0; i < spots.length; i += BATCH_SIZE) {
    const batch = spots.slice(i, i + BATCH_SIZE);
    try {
      warmed += await warmBatch(batch, supabaseUrl, serviceKey, forecastUrl, ensUrl, openmeteoKey);
    } catch (e) {
      errors.push({ batch: i / BATCH_SIZE, error: e.message });
    }
  }

  return new Response(JSON.stringify({
    warmed,
    total: spots.length,
    ...(errors.length ? { errors } : {}),
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}
