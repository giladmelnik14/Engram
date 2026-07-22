#!/usr/bin/env node
// engram — the terminal client for a codebase's shared agent memory.
//
// A plain Node CLI talking straight to the Base44 backend: no browser, no
// Base44 frontend. Shares its core (auth, repo detection, backend calls) with
// the MCP server in ../lib/engram.mjs.
import { loadConfig, ensureConfig, makeClient, detectRepo, capture, recall } from "../lib/engram.mjs";

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  orange: (s) => `\x1b[38;5;208m${s}\x1b[0m`,
  blue: (s) => `\x1b[38;5;69m${s}\x1b[0m`,
  red: (s) => `\x1b[38;5;203m${s}\x1b[0m`,
  green: (s) => `\x1b[38;5;114m${s}\x1b[0m`,
  grey: (s) => `\x1b[38;5;245m${s}\x1b[0m`,
};

const KIND_COLOR = {
  decision: C.blue,
  gotcha: C.red,
  convention: C.orange,
  architecture: C.blue,
  preference: C.grey,
  fact: C.green,
};

const repo = () => process.env.ENGRAM_REPO || detectRepo();

async function cfgOrExit() {
  try {
    return await loadConfig();
  } catch {
    console.error(C.red("Not configured.") + " Run " + C.bold("engram login") + " first.");
    process.exit(1);
  }
}

async function cmdLogin() {
  const { path } = await ensureConfig();
  console.log(C.green("✓") + ` device key stored in ${C.dim(path)}`);
  console.log(C.dim("  Register it with the backend once:"));
  console.log(C.dim(`  npx base44 secrets set ENGRAM_CLI_KEY=$(node -p "require('${path}').device_key")`));
}

async function cmdLearn(text) {
  if (!text) {
    console.error('usage: engram learn "<what you learned>"');
    process.exit(1);
  }
  const cfg = await cfgOrExit();
  const r = repo();
  process.stdout.write(C.dim("  curating…"));
  const { memory, links, superseded } = await capture(cfg, {
    content: text,
    repo: r,
    agent: process.env.ENGRAM_AGENT || "claude-code",
    source: "cli",
  });
  process.stdout.write("\r\x1b[K");

  const color = KIND_COLOR[memory.kind] || C.grey;
  console.log(`${color("●")} ${C.bold(memory.summary)}`);
  console.log(`  ${color(memory.kind)} ${C.dim("·")} ${C.dim((memory.tags || []).join(" "))} ${C.dim("·")} ${C.dim(r)}`);
  for (const l of links || []) {
    const arrow = l.relation === "contradicts" ? C.red("⚠ contradicts") : C.dim(l.relation);
    console.log(`  ${C.dim("└")} ${arrow} ${C.dim(l.reason || "")}`);
  }
  if (superseded?.length) {
    console.log(`  ${C.dim("└")} ${C.orange(`retired ${superseded.length} outdated memory(ies)`)}`);
  }
  process.exit(0);
}

async function cmdRecall(query) {
  const cfg = await cfgOrExit();
  const r = repo();
  const { memories, briefing } = await recall(cfg, {
    query,
    repo: r,
    limit: 8,
    synthesize: process.argv.includes("--brief"),
  });
  if (!memories.length) {
    console.log(C.dim(`  nothing known about "${query}" in ${r} yet`));
    process.exit(0);
  }
  console.log(C.dim(`  ${memories.length} memories · ${r}\n`));
  for (const m of memories) {
    const color = KIND_COLOR[m.kind] || C.grey;
    console.log(`${color("●")} ${C.bold(m.summary)}`);
    console.log(`  ${C.dim(m.content)}`);
    console.log(`  ${color(m.kind)} ${C.dim("·")} ${C.dim((m.tags || []).join(" "))}\n`);
  }
  if (briefing) {
    console.log(C.orange("─── briefing ───"));
    console.log(briefing + "\n");
  }
  process.exit(0);
}

// Live tail — realtime works with no frontend in sight.
async function cmdWatch() {
  const cfg = await cfgOrExit();
  console.log(C.dim("  watching the constellation… ctrl-c to stop\n"));
  makeClient(cfg).entities.Memory.subscribe((event) => {
    if (event.type !== "create") return;
    const m = event.data;
    const color = KIND_COLOR[m.kind] || C.grey;
    console.log(`${C.dim(new Date().toLocaleTimeString())} ${color("●")} ${C.bold(m.summary)} ${C.dim(`(${m.author_agent})`)}`);
  });
}

const [cmd, ...rest] = process.argv.slice(2);
const arg = rest.filter((a) => !a.startsWith("--")).join(" ");

switch (cmd) {
  case "login": await cmdLogin(); break;
  case "learn": await cmdLearn(arg); break;
  case "recall": await cmdRecall(arg); break;
  case "watch": await cmdWatch(); break;
  default:
    console.log(`${C.orange("engram")} — shared memory for AI coding agents

  ${C.bold("engram learn")} "<what you learned>"   capture a memory
  ${C.bold("engram recall")} "<topic>" [--brief]   what does this codebase know?
  ${C.bold("engram watch")}                        live tail of the constellation
  ${C.bold("engram login")}                        issue a device key
`);
    process.exit(0);
}
