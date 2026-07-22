// Seeds the constellation with a realistic run of memories.
//
// Reads the Base44 CLI's own token from disk so no credential is ever passed
// on the command line or printed. Run `npx base44 login` first.
//
//   node scripts/seed.mjs            capture the full story
//   node scripts/seed.mjs --one 3    capture a single memory (for the demo take)
import { createClient } from "@base44/sdk";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const APP_ID = "6a5fda5325556c5e596b9d3d";
const REPO = "acme/checkout";

// Headless clients authenticate with the device key issued by `engram login`,
// not with a browser session.
const cfg = JSON.parse(
  await readFile(join(homedir(), ".engram", "config.json"), "utf8"),
);

const base44 = createClient({ appId: APP_ID });

// A believable week of agent sessions on one codebase. The last entry is the
// payoff: it contradicts the first, so the curator should supersede it and the
// canvas should visibly retire the old node.
const STORY = [
  "All API input is validated with Zod at the route boundary before it reaches any handler.",
  "Never call the payments provider directly from the frontend. Everything goes through /api/payments so retries stay idempotent.",
  "Staging Postgres enforces a 5 second statement timeout, so any migration touching orders has to be chunked or it will be killed mid-run.",
  "Database columns are snake_case, TypeScript is camelCase, and the ORM maps between them. Do not hand-write the mapping.",
  "Prefer server components. Only reach for 'use client' when you genuinely need state or effects.",
  "The orders table has a partial index on status='pending'. Queries that filter on status must keep that predicate or they fall back to a sequential scan.",
  "We have moved off Zod entirely. All request validation now happens in the tRPC input layer instead of at the route boundary.",
];

const onlyIndex = process.argv.includes("--one")
  ? Number(process.argv[process.argv.indexOf("--one") + 1])
  : null;

const items = onlyIndex !== null ? [STORY[onlyIndex]] : STORY;

for (const [i, content] of items.entries()) {
  process.stdout.write(`\n[${i + 1}/${items.length}] ${content.slice(0, 70)}...\n`);
  try {
    const res = await base44.functions.invoke("capture", {
      content,
      repo: REPO,
      agent: "claude-code",
      source: "cli",
      device_key: cfg.device_key,
    });
    const { memory, links, superseded } = res.data;
    console.log(`   -> [${memory.kind}] ${memory.summary}`);
    console.log(`      tags: ${(memory.tags ?? []).join(", ") || "none"}  confidence: ${memory.confidence}`);
    if (links?.length) {
      for (const l of links) console.log(`      ${l.relation} -> ${l.to_memory_id} (${l.reason})`);
    }
    if (superseded?.length) console.log(`      SUPERSEDED ${superseded.length} memory(ies)`);
  } catch (e) {
    console.log(`   !! ${e?.response?.data?.error ?? e.message}`);
  }
}

process.exit(0);
