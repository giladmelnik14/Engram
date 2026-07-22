# Engram — demo video director's script (~2:30)

Everything below is staged and tested. Follow the shots; the commands are copy-paste ready.

## Before you hit record

- **Browser:** open https://engram-596b9d3d.base44.app and **hard-refresh (Cmd+Shift+R)** right before recording so the intro card plays from the top. Desktop window, full screen.
- **Terminal:** `cd ~/development/acme-checkout`, then `clear`. Use a big font (18pt+). The `engram` command is global and auto-detects this folder as the `acme/checkout` codebase.
- **(Optional) Cursor / Claude Code** open, for the MCP beat. If you'd rather skip it, the script has a fallback.
- **Recorder:** 1440p / 30fps. QuickTime, Loom, or CleanShot all fine.
- Keep it **under 3 minutes**. Voiceover is best; if you'd rather not speak, put each VO line on screen as a caption.

## Commands to have ready (copy-paste)

```bash
engram recall "payments"
engram learn "Refunds must go through the same /api/payments path — never call the provider directly, or retries double-charge."
```

---

## Shot 1 — The hook  ·  0:00–0:18

**On screen:** the fresh live site. The intro card is up.
**VO:** "Every AI coding agent forgets everything between sessions — so it undoes decisions and reintroduces bugs you already fixed. Engram fixes that. It's a shared memory for the agents that *build* your app. And it's built entirely on Base44."
**Action:** let the intro card sit for its few seconds, then it dismisses on its own and the constellation begins to build.

## Shot 2 — Watch it build itself  ·  0:18–0:48

**On screen:** the replay — nodes bloom in one by one with the narration toasts.
**VO:** "This is the real memory of building Engram itself. Every node is a decision, a gotcha, a convention the agent learned — captured, classified, and linked automatically by a Base44 AI agent."
**Action:** after ~5 nodes, click **how it works**, let it show for ~4 seconds.
**VO (over the panel):** "Colour is the kind of memory. Size shows how often it's recalled. Threads are the relationships the curator found. And it all streams live."
**Action:** close the panel.

## Shot 3 — THE LIVE MOMENT (the hero shot)  ·  0:48–1:40

**Action:** click the **acme/checkout** chip in the top bar — the canvas switches to a normal app's constellation. Arrange terminal + browser side by side if you can.
**Action (terminal):** run `engram recall "payments"`.
**VO:** "Before an agent writes code, it asks what this codebase already knows." *(the terminal prints the payment rules)*
**Action (terminal):** run the `engram learn "Refunds must go through…"` command.
**VO:** "And when it learns something new, it remembers it."
**Action:** cut/look to the **canvas** — the new node **blooms in with a ripple**, a thread stretches to the payments memory, the counter ticks up.
**VO:** "That landed on the shared map live — under a second, over Base44 realtime. Every other agent, and every teammate, now knows it too."

## Shot 4 — The agent angle (MCP)  ·  1:40–2:05

**Action:** in Cursor / Claude Code, show the agent calling the **recall** tool (or show `examples/mcp.json` and a quick recall).
**VO:** "It isn't just a CLI. Engram is an MCP server — so Claude Code and Cursor plug into the exact same memory. One backend, many clients."
**Fallback if not filming an IDE:** stay on the canvas and say the same line while showing `examples/mcp.json` in your editor for two seconds.

## Shot 5 — The payoff / close  ·  2:05–2:30

**Action:** switch back to the **engram** codebase; let the full constellation sit, slowly.
**VO:** "One Base44 backend — entities, auth, row-level security, functions, an AI agent, realtime, hosting. Base44 already gives your app's *chat* agents memory. Engram gives the same to the agents that *build* it — the half that was missing."
**End card:** the constellation with the URL `engram-596b9d3d.base44.app`.

---

## Notes

- The `engram learn` command costs one integration credit and adds one node to the acme/checkout constellation — expected, and it makes the bloom + thread land on an existing graph, which looks better than an empty one.
- If a take goes wrong, just hard-refresh and start again; the data is stable.
- Want a second live capture for rhythm? A good one:
  `engram learn "Rate limits are per-API-key in Redis, not per-IP, so shared office IPs are fine."`
