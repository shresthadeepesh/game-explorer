// The "my list" drawer: saved games plus recommendations derived from them.
//
// Rendering is driven by store subscriptions, so any add/remove anywhere in the
// app refreshes it — but only while the drawer is actually open. A closed drawer
// just marks itself stale, which keeps the recommendation pass off the critical
// path of every save made from the timeline or the list view.

import * as store from "./store.js";
import { artFor } from "./art.js";
import { recommend } from "./recommend.js";
import { trapFocus } from "./a11y.js";
import { esc } from "./util.js";

const SORTS = {
  added: { label: "Recently added", fn: (a, b) => b.row.addedAt - a.row.addedAt },
  rating: { label: "Rating", fn: (a, b) => b.row.rating - a.row.rating || b.row.addedAt - a.row.addedAt },
  status: { label: "Status", fn: (a, b) => store.STATUSES.indexOf(a.row.status) - store.STATUSES.indexOf(b.row.status) || b.row.addedAt - a.row.addedAt },
  year: { label: "Release year", fn: (a, b) => a.game.year - b.game.year },
  title: { label: "Title", fn: (a, b) => a.game.title.localeCompare(b.game.title) }
};

/** A shareable list is just the ids, base64url so it survives a URL bar. */
export const encodeShare = (ids) => btoa(ids.join(" ")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const decodeShare = (text) => {
  try {
    return atob(text.replace(/-/g, "+").replace(/_/g, "/")).split(" ").filter(Boolean);
  } catch { return []; }
};

/** One row, for both the saved list and the recommendation shelf. */
function row(game, { sub, marks = "", saved }) {
  return `<li class="drawer__row">
    <button type="button" class="drawer__rowmain" data-act="open" data-id="${esc(game.id)}">
      <img class="drawer__art" src="${artFor(game)}" alt="" loading="lazy" decoding="async">
      <span class="drawer__meta">
        <span class="drawer__name">${esc(game.title)}</span>
        <span class="drawer__sub" style="--row-color:${game.color}">${sub}</span>
        ${marks ? `<span class="drawer__marks">${marks}</span>` : ""}
      </span>
    </button>
    <button type="button" class="drawer__icon" data-act="${saved ? "remove" : "add"}" data-id="${esc(game.id)}"
      aria-label="${saved ? "Remove" : "Add"} ${esc(game.title)} ${saved ? "from" : "to"} my list">${saved ? "✕" : "+"}</button>
  </li>`;
}

const marksFor = (meta) =>
  `<span class="drawer__status" data-status="${meta.status}">${meta.status}</span>` +
  (meta.rating ? `<span class="drawer__rating">${"★".repeat(meta.rating)}</span>` : "") +
  (meta.note ? `<span class="drawer__hasnote" title="${esc(meta.note)}">note</span>` : "");

export function mountMyList({ root, games, onSelect, onListOnlyChange, resolve }) {
  root.innerHTML = `
    <div class="drawer__top">
      <div class="drawer__title">MY LIST <b data-count>0</b></div>
      <button type="button" class="drawer__close" data-close aria-label="Close my list">✕</button>
    </div>
    <div class="drawer__actions">
      <button type="button" class="drawer__action" data-only>Show only my list</button>
      <label class="drawer__sort">Sort
        <select data-sort>${Object.entries(SORTS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select>
      </label>
    </div>
    <div class="drawer__actions">
      <button type="button" class="drawer__action" data-share>Copy share link</button>
      <button type="button" class="drawer__action" data-export>Export</button>
      <button type="button" class="drawer__action" data-import>Import</button>
      <button type="button" class="drawer__action" data-clear>Clear</button>
      <input type="file" accept="application/json" data-file hidden>
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
  let sort = "added";
  let stale = true;

  root.querySelector("[data-close]").addEventListener("click", () => setOpen(false));
  root.querySelector("[data-clear]").addEventListener("click", () => {
    if (store.size() && confirm(`Remove all ${store.size()} games from your list?`)) store.clear();
  });
  el.only.addEventListener("click", () => setListOnly(!listOnly));
  root.querySelector("[data-sort]").addEventListener("change", (e) => { sort = e.target.value; render(); });
  root.querySelector("[data-share]").addEventListener("click", share);
  root.querySelector("[data-export]").addEventListener("click", exportFile);
  root.querySelector("[data-import]").addEventListener("click", () => root.querySelector("[data-file]").click());
  root.querySelector("[data-file]").addEventListener("change", importFile);

  // one delegated handler for both lists
  root.addEventListener("click", (e) => {
    const action = e.target.closest("[data-act]");
    if (!action) return;
    const { act, id } = action.dataset;
    if (act === "remove") store.remove(id);
    else if (act === "add") store.add(id);
    else if (act === "open") { const g = resolve(id); if (g) onSelect(g); }
  });

  function say(message) {
    el.note.hidden = false;
    el.note.textContent = message;
    clearTimeout(say.timer);
    say.timer = setTimeout(() => { if (!store.isDegraded()) el.note.hidden = true; }, 4000);
  }

  async function share() {
    if (!store.size()) return;
    const url = `${location.origin}${location.pathname}?share=${encodeShare(store.ids())}`;
    try {
      await navigator.clipboard.writeText(url);
      say(`Link to ${store.size()} games copied.`);
    } catch {
      prompt("Copy your share link:", url);          // clipboard blocked (http, permissions)
    }
  }

  function exportFile() {
    const blob = new Blob([JSON.stringify(store.exportRows(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `my-games-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const rows = Array.isArray(parsed) ? parsed : parsed.games;
      if (!Array.isArray(rows)) throw new Error("no games array");
      const { added, updated } = await store.importRows(rows);
      say(`Imported ${added} new, ${updated} updated.`);
    } catch (err) {
      say(`Could not read that file: ${err.message}`);
    }
  }

  function render() {
    stale = false;
    const rows = store.entries()
      .map((entry) => ({ row: entry, game: resolve(entry.id) }))
      .filter((r) => r.game)
      .sort(SORTS[sort].fn);

    el.count.textContent = rows.length;
    el.empty.hidden = rows.length > 0;
    el.items.innerHTML = rows
      .map(({ game, row: meta }) => row(game, {
        sub: `${game.year} · ${esc(game.genre)}`,
        marks: marksFor(meta),
        saved: true
      }))
      .join("");
    el.only.classList.toggle("is-on", listOnly);
    el.only.disabled = rows.length === 0;

    // the recommender only indexes the curated dataset, so catalogue saves are
    // not useful seeds
    const seeds = rows.map((r) => r.game).filter((g) => !g.catalogue).map((g) => g.id);
    const picks = recommend(games, seeds);
    el.recsWrap.hidden = picks.length === 0;
    el.recs.innerHTML = picks
      .map(({ game, reason }) => row(game, { sub: esc(reason), saved: false }))
      .join("");

    if (store.isDegraded()) {
      el.note.hidden = false;
      el.note.textContent = "Storage is blocked in this browser, so this list lasts only until you close the tab.";
    }
  }

  let releaseFocus = null;

  function setOpen(open) {
    if (open && stale) render();
    root.hidden = !open;
    document.body.classList.toggle("has-drawer", open);
    releaseFocus?.();
    releaseFocus = open ? trapFocus(root, { onEscape: () => setOpen(false) }) : null;
  }

  function setListOnly(next) {
    listOnly = next && store.size() > 0;
    el.only.classList.toggle("is-on", listOnly);
    onListOnlyChange(listOnly);
  }

  store.subscribe(() => {
    if (listOnly && store.size() === 0) setListOnly(false);
    if (root.hidden) stale = true;
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
