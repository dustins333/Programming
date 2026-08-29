// Shared GHL contact resolution for the registration flow.
//
// Extracted so request-registration-code and verify-registration-code
// resolve a member the SAME way: a code that can be requested with one
// address but not verified with it strands somebody halfway through
// signup, which is worse than not accepting the address at all.
const GHL_BASE = "https://services.leadconnectorhq.com";

export function ghlHeaders() {
  return {
    Authorization: `Bearer ${Deno.env.get("GHL_API_KEY")}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
  };
}

// Every address on a contact, primary plus the `additionalEmails` a GHL
// merge demotes the losing record's address into. Checking only the primary
// is how a merged contact silently stops being findable — see CLAUDE.md,
// the C.J. Smith duplicate (2026-08-28).
function emailsOn(contact: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof contact?.email === "string") out.push(contact.email.toLowerCase());
  const extra = contact?.additionalEmails;
  if (Array.isArray(extra)) {
    for (const e of extra) {
      const v = typeof e === "string" ? e : (e as Record<string, unknown>)?.email;
      if (typeof v === "string") out.push(v.toLowerCase());
    }
  }
  return out;
}

// Returns the single GHL contact carrying this email on ANY of its
// addresses, or null. Null covers "no match" and "several matches" alike:
// never guess between two contacts sharing an address, because the wrong
// pick texts a verification code to the wrong phone.
export async function findContactIdByEmail(email: string): Promise<string | null> {
  const url = `${GHL_BASE}/contacts/?locationId=${Deno.env.get("GHL_LOCATION_ID")}&query=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: ghlHeaders() });
  if (!res.ok) {
    console.error("GHL contact lookup failed:", res.status, await res.text());
    return null;
  }
  const contacts = (await res.json())?.contacts ?? [];
  const wanted = email.toLowerCase();
  // `query` is a fuzzy search, so a partial hit can be a different person
  // entirely — require an exact address match before trusting anything.
  const exact = (contacts as Record<string, unknown>[]).filter((c) => emailsOn(c).includes(wanted));
  if (exact.length !== 1) {
    console.error(`GHL contact match: ${exact.length} exact matches for the email, not using any`);
    return null;
  }
  return typeof exact[0].id === "string" ? exact[0].id : null;
}

export type MemberRow = { id: string; email: string; ghl_contact_id: string | null };

// Resolve the member behind a typed email. Kova stores one address per
// account, but a member may well type the other one that lives on their GHL
// contact — so on a miss, ask GHL which contact owns that address and come
// back through ghl_contact_id.
export async function resolveMemberByEmail(
  adminClient: { schema: (s: string) => any },
  email: string,
): Promise<MemberRow | null> {
  const { data: direct } = await adminClient
    .schema("core")
    .from("users")
    .select("id, email, ghl_contact_id")
    .ilike("email", email)
    .maybeSingle();
  if (direct) return direct as MemberRow;

  const contactId = await findContactIdByEmail(email);
  if (!contactId) return null;

  const { data: viaContact } = await adminClient
    .schema("core")
    .from("users")
    .select("id, email, ghl_contact_id")
    .eq("ghl_contact_id", contactId)
    .maybeSingle();
  if (viaContact) {
    console.log("registration lookup: matched via a secondary email on the GHL contact");
  }
  return (viaContact as MemberRow) ?? null;
}
