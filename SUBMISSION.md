# Engram — Base44 Dev Build-Off submission

Ready-to-paste answers for the submission form at backendcompetition.base44.app/submit.

---

## Section 1 — Submission

**Project title:** Engram

**One-line pitch:** The memory layer for the agents that build your app — so your Base44 coding agents stop forgetting decisions and regressing your app.

**Surface type:** Web app (with a CLI and an MCP server on the same backend)

**Live URL:** https://engram-596b9d3d.base44.app

**GitHub repo:** https://github.com/giladmelnik14/Engram  (public ✓)

**Demo video URL:** (2–3 min — see script below)

**Agentic IDE used:** Claude Code

**Base44 App ID:** 6a5fda5325556c5e596b9d3d

### Project write-up (scored under documentation)

**The gap.** AI coding agents forget everything between sessions. They undo decisions made for a reason, reintroduce fixed bugs, and re-litigate settled conventions. It is the most common failure mode of building software with AI, and the community's workaround is a human hand-maintaining a doc of decisions to paste into every new session.

Base44 already ships persistent memory — but for the **chat agents inside a shipped app** (`memory_config` on `base44.agents`). The agents that **build** the app are, per Base44's own docs, *"stateless between invocations."* Engram fills exactly that missing quadrant: dynamic, learned, cross-session memory for the building agent, hosted at the backend where the app actually lives.

**What it does.** A server-side curator agent turns each raw lesson into a classified, tagged memory and discovers how it relates to what's already known — including when a new decision supersedes or contradicts an old one. The full loop: an agent `recall`s before it writes, `check`s a proposed change against every settled decision (returning **conflict / caution / clear** — the guardrail that stops a regression *before* it ships), `remember`s what it learns, and `distill` even captures memories automatically from a whole session (a Claude Code `SessionEnd` hook), so the memory grows on its own. Unused memories decay; recalled ones strengthen. The result is a living map that always reflects what the codebase actually relies on.

**How it's built.** One Base44 backend carries the whole thing — five entities with row-level security, four backend functions, a first-class curator agent, `InvokeLLM` for one-call curation, realtime for the live canvas, and Base44 hosting for the frontend, all in a single deploy. Three clients share that backend: the live constellation canvas, a zero-dependency CLI, and an MCP server so Claude Code and Cursor plug into the same memory.

**Why it belongs on Base44.** Runtime memory and build memory are two halves of the same idea, and Base44 only had one. Engram is the reliability layer that makes "bring your own agent" trustworthy — agents stop regressing the app — and the accumulated decisions are a first-party dataset about how apps get built and fixed on Base44. It was built end to end with Claude Code on Base44, and its hero constellation is the real memory of its own build.

**Marketing consent:** Yes.

---

## Section 2 — Backend features used (checklist)

- [x] **Entities / Database** — Memory, Link, Repo, Session, User
- [x] **Authentication** — user auth + a device-key layer for headless clients
- [x] **Row-Level Security** — public-read constellations, locked-down writes
- [x] **Backend functions** — capture, recall, decay, purge, seed-direct
- [x] **AI agents** — the `curator` (classifies, tags, links, answers questions)
- [x] **Integrations (InvokeLLM)** — one-call classification + link discovery
- [x] **Realtime** — `entities.Memory.subscribe()` drives the live canvas
- [x] **Secrets** — device-key stored as an app secret
- [x] **Hosting** — the canvas is served from Base44
- [x] **CLI / MCP** — built on the Base44 CLI + SDK, plus a custom MCP server

---

## Section 3 — BaaS feedback (constructive, for the team)

Genuinely a pleasure to build on — the backend-first template plus the AI-agent skills meant the whole product went up in a day. A few honest findings from pushing it hard as a headless/agent workload, offered as fixes worth making:

1. **No app-level API key / service account.** App auth is humans-only (email + Google), so a headless client (CLI, MCP server, cron) has no first-class way to authenticate. I worked around it with a device-key layer in Secrets, but a native machine credential would make the "bring your own agent" story much smoother.
2. **`entities push` is a full sync that can delete the built-in User.** Running it without a local `user.jsonc` silently removed the User entity (and with it, everything auth depends on). A guard or confirmation before deleting a built-in would prevent a nasty surprise.
3. **Realtime `subscribe()` fires on `create()` but not `bulkCreate()`.** New rows written in bulk don't emit realtime events, so a live UI misses them without a manual re-fetch. Consistent behavior across single and bulk writes would be ideal.
4. **`base44 exec` requires a local Deno install** with no obvious heads-up; falling back to the Node SDK worked, but a clearer prerequisite note would help.
5. **Integration-credit limits are easy to hit while iterating, and the failure is abrupt.** The free tier's 100 integration credits went fast during an agent-heavy build (each curation is one `InvokeLLM` call), and hitting the ceiling returns a hard "upgrade your plan" error mid-run with no warning. Two things would smooth this a lot: (a) surfacing remaining credits in the CLI / SDK response so a build can pace itself, and (b) a soft-warning as the balance runs low rather than a cliff. For agent workloads that call integrations in a loop, predictability here matters.

None of these slowed the result down — they're the kind of edges you only find by building something real, and I'm happy to go deeper on any of them.

---

## GitHub repo checklist — DONE ✓

- [x] Committed the project (5 commits)
- [x] Created a **public** GitHub repo: https://github.com/giladmelnik14/Engram
- [x] No secrets committed (verified — no node_modules, .env, or credentials)
- [x] Pushed via GitHub Desktop

## Demo video script (2–3 min)

1. **0:00 — the hook.** Open the live URL. The intro card states the pitch; the constellation builds itself; open "how it works" briefly.
2. **0:40 — the live moment.** Split screen: terminal + canvas. Run `engram learn "…"`. The node blooms on the canvas in real time, threads stretch to related memories. (Needs integration credits — confirm they're replenished after enrolling.)
3. **1:20 — the agent angle.** Show the MCP server: an agent in Cursor/Claude Code calls `recall` before working and `remember` after. Same memory, different client.
4. **2:00 — the payoff.** Zoom the constellation; note it's the real memory of building Engram on Base44. Close on: one backend, three clients, the memory Base44 was missing.
