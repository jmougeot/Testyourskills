// Entrée (§6.1) : un titre, le champ, une carte d'exemple qui bouge.
// Sous la ligne de flottaison : comment on note, les six stats, les tiers.
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
      <div className="example-halo" aria-hidden />
      <div className="example-floor" aria-hidden />
      <figure className="example-float" aria-label={`${t.home.exampleLabel} · ${t.tierCard(t.tiers[styleOf(card)])}`}>
        <div className={`example-turn${turning ? " is-turning" : ""}`}>
          <CardView card={card} lang={lang} interactive idPrefix="hero" />
        </div>
      </figure>
      <div className="example-caption" aria-hidden>
        <span className="example-tag">{t.home.exampleLabel}</span>
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
          <p className="kicker">
            <span className="kicker-dot" aria-hidden />
            {h.kicker}
          </p>
          <h1 className="hero-title">
            <span className="hero-a">{h.titleA}</span>
            <span className="hero-b">{h.titleB}</span>
          </h1>
          <EntryForm inputRef={inputRef} />
        </div>
        <div className="hero-card">
          <ExampleCard />
        </div>
      </section>

      <section className="how" aria-labelledby="how-title">
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
      </section>

      <section className="stats-explain" aria-labelledby="stats-title">
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
      </section>

      <section className="tiers" aria-labelledby="tiers-title">
        <h2 id="tiers-title" className="section-title">
          {h.tiersTitle}
        </h2>
        <p className="section-sub">{h.tiersSub}</p>
        <TierFan />
      </section>

      <section className="bottom-cta">
        <h2>{h.ctaBottom}</h2>
        <button type="button" className="btn-primary btn-big" onClick={backToTop}>
          {h.ctaBottomBtn}
          <IconArrow />
        </button>
      </section>
    </main>
  );
}
