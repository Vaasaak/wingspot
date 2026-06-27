import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { searchApprovedSpots, getSpotsByIds } from "../lib/spotsDb";
import type { NearbySpotMatch } from "../lib/spotsDb";
import type { Session } from "@supabase/supabase-js";
import type { Spot } from "../data/spots";

interface Alert {
  id: string;
  spot_ids: string[];
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

  // id → název pro zobrazení uložených alertů (spot nemusí být v okruhu kolem domova)
  const [names, setNames] = useState<Record<string, string>>(
    () => Object.fromEntries(spots.map((s) => [s.id, s.name]))
  );

  // výběr spotů pro nový alert (multiselect)
  const [selected, setSelected] = useState<NearbySpotMatch[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NearbySpotMatch[]>([]);

  const [minWind, setMinWind] = useState(6);
  const [daysAhead, setDaysAhead] = useState(3);
  const [weekendsOnly, setWeekendsOnly] = useState(false);

  async function loadAlerts() {
    if (!supabase) return;
    const { data } = await supabase
      .from("alerts")
      .select("id,spot_ids,min_wind_ms,max_days_ahead,weekends_only,active")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true });
    const list = (data ?? []) as Alert[];
    setAlerts(list);
    setLoading(false);

    // dotáhni názvy spotů, které ještě neznáme
    const needed = [...new Set(list.flatMap((a) => a.spot_ids))].filter((id) => !names[id]);
    if (needed.length) {
      const fetched = await getSpotsByIds(needed);
      if (fetched.length) {
        setNames((prev) => ({ ...prev, ...Object.fromEntries(fetched.map((s) => [s.id, s.name])) }));
      }
    }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void loadAlerts(); }, []);

  // našeptávač spotů (DB, všechny schválené – ne jen okolí domova)
  useEffect(() => {
    const q = query.trim();
    const id = setTimeout(async () => {
      if (q.length < 2) { setResults([]); return; }
      const found = await searchApprovedSpots(q);
      const selIds = new Set(selected.map((s) => s.id));
      setResults(found.filter((r) => !selIds.has(r.id)));
    }, 300);
    return () => clearTimeout(id);
  }, [query, selected]);

  function addSpot(s: NearbySpotMatch) {
    setSelected((prev) => (prev.some((x) => x.id === s.id) ? prev : [...prev, s]));
    setNames((prev) => ({ ...prev, [s.id]: s.name }));
    setQuery("");
    setResults([]);
  }

  function removeSpot(id: string) {
    setSelected((prev) => prev.filter((s) => s.id !== id));
  }

  async function addAlert() {
    if (!supabase || selected.length === 0) return;
    setSaving(true);
    setErr("");
    const { error } = await supabase.from("alerts").insert({
      user_id: session.user.id,
      user_email: session.user.email,
      spot_ids: selected.map((s) => s.id),
      min_wind_ms: minWind,
      max_days_ahead: daysAhead,
      weekends_only: weekendsOnly,
      active: true,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setSelected([]);
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

  function spotNames(ids: string[]): string {
    return ids.map((id) => names[id] ?? id).join(", ");
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
                    <div style={{ fontWeight: 600, fontSize: "0.92rem" }}>{spotNames(a.spot_ids)}</div>
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

            <label className="field-label">Spoty <span className="muted small">— hledej a přidej víc</span></label>
            {selected.length > 0 && (
              <div className="preset-chips" style={{ marginTop: 6 }}>
                {selected.map((s) => (
                  <button key={s.id} type="button" className="chip active" onClick={() => removeSpot(s.id)}>
                    {s.name} ✕
                  </button>
                ))}
              </div>
            )}
            <input
              className="text-input"
              placeholder="Hledej spot podle názvu…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r) => (
                  <button key={r.id} className="search-result" onClick={() => addSpot(r)}>
                    {r.name}
                  </button>
                ))}
              </div>
            )}

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
              disabled={saving || selected.length === 0}
              style={{ marginTop: 14, width: "100%" }}
            >
              {saving ? "Ukládám…" : selected.length > 1 ? `Přidat alert (${selected.length} spotů)` : "Přidat alert"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
