#!/usr/bin/env node
// Unit tests for the modules that do not touch the DOM: the shared helpers, the
// category taxonomy, procedural art, the recommender, the catalogue normaliser
// and share-link encoding. The browser-only paths are covered by smoke.mjs.
//
//   node --test scripts/unit.mjs      (or: npm run test:unit)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { esc, fnv32, fnvUnit, clamp, ramp, debounce } from "../src/util.js";
import { CATEGORIES, GENRE_TO_CATEGORY, ICON_PATHS, categoryOf, colorOf, categoryFromGenres } from "../src/categories.js";
import { coverFor, artFor, iconSprite } from "../src/art.js";
import { recommend } from "../src/recommend.js";
import { encodeShare, decodeShare } from "../src/mylist.js";
import { fromCatalogue, register, resolve } from "../src/catalog.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "data", "games.json"), "utf8"));

test("esc neutralises every character that can break out of an attribute", () => {
  assert.equal(esc(`<img src="x" onerror=alert(1)>&`), "&lt;img src=&quot;x&quot; onerror=alert(1)&gt;&amp;");
  assert.equal(esc("plain"), "plain");
  assert.equal(esc(42), "42");
  assert.equal(esc(null), "null");
});

test("fnv32 reproduces the seeds baked into the dataset", () => {
  for (const game of data.games) assert.equal(fnv32(game.id), game.seed, game.id);
});

test("fnv32 is stable and well spread", () => {
  assert.equal(fnv32(""), 0x811c9dc5);
  assert.equal(fnv32("a"), fnv32("a"));
  assert.notEqual(fnv32("a"), fnv32("b"));
  const seen = new Set(data.games.map((g) => fnv32(g.id)));
  assert.equal(seen.size, data.games.length, "seeds collide");
});

test("fnvUnit lands in [0, 1)", () => {
  for (const game of data.games.slice(0, 50)) {
    const v = fnvUnit(game.id);
    assert.ok(v >= 0 && v < 1, `${game.id} -> ${v}`);
  }
});

test("clamp and ramp", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-5, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(ramp(-10, 0, 100), 0);
  assert.equal(ramp(150, 0, 100), 1);
  assert.equal(ramp(25, 0, 100), 0.25);
  // the exact expression the render loops used before it was named
  for (const d of [-40, 0, 130, 260, 900]) {
    assert.equal(ramp(d, 0, 260), Math.min(1, Math.max(0, d / 260)));
  }
});

test("debounce fires once, with the last arguments", async () => {
  const calls = [];
  const run = debounce((v) => calls.push(v), 10);
  run("a"); run("b"); run("c");
  assert.deepEqual(calls, []);
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(calls, ["c"]);
  run("d");
  run.cancel();
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(calls, ["c"]);
});

test("every category has a colour, a label and an icon", () => {
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    assert.match(cat.color, /^#[0-9a-f]{6}$/i, key);
    assert.ok(cat.label, key);
    assert.ok(ICON_PATHS[key], `${key} has no icon path`);
  }
  assert.deepEqual(Object.keys(ICON_PATHS).sort(), Object.keys(CATEGORIES).sort());
});

test("no genre is claimed by two categories", () => {
  const owners = new Map();
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    for (const genre of cat.genres) {
      assert.equal(owners.get(genre), undefined, `${genre} is in both ${owners.get(genre)} and ${key}`);
      owners.set(genre, key);
    }
  }
  assert.equal(owners.size, Object.keys(GENRE_TO_CATEGORY).length);
});

test("every genre in the dataset maps to its recorded category", () => {
  for (const game of data.games) {
    assert.equal(categoryOf(game.genre), game.category, game.id);
    assert.equal(colorOf(game.category), game.color, game.id);
  }
});

test("categoryOf falls back to action for an unknown genre", () => {
  assert.equal(categoryOf("Underwater Basketweaving"), "action");
  assert.equal(colorOf("nope"), CATEGORIES.action.color);
});

test("categoryFromGenres applies the specific rules before the broad ones", () => {
  // each of these matches a later, broader rule too; the specific one must win
  assert.equal(categoryFromGenres(["roguelike", "role-playing video game"]), "roguelike");
  assert.equal(categoryFromGenres(["open world", "action-adventure game"]), "openworld");
  assert.equal(categoryFromGenres(["immersive sim", "first-person shooter"]), "immersive");
  assert.equal(categoryFromGenres(["stealth game", "action game"]), "stealth");
  assert.equal(categoryFromGenres(["survival horror", "adventure game"]), "horror");
  assert.equal(categoryFromGenres(["kart racing game", "sports game"]), "racing");
  assert.equal(categoryFromGenres(["platform game", "puzzle video game"]), "platformer");
  assert.equal(categoryFromGenres([]), "action");
  assert.equal(categoryFromGenres(["something unheard of"]), "action");
});

test("procedural art is deterministic, cached and self-contained", () => {
  const game = data.games[0];
  const first = coverFor(game);
  assert.equal(coverFor(game), first);
  assert.ok(first.startsWith("data:image/svg+xml;charset=utf-8,"));
  const svg = decodeURIComponent(first.slice("data:image/svg+xml;charset=utf-8,".length));
  assert.ok(svg.includes(String(game.year)));
  assert.ok(svg.includes(game.color));
  assert.equal(svg.includes("http://www.w3.org/1999/xlink"), false);

  // a different seed must give different art
  const other = coverFor({ ...game, id: `${game.id}-x`, seed: game.seed + 1 });
  assert.notEqual(other, first);
});

