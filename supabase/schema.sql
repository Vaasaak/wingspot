-- =====================================================================
--  WingSpot – databázové schéma (Krok 1 Fáze 3: tabulka spotů)
--  Spusť celé v Supabase: SQL Editor → New query → vlož → Run.
--  Je to bezpečné spustit opakovaně (idempotentní).
-- =====================================================================

-- ---- typy ----
do $$ begin
  create type spot_status as enum ('approved','pending','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type spot_trust as enum ('verified_import','community','community_confirmed');
exception when duplicate_object then null; end $$;

-- ---- tabulka spotů ----
create table if not exists spots (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  country     text not null default 'CZ',
  lat         double precision not null,
  lon         double precision not null,
  good_dirs   jsonb,           -- [{ "from": 225, "to": 315 }, ...]
  bad_dirs    jsonb,           -- offshore (nebezpečné) směry
  note        text,
  windguru_url text,
  status      spot_status not null default 'pending',
  trust       spot_trust  not null default 'community',
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- ---- Row Level Security ----
alter table spots enable row level security;

-- kdokoli (i nepřihlášený) vidí jen SCHVÁLENÉ spoty
drop policy if exists "public read approved spots" on spots;
create policy "public read approved spots"
  on spots for select
  using (status = 'approved');

-- ---- SEED: 5 ověřených spotů (import) ----
-- TODO: good_dirs/bad_dirs jsou přibližné (typické W/SW větry pro CZ).
--       Ověř a oprav je v Supabase tabulce spots nebo přes admin EditSpotModal.
--       Formát JSONB: [{"from":225,"to":315}] = odkud vítr vane (0=S, 90=V, 180=J, 270=Z).
insert into spots (id, name, country, lat, lon, note, windguru_url, good_dirs, bad_dirs, status, trust)
values
  ('nechranice','Nechranice','CZ',50.388,13.27,
   'Největší a nejpopulárnější český spot.','https://www.windguru.cz/2',
   '[{"from":210,"to":320}]','[{"from":130,"to":210}]',
   'approved','verified_import'),
  ('rozkos','Rozkoš','CZ',50.398,16.03,
   'Velká přehrada u České Skalice.','https://www.windguru.cz/4',
   '[{"from":200,"to":315}]','[{"from":60,"to":160}]',
   'approved','verified_import'),
  ('labut','Labuť','CZ',49.453,13.97,
   'Rybník u Myštic (Blatensko).','https://www.windguru.cz/329646',
   '[{"from":200,"to":330}]',null,
   'approved','verified_import'),
  ('stepansky','Štěpánský rybník','CZ',49.782,13.755,
   'U Mýta na Rokycansku (kousek od D5).','https://www.windguru.cz/111',
   '[{"from":210,"to":330}]',null,
   'approved','verified_import'),
  ('berzdorfer','Berzdorfer See','DE',51.11,14.985,
   'U Görlitz, kousek za hranicemi.','https://www.windguru.cz/235437',
   '[{"from":220,"to":320}]','[{"from":60,"to":150}]',
   'approved','verified_import')
on conflict (id) do update set
  name        = excluded.name,
  country     = excluded.country,
  lat         = excluded.lat,
  lon         = excluded.lon,
  note        = excluded.note,
  windguru_url = excluded.windguru_url,
  good_dirs   = excluded.good_dirs,
  bad_dirs    = excluded.bad_dirs,
  status      = excluded.status,
  trust       = excluded.trust;

-- =====================================================================
--  Fáze 3b-B: oblíbené spoty (favorites) vázané na uživatele
-- =====================================================================

-- tabulka profilů (1 řádek na uživatele)
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  favorites  text[] not null default '{}',   -- pole spot ID
  updated_at timestamptz not null default now()
);

-- Row Level Security: každý vidí jen svůj profil
alter table profiles enable row level security;

drop policy if exists "own profile read" on profiles;
create policy "own profile read"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "own profile upsert" on profiles;
create policy "own profile upsert"
  on profiles for insert
  with check (auth.uid() = id);

drop policy if exists "own profile update" on profiles;
create policy "own profile update"
  on profiles for update
  using (auth.uid() = id);

-- automaticky vytvoř profil při registraci/prvním přihlášení
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
--  Fáze 3c: komunitní spoty – vkládání + admin moderace
-- =====================================================================

-- přihlášený uživatel může přidat spot (jen pending, created_by = sebe)
drop policy if exists "auth users can add spots" on spots;
create policy "auth users can add spots"
  on spots for insert
  with check (
    auth.uid() is not null
    and status = 'pending'
    and created_by = auth.uid()
  );

-- admin vidí všechny spoty (včetně pending/rejected)
drop policy if exists "admin read all spots" on spots;
create policy "admin read all spots"
  on spots for select
  using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

-- admin může měnit status spotů
drop policy if exists "admin update spots" on spots;
create policy "admin update spots"
  on spots for update
  using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

-- =====================================================================
--  Fáze 3c doplněk: vybavenost spotů + hlášení chyb
-- =====================================================================

-- vybavenost (parking, wc, občerstvení, stín, půjčovna)
alter table spots add column if not exists facilities jsonb;

-- tabulka hlášení (opravy chyb na existujících spotech)
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  spot_id     text not null references spots(id) on delete cascade,
  reporter_id uuid references auth.users(id),
  kind        text not null default 'correction',
  issues      text[],
  suggested_name        text,
  suggested_lat         double precision,
  suggested_lon         double precision,
  suggested_windguru_url text,
  message     text,
  status      text not null default 'pending',
  created_at  timestamptz not null default now()
);

