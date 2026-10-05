#!/usr/bin/env node
// Copies the publishable site into _site/.
//
//   node scripts/stage-site.mjs
//
// Only what the browser asks for goes in: no scripts/, no README, no .git —
// which is on its own larger than the site. Every path the page loads is
// relative, so the staged tree works from a project subpath unchanged.
//
// Both the Pages workflow and `npm run deploy` stage through here, so the
// published file list cannot drift between the two.

import { rm, mkdir, cp } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "_site");

// .nojekyll keeps Pages from running the tree through Jekyll, which would
// drop anything beginning with an underscore.
const FILES = [
  "index.html", "manifest.webmanifest", "sw.js",
  "icon.svg", "icon-maskable.svg", ".nojekyll",
  "src", "data", "assets"
];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
for (const file of FILES) await cp(join(ROOT, file), join(OUT, file), { recursive: true });
console.log(`staged ${FILES.length} entries into _site/`);
