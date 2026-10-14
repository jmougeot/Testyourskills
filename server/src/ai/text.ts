// Outils texte partagés par les lectures : troncature, recherche tolérante
// d'extraits, repérage des tentatives d'injection.

/** Coupe une chaîne à `maxBytes` octets UTF-8 sans laisser de caractère cassé. */
export function truncateBytes(s: string, maxBytes: number): string {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= maxBytes) return s;
  return buf.subarray(0, Math.max(0, maxBytes)).toString("utf8").replace(/�+$/, "");
}

/** Répartit `budget` entre des tailles, équitablement, en rendant le surplus des petits aux grands. */
export function waterFill(sizes: number[], budget: number): number[] {
  const alloc = sizes.map(() => 0);
  let remaining = budget;
  let open = sizes.map((_, i) => i).filter((i) => sizes[i] > 0);
  while (open.length > 0 && remaining > 0) {
    const share = Math.floor(remaining / open.length);
    if (share === 0) break;
    const next: number[] = [];
    for (const i of open) {
      const take = Math.min(share, sizes[i] - alloc[i]);
      alloc[i] += take;
      remaining -= take;
      if (alloc[i] < sizes[i]) next.push(i);
    }
    open = next;
  }
  return alloc;
}

/** Version compacte (espaces fusionnés) avec la position d'origine de chaque caractère. */
function collapse(s: string): { text: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let prevSpace = true;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (!prevSpace) {
        out.push(" ");
        map.push(i);
      }
      prevSpace = true;
    } else {
      out.push(c);
      map.push(i);
      prevSpace = false;
    }
  }
  return { text: out.join(""), map };
}

/**
 * Cherche `quote` dans `content` en tolérant les écarts d'espaces (et la casse si demandé).
 * Rend le passage exact du contenu, ou null.
 */
export function locate(content: string, quote: string, ignoreCase = false): string | null {
  const q = quote.trim();
  if (!q) return null;
  if (!ignoreCase && content.includes(q)) return q;
  const c = collapse(content);
  let qn = collapse(q).text.trim();
  let hay = c.text;
  if (ignoreCase) {
    qn = qn.toLowerCase();
    hay = hay.toLowerCase();
  }
  if (!qn) return null;
  const idx = hay.indexOf(qn);
  if (idx < 0) return null;
  const start = c.map[idx];
  const end = c.map[idx + qn.length - 1] + 1;
  return content.slice(start, end);
}

/** Raccourcit un extrait sous `max` caractères ; le résultat reste une sous-chaîne de l'entrée. */
export function clip(s: string, max = 199): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf(" "));
  return (lastBreak > max / 2 ? cut.slice(0, lastBreak) : cut).trimEnd();
}

// Formulations typiques d'une tentative de manipulation du lecteur, en anglais et en français.
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|any|system)\b.{0,30}\b(instructions?|prompts?|rules|directives?)\b/i,
  /\b(give|assign|rate|score|grade|set)\b.{0,40}\blevel\s*[:=]?\s*[1-5]\b/i,
  /\b(you are now|act as|new instructions|system prompt|developer mode)\b/i,
  /\b(ai|llm|gpt|claude)\s+(reviewers?|evaluators?|screeners?|graders?|judges?)\b/i,
  /\bignor(e|ez|er)\b.{0,30}\b(les |toutes les )?(instructions|consignes|règles)\b/i,
  /\b(donne|attribue|mets|note)[rz]?\b.{0,40}\bniveau\s*[:=]?\s*[1-5]\b/i,
];

/** Lignes d'un texte qui ressemblent à une tentative d'injection. */
export function suspiciousLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && INJECTION_PATTERNS.some((re) => re.test(l)));
}

/** L'extrait recoupe-t-il une ligne suspecte ? */
export function overlapsSuspicious(quote: string, suspicious: string[]): boolean {
  if (suspicious.length === 0) return false;
  const parts = quote
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 6);
  return parts.some((p) => suspicious.some((s) => s.includes(p) || p.includes(s)));
}

/** Retire e-mails et numéros de téléphone d'un texte extrait (§2.4, §11). */
export function scrubContact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "")
    .replace(/(?:\+\d{1,3}|\b0)[\s.-]?\d(?:[\s.-]?\d){7,11}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
