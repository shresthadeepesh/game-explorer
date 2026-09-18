#!/usr/bin/env node
// Validates every Wikipedia article referenced by data/games.json using one
// batched Action API call per 50 titles (the REST summary endpoint rate-limits
// hard). Flags missing pages, disambiguation pages, and redirects that land on
// a series article rather than the game.
//
//   node scripts/check-links.mjs

import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { games } = JSON.parse(await readFile(join(ROOT, "data", "games.json"), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const byTitle = new Map();
for (const g of games) {
  if (!byTitle.has(g.wikiTitle)) byTitle.set(g.wikiTitle, []);
  byTitle.get(g.wikiTitle).push(g.id);
}
const titles = [...byTitle.keys()];

async function query(batch, attempt = 0) {
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({
    action: "query", format: "json", formatversion: "2", redirects: "1",
    prop: "description|pageprops", titles: batch.join("|")
  });
  const res = await fetch(url, { headers: { "user-agent": "game-explorer/1.0 (link check)" } });
  if (res.status === 429 && attempt < 5) {
    await sleep(5000 * (attempt + 1));
    return query(batch, attempt + 1);
  }
  if (!res.ok) throw new Error(`api ${res.status}`);
  return (await res.json()).query;
}

const problems = [];
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  const q = await query(batch);
  const redirects = new Map((q.redirects || []).map((r) => [r.from, r.to]));
  const pages = new Map((q.pages || []).map((p) => [p.title, p]));

  for (const title of batch) {
    const target = redirects.get(title) || title;
    const page = pages.get(target);
    const ids = byTitle.get(title).join(", ");
    if (!page || page.missing) { problems.push(`MISSING       ${title}  (${ids})`); continue; }
    if (page.pageprops && "disambiguation" in page.pageprops) { problems.push(`DISAMBIG      ${title}  (${ids})`); continue; }
    const desc = page.description || "";
    if (!/game|shooter|platformer|rpg|simulator|roguelike/i.test(desc)) {
      problems.push(`NOT A GAME?   ${title} — "${desc}"  (${ids})`);
    } else if (/series|franchise/i.test(desc)) {
      problems.push(`SERIES PAGE   ${title} — "${desc}"  (${ids})`);
    } else if (redirects.has(title)) {
      console.log(`  redirect: ${title} -> ${target} ("${desc}")`);
    }
  }
  if (i + 50 < titles.length) await sleep(1500);
}

console.log(`\nchecked ${titles.length} articles for ${games.length} games`);
if (problems.length) { console.log(problems.join("\n")); process.exitCode = 1; }
else console.log("all articles resolve to a game page");
