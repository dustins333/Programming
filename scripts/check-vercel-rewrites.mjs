#!/usr/bin/env node
// Every dynamic Expo Router route exports to a file named literally
// "dist/clients/[userId].html". Vercel serves static files, so no request path
// ever matches that name — a dynamic route only works on a fresh load (or a
// refresh, or a push notification deep link) if vercel.json rewrites it.
//
// That bug class fails silently by design: client-side navigation never asks
// the server, so the route works fine in normal use and only 404s for the one
// person who followed a link straight to it. Three routes had already slipped
// through before this check existed. Run it against a real export.
//
//   node scripts/check-vercel-rewrites.mjs [distDir]
//
// Exits non-zero with the exact rewrite lines to paste when anything is missing.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const DIST = process.argv[2] ?? "dist";
const CONFIG = "vercel.json";

if (!existsSync(DIST)) {
  console.error(`No ${DIST}/ to check. Run: npx expo export -p web`);
  process.exit(2);
}

const rewrites = JSON.parse(readFileSync(CONFIG, "utf8")).rewrites ?? [];

// Vercel matches a `:param` against exactly one path segment. `*` is the only
// other form this project uses; both are compiled here rather than pulled in
// from path-to-regexp, to keep the check dependency-free.
const sourceToRegExp = (source) =>
  new RegExp(
    "^" +
      source
        .split("/")
        .map((seg) =>
          seg.startsWith(":")
            ? "[^/]+"
            : seg === "*"
              ? ".*"
              : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        )
        .join("/") +
      "$"
  );

const matchers = rewrites.map((r) => ({ ...r, re: sourceToRegExp(r.source) }));

const htmlFiles = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith(".html")) htmlFiles.push(full);
  }
})(DIST);

const routes = htmlFiles
  .map((f) => "/" + path.relative(DIST, f).replace(/\.html$/, ""))
  // Route-group segments — /(coach)/clients/[userId] — are an artifact of the
  // file layout, not a URL anyone visits. The un-prefixed twin is the real one.
  .filter((r) => !r.split("/").some((s) => s.startsWith("(")))
  .filter((r) => r.includes("["))
  .sort();

const missing = routes.filter((route) => {
  // A concrete URL the way a member would actually request it.
  const sample = route.replace(/\[([^\]]+)\]/g, (_, name) => `sample-${name}`);
  return !matchers.some((m) => m.re.test(sample));
});

// A rewrite pointing at a file that no longer exists is just as broken, and is
// what a renamed or deleted route leaves behind.
const dangling = rewrites.filter((r) => {
  const target = r.destination.split("?")[0].replace(/:(\w+)/g, "*");
  if (target.includes("*")) return false; // parameterised destination, can't resolve statically
  return !existsSync(path.join(DIST, `${target}.html`));
});

for (const route of missing) {
  const source = route.replace(/\[([^\]]+)\]/g, (_, name) => `:${name}`);
  console.error(`MISSING REWRITE  ${route}`);
  console.error(`  { "source": "${source}", "destination": "${route}" },`);
}
for (const r of dangling) {
  console.error(`DANGLING REWRITE ${r.source} -> ${r.destination} (no such file in ${DIST})`);
}

if (missing.length || dangling.length) {
  console.error(
    `\n${missing.length} dynamic route(s) with no rewrite, ${dangling.length} rewrite(s) pointing nowhere.`
  );
  process.exit(1);
}

console.log(`${routes.length} dynamic routes, all covered by ${rewrites.length} rewrites.`);
