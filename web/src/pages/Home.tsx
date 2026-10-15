// Entrée (§6.1) : la promesse, le champ, une carte d'exemple. Rien d'autre.
// L'exemple est la vraie carte de Jacques (fondateur d'Azerit) : la maquette
// s'affiche d'abord, la carte calculée par le serveur la remplace dès qu'elle existe.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { CardData } from "../../../shared/types";
import { styleOf } from "../../../shared/types";
import { FIXTURES } from "../../../shared/fixtures";
import { CardView } from "../card/CardView";
import { EntryForm } from "../components/EntryForm";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { onLinkClick } from "../lib/router";
import { accentOf } from "../lib/util";

/** La carte de Jacques : flotte, se balance, s'incline sous le pointeur. */
function ExampleCard() {
  const { t, lang } = useT();
  const [card, setCard] = useState<CardData>(FIXTURES.jmougeot);
  const [real, setReal] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getShowcase()
      .then((c) => {
        if (!alive || !c) return;
        setCard(c);
        setReal(true);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const accent = accentOf(card);
  const href = real ? `/c/${card.id}` : `/${card.login ?? "jmougeot"}`;
  return (
    <div className="example" style={{ "--ca": accent.a, "--cb": accent.b } as CSSProperties}>
      <div className="example-halo" aria-hidden />
      <div className="example-floor" aria-hidden />
      <figure className="example-float" aria-label={`${t.home.exampleLabel} · ${t.tierCard(t.tiers[styleOf(card)])}`}>
        <CardView card={card} lang={lang} interactive idPrefix="hero" />
      </figure>
      <p className="example-caption">
        {t.home.exampleCaption}{" "}
        <a href={href} onClick={(e) => onLinkClick(e, href)}>
          {t.home.exampleLink}
        </a>
      </p>
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
          <p className="hero-sub">{h.sub}</p>
          <EntryForm inputRef={inputRef} />
        </div>
        <div className="hero-card">
          <ExampleCard />
        </div>
      </section>
    </main>
  );
}
