// Nastavení appky – ukládá se do prohlížeče (localStorage), takže
// zůstane zachované i po zavření.

export interface Settings {
  homeName: string;
  homeLat: number;
  homeLon: number;
  maxDistanceKm: number; // jak daleko jsem ochotný jet
  minWindMs: number; // od kolika m/s je to "dost větru" (výchozí 6)
  minSessionHours: number; // kolik hodin musí foukat, aby to mělo smysl
  dayStartHour: number; // od kolika hodin počítáme den (např. 8:00)
  dayEndHour: number; // do kolika hodin (např. 20:00)
}

export const HOME_PRESETS: { name: string; lat: number; lon: number }[] = [
  { name: "Praha", lat: 50.0755, lon: 14.4378 },
  { name: "Brno", lat: 49.1951, lon: 16.6068 },
  { name: "Ostrava", lat: 49.8209, lon: 18.2625 },
  { name: "Plzeň", lat: 49.7384, lon: 13.3736 },
  { name: "Liberec", lat: 50.7663, lon: 15.0543 },
  { name: "Ústí nad Labem", lat: 50.661, lon: 14.0322 },
  { name: "Hradec Králové", lat: 50.2092, lon: 15.8328 },
  { name: "České Budějovice", lat: 48.9747, lon: 14.4744 },
  { name: "Olomouc", lat: 49.5938, lon: 17.2509 },
];

export const DEFAULT_SETTINGS: Settings = {
  homeName: "Praha",
  homeLat: 50.0755,
  homeLon: 14.4378,
  maxDistanceKm: 250,
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
