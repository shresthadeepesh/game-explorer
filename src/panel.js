// The detail panel. Owns its own markup and listeners; the app hands it a game
// and callbacks, and re-renders by calling render() again.

import { CATEGORIES } from "./categories.js";
import { artFor, coverFor } from "./art.js";
import { recommend } from "./recommend.js";
import * as store from "./store.js";
import { $, esc, debounce } from "./util.js";

const DATE = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const formatDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(+d) ? iso : DATE.format(d);
};

const fact = (label, value) => value
  ? `<div class="fact"><dt>${label}</dt><dd>${value}</dd></div>`
  : "";

// Requirements are their own file: only the panel needs them, and only once
// someone opens a game.
let specsPromise = null;
const loadSpecs = () => (specsPromise ??= fetch("data/specs.json")
  .then((r) => (r.ok ? r.json() : { games: {} }))
  .then((d) => d.games || {})
  .catch(() => ({})));

const SPEC_ROWS = [
  ["os", "OS"], ["processor", "CPU"], ["memory", "RAM"],
  ["graphics", "GPU"], ["storage", "Storage"], ["directx", "DirectX"]
];

const summaries = new Map();

/** Wikipedia's own first sentences, for entries with no hand-written blurb. */
async function fetchSummary(game) {
  if (summaries.has(game.id)) { game.blurb = summaries.get(game.id); return; }
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(game.wikiTitle.replace(/ /g, "_"))}`);
    if (!res.ok) throw new Error(String(res.status));
    const summary = await res.json();
    game.blurb = (summary.extract || "").split(". ").slice(0, 2).join(". ");
  } catch {
    game.blurb = "No summary available.";
  }
  summaries.set(game.id, game.blurb);
  document.dispatchEvent(new CustomEvent("game-summary", { detail: game.id }));
}

function specsMarkup(spec) {
  if (!spec) return "";
  if (spec.status !== "ok") {
    const why = {
      "no-steam-match": "No PC release on Steam, so no published requirements.",
      "no-requirements": "Steam lists no system requirements for this one.",
      ambiguous: `Steam's closest match is dated ${spec.steamYear}, too far from this release to trust.`
    }[spec.status] || "Requirements could not be fetched.";
    return `<section class="panel__specs">
      <h3 class="panel__heading">System requirements</h3>
      <p class="specs__none">${why}</p>
    </section>`;
  }

  const rows = SPEC_ROWS
    .filter(([key]) => spec.minimum?.[key] || spec.recommended?.[key])
    .map(([key, label]) => `<tr>
      <th scope="row">${label}</th>
      <td>${esc(spec.minimum?.[key] || "—")}</td>
      <td>${esc(spec.recommended?.[key] || "—")}</td>
    </tr>`).join("");

  return `<section class="panel__specs">
    <h3 class="panel__heading">System requirements</h3>
    <table class="specs">
      <thead><tr><th scope="col"><span class="sr-only">Component</span></th><th scope="col">Minimum</th><th scope="col">Recommended</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="specs__source">Steam${spec.steamName ? ` · ${esc(spec.steamName)}` : ""} · <a href="${spec.url}" target="_blank" rel="noopener">store page ↗</a></p>
  </section>`;
}

