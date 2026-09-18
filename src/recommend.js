// "Because you saved X" recommendations, computed in the page from the games
// already loaded. No model, no network: category and genre overlap, release-year
// proximity, and shared blurb vocabulary weighted by inverse document frequency
// so that "roguelike" counts and "the" does not.

const STOP = new Set(("a an the and or but of in on at to for with from into its it is was were be been being that this these those you your " +
  "as by not no only its it's their there here what which who whom whose when where why how all any both each few more most other some such " +
  "than too very can will just don should now one two three made make makes made game games player players play played playing").split(" "));

const WEIGHT = { category: 3, genre: 2.2, year: 1.5, words: 2.5 };
const YEAR_SPAN = 12;

let index = null;   // built once per dataset

const tokenize = (game) =>
  new Set(`${game.blurb} ${game.genre} ${game.categoryLabel}`
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length > 3 && !STOP.has(w)));

function build(games) {
  const tokens = new Map();
  const df = new Map();
  for (const game of games) {
    const set = tokenize(game);
    tokens.set(game.id, set);
    for (const word of set) df.set(word, (df.get(word) || 0) + 1);
  }
  const idf = new Map();
  for (const [word, n] of df) idf.set(word, Math.log(games.length / (1 + n)));
  const maxIdf = Math.max(...idf.values(), 1);
  return { tokens, idf, maxIdf, size: games.length };
}

function pairScore(candidate, seed, idx) {
  let score = 0;
  if (candidate.category === seed.category) score += WEIGHT.category;
  if (candidate.genre === seed.genre) score += WEIGHT.genre;

  const gap = Math.abs(candidate.year - seed.year);
  if (gap < YEAR_SPAN) score += WEIGHT.year * (1 - gap / YEAR_SPAN);

  const a = idx.tokens.get(candidate.id);
  const b = idx.tokens.get(seed.id);
  let shared = 0;
  const small = a.size < b.size ? a : b;
  const large = small === a ? b : a;
  for (const word of small) if (large.has(word)) shared += idx.idf.get(word) || 0;
  score += Math.min(WEIGHT.words, (shared / idx.maxIdf) * WEIGHT.words);

  return score;
}

function reasonFor(candidate, seed) {
  if (candidate.genre === seed.genre) return `${candidate.genre} · like ${seed.title}`;
  if (candidate.category === seed.category) return `More ${candidate.categoryLabel.toLowerCase()} after ${seed.title}`;
  if (Math.abs(candidate.year - seed.year) <= 2) return `Same era as ${seed.title}`;
  return `Shares ground with ${seed.title}`;
}

/**
 * @param games   full dataset
 * @param savedIds ids already on the list
 * @param limit   how many to return
 * @returns [{ game, score, reason, seed }] best first
 */
export function recommend(games, savedIds, limit = 8) {
  if (!savedIds.length) return [];
  if (!index || index.size !== games.length) index = build(games);

  const byId = new Map(games.map((g) => [g.id, g]));
  const seeds = savedIds.map((id) => byId.get(id)).filter(Boolean);
  if (!seeds.length) return [];
  const saved = new Set(savedIds);

  const scored = [];
  for (const candidate of games) {
    if (saved.has(candidate.id)) continue;
    let total = 0, best = null, bestScore = -1;
    for (const seed of seeds) {
      const s = pairScore(candidate, seed, index);
      total += s;
      if (s > bestScore) { bestScore = s; best = seed; }
    }
    // average, so a long list does not simply rank by popularity of a category
    scored.push({ game: candidate, score: total / seeds.length, seed: best, reason: reasonFor(candidate, best) });
  }

  scored.sort((a, b) => b.score - a.score || a.game.year - b.game.year);

  // keep the shelf varied: at most two picks per category
  const perCategory = new Map();
  const out = [];
  for (const row of scored) {
    const n = perCategory.get(row.game.category) || 0;
    if (n >= 2) continue;
    perCategory.set(row.game.category, n + 1);
    out.push(row);
    if (out.length === limit) break;
  }
  return out;
}
