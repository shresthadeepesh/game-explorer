// The "my list" drawer: saved games plus recommendations derived from them.
// Rendering is driven by store subscriptions, so any add/remove anywhere in the
// app refreshes it.

import * as store from "./store.js";
import { artFor } from "./art.js";
import { recommend } from "./recommend.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function mountMyList({ root, games, onSelect, onListOnlyChange }) {
  const byId = new Map(games.map((g) => [g.id, g]));

  root.innerHTML = `
    <div class="drawer__top">
      <div class="drawer__title">MY LIST <b data-count>0</b></div>
      <button type="button" class="drawer__close" data-close aria-label="Close my list">✕</button>
    </div>
    <div class="drawer__actions">
      <button type="button" class="drawer__action" data-only>Show only my list</button>
      <button type="button" class="drawer__action" data-clear>Clear</button>
    </div>
    <div class="drawer__empty" data-empty>
      Open any game and choose <b>Add to my list</b>. Saved games stay in this browser.
    </div>
    <ul class="drawer__items" data-items></ul>
    <div class="drawer__section" data-recs-wrap hidden>
      <h2 class="drawer__heading">Recommended for you</h2>
      <ul class="drawer__recs" data-recs></ul>
    </div>
    <p class="drawer__note" data-note hidden></p>`;

  const el = {
    count: root.querySelector("[data-count]"),
    items: root.querySelector("[data-items]"),
    recs: root.querySelector("[data-recs]"),
    recsWrap: root.querySelector("[data-recs-wrap]"),
    empty: root.querySelector("[data-empty]"),
    only: root.querySelector("[data-only]"),
    note: root.querySelector("[data-note]")
  };

  let listOnly = false;

  root.querySelector("[data-close]").addEventListener("click", () => setOpen(false));
  root.querySelector("[data-clear]").addEventListener("click", () => {
    if (store.size() && confirm(`Remove all ${store.size()} games from your list?`)) store.clear();
  });
  el.only.addEventListener("click", () => setListOnly(!listOnly));

  // one delegated handler for both lists
  root.addEventListener("click", (e) => {
    const action = e.target.closest("[data-act]");
    if (!action) return;
    const { act, id } = action.dataset;
    if (act === "remove") store.remove(id);
    else if (act === "add") store.add(id);
    else if (act === "open") { const g = byId.get(id); if (g) onSelect(g); }
  });

  function row(game, { saved }) {
    return `<li class="drawer__row">
      <button type="button" class="drawer__rowmain" data-act="open" data-id="${game.id}">
        <img class="drawer__art" src="${artFor(game)}" alt="" loading="lazy" decoding="async">
        <span class="drawer__meta">
          <span class="drawer__name">${esc(game.title)}</span>
          <span class="drawer__sub" style="--row-color:${game.color}">${game.year} · ${esc(game.genre)}</span>
        </span>
      </button>
      <button type="button" class="drawer__icon" data-act="${saved ? "remove" : "add"}" data-id="${game.id}"
        aria-label="${saved ? "Remove from" : "Add to"} my list">${saved ? "✕" : "+"}</button>
    </li>`;
  }

  function render() {
    const saved = store.entries().map((e) => byId.get(e.id)).filter(Boolean);
    el.count.textContent = saved.length;
    el.empty.hidden = saved.length > 0;
    el.items.innerHTML = saved.map((g) => row(g, { saved: true })).join("");
    el.only.classList.toggle("is-on", listOnly);
    el.only.disabled = saved.length === 0;

    const picks = recommend(games, saved.map((g) => g.id));
    el.recsWrap.hidden = picks.length === 0;
    el.recs.innerHTML = picks.map(({ game, reason }) => `<li class="drawer__row">
      <button type="button" class="drawer__rowmain" data-act="open" data-id="${game.id}">
        <img class="drawer__art" src="${artFor(game)}" alt="" loading="lazy" decoding="async">
        <span class="drawer__meta">
          <span class="drawer__name">${esc(game.title)}</span>
          <span class="drawer__sub" style="--row-color:${game.color}">${esc(reason)}</span>
        </span>
      </button>
      <button type="button" class="drawer__icon" data-act="add" data-id="${game.id}" aria-label="Add ${esc(game.title)} to my list">+</button>
    </li>`).join("");

    if (store.isDegraded()) {
      el.note.hidden = false;
      el.note.textContent = "Storage is blocked in this browser, so this list lasts only until you close the tab.";
    }
  }

  function setOpen(open) {
    root.hidden = !open;
    document.body.classList.toggle("has-drawer", open);
  }

  function setListOnly(next) {
    listOnly = next && store.size() > 0;
    el.only.classList.toggle("is-on", listOnly);
    onListOnlyChange(listOnly);
  }

  store.subscribe(() => {
    if (listOnly && store.size() === 0) setListOnly(false);
    else render();
  });

  return {
    render,
    setOpen,
    isOpen: () => !root.hidden,
    toggleOpen: () => setOpen(root.hidden),
    setListOnly,
    isListOnly: () => listOnly
  };
}
