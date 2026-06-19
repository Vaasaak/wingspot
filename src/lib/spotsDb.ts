// Načtení spotů: primárně z Supabase (schválené spoty), s fallbackem na
// statická data z src/data/spots.ts (když Supabase není nastavené, je offline,
// nebo tabulka ještě neexistuje). Díky tomu appka funguje za všech okolností.

import { supabase, supabaseEnabled } from "./supabase";
import { SPOTS } from "../data/spots";
import type { Spot } from "../data/spots";

interface DbSpot {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  good_dirs: { from: number; to: number }[] | null;
  bad_dirs: { from: number; to: number }[] | null;
  note: string | null;
  windguru_url: string | null;
}

function mapDbSpot(r: DbSpot): Spot {
  return {
    id: r.id,
    name: r.name,
    region: r.country === "DE" ? "DE" : "CZ",
    lat: r.lat,
    lon: r.lon,
    note: r.note ?? undefined,
    windguru: r.windguru_url ?? undefined,
    goodDirs: r.good_dirs ?? undefined,
    badDirs: r.bad_dirs ?? undefined,
  };
}

export async function loadSpots(): Promise<{
  spots: Spot[];
  source: "db" | "fallback";
}> {
  if (!supabaseEnabled || !supabase) {
    return { spots: SPOTS, source: "fallback" };
  }
  try {
    const { data, error } = await supabase
      .from("spots")
      .select(
        "id,name,country,lat,lon,good_dirs,bad_dirs,note,windguru_url"
      )
      .eq("status", "approved");
    if (error || !data || data.length === 0) {
      return { spots: SPOTS, source: "fallback" };
    }
    return { spots: (data as DbSpot[]).map(mapDbSpot), source: "db" };
  } catch {
    return { spots: SPOTS, source: "fallback" };
  }
}
