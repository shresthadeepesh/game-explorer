#!/usr/bin/env node
// Draws assets/og.png, the 1200x630 card social platforms show when the site
// is shared.
//
//   node scripts/build-og.mjs          (or: npm run build:og)
//
// Written by hand into a PNG rather than rendered: the project has no image
// toolchain and no bundler, and pulling one in for a single static card would
// be the largest dependency in the repository. zlib ships with node, so all
// this needs is a deflate call and four chunk headers. Text comes from a 5x7
// bitmap font, which is why the card is uppercase.

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { CATEGORIES } from "../src/categories.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(ROOT, "data", "games.json"), "utf8"));

const W = 1200;
const H = 630;

// ------------------------------------------------------------------- 5x7 font

const GLYPHS = {
  A: "01110 10001 10001 11111 10001 10001 10001",
  B: "11110 10001 10001 11110 10001 10001 11110",
  C: "01110 10001 10000 10000 10000 10001 01110",
  D: "11110 10001 10001 10001 10001 10001 11110",
  E: "11111 10000 10000 11110 10000 10000 11111",
  F: "11111 10000 10000 11110 10000 10000 10000",
  G: "01110 10001 10000 10111 10001 10001 01110",
  H: "10001 10001 10001 11111 10001 10001 10001",
  I: "11111 00100 00100 00100 00100 00100 11111",
  J: "00111 00010 00010 00010 00010 10010 01100",
  K: "10001 10010 10100 11000 10100 10010 10001",
  L: "10000 10000 10000 10000 10000 10000 11111",
  M: "10001 11011 10101 10101 10001 10001 10001",
  N: "10001 11001 10101 10011 10001 10001 10001",
  O: "01110 10001 10001 10001 10001 10001 01110",
  P: "11110 10001 10001 11110 10000 10000 10000",
  Q: "01110 10001 10001 10001 10101 10011 01111",
  R: "11110 10001 10001 11110 10100 10010 10001",
  S: "01111 10000 10000 01110 00001 00001 11110",
  T: "11111 00100 00100 00100 00100 00100 00100",
  U: "10001 10001 10001 10001 10001 10001 01110",
  V: "10001 10001 10001 10001 10001 01010 00100",
  W: "10001 10001 10001 10101 10101 11011 10001",
  X: "10001 10001 01010 00100 01010 10001 10001",
  Y: "10001 10001 01010 00100 00100 00100 00100",
  Z: "11111 00001 00010 00100 01000 10000 11111",
  0: "01110 10001 10011 10101 11001 10001 01110",
  1: "00100 01100 00100 00100 00100 00100 01110",
  2: "01110 10001 00001 00010 00100 01000 11111",
  3: "11111 00010 00100 00010 00001 10001 01110",
  4: "00010 00110 01010 10010 11111 00010 00010",
  5: "11111 10000 11110 00001 00001 10001 01110",
  6: "00110 01000 10000 11110 10001 10001 01110",
  7: "11111 00001 00010 00100 01000 01000 01000",
  8: "01110 10001 10001 01110 10001 10001 01110",
  9: "01110 10001 10001 01111 00001 00010 01100",
  " ": "00000 00000 00000 00000 00000 00000 00000",
  "·": "00000 00000 01100 01100 00000 00000 00000",
  "-": "00000 00000 00000 11111 00000 00000 00000",
  "–": "00000 00000 00000 11111 00000 00000 00000",
  ",": "00000 00000 00000 00000 00110 00010 00100",
  ".": "00000 00000 00000 00000 00000 01100 01100"
};

const rowsOf = (char) => (GLYPHS[char.toUpperCase()] || GLYPHS[" "]).split(" ");

// --------------------------------------------------------------------- canvas

const pixels = new Uint8Array(W * H * 4);

function set(x, y, [r, g, b], alpha = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  if (alpha >= 1) {
    pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255;
    return;
  }
  // over the existing pixel, which is always opaque here
  pixels[i] = Math.round(pixels[i] * (1 - alpha) + r * alpha);
  pixels[i + 1] = Math.round(pixels[i + 1] * (1 - alpha) + g * alpha);
  pixels[i + 2] = Math.round(pixels[i + 2] * (1 - alpha) + b * alpha);
  pixels[i + 3] = 255;
}

const rect = (x, y, w, h, color, alpha = 1) => {
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, color, alpha);
};

const rgb = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Draws `text` with each bit of the 5x7 font blown up to `scale` pixels. */
function text(str, x, y, scale, color, tracking = scale) {
  let cursor = x;
  for (const char of str) {
    const rows = rowsOf(char);
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit === "1") rect(cursor + rx * scale, y + ry * scale, scale, scale, color);
      });
    });
    cursor += 5 * scale + tracking;
  }
  return cursor - tracking;
}

const textWidth = (str, scale, tracking = scale) => str.length * (5 * scale + tracking) - tracking;

// ----------------------------------------------------------------- the card

const BG = rgb("#08090c");
const INK = rgb("#e9ecf2");
const DIM = rgb("#9aa3b5");
const ACCENT = rgb("#ff5a36");

rect(0, 0, W, H, BG);

// A faint vertical rule per year, the timeline the app is built around.
const years = data.yearRange || [1990, 2025];
const span = years[1] - years[0];
for (let i = 0; i <= span; i++) {
  const x = Math.round(80 + (i * (W - 160)) / span);
  rect(x, 0, 1, H, INK, 0.07);
}

// Category swatches along the foot, in dataset order, widths by share.
const counts = new Map();
for (const game of data.games) counts.set(game.category, (counts.get(game.category) || 0) + 1);
let barX = 0;
for (const [key, count] of counts) {
  const w = Math.round((count / data.games.length) * W);
  rect(barX, H - 14, w, 14, rgb(CATEGORIES[key]?.color || "#ff5a36"));
  barX += w;
}
if (barX < W) rect(barX, H - 14, W - barX, 14, ACCENT);

// The mark: the shaft and solid head of the favicon's arrow.
const cx = 80;
const cy = 110;
const half = 30;
rect(cx, cy - 4, 50, 8, ACCENT);
for (let i = 0; i < half; i++) rect(cx + 50 + i, cy - (half - i), 1, 2 * (half - i), ACCENT);

text("A FIELD GUIDE TO", 80, 205, 9, DIM, 7);
text("GAMES", 80, 285, 20, INK, 16);

const foot = `${data.count} LANDMARK GAMES · ${years[0]}–${years[1]}`;
rect(80, 460, textWidth(foot, 6, 5), 2, ACCENT, 0.6);
text(foot, 80, 492, 6, DIM, 5);

// -------------------------------------------------------------- PNG encoding

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

const crc32 = (buf) => {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "latin1"), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8;    // bit depth
ihdr[9] = 6;    // truecolour with alpha
// 10-12: deflate, adaptive filtering, no interlace — all zero

// Each scanline is prefixed with its filter type; 0 is "store as is".
const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  Buffer.from(pixels.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);

mkdirSync(join(ROOT, "assets"), { recursive: true });
const out = join(ROOT, "assets", "og.png");
writeFileSync(out, png);
console.log(`wrote ${out} (${W}x${H}, ${(png.length / 1024).toFixed(1)} kB)`);
