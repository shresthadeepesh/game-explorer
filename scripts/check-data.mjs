#!/usr/bin/env node
// Integrity gate for the generated dataset. Runs as part of `npm run build:data`
// so a bad edit to source-games.mjs fails at build time rather than in the page.
//
//   node scripts/check-data.mjs

import { readFileSync, existsSync } from "node:fs";
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

const covered = data.games.filter((g) => g.image || g.imageUrl).length;
console.log(`checked ${data.games.length} games · ${Object.keys(data.categories).length} categories · ${covered} with real cover art`);
if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? "s" : ""}:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("dataset is consistent");
