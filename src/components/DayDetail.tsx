import type { Spot } from "../data/spots";
// Spot import is used in onReport callback type
import type { DayEval } from "../lib/scoring";
import type { DistanceMetric } from "../lib/settings";
import { fmtWeekdayLong, fmtDayMonth, fmtClock } from "../lib/format";
import { SpotRow } from "./SpotRow";

export interface SpotDay {
  spot: Spot;
  day: DayEval;
  distanceKm: number;
  driveKm?: number;
  driveMin?: number;
}

export function DayDetail({
  date,
  spotDays,
  minWindMs,
  distanceMetric,
  favorites,
  onToggleFav,
  onReport,
}: {
  date: string;
  spotDays: SpotDay[];
  minWindMs: number;
  distanceMetric: DistanceMetric;
  favorites: string[];
  onToggleFav: (id: string) => void;
  onReport?: (spot: Spot) => void;
}) {
  const sun = spotDays[0]?.day;
  const isOutlook = spotDays[0]?.day.outlook ?? false;
  const goodCount = spotDays.filter(
    (sd) => sd.day.rating === "good" || sd.day.rating === "great"
  ).length;

  return (
    <div className="day-detail">
      <div className="day-detail-head">
        <h2>
          {fmtWeekdayLong(date)} <span className="muted">{fmtDayMonth(date)}</span>
        </h2>
        <div className="day-detail-sub">
          {goodCount > 0 ? (
            <span className="good-count">
              ✅ {goodCount} {goodCount === 1 ? "jezditelný spot" : goodCount < 5 ? "jezditelné spoty" : "jezditelných spotů"}
            </span>
          ) : (
            <span className="muted">Zatím to nikde pořádně nefouká</span>
          )}
          {sun?.sunrise && (
            <span className="sun muted">
              ☀ {fmtClock(sun.sunrise)} – {fmtClock(sun.sunset)}
            </span>
          )}
          {isOutlook && (
            <span className="outlook-tag" title="Víc než 16 dní dopředu – jen orientační výhled z ansámblu">
              výhled · nízká spolehlivost
            </span>
          )}
        </div>
      </div>

      <div className="spot-list">
        {spotDays.map(({ spot, day, distanceKm, driveKm, driveMin }) => (
          <SpotRow
            key={spot.id}
            spot={spot}
            day={day}
            distanceKm={distanceKm}
            driveKm={driveKm}
            driveMin={driveMin}
            distanceMetric={distanceMetric}
            minWindMs={minWindMs}
            isFavorite={favorites.includes(spot.id)}
            onToggleFav={() => onToggleFav(spot.id)}
            onReport={onReport ? () => onReport(spot) : undefined}
          />
        ))}
        {spotDays.length === 0 && (
          <p className="empty muted">
            V tvém dosahu nejsou žádné spoty. Zkus zvětšit maximální vzdálenost
            v nastavení.
          </p>
        )}
      </div>
    </div>
  );
}
