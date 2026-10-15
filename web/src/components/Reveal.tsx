// Révélation (§6.3) : pack qui flotte, tremblement, flash couleur du tier,
// la carte se retourne, puis une information à la fois : la note globale grimpe
// seule (le halo change de couleur à chaque palier de tier), les six stats
// tombent une par une, le tier se tamponne en dernier, et seulement alors le
// contenu sous la carte apparaît. Sautable d'un clic, désactivée en mouvement réduit.
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { CardData, Lang } from "../../../shared/types";
import { STAT_CODES, styleOf, tierFor } from "../../../shared/types";
import { CardView } from "../card/CardView";
import { useT } from "../i18n";
import { isMock } from "../lib/api";
import { accentOf, STYLE_ACCENT } from "../lib/util";
import { CardBack, Pack } from "./Pack";

export type Phase = "ready" | "shake" | "burst" | "flip" | "count" | "stats" | "stamp" | "done";

const AUTO_OPEN = 1100;
/** Montée de la note globale (ms). */
export const OVERALL_CLIMB = 950;
/** Écart entre deux stats, et durée de montée de chacune (ms). */
export const STAT_STAGGER = 180;
export const STAT_COUNT = 320;
// Instants (ms après l'ouverture) de chaque phase. Le retournement dure 550 ms,
// la montée de la note 950 ms, les six stats 6 × 180 + 320 ms, le tampon 1.2 s.
const T = { shake: 0, burst: 480, flip: 700, count: 1250, stats: 2350, stamp: 3850, done: 5050 };

/** Machine à états de la révélation, partagée par une carte seule ou une comparaison. */
export function useReveal(animate: boolean) {
  const [phase, setPhase] = useState<Phase>(animate ? "ready" : "done");
  const timers = useRef<number[]>([]);
  const opened = useRef(false);

  const clear = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const open = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    clear();
    // Mode démo : ?freeze=count fige la séquence sur une phase, pour la mise au point.
    const order: Phase[] = ["ready", "shake", "burst", "flip", "count", "stats", "stamp", "done"];
    const freeze = isMock() ? (new URLSearchParams(window.location.search).get("freeze") as Phase | null) : null;
    const stopAt = freeze && order.includes(freeze) ? order.indexOf(freeze) : order.length;
    const at = (p: Phase, ms: number) => {
      if (order.indexOf(p) <= stopAt) timers.current.push(window.setTimeout(() => setPhase(p), ms));
    };
    setPhase("shake");
    at("burst", T.burst);
    at("flip", T.flip);
    at("count", T.count);
    at("stats", T.stats);
    at("stamp", T.stamp);
    at("done", T.done);
  }, []);

  const skip = useCallback(() => {
    opened.current = true;
    clear();
    setPhase("done");
  }, []);

  useEffect(() => {
    if (!animate) return;
    if (isMock() && new URLSearchParams(window.location.search).get("freeze") === "ready") return;
    const id = window.setTimeout(open, AUTO_OPEN);
    timers.current.push(id);
    return clear;
  }, [animate, open]);

  const animating = phase !== "done";
  /** Le contenu sous la carte n'apparaît qu'une fois la carte posée : une chose à la fois. */
  const settled = phase === "done";
  return { phase, open, skip, animating, settled };
}

interface CountUpProps {
  to: number;
  delay: number;
  duration?: number;
  /** Lance la montée ; une fois lancée, elle va au bout même si la phase change. */
  run: boolean;
  /** Freine fort sur la fin, pour laisser le suspense au dernier palier. */
  power?: number;
  onTick?: (v: number) => void;
}

function CountUp({ to, delay, duration = STAT_COUNT, run, power = 3, onTick }: CountUpProps) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  const tick = useRef(onTick);
  tick.current = onTick;
  useEffect(() => {
    if (!run || started.current) return;
    started.current = true;
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - p, power);
      const val = Math.round(to * eased);
      setV(val);
      tick.current?.(val);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, duration, run, power]);
  return <>{v}</>;
}

/** Éclats de la déchirure, positions fixées pour un rendu stable. */
const SHARDS = Array.from({ length: 30 }, (_, i) => {
  const a = (i / 30) * 360 + ((i * 37) % 17) - 8;
  const d = 140 + ((i * 53) % 120);
  const s = 4 + ((i * 29) % 9);
  return { a, d, s, dl: (i % 5) * 18, white: i % 3 === 0 };
});

export function Burst() {
  return (
    <div className="burst" aria-hidden>
      <div className="burst-ring" />
      <div className="burst-ring r2" />
      <div className="burst-rays" />
      {SHARDS.map((s, i) => (
        <i
          key={i}
          className={s.white ? "w" : ""}
          style={{ ["--a" as string]: `${s.a}deg`, ["--d" as string]: `${s.d}px`, ["--s" as string]: `${s.s}px`, ["--dl" as string]: `${s.dl}ms` } as CSSProperties}
        />
      ))}
    </div>
  );
}

