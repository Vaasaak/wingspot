// Oblíbené spoty uložené v Supabase (pro přihlášené uživatele).
// Nepřihlášený uživatel používá localStorage (viz settings.ts).

import { supabase, supabaseEnabled } from "./supabase";

export async function loadFavoritesFromDb(
  userId: string
): Promise<string[] | null> {
  if (!supabaseEnabled || !supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("favorites")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.favorites ?? [];
}

export async function saveFavoritesToDb(
  userId: string,
  favorites: string[]
): Promise<void> {
  if (!supabaseEnabled || !supabase) return;
  await supabase.from("profiles").upsert(
    { id: userId, favorites, updated_at: new Date().toISOString() },
    { onConflict: "id" }
  );
}
