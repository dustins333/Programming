---
name: payroll-to-gusto
description: Push a closed Kova payroll period's per-coach totals into Gusto's Commission field, or check Kova's numbers against what Gusto already shows, using the Gusto MCP connector. Use whenever Terra asks to sync/push/send payroll to Gusto, reconcile a pay period against Gusto, or avoid re-typing the payroll CSV into Gusto by hand.
---

# Payroll → Gusto

Kova's own Payroll module isn't live yet — Gusto is still the real system of record, and every coach here is paid entirely through Gusto's Commission field (confirmed: all 14 active employees are `Commission Only`, $0 base rate). This skill computes what Kova thinks each coach should be paid for a period, shows a diff against what Gusto currently has, and only writes the `Commission` line after an explicit go-ahead. It never submits/runs payroll — that stays a manual step Terra does in Gusto herself.

**Standing rule, not just for this skill: never call `update_payroll` (or anything else that writes) without an explicit, in-the-moment "yes, push it" — not a standing authorization, not "since I ran the skill I must want it to write." Always stop and show the diff first.** And never call `run_payroll` at all, under any circumstance, even if asked — that's out of scope for this skill entirely.

## Prerequisites — check both before starting

1. **Supabase CLI is authenticated and linked**: `supabase projects list` should show `rtgwhchycfnfvwagilkw` with `"linked": true`. If not, this session can't reach the live DB — say so and stop rather than guessing at numbers.
2. **The Gusto MCP connector is available**: if its tools aren't already loaded, `ToolSearch` for them (they're prefixed `mcp__<gusto-server-id>__`, e.g. `list_payrolls`, `get_payroll`, `update_payroll`). If the connector isn't connected in this session at all, tell the user it needs reauthorizing via their claude.ai connector settings — don't try to work around it.

## Step 1 — compute Kova's numbers

```bash
node .claude/skills/payroll-to-gusto/compute_totals.mjs [pay_period_start]
```

Omit the argument to use the most recently *closed* period in `payroll.pay_periods`. This script is read-only (never writes anywhere) and reuses the app's real `lib/payroll/calc.js` logic rather than re-deriving the pay formula, so it can't silently drift from what the Payroll Report tab shows. It returns JSON: `{ period, mapped, unmapped }`.

- `unmapped` — coaches with real pay this period but no `gusto_employee_uuid` on their `core.users` row (i.e. they don't have a Kova coach account yet, or haven't been mapped to Gusto). **List these to the user and skip them** — never guess a mapping by name/email matching yourself. As of 2026-08-09, only Terra herself is mapped; the other 13 real coaches will show up here until they're added as Kova coach accounts and mapped.
- `mapped` — has `gustoEmployeeUuid` and a computed `total`. These are the candidates to reconcile against Gusto.

**Sanity-check anything that looks off before trusting it**: a `null` total, a name that looks mismatched between Kova and Gusto, or (if you're checking a period that's already been paid) a number that disagrees with what was actually paid. This happened on a real test run (2026-08-09, period 2026-07-23) — several coaches' freshly-computed Kova totals didn't match what Gusto had already paid for that same period, almost certainly because that period's `pay_entries` were touched during later dev/testing. Don't paper over a mismatch like that — report it and ask, don't assume the newer number is correct.

## Step 2 — find the matching Gusto payroll

Call `list_payrolls` (no `processing_statuses` filter, or both) and find the entry whose `pay_period.start_date`/`end_date` exactly match Kova's period. If none matches, stop and tell the user — either that period doesn't exist in Gusto yet, or the two systems' pay-period dates have drifted out of alignment (they were exactly aligned as of 2026-08-09).

Then call `get_payroll` on that UUID.

- If `processed: true` (already run/paid), `update_payroll` will reject any write — say so up front rather than attempting it. This is fine for reconciliation/checking, just not for pushing.
- If unprocessed, note each mapped employee's current `fixed_compensations` entry named `"Commission"` (may not exist yet if nothing's been entered).

## Step 3 — show the full diff, every mapped coach

A table: Coach | Gusto's current Commission $ | Kova's computed $ | Δ. Show every mapped coach, including ones with no change — don't silently omit anyone. Wait for the user to explicitly confirm which lines to push (all of them, or specific coaches) before doing anything else.

## Step 4 — write only what was confirmed

One `update_payroll` call, `employee_compensations` array containing only the confirmed employees, each with `fixed_compensations: [{ name: "Commission", amount: "<kova total, e.g. \"1286.90\">" }]`. `name` must be exactly `"Commission"` — that's the real existing type in this company's Gusto, confirmed against a real processed payroll (Abbi Stauffer's `$1,286.90` line matched Kova's own computed total for her exactly).

Report back exactly what was written (or that nothing was, if declined) — before/after per person, not just "done."

## Never do

- Never call `run_payroll`.
- Never write to Gusto without showing the diff and getting an explicit go first, every single run — no standing authorization.
- Never invent a `fixed_compensations` name that doesn't already exist on that payroll — `update_payroll` rejects unknown names anyway, but don't try.
- Never guess a coach↔Gusto mapping — only use rows where `core.users.gusto_employee_uuid` is already set (migration `0046_gusto_employee_mapping.sql`).
