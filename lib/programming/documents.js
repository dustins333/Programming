// Staff documents — SOPs, employment agreements. Schema + the reasoning
// behind the two version counters: supabase/migrations/0092_staff_documents.sql.
import { programming } from "../supabase/client";

// THE definition of "this person is done with this document". Everything
// (the coach's own list, the badge count, the admin roster) routes through
// this one function so a pending count can never disagree with the list it
// is counting.
//
// A signature counts only if it was made at or after the version where the
// admin last said "this needs re-signing". A minor edit bumps
// document.version but leaves signature_required_since alone, so it stays
// valid; a policy change moves both, and this goes false again.
export function isSignatureCurrent(document, signature) {
  if (!signature) return false;
  return signature.signed_version >= document.signature_required_since;
}

// A document only sits in someone's Pending if it's live, actually asks for
// a signature, and they haven't given a current one. Reference material
// (requires_signature false) is readable but never pending, and archiving
// pulls a retired SOP out of everyone's queue without touching what anyone
// already signed.
export function isPendingFor(document, signature) {
  if (document.archived) return false;
  if (!document.requires_signature) return false;
  return !isSignatureCurrent(document, signature);
}

const DOCUMENT_FIELDS =
  "id, title, body, body_format, requires_signature, version, signature_required_since, archived, created_at, updated_at";

// ---------------------------------------------------------------------
// Coach side
// ---------------------------------------------------------------------

// One pass over everything this coach can see, split into the three lists
// their Documents screen shows: needs signing / signed / reference-only.
//
// Two sources, deliberately merged rather than one query: `pending` comes
// from assignments, `completed` comes from SIGNATURES. That asymmetry is
// what makes "completed stays there even if that type is turned off" true —
// unassigning someone leaves their signature untouched, so the document
// keeps showing under Completed with no assignment behind it.
export async function getMyDocuments(userId) {
  const [assignedRes, signedRes] = await Promise.all([
    programming
      .from("document_assignments")
      .select(`assigned_at, document:documents (${DOCUMENT_FIELDS})`)
      .eq("user_id", userId),
    programming
      .from("document_signatures")
      .select(`id, signed_version, typed_name, signed_at, document:documents (${DOCUMENT_FIELDS})`)
      .eq("user_id", userId)
      .order("signed_at", { ascending: false }),
  ]);
  if (assignedRes.error) throw assignedRes.error;
  if (signedRes.error) throw signedRes.error;

  // Newest signature per document wins — a re-signed document has more than
  // one row, and it's the latest that decides whether they're current.
  const latestSignature = new Map();
  for (const row of signedRes.data ?? []) {
    if (!row.document) continue;
    const existing = latestSignature.get(row.document.id);
    if (!existing || row.signed_version > existing.signed_version) latestSignature.set(row.document.id, row);
  }

  const byId = new Map();
  for (const row of assignedRes.data ?? []) {
    if (row.document) byId.set(row.document.id, row.document);
  }
  for (const row of signedRes.data ?? []) {
    if (row.document) byId.set(row.document.id, row.document);
  }

  const assignedIds = new Set((assignedRes.data ?? []).map((r) => r.document?.id).filter(Boolean));

  const pending = [];
  const completed = [];
  const reference = [];
  for (const document of byId.values()) {
    const signature = latestSignature.get(document.id) ?? null;
    if (assignedIds.has(document.id) && isPendingFor(document, signature)) {
      pending.push({ document, signature });
    } else if (isSignatureCurrent(document, signature)) {
      // A signature wins even if the document was later switched to
      // reference-only — they did sign it, and the record says so.
      completed.push({ document, signature });
    } else if (assignedIds.has(document.id) && !document.archived) {
      // Reference material: assigned to read, never asks for a signature.
      reference.push({ document, signature: null });
    }
  }

  const byTitle = (a, b) => a.document.title.localeCompare(b.document.title);
  pending.sort(byTitle);
  reference.sort(byTitle);
  completed.sort((a, b) => {
    const at = a.signature?.signed_at ?? "";
    const bt = b.signature?.signed_at ?? "";
    if (at !== bt) return bt.localeCompare(at);
    return byTitle(a, b);
  });
  return { pending, completed, reference };
}

