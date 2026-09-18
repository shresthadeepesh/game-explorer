// Category taxonomy. Shared by the data build script (node) and the app (browser).
// Each genre in the dataset maps to exactly one category; the category carries the
// colour and the icon used on nodes, filters and cover art.

export const CATEGORIES = {
  shooter:    { label: "Shooter",     color: "#ff5a36", genres: ["FPS", "Arena FPS", "Tactical FPS", "Shooter", "Hero Shooter", "Co-op Shooter", "Rail Shooter", "VR FPS", "Battle Royale"] },
  rpg:        { label: "RPG",         color: "#7b9cff", genres: ["RPG", "Action RPG", "JRPG", "MMORPG"] },
  adventure:  { label: "Adventure",   color: "#4cd7a0", genres: ["Action-Adventure", "Adventure", "Puzzle-Adventure", "Point & Click", "Metroidvania"] },
  openworld:  { label: "Open World",  color: "#ffd166", genres: ["Open World"] },
  platformer: { label: "Platformer",  color: "#e8c547", genres: ["Platformer", "Puzzle-Platformer", "Co-op Platformer", "Cinematic Platformer"] },
  strategy:   { label: "Strategy",    color: "#b07bff", genres: ["RTS", "Tactics", "4X", "MOBA", "Tower Defense"] },
  horror:     { label: "Horror",      color: "#ff3b5c", genres: ["Horror", "Survival Horror"] },
  puzzle:     { label: "Puzzle",      color: "#47c9e8", genres: ["Puzzle", "Physics Puzzle"] },
  simulation: { label: "Simulation",  color: "#8fd14f", genres: ["Life Sim", "Sim", "Simulation", "Sandbox", "Sports", "Rhythm", "Space Sim", "City Builder", "Party"] },
  roguelike:  { label: "Roguelike",   color: "#ff9f4a", genres: ["Roguelike", "Roguelike Deckbuilder", "Card Game"] },
  immersive:  { label: "Immersive Sim", color: "#00c2a8", genres: ["Immersive Sim"] },
  stealth:    { label: "Stealth",     color: "#9aa3b5", genres: ["Stealth"] },
  racing:     { label: "Racing",      color: "#00b3ff", genres: ["Racing", "Kart Racer"] },
  fighting:   { label: "Fighting",    color: "#e05bff", genres: ["Fighting"] },
  action:     { label: "Action",      color: "#ff6ab5", genres: ["Action"] }
};

export const GENRE_TO_CATEGORY = Object.entries(CATEGORIES).reduce((map, [key, cat]) => {
  for (const genre of cat.genres) map[genre] = key;
  return map;
}, {});

// 24x24 viewBox paths. Stroke-drawn, so they inherit the category colour.
export const ICON_PATHS = {
  shooter:    "M3 12h7m0 0V8h6l5 4-5 4h-6v-4Z",
  rpg:        "M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8L12 3Z",
  adventure:  "M12 3v18M4 7l8-4 8 4-8 4-8-4Zm0 10l8 4 8-4",
  openworld:  "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z",
  platformer: "M3 18h6v-4h6v-4h6M7 14v-3",
  strategy:   "M4 20V8l5-4 5 4v12M4 20h16M16 20v-7l4-2v9M7 12h2",
  horror:     "M12 3a7 7 0 0 0-7 7v4l2 2v3h10v-3l2-2v-4a7 7 0 0 0-7-7Zm-3 9h.01M15 12h.01",
  puzzle:     "M9 4h6v3a2 2 0 1 0 0 4v3H9v-3a2 2 0 1 1 0-4V4ZM15 14h5v6H9v-3",
  simulation: "M4 20V9l8-5 8 5v11H4Zm6 0v-6h4v6",
  roguelike:  "M7 4h7l3 3v13H7V4Zm7 0v3h3M10 11h4m-4 4h4",
  immersive:  "M12 5c-5 0-9 3.1-9 7 0 2.3 1.5 4.3 3.8 5.6L6 21l3.4-2a12 12 0 0 0 2.6.3c5 0 9-3.1 9-7s-4-7.3-9-7.3Zm0 4v4m0 3h.01",
  stealth:    "M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Zm9-2.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM4 4l16 16",
  racing:     "M6 21V4m0 0h13l-3 4.5L19 13H6m0-4.5h6.5M6 4v4.5h6.5V13",
  fighting:   "M7 11V7.5a1.5 1.5 0 0 1 3 0V10m0-2V5.5a1.5 1.5 0 0 1 3 0V10m0-2.5a1.5 1.5 0 0 1 3 0V13a6 6 0 0 1-6 6H9.5A5.5 5.5 0 0 1 4 13.5V12a1.5 1.5 0 0 1 3 0",
  action:     "M13 2 4 14h6l-1 8 9-12h-6l1-8Z"
};

export const categoryOf = (genre) => GENRE_TO_CATEGORY[genre] || "action";
export const colorOf = (categoryKey) => (CATEGORIES[categoryKey] || CATEGORIES.action).color;

// Wikidata's genre vocabulary (P136) is free-form and much larger than our 15
// categories, so catalogue entries are folded in by pattern. Order matters:
// the first rule that matches wins, so the specific ones come before the broad
// ones ("roguelike" before "role-playing", "open world" before "adventure").
const GENRE_RULES = [
  [/immersive sim/i, "immersive"],
  [/roguelike|roguelite|deck.?build|collectible card|card game/i, "roguelike"],
  [/stealth/i, "stealth"],
  [/survival horror|horror/i, "horror"],
  [/open world/i, "openworld"],
  [/kart|racing|driving|motorsport|rally/i, "racing"],
  [/fighting|beat 'em up|beat-'em-up|versus/i, "fighting"],
  [/platform/i, "platformer"],
  [/first-person shooter|third-person shooter|shooter|shoot 'em up|shmup|light gun|battle royale/i, "shooter"],
  [/real-time strategy|turn-based strategy|grand strategy|4x|tower defen|wargame|multiplayer online battle arena|moba|tactic|strategy/i, "strategy"],
  [/role-playing|\brpg\b|dungeon crawl/i, "rpg"],
  [/puzzle|logic game|match.?three|sokoban/i, "puzzle"],
  [/metroidvania|action-adventure|adventure|interactive fiction|visual novel|point-and-click|graphic adventure|exploration|walking sim/i, "adventure"],
  [/simulation|simulator|life sim|city-building|construction and management|business|farming|tycoon|sports|sport game|rhythm|music|party|educational|sandbox|survival/i, "simulation"],
  [/action|hack and slash|arcade/i, "action"]
];

/** Best category for a list of Wikidata genre labels; falls back to action. */
export function categoryFromGenres(labels = []) {
  for (const [pattern, key] of GENRE_RULES) {
    if (labels.some((label) => pattern.test(label))) return key;
  }
  return "action";
}
