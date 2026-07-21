import { supabase } from "../supabase/client";

export async function sendPush({ userId, title, body, data }) {
  const { data: result, error } = await supabase.functions.invoke("send-push", {
    body: { userId, title, body, data },
  });
  if (error) throw error;
  return result;
}
