import { useState } from "react";
import type { Spot } from "../data/spots";
import type { DayEval } from "../lib/scoring";
import { fmtMs, fmtWindow } from "../lib/format";
import { RATING_META, confidenceLabel } from "../lib/ui";
import { HourlyChart } from "./HourlyChart";

export function SpotRow({
  spot,
  day,
  distanceKm,
  minWindMs,
  isFavorite,
  onToggleFav,
}: {
  spot: Spot;
  day: DayEval;
  distanceKm: number;
  minWindMs: number;
  isFavorite: boolean;
  onToggleFav: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = RATING_META[day.rating];

  return (
    <div className="spot-row" style={{ borderLeftColor: meta.color }}>
      <div className="spot-main" onClick={() => setOpen((o) => !o)}>
        <button
          className={"fav-btn" + (isFavorite ? " on" : "")}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          title={isFavorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
        >
          {isFavorite ? "★" : "☆"}
        </button>

        <div className="spot-info">
          <div className="spot-name-line">
            <span className="spot-name">{spot.name}</span>
            <span className="spot-dist">{distanceKm} km</span>
            {spot.region === "DE" && <span className="flag" title="Německo">🇩🇪</span>}
            {day.outlook && <span className="outlook-tag">výhled</span>}
          </div>
          <div className="spot-stats">
            <span className="rating-chip" style={{ background: meta.color }}>
              {meta.emoji} {meta.label}
            </span>
            {day.goodHours > 0 ? (
              <>
                <span className="stat">⏱ {fmtWindow(day.windowStart, day.windowEnd)}</span>
                <span className="stat">
                  💨 {fmtMs(day.windowAvgMs)}{" "}
                  <span className="muted">(max {day.maxWindMs.toFixed(1)})</span>
                </span>
              </>
            ) : (
              <span className="stat muted">max {day.maxWindMs.toFixed(1)} m/s</span>
            )}
          </div>
        </div>

        <div className="spot-side">
          <div
            className="confidence"
            title={`Spolehlivost předpovědi: ${confidenceLabel(day.confidence)}`}
          >
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={"conf-dot" + (day.confidence >= (i + 1) / 3 ? " on" : "")}
              />
            ))}
          </div>
          {day.upside && day.rating !== "none" && (
            <span className="upside" title="Část modelů ukazuje vítr – předpověď se může zlepšit">
              ↑ může zesílit
            </span>
          )}
          <span className="expand">{open ? "▲" : "▼"}</span>
        </div>
      </div>

      {open && (
        <div className="spot-detail">
          <HourlyChart hours={day.hours} minWindMs={minWindMs} />
          <div className="spot-note">
            {spot.note && <p>{spot.note}</p>}
            <p className="muted small">
              Nárazy až {day.maxGustMs.toFixed(1)} m/s · spolehlivost{" "}
              {confidenceLabel(day.confidence)}
              {day.outlook && " · jen orientační výhled"}
              {day.upside && " · může se ještě zlepšit"}
            </p>
            {spot.windguru && (
              <a
                className="windguru-link"
                href={spot.windguru}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
              >
                Ověřit na Windguru ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
