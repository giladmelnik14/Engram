// Renders the ~100s demo film as frames (1280x720 @ 24fps) in the same visual
// language as the live site — starfield, glowing memory nodes, the guardrail's
// red conflict flash — then scripts/encode assembles an MP4. Silent by design:
// LinkedIn autoplays muted, so the captions carry the story.
// Usage: node scripts/make-demo.mjs <framesDir>
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const W = 1280, H = 720, FPS = 24, DUR = 102; // seconds
const OUT = process.argv[2] || "/tmp/engram-frames";
mkdirSync(OUT, { recursive: true });

const c = createCanvas(W, H);
const x = c.getContext("2d");

// ---------- palette ----------
const BG = "#05060a";
const ORANGE = [255, 140, 59];
const RED = [255, 66, 88];
const KIND = {
  decision: [64, 156, 255],
  gotcha: [255, 88, 118],
  convention: [255, 172, 64],
  architecture: [176, 140, 255],
  fact: [56, 232, 178],
};
const rgba = (col, a) => `rgba(${col[0]},${col[1]},${col[2]},${a})`;

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const fade = (t, len, fi = 0.7, fo = 0.7) =>
  clamp(Math.min(t / fi, (len - t) / fo), 0, 1);

let seed = 11;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280), seed / 233280);
const STARS = Array.from({ length: 150 }, () => ({
  x: rnd() * W, y: rnd() * H, r: 0.4 + rnd() * 1.1, tw: rnd() * 6.28,
}));

function bg(t) {
  x.fillStyle = BG;
  x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W * 0.62, H * 0.45, 40, W * 0.62, H * 0.45, 700);
  g.addColorStop(0, "rgba(16,20,38,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  for (const s of STARS) {
    const a = 0.25 + 0.3 * Math.abs(Math.sin(t * 0.7 + s.tw));
    x.fillStyle = `rgba(200,210,235,${a})`;
    x.beginPath(); x.arc(s.x, s.y, s.r, 0, 7); x.fill();
  }
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  x.fillStyle = v;
  x.fillRect(0, 0, W, H);
}

// red alarm wash from the screen edges — the guardrail's "impact" moment
function redEdge(alpha) {
  if (alpha <= 0) return;
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, rgba(RED, 0.35 * alpha));
  x.fillStyle = v;
  x.fillRect(0, 0, W, H);
}

function lines(ls, size, cy, alpha, { accentLast = false, weight = 600, jx = 0, tint = null } = {}) {
  x.textAlign = "center";
  x.font = `${weight} ${size}px Helvetica`;
  const lh = size * 1.35;
  const y0 = cy - ((ls.length - 1) * lh) / 2;
  ls.forEach((l, i) => {
    const la = clamp(alpha * (1.6 - i * 0.22), 0, 1);
    // glitch ghosting
    if (jx) {
      x.fillStyle = rgba(RED, la * 0.55);
      x.fillText(l, W / 2 - jx, y0 + i * lh);
      x.fillStyle = "rgba(90,180,255," + la * 0.4 + ")";
      x.fillText(l, W / 2 + jx, y0 + i * lh);
    }
    x.fillStyle =
      tint ? rgba(tint, la) :
      accentLast && i === ls.length - 1 ? rgba(ORANGE, la) : `rgba(236,240,248,${la})`;
    x.fillText(l, W / 2, y0 + i * lh);
  });
  x.textAlign = "left";
}

function caption(text, alpha) {
  if (alpha <= 0) return;
  x.textAlign = "center";
  x.font = "400 19px Helvetica";
  const w = x.measureText(text).width + 48;
  x.fillStyle = `rgba(10,12,20,${0.75 * alpha})`;
  roundRect((W - w) / 2, H - 74, w, 40, 20);
  x.fill();
  x.strokeStyle = `rgba(255,255,255,${0.12 * alpha})`;
  roundRect((W - w) / 2, H - 74, w, 40, 20);
  x.stroke();
  x.fillStyle = `rgba(214,222,238,${alpha})`;
  x.fillText(text, W / 2, H - 47);
  x.textAlign = "left";
}