export function mountPanel({ root, games, resolve, onSelect, onClose }) {
  let game = null;

  function factsFor(g) {
    // Wikidata gives the exact date; the timeline slot can differ for regional
    // or early-access releases, so say so rather than quietly disagreeing.
    const released = g.released
      ? `${formatDate(g.released)}${Number(g.released.slice(0, 4)) !== g.year ? ` <span class="fact__aside">listed under ${g.year}</span>` : ""}`
      : null;
    return `<dl class="panel__facts">
      ${fact("Released", released)}
      ${fact(g.developers?.length > 1 ? "Developers" : "Developer", g.developers?.map(esc).join(", "))}
      ${fact("Platforms", g.platforms?.map((p) => `<span class="chiplet">${esc(p)}</span>`).join(""))}
    </dl>`;
  }

  function similarFor(g) {
    if (g.catalogue) return "";              // not in the recommender's index
    const picks = recommend(games, [g.id], 3);
    if (!picks.length) return "";
    return `<section class="panel__similar">
      <h3 class="panel__heading">More like this</h3>
      <ul class="similar">
        ${picks.map(({ game: s }) => `<li>
          <button type="button" class="similar__item" data-go="${s.id}">
            <img class="similar__art" src="${artFor(s)}" alt="" loading="lazy" decoding="async">
            <span class="similar__meta">
              <span class="similar__name">${esc(s.title)}</span>
              <span class="similar__sub" style="--row-color:${s.color}">${s.year} · ${esc(s.genre)}</span>
            </span>
          </button>
        </li>`).join("")}
      </ul>
    </section>`;
  }

  function listControls(g) {
    const saved = store.get(g.id);
    return `<div class="panel__list">
      <button type="button" class="panel__save ${saved ? "is-saved" : ""}" data-save>
        ${saved ? "✓ In my list" : "+ Add to my list"}
      </button>
      ${saved ? `
        <div class="panel__track">
          <div class="segmented" role="group" aria-label="Status">
            ${store.STATUSES.map((s) => `<button type="button" class="segmented__item ${saved.status === s ? "is-on" : ""}"
              data-status="${s}" aria-pressed="${saved.status === s}">${s}</button>`).join("")}
          </div>
          <div class="stars" role="group" aria-label="Your rating">
            ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="stars__item ${n <= saved.rating ? "is-on" : ""}"
              data-rate="${n}" aria-label="${n} star${n > 1 ? "s" : ""}" aria-pressed="${n <= saved.rating}">★</button>`).join("")}
            ${saved.rating ? `<button type="button" class="stars__clear" data-rate="0" aria-label="Clear rating">✕</button>` : ""}
          </div>
          <input class="panel__note" data-note type="text" maxlength="500" placeholder="Add a note…" value="${esc(saved.note)}">
        </div>` : ""}
    </div>`;
  }

  function render() {
    if (!game) return;
    const g = game;
    const category = CATEGORIES[g.category];
    root.hidden = false;
    root.style.setProperty("--panel-color", g.color);
    root.innerHTML = `
      <div class="panel__top">
        <span class="panel__meta">${g.catalogue ? `${g.year} / catalogue` : `${g.year} / ${String(g.rank).padStart(2, "0")}`}</span>
        <button type="button" class="panel__close" data-close aria-label="Close">✕</button>
      </div>
      <img class="panel__art" src="${artFor(g)}" alt="${esc(g.title)} key art" decoding="async">
      ${g.imageCredit ? `<p class="panel__credit">Cover: ${esc(g.imageCredit)}</p>` : ""}
      <div>
        <h2 class="panel__title">${esc(g.title)}</h2>
        <p class="panel__genre">
          <svg class="panel__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-${g.category}"/></svg>
          ${category.label} · ${esc(g.genre)}
        </p>
      </div>
      ${factsFor(g)}
      <p class="panel__blurb" data-blurb>${esc(g.blurb) || (g.catalogue ? "Looking this one up…" : "")}</p>
      <div data-list-host>${listControls(g)}</div>
      <nav class="panel__links">
        <a href="${g.wiki}" target="_blank" rel="noopener"><span>Wikipedia · what it is</span><span>↗</span></a>
        <a href="${g.guide}" target="_blank" rel="noopener"><span>StrategyWiki · how to play</span><span>↗</span></a>
        <a href="${g.trailer}" target="_blank" rel="noopener"><span>Watch trailer</span><span>↗</span></a>
      </nav>
      <div data-specs></div>
      ${similarFor(g)}
      <p class="panel__hint">SELECT ANOTHER NODE TO COMPARE.<br>ESC CLOSES THIS PANEL.</p>`;

    $(".panel__art", root).addEventListener("error", (e) => {
      e.target.src = coverFor(g);                   // remote cover unreachable
      $(".panel__credit", root)?.remove();
    });
    if (g.catalogue && !g.blurb) fetchSummary(g);

    loadSpecs().then((all) => {
      if (game !== g) return;                    // the panel moved on while we waited
      const slot = $("[data-specs]", root);
      if (slot) slot.innerHTML = specsMarkup(all[g.id]);
    });

    bindNote();
  }

  function bindNote() {
    const note = $("[data-note]", root);
    if (!note) return;
    const g = game;
    const save = debounce((value) => store.setNote(g.id, value), 400);    // one write per pause, not per keystroke
    note.addEventListener("input", () => save(note.value));
  }

  root.addEventListener("click", (e) => {
    const el = e.target.closest("[data-close],[data-save],[data-status],[data-rate],[data-go]");
    if (!el || !game) return;
    if (el.dataset.close !== undefined) onClose();
    else if (el.dataset.save !== undefined) store.toggle(game.id);
    else if (el.dataset.status) store.setStatus(game.id, el.dataset.status);
    else if (el.dataset.rate !== undefined) store.setRating(game.id, Number(el.dataset.rate));
    else if (el.dataset.go) {
      const next = resolve(el.dataset.go);
      if (next) onSelect(next);
    }
  });

  document.addEventListener("game-summary", (e) => {
    if (game && e.detail === game.id) {
      const el = $("[data-blurb]", root);
      if (el) el.textContent = game.blurb;
    }
  });

  // Which control had focus, so clicking a star does not drop the user back to
  // the top of the document when the block is rebuilt around them.
  function focusKey(el) {
    if (!el) return null;
    if (el.dataset.status) return `[data-status="${el.dataset.status}"]`;
    if (el.dataset.rate !== undefined) return `[data-rate="${el.dataset.rate}"]`;
    if (el.dataset.save !== undefined) return "[data-save]";
    return null;
  }

  return {
    open(next) { game = next; render(); },
    close() { game = null; root.hidden = true; root.textContent = ""; },
    current: () => game,
    /**
     * The saved list changed under us. Only the save/status/rating block
     * depends on it, so the artwork, the facts, the requirements table and the
     * recommendations below are all left alone.
     */
    refresh() {
      if (!game) return;
      if (document.activeElement?.dataset?.note !== undefined) return;   // mid-edit, leave it
      const host = $("[data-list-host]", root);
      if (!host) return;
      const key = host.contains(document.activeElement) ? focusKey(document.activeElement) : null;
      host.innerHTML = listControls(game);
      if (key) ($(key, host) || $("[data-save]", host))?.focus({ preventScroll: true });
      bindNote();
    }
  };
}
