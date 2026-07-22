import { useState, useEffect } from "react";

// A built, full-screen concept film that plays on entry — the story of why
// Engram exists, told with drama and pacing, then it hands off to the live
// constellation. Silent, captioned, cinematic.
const SCENES = [
  { size: "sm", lines: ["3 A.M.", "Your AI ships a beautiful fix."], ms: 3200 },
  { size: "sm", lines: ["A fresh session, days later.", "It breaks the exact same thing."], ms: 3600 },
  { size: "xl", lines: ["It remembers nothing."], ms: 2900 },
  { size: "lg", lines: ["Every decision.", "Every hard-won lesson.", "Gone by the next prompt."], ms: 4000 },
  { size: "lg", lines: ["It undoes your architecture.", "Reintroduces the bugs you already fixed."], ms: 3800 },
  { size: "xl", lines: ["The more it builds,", "the more it forgets."], ms: 3400 },
  { size: "xl", accentLast: true, lines: ["What if it remembered", "everything?"], ms: 3600 },
  { size: "title", title: "ENGRAM", sub: "A living memory for the AI that builds your app.", ms: 4200 },
  { size: "lg", lines: ["Recall before it writes.", "Check before it breaks something.", "Remember what it learns."], ms: 4400 },
  { size: "lg", lines: ["Built entirely on Base44.", "In a week.", "This is what its backend makes possible."], ms: 4400 },
  { size: "lg", accentLast: true, lines: ["Base44 gave agents a memory.", "Let's take it all the way —", "together."], ms: 4600 },
];

export default function Cinematic({ onDone }) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (i >= SCENES.length) {
      onDone();
      return;
    }
    const t = setTimeout(() => setI((n) => n + 1), SCENES[i].ms);
    return () => clearTimeout(t);
  }, [i]);

  if (i >= SCENES.length) return null;
  const s = SCENES[i];

  return (
    <div className="cine">
      <div className="cine-bg" />
      <div className={`cine-scene ${s.size}`} key={i}>
        {s.size === "title" ? (
          <>
            <div className="cine-logo">{s.title}</div>
            <div className="cine-sub">{s.sub}</div>
          </>
        ) : (
          s.lines.map((l, k) => (
            <div
              key={k}
              className={`cine-line${s.accentLast && k === s.lines.length - 1 ? " cine-acc" : ""}`}
              style={{ animationDelay: `${k * 0.45}s` }}
            >
              {l}
            </div>
          ))
        )}
      </div>
      <button className="cine-skip" onClick={onDone}>
        skip intro →
      </button>
      <div className="cine-progress">
        <div style={{ width: `${((i + 1) / SCENES.length) * 100}%` }} />
      </div>
    </div>
  );
}
