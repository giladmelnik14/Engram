// Restores the engram hero constellation WITHOUT spending integration credits,
// by sending pre-curated memories + links to the seed-direct backend function.
// Used after the monthly InvokeLLM allowance was exhausted.
//
//   node scripts/restore-engram.mjs
import { createClient } from "@base44/sdk";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const cfg = JSON.parse(await readFile(join(homedir(), ".engram", "config.json"), "utf8"));
const base44 = createClient({ appId: "6a5fda5325556c5e596b9d3d" });

// Pre-curated by hand — the same job the curator agent does, done offline.
const memories = [
  { kind: "architecture", confidence: 0.95, tags: ["base44", "backend", "stack"],
    summary: "Build backend-first on Base44 — the whole stack comes included",
    content: "Engram is built backend-first on Base44: entities, auth, row-level security, functions, an AI agent, realtime and hosting all came included, so every hour went into the product itself." },
  { kind: "architecture", confidence: 0.85, tags: ["base44", "deployment", "backend"],
    summary: "Ship the whole backend with a single Base44 deploy",
    content: "The entire backend is one Base44 project — five entities, four functions and a curator agent — shipped with a single deploy command." },
  { kind: "decision", confidence: 0.9, tags: ["ai", "cost", "curation"],
    summary: "Classify and link a memory in one InvokeLLM call",
    content: "The curator agent classifies a memory and discovers its links in a single Base44 InvokeLLM call, so capturing one memory costs one integration credit." },
  { kind: "decision", confidence: 0.9, tags: ["recall", "cost", "performance"],
    summary: "Rank recall in plain code for zero-credit retrieval",
    content: "recall ranks memories in plain code rather than with the model, so it costs zero credits and an agent can safely recall on every turn." },
  { kind: "architecture", confidence: 0.9, tags: ["realtime", "base44", "canvas"],
    summary: "Stream memories to the canvas live with Base44 realtime",
    content: "Base44 realtime streams every new memory to the live canvas in under a second — the entire constellation runs on subscribe()." },
  { kind: "decision", confidence: 0.85, tags: ["rls", "base44", "security"],
    summary: "Public-read RLS for a live, shareable constellation",
    content: "Public-read row-level security lets anyone watch the constellation live while writes stay locked down — no custom auth code, just Base44 RLS." },
  { kind: "architecture", confidence: 0.85, tags: ["decay", "functions", "base44"],
    summary: "Decay memory nightly, reinforce it on recall",
    content: "A nightly Base44 scheduled function decays unused memories while recall reinforces the useful ones, so the map stays honest on its own." },
  { kind: "architecture", confidence: 0.95, tags: ["mcp", "cli", "base44"],
    summary: "One Base44 backend, three clients: CLI, canvas, MCP",
    content: "Three clients — a CLI, the live canvas, and an MCP server — all share one Base44 backend, so Claude Code and Cursor plug into the same memory." },
  { kind: "convention", confidence: 0.8, tags: ["curation", "agent", "base44"],
    summary: "Auto-classify every memory server-side with a Base44 agent",
    content: "Every memory is auto-classified into decision, gotcha, convention or architecture by the Base44 curator agent, server-side, the moment it is written." },
  { kind: "architecture", confidence: 0.8, tags: ["hosting", "base44", "deployment"],
    summary: "Serve the whole product from Base44 hosting",
    content: "Base44 hosting serves the canvas, so the whole product — backend and frontend — lives behind one URL and one deploy." },
  { kind: "convention", confidence: 0.8, tags: ["agent", "base44", "config"],
    summary: "Version the curator as a first-class Base44 agent",
    content: "The curator is a first-class Base44 agent resource, versioned and deployed right alongside the entities and functions." },
  { kind: "fact", confidence: 0.9, tags: ["base44", "onboarding", "hosting"],
    summary: "From `npx base44 create` to a live product in seconds",
    content: "From npx base44 create to a live, shareable product — the backend was ready in seconds and never needed managing." },
];

const links = [
  { from: 1, to: 0, relation: "relates_to", weight: 0.7, reason: "both describe the one-project Base44 backend" },
  { from: 3, to: 2, relation: "relates_to", weight: 0.8, reason: "both keep integration-credit cost down" },
  { from: 4, to: 5, relation: "depends_on", weight: 0.7, reason: "the live view relies on public-read RLS" },
  { from: 6, to: 3, relation: "relates_to", weight: 0.6, reason: "recall reinforces what decay would otherwise remove" },
  { from: 7, to: 4, relation: "relates_to", weight: 0.7, reason: "all three clients ride the same realtime stream" },
  { from: 8, to: 2, relation: "relates_to", weight: 0.7, reason: "classification is the curator's InvokeLLM job" },
  { from: 10, to: 8, relation: "refines", weight: 0.7, reason: "the versioned curator agent does the classifying" },
  { from: 9, to: 1, relation: "relates_to", weight: 0.7, reason: "hosting and backend ship in the same deploy" },
  { from: 11, to: 0, relation: "depends_on", weight: 0.8, reason: "the instant backend is what made this possible" },
  { from: 5, to: 4, relation: "relates_to", weight: 0.6, reason: "public RLS is what makes the live canvas viewable" },
];

const res = await base44.functions.invoke("seed-direct", {
  repo: "engram",
  repo_description: "The memory of building Engram itself on Base44",
  device_key: cfg.device_key,
  memories,
  links,
});
console.log(JSON.stringify(res.data, null, 2));
process.exit(0);
