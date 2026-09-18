// Small helpers shared across modules. Everything here is pure and free of DOM
// state, so it is safe to import from node (the data scripts and unit tests do).

/** querySelector, scoped. */
export const $ = (sel, root = document) => root.querySelector(sel);

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const ESCAPE_RE = /[&<>"]/g;

/** Escapes text for interpolation into an HTML template string. */
export const esc = (s) => String(s).replace(ESCAPE_RE, (c) => ESCAPES[c]);

/**
 * FNV-1a over a string. Stable across runs, machines and reloads, which is why
 * procedural art seeds and catalogue jitter both use it.
 */
export function fnv32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The same hash mapped into [0, 1). */
export const fnvUnit = (text) => fnv32(text) / 4294967296;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 0 below `lo`, 1 above `hi`, linear between. */
export const ramp = (v, lo, hi) => clamp((v - lo) / (hi - lo), 0, 1);

/** Trailing-edge debounce; the returned function also carries `.cancel()`. */
export function debounce(fn, ms) {
  let timer;
  const run = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  run.cancel = () => clearTimeout(timer);
  return run;
}
