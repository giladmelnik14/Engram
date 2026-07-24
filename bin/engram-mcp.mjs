#!/usr/bin/env node
// Engram MCP server.
//
// Exposes a codebase's shared memory to ANY MCP client — Claude Code, Cursor,
// Windsurf, Zed. The agent calls `recall` before it works and `remember` when
// it learns something durable. Every memory is curated server-side on Base44
// and lands live on the constellation the moment it's written.
//
// This is the third client on one Base44 backend (CLI, canvas, and now MCP) —
// the whole "any frontend, any agent, one backend" thesis in one binary.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, detectRepo, capture, captureDirect, recall, check, revise } from "../lib/engram.mjs";

// The client may set ENGRAM_REPO; otherwise we infer it from the git remote of
// the directory the MCP client launched us in.
const REPO = process.env.ENGRAM_REPO || detectRepo();
const AGENT = process.env.ENGRAM_AGENT || "mcp-agent";

let cfg;
try {
  cfg = await loadConfig();
} catch {
  console.error(
    "engram: not configured. Run `engram login` once, then register the key with the backend.",
  );
  process.exit(1);
}

const TOOLS = [
  {
    name: "recall",
    description:
      "Recall what this codebase's team and agents have already learned about a topic BEFORE writing code. Returns durable decisions, gotchas, conventions, and architecture notes — the things that would cause a mistake if ignored. Call this at the start of any non-trivial task.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What you're about to work on, e.g. 'payments' or 'database migrations'",
        },
        brief: {
          type: "boolean",
          description: "If true, also return a synthesized briefing paragraph (costs one LLM call)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "remember",
    description:
      "Save a durable lesson this codebase should not forget: a decision made, a gotcha discovered, a convention to follow, an architectural constraint. YOU classify it yourself (kind, summary, tags) — that keeps the write free of LLM cost. Do NOT save transient state or task chatter — only knowledge a future agent would want.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The full lesson, in one or two clear sentences",
        },
        summary: {
          type: "string",
          description: "A one-line distillation (max ~70 chars) — becomes the node label",
        },
        kind: {
          type: "string",
          enum: ["decision", "gotcha", "convention", "architecture", "preference", "fact"],
          description: "What kind of lesson this is",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "2-4 lowercase topic tags, e.g. ['payments','stripe']",
        },
        scope: {
          type: "string",
          description: "Optional file path or subsystem it applies to, e.g. src/payments",
        },
      },
      required: ["content", "summary", "kind"],
    },
  },
  {
    name: "revise",
    description:
      "Deliberately update the codebase's memory when a settled rule no longer applies (a regulation changed, a decision was reversed, an approach was replaced). Retires the old rule, and optionally records its replacement. Use this instead of `remember` when the new lesson CONTRADICTS an existing one — never leave two contradicting rules active. Confirm with the user before revising a settled decision.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Words identifying the OLD rule to retire, e.g. 'route payments through /api/payments'",
        },
        replacement_content: {
          type: "string",
          description: "The new rule, one or two sentences. Omit to just retire the old rule.",
        },
        replacement_summary: {
          type: "string",
          description: "One-line distillation of the new rule (required with replacement_content)",
        },
        replacement_kind: {
          type: "string",
          enum: ["decision", "gotcha", "convention", "architecture", "preference", "fact"],
          description: "Kind of the new rule (required with replacement_content)",
        },
        replacement_tags: {
          type: "array",
          items: { type: "string" },
          description: "2-4 lowercase topic tags for the new rule",
        },
      },
      required: ["target"],
    },
  },
  {
    name: "check",
    description:
      "Before you make a non-trivial change, describe what you are ABOUT to do and this checks it against everything the codebase has already decided. Returns status 'conflict' if it would violate or undo a settled decision (STOP and reconsider), 'caution' if it touches a known gotcha, or 'clear'. Use this to avoid regressing the app or re-litigating settled conventions.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "What you are about to do, in plain language, e.g. 'call the Stripe API directly from the checkout component'",
        },
      },
      required: ["action"],
    },
  },
];

