import { programming } from "../supabase/client";

// Keyed by the same stable `key` computeAttentionItems() already builds
// (e.g. "nutrition-risk-<userId>"). Returned as a plain object rather than
// the raw row array so callers can do a cheap `dismissals[item.key]` lookup.
export async function listDismissals() {
  const { data, error } = await programming.from("dashboard_dismissals").select("key, signature, dismissed_at");
  if (error) throw error;
  return Object.fromEntries(data.map((d) => [d.key, { signature: d.signature, dismissedAt: d.dismissed_at }]));
}

export async function dismissAttentionItem(key, signature, dismissedBy) {
  const { error } = await programming
    .from("dashboard_dismissals")
    .upsert({ key, signature, dismissed_at: new Date().toISOString(), dismissed_by: dismissedBy }, { onConflict: "key" });
  if (error) throw error;
}
