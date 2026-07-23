import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Constellation, KIND_COLORS } from "@/constellation";
import Cinematic from "@/Cinematic";

const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

const LEGEND = [
  ["architecture", "Architecture"],
  ["decision", "Decision"],
  ["convention", "Convention"],
  ["gotcha", "Gotcha"],
  ["fact", "Fact"],
];

// The guided explainer that plays on entry — what you're looking at, what it
// does, how to use it, and a closing note written for the Base44 team.
const STORY = [
  {
    eyebrow: "The problem",
    title: "Yesterday the AI fixed the bug.\nToday it broke it again.",
    body: "AI coding assistants forget everything between sessions — so they undo decisions and reintroduce bugs you already fixed. Everyone building with AI hits this wall.",
    ms: 8500,
  },
  {
    eyebrow: "The fix — what you're looking at",
    title: "A living memory for your AI",
    body: "Every glowing dot is one thing the AI learned while building this app — a decision it made, a mistake it learned to avoid, a rule it now follows. The lines connect ideas that belong together. You don't need to read them all — just watch the memory take shape.",
    ms: 10500,
  },
  {
    eyebrow: "What it does",
    title: "Recall · Check · Remember",
    body: "Before it writes code, the AI recalls what's already been decided. Before it changes something, it checks for conflicts — and gets stopped if it would undo a past decision. After it learns, it remembers. It can even capture lessons from a whole session on its own.",
    ms: 12000,
    emphasis: "recall",
  },
  {
    eyebrow: "How you use it",
    title: "Plug in any AI, in minutes",
    body: "Connect it to Claude Code or Cursor, or use one simple command. It's a single Base44 project — database, login, logic, realtime and hosting all included — so your AI shares one brain in seconds. (Tap “use it yourself” any time.)",
    ms: 11000,
    emphasis: "mcp",
  },
  {
    eyebrow: "For the Base44 team",
    title: "Built on Base44 — imagine it native",
    body: "Base44 already gives the chat assistants inside apps a memory. We wondered how far that idea could go, and built this on your backend in a few days. Imagine it as part of the platform: every AI-built app more reliable, ‘bring your own agent’ turned into a real moat, and a first-party record of how apps actually get built. We'd love to take it there — together.",
    ms: 13000,
    accent: true,
  },
];