/** Flash plein écran à la couleur du tier. */
export function ScreenFlash({ color }: { color: string }) {
  return <div className="screen-flash" style={{ ["--fc" as string]: color } as CSSProperties} aria-hidden />;
}

export function Stamp({ text, sub }: { text: string; sub?: string }) {
  const long = text.length > 6;
  return (
    <div className={`stamp${long ? " stamp-long" : ""}`} aria-hidden>
      <span className="stamp-text">{text}</span>
      {sub && <span className="stamp-sub">{sub}</span>}
    </div>
  );
}

interface RevealCardProps {
  card: CardData;
  lang: Lang;
  phase: Phase;
  idPrefix: string;
  /** Décalage (ms) de la séquence pour une seconde carte. */
  offset?: number;
  /** Dessine son propre pack (carte seule) ; en comparaison, le parent le fait. */
  withPack?: boolean;
  /** Tamponne le tier sur la carte (carte seule). */
  withStamp?: boolean;
  onPackClick?: () => void;
  children?: ReactNode;
}

export function RevealCard({ card, lang, phase, idPrefix, offset = 0, withPack = true, withStamp = true, onPackClick }: RevealCardProps) {
  const { t } = useT();
  const accent = accentOf(card);
  const style = styleOf(card);
  const slot = useRef<HTMLDivElement>(null);
  const lastTier = useRef<string | null>(null);
  const showPack = withPack && (phase === "ready" || phase === "shake" || phase === "burst");
  const showFront = phase !== "ready" && phase !== "shake" && phase !== "burst";
  const showPlate = phase === "flip" || phase === "count" || phase === "stats" || phase === "stamp";
  const climbing = phase === "count" || phase === "stats" || phase === "stamp";
  const counting = phase === "stats" || phase === "stamp";
  const vars = { "--ca": accent.a, "--cb": accent.b, "--ink": accent.ink, "--offset": `${offset}ms`, "--stagger": `${STAT_STAGGER}ms` } as CSSProperties;
  const statsInOrder = STAT_CODES.map((c) => card.stats.find((s) => s.code === c)!).filter(Boolean);

  // L'ascenseur : pendant la montée, le halo prend la couleur du tier atteint
  // et « sonne » à chaque palier franchi. À l'arrivée, la vraie couleur de la carte.
  const onClimb = (v: number) => {
    const el = slot.current;
    if (!el) return;
    const tier = v >= card.overall ? style : tierFor(v);
    if (tier === lastTier.current) return;
    const first = lastTier.current === null;
    lastTier.current = tier;
    const a = STYLE_ACCENT[tier];
    el.style.setProperty("--ca", a.a);
    el.style.setProperty("--cb", a.b);
    el.style.setProperty("--ink", a.ink);
    if (first) return;
    el.classList.remove("ding");
    void el.offsetWidth; // relance l'animation
    el.classList.add("ding");
  };

  return (
    <div ref={slot} className={`card-slot phase-${phase}${showFront ? " show-front" : ""}`} style={vars} data-style={style}>
      <div className="slot-halo" aria-hidden />
      <div className="flipper">
        <div className="face face-back">
          <CardBack />
        </div>
        <div className="face face-front">
          <div className="front-inner">
            <CardView card={card} lang={lang} interactive={phase === "stamp" || phase === "done"} reveal={phase === "stamp"} idPrefix={idPrefix} />
          </div>
          {showPlate && (
            <div className="count-plate" aria-hidden>
              <span className="count-overall">
                <CountUp to={card.overall} delay={offset} duration={OVERALL_CLIMB} run={climbing} power={4} onTick={onClimb} />
              </span>
              <ol className="count-stats">
                {statsInOrder.map((s, i) => (
                  <li key={s.code} className={s.code === "BUZZ" ? "is-buzz" : ""} style={{ ["--i" as string]: i } as CSSProperties}>
                    <b>
                      <CountUp to={s.value} delay={offset + i * STAT_STAGGER} run={counting} />
                    </b>
                    <span>{s.code}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
      {showPack && (
        <button
          type="button"
          className={`pack-btn pack-${phase}`}
          onClick={(e) => {
            e.stopPropagation();
            onPackClick?.();
          }}
          aria-label={t.reveal.tap}
          disabled={phase !== "ready"}
        >
          <Pack accent={accent} />
          {phase === "ready" && <span className="pack-hint">{t.reveal.tap}</span>}
        </button>
      )}
      {withPack && (phase === "burst" || phase === "flip") && <Burst />}
      {withStamp && phase === "stamp" && <Stamp text={t.tiers[style].toUpperCase()} sub={String(card.overall)} />}
    </div>
  );
}
