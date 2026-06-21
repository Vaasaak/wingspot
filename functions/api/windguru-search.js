function parseStations(body) {
  try {
    const data = JSON.parse(body);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.result)) return data.result;
    if (Array.isArray(data?.stations)) return data.stations;
    if (Array.isArray(data?.spots)) return data.spots;
  } catch { /* not JSON */ }
  return [];
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mapStation(s) {
  const id = s.id ?? s.id_spot ?? s.spot_id ?? null;
  return {
    id,
    name: s.name ?? s.spot_name ?? s.title ?? "",
    lat: parseFloat(s.lat ?? s.latitude ?? 0),
    lon: parseFloat(s.lon ?? s.longitude ?? s.lng ?? 0),
    url: id ? `https://www.windguru.cz/${id}` : null,
  };
}

const WGHEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; WingSpot/1.0)",
  Referer: "https://www.windguru.cz/",
  Accept: "application/json, text/plain, */*",
};

export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": env.SITE_URL ?? "*",
    "Cache-Control": "public, max-age=3600",
  };

  if (request.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  const params = new URL(request.url).searchParams;
  const lat  = params.get("lat");
  const lon  = params.get("lon");
  const name = params.get("name");

  // ---------- HLEDÁNÍ PODLE GPS ----------
  if (lat && lon) {
    const queries = [
      `https://www.windguru.cz/int/iapi.php?q=search&lat=${lat}&lon=${lon}&stype=station&lang=en`,
      `https://www.windguru.cz/int/iapi.php?q=nearest&lat=${lat}&lon=${lon}&lang=en`,
      `https://www.windguru.cz/int/iapi.php?q=search&lat=${lat}&lon=${lon}&lang=en`,
    ];

    for (const url of queries) {
      try {
        const res = await fetch(url, { headers: WGHEADERS });
        const raw = parseStations(await res.text());
        if (raw.length === 0) continue;

        const userLat = parseFloat(lat);
        const userLon = parseFloat(lon);
        const stations = raw
          .map(mapStation)
          .filter((s) => s.url && s.lat && s.lon)
          .map((s) => ({ ...s, distKm: haversine(userLat, userLon, s.lat, s.lon) }))
          .filter((s) => s.distKm < 25)
          .sort((a, b) => a.distKm - b.distKm)
          .slice(0, 3);

        if (stations.length > 0) {
          return new Response(JSON.stringify({ stations }), { status: 200, headers: corsHeaders });
        }
      } catch { /* try next endpoint */ }
    }
    return new Response(JSON.stringify({ stations: [] }), { status: 200, headers: corsHeaders });
  }

  // ---------- HLEDÁNÍ PODLE NÁZVU ----------
  if (!name) {
    return new Response(JSON.stringify({ error: "lat/lon or name required" }), { status: 400, headers: corsHeaders });
  }

  const url = `https://www.windguru.cz/int/iapi.php?q=search&search=${encodeURIComponent(name)}&stype=station&lang=en`;
  try {
    const res = await fetch(url, { headers: WGHEADERS });
    const stations = parseStations(await res.text()).slice(0, 5).map(mapStation).filter((s) => s.url);
    return new Response(JSON.stringify({ stations }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ stations: [], error: e.message }), { status: 200, headers: corsHeaders });
  }
}
