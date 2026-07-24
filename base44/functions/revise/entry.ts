// revise — the missing piece of the memory lifecycle: deliberately retire an
// outdated rule (`forget`), or replace it with an updated version (`revise`).
// Decay handles rules nobody uses; this handles rules a human decided are
// wrong or obsolete — "the regulation changed" case.
//
// Device-key guarded, service-role writes, zero integration credits: the
// caller supplies the replacement pre-classified.
import { createClientFromRequest } from "npm:@base44/sdk";
import { bad, resolveRepo } from "../../shared/engram.ts";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "is", "are", "to", "of", "in", "on",
  "for", "with", "we", "it", "this", "that",
]);
const tokenize = (t: string) =>
  String(t ?? "").toLowerCase().split(/[^a-z0-9_./-]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const expected = Deno.env.get("ENGRAM_CLI_KEY");
    if (!expected || body.device_key !== expected) {
      return bad("unauthorized", 401);
    }

    const admin = base44.asServiceRole;
    const repo = await resolveRepo(admin, body.repo);
    const action = body.action === "revise" ? "revise" : "forget";

    // Resolve the target memory: by id when given, otherwise by best match on
    // the query. Ambiguity is returned to the caller instead of guessed at.
    let target: any = null;
    if (body.target_id) {
      target = await admin.entities.Memory.get(String(body.target_id)).catch(() => null);
      if (!target || target.repo_id !== repo.id) return bad("no such memory in this repo", 404);
    } else {
      const terms = tokenize(body.target_query ?? "");
      if (!terms.length) return bad("target_id or target_query is required");
      const pool = await admin.entities.Memory.filter(
        { repo_id: repo.id, status: "active" }, "-strength", 500,
      );
      const scored = pool
        .map((m: any) => {
          const hay = [m.summary, m.content, (m.tags ?? []).join(" ")].join(" ").toLowerCase();
          const hits = terms.filter((t) => hay.includes(t)).length;
          return { m, hits };
        })
        .filter((s: any) => s.hits > 0)
        .sort((a: any, b: any) => b.hits - a.hits);
      if (!scored.length) return bad("no memory matches that query", 404);
      // If the runner-up matches just as well, make the caller choose.
      if (scored.length > 1 && scored[1].hits === scored[0].hits) {
        return Response.json({
          ambiguous: true,
          candidates: scored.slice(0, 5).map((s: any) => ({
            id: s.m.id, summary: s.m.summary, kind: s.m.kind,
          })),
        });
      }
      target = scored[0].m;
    }

    // Retire the old rule. It fades on the canvas instead of vanishing —
    // history stays visible, like a struck-through line in a ledger.
    await admin.entities.Memory.update(target.id, { status: "superseded" });

    let replacement: any = null;
    if (action === "revise") {
      const r = body.replacement ?? {};
      if (!r.content || !r.summary || !r.kind) {
        return bad("replacement needs content, summary and kind");
      }
      replacement = await admin.entities.Memory.create({
        content: r.content,
        summary: r.summary,
        kind: r.kind,
        tags: r.tags ?? target.tags ?? [],
        repo_id: repo.id,
        source: String(body.source || "cli"),
        author_agent: String(body.agent || "claude-code"),
        confidence: 0.8,
        strength: 1.8,
        recall_count: 0,
        status: "active",
      });
      await admin.entities.Memory.update(target.id, { superseded_by: replacement.id });
      await admin.entities.Link.create({
        from_memory_id: replacement.id,
        to_memory_id: target.id,
        relation: "supersedes",
        weight: 0.9,
        reason: "deliberate revision by the team",
        repo_id: repo.id,
      });
    }

    return Response.json({
      success: true,
      action,
      retired: { id: target.id, summary: target.summary },
      replacement: replacement ? { id: replacement.id, summary: replacement.summary } : null,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
