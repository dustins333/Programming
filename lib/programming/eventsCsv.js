// CSV for an event's responses — the thing a coach actually hands to a
// supplier or works off at the front desk. Plain string building, no
// dependency, same shape as lib/payroll/csvExport.js (whose downloadCsv is
// reused rather than duplicated).
import { downloadCsv } from "../payroll/csvExport";
import { formatDateTimeInBoise } from "../boiseDate";

export { downloadCsv };

function csvCell(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const memberName = (response) => response.member?.name || response.member?.email || "(unknown)";

// One row per line item for an order (that's the shape you fill an order
// form from), one row per person for a sign-up.
export function buildResponsesCsv(event, responses, items, questions) {
  const questionTexts = questions.map((q) => q.question_text);
  const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));

  if (event.response_type === "order") {
    const header = ["Member", "Email", "Item", "Option", "Qty", "Submitted", ...questionTexts];
    const lines = [header.map(csvCell).join(",")];
    for (const response of responses) {
      const answers = Object.fromEntries((response.answers ?? []).map((a) => [a.question, a.answer]));
      for (const li of response.lineItems ?? []) {
        lines.push(
          [
            memberName(response),
            response.member?.email ?? "",
            itemsById[li.event_item_id]?.name ?? "(deleted item)",
            li.option ?? "",
            li.qty,
            formatDateTimeInBoise(response.submitted_at),
            ...questionTexts.map((q) => answers[q] ?? ""),
          ]
            .map(csvCell)
            .join(",")
        );
      }
    }
    return lines.join("\n");
  }

  const header = ["Member", "Email", "Guests", "Submitted", ...questionTexts];
  const lines = [header.map(csvCell).join(",")];
  for (const response of responses) {
    const answers = Object.fromEntries((response.answers ?? []).map((a) => [a.question, a.answer]));
    lines.push(
      [
        memberName(response),
        response.member?.email ?? "",
        response.guest_count ?? 0,
        formatDateTimeInBoise(response.submitted_at),
        ...questionTexts.map((q) => answers[q] ?? ""),
      ]
        .map(csvCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

// Filename off the event title, so several exports don't all land as
// "responses.csv" in the Downloads folder.
export function csvFilename(event) {
  const slug = String(event.title || "event")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${slug || "event"}-responses.csv`;
}
