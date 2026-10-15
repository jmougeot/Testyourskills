// Barre du haut, pied de page, sélecteur de langue, fond d'ambiance.
import { useEffect, useRef } from "react";
import type { Lang } from "../../../shared/types";
import { useT } from "../i18n";
import { api, isMock } from "../lib/api";
import { onLinkClick } from "../lib/router";
import { AzeritMark, Wordmark } from "./Brand";

export function LangToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useT();
  const opts: Lang[] = ["fr", "en"];
  return (
    <div className={`lang-toggle${compact ? " compact" : ""}`} role="group" aria-label={t.common.langLabel}>
      <span className="lang-toggle-thumb" data-pos={lang === "fr" ? 0 : 1} aria-hidden />
      {opts.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function SkipLink() {
  const { t } = useT();
  return (
    <a className="skip-link" href="#main">
      {t.common.skipToContent}
    </a>
  );
}

export function TopBar() {
  const { t } = useT();
  return (
    <header className="topbar">
      <a href="/" className="topbar-brand" onClick={(e) => onLinkClick(e, "/")} aria-label="Testyourskills">
        <AzeritMark size={18} className="topbar-gem" />
        <Wordmark />
      </a>
      <div className="topbar-right">
        {isMock() && <span className="demo-pill">{t.common.demo}</span>}
        <LangToggle compact />
      </div>
    </header>
  );
}

export function Footer() {
  const { t, lang } = useT();
  const privacy = lang === "fr" ? "/confidentialite" : "/privacy";
  return (
    <footer className="footer">
      <div className="footer-inner">
        <a
          className="footer-azerit"
          href="https://azerit.tech"
          target="_blank"
          rel="noopener"
          onClick={() => api.track("cta_azerit_clicked", null, { from: "footer" })}
        >
          <AzeritMark size={16} />
          <span>Azerit</span>
        </a>
        <p className="footer-tagline">{t.footer.tagline}</p>
        <nav className="footer-links">
          <a
            href="https://azerit.tech"
            target="_blank"
            rel="noopener"
            onClick={() => api.track("cta_azerit_clicked", null, { from: "footer" })}
          >
            azerit.tech
          </a>
          <a href={privacy} onClick={(e) => onLinkClick(e, privacy)}>
            {t.footer.privacy}
          </a>
          <LangToggle />
        </nav>
      </div>
    </footer>
  );
}

/** Grille de points d'azerit.tech : les points près du curseur passent au teal. */
function DotGrid() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        el.style.setProperty("--mx", `${e.clientX}px`);
        el.style.setProperty("--my", `${e.clientY}px`);
        el.style.setProperty("--glow", "1");
      });
    };
    const leave = () => el.style.setProperty("--glow", "0");
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} className="dotgrid" />;
}

/** Fond. Clair : la grille de points d'Azerit. Sombre : halos teal et bleu qui dérivent, grain, lignes de terrain. */
export function Ambient({ light = false }: { light?: boolean }) {
  if (light) {
    return (
      <div className="ambient ambient-light" aria-hidden>
        <DotGrid />
      </div>
    );
  }
  return (
    <div className="ambient" aria-hidden>
      <div className="halo halo-teal" />
      <div className="halo halo-blue" />
      <div className="halo halo-deep" />
      <div className="pitch" />
      <div className="grain" />
    </div>
  );
}
