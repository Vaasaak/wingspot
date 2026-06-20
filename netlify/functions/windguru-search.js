// Serverless proxy pro hledání stanic Windguru.
// Podporuje hledání podle GPS (lat/lon) i podle názvu.
// Spouští se server-side → žádné CORS problémy.
const https = require("https");

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WingSpot/1.0)",
        Referer: "https://www.windguru.cz/",
        Accept: "application/json, text/plain, */*",
      },
    }, (res) => {
      let body = "";
      res.on("data", (d) => { body += d; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });
}

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

exports.handler = async (event) => {
  const { lat, lon, name } = event.queryStringParameters || {};

  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=3600",
  };

  // ---------- HLEDÁNÍ PODLE GPS ----------
  if (lat && lon) {
    const queries = [
      `https://www.windguru.cz/int/iapi.php?q=search&lat=${lat}&lon=${lon}&stype=station&lang=en`,
      `https://www.windguru.cz/int/iapi.php?q=nearest&lat=${lat}&lon=${lon}&lang=en`,
      `https://www.windguru.cz/int/iapi.php?q=search&lat=${lat}&lon=${lon}&lang=en`,
    ];

    for (const url of queries) {
      try {
        const res = await get(url);
        const raw = parseStations(res.body);
        if (raw.length === 0) continue;

        // Seřadit podle vzdálenosti a vzít nejbližší (max 25 km)
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
          return { statusCode: 200, headers: cors, body: JSON.stringify({ stations }) };
        }
      } catch { /* try next endpoint */ }
    }
    // Nic nenalezeno
    return { statusCode: 200, headers: cors, body: JSON.stringify({ stations: [] }) };
  }

  // ---------- HLEDÁNÍ PODLE NÁZVU (záloha) ----------
  if (!name) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "lat/lon or name required" }) };
  }

  const url = `https://www.windguru.cz/int/iapi.php?q=search&search=${encodeURIComponent(name)}&stype=station&lang=en`;
  try {
    const res = await get(url);
    const stations = parseStations(res.body).slice(0, 5).map(mapStation).filter((s) => s.url);
    return { statusCode: 200, headers: cors, body: JSON.stringify({ stations }) };
  } catch (e) {
    return { statusCode: 200, headers: cors, body: JSON.stringify({ stations: [], error: e.message }) };
  }
};
