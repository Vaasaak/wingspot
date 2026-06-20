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

export interface SpotFacilities {
  parking?: "free" | "paid" | "none";
  wc?: boolean;
  refreshments?: boolean;
  rental?: boolean;
}

export interface Spot {
  id: string;
  name: string;
  region: "CZ" | "DE";
  lat: number;
  lon: number;
  note?: string;
  windguru?: string;
  goodDirs?: DirRange[];
  badDirs?: DirRange[];
  facilities?: SpotFacilities;
}

// TODO: Ověřte a opravte good_dirs/bad_dirs pro každý spot —
// hodnoty jsou přibližné (typické W/SW větry ve středních Čechách).
// Upravte přes EditSpotModal v admin panelu nebo přímo v supabase/schema.sql.
export const SPOTS: Spot[] = [
  {
    id: "nechranice",
    name: "Nechranice",
    region: "CZ",
    lat: 50.388,
    lon: 13.27,
    note: "Největší a nejpopulárnější český spot.",
    windguru: "https://www.windguru.cz/2",
    // Přehrada orientovaná Z-V; hlavní pláž na jihu; Z/SZ/JZ dobré
    goodDirs: [{ from: 210, to: 320 }],
    badDirs:  [{ from: 130, to: 210 }],
  },
  {
    id: "rozkos",
    name: "Rozkoš",
    region: "CZ",
    lat: 50.398,
    lon: 16.03,
    note: "Velká přehrada u České Skalice.",
    windguru: "https://www.windguru.cz/4",
    // Velká nádrž S-J; Z/JZ/SZ typicky vhodné
    goodDirs: [{ from: 200, to: 315 }],
    badDirs:  [{ from: 60, to: 160 }],
  },
  {
    id: "labut",
    name: "Labuť",
    region: "CZ",
    lat: 49.453,
    lon: 13.97,
    note: "Rybník u Myštic (Blatensko).",
    windguru: "https://www.windguru.cz/329646",
    goodDirs: [{ from: 200, to: 330 }],
  },
  {
    id: "stepansky",
    name: "Štěpánský rybník",
    region: "CZ",
    lat: 49.782,
    lon: 13.755,
    note: "U Mýta na Rokycansku (kousek od D5).",
    windguru: "https://www.windguru.cz/111",
    goodDirs: [{ from: 210, to: 330 }],
  },
  {
    id: "berzdorfer",
    name: "Berzdorfer See",
    region: "DE",
    lat: 51.11,
    lon: 14.985,
    note: "U Görlitz, kousek za hranicemi.",
    windguru: "https://www.windguru.cz/235437",
    goodDirs: [{ from: 220, to: 320 }],
    badDirs:  [{ from: 60, to: 150 }],
  },
];
