#!/usr/bin/env node
// End-to-end smoke test over the Chrome DevTools Protocol. Covers the parts a
// DOM dump cannot reach: IndexedDB writes, persistence across a reload, the
// my-list drawer and the recommendations it derives.
//
//   npm start            # in another shell
//   npm run smoke
//
// CHROME_PATH overrides the browser binary.

import { spawn } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:4173";
const CANDIDATES = [
  process.env.CHROME_PATH,
  join(process.env.HOME || "", ".cache/puppeteer/chrome-headless-shell/mac_arm-131.0.6778.204/chrome-headless-shell-mac-arm64/chrome-headless-shell"),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome"
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) { console.error("no chrome binary found; set CHROME_PATH"); process.exit(1); }

const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "ge-smoke-"));

const chrome = spawn(CHROME, [
  "--headless", "--disable-gpu", "--no-first-run", "--mute-audio",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"
], { stdio: "ignore" });

let ws, nextId = 1, sessionId = null;
const pending = new Map();

const send = (method, params = {}, useSession = true) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, ...(useSession && sessionId ? { sessionId } : {}) }));
});

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const { webSocketDebuggerUrl } = await res.json();
      ws = new WebSocket(webSocketDebuggerUrl);
      await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("ws")); });
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
        }
      };
      return;
    } catch { await sleep(250); }
  }
  throw new Error("could not attach to chrome");
}

/** Runs an async function in the page and returns its JSON value. */
async function evaluate(fn, ...args) {
  const expression = `(async () => { try { return JSON.stringify((await (${fn})(${args.map((a) => JSON.stringify(a)).join(", ")})) ?? null); }
    catch (err) { return JSON.stringify({ __error: err.message }); } })()`;
  const { result } = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  const value = JSON.parse(result.value);
  if (value && value.__error) throw new Error(`page: ${value.__error}`);
  return value;
}

