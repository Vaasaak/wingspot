import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { Session } from "@supabase/supabase-js";
import type { Spot } from "../data/spots";

interface Alert {
  id: string;
  spot_id: string;
  min_wind_ms: number;
  max_days_ahead: number;
  weekends_only: boolean;
  active: boolean;
}

interface Props {
  session: Session;
  spots: Spot[];
  onClose: () => void;
}

export function AlertsModal({ session, spots, onClose }: Props) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [spotId, setSpotId] = useState(spots[0]?.id ?? "");
  const [minWind, setMinWind] = useState(6);
  const [daysAhead, setDaysAhead] = useState(3);
  const [weekendsOnly, setWeekendsOnly] = useState(false);

  const approvedSpots = spots;

  async function loadAlerts() {
    if (!supabase) return;
    const { data } = await supabase
      .from("alerts")
      .select("id,spot_id,min_wind_ms,max_days_ahead,weekends_only,active")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true });
    setAlerts((data ?? []) as Alert[]);
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadAlerts(); }, []);

  async function addAlert() {
    if (!supabase || !spotId) return;
    setSaving(true);
    setErr("");
    const { error } = await supabase.from("alerts").insert({
      user_id: session.user.id,
      user_email: session.user.email,
      spot_id: spotId,
      min_wind_ms: minWind,
      max_days_ahead: daysAhead,
      weekends_only: weekendsOnly,
      active: true,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    loadAlerts();
  }

  async function deleteAlert(id: string) {
    if (!supabase) return;
    await supabase.from("alerts").delete().eq("id", id);
    setAlerts((a) => a.filter((x) => x.id !== id));
  }

  async function toggleAlert(id: string, active: boolean) {
    if (!supabase) return;
    await supabase.from("alerts").update({ active }).eq("id", id);
    setAlerts((a) => a.map((x) => x.id === id ? { ...x, active } : x));
  }

  function spotName(id: string) {
    return spots.find((s) => s.id === id)?.name ?? id;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🔔 Alerty na vítr</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="muted small" style={{ marginTop: 8 }}>
            Jakmile se objeví vhodné podmínky, pošleme ti e-mail na <b>{session.user.email}</b>.
          </p>

          {/* Existující alerty */}
          {!loading && alerts.length > 0 && (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {alerts.map((a) => (
                <div key={a.id} className="pending-spot" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{spotName(a.spot_id)}</div>
                    <div className="muted small">
                      min {a.min_wind_ms} m/s · do {a.max_days_ahead} dní
                      {a.weekends_only ? " · jen víkendy" : ""}
                    </div>
                  </div>
                  <button
                    className={"chip" + (a.active ? " active" : "")}
                    onClick={() => toggleAlert(a.id, !a.active)}
                    style={{ fontSize: "0.78rem" }}
                  >
                    {a.active ? "Aktivní" : "Vypnutý"}
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => deleteAlert(a.id)}
                    title="Smazat alert"
                    style={{ fontSize: "1rem" }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {!loading && alerts.length === 0 && (
            <p className="muted small" style={{ marginTop: 12 }}>Zatím žádné alerty.</p>
          )}

          {/* Nový alert */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div className="field-label" style={{ marginBottom: 10, fontSize: "0.92rem", fontWeight: 600 }}>
              + Nový alert
            </div>

            <label className="field-label">Spot</label>
            <select className="text-input" value={spotId} onChange={(e) => setSpotId(e.target.value)}>
              {approvedSpots.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <label className="field-label" style={{ marginTop: 12 }}>
              Minimální vítr: <b>{minWind} m/s</b>
            </label>
            <input
              type="range" min={4} max={12} step={0.5}
              value={minWind}
              onChange={(e) => setMinWind(parseFloat(e.target.value))}
              style={{ width: "100%", marginTop: 4 }}
            />
            <div className="muted small" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>4 m/s</span><span>12 m/s</span>
            </div>

            <label className="field-label" style={{ marginTop: 12 }}>
              Kolik dní dopředu: <b>{daysAhead}</b>
            </label>
            <input
              type="range" min={1} max={7} step={1}
              value={daysAhead}
              onChange={(e) => setDaysAhead(parseInt(e.target.value))}
              style={{ width: "100%", marginTop: 4 }}
            />
            <div className="muted small" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>1 den</span><span>7 dní</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                className={"chip" + (weekendsOnly ? " active" : "")}
                onClick={() => setWeekendsOnly((v) => !v)}
              >
                Jen víkendy
              </button>
              <span className="muted small">
                {weekendsOnly ? "Hlídat jen So + Ne" : "Hlídat každý den"}
              </span>
            </div>

            {err && <p className="warn-text small" style={{ marginTop: 8 }}>⚠ {err}</p>}

            <button
              className="btn"
              onClick={addAlert}
              disabled={saving || !spotId}
              style={{ marginTop: 14, width: "100%" }}
            >
              {saving ? "Ukládám…" : "Přidat alert"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
