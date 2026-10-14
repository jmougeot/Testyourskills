// Attente (§6.2) : le pack flotte et pulse, les messages défilent,
// nourris par les ProgressEvent quand il y en a, sinon par du remplissage.
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProgressEvent } from "../../../shared/types";
import { useT } from "../i18n";
import { Pack } from "./Pack";

interface Line {
  uid: number;
  key: string;
  n?: number;
  filler?: number;
}

const MIN_GAP = 950; // un message reste lisible au moins ce temps
const FILL_AFTER = 2300; // silence avant un message de remplissage

export function Waiting({ progress, startedAt }: { progress: ProgressEvent[]; startedAt: number }) {
  const { t } = useT();
  const [lines, setLines] = useState<Line[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const consumed = useRef(0);
  const lastAt = useRef(0);
  const uid = useRef(0);
  const usedFillers = useRef<Set<number>>(new Set());
  const progressRef = useRef(progress);
  progressRef.current = progress;

  const known = t.waiting.progress;

  useEffect(() => {
    const tick = () => {
      const ts = Date.now();
      setNow(ts);
      const evts = progressRef.current.filter((e) => known[e.key]);
      if (ts - lastAt.current < MIN_GAP) return;
      if (consumed.current < evts.length) {
        const e = evts[consumed.current++];
        lastAt.current = ts;
        setLines((prev) => {
          const last = prev[prev.length - 1];
          // Même clé qu'à l'instant (ex. compteur de buzzwords) : on met à jour sur place.
          if (last && last.key === e.key && !last.filler) return [...prev.slice(0, -1), { ...last, n: e.n }];
          return [...prev, { uid: uid.current++, key: e.key, n: e.n }].slice(-5);
        });
      } else if (lastAt.current === 0) {
        // Premier message tout de suite, avant même le premier événement.
        lastAt.current = ts;
        setLines([{ uid: uid.current++, key: "start" }]);
      } else if (ts - lastAt.current >= FILL_AFTER) {
        const total = t.waiting.fillers.length;
        let idx = Math.floor(Math.random() * total);
        for (let i = 0; i < total && usedFillers.current.has(idx); i++) idx = (idx + 1) % total;
        if (usedFillers.current.size >= total) usedFillers.current.clear();
        usedFillers.current.add(idx);
        lastAt.current = ts;
        setLines((prev) => [...prev, { uid: uid.current++, key: "filler", filler: idx }].slice(-5));
      }
    };
    tick();
    const iv = window.setInterval(tick, 200);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const textOf = (l: Line) => (l.filler !== undefined ? t.waiting.fillers[l.filler] : known[l.key]?.(l.n) ?? "");
  const current = lines[lines.length - 1];

  const elapsed = Math.max(0, now - startedAt);
  // Progression asymptotique : avance vite au début, ne touche jamais 100 avant la fin.
  const pct = useMemo(() => Math.round(96 * (1 - Math.exp(-elapsed / 5200))), [elapsed]);
  const secs = (elapsed / 1000).toFixed(1).padStart(4, "0");

  return (
    <section className="waiting" aria-labelledby="waiting-title">
      <h1 id="waiting-title" className="sr-only">
        {t.waiting.title}
      </h1>
      <div className="stage-slot waiting-slot">
        <div className="waiting-rays" aria-hidden />
        <div className="waiting-orbit" aria-hidden>
          {Array.from({ length: 10 }, (_, i) => (
            <i key={i} style={{ ["--i" as string]: i }} />
          ))}
        </div>
        <Pack className="pack-waiting" />
      </div>

      <div className="console">
        <div className="console-head">
          <span className="console-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <span className="console-title">{t.waiting.title}</span>
          <span className="console-time" aria-hidden>
            {secs}s
          </span>
        </div>
        <ol className="console-lines" aria-hidden>
          {lines.map((l, i) => {
            const isCurrent = i === lines.length - 1;
            return (
              <li key={l.uid} className={isCurrent ? "is-current" : "is-done"} style={{ ["--age" as string]: lines.length - 1 - i }}>
                <span className="console-mark">{isCurrent ? <span className="spinner" /> : "✓"}</span>
                <span className="console-text">{textOf(l)}</span>
              </li>
            );
          })}
        </ol>
        <div className="console-bar" aria-hidden>
          <span style={{ width: `${pct}%` }} />
        </div>
        {/* Une seule annonce à la fois pour les lecteurs d'écran. */}
        <p className="sr-only" aria-live="polite">
          {current ? textOf(current) : ""}
        </p>
      </div>
    </section>
  );
}
