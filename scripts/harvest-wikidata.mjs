#!/usr/bin/env node
// Harvests every video game on Wikidata that has an English Wikipedia article
// into data/catalog/<year>.json plus an index.
//
//   node scripts/harvest-wikidata.mjs            # 1990-2025
//   node scripts/harvest-wikidata.mjs 1998 2001  # a range
//   node scripts/harvest-wikidata.mjs --refile   # re-file everything by first release
//
// Four small queries per year rather than one large one: the query service has
// a 60s budget and answers an overrun with a truncated body, so aggregates over
// the whole class (MIN across every P577) and 250-item VALUES joins both fail
// as malformed JSON. Filtering by year keeps each query bounded.
//
// A game with regional releases has several P577 dates and appears in each of
// those years; processing years in order and skipping ids already placed files
// every game under its earliest release.

import { writeFile, readFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "catalog");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "game-explorer/1.0 (catalogue build)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const REFILE = args.includes("--refile");
const years = args.filter((a) => /^\d{4}$/.test(a)).map(Number);
const FROM = years[0] ?? 1990;
const TO = years[1] ?? 2025;

const itemsQuery = (year) => `
SELECT ?item ?name ?date ?sitelinks ?article WHERE {
  ?item wdt:P31 wd:Q7889 ; wdt:P577 ?date ; wikibase:sitelinks ?sitelinks ; rdfs:label ?name .
  FILTER(YEAR(?date) = ${year}) FILTER(lang(?name) = "en")
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
}`;

const propQuery = (year, pid) => `
SELECT ?item ?label WHERE {
  ?item wdt:P31 wd:Q7889 ; wdt:P577 ?date ; wdt:${pid} ?v .
  FILTER(YEAR(?date) = ${year})
  ?v rdfs:label ?label . FILTER(lang(?label) = "en")
}`;

const PROPS = [["genres", "P136"], ["platforms", "P400"], ["developers", "P178"]];

const firstDateQuery = (qids) => `
SELECT ?item (MIN(?d) AS ?first) WHERE {
  VALUES ?item { ${qids.map((q) => `wd:${q}`).join(" ")} }
  ?item wdt:P577 ?d .
} GROUP BY ?item`;

async function run(sparql, attempt = 0) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/sparql-query", accept: "application/sparql-results+json", "user-agent": UA },
      body: sparql
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) throw new Error(`status ${res.status}`);
    const text = await res.text();
    return JSON.parse(text).results.bindings;          // a truncated body throws and is retried
  } catch (err) {
    if (attempt >= 5) throw err;
    await sleep(6000 * (attempt + 1));
    return run(sparql, attempt + 1);
  }
}

await mkdir(OUT, { recursive: true });

// A year query matches any P577 in that year, so a 1990 port of a 1978 arcade
// game lands in 1990. This pass asks for each game's earliest release date and
// files it there, dropping anything that first shipped before the range.
if (REFILE) {
  const files = (await readdir(OUT)).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  const all = new Map();
  for (const file of files) {
    for (const game of JSON.parse(await readFile(join(OUT, file), "utf8")).games) all.set(game.qid, game);
  }
  console.log(`re-filing ${all.size} games from ${files.length} years`);

  const qids = [...all.keys()];
  const CACHE = join(OUT, "first-dates.json");
  const firstDates = new Map(existsSync(CACHE) ? Object.entries(JSON.parse(await readFile(CACHE, "utf8"))) : []);
  const missing = qids.filter((q) => !firstDates.has(q));
  if (firstDates.size) console.log(`  ${firstDates.size} first dates from cache, ${missing.length} to fetch`);

  for (let i = 0; i < missing.length; i += 200) {
    for (const row of await run(firstDateQuery(missing.slice(i, i + 200)))) {
      firstDates.set(row.item.value.split("/").pop(), row.first.value.slice(0, 10));
    }
    process.stdout.write(`  first dates ${Math.min(i + 200, missing.length)}/${missing.length}\r`);
    await sleep(500);
  }
  if (missing.length) console.log("");
  await writeFile(CACHE, JSON.stringify(Object.fromEntries(firstDates)) + "\n");

  const buckets = new Map();
  let moved = 0, dropped = 0;
  for (const [qid, game] of all) {
    const first = firstDates.get(qid) || game.released;
    const year = Number(first.slice(0, 4));
    if (year < FROM || year > TO) { dropped++; continue; }
    if (year !== game.year) moved++;
    const filed = { ...game, year, released: first };
    if (!buckets.has(year)) buckets.set(year, []);
    buckets.get(year).push(filed);
  }

  const refiled = [];
  for (let year = FROM; year <= TO; year++) {
    const list = (buckets.get(year) || []).sort((a, b) => b.sitelinks - a.sitelinks || a.title.localeCompare(b.title));
    await writeFile(join(OUT, `${year}.json`), JSON.stringify({ year, count: list.length, games: list }) + "\n");
    refiled.push({ year, count: list.length });
  }
  await writeFile(join(OUT, "index.json"), JSON.stringify({
    updatedAt: new Date().toISOString().slice(0, 10),
    total: refiled.reduce((n, y) => n + y.count, 0),
    years: refiled
  }, null, 2) + "\n");

  console.log(`${moved} games moved to their first release year, ${dropped} dropped as older than ${FROM}`);
  console.log(`${refiled.reduce((n, y) => n + y.count, 0)} games across ${refiled.length} years`);
  process.exit(0);
}

const index = [];
const placed = new Set();      // qids already filed under an earlier year

for (let year = FROM; year <= TO; year++) {
  const started = Date.now();
  const games = new Map();

  for (const row of await run(itemsQuery(year))) {
    const qid = row.item.value.split("/").pop();
    if (placed.has(qid) || games.has(qid)) continue;
    games.set(qid, {
      qid,
      title: row.name.value,
      released: row.date.value.slice(0, 10),
      year,
      article: decodeURIComponent(row.article.value.split("/wiki/").pop()).replace(/_/g, " "),
      sitelinks: Number(row.sitelinks.value),          // notability proxy: language editions covering it
      genres: [],
      platforms: [],
      developers: []
    });
  }
  await sleep(700);

  for (const [key, pid] of PROPS) {
    for (const row of await run(propQuery(year, pid))) {
      const game = games.get(row.item.value.split("/").pop());
      if (game && !game[key].includes(row.label.value)) game[key].push(row.label.value);
    }
    await sleep(700);
  }

  for (const qid of games.keys()) placed.add(qid);
  const list = [...games.values()].sort((a, b) => b.sitelinks - a.sitelinks || a.title.localeCompare(b.title));
  await writeFile(join(OUT, `${year}.json`), JSON.stringify({ year, count: list.length, games: list }) + "\n");
  index.push({ year, count: list.length });
  console.log(`  ${year}: ${list.length} games in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

await writeFile(join(OUT, "index.json"), JSON.stringify({
  updatedAt: new Date().toISOString().slice(0, 10),
  total: index.reduce((n, y) => n + y.count, 0),
  years: index
}, null, 2) + "\n");
console.log(`\n${index.reduce((n, y) => n + y.count, 0)} games across ${index.length} years`);
