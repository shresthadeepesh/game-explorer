// App shell: loads the dataset, owns filter state, drives the timeline.

import { CATEGORIES } from "./categories.js";
import { iconSprite } from "./art.js";
import { Timeline, SPACING, CAM_OFFSET, FAR_FADE } from "./timeline.js";
import { CatalogueGraph } from "./graph.js";
import * as store from "./store.js";
import * as catalog from "./catalog.js";
import { mountMyList, decodeShare } from "./mylist.js";
import { mountPanel } from "./panel.js";
import { mountListView } from "./listview.js";
import { trapFocus, announce } from "./a11y.js";
import { $, debounce } from "./util.js";
import { patchUrl, replaceUrl, setGameHash, queryParam, hashParam } from "./url.js";

const state = {
  data: null,
  categories: new Set(),   // empty = all
  query: "",
  listOnly: false,
  share: "",
  selected: null,
  years: []
};

let timeline;
let myList;
let panel;
let graph;
let listView;
let releasePanelFocus = null;
const ui = {};

async function boot() {
  document.body.insertAdjacentHTML("afterbegin", iconSprite());
  const res = await fetch("data/games.json", { cache: "force-cache" });
  state.data = await res.json();
  catalog.register(state.data.games);

  cacheRefs();
  readUrlFilters();
  renderFilters();
  await store.init();

  timeline = new Timeline(ui.stageHost, {
    onSelect: select,
    onFrame,
    onCamera: (camera) => graph?.draw(camera)
  });

  graph = new CatalogueGraph({
    stage: timeline.stage,
    spacing: SPACING,
    camOffset: CAM_OFFSET,
    farFade: FAR_FADE
  });
  graph.setCurated(state.data.games);
  setCatalogue(queryParam("catalogue") !== "0", { silent: true });
  timeline.onBackgroundClick = (e) => {
    const hit = graph.pick(e.clientX, e.clientY);
    if (hit) select(catalog.fromCatalogue(hit));
  };

  panel = mountPanel({
    root: ui.panel,
    games: state.data.games,
    resolve: catalog.resolve,
    onSelect: (game) => { jumpTo(game); select(game); },
    onClose: close
  });

  const catalogueIndex = await fetch("data/catalog/index.json")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  const catalogueCounts = Object.fromEntries((catalogueIndex?.years || []).map((y) => [y.year, y.count]));
  if (catalogueIndex) ui.catalogueTotal.textContent = catalogueIndex.total.toLocaleString();

  // the timeline's own curated entries are already listed, so drop their twins
  const curatedQids = new Set(state.data.games.map((g) => g.wikidata).filter(Boolean));

  listView = mountListView({
    root: ui.listview,
    resolve: catalog.resolve,
    onSelect: (game) => { jumpTo(game); select(game); },
    catalogueCounts,
    loadYear: async (year) => (await catalog.loadYear(year))
      .filter((entry) => !curatedQids.has(entry.qid))
      .map(catalog.fromCatalogue)
  });
  if (queryParam("view") === "list") setView(true);

  myList = mountMyList({
    root: ui.mylist,
    games: state.data.games,
    resolve: catalog.resolve,
    onSelect: (game) => { jumpTo(game); select(game); },
    onListOnlyChange: (on) => { state.listOnly = on; applyFilters(); }
  });
  if (state.listOnly) myList.setListOnly(true);

  // saved state drives the node markers, the header count and the list-only view
  store.subscribe(() => {
    const saved = store.idSet();
    ui.listCount.textContent = saved.size;
    timeline.markSaved(saved);
    panel.refresh();
    if (state.listOnly) applyFilters();
  });

  applyFilters();

  await offerSharedList();

  const deep = hashParam("game");
  if (deep) {
    const g = catalog.resolve(deep);
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
  ui.listview = $("#listview");
  ui.listCount = $("#list-count");
  ui.viewToggle = $("#view-toggle");
  ui.catalogueToggle = $("#catalogue-toggle");
  ui.catalogueTotal = $("#catalogue-total");

  $("#open-list").addEventListener("click", () => myList.toggleOpen());
  ui.viewToggle.addEventListener("click", () => setView(!listView.isVisible()));
  ui.catalogueToggle.addEventListener("click", () => setCatalogue(!graph.enabled));
  $("[data-skip]").addEventListener("click", (e) => { e.preventDefault(); setView(true); ui.listview.focus(); });

  // Every keystroke otherwise refilters, rebuilds the rail, rebinds the whole
  // timeline pool and re-renders the list view. One pass per pause instead.
  const runSearch = debounce(applyFilters, 120);
  ui.search.addEventListener("input", () => {
    state.query = ui.search.value.trim().toLowerCase();
    runSearch();
  });
  $("#clear").addEventListener("click", resetFilters);

  // delegated once, so re-rendering the chips or the rail costs no listeners
  ui.filters.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-cat]");
    if (chip) toggleCategory(chip.dataset.cat, chip);
  });
  ui.rail.addEventListener("click", (e) => {
    const item = e.target.closest("[data-index]");
    if (item) timeline.scrollToYear(Number(item.dataset.index));
  });

  window.addEventListener("keydown", onKeyDown);
}

