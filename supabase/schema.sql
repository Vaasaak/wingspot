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
insert into spots (id, name, country, lat, lon, note, windguru_url, status, trust)
values
  ('nechranice','Nechranice','CZ',50.388,13.27,'Největší a nejpopulárnější český spot.','https://www.windguru.cz/2','approved','verified_import'),
  ('rozkos','Rozkoš','CZ',50.398,16.03,'Velká přehrada u České Skalice.','https://www.windguru.cz/4','approved','verified_import'),
  ('labut','Labuť','CZ',49.453,13.97,'Rybník u Myštic (Blatensko).','https://www.windguru.cz/329646','approved','verified_import'),
  ('stepansky','Štěpánský rybník','CZ',49.782,13.755,'U Mýta na Rokycansku (kousek od D5).','https://www.windguru.cz/111','approved','verified_import'),
  ('berzdorfer','Berzdorfer See','DE',51.11,14.985,'U Görlitz, kousek za hranicemi.','https://www.windguru.cz/235437','approved','verified_import')
on conflict (id) do update set
  name = excluded.name,
  country = excluded.country,
  lat = excluded.lat,
  lon = excluded.lon,
  note = excluded.note,
  windguru_url = excluded.windguru_url,
  status = excluded.status,
  trust = excluded.trust;
