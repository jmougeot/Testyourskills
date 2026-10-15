// Entrée (§6.1) : un titre, le champ, une carte d'exemple qui bouge.
// Sous la ligne de flottaison : comment on note, les six stats, les tiers.
// Thème clair d'azerit.tech (§8.1), en plus décontracté : autocollants penchés, surligneur, carte inclinée.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CardData } from "../../../shared/types";
import { STAT_CODES, styleOf } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { EntryForm } from "../components/EntryForm";
import { IconArrow } from "../components/Icons";
import { useT } from "../i18n";
import { accentOf, useReducedMotion } from "../lib/util";

const SHOWCASE: CardData[] = [FIXTURES.gold, FIXTURES.icon, FIXTURES.wonderkid, FIXTURES.silver, FIXTURES.flashback, FIXTURES.bronze];
const ROTATE_MS = 4600;

/** Les verts du calendrier de contributions GitHub, comme sur azerit.tech. */
const GREENS = ["#9be9a8", "#40c463", "#30a14e", "#216e39"];

/** Aléatoire déterministe : la même grille à chaque rendu, côté serveur comme côté client. */
function seeded(n: number): number {
  const x = Math.sin(n * 91.7 + 45.3) * 24634.6345;
  return x - Math.floor(x);
}

/** Un bout de calendrier de contributions : `cols` semaines sur 7 jours, `fill` de cases remplies. */
function ContribPatch({ cols, fill, seed, className, delay = false }: { cols: number; fill: number; seed: number; className?: string; delay?: boolean }) {
  const cells: (string | null)[] = [];
  for (let i = 0; i < cols * 7; i++) {
    const on = seeded(i + seed) > 1 - fill;
    cells.push(on ? GREENS[Math.floor(seeded(i + seed + 0.5) * GREENS.length)] : null);
  }
  return (
    <div className={`contrib${className ? ` ${className}` : ""}`} style={{ gridTemplateColumns: `repeat(${cols}, var(--cell))` }} aria-hidden>
      {cells.map((c, i) => (
        <i key={i} className={c ? "on" : undefined} style={c ? ({ background: c, "--d": delay ? `${(i % 13) * 0.12}s` : undefined } as CSSProperties) : undefined} />
      ))}
    </div>
  );
}

/** Carte d'exemple : flotte, se balance, se retourne pour changer de tier. */
function ExampleCard() {
  const { t, lang } = useT();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const [turning, setTurning] = useState(false);
  const hover = useRef(false);

  useEffect(() => {
    if (reduced) return;
    const iv = window.setInterval(() => {
      if (hover.current || document.hidden) return;
      setTurning(true);
      window.setTimeout(() => {
        setI((n) => (n + 1) % SHOWCASE.length);
        setTurning(false);
      }, 320);
    }, ROTATE_MS);
    return () => window.clearInterval(iv);
  }, [reduced]);

  const card = SHOWCASE[i];
  const accent = accentOf(card);
  return (
    <div
      className="example"
      style={{ "--ca": accent.a, "--cb": accent.b } as CSSProperties}
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={() => (hover.current = false)}
    >
      <ContribPatch cols={9} fill={0.55} seed={3} className="example-patch tl" delay />
      <ContribPatch cols={11} fill={0.5} seed={41} className="example-patch br" delay />
      <div className="example-halo" aria-hidden />
      <div className="example-floor" aria-hidden />
      <figure className="example-float" aria-label={`${t.home.exampleLabel} · ${t.tierCard(t.tiers[styleOf(card)])}`}>
        <div className={`example-turn${turning ? " is-turning" : ""}`}>
          <CardView card={card} lang={lang} interactive idPrefix="hero" />
        </div>
      </figure>
      <span className="sticker example-sticker" aria-hidden>
        {t.home.exampleLabel}
      </span>
      <div className="example-caption" aria-hidden>
        <span className="example-dots">
          {SHOWCASE.map((c, n) => (
            <i key={c.id} className={n === i ? "on" : ""} />
          ))}
        </span>
        <span className="example-tier">{t.tiers[styleOf(card)]}</span>
      </div>
    </div>
  );
}

