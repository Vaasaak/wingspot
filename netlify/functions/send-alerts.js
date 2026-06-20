// Denní kontrola alertů + odeslání emailů přes Resend.
// Voláno GitHub Actions cron jobem každý den v 6:00.
// Zabezpečeno hlavičkou X-Alert-Secret (nebo fallback query secret).
// Forecast logika importuje ze shared/forecast-core.js — jeden zdroj pravdy.

import { MODELS, DET_DAYS, ENS_DAYS, processForecast } from "../../shared/forecast-core.js";

const OPENMETEO_BASE     = process.env.OPENMETEO_BASE          ?? "https://api.open-meteo.com";
const OPENMETEO_ENS_BASE = process.env.OPENMETEO_ENSEMBLE_BASE ?? "https://ensemble-api.open-meteo.com";
const OPENMETEO_KEY      = process.env.OPENMETEO_KEY ? `&apikey=${process.env.OPENMETEO_KEY}` : "";
const FORECAST_URL = `${OPENMETEO_BASE}/v1/forecast`;
const ENSEMBLE_URL = `${OPENMETEO_ENS_BASE}/v1/ensemble`;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────

function avg(xs) { return xs.reduce((s, v) => s + v, 0) / xs.length; }

function inDirRange(deg, r) {
  return r.from <= r.to
    ? deg >= r.from && deg <= r.to
    : deg >= r.from || deg <= r.to;
}

// Vrací false pokud je směr offshore nebo mimo goodDirs (když jsou nastaveny).
// null dir = výhledová hodina → pustíme přes (směr neznámý).
function isDirOk(dir, goodDirs, badDirs) {
  if (dir === null) return true;
  if (badDirs?.length && badDirs.some(r => inDirRange(dir, r))) return false;
  if (!goodDirs?.length) return true;  // spot nemá ověřený směr → pustíme
  return goodDirs.some(r => inDirRange(dir, r));
}

// ── Supabase helpers ──────────────────────────────────────────────────────

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function sbGet(url, key) {
  const res = await fetch(url, { headers: sbHeaders(key) });
  if (!res.ok) throw new Error(`Supabase GET ${res.status}`);
  return res.json();
}

async function sbPost(url, key, body, prefer = "") {
  return fetch(url, {
    method: "POST",
    headers: { ...sbHeaders(key), ...(prefer ? { Prefer: prefer } : {}) },
    body: JSON.stringify(body),
  });
}

async function sbPatch(url, key, body) {
  return fetch(url, { method: "PATCH", headers: sbHeaders(key), body: JSON.stringify(body) });
}

// ── Forecast: zkus cache, jinak stáhni čerstvé ───────────────────────────

