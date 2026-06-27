import type { Rating } from "../lib/scoring";
import type { DistanceMetric } from "../lib/settings";
import { RATING_META, confidenceLabel } from "../lib/ui";
import {
  fmtWeekdayLong,
  fmtDayMonth,
  fmtWindow,
  fmtMs,
  isToday,
} from "../lib/format";
import { googleMapsNavUrl, distanceLabel } from "../lib/geo";

export interface WhereOption {
  final: number; // pořadové skóre (kvalita × vzdálenost)
  date: string;
  spotId: string;
  spotName: string;
  region: "CZ" | "DE";
  lat: number;
  lon: number;
  windowStart: number | null;
  windowEnd: number | null;
  avgMs: number;
  distanceKm: number;
  driveKm?: number;
  driveMin?: number;
  rating: Rating;
  confidence: number;
}

export function WhereToGo({
  options,
  homeLat,
  homeLon,
  distanceMetric,
  onSelectDay,
}: {
  options: WhereOption[];
  homeLat: number;
  homeLon: number;
  distanceMetric: DistanceMetric;
  onSelectDay: (date: string) => void;
}) {
  return (
    <section className="wtg">
      <h2 className="wtg-head">🏄 Kam vyrazit</h2>

      {options.length === 0 ? (
        <div className="wtg-empty">
          <span className="ns-icon">🌬️</span>
          <div>
            <div className="ns-title">Teď to nikde v dosahu nevypadá na jízdu</div>
            <div className="muted small">
              V příštích dnech nikde dostatečně nefouká. Zkus v ⚙ zvětšit
              vzdálenost nebo snížit práh větru. Předpověď po dnech je níže.
            </div>
          </div>
        </div>
      ) : (
        <div className="wtg-list">
          {options.map((o, i) => {
            const meta = RATING_META[o.rating];
            const when = isToday(o.date)
              ? "Dnes"
              : `${fmtWeekdayLong(o.date)} ${fmtDayMonth(o.date)}`;
            return (
              <div
                key={o.spotId + o.date}
                className={"wtg-card" + (o.rating === "great" ? " great" : "")}
                onClick={() => onSelectDay(o.date)}
                style={{ borderLeftColor: meta.color }}
              >
                <div className="wtg-rank">{i + 1}</div>
                <div className="wtg-body">
                  <div className="wtg-title">
                    {when} · {o.spotName}
                    {o.region === "DE" && (
                      <span className="flag" title="Německo">
                        {" "}🇩🇪
                      </span>
                    )}
                  </div>
                  <div className="wtg-sub">
                    {fmtWindow(o.windowStart, o.windowEnd)} · {fmtMs(o.avgMs)} ·{" "}
                    {distanceLabel(distanceMetric, {
                      km: o.distanceKm,
                      driveKm: o.driveKm,
                      driveMin: o.driveMin,
                    })}
                  </div>
                  <div className="wtg-meta">
                    <span className="rating-chip" style={{ background: meta.color }}>
                      {meta.emoji} {meta.label}
                    </span>
                    <span className="muted small">
                      spolehlivost {confidenceLabel(o.confidence)}
                    </span>
                  </div>
                </div>
                <a
                  className="wtg-nav"
                  href={googleMapsNavUrl(homeLat, homeLon, o.lat, o.lon)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Spustit navigaci autem"
                >
                  🧭 Navigovat
                </a>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
