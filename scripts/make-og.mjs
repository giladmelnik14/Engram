// Generates public/og.jpg — the social preview card (1200×630) shown when the
// live URL is shared on LinkedIn/Twitter/Slack. Deterministic constellation so
// the card is stable across runs. Regenerate with: node scripts/make-og.mjs
import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 1200, H = 630;
const c = createCanvas(W, H);
const x = c.getContext("2d");

// Deep-space background with a soft nebula glow off to the right.
const bg = x.createRadialGradient(W * 0.62, H * 0.5, 60, W * 0.62, H * 0.5, 760);
bg.addColorStop(0, "#0b1020");
bg.addColorStop(1, "#05060a");
x.fillStyle = bg;
x.fillRect(0, 0, W, H);

// The site's five memory-kind colours.
const COL = [
  [64, 156, 255],   // decision
  [255, 88, 118],   // gotcha
  [255, 172, 64],   // convention
  [176, 140, 255],  // architecture
  [56, 232, 178],   // fact
];

// Deterministic pseudo-random so every regeneration draws the same sky.
let s = 7;
const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);

const nodes = Array.from({ length: 16 }, () => ({
  x: 560 + rnd() * 580,
  y: 70 + rnd() * 500,
  c: COL[Math.floor(rnd() * COL.length)],
  r: 5 + rnd() * 10,
}));

// Threads of light between related memories.
x.strokeStyle = "rgba(150,170,210,0.22)";
x.lineWidth = 1.2;
for (let i = 0; i < nodes.length; i++) {
  const a = nodes[i], b = nodes[(i * 3 + 2) % nodes.length];
  x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
}

// Glowing nodes.
for (const n of nodes) {
  const g = x.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 4.5);
  g.addColorStop(0, `rgba(${n.c[0]},${n.c[1]},${n.c[2]},0.5)`);
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.beginPath(); x.arc(n.x, n.y, n.r * 4.5, 0, 7); x.fill();
  x.fillStyle = `rgb(${n.c[0]},${n.c[1]},${n.c[2]})`;
  x.beginPath(); x.arc(n.x, n.y, n.r, 0, 7); x.fill();
}

// Left gradient so the text stays legible over the sky.
const lg = x.createLinearGradient(0, 0, W * 0.7, 0);
lg.addColorStop(0, "rgba(5,6,10,0.95)");
lg.addColorStop(1, "rgba(5,6,10,0)");
x.fillStyle = lg;
x.fillRect(0, 0, W, H);

// Brand + copy.
x.fillStyle = "#ff8c3b";
x.beginPath(); x.arc(74, 150, 13, 0, 7); x.fill();
x.fillStyle = "#ffffff";
x.font = "700 68px Helvetica";
x.fillText("Engram", 100, 172);
x.fillStyle = "#c9d2e3";
x.font = "400 31px Helvetica";
x.fillText("The memory layer for the agents", 74, 250);
x.fillText("that build your app", 74, 292);
x.fillStyle = "#8f9bb3";
x.font = "400 23px Helvetica";
x.fillText("Built entirely on Base44  ·  live, interactive demo", 74, H - 54);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "og.jpg");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, c.toBuffer("image/jpeg", 82));
console.log("wrote", out);
