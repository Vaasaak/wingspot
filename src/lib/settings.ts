// Nastavení appky – ukládá se do prohlížeče (localStorage), takže
// zůstane zachované i po zavření.

// Podle čeho se spoty řadí/filtrují: vzdušná čára, km autem, čas autem.
export type DistanceMetric = "straight" | "drive_km" | "drive_time";

export interface Settings {
  homeName: string;
  homeLat: number;
  homeLon: number;
  maxDistanceKm: number; // jak daleko jsem ochotný jet (km – pro vzdušnou čáru i km autem)
  maxDriveMin: number; // strop času autem (min – jen pro metriku "drive_time")
  distanceMetric: DistanceMetric; // jak měřit vzdálenost
  minWindMs: number; // od kolika m/s je to "dost větru" (výchozí 6)
  minSessionHours: number; // kolik hodin musí foukat, aby to mělo smysl
  dayStartHour: number; // od kolika hodin počítáme den (např. 8:00)
  dayEndHour: number; // do kolika hodin (např. 20:00)
}

export const DEFAULT_SETTINGS: Settings = {
  homeName: "Praha",
  homeLat: 50.0755,
  homeLon: 14.4378,
  maxDistanceKm: 250,
  maxDriveMin: 180,
  distanceMetric: "straight",
  minWindMs: 6,
  minSessionHours: 3,
  dayStartHour: 8,
  dayEndHour: 20,
};

const STORAGE_KEY = "wingspot-settings-v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

// ----- Oblíbené spoty -----
const FAV_KEY = "wingspot-favorites-v1";

export function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(ids: string[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

// ----- Posledních 5 vyhledaných lokací -----
// Ukládají se JEN lokace vybrané z vyhledávání (ne geolokace, ne výchozí).
export interface RecentLocation {
  name: string;
  lat: number;
  lon: number;
  country?: string;
}

const RECENT_KEY = "wingspot-recent-locations-v1";
const RECENT_MAX = 5;

export function loadRecentLocations(): RecentLocation[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Přidá lokaci na začátek, odstraní duplicitu podle názvu, ořízne na 5.
export function addRecentLocation(loc: RecentLocation): RecentLocation[] {
  const prev = loadRecentLocations().filter((r) => r.name !== loc.name);
  const next = [loc, ...prev].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}