function roundRect(rx, ry, rw, rh, r) {
  x.beginPath();
  x.moveTo(rx + r, ry);
  x.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
  x.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
  x.arcTo(rx, ry + rh, rx, ry, r);
  x.arcTo(rx, ry, rx + rw, ry, r);
  x.closePath();
}

// ---------- the demo constellation (real memories from the live demo repo) ----------
const NODES = [
  { k: "decision", l: "Route every payment through /api/payments", x: 810, y: 300, r: 13 },
  { k: "convention", l: "Store money as integer cents, never floats", x: 640, y: 425, r: 11 },
  { k: "gotcha", l: "Verify the Stripe webhook signature", x: 965, y: 435, r: 11 },
  { k: "decision", l: "Keep auth tokens in httpOnly cookies", x: 712, y: 572, r: 11 },
  { k: "gotcha", l: "Rate-limit the login route", x: 915, y: 612, r: 10 },
  { k: "architecture", l: "Postgres is the source of truth", x: 1065, y: 282, r: 11 },
  { k: "fact", l: "All timestamps are stored in UTC", x: 1128, y: 505, r: 9 },
  { k: "decision", l: "Ship every new feature behind a flag", x: 972, y: 178, r: 10 },
];
const LINKS = [ [1, 0], [2, 0], [4, 3], [5, 1], [7, 3] ];

function constellation(t, born, { redPulse = 0, dim = 1, shift = 0, labels = true } = {}) {
  // gentle "alive" float
  const fx = (n, i) => n.x + shift + 4 * Math.sin(t * 0.8 + i * 1.7);
  const fy = (n, i) => n.y + 3 * Math.cos(t * 0.6 + i * 1.1);

  // faint cluster region labels, like the site
  const anyBorn = born.some((b) => b > 0.6);
  if (anyBorn) {
    x.textAlign = "center";
    x.font = "700 46px Helvetica";
    x.fillStyle = `rgba(150,165,200,${0.055 * dim})`;
    x.fillText("P A Y M E N T S", 790 + shift, 400);
    x.font = "700 38px Helvetica";
    x.fillText("S E C U R I T Y", 830 + shift, 640);
    x.textAlign = "left";
  }

  for (const [a, b] of LINKS) {
    const p = Math.min(born[a], born[b]);
    if (p <= 0) continue;
    const A = NODES[a], B = NODES[b];
    const glow = 0.3 + 0.08 * Math.sin(t * 1.4 + a);
    x.strokeStyle = `rgba(150,170,210,${glow * p * dim})`;
    x.lineWidth = 1.2;
    x.beginPath();
    x.moveTo(fx(A, a), fy(A, a));
    x.lineTo(fx(A, a) + (fx(B, b) - fx(A, a)) * ease(p), fy(A, a) + (fy(B, b) - fy(A, a)) * ease(p));
    x.stroke();
  }
  NODES.forEach((n, i) => {
    const p = born[i];
    if (p <= 0) return;
    const col = KIND[n.k];
    const nx = fx(n, i), ny = fy(n, i);
    const bloom = 1 - ease(clamp(p, 0, 1));
    const r = n.r * (0.6 + 0.4 * ease(p));
    const g = x.createRadialGradient(nx, ny, 0, nx, ny, r * (4 + bloom * 4));
    g.addColorStop(0, rgba(col, (0.55 + bloom * 0.4) * dim));
    g.addColorStop(0.4, rgba(col, 0.16 * dim));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.beginPath(); x.arc(nx, ny, r * (4 + bloom * 4), 0, 7); x.fill();
    x.fillStyle = `rgba(255,255,255,${0.95 * dim})`;
    x.beginPath(); x.arc(nx, ny, r, 0, 7); x.fill();
    x.strokeStyle = rgba(col, 0.9 * dim);
    x.lineWidth = 1.6;
    x.beginPath(); x.arc(nx, ny, r, 0, 7); x.stroke();
    if (bloom > 0.02) {
      x.strokeStyle = rgba(col, bloom * 0.5 * dim);
      x.beginPath(); x.arc(nx, ny, r + (1 - bloom) * 62, 0, 7); x.stroke();
      x.strokeStyle = rgba(col, bloom * 0.28 * dim);
      x.beginPath(); x.arc(nx, ny, r + (1 - bloom) * 92, 0, 7); x.stroke();
    }
    if (labels && p > 0.5) {
      const la = clamp((p - 0.5) * 2, 0, 1) * 0.8 * dim;
      x.font = "400 14px Helvetica";
      x.textAlign = "center";
      x.fillStyle = `rgba(200,210,230,${la})`;
      x.fillText(n.l, nx, ny + r + 20);
      x.textAlign = "left";
    }
  });
  if (redPulse > 0) {
    const n = NODES[0];
    const nx = fx(n, 0), ny = fy(n, 0);
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    const g = x.createRadialGradient(nx, ny, 0, nx, ny, 100);
    g.addColorStop(0, rgba(RED, redPulse * (0.55 + pulse * 0.25)));
    g.addColorStop(0.4, rgba(RED, redPulse * 0.2));
    g.addColorStop(1, rgba(RED, 0));
    x.fillStyle = g;
    x.beginPath(); x.arc(nx, ny, 100, 0, 7); x.fill();
    x.strokeStyle = rgba(RED, redPulse * (0.55 + pulse * 0.45));
    x.lineWidth = 2.6;
    x.beginPath(); x.arc(nx, ny, n.r + 9 + pulse * 12, 0, 7); x.stroke();
    x.strokeStyle = rgba(RED, redPulse * 0.3 * (1 - pulse));
    x.beginPath(); x.arc(nx, ny, n.r + 26 + pulse * 26, 0, 7); x.stroke();
  }
}

