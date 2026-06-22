# WingSpot — kontext pro Claude Code

Tenhle soubor čte Claude Code automaticky. Drží kontext projektu a hlavně
pravidla, kterými se Claude Code řídí sám, aby nemohl nadělat škodu na databázi.

## Co to je

WingSpot je PWA (Vite + React + TypeScript), která wingfoilerům najde z databáze
spotů ten nejlepší, kde právě fouká — podle síly větru, směru (bezpečnost),
srážek, vzdálenosti a spolehlivosti předpovědi. Backend je Supabase
(Postgres + Auth + RLS), předpověď z Open-Meteo se cachuje server-side v Netlify funkcích.

## Stack a kde co je

- Frontend: src/ (React). Scoring engine: src/lib/scoring.ts + scoring-config.ts.
- Forecast: src/lib/weather.ts + netlify/functions/forecast.js. Sdílené jádro: shared/.
- Databáze: Supabase. Schéma žije jako migrace v supabase/migrations/.
- Auth: Supabase Auth (magic link). Login je nepovinný (jen pro favorites/alerty).

## Klíčové tabulky

- spots — spoty (status approved/pending/rejected, trust, good_dirs/bad_dirs, facilities).
  RLS: veřejně čitelné jen approved.
- profiles — 1 řádek/uživatel, zatím favorites. RLS: jen vlastní řádek.
- reports — komunitní hlášení oprav.
- forecast_cache — sdílená cache předpovědí (zapisuje Netlify funkce přes service_role).
- alerts — uživatelská upozornění na vítr.

## Zdroj pravdy = repozitář, ne dashboard

- Schéma se nikdy nemění klikáním v dashboardu ani lepením SQL do editoru.
  Každá změna = nová migrace v supabase/migrations/ aplikovaná přes supabase db push.
- Env proměnné se nastavují přes CLI (supabase, netlify), ne ručně v dashboardu.

## Bezpečnostní pravidla (DODRŽUJ VŽDY)

1. Nikdy nedropuj tabulku, sloupec ani nepouštěj DELETE/UPDATE bez WHERE bez
   explicitního potvrzení ode mě. U destruktivních operací nejdřív napiš, kolik
   řádků to zasáhne, a počkej na souhlas.
2. MCP server běží v --read-only režimu — slouží k prohlížení a dotazům, ne k zápisu.
   Změny schématu dělej migračním souborem + supabase db push, ne přímým zápisem.
3. Měň nejdřív DEV projekt, ne produkci. Na produkci se migrace pouští až po
   ověření na dev a po mém souhlasu.
4. Migrace jsou jen dopředné a malé. Jedna změna = jedna migrace s popisným názvem.
   Nepřepisuj už aplikované migrace; přidej novou.
5. Žádné tajné klíče do kódu ani do commitů. SUPABASE_ACCESS_TOKEN a service_role
   key jsou tajné. .env a token patří do .gitignore.
6. Po každé změně: npm run build musí projít, npm run lint bez chyb.

## Užitečné příkazy

- Stav migrací: supabase migration list
- Aplikovat migrace: supabase db push (na dev; na prod jen vědomě)
- Vygenerovat TS typy: supabase gen types typescript --linked > src/lib/database.types.ts
- Frontend: npm run dev

## Známý technický dluh (k opravě migracemi, viz audit)

- Admin práva jsou zatím navázaná na konkrétní e-mail v RLS i v src/App.tsx.
  První pořádná migrace má zavést profiles.is_admin a RLS přepsat na roli;
  e-mail z klientského kódu odstranit.
