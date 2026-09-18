// Virtualised 3D timeline.
//
// Only the year groups inside the camera's depth window exist in the DOM: a
// fixed pool of group elements is re-bound as the camera travels, so cost is
// O(visible) rather than O(dataset). Per frame the loop writes at most one
// transform on the world plus one opacity per pooled group, and every write is
// diffed against the last value it wrote.

import { artFor, coverFor } from "./art.js";

const SPACING = 1320;      // depth between years, px
const CAM_OFFSET = 380;    // how far in front of the camera the focused year sits
const NEAR_FADE = 260;
const FAR_FADE = 2300;
const POOL = 6;            // groups kept alive: depth window / SPACING + margin
const MAX_NODES = 10;      // node slots per group, reused across years
const ORBIT = 400;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const nodeMarkup = `
<div class="spoke" data-spoke></div>
<button class="node" type="button" data-node>
  <span class="node__card">
    <img class="node__art" alt="" decoding="async" loading="lazy" data-art>
    <span class="node__badge"><svg viewBox="0 0 24 24" aria-hidden="true"><use data-use/></svg></span>
  </span>
  <span class="node__title" data-title></span>
  <span class="node__genre" data-genre></span>
</button>`;

export class Timeline {
  constructor(root, { onSelect, onFrame } = {}) {
    this.root = root;
    this.onSelect = onSelect || (() => {});
    this.onFrame = onFrame || (() => {});
    this.years = [];
    this.z = 0;
    this.targetZ = 0;
    this.maxZ = 0;
    this.px = 0; this.py = 0; this.tx = 0; this.ty = 0;
    this.lastWorld = "";
    this.bound = new Map();   // yearIndex -> group record
    this.free = [];
    this.nearest = -1;
    this.drag = null;

    this.stage = document.createElement("div");
    this.stage.className = "stage";
    this.world = document.createElement("div");
    this.world.className = "world";
    this.stage.appendChild(this.world);
    root.appendChild(this.stage);

    for (let i = 0; i < POOL; i++) this.free.push(this.#makeGroup());

    this.#bindInput();
    this.running = true;
    this.lastT = performance.now();
    this.frame = requestAnimationFrame(this.#tick);
  }

  #makeGroup() {
    const el = document.createElement("div");
    el.className = "year-group";
    el.style.visibility = "hidden";
    const rule = document.createElement("div");
    rule.className = "year-rule";
    const label = document.createElement("div");
    label.className = "year-label";
    el.append(rule, label);

    const nodes = [];
    for (let i = 0; i < MAX_NODES; i++) {
      const holder = document.createElement("div");
      holder.className = "node-slot";
      holder.style.display = "none";
      holder.innerHTML = nodeMarkup;
      const btn = holder.querySelector("[data-node]");
      const rec = {
        holder,
        spoke: holder.querySelector("[data-spoke]"),
        btn,
        art: holder.querySelector("[data-art]"),
        use: holder.querySelector("[data-use]"),
        title: holder.querySelector("[data-title]"),
        genre: holder.querySelector("[data-genre]"),
        game: null
      };
      btn.addEventListener("click", () => rec.game && this.onSelect(rec.game));
      rec.art.addEventListener("error", () => { if (rec.game) rec.art.src = coverFor(rec.game); });
      nodes.push(rec);
      el.appendChild(holder);
    }
    this.world.appendChild(el);
    return { el, label, nodes, yearIndex: -1, opacity: -1 };
  }

  setData(years) {
    this.years = years;
    this.maxZ = Math.max(0, (years.length - 1) * SPACING);
    this.targetZ = Math.min(this.targetZ, this.maxZ);
    this.z = Math.min(this.z, this.maxZ);
    for (const [, g] of this.bound) this.#release(g);
    this.bound.clear();
    this.nearest = -1;
    this.#sync(this.z - CAM_OFFSET, true);
  }

  #release(g) {
    g.el.style.visibility = "hidden";
    g.yearIndex = -1;
    g.opacity = -1;
    this.free.push(g);
  }

  #bindGroup(g, index) {
    const row = this.years[index];
    g.yearIndex = index;
    g.el.style.transform = `translateZ(${-index * SPACING}px)`;
    g.label.textContent = row.year;

