// Znovupoužitelný formulář spotu — používá ho přidávání (AddSpotModal) i
// admin schvalování (ApproveSpotModal). Controlled: rodič drží `value` a
// dostává patche přes `onChange`.

import { SquareParking, Droplets, Utensils, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MapPicker } from "./MapPicker";
import { WindCompass, defaultSectors, dirRangesToSectors } from "./WindCompass";
import type { SectorState } from "./WindCompass";
import { CountrySelect } from "./CountrySelect";
import { guessCountry } from "../lib/countries";
import type { DirRange, SpotFacilities, ParkingPriceUnit } from "../data/spots";

export type ParkingVal = "free" | "paid" | "none" | undefined;

export interface SpotFormValues {
  name: string;
  country: string; // ISO kód
  coords: { lat: number; lon: number } | null;
  gpsText: string;
  windguru: string;
  note: string;
  sectors: SectorState[];
  parking: ParkingVal;
  parkingPrice: string;
  parkingUnit: ParkingPriceUnit;
  parkingCurrency: string;
  parkingNote: string;
  wc: boolean | undefined;
  refreshments: boolean | undefined;
  rental: boolean | undefined;
}

// eslint-disable-next-line react-refresh/only-export-components
export function emptySpotForm(): SpotFormValues {
  return {
    name: "", country: "", coords: null, gpsText: "", windguru: "", note: "",
    sectors: defaultSectors(),
    parking: undefined, parkingPrice: "", parkingUnit: "day", parkingCurrency: "CZK", parkingNote: "",
    wc: undefined, refreshments: undefined, rental: undefined,
  };
}

