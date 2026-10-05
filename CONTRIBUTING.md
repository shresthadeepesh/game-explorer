# Contributing

The 216 featured games are a hand-picked list, and hand-picked lists are wrong in
public. Corrections and nominations are the most useful thing you can send.

There are two ways in. Neither needs you to run the project.

- **Open an issue.** [Nominate a game](https://github.com/shresthadeepesh/game-explorer/issues/new?template=add-game.yml)
  or [report something wrong](https://github.com/shresthadeepesh/game-explorer/issues/new?template=fix-data.yml).
  Every entry page on the site links straight to the right form, already filled in.
- **Open a pull request.** One file holds the whole list. The steps are below.

## What the list is for

Each year holds a small number of games, and a game earns its place by having
**changed something** — a genre, a technique, an audience, an expectation. It is
not a ranking, and "this is my favourite" is not an argument. The useful case is
one sentence: *what did this game make possible that was not possible before it?*

A nomination that names what moved is worth more than one that names a score.

## Editing the list

Everything is in [`scripts/source-games.mjs`](scripts/source-games.mjs), grouped by
year. One row per game:

```js
["Title", "Genre", "One sentence on why it mattered.", "Wikipedia Article Title?"]
```

- **Title** — as the game is commonly known. The id is derived from it
  (`title-slug-year`), so changing a title changes the entry's URL.
- **Genre** — must already exist in [`src/categories.js`](src/categories.js). The
  build fails loudly on an unmapped genre. Adding a genre means adding it to a
  category's `genres` list in the same PR.
- **Blurb** — one sentence, present tense, at least 20 characters. Say what the
  game did, not how good it is. Look at the neighbouring rows for the register.
- **Wikipedia article** — the optional 4th field, needed only when the article
  title differs from the display title (`Doom` → `Doom (1993 video game)`). Link
  the game's own article, not a series or a disambiguation page.

Then rebuild and check:

```bash
npm install
npm run build:data     # regenerates data/games.json and data/games.csv
npm run build:seo      # regenerates games/, sitemap.xml and robots.txt
npm test               # dataset gate, unit tests, SEO gate, browser smoke test
```

Commit the regenerated `data/` and `games/` files along with your edit — they are
checked in, and `npm test` fails if they are stale.

### Enrichment is optional

Platforms, studios, release dates and cover art come from Wikidata and Wikipedia,
not from your row. You do not have to supply them. If you want to:

```bash
npm run harvest        # the per-year catalogue from Wikidata
node scripts/enrich-wikidata.mjs   # platforms, studios, release dates
npm run fetch:covers   # key art
npm run check:links    # every Wikipedia article still resolves
```

These hit public APIs and take a while. Leaving them to a maintainer is fine.

## Running it

No bundler, no build step for the app itself — but ES modules need an http
origin, so `file://` will not do.

```bash
npm start              # http://localhost:4173
```

`npm test` drives a real browser through [the Chrome DevTools Protocol](scripts/smoke.mjs)
and needs Chrome or Chromium on the machine. Point it somewhere if it cannot find
one: `CHROME_PATH=/usr/bin/chromium npm test`.

## Sending the change

1. Fork, branch, commit.
2. Subject line as `type(scope): what changed`, lowercase, no full stop —
   `feat(data): add Outer Wilds to 2019`. Types in use: `feat` `fix` `perf`
   `refactor` `docs` `test` `chore` `build` `ci`.
3. Open the PR. The checks workflow runs `npm test` against it.

Expect a conversation about *why* an entry belongs rather than about the diff.
A year is small on purpose: adding a game usually means arguing one out.

## What gets turned down

- A game added for being good rather than for changing something.
- A blurb that reads as a review score, or that could be about ten other games.
- A year stuffed past its neighbours — the shape of the timeline matters.
- Catalogue entries. The 23,000-row catalogue layer is harvested from Wikidata
  and is not edited by hand; fix those [upstream at Wikidata](https://www.wikidata.org),
  and the next harvest picks the change up.

## Reporting something broken

Bugs, rendering faults and accessibility problems are welcome as plain issues —
no template needed. Say what you did, what happened, and what you expected, and
name the browser. If the 3D stage is involved, whether reduced-motion is on is
usually the first question.
