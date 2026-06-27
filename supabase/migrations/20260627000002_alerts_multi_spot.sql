-- =====================================================================
--  BLOK D: jeden alert může hlídat víc spotů
--  Přidá pole spot_ids; staré alerty (jeden spot_id) zmigruje do pole.
--  spot_id necháme (nullable) kvůli zpětné kompatibilitě.
-- =====================================================================

alter table alerts add column if not exists spot_ids text[] not null default '{}';

-- backfill: existující alerty s jedním spot_id → pole o jednom prvku
update alerts
set spot_ids = array[spot_id]
where spot_id is not null
  and array_length(spot_ids, 1) is null;

-- nové alerty už spot_id nepotřebují (zdroj pravdy je spot_ids)
alter table alerts alter column spot_id drop not null;
