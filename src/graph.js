// The catalogue layer: every game Wikidata knows about for a year, drawn as a
// spatial graph on a canvas behind the curated cards.
//
// Position carries meaning. Depth is the release year, the angle around the
// axis is the category — so a genre reads as a corridor running through the
// decades — and the radius is notability, which puts the games everyone has
// heard of near the axis and the long tail out at the edges.
//
// 28k nodes cannot be DOM, and they do not need to be: only the years inside
// the camera's depth window are drawn, which is a couple of thousand points a
// frame, projected with the same maths the CSS perspective uses so the canvas
// and the cards agree.
//
// Two things keep that affordable at 60fps. A point's colour and its opacity
// both follow from values fixed when the year loads, so points are pre-grouped
// into (colour, opacity) buckets and a whole bucket is drawn as one path with a
// single fill — roughly a hundred canvas state changes per frame instead of
// several thousand. And the projected positions the picker needs are written
// into flat arrays that get refilled rather than rebuilt, so a frame allocates
// nothing and the GC stays out of the way.

import { CATEGORIES, categoryFromGenres, colorOf } from "./categories.js";
import { loadYear, peekYear, isRequested } from "./catalog.js";
import { fnvUnit, ramp } from "./util.js";

const CATEGORY_KEYS = Object.keys(CATEGORIES);
const SECTOR = (Math.PI * 2) / CATEGORY_KEYS.length;
const TAU = Math.PI * 2;
const INNER = 190;          // notable games orbit close to the axis
const OUTER = 1250;         // the long tail spreads out here
const HUB = 120;            // where a category's spoke starts
const SPREAD = 0.74;        // gap left between neighbouring category sectors
const FLATTEN = 0.46;       // the axis is drawn as an ellipse, not a circle
const HORIZON = 0.46;       // screen origin, matching the stage's perspective-origin

const NEAR_FADE = 260;
const FAR_TAIL = 1550;
const CULL = 80;            // screen margin before a point is skipped
const SPOKE_EVERY = 3;      // only every nth point gets a spoke, or it turns to mush
const SPOKE_MIN_SCALE = 0.55;
const SPOKE_MAX_LEN = 430;  // a near point's spoke would otherwise rake across the screen
const LABEL_BUDGET = 16;
const LABEL_MIN_RADIUS = 560;   // cards orbit at 400-470, so only label points clear of them
const LABEL_MIN_SCALE = 0.7;

// Opacity is quantised so that points sharing a colour also share a fill, which
// is what makes bucketing possible at all. A point's weight only ever lands in
// [0.58, 1], so 16 steps leaves at most 0.033 of error on a 2px dot — invisible
// — while keeping buckets large enough to be worth batching. Finer steps split
// the buckets faster than they improve the picture.
const ALPHA_STEPS = 16;

/** Screen-space placement for one catalogue entry, stable across reloads. */
function place(game, rank, count) {
  const category = game.category || categoryFromGenres(game.genres);
  const index = Math.max(0, CATEGORY_KEYS.indexOf(category));
  const jitter = fnvUnit(game.qid || game.id);
  const angle = (index + 0.5) * SECTOR + (jitter - 0.5) * SECTOR * SPREAD;

  // rank 0 is the most linked-to game of its year; push the tail outward on a
  // curve so the crowded middle does not turn into a solid band
  const t = count > 1 ? rank / (count - 1) : 0;
  const radius = INNER + (OUTER - INNER) * Math.pow(t, 0.72);
  const wobble = (fnvUnit(`${game.qid}z`) - 0.5) * 220;

  // fixed per point: how opaque it is before the year's own fade is applied
  const weight = 0.28 + 0.72 * Math.min(1, radius < 420 ? 1 : 520 / radius);

  return {
    game,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * FLATTEN,
    z: wobble,
    hubX: Math.cos(angle) * HUB,
    hubY: Math.sin(angle) * HUB * FLATTEN,
    category,
    color: colorOf(category),
    angle,
    radius,
    weight,
    spoke: false          // set once the year is filtered, see buildYear
  };
}

/**
 * Projects a year's entries and groups them into draw buckets.
 * `skip` holds the qids already on screen as curated cards.
 */
