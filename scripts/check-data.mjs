#!/usr/bin/env node
// Integrity gate for the generated dataset. Runs as part of `npm run build:data`
// so a bad edit to source-games.mjs fails at build time rather than in the page.
//
//   node scripts/check-data.mjs

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES } from "../src/categories.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "data", "games.json"), "utf8"));
const csv = readFileSync(join(ROOT, "data", "games.csv"), "utf8").trim().split("\n");

const problems = [];
const fail = (id, message) => problems.push(`${id}: ${message}`);

const seenIds = new Set();
const seenTitleYear = new Set();
const thisYear = new Date().getFullYear();

for (const game of data.games) {
  const { id } = game;
  if (seenIds.has(id)) fail(id, "duplicate id");
  seenIds.add(id);

  const key = `${game.title.toLowerCase()}::${game.year}`;
  if (seenTitleYear.has(key)) fail(id, `duplicate title for ${game.year}`);
  seenTitleYear.add(key);

  if (!id.endsWith(`-${game.year}`)) fail(id, "id does not end in its year");
  if (!Number.isInteger(game.year) || game.year < 1970 || game.year > thisYear + 2) fail(id, `implausible year ${game.year}`);
  if (!CATEGORIES[game.category]) fail(id, `unknown category ${game.category}`);
  else if (!CATEGORIES[game.category].genres.includes(game.genre)) fail(id, `genre "${game.genre}" is not mapped to ${game.category}`);
  if (game.color !== CATEGORIES[game.category]?.color) fail(id, "colour does not match its category");
  if (!game.blurb || game.blurb.length < 20) fail(id, "blurb missing or too short");
  if (!Number.isInteger(game.rank) || game.rank < 1) fail(id, "bad rank");
  if (typeof game.seed !== "number") fail(id, "missing art seed");

  for (const field of ["wiki", "guide", "trailer"]) {
    if (!/^https:\/\//.test(game[field] || "")) fail(id, `${field} is not an https url`);
  }
  if (game.image && !existsSync(join(ROOT, game.image))) fail(id, `image ${game.image} is missing from disk`);
  if (game.imageUrl && !/^https:\/\//.test(game.imageUrl)) fail(id, "imageUrl is not an https url");
  if (game.released && !/^\d{4}-\d{2}-\d{2}$/.test(game.released)) fail(id, `released "${game.released}" is not a date`);
  if (!game.search.includes(game.title.toLowerCase())) fail(id, "search string does not contain the title");
}

// the year index must agree with the games it points at
for (const row of data.years) {
  for (const id of row.ids) {
    const game = data.games.find((g) => g.id === id);
    if (!game) fail(id, `listed under ${row.year} but not in games`);
    else if (game.year !== row.year) fail(id, `indexed under ${row.year} but dated ${game.year}`);
  }
}

if (data.count !== data.games.length) problems.push(`count says ${data.count}, games has ${data.games.length}`);
if (csv.length - 1 !== data.games.length) problems.push(`csv has ${csv.length - 1} rows for ${data.games.length} games`);

// the catalogue is optional, but if it is present its index must match its files
const catalogueIndex = join(ROOT, "data", "catalog", "index.json");
let catalogue = null;
if (existsSync(catalogueIndex)) {
  catalogue = JSON.parse(readFileSync(catalogueIndex, "utf8"));
  const seen = new Set();
  for (const { year, count } of catalogue.years) {
    const file = join(ROOT, "data", "catalog", `${year}.json`);
    if (!existsSync(file)) { problems.push(`catalogue: ${year}.json is missing`); continue; }
    const yearData = JSON.parse(readFileSync(file, "utf8"));
    if (yearData.games.length !== count) problems.push(`catalogue ${year}: index says ${count}, file has ${yearData.games.length}`);
    for (const game of yearData.games) {
      if (game.year !== year) problems.push(`catalogue ${year}: ${game.qid} is dated ${game.year}`);
      if (seen.has(game.qid)) problems.push(`catalogue: ${game.qid} appears in more than one year`);
      seen.add(game.qid);
    }
  }
  const counted = catalogue.years.reduce((n, y) => n + y.count, 0);
  if (counted !== catalogue.total) problems.push(`catalogue: total says ${catalogue.total}, years add to ${counted}`);
}

const specsFile = join(ROOT, "data", "specs.json");
let specs = null;
if (existsSync(specsFile)) {
  specs = JSON.parse(readFileSync(specsFile, "utf8"));
  const ids = new Set(data.games.map((g) => g.id));
  for (const [id, spec] of Object.entries(specs.games || {})) {
    if (!ids.has(id)) problems.push(`specs: ${id} is not in the dataset`);
    if (spec.status === "ok" && !spec.minimum && !spec.recommended) problems.push(`specs: ${id} is marked ok with no requirements`);
  }
}

// The offline shell is a hand-maintained list, so it silently rots whenever a
// module is added. Catch that here rather than on someone's aeroplane.
const sw = readFileSync(join(ROOT, "sw.js"), "utf8");
const shellList = sw.match(/const SHELL_FILES = \[([\s\S]*?)\];/)?.[1] || "";
const shipped = new Set([...shellList.matchAll(/"\.\/([^"]+)"/g)].map((m) => m[1]));
for (const file of readdirSync(join(ROOT, "src"))) {
  if (!/\.(js|css)$/.test(file)) continue;
  if (!shipped.has(`src/${file}`)) problems.push(`sw.js: src/${file} is not in SHELL_FILES`);
}
for (const file of shipped) {
  if (file.startsWith("src/") && !existsSync(join(ROOT, file))) problems.push(`sw.js: SHELL_FILES lists missing ${file}`);
}

const covered = data.games.filter((g) => g.image || g.imageUrl).length;
console.log(`checked ${data.games.length} games · ${Object.keys(data.categories).length} categories · ${covered} with real cover art${catalogue ? ` · catalogue ${catalogue.total} across ${catalogue.years.length} years` : ""}${specs ? ` · specs for ${Object.values(specs.games || {}).filter((s) => s.status === "ok").length}` : ""}`);
if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? "s" : ""}:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("dataset is consistent");
