// App shell: loads the dataset, owns filter state, drives the timeline.

import { CATEGORIES } from "./categories.js";
import { iconSprite } from "./art.js";
import { Timeline } from "./timeline.js";
import * as store from "./store.js";
import { mountMyList, decodeShare } from "./mylist.js";
import { mountPanel } from "./panel.js";
import { mountListView } from "./listview.js";
import { trapFocus, announce } from "./a11y.js";

const $ = (sel, root = document) => root.querySelector(sel);

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
let listView;
let releasePanelFocus = null;
let releaseDrawerFocus = null;
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

  panel = mountPanel({
    root: ui.panel,
    games: state.data.games,
    onSelect: (game) => { jumpTo(game); select(game); },
    onClose: close
  });

  listView = mountListView({ root: ui.listview, onSelect: (game) => { jumpTo(game); select(game); } });
  if (new URLSearchParams(location.search).get("view") === "list") setView(true);

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
    panel.refresh();
    if (state.listOnly) applyFilters();
  });

  applyFilters();

  await offerSharedList();

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
  ui.listview = $("#listview");
  ui.listCount = $("#list-count");
  ui.viewToggle = $("#view-toggle");

  $("#open-list").addEventListener("click", () => myList.toggleOpen());
  ui.viewToggle.addEventListener("click", () => setView(!listView.isVisible()));
  $("[data-skip]").addEventListener("click", (e) => { e.preventDefault(); setView(true); ui.listview.focus(); });

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
  state.share = params.get("share") || "";        // syncUrl() drops unknown params, so keep it now
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
    const params = new URLSearchParams(location.search);
    params.delete("share");
    const qs = params.toString();
    history.replaceState(null, "", (qs ? `?${qs}` : location.pathname) + location.hash);
  };
  bar.querySelector("[data-yes]").addEventListener("click", async () => {
    await store.importRows(ids.map((id) => ({ id })));
    done();
    myList.setOpen(true);
  });
  bar.querySelector("[data-no]").addEventListener("click", done);
}

function setView(asList) {
  listView.setVisible(asList);
  ui.viewToggle.textContent = asList ? "TIMELINE" : "LIST VIEW";
  ui.viewToggle.setAttribute("aria-pressed", String(asList));
  const params = new URLSearchParams(location.search);
  asList ? params.set("view", "list") : params.delete("view");
  const qs = params.toString();
  history.replaceState(null, "", (qs ? `?${qs}` : location.pathname) + location.hash);
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
  listView?.setData(state.years);
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
  history.replaceState(null, "", location.pathname + location.search + `#game=${game.id}`);
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
  history.replaceState(null, "", location.pathname + location.search);  // drop the #game hash
}

boot();

// Offline shell + cached covers. Never registers from file://, and a failure
// here must not take the app down.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("service worker:", err.message));
  });
}
