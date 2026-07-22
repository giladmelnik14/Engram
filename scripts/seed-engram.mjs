// Seeds the HERO constellation: the real memory of building Engram on Base44.
// Every entry celebrates what the Base44 backend made possible — this is the
// story of an agent building on Base44 and keeping what it learned. The blunt
// platform feedback lives in the submission's feedback section, not here.
//
//   node scripts/seed-engram.mjs      (purges the engram repo first, then re-seeds)
import { createClient } from "@base44/sdk";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_ID = "6a5fda5325556c5e596b9d3d";
const REPO = "engram";

const cfg = JSON.parse(await readFile(join(homedir(), ".engram", "config.json"), "utf8"));
const base44 = createClient({ appId: APP_ID });

// Clear any previous seed so re-running is clean.
try {
  const res = await base44.functions.invoke("purge", { repo: REPO, device_key: cfg.device_key });
  console.log(`purged: ${res.data.deleted_memories} memories, ${res.data.deleted_links} links\n`);
} catch (e) {
  console.log(`purge skipped: ${e?.response?.data?.error ?? e.message}\n`);
}

// In build order, so the replay tells the story of the build. All positive —
// what Base44's backend handled, and the design choices that sat on top of it.
const MEMORIES = [
  "Engram is built backend-first on Base44: entities, auth, row-level security, functions, an AI agent, realtime and hosting all came included, so every hour went into the product itself.",
  "The whole backend is one Base44 project — five entities, four functions and a curator agent — shipped with a single deploy command.",
  "The curator agent classifies a memory and discovers its links in a single Base44 InvokeLLM call, so capturing one memory costs one integration credit.",
  "recall ranks memories in plain code rather than with the model, so it costs zero credits and an agent can safely recall on every turn.",
  "Base44 realtime streams every new memory to the live canvas in under a second — the entire constellation runs on subscribe().",
  "Public-read row-level security lets anyone watch the constellation live while writes stay locked down — no custom auth code, just Base44 RLS.",
  "A nightly Base44 scheduled function decays unused memories while recall reinforces the useful ones, so the map stays honest on its own.",
  "Three clients — a CLI, the live canvas, and an MCP server — all share one Base44 backend, so Claude Code and Cursor plug into the same memory.",
  "Every memory is auto-classified into decision, gotcha, convention or architecture by the Base44 curator agent, server-side, the moment it is written.",
  "Base44 hosting serves the canvas, so the whole product — backend and frontend — lives behind one URL and one deploy.",
  "The curator is a first-class Base44 agent resource, versioned and deployed right alongside the entities and functions.",
  "From `npx base44 create` to a live, shareable product — the backend was ready in seconds and never needed managing.",
];

for (const [i, content] of MEMORIES.entries()) {
  process.stdout.write(`\n[${i + 1}/${MEMORIES.length}] ${content.slice(0, 62)}...\n`);
  try {
    const res = await base44.functions.invoke("capture", {
      content,
      repo: REPO,
      agent: "claude-code",
      source: "cli",
      device_key: cfg.device_key,
    });
    const { memory, links } = res.data;
    console.log(`   -> [${memory.kind}] ${memory.summary}`);
    if (links?.length) for (const l of links) console.log(`      ${l.relation}`);
  } catch (e) {
    console.log(`   !! ${e?.response?.data?.error ?? e.message}`);
  }
  // Space out the InvokeLLM calls so the curator doesn't hit a rate limit.
  await new Promise((r) => setTimeout(r, 2500));
}

process.exit(0);
