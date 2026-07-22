// seed-direct — write pre-curated memories + links straight to the backend,
// bypassing the InvokeLLM curation step. Used to restore a demo constellation
// without spending integration credits. Device-key guarded, service-role writes.
import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    if (!Deno.env.get("ENGRAM_CLI_KEY") || body.device_key !== Deno.env.get("ENGRAM_CLI_KEY")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const admin = base44.asServiceRole;
    let [repo] = await admin.entities.Repo.filter({ name: String(body.repo || "") }, null, 1);
    if (!repo) {
      repo = await admin.entities.Repo.create({
        name: String(body.repo),
        description: body.repo_description || "",
        memory_count: 0,
      });
    }

    const created: any[] = [];
    for (const m of body.memories || []) {
      const rec = await admin.entities.Memory.create({
        content: m.content,
        summary: m.summary,
        kind: m.kind,
        tags: m.tags || [],
        repo_id: repo.id,
        source: "cli",
        author_agent: "claude-code",
        confidence: m.confidence ?? 0.7,
        strength: 1 + (m.confidence ?? 0.7),
        recall_count: 0,
        status: "active",
      });
      created.push(rec);
    }

    // Links reference memories by their index in the request array.
    for (const l of body.links || []) {
      const from = created[l.from];
      const to = created[l.to];
      if (!from || !to) continue;
      await admin.entities.Link.create({
        from_memory_id: from.id,
        to_memory_id: to.id,
        relation: l.relation || "relates_to",
        weight: l.weight ?? 0.6,
        reason: l.reason || "",
        repo_id: repo.id,
      });
    }

    await admin.entities.Repo.update(repo.id, { memory_count: created.length });
    return Response.json({ success: true, created: created.length, links: (body.links || []).length });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
