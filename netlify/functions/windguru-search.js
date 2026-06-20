// Serverless proxy: hledá stanici na Windguru podle názvu.
// Spouští se server-side → žádné CORS problémy.
// Volej: GET /.netlify/functions/windguru-search?name=Nechranice
const https = require("https");

function fetch(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; WingSpot/1.0)",
          Referer: "https://www.windguru.cz/",
          Accept: "application/json, text/plain, */*",
        },
      }, (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body }));
      })
      .on("error", reject);
  });
}

// Zkusí extrahovat pole stanic z různých formátů odpovědi Windguru.
function parseStations(body) {
  try {
    const data = JSON.parse(body);
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.result)) return data.result;
    if (Array.isArray(data?.stations)) return data.stations;
    if (Array.isArray(data?.spots)) return data.spots;
  } catch {
    // not JSON
  }
  return [];
}

exports.handler = async (event) => {
  const { name } = event.queryStringParameters || {};
  if (!name) {
    return { statusCode: 400, body: JSON.stringify({ error: "name required" }) };
  }

  const url = `https://www.windguru.cz/int/iapi.php?q=search&search=${encodeURIComponent(name)}&stype=station&lang=en`;

  try {
    const res = await fetch(url);
    const stations = parseStations(res.body);

    // Každá stanice má id nebo id_spot → URL = windguru.cz/{id}
    const mapped = stations.slice(0, 5).map((s) => {
      const id = s.id ?? s.id_spot ?? s.spot_id ?? null;
      return {
        id,
        name: s.name ?? s.spot_name ?? s.title ?? "",
        lat: s.lat ?? s.latitude ?? null,
        lon: s.lon ?? s.longitude ?? s.lng ?? null,
        url: id ? `https://www.windguru.cz/${id}` : null,
      };
    }).filter((s) => s.url);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
      body: JSON.stringify({ stations: mapped }),
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ stations: [], error: e.message }),
    };
  }
};
