// Exercises the SAME paged reads the CCrew screens use, over the REST API
// rather than raw SQL.
//
// This exists because raw SQL has no 1000-row cap and PostgREST does — which
// is exactly how the truncation bug survived the first round of validation:
// every SQL check passed while the app silently lost the four most recent
// months off the end of the streak query.
//
//   SUPABASE_SERVICE_KEY=... node scripts/ccrew_readpath.mjs
//
// Uses the service key only to reach the data (the row cap is applied to
// every role alike). RLS is verified separately by impersonation in SQL.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { loadCcrewLib } from "./ccrew_bundle.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_KEY;
if (!KEY) throw new Error("set SUPABASE_SERVICE_KEY (never commit it)");

const PAGE = 1000;
async function fetchPaged(path) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const r = await fetch(`${BASE}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "programming", Range: `${from}-${from + PAGE - 1}` },
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const d = await r.json();
    out.push(...d);
    if (d.length < PAGE) return out;
  }
}
async function fetchUnpaged(path) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Accept-Profile": "programming" },
  });
  return (await r.json()).length;
}

const L = await loadCcrewLib(process.cwd());
const sqlCount = Number(
  execFileSync("supabase", ["db", "query", "--linked", "select count(*)::int as n from programming.ccrew_records where qualified;"])
    .toString().match(/"n": (\d+)/)[1]
);

const periods = await fetchPaged("ccrew_periods?select=*&order=period.desc");
const members = await fetchPaged("ccrew_members?select=id,email,name,user_id,is_active&order=name");
const qual = await fetchPaged("ccrew_records?select=period,member_id&qualified=eq.true&order=period");
const unpaged = await fetchUnpaged("ccrew_records?select=period,member_id&qualified=eq.true&order=period");

const allPeriods = periods.map((p) => p.period).sort();
const byMember = new Map();
for (const r of qual) {
  if (!byMember.has(r.member_id)) byMember.set(r.member_id, []);
  byMember.get(r.member_id).push(r.period);
}
const people = members.filter((m) => m.is_active)
  .map((m) => ({ name: m.name, ...L.computeStreaks(byMember.get(m.id) || [], allPeriods) }));
const dogs = L.topDogs(people, allPeriods);

let fail = 0;
const check = (l, a, e) => {
  const ok = String(a) === String(e);
  if (!ok) fail += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${l.padEnd(46)} ${a}${ok ? "" : `   expected ${e}`}`);
};

console.log("\nREAD PATH — over REST, exactly as the screens fetch\n");
console.log(`  a single unpaged request returns ${unpaged} of ${sqlCount} rows — the cap is real\n`);
check("paged fetch returns every qualifying record", qual.length, sqlCount);
check("periods", periods.length, 22);
check("members", members.length, 139);
check("Top Dogs", dogs.length, 5);
check("  and they are", dogs.map((d) => d.name).join(", "),
  "Amanda Smout, Bernadette Sessions, Kristan Alford, Michelle Dodge, Sarah Cunningham");
check("streak==1", people.filter((p) => p.current === 1).length, 18);
check("streak==2", people.filter((p) => p.current === 2).length, 26);
check("streak==22", people.filter((p) => p.current === 22).length, 5);
check("Lisa Allen lifetime / streak",
  `${people.find((p) => p.name === "Lisa Allen")?.lifetime} / ${people.find((p) => p.name === "Lisa Allen")?.current}`, "21 / 1");

const jul = periods.find((p) => p.period === "2026-07-01");
const s = L.monthStats({ qualified: jul.qualified_count, tier3: 35, tier2: 53, total: jul.roster_count });
check("backfilled month: total unknown", s.totalKnown, "false");
check("backfilled month: no invented percentage", String(s.committedShare), "null");
const up = L.monthStats({ qualified: 87, tier3: 35, tier2: 52, total: 139 });
check("uploaded month: shares composed", `${up.tier3Share}+${up.tier2Share}=${up.committedShare}`, "25%+37%=63%");

console.log(fail ? `\n${fail} FAILED\n` : "\nread path clean\n");
process.exit(fail ? 1 : 0);
