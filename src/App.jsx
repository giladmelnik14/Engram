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
    title: "The half that was missing",
    body: "Base44 already gives the chat assistants inside apps a memory. The AI that builds apps has none. Engram fills that exact gap — making every AI-built app more reliable, turning ‘bring your own agent’ into a moat, and giving Base One a first-party record of how apps actually get built. This is a feature Base44 should own.",
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
  const [activeKind, setActiveKind] = useState(null);
  const [search, setSearch] = useState("");
  const [showHint, setShowHint] = useState(false);

  const repo = repos.find((r) => r.id === repoId) || null;

  // Keep the freshest rows around so a realtime event can re-run layout.
  const store = useRef({ memories: new Map(), links: new Map() });
  const allRef = useRef({ memories: [], links: [] }); // every repo's data
  const dataRef = useRef({ memories: [], links: [] }); // the selected repo, for replay
  const repoIdRef = useRef(null); // current selection, readable inside async loops
  const skipRef = useRef(false);
  const startedRef = useRef(false); // replay begins once, after the intro
  const hintShownRef = useRef(false); // the "hover to explore" hint shows once

  const pushToast = (t) => {
    const id = `${t.kind}-${t.summary}-${performance.now()}`;
    setToasts((prev) => [...prev, { ...t, id }].slice(-3));
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 5200);
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

    const mine = (d) => d && d.repo_id === repoIdRef.current;

    const unsubMem = base44.entities.Memory.subscribe((ev) => {
      if (ev.type !== "delete" && !mine(ev.data)) return;
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
    unsubsRef.current = [unsubMem, unsubLink];

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
    goLive();
  };

  // Manual repo switch — snap straight to live (no full replay) for a quick feel.
  const selectRepo = (id) => {
    if (id === repoIdRef.current) return;
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

  const beginAfterFilm = () => {
    setShowCinematic(false);
    if (startedRef.current) return;
    startedRef.current = true;
    runReplay();
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
            <p className="about-foot">
              Entities · Auth · RLS · Functions · Agents · Realtime · Integrations · Hosting —
              all Base44, one deploy.
            </p>
          </div>
        </div>
      )}

      <div className="top-actions">
        <button className="how" onClick={() => setShowAbout(true)}>how it works</button>
        <button className="how cta" onClick={() => setShowStart(true)}>✦ use it yourself</button>
      </div>

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
            <h2>Use this in your own project</h2>
            <p>
              Engram is open. Here's how to give your <b>own</b> AI coding assistant a shared
              memory — in a few minutes, all on Base44.
            </p>
            <h3>1 · Get the backend</h3>
            <p>It's a single Base44 project. Clone the repo, or start fresh:</p>
            <div className="start-code">
              <code>git clone github.com/giladmelnik14/Engram</code>
              <code>npx base44 create   <span>← or start a new one</span></code>
            </div>
            <h3>2 · Connect your AI</h3>
            <p>Point Claude Code or Cursor at the included MCP server, or use the command line:</p>
            <div className="start-code">
              <code>engram recall "payments"</code>
              <code>engram check "call Stripe from the frontend"</code>
            </div>
            <h3>3 · Your AI shares a brain</h3>
            <p>
              It <b>recalls</b> before it writes, <b>checks</b> before it changes anything, and{" "}
              <b>remembers</b> what it learns — so it stops repeating old mistakes.
            </p>
            <a className="start-gh" href="https://github.com/giladmelnik14/Engram" target="_blank" rel="noreferrer">
              View the full code on GitHub →
            </a>
            <p className="about-foot">Built entirely on Base44 — one command to deploy your own.</p>
          </div>
        </div>
      )}

      {showHint && <div className="hint">✦ hover any node · click a colour or search to filter</div>}

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
          const c = rgb(KIND_COLORS[t.kind] || KIND_COLORS.fact);
          const verb =
            t.event === "learned" ? "learned" : t.event === "retired" ? "retired" : "flagged";
          return (
            <div className="toast" key={t.id}>
              <span className="toast-dot" style={{ background: c, boxShadow: `0 0 12px 2px ${c}` }} />
              <span>
                agent <b>{verb}</b> — {t.summary}
              </span>
            </div>
          );
        })}
      </div>

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