// ---------- the try-it panel ----------
function panel(t, alpha, mode, typed, showRun, result) {
  const px = 60, py = 118, pw = 430;
  const ph = result ? (result.type === "conflict" ? 420 : result.type === "safe" ? 330 : 400) : 300;
  x.save();
  x.globalAlpha = alpha;
  x.fillStyle = "rgba(12,14,22,0.94)";
  roundRect(px, py, pw, ph, 18); x.fill();
  x.strokeStyle = "rgba(255,255,255,0.12)";
  roundRect(px, py, pw, ph, 18); x.stroke();

  x.fillStyle = "#eef2fa";
  x.font = "700 21px Helvetica";
  x.fillText("Try it live", px + 24, py + 40);
  x.fillStyle = "#8f9bb3";
  x.font = "400 17px Helvetica";
  x.fillText("· the demo app", px + 122, py + 40);

  const tabW = (pw - 48 - 10) / 2;
  [["recall", "what does it know?"], ["check", "is my change safe?"]].forEach(([m, sub], i) => {
    const tx = px + 24 + i * (tabW + 10), ty = py + 60;
    const on = m === mode;
    x.fillStyle = on ? "rgba(255,140,59,0.16)" : "rgba(255,255,255,0.03)";
    roundRect(tx, ty, tabW, 52, 11); x.fill();
    x.strokeStyle = on ? "rgba(255,140,59,0.55)" : "rgba(255,255,255,0.1)";
    roundRect(tx, ty, tabW, 52, 11); x.stroke();
    x.fillStyle = on ? "#ffd7ad" : "#8f9bb3";
    x.font = "600 16px Helvetica";
    x.textAlign = "center";
    x.fillText(m, tx + tabW / 2, ty + 23);
    x.font = "400 12px Helvetica";
    x.fillText(sub, tx + tabW / 2, ty + 41);
    x.textAlign = "left";
  });

  const iy = py + 132;
  x.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(px + 24, iy, pw - 48 - 74, 46, 10); x.fill();
  x.strokeStyle = "rgba(255,140,59,0.45)";
  roundRect(px + 24, iy, pw - 48 - 74, 46, 10); x.stroke();
  x.fillStyle = "#eef2fa";
  x.font = "400 16px Helvetica";
  const maxW = pw - 48 - 74 - 28;
  let shown = typed;
  while (x.measureText(shown).width > maxW && shown.length > 1) shown = shown.slice(1);
  x.fillText(shown + (showRun ? "" : "|"), px + 38, iy + 29);
  x.fillStyle = showRun ? "rgba(255,140,59,0.35)" : "rgba(255,140,59,0.18)";
  roundRect(px + pw - 24 - 64, iy, 64, 46, 10); x.fill();
  x.strokeStyle = "rgba(255,140,59,0.6)";
  roundRect(px + pw - 24 - 64, iy, 64, 46, 10); x.stroke();
  x.fillStyle = "#ffd7ad";
  x.font = "600 16px Helvetica";
  x.fillText("run", px + pw - 24 - 46, iy + 29);

  if (result) {
    const ry = iy + 74;
    x.strokeStyle = "rgba(255,255,255,0.1)";
    x.beginPath(); x.moveTo(px + 24, ry - 12); x.lineTo(px + pw - 24, ry - 12); x.stroke();
    if (result.type === "conflict") {
      // drawn warning triangle (the font has no ⚠ glyph)
      const tx0 = px + 24, ty0 = ry + 14;
      x.fillStyle = "#ff8a9c";
      x.beginPath();
      x.moveTo(tx0 + 9, ty0 - 14);
      x.lineTo(tx0 + 19, ty0 + 3);
      x.lineTo(tx0 - 1, ty0 + 3);
      x.closePath();
      x.fill();
      x.fillStyle = "#20242f";
      x.font = "700 12px Helvetica";
      x.fillText("!", tx0 + 7, ty0);
      x.fillStyle = "#ff8a9c";
      x.font = "700 19px Helvetica";
      x.fillText("Not safe — this breaks a rule", px + 52, ry + 16);
      x.fillStyle = "#8f9bb3";
      x.font = "400 15px Helvetica";
      x.fillText("The app already decided the opposite:", px + 24, ry + 44);
      x.fillStyle = "#eef2fa";
      x.font = "600 16px Helvetica";
      x.fillText("Route every payment through the", px + 24, ry + 74);
      x.fillText("server /api/payments module", px + 24, ry + 96);
      // drawn green arrow (no → glyph either)
      x.strokeStyle = "#9ff0d4";
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(px + 26, ry + 121);
      x.lineTo(px + 42, ry + 121);
      x.moveTo(px + 36, ry + 115);
      x.lineTo(px + 42, ry + 121);
      x.lineTo(px + 36, ry + 127);
      x.stroke();
      x.fillStyle = "#9ff0d4";
      x.font = "400 15px Helvetica";
      x.fillText("do this instead: call the server", px + 52, ry + 126);
      x.fillText("endpoint from the component.", px + 52, ry + 146);
    } else if (result.type === "safe") {
      // drawn green checkmark (the font has no ✓ glyph)
      x.strokeStyle = "#7ff0d0";
      x.lineWidth = 3.4;
      x.lineCap = "round";
      x.beginPath();
      x.moveTo(px + 26, ry + 8);
      x.lineTo(px + 33, ry + 15);
      x.lineTo(px + 46, ry - 1);
      x.stroke();
      x.lineCap = "butt";
      x.fillStyle = "#7ff0d0";
      x.font = "700 19px Helvetica";
      x.fillText("Safe to do this", px + 56, ry + 16);
      x.fillStyle = "#8f9bb3";
      x.font = "400 15px Helvetica";
      x.fillText("Nothing here clashes with a decision", px + 24, ry + 46);
      x.fillText("the app already made. Go ahead.", px + 24, ry + 66);
    } else {
      x.fillStyle = "#8f9bb3";
      x.font = "400 14px Helvetica";
      x.fillText("Here's what it already decided:", px + 24, ry + 10);
      const rows = [
        ["decision", "Route every payment through /api/payments"],
        ["convention", "Store money as integer cents, never floats"],
        ["gotcha", "Verify the Stripe webhook signature"],
      ];
      rows.forEach(([k, l], i) => {
        const yy = ry + 40 + i * 42;
        x.fillStyle = rgba(KIND[k], 1);
        x.beginPath(); x.arc(px + 32, yy - 5, 5, 0, 7); x.fill();
        x.fillStyle = "#eef2fa";
        x.font = "600 14.5px Helvetica";
        x.fillText(l, px + 48, yy);
        x.fillStyle = "#8f9bb3";
        x.font = "400 12px Helvetica";
        x.fillText(k, px + 48, yy + 17);
      });
    }
  }
  x.restore();
}

