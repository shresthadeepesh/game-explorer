# A Field Guide to Games

A 3D timeline of 216 landmark games, 1990–2025, six per year. Scroll or drag to travel through
the years; click a node for the detail panel. Vanilla ES modules, no build step,
no dependencies.

```bash
npm start           # http://localhost:4173
```

An http origin is required (ES modules + `fetch`); `file://` will not work.

## Layout

```
index.html              markup shell
src/app.js              filter state, rail, view switching, URL sync
src/panel.js            detail panel: facts, list controls, similar games
src/listview.js         the accessible list view
src/a11y.js             focus trapping and polite announcements
src/mylist.js           my-list drawer and recommendation shelf
src/store.js            IndexedDB persistence for the list
src/catalog.js          catalogue year cache + the id registry
src/recommend.js        similarity scoring behind the recommendations
src/timeline.js         virtualised 3D camera + renderer
src/graph.js            the catalogue layer, drawn to canvas
src/art.js              procedural cover art, icon sprite
src/categories.js       taxonomy: genre -> category, colour, icon path
src/util.js             esc, the FNV hash, clamp/ramp, debounce
src/url.js              the one place that writes to the address bar
src/seo.css             styles for the static pages under games/
data/games.json         runtime dataset (generated)
data/games.csv          same rows, for spreadsheets and diffs (generated)
scripts/source-games.mjs  source of truth: [year, [[title, genre, blurb, wiki?], ...]]
scripts/build-data.mjs    emits data/games.json + data/games.csv
scripts/fetch-covers.mjs  optional real key art from Wikipedia
scripts/check-links.mjs   verifies every Wikipedia article still resolves
scripts/check-data.mjs    dataset integrity gate
scripts/enrich-wikidata.mjs  platforms, studios and release dates
scripts/fetch-specs.mjs   PC system requirements from Steam
scripts/harvest-wikidata.mjs  the full per-year catalogue
scripts/smoke.mjs         CDP end-to-end test, 36 checks
scripts/build-seo.mjs     games/ pages, sitemap.xml and robots.txt (generated)
scripts/build-og.mjs      assets/og.png, the share card, drawn without a dependency
scripts/check-seo.mjs     metadata and crawlable-page gate
src/contribute.js         repository URL and the prefilled issue links
games/                    one static page per featured game (generated)
sitemap.xml, robots.txt   generated alongside games/
sw.js, manifest.webmanifest  offline shell and install metadata
CONTRIBUTING.md           how to nominate, correct and send a change
.github/ISSUE_TEMPLATE/   the nomination and correction forms
assets/covers/            drop-in real covers, named <id>.jpg|png|webp|avif
```

## Editing the data

The list is hand-picked, so it is wrong in public — corrections and nominations
are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) has the steps; every entry page on
the site links straight to the right issue form, already filled in.

Edit `scripts/source-games.mjs`, then:

```bash
npm run build:data
```

The build derives, per game: a stable `id` (`title-slug-year`), its `category`
from the genre map, the category `color`, a deterministic `seed` for the
procedural art, a lowercased `search` string, three outbound links (Wikipedia
article, StrategyWiki how-to-play search, YouTube trailer search), and an
`image` path if a matching file exists in `assets/covers/`. It exits non-zero if
a genre has no mapping.

An entry's optional 4th field overrides the Wikipedia article title, needed
wherever it differs from the display title (`Doom` → `Doom (1993 video game)`).

```bash
npm run check:links   # every article resolves to a game page, not a series or disambig
```

The 15 categories live in `src/categories.js` — one entry per category with a label, a
colour and the genres it absorbs, plus a 24×24 icon path used on nodes, chips,
the panel and the favicon. Add a genre to a category's `genres` list and rebuild.

## Cover images

All 216 games have real art. Resolution order per game: a local file in `assets/covers/<id>.<ext>`,
then the remote `imageUrl` from `data/covers.json`, then procedural art the app
generates from the game's seed and category colour. Nothing ever renders empty,
and a cover that fails to load falls back to the generated poster at runtime.

