-- Sdílená cache předpovědí (zapisuje Netlify funkce přes service_role, čte kdokoli).

create table if not exists forecast_cache (
  cache_key  text primary key,
  data       jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table forecast_cache enable row level security;

drop policy if exists "public read forecast cache" on forecast_cache;
create policy "public read forecast cache" on forecast_cache for select using (true);
