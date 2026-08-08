// Client-side CSV generation for the admin Pay Periods close-and-export
// flow — no CSV library needed, a CSV is just comma-joined/quoted text.
// Web-only for v1 (Blob + anchor download): this codebase has no
// expo-file-system/expo-sharing dependency, and admin payroll work already
// happens on the web build per this app's own "coaches do the majority of
// real program-building work on the web build" precedent.
import { Platform } from "react-native";
import { computeEntryBreakdown, formatMoney } from "./calc";

const COLUMNS = [
  "Staff Name",
  "Date",
  "Group Sessions",
  "Programs Written",
  "Admin Hours",
  "Welcome Sessions",
  "Strategy Sessions",
  "Ops Hours",
  "SPC Session",
  "SPC Attendees",
  "SPC Notes",
  "Other Type",
  "Other Qty",
  "Custom Amount",
  "Custom Description",
  "Notes",
  "Amount",
];

function csvCell(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function rowFor(entry, rateMaps) {
  const amount = computeEntryBreakdown(entry, rateMaps).total;
  return [
    entry.staff_name,
    entry.entry_date,
    entry.group_sessions ?? "",
    entry.programs_written ?? "",
    entry.admin_hours ?? "",
    entry.welcome_sessions ?? "",
    entry.strategy_sessions ?? "",
    entry.ops_hours ?? "",
    entry.spc_session ? "yes" : "",
    entry.spc_attendees ?? "",
    entry.spc_notes ?? "",
    entry.other_type ?? "",
    entry.other_qty ?? "",
    entry.custom_amt ?? "",
    entry.custom_description ?? "",
    entry.notes ?? "",
    formatMoney(amount),
  ];
}

export function buildPeriodCsv(entries, rateMaps) {
  const lines = [COLUMNS.map(csvCell).join(",")];
  for (const entry of entries || []) {
    lines.push(rowFor(entry, rateMaps).map(csvCell).join(","));
  }
  return lines.join("\n");
}

// Returns true if the download actually fired (web only) — callers on
// native should show a toast instead rather than silently no-op.
export function downloadCsv(filename, csvString) {
  if (Platform.OS !== "web") return false;
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
  return true;
}
