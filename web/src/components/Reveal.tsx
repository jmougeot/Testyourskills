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
/** Montée de la note globale (ms), puis temps d'arrêt à l'arrivée. */
export const OVERALL_CLIMB = 1400;
const ARRIVAL_PAUSE = 350;
/** Écart entre deux stats, et durée de montée de chacune (ms). */
export const STAT_STAGGER = 180;
export const STAT_COUNT = 320;
// Instants (ms après l'ouverture) de chaque phase. Le retournement dure 550 ms,
// la montée de la note 950 ms, les six stats 6 × 180 + 320 ms, le tampon 1.2 s.
const T = { shake: 0, burst: 480, flip: 700, count: 1250, stats: 1250 + OVERALL_CLIMB + ARRIVAL_PAUSE, stamp: 4400, done: 5600 };

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
}

function CountUp({ to, delay, duration = STAT_COUNT, run }: CountUpProps) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (!run || started.current) return;
    started.current = true;
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / duration));
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, duration, run]);
  return <>{v}</>;
}

/** Paliers de l'ascenseur : la note à partir de laquelle on change de tier. */
const FLOORS: { at: number; tier: "bronze" | "silver" | "gold" | "icon" }[] = [
  { at: 0, tier: "bronze" },
  { at: 60, tier: "silver" },
  { at: 75, tier: "gold" },
  { at: 90, tier: "icon" },
];
const MAX = 99;

/** Une roue de compteur : une bande de chiffres qui défile verticalement, toujours vers le haut. */
function Wheel({ index, digits }: { index: number; digits: string }) {
  return (
    <span className="odo-wheel" style={{ ["--d" as string]: index } as CSSProperties}>
      <span className="odo-strip">
        {Array.from(digits, (d, i) => (
          <i key={i}>{d}</i>
        ))}
      </span>
    </span>
  );
}
const TENS = "0123456789";
const UNITS = TENS.repeat(10);

interface ElevatorProps {
  to: number;
  delay: number;
  run: boolean;
  onTick?: (v: number) => void;
  onArrive?: () => void;
}

/**
 * L'ascenseur : la note monte de 0 à sa valeur. Les chiffres roulent comme un
 * compteur, un rail à gauche montre les paliers de tier et la cabine qui monte ;
 * chaque palier s'allume au passage. Démarre vite, freine fort sur la fin.
 */
function Elevator({ to, delay, run, onTick, onArrive }: ElevatorProps) {
  const { t } = useT();
  const [v, setV] = useState(0);
  const [arrived, setArrived] = useState(false);
  const started = useRef(false);
  const cbs = useRef({ onTick, onArrive });
  cbs.current = { onTick, onArrive };

  useEffect(() => {
    if (!run || started.current) return;
    started.current = true;
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / OVERALL_CLIMB));
      // Comme un ascenseur : vitesse constante jusqu'à 80 % de la valeur (55 % du
      // temps), puis freinage sur les derniers points, là où se joue le palier.
      const eased = p < 0.55 ? (p / 0.55) * 0.8 : 0.8 + 0.2 * (1 - Math.pow(1 - (p - 0.55) / 0.45, 3));
      const val = Math.round(to * eased);
      setV(val);
      cbs.current.onTick?.(val);
      if (p < 1) raf = requestAnimationFrame(step);
      else {
        setArrived(true);
        cbs.current.onArrive?.();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, run]);

  const tens = Math.floor(v / 10);
  return (
    <div className={`elev${arrived ? " is-arrived" : ""}${run ? " is-running" : ""}`} style={{ ["--p" as string]: v / MAX } as CSSProperties}>
      <div className="elev-rail" aria-hidden>
        <span className="elev-track" />
        <span className="elev-cab" />
        {FLOORS.map((f) => (
          <span key={f.tier} className={`elev-floor floor-${f.tier}${v >= f.at ? " lit" : ""}`} style={{ ["--at" as string]: f.at / MAX } as CSSProperties}>
            <i />
            <b>{f.at === 0 ? "0" : f.at}</b>
            <em>{t.tiers[f.tier]}</em>
          </span>
        ))}
      </div>
      <span className={`count-overall odo${tens === 0 ? " odo-one" : ""}`}>
        <Wheel index={tens} digits={TENS} />
        <Wheel index={v} digits={UNITS} />
      </span>
    </div>
  );
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
  // À l'arrivée : la vraie couleur de la carte (compte pour les cartes spéciales) et un à-coup.
  const onArrive = () => {
    const el = slot.current;
    if (!el) return;
    el.style.setProperty("--ca", accent.a);
    el.style.setProperty("--cb", accent.b);
    el.style.setProperty("--ink", accent.ink);
    el.classList.remove("ding");
    el.classList.add("arrived");
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
              <Elevator to={card.overall} delay={offset} run={climbing} onTick={onClimb} onArrive={onArrive} />
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
