import { useEffect, useState } from "react";
import type { Settings } from "../lib/settings";
import { loadRecentLocations, addRecentLocation } from "../lib/settings";
import type { RecentLocation } from "../lib/settings";
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
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [recent, setRecent] = useState<RecentLocation[]>(() => loadRecentLocations());
  const [geoState, setGeoState] = useState<"idle" | "loading" | "error">("idle");
  const [geoMsg, setGeoMsg] = useState("");

  const set = (patch: Partial<Settings>) => onChange({ ...settings, ...patch });

  // Vybrání lokace z vyhledávání → nastav domov + ulož do posledních
  function pickLocation(name: string, lat: number, lon: number, country?: string) {
    set({ homeName: name, homeLat: lat, homeLon: lon });
    setRecent(addRecentLocation({ name, lat, lon, country }));
    setQuery("");
    setResults([]);
    setNoResults(false);
  }

  // „Použít moji polohu" přes prohlížečové Geolocation API
  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoState("error");
      setGeoMsg("Tvůj prohlížeč polohu nepodporuje. Použij vyhledávání níže.");
      return;
    }
    setGeoState("loading");
    setGeoMsg("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Reverzní geokódování (pěkný název) doplníme v BLOKU B přes ORS;
        // zatím ukážeme „Moje poloha" se souřadnicemi.
        set({
          homeName: `Moje poloha (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`,
          homeLat: latitude,
          homeLon: longitude,
        });
        setGeoState("idle");
      },
      (err) => {
        setGeoState("error");
        setGeoMsg(
          err.code === err.PERMISSION_DENIED
            ? "Přístup k poloze byl odmítnut. Povol ho v prohlížeči, nebo použij vyhledávání."
            : "Polohu se nepodařilo zjistit. Použij vyhledávání níže."
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  useEffect(() => {
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setNoResults(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const found = await searchPlace(query);
        setResults(found);
        setNoResults(found.length === 0);
      } catch {
        setResults([]);
        setNoResults(true);
      } finally {
        setSearching(false);
      }
    }, 300);
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

            <button
              className="btn btn-location"
              onClick={useMyLocation}
              disabled={geoState === "loading"}
            >
              {geoState === "loading" ? "Zjišťuji polohu…" : "📡 Použít moji polohu"}
            </button>
            {geoState === "error" && (
              <p className="warn-text small">⚠ {geoMsg}</p>
            )}

            <input
              className="text-input"
              placeholder="Hledej město nebo obec…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ marginTop: 10 }}
            />
            {searching && <div className="hint muted small">Hledám…</div>}
            {noResults && !searching && (
              <div className="hint muted small">Žádné výsledky. Zkus jiný název.</div>
            )}
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r, i) => (
                  <button
                    key={i}
                    className="search-result"
                    onClick={() => pickLocation(r.name, r.lat, r.lon, r.country)}
                  >
                    {r.name} <span className="muted">({r.country})</span>
                  </button>
                ))}
              </div>
            )}

            {recent.length > 0 && (
              <>
                <div className="hint muted small" style={{ marginTop: 10 }}>
                  Naposledy hledané:
                </div>
                <div className="preset-chips">
                  {recent.map((r) => (
                    <button
                      key={r.name}
                      className={
                        "chip" + (settings.homeName === r.name ? " active" : "")
                      }
                      onClick={() => pickLocation(r.name, r.lat, r.lon, r.country)}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* VZDÁLENOST */}
          <section>
            <label className="field-label">Řadit podle</label>
            <div className="preset-chips">
              {([
                ["straight", "Vzdušná čára"],
                ["drive_km", "Km autem"],
                ["drive_time", "Čas autem"],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  className={"chip" + (settings.distanceMetric === val ? " active" : "")}
                  onClick={() => set({ distanceMetric: val })}
                >
                  {label}
                </button>
              ))}
            </div>

            {settings.distanceMetric === "drive_time" ? (
              <>
                <label className="field-label">
                  Max čas autem: <b>{settings.maxDriveMin} min</b>
                </label>
                <input
                  type="range"
                  min={30}
                  max={360}
                  step={15}
                  value={settings.maxDriveMin}
                  onChange={(e) => set({ maxDriveMin: Number(e.target.value) })}
                />
                <div className="hint muted small">Maximální doba jízdy autem na spot.</div>
              </>
            ) : (
              <>
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
                <div className="hint muted small">
                  {settings.distanceMetric === "drive_km"
                    ? "Vzdálenost po silnici autem."
                    : "Vzdušnou čarou od domovského místa."}
                </div>
              </>
            )}
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
