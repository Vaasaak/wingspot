import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { distanceKm } from "../lib/geo";
import type { Session } from "@supabase/supabase-js";
import type { Spot, SpotFacilities } from "../data/spots";

interface Props {
  session: Session;
  existingSpots: Spot[];
  onClose: () => void;
}

// Parses "lat, lon" pasted from Google Maps (handles Czech decimal commas too)
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
  const [gps, setGps] = useState("");
  const [note, setNote] = useState("");
  const [windguru, setWindguru] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [nearbyWarning, setNearbyWarning] = useState<string | null>(null);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  // Amenities
  const [parking, setParking] = useState<ParkingVal>(undefined);
  const [wc, setWc] = useState<boolean | undefined>(undefined);
  const [refreshments, setRefreshments] = useState<boolean | undefined>(undefined);
  const [shade, setShade] = useState<boolean | undefined>(undefined);
  const [rental, setRental] = useState<boolean | undefined>(undefined);

  const coords = gps.trim() ? parseGps(gps) : null;
  const gpsError = gps.trim().length > 3 && !coords;
  const valid = name.trim().length >= 2 && !!coords;

  // Check for nearby existing spots when GPS changes
  useEffect(() => {
    if (!coords) { setNearbyWarning(null); setConfirmDuplicate(false); return; }
    const nearby = existingSpots
      .map((s) => ({ spot: s, dist: distanceKm(coords.lat, coords.lon, s.lat, s.lon) }))
      .filter((x) => x.dist < 5)
      .sort((a, b) => a.dist - b.dist);
    if (nearby.length > 0) {
      const { spot, dist } = nearby[0];
      setNearbyWarning(`Podobný spot v okolí: ${spot.name} (~${dist.toFixed(1)} km daleko)`);
    } else {
      setNearbyWarning(null);
      setConfirmDuplicate(false);
    }
  }, [gps, existingSpots]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (!supabase || !valid) return;
    if (nearbyWarning && !confirmDuplicate) {
      setConfirmDuplicate(true);
      return;
    }
    setState("sending");

    const facilities: SpotFacilities = {};
    if (parking !== undefined) facilities.parking = parking;
    if (wc !== undefined) facilities.wc = wc;
    if (refreshments !== undefined) facilities.refreshments = refreshments;
    if (shade !== undefined) facilities.shade = shade;
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
    if (error) {
      setState("error");
      setMsg(error.message);
    } else {
      setState("sent");
    }
  }

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
              <p>Díky! Spot byl odeslán ke schválení.<br />Zobrazí se po kontrole admina.</p>
              <button className="btn" onClick={onClose} style={{ marginTop: 14, width: "100%" }}>Zavřít</button>
            </div>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 10 }}>
                Nový spot se zobrazí po schválení. Odesíláš jako <b>{session.user.email}</b>.
              </p>

              {/* Název */}
              <label className="field-label" style={{ marginTop: 14 }}>Název spotu *</label>
              <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="např. Máchovo jezero" />

              {/* Země */}
              <label className="field-label" style={{ marginTop: 12 }}>Země</label>
              <select className="text-input" value={country} onChange={(e) => setCountry(e.target.value as "CZ" | "DE")}>
                <option value="CZ">🇨🇿 Česko</option>
                <option value="DE">🇩🇪 Německo</option>
              </select>

              {/* GPS — single field */}
              <label className="field-label" style={{ marginTop: 12 }}>GPS souřadnice *</label>
              <p className="muted small" style={{ margin: "0 0 6px" }}>
                Otevři{" "}
                <a href="https://maps.google.com" target="_blank" rel="noreferrer">Google Maps</a>
                , klikni na místo pravým tlačítkem → zkopíruj souřadnice a vlož sem.
              </p>
              <input
                className={"text-input" + (gpsError ? " input-error" : "")}
                value={gps}
                onChange={(e) => setGps(e.target.value)}
                placeholder="50.388, 13.270"
              />
              {coords && <p className="gps-ok small">✓ {coords.lat.toFixed(5)}, {coords.lon.toFixed(5)}</p>}
              {gpsError && <p className="warn-text small">Souřadnice nerozpoznány — zkopíruj je přímo z Google Maps (pravý klik → čísla nahoře).</p>}

              {/* Upozornění na duplikát */}
              {nearbyWarning && (
                <div className="duplicate-warning">
                  <span>⚠ {nearbyWarning}</span>
                  {confirmDuplicate
                    ? <span className="muted small"> — OK, přidat stejně</span>
                    : <span className="muted small"> — stiskni Odeslat znovu pro potvrzení</span>}
                </div>
              )}

              {/* Poznámka */}
              <label className="field-label" style={{ marginTop: 12 }}>Poznámka</label>
              <input className="text-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Popis, přístup, parkování…" />

              {/* Windguru */}
              <label className="field-label" style={{ marginTop: 12 }}>
                Odkaz na Windguru{" "}
                <a href="https://www.windguru.cz/" target="_blank" rel="noreferrer" className="field-hint">
                  (najdi station →)
                </a>
              </label>
              <input className="text-input" value={windguru} onChange={(e) => setWindguru(e.target.value)} placeholder="https://www.windguru.cz/XXXXX (volitelné)" />

              {/* Vybavenost */}
              <label className="field-label" style={{ marginTop: 16 }}>Vybavenost (volitelné)</label>
              <div className="facilities-form">
                <div className="fac-row">
                  <span className="fac-label">🅿️ Parkoviště</span>
                  <div className="fac-chips">
                    {(["free", "paid", "none"] as ParkingVal[]).map((v) => (
                      <button key={v} type="button"
                        className={"chip" + (parking === v ? " active" : "")}
                        onClick={() => setParking(parking === v ? undefined : v)}
                      >
                        {v === "free" ? "Zdarma" : v === "paid" ? "Placené" : "Není"}
                      </button>
                    ))}
                  </div>
                </div>
                {(
                  [
                    { key: "wc",           icon: "🚻", label: "WC",           val: wc,           set: setWc },
                    { key: "refreshments", icon: "🍦", label: "Občerstvení",  val: refreshments, set: setRefreshments },
                    { key: "shade",        icon: "🌳", label: "Stín",         val: shade,        set: setShade },
                    { key: "rental",       icon: "🏄", label: "Půjčovna",     val: rental,       set: setRental },
                  ] as { key: string; icon: string; label: string; val: boolean | undefined; set: (v: boolean | undefined) => void }[]
                ).map(({ key, icon, label, val, set }) => (
                  <div key={key} className="fac-row">
                    <span className="fac-label">{icon} {label}</span>
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
                  : nearbyWarning && !confirmDuplicate ? "Přidat i přesto"
                  : "Odeslat ke schválení"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