```bash
npm run fetch:covers                 # resolve URLs + download them
node scripts/fetch-covers.mjs --urls-only     # record URLs, download nothing
node scripts/fetch-covers.mjs --source=igdb   # force a provider
node scripts/fetch-covers.mjs --only=elden --force
npm run build:data                   # link whatever is on disk into games.json
```

Providers:

| Source | Key | Notes |
| --- | --- | --- |
| `wikipedia` (default) | none | Infobox art via the MediaWiki `pageimages` API, one call per 50 games. Articles with no lead image fall back to listing the article's own files and picking the most cover-shaped one, which covers all 216. |
| `igdb` | `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` | Better, more consistent box art. Free credentials from the Twitch developer console; the script trades them for a token, searches each title and only accepts a match within two years of the dataset's release year. |

Other options if you want different art: SteamGridDB (free key, community box
art), the Steam CDN (`cdn.cloudflare.steamstatic.com/steam/apps/<appid>/library_600x900.jpg`,
no key but PC-only), or RAWG (free key, screenshots rather than covers).

`assets/covers/` currently holds 213 covers at about 17MB. Downloads are rate-limit aware — Wikimedia will 429 a fast loop, so the script
backs off and honours `Retry-After`; use `--delay=900` to slow it further.
Anything over 220KB is downscaled to 600px wide JPEG with `sips` (macOS
built-in; other platforms keep the original).

Licensing: IGDB art is usable with attribution under their terms. Wikipedia box
art is normally non-free fair-use — fine for local use, your call to publish.
The panel credits whichever source supplied the image, and deleting a file from
`assets/covers/` plus a rebuild reverts that game to procedural art.

## The catalogue layer

The timeline carries two datasets. **216 featured games** — hand-picked, with
written blurbs and real box art — are the cards you fly between. Behind them,
**every video game on Wikidata with an English Wikipedia article**, about 28,800
across 1990-2025, is drawn as a spatial graph.

Position means something:

- **depth** is the release year, the same axis the cards use
- **angle** is the category, so a genre reads as a corridor running through the
  decades, with a faint spoke back to its hub
- **radius** is notability, measured as the number of Wikipedia language editions
  that cover the game — the games everyone knows sit near the axis, the long
  tail spreads outward

28,800 nodes cannot be DOM, and they don't need to be. `src/graph.js` draws to a
canvas using the same projection maths the CSS perspective applies, so the two
layers share one camera and agree pixel for pixel. Only years inside the depth
window are drawn — one to two thousand points a frame — and only the year the
camera is closest to gets labels, one per grid cell so they never stack. A
featured game's catalogue twin is dropped, matched on its Wikidata id.

Clicking a point opens it in the panel: genre, platforms, studio and links come
from Wikidata, and the description is Wikipedia's own first sentences, fetched
when you open it rather than shipped for 28,800 games. The layer toggles off
with the **CATALOGUE** button or `?catalogue=0`, and the list view can expand any
year to its full catalogue, which is how this stays reachable without a mouse.

```bash
node scripts/harvest-wikidata.mjs            # all years -> data/catalog/<year>.json
node scripts/harvest-wikidata.mjs 1998 2001  # a range
```

Four small queries a year, because the query service has a 60s budget and
answers an overrun with a truncated body that only shows up as malformed JSON —
an aggregate over every `P577` in the class, or a 250-item `VALUES` join, both
fail that way. Games with regional releases carry several dates and are filed
under the earliest.

## System requirements

The panel shows minimum and recommended PC specs — OS, CPU, RAM, GPU, storage,
DirectX — for the 88 games where Steam publishes them, with a link to the store
page they came from. `data/specs.json` is loaded when a panel first opens, never
up front.

```bash
npm run fetch:specs                        # games with no specs yet
node scripts/fetch-specs.mjs --retry       # re-try the ones that failed
node scripts/fetch-specs.mjs --only=elden --force
```

Steam is the only source for this that needs no key, and matching a title to an
app id is where it can go wrong, so the script refuses to guess:

