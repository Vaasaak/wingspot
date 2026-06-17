// Výpočet vzdálenosti mezi dvěma GPS body (vzdušnou čarou, v km).
// Tzv. haversine vzorec.

export function distanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // poloměr Země v km
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Vyhledání místa podle názvu (zdarma, přes Open-Meteo geocoding).
export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
  country: string;
}

export async function searchPlace(query: string): Promise<GeoResult[]> {
  if (!query.trim()) return [];
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(query) +
    "&count=6&language=cs&format=json";
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  if (!data.results) return [];
  return data.results.map((r: any) => ({
    name: [r.name, r.admin1].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
    country: r.country_code,
  }));
}
