#!/usr/bin/env node
// Computes each Gusto-mapped coach's Kova-side payroll total for one pay
// period — read-only, never writes to Supabase or Gusto. The SKILL.md this
// lives next to is what actually reconciles/writes, one explicit
// confirmation at a time.
//
// Reuses lib/payroll/calc.js's real buildRateMaps/computeTotalsByStaff
// rather than re-deriving the pay formula here, so this can never silently
// drift from what the Payroll Report tab shows a coach. It can't be a plain
// `import` of that file though: the repo's package.json has no
// `"type": "module"`, so Node treats plain .js files as CommonJS by
// default, and calc.js uses ESM `export function` syntax — loading it with
// require() would throw a SyntaxError on the first `export`. Instead this
// strips the `export ` keywords and evaluates the result in a vm context,
// then pulls the two functions back out. calc.js has zero imports of its
// own, so this is safe — if that ever changes, this needs a real bundler
// step instead.
//
// Usage: node compute_totals.mjs [pay_period_start]
// Omit the period to use the most recently closed one.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function loadCalc() {
  const src = fs.readFileSync(path.join(REPO_ROOT, "lib/payroll/calc.js"), "utf8");
  const stripped = src.replace(/^export (function|const) /gm, "$1 ");
  const context = {};
  vm.createContext(context);
  const exported = vm.runInContext(`${stripped}\n;({ buildRateMaps, computeTotalsByStaff });`, context);
  if (typeof exported.buildRateMaps !== "function" || typeof exported.computeTotalsByStaff !== "function") {
    throw new Error("Failed to extract buildRateMaps/computeTotalsByStaff from lib/payroll/calc.js — its shape may have changed; this script needs updating.");
  }
  return exported;
}

function dbQuery(sql) {
  const out = execFileSync("supabase", ["db", "query", "--linked", sql], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  const parsed = JSON.parse(out);
  if (parsed.error) throw new Error(`Supabase query failed: ${parsed.error}`);
  return parsed.rows || [];
}

function sqlDate(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new Error(`Not a valid YYYY-MM-DD date: ${str}`);
  return str;
}

function main() {
  const { buildRateMaps, computeTotalsByStaff } = loadCalc();
  const requestedPeriod = process.argv[2] || null;

  let period;
  if (requestedPeriod) {
    const rows = dbQuery(
      `select start_date::text, end_date::text, closed from payroll.pay_periods where start_date = '${sqlDate(requestedPeriod)}';`
    );
    if (!rows.length) throw new Error(`No payroll.pay_periods row for start_date ${requestedPeriod}`);
    period = rows[0];
  } else {
    const rows = dbQuery(
      `select start_date::text, end_date::text, closed from payroll.pay_periods where closed = true order by start_date desc limit 1;`
    );
    if (!rows.length) throw new Error("No closed pay periods found.");
    period = rows[0];
  }

  const entries = dbQuery(`select * from payroll.pay_entries where pay_period_start = '${period.start_date}';`);

  let rateMaps = null;
  if (period.closed) {
    const snap = dbQuery(
      `select core_rates, other_rates, spc_tiers from payroll.closed_period_rate_snapshots where pay_period_start = '${period.start_date}';`
    );
    if (snap.length) {
      rateMaps = buildRateMaps({ coreRates: snap[0].core_rates, otherRates: snap[0].other_rates, spcTiers: snap[0].spc_tiers });
    }
  }
  if (!rateMaps) {
    const coreRates = dbQuery(`select * from payroll.core_rates;`);
    const otherRates = dbQuery(`select * from payroll.other_rates;`);
    const spcTiers = dbQuery(`select * from payroll.spc_tiers;`);
    rateMaps = buildRateMaps({ coreRates, otherRates, spcTiers });
  }

  const byStaff = computeTotalsByStaff(entries, rateMaps);

  const mappedUsers = dbQuery(`select id, name, email, gusto_employee_uuid from core.users where gusto_employee_uuid is not null;`);
  const mappedById = new Map(mappedUsers.map((u) => [u.id, u]));

  const mapped = [];
  const unmapped = [];
  for (const staff of byStaff) {
    const total = Math.round(staff.totals.total * 100) / 100;
    if (total <= 0) continue;
    const row = { userId: staff.userId, staffName: staff.staffName, staffEmail: staff.staffEmail, total };
    const user = staff.userId ? mappedById.get(staff.userId) : null;
    if (user) {
      mapped.push({ ...row, gustoEmployeeUuid: user.gusto_employee_uuid, kovaName: user.name });
    } else {
      unmapped.push(row);
    }
  }

  console.log(JSON.stringify({ period, mapped, unmapped }, null, 2));
}

main();