// Předvyplnění z DB spotu (admin editace).
export interface DbSpotForForm {
  name: string;
  country: string;
  lat: number;
  lon: number;
  windguru_url: string | null;
  note: string | null;
  good_dirs: DirRange[] | null;
  bad_dirs: DirRange[] | null;
  facilities: SpotFacilities | null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function spotToForm(s: DbSpotForForm): SpotFormValues {
  const f = s.facilities ?? {};
  return {
    name: s.name,
    country: s.country ?? "",
    coords: { lat: s.lat, lon: s.lon },
    gpsText: `${s.lat.toFixed(5)}, ${s.lon.toFixed(5)}`,
    windguru: s.windguru_url ?? "",
    note: s.note ?? "",
    sectors: dirRangesToSectors(s.good_dirs, s.bad_dirs),
    parking: f.parking,
    parkingPrice: f.parkingPrice != null ? String(f.parkingPrice) : "",
    parkingUnit: f.parkingPriceUnit ?? "day",
    parkingCurrency: f.parkingCurrency ?? "CZK",
    parkingNote: f.parkingNote ?? "",
    wc: f.wc,
    refreshments: f.refreshments,
    rental: f.rental,
  };
}

// Sestaví facilities objekt z hodnot formuláře (null když prázdné).
// eslint-disable-next-line react-refresh/only-export-components
export function formToFacilities(v: SpotFormValues): SpotFacilities | null {
  const f: SpotFacilities = {};
  if (v.parking !== undefined) f.parking = v.parking;
  if (v.parking === "paid") {
    const price = parseFloat(v.parkingPrice.replace(",", "."));
    if (!isNaN(price)) {
      f.parkingPrice = price;
      f.parkingPriceUnit = v.parkingUnit;
      f.parkingCurrency = v.parkingCurrency;
    }
    if (v.parkingNote.trim()) f.parkingNote = v.parkingNote.trim();
  }
  if (v.wc !== undefined) f.wc = v.wc;
  if (v.refreshments !== undefined) f.refreshments = v.refreshments;
  if (v.rental !== undefined) f.rental = v.rental;
  return Object.keys(f).length > 0 ? f : null;
}

// eslint-disable-next-line react-refresh/only-export-components
export function spotFormValid(v: SpotFormValues): boolean {
  return v.name.trim().length >= 2 && !!v.coords && v.sectors.some((s) => s === "good");
}

// Souřadnice z textu (Google Maps). Pokrytí celé Evropy.
function parseGps(raw: string): { lat: number; lon: number } | null {
  const s = raw.replace(/(\d),(\d)/g, "$1.$2").trim();
  const p = s.split(/[\s,]+/).filter(Boolean);
  if (p.length < 2) return null;
  const lat = parseFloat(p[0]);
  const lon = parseFloat(p[1]);
  if (isNaN(lat) || isNaN(lon) || lat < 27 || lat > 72 || lon < -25 || lon > 45) return null;
  return { lat, lon };
}

export function SpotForm({
  value,
  onChange,
}: {
  value: SpotFormValues;
  onChange: (patch: Partial<SpotFormValues>) => void;
}) {
  const { coords } = value;
  const gpsError = value.gpsText.trim().length > 3 && !coords;

  // Nastav souřadnice + (pokud země ještě není) ji odhadni podle GPS.
  function setCoords(lat: number, lon: number) {
    const patch: Partial<SpotFormValues> = {
      coords: { lat, lon },
      gpsText: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    };
    if (!value.country) {
      const g = guessCountry(lat, lon);
      if (g) patch.country = g;
    }
    onChange(patch);
  }

  function handleGpsText(val: string) {
    const parsed = parseGps(val);
    const patch: Partial<SpotFormValues> = { gpsText: val };
    if (parsed) {
      patch.coords = parsed;
      if (!value.country) {
        const g = guessCountry(parsed.lat, parsed.lon);
        if (g) patch.country = g;
      }
    }
    onChange(patch);
  }

  const FAC_ROWS: { key: string; Icon: LucideIcon; label: string; val: boolean | undefined; set: (v: boolean | undefined) => void }[] = [
    { key: "wc",           Icon: Droplets, label: "WC",          val: value.wc,           set: (v) => onChange({ wc: v }) },
    { key: "refreshments", Icon: Utensils, label: "Občerstvení", val: value.refreshments, set: (v) => onChange({ refreshments: v }) },
    { key: "rental",       Icon: Store,    label: "Půjčovna",    val: value.rental,       set: (v) => onChange({ rental: v }) },
  ];

  return (
    <>
      <label className="field-label" style={{ marginTop: 14 }}>Název spotu *</label>
      <input
        className="text-input"
        value={value.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="např. Máchovo jezero"
      />

      <label className="field-label" style={{ marginTop: 12 }}>Země</label>
      <CountrySelect value={value.country} onChange={(country) => onChange({ country })} />

      <label className="field-label" style={{ marginTop: 12 }}>
        Poloha * — <span className="muted">najdi místo nebo klikni na mapu</span>
      </label>
      <MapPicker lat={coords?.lat} lon={coords?.lon} onChange={setCoords} />
      <input
        className={"text-input" + (gpsError ? " input-error" : "")}
        value={value.gpsText}
        onChange={(e) => handleGpsText(e.target.value)}
        placeholder="nebo vlož z Google Maps: 50.388, 13.270"
        style={{ marginTop: 6 }}
      />
      {coords && <p className="gps-ok small">✓ {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}</p>}
      {gpsError && <p className="warn-text small">Souřadnice nerozpoznány.</p>}

      <label className="field-label" style={{ marginTop: 16 }}>
        Směr větru * <span className="muted small">— od které strany fouká dobře?</span>
      </label>
      <p className="muted small" style={{ marginTop: 2, marginBottom: 4 }}>
        Klikni na sektor: <b style={{ color: "#0ea5e9" }}>modrý</b> = vítr z té strany je vhodný (od vody),{" "}
        <b style={{ color: "#ef4444" }}>červený</b> = offshore (nebezpečný). Alespoň jeden modrý je povinný.
      </p>
      <WindCompass value={value.sectors} onChange={(sectors) => onChange({ sectors })} />

      <label className="field-label" style={{ marginTop: 16 }}>
        Windguru odkaz <span className="muted small">(volitelné)</span>
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="text-input"
          value={value.windguru}
          onChange={(e) => onChange({ windguru: e.target.value })}
          placeholder="https://www.windguru.cz/XXXXX"
          style={{ flex: 1 }}
        />
        {coords && (
          <a
            href={`https://www.windguru.cz/map/#zoom=12&lat=${coords.lat}&lng=${coords.lon}`}
            target="_blank" rel="noreferrer"
            className="windguru-link"
            style={{ marginTop: 0, padding: "9px 10px", whiteSpace: "nowrap" }}
            title="Najít spot na Windguru mapě"
          >🗺</a>
        )}
      </div>

      <label className="field-label" style={{ marginTop: 12 }}>Poznámka</label>
      <input
        className="text-input"
        value={value.note}
        onChange={(e) => onChange({ note: e.target.value })}
        placeholder="Přístup, parkování, okolí…"
      />

      <label className="field-label" style={{ marginTop: 16 }}>Vybavenost (volitelné)</label>
      <div className="facilities-form">
        <div className="fac-row">
          <span className="fac-label"><SquareParking size={15} /> Parkoviště</span>
          <div className="fac-chips">
            {(["free", "paid", "none"] as ParkingVal[]).map((v) => (
              <button key={v} type="button"
                className={"chip" + (value.parking === v ? " active" : "")}
                onClick={() => onChange({ parking: value.parking === v ? undefined : v })}
              >{v === "free" ? "Zdarma" : v === "paid" ? "Placené" : "Není"}</button>
            ))}
          </div>
        </div>
        {value.parking === "paid" && (
          <div className="parking-price">
            <div className="row" style={{ gap: 6 }}>
              <input
                className="text-input"
                type="number"
                inputMode="decimal"
                min={0}
                value={value.parkingPrice}
                onChange={(e) => onChange({ parkingPrice: e.target.value })}
                placeholder="cena"
                style={{ flex: 1, minWidth: 0 }}
              />
              <select
                className="text-input"
                value={value.parkingCurrency}
                onChange={(e) => onChange({ parkingCurrency: e.target.value })}
                style={{ width: "auto" }}
              >
                <option value="CZK">Kč</option>
                <option value="EUR">€</option>
                <option value="PLN">zł</option>
              </select>
              <select
                className="text-input"
                value={value.parkingUnit}
                onChange={(e) => onChange({ parkingUnit: e.target.value as ParkingPriceUnit })}
                style={{ width: "auto" }}
              >
                <option value="hour">/ hod</option>
                <option value="day">/ den</option>
                <option value="once">jednorázově</option>
              </select>
            </div>
            <input
              className="text-input"
              value={value.parkingNote}
              onChange={(e) => onChange({ parkingNote: e.target.value })}
              placeholder="poznámka k parkování (volitelné)"
              style={{ marginTop: 6 }}
            />
          </div>
        )}
        {FAC_ROWS.map(({ key, Icon, label, val, set }) => (
          <div key={key} className="fac-row">
            <span className="fac-label"><Icon size={15} /> {label}</span>
            <div className="fac-chips">
              <button type="button" className={"chip" + (val === true  ? " active" : "")} onClick={() => set(val === true  ? undefined : true)}>Ano</button>
              <button type="button" className={"chip" + (val === false ? " active" : "")} onClick={() => set(val === false ? undefined : false)}>Není</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
