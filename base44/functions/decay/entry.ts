// decay — memory that is never recalled should fade.
//
// Without this, Engram is an append-only log that grows into noise. With it,
// the constellation stays honest: bright regions are the lore the team
// actually leans on, dim regions are drifting out of relevance.
//
// Costs zero integration credits. Safe to run on a schedule.
import { createClientFromRequest } from "npm:@base44/sdk";

const FLOOR = 0.15;     // below this a memory is archived rather than shown
const RATE = 0.93;      // per-run multiplier

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const admin = base44.asServiceRole;

    const body = await req.json().catch(() => ({}));
    const dryRun = Boolean(body.dry_run);

    const active = await admin.entities.Memory.list("-strength", 5000);

    const updates: any[] = [];
    const archived: string[] = [];

    for (const m of active) {
      if (m.status !== "active") continue;

      // High-confidence knowledge decays more slowly — a team convention
      // stays true even during a week when nobody happens to ask about it.
      const resistance = 1 - (m.confidence ?? 0.5) * 0.5;
      const next = Number(((m.strength ?? 1) * (1 - (1 - RATE) * resistance)).toFixed(4));

      if (next < FLOOR) {
        archived.push(m.id);
        updates.push({ id: m.id, strength: next, status: "archived" });
      } else {
        updates.push({ id: m.id, strength: next });
      }
    }

    if (!dryRun && updates.length) {
      await admin.entities.Memory.bulkUpdate(updates);
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      evaluated: updates.length,
      archived: archived.length,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
