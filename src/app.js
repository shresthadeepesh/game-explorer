// App shell: loads the dataset, owns filter state, drives the timeline.

import { CATEGORIES } from "./categories.js";
import { iconSprite, artFor, coverFor } from "./art.js";
import { Timeline } from "./timeline.js";
import * as store from "./store.js";
import { mountMyList } from "./mylist.js";

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  data: null,
  categories: new Set(),   // empty = all
  query: "",
  listOnly: false,
  selected: null,
  years: []
};

let timeline;
let myList;
const ui = {};

async function boot() {
  document.body.insertAdjacentHTML("afterbegin", iconSprite());
  const res = await fetch("data/games.json", { cache: "force-cache" });
  state.data = await res.json();

  cacheRefs();
  readUrlFilters();
  renderFilters();
  await store.init();

  timeline = new Timeline(ui.stageHost, { onSelect: select, onFrame: onFrame });

  myList = mountMyList({
    root: ui.mylist,
    games: state.data.games,
    onSelect: (game) => { jumpTo(game); select(game); },
    onListOnlyChange: (on) => { state.listOnly = on; applyFilters(); }
  });
  if (state.listOnly) myList.setListOnly(true);

  // saved state drives the node markers, the header count and the list-only view
  store.subscribe(() => {
    const saved = new Set(store.ids());
    ui.listCount.textContent = saved.size;
    timeline.markSaved(saved);
    if (state.selected) syncSaveButton();
    if (state.listOnly) applyFilters();
  });

  applyFilters();

  const deep = new URLSearchParams(location.hash.slice(1)).get("game");
  if (deep) {
    const g = state.data.games.find((x) => x.id === deep);
    if (g) { timeline.jumpToYear(Math.max(0, state.years.findIndex((y) => y.year === g.year))); select(g); }
  }

  ui.boot.remove();
}

function cacheRefs() {
  ui.stageHost = $("#stage-host");
  ui.filters = $("#filters");
  ui.search = $("#search");
  ui.range = $("#range");
  ui.total = $("#total");
  ui.rail = $("#rail");
  ui.readout = $("#readout");
  ui.progress = $("#progress");
  ui.panel = $("#panel");
  ui.empty = $("#empty");
  ui.boot = $("#boot");
  ui.mylist = $("#mylist");
  ui.listCount = $("#list-count");

  $("#open-list").addEventListener("click", () => myList.toggleOpen());

  ui.search.addEventListener("input", () => {
    state.query = ui.search.value.trim().toLowerCase();
    applyFilters();
  });
  $("#clear").addEventListener("click", resetFilters);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { ui.search.blur(); if (myList.isOpen()) myList.setOpen(false); else close(); }
    if (e.target.matches("input")) return;
    if (e.key === "l" || e.key === "L") myList.toggleOpen();
    if ((e.key === "a" || e.key === "A") && state.selected) store.toggle(state.selected.id);
    if (e.key === "/") { e.preventDefault(); ui.search.focus(); }
    if (e.key === "ArrowDown" || e.key === "PageDown") timeline.nudge(1);
    if (e.key === "ArrowUp" || e.key === "PageUp") timeline.nudge(-1);
    if (e.key === "Home") timeline.scrollToYear(0);
    if (e.key === "End") timeline.scrollToYear(state.years.length - 1);
  });
}

// ?cat=rpg,horror&q=souls — shareable filter state.
function readUrlFilters() {
  const params = new URLSearchParams(location.search);
  const cats = (params.get("cat") || "").split(",").filter((k) => k in CATEGORIES);
  for (const k of cats) state.categories.add(k);
  state.listOnly = params.get("list") === "1";
  state.query = (params.get("q") || "").trim().toLowerCase();
  ui.search.value = params.get("q") || "";
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.categories.size) params.set("cat", [...state.categories].join(","));
  if (state.query) params.set("q", state.query);
  if (state.listOnly) params.set("list", "1");
  const qs = params.toString();
  history.replaceState(null, "", (qs ? `?${qs}` : location.pathname) + location.hash);
}

function renderFilters() {
  const frag = document.createDocumentFragment();
  for (const [key, cat] of Object.entries(state.data.categories)) {
    if (!cat.count) continue;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.dataset.cat = key;
    b.style.setProperty("--chip-color", cat.color);
    b.innerHTML = `<svg class="chip__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-${key}"/></svg><span>${cat.label}</span><b>${cat.count}</b>`;
    if (state.categories.has(key)) b.classList.add("is-on");
    b.addEventListener("click", () => toggleCategory(key, b));
    frag.appendChild(b);
  }
  ui.filters.appendChild(frag);
}

function toggleCategory(key, btn) {
  if (state.categories.has(key)) state.categories.delete(key);
  else state.categories.add(key);
  btn.classList.toggle("is-on", state.categories.has(key));
  applyFilters();
}

