// =============================================================
//  SEZNAM SPOTŮ  (uprav si je tady podle sebe!)
// -------------------------------------------------------------
//  Každý spot má:
//   - name:      jméno (zobrazí se v appce)
//   - region:    "CZ" = Česko, "DE" = Německo
//   - lat / lon: GPS souřadnice (zeměpisná šířka / délka)
//   - note:      krátká poznámka (nepovinné)
//
//  Přidání spotu: zkopíruj jeden blok { ... } a uprav jméno a GPS.
//  GPS najdeš na mapy.cz (pravý klik → „Co je tady?").
// =============================================================

// Rozsah směrů větru ve stupních (0–360), ODKUD vítr vane (0=S, 90=V, 180=J, 270=Z).
// Rozsah může „přejít přes nulu", např. { from: 340, to: 30 } = od SZ přes S po SV.
export interface DirRange {
  from: number;
  to: number;
}

export interface Spot {
  id: string;
  name: string;
  region: "CZ" | "DE";
  lat: number;
  lon: number;
  note?: string;
  windguru?: string; // odkaz na Windguru pro křížovou kontrolu
  // Z jakých směrů na spotu pěkně fouká (onshore/cross-on). Když prázdné,
  // appka jede jen podle síly a označí „směr neověřen".
  goodDirs?: DirRange[];
  // Nebezpečné směry (offshore = fouká od břehu na vodu). Hodina s takovým
  // směrem NIKDY není jezditelná, i kdyby foukalo skvěle.
  badDirs?: DirRange[];
}

export const SPOTS: Spot[] = [
  {
    id: "nechranice",
    name: "Nechranice",
    region: "CZ",
    lat: 50.388,
    lon: 13.27,
    note: "Největší a nejpopulárnější český spot.",
    windguru: "https://www.windguru.cz/2",
  },
  {
    id: "rozkos",
    name: "Rozkoš",
    region: "CZ",
    lat: 50.398,
    lon: 16.03,
    note: "Velká přehrada u České Skalice.",
    windguru: "https://www.windguru.cz/4",
  },
  {
    id: "labut",
    name: "Labuť",
    region: "CZ",
    lat: 49.453,
    lon: 13.97,
    note: "Rybník u Myštic (Blatensko). GPS si případně dolaď.",
    windguru: "https://www.windguru.cz/329646",
  },
  {
    id: "stepansky",
    name: "Štěpánský rybník",
    region: "CZ",
    lat: 49.782,
    lon: 13.755,
    note: "U Mýta na Rokycansku (kousek od D5). GPS si případně dolaď.",
    windguru: "https://www.windguru.cz/111",
  },
  {
    id: "berzdorfer",
    name: "Berzdorfer See",
    region: "DE",
    lat: 51.11,
    lon: 14.985,
    note: "U Görlitz, kousek za hranicemi.",
    windguru: "https://www.windguru.cz/235437",
  },
];