- Valve's store search does the ranking, and a candidate must match our title
  exactly once normalised, with edition suffixes stripped from the raw name
  before comparison ("Game of the Year Edition", "Ultimate", "Remastered").
- Among matches it takes the lowest app id, because ids climb over time — that
  is what separates Oblivion's 2009 Game of the Year edition from the 2025
  remaster.
- A store date more than three years from ours is rejected, because titles get
  reused: searching "Doom" returns the 2016 game, which matches our 1993 entry
  exactly. Two exceptions pass: a re-listing of the same build (a Game of the
  Year or Complete edition) and a PC port of a game that shipped console-only,
  where the port's requirements are the only ones that exist.
- Older entries write their requirements as one prose line rather than a
  labelled list — Portal's reads "1.7 GHz Processor, 512MB RAM, DirectX 8.1
  level Graphics Card…" — and are kept whole.

What is left over is recorded rather than dropped, and the panel says which it
is: not on Steam (93, mostly console-only and pre-Steam PC games), no published
requirements, or a match too far from our date to trust.

## Views

The timeline is the default. `?view=list`, the header toggle or the skip link
opens the same filtered data as a plain list — covers, facts, blurbs, links and
an add button — which is what screen readers, keyboards and small screens get.

Years that fade out of the camera's range are marked `inert`, so Tab never
lands on a card you cannot see; the panel and drawer trap focus while open and
hand it back on close; the year is announced once the camera settles rather
than on every frame it crosses.

## Offline

`sw.js` precaches the shell and the dataset, caches cover art as it is seen,
and serves data stale-while-revalidate, so a second visit paints immediately
and an offline one still works. `manifest.webmanifest` makes it installable.
The dev server sends ETag, Last-Modified and 304s, and marks cover art
immutable for a year.

## My list and recommendations

Any game can be saved from its panel (**+ Add to my list**, or `A` while a panel
is open), where it also takes a status, a five-star rating and a note. Saved games get a marker on the timeline, and the drawer (`L`, or
**MY LIST** in the header) shows the list plus a recommendation shelf. **Show
only my list** filters the timeline down to saved games and is shareable as
`?list=1`.

The drawer sorts by date added, rating, status, release year or title, exports
and imports JSON, and copies a share link that carries the ids; an incoming
link is offered in a bar rather than merged on sight.

Storage is IndexedDB — database `game-explorer`, object store `list` keyed by
game id, schema v2 (`status`, `rating`, `note`) with a migration from v1. `src/store.js` keeps a memory mirror so the
UI reads synchronously, writes through to disk, and notifies subscribers. If
IndexedDB is unavailable (private window, blocked storage) it degrades to a
session-only list and says so in the drawer rather than failing.

Recommendations are computed in the page from the data already loaded — no
network, no model. Every unsaved game is scored against every saved one:

| Signal | Weight |
| --- | --- |
| Same category | 3.0 |
| Same genre | 2.2 |
| Release year proximity (within 12 years, linear falloff) | 1.5 |
| Shared blurb/genre vocabulary, weighted by inverse document frequency | up to 2.5 |

