// Server-side proxy + Supabase cache pro Open-Meteo předpověď.
// Voláno per-spot: ?spotId=X&lat=Y&lon=Z
// Cache TTL: 1 hodina (sdílená pro všechny uživatele).
// Výsledek: zpracovaný SpotForecast objekt (stejný formát jako frontend).

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble";
const CACHE_TTL_MS = 60 * 60 * 1000;

const MODELS = [
  { name: "meteofrance_arome_france_hd", weight: 5 },
  { name: "icon_d2", weight: 5 },
  { name: "dmi_harmonie_arome_europe", weight: 4 },
  { name: "knmi_harmonie_arome_europe", weight: 3 },
  { name: "icon_eu", weight: 2 },
  { name: "ecmwf_ifs025", weight: 1.5 },
  { name: "gfs_seamless", weight: 1 },
];
const DET_DAYS = 16;
const ENS_DAYS = 22;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${url}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

function avg(xs) {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.round((sorted.length - 1) * p);
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function processSpot(spotId, det, ens) {
  const ensH = (ens[0] ?? {}).hourly ?? {};
  const times = ensH.time ?? [];

  const memberKeys = Object.keys(ensH).filter(
    (k) => k === "wind_speed_10m" || k.startsWith("wind_speed_10m_member")
  );
  const memberArrays = memberKeys.map((k) => ensH[k] ?? []);

  const detLoc = det[0] ?? {};
  const detH = detLoc.hourly ?? {};
  const detTimes = detH.time ?? [];
  const mWind  = MODELS.map((m) => detH[`wind_speed_10m_${m.name}`] ?? []);
  const mGust  = MODELS.map((m) => detH[`wind_gusts_10m_${m.name}`] ?? []);
  const mDir   = MODELS.map((m) => detH[`wind_direction_10m_${m.name}`] ?? []);
  const mPrec  = MODELS.map((m) => detH[`precipitation_${m.name}`] ?? []);
  const detIdx = {};
  detTimes.forEach((t, i) => { detIdx[t] = i; });

  const windMs = [], gustMs = [], windDir = [], precip = [];
  const ensP25 = [], ensP75 = [], isOutlook = [];

  for (let h = 0; h < times.length; h++) {
    const members = [];
    for (const arr of memberArrays) {
      const v = arr[h];
      if (typeof v === "number") members.push(v);
    }
    members.sort((a, b) => a - b);
    const mean = members.length ? avg(members) : null;
    ensP25.push(members.length ? percentile(members, 0.25) : null);
    ensP75.push(members.length ? percentile(members, 0.75) : null);

    const di = detIdx[times[h]];
    let wind = null, gust = 0, dir = null, precipVal = 0, outlook = true;

    if (di !== undefined) {
      let wSum = 0, wWt = 0, gSum = 0, gWt = 0;
      let dx = 0, dy = 0, dWt = 0, pSum = 0, pWt = 0;
      for (let k = 0; k < MODELS.length; k++) {
        const wt = MODELS[k].weight;
        const v = mWind[k][di];
        if (typeof v === "number") { wSum += v * wt; wWt += wt; }
        const gv = mGust[k][di];
        if (typeof gv === "number") { gSum += gv * wt; gWt += wt; }
        const dv = mDir[k][di];
        if (typeof dv === "number") {
          dx += Math.cos((dv * Math.PI) / 180) * wt;
          dy += Math.sin((dv * Math.PI) / 180) * wt;
          dWt += wt;
        }
        const pv = mPrec[k][di];
        if (typeof pv === "number") { pSum += pv * wt; pWt += wt; }
      }
      if (wWt > 0) {
        wind = wSum / wWt;
        gust = Math.max(gWt > 0 ? gSum / gWt : 0, wind);
        if (dWt > 0) dir = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        precipVal = pWt > 0 ? pSum / pWt : 0;
        outlook = false;
      }
    }

    if (wind === null) {
      wind = mean ?? 0;
      gust = wind;
      dir = null;
      precipVal = 0;
      outlook = true;
    }

    windMs.push(wind);
    gustMs.push(gust);
    windDir.push(dir);
    precip.push(precipVal);
    isOutlook.push(outlook);
  }

  const dDaily = detLoc.daily ?? {};
  const daily = (dDaily.time ?? []).map((date, i) => ({
    date,
    sunrise: dDaily.sunrise?.[i] ?? "",
    sunset: dDaily.sunset?.[i] ?? "",
  }));

  return { spotId, times, windMs, gustMs, windDir, precip, ensP25, ensP75, isOutlook, daily };
}

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

exports.handler = async (event) => {
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
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
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
      `&daily=sunrise,sunset&models=${MODELS.map((m) => m.name).join(",")}&forecast_days=${DET_DAYS}${loc}`;
    const ensUrl =
      `${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05&forecast_days=${ENS_DAYS}${loc}`;

    const [det, ens] = await Promise.all([fetchJson(detUrl), fetchJson(ensUrl)]);
    const forecast = processSpot(spotId, det, ens);

    // ── 3. Ulož do cache (fire-and-forget) ────────────────────────────────
    if (cacheEnabled) {
      fetch(`${supabaseUrl}/rest/v1/forecast_cache`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          cache_key: spotId,
          data: forecast,
          fetched_at: new Date().toISOString(),
        }),
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
