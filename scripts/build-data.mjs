#!/usr/bin/env node
// Builds data/games.json (app runtime) and data/games.csv (spreadsheets, diffs)
// from scripts/source-games.mjs + src/categories.js.
//
//   node scripts/build-data.mjs
//
// If assets/covers/<id>.(jpg|png|webp|avif) exists it is linked as the game's
// image; otherwise image stays null and the app draws procedural cover art.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { RAW } from "./source-games.mjs";
import { CATEGORIES, categoryOf, colorOf } from "../src/categories.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COVERS = join(ROOT, "assets", "covers");
const DATA = join(ROOT, "data");
const MANIFEST = join(DATA, "covers.json");
const ENRICHMENT = join(DATA, "enrichment.json");

const slugify = (s) =>
  s.toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// FNV-1a: stable across runs and machines, so procedural art never shifts.
const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

// Remote cover URLs resolved by scripts/fetch-covers.mjs (IGDB or Wikipedia).
let remoteCovers = {};
if (existsSync(MANIFEST)) remoteCovers = JSON.parse(readFileSync(MANIFEST, "utf8")).covers || {};

// Platforms, studios and exact release dates from Wikidata (scripts/enrich-wikidata.mjs).
let enrichment = {};
if (existsSync(ENRICHMENT)) enrichment = JSON.parse(readFileSync(ENRICHMENT, "utf8")).games || {};

const coverIndex = new Map();
if (existsSync(COVERS)) {
  for (const file of readdirSync(COVERS)) {
    if (/\.(jpe?g|png|webp|avif|svg)$/i.test(file)) coverIndex.set(basename(file, extname(file)), file);
  }
}

const wikiUrl = (article) => `https://en.wikipedia.org/wiki/${encodeURIComponent(article.replace(/ /g, "_"))}`;
// StrategyWiki is guide-first and its article titles are inconsistent, so search
// rather than guess a path that 404s.
const guideUrl = (title) => `https://strategywiki.org/w/index.php?search=${encodeURIComponent(title)}`;
const trailerUrl = (title, year) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${year} trailer`)}`;

const games = [];
for (const [year, list] of RAW) {
  list.forEach(([title, genre, blurb, wikiTitle], i) => {
    const id = `${slugify(title)}-${year}`;
    const category = categoryOf(genre);
    const cover = coverIndex.get(id);
    const remote = remoteCovers[id];
    const extra = enrichment[id] || {};
    games.push({
      id,
      year,
      rank: i + 1,
      title,
      genre,
      category,
      categoryLabel: CATEGORIES[category].label,
      color: colorOf(category),
      blurb,
      image: cover ? `assets/covers/${cover}` : null,
      imageUrl: remote?.url || null,
      imageSource: remote?.source || null,
      imageCredit: remote?.credit || null,
      platforms: extra.platforms || [],
      developers: extra.developers || [],
      publishers: extra.publishers || [],
      released: extra.released || null,
      wikidata: extra.wikidata || null,
      wikiTitle: wikiTitle || title,
      wiki: wikiUrl(wikiTitle || title),
      guide: guideUrl(title),
      trailer: trailerUrl(title, year),
      seed: hash(id),
      search: `${title} ${genre} ${CATEGORIES[category].label} ${year} ${(extra.developers || []).join(" ")} ${(extra.publishers || []).join(" ")} ${(extra.platforms || []).join(" ")}`.toLowerCase()
    });
  });
}

const unmapped = [...new Set(games.filter((g) => !CATEGORIES[g.category].genres.includes(g.genre)).map((g) => g.genre))];
if (unmapped.length) {
  console.error(`Unmapped genres (fell back to "action"): ${unmapped.join(", ")}`);
  process.exitCode = 1;
}

// Wikidata's earliest release date is the check on our hand-entered years.
const drift = games
  .filter((g) => g.released && Number(g.released.slice(0, 4)) !== g.year)
  .map((g) => `${g.id}: dataset ${g.year}, wikidata ${g.released}`);
if (drift.length) console.log(`release-year drift (${drift.length}):\n  ${drift.join("\n  ")}`);

const platformCounts = {};
for (const g of games) for (const p of g.platforms) platformCounts[p] = (platformCounts[p] || 0) + 1;

const years = [...new Set(games.map((g) => g.year))].sort((a, b) => a - b);
const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  count: games.length,
  yearRange: [years[0], years[years.length - 1]],
  categories: Object.fromEntries(
    Object.entries(CATEGORIES).map(([k, c]) => [k, { label: c.label, color: c.color, count: games.filter((g) => g.category === k).length }])
  ),
  platforms: Object.fromEntries(Object.entries(platformCounts).sort((a, b) => b[1] - a[1])),
  years: years.map((year) => ({ year, ids: games.filter((g) => g.year === year).map((g) => g.id) })),
  games
};

mkdirSync(DATA, { recursive: true });
writeFileSync(join(DATA, "games.json"), JSON.stringify(payload, null, 2) + "\n");

const COLUMNS = ["id", "year", "rank", "title", "genre", "category", "categoryLabel", "color", "image", "imageUrl", "imageSource", "released", "platforms", "developers", "publishers", "wikidata", "wiki", "guide", "trailer", "blurb"];
const cell = (v) => {
  const s = v == null ? "" : Array.isArray(v) ? v.join(" | ") : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = [COLUMNS.join(","), ...games.map((g) => COLUMNS.map((c) => cell(g[c])).join(","))].join("\n") + "\n";
writeFileSync(join(DATA, "games.csv"), csv);

const local = games.filter((g) => g.image).length;
const remoteOnly = games.filter((g) => !g.image && g.imageUrl).length;
console.log(`games.json + games.csv: ${games.length} games, ${years.length} years, ${Object.keys(CATEGORIES).length} categories, ${local} local covers, ${remoteOnly} remote-only, ${games.length - local - remoteOnly} procedural`);
