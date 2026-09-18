#!/usr/bin/env node
// Pulls PC system requirements from Steam's store API into data/specs.json.
//
//   node scripts/fetch-specs.mjs              # every game missing specs
//   node scripts/fetch-specs.mjs --only=elden # id substring filter
//   node scripts/fetch-specs.mjs --force      # re-fetch games already known
//   node scripts/fetch-specs.mjs --retry      # re-try only the ones without specs
//
// Steam is the only source for this that needs no key. It only knows PC
// releases, so console-only titles end up recorded as having none rather than
// silently missing — the panel says so.
//
// Matching a title to an app id is the risky part. Valve's own store search
// does the ranking (GetAppList/v2 is gone now), but it still answers with
// soundtracks, demos and sequels, so a candidate has to match the title exactly
// once normalised and land within two years of our release date.

import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "specs.json");
const UA = "game-explorer/1.0 (specs build)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.split("=")[1];
const force = args.includes("--force");
const retry = args.includes("--retry");

// Steam sells editions: "Game of the Year Edition (2009)", "- Ultimate
// Edition", "Remastered". Strip them before comparing, or half the catalogue
// looks like a miss.
// Applied to the raw Steam name, before normalising: normalise drops "the",
// which would turn "Game of the Year Edition" into something this cannot see.
const EDITION = /\b(goty|game of the year|ultimate|definitive|complete|enhanced|legendary|anniversary|special|deluxe|gold|director'?s cut|redux|remastere?d?|remake)\b[\s\S]*$/i;

// A re-listing of the same build ("Game of the Year Edition") keeps the
// original's requirements, so a late store date is fine. A rebuild
// ("Remastered", "Remake", "Definitive Edition") is a different program with
// different requirements, so those stay ambiguous.
const REBUILD = /\b(remastere?d?|remake|definitive|redux|reloaded)\b/i;
const REISSUE = /\b(goty|game of the year|complete|gold|ultimate|anniversary|deluxe|legendary|special)\b/i;

const stripEdition = (name) => name
  .replace(/\((?:19|20)\d{2}\)/g, "")
  .replace(EDITION, "")
  .replace(/[®™©]/g, "")
  .replace(/[\s:–-]+$/, "")
  .trim();

const normalise = (title) => title
  .toLowerCase()
  .replace(/[''’]/g, "")
  .replace(/&/g, " and ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(the|a|an)\b/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const matches = (steamName, wanted) =>
  normalise(steamName) === wanted || normalise(stripEdition(steamName)) === wanted;

async function searchSteam(title) {
  const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=en&cc=us`, {
    headers: { "user-agent": UA }
  });
  if (res.status === 429) { await sleep(20000); return searchSteam(title); }
  if (!res.ok) throw new Error(`search ${res.status}`);
  return (await res.json()).items || [];
}

// "<li><strong>Memory:</strong> 12 GB RAM<br></li>" -> { memory: "12 GB RAM" }
const FIELDS = {
  os: /^os/i, processor: /^processor|^cpu/i, memory: /^memory|^ram/i,
  graphics: /^graphics|^video/i, storage: /^storage|^hard drive|^hdd/i,
  directx: /^directx/i, sound: /^sound/i, network: /^network/i
};

const ENTITIES = { nbsp: " ", amp: "&", reg: "®", trade: "™", copy: "©", quot: '"', apos: "'", lt: "<", gt: ">", ldquo: "\u201c", rdquo: "\u201d", mdash: "—", ndash: "–" };

const strip = (html) => html
  .replace(/<br\s*\/?>/gi, " ")
  .replace(/<[^>]+>/g, "")
  .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
  .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
  .replace(/\s+/g, " ")
  .trim();

function parseRequirements(html) {
  if (!html) return null;
  const out = {};
  // Older entries are one prose line rather than a labelled list — Portal's
  // reads "1.7 GHz Processor, 512MB RAM, DirectX 8.1 level Graphics Card…"
  if (!/<li>/i.test(html)) {
    const prose = strip(html).replace(/^(minimum|recommended):?\s*/i, "");
    return prose ? { summary: prose } : null;
  }
  const notes = [];
  for (const [, body] of html.matchAll(/<li>([\s\S]*?)<\/li>/g)) {
    const labelled = body.match(/<strong>\s*([^<:]+):?\s*<\/strong>([\s\S]*)/);
    if (!labelled) {
      const note = strip(body);
      if (note) notes.push(note);
      continue;
    }
    const label = strip(labelled[1]);
    const value = strip(labelled[2]);
    if (!value) continue;
    const key = Object.keys(FIELDS).find((k) => FIELDS[k].test(label));
    if (key) out[key] = value;
    else notes.push(`${label}: ${value}`);
  }
  if (notes.length) out.notes = notes.join(" · ");
  return Object.keys(out).length ? out : null;
}

const { games } = JSON.parse(await readFile(join(ROOT, "data", "games.json"), "utf8"));
const targets = only ? games.filter((g) => g.id.includes(only)) : games;

let specs = existsSync(OUT) ? JSON.parse(await readFile(OUT, "utf8")).games || {} : {};
const pending = force
  ? targets
  : targets.filter((g) => !specs[g.id] || (retry && specs[g.id].status !== "ok"));
console.log(`${pending.length} of ${targets.length} games need specs`);

let found = 0, noMatch = 0, noSpecs = 0;
for (const game of pending) {
  try {
    // the display title is often shorter than the one Steam sells under
    const terms = [...new Set([game.title, game.wikiTitle].filter(Boolean))];
    let hit = null;
    for (const term of terms) {
      const wanted = normalise(term);
      const hits = await searchSteam(term);
      await sleep(1200);
      // Steam ids climb over time, so the lowest one carrying this name is the
      // original rather than a remaster — "Oblivion" otherwise resolves to the
      // 2025 remaster instead of the 2009 Game of the Year edition.
      const candidates = hits.filter((item) => matches(item.name, wanted)).sort((a, b) => a.id - b.id);
      hit = candidates[0] || null;
      if (hit) break;
    }
    if (!hit) { specs[game.id] = { steamAppId: null, status: "no-steam-match" }; noMatch++; continue; }

    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${hit.id}&l=en`, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`appdetails ${res.status}`);
    const payload = (await res.json())[hit.id];
    const data = payload?.success ? payload.data : null;
    if (!data || data.type !== "game") throw new Error("not a game entry");

    // Titles get reused: searching "Doom" returns the 2016 game, which matches
    // our 1993 entry exactly once normalised. A later date can equally mean a
    // re-release (Another World's Steam entry is dated 2020), and nothing in
    // the payload distinguishes the two — so anything outside a three-year
    // window is recorded as ambiguous and shown as "no requirements" rather
    // than risking the wrong machine specs on the wrong game.
    // A console-only original whose Steam entry came years later is a PC port,
    // and its requirements are the only ones that exist — worth keeping. A game
    // that already shipped on PC has no such excuse, so a distant date there
    // means a remake or a different game with the same name.
    const steamYear = Number((data.release_date?.date || "").match(/\d{4}/)?.[0]);
    const portOfConsoleGame = !game.platforms?.includes("PC") && matches(data.name, normalise(game.title));
    const reissue = REISSUE.test(data.name) && !REBUILD.test(data.name);
    if (steamYear && Math.abs(steamYear - game.year) > 3 && !portOfConsoleGame && !reissue) {
      specs[game.id] = { steamAppId: hit.id, steamName: data.name, steamYear, status: "ambiguous" };
      noSpecs++;
      console.log(`  ? ${game.id}: steam entry is ${steamYear}, ours is ${game.year}`);
      await sleep(1400);
      continue;
    }

    const minimum = parseRequirements(data.pc_requirements?.minimum);
    const recommended = parseRequirements(data.pc_requirements?.recommended);
    if (!minimum && !recommended) { specs[game.id] = { steamAppId: hit.id, status: "no-requirements" }; noSpecs++; }
    else {
      specs[game.id] = {
        steamAppId: hit.id,
        steamName: data.name,
        status: "ok",
        url: `https://store.steampowered.com/app/${hit.id}/`,
        steamYear: steamYear || null,
        portedLater: portOfConsoleGame && steamYear ? steamYear : undefined,
        edition: REISSUE.test(data.name) ? "reissue" : undefined,
        minimum,
        recommended
      };
      found++;
      console.log(`  \u2713 ${game.id} -> ${data.name}`);
    }
  } catch (err) {
    specs[game.id] = { status: "unavailable", reason: err.message };
    noSpecs++;
    console.log(`  \u00b7 ${game.id}: ${err.message}`);
  }
  await sleep(1400);           // Steam allows roughly 200 requests per 5 minutes
}
if (pending.length) console.log(`\n${found} with requirements, ${noMatch} not on Steam, ${noSpecs} without usable requirements`);

await writeFile(OUT, JSON.stringify({
  updatedAt: new Date().toISOString().slice(0, 10),
  source: "Steam store API",
  games: specs
}, null, 2) + "\n");
console.log(`data/specs.json: ${Object.values(specs).filter((s) => s.status === "ok").length} of ${Object.keys(specs).length} games have requirements`);
