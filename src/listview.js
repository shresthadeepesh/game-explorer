// A plain list of the same data the timeline shows, for keyboard and screen
// reader users, small screens, and anyone who would rather read than fly.

import { artFor } from "./art.js";
import * as store from "./store.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function mountListView({ root, onSelect, loadYear, catalogueCounts }) {
  let years = [];
  const expanded = new Map();          // year -> extra games, once fetched

  function render() {
    const total = years.reduce((n, y) => n + y.games.length, 0);
    root.innerHTML = `
      <h1 class="listview__title">A field guide to games</h1>
      <p class="listview__lede">${total} games${years.length ? `, ${years[0].year} to ${years[years.length - 1].year}` : ""}. The same entries as the timeline, as text.</p>
      ${years.map((row) => `
        <section class="listview__year" aria-labelledby="y-${row.year}">
          <h2 class="listview__heading" id="y-${row.year}">${row.year}</h2>
          <ul class="listview__games">
            ${[...row.games, ...(expanded.get(row.year) || [])].map((game) => `
              <li class="listview__game">
                <img class="listview__art" src="${artFor(game)}" alt="" loading="lazy" decoding="async">
                <div class="listview__body">
                  <h3 class="listview__name">
                    <button type="button" data-open="${game.id}">${esc(game.title)}</button>
                  </h3>
                  <p class="listview__meta" style="--row-color:${game.color}">
                    ${esc(game.categoryLabel)}${game.genre === game.categoryLabel ? "" : ` · ${esc(game.genre)}`}${game.developers?.length ? ` · ${esc(game.developers[0])}` : ""}${game.platforms?.length ? ` · ${game.platforms.map(esc).join(", ")}` : ""}
                  </p>
                  <p class="listview__blurb">${esc(game.blurb)}</p>
                  <p class="listview__links">
                    <a href="${game.wiki}" target="_blank" rel="noopener">Wikipedia</a>
                    <a href="${game.guide}" target="_blank" rel="noopener">How to play</a>
                    <a href="${game.trailer}" target="_blank" rel="noopener">Trailer</a>
                    <button type="button" class="listview__save ${store.has(game.id) ? "is-saved" : ""}" data-save="${game.id}">
                      ${store.has(game.id) ? "✓ In my list" : "+ Add to my list"}
                    </button>
                  </p>
                </div>
              </li>`).join("")}
          </ul>
          ${moreControl(row.year)}
        </section>`).join("")}
      ${total ? "" : `<p class="listview__lede">Nothing matches the current filters.</p>`}`;
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
      const pool = years.flatMap((y) => [...y.games, ...(expanded.get(y.year) || [])]);
      const game = pool.find((g) => g.id === open.dataset.open);
      if (game) onSelect(game);
      return;
    }
    const save = e.target.closest("[data-save]");
    if (save) store.toggle(save.dataset.save);
  });

  store.subscribe(() => { if (!root.hidden) render(); });

  return {
    setData(next) { years = next; if (!root.hidden) render(); },
    setVisible(on) {
      root.hidden = !on;
      document.body.classList.toggle("is-listview", on);
      if (on) render();
    },
    isVisible: () => !root.hidden
  };
}