// What the coach's detail screen needs. Falls back to the CURRENT text
// except in one case: they signed an older version and haven't been asked
// to re-sign, where showing today's wording would misrepresent what they
// agreed to. Then we render the snapshot they actually signed and say so.
export async function getMyDocument(documentId, userId) {
  const [docRes, sigRes] = await Promise.all([
    programming.from("documents").select(DOCUMENT_FIELDS).eq("id", documentId).maybeSingle(),
    programming
      .from("document_signatures")
      .select("id, signed_version, typed_name, signed_at")
      .eq("document_id", documentId)
      .eq("user_id", userId)
      .order("signed_version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (docRes.error) throw docRes.error;
  if (sigRes.error) throw sigRes.error;
  const document = docRes.data;
  if (!document) return null;
  const signature = sigRes.data ?? null;

  let signedSnapshot = null;
  if (signature && isSignatureCurrent(document, signature) && signature.signed_version < document.version) {
    const { data, error } = await programming
      .from("document_versions")
      .select("version, title, body, body_format")
      .eq("document_id", documentId)
      .eq("version", signature.signed_version)
      .maybeSingle();
    if (error) throw error;
    signedSnapshot = data ?? null;
  }

  return { document, signature, signedSnapshot };
}

export async function signDocument({ documentId, userId, version, typedName }) {
  const { error } = await programming.from("document_signatures").insert({
    document_id: documentId,
    user_id: userId,
    signed_version: version,
    typed_name: typedName.trim(),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Admin side
// ---------------------------------------------------------------------

// Every document with its assigned/signed tallies. Three queries grouped in
// JS rather than an aggregate — this repo's standing pattern, and safe here
// because the row counts are staff-sized (a dozen people, a handful of
// documents), not client-sized.
export async function listDocumentsAdmin() {
  const [docsRes, assignRes, sigRes] = await Promise.all([
    programming.from("documents").select(DOCUMENT_FIELDS).order("title"),
    programming.from("document_assignments").select("document_id, user_id"),
    programming.from("document_signatures").select("document_id, user_id, signed_version"),
  ]);
  if (docsRes.error) throw docsRes.error;
  if (assignRes.error) throw assignRes.error;
  if (sigRes.error) throw sigRes.error;

  const assignedBy = new Map();
  for (const row of assignRes.data ?? []) {
    if (!assignedBy.has(row.document_id)) assignedBy.set(row.document_id, new Set());
    assignedBy.get(row.document_id).add(row.user_id);
  }
  const bestSignature = new Map();
  for (const row of sigRes.data ?? []) {
    const key = `${row.document_id}:${row.user_id}`;
    const existing = bestSignature.get(key);
    if (!existing || row.signed_version > existing) bestSignature.set(key, row.signed_version);
  }

  return (docsRes.data ?? []).map((document) => {
    const assigned = assignedBy.get(document.id) ?? new Set();
    let signed = 0;
    for (const userId of assigned) {
      const version = bestSignature.get(`${document.id}:${userId}`);
      if (version !== undefined && version >= document.signature_required_since) signed += 1;
    }
    return { ...document, assignedCount: assigned.size, signedCount: signed };
  });
}

// Everything the per-document admin screen needs, including a signature
// list that is NOT restricted to currently-assigned people — someone who
// signed and was later unassigned still belongs in the record.
export async function getDocumentAdmin(documentId) {
  const [docRes, versionsRes, assignRes, sigRes] = await Promise.all([
    programming.from("documents").select(DOCUMENT_FIELDS).eq("id", documentId).maybeSingle(),
    programming
      .from("document_versions")
      .select("id, version, title, requires_resignature, created_at")
      .eq("document_id", documentId)
      .order("version", { ascending: false }),
    programming.from("document_assignments").select("id, user_id, assigned_at").eq("document_id", documentId),
    programming
      .from("document_signatures")
      .select("id, user_id, signed_version, typed_name, signed_at")
      .eq("document_id", documentId)
      .order("signed_at", { ascending: false }),
  ]);
  if (docRes.error) throw docRes.error;
  if (versionsRes.error) throw versionsRes.error;
  if (assignRes.error) throw assignRes.error;
  if (sigRes.error) throw sigRes.error;
  if (!docRes.data) return null;
  return {
    document: docRes.data,
    versions: versionsRes.data ?? [],
    assignments: assignRes.data ?? [],
    signatures: sigRes.data ?? [],
  };
}

export async function createDocument({ title, body, bodyFormat = "html", requiresSignature, createdBy }) {
  const { data, error } = await programming
    .from("documents")
    .insert({
      title: title.trim(),
      body,
      body_format: bodyFormat,
      requires_signature: requiresSignature,
      created_by: createdBy ?? null,
    })
    .select("id, version")
    .single();
  if (error) throw error;

  // Snapshot v1. Plain sequential writes, not a transaction — this repo's
  // convention. If this half fails the document still exists and is
  // editable, and the next save writes a snapshot; nothing is corrupted.
  const { error: versionError } = await programming.from("document_versions").insert({
    document_id: data.id,
    version: 1,
    title: title.trim(),
    body,
    body_format: bodyFormat,
    created_by: createdBy ?? null,
  });
  if (versionError) throw versionError;
  return data.id;
}

// Every save snapshots. `requiresResignature` is the only thing that
// invalidates existing signatures, and it does so by moving a single
// integer rather than writing over anyone's signature row — so the record
// of what each person signed the first time survives intact.
export async function saveDocument({
  documentId,
  currentVersion,
  title,
  body,
  bodyFormat = "html",
  requiresSignature,
  requiresResignature,
  userId,
}) {
  const nextVersion = currentVersion + 1;
  const patch = {
    title: title.trim(),
    body,
    body_format: bodyFormat,
    requires_signature: requiresSignature,
    version: nextVersion,
    updated_at: new Date().toISOString(),
  };
  if (requiresResignature) patch.signature_required_since = nextVersion;

  const { error: versionError } = await programming.from("document_versions").insert({
    document_id: documentId,
    version: nextVersion,
    title: title.trim(),
    body,
    body_format: bodyFormat,
    requires_resignature: Boolean(requiresResignature),
    created_by: userId ?? null,
  });
  if (versionError) throw versionError;

  const { error } = await programming.from("documents").update(patch).eq("id", documentId);
  if (error) throw error;
  return nextVersion;
}

export async function setDocumentAssigned({ documentId, userId, assigned, assignedBy }) {
  if (assigned) {
    const { error } = await programming
      .from("document_assignments")
      .upsert(
        { document_id: documentId, user_id: userId, assigned_by: assignedBy ?? null },
        { onConflict: "document_id,user_id" }
      );
    if (error) throw error;
    return;
  }
  const { error } = await programming
    .from("document_assignments")
    .delete()
    .eq("document_id", documentId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function setDocumentArchived(documentId, archived) {
  const { error } = await programming
    .from("documents")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw error;
}

// Only ever offered for a document nobody has signed — the FKs would
// happily cascade signatures away, and those are the record.
export async function deleteDocument(documentId) {
  const { error } = await programming.from("documents").delete().eq("id", documentId);
  if (error) throw error;
}

// The recovery path for a mis-click. Admin-only at the RLS level: a coach
// has no delete policy on their own signature.
export async function deleteSignature(signatureId) {
  const { error } = await programming.from("document_signatures").delete().eq("id", signatureId);
  if (error) throw error;
}
