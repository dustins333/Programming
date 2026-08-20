// Generates the CCrew backfill SQL for Oct 2024 – Jul 2026.
//
//   python3 scripts/ccrew_extract_sheets.py > sheets.json
//   node scripts/ccrew_backfill.mjs sheets.json <kilo.csv> > 0068_ccrew_backfill.sql
//
// The rules come from lib/ccrew/rules.js — the same module the upload screen
// runs — so a backfilled month and an uploaded month can never disagree.
// This script only decides WHERE the numbers come from:
//
//   2024 tabs are the RAW roster: apply the threshold, the >=2 eligibility
//        gate and the staff 2x floor. Taking them at face value credits
//        people who scored 0.5 and 0.75.
//   2025/2026 tabs are the FINISHED crew lists: membership IS qualification.
//        Do not re-filter on the ratio column — it holds hardcoded values
//        with known typos (Terra Smout reads 0.00 in Aug 2025 and 0.08 in
//        Jan 2026; both are really 12 attendance against a 3x target) and one
//        genuine exception Terra made by hand (Abby Thompson, July 2025, 6
//        sessions, which fails even the staff 2x bar).
import { readFileSync } from "node:fs";
import { loadCcrewLib } from "./ccrew_bundle.mjs";
import { dbQuery } from "./ccrew_db.mjs";

const REPO = process.cwd();
const L = await loadCcrewLib(REPO);

// Terra's Kilo email is not her Kova login. This is the manual match table
// the spec calls for, seeded with the one match needed on day one.
const EMAIL_ALIASES = { "tmarjonen1@gmail.com": "terra@kovastrength.com" };

// Spelling drift ONLY. The spec's confirmed-different pairs are deliberately
// absent — Kelsey/Kelsie/Missy Neidner all appear on the October 2024 list
// simultaneously with different attendance, and Donna OKelly/Donna Powell,
// Julie/Lorie Martin, Elaine/Diane Miller, Karen Bauer/Kathren Butler and
// Amanda/Angie Thompson are each two real people. Merging any of them would
// fuse two members into one record.
const NAME_MERGES = { "ashley mullet": "Ashley Mullett", "janet shepard": "Janet Shepherd" };

const norm = (n) => String(n || "").replace(/\s+/g, " ").trim();
const nameKey = (n) => (NAME_MERGES[norm(n).toLowerCase()] || norm(n)).toLowerCase();
const sq = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

const [, , sheetsPath, csvPath] = process.argv;
const sheets = JSON.parse(readFileSync(sheetsPath, "utf8"));
const { rows: kilo, error } = L.parseKiloCsv(readFileSync(csvPath, "utf8"));
if (error) throw new Error(error);

// --- the live roster is the whole universe of people we import ---------
// Only import history for people on the current roster; the ~89 historical
// names that belong to former members are dropped entirely.
const kovaUsers = dbQuery("select id, lower(email) as email, role, name from core.users;");
const usersByEmail = new Map(kovaUsers.map((u) => [u.email, u]));

const roster = new Map(); // nameKey -> { name, email, userId, isStaff }
for (const r of kilo) {
  // The STORED key is always the email Kilo sends, never the aliased one.
  // The alias resolves which Kova ACCOUNT this is; it must not rewrite the
  // key, or next month's export (which sends tmarjonen1@gmail.com again)
  // wouldn't match Terra's row and would silently start her a fresh streak
  // — the exact failure the spec's identity rule exists to prevent. The
  // link lives in user_id, which IS the manual match table: taught once
  // here, and from then on buildPreview reads it back off the member row.
  const user = usersByEmail.get(EMAIL_ALIASES[r.email] || r.email) || null;
  roster.set(nameKey(r.name), {
    name: norm(r.name),
    email: r.email,
    userId: user?.id || null,
    isStaff: user ? user.role === "coach" || user.role === "admin" : false,
  });
}

// --- score every month --------------------------------------------------
const periods = Object.keys(sheets.months).sort();
const records = []; // { period, email, attendance, packages, packageTarget, target, qualified, tier, staffFloor }
const skipped = [];

for (const period of periods) {
  const month = sheets.months[period];
  const seen = new Set();
  for (const row of month.rows) {
    const key = nameKey(row.name);
    const person = roster.get(key);
    if (!person) { skipped.push({ period, name: row.name }); continue; }
    if (seen.has(key)) continue; // a name listed twice on one tab
    seen.add(key);

    if (month.kind === "roster") {
      // The sheet's own `expected` column is the number Terra actually
      // judged that month by, and it is already frozen — better than
      // re-deriving from package strings that have since been truncated by
      // the spreadsheet. The RULE is still applied on top of it: the staff
      // 2x floor, the >=2 eligibility gate and the 0.8 threshold.
      const packageTarget = row.expected ?? 0;
      const staffFloor = person.isStaff && packageTarget > 0 && packageTarget !== 2;
      const target = person.isStaff && packageTarget > 0 ? 2 : packageTarget;
      const qualified = target >= 2 && L.clearsTier(row.attendance, target);
      records.push({
        period, email: person.email, attendance: row.attendance, packages: row.packages,
        packageTarget, target, qualified,
        tier: qualified ? (L.clearsTier(row.attendance, 3) ? 3 : 2) : null,
        staffFloor,
      });
    } else {
      // Finished crew list — being on it IS qualification.
      const derived = L.evaluate(row.attendance, row.packages, person.isStaff);
      const packageTarget = row.expected ?? derived.packageTarget;
      const target = person.isStaff && packageTarget > 0 ? 2 : packageTarget;
      // Highest tier actually cleared. The handful of hand-made exceptions
      // that clear neither still belong in the 2x group, which is where
      // Terra put them.
      const tier = L.clearsTier(row.attendance, 3) ? 3 : 2;
      records.push({
        period, email: person.email, attendance: row.attendance, packages: row.packages,
        packageTarget, target, qualified: true, tier,
        staffFloor: person.isStaff && packageTarget > 0 && packageTarget !== 2,
      });
    }
  }
}

