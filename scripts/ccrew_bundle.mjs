// Test harness: concatenates the CCrew lib modules into one runnable ESM
// file so Node can execute the REAL source (RN/Metro ESM without a build
// step). Used by scripts/ccrew_check.mjs and the backfill generator.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function loadCcrewLib(repo) {
  const strip = (f) =>
    readFileSync(join(repo, f), "utf8")
      .replace(/^import[^;]*;$/gm, "")
      .replace(/^export \{[^}]*\};$/gm, "")
      .replace(/^export /gm, "");
  const src =
    strip("lib/ccrew/rules.js") +
    "\n" +
    strip("lib/ccrew/parseKilo.js") +
    "\n" +
    strip("lib/ccrew/preview.js") +
    "\n" +
    strip("lib/ccrew/streaks.js") +
    "\n" +
    strip("lib/ccrew/stats.js") +
    "\nexport { evaluate, clearsTier, splitPackages, classifyPackage, parseKiloCsv, buildPreview, droppedMembers, FLAG_KINDS, computeStreaks, buildOutputBlock, topDogs, monthStats };\n";
  const dir = mkdtempSync(join(tmpdir(), "ccrew-"));
  const file = join(dir, "bundle.mjs");
  writeFileSync(file, src);
  return import(file);
}