alter table reports enable row level security;

-- kdokoli (i nepřihlášený) může podat hlášení
drop policy if exists "anyone can report" on reports;
create policy "anyone can report"
  on reports for insert
  with check (true);

-- admin čte a mění všechna hlášení
drop policy if exists "admin read reports" on reports;
create policy "admin read reports"
  on reports for select
  using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

drop policy if exists "admin update reports" on reports;
create policy "admin update reports"
  on reports for update
  using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

-- admin může mazat spoty
drop policy if exists "admin delete spots" on spots;
create policy "admin delete spots"
  on spots for delete
  using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

-- =====================================================================
--  Fáze 3d: sdílená cache předpovědí (zapisuje Netlify funkce)
-- =====================================================================

create table if not exists forecast_cache (
  cache_key  text primary key,          -- = spot.id
  data       jsonb not null,            -- zpracovaný SpotForecast objekt
  fetched_at timestamptz not null default now()
);

alter table forecast_cache enable row level security;

-- kdokoli (i nepřihlášený) může číst cache
drop policy if exists "public read forecast cache" on forecast_cache;
create policy "public read forecast cache"
  on forecast_cache for select
  using (true);

-- zápis jen přes service_role (Netlify funkce) — obchází RLS automaticky

-- =====================================================================
--  Fáze 4: alerty (uživatelská upozornění na vítr)
-- =====================================================================

create table if not exists alerts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null,
  user_email      text not null,
  spot_id         text not null references spots(id) on delete cascade,
  min_wind_ms     float not null default 6,
  max_days_ahead  int not null default 3,
  weekends_only   boolean not null default false,
  active          boolean not null default true,
  last_sent_at    timestamptz,
  created_at      timestamptz not null default now()
);

alter table alerts enable row level security;

drop policy if exists "user own alerts" on alerts;
create policy "user own alerts"
  on alerts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =====================================================================
--  Fáze 0.4: admin přes roli v DB (ne hardcoded e-mail v kódu/bundlu)
-- =====================================================================

-- 1. Přidej is_admin do profiles
alter table profiles add column if not exists is_admin boolean not null default false;

-- 2. Security definer funkce — obejde RLS na profiles (jinak by vznikla rekurze).
--    Vrací true pokud přihlášený uživatel má is_admin = true.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_admin from profiles where id = auth.uid()),
    false
  );
$$;

-- 3. Nahraď e-mailové politiky rolí (spots)
drop policy if exists "admin read all spots" on spots;
create policy "admin read all spots"
  on spots for select
  using (public.is_admin());

drop policy if exists "admin update spots" on spots;
create policy "admin update spots"
  on spots for update
  using (public.is_admin());

