import { nutrition } from "../supabase/client";

export async function listNutritionClients() {
  const { data, error } = await nutrition.from("nutrition_clients").select("*");
  if (error) throw error;
  return data;
}

export async function getNutritionClient(userId) {
  const { data, error } = await nutrition.from("nutrition_clients").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function assignNutritionClient(userId, coachId) {
  const { error } = await nutrition
    .from("nutrition_clients")
    .upsert({ user_id: userId, assigned_coach_id: coachId, status: "active" }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function setNutritionStatus(userId, status) {
  const { error } = await nutrition.from("nutrition_clients").update({ status }).eq("user_id", userId);
  if (error) throw error;
}
