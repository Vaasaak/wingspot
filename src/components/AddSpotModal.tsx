import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { distanceKm, mapyCzUrl } from "../lib/geo";
import { findNearbyOrSimilarSpots } from "../lib/spotsDb";
import type { NearbySpotMatch } from "../lib/spotsDb";
import { sectorsToDirRanges } from "./WindCompass";
import {
  SpotForm, emptySpotForm, formToFacilities, spotFormValid,
  type SpotFormValues,
} from "./SpotForm";
import type { Session } from "@supabase/supabase-js";

interface Props {
  session: Session;
  onClose: () => void;
}

type NearMatch = NearbySpotMatch & { dist: number | null };

export function AddSpotModal({ session, onClose }: Props) {
  const [form, setForm] = useState<SpotFormValues>(() => emptySpotForm());
  const patch = (p: Partial<SpotFormValues>) => setForm((f) => ({ ...f, ...p }));

  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [nearbySpots, setNearbySpots] = useState<NearMatch[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);

  const valid = spotFormValid(form);
  const coords = form.coords;

  // Detekce duplicit: DB kolem nové polohy (do 5 km) i podle názvu. Debounce.
  useEffect(() => {
    const q = form.name.trim();
    const id = setTimeout(async () => {
      if (!coords && q.length < 3) {
        setNearbySpots([]);
        setConfirmDuplicate(false);
        return;
      }
      const matches = await findNearbyOrSimilarSpots(coords?.lat ?? null, coords?.lon ?? null, q);
      const withDist: NearMatch[] = matches
        .map((m) => ({ ...m, dist: coords ? distanceKm(coords.lat, coords.lon, m.lat, m.lon) : null }))
        .sort((a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9))
        .slice(0, 4);
      setNearbySpots(withDist);
      if (withDist.length === 0) setConfirmDuplicate(false);
    }, 400);
    return () => clearTimeout(id);
  }, [coords, form.name]);

  async function submit() {
    if (!supabase || !valid || !coords) return;
    if (nearbySpots.length > 0 && !confirmDuplicate) { setConfirmDuplicate(true); return; }
    setState("sending");

    const goodDirs = sectorsToDirRanges(form.sectors, "good");
    const badDirs = sectorsToDirRanges(form.sectors, "bad");

    const { error } = await supabase.from("spots").insert({
      name: form.name.trim(),
      country: form.country || "EU",
      lat: coords.lat,
      lon: coords.lon,
      note: form.note.trim() || null,
      windguru_url: form.windguru.trim() || null,
      good_dirs: goodDirs,
      bad_dirs: badDirs.length > 0 ? badDirs : null,
      facilities: formToFacilities(form),
      status: "pending",
      trust: "community",
      created_by: session.user.id,
    });
    if (error) { setState("error"); setMsg(error.message); }
    else setState("sent");
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
              <p>Díky! Spot odeslán ke schválení.<br />Zobrazí se po kontrole admina.</p>
              <button className="btn" onClick={onClose} style={{ marginTop: 14, width: "100%" }}>Zavřít</button>
            </div>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 10 }}>
                Nový spot se zobrazí po schválení. Odesíláš jako <b>{session.user.email}</b>.
              </p>

              <SpotForm value={form} onChange={patch} />

              {nearbySpots.length > 0 && (
                <div className="duplicate-warning" style={{ marginTop: 14 }}>
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
