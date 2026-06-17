import type { CSSProperties } from "react";
import type { Rating } from "../lib/scoring";
import { RATING_META } from "../lib/ui";
import { isToday } from "../lib/format";

export interface CalendarDay {
  date: string;
  rating: Rating;
  bestSpotName: string | null;
  bestWindMs: number;
  goodCount: number;
  outlook: boolean;
}

const WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function dayNum(date: string): number {
  return parseInt(date.slice(8, 10), 10);
}
function monthNum(date: string): number {
  return parseInt(date.slice(5, 7), 10);
}
// pondělí = 0 … neděle = 6
function weekdayMon(date: string): number {
  return (new Date(date + "T12:00:00").getDay() + 6) % 7;
}

export function Calendar({
  days,
  selected,
  onSelect,
}: {
  days: CalendarDay[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  if (days.length === 0) return null;
  const offset = weekdayMon(days[0].date);

  return (
    <div className="cal-grid">
      {WEEKDAYS.map((w) => (
        <div className="cal-head" key={w}>
          {w}
        </div>
      ))}
      {Array.from({ length: offset }).map((_, i) => (
        <div className="cal-empty" key={"e" + i} />
      ))}
      {days.map((d) => {
        const meta = RATING_META[d.rating];
        const dn = dayNum(d.date);
        // vlání ve větru: silnější vítr = větší výkyv a rychlejší kmitání
        const amp = Math.min(3.5, Math.max(0.3, d.bestWindMs * 0.4));
        const dur = Math.max(0.5, 2.0 - d.bestWindMs * 0.13);
        const style = {
          ["--amp"]: `${amp.toFixed(2)}deg`,
          ["--dur"]: `${dur.toFixed(2)}s`,
        } as CSSProperties;
        return (
          <button
            key={d.date}
            className={
              `cal-cell rating-${d.rating}` +
              (d.date === selected ? " selected" : "") +
              (isToday(d.date) ? " today" : "") +
              (d.outlook ? " outlook" : "")
            }
            onClick={() => onSelect(d.date)}
            style={style}
            title={
              d.bestSpotName
                ? `${d.bestSpotName} · ${d.bestWindMs.toFixed(1)} m/s`
                : "slabý vítr"
            }
          >
            <span className="cc-date">
              {dn}.{monthNum(d.date)}.
            </span>
            <span className="cc-emoji">{meta.emoji}</span>
            <span className="cc-wind">
              {d.bestWindMs > 0 ? d.bestWindMs.toFixed(1) : "–"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
