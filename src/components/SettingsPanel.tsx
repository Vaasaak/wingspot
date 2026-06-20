import { useEffect, useState } from "react";
import type { Settings } from "../lib/settings";
import { HOME_PRESETS } from "../lib/settings";
import { searchPlace } from "../lib/geo";
import type { GeoResult } from "../lib/geo";

export function SettingsPanel({
  settings,
  onChange,
  onClose,
  onRefresh,
  fetchedAt,
  loading,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onRefresh: () => void;
  fetchedAt: number | null;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[]>([]);

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  useEffect(() => {
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        setResults(await searchPlace(query));
      } catch {
        setResults([]);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Nastavení</h2>
          <button className="icon-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* DOMOVSKÉ MÍSTO */}
          <section>
            <label className="field-label">Odkud vyrážím</label>
            <div className="home-current">📍 {settings.homeName}</div>
            <div className="preset-chips">
              {HOME_PRESETS.map((p) => (
                <button
                  key={p.name}
                  className={
                    "chip" + (settings.homeName === p.name ? " active" : "")
                  }
                  onClick={() =>
                    set({ homeName: p.name, homeLat: p.lat, homeLon: p.lon })
                  }
                >
                  {p.name}
                </button>
              ))}
            </div>
            <input
              className="text-input"
              placeholder="…nebo napiš jiné město / obec"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r, i) => (
                  <button
                    key={i}
                    className="search-result"
                    onClick={() => {
                      set({ homeName: r.name, homeLat: r.lat, homeLon: r.lon });
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    {r.name} <span className="muted">({r.country})</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* VZDÁLENOST */}
          <section>
            <label className="field-label">
              Maximální vzdálenost: <b>{settings.maxDistanceKm} km</b>
            </label>
            <input
              type="range"
              min={25}
              max={600}
              step={25}
              value={settings.maxDistanceKm}
              onChange={(e) => set({ maxDistanceKm: Number(e.target.value) })}
            />
            <div className="hint muted small">Vzdušnou čarou od domovského místa.</div>
          </section>

          {/* VÍTR */}
          <section>
            <label className="field-label">
              Dost větru od: <b>{settings.minWindMs} m/s</b>
            </label>
            <input
              type="range"
              min={3}
              max={15}
              step={1}
              value={settings.minWindMs}
              onChange={(e) => set({ minWindMs: Number(e.target.value) })}
            />
          </section>

          {/* DÉLKA OKNA */}
          <section>
            <label className="field-label">
              Musí foukat aspoň: <b>{settings.minSessionHours} h</b>
            </label>
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={settings.minSessionHours}
              onChange={(e) => set({ minSessionHours: Number(e.target.value) })}
            />
            <div className="hint muted small">
              Kratší foukání se bere jen jako „potenciál", ne jako jezditelný den.
            </div>
          </section>

          {/* DENNÍ OKNO */}
          <section>
            <label className="field-label">Počítat hodiny od–do</label>
            <div className="row">
              <select
                value={settings.dayStartHour}
                onChange={(e) => set({ dayStartHour: Number(e.target.value) })}
              >
                {Array.from({ length: 9 }, (_, i) => i + 4).map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
              <span className="muted">–</span>
              <select
                value={settings.dayEndHour}
                onChange={(e) => set({ dayEndHour: Number(e.target.value) })}
              >
                {Array.from({ length: 9 }, (_, i) => i + 14).map((h) => (
                  <option key={h} value={h}>
                    {h}:00
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* AKTUALIZACE */}
          <section className="refresh-section">
            <button className="btn" onClick={onRefresh} disabled={loading}>
              {loading ? "Stahuji…" : "↻ Aktualizovat předpověď"}
            </button>
            {fetchedAt && (
              <div className="muted small">
                Naposledy:{" "}
                {new Date(fetchedAt).toLocaleTimeString("cs-CZ", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                (data: Open-Meteo)
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
