import { useState, type ReactNode } from "react";
import { SquareParking, Droplets, Utensils, Store, X } from "lucide-react";
import type { Spot } from "../data/spots";
import type { DayEval } from "../lib/scoring";
import type { DistanceMetric } from "../lib/settings";
import { distanceLabel } from "../lib/geo";
import { paidParkingLabel } from "../lib/facilities";
import { fmtMs, fmtWindow } from "../lib/format";
import { RATING_META, confidenceLabel } from "../lib/ui";
import { HourlyChart } from "./HourlyChart";

function FacChip({ icon, label, off }: { icon: ReactNode; label: string; off?: boolean }) {
  return (
    <span className={"fac-chip" + (off ? " fac-no" : "")}>
      {off ? <X size={11} /> : icon}
      {label}
    </span>
  );
}

export function SpotRow({
  spot,
  day,
  distanceKm,
  driveKm,
  driveMin,
  distanceMetric,
  minWindMs,
  isFavorite,
  onToggleFav,
  onReport,
}: {
  spot: Spot;
  day: DayEval;
  distanceKm: number;
  driveKm?: number;
  driveMin?: number;
  distanceMetric: DistanceMetric;
  minWindMs: number;
  isFavorite: boolean;
  onToggleFav: () => void;
  onReport?: () => void;
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
            <span className="spot-dist">
              {distanceLabel(distanceMetric, { km: distanceKm, driveKm, driveMin })}
            </span>
            {spot.region === "DE" && <span className="flag" title="Německo">🇩🇪</span>}
            {day.outlook && <span className="outlook-tag">výhled</span>}
            {day.offshoreBlocked && (
              <span
                className="warn-tag"
                title="Vítr by foukal dost, ale vane od břehu na vodu (offshore) – nebezpečné, odnese tě to od břehu."
              >
                ⚠ offshore
              </span>
            )}
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
              {day.precipMm > 0.1 && ` · 🌧 déšť ~${day.precipMm.toFixed(1)} mm`}
              {day.outlook && " · jen orientační výhled"}
              {day.upside && " · může se ještě zlepšit"}
            </p>
            {day.offshoreBlocked && (
              <p className="warn-text small">
                ⚠ Pozor: vítr by foukal dost, ale vane od břehu na vodu
                (offshore) – odneslo by tě to od břehu, nedoporučuje se.
              </p>
            )}
            {day.dirUnverified && (
              <p className="muted small">
                ℹ️ Směr větru na tomto spotu není ověřený – hodnotí se zatím jen
                podle síly.
              </p>
            )}
            {/* Vybavenost */}
            {spot.facilities && (
              <div className="facilities-row">
                {spot.facilities.parking === "free"  && <FacChip icon={<SquareParking size={13}/>} label="Parking zdarma" />}
                {spot.facilities.parking === "paid"  && <FacChip icon={<SquareParking size={13}/>} label={paidParkingLabel(spot.facilities)} />}
                {spot.facilities.parking === "none"  && <FacChip icon={<SquareParking size={13}/>} label="Bez parkingu" off />}
                {spot.facilities.wc === true          && <FacChip icon={<Droplets size={13}/>} label="WC" />}
                {spot.facilities.wc === false         && <FacChip icon={<Droplets size={13}/>} label="Bez WC" off />}
                {spot.facilities.refreshments === true  && <FacChip icon={<Utensils size={13}/>} label="Občerstvení" />}
                {spot.facilities.refreshments === false && <FacChip icon={<Utensils size={13}/>} label="Bez občerstvení" off />}
                {spot.facilities.rental === true      && <FacChip icon={<Store size={13}/>} label="Půjčovna" />}
              </div>
            )}
            {spot.facilities?.parkingNote && (
              <p className="muted small">🅿 {spot.facilities.parkingNote}</p>
            )}

            <div className="spot-note-actions">
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
              {onReport && (
                <button
                  className="report-btn"
                  onClick={(e) => { e.stopPropagation(); onReport(); }}
                >
                  ⚑ Nahlásit problém
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
