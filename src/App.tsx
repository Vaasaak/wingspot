import { useEffect, useMemo, useRef, useState } from "react";
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
import { distanceKm, metricValue, metricMax } from "./lib/geo";
import type { DistanceInfo } from "./lib/geo";
import { fetchDriveMatrix } from "./lib/drivematrix";
import type { DriveMatrix } from "./lib/drivematrix";
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
import { AlertsModal } from "./components/AlertsModal";
import { supabase, supabaseEnabled } from "./lib/supabase";
import {
  loadFavoritesFromDb, saveFavoritesToDb,
  loadIsAdminFromDb,
  loadSettingsFromDb, saveSettingsToDb,
} from "./lib/profile";
import type { Session } from "@supabase/supabase-js";

// Poloměr (km) pro geo-dotaz na spoty. U metriky „čas autem" převedeme minuty
// na velkorysý km poloměr (90 km/h), ať nevypadnou daleké-ale-rychlé spoty.
function prefilterKm(s: Settings): number {
  if (s.distanceMetric === "drive_time") {
    return Math.min(600, Math.round((s.maxDriveMin / 60) * 90));
  }
  return s.maxDistanceKm;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [favorites, setFavorites] = useState<string[]>(() => loadFavorites());
  const [spots, setSpots] = useState<Spot[]>(SPOTS); // fallback hned, DB pak
  const [driveData, setDriveData] = useState<DriveMatrix>({}); // vzdálenost/čas autem (ORS)
  const [forecasts, setForecasts] = useState<SpotForecast[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAddSpot, setShowAddSpot] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [reportingSpot, setReportingSpot] = useState<import("./data/spots").Spot | null>(null);

  // sleduj přihlášení + při přihlášení načti oblíbené a admin roli z DB
  useEffect(() => {
    if (!supabaseEnabled || !supabase) return;
    function syncProfile(uid: string) {
      // Favorites: nedestruktivní merge (lokální ∪ DB — neztratíme lokálně přidané)
      loadFavoritesFromDb(uid).then((dbFavs) => {
        if (dbFavs !== null) setFavorites(prev => [...new Set([...prev, ...dbFavs])]);
      });
      // Settings: DB přebije lokální (nastavení sdílíme napříč zařízeními)
      loadSettingsFromDb(uid).then((dbSettings) => {
        if (dbSettings) setSettings(prev => ({ ...prev, ...dbSettings }));
      });
      loadIsAdminFromDb(uid).then(setIsAdmin);
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user.id) syncProfile(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setShowLogin(false);
      if (s?.user.id) {
        syncProfile(s.user.id);
      } else {
        setIsAdmin(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      const { spots: loaded } = await loadSpots({ lat: settings.homeLat, lon: settings.homeLon, km: prefilterKm(settings) });
      setSpots(loaded);
      const res = await fetchForecasts(loaded, force);
      setForecasts(res.data);
      setFetchedAt(res.fetchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se stáhnout předpověď.");
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { void load(false); }, []);

  // Po změně domovské lokace / poloměru znovu načti spoty v okruhu z DB
  // (geo-dotaz spots_within bere lat/lon/km). Debounce, ať slider nepálí dotazy.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    const id = setTimeout(() => { void load(false); }, 700);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.homeLat, settings.homeLon, prefilterKm(settings)]);

  // Vzdálenost/čas autem: když je zvolená auto-metrika, dotáhni z ORS přes
  // funkci /api/drivematrix pro ~25 nejbližších kandidátů (vzdušně). Šetrně —
  // přepočítáváme jen když se změní zaokrouhlená poloha nebo množina kandidátů.
  const driveKeyRef = useRef("");
  useEffect(() => {
    if (settings.distanceMetric === "straight") {
      driveKeyRef.current = "";
      return;
    }
    const cands = spots
      .map((s) => ({ s, d: distanceKm(settings.homeLat, settings.homeLon, s.lat, s.lon) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 25)
      .map((x) => ({ id: x.s.id, lat: x.s.lat, lon: x.s.lon }));
    if (!cands.length) return;
    const key =
      `${settings.homeLat.toFixed(2)},${settings.homeLon.toFixed(2)}:` +
      cands.map((c) => c.id).sort().join(",");
    if (key === driveKeyRef.current) return;
    driveKeyRef.current = key;
    let cancelled = false;
    fetchDriveMatrix({ lat: settings.homeLat, lon: settings.homeLon }, cands).then((m) => {
      if (!cancelled) setDriveData(m);
    });
    return () => { cancelled = true; };
  }, [settings.distanceMetric, settings.homeLat, settings.homeLon, spots]);

  // ulož nastavení a oblíbené při změně (localStorage vždy, DB když přihlášen)
  useEffect(() => {
    saveSettings(settings);
    if (session?.user.id) saveSettingsToDb(session.user.id, settings);
  }, [settings, session?.user.id]);
  useEffect(() => {
    saveFavorites(favorites);
    if (session?.user.id) saveFavoritesToDb(session.user.id, favorites);
  }, [favorites, session?.user.id]);

  function toggleFav(id: string) {
    setFavorites((f) =>
      f.includes(id) ? f.filter((x) => x !== id) : [...f, id]
    );
  }

  // ---- VÝPOČTY ----
  const derived = useMemo(() => {
    if (!forecasts) return null;

    const metric = settings.distanceMetric;
    const maxVal = metricMax(metric, settings.maxDistanceKm, settings.maxDriveMin);
    const sdInfo = (sd: SpotDay): DistanceInfo => ({
      km: sd.distanceKm, driveKm: sd.driveKm, driveMin: sd.driveMin,
    });

    // vzdálenost (vzdušná čára + případně auto z ORS) pro každý spot
    const infoFor = (spot: Spot): DistanceInfo => {
      const dr = driveData[spot.id];
      return {
        km: distanceKm(settings.homeLat, settings.homeLon, spot.lat, spot.lon),
        driveKm: dr ? dr.distance_m / 1000 : undefined,
        driveMin: dr ? dr.duration_s / 60 : undefined,
      };
    };

    // spoty v dosahu podle zvolené metriky
    const fcById = new Map(forecasts.map((f) => [f.spotId, f]));
    const inRange = spots
      .map((spot) => ({ spot, info: infoFor(spot) }))
      .filter((x) => metricValue(metric, x.info) <= maxVal);

    // vyhodnocení každého spotu
    const evals = inRange
      .map(({ spot, info }) => {
        const fc = fcById.get(spot.id);
        if (!fc) return null;
        return { spot, info, evalResult: evaluateSpot(spot, fc, settings) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // seznam dnů
    const dates = evals[0]?.evalResult.days.map((d) => d.date) ?? [];

    // pro každý den: seřazené spoty + souhrn pro kalendář
    const spotDaysByDate: Record<string, SpotDay[]> = {};
    const calendar: CalendarDay[] = [];

    for (const date of dates) {
      const spotDays: SpotDay[] = evals
        .map(({ spot, info, evalResult }): SpotDay | null => {
          const day = evalResult.days.find((d) => d.date === date);
          return day
            ? { spot, day, distanceKm: info.km, driveKm: info.driveKm, driveMin: info.driveMin }
            : null;
        })
        .filter((x): x is SpotDay => x !== null)
        // finální pořadí = kvalita (0–1) × penalizace vzdálenosti (zvolená metrika):
        // bližší spot při srovnatelné kvalitě vyhraje, ale vzdálenost nikdy
        // neudělá z dobrého spotu špatný (jen rozhoduje mezi srovnatelnými).
        .sort((a, b) => {
          const fa = a.day.qualityScore * distancePenalty(metricValue(metric, sdInfo(a)), maxVal);
          const fb = b.day.qualityScore * distancePenalty(metricValue(metric, sdInfo(b)), maxVal);
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
          sd.day.qualityScore * distancePenalty(metricValue(metric, sdInfo(sd)), maxVal);
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
            driveKm: sd.driveKm,
            driveMin: sd.driveMin,
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
  }, [forecasts, settings, spots, driveData]);

  // vyber výchozí den
  useEffect(() => {
    if (derived && derived.dates.length > 0) {
      if (!derived.dates.includes(selectedDate)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
              {session && (
                <button
                  className="icon-btn"
                  onClick={() => setShowAlerts(true)}
                  title="Alerty na vítr"
                >
                  🔔
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
                  👤 <span className="btn-text">Odhlásit</span>
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
            distanceMetric={settings.distanceMetric}
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
              distanceMetric={settings.distanceMetric}
              favorites={favorites}
              onToggleFav={toggleFav}
              onReport={setReportingSpot}
            />
          )}
        </>
      )}

      <footer className="footer muted small">
        Předpověď: <a href="https://open-meteo.com" target="_blank" rel="noopener" style={{ color: "inherit" }}>Open-Meteo</a> (CC BY 4.0) ·
        Spoty: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" style={{ color: "inherit" }}>© OpenStreetMap</a> (ODbL) ·
        WingSpot ukazuje předpověď, vždy posuď podmínky na místě sám. 🌊
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
          onClose={() => setShowAddSpot(false)}
        />
      )}
      {reportingSpot && (
        <ReportModal spot={reportingSpot} onClose={() => setReportingSpot(null)} />
      )}
      {showAlerts && session && (
        <AlertsModal
          session={session}
          spots={spots}
          onClose={() => setShowAlerts(false)}
        />
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
