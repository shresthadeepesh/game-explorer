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
src/app.js              filter state, panel, rail, URL sync
src/mylist.js           my-list drawer and recommendation shelf
src/store.js            IndexedDB persistence for the list
src/recommend.js        similarity scoring behind the recommendations
src/timeline.js         virtualised 3D camera + renderer
src/art.js              procedural cover art, icon sprite
src/categories.js       taxonomy: genre -> category, colour, icon path
data/games.json         runtime dataset (generated)
data/games.csv          same rows, for spreadsheets and diffs (generated)
scripts/source-games.mjs  source of truth: [year, [[title, genre, blurb, wiki?], ...]]
scripts/build-data.mjs    emits data/games.json + data/games.csv
scripts/fetch-covers.mjs  optional real key art from Wikipedia
scripts/check-links.mjs   verifies every Wikipedia article still resolves
scripts/smoke.mjs         CDP end-to-end test (list, storage, recommendations)
assets/covers/            drop-in real covers, named <id>.jpg|png|webp|avif
```

## Editing the data

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

Art resolution per game, in order: a local file in `assets/covers/<id>.<ext>`,
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
| `wikipedia` (default) | none | Infobox art via the MediaWiki `pageimages` API, one call per 50 games. Fills 213 of 216 here — Minecraft, Undertale and Fall Guys have no usable infobox image and stay procedural. |
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

## My list and recommendations

Any game can be saved from its panel (**+ Add to my list**, or `A` while a panel
is open). Saved games get a marker on the timeline, and the drawer (`L`, or
**MY LIST** in the header) shows the list plus a recommendation shelf. **Show
only my list** filters the timeline down to saved games and is shareable as
`?list=1`.

Storage is IndexedDB — database `game-explorer`, one object store `list` keyed
by game id with an `addedAt` index. `src/store.js` keeps a memory mirror so the
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
npm run smoke    # needs `npm start` running in another shell
```

`scripts/smoke.mjs` drives real Chrome over the DevTools Protocol and checks the
parts a DOM dump cannot: writes land in IndexedDB, the list survives a reload,
the drawer and timeline markers update, recommendations appear and exclude saved
games, and the list-only filter narrows the timeline.

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
- **No network in the render path** — data is one JSON fetch, art is inline SVG.
- `prefers-reduced-motion` disables easing and pointer parallax.

## URLs and keys

- `?cat=rpg,horror` — filter by category, `?q=souls` — search. Both update as you
  click, so any view is shareable.
- `#game=elden-ring-2022` — open a game's panel and jump to its year.
- `?list=1` — show only saved games.
- `/` focus search · `L` my list · `A` save the open game · `↑`/`↓`, `PgUp`/`PgDn`
  step a year · `Home`/`End` jump to the ends · `Esc` close the panel or drawer.

## Origin

Ported from the `Games Timeline.dc.html` design component (claude.ai/design). The
visual language — starfield, ghost year numerals, orbiting nodes, spokes, the
right-hand rail — is carried over; the React-based `dc-runtime` is not.
