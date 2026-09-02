import { programming } from "../supabase/client";

// Coach-managed labels for the template library (migration 0110). Before
// this, workout_templates.category was a two-value CHECK ('away','trial'),
// so inventing a third use meant a migration — and a "welcome week" turned
// up the same day the idea was floated, so there will be a fourth.
//
// A category names what a template is FOR. It deliberately says nothing
// about how the template gets assigned: a welcome week is a single session,
// an away block is several across weeks, and both are just templates.

export async function listTemplateCategories() {
  const { data, error } = await programming
    .from("template_categories")
    .select("*")
    .order("position")
    .order("name");
  if (error) throw error;
  return data;
}

export async function createTemplateCategory({ name, position }) {
  const { data, error } = await programming
    .from("template_categories")
    .insert({ name, position: position ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameTemplateCategory(id, name) {
  const { error } = await programming.from("template_categories").update({ name }).eq("id", id);
  if (error) throw error;
}

// Templates in a deleted category are NOT deleted with it — the FK is
// `on delete set null`, so they fall into the library's "Uncategorised"
// group and can be re-filed. Deleting a label must never be a way to lose
// a workout somebody built.
export async function deleteTemplateCategory(id) {
  const { error } = await programming.from("template_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function countTemplatesInCategory(id) {
  const { count, error } = await programming
    .from("workout_templates")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);
  if (error) throw error;
  return count ?? 0;
}