// --- emit ---------------------------------------------------------------
const out = [];
out.push(`-- CCrew backfill: ${periods[0]} .. ${periods.at(-1)} (${periods.length} months).`);
out.push(`--`);
out.push(`-- GENERATED by scripts/ccrew_backfill.mjs from the three historical`);
out.push(`-- Google Sheets plus the live Kilo roster. Do not hand-edit — re-run the`);
out.push(`-- generator instead. Idempotent: re-running replaces the same rows.`);
out.push(`--`);
out.push(`-- Rules applied by lib/ccrew/rules.js, the same module the upload screen`);
out.push(`-- uses. 2024 tabs are the raw roster (threshold + staff floor + >=2`);
out.push(`-- eligibility applied); 2025/2026 tabs are finished crew lists taken as`);
out.push(`-- qualified. Only people on the current live roster are imported —`);
out.push(`-- ${skipped.length ? new Set(skipped.map((s) => nameKey(s.name))).size : 0} historical names belong to former members and are dropped.`);
out.push(`begin;`);
out.push("");

out.push(`-- Members: the whole current roster, so the next upload matches by`);
out.push(`-- email and people with no history still show up with zero months.`);
const memberValues = [...roster.values()].map(
  (p) => `  (${sq(p.email)}, ${sq(p.name)}, ${p.userId ? sq(p.userId) + "::uuid" : "NULL"}, true)`
);
out.push(`insert into programming.ccrew_members (email, name, user_id, is_active) values`);
out.push(memberValues.join(",\n"));
out.push(`on conflict (email) do update set`);
out.push(`  name = excluded.name,`);
out.push(`  user_id = coalesce(programming.ccrew_members.user_id, excluded.user_id),`);
out.push(`  is_active = true,`);
out.push(`  updated_at = now();`);
out.push("");

out.push(`-- Periods.`);
for (const period of periods) {
  const rs = records.filter((r) => r.period === period);
  // roster_count is NULL for every backfilled month — see 0069. The
  // 2025/2026 tabs are finished crew lists with no roster in them, and the
  // 2024 tabs survive only as the subset of people still on the roster
  // today, so a "total" from either would be a number nobody could act on.
  out.push(
    `insert into programming.ccrew_periods (period, source, roster_count, qualified_count, notes) values ` +
      `('${period}', 'backfill', NULL, ${rs.filter((r) => r.qualified).length}, ${sq(sheets.months[period].tab)}) ` +
      `on conflict (period) do update set source = excluded.source, roster_count = excluded.roster_count, ` +
      `qualified_count = excluded.qualified_count, notes = excluded.notes;`
  );
}
out.push("");

out.push(`-- Records. Deleted and re-inserted per period so a re-run replaces`);
out.push(`-- cleanly rather than merging into a half-old list.`);
out.push(`delete from programming.ccrew_records where period in (${periods.map((p) => `'${p}'`).join(", ")});`);
out.push("");

for (let i = 0; i < records.length; i += 150) {
  const chunk = records.slice(i, i + 150);
  out.push(
    `insert into programming.ccrew_records (period, member_id, attendance, packages, package_target, target, qualified, tier, staff_floor_applied)`
  );
  out.push(`select v.period::date, m.id, v.attendance, v.packages, v.package_target, v.target, v.qualified, v.tier, v.staff_floor`);
  out.push(`from (values`);
  out.push(
    chunk
      .map(
        (r) =>
          `  ('${r.period}', ${sq(r.email)}, ${r.attendance}, ${sq(r.packages)}, ${r.packageTarget}::smallint, ` +
          `${r.target}::smallint, ${r.qualified}, ${r.tier === null ? "NULL::smallint" : `${r.tier}::smallint`}, ${r.staffFloor})`
      )
      .join(",\n")
  );
  out.push(`) as v(period, email, attendance, packages, package_target, target, qualified, tier, staff_floor)`);
  out.push(`join programming.ccrew_members m on m.email = v.email;`);
  out.push("");
}

out.push(`commit;`);
out.push("");
console.log(out.join("\n"));

// --- summary to stderr so it never lands in the SQL ---------------------
const byPerson = new Map();
for (const r of records) if (r.qualified) {
  if (!byPerson.has(r.email)) byPerson.set(r.email, []);
  byPerson.get(r.email).push(r.period);
}
const counts = [...byPerson.values()].map((v) => v.length).sort((a, b) => a - b);
const median = counts.length % 2 ? counts[(counts.length - 1) / 2] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
const perfect = [...byPerson.entries()].filter(([, v]) => v.length === periods.length).map(([e]) => [...roster.values()].find((p) => p.email === e).name).sort();
console.error(`\nmonths            : ${periods.length}`);
console.error(`roster members    : ${roster.size}`);
console.error(`records           : ${records.length}`);
console.error(`with history      : ${byPerson.size}`);
console.error(`median months     : ${median}`);
console.error(`perfect ${periods.length}/${periods.length}      : ${perfect.length} -> ${perfect.join(", ")}`);
console.error(`dropped names     : ${new Set(skipped.map((s) => nameKey(s.name))).size}`);
