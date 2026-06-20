/**
 * Jediný zdroj pravdy pro forecast logiku.
 * Importují: src/lib/weather.ts (přes Vite) + netlify/functions/*.js (Node ESM).
 *
 * Formát: plain ESM (.js), funguje v obou kontextech protože:
 *  - root package.json má "type": "module" → .js = ESM v Node i ve Vite
 *  - TypeScript typy jsou v forecast-core.d.ts
 *
 * processForecast(spotId, det, ens) bere JEDEN spot objekt (ne pole),
 * vrací SpotForecast vždy včetně windDir (vektorový průměr) a precip.
 */

// Pokrytí celé Evropy — regionální high-res modely automaticky vrací null
// mimo svůj doménu; vážený průměr je přeskočí. Ověřeno skriptem verify-models.mjs.
export const MODELS = [
  // Vysoké rozlišení – FR/CZ/UK/BeNeLux oblast
  { name: "meteofrance_arome_france_hd", weight: 5 },  // 1.5 km, FR + okolí
  { name: "meteofrance_arome_france",    weight: 5 },  // 2.5 km, FR/ES/UK/DE
  { name: "icon_d2",                     weight: 5 },  // 2 km, střední Evropa
  { name: "dmi_harmonie_arome_europe",   weight: 4 },  // 2 km, severní Evropa
  { name: "knmi_harmonie_arome_europe",  weight: 4 },  // 2 km, BeNeLux + okolí
  { name: "ukmo_uk_deterministic_2km",   weight: 4 },  // 2 km, UK + Irsko
  { name: "metno_nordic",                weight: 4 },  // 1 km, Skandinávie
  // Střední rozlišení – širší pokrytí
  { name: "meteofrance_arpege_europe",   weight: 2 },  // 11 km, celá Evropa
  { name: "icon_eu",                     weight: 2 },  // 7 km, celá Evropa (fallback)
  // Globální – spolehlivý střednědobý výhled
  { name: "ecmwf_ifs025",               weight: 1.5 }, // ~9 km, globál
  { name: "gfs_seamless",               weight: 1 },   // globál + delší dosah
];

export const DET_DAYS = 16;
export const ENS_DAYS = 22;

function avg(xs) {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.round((sorted.length - 1) * p);
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

/**
 * Zpracuje raw hourly data z Open-Meteo do SpotForecast objektu.
 * @param {string} spotId
 * @param {object} det  - hourly + daily objekt z forecast API (jeden spot, ne pole)
 * @param {object} ens  - hourly objekt z ensemble API (jeden spot, ne pole)
 * @returns {import("./forecast-core.js").SpotForecast}
 */
export function processForecast(spotId, det, ens) {
  const ensH = ens.hourly ?? {};
  const times = ensH.time ?? [];

  const memberKeys = Object.keys(ensH).filter(
    k => k === "wind_speed_10m" || k.startsWith("wind_speed_10m_member")
  );
  const memberArrays = memberKeys.map(k => ensH[k] ?? []);

  const detH     = det.hourly ?? {};
  const detTimes = detH.time ?? [];
  const mWind = MODELS.map(m => detH[`wind_speed_10m_${m.name}`]    ?? []);
  const mGust = MODELS.map(m => detH[`wind_gusts_10m_${m.name}`]    ?? []);
  const mDir  = MODELS.map(m => detH[`wind_direction_10m_${m.name}`] ?? []);
  const mPrec = MODELS.map(m => detH[`precipitation_${m.name}`]      ?? []);
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
        const v  = mWind[k][di]; if (typeof v  === "number") { wSum += v  * wt; wWt += wt; }
        const gv = mGust[k][di]; if (typeof gv === "number") { gSum += gv * wt; gWt += wt; }
        const dv = mDir[k][di];
        if (typeof dv === "number") {
          dx += Math.cos((dv * Math.PI) / 180) * wt;
          dy += Math.sin((dv * Math.PI) / 180) * wt;
          dWt += wt;
        }
        const pv = mPrec[k][di]; if (typeof pv === "number") { pSum += pv * wt; pWt += wt; }
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
      dir  = null;     // výhled nemá spolehlivý směr
      precipVal = 0;
      outlook = true;
    }

    windMs.push(wind);
    gustMs.push(gust);
    windDir.push(dir);
    precip.push(precipVal);
    isOutlook.push(outlook);
  }

  const dDaily = det.daily ?? {};
  const daily = (dDaily.time ?? []).map((date, i) => ({
    date,
    sunrise: dDaily.sunrise?.[i] ?? "",
    sunset:  dDaily.sunset?.[i]  ?? "",
  }));

  return { spotId, times, windMs, gustMs, windDir, precip, ensP25, ensP75, isOutlook, daily };
}
