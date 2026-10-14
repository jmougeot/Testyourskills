// Mesure approximative du texte, sans DOM : table d'avances extraite des TTF.
// Sert à réduire les noms longs et à tronquer les statuts avec « … », de façon
// identique dans le navigateur et côté serveur.
import type { FontKey } from "./fonts";
import { ADVANCES, FALLBACK, GLYPHS } from "./glyph-widths";

const INDEX = new Map<string, number>();
for (let i = 0; i < GLYPHS.length; i++) INDEX.set(GLYPHS[i], i);

/** Marge de sécurité : le crénage et le rendu peuvent dépasser un peu. */
const SAFETY = 1.03;

function advance(font: FontKey, ch: string): number {
  if (font.startsWith("mono")) return ch === "​" ? 0 : 600;
  const i = INDEX.get(ch);
  const table = ADVANCES[font];
  if (i === undefined) return FALLBACK[font];
  return table[i];
}

/** Largeur en unités SVG d'un texte à une taille donnée. */
export function measure(text: string, font: FontKey, size: number, letterSpacing = 0): number {
  let w = 0;
  let n = 0;
  for (const ch of text) {
    w += advance(font, ch);
    n++;
  }
  return ((w / 1000) * size + letterSpacing * Math.max(0, n - 1)) * SAFETY;
}

/** Coupe le texte pour qu'il tienne dans maxWidth, avec « … » si besoin. */
export function truncate(text: string, font: FontKey, size: number, maxWidth: number, letterSpacing = 0): string {
  if (measure(text, font, size, letterSpacing) <= maxWidth) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = chars.slice(0, mid).join("").trimEnd() + "…";
    if (measure(candidate, font, size, letterSpacing) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  // Évite de couper au milieu d'une ponctuation orpheline.
  const head = chars.slice(0, lo).join("").replace(/[\s,;:·(\-–—]+$/u, "");
  return head + "…";
}

export interface FitOptions {
  font: FontKey;
  size: number;
  minSize: number;
  maxWidth: number;
  letterSpacing?: number;
  /** Interlettrage minimal quand on réduit (resserre avant de rétrécir). */
  minLetterSpacing?: number;
}

export interface Fitted {
  text: string;
  size: number;
  letterSpacing: number;
  width: number;
}

/** Réduit la taille jusqu'à minSize, puis tronque. */
export function fit(text: string, o: FitOptions): Fitted {
  let ls = o.letterSpacing ?? 0;
  const minLs = o.minLetterSpacing ?? ls;
  // 1. resserrer l'interlettrage
  while (ls > minLs && measure(text, o.font, o.size, ls) > o.maxWidth) ls = Math.max(minLs, ls - 0.25);
  let size = o.size;
  let w = measure(text, o.font, size, ls);
  if (w > o.maxWidth) {
    size = Math.max(o.minSize, Math.floor(((o.size * o.maxWidth) / w) * 4) / 4);
    w = measure(text, o.font, size, ls);
  }
  let out = text;
  if (w > o.maxWidth) {
    out = truncate(text, o.font, size, o.maxWidth, ls);
    w = measure(out, o.font, size, ls);
  }
  return { text: out, size, letterSpacing: ls, width: w };
}

/** Majuscules typographiques en conservant les accents (fr et en). */
export function upper(text: string, lang: string): string {
  return text.toLocaleUpperCase(lang === "fr" ? "fr-FR" : "en-US");
}

/** Coupe un texte en lignes (au mot) ; la dernière ligne est tronquée si besoin. */
export function wrap(text: string, font: FontKey, size: number, maxWidth: number, maxLines: number, letterSpacing = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, font, size, letterSpacing) <= maxWidth || !cur) {
      cur = next;
      continue;
    }
    lines.push(cur);
    cur = w;
    if (lines.length === maxLines - 1) {
      cur = words.slice(i).join(" ");
      break;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines).map((l, i, arr) => (i === arr.length - 1 ? truncate(l, font, size, maxWidth, letterSpacing) : l));
}
