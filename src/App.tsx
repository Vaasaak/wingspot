import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { SPOTS } from "./data/spots";
import {
  loadSettings,
  saveSettings,
  loadFavorites,
  saveFavorites,
} from "./lib/settings";
import type { Settings } from "./lib/settings";
import { fetchForecasts } from "./lib/weather";
import type { SpotForecast } from "./lib/weather";
import { evaluateSpot, RATING_ORDER } from "./lib/scoring";
import type { Rating } from "./lib/scoring";
import { distanceKm } from "./lib/geo";
import { Calendar } from "./components/Calendar";
import type { CalendarDay } from "./components/Calendar";
import { DayDetail } from "./components/DayDetail";
import type { SpotDay } from "./components/DayDetail";
import { NextSession } from "./components/NextSession";
import type { NextSessionInfo } from "./components/NextSession";
import { SettingsPanel } from "./components/SettingsPanel";

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [forecasts, setForecasts] = useState<SpotForecast[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchForecasts(force);
      setForecasts(res.data);
      setFetchedAt(res.fetchedAt);
    } catch (e: any) {
      setError(e?.message ?? "Nepodařilo se stáhnout předpověď.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(false);
  }, []);

  // ulož nastavení a oblíbené při změně
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => saveFavorites(favorites), [favorites]);

  function toggleFav(id: string) {
    setFavorites((f) =>
      f.includes(id) ? f.filter((x) => x !== id) : [...f, id]
    );
  }

  // ---- VÝPOČTY ----
  const derived = useMemo(() => {
    if (!forecasts) return null;

    // spoty v dosahu + vzdálenost
    const fcById = new Map(forecasts.map((f) => [f.spotId, f]));
    const inRange = SPOTS.map((spot) => ({
      spot,
      dist: distanceKm(settings.homeLat, settings.homeLon, spot.lat, spot.lon),
    })).filter((x) => x.dist <= settings.maxDistanceKm);

    // vyhodnocení každého spotu
    const evals = inRange
      .map(({ spot, dist }) => {
        const fc = fcById.get(spot.id);
        if (!fc) return null;
        return { spot, dist, evalResult: evaluateSpot(fc, settings) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // seznam dnů
    const dates = evals[0]?.evalResult.days.map((d) => d.date) ?? [];

    // pro každý den: seřazené spoty + souhrn pro kalendář
    const spotDaysByDate: Record<string, SpotDay[]> = {};
    const calendar: CalendarDay[] = [];

    for (const date of dates) {
      const spotDays: SpotDay[] = evals
        .map(({ spot, dist, evalResult }) => {
          const day = evalResult.days.find((d) => d.date === date);
          return day ? { spot, day, distanceKm: dist } : null;
        })
        .filter((x): x is SpotDay => x !== null)
        .sort((a, b) => {
          const r = RATING_ORDER[b.day.rating] - RATING_ORDER[a.day.rating];
          if (r !== 0) return r;
          return b.day.score - a.day.score;
        });

      spotDaysByDate[date] = spotDays;

      const best = spotDays[0];
      const bestRating: Rating = best?.day.rating ?? "none";
      const goodCount = spotDays.filter(
        (sd) => sd.day.rating === "good" || sd.day.rating === "great"
      ).length;
      calendar.push({
        date,
        rating: bestRating,
        bestSpotName:
          best && best.day.rating !== "none" ? best.spot.name : null,
        bestWindMs: best
          ? best.day.windowAvgMs > 0
            ? best.day.windowAvgMs
            : best.day.maxWindMs
          : 0,
        goodCount,
        outlook: best?.day.outlook ?? false,
      });
    }

    // nejbližší jízda
    let nextSession: NextSessionInfo | null = null;
    for (const date of dates) {
      const top = spotDaysByDate[date].find(
        (sd) => sd.day.rating === "good" || sd.day.rating === "great"
      );
      if (top) {
        nextSession = {
          date,
          spotName: top.spot.name,
          distanceKm: top.distanceKm,
          windowStart: top.day.windowStart,
          windowEnd: top.day.windowEnd,
          avgMs: top.day.windowAvgMs,
          great: top.day.rating === "great",
        };
        break;
      }
    }

    return { dates, spotDaysByDate, calendar, nextSession };
  }, [forecasts, settings]);

  // vyber výchozí den
  useEffect(() => {
    if (derived && derived.dates.length > 0) {
      if (!derived.dates.includes(selectedDate)) {
        setSelectedDate(derived.dates[0]);
      }
    }
  }, [derived, selectedDate]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🪁</span>
          <div>
            <h1>WingSpot</h1>
            <div className="brand-sub muted">
              {settings.homeName} · do {settings.maxDistanceKm} km · od{" "}
              {settings.minWindMs} m/s
            </div>
          </div>
        </div>
        <button
          className="icon-btn gear"
          onClick={() => setShowSettings(true)}
          title="Nastavení"
        >
          ⚙
        </button>
      </header>

      {loading && !forecasts && (
        <div className="status">Stahuji předpověď z Open-Meteo…</div>
      )}
      {error && (
        <div className="status error">
          {error}{" "}
          <button className="btn small" onClick={() => load(true)}>
            Zkusit znovu
          </button>
        </div>
      )}

      {derived && (
        <>
          <NextSession
            info={derived.nextSession}
            onClick={() => {
              if (derived.nextSession)
                setSelectedDate(derived.nextSession.date);
            }}
          />

          <Calendar
            days={derived.calendar}
            selected={selectedDate}
            onSelect={setSelectedDate}
          />

          {selectedDate && derived.spotDaysByDate[selectedDate] && (
            <DayDetail
              date={selectedDate}
              spotDays={derived.spotDaysByDate[selectedDate]}
              minWindMs={settings.minWindMs}
              favorites={favorites}
              onToggleFav={toggleFav}
            />
          )}
        </>
      )}

      <footer className="footer muted small">
        Data: Open-Meteo · WingSpot ukazuje předpověď, vždy posuď podmínky na
        místě sám. 🌊
      </footer>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
          onRefresh={() => load(true)}
          fetchedAt={fetchedAt}
          loading={loading}
        />
      )}
    </div>
  );
}
