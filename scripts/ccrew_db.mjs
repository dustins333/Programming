import { execFileSync } from "node:child_process";

// execFileSync (not execSync) so the SQL is passed as one argv entry with no
// shell involved — JSON.stringify'ing it into a shell command turns real
// newlines into literal \n escapes, which the CLI rejects.
export function dbQuery(sql) {
  const out = execFileSync("supabase", ["db", "query", "--linked", sql.replace(/\s+/g, " ").trim()], {
    cwd: process.cwd(),
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
  const j = JSON.parse(out.slice(out.indexOf("{")));
  const rows = j.rows ?? j.result ?? j.data;
  if (!Array.isArray(rows)) throw new Error(`unexpected shape: ${Object.keys(j)}`);
  return rows;
}
