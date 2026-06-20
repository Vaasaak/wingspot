/**
 * Ověří, které Open-Meteo modely vrátí data pro testovací spoty napříč Evropou.
 * Spuštění: node scripts/verify-models.mjs
 */

const CANDIDATE_MODELS = [
  "meteofrance_arome_france_hd",
  "meteofrance_arome_france",
  "icon_d2",
  "dmi_harmonie_arome_europe",
  "knmi_harmonie_arome_europe",
  "ukmo_uk_deterministic_2km",
  "metno_nordic",
  "meteofrance_arpege_europe",
  "icon_eu",
  "ecmwf_ifs025",
  "gfs_seamless",
];

const TEST_SPOTS = [
  { name: "Tarifa ES",      lat: 36.014, lon: -5.608 },
  { name: "Nechranice CZ",  lat: 50.388, lon:  13.27 },
  { name: "Brighton UK",    lat: 50.820, lon:  -0.137 },
  { name: "Hvide Sande DK", lat: 56.000, lon:   8.12 },
];

async function checkSpot(spot) {
  const loc = `&latitude=${spot.lat}&longitude=${spot.lon}&timezone=Europe%2FBerlin&wind_speed_unit=ms`;
  const url =
    `https://api.open-meteo.com/v1/forecast?hourly=wind_speed_10m` +
    `&models=${CANDIDATE_MODELS.join(",")}&forecast_days=2${loc}`;

  let data;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "WingSpot-model-verify/1.0" } });
    if (!res.ok) {
      console.error(`  HTTP ${res.status}: ${await res.text().then(t => t.slice(0, 120))}`);
      return null;
    }
    data = await res.json();
  } catch (e) {
    console.error(`  fetch error: ${e.message}`);
    return null;
  }

  const hourly = data.hourly ?? {};
  const results = {};
  for (const model of CANDIDATE_MODELS) {
    const vals = hourly[`wind_speed_10m_${model}`] ?? [];
    const nonNull = vals.filter(v => v !== null).length;
    results[model] = { total: vals.length, nonNull, ok: nonNull > 0 };
  }
  return results;
}

// Souhrn: pro každý model kolik spotů ho pokrývá
const coverage = Object.fromEntries(CANDIDATE_MODELS.map(m => [m, 0]));

for (const spot of TEST_SPOTS) {
  console.log(`\n${spot.name} (${spot.lat}, ${spot.lon}):`);
  const results = await checkSpot(spot);
  if (!results) continue;
  for (const [model, r] of Object.entries(results)) {
    const mark = r.ok ? "✓" : "✗";
    console.log(`  ${mark} ${model.padEnd(42)} ${r.ok ? `${r.nonNull}/${r.total} hodin` : "— žádná data"}`);
    if (r.ok) coverage[model]++;
  }
  await new Promise(r => setTimeout(r, 1200)); // rate-limit
}

console.log("\n=== SOUHRN — pokrytí testovacích spotů ===");
for (const [model, count] of Object.entries(coverage)) {
  const bar = "█".repeat(count) + "░".repeat(TEST_SPOTS.length - count);
  console.log(`  ${bar} ${count}/${TEST_SPOTS.length}  ${model}`);
}
