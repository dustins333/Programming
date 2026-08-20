// CCrew acceptance checks. Run after ANY change to lib/ccrew/rules.js.
//
//   python3 scripts/ccrew_extract_sheets.py > /tmp/ccrew_sheets.json
//   node scripts/ccrew_validate.mjs /tmp/ccrew_sheets.json ~/Downloads/generated-67.csv
//
// CHECK 1 — the July 2026 replay. Running the ruleset over that month must
//   reproduce Terra's actual wall list exactly: every one of her 89 names
//   scores qualified, and nobody she left off is picked up.
// CHECK 2 — the backfill. What is committed to the database must match what
//   22 months of real history says.
import { readFileSync } from "node:fs";
import { loadCcrewLib } from "./ccrew_bundle.mjs";
import { dbQuery } from "./ccrew_db.mjs";

const REPO = process.cwd();
const L = await loadCcrewLib(REPO);
const [, , sheetsPath, csvPath] = process.argv;
const sheets = JSON.parse(readFileSync(sheetsPath, "utf8"));
const { rows: kilo } = L.parseKiloCsv(readFileSync(csvPath, "utf8"));

const EMAIL_ALIASES = { "tmarjonen1@gmail.com": "terra@kovastrength.com" };
const NAME_MERGES = { "ashley mullet": "Ashley Mullett", "janet shepard": "Janet Shepherd" };
const norm = (n) => String(n || "").replace(/\s+/g, " ").trim();
const nameKey = (n) => (NAME_MERGES[norm(n).toLowerCase()] || norm(n)).toLowerCase();

const users = dbQuery("select id, lower(email) as email, role from core.users;");
const usersByEmail = new Map(users.map((u) => [u.email, u]));
const staffByName = new Map();
for (const r of kilo) {
  const u = usersByEmail.get(EMAIL_ALIASES[r.email] || r.email);
  staffByName.set(nameKey(r.name), Boolean(u && (u.role === "coach" || u.role === "admin")));
}

let failures = 0;
const check = (label, actual, expected) => {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(46)} ${actual}${ok ? "" : `   expected ${expected}`}`);
};

// ---------------------------------------------------------------- CHECK 1
console.log("\nCHECK 1 — July 2026 replay against Terra's real wall list\n");
const july = sheets.months["2026-07-01"].rows;

// Direction A: scored from that month's FROZEN packages, every name on her
// list must come out qualified.
const missed = july.filter(
  (r) => !L.evaluate(r.attendance, r.packages, staffByName.get(nameKey(r.name)) || false).qualified
);
check("her list, scored qualified", `${july.length - missed.length}/${july.length}`, `${july.length}/${july.length}`);
check("false negatives", missed.length, 0);
for (const m of missed) console.log(`        MISSED ${m.name} att=${m.attendance} pkgs=${m.packages}`);

// Direction B: scored from the raw export, nobody may be picked who isn't
// on her list.
const truth = new Set(july.map((r) => nameKey(r.name)));
const picked = kilo.filter((r) => {
  const u = usersByEmail.get(EMAIL_ALIASES[r.email] || r.email);
  return L.evaluate(r.attendance, r.packages, Boolean(u && (u.role === "coach" || u.role === "admin"))).qualified;
});
const falsePos = picked.filter((r) => !truth.has(nameKey(r.name)));
check("false positives from the full roster", falsePos.length, 0);
for (const f of falsePos) console.log(`        EXTRA ${f.name} att=${f.attendance} pkgs=${f.packages}`);

// The two her list has that today's export can't reproduce, and why. Both
// are the package-drift the freeze rule exists for, or a member who left.
const notPicked = [...truth].filter((k) => !picked.some((p) => nameKey(p.name) === k));
console.log(`\n  picked ${picked.length} of her ${july.length}; the ${notPicked.length} not reproducible from TODAY's export:`);
for (const k of notPicked) {
  const row = july.find((r) => nameKey(r.name) === k);
  const now = kilo.find((r) => nameKey(r.name) === k);
  if (!now) console.log(`        ${row.name} — no longer in the export (left the gym)`);
  else console.log(`        ${row.name} — packages changed since July: "${row.packages}" -> "${now.packages}"`);
}
console.log("  (this is exactly why packages and targets are frozen at commit time)");

