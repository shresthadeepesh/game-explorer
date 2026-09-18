// The catalogue: Wikidata's full year files, plus the registry that lets any
// part of the app resolve a game id back to a game object.
//
// Two layers want the same year files — the canvas graph and the list view's
// "show all N games" control — so the fetch is cached here and shared. The raw
// Wikidata shape is kept as-is for the graph, which only needs qid/genres/title,
// and normalised on demand for anything that expects a dataset-shaped game.

import { CATEGORIES, categoryFromGenres, colorOf } from "./categories.js";
import { fnv32 } from "./util.js";

const registry = new Map();          // game id -> game (curated and catalogue alike)
const pending = new Map();           // year -> Promise<entry[]>
const resolved = new Map();          // year -> entry[], once the promise settles

/** Adds games to the id registry. Curated entries are registered at boot. */
export function register(games) {
  for (const game of games) registry.set(game.id, game);
}

export const resolve = (id) => registry.get(id) || null;

/**
 * Raw catalogue entries for a year. One fetch per year for the whole app; a
 * year with no file resolves to an empty list rather than rejecting.
 */
export function loadYear(year) {
  let promise = pending.get(year);
  if (!promise) {
    promise = fetch(`data/catalog/${year}.json`)
      .then((res) => (res.ok ? res.json() : { games: [] }))
      .then((body) => body.games || [])
      .catch(() => [])
      .then((games) => { resolved.set(year, games); return games; });
    pending.set(year, promise);
  }
  return promise;
}

/** Entries for a year if it is already in memory, else null. For render loops. */
export const peekYear = (year) => resolved.get(year) || null;

/** True once `loadYear` has been asked for this year, settled or not. */
export const isRequested = (year) => pending.has(year);

/**
 * Turns a raw Wikidata entry into the dataset shape the panel, art and saved
 * list all expect. Memoised through the registry, so the same qid always yields
 * the same object and identity comparisons hold.
 */
export function fromCatalogue(entry) {
  const known = registry.get(entry.qid);
  if (known) return known;

  const category = categoryFromGenres(entry.genres);
  const article = entry.article.replace(/ /g, "_");
  const game = {
    id: entry.qid,
    qid: entry.qid,
    catalogue: true,
    title: entry.title,
    year: entry.year,
    released: entry.released,
    rank: 0,
    genre: entry.genres[0] || CATEGORIES[category].label,
    category,
    categoryLabel: CATEGORIES[category].label,
    color: colorOf(category),
    platforms: entry.platforms || [],
    developers: entry.developers || [],
    blurb: "",                                   // fetched from Wikipedia when opened
    image: null,
    imageUrl: null,
    seed: fnv32(entry.qid),
    wikiTitle: entry.article,
    wiki: `https://en.wikipedia.org/wiki/${encodeURI(article)}`,
    guide: `https://strategywiki.org/w/index.php?search=${encodeURIComponent(entry.title)}`,
    trailer: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${entry.title} ${entry.year} trailer`)}`,
    search: `${entry.title} ${entry.genres.join(" ")} ${(entry.developers || []).join(" ")}`.toLowerCase()
  };
  registry.set(game.id, game);
  return game;
}
