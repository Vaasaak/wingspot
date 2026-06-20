// Stahování předpovědi z Open-Meteo (zdarma, bez registrace).
//
// Architektura (3 vrstvy cache):
//  1. localStorage (30 min) — nejrychlejší, per-prohlížeč
//  2. Netlify funkce + Supabase cache (1 hod) — sdílená mezi uživateli
//  3. Přímé Open-Meteo batch (fallback pro lokální dev / výpadek funkce)
//
// Forecast logika (MODELS, processForecast) je v shared/forecast-core.js
// — jeden zdroj pravdy pro frontend i Netlify funkce.

import type { Spot } from "../data/spots";
import { MODELS, DET_DAYS, ENS_DAYS, processForecast } from "../../shared/forecast-core.js";

export type { SpotForecast } from "../../shared/forecast-core.js";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble";

const CACHE_KEY    = "wingspot-forecast-cache-v6";
const CACHE_TTL_MS = 30 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchArray(url: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Open-Meteo nedostupné (" + res.status + ")");
  const data = await res.json();
  return Array.isArray(data) ? data : [data];
}

// ── Přímý batch fetch z Open-Meteo (fallback) ─────────────────────────────

async function fetchDirectBatch(spots: Spot[]) {
  const lats = spots.map((s) => s.lat).join(",");
  const lons = spots.map((s) => s.lon).join(",");
  const loc  = `&latitude=${lats}&longitude=${lons}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;

  const detUrl =
    `${FORECAST_URL}?hourly=wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation` +
    `&daily=sunrise,sunset&models=${MODELS.map((m) => m.name).join(",")}&forecast_days=${DET_DAYS}${loc}`;
  const ensUrl =
    `${ENSEMBLE_URL}?hourly=wind_speed_10m&models=gfs05&forecast_days=${ENS_DAYS}${loc}`;

  const [det, ens] = await Promise.all([fetchArray(detUrl), fetchArray(ensUrl)]);
  return spots.map((spot, i) => processForecast(spot.id, det[i] ?? {}, ens[i] ?? {}));
}

// ── Per-spot fetch přes Netlify funkci (sdílená Supabase cache) ───────────

async function fetchViaFunction(spot: Spot) {
  const url = `/.netlify/functions/forecast?spotId=${encodeURIComponent(spot.id)}&lat=${spot.lat}&lon=${spot.lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`forecast function ${res.status}`);
  return res.json();
}

// ── Hlavní export ──────────────────────────────────────────────────────────

export async function fetchForecasts(
  spots: Spot[],
  force = false
): Promise<{ data: ReturnType<typeof processForecast>[]; fetchedAt: number }> {
  const sig = spots.map((s) => s.id).join(",");

  // Vrstva 1: localStorage (30 min)
  if (!force) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const c = JSON.parse(raw);
        if (Date.now() - c.fetchedAt < CACHE_TTL_MS && c.sig === sig) {
          return { data: c.data, fetchedAt: c.fetchedAt };
        }
      }
    } catch { /* ignore */ }
  }

  // Vrstva 2: Netlify funkce (Supabase cache 1 hod)
  let data: ReturnType<typeof processForecast>[];
  try {
    data = await Promise.all(spots.map(fetchViaFunction));
  } catch {
    // Vrstva 3: přímé Open-Meteo (fallback pro lokální dev / výpadek funkce)
    data = await fetchDirectBatch(spots);
  }

  const fetchedAt = Date.now();
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt, sig, data }));
  } catch { /* ignore */ }
  return { data, fetchedAt };
}