export default function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const [repos, setRepos] = useState([]);
  const [repoId, setRepoId] = useState(null);
  const [counts, setCounts] = useState({ memories: 0, links: 0, active: 0 });
  const [tip, setTip] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [ready, setReady] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [showCinematic, setShowCinematic] = useState(true);
  const [showStory, setShowStory] = useState(false);
  const [storyStep, setStoryStep] = useState(0);
  const [showAbout, setShowAbout] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [tryOpen, setTryOpen] = useState(false);
  const [tryMode, setTryMode] = useState("recall"); // "recall" | "check"
  const [tryInput, setTryInput] = useState("");
  const [tryResult, setTryResult] = useState(null);
  const [tryLoading, setTryLoading] = useState(false);
  const [activeKind, setActiveKind] = useState(null);
  const [search, setSearch] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [showClarity, setShowClarity] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [showMenu, setShowMenu] = useState(false);

  const repo = repos.find((r) => r.id === repoId) || null;

  // Keep the freshest rows around so a realtime event can re-run layout.
  const store = useRef({ memories: new Map(), links: new Map() });
  const allRef = useRef({ memories: [], links: [] }); // every repo's data
  const dataRef = useRef({ memories: [], links: [] }); // the selected repo, for replay
  const repoIdRef = useRef(null); // current selection, readable inside async loops
  const skipRef = useRef(false);
  const startedRef = useRef(false); // replay begins once, after the intro
  const hintShownRef = useRef(false); // the "hover to explore" hint shows once
  const flashSeenRef = useRef(new Map()); // memory id -> last_flagged_at already pulsed
  const revealTimerRef = useRef(null); // the one-shot "build the constellation" timer
  const tryOpenRef = useRef(false); // is the in-page console open (poll stays quiet if so)

  const pushToast = (t) => {
    const id = `${t.kind}-${t.summary}-${performance.now()}`;
    let added = false;
    setToasts((prev) => {
      // Don't stack the same event twice (e.g. a click and the safety-poll both
      // reporting one conflict) — one banner per distinct message at a time.
      if (prev.some((p) => p.event === t.event && p.summary === t.summary)) return prev;
      added = true;
      return [...prev, { ...t, id }].slice(-3);
    });
    if (added) setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200);
  };

  const sync = () => {
    const memories = [...store.current.memories.values()];
    const links = [...store.current.links.values()];
    engineRef.current?.setData(memories, links);
    setCounts({
      memories: memories.length,
      links: links.length,
      active: memories.filter((m) => m.status === "active").length,
    });
  };

  // The curator creates links with bulkCreate, which does not emit realtime
  // events the way single create() does. So when a memory blooms we re-pull
  // links a couple of beats later — which also gives the exact effect we want:
  // the node appears first, then its threads stretch out to its neighbours.
  const refetchLinks = async () => {
    const links = await base44.entities.Link.list(null, 1000);
    const ids = new Set(store.current.memories.keys());
    const mine = links.filter(
      (l) => l.repo_id === repoIdRef.current && ids.has(l.from_memory_id) && ids.has(l.to_memory_id),
    );
    store.current.links = new Map(mine.map((l) => [l.id, l]));
    sync();
  };

  const unsubsRef = useRef([]);

  // Narrow the full dataset down to the currently selected repo.
  const filterToRepo = (id) => {
    const { memories, links } = allRef.current;
    const mems = memories.filter((m) => m.repo_id === id);
    const ids = new Set(mems.map((m) => m.id));
    const lnks = links.filter((l) => ids.has(l.from_memory_id) && ids.has(l.to_memory_id));
    dataRef.current = { memories: mems, links: lnks };
  };

  // Live mode: adopt the selected repo's data and listen for realtime events
  // that belong to it (events from other constellations are ignored).
  const goLive = () => {
    const { memories, links } = dataRef.current;
    store.current.memories = new Map(memories.map((m) => [m.id, m]));
    store.current.links = new Map(links.map((l) => [l.id, l]));
    sync();

    // Only react to conflict flags set from now on, not ones already on record.
    for (const m of memories) {
      if (m.last_flagged_at) flashSeenRef.current.set(m.id, m.last_flagged_at);
    }

    const mine = (d) => d && d.repo_id === repoIdRef.current;

    const unsubMem = base44.entities.Memory.subscribe((ev) => {
      if (ev.type !== "delete" && !mine(ev.data)) return;
      const prev = ev.type !== "delete" ? store.current.memories.get(ev.id) : null;
      if (ev.type === "delete") store.current.memories.delete(ev.id);
      else store.current.memories.set(ev.id, ev.data);
      if (ev.type === "create") {
        engineRef.current?.bloomIn(ev.data);
        pushToast({ event: "learned", kind: ev.data.kind, summary: ev.data.summary });
        setTimeout(() => refetchLinks(), 700);
        setTimeout(() => refetchLinks(), 1800);
      }
      if (ev.type === "update" && ev.data.status === "superseded") {
        pushToast({ event: "retired", kind: ev.data.kind, summary: ev.data.summary });
      }
      // The guardrail, live: `check` just flagged this memory as a conflict, so
      // pulse it red on the canvas. Fire only when last_flagged_at actually
      // changed and is fresh, so a recall/reinforce update never triggers it.
      if (
        ev.type === "update" &&
        ev.data.last_flagged_at &&
        ev.data.last_flagged_at !== prev?.last_flagged_at &&
        Date.now() - new Date(ev.data.last_flagged_at).getTime() < 10000
      ) {
        engineRef.current?.flash(ev.id); // red pulse only — no banner
      }
      sync();
    });
    const unsubLink = base44.entities.Link.subscribe((ev) => {
      if (ev.type !== "delete" && !mine(ev.data)) return;
      if (ev.type === "delete") store.current.links.delete(ev.id);
      else store.current.links.set(ev.id, ev.data);
      if (ev.type === "create" && ev.data.relation === "contradicts") {
        pushToast({ event: "contradiction", kind: "gotcha", summary: "conflict detected between two memories" });
      }
      sync();
    });
    // Base44 realtime fires on create() but not update(), so `check`'s
    // last_flagged_at never arrives over the stream. Poll the current repo for
    // fresh flags and pulse them red — reads are public and cost no credits.
    const flagPoll = setInterval(async () => {
      const rid = repoIdRef.current;
      if (!rid) return;
      try {
        const rows = await base44.entities.Memory.filter({ repo_id: rid }, "-updated_date", 120);
        const now = Date.now();
        for (const m of rows) {
          if (!m.last_flagged_at || now - new Date(m.last_flagged_at).getTime() > 12000) continue;
          if (flashSeenRef.current.get(m.id) === m.last_flagged_at) continue;
          flashSeenRef.current.set(m.id, m.last_flagged_at);
          // Flash the node red only — no top banner. The guardrail is shown by
          // the console result in-page and the red pulse on the canvas; a
          // separate banner just raced and stacked, so it's gone for good.
          engineRef.current?.flash(m.id);
        }
      } catch {
        /* transient */
      }
    }, 1600);

    unsubsRef.current = [unsubMem, unsubLink, () => clearInterval(flagPoll)];

    // Once the first constellation has settled, nudge the visitor to explore.
    if (!hintShownRef.current) {
      hintShownRef.current = true;
      setShowHint(true);
      setTimeout(() => setShowHint(false), 7000);
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Replay the real history: memories bloom in chronologically, threads grow,
  // and the memory that supersedes an older one retires it on camera. No writes,
  // no credits — it reconstructs the story already recorded in the backend.
  const runReplay = async () => {
    const engine = engineRef.current;
    const { memories, links } = dataRef.current;
    if (!engine || memories.length === 0) return goLive();

    // Tear down any live listeners while we replay.
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];

    skipRef.current = false;
    setReplaying(true);
    engine.clear();
    setToasts([]);

    const ordered = [...memories].sort(
      (a, b) => new Date(a.created_date) - new Date(b.created_date),
    );
    const byId = Object.fromEntries(memories.map((m) => [m.id, m]));
    const revealed = new Set();
    const superseded = new Set();

    for (const m of ordered) {
      if (skipRef.current) break;
      revealed.add(m.id);

      // A memory that supersedes an already-revealed one retires it now.
      const kills = links.filter(
        (l) => l.from_memory_id === m.id && l.relation === "supersedes" && revealed.has(l.to_memory_id),
      );
      kills.forEach((l) => superseded.add(l.to_memory_id));

      const displayMems = [...revealed].map((id) => ({
        ...byId[id],
        status: superseded.has(id) ? "superseded" : "active",
      }));
      const displayLinks = links.filter(
        (l) => revealed.has(l.from_memory_id) && revealed.has(l.to_memory_id),
      );

      engine.bloomIn(m);
      engine.setData(displayMems, displayLinks);
      setCounts({
        memories: displayMems.filter((x) => x.status === "active").length,
        links: displayLinks.length,
        active: displayMems.filter((x) => x.status === "active").length,
      });

      if (kills.length) {
        pushToast({ event: "retired", kind: byId[kills[0].to_memory_id]?.kind, summary: byId[kills[0].to_memory_id]?.summary });
        await sleep(1000);
        pushToast({ event: "learned", kind: m.kind, summary: m.summary });
      } else {
        pushToast({ event: "learned", kind: m.kind, summary: m.summary });
      }
      // Paced so each memory is comfortably readable before the next blooms.
      await sleep(skipRef.current ? 0 : 2900);
    }

    setReplaying(false);
    setToasts([]); // the story is over — clear the "learned" toasts for a calm canvas
    goLive();
  };

  // Manual repo switch — snap straight to live (no full replay) for a quick feel.
  const selectRepo = (id) => {
    if (id === repoIdRef.current) return;
    // Cancel a still-pending initial reveal so it can't replay over this switch.
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    setShowClarity(false);
    skipRef.current = true;
    unsubsRef.current.forEach((u) => u());
    unsubsRef.current = [];
    setReplaying(false);
    setRepoId(id);
    repoIdRef.current = id;
    filterToRepo(id);
    engineRef.current?.clear();
    setToasts([]);
    goLive();
  };

  useEffect(() => {
    const engine = new Constellation(canvasRef.current);
    engineRef.current = engine;
    engine.onHover = (n) => setTip(n ? { ...n } : null);
    engine.start();

    (async () => {
      const [memories, links, repoList] = await Promise.all([
        base44.entities.Memory.list("-strength", 1000),
        base44.entities.Link.list(null, 2000),
        base44.entities.Repo.list("-memory_count", 10),
      ]);
      allRef.current = { memories, links };

      // Feature Engram's own build as the hero constellation; other repos are
      // switchable examples that prove it isn't a one-off.
      const withMems = repoList.filter((r) => memories.some((m) => m.repo_id === r.id));
      const ordered = [
        ...withMems.filter((r) => r.name === "engram"),
        ...withMems.filter((r) => r.name !== "engram"),
      ];
      setRepos(ordered);

      const hero = ordered[0];
      const id = hero?.id || null;
      setRepoId(id);
      repoIdRef.current = id;
      filterToRepo(id);
      setReady(true);
      // The cinematic intro plays first; it kicks off the constellation build
      // when it finishes (see the Cinematic onDone below).
    })();

    return () => {
      unsubsRef.current.forEach((u) => u());
      skipRef.current = true;
      engine.destroy();
    };
  }, []);

  // Anchor the tooltip to the live node position each frame, and flip it below
  // the node when the node sits too high for the box to fit above it.
  const [tipPos, setTipPos] = useState({ x: 0, y: 0, below: false });
  useEffect(() => {
    if (!tip) return;
    let raf;
    const track = () => {
      const p = engineRef.current?.screenOf(tip.id);
      // ~150px is the tallest the box gets; flip below if it wouldn't clear the top.
      if (p) setTipPos({ x: p.x, y: p.y, below: p.y < 170 });
      raf = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(raf);
  }, [tip]);

  // Filter the constellation by category (legend click) and/or search text —
  // so anyone, technical or not, can isolate and explore.
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const term = search.trim().toLowerCase();
    if (!activeKind && !term) {
      eng.setHighlight(null);
      return;
    }
    const ids = new Set();
    for (const m of store.current.memories.values()) {
      const kindOk = !activeKind || m.kind === activeKind;
      const termOk =
        !term ||
        [m.summary, m.content, (m.tags || []).join(" ")].join(" ").toLowerCase().includes(term);
      if (kindOk && termOk) ids.add(m.id);
    }
    eng.setHighlight(ids);
  }, [activeKind, search, counts]);

  // Guided highlight: while the story narrates a point, pulse the memories that
  // illustrate it, tying the words to the visual.
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    const kw = showStory ? STORY[storyStep]?.emphasis : null;
    if (!kw) {
      eng.setEmphasis(null);
      return;
    }
    const ids = new Set();
    for (const m of store.current.memories.values()) {
      if ([m.summary, m.content, (m.tags || []).join(" ")].join(" ").toLowerCase().includes(kw)) {
        ids.add(m.id);
      }
    }
    eng.setEmphasis(ids);
  }, [showStory, storyStep, counts]);

  const tipColor = tip ? rgb(KIND_COLORS[tip.kind] || KIND_COLORS.fact) : "#fff";

  // "2 days ago" style relative time for the tooltip.
  const timeAgo = (iso) => {
    if (!iso) return "";
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 90) return "just now";
    const m = s / 60;
    if (m < 60) return `${Math.round(m)} min ago`;
    const h = m / 60;
    if (h < 24) return `${Math.round(h)}h ago`;
    const d = h / 24;
    if (d < 30) return `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"} ago`;
    return `${Math.round(d / 30)} mo ago`;
  };

  // Advance the guided explainer step by step, then get out of the way.
  useEffect(() => {
    if (!showStory || !ready) return;
    const last = storyStep >= STORY.length - 1;
    const t = setTimeout(() => {
      if (last) setShowStory(false);
      else setStoryStep((s) => s + 1);
    }, STORY[storyStep].ms || 8000);
    return () => clearTimeout(t);
  }, [showStory, storyStep, ready]);

  // The in-page playground. Opening it snaps the canvas to the demo repo so a
  // check's red pulse lands on the constellation the visitor is looking at.
  const openTry = () => {
    const demo = repos.find((r) => r.name === "demo");
    if (demo && demo.id !== repoIdRef.current) selectRepo(demo.id);
    setTryResult(null);
    tryOpenRef.current = true;
    setTryOpen(true);
  };

  const closeTry = () => {
    tryOpenRef.current = false;
    setTryOpen(false);
    // Clear any conflict banners so closing the console leaves a clean canvas.
    setToasts((prev) => prev.filter((t) => t.event !== "conflict"));
  };

  const runTry = async (text) => {
    const q = (text ?? tryInput).trim();
    if (!q || tryLoading) return;
    setTryInput(q);
    setTryLoading(true);
    setTryResult(null);
    try {
      if (tryMode === "recall") {
        const { data } = await base44.functions.invoke("recall", { query: q, repo: "demo", limit: 6 });
        setTryResult({ kind: "recall", query: q, ...data });
      } else {
        const { data } = await base44.functions.invoke("check", { action: q, repo: "demo" });
        setTryResult({ kind: "check", ...data });
        // The console already shows the result and the dot flashes red on the
        // canvas — no top banner here (that's only for terminal-fired checks the
        // poll picks up). Mark flags as seen and wipe any banner the poll may
        // have raced in, so in-page play stays clean.
        for (const f of data.findings || []) {
          engineRef.current?.flash(f.memory_id);
          if (data.flagged_at) flashSeenRef.current.set(f.memory_id, data.flagged_at);
        }
        setToasts((prev) => prev.filter((t) => t.event !== "conflict"));
      }
    } catch (e) {
      setTryResult({ kind: tryMode, error: e?.message || "something went wrong — try again" });
    }
    setTryLoading(false);
  };

  const beginAfterFilm = () => {
    setShowCinematic(false);
    if (startedRef.current) return;
    startedRef.current = true;
    // Guided hand-off. Hold on an empty sky with one plain-language line, so a
    // first-time visitor knows what they're about to see — THEN build the
    // constellation. Sequencing them means the caption never fights the node
    // labels for the center of the screen (which read as text soup before).
    engineRef.current?.clear();
    setToasts([]);
    setShowClarity(true);
    revealTimerRef.current = setTimeout(() => {
      setShowClarity(false);
      runReplay();
    }, 8000);
  };

  return (
    <>
      <canvas id="stage" ref={canvasRef} />

      {showCinematic && ready && <Cinematic onDone={beginAfterFilm} />}

      {showStory && ready && (
        <div className="story">
          <div className={`story-card${STORY[storyStep].accent ? " accent" : ""}`} key={storyStep}>
            <div className="story-eyebrow">{STORY[storyStep].eyebrow}</div>
            <h1 className="story-title">{STORY[storyStep].title}</h1>
            <p className="story-body">{STORY[storyStep].body}</p>
            <div className="story-nav">
              <div className="story-dots">
                {STORY.map((_, i) => (
                  <button
                    key={i}
                    className={`story-dot${i === storyStep ? " on" : ""}`}
                    onClick={() => setStoryStep(i)}
                    aria-label={`Step ${i + 1}`}
                  />
                ))}
              </div>
              <button className="story-skip" onClick={() => setShowStory(false)}>
                {storyStep < STORY.length - 1 ? "skip →" : "explore →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAbout && (
        <div className="about-scrim" onClick={() => setShowAbout(false)}>
          <div className="about" onClick={(e) => e.stopPropagation()}>
            <button className="about-x" onClick={() => setShowAbout(false)}>×</button>
            <h2>What you're looking at</h2>
            <p>
              A living map of everything an AI coding agent has learned while building this
              codebase. <b>Hover any node to read the full memory.</b>
            </p>
            <h3>How to read it</h3>
            <ul>
              <li><b>Each node</b> is one durable memory — a decision, gotcha, convention, or architecture note. Its <b>colour</b> is the kind (see the legend).</li>
              <li><b>Size &amp; brightness</b> show how established it is: every time an agent recalls a memory it grows; memories no one uses decay and fade.</li>
              <li><b>Each thread</b> is a relationship the curator found — one memory refines, depends on, or <b>supersedes</b> another. Conflicts render in <span style={{ color: "#ff5c72" }}>red</span> for a human to resolve.</li>
            </ul>
            <h3>Why it matters</h3>
            <p>
              AI coding agents forget everything between sessions — so they undo decisions and
              reintroduce bugs. Engram is the shared memory that stops the regression: the agent{" "}
              <b>recalls</b> what the codebase knows before it writes, and <b>remembers</b> what
              it learns after.
            </p>
            <h3>One Base44 backend, three ways in</h3>
            <ul>
              <li><b>This canvas</b> — live: capture a memory anywhere and it blooms here in under a second, over Base44 realtime.</li>
              <li><b>A CLI</b> — <code>engram learn</code> / <code>engram recall</code> from your terminal.</li>
              <li><b>An MCP server</b> — so Claude Code and Cursor plug into the same memory.</li>
            </ul>
            <div className="about-cta">
              <span>See it stop a real mistake — <b>recall</b> + <b>check</b> against a live demo, no account, two lines.</span>
              <button
                className="about-try"
                onClick={() => { setShowAbout(false); setShowStart(true); }}
              >
                Try it yourself →
              </button>
            </div>
            <p className="about-foot">
              Entities · Auth · RLS · Functions · Agents · Realtime · Integrations · Hosting —
              all Base44, one deploy.
            </p>
          </div>
        </div>
      )}

      {showDiff && (
        <div className="about-scrim" onClick={() => setShowDiff(false)}>
          <div className="about about-wide" onClick={(e) => e.stopPropagation()}>
            <button className="about-x" onClick={() => setShowDiff(false)}>×</button>
            <h2>The same task, with and without a memory</h2>
            <p>
              An AI coding agent is asked to <b>"add a Stripe checkout"</b> to a codebase that
              already settled how payments work. Here's what happens each way.
            </p>
            <div className="diff">
              <div className="diff-col diff-before">
                <div className="diff-head">
                  <span className="diff-tag bad">without Engram</span>
                  <span className="diff-sub">no memory of past decisions</span>
                </div>
                <pre className="diff-term">
{`> agent: adding checkout…

  writes CheckoutButton.jsx
  → calls stripe.charges.create()
    directly from the component
  → stores price as 19.99 (float)

✗ undoes the "route via /api/payments"
  decision from last month
✗ reintroduces the rounding bug you
  already fixed
  ships anyway — nobody remembered`}
                </pre>
              </div>
              <div className="diff-col diff-after">
                <div className="diff-head">
                  <span className="diff-tag good">with Engram</span>
                  <span className="diff-sub">recalls + checks first</span>
                </div>
                <pre className="diff-term">
{`> agent: adding checkout…

  engram recall "payments"
  → route via /api/payments
  → money is integer cents

  engram check "call Stripe from
  the component"
  ⚠ CONFLICT — route via /api/payments

✓ calls the server endpoint instead
✓ keeps amounts in cents
  regression prevented`}
                </pre>
              </div>
            </div>
            <p className="about-foot">
              Same agent, same prompt. The only difference is whether it could remember what the
              codebase already knew — which is exactly what Engram gives it.
            </p>
          </div>
        </div>
      )}

      {showMenu && <div className="menu-scrim" onClick={() => setShowMenu(false)} />}
      <div className="top-actions">
        <div className="menu-wrap">
          <button className={`how menu-btn${showMenu ? " open" : ""}`} onClick={() => setShowMenu((v) => !v)}>
            learn ▾
          </button>
          {showMenu && (
            <div className="menu-drop">
              <button onClick={() => { setShowMenu(false); setShowAbout(true); }}>How it works</button>
              <button onClick={() => { setShowMenu(false); setShowDiff(true); }}>See the difference</button>
              <button onClick={() => { setShowMenu(false); setShowStart(true); }}>Use it yourself</button>
            </div>
          )}
        </div>
        <button className="how cta" onClick={openTry}>▸ try it live</button>
      </div>

      {tryOpen && (
        <div className="tryc">
          <div className="tryc-head">
            <span className="tryc-title">
              Try it live <span>· the demo app</span>
            </span>
            <button className="tryc-x" onClick={closeTry}>×</button>
          </div>
          <p className="tryc-intro">
            This is a sample web app's memory. Ask it something, or propose a change —
            the same two things a coding AI does.
          </p>
          <div className="tryc-modes">
            <button
              className={`tryc-mode${tryMode === "recall" ? " on" : ""}`}
              onClick={() => { setTryMode("recall"); setTryResult(null); }}
            >
              <b>recall</b>
              <span>what does it know?</span>
            </button>
            <button
              className={`tryc-mode${tryMode === "check" ? " on" : ""}`}
              onClick={() => { setTryMode("check"); setTryResult(null); }}
            >
              <b>check</b>
              <span>is my change safe?</span>
            </button>
          </div>
          <p className="tryc-sub">
            {tryMode === "recall"
              ? "Type any topic. You get back the decisions this app already made about it — what a coding AI reads before it writes code."
              : "Type any change you're about to make. If it would break a past decision, you get a warning and the fix — before a line of code is written."}
          </p>
          <div className="tryc-input">
            <input
              value={tryInput}
              onChange={(e) => setTryInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runTry()}
              placeholder={tryMode === "recall" ? 'e.g. "payments"' : 'e.g. "call Stripe from the component"'}
              spellCheck={false}
            />
            <button className="tryc-run" onClick={() => runTry()} disabled={tryLoading}>
              {tryLoading ? "…" : "run"}
            </button>
          </div>
          <div className="tryc-chips">
            {(tryMode === "recall"
              ? ["payments", "auth", "how do we store money"]
              : ["call Stripe from the checkout component", "store the price as a float", "put the token in localStorage"]
            ).map((s) => (
              <button key={s} className="tryc-chip" onClick={() => runTry(s)}>{s}</button>
            ))}
          </div>
          {tryResult && (
            <div className="tryc-out">
              {tryResult.error ? (
                <div className="tryc-empty">{tryResult.error}</div>
              ) : tryResult.kind === "recall" ? (
                (tryResult.memories || []).length ? (
                  <>
                    <div className="tryc-lead">Here's what it already decided:</div>
                    <ul className="tryc-list">
                      {tryResult.memories.map((m) => (
                        <li key={m.id}>
                          <span className="tryc-dot" style={{ background: rgb(KIND_COLORS[m.kind] || KIND_COLORS.fact) }} />
                          <span>
                            <b>{m.summary}</b>
                            <span className="tryc-kind">{m.kind}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <div className="tryc-empty">
                    This sample app never learned anything about <b>"{tryResult.query}"</b> — it's a
                    small web app, so it only knows its own world: <b>payments</b>, <b>auth</b>,{" "}
                    <b>how it stores money</b>, its <b>database</b>, and how it <b>deploys</b>. Try one of those.
                  </div>
                )
              ) : tryResult.status === "limited" ? (
                <div className="tryc-empty">{tryResult.note}</div>
              ) : tryResult.status === "clear" ? (
                <>
                  <div className="tryc-status clear">✓ Safe to do this</div>
                  <div className="tryc-empty">Nothing here clashes with a decision the app already made.</div>
                </>
              ) : (
                <>
                  <div className={`tryc-status ${tryResult.status}`}>
                    {tryResult.status === "conflict" ? "⚠ Not safe — this breaks a rule" : "⚠ Careful — this touches something risky"}
                  </div>
                  <div className="tryc-lead">
                    {tryResult.status === "conflict"
                      ? "The app already decided the opposite:"
                      : "Watch out for what the app already knows:"}
                  </div>
                  {(tryResult.findings || []).map((f, i) => (
                    <div className="tryc-finding" key={i}>
                      <b>{f.summary}</b>
                      {f.guidance && <div className="tryc-guide">→ do this instead: {f.guidance}</div>}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {ready && (
        <div className="search" title="Type a keyword to find a specific memory">
          <span className="search-icon">⌕</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search these memories…"
            spellCheck={false}
          />
          {search && (
            <button className="search-x" onClick={() => setSearch("")} aria-label="clear">
              ×
            </button>
          )}
        </div>
      )}

      {showStart && (
        <div className="about-scrim" onClick={() => setShowStart(false)}>
          <div className="about" onClick={(e) => e.stopPropagation()}>
            <button className="about-x" onClick={() => setShowStart(false)}>×</button>
            <h2>Use it yourself</h2>
            <p>
              Don't take our word for it — <b>feel it work</b> right now, against a live
              sample codebase.
            </p>
            <button
              className="start-gh"
              style={{ marginTop: 4 }}
              onClick={() => { setShowStart(false); openTry(); }}
            >
              ▸ Try it right here in your browser — no install
            </button>
            <h3>1 · Try it in 30 seconds <span className="start-badge">no account</span></h3>
            <p>Clone it, then ask the live demo what it already knows:</p>
            <div className="start-code">
              <code>git clone https://github.com/giladmelnik14/Engram</code>
              <code>cd Engram &amp;&amp; npm install</code>
              <code>node bin/engram.mjs recall "payments" <span>--demo</span></code>
            </div>
            <p>
              It answers with the sample app's real decisions — route money through{" "}
              <b>/api/payments</b>, store amounts in cents, verify Stripe webhooks. Now watch
              it <b>stop a mistake before it ships</b>:
            </p>
            <div className="start-code">
              <code>node bin/engram.mjs check "call Stripe from the checkout component" <span>--demo</span></code>
            </div>
            <p className="start-out">
              <b className="start-conflict">⚠ CONFLICT</b> — "Route every payment through /api/payments."{" "}
              <span className="start-fix">→ Call the server endpoint from the component instead.</span>
            </p>
            <h3>2 · Make it your agent's memory</h3>
            <p>
              Point it at your <b>own</b> codebase: deploy your Base44 backend, then connect
              Claude Code or Cursor to the built-in MCP server.
            </p>
            <div className="start-code">
              <code>npx base44 create engram --template backend-only</code>
              <code>npx base44 entities push &amp;&amp; functions deploy &amp;&amp; agents push</code>
            </div>
            <p>
              Now your AI <b>recalls</b> before it writes, <b>checks</b> before it changes
              anything, and <b>remembers</b> what it learns — so it stops repeating old mistakes.
            </p>
            <a className="start-gh" href="https://github.com/giladmelnik14/Engram" target="_blank" rel="noreferrer">
              View the full code on GitHub →
            </a>
            <p className="about-foot">Built entirely on Base44 — one backend, three clients.</p>
          </div>
        </div>
      )}

      {showClarity && (
        <div className="clarity">
          <div className="clarity-lead">Every glowing dot is something an AI learned while building an app.</div>
          <div className="clarity-sub">
            Coding AIs forget between sessions — so they undo decisions and re-break things.
            This is the memory that keeps them from repeating the mistake.
          </div>
        </div>
      )}


      {!ready && <div className="loading">gathering the constellation…</div>}

      <div className="hud hud-top">
        <div className="brand">
          <div className="brand-dot" />
          <div className="brand-name">
            Engram <span>· memory for the agents that build your app</span>
          </div>
        </div>
        <div className="repo-switch" title="Each is a different project's memory — click to switch">
          <div className="live" />
          <span className="switch-label">example&nbsp;project</span>
          {repos.map((r) => (
            <button
              key={r.id}
              className={`repo-chip${r.id === repoId ? " on" : ""}`}
              onClick={() => selectRepo(r.id)}
              title={
                r.name === "engram"
                  ? "Engram's own memory — the very app you're looking at"
                  : "A sample app's memory — shows it works on any project"
              }
            >
              {r.name}
            </button>
          ))}
          <span className="built-on">built on Base44</span>
        </div>
      </div>

      <div className="toast-wrap">
        {toasts.map((t) => {
          const isConflict = t.event === "conflict";
          const c = rgb(isConflict ? [255, 66, 88] : KIND_COLORS[t.kind] || KIND_COLORS.fact);
          const verb =
            t.event === "learned" ? "learned" : t.event === "retired" ? "retired" : "flagged";
          return (
            <div className={`toast${isConflict ? " toast-alert" : ""}`} key={t.id}>
              <span className="toast-dot" style={{ background: c, boxShadow: `0 0 12px 2px ${c}` }} />
              <span>
                {isConflict ? (
                  <>
                    <b>⚠ check blocked a conflict</b> — {t.summary}
                  </>
                ) : (
                  <>
                    agent <b>{verb}</b> — {t.summary}
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {replaying && (
        <div className="replay-cap">
          <b>Replaying this project's memory.</b> Every dot is a lesson its AI learned while
          coding — watch it rebuild, then it goes live.
        </div>
      )}

      {!showStory && (
        <button
          className="replay"
          onClick={() => (replaying ? (skipRef.current = true) : runReplay())}
        >
          {replaying ? "skip ▸▸" : "▸ replay the story"}
        </button>
      )}

      <div className="hud stats">
        <div>
          <div className="stat-num">{counts.active}</div>
          <div className="stat-lbl">memories</div>
        </div>
        <div>
          <div className="stat-num">{counts.links}</div>
          <div className="stat-lbl">connections</div>
        </div>
      </div>

      <div className="hud legend">
        <div className="legend-key">
          <div className="legend-keyrow"><span className="legend-kdot" /> a memory the AI learned</div>
          <div className="legend-keyrow"><span className="legend-kline" /> a link between related ones</div>
          <div className="legend-ktitle">hover a dot to read it</div>
          <div className="legend-ktitle">colour = the kind · click to filter</div>
        </div>
        {LEGEND.map(([k, label]) => (
          <button
            key={k}
            className={`legend-row${activeKind === k ? " on" : ""}${activeKind && activeKind !== k ? " off" : ""}`}
            onClick={() => setActiveKind(activeKind === k ? null : k)}
            title={`Show only ${label.toLowerCase()} memories`}
          >
            <span>{label}</span>
            <span className="legend-dot" style={{ background: rgb(KIND_COLORS[k]), boxShadow: `0 0 8px 1px ${rgb(KIND_COLORS[k])}` }} />
          </button>
        ))}
      </div>

      {tip && (
        <div
          className={`tip show${tipPos.below ? " below" : ""}`}
          style={{
            left: Math.min(Math.max(tipPos.x, 170), window.innerWidth - 170),
            top: tipPos.y,
            borderColor: `${tipColor}55`,
          }}
        >
          <div className="tip-kind" style={{ color: tipColor }}>
            {tip.kind}
            {tip.status !== "active" ? " · retired" : ""}
          </div>
          <div className="tip-summary">{tip.summary}</div>
          <div className="tip-content">{tip.content}</div>
          {tip.tags?.length > 0 && (
            <div className="tip-tags">
              {tip.tags.map((t) => (
                <span className="tip-tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {tip.author && (
            <div className="tip-meta">
              learned by <b>{tip.author}</b>
              {tip.createdDate ? ` · ${timeAgo(tip.createdDate)}` : ""}
            </div>
          )}
        </div>
      )}
    </>
  );
}
