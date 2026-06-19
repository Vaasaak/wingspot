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

// Odkaz na navigaci autem z domovského místa na spot.
export function googleMapsNavUrl(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): string {
  return (
    "https://www.google.com/maps/dir/?api=1" +
    `&origin=${fromLat},${fromLon}&destination=${toLat},${toLon}` +
    "&travelmode=driving"
  );
}

// Odkaz na bod ve Mapy.cz.
export function mapyCzUrl(lat: number, lon: number): string {
  return `https://mapy.cz/zakladni?source=coor&id=${lon},${lat}&x=${lon}&y=${lat}&z=14`;
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