// ---------- timeline ----------
const CHECK_TEXT = "call Stripe from the checkout component";
const SAFE_TEXT = "add a loading spinner to the dashboard";

function drawFrame(t) {
  // cinematic slow push-in during the opening act
  const zoom = t < 18 ? 1 + 0.045 * (t / 18) : 1;
  // impact shake at the CONFLICT moment (t ≈ 53.4)
  const impact = clamp(1 - Math.abs(t - 53.5) / 0.65, 0, 1);
  const shake = impact > 0 ? Math.sin(t * 90) * 7 * impact : 0;

  x.save();
  x.translate(W / 2 + shake, H / 2 + shake * 0.6);
  x.scale(zoom, zoom);
  x.translate(-W / 2, -H / 2);

  bg(t);

  if (t < 3.5) {
    lines(["3 A.M.", "Your AI ships a beautiful fix."], 44, H / 2, fade(t, 3.5));
  } else if (t < 7.5) {
    const lt = t - 3.5;
    // the "break" hits with a red glitch flicker
    const glitch = lt > 1.9 && lt < 2.6 ? (Math.floor(lt * 24) % 2 ? 4 : -3) : 0;
    lines(
      ["A fresh session, days later.", "It breaks the exact same thing."],
      44, H / 2, fade(lt, 4), { jx: glitch },
    );
    if (glitch) redEdge(0.5);
  } else if (t < 11) {
    const lt = t - 7.5;
    lines(["It remembers nothing."], 66, H / 2, fade(lt, 3.5), { weight: 700 });
  } else if (t < 14.5) {
    const lt = t - 11;
    lines(["Every decision. Every hard-won lesson.", "Gone by the next prompt."], 40, H / 2, fade(lt, 3.5));
  } else if (t < 18) {
    const lt = t - 14.5;
    lines(["What if it remembered", "everything?"], 58, H / 2, fade(lt, 3.5), { accentLast: true, weight: 700 });
  } else if (t < 23) {
    const lt = t - 18;
    const a = fade(lt, 5, 0.8, 0.8);
    // expanding ring reveal behind the wordmark
    const ringR = 40 + ease(clamp(lt / 2.2, 0, 1)) * 620;
    x.strokeStyle = rgba(ORANGE, 0.35 * a * (1 - ringR / 700));
    x.lineWidth = 2;
    x.beginPath(); x.arc(W / 2, H / 2, ringR, 0, 7); x.stroke();
    x.fillStyle = rgba(ORANGE, a);
    x.beginPath(); x.arc(W / 2 - 178, H / 2 - 26, 13, 0, 7); x.fill();
    x.textAlign = "center";
    x.fillStyle = `rgba(255,255,255,${a})`;
    x.font = "700 74px Helvetica";
    x.fillText("ENGRAM", W / 2 + 22, H / 2);
    x.fillStyle = `rgba(190,200,220,${a})`;
    x.font = "400 24px Helvetica";
    x.fillText("A living memory for the AI that builds your app.", W / 2, H / 2 + 54);
    x.textAlign = "left";
  } else if (t < 47) {
    const lt = t - 23;
    const born = NODES.map((_, i) => clamp((lt - i * 2.3) / 1.6, 0, 1));
    constellation(t, born, { shift: -150 });
    if (lt < 12)
      caption("This is a real app's memory — every dot is something its AI learned while coding.", fade(lt, 12, 1, 1));
    else
      caption("Colour is the kind of lesson · threads connect related memories · it streams live.", fade(lt - 12, 12, 1, 1));
  } else if (t < 66) {
    // check — the conflict (the climax)
    const lt = t - 47;
    const born = NODES.map(() => 1);
    const typedN = clamp((lt - 1.2) / 3.2, 0, 1);
    const typed = CHECK_TEXT.slice(0, Math.floor(typedN * CHECK_TEXT.length));
    const ran = lt > 5.2;
    const result = lt > 6.4 ? { type: "conflict" } : null;
    const red = result ? clamp((lt - 6.4) / 0.4, 0, 1) * clamp((17 - lt) / 2, 0, 1) : 0;
    constellation(t, born, { redPulse: red, dim: 0.85, shift: 120 });
    panel(t, clamp(lt / 0.8, 0, 1), "check", typed, ran, result);
    if (result) redEdge(clamp(1 - (lt - 6.4) / 1.1, 0, 1) * 0.9);
    if (lt > 2 && lt < 6.2)
      caption("Now watch the guardrail. The agent is about to repeat an old mistake…", fade(lt - 2, 4.2, 0.6, 0.6));
    if (lt > 8)
      caption("Blocked — before a single line of code shipped. That's memory with teeth.", fade(lt - 8, 11, 0.8, 1));
  } else if (t < 76) {
    // check — the safe case (the guardrail stays out of the way)
    const lt = t - 66;
    const born = NODES.map(() => 1);
    constellation(t, born, { dim: 0.85, shift: 120 });
    const typedN = clamp((lt - 0.8) / 2.6, 0, 1);
    const typed = SAFE_TEXT.slice(0, Math.floor(typedN * SAFE_TEXT.length));
    const ran = lt > 4;
    const result = lt > 5.2 ? { type: "safe" } : null;
    panel(t, fade(lt, 10, 0.001, 1), "check", typed, ran, result);
    if (lt > 6)
      caption("And when a change is safe? It stays out of the way.", fade(lt - 6, 4, 0.6, 0.8));
  } else if (t < 84) {
    // recall
    const lt = t - 76;
    const born = NODES.map(() => 1);
    constellation(t, born, { dim: 0.85, shift: 120 });
    const typedN = clamp((lt - 0.6) / 1.3, 0, 1);
    const typed = "payments".slice(0, Math.floor(typedN * 8));
    const result = lt > 2.4 ? { type: "recall" } : null;
    panel(t, fade(lt, 8, 0.6, 1), "recall", typed, lt > 2.1, result);
    if (lt > 3.2)
      caption("And recall — everything the codebase knows, before the agent writes a word.", fade(lt - 3.2, 4.8, 0.8, 0.8));
  } else if (t < 92) {
    // the Base44 statement — constellation glows quietly, labels off so the
    // text owns the frame
    const lt = t - 84;
    const born = NODES.map(() => 1);
    constellation(t, born, { dim: 0.3, shift: 0, labels: false });
    if (lt < 4) {
      lines(["Built entirely on Base44.", "In a few days."], 46, H / 2 - 20, fade(lt, 4), { weight: 700 });
    } else {
      lines(["One Base44 backend powers everything —", "the website, a terminal tool, and a plug-in for AI assistants."], 34, H / 2 - 20, fade(lt - 4, 4));
    }
  } else {
    // closing card — brand only, no call-to-action
    const lt = t - 92;
    const a = fade(lt, 10, 1, 2.5);
    x.fillStyle = rgba(ORANGE, a);
    x.beginPath(); x.arc(W / 2 - 122, H / 2 - 44, 11, 0, 7); x.fill();
    x.textAlign = "center";
    x.fillStyle = `rgba(255,255,255,${a})`;
    x.font = "700 56px Helvetica";
    x.fillText("Engram", W / 2 + 14, H / 2 - 26);
    x.fillStyle = `rgba(200,210,228,${a})`;
    x.font = "400 24px Helvetica";
    x.fillText("The memory layer for the agents that build your app", W / 2, H / 2 + 26);
    x.fillStyle = `rgba(150,160,180,${a * 0.9})`;
    x.font = "400 19px Helvetica";
    x.fillText("Built on Base44 · Dev Build-Off 2026", W / 2, H / 2 + 68);
    x.textAlign = "left";
  }

  x.restore();
}

// ---------- render ----------
const total = DUR * FPS;
console.log(`rendering ${total} frames to ${OUT} …`);
for (let f = 0; f < total; f++) {
  drawFrame(f / FPS);
  writeFileSync(join(OUT, `f${String(f).padStart(5, "0")}.jpg`), c.toBuffer("image/jpeg", 85));
  if (f % 240 === 0) console.log(`  ${f}/${total}`);
}
console.log("frames done");
