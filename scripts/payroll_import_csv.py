"""Import one Glide "PayEntries" CSV export into a single Kova pay period.

Companion to payroll_import.py, which does the whole historical xlsx workbook.
This one is for the ongoing case: Terra exports the current period from Glide
as CSV and it becomes the truth for that period in Kova.

Emits SQL on stdout (or to --out). Nothing is executed here.

Idempotent the same way payroll_import.py is: rows reuse Glide's own EntryID as
the primary key and upsert on it. --replace additionally deletes anything in
the period that is NOT in this export, which is what makes the export the
truth rather than a merge.

    python3 scripts/payroll_import_csv.py export.csv --period 2026-08-06 \
        --replace --out /tmp/import.sql
"""

import argparse
import csv
import sys
import uuid
from datetime import date, timedelta

# Glide OtherType values that don't match a row in payroll.other_rates. Real
# entries used these; each is a typo for an existing rate, so remap rather
# than import a type that silently prices at $0.
OTHER_TYPE_FIXES = {
    "Cleaning + BS": "Cleaning",
    "BWA": "BWA Programming",
    "Shawdowing": "Shadowing",
}

# Staff who no longer have a core.users row (left the gym) but still have real
# pay in an export. They import with a NULL user_id — the admin totals key on
# `user_id ?? staff_email` (calc.js computeTotalsByStaff) so their pay still
# counts, they just can't log in to see it.
NAME_FALLBACKS = {
    "krneidner@gmail.com": "Kelsie Neidner",
}

# Deterministic ids for rows Glide exported with no EntryID (it only assigns
# one on certain edit paths). Derived from Glide's own hidden Row ID so a
# re-export of the same row lands on the same primary key and upserts instead
# of duplicating.
ID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "kova:glide:payentry")

PERIOD_LENGTH_DAYS = 14


def sql_str(value):
    if value is None or value == "":
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


def sql_num(value):
    if value is None or value == "":
        return "NULL"
    return repr(float(value))


def sql_int(value):
    if value is None or value == "":
        return "NULL"
    return str(int(float(value)))


def sql_bool(value):
    v = (value or "").strip().upper()
    if v == "TRUE":
        return "true"
    if v == "FALSE":
        return "false"
    return "NULL"


