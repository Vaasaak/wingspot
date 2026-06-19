import type { HourEval } from "../lib/scoring";
import { windColor } from "../lib/ui";

// Sloupcový graf větru po hodinách. Barva podle síly větru (modrá→zelená→žlutá→
// →červená), jezditelné hodiny (≥ práh) zvýrazněné. Nad každým sloupcem jsou
// hodnoty: nahoře nárazy (menší, šedé), pod tím vítr (tučně, m/s na 1 desetinu).
export function HourlyChart({
  hours,
  minWindMs,
}: {
  hours: HourEval[];
  minWindMs: number;
}) {
  if (hours.length === 0) return null;
  const maxVal = Math.max(minWindMs + 4, ...hours.map((h) => h.gustMs), 10);
  const thresholdPct = (minWindMs / maxVal) * 100;

  return (
    <div className="hchart">
      <div className="hchart-vals">
        {hours.map((h) => (
          <div className="hcolval" key={h.time}>
            <span className="hgustval">{h.gustMs.toFixed(1)}</span>
            <span
              className="hwindval"
              style={h.rideable ? { color: windColor(h.windMs) } : undefined}
            >
              {h.windMs.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      <div className="hchart-bars">
        <div
          className="hchart-threshold"
          style={{ bottom: `${thresholdPct}%` }}
          title={`Práh ${minWindMs} m/s`}
        />
        {hours.map((h) => {
          const windPct = (h.windMs / maxVal) * 100;
          const gustPct = (h.gustMs / maxVal) * 100;
          const c = windColor(h.windMs);
          return (
            <div
              className="hcol"
              key={h.time}
              title={`${h.hour}:00 — vítr ${h.windMs.toFixed(1)} m/s, nárazy ${h.gustMs.toFixed(1)} m/s`}
            >
              <div className="hgust" style={{ height: `${gustPct}%` }} />
              <div
                className={"hbar" + (h.rideable ? " ride" : "")}
                style={{ height: `${windPct}%`, background: c, color: c }}
              />
            </div>
          );
        })}
      </div>

      <div className="hchart-hours">
        {hours.map((h) => (
          <div className="hhour" key={h.time}>
            {h.precip > 0.1 && (
              <span className="rain" title={`déšť ${h.precip.toFixed(1)} mm`}>
                💧
              </span>
            )}
            <span>{h.hour}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