Scores are averaged over the list so a long list does not just rank by the size
of a category, and the shelf is capped at two picks per category to keep it
varied. Each row names the saved game that earned it the slot ("Action RPG ·
like Elden Ring").

```bash
npm run check:data   # dataset integrity, also runs as part of build:data
npm run test:unit    # the DOM-free modules, no browser needed
npm run smoke        # 29 browser checks; needs `npm start` in another shell
npm test             # all three
```

`check-data.mjs` fails the build on a duplicate id, an unmapped genre, a colour
that disagrees with its category, an image path with no file behind it, a link
that is not https, a year index that disagrees with its games, or a module that
has been added to `src/` without being added to the service worker's precache
list.

`unit.mjs` covers the modules that never touch the DOM — the shared helpers, the
category taxonomy, procedural art, the recommender, the catalogue normaliser and
share links — and resolves the whole module graph, so a mistyped import or a
renamed export fails here rather than as a blank page. It needs no browser.

`smoke.mjs` drives real Chrome over the DevTools Protocol and checks the parts a
DOM dump cannot: writes land in IndexedDB and survive a reload, the drawer and
timeline markers follow, recommendations appear and exclude saved games, filters
and search and deep links work, a similar game opens in place, the list view
renders every entry, offscreen years are inert, share links round-trip, and the
service worker precaches.

## Performance

- **Virtualised depth window.** A fixed pool of 6 year-group elements is re-bound
  as the camera moves, so DOM cost is O(visible) — about 3 years and 12 nodes —
  regardless of how long the dataset gets.
- **rAF with delta-time smoothing**, not `setInterval(…, 16)`; easing is
  frame-rate independent and the loop stops on `destroy()`.
- **Diffed writes.** The world transform, group opacities, the year readout and
  the rail highlight are only written when the value actually changes; node
  content is only rewritten when a slot's game changes.
- **`transform`/`opacity` only** in the animated path. The progress bar is a
  `scaleX`, so no per-frame layout. `backdrop-filter` is confined to the panel.
- **Batched canvas work.** Catalogue points are grouped by colour and quantised
  opacity when a year loads, so a frame issues about 160 fills and strokes for
  ~1,050 points rather than one of each per point — and the projection writes
  into reused flat arrays, so a frame allocates roughly nothing.
- **One fetch per catalogue year**, shared by the canvas layer and the list
  view's "show all N games" control (`src/catalog.js`).
- **Targeted updates.** Saving a game repaints the buttons that changed, not the
  list; the detail panel rebuilds only its save/status/rating block and keeps
  your focus where it was. Views that are closed defer their render until they
  are opened.
- **Deferred posters.** A generated poster is ~2.3KB of `data:` URI, so expanding
  a busy year draws them as they scroll into reach — 101KB of markup instead of
  1.4MB.
- **No network in the render path** — data is one JSON fetch, art is inline SVG.
- `prefers-reduced-motion` disables easing and pointer parallax.

## URLs and keys

- `?cat=rpg,horror` — filter by category, `?q=souls` — search. Both update as you
  click, so any view is shareable.
- `#game=elden-ring-2022` — open a game's panel and jump to its year.
- `?list=1` — show only saved games.
- `/` focus search · `L` my list · `A` save the open game · `↑`/`↓`, `PgUp`/`PgDn`
  step a year · `Home`/`End` jump to the ends · `Esc` close the panel or drawer.

## Search engines

The timeline is drawn from JSON after load, and a game's deep link lives in the
fragment (`#game=…`). A crawler fetching `index.html` therefore sees an empty
stage, and a fragment is not a URL it can index at all — so the app alone would
be one thin result and nothing else.

`npm run build:seo` generates the indexable half: a static page per featured
game under `games/`, with the facts in the markup, a canonical URL of its own,
`VideoGame` and `BreadcrumbList` structured data, and a link into the app at its
node. `games/index.html` lists all of them by year, `index.html` links to it from
the chrome (and from a `<noscript>` block), and `sitemap.xml` names every page.
The catalogue layer stays out: 23,000 rows of title-and-year are the kind of
thin, near-duplicate pages that earn a site nothing.

```
npm run build:seo        # games/, sitemap.xml, robots.txt
npm run build:og         # assets/og.png, only when the branding changes
npm run check:seo        # runs inside npm test
```

`build:seo` runs as part of `build:site`, so both publish routes regenerate the
pages; `check:seo` fails the test run if a dataset change landed without one.
To publish somewhere else, set the base: `SITE_URL=https://example.com/ npm run
build:seo` rewrites every canonical, sitemap entry and share-card URL.

One caveat: robots.txt is only read from the origin root, and Pages serves this
project from `/game-explorer/`. The file is correct and takes effect behind a
custom domain; until then the sitemap link in it is advisory, so submit
`sitemap.xml` to Search Console directly.

## Origin

Ported from the `Games Timeline.dc.html` design component (claude.ai/design). The
visual language — starfield, ghost year numerals, orbiting nodes, spokes, the
right-hand rail — is carried over; the React-based `dc-runtime` is not.
