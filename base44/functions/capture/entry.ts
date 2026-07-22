// capture — the heart of Engram.
//
// An agent sends one raw sentence it just learned. This function curates it:
// classifies the memory, tags it, finds which existing memories it relates to,
// and notices when it contradicts or supersedes something already known.
//
// Deliberately ONE InvokeLLM call: classification and link discovery share a
// single prompt. Splitting them would double the integration-credit cost per
// captured memory for no extra signal.
import { createClientFromRequest } from "npm:@base44/sdk";
import { KINDS, RELATIONS, bad, resolveCaller, resolveRepo, refreshRepoCount } from "../../shared/engram.ts";

const CURATION_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "One line, under 90 characters, imperative and concrete",
    },
    kind: { type: "string", enum: [...KINDS] },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "2-5 lowercase topic tags, e.g. auth, caching, migrations",
    },
    scope: {
      type: "string",
      description: "File path or subsystem this applies to, or empty if general",
    },
    confidence: {
      type: "number",
      description: "0-1. How durable is this? A one-off debug note is low, an architectural rule is high",
    },
    links: {
      type: "array",
      description: "Connections to the candidate memories. Omit weak or obvious ones.",
      items: {
        type: "object",
        properties: {
          target_id: { type: "string" },
          relation: { type: "string", enum: [...RELATIONS] },
          weight: { type: "number", description: "0-1 strength of the connection" },
          reason: { type: "string", description: "Short phrase shown on hover" },
        },
        required: ["target_id", "relation"],
      },
    },
  },
  required: ["summary", "kind", "tags", "confidence"],
};

function buildPrompt(content: string, scope: string, candidates: any[]) {
  const candidateBlock = candidates.length
    ? candidates
        .map((c) => `- id=${c.id} [${c.kind}] ${c.summary ?? ""} (tags: ${(c.tags ?? []).join(", ") || "none"})`)
        .join("\n")
    : "(none yet — this is the first memory for this codebase)";

  return `You are the curator of a shared memory for AI coding agents working on one codebase.

An agent just learned something. Curate it.

NEW MEMORY:
"""
${content}
"""
${scope ? `\nThe agent says this concerns: ${scope}` : ""}

EXISTING MEMORIES IN THIS CODEBASE:
${candidateBlock}

Your job:
1. Write a sharp one-line summary. No filler, no "the agent learned that".
2. Classify it into exactly one kind.
3. Tag it with 2-5 lowercase topic tags, reusing tags from existing memories where they genuinely fit — shared tags are what cluster the constellation.
4. Judge confidence: how durable is this knowledge? Architectural rules and team conventions are high. Transient debugging observations are low.
5. Link it to existing memories, using ONLY ids from the list above.
   - "supersedes": the new memory replaces an outdated one. Use this sparingly and only when they genuinely conflict about the same thing.
   - "contradicts": they disagree and a human should decide. This is valuable — do not shy away from it.
   - "refines": the new memory adds nuance to an existing one.
   - "depends_on" / "relates_to": weaker topical connections.
   Prefer 0-4 high-quality links over many weak ones. If nothing genuinely connects, return an empty list.`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));

    const caller = await resolveCaller(base44, body);
    if (!caller) return bad("Sign in, or present a valid device key", 401);

    const content = String(body.content ?? "").trim();
    if (!content) return bad("content is required");
    if (content.length > 4000) return bad("content is too long (max 4000 chars)");

    const admin = base44.asServiceRole;
    const repo = await resolveRepo(admin, body.repo);

    // Candidate pool for link discovery. Capped so the prompt stays small
    // and predictable as a codebase's lore grows into the thousands.
    const candidates = await admin.entities.Memory.filter(
      { repo_id: repo.id, status: "active" },
      "-strength",
      40,
      0,
      ["id", "summary", "kind", "tags", "scope"],
    );

    const curated: any = await base44.integrations.Core.InvokeLLM({
      prompt: buildPrompt(content, String(body.scope ?? ""), candidates),
      response_json_schema: CURATION_SCHEMA,
    });

    const confidence = Math.min(1, Math.max(0, Number(curated.confidence ?? 0.5)));

    const memory = await admin.entities.Memory.create({
      content,
      summary: curated.summary ?? content.slice(0, 90),
      kind: KINDS.includes(curated.kind) ? curated.kind : "fact",
      tags: Array.isArray(curated.tags) ? curated.tags.slice(0, 5) : [],
      scope: String(body.scope ?? curated.scope ?? ""),
      repo_id: repo.id,
      source: body.source ?? "cli",
      session_id: body.session_id ?? "",
      author_agent: body.agent ?? caller.identity ?? "unknown",
      confidence,
      // Confident memories are born brighter on the canvas.
      strength: 1 + confidence,
      recall_count: 0,
      status: "active",
    });

    // Only link to candidates we actually offered the model — this guards
    // against hallucinated ids creating edges into nothing.
    const validIds = new Set(candidates.map((c: any) => c.id));
    const proposed = Array.isArray(curated.links) ? curated.links : [];
    const links = proposed
      .filter((l: any) => validIds.has(l.target_id) && RELATIONS.includes(l.relation))
      .slice(0, 6)
      .map((l: any) => ({
        from_memory_id: memory.id,
        to_memory_id: l.target_id,
        relation: l.relation,
        weight: Math.min(1, Math.max(0, Number(l.weight ?? 0.5))),
        reason: String(l.reason ?? ""),
        repo_id: repo.id,
      }));

    if (links.length) await admin.entities.Link.bulkCreate(links);

    // A supersede is a real state change, not just an edge: the old memory
    // fades on the canvas instead of quietly lingering as active truth.
    const superseded = links.filter((l: any) => l.relation === "supersedes");
    for (const l of superseded) {
      await admin.entities.Memory.update(l.to_memory_id, {
        status: "superseded",
        superseded_by: memory.id,
      });
    }

    const memoryCount = await refreshRepoCount(admin, repo.id);

    return Response.json({
      success: true,
      memory,
      links,
      superseded: superseded.map((l: any) => l.to_memory_id),
      repo: { id: repo.id, name: repo.name, memory_count: memoryCount },
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
