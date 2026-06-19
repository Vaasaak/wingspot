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
