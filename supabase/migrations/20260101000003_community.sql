-- Komunitní spoty: přidávání přihlášeným, admin moderace, vybavenost, hlášení.
-- TECHNICKÝ DLUH: admin je tu navázaný na e-mail v JWT. První zlepšovací migrace
-- to má nahradit rolí profiles.is_admin. Tahle migrace zachycuje SOUČASNÝ stav.

drop policy if exists "auth users can add spots" on spots;
create policy "auth users can add spots"
  on spots for insert
  with check (auth.uid() is not null and status = 'pending' and created_by = auth.uid());

drop policy if exists "admin read all spots" on spots;
create policy "admin read all spots"
  on spots for select using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

drop policy if exists "admin update spots" on spots;
create policy "admin update spots"
  on spots for update using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

drop policy if exists "admin delete spots" on spots;
create policy "admin delete spots"
  on spots for delete using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

alter table spots add column if not exists facilities jsonb;

create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  spot_id     text not null references spots(id) on delete cascade,
  reporter_id uuid references auth.users(id),
  kind        text not null default 'correction',
  issues      text[],
  suggested_name         text,
  suggested_lat          double precision,
  suggested_lon          double precision,
  suggested_windguru_url text,
  message     text,
  status      text not null default 'pending',
  created_at  timestamptz not null default now()
);

alter table reports enable row level security;

drop policy if exists "anyone can report" on reports;
create policy "anyone can report" on reports for insert with check (true);

drop policy if exists "admin read reports" on reports;
create policy "admin read reports"
  on reports for select using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');

drop policy if exists "admin update reports" on reports;
create policy "admin update reports"
  on reports for update using (auth.jwt() ->> 'email' = 'vasikpicasa@gmail.com');