test("artFor prefers a local file, then a remote url, then procedural art", () => {
  const base = { ...data.games[0], image: null, imageUrl: null };
  assert.equal(artFor({ ...base, image: "assets/covers/a.jpg", imageUrl: "https://x/y.png" }), "assets/covers/a.jpg");
  assert.equal(artFor({ ...base, imageUrl: "https://x/y.png" }), "https://x/y.png");
  assert.ok(artFor({ ...base, id: "procedural-only" }).startsWith("data:image/svg+xml"));
});

test("the icon sprite carries one symbol per category", () => {
  const sprite = iconSprite();
  for (const key of Object.keys(CATEGORIES)) assert.ok(sprite.includes(`id="ic-${key}"`), key);
  assert.equal([...sprite.matchAll(/<symbol /g)].length, Object.keys(CATEGORIES).length);
});

test("recommend respects its contract", () => {
  const games = data.games;
  assert.deepEqual(recommend(games, []), []);
  assert.deepEqual(recommend(games, ["not-a-real-id"]), []);

  const seed = games.find((g) => g.category === "rpg");
  const picks = recommend(games, [seed.id], 8);
  assert.ok(picks.length > 0 && picks.length <= 8);
  assert.ok(!picks.some((p) => p.game.id === seed.id), "a seed must not recommend itself");
  assert.ok(picks.every((p) => p.reason && Number.isFinite(p.score)));

  // scores come back best first
  for (let i = 1; i < picks.length; i++) assert.ok(picks[i - 1].score >= picks[i].score);

  // and the shelf stays varied: at most two per category
  const perCategory = new Map();
  for (const p of picks) perCategory.set(p.game.category, (perCategory.get(p.game.category) || 0) + 1);
  for (const [cat, n] of perCategory) assert.ok(n <= 2, `${n} picks from ${cat}`);
});

test("recommend is deterministic and never returns something already saved", () => {
  const games = data.games;
  const saved = games.slice(0, 5).map((g) => g.id);
  const a = recommend(games, saved, 6);
  const b = recommend(games, saved, 6);
  assert.deepEqual(a.map((p) => p.game.id), b.map((p) => p.game.id));
  for (const p of a) assert.ok(!saved.includes(p.game.id));
});

test("share links survive a round trip", () => {
  const ids = data.games.slice(0, 12).map((g) => g.id);
  assert.deepEqual(decodeShare(encodeShare(ids)), ids);
  assert.equal(encodeShare(ids).includes("+"), false);
  assert.equal(encodeShare(ids).includes("/"), false);
  assert.equal(encodeShare(ids).includes("="), false);
  assert.deepEqual(decodeShare(""), []);
  assert.deepEqual(decodeShare("!!!not base64!!!"), []);
});

test("fromCatalogue normalises a wikidata entry into the dataset shape", () => {
  const entry = {
    qid: "Q999999",
    title: "A Test Game",
    released: "2015-09-15",
    year: 2015,
    article: "A Test Game (video game)",
    genres: ["roguelike", "action game"],
    platforms: ["Microsoft Windows"],
    developers: ["Someone"]
  };
  const game = fromCatalogue(entry);

  assert.equal(game.id, "Q999999");
  assert.equal(game.catalogue, true);
  assert.equal(game.category, "roguelike");
  assert.equal(game.categoryLabel, CATEGORIES.roguelike.label);
  assert.equal(game.color, CATEGORIES.roguelike.color);
  assert.equal(game.genre, "roguelike");
  assert.equal(game.seed, fnv32("Q999999"));
  assert.equal(game.wiki, "https://en.wikipedia.org/wiki/A_Test_Game_(video_game)");
  assert.ok(game.search.includes("a test game"));
  for (const field of ["wiki", "guide", "trailer"]) assert.match(game[field], /^https:\/\//);

  // memoised: the same qid must give back the very same object, or identity
  // comparisons elsewhere in the app quietly stop working
  assert.equal(fromCatalogue(entry), game);
  assert.equal(resolve("Q999999"), game);
});

test("fromCatalogue falls back to the category label when wikidata lists no genre", () => {
  const game = fromCatalogue({ qid: "Q999998", title: "Bare", year: 2001, released: null, article: "Bare", genres: [] });
  assert.equal(game.category, "action");
  assert.equal(game.genre, CATEGORIES.action.label);
});

test("the registry resolves curated games by id", () => {
  register(data.games);
  const game = data.games[10];
  assert.equal(resolve(game.id), game);
  assert.equal(resolve("nothing-by-this-name"), null);
});

// ---------------------------------------------------------------------------
// There is no bundler and no build step here, so a mistyped import or a renamed
// export only shows up as a blank page in a browser. Let node resolve the real
// module graph instead.

test("every module imports cleanly and exports what its callers ask for", async () => {
  // the only browser global read at module scope
  globalThis.window ??= { matchMedia: () => ({ matches: false }) };

  const modules = [
    "util.js", "url.js", "categories.js", "catalog.js", "art.js", "recommend.js",
    "store.js", "a11y.js", "timeline.js", "graph.js", "panel.js", "mylist.js", "listview.js"
  ];
  const loaded = new Map();
  for (const name of modules) {
    loaded.set(name, await import(`../src/${name}`));   // throws on a bad specifier or missing export
  }

  // app.js runs the app on import, so check its imports by hand against the
  // modules node just loaded for real
  const source = readFileSync(join(ROOT, "src", "app.js"), "utf8");
  const imports = [...source.matchAll(/import\s+(?:\{([^}]*)\}|\*\s+as\s+[\w$]+)\s+from\s+"\.\/([\w.-]+)"/g)];
  assert.ok(imports.length >= 10, "app.js import scan found nothing; the regex has drifted");
  for (const [, named, file] of imports) {
    const mod = loaded.get(file);
    assert.ok(mod, `app.js imports ${file}, which is not in the module list above`);
    for (const part of (named || "").split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) assert.ok(name in mod, `app.js imports { ${name} } from ${file}, which does not export it`);
    }
  }
});
