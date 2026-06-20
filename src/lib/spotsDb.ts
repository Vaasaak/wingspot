// Načtení spotů: primárně z Supabase (schválené spoty), s fallbackem na
// statická data z src/data/spots.ts (když Supabase není nastavené, je offline,
// nebo tabulka ještě neexistuje). Díky tomu appka funguje za všech okolností.
//
// Když je předáno opts (domovské místo + vzdálenost), použije RPC spots_within
// pro geo-dotaz na DB. Bez opts stáhne všechny schválené spoty (fallback).

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
  facilities: Record<string, unknown> | null;
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
    facilities: r.facilities ?? undefined,
  };
}

export interface LoadSpotsOpts {
  lat: number;
  lon: number;
  km: number;
}

export async function loadSpots(opts?: LoadSpotsOpts): Promise<{
  spots: Spot[];
  source: "db" | "fallback";
}> {
  if (!supabaseEnabled || !supabase) {
    return { spots: SPOTS, source: "fallback" };
  }
  try {
    let data: DbSpot[] | null = null;
    let error: unknown = null;

    if (opts) {
      // Geo-dotaz: spoty do opts.km km od domova (vyžaduje earthdistance extension v DB)
      const res = await supabase.rpc("spots_within", {
        p_lat: opts.lat,
        p_lon: opts.lon,
        p_km: opts.km,
      });
      data = res.data as DbSpot[] | null;
      error = res.error;
    }

    // Fallback na celou tabulku: když opts není, nebo RPC selže (extension neinstalovaná)
    if (!opts || error || !data || data.length === 0) {
      const res = await supabase
        .from("spots")
        .select("id,name,country,lat,lon,good_dirs,bad_dirs,note,windguru_url,facilities")
        .eq("status", "approved");
      data = res.data as DbSpot[] | null;
      error = res.error;
    }

    if (error || !data || data.length === 0) {
      return { spots: SPOTS, source: "fallback" };
    }
    return { spots: data.map(mapDbSpot), source: "db" };
  } catch {
    return { spots: SPOTS, source: "fallback" };
  }
}
