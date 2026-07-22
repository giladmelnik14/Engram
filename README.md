# Engram

**The memory layer for the agents that build your app.** Built entirely on [Base44](https://base44.com).

> Base44 gives your app's *chat* agents memory. Engram gives the same to the agents that *build* it — every decision, gotcha, and convention your coding agent learns, captured and shared so the next session never forgets.

**Live constellation → [engram-596b9d3d.base44.app](https://engram-596b9d3d.base44.app)**

---

## The problem

AI coding agents forget everything between sessions. So they undo decisions that were made for a reason, reintroduce bugs that were already fixed, and re-litigate conventions the team already settled. It's the single most common complaint about building software with AI — and the usual workaround is a human keeping a running doc of decisions to paste into every new session.

Base44 already ships persistent memory for the **chat agents inside your app** (`memory_config` on `base44.agents`). But the agents that **build** the app are, in Base44's own words, *"stateless between invocations."* That's the gap Engram fills.

## What Engram does

Engram is a shared, living memory for a codebase's AI agents.

- **`recall`** — before an agent writes code, it asks what the codebase already knows about the topic. Returns the durable decisions, gotchas, conventions, and architecture notes that would cause a mistake if ignored.
- **`learn` / `remember`** — after an agent learns something durable, it captures it. A server-side **curator agent** classifies it, tags it, and discovers how it relates to existing memories — including when a new decision *supersedes* or *contradicts* an old one.
- **`check`** — the guardrail. An agent describes what it's *about* to do, and Engram checks it against every settled decision, returning **conflict / caution / clear**. It's the difference between memory that *remembers* and memory that *stops the regression before it ships* — e.g. "call Stripe directly from the component" → ⚠ conflict with the "route all payments through /api/payments" decision, with guidance on what to do instead.
- **`distill` (auto-capture)** — memory that captures *itself*. Pipe a session log to `engram distill` (or wire the included **Claude Code `SessionEnd` hook**) and it extracts only the durable lessons — decisions, gotchas, conventions — ignoring the chatter, and captures each through the curator. The jump from "a tool you remember to use" to "a layer that's just on."
- **The constellation** — every memory is a glowing node; every relationship a thread of light. It streams live: capture a memory in your terminal and it blooms onto the canvas in under a second. Unused memories fade over time; recalled ones grow brighter, so the map always reflects what the team actually relies on.

## One backend, three clients

Everything runs on a single Base44 backend. The same memory is reachable three ways:

| Client | What it is |
|--------|-----------|
| **Live canvas** | The constellation, streaming over Base44 realtime. Public-read, so anyone with the link watches it fill in live. |
| **CLI** | `engram learn / recall / check / distill / watch` — a plain Node CLI, no browser, straight to the backend. |
| **MCP server** | `recall` + `remember` + `check` tools so Claude Code, Cursor, and any MCP client plug into the same memory — and a `SessionEnd` hook that auto-captures. |

## Built on Base44

Engram is a showcase of how much a backend can carry. Every one of these is a Base44 primitive, deployed with one command:

- **Entities** — `Memory`, `Link`, `Repo`, `Session`, `User` (with row-level security)
- **Auth + RLS** — public-read constellations, writes locked to a signed-in user or a device key
- **Backend functions** — `capture`, `recall`, `decay` (nightly), plus maintenance functions
- **AI agent** — the `curator`, a first-class Base44 agent resource, versioned alongside the code
- **Integrations** — `InvokeLLM` for one-call classification + link discovery
- **Realtime** — `entities.Memory.subscribe()` drives the entire live canvas
- **Hosting** — the canvas is served from Base44, so backend and frontend live behind one URL

## How it's structured

```
base44/
  entities/      Memory, Link, Repo, Session, User  (.jsonc schemas)
  functions/     capture, recall, decay, purge, seed-direct  (Deno)
  agents/        curator.jsonc
  shared/        engram.ts  (auth + repo helpers shared by functions)
bin/
  engram.mjs     the CLI
  engram-mcp.mjs the MCP server
lib/
  engram.mjs     shared core (auth, repo detection, backend calls) for CLI + MCP
src/             the constellation canvas (Vite + React, framework-free renderer)
```

## Design decisions worth knowing

- **One `InvokeLLM` call per memory.** `capture` classifies *and* discovers links in a single request, so capturing a memory costs one integration credit, not two.
- **`recall` spends zero credits.** Ranking is plain code (term overlap × strength × confidence), so an agent can safely recall on every turn. Only an optional `--brief` synthesis costs a credit.
- **Memory decays.** A nightly function decays unused memories toward archival; recall reinforces the useful ones. Without this, a memory layer just becomes an append-only pile of noise.
- **The curator is honest about conflict.** `contradicts` links are surfaced, not hidden — when two memories disagree, a human should decide, and the canvas renders that edge in red.

## Running it

```bash
# 1. Scaffold + deploy the backend (one command)
npx base44 create engram --template backend-only
npx base44 entities push && npx base44 functions deploy && npx base44 agents push

# 2. The CLI
engram login                       # issues a device key
engram learn "All money routes through /api/payments for idempotency."
engram recall "payments"

# 3. The canvas
npm install && npm run build && npx base44 site deploy
```

To wire the MCP server into Claude Code or Cursor, see [`examples/mcp.json`](examples/mcp.json).

## Built on Base44 — a natural next chapter

Base44 already believes in agent memory — it ships it for the runtime. Engram explores how far that idea can go: memory for the *build* loop, built end to end on Base44's backend in a week. It's the reliability layer that makes "bring your own agent" trustworthy (agents stop regressing the app), and the accumulated decisions are a first-party dataset about how apps actually get built and fixed on Base44. Runtime memory and build memory are two halves of the same idea — and we'd love to help take it all the way, with the Base44 team.

---

Built for the Base44 Dev Build-Off, July 2026 — with Claude Code, on Base44.
