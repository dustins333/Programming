import { getSetting, updateSetting } from "../settings";
import { listAssignmentsForUser } from "./clients";
import { getSpcClient, isSpcActive } from "./spcClients";
import { getClient as getNutritionClient } from "../nutrition/clients";

// Admin kill switch + audience scoping for the coach<->member messaging
// feature (the floating bubbles, the inline "Messages" card, the coach
// inbox) — added after shipping the bubbles, per direct ask: "not sure we
// are ready to ship it yet... I need to be able to turn it off," plus an
// optional finer-grained "turn on messaging for just specific memberships."
// Two core.settings rows, same pattern as NOTIFICATION_TOGGLES on
// app/(coach)/settings.js — `messaging_enabled` defaults true (matches
// already-shipped always-on behavior; an admin has to explicitly flip it
// off), `messaging_audience` defaults to ["all"].
export const MESSAGING_AUDIENCE_ALL = "all";
export const MESSAGING_AUDIENCE_SPC = "spc";
export const MESSAGING_AUDIENCE_NUTRITION = "nutrition";

export async function getMessagingSettings() {
  const [enabled, audience] = await Promise.all([
    getSetting("messaging_enabled", true),
    getSetting("messaging_audience", [MESSAGING_AUDIENCE_ALL]),
  ]);
  return {
    enabled: Boolean(enabled),
    audience: Array.isArray(audience) && audience.length > 0 ? audience : [MESSAGING_AUDIENCE_ALL],
  };
}

export async function setMessagingEnabled(value) {
  await updateSetting("messaging_enabled", value);
}

export async function setMessagingAudience(scopes) {
  await updateSetting("messaging_audience", scopes);
}

// True if `scopes` (one user's own memberships — group program ids plus
// "spc"/"nutrition") intersects the configured audience, or the audience is
// the "everyone" catch-all.
export function matchesMessagingAudience(audience, scopes) {
  if (!audience || audience.includes(MESSAGING_AUDIENCE_ALL)) return true;
  return (scopes ?? []).some((s) => audience.includes(s));
}

// Pure — turns already-loaded membership data into the same scope-key shape
// matchesMessagingAudience expects. Used by callers that already have this
// data loaded (e.g. clients/[userId].js) so they don't need a second
// round-trip on top of getMessagingScopesForUser below.
export function deriveMessagingScopes({ groupProgramIds = [], spcActive = false, nutritionActive = false } = {}) {
  const scopes = [...groupProgramIds];
  if (spcActive) scopes.push(MESSAGING_AUDIENCE_SPC);
  if (nutritionActive) scopes.push(MESSAGING_AUDIENCE_NUTRITION);
  return scopes;
}

// Fetches one user's own membership scopes from scratch — for callers (the
// floating bubbles) that don't already have this client's group/SPC/
// nutrition data loaded. Each lookup is independently isolated: a client
// with, say, no SPC row at all shouldn't make their group memberships fail
// to resolve too.
export async function getMessagingScopesForUser(userId) {
  let groupProgramIds = [];
  try {
    const assignments = await listAssignmentsForUser(userId);
    groupProgramIds = assignments.map((a) => a.group_program_id);
  } catch (err) {
    console.error("Failed to load group memberships for messaging scope check:", err);
  }

  let spcActive = false;
  try {
    spcActive = isSpcActive(await getSpcClient(userId));
  } catch (err) {
    console.error("Failed to load SPC status for messaging scope check:", err);
  }

  let nutritionActive = false;
  try {
    const nutritionClient = await getNutritionClient(userId);
    nutritionActive = nutritionClient?.status === "active";
  } catch (err) {
    console.error("Failed to load nutrition status for messaging scope check:", err);
  }

  return deriveMessagingScopes({ groupProgramIds, spcActive, nutritionActive });
}

// One-stop check for a specific user — both floating bubbles use this on
// mount to decide whether to render at all.
export async function isMessagingEnabledForUser(userId) {
  const [{ enabled, audience }, scopes] = await Promise.all([getMessagingSettings(), getMessagingScopesForUser(userId)]);
  return enabled && matchesMessagingAudience(audience, scopes);
}
