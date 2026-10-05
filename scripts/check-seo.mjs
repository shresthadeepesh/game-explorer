#!/usr/bin/env node
// Integrity gate for the crawlable pages, the sitemap and the metadata on the
// app shell. Runs in `npm test`, so a dataset change that is not followed by
// `npm run build:seo` fails here rather than quietly shipping a stale index.
//
//   node scripts/check-seo.mjs        (or: npm run check:seo)

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => readFileSync(join(ROOT, ...parts), "utf8");

const problems = [];
const fail = (message) => problems.push(message);

const data = JSON.parse(read("data", "games.json"));

// ------------------------------------------------------------- the generated

if (!existsSync(join(ROOT, "games"))) {
  console.error("games/ is missing — run `npm run build:seo`");
  process.exit(1);
}

const pages = readdirSync(join(ROOT, "games")).filter((f) => f.endsWith(".html"));
const expected = data.games.length + 1;                       // every game, plus the index
if (pages.length !== expected) fail(`games/ has ${pages.length} pages for ${expected} expected — rebuild with \`npm run build:seo\``);

for (const game of data.games) {
  const file = join(ROOT, "games", `${game.id}.html`);
  if (!existsSync(file)) { fail(`games/${game.id}.html is missing`); continue; }
  const html = read("games", `${game.id}.html`);

  if (!html.includes(`<link rel="canonical"`)) fail(`${game.id}: no canonical link`);
  if (!html.includes('"@type": "VideoGame"')) fail(`${game.id}: no VideoGame structured data`);
  if (!html.includes(`#game=${game.id}`)) fail(`${game.id}: does not link back into the app`);
  // The title has to be in the markup, not assembled by a script.
  if (!html.includes(`<h1>`)) fail(`${game.id}: no h1`);

  for (const block of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(block[1]); } catch (error) { fail(`${game.id}: structured data is not valid JSON (${error.message})`); }
  }
}

const index = read("games", "index.html");
for (const game of data.games) {
  if (!index.includes(`href="${game.id}.html"`)) fail(`games/index.html does not link ${game.id}`);
}

// ------------------------------------------------------------------- sitemap

const sitemap = read("sitemap.xml");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length !== data.games.length + 2) fail(`sitemap has ${locs.length} urls for ${data.games.length + 2} expected`);
for (const loc of locs) {
  if (!/^https:\/\//.test(loc)) fail(`sitemap: ${loc} is not an absolute https url`);
  if (/&(?!amp;|lt;|gt;|quot;|#)/.test(loc)) fail(`sitemap: ${loc} has an unescaped ampersand`);
}

const robots = read("robots.txt");
if (!robots.includes("Sitemap: ")) fail("robots.txt does not point at the sitemap");

// ----------------------------------------------------------------- app shell

const shell = read("index.html");
const required = [
  ['<link rel="canonical"', "canonical link"],
  ['property="og:image"', "og:image"],
  ['property="og:title"', "og:title"],
  ['name="twitter:card"', "twitter card"],
  ['"@type": "WebSite"', "WebSite structured data"],
  ['href="games/"', "a crawlable link to the written index"]
];
for (const [needle, what] of required) {
  if (!shell.includes(needle)) fail(`index.html is missing ${what}`);
}
for (const block of shell.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
  try { JSON.parse(block[1]); } catch (error) { fail(`index.html: structured data is not valid JSON (${error.message})`); }
}
if (!existsSync(join(ROOT, "assets", "og.png"))) fail("assets/og.png is missing — run `npm run build:og`");

// ----------------------------------------------------------------------- done

if (problems.length) {
  console.error(`${problems.length} SEO problem${problems.length === 1 ? "" : "s"}:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`seo ok: ${pages.length} pages, ${locs.length} sitemap urls`);
