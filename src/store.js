// IndexedDB-backed "my list". One object store keyed by game id, mirrored in a
// memory cache so the UI can read it synchronously while writes go to disk.
// If IndexedDB is unavailable (private windows, blocked storage) the cache
// still works for the session and `isDegraded()` reports it.
//
// Schema
//   v1  { id, addedAt }
//   v2  { id, addedAt, updatedAt, status, rating, note }   status index added

const DB_NAME = "game-explorer";
const DB_VERSION = 2;
const STORE = "list";

export const STATUSES = ["backlog", "playing", "played"];
const DEFAULTS = { status: "backlog", rating: 0, note: "" };

let db = null;
let degraded = false;
const cache = new Map();          // id -> row
const listeners = new Set();

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

const normalise = (row) => ({ ...DEFAULTS, updatedAt: row.addedAt, ...row });

function openDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const store = event.oldVersion < 1
        ? req.result.createObjectStore(STORE, { keyPath: "id" })
        : req.transaction.objectStore(STORE);
      if (!store.indexNames.contains("addedAt")) store.createIndex("addedAt", "addedAt");
      if (!store.indexNames.contains("status")) store.createIndex("status", "status");
      if (event.oldVersion === 1) {
        // backfill the v2 fields on rows saved by v1
        store.openCursor().onsuccess = (e) => {
          const cursor = e.target.result;
          if (!cursor) return;
          cursor.update(normalise(cursor.value));
          cursor.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("indexedDB blocked"));
  });
}

function write(fn) {
  if (!db) return Promise.resolve();          // degraded: cache-only
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    fn(tx.objectStore(STORE));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function persist(fn) {
  try { await write(fn); } catch (err) { degraded = true; console.warn("list write failed:", err.message); }
}

/** Opens the database and fills the cache. Never throws — degrades instead. */
export async function init() {
  try {
    db = await openDb();
    const rows = await request(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
    for (const row of rows) cache.set(row.id, normalise(row));
  } catch (err) {
    degraded = true;
    console.warn("my list is session-only:", err.message);
  }
  emit();
}

const emit = () => { for (const fn of listeners) fn(entries()); };

export const subscribe = (fn) => { listeners.add(fn); fn(entries()); return () => listeners.delete(fn); };
export const isDegraded = () => degraded;
export const has = (id) => cache.has(id);
export const get = (id) => cache.get(id) || null;
export const size = () => cache.size;
export const ids = () => [...cache.keys()];
/** Newest first. */
export const entries = () => [...cache.values()].sort((a, b) => b.addedAt - a.addedAt);

export async function add(id, fields = {}) {
  if (cache.has(id)) return false;
  const now = Date.now();
  const row = { id, addedAt: now, updatedAt: now, ...DEFAULTS, ...fields };
  cache.set(id, row);
  emit();
  await persist((s) => s.put(row));
  return true;
}

export async function remove(id) {
  if (!cache.delete(id)) return false;
  emit();
  await persist((s) => s.delete(id));
  return true;
}

export const toggle = (id) => (cache.has(id) ? remove(id) : add(id));

/** Patches one entry; adds it first if it isn't on the list yet. */
export async function update(id, patch) {
  if (!cache.has(id)) return add(id, patch);
  const row = { ...cache.get(id), ...patch, updatedAt: Date.now() };
  cache.set(id, row);
  emit();
  await persist((s) => s.put(row));
  return true;
}

export const setStatus = (id, status) => update(id, { status: STATUSES.includes(status) ? status : "backlog" });
export const setRating = (id, rating) => update(id, { rating: Math.max(0, Math.min(5, Number(rating) || 0)) });
export const setNote = (id, note) => update(id, { note: String(note).slice(0, 500) });

export async function clear() {
  cache.clear();
  emit();
  await persist((s) => s.clear());
}

/** Portable snapshot for the export button and the share link. */
export const exportRows = () => ({ version: DB_VERSION, exportedAt: new Date().toISOString(), games: entries() });

/** Merges rows in; existing entries keep their own data unless `overwrite`. */
export async function importRows(rows, { overwrite = false } = {}) {
  let added = 0, updated = 0;
  for (const raw of rows) {
    if (!raw?.id || typeof raw.id !== "string") continue;
    const row = normalise({
      id: raw.id,
      addedAt: Number(raw.addedAt) || Date.now(),
      status: STATUSES.includes(raw.status) ? raw.status : "backlog",
      rating: Math.max(0, Math.min(5, Number(raw.rating) || 0)),
      note: typeof raw.note === "string" ? raw.note.slice(0, 500) : ""
    });
    if (cache.has(row.id)) {
      if (!overwrite) continue;
      updated++;
    } else added++;
    cache.set(row.id, row);
    await persist((s) => s.put(row));
  }
  emit();
  return { added, updated };
}
