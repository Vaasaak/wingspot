-- =====================================================================
--  BLOK B: cache výsledků OpenRouteService Matrix (vzdálenost/čas autem)
--  Zapisuje a čte jen Cloudflare funkce drivematrix přes service_role
--  (RLS zapnuté, žádná veřejná politika → klient sem přímo nesahá).
-- =====================================================================

create table if not exists drive_matrix_cache (
  cache_key  text primary key,           -- zaokrouhlená poloha + hash množiny spotů
  data       jsonb not null,             -- { "<spotId>": { "distance_m": N, "duration_s": N }, ... }
  fetched_at timestamptz not null default now()
);

alter table drive_matrix_cache enable row level security;

-- Index pro úklid starých záznamů (volitelné; silniční síť se nemění → TTL dny).
create index if not exists drive_matrix_cache_fetched_idx
  on drive_matrix_cache (fetched_at);
