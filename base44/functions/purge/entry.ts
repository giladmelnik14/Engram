// purge — maintenance: clear one repo's memories and links.
// Device-key guarded, service-role writes. Used to re-seed a demo repo cleanly.
import { createClientFromRequest } from "npm:@base44/sdk";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const expected = Deno.env.get("ENGRAM_CLI_KEY");
    if (!expected || body.device_key !== expected) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const admin = base44.asServiceRole;
    const [repo] = await admin.entities.Repo.filter({ name: String(body.repo || "") }, null, 1);
    if (!repo) return Response.json({ error: "no such repo" }, { status: 404 });

    const links = await admin.entities.Link.filter({ repo_id: repo.id }, null, 5000);
    const mems = await admin.entities.Memory.filter({ repo_id: repo.id }, null, 5000);
    for (const l of links) await admin.entities.Link.delete(l.id);
    for (const m of mems) await admin.entities.Memory.delete(m.id);
    await admin.entities.Repo.update(repo.id, { memory_count: 0 });

    return Response.json({ success: true, deleted_memories: mems.length, deleted_links: links.length });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
