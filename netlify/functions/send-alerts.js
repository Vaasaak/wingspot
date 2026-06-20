// Denní kontrola alertů + odeslání emailů přes Resend.
// Voláno GitHub Actions cron jobem každý den v 6:00.
// Zabezpečeno ALERT_SECRET query parametrem.

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hodiny

const MODELS = [
  { name: "meteofrance_arome_france_hd", weight: 5 },
  { name: "icon_d2", weight: 5 },
  { name: "dmi_harmonie_arome_europe", weight: 4 },
  { name: "knmi_harmonie_arome_europe", weight: 3 },
  { name: "icon_eu", weight: 2 },
  { name: "ecmwf_ifs025", weight: 1.5 },
  { name: "gfs_seamless", weight: 1 },
];

// ── Zpracování předpovědi (kopie z forecast.js) ───────────────────────────

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const d = await res.json();
  return Array.isArray(d) ? d : [d];
}

function avg(xs) { return xs.reduce((s, v) => s + v, 0) / xs.length; }
function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * p)))];
}

function processForecast(spotId, det, ens) {
  const ensH = (ens[0] ?? {}).hourly ?? {};
  const times = ensH.time ?? [];
  const memberKeys = Object.keys(ensH).filter(k => k === "wind_speed_10m" || k.startsWith("wind_speed_10m_member"));
  const memberArrays = memberKeys.map(k => ensH[k] ?? []);
  const detLoc = det[0] ?? {};
  const detH = detLoc.hourly ?? {};
  const detTimes = detH.time ?? [];
  const mWind = MODELS.map(m => detH[`wind_speed_10m_${m.name}`] ?? []);
  const mGust  = MODELS.map(m => detH[`wind_gusts_10m_${m.name}`] ?? []);
  const detIdx = {};
  detTimes.forEach((t, i) => { detIdx[t] = i; });

  const windMs = [], gustMs = [], isOutlook = [];
  for (let h = 0; h < times.length; h++) {
    const members = memberArrays.map(a => a[h]).filter(v => typeof v === "number").sort((a,b) => a-b);
    const mean = members.length ? avg(members) : null;
    const di = detIdx[times[h]];
    let wind = null, gust = 0, outlook = true;
    if (di !== undefined) {
      let wSum = 0, wWt = 0, gSum = 0, gWt = 0;
      for (let k = 0; k < MODELS.length; k++) {
        const wt = MODELS[k].weight;
        const v = mWind[k][di]; if (typeof v === "number") { wSum += v*wt; wWt += wt; }
        const gv = mGust[k][di]; if (typeof gv === "number") { gSum += gv*wt; gWt += wt; }
      }
      if (wWt > 0) { wind = wSum/wWt; gust = Math.max(gWt > 0 ? gSum/gWt : 0, wind); outlook = false; }
    }
    if (wind === null) { wind = mean ?? 0; gust = wind; outlook = true; }
    windMs.push(wind); gustMs.push(gust); isOutlook.push(outlook);
  }
  const dDaily = detLoc.daily ?? {};
  const daily = (dDaily.time ?? []).map((date, i) => ({
    date, sunrise: dDaily.sunrise?.[i] ?? "", sunset: dDaily.sunset?.[i] ?? "",
  }));
  return { spotId, times, windMs, gustMs, isOutlook, daily };
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
  // Zkus cache
  try {
    const rows = await sbGet(
      `${supabaseUrl}/rest/v1/forecast_cache?cache_key=eq.${encodeURIComponent(spot.id)}&select=data,fetched_at`,
      serviceKey
    );
    if (rows.length > 0 && Date.now() - new Date(rows[0].fetched_at).getTime() < CACHE_TTL_MS) {
      return rows[0].data;
    }
  } catch { /* pokračuj na přímý fetch */ }

  // Stáhni čerstvé
  const loc = `&latitude=${spot.lat}&longitude=${spot.lon}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;
  const [det, ens] = await Promise.all([
    fetchJson(`${FORECAST_URL}?hourly=wind_speed_10m,wind_gusts_10m&daily=sunrise,sunset&models=${MODELS.map(m=>m.name).join(",")}&forecast_days=16${loc}`),
    fetchJson(`${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05&forecast_days=22${loc}`),
  ]);
  const forecast = processForecast(spot.id, det, ens);

  // Ulož do cache (fire-and-forget)
  sbPost(`${supabaseUrl}/rest/v1/forecast_cache`, serviceKey,
    { cache_key: spot.id, data: forecast, fetched_at: new Date().toISOString() },
    "resolution=merge-duplicates"
  ).catch(() => {});

  return forecast;
}

// ── Kontrola podmínek alertu ──────────────────────────────────────────────

function checkAlert(forecast, alert) {
  const now = new Date();
  const windows = [];

  // Seskup hodiny po dnech
  const byDay = {};
  for (let i = 0; i < forecast.times.length; i++) {
    const t = forecast.times[i]; // "2026-06-20T14:00"
    const date = t.slice(0, 10);
    const hour = parseInt(t.slice(11, 13));
    const daysAhead = Math.floor((new Date(date) - new Date(now.toISOString().slice(0, 10))) / 86400000);
    if (daysAhead < 1 || daysAhead > alert.max_days_ahead) continue;
    if (!byDay[date]) byDay[date] = [];
    byDay[date].push({ hour, wind: forecast.windMs[i], gust: forecast.gustMs[i] });
  }

  for (const [date, hours] of Object.entries(byDay)) {
    // Víkend filtr
    if (alert.weekends_only) {
      const dow = new Date(date).getDay(); // 0=Ne, 6=So
      if (dow !== 0 && dow !== 6) continue;
    }
    // Denní hodiny (8–20) kde fouká dost
    const good = hours.filter(h => h.hour >= 8 && h.hour <= 20 && h.wind >= alert.min_wind_ms);
    if (good.length >= 2) {
      const avgWind = avg(good.map(h => h.wind));
      const maxGust = Math.max(...good.map(h => h.gust));
      windows.push({ date, hours: good.length, avgWind, maxGust });
    }
  }

  return windows;
}

// ── Email šablona ─────────────────────────────────────────────────────────

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long" });
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

const CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

exports.handler = async (event) => {
  // Ověření tajného klíče
  const secret = event.queryStringParameters?.secret;
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
      has_service_key: !!serviceKey,
      has_resend_key: !!resendKey,
    })};
  }

  // 1. Načti aktivní alerty
  const alerts = await sbGet(
    `${supabaseUrl}/rest/v1/alerts?active=eq.true&select=id,user_email,spot_id,min_wind_ms,max_days_ahead,weekends_only,last_sent_at`,
    serviceKey
  );

  if (!alerts.length) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ sent: 0, message: "no active alerts" }) };
  }

  // 2. Načti potřebné spoty
  const spotIds = [...new Set(alerts.map(a => a.spot_id))];
  const spotsData = await sbGet(
    `${supabaseUrl}/rest/v1/spots?id=in.(${spotIds.map(id => `"${id}"`).join(",")})&select=id,name,lat,lon,windguru_url`,
    serviceKey
  );
  const spotMap = Object.fromEntries(spotsData.map(s => [s.id, s]));

  // 3. Načti forecasty
  const forecastMap = {};
  const forecastErrors = {};
  await Promise.all(spotIds.map(async (id) => {
    const spot = spotMap[id];
    if (!spot) { forecastErrors[id] = "spot not found in DB"; return; }
    try { forecastMap[id] = await getForecast(spot, supabaseUrl, serviceKey); }
    catch (e) { forecastErrors[id] = e.message; }
  }));

  // 4. Zkontroluj podmínky + seskup emaily
  const emailsToSend = {};
  const alertsToMark = [];
  const skipped = [];

  for (const alert of alerts) {
    // Neodesílat duplicitně (cooldown 20 hod) — v test režimu přeskočíme
    if (!testMode && alert.last_sent_at) {
      const age = Date.now() - new Date(alert.last_sent_at).getTime();
      if (age < 20 * 60 * 60 * 1000) { skipped.push({ id: alert.id, reason: "cooldown" }); continue; }
    }

    const forecast = forecastMap[alert.spot_id];
    if (!forecast) { skipped.push({ id: alert.id, reason: `no forecast: ${forecastErrors[alert.spot_id] ?? "unknown"}` }); continue; }

    const windows = testMode
      ? [{ date: new Date().toISOString().slice(0, 10), hours: 4, avgWind: alert.min_wind_ms + 1, maxGust: alert.min_wind_ms + 2 }]
      : checkAlert(forecast, alert);

    if (!windows.length) { skipped.push({ id: alert.id, reason: "no matching wind window" }); continue; }

    const spot = spotMap[alert.spot_id];
    if (!emailsToSend[alert.user_email]) emailsToSend[alert.user_email] = [];
    emailsToSend[alert.user_email].push({ spot, windows, alertId: alert.id });
  }

  // 5. Odešli emaily
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
          const body = await res.text();
          emailErrors.push({ email, status: res.status, body });
        }
      } catch (e) {
        emailErrors.push({ email, error: e.message });
      }
    }
  }

  // 6. Aktualizuj last_sent_at
  await Promise.all(alertsToMark.map(id =>
    sbPatch(
      `${supabaseUrl}/rest/v1/alerts?id=eq.${id}`,
      serviceKey,
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
