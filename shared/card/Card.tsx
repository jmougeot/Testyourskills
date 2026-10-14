// La carte de compétences : un seul composant SVG React pur, rendu à
// l'identique dans le navigateur et côté serveur (renderToStaticMarkup → resvg).
// Uniquement des fonctionnalités SVG que resvg sait rendre : dégradés, motifs,
// clipPath, mask, filtres (turbulence, matrice de couleur, flou), texte, image.
import { useId, type ReactNode } from "react";
import type { CardData, Lang, Stat, StatusInstance, StatusTone } from "../types";
import { styleOf } from "../types";
import { AzeritGem, AzeritGemDefs } from "./AzeritGem";
import { fontAttrs, type FontKey } from "./fonts";
import { CARD_H, CARD_W, cardPath } from "./geometry";
import { t } from "./i18n";
import { langIcon } from "./languages";
import { fit, measure, truncate, upper } from "./text";
import { themeFor, type CardTheme, type Stop } from "./themes";

export interface CardProps {
  card: CardData;
  lang?: Lang;
  /** Remplace card.avatarUrl (le serveur passe un data URI ; "" force les initiales). */
  avatarHref?: string;
  /** Préfixe des ids de defs, pour afficher plusieurs cartes sur une page. */
  idPrefix?: string;
  className?: string;
}

export interface CardGraphicProps extends CardProps {
  /** Placement quand la carte est imbriquée dans une composition SVG. */
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
}

/* ------------------------------------------------------------------ */
/* Mise en page (unités du viewBox 360 × 520)                          */
/* ------------------------------------------------------------------ */

const L = {
  frame: 5, // épaisseur de l'anneau métallique
  filet: 10, // filet intérieur lumineux
  col: 68, // axe de la colonne note / poste / langage / club
  overallY: 100,
  positionY: 121,
  sepY: 130,
  langY: 147,
  clubY: 179,
  portrait: { x: 114, y: 20, s: 226, cx: 227, cy: 136 },
  nameY: 274,
  ruleY: 289,
  statsY: [320, 347, 374],
  statsTop: 301,
  statsBottom: 381,
  pillsTop: 386,
  pillsBottom: 455,
  footerY: 473.5,
  footerBand: [459, 481] as const,
};

const PILL_H = 20.5;
const PILL_GAP = 3.5;
const PILL_MAX = 286;

/* ------------------------------------------------------------------ */

function stops(s: Stop[]) {
  return s.map(([o, c, a], i) => <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />);
}