const waitFor = (fn, label, tries = 40) => (async () => {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(fn)) return true;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${label}`);
})();

const checks = [];
const check = (name, pass, detail = "") => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  await connect();
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, false);
  ({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }, false));
  await send("Page.enable");
  await send("Runtime.enable");

  const go = async (url) => {
    // a hash-only change is a same-document navigation and would not re-boot the app
    await send("Page.navigate", { url: "about:blank" });
    await sleep(150);
    await send("Page.navigate", { url });
    await sleep(600);
    await waitFor(() => !document.querySelector("#boot"), "app boot");
  };

  await go(BASE);
  check("app boots", true);

  // drive the real store module the app is using
  const saved = await evaluate(async () => {
    const store = await import("/src/store.js");
    for (const id of ["elden-ring-2022", "dark-souls-2011", "hollow-knight-2017"]) await store.add(id);
    await new Promise((r) => setTimeout(r, 150));
    return { size: store.size(), degraded: store.isDegraded(), count: document.querySelector("#list-count").textContent };
  });
  check("adds persist to the store", saved.size === 3 && saved.count === "3", JSON.stringify(saved));
  check("indexedDB is in use", saved.degraded === false);

  // only years near the camera are mounted, so jump to one of the saved games first
  await go(`${BASE}#game=elden-ring-2022`);
  const marked = await evaluate(async () => {
    await new Promise((r) => setTimeout(r, 400));
    return {
      nodes: document.querySelectorAll(".node.is-saved").length,
      button: document.querySelector("[data-save]")?.textContent.trim(),
      pressed: document.querySelector("[data-save]")?.classList.contains("is-saved")
    };
  });
  check("saved games are marked on the timeline", marked.nodes > 0, `${marked.nodes} nodes`);
  check("panel reflects saved state", marked.pressed === true, marked.button || "no button");

  const toggled = await evaluate(async () => {
    document.querySelector("[data-save]").click();
    await new Promise((r) => setTimeout(r, 200));
    const off = document.querySelector("[data-save]").classList.contains("is-saved");
    document.querySelector("[data-save]").click();
    await new Promise((r) => setTimeout(r, 200));
    return { off, on: document.querySelector("[data-save]").classList.contains("is-saved"), count: document.querySelector("#list-count").textContent };
  });
  check("panel button toggles both ways", toggled.off === false && toggled.on === true, JSON.stringify(toggled));

  const drawer = await evaluate(async () => {
    document.querySelector("#open-list").click();
    await new Promise((r) => setTimeout(r, 100));
    const rows = document.querySelectorAll("#mylist .drawer__items .drawer__row").length;
    const recs = [...document.querySelectorAll("#mylist .drawer__recs .drawer__row .drawer__name")].map((n) => n.textContent);
    const reasons = [...document.querySelectorAll("#mylist .drawer__recs .drawer__sub")].map((n) => n.textContent);
    return { open: !document.querySelector("#mylist").hidden, rows, recs, reasons };
  });
  check("drawer lists saved games", drawer.open && drawer.rows === 3, `${drawer.rows} rows`);
  check("recommendations are generated", drawer.recs.length > 0, drawer.recs.slice(0, 4).join(", "));
  check("recommendations exclude saved games", !drawer.recs.some((t) => ["Elden Ring", "Dark Souls", "Hollow Knight"].includes(t)));
  check("recommendations explain themselves", drawer.reasons.every(Boolean), drawer.reasons[0] || "");

  const onlyList = await evaluate(async () => {
    document.querySelector("#mylist [data-only]").click();
    await new Promise((r) => setTimeout(r, 200));
    return { total: document.querySelector("#total").textContent, url: location.search };
  });
  check("list-only filter narrows the timeline", onlyList.total === "3", `total=${onlyList.total} ${onlyList.url}`);
  check("list-only is in the URL", onlyList.url.includes("list=1"));

  await go(BASE);
  const afterReload = await evaluate(async () => {
    const store = await import("/src/store.js");
    return { size: store.size(), count: document.querySelector("#list-count").textContent };
  });
  check("list survives a reload", afterReload.size === 3 && afterReload.count === "3", JSON.stringify(afterReload));

  // ---- filters, search and deep links ----

  await go(`${BASE}?cat=horror`);
  const filtered = await evaluate(() => ({
    total: document.querySelector("#total").textContent,
    range: document.querySelector("#range").textContent,
    on: document.querySelector('.chip[data-cat="horror"]')?.classList.contains("is-on")
  }));
  check("category deep link filters and marks its chip", filtered.total === "8" && filtered.on === true, JSON.stringify(filtered));

  await go(BASE);
  const searched = await evaluate(async () => {
    const input = document.querySelector("#search");
    input.value = "fromsoftware";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 200));
    return { total: document.querySelector("#total").textContent, url: location.search };
  });
  check("search reaches enriched fields", Number(searched.total) >= 3, `fromsoftware -> ${searched.total}`);
  check("search is in the URL", searched.url.includes("q=fromsoftware"), searched.url);
  check("search cleared the category filter view", !searched.url.includes("cat="), searched.url);

  await go(`${BASE}#game=portal-2007`);
  const deep = await evaluate(() => ({
    title: document.querySelector(".panel__title")?.textContent,
    facts: [...document.querySelectorAll(".panel__facts dt")].map((n) => n.textContent),
    similar: [...document.querySelectorAll(".similar__name")].map((n) => n.textContent)
  }));
  check("deep link opens the panel", deep.title === "Portal", deep.title || "none");
  check("panel shows enriched facts", deep.facts.includes("Released") && deep.facts.some((f) => f.startsWith("Developer")), deep.facts.join(", "));
  check("panel recommends similar games", deep.similar.length === 3, deep.similar.join(", "));

  const chained = await evaluate(async () => {
    document.querySelector(".similar__item").click();
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector(".panel__title")?.textContent;
  });
  check("a similar game opens in place", chained && chained !== "Portal", chained || "none");

  // ---- list view ----

  await go(`${BASE}?view=list`);
  const list = await evaluate(() => ({
    games: document.querySelectorAll(".listview__game").length,
    years: document.querySelectorAll(".listview__year").length,
    hiddenStage: getComputedStyle(document.querySelector(".stage")).display
  }));
  check("list view renders every game", list.games === 216 && list.years === 36, JSON.stringify(list));
  check("list view replaces the 3D stage", list.hiddenStage === "none");

  await go(BASE);
  const inert = await evaluate(async () => {
    await new Promise((r) => setTimeout(r, 500));
    const groups = [...document.querySelectorAll(".year-group")];
    return { total: groups.length, inert: groups.filter((g) => g.inert).length };
  });
  check("faded years are kept out of the tab order", inert.inert > 0 && inert.inert < inert.total, JSON.stringify(inert));

  // ---- share links ----

  const shared = await evaluate(async () => {
    const store = await import("/src/store.js");
    const { encodeShare, decodeShare } = await import("/src/mylist.js");
    await store.clear();
    await store.add("celeste-2018");
    const token = encodeShare(store.ids());
    return { token, roundTrip: decodeShare(token) };
  });
  check("share tokens round-trip", shared.roundTrip.includes("celeste-2018"), shared.token);

  await go(`${BASE}?share=${shared.token}`);
  const offered = await evaluate(async () => {
    await new Promise((r) => setTimeout(r, 300));
    const bar = document.querySelector(".sharebar");
    bar?.querySelector("[data-yes]")?.click();
    await new Promise((r) => setTimeout(r, 300));
    const store = await import("/src/store.js");
    return { offered: Boolean(bar), size: store.size(), url: location.search };
  });
  check("a shared list is offered, not forced", offered.offered === true);
  check("accepting a shared list merges it", offered.size >= 1 && !offered.url.includes("share="), JSON.stringify(offered));

  // ---- offline shell ----

  const sw = await evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return { registered: false };
    await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    return { registered: true, caches: keys };
  });
  check("service worker registers and precaches", sw.registered === true && sw.caches?.length > 0, JSON.stringify(sw));

  const cleared = await evaluate(async () => {
    const store = await import("/src/store.js");
    await store.clear();
    await new Promise((r) => setTimeout(r, 150));
    return { size: store.size(), count: document.querySelector("#list-count").textContent };
  });
  check("clear empties the list", cleared.size === 0 && cleared.count === "0");
} catch (err) {
  check("run completed", false, err.message);
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
}

const failed = checks.filter((c) => !c.pass).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
