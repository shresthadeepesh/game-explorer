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

import { CATEGORIES, categoryFromGenres, colorOf } from "./categories.js";

const CATEGORY_KEYS = Object.keys(CATEGORIES);
const SECTOR = (Math.PI * 2) / CATEGORY_KEYS.length;
const INNER = 190;          // notable games orbit close to the axis
const OUTER = 1250;         // the long tail spreads out here
const HUB = 120;            // where a category's spoke starts

const hash = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h >>> 0) / 4294967296;
};

/** Screen-space placement for one catalogue entry, stable across reloads. */
function place(game, rank, count) {
  const category = game.category || categoryFromGenres(game.genres);
  const index = Math.max(0, CATEGORY_KEYS.indexOf(category));
  const jitter = hash(game.qid || game.id);
  const spread = 0.74;      // leave a gap between neighbouring category sectors
  const angle = (index + 0.5) * SECTOR + (jitter - 0.5) * SECTOR * spread;

  // rank 0 is the most linked-to game of its year; push the tail outward on a
  // curve so the crowded middle does not turn into a solid band
  const t = count > 1 ? rank / (count - 1) : 0;
  const radius = INNER + (OUTER - INNER) * Math.pow(t, 0.72);
  const wobble = (hash(`${game.qid}z`) - 0.5) * 220;

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.46,
    z: wobble,
    category,
    color: colorOf(category),
    angle,
    radius
  };
}

export class CatalogueGraph {
  constructor({ stage, spacing, camOffset, farFade, perspective = 1100 }) {
    this.spacing = spacing;
    this.camOffset = camOffset;
    this.farFade = farFade;
    this.perspective = perspective;
    this.years = [];                 // [{ year, points, loaded }]
    this.byYear = new Map();
    this.loading = new Set();
    this.visible = [];               // projected points of the current frame, for picking
    this.enabled = true;
    this.skip = new Set();           // qids already on screen as curated cards

    this.canvas = document.createElement("canvas");
    this.canvas.className = "catalogue";
    this.canvas.setAttribute("aria-hidden", "true");
    stage.prepend(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
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
    for (const [year, points] of this.byYear) this.byYear.set(year, points.filter((p) => !this.skip.has(p.game.qid)));
  }

  async load(year) {
    if (this.byYear.has(year) || this.loading.has(year)) return;
    this.loading.add(year);
    try {
      const res = await fetch(`data/catalog/${year}.json`);
      if (!res.ok) throw new Error(String(res.status));
      const { games } = await res.json();
      const points = games
        .map((game, rank) => ({ game, ...place(game, rank, games.length) }))
        .filter((point) => !this.skip.has(point.game.qid));
      this.byYear.set(year, points);
    } catch {
      this.byYear.set(year, []);       // a year with no catalogue file just shows the curated cards
    } finally {
      this.loading.delete(year);
    }
  }

  setEnabled(on) {
    this.enabled = on;
    this.canvas.hidden = !on;
    if (!on) this.visible = [];
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
    const oy = this.height * 0.46;
    const p = this.perspective;
    this.visible = [];

    this.labelCells = new Set();
    const first = Math.max(0, Math.floor(camZ / this.spacing) - 1);
    const last = Math.min(this.years.length - 1, Math.ceil((camZ + this.farFade) / this.spacing));
    for (let i = first; i <= last; i++) this.load(this.years[i]);

    for (let i = last; i >= first; i--) {          // far to near, so near points paint over far ones
      const points = this.byYear.get(this.years[i]);
      if (!points || !points.length) continue;

      const groupZ = -i * this.spacing;
      const dist = i * this.spacing - camZ;
      const near = Math.min(1, Math.max(0, dist / 260));
      const far = Math.min(1, Math.max(0, (this.farFade - dist) / 1550));
      const fade = near * far;
      if (fade < 0.02) continue;

      const labelBudget = i === nearestIndex ? 16 : 0;
      let labelled = 0;

      for (let n = 0; n < points.length; n++) {
        const point = points[n];
        const zEye = groupZ + point.z + camZ;
        if (zEye >= p - 1) continue;                // behind or level with the camera
        const scale = p / (p - zEye);
        const sx = ox + (point.x + px) * scale;
        const sy = oy + (point.y + py) * scale;
        if (sx < -80 || sx > this.width + 80 || sy < -80 || sy > this.height + 80) continue;

        const size = Math.max(0.6, 2.1 * scale);
        const alpha = fade * (0.28 + 0.72 * Math.min(1, point.radius < 420 ? 1 : 520 / point.radius));

        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = point.color;
        ctx.globalAlpha = alpha;
        ctx.fill();

        // spoke back to the category hub, which is what makes the corridors read
        if (scale > 0.55 && n % 3 === 0) {
          const hx = ox + (Math.cos(point.angle) * HUB + px) * scale;
          const hy = oy + (Math.sin(point.angle) * HUB * 0.46 + py) * scale;
          // a near point's spoke would otherwise rake right across the screen
          if (Math.hypot(sx - hx, sy - hy) > 430) continue;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(sx, sy);
          ctx.strokeStyle = point.color;
          ctx.globalAlpha = alpha * 0.055;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }

        this.visible.push({ point, sx, sy, size });

        // cards orbit at 400-470, so only label points clear of them
        if (labelled < labelBudget && point.radius > 560 && scale > 0.7) {
          const cell = `${Math.round(sx / 190)}:${Math.round(sy / 34)}`;
          if (!this.labelCells.has(cell)) {
            this.labelCells.add(cell);
            ctx.globalAlpha = Math.min(0.7, fade);
            ctx.fillStyle = "rgba(242,240,238,0.85)";
            ctx.font = `${Math.max(9, Math.min(12, 10.5 * scale))}px "JetBrains Mono", ui-monospace, monospace`;
            const title = point.game.title;
            ctx.fillText(title.length > 26 ? `${title.slice(0, 25)}…` : title, sx + size + 5, sy + 3);
            labelled++;
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Nearest catalogue point to a screen position, or null. */
  pick(x, y, tolerance = 14) {
    let best = null;
    let bestDist = tolerance * tolerance;
    for (const entry of this.visible) {
      const dx = entry.sx - x;
      const dy = entry.sy - y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = entry; }
    }
    return best ? best.point.game : null;
  }
}