function onKeyDown(e) {
  if (e.key === "Escape") { ui.search.blur(); if (myList.isOpen()) myList.setOpen(false); else close(); }
  if (e.target.matches("input")) return;
  if (e.key === "l" || e.key === "L") myList.toggleOpen();
  if ((e.key === "a" || e.key === "A") && state.selected) store.toggle(state.selected.id);
  if (e.key === "/") { e.preventDefault(); ui.search.focus(); }
  if (e.key === "ArrowDown" || e.key === "PageDown") timeline.nudge(1);
  if (e.key === "ArrowUp" || e.key === "PageUp") timeline.nudge(-1);
  if (e.key === "Home") timeline.scrollToYear(0);
  if (e.key === "End") timeline.scrollToYear(state.years.length - 1);
}

// ?cat=rpg,horror&q=souls — shareable filter state.
function readUrlFilters() {
  const params = new URLSearchParams(location.search);
  const cats = (params.get("cat") || "").split(",").filter((k) => k in CATEGORIES);
  for (const k of cats) state.categories.add(k);
  state.listOnly = params.get("list") === "1";
  state.share = params.get("share") || "";        // syncUrl() drops unknown params, so keep it now
  state.query = (params.get("q") || "").trim().toLowerCase();
  ui.search.value = params.get("q") || "";
}

function syncUrl() {
  replaceUrl((params) => {
    if (state.categories.size) params.set("cat", [...state.categories].join(","));
    if (state.query) params.set("q", state.query);
    if (state.listOnly) params.set("list", "1");
    if (!graph?.enabled) params.set("catalogue", "0");
    if (listView?.isVisible()) params.set("view", "list");
  });
}

async function offerSharedList() {
  const token = state.share;
  if (!token) return;
  const known = new Set(state.data.games.map((g) => g.id));
  const ids = decodeShare(token).filter((id) => known.has(id));
  if (!ids.length) return;

  const fresh = ids.filter((id) => !store.has(id));
  const bar = document.createElement("div");
  bar.className = "sharebar";
  bar.innerHTML = `<span>Someone shared ${ids.length} games with you${fresh.length < ids.length ? ` (${fresh.length} new)` : ""}.</span>
    <button type="button" data-yes>Add to my list</button>
    <button type="button" data-no>Dismiss</button>`;
  document.body.appendChild(bar);

  const done = () => {
    bar.remove();
    state.share = "";
    patchUrl((params) => params.delete("share"));
  };
  bar.querySelector("[data-yes]").addEventListener("click", async () => {
    await store.importRows(ids.map((id) => ({ id })));
    done();
    myList.setOpen(true);
  });
  bar.querySelector("[data-no]").addEventListener("click", done);
}

function setCatalogue(on, { silent = false } = {}) {
  graph.setEnabled(on);
  ui.catalogueToggle.setAttribute("aria-pressed", String(on));
  ui.catalogueToggle.classList.toggle("is-off", !on);
  if (!silent) patchUrl((params) => (on ? params.delete("catalogue") : params.set("catalogue", "0")));
}

function setView(asList) {
  listView.setVisible(asList);
  ui.viewToggle.textContent = asList ? "TIMELINE" : "LIST VIEW";
  ui.viewToggle.setAttribute("aria-pressed", String(asList));
  patchUrl((params) => (asList ? params.set("view", "list") : params.delete("view")));
  announce(asList ? "List view" : "Timeline view", 0);
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
  const saved = listOnly ? store.idSet() : null;
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
  listView?.setData(state.years);
  graph?.setYears(state.years);
  ui.total.textContent = matched.length;
  ui.range.textContent = state.years.length
    ? `${state.years[0].year}–${state.years[state.years.length - 1].year}`
    : `${state.data.yearRange[0]}–${state.data.yearRange[1]}`;
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
    item.dataset.index = i;
    item.innerHTML = `<span class="rail__label">${row.year}</span><span class="rail__tick"></span>`;
    frag.appendChild(item);
  });
  ui.rail.appendChild(frag);
  ui.railItems = [...ui.rail.children];
  ui.activeRail = null;
}

function onFrame({ nearest, progress, year }) {
  if (year != null && ui.readout.textContent !== String(year)) {
    ui.readout.textContent = year;
    announce(`${year}, ${state.years[nearest]?.games.length ?? 0} games`);
  }
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
  document.body.classList.add("has-panel");
  panel.open(game);
  releasePanelFocus?.();
  releasePanelFocus = trapFocus(ui.panel, { onEscape: close });
  setGameHash(game.id);
}

function jumpTo(game) {
  const i = state.years.findIndex((y) => y.year === game.year);
  if (i >= 0) timeline.scrollToYear(i);
}

function close() {
  if (!state.selected) return;
  state.selected = null;
  document.body.classList.remove("has-panel");
  releasePanelFocus?.();
  releasePanelFocus = null;
  panel.close();
  setGameHash(null);                                // drop the #game hash
}

boot();

// Offline shell + cached covers. Never registers from file://, and a failure
// here must not take the app down.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("service worker:", err.message));
  });
}
