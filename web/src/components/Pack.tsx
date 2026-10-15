// Le pack (sachet métallisé), en CSS pur.
import type { CSSProperties } from "react";
import { useT } from "../i18n";
import { AzeritMark } from "./Brand";

export function Pack({ accent, className = "", style }: { accent?: { a: string; b: string }; className?: string; style?: CSSProperties }) {
  const { lang } = useT();
  const vars = accent ? ({ "--pa": accent.a, "--pb": accent.b, ...style } as CSSProperties) : style;
  return (
    <div className={`pack ${className}`} style={vars} aria-hidden>
      <div className="pack-glow" />
      <div className="pack-shell">
        <div className="pack-crimp pack-crimp-top" />
        <div className="pack-face">
          <div className="pack-foil" />
          <div className="pack-rays" />
          <div className="pack-tear" />
          <div className="pack-content">
            <span className="pack-kicker">AZERIT · {lang === "fr" ? "SAISON 26" : "SEASON 26"}</span>
            <div className="pack-emblem">
              <div className="pack-emblem-ring" />
              <div className="pack-emblem-ring r2" />
              <AzeritMark size={54} />
            </div>
            <span className="pack-title">
              DEV
              <br />
              PACK
            </span>
            <span className="pack-sub">{lang === "fr" ? "1 carte · notée par barème" : "1 card · rubric-rated"}</span>
          </div>
          <div className="pack-cracks">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="pack-crimp pack-crimp-bottom" />
      </div>
    </div>
  );
}
