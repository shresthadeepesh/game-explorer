#!/usr/bin/env node
// Resolves a cover image per game and records it in data/covers.json, then
// (by default) downloads each one to assets/covers/<id>.<ext>.
//
//   node scripts/fetch-covers.mjs                  # auto source, fetch + download
//   node scripts/fetch-covers.mjs --urls-only      # record URLs, download nothing
//   node scripts/fetch-covers.mjs --source=igdb    # force a provider
//   node scripts/fetch-covers.mjs --only=elden     # id substring filter
//   node scripts/fetch-covers.mjs --force          # re-resolve entries already known
//   node scripts/fetch-covers.mjs --delay=900      # ms between downloads (default 700)
//
// Sources
//   igdb       best art, needs TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET
//              (free: dev.twitch.tv/console/apps -> api-docs.igdb.com)
//   wikipedia  no key; pulls the infobox image off each game's article
//
// "auto" uses igdb when both Twitch env vars are set, otherwise wikipedia.
//
// Licensing: IGDB art is usable with attribution under their terms; Wikipedia
// box art is normally non-free fair-use, fine locally, your call to publish.
// Games with no cover fall back to the app's procedural art.

import { writeFile, mkdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const COVERS = join(ROOT, "assets", "covers");
const MANIFEST = join(ROOT, "data", "covers.json");
const UA = "game-explorer/1.0 (local dataset build)";
const EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/avif": ".avif", "image/svg+xml": ".svg" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = promisify(execFile);
const MAX_WIDTH = 600;      // covers render at 96px on nodes, 440px in the panel
const MAX_BYTES = 220_000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const only = value("only");
const urlsOnly = flag("urls-only");
const force = flag("force");
const delay = Number(value("delay") || 700);

const hasTwitch = Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET);
const source = value("source") || (hasTwitch ? "igdb" : "wikipedia");
if (source === "igdb" && !hasTwitch) {
  console.error("igdb needs TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the environment");
  process.exit(1);
}

const { games } = JSON.parse(await readFile(join(ROOT, "data", "games.json"), "utf8"));
const targets = only ? games.filter((g) => g.id.includes(only)) : games;

let manifest = {};
if (existsSync(MANIFEST)) manifest = JSON.parse(await readFile(MANIFEST, "utf8")).covers || {};

// ---------- providers ----------

async function resolveWikipedia(list) {
  // One Action API call per 50 titles; piprop=original returns the infobox image.
  const out = new Map();
  const byTitle = new Map(list.map((g) => [g.wikiTitle, g]));
  const titles = [...byTitle.keys()];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "query", format: "json", formatversion: "2", redirects: "1",
      prop: "pageimages", piprop: "original", pilicense: "any", titles: batch.join("|")
    });
    const res = await fetch(url, { headers: { "user-agent": UA } });
    if (!res.ok) throw new Error(`wikipedia api ${res.status}`);
    const q = (await res.json()).query;
    const redirects = new Map((q.redirects || []).map((r) => [r.to, r.from]));
    for (const page of q.pages || []) {
      const requested = redirects.get(page.title) || page.title;
      const game = byTitle.get(requested);
      if (!game || !page.original?.source) continue;
      out.set(game.id, { url: page.original.source.split("?")[0], source: "wikipedia", credit: `Wikipedia: ${page.title}` });
    }
    process.stdout.write(`  wikipedia ${Math.min(i + 50, titles.length)}/${titles.length}\r`);
    if (i + 50 < titles.length) await sleep(1200);
  }
  console.log("");
  return out;
}

// A handful of articles have no lead image for pageimages to return. Their
// cover or logo is still on the page, so fall back to listing the article's
// files and picking the most cover-shaped one.
const CHROME = /commons-logo|wiki[a-z]*-logo|wikidata|gnome-mime|openclipart|ambox|question_book|edit-clear|symbol_|folder_hexagonal|\.ogg$/i;
const score = (name) =>
  /cover|box[\s_]?art/i.test(name) ? 3
    : /logo|wordmark|title/i.test(name) ? 2
      : /\.(jpe?g|png)$/i.test(name) ? 1 : 0;

async function resolveWikipediaFallback(list) {
  const out = new Map();
  for (const game of list) {
    const listing = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "query", format: "json", formatversion: "2", redirects: "1",
      titles: game.wikiTitle, prop: "images", imlimit: "100"
    }), { headers: { "user-agent": UA } });
    if (!listing.ok) continue;
    const page = (await listing.json()).query?.pages?.[0];
    const best = (page?.images || [])
      .map((i) => i.title)
      .filter((name) => !CHROME.test(name) && score(name) > 0)
      .sort((a, b) => score(b) - score(a))[0];
    if (!best) { console.log(`  · ${game.id}: no usable image on the article`); continue; }

    await sleep(400);
    const info = await fetch("https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
      action: "query", format: "json", formatversion: "2", titles: best, prop: "imageinfo", iiprop: "url"
    }), { headers: { "user-agent": UA } });
    if (!info.ok) continue;
    const url = (await info.json()).query?.pages?.[0]?.imageinfo?.[0]?.url;
    if (!url) continue;
    out.set(game.id, { url, source: "wikipedia", credit: `Wikipedia: ${best.replace(/^File:/, "")}` });
    console.log(`  ✓ ${game.id}: ${best}`);
    await sleep(400);
  }
  return out;
}

