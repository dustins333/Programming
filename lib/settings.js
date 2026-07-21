import { core } from "./supabase/client";

export async function getSettings() {
  const { data, error } = await core.from("settings").select("key, value").order("key");
  if (error) throw error;
  return data;
}

export async function getSetting(key, fallback = null) {
  const { data, error } = await core.from("settings").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : fallback;
}

export async function updateSetting(key, value) {
  const { error } = await core
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}