function sanitize(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

interface TxtProps {
  x: number;
  y: number;
  font: FontKey;
  size: number;
  fill: string;
  ls?: number;
  anchor?: "start" | "middle" | "end";
  emboss?: { color: string; opacity: number; dy?: number };
  opacity?: number;
  children: ReactNode;
}

/** Texte avec un liseré de gravure optionnel (copie décalée d'un demi-pixel). */
function Txt({ x, y, font, size, fill, ls = 0, anchor = "start", emboss, opacity, children }: TxtProps) {
  const common = { ...fontAttrs(font), fontSize: size, letterSpacing: ls || undefined, textAnchor: anchor } as const;
  return (
    <g opacity={opacity}>
      {emboss && emboss.opacity > 0 && (
        <text x={x} y={y + (emboss.dy ?? 0.9)} {...common} fill={emboss.color} fillOpacity={emboss.opacity}>
          {children}
        </text>
      )}
      <text x={x} y={y} {...common} fill={fill}>
        {children}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Defs : textures par tier                                            */
/* ------------------------------------------------------------------ */

function TextureDefs({ id, th }: { id: string; th: CardTheme }) {
  const region = { x: 0, y: 0, width: CARD_W, height: CARD_H, filterUnits: "userSpaceOnUse" as const, colorInterpolationFilters: "sRGB" as const };
  switch (th.texture) {
    case "grain":
      // cuivre mat : grain serré, points sombres et clairs
      return (
        <filter id={`${id}-tex`} {...region}>
          <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves={2} seed={7} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 0 0.02  -3 0 0 0 1.42" result="d" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.9  0 0 0 0 0.8  3 0 0 0 -1.62" result="l" />
          <feMerge>
            <feMergeNode in="d" />
            <feMergeNode in="l" />
          </feMerge>
        </filter>
      );
    case "brushed":
      // acier brossé : bruit étiré à l'horizontale
      return (
        <filter id={`${id}-tex`} {...region}>
          <feTurbulence type="fractalNoise" baseFrequency="0.003 0.62" numOctaves={3} seed={4} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.1  0 0 0 0 0.13  0 0 0 0 0.16  -3.2 0 0 0 1.5" result="d" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.2 0 0 0 -1.62" result="l" />
          <feMerge>
            <feMergeNode in="d" />
            <feMergeNode in="l" />
          </feMerge>
        </filter>
      );
    case "glints":
      // or : paillettes claires éparses sur un grain très fin
      return (
        <filter id={`${id}-tex`} {...region}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={11} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.98  0 0 0 0 0.85  7 0 0 0 -4.3" result="g" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.2  0 0 0 0 0  -2.2 0 0 0 0.95" result="d" />
          <feMerge>
            <feMergeNode in="d" />
            <feMergeNode in="g" />
          </feMerge>
        </filter>
      );
    case "pearl":
      // nacre : marbrures pastel à basse fréquence
      return (
        <filter id={`${id}-tex`} {...region}>
          <feTurbulence type="fractalNoise" baseFrequency="0.009 0.014" numOctaves={3} seed={23} result="n" />
          <feColorMatrix in="n" type="matrix" values="1.6 0 0 0 0.05  0 1.6 0 0 0.05  0 0 1.6 0 0.1  0 0 0 0 0.55" />
        </filter>
      );
    case "energy":
    case "halftone":
    case "pinstripe":
      // flashback et TOTW : un grain léger en plus du motif
      return (
        <filter id={`${id}-tex`} {...region}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={3} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.08  0 0 0 0 0.12  -2.6 0 0 0 1.25" result="d" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.9  2.6 0 0 0 -1.45" result="l" />
          <feMerge>
            <feMergeNode in="d" />
            <feMergeNode in="l" />
          </feMerge>
        </filter>
      );
  }
}

/** Traînées d'énergie (Wonderkid), tirées une fois avec une graine fixe. */
const STREAKS = (() => {
  let seed = 20261014;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 46 }, () => ({
    x: r() * 440 - 90,
    y: r() * 600 - 40,
    len: 60 + r() * 240,
    w: 0.4 + r() * r() * 3.6,
    o: 0.35 + r() * 0.65,
    lime: r() > 0.55,
  }));
})();

/** Facettes cristallines du fond, inspirées des deux faces de la gemme. */
const FACETS: { d: string; light: boolean }[] = [
  { d: "M0 0 L150 0 L64 300 L0 236 Z", light: true },
  { d: "M150 0 L360 0 L360 96 L214 226 Z", light: false },
  { d: "M360 96 L360 318 L214 226 Z", light: true },
  { d: "M150 0 L214 226 L64 300 Z", light: false },
  { d: "M0 236 L64 300 L0 404 Z", light: false },
  { d: "M214 226 L360 318 L360 520 L292 520 Z", light: false },
  { d: "M64 300 L214 226 L292 520 L118 520 Z", light: true },
];

/* ------------------------------------------------------------------ */
/* Pictogrammes                                                         */
/* ------------------------------------------------------------------ */

function ToneGlyph({ tone, cx, cy, color }: { tone: StatusTone; cx: number; cy: number; color: string }) {
  const s = { stroke: color, strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (tone) {
    case "negative":
      return <path d={`M${cx - 2.6} ${cy - 1.3} L${cx} ${cy + 1.6} L${cx + 2.6} ${cy - 1.3}`} {...s} />;
    case "positive":
      return <path d={`M${cx - 2.6} ${cy + 1.3} L${cx} ${cy - 1.6} L${cx + 2.6} ${cy + 1.3}`} {...s} />;
    case "special":
      return (
        <path
          d={`M${cx} ${cy - 3.2} Q${cx + 0.6} ${cy - 0.6} ${cx + 3.2} ${cy} Q${cx + 0.6} ${cy + 0.6} ${cx} ${cy + 3.2} Q${cx - 0.6} ${cy + 0.6} ${cx - 3.2} ${cy} Q${cx - 0.6} ${cy - 0.6} ${cx} ${cy - 3.2} Z`}
          fill={color}
        />
      );
    case "gap":
      return (
        <g {...s} strokeWidth={1.2}>
          <path d={`M${cx - 2.6} ${cy - 1.2} H${cx + 2.6} M${cx - 2.6} ${cy + 1.2} H${cx + 2.6}`} />
          <path d={`M${cx + 1.4} ${cy - 3} L${cx - 1.4} ${cy + 3}`} />
        </g>
      );
  }
}

/** Petit pictogramme « vent » pour BUZZ. */
function Wind({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g fill="none" stroke={color} strokeWidth={1.3} strokeLinecap="round" transform={`translate(${x} ${y})`}>
      <path d="M0 -3.2 H6.2 a1.9 1.9 0 1 0 -1.9 -1.9" />
      <path d="M0 0 H9 a1.9 1.9 0 1 1 -1.9 1.9" />
      <path d="M0 3.2 H4.4" />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Blocs                                                                */
/* ------------------------------------------------------------------ */

function StatCell({ stat, x, y, th, lang, align }: { stat: Stat; x: number; y: number; th: CardTheme; lang: Lang; align: "left" | "right" }) {
  // x = bord droit de la valeur ; le code suit à droite.
  void align;
  const isBuzz = stat.code === "BUZZ";
  const weak = !stat.sufficient;
  const valueFill = isBuzz ? th.buzz : th.ink;
  const codeFill = isBuzz ? th.buzz : th.inkSoft;
  const codeX = x + 6;
  const codeW = measure(stat.code, "mono-500", 12.5, 0.6);
  const emb = { color: th.emboss, opacity: th.embossOpacity * (weak ? 0.5 : 1) };
  void lang;
  return (
    <g>
      {isBuzz && (
        <rect
          x={x - 33}
          y={y - 20}
          width={codeW + 58}
          height={26}
          rx={5}
          fill={th.buzz}
          fillOpacity={th.dark ? 0.1 : 0.09}
          stroke={th.buzz}
          strokeOpacity={0.55}
          strokeWidth={0.8}
          strokeDasharray="2.4 2"
        />
      )}
      <Txt x={x} y={y} font="display-800" size={27} anchor="end" fill={valueFill} emboss={emb} opacity={weak ? 0.42 : 1}>
        {stat.value}
      </Txt>
      <Txt x={codeX} y={y - 1} font="mono-500" size={12.5} ls={0.6} fill={codeFill} opacity={weak ? 0.5 : 1}>
        {stat.code}
      </Txt>
      {isBuzz && <Wind x={codeX + codeW + 4} y={y - 5.5} color={th.buzz} />}
      {weak && (
        // marqueur « données insuffisantes » : petit cercle pointillé avec un point d'interrogation
        <g transform={`translate(${codeX + codeW + 8} ${y - 5})`}>
          <circle r={4.8} fill={th.dark ? "#000" : th.pillBg} fillOpacity={th.dark ? 0.6 : th.pillBgOpacity} />
          <text y={2.4} {...fontAttrs("mono-700")} fontSize={7} textAnchor="middle" fill={th.pillText}>
            ?
          </text>
        </g>
      )}
    </g>
  );
}

function StatusPills({ statuses, th, lang, id }: { statuses: StatusInstance[]; th: CardTheme; lang: Lang; id: string }) {
  const list = statuses.slice(0, 3);
  const n = list.length;
  if (n === 0) return null;
  const totalH = n * PILL_H + (n - 1) * PILL_GAP;
  const top = L.pillsTop + (L.pillsBottom - L.pillsTop - totalH) / 2;
  const s = t(lang);
  return (
    <g>
      {list.map((st, i) => {
        const aiW = st.byAI ? 22 : 0;
        const fontSize = 10.5;
        const maxText = PILL_MAX - 26 - 11 - aiW;
        const label = truncate(st.label[lang] ?? st.label.fr, "sans-600", fontSize, maxText, 0.05);
        const tw = measure(label, "sans-600", fontSize, 0.05);
        const w = 26 + tw + 11 + aiW;
        const x = 180 - w / 2;
        const y = top + i * (PILL_H + PILL_GAP);
        const tone = th.tones[st.tone];
        return (
          <g key={st.id + i}>
            <rect x={x} y={y + 1} width={w} height={PILL_H} rx={PILL_H / 2} fill="#000" fillOpacity={th.dark ? 0.3 : 0.18} />
            <rect x={x} y={y} width={w} height={PILL_H} rx={PILL_H / 2} fill={th.pillBg} fillOpacity={th.pillBgOpacity} />
            <rect
              x={x + 0.4}
              y={y + 0.4}
              width={w - 0.8}
              height={PILL_H - 0.8}
              rx={(PILL_H - 0.8) / 2}
              fill="none"
              stroke={`url(#${id}-pillrim)`}
              strokeWidth={0.8}
            />
            <circle cx={x + 12} cy={y + PILL_H / 2} r={6.6} fill={tone} fillOpacity={0.18} />
            <ToneGlyph tone={st.tone} cx={x + 12} cy={y + PILL_H / 2} color={tone} />
            <text x={x + 23.5} y={y + 14.2} {...fontAttrs("sans-600")} fontSize={fontSize} letterSpacing={0.05} fill={th.pillText}>
              {label}
            </text>
            {st.byAI && (
              <g transform={`translate(${x + w - 9 - 18} ${y + 4})`}>
                <rect width={18} height={12.5} rx={3.2} fill="none" stroke={tone} strokeOpacity={0.9} strokeWidth={0.85} />
                <text x={9} y={9.2} {...fontAttrs("mono-700")} fontSize={7.6} letterSpacing={0.3} textAnchor="middle" fill={tone}>
                  {s.ai}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* Carte                                                                */
/* ------------------------------------------------------------------ */

export function CardGraphic({ card, lang: langProp, avatarHref, idPrefix, className, x, y, width, height }: CardGraphicProps) {
  const rid = sanitize(useId());
  const id = sanitize(idPrefix ?? `tys${rid}`);
  const lang: Lang = langProp ?? card.lang ?? "fr";
  const s = t(lang);
  const style = styleOf(card);
  const th = themeFor(style);
  // avatarHref === "" : pas d'avatar exploitable (initiales), même si card.avatarUrl existe
  const avatar = avatarHref !== undefined ? avatarHref || undefined : card.avatarUrl;
  const P = L.portrait;
  const u = (k: string) => `url(#${id}-${k})`;
  const emb = { color: th.emboss, opacity: th.embossOpacity };
  const inkFill = th.inkGradient ? u("ink") : th.ink;

  // Textes ajustés
  const name = fit(upper(card.name, lang), { font: "display-700", size: 38, minSize: 22, maxWidth: 296, letterSpacing: 0.6, minLetterSpacing: 0 });
  const club = fit(upper(card.club ?? s.freeAgent, lang), { font: "sans-600", size: 8, minSize: 6.6, maxWidth: 88, letterSpacing: 0.5, minLetterSpacing: 0.2 });
  const sourceLabel =
    card.source === "cv"
      ? s.sourceCv
      : card.login && card.login.toLowerCase() !== card.name.toLowerCase()
        ? `${s.sourceGithub} · @${card.login.toUpperCase()}`
        : s.sourceGithub;
  const source = fit(sourceLabel, { font: "mono-500", size: 7.4, minSize: 6.2, maxWidth: 150, letterSpacing: 1.4, minLetterSpacing: 0.6 });
  const position = card.position;
  const posFit = fit(position, { font: "mono-700", size: 15, minSize: 10, maxWidth: 76, letterSpacing: 1.2, minLetterSpacing: 0.2 });
  const overallSize = card.overall >= 100 ? 58 : 72;
  const icon = langIcon(card.mainLanguage);

  // Pied
  const judged = s.judged(card.judgedInSeconds);
  const rel = s.percent(card.reliability);
  const footerText = `${judged} · ${s.reliability} `;
  const footerFit = fit(`${footerText}${rel}`, { font: "mono-500", size: 10, minSize: 7.5, maxWidth: 244, letterSpacing: 0, minLetterSpacing: 0 });
  const footerSize = footerFit.size;
  const relColor = card.reliability < 50 ? th.tones.negative : card.reliability >= 75 ? th.tones.positive : th.pillText;

  const left = card.stats.slice(0, 3);
  const right = card.stats.slice(3, 6);

  const label = upper(th.label[lang], lang);
  const badge = fit(label, { font: "display-700", size: 11, minSize: 8.5, maxWidth: 98, letterSpacing: th.badge ? 1.6 : 2.4, minLetterSpacing: 0.6 });
  // cartouche du tier : sombre, lettres dans le métal clair du cadre ; badge coloré pour les spéciales
  const plate = th.badge ?? { bg: [], ink: th.frame[3][1], border: th.pillBorder };

  const nameW = name.width;
  const ruleGap = Math.max(nameW, source.width) / 2;
  void ruleGap;
  const sourceHalf = source.width / 2 + 9;

  const ariaLabel = `${s.card} ${th.label[lang]} ${card.overall} — ${card.name}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${CARD_W} ${CARD_H}`}
      x={x}
      y={y}
      width={width ?? "100%"}
      height={height}
      className={className}
      role="img"
      aria-label={ariaLabel}
      style={width === undefined ? { display: "block", width: "100%", height: "auto" } : undefined}
    >
      <defs>
        <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="1" y2="1">
          {stops(th.frame)}
        </linearGradient>
        <linearGradient id={`${id}-framev`} x1="0" y1="0" x2="0.35" y2="1">
          {stops(th.frame)}
        </linearGradient>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0.2" y2="1">
          {stops(th.body)}
        </linearGradient>
        <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0.72">
          {stops(th.sheen)}
        </linearGradient>
        {th.inkGradient && (
          <linearGradient id={`${id}-ink`} x1="0" y1="0" x2="0" y2="1">
            {stops(th.inkGradient)}
          </linearGradient>
        )}
        <linearGradient id={`${id}-bevel`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.85} />
          <stop offset="0.45" stopColor="#fff" stopOpacity={0.1} />
          <stop offset="0.55" stopColor="#000" stopOpacity={0.05} />
          <stop offset="1" stopColor="#000" stopOpacity={0.55} />
        </linearGradient>
        <linearGradient id={`${id}-pillrim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={th.pillBorder} stopOpacity={0.55} />
          <stop offset="1" stopColor={th.pillBorder} stopOpacity={0.08} />
        </linearGradient>
        <radialGradient id={`${id}-halo`} cx={P.cx} cy={P.cy} r={150} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={th.halo} stopOpacity={th.haloOpacity} />
          <stop offset="0.45" stopColor={th.halo} stopOpacity={th.haloOpacity * 0.45} />
          <stop offset="1" stopColor={th.halo} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}-vignette`} cx="180" cy="230" r="330" gradientUnits="userSpaceOnUse">
          <stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={th.dark ? 0.55 : 0.32} />
        </radialGradient>
        {/* fondu elliptique du portrait, entièrement contenu dans l'image (aucun bord visible) */}
        <radialGradient id={`${id}-pfade`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform={`translate(${P.cx} ${P.y + 104}) scale(${P.s / 2 - 2} ${P.s / 2 + 6})`}>
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.5" stopColor="#fff" />
          <stop offset="0.78" stopColor="#888" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <linearGradient id={`${id}-pfadev`} x1="0" y1={P.y} x2="0" y2={P.y + P.s} gradientUnits="userSpaceOnUse">
          <stop offset="0.6" stopColor="#fff" />
          <stop offset="0.8" stopColor="#777" />
          <stop offset="0.99" stopColor="#000" />
        </linearGradient>
        <radialGradient id={`${id}-raysfade`} cx={P.cx} cy={P.cy} r={230} gradientUnits="userSpaceOnUse">
          <stop offset="0.15" stopColor="#fff" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <linearGradient id={`${id}-rulefade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={th.rule} stopOpacity={0} />
          <stop offset="0.5" stopColor={th.rule} stopOpacity={0.9} />
          <stop offset="1" stopColor={th.rule} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={`${id}-vdiv`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={th.rule} stopOpacity={0} />
          <stop offset="0.5" stopColor={th.rule} stopOpacity={0.6} />
          <stop offset="1" stopColor={th.rule} stopOpacity={0} />
        </linearGradient>
        {th.badge && (
          <linearGradient id={`${id}-badge`} x1="0" y1="0" x2="1" y2="0">
            {stops(th.badge.bg)}
          </linearGradient>
        )}
        <AzeritGemDefs id={id} />

        <clipPath id={`${id}-outer`}>
          <path d={cardPath(0)} />
        </clipPath>
        <clipPath id={`${id}-filet-clip`}>
          <path d={cardPath(L.filet)} />
        </clipPath>
        <clipPath id={`${id}-body-clip`}>
          <path d={cardPath(L.frame)} />
        </clipPath>

        <mask id={`${id}-pmask-r`} maskUnits="userSpaceOnUse" x="0" y="0" width={CARD_W} height={CARD_H}>
          <rect width={CARD_W} height={CARD_H} fill={u("pfade")} />
        </mask>
        <mask id={`${id}-pmask-v`} maskUnits="userSpaceOnUse" x="0" y="0" width={CARD_W} height={CARD_H}>
          <rect width={CARD_W} height={CARD_H} fill={u("pfadev")} />
        </mask>
        <mask id={`${id}-raysmask`} maskUnits="userSpaceOnUse" x="0" y="0" width={CARD_W} height={CARD_H}>
          <rect width={CARD_W} height={CARD_H} fill={u("raysfade")} />
        </mask>

        <TextureDefs id={id} th={th} />
        {th.texture === "energy" && (
          <>
            {/* traînées atténuées derrière les stats, pour la lisibilité */}
            <linearGradient id={`${id}-streakfade`} x1="0" y1="0" x2="0" y2={CARD_H} gradientUnits="userSpaceOnUse">
              <stop offset="0.45" stopColor="#fff" />
              <stop offset="0.62" stopColor="#555" />
              <stop offset="0.9" stopColor="#777" />
            </linearGradient>
            <mask id={`${id}-streakmask`} maskUnits="userSpaceOnUse" x="0" y="0" width={CARD_W} height={CARD_H}>
              <rect width={CARD_W} height={CARD_H} fill={u("streakfade")} />
            </mask>
            <linearGradient id={`${id}-streak-a`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#dde27d" stopOpacity={0} />
              <stop offset="0.7" stopColor="#eef29a" stopOpacity={1} />
              <stop offset="1" stopColor="#dde27d" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`${id}-streak-b`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#52d0bd" stopOpacity={0} />
              <stop offset="0.65" stopColor="#7fe6d4" stopOpacity={1} />
              <stop offset="1" stopColor="#52d0bd" stopOpacity={0} />
            </linearGradient>
          </>
        )}
        {th.texture === "halftone" && (
          <pattern id={`${id}-dots`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(30)">
            <circle cx="2.5" cy="2.5" r="1.15" fill={th.ink} />
          </pattern>
        )}
        {th.texture === "pinstripe" && (
          <pattern id={`${id}-stripes`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="0.9" height="7" fill={th.rule} />
          </pattern>
        )}

        <filter id={`${id}-glow`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        {card.source === "cv" && (
          <>
            <filter id={`${id}-stampnoise`} x="0" y="0" width="1" height="1">
              <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} seed={2} result="n" />
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  7 0 0 0 -2.55" />
            </filter>
            <mask id={`${id}-stampmask`} maskUnits="userSpaceOnUse" x="-90" y="-40" width="180" height="80">
              <rect x="-90" y="-40" width="180" height="80" fill="#fff" filter={u("stampnoise")} />
            </mask>
          </>
        )}
      </defs>

      {/* Anneau métallique */}
      <path d={cardPath(0)} fill={u("frame")} />
      <g clipPath={u("outer")}>
        <path d={cardPath(0)} fill="none" stroke={u("bevel")} strokeWidth={3.2} />
      </g>

      {/* Corps */}
      <g clipPath={u("body-clip")}>
        <rect width={CARD_W} height={CARD_H} fill={u("body")} />

        {/* Texture du métal */}
        <rect width={CARD_W} height={CARD_H} filter={u("tex")} opacity={th.texture === "energy" ? 0.35 : th.textureOpacity} />
        {th.texture === "energy" && (
          <g mask={u("streakmask")}>
          <g opacity={0.8} filter={u("soft")}>
            {STREAKS.filter((_, i) => i % 3 === 0).map((k, i) => (
              <rect key={i} x={k.x} y={k.y - 3} width={k.len} height={k.w + 6} fill={u(k.lime ? "streak-a" : "streak-b")} opacity={k.o * 0.5} transform={`rotate(-28 ${k.x + k.len / 2} ${k.y})`} />
            ))}
          </g>
          <g opacity={th.textureOpacity}>
            {STREAKS.map((k, i) => (
              <rect
                key={i}
                x={k.x}
                y={k.y}
                width={k.len}
                height={k.w}
                rx={k.w / 2}
                fill={u(k.lime ? "streak-a" : "streak-b")}
                opacity={k.o}
                transform={`rotate(-28 ${k.x + k.len / 2} ${k.y})`}
              />
            ))}
          </g>
          </g>
        )}
        {th.texture === "halftone" && <rect width={CARD_W} height={CARD_H} fill={u("dots")} opacity={th.textureOpacity} />}
        {th.texture === "pinstripe" && <rect width={CARD_W} height={CARD_H} fill={u("stripes")} opacity={th.textureOpacity} />}

        {/* Facettes */}
        {FACETS.map((f, i) => (
          <path key={i} d={f.d} fill={f.light ? "#fff" : "#000"} fillOpacity={f.light ? th.facetLight : th.facetDark} />
        ))}

        {/* Reflets */}
        <rect width={CARD_W} height={CARD_H} fill={u("sheen")} />

        {/* Halo et rayons derrière le portrait */}
        {th.rays > 0 && (
          <g mask={u("raysmask")} opacity={th.rays}>
            {Array.from({ length: 18 }, (_, i) => {
              const a0 = (i / 18) * Math.PI * 2;
              const a1 = a0 + Math.PI / 36;
              const R = 300;
              return (
                <path
                  key={i}
                  d={`M${P.cx} ${P.cy} L${P.cx + R * Math.cos(a0)} ${P.cy + R * Math.sin(a0)} L${P.cx + R * Math.cos(a1)} ${P.cy + R * Math.sin(a1)} Z`}
                  fill={th.dark ? th.halo : "#fff"}
                />
              );
            })}
          </g>
        )}
        <circle cx={P.cx} cy={P.cy} r={150} fill={u("halo")} />

        {/* Portrait */}
        {avatar ? (
          <g mask={u("pmask-v")}>
            <g mask={u("pmask-r")}>
              <image href={avatar} x={P.x} y={P.y} width={P.s} height={P.s} preserveAspectRatio="xMidYMid slice" />
            </g>
          </g>
        ) : (
          <Initials initials={card.initials} th={th} id={id} />
        )}

        {/* Tampon CV */}
        {card.source === "cv" && (
          <g transform="translate(262 222) rotate(-9)">
            <g mask={u("stampmask")} opacity={0.88}>
              <rect x={-64} y={-16} width={128} height={32} rx={3} fill="none" stroke={th.dark ? "#ff8b7b" : "#a3261b"} strokeWidth={2.2} />
              <rect x={-60} y={-12} width={120} height={24} rx={1.5} fill="none" stroke={th.dark ? "#ff8b7b" : "#a3261b"} strokeWidth={0.8} />
              <text x={0} y={5.4} {...fontAttrs("display-800")} fontSize={15.5} letterSpacing={1.4} textAnchor="middle" fill={th.dark ? "#ff8b7b" : "#a3261b"}>
                {fit(s.cvStamp, { font: "display-800", size: 15.5, minSize: 11, maxWidth: 108, letterSpacing: 1.4, minLetterSpacing: 0.4 }).text}
              </text>
            </g>
          </g>
        )}

        {/* Vignettage */}
        <rect width={CARD_W} height={CARD_H} fill={u("vignette")} />
      </g>

      {/* Filets : séparation cadre / corps, puis bord intérieur lumineux */}
      <path d={cardPath(L.frame)} fill="none" stroke="#000" strokeOpacity={0.4} strokeWidth={0.9} />
      <path d={cardPath(L.frame + 0.9)} fill="none" stroke="#fff" strokeOpacity={th.dark ? 0.12 : 0.35} strokeWidth={0.6} />
      <path d={cardPath(L.filet)} fill="none" stroke={th.innerGlow} strokeOpacity={th.dark ? 0.7 : 0.55} strokeWidth={2.4} filter={u("glow")} />
      <path d={cardPath(L.filet)} fill="none" stroke={u("framev")} strokeWidth={1.1} />
      <path d={cardPath(L.filet)} fill="none" stroke={th.innerLine} strokeOpacity={0.55} strokeWidth={0.45} />

      {/* Tier ou badge spécial dans la couronne, en cartouche */}
      <g>
        <rect x={180 - badge.width / 2 - 11} y={14.5} width={badge.width + 22} height={16} rx={3} fill={th.badge ? u("badge") : th.pillBg} fillOpacity={th.badge ? 1 : th.pillBgOpacity} />
        <rect x={180 - badge.width / 2 - 11} y={14.5} width={badge.width + 22} height={16} rx={3} fill="none" stroke={plate.border} strokeOpacity={th.badge ? 0.8 : 0.45} strokeWidth={0.7} />
        <text x={180 + badge.letterSpacing / 2} y={26.4} {...fontAttrs("display-700")} fontSize={badge.size} letterSpacing={badge.letterSpacing} textAnchor="middle" fill={plate.ink}>
          {badge.text}
        </text>
      </g>

      {/* Colonne gauche : note, poste, langage, club */}
      <Txt x={L.col} y={L.overallY} font="display-800" size={overallSize} ls={-1.5} anchor="middle" fill={inkFill} emboss={emb}>
        {card.overall}
      </Txt>
      <Txt x={L.col} y={L.positionY} font="mono-700" size={posFit.size} ls={posFit.letterSpacing} anchor="middle" fill={th.ink} emboss={emb}>
        {posFit.text}
      </Txt>
      <line x1={L.col - 17} x2={L.col + 17} y1={L.sepY} y2={L.sepY} stroke={th.rule} strokeOpacity={0.6} strokeWidth={0.8} />
      {icon ? (
        <g transform={`translate(${L.col - 11} ${L.langY - 11}) scale(${22 / 24})`}>
          {th.embossOpacity > 0 && <path d={icon.path} fill={th.emboss} fillOpacity={th.embossOpacity} transform="translate(0 1)" />}
          <path d={icon.path} fill={th.ink} />
        </g>
      ) : (
        <Txt x={L.col} y={L.langY + 6} font="mono-700" size={17} anchor="middle" fill={th.ink} emboss={emb}>
          {"{}"}
        </Txt>
      )}
      <line x1={L.col - 17} x2={L.col + 17} y1={L.langY + 17} y2={L.langY + 17} stroke={th.rule} strokeOpacity={0.6} strokeWidth={0.8} />
      <Txt x={L.col} y={L.clubY} font="sans-600" size={club.size} ls={club.letterSpacing} anchor="middle" fill={th.inkSoft} emboss={emb}>
        {club.text}
      </Txt>

      {/* Gemme Azerit */}
      <AzeritGem id={id} x={305} y={40} h={25} outline={th.dark ? undefined : "#ffffff"} />

      {/* Bandeau nom */}
      <Txt x={180} y={L.nameY} font="display-700" size={name.size} ls={name.letterSpacing} anchor="middle" fill={inkFill} emboss={emb}>
        {name.text}
      </Txt>
      <g>
        <rect x={34} y={L.ruleY - 0.4} width={180 - sourceHalf - 34} height={0.8} fill={u("rulefade")} />
        <rect x={180 + sourceHalf} y={L.ruleY - 0.4} width={326 - 180 - sourceHalf} height={0.8} fill={u("rulefade")} />
        <path d={`M${180 - sourceHalf} ${L.ruleY} l3 -3 l3 3 l-3 3 Z`} fill={th.rule} opacity={0.8} />
        <path d={`M${180 + sourceHalf} ${L.ruleY} l-3 -3 l-3 3 l3 3 Z`} fill={th.rule} opacity={0.8} />
        <Txt x={180} y={L.ruleY + 2.6} font="mono-500" size={source.size} ls={source.letterSpacing} anchor="middle" fill={th.inkSoft}>
          {source.text}
        </Txt>
      </g>

      {/* Stats */}
      <rect x={179.6} y={L.statsTop} width={0.8} height={L.statsBottom - L.statsTop} fill={u("vdiv")} />
      {left.map((st, i) => (
        <StatCell key={st.code} stat={st} x={111} y={L.statsY[i]} th={th} lang={lang} align="left" />
      ))}
      {right.map((st, i) => (
        <StatCell key={st.code} stat={st} x={244} y={L.statsY[i]} th={th} lang={lang} align="right" />
      ))}

      {/* Statuts */}
      <StatusPills statuses={card.statuses} th={th} lang={lang} id={id} />

      {/* Pied : bande sombre gravée, « Jugé par une IA en 9 s · fiabilité 34 % » */}
      <g clipPath={u("filet-clip")}>
        <rect x={0} y={L.footerBand[0]} width={CARD_W} height={L.footerBand[1] - L.footerBand[0]} fill={th.dark ? "#000" : th.pillBg} fillOpacity={th.dark ? 0.45 : 0.8} />
        <rect x={0} y={L.footerBand[0]} width={CARD_W} height={0.7} fill={th.innerLine} fillOpacity={0.55} />
        <rect x={0} y={L.footerBand[1] - 0.7} width={CARD_W} height={0.7} fill="#000" fillOpacity={0.35} />
      </g>
      <text x={180} y={L.footerY} {...fontAttrs("mono-500")} fontSize={footerSize} textAnchor="middle" fill={th.pillText}>
        <tspan fillOpacity={0.88}>{footerText}</tspan>
        <tspan {...fontAttrs("mono-700")} fill={relColor}>
          {rel}
        </tspan>
      </text>
      <path d="M180 489 l3.2 3.6 l-3.2 3.6 l-3.2 -3.6 Z" fill={th.rule} opacity={0.75} />
    </svg>
  );
}

function Initials({ initials, th, id }: { initials: string; th: CardTheme; id: string }) {
  const P = L.portrait;
  const txt = initials.slice(0, 3).toUpperCase();
  const f = fit(txt, { font: "display-800", size: 124, minSize: 70, maxWidth: 190, letterSpacing: -2 });
  return (
    <g>
      <circle cx={P.cx} cy={P.cy} r={86} fill="none" stroke={th.rule} strokeOpacity={0.35} strokeWidth={0.8} />
      <circle cx={P.cx} cy={P.cy} r={80} fill="none" stroke={th.rule} strokeOpacity={0.18} strokeWidth={4} />
      <text x={P.cx} y={P.cy + f.size * 0.35 + 1.4} {...fontAttrs("display-800")} fontSize={f.size} letterSpacing={f.letterSpacing} textAnchor="middle" fill={th.emboss} fillOpacity={th.embossOpacity}>
        {f.text}
      </text>
      <text x={P.cx} y={P.cy + f.size * 0.35} {...fontAttrs("display-800")} fontSize={f.size} letterSpacing={f.letterSpacing} textAnchor="middle" fill={`url(#${id}-framev)`}>
        {f.text}
      </text>
      <text x={P.cx} y={P.cy + f.size * 0.35} {...fontAttrs("display-800")} fontSize={f.size} letterSpacing={f.letterSpacing} textAnchor="middle" fill={th.ink} fillOpacity={th.dark ? 0.15 : 0.35}>
        {f.text}
      </text>
    </g>
  );
}

/** La carte seule, responsive (width 100 %). */
export function Card(props: CardProps) {
  return <CardGraphic {...props} />;
}

export default Card;
