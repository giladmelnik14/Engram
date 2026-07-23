// recall — an agent asks what this codebase already knows.
//
// Scoring is done in plain code, not by an LLM: recall runs on every agent
// turn, so paying integration credits per recall would be the wrong trade.
// The optional `synthesize` flag spends one credit to write a briefing.
//
// The side effect is the interesting part. Recalling a memory reinforces it,
// which bumps `strength` — and because the canvas is subscribed to Memory,
// every recalled node visibly pulses and grows the moment an agent reads it.
import { createClientFromRequest } from "npm:@base44/sdk";
import { bad, resolveCaller, resolveRepo } from "../../shared/engram.ts";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "to",
  "of", "in", "on", "for", "with", "how", "what", "why", "when", "do", "does",
  "we", "i", "it", "this", "that", "our", "you", "should", "can",
]);

function tokenize(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Concept groups make recall match by *meaning*, not just the exact word — a
// query for "billing" or "checkout" still surfaces the "route payments through
// /api/payments" decision. This is the payoff of semantic search, done in plain
// code at query time, so recall still spends zero integration credits.
const CONCEPTS: string[][] = [
  ["payment", "payments", "pay", "billing", "charge", "stripe", "checkout", "transaction", "purchase", "refund", "invoice", "money", "price", "amount", "cents", "currency"],
  ["auth", "authentication", "authorize", "login", "signin", "signup", "session", "jwt", "token", "credential", "password", "oauth", "cookie"],
  ["database", "db", "postgres", "postgresql", "sql", "persistence", "storage", "migration"],
  ["cache", "caching", "redis", "memcached", "ttl"],
  ["realtime", "websocket", "subscribe", "subscription", "stream", "streaming", "live", "socket"],
  ["security", "secure", "xss", "csrf", "injection", "sanitize", "escape", "vulnerability"],
  ["deploy", "deployment", "release", "ship", "rollout", "pipeline", "build", "flag"],
  ["time", "timezone", "timestamp", "date", "utc", "datetime"],
  ["ratelimit", "throttle", "throttling", "quota", "abuse", "bruteforce", "stuffing"],
  ["error", "exception", "crash", "bug", "failure", "retry", "fallback"],
  ["api", "endpoint", "route", "request", "response", "rest", "webhook"],
];
const RELATED: Record<string, string[]> = {};
for (const group of CONCEPTS) {
  for (const w of group) (RELATED[w] ??= []).push(...group.filter((x) => x !== w));
}

const singular = (w: string) => (w.length > 3 ? w.replace(/s$/, "") : w);

// Expand raw query terms into weighted match terms: the term itself (and its
// singular) at full weight, related concepts at half weight.
function expand(terms: string[]): Array<[string, number]> {
  const weight = new Map<string, number>();
  const add = (t: string, w: number) => {
    if (t.length > 2) weight.set(t, Math.max(weight.get(t) ?? 0, w));
  };
  for (const t of terms) {
    add(t, 1);
    add(singular(t), 1);
    for (const rel of RELATED[t] ?? RELATED[singular(t)] ?? []) add(rel, 0.5);
  }
  return [...weight.entries()];
}

function score(memory: any, weighted: Array<[string, number]>) {
  if (!weighted.length) return memory.strength ?? 1;

  const tags = (memory.tags ?? []).map((t: string) => t.toLowerCase());
  const haystack = [
    memory.summary ?? "",
    memory.content ?? "",
    memory.scope ?? "",
    tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let hits = 0;
  for (const [term, w] of weighted) {
    if (tags.some((t: string) => t === term || singular(t) === term)) hits += 3 * w;
    else if (haystack.includes(term)) hits += 1 * w;
  }
  if (!hits) return 0;

  // Relevance first, then reinforce with how well-established the memory is.
  return hits * (1 + Math.log1p(memory.strength ?? 1)) * (0.5 + (memory.confidence ?? 0.5));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Recall reinforces the memories it returns, so it is a write in disguise
    // and needs the same gate as capture.
    // A valid caller gets the full experience: recall reinforces the memories
    // it returns (a write in disguise) and can spend a credit to synthesize.
    // With no key we don't 401 — we fall back to a read-only *trial*: real
    // results from the live constellation, but no reinforcement write and no
    // paid synthesis. That's what lets anyone try recall in one line, with no
    // account and at zero cost to us, before they deploy their own.
    const caller = await resolveCaller(base44, body);
    const trial = !caller;

    const admin = base44.asServiceRole;
    const repo = await resolveRepo(admin, body.repo);
    const limit = Math.min(25, Math.max(1, Number(body.limit ?? 8)));
    const terms = expand(tokenize(body.query ?? ""));

    const pool = await admin.entities.Memory.filter(
      { repo_id: repo.id, status: "active" },
      "-strength",
      500,
    );

    const ranked = pool
      .map((m: any) => ({ memory: m, relevance: score(m, terms) }))
      .filter((r: any) => r.relevance > 0)
      .sort((a: any, b: any) => b.relevance - a.relevance)
      .slice(0, limit);

    if (!ranked.length) {
      return Response.json({ success: true, trial, repo: repo.name, memories: [], briefing: null });
    }

    // Reinforcement and synthesis are the two things a trial can't do: one is a
    // write, the other spends a credit. A trial still gets the real ranked
    // results — it just reads without leaving a trace.
    if (!trial) {
      const now = new Date().toISOString();
      await admin.entities.Memory.bulkUpdate(
        ranked.map((r: any) => ({
          id: r.memory.id,
          // Reinforcement with diminishing returns, so a hot memory cannot
          // run away and drown out the rest of the constellation.
          strength: Math.min(12, (r.memory.strength ?? 1) + 0.4),
          recall_count: (r.memory.recall_count ?? 0) + 1,
          last_recalled_at: now,
        })),
      );
    }

    let briefing: string | null = null;
    if (body.synthesize && !trial) {
      briefing = (await base44.integrations.Core.InvokeLLM({
        prompt: `An AI coding agent is about to work on "${body.query}" in the ${repo.name} codebase.

Here is what the team already knows:
${ranked.map((r: any, i: number) => `${i + 1}. [${r.memory.kind}] ${r.memory.summary}\n   ${r.memory.content}`).join("\n")}

Write a tight briefing for the agent. Lead with anything that would cause a mistake if ignored. No preamble, no restating the question.`,
      })) as string;
    }

    return Response.json({
      success: true,
      trial,
      repo: repo.name,
      briefing,
      memories: ranked.map((r: any) => ({
        id: r.memory.id,
        summary: r.memory.summary,
        content: r.memory.content,
        kind: r.memory.kind,
        tags: r.memory.tags,
        scope: r.memory.scope,
        confidence: r.memory.confidence,
        relevance: Number(r.relevance.toFixed(2)),
      })),
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