def clean_numeric(value):
    """Glide writes '', 'N/A' and stray whitespace into numeric columns."""
    if value is None:
        return None
    v = str(value).strip()
    if v == "" or v.upper() == "N/A":
        return None
    try:
        float(v)
    except ValueError:
        return None
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--period", required=True, help="pay period start date, YYYY-MM-DD")
    ap.add_argument("--replace", action="store_true", help="delete rows in the period that aren't in this export")
    ap.add_argument("--out")
    args = ap.parse_args()

    start = date.fromisoformat(args.period)
    end = start + timedelta(days=PERIOD_LENGTH_DAYS - 1)

    with open(args.csv_path, newline="", encoding="utf-8-sig") as fh:
        rows = list(csv.DictReader(fh))

    row_id_col = next((c for c in rows[0].keys() if "Row ID" in c), None)
    warnings = []
    values = []
    seen_ids = set()

    for i, r in enumerate(rows, start=2):
        email = (r.get("StaffEmail") or "").strip().lower()
        if not email:
            warnings.append(f"line {i}: skipped, no StaffEmail")
            continue

        entry_date = (r.get("EntryDate") or "")[:10]
        if not entry_date:
            warnings.append(f"line {i}: skipped, no EntryDate")
            continue
        if not (args.period <= entry_date <= end.isoformat()):
            warnings.append(f"line {i}: skipped, EntryDate {entry_date} is outside {args.period}..{end}")
            continue

        entry_id = (r.get("EntryID") or "").strip()
        if not entry_id:
            seed = (r.get(row_id_col) or "").strip() if row_id_col else ""
            if not seed:
                warnings.append(f"line {i}: skipped, no EntryID and no Row ID to derive one from")
                continue
            entry_id = str(uuid.uuid5(ID_NAMESPACE, seed))
            warnings.append(f"line {i}: EntryID was blank; derived {entry_id} from Row ID {seed}")

        if entry_id in seen_ids:
            warnings.append(f"line {i}: dropped duplicate EntryID {entry_id}")
            continue
        seen_ids.add(entry_id)

        other_raw = (r.get("OtherType") or "").strip()
        other_type = OTHER_TYPE_FIXES.get(other_raw, other_raw) or None
        if other_raw and other_type != other_raw:
            warnings.append(f"line {i}: OtherType {other_raw!r} remapped to {other_type!r}")

        # A flagged SPC session with no attendee count prices at $0 — the tier
        # table is keyed on the count (calc.js spcAmountForEntry). Worth
        # surfacing rather than guessing a number.
        spc_session = sql_bool(r.get("SPC_Session"))
        spc_attendees = clean_numeric(r.get("SPC_Attendees"))
        if spc_session == "true" and spc_attendees is None:
            warnings.append(
                f"line {i}: SPC session for {email} on {entry_date} has no attendee count "
                f"— it will price at $0.00 (SPC_Notes: {(r.get('SPC_Notes') or '').strip()!r})"
            )

        other_qty = clean_numeric(r.get("OtherQty"))
        values.append(
            "("
            + ", ".join(
                [
                    sql_str(entry_id),
                    f"(select id from core.users where lower(email) = {sql_str(email)})",
                    f"coalesce((select name from core.users where lower(email) = {sql_str(email)}), "
                    f"{sql_str(NAME_FALLBACKS.get(email, email))})",
                    sql_str(email),
                    sql_str(args.period),
                    sql_str(entry_date),
                    sql_num(clean_numeric(r.get("GroupSessions"))),
                    sql_num(clean_numeric(r.get("ProgramsWritten"))),
                    sql_num(clean_numeric(r.get("AdminHours"))),
                    sql_num(clean_numeric(r.get("WelcomeSessions"))),
                    sql_num(clean_numeric(r.get("StrategySessions"))),
                    sql_num(clean_numeric(r.get("OpsHours"))),
                    spc_session,
                    sql_int(spc_attendees),
                    sql_str(other_type),
                    sql_num(other_qty) if other_qty is not None else "1",
                    sql_num(clean_numeric(r.get("Custom_Amt"))),
                    sql_str((r.get("Custom Description") or "").strip()),
                    sql_str((r.get("Notes") or "").strip()),
                    sql_str((r.get("SPC_Notes") or "").strip()),
                    sql_str((r.get("Program_Notes") or "").strip()),
                    sql_str((r.get("Welcome_Notes") or "").strip()),
                    sql_str((r.get("AdminNotes") or "").strip()),
                    "'legacy_import'",
                    sql_str(entry_id),
                ]
            )
            + ")"
        )

    lines = [
        f"-- Glide CSV import for pay period {args.period} .. {end}",
        f"-- source: {args.csv_path}",
        f"-- {len(values)} entries. Safe to re-run: upserts on id (Glide's EntryID).",
        "begin;",
        f"select payroll.ensure_pay_period('{args.period}');",
    ]

    if args.replace:
        lines += [
            "-- --replace: the export is the truth for this period, so anything",
            "-- in it that the export does not contain is removed.",
            f"delete from payroll.pay_entries where pay_period_start = '{args.period}'",
            "  and id not in (" + ", ".join(sql_str(i) for i in sorted(seen_ids)) + ");",
        ]

    lines += [
        "insert into payroll.pay_entries (id, user_id, staff_name, staff_email, pay_period_start,",
        "  entry_date, group_sessions, programs_written, admin_hours, welcome_sessions, strategy_sessions,",
        "  ops_hours, spc_session, spc_attendees, other_type, other_qty, custom_amt, custom_description,",
        "  notes, spc_notes, program_notes, welcome_notes, admin_notes, source, legacy_entry_id) values",
        ",\n".join(values),
        "on conflict (id) do update set",
        "  user_id = excluded.user_id, staff_name = excluded.staff_name, staff_email = excluded.staff_email,",
        "  entry_date = excluded.entry_date, group_sessions = excluded.group_sessions,",
        "  programs_written = excluded.programs_written, admin_hours = excluded.admin_hours,",
        "  welcome_sessions = excluded.welcome_sessions, strategy_sessions = excluded.strategy_sessions,",
        "  ops_hours = excluded.ops_hours, spc_session = excluded.spc_session,",
        "  spc_attendees = excluded.spc_attendees, other_type = excluded.other_type,",
        "  other_qty = excluded.other_qty, custom_amt = excluded.custom_amt,",
        "  custom_description = excluded.custom_description, notes = excluded.notes,",
        "  spc_notes = excluded.spc_notes, program_notes = excluded.program_notes,",
        "  welcome_notes = excluded.welcome_notes, admin_notes = excluded.admin_notes;",
        "commit;",
    ]

    sql = "\n".join(lines) + "\n"
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(sql)
    else:
        sys.stdout.write(sql)

    print(f"entries: {len(values)} of {len(rows)} CSV rows", file=sys.stderr)
    if warnings:
        print(f"warnings ({len(warnings)}):", file=sys.stderr)
        for w in warnings:
            print("  - " + w, file=sys.stderr)


if __name__ == "__main__":
    main()
