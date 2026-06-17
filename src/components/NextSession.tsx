import { fmtWeekdayLong, fmtDayMonth, fmtWindow, fmtMs, isToday } from "../lib/format";

export interface NextSessionInfo {
  date: string;
  spotName: string;
  distanceKm: number;
  windowStart: number | null;
  windowEnd: number | null;
  avgMs: number;
  great: boolean;
}

export function NextSession({
  info,
  onClick,
}: {
  info: NextSessionInfo | null;
  onClick: () => void;
}) {
  if (!info) {
    return (
      <div className="next-session none">
        <span className="ns-icon">🌬️</span>
        <div>
          <div className="ns-title">Zatím nikde dostatečně nefouká</div>
          <div className="ns-sub muted">
            V příštích dnech to v tvém dosahu nevypadá na jízdu. Zkus zvětšit
            vzdálenost nebo snížit práh větru.
          </div>
        </div>
      </div>
    );
  }
  const when = isToday(info.date)
    ? "Dnes"
    : `${fmtWeekdayLong(info.date)} ${fmtDayMonth(info.date)}`;
  return (
    <button className={"next-session" + (info.great ? " great" : "")} onClick={onClick}>
      <span className="ns-icon">{info.great ? "🔥" : "🏄"}</span>
      <div>
        <div className="ns-label muted">Nejbližší jízda</div>
        <div className="ns-title">
          {when} · {info.spotName}
        </div>
        <div className="ns-sub">
          {fmtWindow(info.windowStart, info.windowEnd)} · {fmtMs(info.avgMs)} ·{" "}
          {info.distanceKm} km
        </div>
      </div>
      <span className="ns-arrow">›</span>
    </button>
  );
}
