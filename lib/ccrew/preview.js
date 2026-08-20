import { evaluate, splitPackages, classifyPackage } from "./rules";

// Kilo signals that a person is staff. Both are WRONG at the edges — Terra
// is a paying `Member`, and Banesa holds `Team Lift` and is a coach — which
// is exactly why staff is decided by core.users.role instead. They are still
// worth reading, because a disagreement between them and Kova is the
// signal that someone was hired and never given a Kova account: without the
// flag that person is silently judged at 3x instead of 2x.
const KILO_STAFF_STATUSES = new Set(["non-paying member", "staff", "employee"]);
const KILO_STAFF_PACKAGE = "team lift";

export const FLAG_KINDS = {
  unknownPackage: {
    severity: "high",
    title: "Unrecognised package",
    help: "This package isn't in the rules, so it counted for nothing toward the target. If it's a real commitment, add it before committing — a silent zero quietly makes someone ineligible.",
  },
  staffMismatch: {
    severity: "high",
    title: "Kilo says staff, Kova doesn't",
    help: "Kilo marks this person as staff but they're not a coach or admin in Kova, so they were judged at their full package instead of the 2x staff floor. Usually a new hire without a Kova account yet.",
  },
  conflictingPackages: {
    severity: "medium",
    title: "More than one commitment",
    help: "This person holds commitment packages that disagree. The highest one was used, which is the rule — worth a glance in case one is stale.",
  },
  noKovaAccount: {
    severity: "info",
    title: "No Kova account",
    help: "Fine for the wall — most of the roster isn't in Kova. Only matters for staff (they'd miss the 2x floor) and for app features later.",
  },
};

function isKiloStaff(row) {
  if (KILO_STAFF_STATUSES.has((row.status || "").toLowerCase())) return true;
  return splitPackages(row.packages).some((t) => t.toLowerCase() === KILO_STAFF_PACKAGE);
}

/**
 * Score a whole export against Kova's own data.
 *
 * @param rows        from parseKiloCsv
 * @param members     existing programming.ccrew_members  [{id,email,name,user_id}]
 * @param kovaUsers   core.users                          [{id,email,role,name}]
 * @param overrides   in-preview manual links, { [email]: kovaUserId | null }
 */
export function buildPreview({ rows, members = [], kovaUsers = [], overrides = {} }) {
  const membersByEmail = new Map(members.map((m) => [m.email, m]));
  const usersById = new Map(kovaUsers.map((u) => [u.id, u]));
  const usersByEmail = new Map(kovaUsers.map((u) => [u.email, u]));

  const entries = rows.map((row) => {
    const existing = membersByEmail.get(row.email) || null;

    // Precedence: a link Terra made in this preview beats the stored one,
    // which beats an exact email match. The stored link is the manual match
    // table — taught once, remembered forever — and it must win over the
    // email match, or Terra's own tmarjonen1@gmail.com would keep falling
    // back to "no account" every month.
    let linkedUserId = null;
    if (Object.prototype.hasOwnProperty.call(overrides, row.email)) {
      linkedUserId = overrides[row.email];
    } else if (existing?.user_id) {
      linkedUserId = existing.user_id;
    } else if (usersByEmail.has(row.email)) {
      linkedUserId = usersByEmail.get(row.email).id;
    }

    const kovaUser = linkedUserId ? usersById.get(linkedUserId) || null : null;
    const isStaff = kovaUser ? kovaUser.role === "coach" || kovaUser.role === "admin" : false;
    const result = evaluate(row.attendance, row.packages, isStaff);

    const commitmentTargets = new Set(result.commitments.map((c) => c.target));
    const flags = [];
    if (result.unknown.length) flags.push("unknownPackage");
    if (isKiloStaff(row) && !isStaff) flags.push("staffMismatch");
    if (commitmentTargets.size > 1) flags.push("conflictingPackages");
    if (!kovaUser) flags.push("noKovaAccount");

    return {
      ...row,
      ...result,
      memberId: existing?.id || null,
      linkedUserId,
      kovaUser,
      isStaff,
      isNewMember: !existing,
      flags,
    };
  });

  const byKind = {};
  for (const kind of Object.keys(FLAG_KINDS)) {
    const hits = entries.filter((e) => e.flags.includes(kind));
    if (hits.length) byKind[kind] = hits;
  }

  const qualified = entries.filter((e) => e.qualified);
  return {
    entries,
    flags: byKind,
    counts: {
      roster: entries.length,
      qualified: qualified.length,
      tier3: qualified.filter((e) => e.tier === 3).length,
      tier2: qualified.filter((e) => e.tier === 2).length,
      ineligible: entries.filter((e) => !e.eligible).length,
      newMembers: entries.filter((e) => e.isNewMember).length,
      highFlags: entries.filter((e) => e.flags.some((f) => FLAG_KINDS[f].severity === "high")).length,
    },
  };
}

// Everyone previously active who isn't in this export. Kilo only exports
// active members, so this IS the cancellation signal — mark inactive, never
// delete: their history stays, and if they come back it's still there.
export function droppedMembers(rows, members) {
  const seen = new Set(rows.map((r) => r.email));
  return members.filter((m) => m.is_active && !seen.has(m.email));
}

export { splitPackages, classifyPackage };