const WEIGHTS: Record<string, string> = { TEC: "30 %", SHIP: "20 %", ARCH: "20 %", DOC: "15 %", XP: "15 %", BUZZ: "0 %" };

function TierFan() {
  const { lang, t } = useT();
  const deck = [FIXTURES.bronze, FIXTURES.silver, FIXTURES.gold, FIXTURES.icon, FIXTURES.wonderkid, FIXTURES.flashback];
  return (
    <div className="fan" role="list">
      {deck.map((c, i) => (
        <div
          key={c.id}
          role="listitem"
          className="fan-card"
          style={{ "--i": i, "--n": deck.length, "--ca": accentOf(c).a, zIndex: 10 - Math.abs(i - (deck.length - 1) / 2) * 2 } as CSSProperties}
          aria-label={t.tierCard(t.tiers[styleOf(c)])}
        >
          <CardView card={c} lang={lang} interactive={false} idPrefix={`fan-${c.id}`} />
          <span className="fan-label">{t.tiers[styleOf(c)]}</span>
        </div>
      ))}
    </div>
  );
}

/** Bandeau de commits qui défile, en pied de page, comme la fin de la landing Azerit. */
function CommitMarquee() {
  return (
    <div className="commits" aria-hidden>
      <div className="commits-track">
        <ContribPatch cols={60} fill={0.42} seed={7} />
        <ContribPatch cols={60} fill={0.42} seed={7} />
      </div>
    </div>
  );
}

export function Home() {
  const { t } = useT();
  const h = t.home;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = t.meta.title;
  }, [t]);

  const backToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 450);
  };

  return (
    <main className="page page-home" id="main">
      <section className="hero">
        <div className="hero-copy">
          <p className="stickers">
            {h.stickers.map((s, i) => (
              <span key={s} className="sticker">
                {i === 0 && <span className="sticker-dot" aria-hidden />}
                {s}
              </span>
            ))}
          </p>
          <h1 className="hero-title">
            <span className="hero-a">{h.titleA}</span> <span className="hero-b">{h.titleB}</span>
          </h1>
          <EntryForm inputRef={inputRef} />
        </div>
        <div className="hero-card">
          <ExampleCard />
        </div>
      </section>

      <section className="band how" aria-labelledby="how-title">
        <div className="band-inner">
          <p className="section-kicker">{h.howKicker}</p>
          <h2 id="how-title" className="section-title">
            {h.howTitle}
          </h2>
          <ol className="how-steps">
            {h.howSteps.map((s, i) => (
              <li key={i} className="how-step">
                <span className="how-num">0{i + 1}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band stats-explain" aria-labelledby="stats-title">
        <div className="band-inner">
          <h2 id="stats-title" className="section-title">
            {h.statsTitle}
          </h2>
          <ul className="stat-tiles">
            {STAT_CODES.map((c) => (
              <li key={c} className={`stat-tile${c === "BUZZ" ? " is-buzz" : ""}`}>
                <span className="stat-tile-code">{c}</span>
                <span className="stat-tile-weight">{WEIGHTS[c]}</span>
                <h3>{t.stats[c].name}</h3>
                <p>{t.stats[c].what}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="band tiers" aria-labelledby="tiers-title">
        <div className="band-inner">
          <h2 id="tiers-title" className="section-title">
            {h.tiersTitle}
          </h2>
          <p className="section-sub">{h.tiersSub}</p>
          <TierFan />
        </div>
      </section>

      <section className="band bottom-cta">
        <div className="band-inner">
          <h2>{h.ctaBottom}</h2>
          <button type="button" className="btn-primary btn-big" onClick={backToTop}>
            {h.ctaBottomBtn}
            <IconArrow />
          </button>
        </div>
        <CommitMarquee />
      </section>
    </main>
  );
}
