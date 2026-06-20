/**
 * Import wingfoil/kitesurfing/windsurfing spotů z OpenStreetMap pro celou Evropu.
 * Spuštění: node scripts/import-osm-spots.mjs
 * Výstup:   import-osm.sql  (idempotentní upsert, bezpečné spustit opakovaně)
 *
 * Strategie:
 *  - Evropa rozdělena na dlaždice 6°×6° (lat 27–72, lon -19–42) → ~130 dlaždic
 *  - Každá dlaždice = samostatný Overpass dotaz s timeout:90
 *  - Klastrovací radius 800 m (OSM mívá víc nodů pro jedno místo)
 *  - Deduplikace: body do 1.5 km od sebe sloučeny
 *  - Výstup: ON CONFLICT (source, osm_id) DO UPDATE → opakovatelný import
 */

import { writeFileSync } from "fs";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const LAT_MIN = 27, LAT_MAX = 72;
const LON_MIN = -19, LON_MAX = 42;
const TILE_SIZE = 6;

const HIGH_TRUST_TAGS = ["windsurfing", "kitesurfing", "kiteboarding"];
const LOW_TRUST_TAGS  = ["sailing"];

const CLUSTER_RADIUS_KM = 0.8;
const DEDUP_RADIUS_KM   = 1.5;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function buildQuery(s, w, n, e, tags) {
  const union = tags.flatMap(t => [
    `node["sport"="${t}"](${s},${w},${n},${e});`,
    `way["sport"="${t}"](${s},${w},${n},${e});`,
  ]).join("\n  ");
  return `[out:json][timeout:90];\n(\n  ${union}\n);\nout center;`;
}

async function queryTile(s, w, n, e, tags, retries = 3) {
  const body = new URLSearchParams({ data: buildQuery(s, w, n, e, tags) }).toString();
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "WingSpot-OSM-Importer/2.0 (https://wingspot.netlify.app)",
        },
        body,
      });
      if (res.status === 429 || res.status === 504) {
        await sleep(15000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return data.elements ?? [];
    } catch (e) {
      if (attempt === retries - 1) throw e;
      await sleep(8000 * (attempt + 1));
    }
  }
  return [];
}

