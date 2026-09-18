#!/usr/bin/env node
// Pulls structured facts for every game from Wikidata via SPARQL, keyed off the
// Wikipedia article the dataset already names. No API key, no rate-limit games
// beyond being polite.
//
//   node scripts/enrich-wikidata.mjs
//
// Writes data/enrichment.json: { id: { platforms, developers, publishers,
// released, wikidata } }. build:data merges it into games.json and games.csv.

import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "game-explorer/1.0 (dataset build; https://github.com/local/game-explorer)";
const BATCH = 30;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { games } = JSON.parse(await readFile(join(ROOT, "data", "games.json"), "utf8"));

// Wikipedia article URL is the join key Wikidata indexes with schema:about, and
// it indexes the canonical title only — a redirect finds nothing, so resolve
// every title through the MediaWiki API first.
// Wikidata stores sitelinks with apostrophes and ampersands percent-encoded,
// which encodeURI leaves alone.
const articleUrl = (title) =>
  `https://en.wikipedia.org/wiki/${encodeURI(title.replace(/ /g, "_")).replace(/'/g, "%27").replace(/&/g, "%26")}`;

async function canonicalTitles(titles) {
  const map = new Map(titles.map((t) => [t, t]));
  for (let i = 0; i < titles.length; i += 50) {
    const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "query", format: "json", formatversion: "2", redirects: "1", titles: titles.slice(i, i + 50).join("|")
    });
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`wikipedia api ${res.status}`);
    for (const r of (await res.json()).query.redirects || []) map.set(r.from, r.to);
    if (i + 50 < titles.length) await sleep(800);
  }
  return map;
}

const canonical = await canonicalTitles([...new Set(games.map((g) => g.wikiTitle))]);
const byArticle = new Map();
for (const g of games) byArticle.set(articleUrl(canonical.get(g.wikiTitle) || g.wikiTitle), g.id);
const articles = [...byArticle.keys()];

const QUERY = (batch) => `
SELECT ?article ?item ?developerLabel ?publisherLabel ?platformLabel ?date WHERE {
  VALUES ?article { ${batch.map((a) => `<${a}>`).join(" ")} }
  ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> .
  OPTIONAL { ?item wdt:P178 ?developer. }
  OPTIONAL { ?item wdt:P123 ?publisher. }
  OPTIONAL { ?item wdt:P400 ?platform. }
  OPTIONAL { ?item wdt:P577 ?date. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

async function run(batch, attempt = 0) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/sparql-query", accept: "application/sparql-results+json", "user-agent": UA },
    body: QUERY(batch)
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    await sleep(Number(res.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1));
    return run(batch, attempt + 1);
  }
  if (!res.ok) throw new Error(`sparql ${res.status}`);
  return (await res.json()).results.bindings;
}

const out = {};
const push = (entry, key, value) => {
  if (!value) return;
  entry[key] ??= new Set();
  entry[key].add(value);
};

for (let i = 0; i < articles.length; i += BATCH) {
  const batch = articles.slice(i, i + BATCH);
  const rows = await run(batch);
  for (const row of rows) {
    const id = byArticle.get(row.article.value);
    if (!id) continue;
    const entry = (out[id] ??= { wikidata: row.item.value.split("/").pop() });
    push(entry, "developers", row.developerLabel?.value);
    push(entry, "publishers", row.publisherLabel?.value);
    push(entry, "platforms", row.platformLabel?.value);
    if (row.date?.value) push(entry, "dates", row.date.value.slice(0, 10));
  }
  process.stdout.write(`  wikidata ${Math.min(i + BATCH, articles.length)}/${articles.length}\r`);
  if (i + BATCH < articles.length) await sleep(1500);
}
console.log("");

// Platform labels from Wikidata are inconsistent ("PlayStation 4", "PS4",
// "Microsoft Windows"); fold them into the families people actually filter by.
const FAMILY = [
  [/windows|linux|macos|mac os|dos|steam|pc booter|classic mac/i, "PC"],
  [/playstation|psp|ps vita|playstation vita/i, "PlayStation"],
  [/xbox/i, "Xbox"],
  [/nintendo|wii|game boy|gamecube|nes|snes|switch|nintendo 64|ds$|3ds|famicom/i, "Nintendo"],
  [/sega|mega drive|genesis|dreamcast|saturn|master system/i, "Sega"],
  [/android|ios|ipad|iphone|mobile|windows phone/i, "Mobile"],
  [/arcade/i, "Arcade"],
  [/amiga|atari|commodore|zx spectrum|msx/i, "Retro home computer"],
  [/oculus|vive|virtual reality|quest/i, "VR"],
  [/stadia|geforce now|browser|web/i, "Streaming & web"]
];
const family = (label) => FAMILY.find(([re]) => re.test(label))?.[1] || null;

const payload = {};
let withPlatforms = 0, withDevs = 0, withDates = 0;
for (const [id, entry] of Object.entries(out)) {
  const platforms = [...new Set([...(entry.platforms || [])].map(family).filter(Boolean))].sort();
  const developers = [...(entry.developers || [])].sort();
  const publishers = [...(entry.publishers || [])].sort();
  const released = [...(entry.dates || [])].sort()[0] || null;   // earliest = original release
  if (platforms.length) withPlatforms++;
  if (developers.length) withDevs++;
  if (released) withDates++;
  payload[id] = { wikidata: entry.wikidata, platforms, developers, publishers, released };
}

await writeFile(join(ROOT, "data", "enrichment.json"),
  JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), games: payload }, null, 2) + "\n");

const missing = games.filter((g) => !payload[g.id]).map((g) => g.id);
console.log(`${Object.keys(payload).length}/${games.length} matched · ${withPlatforms} with platforms · ${withDevs} with developers · ${withDates} with release dates`);
if (missing.length) console.log(`no wikidata item: ${missing.join(", ")}`);
console.log("run `npm run build:data` to merge");