async function igdbToken() {
  const res = await fetch("https://id.twitch.tv/oauth2/token?" + new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID,
    client_secret: process.env.TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials"
  }), { method: "POST" });
  if (!res.ok) throw new Error(`twitch oauth ${res.status}`);
  return (await res.json()).access_token;
}

async function resolveIgdb(list) {
  const token = await igdbToken();
  const headers = {
    "client-id": process.env.TWITCH_CLIENT_ID,
    authorization: `Bearer ${token}`,
    "content-type": "text/plain",
    "user-agent": UA
  };
  const out = new Map();
  for (const game of list) {
    // IGDB allows 4 req/s; one search per game, scored by release-year distance.
    const body = `search "${game.title.replace(/"/g, '\\"')}"; fields name,first_release_date,cover.image_id,category; where cover != null; limit 8;`;
    const res = await fetch("https://api.igdb.com/v4/games", { method: "POST", headers, body });
    if (res.status === 429) { await sleep(1000); continue; }
    if (!res.ok) { console.log(`  · ${game.id}: igdb ${res.status}`); continue; }
    const hits = await res.json();
    const scored = hits
      .filter((h) => h.cover?.image_id)
      .map((h) => ({
        h,
        gap: h.first_release_date ? Math.abs(new Date(h.first_release_date * 1000).getUTCFullYear() - game.year) : 99
      }))
      .sort((a, b) => a.gap - b.gap);
    const best = scored[0];
    if (!best || best.gap > 2) { console.log(`  · ${game.id}: no confident igdb match`); continue; }
    out.set(game.id, {
      url: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${best.h.cover.image_id}.jpg`,
      source: "igdb",
      credit: `IGDB: ${best.h.name}`
    });
    await sleep(280);
  }
  return out;
}

// ---------- resolve ----------

const pending = force ? targets : targets.filter((g) => !manifest[g.id]?.url);
console.log(`source: ${source} · ${pending.length} of ${targets.length} games need a cover URL`);

let resolved = new Map();
if (pending.length) {
  resolved = source === "igdb" ? await resolveIgdb(pending) : await resolveWikipedia(pending);
  if (source === "wikipedia") {
    const stillMissing = pending.filter((g) => !resolved.has(g.id));
    if (stillMissing.length) {
      console.log(`${stillMissing.length} without a lead image, checking article files`);
      for (const [id, entry] of await resolveWikipediaFallback(stillMissing)) resolved.set(id, entry);
    }
  }
}

for (const [id, entry] of resolved) manifest[id] = entry;
await mkdir(dirname(MANIFEST), { recursive: true });
await writeFile(MANIFEST, JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), covers: manifest }, null, 2) + "\n");
console.log(`${resolved.size} URLs resolved, ${Object.keys(manifest).length} total in data/covers.json`);

// ---------- download ----------

async function download(url, id, attempt = 0) {
  const res = await fetch(url, { headers: { "user-agent": UA, referer: "https://en.wikipedia.org/" } });
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const wait = Number(res.headers.get("retry-after")) * 1000 || 4000 * (attempt + 1);
    await sleep(wait);
    return download(url, id, attempt + 1);
  }
  if (!res.ok) throw new Error(`image ${res.status}`);
  const ext = EXT[res.headers.get("content-type")?.split(";")[0]];
  if (!ext) throw new Error(`unsupported ${res.headers.get("content-type")}`);
  await writeFile(join(COVERS, id + ext), Buffer.from(await res.arrayBuffer()));
  return ext;
}

// Wikipedia originals run to several MB; the app never shows them above 600px.
// sips ships with macOS, so no image dependency for the common case.
//
// Resize only — never re-encode into another format. A cover's filename is
// recorded in data/games.json, which is committed, while the images themselves
// are deliberately not. Re-encoding renamed .png to .jpg on the machines that
// happen to have sips and left it alone everywhere else, so the committed
// dataset ended up pointing at files that only existed on one person's laptop.
// The name now follows the served content-type and nothing else.
async function shrink(file) {
  if (file.endsWith(".svg")) return;               // vector, already small
  const { size } = await stat(file);
  if (size <= MAX_BYTES) return;
  try {
    await run("sips", ["-Z", String(MAX_WIDTH), file]);
  } catch {
    /* no sips (non-macOS): keep the original, it still works */
  }
}

if (!urlsOnly) {
  await mkdir(COVERS, { recursive: true });
  const onDisk = new Set(readdirSync(COVERS).map((f) => basename(f, extname(f))));
  let got = 0, failed = 0;
  for (const game of targets) {
    const entry = manifest[game.id];
    if (!entry?.url || (onDisk.has(game.id) && !force)) continue;
    try {
      const file = join(COVERS, game.id + await download(entry.url, game.id));
      await shrink(file);
      got++;
      process.stdout.write(`  downloaded ${got}\r`);
    } catch (err) {
      failed++;
      console.log(`  · ${game.id}: ${err.message}`);
    }
    await sleep(delay);
  }
  console.log(`${got} images downloaded, ${failed} failed`);
}

console.log("run `npm run build:data` to link them into the app");
