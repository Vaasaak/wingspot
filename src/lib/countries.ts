// Seznam evropských zemí (ISO 3166-1 alpha-2 + český název + vlajka) pro
// výběr v SpotForm. Plus hrubý odhad země podle GPS (bbox), aby se dala
// předvyplnit — bez volání API / bez expozice klíče (ORS klíč je server-only).

export interface Country {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "AL", name: "Albánie", flag: "🇦🇱" },
  { code: "AD", name: "Andorra", flag: "🇦🇩" },
  { code: "AT", name: "Rakousko", flag: "🇦🇹" },
  { code: "BY", name: "Bělorusko", flag: "🇧🇾" },
  { code: "BE", name: "Belgie", flag: "🇧🇪" },
  { code: "BA", name: "Bosna a Hercegovina", flag: "🇧🇦" },
  { code: "BG", name: "Bulharsko", flag: "🇧🇬" },
  { code: "HR", name: "Chorvatsko", flag: "🇭🇷" },
  { code: "CY", name: "Kypr", flag: "🇨🇾" },
  { code: "CZ", name: "Česko", flag: "🇨🇿" },
  { code: "DK", name: "Dánsko", flag: "🇩🇰" },
  { code: "EE", name: "Estonsko", flag: "🇪🇪" },
  { code: "FO", name: "Faerské ostrovy", flag: "🇫🇴" },
  { code: "FI", name: "Finsko", flag: "🇫🇮" },
  { code: "FR", name: "Francie", flag: "🇫🇷" },
  { code: "DE", name: "Německo", flag: "🇩🇪" },
  { code: "GR", name: "Řecko", flag: "🇬🇷" },
  { code: "HU", name: "Maďarsko", flag: "🇭🇺" },
  { code: "IS", name: "Island", flag: "🇮🇸" },
  { code: "IE", name: "Irsko", flag: "🇮🇪" },
  { code: "IT", name: "Itálie", flag: "🇮🇹" },
  { code: "XK", name: "Kosovo", flag: "🇽🇰" },
  { code: "LV", name: "Lotyšsko", flag: "🇱🇻" },
  { code: "LI", name: "Lichtenštejnsko", flag: "🇱🇮" },
  { code: "LT", name: "Litva", flag: "🇱🇹" },
  { code: "LU", name: "Lucembursko", flag: "🇱🇺" },
  { code: "MT", name: "Malta", flag: "🇲🇹" },
  { code: "MD", name: "Moldavsko", flag: "🇲🇩" },
  { code: "MC", name: "Monako", flag: "🇲🇨" },
  { code: "ME", name: "Černá Hora", flag: "🇲🇪" },
  { code: "NL", name: "Nizozemsko", flag: "🇳🇱" },
  { code: "MK", name: "Severní Makedonie", flag: "🇲🇰" },
  { code: "NO", name: "Norsko", flag: "🇳🇴" },
  { code: "PL", name: "Polsko", flag: "🇵🇱" },
  { code: "PT", name: "Portugalsko", flag: "🇵🇹" },
  { code: "RO", name: "Rumunsko", flag: "🇷🇴" },
  { code: "RU", name: "Rusko", flag: "🇷🇺" },
  { code: "SM", name: "San Marino", flag: "🇸🇲" },
  { code: "RS", name: "Srbsko", flag: "🇷🇸" },
  { code: "SK", name: "Slovensko", flag: "🇸🇰" },
  { code: "SI", name: "Slovinsko", flag: "🇸🇮" },
  { code: "ES", name: "Španělsko", flag: "🇪🇸" },
  { code: "SE", name: "Švédsko", flag: "🇸🇪" },
  { code: "CH", name: "Švýcarsko", flag: "🇨🇭" },
  { code: "TR", name: "Turecko", flag: "🇹🇷" },
  { code: "UA", name: "Ukrajina", flag: "🇺🇦" },
  { code: "GB", name: "Velká Británie", flag: "🇬🇧" },
];

const BY_CODE: Record<string, Country> = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

export function countryByCode(code?: string | null): Country | undefined {
  return code ? BY_CODE[code] : undefined;
}

export function countryLabel(code?: string | null): string {
  const c = countryByCode(code);
  return c ? `${c.flag} ${c.name}` : (code ?? "—");
}

// Hrubý odhad země podle souřadnic (bbox). Best-effort pro předvyplnění —
// uživatel může ručně přepsat. Pořadí záleží (specifičtější dřív).
export function guessCountry(lat: number, lon: number): string | null {
  const boxes: [string, number, number, number, number][] = [
    // code, latMin, latMax, lonMin, lonMax
    ["PT", 36.8, 42.2, -9.6, -6.2],
    ["ES", 36.0, 43.8, -9.4, 3.4],
    ["GB", 49.9, 59.5, -8.2, 1.8],
    ["IE", 51.4, 55.4, -10.6, -5.9],
    ["FR", 42.3, 51.1, -4.8, 8.2],
    ["BE", 49.5, 51.5, 2.5, 6.4],
    ["NL", 50.7, 53.6, 3.3, 7.2],
    ["CH", 45.8, 47.8, 5.9, 10.5],
    ["AT", 46.3, 49.0, 9.5, 17.2],
    ["IT", 36.6, 47.1, 6.6, 18.6],
    ["CZ", 48.5, 51.1, 12.0, 18.9],
    ["SK", 47.7, 49.6, 16.8, 22.6],
    ["PL", 49.0, 54.9, 14.1, 24.2],
    ["DE", 47.2, 55.1, 5.8, 15.1],
    ["DK", 54.5, 57.8, 8.0, 15.2],
    ["NO", 57.9, 71.2, 4.5, 31.1],
    ["SE", 55.3, 69.1, 11.0, 24.2],
    ["FI", 59.7, 70.1, 20.5, 31.6],
    ["EE", 57.5, 59.7, 21.7, 28.2],
    ["LV", 55.6, 58.1, 20.9, 28.2],
    ["LT", 53.9, 56.5, 20.9, 26.9],
    ["HR", 42.3, 46.6, 13.4, 19.5],
    ["SI", 45.4, 46.9, 13.3, 16.6],
    ["GR", 34.8, 41.8, 19.3, 28.3],
    ["HU", 45.7, 48.6, 16.1, 22.9],
    ["RO", 43.6, 48.3, 20.2, 29.7],
    ["BG", 41.2, 44.2, 22.3, 28.6],
    ["TR", 35.8, 42.1, 25.6, 44.8],
  ];
  for (const [code, latMin, latMax, lonMin, lonMax] of boxes) {
    if (lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax) return code;
  }
  return null;
}