function resetFilters() {
  state.categories.clear();
  state.query = "";
  if (state.listOnly) myList.setListOnly(false);
  state.listOnly = false;
  ui.search.value = "";
  for (const c of ui.filters.children) c.classList.remove("is-on");
  applyFilters();
}

function applyFilters() {
  const { categories, query, listOnly } = state;
  const all = state.data.games;
  const saved = listOnly ? new Set(store.ids()) : null;
  const matched = (categories.size || query || saved)
    ? all.filter((g) =>
        (!categories.size || categories.has(g.category)) &&
        (!query || g.search.includes(query)) &&
        (!saved || saved.has(g.id)))
    : all;

  const byYear = new Map();
  for (const g of matched) {
    let row = byYear.get(g.year);
    if (!row) { row = []; byYear.set(g.year, row); }
    row.push(g);
  }
  state.years = [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, games]) => ({ year, games }));

  syncUrl();
  ui.total.textContent = matched.length;
  ui.range.textContent = state.years.length
    ? `${state.years[0].year}\u2013${state.years[state.years.length - 1].year}`
    : `${state.data.yearRange[0]}\u2013${state.data.yearRange[1]}`;
  ui.empty.hidden = matched.length > 0;
  renderRail();
  timeline.setData(state.years);
  if (state.selected && !matched.includes(state.selected)) close();
}

function renderRail() {
  ui.rail.textContent = "";
  const frag = document.createDocumentFragment();
  state.years.forEach((row, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "rail__item";
    item.title = String(row.year);
    item.innerHTML = `<span class="rail__label">${row.year}</span><span class="rail__tick"></span>`;
    item.addEventListener("click", () => timeline.scrollToYear(i));
    frag.appendChild(item);
  });
  ui.rail.appendChild(frag);
  ui.railItems = [...ui.rail.children];
  ui.activeRail = null;
}

function onFrame({ nearest, progress, year }) {
  if (year != null && ui.readout.textContent !== String(year)) ui.readout.textContent = year;
  ui.progress.style.transform = `scaleX(${progress.toFixed(3)})`;
  const next = ui.railItems?.[nearest];
  if (next !== ui.activeRail) {
    ui.activeRail?.classList.remove("is-on");
    next?.classList.add("is-on");
    ui.activeRail = next;
  }
}

function select(game) {
  state.selected = game;
  const c = CATEGORIES[game.category];
  ui.panel.hidden = false;
  document.body.classList.add("has-panel");
  ui.panel.style.setProperty("--panel-color", game.color);
  ui.panel.innerHTML = `
    <div class="panel__top">
      <span class="panel__meta">${game.year} / ${String(game.rank).padStart(2, "0")}</span>
      <button type="button" class="panel__close" id="close" aria-label="Close">✕</button>
    </div>
    <img class="panel__art" src="${artFor(game)}" alt="${game.title} key art" decoding="async">
    ${game.imageCredit ? `<p class="panel__credit">Cover: ${game.imageCredit}</p>` : ""}
    <div>
      <h2 class="panel__title">${game.title}</h2>
      <p class="panel__genre">
        <svg class="panel__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-${game.category}"/></svg>
        ${c.label} · ${game.genre}
      </p>
    </div>
    <p class="panel__blurb">${game.blurb}</p>
    <button type="button" class="panel__save" id="save"></button>
    <nav class="panel__links">
      <a href="${game.wiki}" target="_blank" rel="noopener"><span>Wikipedia · what it is</span><span>↗</span></a>
      <a href="${game.guide}" target="_blank" rel="noopener"><span>StrategyWiki · how to play</span><span>↗</span></a>
      <a href="${game.trailer}" target="_blank" rel="noopener"><span>Watch trailer</span><span>↗</span></a>
    </nav>
    <p class="panel__hint">SELECT ANOTHER NODE TO COMPARE.<br>ESC CLOSES THIS PANEL.</p>`;
  $("#close", ui.panel).addEventListener("click", close);
  $("#save", ui.panel).addEventListener("click", () => store.toggle(game.id));
  syncSaveButton();
  $(".panel__art", ui.panel).addEventListener("error", (e) => {
    e.target.src = coverFor(game);                              // remote cover unreachable
    $(".panel__credit", ui.panel)?.remove();
  });
  history.replaceState(null, "", location.pathname + location.search + `#game=${game.id}`);
}

function syncSaveButton() {
  const btn = $("#save", ui.panel);
  if (!btn || !state.selected) return;
  const saved = store.has(state.selected.id);
  btn.classList.toggle("is-saved", saved);
  btn.textContent = saved ? "✓ In my list" : "+ Add to my list";
}

function jumpTo(game) {
  const i = state.years.findIndex((y) => y.year === game.year);
  if (i >= 0) timeline.scrollToYear(i);
}

function close() {
  if (!state.selected) return;
  state.selected = null;
  ui.panel.hidden = true;
  document.body.classList.remove("has-panel");
  ui.panel.textContent = "";
  history.replaceState(null, "", location.pathname + location.search);  // drop the #game hash
}

boot();
