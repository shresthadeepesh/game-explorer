// Every URL write in the app is the same shape: mutate the query string, keep
// the hash, and never push a history entry — filters and view toggles are state,
// not navigation. This is that one place.

/**
 * Applies `mutate` to the current query params and replaces the URL.
 * @param {(params: URLSearchParams) => void} mutate
 */
export function patchUrl(mutate) {
  const params = new URLSearchParams(location.search);
  mutate(params);
  writeUrl(params);
}

/** Replaces the whole query string, dropping any param `build` does not set. */
export function replaceUrl(build) {
  const params = new URLSearchParams();
  build(params);
  writeUrl(params);
}

function writeUrl(params) {
  const qs = params.toString();
  history.replaceState(null, "", (qs ? `?${qs}` : location.pathname) + location.hash);
}

/** Sets or clears the `#game=` deep link without touching the query string. */
export function setGameHash(id) {
  history.replaceState(null, "", location.pathname + location.search + (id ? `#game=${id}` : ""));
}

export const queryParam = (name) => new URLSearchParams(location.search).get(name);
export const hashParam = (name) => new URLSearchParams(location.hash.slice(1)).get(name);
