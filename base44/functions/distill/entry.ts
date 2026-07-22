// distill — auto-capture.
//
// Feed it a session log or notes; it extracts only the DURABLE lessons a future
// agent would want (decisions, gotchas, conventions, constraints) and captures
// each through the full curator — so memory captures itself instead of waiting
// for someone to remember to run `learn`.
//
// One InvokeLLM call does the extraction; each surviving lesson is then run
// through the existing `capture` function for classification, linking, and the
// live bloom. Cost = 1 + (number of lessons) integration credits.
import { createClientFromRequest } from "npm:@base44/sdk";
import { bad, resolveCaller } from "../../shared/engram.ts";

const SCHEMA = {
  type: "object",
  properties: {
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "One or two clear, self-contained sentences the reader can understand with no other context",
          },
          scope: { type: "string", description: "File path or subsystem it applies to, or empty" },
        },
        required: ["content"],
      },
    },
  },
  required: ["lessons"],
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const caller = await resolveCaller(base44, body);
    if (!caller) return bad("Sign in, or present a valid device key", 401);

    let text = String(body.text ?? "").trim();
    if (!text) return bad("text is required");
    // Keep the most recent slice if the session is huge.
    if (text.length > 24000) text = text.slice(-24000);

    const agent = body.agent || caller.identity || "claude-code";

    const prompt = `Below is a log or notes from an AI coding session on a codebase. Extract ONLY the DURABLE lessons a future agent would want to remember: decisions made, gotchas discovered, conventions established, architectural constraints.

IGNORE: task status, transient chatter, file listings, one-off values — anything not worth remembering next week. Prefer 0–6 high-signal lessons over many weak ones. Write each as one or two clear, SELF-CONTAINED sentences (the reader has no other context). If there are no durable lessons, return an empty list.

SESSION:
"""
${text}
"""`;

    const extracted: any = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: SCHEMA,
    });

    const lessons = (extracted.lessons ?? [])
      .filter((l: any) => l && typeof l.content === "string" && l.content.trim())
      .slice(0, 6);

    if (!lessons.length) {
      return Response.json({ success: true, extracted: 0, created: [] });
    }

    // Run each lesson through the real capture pipeline (curation + linking).
    // Sequential so each capture can link to the ones before it in this batch.
    const key = Deno.env.get("ENGRAM_CLI_KEY");
    const created: any[] = [];
    for (const l of lessons) {
      try {
        const res = await base44.asServiceRole.functions.invoke("capture", {
          content: l.content.trim(),
          scope: l.scope || "",
          repo: body.repo,
          agent,
          source: "cli",
          device_key: key,
        });
        if (res.data?.memory) {
          created.push({ summary: res.data.memory.summary, kind: res.data.memory.kind });
        }
      } catch (_e) {
        // One bad lesson shouldn't sink the batch.
      }
    }

    return Response.json({ success: true, extracted: lessons.length, created });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