function buildYear(entries, skip) {
  const total = entries.length;
  const points = [];
  for (let rank = 0; rank < total; rank++) {
    const entry = entries[rank];
    if (skip.has(entry.qid)) continue;
    points.push(place(entry, rank, total));
  }

  const buckets = new Map();
  for (let n = 0; n < points.length; n++) {
    const point = points[n];
    point.spoke = n % SPOKE_EVERY === 0;
    const step = Math.round(point.weight * (ALPHA_STEPS - 1));
    const key = `${point.color}|${step}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { color: point.color, alpha: step / (ALPHA_STEPS - 1), points: [] };
      buckets.set(key, bucket);
    }
    bucket.points.push(point);
  }

  return { points, buckets: [...buckets.values()] };
}

export class CatalogueGraph {
  constructor({ stage, spacing, camOffset, farFade, perspective = 1100 }) {
    this.spacing = spacing;
    this.camOffset = camOffset;
    this.farFade = farFade;
    this.perspective = perspective;
    this.years = [];                 // the years the timeline is showing, in camera order
    this.byYear = new Map();         // year -> { points, buckets }
    this.enabled = true;
    this.skip = new Set();           // qids already on screen as curated cards

    // Flat, reused picking buffers: refilled every frame, never reallocated
    // unless the frame is denser than any before it.
    this.hitX = new Float32Array(0);
    this.hitY = new Float32Array(0);
    this.hitPoint = [];
    this.hitCount = 0;

    this.spokeBuf = new Float32Array(0);
    this.labels = [];                // {text, x, y, size, alpha}, reused
    this.labelCells = new Set();

    this.canvas = document.createElement("canvas");
    this.canvas.className = "catalogue";
    this.canvas.setAttribute("aria-hidden", "true");
    stage.prepend(this.canvas);
    this.ctx = this.canvas.getContext("2d", { alpha: true });
    this.resize();

    // Resizing reallocates the backing store, so coalesce bursts of events.
    this.onResize = () => {
      cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.resize());
    };
    window.addEventListener("resize", this.onResize);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** The years the timeline is showing, in camera order. */
  setYears(years) {
    this.years = years.map((y) => y.year);
  }

  /** Curated games already have a card, so their catalogue point is dropped. */
  setCurated(games) {
    this.skip = new Set(games.map((g) => g.wikidata).filter(Boolean));
    for (const year of [...this.byYear.keys()]) {
      const entries = peekYear(year);
      if (entries) this.byYear.set(year, buildYear(entries, this.skip));
    }
  }

  /** Makes sure a year is on its way in, without allocating on repeat calls. */
  #ensure(year) {
    if (this.byYear.has(year)) return;
    const ready = peekYear(year);
    if (ready) { this.byYear.set(year, buildYear(ready, this.skip)); return; }
    if (isRequested(year)) return;                 // in flight; picked up on a later frame
    loadYear(year).then((entries) => {
      if (!this.byYear.has(year)) this.byYear.set(year, buildYear(entries, this.skip));
    });
  }

  #growHits(need) {
    if (need <= this.hitX.length) return;
    const size = Math.max(1024, need * 2);
    const x = new Float32Array(size), y = new Float32Array(size);
    x.set(this.hitX); y.set(this.hitY);       // a grow mid-frame must keep this frame's hits
    this.hitX = x; this.hitY = y;
  }

  setEnabled(on) {
    this.enabled = on;
    this.canvas.hidden = !on;
    if (!on) this.hitCount = 0;
  }

  /**
   * Draws the window around the camera. `camZ`, `px` and `py` come straight
   * from the timeline so both layers share one camera.
   */
  draw({ camZ, px, py, nearestIndex }) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const ox = this.width / 2;
    const oy = this.height * HORIZON;
    const p = this.perspective;
    const maxX = this.width + CULL;
    const maxY = this.height + CULL;

    this.hitCount = 0;
    this.labelCells.clear();

    const first = Math.max(0, Math.floor(camZ / this.spacing) - 1);
    const last = Math.min(this.years.length - 1, Math.ceil((camZ + this.farFade) / this.spacing));
    for (let i = first; i <= last; i++) this.#ensure(this.years[i]);

    for (let i = last; i >= first; i--) {          // far to near, so near points paint over far ones
      const year = this.byYear.get(this.years[i]);
      if (!year || !year.points.length) continue;

      const groupZ = -i * this.spacing;
      const dist = i * this.spacing - camZ;
      const fade = ramp(dist, 0, NEAR_FADE) * ramp(this.farFade - dist, 0, FAR_TAIL);
      if (fade < 0.02) continue;

      // Labels are collected while projecting and painted after the year's
      // points, so one fillStyle covers all of them.
      const labelBudget = i === nearestIndex ? LABEL_BUDGET : 0;
      let labelled = 0;

      const buckets = year.buckets;
      for (let b = 0; b < buckets.length; b++) {
        const bucket = buckets[b];
        const alpha = fade * bucket.alpha;
        if (alpha < 0.01) continue;

        const points = bucket.points;
        this.#growHits(this.hitCount + points.length);
        const hitX = this.hitX, hitY = this.hitY;

        let spokes = 0;
        if (this.spokeBuf.length < points.length * 4) {
          this.spokeBuf = new Float32Array(Math.max(512, points.length * 8));
        }
        const spokeBuf = this.spokeBuf;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = bucket.color;
        ctx.beginPath();

        for (let n = 0; n < points.length; n++) {
          const point = points[n];
          const zEye = groupZ + point.z + camZ;
          if (zEye >= p - 1) continue;             // behind or level with the camera
          const scale = p / (p - zEye);
          const sx = ox + (point.x + px) * scale;
          if (sx < -CULL || sx > maxX) continue;
          const sy = oy + (point.y + py) * scale;
          if (sy < -CULL || sy > maxY) continue;

          const size = Math.max(0.6, 2.1 * scale);
          ctx.moveTo(sx + size, sy);               // break the path, or arcs join up
          ctx.arc(sx, sy, size, 0, TAU);

          const h = this.hitCount++;
          hitX[h] = sx; hitY[h] = sy;
          this.hitPoint[h] = point;

          // spoke back to the category hub, which is what makes the corridors read
          if (point.spoke && scale > SPOKE_MIN_SCALE) {
            const hx = ox + (point.hubX + px) * scale;
            const hy = oy + (point.hubY + py) * scale;
            if (Math.hypot(sx - hx, sy - hy) <= SPOKE_MAX_LEN) {
              const s = spokes++ * 4;
              spokeBuf[s] = hx; spokeBuf[s + 1] = hy; spokeBuf[s + 2] = sx; spokeBuf[s + 3] = sy;
            }
          }

          if (labelled < labelBudget && point.radius > LABEL_MIN_RADIUS && scale > LABEL_MIN_SCALE) {
            const cell = (Math.round(sx / 190) + 512) * 4096 + Math.round(sy / 34) + 512;
            if (!this.labelCells.has(cell)) {
              this.labelCells.add(cell);
              const slot = this.labels[labelled] || (this.labels[labelled] = {});
              slot.point = point;
              slot.x = sx + size + 5;
              slot.y = sy + 3;
              slot.size = Math.round(Math.max(9, Math.min(12, 10.5 * scale)));
              labelled++;
            }
          }
        }

        ctx.fill();

        if (spokes) {
          ctx.beginPath();
          for (let s = 0; s < spokes * 4; s += 4) {
            ctx.moveTo(spokeBuf[s], spokeBuf[s + 1]);
            ctx.lineTo(spokeBuf[s + 2], spokeBuf[s + 3]);
          }
          ctx.globalAlpha = alpha * 0.055;
          ctx.strokeStyle = bucket.color;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }

      if (labelled) this.#drawLabels(labelled, Math.min(0.7, fade));
    }

    ctx.globalAlpha = 1;
  }

  #drawLabels(count, alpha) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(242,240,238,0.85)";
    let font = 0;
    for (let i = 0; i < count; i++) {
      const slot = this.labels[i];
      if (slot.size !== font) {
        font = slot.size;
        ctx.font = `${font}px "JetBrains Mono", ui-monospace, monospace`;
      }
      const title = slot.point.game.title;
      ctx.fillText(title.length > 26 ? `${title.slice(0, 25)}…` : title, slot.x, slot.y);
    }
  }

  /** Nearest catalogue point to a screen position, or null. */
  pick(x, y, tolerance = 14) {
    let best = -1;
    let bestDist = tolerance * tolerance;
    for (let i = 0; i < this.hitCount; i++) {
      const dx = this.hitX[i] - x;
      const dy = this.hitY[i] - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best < 0 ? null : this.hitPoint[best].game;
  }

  destroy() {
    window.removeEventListener("resize", this.onResize);
    cancelAnimationFrame(this.resizeFrame);
  }
}
