// Barre du haut, pied de page, sélecteur de langue, fond d'ambiance.
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
          <a href="/3d/CREDITS.txt" target="_blank" rel="noopener">
            {lang === "fr" ? "Crédits 3D" : "3D credits"}
          </a>
        </nav>
      </div>
    </footer>
  );
}

/** Fond : halos teal et bleu qui dérivent, grain, lignes de terrain très discrètes. */
export function Ambient() {
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
