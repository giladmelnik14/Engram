// The constellation engine.
//
// A self-contained force-directed renderer on a 2D canvas. It owns physics and
// paint; React only hands it memories and links and tells it when one is born.
// Kept framework-free on purpose — the animation loop must not fight React's.

export const KIND_COLORS = {
  decision: [91, 140, 255],
  gotcha: [255, 92, 114],
  convention: [255, 158, 61],
  architecture: [167, 139, 250],
  preference: [139, 148, 168],
  fact: [69, 224, 176],
};

const rgb = (c, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

export class Constellation {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.nodes = new Map(); // id -> node
    this.edges = new Map(); // id -> edge
    this.stars = [];
    this.t = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.hover = null;
    this.onHover = () => {};
    this.pointer = { x: -9999, y: -9999 };

    this._resize = this._resize.bind(this);
    this._move = this._move.bind(this);
    window.addEventListener("resize", this._resize);
    canvas.addEventListener("pointermove", this._move);
    canvas.addEventListener("pointerleave", () => {
      this.pointer = { x: -9999, y: -9999 };
    });
    this._resize();
    this._seedStars();
  }

  destroy() {
    window.removeEventListener("resize", this._resize);
    cancelAnimationFrame(this._raf);
  }

  _resize() {
    const { canvas } = this;
    // Fall back to the window if the element hasn't been laid out yet — on a
    // cold load clientWidth can briefly read 0 before CSS applies.
    this.w = canvas.clientWidth || window.innerWidth;
    this.h = canvas.clientHeight || window.innerHeight;
    canvas.width = this.w * this.dpr;
    canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cx = this.w / 2;
    this.cy = this.h / 2;
  }

  // The window 'resize' event does not fire for the initial layout pass, so a
  // cold load could leave the canvas measured at the wrong size forever. Cheap
  // per-frame check keeps it locked to the real viewport no matter what.
  _checkResize() {
    const cw = this.canvas.clientWidth || window.innerWidth;
    const ch = this.canvas.clientHeight || window.innerHeight;
    if (cw !== this.w || ch !== this.h) this._resize();
  }

  _move(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _seedStars() {
    // Deterministic-ish backdrop drift. Cheap, adds depth on video.
    for (let i = 0; i < 140; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        r: Math.random() * 1.3 + 0.2,
        tw: Math.random() * Math.PI * 2,
      });
    }
  }

  // ---- data sync -------------------------------------------------------

  setData(memories, links) {
    const seen = new Set();
    for (const m of memories) {
      seen.add(m.id);
      const existing = this.nodes.get(m.id);
      if (existing) {
        Object.assign(existing, this._nodeProps(m));
      } else {
        this.nodes.set(m.id, this._makeNode(m, false));
      }
    }
    // Drop nodes that no longer exist.
    for (const id of [...this.nodes.keys()]) {
      if (!seen.has(id)) this.nodes.delete(id);
    }

    const seenE = new Set();
    for (const l of links) {
      seenE.add(l.id);
      if (!this.edges.has(l.id)) this.edges.set(l.id, this._makeEdge(l));
      else Object.assign(this.edges.get(l.id), this._edgeProps(l));
    }
    for (const id of [...this.edges.keys()]) {
      if (!seenE.has(id)) this.edges.delete(id);
    }
  }

  _nodeProps(m) {
    return {
      summary: m.summary || m.content?.slice(0, 80) || "",
      content: m.content || "",
      kind: m.kind || "fact",
      tags: m.tags || [],
      strength: m.strength ?? 1,
      recall: m.recall_count ?? 0,
      status: m.status || "active",
      // Recall bumps strength server-side; reflect that as a brief flare.
      _targetRecall: m.recall_count ?? 0,
    };
  }

  _makeNode(m, born) {
    const angle = Math.random() * Math.PI * 2;
    const rad = born ? 30 : 120 + Math.random() * 180;
    return {
      id: m.id,
      x: this.cx + Math.cos(angle) * rad,
      y: this.cy + Math.sin(angle) * rad,
      vx: 0,
      vy: 0,
      ...this._nodeProps(m),
      born: this.t,
      bloom: born ? 1 : 0, // 1 = full bloom flash, decays to 0
      ringT: born ? 0 : 1, // 0→1 expanding ripple when a memory lands
      flare: 0, // recall pulse
      lastRecall: m.recall_count ?? 0,
    };
  }

  _edgeProps(l) {
    return {
      relation: l.relation || "relates_to",
      weight: l.weight ?? 0.5,
      reason: l.reason || "",
    };
  }

  _makeEdge(l) {
    return {
      id: l.id,
      from: l.from_memory_id,
      to: l.to_memory_id,
      ...this._edgeProps(l),
      born: this.t,
      grow: 0, // 0 -> 1 draw-on animation
    };
  }

  // Wipe all nodes and edges — used to restart the replay from an empty sky.
  clear() {
    this.nodes.clear();
    this.edges.clear();
    this.hover = null;
  }

  // Called by React when the realtime stream reports a brand-new memory.
  bloomIn(m) {
    if (this.nodes.has(m.id)) {
      const n = this.nodes.get(m.id);
      n.bloom = 1;
      n.ringT = 0;
      return;
    }
    this.nodes.set(m.id, this._makeNode(m, true));
  }

  radius(n) {
    const base = 4 + Math.sqrt(n.strength) * 3.2;
    return base * (n.status === "active" ? 1 : 0.7);
  }

  // ---- physics ---------------------------------------------------------

  _step() {
    const nodes = [...this.nodes.values()];
    const N = nodes.length;

    for (const n of nodes) {
      n.fx = 0;
      n.fy = 0;
    }

    // Repulsion (O(n^2), fine for hundreds of nodes).
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 1;
        }
        const d = Math.sqrt(d2);
        // Strong, capped repulsion so nodes keep a readable distance apart
        // instead of piling into the centre. The cap avoids singularities.
        const force = Math.min(52000 / d2, 60);
        const ux = dx / d;
        const uy = dy / d;
        a.fx += ux * force;
        a.fy += uy * force;
        b.fx -= ux * force;
        b.fy -= uy * force;
      }
    }

    // Spring attraction along edges.
    for (const e of this.edges.values()) {
      const a = this.nodes.get(e.from);
      const b = this.nodes.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = 210 - e.weight * 40;
      const k = 0.02 * (0.4 + e.weight);
      const f = (d - rest) * k;
      const ux = dx / d;
      const uy = dy / d;
      a.fx += ux * f;
      a.fy += uy * f;
      b.fx -= ux * f;
      b.fy -= uy * f;
    }

    // Gentle gravity toward centre — just enough to keep the constellation
    // composed in frame, weak enough that repulsion can spread it out.
    for (const n of nodes) {
      n.fx += (this.cx - n.x) * 0.004;
      n.fy += (this.cy - n.y) * 0.004;

      n.vx = (n.vx + n.fx) * 0.84;
      n.vy = (n.vy + n.fy) * 0.84;
      n.x += n.vx * 0.16;
      n.y += n.vy * 0.16;

      // animation decays
      n.bloom *= 0.94;
      n.flare *= 0.9;
      if (n.ringT < 1) n.ringT = Math.min(1, n.ringT + 0.026);
      if (n._targetRecall > n.lastRecall) {
        n.flare = 1;
        n.lastRecall = n._targetRecall;
      }
    }

    for (const e of this.edges.values()) {
      if (e.grow < 1) e.grow = Math.min(1, e.grow + 0.03);
    }
  }

  _pickHover() {
    let best = null;
    let bestD = 18 * 18;
    for (const n of this.nodes.values()) {
      const dx = n.x - this.pointer.x;
      const dy = n.y - this.pointer.y;
      const d2 = dx * dx + dy * dy;
      const rr = this.radius(n) + 10;
      if (d2 < Math.max(bestD, rr * rr) && d2 < rr * rr * 3) {
        if (d2 < bestD || !best) {
          best = n;
          bestD = d2;
        }
      }
    }
    if (best?.id !== this.hover?.id) {
      this.hover = best;
      this.onHover(best);
    }
  }

  // ---- render ----------------------------------------------------------

  _render() {
    const { ctx, w, h } = this;

    // Background: radial nebula wash + vignette.
    const bg = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(w, h) * 0.75);
    bg.addColorStop(0, "#0b0e18");
    bg.addColorStop(0.5, "#070811");
    bg.addColorStop(1, "#04050a");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Drifting stars.
    for (const s of this.stars) {
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 0.02 + s.tw));
      ctx.fillStyle = `rgba(255,255,255,${0.06 + tw * 0.12})`;
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Edges first, under the nodes.
    for (const e of this.edges.values()) {
      const a = this.nodes.get(e.from);
      const b = this.nodes.get(e.to);
      if (!a || !b) continue;

      const contradiction = e.relation === "contradicts";
      const supersede = e.relation === "supersedes";
      const col = contradiction ? [255, 80, 96] : supersede ? [255, 158, 61] : [120, 150, 220];

      const ex = a.x + (b.x - a.x) * e.grow;
      const ey = a.y + (b.y - a.y) * e.grow;

      const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      const base = 0.1 + e.weight * 0.28;
      const pulse = contradiction ? 0.25 + 0.25 * Math.sin(this.t * 0.09) : 0;
      grad.addColorStop(0, rgb(col, base + pulse));
      grad.addColorStop(0.5, rgb(col, base * 0.5 + pulse));
      grad.addColorStop(1, rgb(col, base + pulse));

      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.6 + e.weight * 1.8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // A photon traveling the thread — the "knowledge moving" motif.
      if (e.grow >= 1) {
        const p = (this.t * 0.012 + e.born) % 1;
        const px = a.x + (b.x - a.x) * p;
        const py = a.y + (b.y - a.y) * p;
        ctx.fillStyle = rgb(col, 0.5);
        ctx.beginPath();
        ctx.arc(px, py, 1.6 + e.weight, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Nodes.
    for (const n of this.nodes.values()) {
      const c = KIND_COLORS[n.kind] || KIND_COLORS.fact;
      const active = n.status === "active";
      const r = this.radius(n);
      const glowR = r * (3.4 + n.bloom * 4 + n.flare * 2);
      const alpha = active ? 1 : 0.4;

      // Outer glow.
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
      g.addColorStop(0, rgb(c, (0.5 + n.bloom * 0.5) * alpha));
      g.addColorStop(0.35, rgb(c, 0.22 * alpha));
      g.addColorStop(1, rgb(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Core.
      ctx.fillStyle = rgb(active ? [255, 255, 255] : c, (0.9 + n.flare * 0.1) * alpha);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * (1 + n.bloom * 0.6), 0, Math.PI * 2);
      ctx.fill();

      // Coloured rim.
      ctx.strokeStyle = rgb(c, 0.9 * alpha);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * (1 + n.bloom * 0.6), 0, Math.PI * 2);
      ctx.stroke();

      // Landing ripple — an expanding ring the moment a memory is captured.
      if (n.ringT < 1) {
        const rr = r + n.ringT * 52;
        ctx.strokeStyle = rgb(c, (1 - n.ringT) * 0.55);
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(n.x, n.y, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();

    // Labels — always on, so a still frame reads as knowledge, not decoration.
    // Collision-aware: when two would overlap, the stronger memory keeps its
    // label; a shadow keeps text legible over the additive glow.
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "500 11px Inter, system-ui, sans-serif";
    const drawn = [];
    const ranked = [...this.nodes.values()].sort((a, b) => {
      const ah = this.hover?.id === a.id ? 1e6 : 0;
      const bh = this.hover?.id === b.id ? 1e6 : 0;
      return bh + (b.strength ?? 1) - (ah + (a.strength ?? 1));
    });
    for (const n of ranked) {
      const active = n.status === "active";
      const r = this.radius(n);
      const label = n.summary.length > 42 ? n.summary.slice(0, 40) + "…" : n.summary;
      const isHover = this.hover?.id === n.id;
      const w = ctx.measureText(label).width;
      const cx = n.x;
      const cy = n.y + r + 7;
      const box = { x: cx - w / 2, y: cy, w, h: 14 };
      const clash = drawn.some(
        (d) =>
          Math.abs(d.x + d.w / 2 - (box.x + box.w / 2)) < (d.w + box.w) / 2 - 4 &&
          Math.abs(d.y + d.h / 2 - (box.y + box.h / 2)) < (d.h + box.h) / 2,
      );
      if (clash && !isHover) continue;
      drawn.push(box);

      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 7;
      ctx.fillStyle = `rgba(232,236,246,${isHover ? 0.98 : active ? 0.62 : 0.26})`;
      ctx.fillText(label, cx, cy);
      ctx.restore();
    }

    // Hover ring (crisp, not additive).
    if (this.hover && this.nodes.has(this.hover.id)) {
      const n = this.nodes.get(this.hover.id);
      const r = this.radius(n);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  start() {
    const loop = () => {
      this.t += 1;
      this._checkResize();
      this._step();
      this._pickHover();
      this._render();
      this._raf = requestAnimationFrame(loop);
    };
    loop();
  }

  // Screen position of a node, for anchoring the DOM tooltip.
  screenOf(id) {
    const n = this.nodes.get(id);
    return n ? { x: n.x, y: n.y } : null;
  }
}
