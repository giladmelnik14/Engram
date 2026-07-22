import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Constellation, KIND_COLORS } from "@/constellation";

const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

const LEGEND = [
  ["architecture", "Architecture"],
  ["decision", "Decision"],
  ["convention", "Convention"],
  ["gotcha", "Gotcha"],
  ["fact", "Fact"],
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
  const [showIntro, setShowIntro] = useState(true);
  const [showAbout, setShowAbout] = useState(false);

  const repo = repos.find((r) => r.id === repoId) || null;

  // Keep the freshest rows around so a realtime event can re-run layout.
  const store = useRef({ memories: new Map(), links: new Map() });
  const allRef = useRef({ memories: [], links: [] }); // every repo's data
  const dataRef = useRef({ memories: [], links: [] }); // the selected repo, for replay
  const repoIdRef = useRef(null); // current selection, readable inside async loops
  const skipRef = useRef(false);
  const startedRef = useRef(false); // replay begins once, after the intro

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
        await sleep(700);
        pushToast({ event: "learned", kind: m.kind, summary: m.summary });
      } else {
        pushToast({ event: "learned", kind: m.kind, summary: m.summary });
      }
      await sleep(skipRef.current ? 0 : 1050);
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
      // The replay is kicked off when the intro card dismisses (see begin()),
      // so the visitor reads the pitch first, then watches the build from empty.
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

  const tipColor = tip ? rgb(KIND_COLORS[tip.kind] || KIND_COLORS.fact) : "#fff";

  // Dismiss the intro and start the replay from an empty sky — once.
  const begin = () => {
    setShowIntro(false);
    if (startedRef.current) return;
    startedRef.current = true;
    runReplay();
  };

  // The intro card greets a first-time visitor, then gets out of the way.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(begin, 6500);
    return () => clearTimeout(t);
  }, [ready]);

  return (
    <>
      <canvas id="stage" ref={canvasRef} />

      {showIntro && ready && (
        <div className="intro" onClick={begin}>
          <div className="intro-card">
            <div className="intro-eyebrow">Built on Base44</div>
            <h1 className="intro-title">
              The memory layer for the agents<br />that build your app
            </h1>
            <p className="intro-sub">
              Base44 gives your app's chat agents memory. <b>Engram gives the same to the
              agents that build it</b> — every decision, gotcha and convention your coding
              agent learns, captured and shared so the next session never forgets.
            </p>
            <div className="intro-hint">watch the constellation build itself →</div>
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
              codebase. Each <b>node</b> is one durable memory — a decision, a gotcha, a
              convention. Each <b>thread</b> is a relationship the curator agent found between
              them. Brighter nodes are the ones agents actually rely on.
            </p>
            <h3>Why it matters</h3>
            <p>
              AI coding agents forget everything between sessions — so they undo decisions and
              reintroduce bugs. Engram is the shared memory that stops the regression: the agent{" "}
              <b>recalls</b> what the codebase knows before it writes, and <b>remembers</b> what
              it learns after.
            </p>
            <h3>One Base44 backend, three ways in</h3>
            <ul>
              <li><b>This canvas</b> — the live constellation, streaming over Base44 realtime.</li>
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

      <button className="how" onClick={() => setShowAbout(true)}>how it works</button>

      {!ready && <div className="loading">gathering the constellation…</div>}

      <div className="hud hud-top">
        <div className="brand">
          <div className="brand-dot" />
          <div className="brand-name">
            Engram <span>· memory for the agents that build your app</span>
          </div>
        </div>
        <div className="repo-switch">
          <div className="live" />
          {repos.map((r) => (
            <button
              key={r.id}
              className={`repo-chip${r.id === repoId ? " on" : ""}`}
              onClick={() => selectRepo(r.id)}
              title={r.description || r.name}
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

      <button
        className="replay"
        onClick={() => (replaying ? (skipRef.current = true) : runReplay())}
      >
        {replaying ? "skip ▸▸" : "▸ replay the story"}
      </button>

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
          <div className="legend-row" key={k}>
            <span>{label}</span>
            <span className="legend-dot" style={{ background: rgb(KIND_COLORS[k]), boxShadow: `0 0 8px 1px ${rgb(KIND_COLORS[k])}` }} />
          </div>
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
        </div>
      )}
    </>
  );
}
