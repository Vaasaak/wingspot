import { useState, useEffect } from "react";
import { SquareParking, Droplets, Utensils, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "../lib/supabase";
import { distanceKm } from "../lib/geo";
import { MapPicker } from "./MapPicker";
import type { Session } from "@supabase/supabase-js";
import type { Spot, SpotFacilities } from "../data/spots";

interface Props {
  session: Session;
  existingSpots: Spot[];
  onClose: () => void;
}

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

export function AddSpotModal({ session, existingSpots, onClose }: Props) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState<"CZ" | "DE">("CZ");
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsText, setGpsText] = useState("");
  const [note, setNote] = useState("");
  const [windguru, setWindguru] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [nearbySpot, setNearbySpot] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const [parking, setParking] = useState<ParkingVal>(undefined);
  const [wc, setWc] = useState<boolean | undefined>(undefined);
  const [refreshments, setRefreshments] = useState<boolean | undefined>(undefined);
  const [rental, setRental] = useState<boolean | undefined>(undefined);

  const gpsError = gpsText.trim().length > 3 && !coords;
  const valid = name.trim().length >= 2 && !!coords;

  function handleMapChange(lat: number, lon: number) {
    setCoords({ lat, lon });
    setGpsText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  }

  function handleGpsText(val: string) {
    setGpsText(val);
    const parsed = parseGps(val);
    if (parsed) setCoords(parsed);
  }

  useEffect(() => {
    if (!coords) { setNearbySpot(null); setConfirmDuplicate(false); return; }
    const nearby = existingSpots
      .map((s) => ({ name: s.name, dist: distanceKm(coords.lat, coords.lon, s.lat, s.lon) }))
      .filter((x) => x.dist < 5)
      .sort((a, b) => a.dist - b.dist)[0];
    setNearbySpot(nearby ? `${nearby.name} (~${nearby.dist.toFixed(1)} km)` : null);
    if (!nearby) setConfirmDuplicate(false);
  }, [coords]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!supabase || !valid) return;
    if (nearbySpot && !confirmDuplicate) { setConfirmDuplicate(true); return; }
    setState("sending");

    const facilities: SpotFacilities = {};
    if (parking !== undefined) facilities.parking = parking;
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

              {nearbySpot && (
                <div className="duplicate-warning">
                  ⚠ Podobný spot v okolí: <b>{nearbySpot}</b>
                  {confirmDuplicate && <span className="muted"> — přidáš ho stejně?</span>}
                </div>
              )}

              <label className="field-label" style={{ marginTop: 12 }}>
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
                  : nearbySpot && !confirmDuplicate ? "Přidat i přesto ↵"
                  : "Odeslat ke schválení"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
