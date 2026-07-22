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
import { loadConfig, detectRepo, capture, recall } from "../lib/engram.mjs";

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
      "Save a durable lesson this codebase should not forget: a decision made, a gotcha discovered, a convention to follow, an architectural constraint. It is curated (classified, tagged, and linked to related memories) automatically. Do NOT save transient state or task chatter — only knowledge a future agent would want.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The lesson, in one or two clear sentences",
        },
        scope: {
          type: "string",
          description: "Optional file path or subsystem it applies to, e.g. src/payments",
        },
      },
      required: ["content"],
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
      const data = await capture(cfg, {
        content: args.content,
        repo: REPO,
        scope: args.scope,
        agent: AGENT,
        source: "mcp",
      });
      const parts = [`Remembered as [${data.memory.kind}]: ${data.memory.summary}`];
      if (data.links?.length) {
        parts.push(
          `Linked to ${data.links.length} existing memory(ies): ${data.links.map((l) => l.relation).join(", ")}.`,
        );
      }
      if (data.superseded?.length) {
        parts.push(`Retired ${data.superseded.length} outdated memory(ies) it replaced.`);
      }
      return { content: [{ type: "text", text: parts.join(" ") }] };
    }

    return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
  } catch (e) {
    const msg = e?.response?.data?.error || e?.message || String(e);
    return { content: [{ type: "text", text: `Engram error: ${msg}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error(`engram MCP server ready — repo: ${REPO}`);
