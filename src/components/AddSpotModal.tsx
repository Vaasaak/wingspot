import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";

interface Props {
  session: Session;
  onClose: () => void;
}

export function AddSpotModal({ session, onClose }: Props) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState<"CZ" | "DE">("CZ");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [note, setNote] = useState("");
  const [windguru, setWindguru] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  const latNum = parseFloat(lat.replace(",", "."));
  const lonNum = parseFloat(lon.replace(",", "."));
  const valid =
    name.trim().length >= 2 &&
    !isNaN(latNum) && latNum >= 40 && latNum <= 62 &&
    !isNaN(lonNum) && lonNum >= 8 && lonNum <= 26;

  async function submit() {
    if (!supabase || !valid) return;
    setState("sending");
    const { error } = await supabase.from("spots").insert({
      name: name.trim(),
      country,
      lat: latNum,
      lon: lonNum,
      note: note.trim() || null,
      windguru_url: windguru.trim() || null,
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
              <p>
                Díky! Spot byl odeslán ke schválení.<br />
                Zobrazí se v aplikaci po kontrole.
              </p>
              <button className="btn" onClick={onClose} style={{ marginTop: 14, width: "100%" }}>
                Zavřít
              </button>
            </div>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 10 }}>
                Nový spot se zobrazí v aplikaci až po schválení.
                Odesíláš jako <b>{session.user.email}</b>.
              </p>

              <label className="field-label" style={{ marginTop: 14 }}>Název spotu *</label>
              <input
                className="text-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Máchovo jezero"
              />

              <label className="field-label" style={{ marginTop: 12 }}>Země</label>
              <select
                className="text-input"
                value={country}
                onChange={(e) => setCountry(e.target.value as "CZ" | "DE")}
              >
                <option value="CZ">🇨🇿 Česko</option>
                <option value="DE">🇩🇪 Německo</option>
              </select>

              <label className="field-label" style={{ marginTop: 12 }}>GPS souřadnice *</label>
              <p className="muted small" style={{ margin: "0 0 6px" }}>
                Otevři{" "}
                <a href="https://maps.google.com" target="_blank" rel="noreferrer">
                  Google Maps
                </a>
                , klikni na místo pravým tlačítkem → zkopíruj souřadnice.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="text-input"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="Šířka (49.xxx)"
                  style={{ flex: 1 }}
                />
                <input
                  className="text-input"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  placeholder="Délka (13.xxx)"
                  style={{ flex: 1 }}
                />
              </div>

              <label className="field-label" style={{ marginTop: 12 }}>Poznámka</label>
              <input
                className="text-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Volitelně – popis, přístup, parkování…"
              />

              <label className="field-label" style={{ marginTop: 12 }}>Odkaz na Windguru</label>
              <input
                className="text-input"
                value={windguru}
                onChange={(e) => setWindguru(e.target.value)}
                placeholder="https://www.windguru.cz/XXXXX (volitelné)"
              />

              {state === "error" && (
                <p className="warn-text small">⚠ {msg}</p>
              )}

              <button
                className="btn"
                onClick={submit}
                disabled={state === "sending" || !valid}
                style={{ marginTop: 16, width: "100%" }}
              >
                {state === "sending" ? "Odesílám…" : "Odeslat ke schválení"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
