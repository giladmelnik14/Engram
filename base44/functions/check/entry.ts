// check — the guardrail.
//
// An agent (or a human) describes what it is ABOUT to do. Engram checks it
// against everything this codebase has already decided and flags anything that
// would violate, contradict, or undo a settled decision — before it ships.
//
// This is the pointy end of "shared memory that stops regressions": memory
// isn't just recalled, it actively vetoes mistakes.
import { createClientFromRequest } from "npm:@base44/sdk";
import { bad, resolveCaller, resolveRepo } from "../../shared/engram.ts";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "was", "were", "be", "to",
  "of", "in", "on", "for", "with", "how", "what", "why", "when", "do", "does",
  "we", "i", "it", "this", "that", "our", "you", "should", "can", "im", "am",
  "about", "going", "want", "add", "use", "just", "gonna", "let", "lets",
]);

function tokenize(text: string) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function score(memory: any, terms: string[]) {
  const hay = [memory.summary, memory.content, memory.scope, (memory.tags ?? []).join(" ")]
    .join(" ")
    .toLowerCase();
  let hits = 0;
  for (const term of terms) {
    if ((memory.tags ?? []).some((t: string) => t.toLowerCase() === term)) hits += 3;
    else if (hay.includes(term)) hits += 1;
  }
  return hits ? hits * (0.5 + (memory.confidence ?? 0.5)) : 0;
}

const SCHEMA = {
  type: "object",
  properties: {
    status: {
      type: "string",
      enum: ["clear", "caution", "conflict"],
      description: "conflict = clearly violates a decision; caution = touches a known gotcha/risk; clear = fine",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          memory_id: { type: "string" },
          severity: { type: "string", enum: ["conflict", "caution"] },
          reason: { type: "string", description: "why the action clashes with this memory" },
          guidance: { type: "string", description: "what to do instead" },
        },
        required: ["memory_id", "severity", "reason"],
      },
    },
  },
  required: ["status"],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const action = String(body.action ?? body.query ?? "").trim();
    if (!action) return bad("action is required");

    const admin = base44.asServiceRole;
    const repo = await resolveRepo(admin, body.repo);

    // check spends a credit (one InvokeLLM call), so it's gated. The one
    // exception is the public "demo" repo: anyone can run the guardrail there,
    // with no account, to feel it stop a real mistake before deploying their
    // own. Bounding the trial to "demo" keeps that open door from becoming an
    // open-ended cost on arbitrary repos.
    const caller = await resolveCaller(base44, body);
    if (!caller && repo.name !== "demo") {
      return bad("Sign in, or present a valid device key", 401);
    }
    const trial = !caller;

    // Credit guard for the open demo (v2). Each check is one InvokeLLM call, and the
    // demo is a public URL — a shared link or a loop could otherwise burn the
    // whole integration budget mid-judging. Cap trial checks per UTC day (the
    // counter is a hidden Repo row, so no schema change and no credit cost).
    // Authenticated callers on their own backend are never capped.
    if (trial) {
      const cap = Number(Deno.env.get("TRIAL_CHECK_DAILY_CAP") ?? "120");
      const today = new Date().toISOString().slice(0, 10);
      const [existing] = await admin.entities.Repo.filter({ name: "_trial_meter" }, null, 1);
      const meter = existing ??
        (await admin.entities.Repo.create({ name: "_trial_meter", description: today, memory_count: 0 }));
      const used = meter.description === today ? (meter.memory_count ?? 0) : 0;
      if (used >= cap) {
        return Response.json({
          status: "limited",
          trial: true,
          findings: [],
          repo: repo.name,
          note: "The public demo has hit its check limit for today. Deploy your own Engram (free, ~a minute) to keep checking your own code.",
        });
      }
      await admin.entities.Repo.update(meter.id, { description: today, memory_count: used + 1 });
    }

    const pool = await admin.entities.Memory.filter(
      { repo_id: repo.id, status: "active" },
      "-strength",
      400,
    );
    if (!pool.length) {
      return Response.json({ status: "clear", trial, findings: [], repo: repo.name, note: "No memories yet for this codebase." });
    }

    const terms = tokenize(action);
    const ranked = pool
      .map((m: any) => ({ m, s: score(m, terms) }))
      .filter((r: any) => r.s > 0)
      .sort((a: any, b: any) => b.s - a.s)
      .slice(0, 12)
      .map((r: any) => r.m);
    // Fall back to the strongest memories if nothing matched on terms — a
    // conflict can hide behind different wording.
    const candidates = ranked.length ? ranked : pool.slice(0, 10);

    const prompt = `An AI coding agent is about to do this in the ${repo.name} codebase:
"""
${action}
"""

Here is what this codebase has ALREADY decided — its shared memory:
${candidates.map((c: any) => `- id=${c.id} [${c.kind}] ${c.summary}: ${c.content}`).join("\n")}

Would the proposed action violate, contradict, or undo any of these decisions?
- "conflict": it clearly breaks a settled decision (the important case).
- "caution": it touches a known gotcha or risk but isn't a direct violation.
- "clear": no problem.

For every conflict or caution, cite the memory id, say why it clashes, and give one line of guidance on what to do instead. Use ONLY ids from the list above. Be strict about real conflicts and do not invent ones.`;

    const result: any = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: SCHEMA,
    });

    const byId = Object.fromEntries(candidates.map((c: any) => [c.id, c]));
    const findings = (result.findings ?? [])
      .filter((f: any) => byId[f.memory_id])
      .map((f: any) => ({
        memory_id: f.memory_id,
        severity: f.severity === "conflict" ? "conflict" : "caution",
        reason: f.reason ?? "",
        guidance: f.guidance ?? "",
        summary: byId[f.memory_id].summary,
        kind: byId[f.memory_id].kind,
        content: byId[f.memory_id].content,
      }));

    // Trust the findings over the model's own status label for consistency.
    let status = "clear";
    if (findings.some((f: any) => f.severity === "conflict")) status = "conflict";
    else if (findings.length) status = "caution";

    // Make the guardrail visible: stamp each flagged memory so the live canvas
    // pulses it red over realtime. Individual updates (not bulkUpdate) so the
    // subscribe stream actually fires for each one.
    if (findings.length) {
      const now = new Date().toISOString();
      await Promise.all(
        findings.map((f: any) =>
          admin.entities.Memory.update(f.memory_id, { last_flagged_at: now }).catch(() => {}),
        ),
      );
    }

    return Response.json({ status, trial, findings, repo: repo.name });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