const server = new Server(
  { name: "engram", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (name === "recall") {
      const data = await recall(cfg, {
        query: args.query,
        repo: REPO,
        synthesize: args.brief,
      });
      if (!data.memories?.length) {
        return { content: [{ type: "text", text: `No memories yet about "${args.query}" in ${REPO}.` }] };
      }
      const lines = data.memories.map(
        (m, i) => `${i + 1}. [${m.kind}] ${m.summary}\n   ${m.content}${m.scope ? `\n   scope: ${m.scope}` : ""}`,
      );
      const text = [
        data.briefing ? `Briefing:\n${data.briefing}\n` : "",
        `What ${REPO} knows about "${args.query}":\n`,
        lines.join("\n"),
      ].join("\n");
      return { content: [{ type: "text", text }] };
    }

    if (name === "remember") {
      // The calling model classified the lesson itself, so we write through the
      // zero-credit direct path — no server-side LLM involved.
      if (args.summary && args.kind) {
        await captureDirect(cfg, {
          content: args.content,
          summary: args.summary,
          kind: args.kind,
          tags: args.tags,
          repo: REPO,
          agent: AGENT,
        });
        return {
          content: [{ type: "text", text: `Remembered as [${args.kind}]: ${args.summary} (${REPO})` }],
        };
      }
      // Fallback: server-side curation (costs one integration credit).
      const data = await capture(cfg, {
        content: args.content,
        repo: REPO,
        scope: args.scope,
        agent: AGENT,
        source: "mcp",
      });
      return {
        content: [{ type: "text", text: `Remembered as [${data.memory.kind}]: ${data.memory.summary}` }],
      };
    }

    if (name === "revise") {
      const hasReplacement = args.replacement_content && args.replacement_summary && args.replacement_kind;
      const data = await revise(cfg, {
        repo: REPO,
        targetQuery: args.target,
        action: hasReplacement ? "revise" : "forget",
        replacement: hasReplacement
          ? {
              content: args.replacement_content,
              summary: args.replacement_summary,
              kind: args.replacement_kind,
              tags: args.replacement_tags,
            }
          : undefined,
        agent: AGENT,
      });
      if (data.ambiguous) {
        const list = data.candidates.map((c) => `- ${c.summary} [${c.kind}]`).join("\n");
        return {
          content: [{ type: "text", text: `More than one memory matches "${args.target}". Call revise again with more specific target words:\n${list}` }],
        };
      }
      const parts = [`Retired: ${data.retired.summary}`];
      if (data.replacement) parts.push(`Replaced by: ${data.replacement.summary}`);
      return { content: [{ type: "text", text: parts.join(" · ") + ` (${REPO})` }] };
    }

    if (name === "check") {
      const data = await check(cfg, { action: args.action, repo: REPO });
      if (data.status === "clear") {
        return { content: [{ type: "text", text: `✓ CLEAR — nothing in ${REPO} conflicts with that.` }] };
      }
      const head = data.status === "conflict" ? "⚠ CONFLICT" : "⚠ CAUTION";
      const body = (data.findings || [])
        .map((f) => {
          let s = `- [${f.severity}] ${f.summary}\n  why: ${f.reason}${f.guidance ? `\n  instead: ${f.guidance}` : ""}`;
          // The advisory: tell the user which way is better, in plain terms.
          if (f.advice) {
            s += f.prefer === "proposed"
              ? `\n  RECOMMENDATION: the newly proposed approach is better. ${f.advice} If the user confirms this change is intentional, use the revise tool to update the rule.`
              : `\n  RECOMMENDATION: stick with the settled rule. ${f.advice}`;
          }
          return s;
        })
        .join("\n");
      const lead = data.status === "conflict"
        ? "This contradicts a decision this codebase already made. Surface this to the user with the recommendation below:"
        : "This touches something the codebase already knows about:";
      return { content: [{ type: "text", text: `${head} — ${lead}\n${body}` }] };
    }

    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  } catch (e) {
    const msg = e?.response?.data?.error || e?.message || String(e);
    return { content: [{ type: "text", text: `Engram error: ${msg}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error(`engram MCP server ready — repo: ${REPO}`);
