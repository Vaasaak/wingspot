-- Alerty: uživatelská upozornění na vítr.

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
  on alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
