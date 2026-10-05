#!/usr/bin/env node
// Generates the crawlable half of the site.
//
//   node scripts/build-seo.mjs            (or: npm run build:seo)
//   SITE_URL=https://example.com/ node scripts/build-seo.mjs
//
// The app itself is one JavaScript-rendered page whose deep links live in the
// fragment (`#game=…`), and a fragment is not a URL a crawler can index. So
// every featured game also gets a static page under games/, with the facts in
// the markup, a canonical URL of its own and VideoGame structured data. Those
// pages are the indexable surface; each one links into the app at its node.
//
// Output is written into the repository (and staged from there by
// stage-site.mjs) so the published tree and a local `npm start` agree.

import { readFileSync, existsSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES } from "../src/categories.js";
import { REPO, CONTRIBUTING, suggestEditUrl } from "../src/contribute.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "games");

// Trailing slash is load-bearing: every absolute URL below is built by
// concatenation, and Pages serves the project from a subpath.
const SITE = (process.env.SITE_URL || "https://shresthadeepesh.github.io/game-explorer/").replace(/\/?$/, "/");

const data = JSON.parse(readFileSync(join(ROOT, "data", "games.json"), "utf8"));
const catalogue = readJsonIfPresent(join(ROOT, "data", "catalog", "index.json"));
const specs = readJsonIfPresent(join(ROOT, "data", "specs.json"));

function readJsonIfPresent(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** JSON-LD goes inside a script element, where `</script>` would end it early. */
const jsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");

const list = (values) => (Array.isArray(values) ? values.filter(Boolean) : []);
const sentence = (values) => list(values).join(", ");

const DAY = new Date().toISOString().slice(0, 10);
const UPDATED = (data.generatedAt || "").slice(0, 10) || DAY;

// ---------------------------------------------------------------- game pages

/** One-line summary used for <title>, the meta description and og:description. */
function describe(game) {
  const who = sentence(game.developers) || sentence(game.publishers);
  const where = sentence(game.platforms);
  const facts = [game.genre, game.year, who && `by ${who}`, where && `on ${where}`].filter(Boolean).join(" · ");
  return `${facts}. ${game.blurb}`;
}

function gameJsonLd(game, url, image) {
  const node = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    "@id": url,
    url,
    name: game.title,
    description: game.blurb,
    genre: game.genre,
    datePublished: game.released || String(game.year),
    inLanguage: "en",
    image,
    gamePlatform: list(game.platforms),
    isPartOf: { "@type": "WebSite", name: "A Field Guide to Games", url: SITE }
  };
  if (game.developers?.length) node.author = game.developers.map((name) => ({ "@type": "Organization", name }));
  if (game.publishers?.length) node.publisher = game.publishers.map((name) => ({ "@type": "Organization", name }));

  const sameAs = [game.wiki, game.wikidata && `https://www.wikidata.org/wiki/${game.wikidata}`].filter(Boolean);
  if (sameAs.length) node.sameAs = sameAs;
  return node;
}

function breadcrumbJsonLd(game, url) {
  const crumbs = [
    ["A Field Guide to Games", SITE],
    ["Index", `${SITE}games/`],
    [String(game.year), `${SITE}games/#y${game.year}`],
    [game.title, url]
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item }))
  };
}

function requirementsHtml(game) {
  const spec = specs?.games?.[game.id];
  if (!spec || spec.status !== "ok") return "";
  const rows = [["Minimum", spec.minimum], ["Recommended", spec.recommended]].filter(([, text]) => text);
  if (!rows.length) return "";
  return `
  <section class="seo-section">
    <h2>PC requirements</h2>
    <dl class="seo-facts">
      ${rows.map(([label, text]) => `<dt>${label}</dt><dd>${esc(text)}</dd>`).join("\n      ")}
    </dl>
  </section>`;
}