    const games = row.games;
    const per = Math.max(1, Math.min(MAX_NODES, games.length));
    for (let j = 0; j < MAX_NODES; j++) {
      const rec = g.nodes[j];
      const game = games[j];
      if (!game) {
        if (rec.game) { rec.holder.style.display = "none"; rec.game = null; }
        continue;
      }
      if (rec.game !== game) {
        rec.game = game;
        rec.holder.style.display = "";
        rec.title.textContent = game.title;
        rec.genre.textContent = game.genre;
        rec.btn.style.setProperty("--node-color", game.color);
        rec.btn.setAttribute("aria-label", `${game.title}, ${game.year}, ${game.genre}`);
        rec.use.setAttribute("href", `#ic-${game.category}`);
        rec.btn.classList.toggle("is-saved", Boolean(this.savedIds?.has(game.id)));
        const art = artFor(game);
        if (rec.art.getAttribute("src") !== art) rec.art.src = art;
      }
      const radius = ORBIT * (1 + Math.max(0, per - 4) * 0.12);   // keep cards apart as a year fills up
      const deg = (j * (360 / per) + 34 + index * 26) * Math.PI / 180;
      const x = Math.cos(deg) * radius;
      const y = Math.sin(deg) * radius * 0.46;
      const len = Math.hypot(x, y);
      rec.holder.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${((j % 3) - 1) * 90}px)`;
      const sdeg = Math.atan2(y, x) * 180 / Math.PI + 180;
      const w = Math.max(0, len - 40);
      rec.spoke.style.width = `${w.toFixed(0)}px`;
      rec.spoke.style.transform = `rotate(${sdeg.toFixed(1)}deg) translateX(${-w.toFixed(0)}px)`;
    }
  }

  /** Re-bind the pool so exactly the depth-window years are mounted. */
  #sync(camZ, force) {
    const first = Math.max(0, Math.floor(camZ / SPACING) - 1);
    const last = Math.min(this.years.length - 1, Math.ceil((camZ + FAR_FADE) / SPACING));
    if (!force && this.windowFirst === first && this.windowLast === last) return;
    this.windowFirst = first;
    this.windowLast = last;

    for (const [index, g] of this.bound) {
      if (index < first || index > last) { this.#release(g); this.bound.delete(index); }
    }
    for (let i = first; i <= last; i++) {
      if (this.bound.has(i)) continue;
      const g = this.free.pop();
      if (!g) { this.windowFirst = -1; break; }   // pool dry: retry next frame instead of caching a gap
      this.#bindGroup(g, i);
      this.bound.set(i, g);
    }
  }

  #tick = (now) => {
    if (!this.running) return;
    const dt = Math.min(64, now - this.lastT);
    this.lastT = now;
    const ease = (rate) => (REDUCED ? 1 : 1 - Math.pow(1 - rate, dt / 16.67));

    this.z += (this.targetZ - this.z) * ease(0.085);
    if (Math.abs(this.targetZ - this.z) < 0.05) this.z = this.targetZ;
    this.px += (this.tx - this.px) * ease(0.06);
    this.py += (this.ty - this.py) * ease(0.06);

    const camZ = this.z - CAM_OFFSET;
    this.#sync(camZ, false);

    const world = `translate3d(${this.px.toFixed(2)}px,${this.py.toFixed(2)}px,${camZ.toFixed(1)}px)`;
    if (world !== this.lastWorld) { this.world.style.transform = world; this.lastWorld = world; }

    let nearest = 0, best = Infinity;
    for (const [index, g] of this.bound) {
      const dist = index * SPACING - camZ;
      const d = Math.abs(dist - CAM_OFFSET);
      if (d < best) { best = d; nearest = index; }
      const near = Math.min(1, Math.max(0, dist / NEAR_FADE));
      const far = Math.min(1, Math.max(0, (FAR_FADE - dist) / 1550));
      const o = near * far;
      if (Math.abs(o - g.opacity) > 0.004) {
        g.opacity = o;
        g.el.style.opacity = o.toFixed(3);
        const hidden = o < 0.01;
        g.el.style.visibility = hidden ? "hidden" : "visible";
        g.el.inert = hidden;                      // faded-out years must not catch Tab
        g.el.setAttribute("aria-hidden", String(hidden));
      }
    }

    const progress = this.maxZ ? Math.min(1, Math.max(0, camZ / this.maxZ)) : 0;
    if (nearest !== this.nearest || Math.abs(progress - (this.progress ?? -1)) > 0.001) {
      this.nearest = nearest;
      this.progress = progress;
      this.onFrame({ nearest, progress, year: this.years[nearest]?.year });
    }

    this.frame = requestAnimationFrame(this.#tick);
  };

  /** Toggle the saved marker on every mounted node. */
  markSaved(savedIds) {
    this.savedIds = savedIds;
    for (const [, g] of this.bound) {
      for (const rec of g.nodes) {
        if (rec.game) rec.btn.classList.toggle("is-saved", savedIds.has(rec.game.id));
      }
    }
  }

  clampZ(v) { return Math.max(0, Math.min(this.maxZ, v)); }
  scrollToYear(i) { this.targetZ = this.clampZ(i * SPACING); }
  jumpToYear(i) { this.targetZ = this.z = this.clampZ(i * SPACING); }
  nudge(steps) { this.targetZ = this.clampZ(this.targetZ + steps * SPACING); }

  #bindInput() {
    const inPanel = (e) => e.target.closest && e.target.closest("[data-no-drag]");

    this.onWheel = (e) => {
      if (inPanel(e)) return;
      if (e.cancelable) e.preventDefault();
      this.targetZ = this.clampZ(this.targetZ + e.deltaY * 1.6);
    };
    this.onPointerMove = (e) => {
      if (REDUCED) return;
      this.tx = ((e.clientX / window.innerWidth) - 0.5) * -70;
      this.ty = ((e.clientY / window.innerHeight) - 0.5) * -34;
    };
    this.onDown = (e) => {
      if (inPanel(e) || e.target.closest("a, button, input")) return;
      this.drag = e.clientY;
      this.dragged = false;
      this.stage.classList.add("is-dragging");
    };
    this.onDrag = (e) => {
      if (this.drag == null) return;
      const dy = this.drag - e.clientY;
      if (Math.abs(dy) > 2) this.dragged = true;
      this.targetZ = this.clampZ(this.targetZ + dy * 6);
      this.drag = e.clientY;
    };
    this.onUp = () => { this.drag = null; this.stage.classList.remove("is-dragging"); };

    window.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onDrag);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onDrag);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
  }
}

export { SPACING };
