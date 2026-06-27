import { useState, useEffect } from "react";
import { SquareParking, Droplets, Utensils, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { distanceKm, mapyCzUrl } from "../lib/geo";
import { findNearbyOrSimilarSpots } from "../lib/spotsDb";
import type { NearbySpotMatch } from "../lib/spotsDb";
import { MapPicker } from "./MapPicker";
import { WindCompass, sectorsToDirRanges, defaultSectors } from "./WindCompass";
import type { SectorState } from "./WindCompass";
import type { Session } from "@supabase/supabase-js";
import type { SpotFacilities, ParkingPriceUnit } from "../data/spots";

interface Props {
  session: Session;
  onClose: () => void;
}

type NearMatch = NearbySpotMatch & { dist: number | null };

function parseGps(raw: string): { lat: number; lon: number } | null {
  const s = raw.replace(/(\d),(\d)/g, "$1.$2").trim();
  const p = s.split(/[\s,]+/).filter(Boolean);
  if (p.length < 2) return null;
  const lat = parseFloat(p[0]);
  const lon = parseFloat(p[1]);
  if (isNaN(lat) || isNaN(lon) || lat < 40 || lat > 62 || lon < 5 || lon > 32) return null;
  return { lat, lon };
}

type ParkingVal = "free" | "paid" | "none" | undefined;

export function AddSpotModal({ session, onClose }: Props) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState<"CZ" | "DE">("CZ");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsText, setGpsText] = useState("");
  const [note, setNote] = useState("");
  const [windguru, setWindguru] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [nearbySpots, setNearbySpots] = useState<NearMatch[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const [parking, setParking] = useState<ParkingVal>(undefined);
  const [parkingPrice, setParkingPrice] = useState("");
  const [parkingUnit, setParkingUnit] = useState<ParkingPriceUnit>("day");
  const [parkingCurrency, setParkingCurrency] = useState("CZK");
  const [parkingNote, setParkingNote] = useState("");
  const [wc, setWc] = useState<boolean | undefined>(undefined);
  const [refreshments, setRefreshments] = useState<boolean | undefined>(undefined);
  const [rental, setRental] = useState<boolean | undefined>(undefined);
  const [windSectors, setWindSectors] = useState<SectorState[]>(defaultSectors);

  const gpsError = gpsText.trim().length > 3 && !coords;
  const hasGoodDir = windSectors.some(s => s === "good");
  const valid = name.trim().length >= 2 && !!coords && hasGoodDir;

  function handleMapChange(lat: number, lon: number) {
    setCoords({ lat, lon });
    setGpsText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  }

  function handleGpsText(val: string) {
    setGpsText(val);
    const parsed = parseGps(val);
    if (parsed) setCoords(parsed);
  }

  // Detekce duplicit: dotaž se DB (stejný zdroj jako appka) na schválené spoty
  // v okolí NOVÉ polohy (do 5 km) i podle podobnosti názvu. Debounce 400 ms.
  useEffect(() => {
    const q = name.trim();
    const id = setTimeout(async () => {
      if (!coords && q.length < 3) {
        setNearbySpots([]);
        setConfirmDuplicate(false);
        return;
      }
      const matches = await findNearbyOrSimilarSpots(coords?.lat ?? null, coords?.lon ?? null, q);
      const withDist: NearMatch[] = matches
        .map((m) => ({
          ...m,
          dist: coords ? distanceKm(coords.lat, coords.lon, m.lat, m.lon) : null,
        }))
        .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9))
        .slice(0, 4);
      setNearbySpots(withDist);
      if (withDist.length === 0) setConfirmDuplicate(false);
    }, 400);
    return () => clearTimeout(id);
  }, [coords, name]);

  async function submit() {
    if (!supabase || !valid) return;
    if (nearbySpots.length > 0 && !confirmDuplicate) { setConfirmDuplicate(true); return; }
    setState("sending");

    const facilities: SpotFacilities = {};
    if (parking !== undefined) facilities.parking = parking;
    if (parking === "paid") {
      const price = parseFloat(parkingPrice.replace(",", "."));
      if (!isNaN(price)) {
        facilities.parkingPrice = price;
        facilities.parkingPriceUnit = parkingUnit;
        facilities.parkingCurrency = parkingCurrency;
      }
      if (parkingNote.trim()) facilities.parkingNote = parkingNote.trim();
    }
    if (wc !== undefined) facilities.wc = wc;
    if (refreshments !== undefined) facilities.refreshments = refreshments;
    if (rental !== undefined) facilities.rental = rental;

    const { error } = await supabase.from("spots").insert({
      name: name.trim(),
      country,
      lat: coords!.lat,
      lon: coords!.lon,
      note: note.trim() || null,
      windguru_url: windguru.trim() || null,
      good_dirs: sectorsToDirRanges(windSectors, "good"),
      bad_dirs:  sectorsToDirRanges(windSectors, "bad").length > 0
                   ? sectorsToDirRanges(windSectors, "bad")
                   : null,
      facilities: Object.keys(facilities).length > 0 ? facilities : null,
      status: "pending",
      trust: "community",
      created_by: session.user.id,
    });
    if (error) { setState("error"); setMsg(error.message); }
    else setState("sent");
  }

  const FAC_ROWS: { key: string; Icon: LucideIcon; label: string; val: boolean | undefined; set: (v: boolean | undefined) => void }[] = [
    { key: "wc",           Icon: Droplets, label: "WC",          val: wc,           set: setWc },
    { key: "refreshments", Icon: Utensils, label: "Občerstvení", val: refreshments, set: setRefreshments },
    { key: "rental",       Icon: Store,    label: "Půjčovna",    val: rental,       set: setRental },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📍 Přidat spot</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {state === "sent" ? (
            <div className="login-sent">
              <div style={{ fontSize: "2rem" }}>✅</div>
              <p>Díky! Spot odeslán ke schválení.<br />Zobrazí se po kontrole admina.</p>
              <button className="btn" onClick={onClose} style={{ marginTop: 14, width: "100%" }}>Zavřít</button>
            </div>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 10 }}>
                Nový spot se zobrazí po schválení. Odesíláš jako <b>{session.user.email}</b>.
              </p>

              <label className="field-label" style={{ marginTop: 14 }}>Název spotu *</label>
              <input
                className="text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Máchovo jezero"
              />

              <label className="field-label" style={{ marginTop: 12 }}>Země</label>
              <select className="text-input" value={country} onChange={(e) => setCountry(e.target.value as "CZ" | "DE")}>
                <option value="CZ">Česko</option>
                <option value="DE">Německo</option>
              </select>

              <label className="field-label" style={{ marginTop: 12 }}>
                Poloha * — <span className="muted">najdi místo nebo klikni na mapu</span>
              </label>
              <MapPicker lat={coords?.lat} lon={coords?.lon} onChange={handleMapChange} />

              <input
                className={"text-input" + (gpsError ? " input-error" : "")}
                value={gpsText}
                onChange={(e) => handleGpsText(e.target.value)}
                placeholder="nebo vlož z Google Maps: 50.388, 13.270"
                style={{ marginTop: 6 }}
              />
              {coords && <p className="gps-ok small">✓ {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}</p>}
              {gpsError && <p className="warn-text small">Souřadnice nerozpoznány.</p>}

              {nearbySpots.length > 0 && (
                <div className="duplicate-warning">
                  <div>⚠ Tohle už možná existuje:</div>
                  <ul className="dup-list">
                    {nearbySpots.map((m) => (
                      <li key={m.id}>
                        <b>{m.name}</b>
                        {m.dist != null && <span className="muted"> · ~{m.dist.toFixed(1)} km</span>}{" "}
                        <a
                          href={mapyCzUrl(m.lat, m.lon)}
                          target="_blank"
                          rel="noreferrer"
                          className="dup-map"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📍 na mapě
                        </a>
                      </li>
                    ))}
                  </ul>
                  {confirmDuplicate && (
                    <div className="muted small">Žádný z nich? Přidej spot tlačítkem níže.</div>
                  )}
                </div>
              )}

              <label className="field-label" style={{ marginTop: 16 }}>
                Směr větru * <span className="muted small">— od které strany fouká dobře?</span>
              </label>
              <p className="muted small" style={{ marginTop: 2, marginBottom: 4 }}>
                Klikni na sektor: <b style={{ color: "#0ea5e9" }}>modrý</b> = vítr z té strany je vhodný (od vody),{" "}
                <b style={{ color: "#ef4444" }}>červený</b> = offshore (nebezpečný). Alespoň jeden modrý je povinný.
              </p>
              <WindCompass value={windSectors} onChange={setWindSectors} />

              <label className="field-label" style={{ marginTop: 16 }}>
                Windguru odkaz <span className="muted small">(volitelné)</span>
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="text-input"
                  value={windguru}
                  onChange={(e) => setWindguru(e.target.value)}
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
              {coords && !windguru && (
                <p className="muted small" style={{ marginTop: 4 }}>
                  Klikni 🗺 pro Windguru mapu v okolí — URL pak vlož sem.
                </p>
              )}

              <label className="field-label" style={{ marginTop: 12 }}>Poznámka</label>
              <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Přístup, parkování, okolí…" />

              <label className="field-label" style={{ marginTop: 16 }}>Vybavenost (volitelné)</label>
              <div className="facilities-form">
                <div className="fac-row">
                  <span className="fac-label"><SquareParking size={15} /> Parkoviště</span>
                  <div className="fac-chips">
                    {(["free", "paid", "none"] as ParkingVal[]).map((v) => (
                      <button key={v} type="button"
                        className={"chip" + (parking === v ? " active" : "")}
                        onClick={() => setParking(parking === v ? undefined : v)}
                      >{v === "free" ? "Zdarma" : v === "paid" ? "Placené" : "Není"}</button>
                    ))}
                  </div>
                </div>
                {parking === "paid" && (
                  <div className="parking-price">
                    <div className="row" style={{ gap: 6 }}>
                      <input
                        className="text-input"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={parkingPrice}
                        onChange={(e) => setParkingPrice(e.target.value)}
                        placeholder="cena"
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      <select
                        className="text-input"
                        value={parkingCurrency}
                        onChange={(e) => setParkingCurrency(e.target.value)}
                        style={{ width: "auto" }}
                      >
                        <option value="CZK">Kč</option>
                        <option value="EUR">€</option>
                        <option value="PLN">zł</option>
                      </select>
                      <select
                        className="text-input"
                        value={parkingUnit}
                        onChange={(e) => setParkingUnit(e.target.value as ParkingPriceUnit)}
                        style={{ width: "auto" }}
                      >
                        <option value="hour">/ hod</option>
                        <option value="day">/ den</option>
                        <option value="once">jednorázově</option>
                      </select>
                    </div>
                    <input
                      className="text-input"
                      value={parkingNote}
                      onChange={(e) => setParkingNote(e.target.value)}
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

              {state === "error" && <p className="warn-text small">⚠ {msg}</p>}

              <button
                className="btn"
                onClick={submit}
                disabled={state === "sending" || !valid}
                style={{ marginTop: 18, width: "100%" }}
              >
                {state === "sending" ? "Odesílám…"
                  : nearbySpots.length > 0 && !confirmDuplicate ? "Přidat i přesto ↵"
                  : "Odeslat ke schválení"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
