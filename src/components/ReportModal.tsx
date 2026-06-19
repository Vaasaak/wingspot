import { useState } from "react";
import { supabase } from "../lib/supabase";
import type { Spot } from "../data/spots";

const ISSUES = [
  { id: "bad_location", label: "📍 Špatná poloha GPS" },
  { id: "wrong_name",   label: "✏️ Špatný název" },
  { id: "spot_closed",  label: "🚫 Spot je uzavřen / neexistuje" },
  { id: "bad_info",     label: "ℹ️ Špatné info (parkoviště, WC…)" },
  { id: "other",        label: "💬 Jiné" },
];

function parseGps(raw: string): { lat: number; lon: number } | null {
  const s = raw.replace(/(\d),(\d)/g, "$1.$2").trim();
  const p = s.split(/[\s,]+/).filter(Boolean);
  if (p.length < 2) return null;
  const lat = parseFloat(p[0]);
  const lon = parseFloat(p[1]);
  if (isNaN(lat) || isNaN(lon) || lat < 40 || lat > 62 || lon < 5 || lon > 32) return null;
  return { lat, lon };
}

export function ReportModal({ spot, onClose }: { spot: Spot; onClose: () => void }) {
  const [issues, setIssues] = useState<string[]>([]);
  const [gps, setGps] = useState("");
  const [name, setName] = useState("");
  const [windguru, setWindguru] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");

  function toggleIssue(id: string) {
    setIssues((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const parsedGps = gps.trim() ? parseGps(gps) : null;
  const gpsError = gps.trim() && !parsedGps;
  const valid = issues.length > 0;

  async function send() {
    if (!valid) return;
    setState("sending");
    const coords = parsedGps;
    const payload: Record<string, unknown> = {
      spot_id: spot.id,
      kind: "correction",
      issues,
      message: message.trim() || null,
      suggested_name: name.trim() || null,
      suggested_windguru_url: windguru.trim() || null,
      suggested_lat: coords?.lat ?? null,
      suggested_lon: coords?.lon ?? null,
    };
    if (supabase) {
      const { error } = await supabase.from("reports").insert(payload);
      if (error) { setState("error"); setErr(error.message); return; }
    }
    setState("sent");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>⚑ Nahlásit problém</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {state === "sent" ? (
            <div className="login-sent">
              <div style={{ fontSize: "2rem" }}>✅</div>
              <p>Díky! Hlášení bylo odesláno na kontrolu.</p>
              <button className="btn" onClick={onClose} style={{ marginTop: 14, width: "100%" }}>
                Zavřít
              </button>
            </div>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 10 }}>
                Spot: <b>{spot.name}</b>
              </p>

              <label className="field-label" style={{ marginTop: 14 }}>Co je špatně? *</label>
              <div className="issue-list">
                {ISSUES.map((iss) => (
                  <button
                    key={iss.id}
                    type="button"
                    className={"chip" + (issues.includes(iss.id) ? " active" : "")}
                    onClick={() => toggleIssue(iss.id)}
                  >
                    {iss.label}
                  </button>
                ))}
              </div>

              {(issues.includes("bad_location") || issues.includes("bad_info") || issues.includes("wrong_name")) && (
                <>
                  <label className="field-label" style={{ marginTop: 14 }}>Správné GPS (volitelné)</label>
                  <input
                    className={"text-input" + (gpsError ? " input-error" : "")}
                    value={gps}
                    onChange={(e) => setGps(e.target.value)}
                    placeholder="Vlož z Google Maps: 49.388, 13.270"
                  />
                  {gpsError && <p className="warn-text small">Souřadnice nerozpoznány. Zkopíruj je přímo z Google Maps.</p>}

                  {issues.includes("wrong_name") && (
                    <>
                      <label className="field-label" style={{ marginTop: 12 }}>Správný název (volitelné)</label>
                      <input
                        className="text-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Správný název spotu"
                      />
                    </>
                  )}

                  <label className="field-label" style={{ marginTop: 12 }}>Windguru odkaz (volitelné)</label>
                  <input
                    className="text-input"
                    value={windguru}
                    onChange={(e) => setWindguru(e.target.value)}
                    placeholder="https://www.windguru.cz/XXXXX"
                  />
                </>
              )}

              <label className="field-label" style={{ marginTop: 14 }}>Zpráva (volitelné)</label>
              <textarea
                className="text-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Popis problému nebo další informace…"
                rows={3}
                style={{ resize: "vertical" }}
              />

              {state === "error" && <p className="warn-text small">⚠ {err}</p>}

              <button
                className="btn"
                onClick={send}
                disabled={state === "sending" || !valid}
                style={{ marginTop: 16, width: "100%" }}
              >
                {state === "sending" ? "Odesílám…" : "Odeslat hlášení"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
