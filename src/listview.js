// A plain list of the same data the timeline shows, for keyboard and screen
// reader users, small screens, and anyone who would rather read than fly.
//
// Rendering is the expensive part — an expanded year is several hundred rows,
// each with a generated poster — so it happens only when the data or the filters
// actually change. A save toggled anywhere in the app patches the affected
// buttons in place instead of rebuilding the list, and changes that arrive while
// the view is hidden are deferred until it is shown again.

import { artFor } from "./art.js";
import * as store from "./store.js";
import { esc } from "./util.js";

const SAVED_LABEL = "✓ In my list";
const UNSAVED_LABEL = "+ Add to my list";

// 1x1 transparent gif: a poster slot that has not been drawn yet, rather than a
// broken-image icon.
const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

export function mountListView({ root, onSelect, resolve, loadYear, catalogueCounts }) {
  let years = [];
  const expanded = new Map();          // year -> extra games, once fetched
  let stale = true;                    // data changed while hidden; re-render on show

  // A catalogue entry has no cover file, so its poster is generated — about
  // 2.3KB of data: URI each. Expanding a busy year is six hundred of them, so
  // they are drawn as they scroll into reach instead of all at once.
  const posters = typeof IntersectionObserver === "function"
    ? new IntersectionObserver((rows) => {
        for (const row of rows) {
          if (!row.isIntersecting) continue;
          drawPoster(row.target);
          posters.unobserve(row.target);
        }
      }, { rootMargin: "500px" })
    : null;

  function drawPoster(img) {
    const game = resolve(img.dataset.art);
    img.removeAttribute("data-art");
    if (game) img.src = artFor(game);
  }

  function schedulePosters() {
    const pending = root.querySelectorAll("[data-art]");
    if (!posters) { for (const img of pending) drawPoster(img); return; }
    posters.disconnect();
    for (const img of pending) posters.observe(img);
  }

  function gameRow(game) {
    const saved = store.has(game.id);
    const cover = game.image || game.imageUrl;      // a real file is just a url; a poster is not
    return `<li class="listview__game">
      <img class="listview__art" src="${cover || BLANK}"${cover ? "" : ` data-art="${esc(game.id)}"`} alt="" loading="lazy" decoding="async">
      <div class="listview__body">
        <h3 class="listview__name">
          <button type="button" data-open="${esc(game.id)}">${esc(game.title)}</button>
        </h3>
        <p class="listview__meta" style="--row-color:${game.color}">
          ${esc(game.categoryLabel)}${game.genre === game.categoryLabel ? "" : ` · ${esc(game.genre)}`}${game.developers?.length ? ` · ${esc(game.developers[0])}` : ""}${game.platforms?.length ? ` · ${game.platforms.map(esc).join(", ")}` : ""}
        </p>
        <p class="listview__blurb">${esc(game.blurb)}</p>
        <p class="listview__links">
          <a href="${game.wiki}" target="_blank" rel="noopener">Wikipedia</a>
          <a href="${game.guide}" target="_blank" rel="noopener">How to play</a>
          <a href="${game.trailer}" target="_blank" rel="noopener">Trailer</a>
          <button type="button" class="listview__save ${saved ? "is-saved" : ""}" data-save="${esc(game.id)}">
            ${saved ? SAVED_LABEL : UNSAVED_LABEL}
          </button>
        </p>
      </div>
    </li>`;
  }

  function render() {
    stale = false;
    const total = years.reduce((n, y) => n + y.games.length, 0);
    root.innerHTML = `
      <h1 class="listview__title">A field guide to games</h1>
      <p class="listview__lede">${total} games${years.length ? `, ${years[0].year} to ${years[years.length - 1].year}` : ""}. The same entries as the timeline, as text.</p>
      ${years.map((row) => `
        <section class="listview__year" aria-labelledby="y-${row.year}">
          <h2 class="listview__heading" id="y-${row.year}">${row.year}</h2>
          <ul class="listview__games">
            ${row.games.map(gameRow).join("")}${(expanded.get(row.year) || []).map(gameRow).join("")}
          </ul>
          ${moreControl(row.year)}
        </section>`).join("")}
      ${total ? "" : `<p class="listview__lede">Nothing matches the current filters.</p>`}`;
    schedulePosters();
  }

  /** A save toggled elsewhere only ever changes these buttons. */
  function syncSaved() {
    for (const btn of root.querySelectorAll("[data-save]")) {
      const saved = store.has(btn.dataset.save);
      if (btn.classList.contains("is-saved") === saved) continue;
      btn.classList.toggle("is-saved", saved);
      btn.textContent = saved ? SAVED_LABEL : UNSAVED_LABEL;
    }
  }

  function moreControl(year) {
    const total = catalogueCounts?.[year];
    if (!total) return "";
    if (expanded.has(year)) return `<p class="listview__more">All ${total} games released in ${year}.</p>`;
    return `<p class="listview__more"><button type="button" data-more="${year}">Show all ${total} games from ${year}</button></p>`;
  }

  root.addEventListener("click", async (e) => {
    const more = e.target.closest("[data-more]");
    if (more) {
      const year = Number(more.dataset.more);
      more.disabled = true;
      more.textContent = `Loading ${catalogueCounts[year]} games…`;
      expanded.set(year, await loadYear(year));
      render();
      document.getElementById(`y-${year}`)?.scrollIntoView({ block: "start" });
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) {
      const game = resolve(open.dataset.open);       // the registry knows curated and catalogue alike
      if (game) onSelect(game);
      return;
    }
    const save = e.target.closest("[data-save]");
    if (save) store.toggle(save.dataset.save);
  });

  store.subscribe(() => {
    if (root.hidden) stale = true;
    else syncSaved();
  });

  return {
    setData(next) {
      years = next;
      if (root.hidden) stale = true;
      else render();
    },
    setVisible(on) {
      root.hidden = !on;
      document.body.classList.toggle("is-listview", on);
      if (on && stale) render();
      else if (on) syncSaved();
    },
    isVisible: () => !root.hidden
  };
}
