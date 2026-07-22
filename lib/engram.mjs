// Shared core for every headless Engram client (CLI, MCP server, scripts).
// One place that knows how to authenticate, find the repo, and talk to the
// deployed Base44 backend — so the clients stay thin.
import { createClient } from "@base44/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

export const APP_ID = process.env.ENGRAM_APP_ID || "6a5fda5325556c5e596b9d3d";
const CONFIG_PATH = join(homedir(), ".engram", "config.json");

export async function loadConfig() {
  return JSON.parse(await readFile(CONFIG_PATH, "utf8"));
}

// Issues a device key on first run and persists it 0600. Idempotent.
export async function ensureConfig() {
  await mkdir(join(homedir(), ".engram"), { recursive: true });
  let cfg = {};
  try {
    cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  } catch {
    /* first run */
  }
  cfg.app_id = cfg.app_id || APP_ID;
  cfg.device_key = cfg.device_key || randomBytes(24).toString("base64url");
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return { cfg, path: CONFIG_PATH };
}

export function makeClient(cfg) {
  return createClient({ appId: cfg.app_id || APP_ID });
}

// Match the working directory to its constellation via the git remote, so a
// checkout automatically writes to the right repo with no configuration.
export function detectRepo(cwd) {
  const opts = { stdio: ["ignore", "pipe", "ignore"], cwd: cwd || process.cwd() };
  try {
    const remote = execSync("git config --get remote.origin.url", opts).toString().trim();
    const m = remote.match(/[:/]([^/:]+\/[^/]+?)(\.git)?$/);
    if (m) return m[1];
  } catch {
    /* not a git repo */
  }
  try {
    return execSync("basename $(git rev-parse --show-toplevel 2>/dev/null || pwd)", opts)
      .toString()
      .trim();
  } catch {
    return "unassigned";
  }
}

// --- backend calls -------------------------------------------------------

export async function capture(cfg, { content, repo, scope, agent, source }) {
  const res = await makeClient(cfg).functions.invoke("capture", {
    content,
    repo,
    scope,
    agent: agent || "unknown",
    source: source || "mcp",
    device_key: cfg.device_key,
  });
  return res.data;
}

export async function recall(cfg, { query, repo, limit, synthesize }) {
  const res = await makeClient(cfg).functions.invoke("recall", {
    query: query || "",
    repo,
    limit: limit || 8,
    synthesize: Boolean(synthesize),
    device_key: cfg.device_key,
  });
  return res.data;
}