function gamePage(game, prev, next) {
  const url = `${SITE}games/${game.id}.html`;
  const image = game.image ? SITE + game.image : `${SITE}assets/og.png`;
  const description = describe(game);
  const title = `${game.title} (${game.year}) — A Field Guide to Games`;
  const category = CATEGORIES[game.category];

  const facts = [
    ["Released", game.released || String(game.year)],
    ["Genre", game.genre],
    ["Category", game.categoryLabel || category?.label],
    ["Platforms", sentence(game.platforms)],
    ["Developers", sentence(game.developers)],
    ["Publishers", sentence(game.publishers)]
  ].filter(([, value]) => value);

  const links = [
    [game.wiki, "Wikipedia"],
    [game.guide, "Strategy guide"],
    [game.trailer, "Trailer search"],
    [game.wikidata && `https://www.wikidata.org/wiki/${game.wikidata}`, "Wikidata"]
  ].filter(([href]) => href);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#08090c">

<meta property="og:type" content="article">
<meta property="og:site_name" content="A Field Guide to Games">
<meta property="og:title" content="${esc(game.title)} (${game.year})">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="Cover art for ${esc(game.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(game.title)} (${game.year})">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">

<link rel="stylesheet" href="../src/seo.css">
<link rel="icon" href="../icon.svg" type="image/svg+xml">

<script type="application/ld+json">
${jsonLd(gameJsonLd(game, url, image))}
</script>
<script type="application/ld+json">
${jsonLd(breadcrumbJsonLd(game, url))}
</script>
</head>
<body class="seo">
<nav class="seo-crumbs" aria-label="Breadcrumb">
  <a href="../">Field Guide</a> · <a href="./">Index</a> · <a href="./#y${game.year}">${game.year}</a>
</nav>

<main>
  <article>
    <header class="seo-head">
      <p class="seo-kicker" style="--accent:${esc(game.color)}">${esc(game.categoryLabel || category?.label || "")} · ${game.year}</p>
      <h1>${esc(game.title)}</h1>
      <p class="seo-blurb">${esc(game.blurb)}</p>
      <p><a class="seo-cta" href="../#game=${esc(game.id)}">Open in the 3D timeline</a></p>
    </header>

    ${game.image ? `<img class="seo-cover" src="../${esc(game.image)}" alt="Cover art for ${esc(game.title)}" width="378" height="263" loading="lazy" decoding="async">` : ""}
    ${game.imageCredit ? `<p class="seo-credit">Cover: ${esc(game.imageCredit)}</p>` : ""}

    <section class="seo-section">
      <h2>Facts</h2>
      <dl class="seo-facts">
        ${facts.map(([label, value]) => `<dt>${label}</dt><dd>${esc(value)}</dd>`).join("\n        ")}
      </dl>
    </section>${requirementsHtml(game)}

    <section class="seo-section">
      <h2>Elsewhere</h2>
      <ul class="seo-links">
        ${links.map(([href, label]) => `<li><a href="${esc(href)}" rel="noopener">${label}</a></li>`).join("\n        ")}
      </ul>
    </section>
  </article>

  <nav class="seo-adjacent" aria-label="Nearby entries">
    ${prev ? `<a rel="prev" href="${esc(prev.id)}.html">← ${esc(prev.title)}</a>` : "<span></span>"}
    ${next ? `<a rel="next" href="${esc(next.id)}.html">${esc(next.title)} →</a>` : "<span></span>"}
  </nav>
</main>

<footer class="seo-foot">
  <p>${data.count} featured games, ${data.yearRange?.join("–") || ""}${catalogue ? `, from a catalogue of ${catalogue.total.toLocaleString("en-US")}` : ""}.</p>
  <p>Something here wrong? <a href="${esc(suggestEditUrl(game))}" rel="noopener">Suggest an edit</a> ·
    <a href="${esc(CONTRIBUTING)}" rel="noopener">Contribute</a> ·
    <a href="${esc(REPO)}" rel="noopener">Source on GitHub</a></p>
</footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------- index page

function indexPage(byYear) {
  const url = `${SITE}games/`;
  const description = `Every one of the ${data.count} featured games in A Field Guide to Games, ${data.yearRange?.join("–")}, listed by year with genre, platform and studio.`;

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "A Field Guide to Games — every featured game",
    description,
    url,
    numberOfItems: data.games.length,
    itemListElement: data.games.map((game, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE}games/${game.id}.html`,
      name: `${game.title} (${game.year})`
    }))
  };

  const years = byYear.map(([year, games]) => `
    <section class="seo-year" id="y${year}">
      <h2>${year}</h2>
      <ul class="seo-list">
        ${games.map((game) => `<li><a href="${esc(game.id)}.html">${esc(game.title)}</a> <span>${esc(game.genre)}${game.platforms?.length ? ` · ${esc(sentence(game.platforms))}` : ""}</span></li>`).join("\n        ")}
      </ul>
    </section>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Every featured game, by year — A Field Guide to Games</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#08090c">

<meta property="og:type" content="website">
<meta property="og:site_name" content="A Field Guide to Games">
<meta property="og:title" content="Every featured game, by year">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(SITE)}assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(SITE)}assets/og.png">

<link rel="stylesheet" href="../src/seo.css">
<link rel="icon" href="../icon.svg" type="image/svg+xml">

<script type="application/ld+json">
${jsonLd(itemList)}
</script>
</head>
<body class="seo">
<nav class="seo-crumbs" aria-label="Breadcrumb"><a href="../">Field Guide</a> · Index</nav>

<main>
  <header class="seo-head">
    <h1>Every featured game, by year</h1>
    <p class="seo-blurb">${esc(description)}</p>
    <p><a class="seo-cta" href="../">Open the 3D timeline</a></p>
  </header>

  <nav class="seo-jump" aria-label="Jump to year">
    ${byYear.map(([year]) => `<a href="#y${year}">${year}</a>`).join("\n    ")}
  </nav>
  ${years}
</main>

<footer class="seo-foot">
  <p>Dataset generated ${esc(UPDATED)}. The list is hand-picked and open to argument:
    <a href="${esc(CONTRIBUTING)}" rel="noopener">how to contribute</a> ·
    <a href="${esc(REPO)}" rel="noopener">source on GitHub</a></p>
</footer>
</body>
</html>
`;
}

// ------------------------------------------------------------ sitemap, robots

function sitemap(urls) {
  const entries = urls.map(({ loc, priority }) => `  <url>
    <loc>${esc(loc)}</loc>
    <lastmod>${UPDATED}</lastmod>
    <priority>${priority}</priority>
  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

// Crawlers only read robots.txt from the origin root, so on a Pages project
// subpath this file is advisory: it takes effect behind a custom domain, or if
// the user-site repository copies it up. Paths are written with the deployed
// prefix so it is correct either way.
function robots() {
  const base = new URL(SITE).pathname;
  return `# A Field Guide to Games
User-agent: *
Allow: ${base}

# The dataset is fetched by the app, not content for a reader.
Disallow: ${base}data/

Sitemap: ${SITE}sitemap.xml
`;
}

// ---------------------------------------------------------------------- build

const ordered = [...data.games].sort((a, b) => a.year - b.year || a.rank - b.rank || a.title.localeCompare(b.title));

const byYear = [...new Set(ordered.map((g) => g.year))].sort((a, b) => a - b)
  .map((year) => [year, ordered.filter((g) => g.year === year)]);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

ordered.forEach((game, i) => {
  writeFileSync(join(OUT, `${game.id}.html`), gamePage(game, ordered[i - 1], ordered[i + 1]));
});
writeFileSync(join(OUT, "index.html"), indexPage(byYear));

writeFileSync(join(ROOT, "sitemap.xml"), sitemap([
  { loc: SITE, priority: "1.0" },
  { loc: `${SITE}games/`, priority: "0.9" },
  ...ordered.map((game) => ({ loc: `${SITE}games/${game.id}.html`, priority: "0.7" }))
]));
writeFileSync(join(ROOT, "robots.txt"), robots());

console.log(`built ${ordered.length} game pages, games/index.html, sitemap.xml and robots.txt for ${SITE}`);
