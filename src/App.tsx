import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { SPOTS } from "./data/spots";
import type { Spot } from "./data/spots";
import { loadSpots } from "./lib/spotsDb";
import {
  loadSettings,
  saveSettings,
  loadFavorites,
  saveFavorites,
} from "./lib/settings";
import type { Settings } from "./lib/settings";
import { fetchForecasts } from "./lib/weather";
import type { SpotForecast } from "./lib/weather";
import { evaluateSpot, distancePenalty } from "./lib/scoring";
import type { Rating } from "./lib/scoring";
import { distanceKm } from "./lib/geo";
import { Calendar } from "./components/Calendar";
import type { CalendarDay } from "./components/Calendar";
import { DayDetail } from "./components/DayDetail";
import type { SpotDay } from "./components/DayDetail";
import { WhereToGo } from "./components/WhereToGo";
import type { WhereOption } from "./components/WhereToGo";
import { SettingsPanel } from "./components/SettingsPanel";
import { LoginModal } from "./components/LoginModal";
import { AddSpotModal } from "./components/AddSpotModal";
import { AdminPanel } from "./components/AdminPanel";
import { ReportModal } from "./components/ReportModal";
import { supabase, supabaseEnabled } from "./lib/supabase";
import { loadFavoritesFromDb, saveFavoritesToDb } from "./lib/profile";
import type { Session } from "@supabase/supabase-js";

const ADMIN_EMAIL = "vasikpicasa@gmail.com";

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [spots, setSpots] = useState<Spot[]>(SPOTS); // fallback hned, DB pak
  const [forecasts, setForecasts] = useState<SpotForecast[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showAddSpot, setShowAddSpot] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [reportingSpot, setReportingSpot] = useState<import("./data/spots").Spot | null>(null);

  const isAdmin = session?.user.email === ADMIN_EMAIL;

  // sleduj přihlášení + při přihlášení načti oblíbené z DB
  useEffect(() => {
    if (!supabaseEnabled || !supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user.id) {
        loadFavoritesFromDb(data.session.user.id).then((dbFavs) => {
          if (dbFavs !== null) setFavorites(dbFavs);
        });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setShowLogin(false);
      if (s?.user.id) {
        loadFavoritesFromDb(s.user.id).then((dbFavs) => {
          if (dbFavs !== null) setFavorites(dbFavs);
        });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const { spots: loaded } = await loadSpots(); // DB nebo fallback
      setSpots(loaded);
      const res = await fetchForecasts(loaded, force);
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

  // ulož nastavení a oblíbené při změně (localStorage vždy, DB když přihlášen)
  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => {
    saveFavorites(favorites);
    if (session?.user.id) {
      saveFavoritesToDb(session.user.id, favorites);
    }
  }, [favorites, session?.user.id]);

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
    const inRange = spots.map((spot) => ({
      spot,
      dist: distanceKm(settings.homeLat, settings.homeLon, spot.lat, spot.lon),
    })).filter((x) => x.dist <= settings.maxDistanceKm);

    // vyhodnocení každého spotu
    const evals = inRange
      .map(({ spot, dist }) => {
        const fc = fcById.get(spot.id);
        if (!fc) return null;
        return { spot, dist, evalResult: evaluateSpot(spot, fc, settings) };
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
        // finální pořadí = kvalita (0–1) × vzdálenostní penalizace:
        // bližší spot při srovnatelné kvalitě vyhraje, ale vzdálenost nikdy
        // neudělá z dobrého spotu špatný (jen rozhoduje mezi srovnatelnými).
        .sort((a, b) => {
          const fa =
            a.day.qualityScore *
            distancePenalty(a.distanceKm, settings.maxDistanceKm);
          const fb =
            b.day.qualityScore *
            distancePenalty(b.distanceKm, settings.maxDistanceKm);
          return fb - fa;
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

    // KAM VYRAZIT: nejlepší den každého spotu (jen jezditelné), seřazené
    // podle final skóre (kvalita × vzdálenost), TOP 3 různé spoty.
    const bestPerSpot = new Map<string, WhereOption>();
    for (const date of dates) {
      for (const sd of spotDaysByDate[date]) {
        if (sd.day.rating !== "good" && sd.day.rating !== "great") continue;
        const final =
          sd.day.qualityScore *
          distancePenalty(sd.distanceKm, settings.maxDistanceKm);
        const prev = bestPerSpot.get(sd.spot.id);
        if (!prev || final > prev.final) {
          bestPerSpot.set(sd.spot.id, {
            final,
            date,
            spotId: sd.spot.id,
            spotName: sd.spot.name,
            region: sd.spot.region,
            lat: sd.spot.lat,
            lon: sd.spot.lon,
            windowStart: sd.day.windowStart,
            windowEnd: sd.day.windowEnd,
            avgMs: sd.day.windowAvgMs,
            distanceKm: sd.distanceKm,
            rating: sd.day.rating,
            confidence: sd.day.confidence,
          });
        }
      }
    }
    const topOptions = [...bestPerSpot.values()]
      .sort((a, b) => b.final - a.final)
      .slice(0, 3);

    return { dates, spotDaysByDate, calendar, topOptions };
  }, [forecasts, settings, spots]);

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
        <div className="topbar-actions">
          {supabaseEnabled && (
            <>
              {isAdmin && (
                <button
                  className="icon-btn"
                  onClick={() => setShowAdmin(true)}
                  title="Admin panel"
                >
                  🔧
                </button>
              )}
              <button
                className="icon-btn"
                onClick={() => (session ? setShowAddSpot(true) : setShowLogin(true))}
                title="Přidat spot"
              >
                📍
              </button>
              {session ? (
                <button
                  className="auth-btn"
                  onClick={() => supabase?.auth.signOut()}
                  title={session.user.email ?? ""}
                >
                  👤 Odhlásit
                </button>
              ) : (
                <button className="auth-btn" onClick={() => setShowLogin(true)}>
                  Přihlásit
                </button>
              )}
            </>
          )}
          <button
            className="icon-btn gear"
            onClick={() => setShowSettings(true)}
            title="Nastavení"
          >
            ⚙
          </button>
        </div>
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
          <WhereToGo
            options={derived.topOptions}
            homeLat={settings.homeLat}
            homeLon={settings.homeLon}
            onSelectDay={setSelectedDate}
          />

          {/* Banner – CTA pro přidání spotu */}
          {supabaseEnabled && (
            <div className="add-spot-banner">
              <div>
                <div className="add-spot-banner-title">📍 Znáš dobrý wingfoil spot?</div>
                <div className="muted small">Přidej ho do databáze – po schválení ho uvidí všichni</div>
              </div>
              <button
                className="btn"
                onClick={() => session ? setShowAddSpot(true) : setShowLogin(true)}
                style={{ whiteSpace: "nowrap" }}
              >
                + Přidat spot
              </button>
            </div>
          )}

          <h3 className="section-label">📅 Předpověď po dnech</h3>
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
              onReport={setReportingSpot}
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

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      {showAddSpot && session && (
        <AddSpotModal
          session={session}
          existingSpots={spots}
          onClose={() => setShowAddSpot(false)}
        />
      )}
      {reportingSpot && (
        <ReportModal spot={reportingSpot} onClose={() => setReportingSpot(null)} />
      )}
      {showAdmin && isAdmin && (
        <AdminPanel
          onClose={() => setShowAdmin(false)}
          onApproved={() => load(true)}
        />
      )}
    </div>
  );
}
