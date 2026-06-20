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

export async function loadIsAdminFromDb(userId: string): Promise<boolean> {
  if (!supabaseEnabled || !supabase) return false;
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return (data as { is_admin?: boolean } | null)?.is_admin ?? false;
}
