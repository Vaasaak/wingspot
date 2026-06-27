// Vzdálenost a čas autem z polohy uživatele ke kandidátním spotům.
// Volá OpenRouteService Matrix API (1 request = vzdálenost i čas ke všem),
// klíč drží server (context.env.ORS_API_KEY). Výsledek cachuje v Supabase
// (silniční síť se nemění → TTL dny), aby se šetřil free tier ORS (2500/den).
//
// POST /api/drivematrix  body: { lat, lon, spots: [{ id, lat, lon }, ...] }
// → { "<spotId>": { distance_m, duration_s }, ... }

const ORS_MATRIX_URL = "https://api.openrouteservice.org/v2/matrix/driving-car";
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dní

function sbHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

function cors(env) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": env.SITE_URL ?? "*",
  };
}

// Malý stabilní hash množiny ID (pořadí nezávislé — ID předem seřadíme).
function hashIds(ids) {
  const joined = ids.join(",");
  let h = 0;
  for (let i = 0; i < joined.length; i++) {
    h = (Math.imul(31, h) + joined.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export async function onRequest(context) {
  const { request, env } = context;
  const headers = cors(env);

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400, headers });
  }

  const { lat, lon, spots } = body ?? {};
  if (typeof lat !== "number" || typeof lon !== "number" || !Array.isArray(spots) || spots.length === 0) {
    return new Response(JSON.stringify({ error: "lat, lon, spots[] required" }), { status: 400, headers });
  }

  // Seřaď spoty podle ID kvůli stabilnímu cache klíči.
  const sorted = [...spots].filter(s => s && s.id && typeof s.lat === "number" && typeof s.lon === "number")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!sorted.length) {
    return new Response(JSON.stringify({ error: "no valid spots" }), { status: 400, headers });
  }

  const supabaseUrl = env.VITE_SUPABASE_URL;
  const serviceKey  = env.SUPABASE_SERVICE_ROLE_KEY;
  const orsKey      = env.ORS_API_KEY;
  const cacheEnabled = !!(supabaseUrl && serviceKey);

  // Klíč = zaokrouhlená poloha (~1 km) + hash množiny spotů.
  const cacheKey = `${lat.toFixed(2)},${lon.toFixed(2)}:${hashIds(sorted.map(s => s.id))}`;

  // ── 1. Cache ──────────────────────────────────────────────────────────────
  if (cacheEnabled) {
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/drive_matrix_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=data,fetched_at`,
        { headers: sbHeaders(serviceKey) }
      );
      if (res.ok) {
        const rows = await res.json();
        if (rows.length && Date.now() - new Date(rows[0].fetched_at).getTime() < CACHE_TTL_MS) {
          return new Response(JSON.stringify(rows[0].data), {
            status: 200,
            headers: { ...headers, "X-Cache": "HIT" },
          });
        }
      }
    } catch { /* cache miss → pokračuj */ }
  }

  if (!orsKey) {
    return new Response(JSON.stringify({ error: "ORS_API_KEY not configured" }), { status: 500, headers });
  }

  // ── 2. ORS Matrix ─────────────────────────────────────────────────────────
  // ORS používá pořadí [lon, lat]. Source = poloha uživatele (index 0),
  // destinations = spoty (1..n). Vrátí distances (m) i durations (s).
  const locations = [[lon, lat], ...sorted.map(s => [s.lon, s.lat])];
  const destinations = sorted.map((_, i) => i + 1);

  let orsData;
  try {
    const res = await fetch(ORS_MATRIX_URL, {
      method: "POST",
      headers: { Authorization: orsKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        locations,
        sources: [0],
        destinations,
        metrics: ["distance", "duration"],
        units: "m",
      }),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `ORS ${res.status}`, detail: await res.text() }), { status: 502, headers });
    }
    orsData = await res.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 502, headers });
  }

  const dist = orsData?.distances?.[0] ?? [];
  const dur  = orsData?.durations?.[0] ?? [];
  const out = {};
  sorted.forEach((s, i) => {
    if (typeof dist[i] === "number" && typeof dur[i] === "number") {
      out[s.id] = { distance_m: Math.round(dist[i]), duration_s: Math.round(dur[i]) };
    }
  });

  // ── 3. Ulož do cache (fire-and-forget) ──────────────────────────────────────
  if (cacheEnabled) {
    fetch(`${supabaseUrl}/rest/v1/drive_matrix_cache`, {
      method: "POST",
      headers: { ...sbHeaders(serviceKey), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ cache_key: cacheKey, data: out, fetched_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  return new Response(JSON.stringify(out), { status: 200, headers: { ...headers, "X-Cache": "MISS" } });
}
