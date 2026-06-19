// Připojení k Supabase. URL i anon klíč jsou veřejné (anon klíč chrání RLS
// pravidla v databázi). Berou se z .env (VITE_… proměnné).
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Když klíče nejsou nastavené, appka funguje dál ve „statickém" režimu
// (spoty z src/data/spots.ts, nastavení v localStorage).
export const supabaseEnabled = Boolean(url && anonKey);

export const supabase = supabaseEnabled
  ? createClient(url!, anonKey!)
  : null;