function elementToPoint(el) {
  if (el.type === "node") return { lat: el.lat, lon: el.lon };
  if (el.type === "way" && el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

function guessCountry(lat, lon) {
  if (lon >= -9  && lon <  -1 && lat >= 36 && lat < 44) return "ES";
  if (lon >= -9  && lon <  -6 && lat >= 36 && lat < 42) return "PT";
  if (lon >= -3  && lon <   2.5 && lat > 50)            return "GB";
  if (lon >= 2.5 && lon <   8 && lat > 48)              return "FR";
  if (lon >= 6   && lon <  15 && lat >= 36 && lat < 46) return "IT";
  if (lon >= 6   && lon <  15 && lat > 46 && lat < 56)  return "DE";
  if (lon >= 12  && lon < 18.5 && lat > 48 && lat < 51.5) return "CZ";
  if (lon >= 14  && lon <  25 && lat > 47 && lat < 55)  return "PL";
  if (lon >= 13  && lon <  17 && lat >= 46 && lat < 49) return "AT";
  if (lon >= 4   && lon <   7 && lat >= 49 && lat < 52) return "BE";
  if (lon >= 3   && lon <   7.5 && lat >= 50 && lat < 54) return "NL";
  if (lon >= 8   && lon <  10.5 && lat >= 47 && lat < 48) return "CH";
  if (lon >= 8   && lon <  13 && lat >= 54 && lat < 58) return "DK";
  if (lon >= 10  && lon <  32 && lat >= 58 && lat < 72) return "NO";
  if (lon >= 20  && lon <  32 && lat >= 59 && lat < 71) return "FI";
  if (lon >= 18  && lon <  32 && lat >= 54 && lat < 59) return "SE";
  if (lon >= 21  && lon <  28 && lat >= 53 && lat < 57) return "LV";
  if (lon >= 21  && lon <  27 && lat >= 53 && lat < 56) return "LT";
  if (lon >= 23  && lon <  28 && lat >= 57 && lat < 60) return "EE";
  if (lon >= 14  && lon <  23 && lat >= 43 && lat < 50) return "SK";
  if (lon >= 13  && lon <  23 && lat >= 43 && lat < 47) return "HR";
  if (lon >= 14  && lon <  25 && lat >= 44 && lat < 47) return "RS";
  if (lon >= 20  && lon <  30 && lat >= 38 && lat < 43) return "GR";
  if (lon >= 26  && lon <  42 && lat >= 36 && lat < 42) return "TR";
  return "EU";
}

function clusterPoints(points) {
  const clusters = [];
  const used = new Set();
  for (let i = 0; i < points.length; i++) {
    if (used.has(i)) continue;
    const group = [points[i]];
    used.add(i);
    for (let j = i + 1; j < points.length; j++) {
      if (used.has(j)) continue;
      if (haversine(points[i].lat, points[i].lon, points[j].lat, points[j].lon) < CLUSTER_RADIUS_KM) {
        group.push(points[j]);
        used.add(j);
      }
    }
    const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
    const lon = group.reduce((s, p) => s + p.lon, 0) / group.length;
    const named = group.find(p => p.name);
    // high-trust wins over low-trust v shluku
    const trust = group.some(p => p.trust === "community_confirmed") ? "community_confirmed" : "community";
    clusters.push({ lat, lon, name: named?.name ?? null, osmId: named?.osmId ?? group[0].osmId, trust });
  }
  return clusters;
}

function dedup(points) {
  const out = [];
  for (const p of points) {
    if (!out.some(q => haversine(p.lat, p.lon, q.lat, q.lon) < DEDUP_RADIUS_KM)) {
      out.push(p);
    }
  }
  return out;
}

function escapeSql(s) {
  return s ? s.replace(/'/g, "''").slice(0, 100) : "";
}

// Generuj dlaždice
const tiles = [];
for (let lat = LAT_MIN; lat < LAT_MAX; lat += TILE_SIZE) {
  for (let lon = LON_MIN; lon < LON_MAX; lon += TILE_SIZE) {
    tiles.push([lat, lon, Math.min(lat + TILE_SIZE, LAT_MAX), Math.min(lon + TILE_SIZE, LON_MAX)]);
  }
}

console.log(`Celkem dlaždic: ${tiles.length}`);
console.log("Dotazuji Overpass API — každá dlaždice ~2× (high+low trust)");
console.log("Odhadovaný čas: 5–15 minut...\n");

const allPoints = [];
let tileIdx = 0;

for (const [s, w, n, e] of tiles) {
  tileIdx++;
  process.stdout.write(`\r[${tileIdx}/${tiles.length}] ${s},${w},${n},${e}   `);

  try {
    const hiEls = await queryTile(s, w, n, e, HIGH_TRUST_TAGS);
    for (const el of hiEls) {
      const pt = elementToPoint(el);
      if (pt) allPoints.push({ ...pt, name: el.tags?.name ?? null, osmId: String(el.id), trust: "community_confirmed" });
    }
    await sleep(800);
    const loEls = await queryTile(s, w, n, e, LOW_TRUST_TAGS);
    for (const el of loEls) {
      const pt = elementToPoint(el);
      if (pt) allPoints.push({ ...pt, name: el.tags?.name ?? null, osmId: String(el.id), trust: "community" });
    }
  } catch (e) {
    console.warn(`\nChyba na dlaždici ${s},${w},${n},${e}: ${e.message}`);
  }

  await sleep(1200); // rate-limit Overpass: ~40 req/min
}

console.log(`\n\nCelkem prvků z OSM: ${allPoints.length}`);
const clustered = clusterPoints(allPoints);
console.log(`Po klastrování (${CLUSTER_RADIUS_KM} km): ${clustered.length}`);
const deduped = dedup(clustered);
console.log(`Po deduplikaci (${DEDUP_RADIUS_KM} km): ${deduped.length}`);

const rows = deduped.map(p => {
  const name = p.name ? escapeSql(p.name) : `Spot ${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
  const country = guessCountry(p.lat, p.lon);
  return `  ('osm', '${p.osmId}', '${name}', '${country}', ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}, '${p.trust}')`;
});

const sql = `-- OSM import pro celou Evropu — vygenerováno ${new Date().toISOString()}
-- ${deduped.length} spotů (windsurfing + kitesurfing + kiteboarding + sailing)
-- Bezpečné spustit opakovaně: ON CONFLICT (source, osm_id) DO UPDATE
-- good_dirs/bad_dirs jsou null — v rankingu se lehce penalizují (dirUnverifiedPenalty).

insert into spots (source, osm_id, name, country, lat, lon, trust, status)
values
${rows.join(",\n")}
on conflict (source, osm_id) do update set
  name    = excluded.name,
  lat     = excluded.lat,
  lon     = excluded.lon,
  trust   = excluded.trust,
  status  = 'approved';
`;

writeFileSync("import-osm.sql", sql);
console.log(`\nHotovo → import-osm.sql (${deduped.length} spotů)`);
console.log("Spusť v Supabase SQL Editor: vlož obsah souboru → Run");
