# The agent-in-the-loop demo (your strongest 30 seconds)

The single most convincing thing you can show a judge: an AI coding agent
**using Engram's memory to avoid a mistake in real time.** Not a diagram, not a
claim — the agent recalls, gets a conflict, and changes course. This is the shot.

There are two ways to film it. Do the **manual** one first (bulletproof, 60s to
set up); attempt the **live-agent** one if you want the extra wow.

---

## Option A — manual, bulletproof (recommended for the video)

A clean split screen: terminal on the left, the live constellation on the right.

**One-time setup**
```bash
git clone https://github.com/giladmelnik14/Engram && cd Engram && npm install
```

**The take (read the lines aloud or caption them):**

1. "Before it writes payment code, the agent asks what this codebase already decided."
   ```bash
   node bin/engram.mjs recall "payments" --demo
   ```
   → three real memories appear: route through `/api/payments`, money in cents, verify Stripe webhooks.

2. "Now it's about to take a shortcut. Watch memory stop it."
   ```bash
   node bin/engram.mjs check "call Stripe directly from the checkout component" --demo
   ```
   → **⚠ CONFLICT** — "Route every payment through /api/payments." with a one-line fix.

3. Cut to the canvas (https://engram-596b9d3d.base44.app, the `demo` repo): the
   payments decision node glowing. Close on: *"The memory that stops the regression before it ships."*

That's 20–30 seconds and it always works — no dependence on an agent behaving.

---

## Option B — live agent (the extra wow, if it cooperates)

Show Claude Code (or Cursor) actually calling the tools through MCP.

**One-time setup**
```bash
cd Engram && npm install
node bin/engram.mjs login                      # issues a device key
```
Add Engram as an MCP server, pinned to the sample memories so the conflict exists.
Copy `examples/mcp.json` into your scratch project as `.mcp.json`, set the path,
and add the repo pin:
```json
{
  "mcpServers": {
    "engram": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/Engram/bin/engram-mcp.mjs"],
      "env": { "ENGRAM_REPO": "demo" }
    }
  }
}
```
Restart Claude Code so it loads the server (you should see `recall`, `remember`,
`check` as available tools).

**The take.** In a scratch project, prompt:

> "I'm adding checkout. Before you write any payment code, use the engram `check`
> tool on your plan, then follow whatever it says."
> Plan: *call the Stripe API directly from the CheckoutButton component.*

The agent calls `check` → gets the **CONFLICT** → revises to route through a
server endpoint. Film the tool call + the conflict + the agent correcting itself.

**If the agent won't call the tool on its own**, that's fine — say so and fall
back to Option A. Judges care that the loop *works*, and the manual take proves
exactly that.

---

## Auto-capture bonus shot (optional, 10s)

Show memory that grows on its own: wire the `SessionEnd` hook
(`examples/engram-settings.json` + `engram-autocapture.sh`), end a session, and
show a new node bloom on the canvas — "it captured that lesson without being asked."

---

### Notes
- `recall --demo` is free; `check --demo` spends one integration credit and is
  capped per day (`TRIAL_CHECK_DAILY_CAP`). For filming you're the authenticated
  owner, so you're never capped — just record against the `demo` repo.
- Hard-reload the canvas before filming (Vite HMR can leave a stale renderer).