drop policy if exists "admin delete spots" on spots;
create policy "admin delete spots"
  on spots for delete
  using (public.is_admin());

-- 4. Nahraď e-mailové politiky rolí (reports)
drop policy if exists "admin read reports" on reports;
create policy "admin read reports"
  on reports for select
  using (public.is_admin());

drop policy if exists "admin update reports" on reports;
create policy "admin update reports"
  on reports for update
  using (public.is_admin());

-- 5. Nastav is_admin = true pro správce (jednorázově)
update profiles
set is_admin = true
where id = (select id from auth.users where email = 'vasikpicasa@gmail.com');

-- =====================================================================
--  Fáze 1.1: geo-dotaz na spoty (earthdistance)
-- =====================================================================

-- Rozšíření pro výpočet vzdálenosti na povrchu Země.
-- V Supabase: Database → Extensions → zapni "cube" a "earthdistance",
--             nebo spusť tyhle příkazy (vyžaduje superuser).
create extension if not exists cube;
create extension if not exists earthdistance;

-- Index pro rychlé geo-dotazy (zakomentuj pokud extensions nejsou dostupné).
create index if not exists spots_latlon_idx
  on spots using gist (ll_to_earth(lat, lon))
  where status = 'approved';

-- RPC: vrátí schválené spoty v okruhu p_km km od zadaných souřadnic.
-- SECURITY DEFINER obchází RLS — bezpečné, protože WHERE filtruje jen 'approved'.
create or replace function public.spots_within(
  p_lat double precision,
  p_lon double precision,
  p_km  double precision
)
returns setof spots
language sql
stable
security definer
set search_path = public
as $$
  select *
  from spots
  where status = 'approved'
    and earth_distance(
          ll_to_earth(lat, lon),
          ll_to_earth(p_lat, p_lon)
        ) / 1000.0 <= p_km
  order by earth_distance(
             ll_to_earth(lat, lon),
             ll_to_earth(p_lat, p_lon)
           );
$$;

-- =====================================================================
--  P2: settings sync, unsubscribe tokeny, rate-limity
-- =====================================================================

-- 1. Sloupec settings v profiles (ukládá nastavení appky napříč zařízeními)
alter table profiles add column if not exists settings jsonb;

-- 2. Unsubscribe token pro každý alert (UUID, jedinečný odkaz pro odhlášení)
alter table alerts add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

-- 3. Rate-limit: max 5 pending spotů na uživatele (zabrání spamu)
drop policy if exists "auth users can add spots" on spots;
create policy "auth users can add spots"
  on spots for insert
  with check (
    auth.uid() is not null
    and status = 'pending'
    and created_by = auth.uid()
    and (
      select count(*) from spots
      where created_by = auth.uid() and status = 'pending'
    ) < 5
  );

-- 4. Rate-limit: max 5 hlášení od stejného uživatele za hodinu
drop policy if exists "anyone can report" on reports;
create policy "anyone can report"
  on reports for insert
  with check (
    coalesce(
      (
        select count(*) from reports
        where reporter_id = auth.uid()
          and created_at > now() - interval '1 hour'
      ),
      0
    ) < 5
  );

-- =====================================================================
--  Fáze A/B/C: škálování — last_viewed_at, OSM source/osm_id
-- =====================================================================

-- last_viewed_at: forecast.js ho aktualizuje při každém zobrazení spotu.
-- warm-cache pak předehřívá jen tyto spoty → náklady ∝ reálné používání.
alter table spots add column if not exists last_viewed_at timestamptz;

-- source + osm_id: pro idempotentní OSM import (upsert podle source+osm_id).
alter table spots add column if not exists source text;
alter table spots add column if not exists osm_id text;

-- Unikátní index pro opakovatelný import (on conflict (source, osm_id))
create unique index if not exists spots_source_osm_id_idx
  on spots (source, osm_id)
  where source is not null and osm_id is not null;

-- Index pro warm-cache dotaz (last_viewed_at > now() - 7 days)
create index if not exists spots_last_viewed_idx
  on spots (last_viewed_at)
  where status = 'approved';
