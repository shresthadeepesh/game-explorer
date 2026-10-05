// Procedural key art. Every game gets a deterministic poster derived from its
// seed + category colour, so the timeline has real images with zero network
// requests. Drop a file at assets/covers/<id>.jpg and rebuild the data to
// override any of them with real key art.

import { CATEGORIES, ICON_PATHS } from "./categories.js";

const cache = new Map();

// mulberry32 — small, fast, deterministic.
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const mix = (hex, amount) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);
  return `rgb(${r},${g},${b})`;
};

const W = 300;
const H = 400;

function shapes(rand, color) {
  const out = [];
  const kind = Math.floor(rand() * 4);
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const o = (0.08 + rand() * 0.16).toFixed(3);
    if (kind === 0) {
      const cx = rand() * W, cy = rand() * H, r = 40 + rand() * 120;
      out.push(`<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="${color}" stroke-width="${(1 + rand() * 2).toFixed(1)}" opacity="${o}"/>`);
    } else if (kind === 1) {
      const x = rand() * W, y = rand() * H, s = 60 + rand() * 140;
      out.push(`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${s.toFixed(0)}" height="${s.toFixed(0)}" fill="${color}" opacity="${o}" transform="rotate(${(rand() * 60 - 30).toFixed(1)} ${x.toFixed(0)} ${y.toFixed(0)})"/>`);
    } else if (kind === 2) {
      const y = rand() * H;
      out.push(`<path d="M0 ${y.toFixed(0)} L${W} ${(y + rand() * 120 - 60).toFixed(0)}" stroke="${color}" stroke-width="${(1 + rand() * 6).toFixed(1)}" opacity="${o}"/>`);
    } else {
      const x = rand() * W, y = rand() * H, s = 70 + rand() * 120;
      out.push(`<path d="M${x.toFixed(0)} ${y.toFixed(0)} l${s.toFixed(0)} ${(s * 0.6).toFixed(0)} l${(-s * 0.7).toFixed(0)} ${(s * 0.5).toFixed(0)} Z" fill="${color}" opacity="${o}"/>`);
    }
  }
  return out.join("");
}

/** Data-URI SVG poster for a game. Cached by id. */
export function coverFor(game) {
  const hit = cache.get(game.id);
  if (hit) return hit;

  const rand = rng(game.seed);
  const color = game.color || CATEGORIES.action.color;
  const angle = Math.floor(rand() * 360);
  const icon = ICON_PATHS[game.category] || ICON_PATHS.action;
  const initials = game.title.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const gradId = `g${game.seed.toString(36)}`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs><linearGradient id="${gradId}" gradientTransform="rotate(${angle} .5 .5)">` +
    `<stop offset="0" stop-color="${mix(color, 0.42)}"/><stop offset="1" stop-color="#0a0b0f"/></linearGradient>` +
    `<pattern id="p${gradId}" width="10" height="10" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">` +
    `<line x1="0" y1="0" x2="0" y2="10" stroke="${color}" stroke-width="1.2" opacity="0.10"/></pattern></defs>` +
    `<rect width="${W}" height="${H}" fill="${gradId ? `url(#${gradId})` : "#0a0b0f"}"/>` +
    `<rect width="${W}" height="${H}" fill="url(#p${gradId})"/>` +
    shapes(rand, color) +
    `<g opacity="0.9" transform="translate(${W / 2 - 44} ${H / 2 - 62}) scale(3.7)" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${icon}"/></g>` +
    `<text x="${W / 2}" y="${H - 44}" text-anchor="middle" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="46" font-weight="700" fill="#f2f0ee" opacity="0.92" letter-spacing="2">${initials}</text>` +
    `<text x="${W / 2}" y="${H - 20}" text-anchor="middle" font-family="'JetBrains Mono',ui-monospace,monospace" font-size="13" fill="${color}" letter-spacing="4">${game.year}</text>` +
    `</svg>`;

  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  cache.set(game.id, uri);
  return uri;
}

/** Real cover when we have one (local file first, then remote URL), else procedural. */
export const artFor = (game) => game.image || game.imageUrl || coverFor(game);

/** One <symbol> per category, injected once; nodes reference them with <use>. */
export function iconSprite() {
  const symbols = Object.keys(ICON_PATHS)
    .map((k) => `<symbol id="ic-${k}" viewBox="0 0 24 24"><path d="${ICON_PATHS[k]}"/></symbol>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${symbols}</svg>`;
}