async function getForecast(spot, supabaseUrl, serviceKey) {
  try {
    const rows = await sbGet(
      `${supabaseUrl}/rest/v1/forecast_cache?cache_key=eq.${encodeURIComponent(spot.id)}&select=data,fetched_at`,
      serviceKey
    );
    if (rows.length > 0 && Date.now() - new Date(rows[0].fetched_at).getTime() < CACHE_TTL_MS) {
      return rows[0].data;
    }
  } catch { /* pokračuj na přímý fetch */ }

  const loc = `&latitude=${spot.lat}&longitude=${spot.lon}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;
  const detUrl =
    `${FORECAST_URL}?hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation` +
    `&daily=sunrise,sunset&models=${MODELS.map(m => m.name).join(",")}&forecast_days=${DET_DAYS}${loc}${OPENMETEO_KEY}`;
  const ensUrl =
    `${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05&forecast_days=${ENS_DAYS}${loc}${OPENMETEO_KEY}`;

  const [detArr, ensArr] = await Promise.all([
    fetch(detUrl).then(r => r.json()).then(d => Array.isArray(d) ? d : [d]),
    fetch(ensUrl).then(r => r.json()).then(d => Array.isArray(d) ? d : [d]),
  ]);
  const forecast = processForecast(spot.id, detArr[0] ?? {}, ensArr[0] ?? {});

  sbPost(`${supabaseUrl}/rest/v1/forecast_cache`, serviceKey,
    { cache_key: spot.id, data: forecast, fetched_at: new Date().toISOString() },
    "resolution=merge-duplicates"
  ).catch(() => {});

  return forecast;
}

// ── Kontrola podmínek alertu ──────────────────────────────────────────────
// Stejná logika jako scoring.ts → alert smí poslat jen okno, které by appka
// označila good/great: vítr ≥ min_wind_ms, směr OK (ne offshore, v goodDirs),
// srážky max 2 mm v okně, alespoň MIN_SESSION_HOURS hodin.

const MIN_SESSION_HOURS = 2;

function checkAlert(forecast, alert, goodDirs, badDirs) {
  const now = new Date();
  const windows = [];

  const byDay = {};
  for (let i = 0; i < forecast.times.length; i++) {
    const t      = forecast.times[i];
    const date   = t.slice(0, 10);
    const hour   = parseInt(t.slice(11, 13));
    const daysAhead = Math.floor(
      (new Date(date) - new Date(now.toISOString().slice(0, 10))) / 86400000
    );
    if (daysAhead < 1 || daysAhead > alert.max_days_ahead) continue;
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push({
      hour,
      wind:   forecast.windMs[i],
      gust:   forecast.gustMs[i],
      dir:    forecast.windDir?.[i] ?? null,
      precip: forecast.precip?.[i] ?? 0,
    });
  }

  for (const [date, hours] of Object.entries(byDay)) {
    if (alert.weekends_only) {
      const dow = new Date(date).getDay();
      if (dow !== 0 && dow !== 6) continue;
    }
    const good = hours.filter(h =>
      h.hour >= 8 && h.hour <= 20 &&
      h.wind >= alert.min_wind_ms &&
      isDirOk(h.dir, goodDirs, badDirs)
    );
    if (good.length < MIN_SESSION_HOURS) continue;

    const precipTotal = good.reduce((s, h) => s + h.precip, 0);
    if (precipTotal > 2) continue;

    windows.push({
      date,
      hours:   good.length,
      avgWind: avg(good.map(h => h.wind)),
      maxGust: Math.max(...good.map(h => h.gust)),
    });
  }

  return windows;
}

// ── Email šablona ─────────────────────────────────────────────────────────

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
}

function buildEmail(spotName, windguruUrl, windows) {
  const rows = windows.map(w =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;">${formatDate(w.date)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;">${w.hours} hod</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;">${w.avgWind.toFixed(1)} m/s ∅</td>
      <td style="padding:8px 12px;border-bottom:1px solid #2a2a2a;">nárazy ${w.maxGust.toFixed(1)}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;">
    <div style="background:#0ea5e9;padding:24px 28px;">
      <div style="font-size:1.5rem;font-weight:700;color:#fff;">🪁 WingSpot</div>
      <div style="color:#e0f2fe;margin-top:4px;font-size:0.95rem;">Okno na ${spotName} se blíží!</div>
    </div>
    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
        <thead>
          <tr style="color:#94a3b8;font-size:0.78rem;text-transform:uppercase;">
            <th style="padding:6px 12px;text-align:left;">Den</th>
            <th style="padding:6px 12px;text-align:left;">Délka</th>
            <th style="padding:6px 12px;text-align:left;">Vítr</th>
            <th style="padding:6px 12px;text-align:left;"></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${windguruUrl ? `<a href="${windguruUrl}" style="display:inline-block;margin-top:20px;padding:10px 18px;background:#0ea5e9;color:#fff;border-radius:8px;text-decoration:none;font-size:0.9rem;">Ověřit na Windguru ↗</a>` : ""}
    </div>
    <div style="padding:16px 28px;border-top:1px solid #2a2a2a;font-size:0.78rem;color:#64748b;">
      WingSpot · předpověď je orientační, vždy posuď podmínky na místě sám.
    </div>
  </div>
</body>
</html>`;
}

// ── Handler ───────────────────────────────────────────────────────────────

const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": process.env.URL ?? "*" };

export const handler = async (event) => {
  // Přijímáme secret z hlavičky (bezpečnější) nebo fallback z query stringu
  const secret = event.headers?.["x-alert-secret"] ?? event.queryStringParameters?.secret;
  if (!secret || secret !== process.env.ALERT_SECRET) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: "unauthorized" }) };
  }

  const testMode = event.queryStringParameters?.test === "true";

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey   = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !serviceKey || !resendKey) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({
      error: "missing env vars",
      has_supabase_url: !!supabaseUrl,
      has_service_key:  !!serviceKey,
      has_resend_key:   !!resendKey,
    })};
  }

  const alerts = await sbGet(
    `${supabaseUrl}/rest/v1/alerts?active=eq.true&select=id,user_email,spot_id,min_wind_ms,max_days_ahead,weekends_only,last_sent_at`,
    serviceKey
  );
  if (!alerts.length) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sent: 0, message: "no active alerts" }) };
  }

  // Spoty včetně směrů — potřeba pro kontrolu offshore
  const spotIds   = [...new Set(alerts.map(a => a.spot_id))];
  const spotsData = await sbGet(
    `${supabaseUrl}/rest/v1/spots?id=in.(${spotIds.map(id => `"${id}"`).join(",")})&select=id,name,lat,lon,windguru_url,good_dirs,bad_dirs`,
    serviceKey
  );
  const spotMap = Object.fromEntries(spotsData.map(s => [s.id, s]));

  const forecastMap = {}, forecastErrors = {};
  await Promise.all(spotIds.map(async id => {
    const spot = spotMap[id];
    if (!spot) { forecastErrors[id] = "spot not found"; return; }
    try { forecastMap[id] = await getForecast(spot, supabaseUrl, serviceKey); }
    catch (e) { forecastErrors[id] = e.message; }
  }));

  const emailsToSend = {}, alertsToMark = [], skipped = [];

  for (const alert of alerts) {
    if (!testMode && alert.last_sent_at) {
      const age = Date.now() - new Date(alert.last_sent_at).getTime();
      if (age < 20 * 60 * 60 * 1000) { skipped.push({ id: alert.id, reason: "cooldown" }); continue; }
    }

    const forecast = forecastMap[alert.spot_id];
    if (!forecast) { skipped.push({ id: alert.id, reason: `no forecast: ${forecastErrors[alert.spot_id] ?? "unknown"}` }); continue; }

    const spot = spotMap[alert.spot_id];
    const windows = testMode
      ? [{ date: new Date().toISOString().slice(0, 10), hours: 4, avgWind: alert.min_wind_ms + 1, maxGust: alert.min_wind_ms + 2 }]
      : checkAlert(forecast, alert, spot.good_dirs ?? [], spot.bad_dirs ?? []);

    if (!windows.length) { skipped.push({ id: alert.id, reason: "no matching wind window" }); continue; }

    if (!emailsToSend[alert.user_email]) emailsToSend[alert.user_email] = [];
    emailsToSend[alert.user_email].push({ spot, windows, alertId: alert.id });
  }

  let sent = 0;
  const emailErrors = [];
  for (const [email, items] of Object.entries(emailsToSend)) {
    for (const { spot, windows, alertId } of items) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "WingSpot <onboarding@resend.dev>",
            to: [email],
            subject: testMode
              ? `🧪 WingSpot test – ${spot.name}`
              : `🌬️ Okno na ${spot.name} – ${windows[0] ? formatDate(windows[0].date) : ""}`,
            html: buildEmail(spot.name, spot.windguru_url, windows),
          }),
        });
        if (res.ok) {
          sent++;
          if (!testMode) alertsToMark.push(alertId);
        } else {
          emailErrors.push({ email, status: res.status, body: await res.text() });
        }
      } catch (e) {
        emailErrors.push({ email, error: e.message });
      }
    }
  }

  await Promise.all(alertsToMark.map(id =>
    sbPatch(`${supabaseUrl}/rest/v1/alerts?id=eq.${id}`, serviceKey,
      { last_sent_at: new Date().toISOString() }
    ).catch(() => {})
  ));

  return { statusCode: 200, headers: CORS, body: JSON.stringify({
    sent,
    checked: alerts.length,
    skipped,
    ...(emailErrors.length ? { emailErrors } : {}),
    ...(testMode ? { testMode: true } : {}),
  })};
};
