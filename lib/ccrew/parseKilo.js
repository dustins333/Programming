// Parses the CSV Terra downloads from Kilo for a date range.
//
// Columns: Full Name, Current Status, Email, Phone, Class Attendance,
// Class Reservations, Appointment Attendance, Appointment Reservations,
// Imported Event Attendance, Imported Event Reservations, Total Attendance,
// Total Reservations, Current Packages.
//
// Use Total Attendance. Reservations are unreliable — people get checked in
// without ever reserving (Callie White: 12 attended, 4 reserved).

// The file is UTF-8 WITH BOM. Left in place, the first header key comes out
// as "﻿Full Name" and every lookup of "Full Name" silently misses.
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// Minimal RFC 4180 reader. Hand-rolled rather than pulling in a dependency:
// the packages column is comma-separated in historical exports, so quoted
// fields containing commas are real and a naive split would corrupt them.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = stripBom(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const REQUIRED = ["Full Name", "Email", "Total Attendance", "Current Packages"];

/**
 * @returns {{ rows: Array, error: string|null }}
 * rows: { name, email, status, attendance, packages }
 */
export function parseKiloCsv(text) {
  const raw = parseCsv(text || "").filter((r) => r.some((c) => c.trim() !== ""));
  if (!raw.length) return { rows: [], error: "That file is empty." };

  const header = raw[0].map((h) => h.trim());
  const missing = REQUIRED.filter((h) => !header.includes(h));
  if (missing.length) {
    return {
      rows: [],
      error: `That doesn't look like a Kilo export — no ${missing.join(", ")} column.`,
    };
  }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const rows = [];
  for (const cells of raw.slice(1)) {
    const name = (cells[idx["Full Name"]] || "").replace(/\s+/g, " ").trim();
    const email = (cells[idx.Email] || "").trim().toLowerCase();
    if (!name && !email) continue;
    const attendance = parseInt(cells[idx["Total Attendance"]] || "0", 10);
    rows.push({
      name,
      email,
      status: (cells[idx["Current Status"]] || "").trim(),
      attendance: Number.isFinite(attendance) ? attendance : 0,
      packages: (cells[idx["Current Packages"]] || "").trim(),
    });
  }
  return { rows, error: null };
}
