import type { DistanceMetric } from "./settings";

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

// ----- Metrika vzdálenosti (vzdušná čára / km autem / čas autem) -----

export interface DistanceInfo {
  km: number; // vzdušná čára (vždy)
  driveKm?: number; // vzdálenost autem (jen když je načtena z ORS)
  driveMin?: number; // čas autem v minutách (jen když je načten z ORS)
}

// Čas autem ve čitelném formátu: "31 min" / "1 h 52 min".
export function fmtDriveMin(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// Text vzdálenosti na kartě spotu podle zvolené metriky.
// U auto-metrik ukáže km i čas autem; vzdušnou čáru jako fallback.
export function distanceLabel(metric: DistanceMetric, info: DistanceInfo): string {
  if (metric !== "straight" && info.driveKm != null && info.driveMin != null) {
    return `${Math.round(info.driveKm)} km · ~${fmtDriveMin(info.driveMin)} autem`;
  }
  return `${info.km} km`;
}

// Číselná hodnota pro řazení/filtrování podle metriky.
// Když auto-data ještě nejsou, odhadne z vzdušné čáry (80 km/h pro čas).
export function metricValue(metric: DistanceMetric, info: DistanceInfo): number {
  if (metric === "drive_km") return info.driveKm ?? info.km;
  if (metric === "drive_time") return info.driveMin ?? (info.km / 80) * 60;
  return info.km;
}

// Strop pro danou metriku (km nebo minuty).
export function metricMax(
  metric: DistanceMetric,
  maxDistanceKm: number,
  maxDriveMin: number
): number {
  return metric === "drive_time" ? maxDriveMin : maxDistanceKm;
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
  const data = await res.json() as { results?: { name: string; admin1?: string; latitude: number; longitude: number; country_code: string }[] };
  if (!data.results) return [];
  return data.results.map((r) => ({
    name: [r.name, r.admin1].filter(Boolean).join(", "),
    lat: r.latitude,
    lon: r.longitude,
    country: r.country_code,
  }));
}
