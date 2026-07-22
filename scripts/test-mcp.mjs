// Drives the Engram MCP server over stdio exactly as Claude Code / Cursor would,
// proving the third client works end to end.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const transport = new StdioClientTransport({
  command: "node",
  args: [join(root, "bin", "engram-mcp.mjs")],
  env: { ...process.env, ENGRAM_REPO: "acme/checkout", ENGRAM_AGENT: "cursor" },
});

const client = new Client({ name: "engram-test", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS:", tools.map((t) => t.name).join(", "));

console.log("\n--- recall 'payments' ---");
const r = await client.callTool({ name: "recall", arguments: { query: "payments" } });
console.log(r.content[0].text);

console.log("\n--- remember (new lesson from Cursor) ---");
const m = await client.callTool({
  name: "remember",
  arguments: {
    content: "Webhook handlers must be idempotent — Stripe retries the same event up to 3 times, key off event.id.",
    scope: "src/webhooks",
  },
});
console.log(m.content[0].text);

await client.close();
process.exit(0);