// ---------------------------------------------------------------- CHECK 2
console.log("\nCHECK 2 — the committed backfill\n");
const periods = dbQuery("select period::text, roster_count, qualified_count from programming.ccrew_periods order by period;");
const hist = dbQuery(`
  select m.name, count(*) as months
  from programming.ccrew_records r
  join programming.ccrew_members m on m.id = r.member_id
  where r.qualified group by m.name order by months desc, m.name;`);
const memberCount = dbQuery("select count(*)::int as n from programming.ccrew_members;")[0].n;

check("months backfilled", periods.length, 22);
check("first month", periods[0].period, "2024-10-01");
check("last month", periods.at(-1).period, "2026-07-01");
check("roster members", memberCount, 139);
// 121, NOT the 123 in ccrew-spec.md's "Expected result" block. That figure
// was computed with the 2024 tabs taken at FACE VALUE — the one thing the
// spec's own Backfill section says not to do. Face value credits 127 people
// and the spec subtracts 4, but applying the documented rules removes 6:
//   Amanda Rynes (best month 0.38), Barbara Wright (0.25), Liz Marsden
//   (0.75), Dustin Smout (0 attendance) — the 4 the spec means — plus
//   Cristin Ellis and Mary Ann Allison, who are BOTH 1x targets caught by
//   rule 3's ">= 2" eligibility gate. The spec names Cristin Ellis by name
//   as someone who can never make CCrew, so excluding her is deliberate.
// The same face-value reading is why the spec quotes Callie White at 19 and
// Danielle Hinkson at 18: each has one 2024 month below the bar (Callie 9/12
// = 0.75, which is the exact example the spec itself gives as failing).
check("members with history", hist.length, 121);

const counts = hist.map((h) => Number(h.months)).sort((a, b) => a - b);
const median = counts.length % 2 ? counts[(counts.length - 1) / 2] : (counts[counts.length / 2 - 1] + counts[counts.length / 2]) / 2;
check("median months", median, 10);

const perfect = hist.filter((h) => Number(h.months) === 22).map((h) => h.name).sort();
check("perfect 22/22 records", perfect.length, 5);
check(
  "and they are",
  perfect.join(", "),
  "Amanda Smout, Bernadette Sessions, Kristan Alford, Michelle Dodge, Sarah Cunningham"
);

// Every rule the spec names by example, checked against what actually landed.
const spot = dbQuery(`
  select m.name, count(*) filter (where r.qualified) as months
  from programming.ccrew_members m
  left join programming.ccrew_records r on r.member_id = m.id
  where m.name in ('Lisa Allen','Cristin Ellis','Callie White','Danielle Hinkson')
  group by m.name order by m.name;`);
console.log("");
for (const s of spot) console.log(`  ${s.name.padEnd(20)} ${s.months} months`);
check("Lisa Allen (spec: 21)", spot.find((s) => s.name === "Lisa Allen")?.months, 21);
check("Cristin Ellis — Conditioning only, never eligible", spot.find((s) => s.name === "Cristin Ellis")?.months, 0);

// ---------------------------------------------------------------- CHECK 3
// Identity round-trip. Re-running the same export against what is already
// committed must recognise EVERY person — nobody may come back as new.
// This caught a real bug: the backfill stored Terra under her Kova email
// (terra@kovastrength.com) while Kilo exports her as tmarjonen1@gmail.com,
// so the next upload would have created a second row for her and silently
// restarted a 20-month streak at 1. The stored key is always the email
// Kilo sends; the link to Kova lives in user_id.
console.log("\nCHECK 3 — identity round-trip against the committed roster\n");
const committed = dbQuery("select id, email, name, user_id, is_active from programming.ccrew_members;");
const round = L.buildPreview({ rows: kilo, members: committed, kovaUsers: users });
check("people in the export seen as new", round.counts.newMembers, 0);
check("staff recognised (2x floor applied)", round.entries.filter((e) => e.staffFloorApplied).length > 0, "true");
const stillDropped = L.droppedMembers(kilo, committed);
check("active members missing from the export", stillDropped.length, 0);
const terra = round.entries.find((e) => e.email === "tmarjonen1@gmail.com");
check("Terra linked to her Kova account", Boolean(terra?.kovaUser), "true");
check("Terra judged at the staff 2x floor", terra?.target, 2);

console.log(failures ? `\n${failures} CHECK(S) FAILED\n` : "\nall checks pass\n");
process.exit(failures ? 1 : 0);
