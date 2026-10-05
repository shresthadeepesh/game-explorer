// Where the project lives, and the links that turn a reader into a contributor.
// Shared by the app (src/panel.js) and the static page build (scripts/build-seo.mjs),
// so the repository URL is written down exactly once.

export const REPO = "https://github.com/shresthadeepesh/game-explorer";
export const SOURCE_FILE = `${REPO}/blob/main/scripts/source-games.mjs`;
export const CONTRIBUTING = `${REPO}/blob/main/CONTRIBUTING.md`;

/** GitHub issue forms prefill a field from a query param named after its id. */
const issueUrl = (template, fields) => {
  const params = new URLSearchParams({ template, ...fields });
  return `${REPO}/issues/new?${params}`;
};

/**
 * The right issue form for a game: featured entries get a correction form,
 * catalogue entries get the nomination form, already filled in.
 */
export function suggestEditUrl(game) {
  if (game.catalogue) {
    return issueUrl("add-game.yml", {
      title: `Add: ${game.title} (${game.year})`,
      game: game.title,
      year: String(game.year)
    });
  }
  return issueUrl("fix-data.yml", {
    title: `Fix: ${game.title} (${game.year})`,
    game: `${game.title} (${game.id})`
  });
}

/** The nomination form with nothing filled in, for "a game is missing". */
export const addGameUrl = () => issueUrl("add-game.yml", {});
