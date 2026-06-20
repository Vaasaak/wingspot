#!/usr/bin/env node
/**
 * Importuje windsurfing/kite spoty z OpenStreetMap přes Overpass API.
 * Spusť: node scripts/import-osm-spots.mjs
 * Výstup: import-osm.sql → vlož do Supabase SQL Editor → Run
 *
 * Attribution: Data © OpenStreetMap contributors, ODbL 1.0
 * https://www.openstreetmap.org/copyright
 */

import { writeFileSync } from "fs";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Bounding box: Střední + Východní Evropa (jih,západ,sever,východ)
const BBOX = "43,6,56,26";

const QUERY = `[out:json][timeout:90];
(
  node["sport"="windsurfing"](${BBOX});
  node["sport"="kitesurfing"](${BBOX});
  node["sport"="kiteboarding"](${BBOX});
  way["sport"="windsurfing"](${BBOX});
  way["sport"="kitesurfing"](${BBOX});
  way["sport"="kiteboarding"](${BBOX});
);
out center;`;

// Existující spoty — přeskočíme spoty do 3 km od nich
const EXISTING = [
  { lat: 50.388,  lon: 13.270  }, // Nechranice
  { lat: 50.398,  lon: 16.030  }, // Rozkoš
  { lat: 49.453,  lon: 13.970  }, // Labuť
  { lat: 49.782,  lon: 13.755  }, // Štěpánský rybník
  { lat: 51.110,  lon: 14.985  }, // Berzdorfer See
];

function distKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Jednoduchá detekce státu podle bounding boxů
function detectCountry(lat, lon) {
  const BOXES = [
    { code: "CZ", s: 48.55, n: 51.06, w: 12.09, e: 18.87 },
    { code: "SK", s: 47.73, n: 49.61, w: 16.85, e: 22.56 },
    { code: "DE", s: 47.27, n: 55.09, w:  5.87, e: 15.04 },
    { code: "AT", s: 46.37, n: 49.02, w:  9.53, e: 17.16 },
    { code: "PL", s: 49.00, n: 54.84, w: 14.12, e: 24.15 },
    { code: "HU", s: 45.74, n: 48.58, w: 16.11, e: 22.90 },
    { code: "HR", s: 42.39, n: 46.55, w: 13.49, e: 19.43 },
    { code: "SI", s: 45.42, n: 46.88, w: 13.38, e: 16.60 },
    { code: "IT", s: 36.62, n: 47.09, w:  6.63, e: 18.52 },
    { code: "FR", s: 42.33, n: 51.12, w: -4.79, e:  8.23 },
    { code: "NL", s: 50.75, n: 53.56, w:  3.36, e:  7.23 },
    { code: "CH", s: 45.82, n: 47.81, w:  5.96, e: 10.49 },
    { code: "RS", s: 42.23, n: 46.19, w: 18.82, e: 22.99 },
    { code: "GR", s: 34.80, n: 41.75, w: 19.37, e: 29.65 },
    { code: "RO", s: 43.62, n: 48.27, w: 20.26, e: 29.72 },
    { code: "BG", s: 41.24, n: 44.22, w: 22.36, e: 28.61 },
    { code: "PT", s: 36.96, n: 42.15, w: -9.52, e: -6.19 },
    { code: "ES", s: 35.99, n: 43.79, w: -9.30, e:  4.33 },
    { code: "DK", s: 54.56, n: 57.75, w:  8.07, e: 15.20 },
    { code: "SE", s: 55.34, n: 55.99, w: 12.92, e: 14.16 },
  ];
  for (const b of BOXES) {
    if (lat >= b.s && lat <= b.n && lon >= b.w && lon <= b.e) return b.code;
  }
  return "EU";
}

function sql(s) {
  return s.replace(/'/g, "''");
}

async function main() {
  process.stderr.write("Stahuji data z Overpass API...\n");

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "WingSpot/1.0 (wingspot.netlify.app; vaclavhousa@gmail.com)",
    },
    body: new URLSearchParams({ data: QUERY }).toString(),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const json = await res.json();

  process.stderr.write(`Načteno elementů: ${json.elements.length}\n`);

  const raw = [];
  for (const el of json.elements) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;

    const name = el.tags?.name
      ?? el.tags?.["name:en"]
      ?? el.tags?.["name:cs"]
      ?? el.tags?.["name:de"];
    if (!name) continue; // bez jména přeskočíme

    const type = el.type === "way" ? "W" : "N";
    const osmId = `osm_${type}${el.id}`;

    raw.push({ osmId, lat, lon, name, sport: el.tags?.sport });
  }

  process.stderr.write(`S názvem: ${raw.length}\n`);

  // Přeskočit spoty blízko existujících (3 km)
  const filtered = raw.filter(s =>
    !EXISTING.some(e => distKm(s.lat, s.lon, e.lat, e.lon) < 3)
  );
  process.stderr.write(`Po odfiltrování existujících: ${filtered.length}\n`);

  // Deduplikace: odstraň spoty do 1,5 km od sebe (zachovej první)
  const deduped = [];
  for (const s of filtered) {
    if (!deduped.some(d => distKm(s.lat, s.lon, d.lat, d.lon) < 1.5)) {
      deduped.push(s);
    }
  }
  process.stderr.write(`Po deduplikaci: ${deduped.length}\n`);

  // Vygeneruj SQL
  const lines = [
    `-- ======================================================`,
    `-- OSM import: ${deduped.length} windsurfing/kite spotů`,
    `-- © OpenStreetMap contributors, ODbL 1.0`,
    `-- https://www.openstreetmap.org/copyright`,
    `-- Vygenerováno: ${new Date().toISOString()}`,
    `-- Spusť v Supabase SQL Editor`,
    `-- ======================================================`,
    ``,
  ];

  for (const s of deduped) {
    const country = detectCountry(s.lat, s.lon);
    const osmUrl = `https://www.openstreetmap.org/${s.osmId.replace("osm_N", "node/").replace("osm_W", "way/")}`;
    const note = `© OpenStreetMap contributors · ${osmUrl}`;

    lines.push(
      `INSERT INTO spots (id, name, country, lat, lon, note, status, trust)`,
      `VALUES (`,
      `  '${sql(s.osmId)}',`,
      `  '${sql(s.name)}',`,
      `  '${country}',`,
      `  ${s.lat.toFixed(6)},`,
      `  ${s.lon.toFixed(6)},`,
      `  '${sql(note)}',`,
      `  'approved',`,
      `  'verified_import'`,
      `) ON CONFLICT (id) DO NOTHING;`,
      ``,
    );
  }

  writeFileSync("import-osm.sql", lines.join("\n"), "utf8");
  process.stderr.write(`✓ Zapsáno do import-osm.sql (${deduped.length} spotů)\n`);
  process.stderr.write(`  → Otevři Supabase → SQL Editor → New query → vlož obsah souboru → Run\n`);
}

main().catch(e => {
  process.stderr.write(`Chyba: ${e.message}\n`);
  process.exit(1);
});
