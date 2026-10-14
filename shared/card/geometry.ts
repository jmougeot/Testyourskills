// Silhouette de la carte : bouclier vertical 360 × 520 avec couronne centrale,
// épaulements, encoches concaves aux coins et pointe douce en bas.
// Le contour exact sert de masque (web) ; les contours intérieurs (cadre, filet)
// sont obtenus par décalage d'un polygone échantillonné finement, pour que
// l'épaisseur du cadre reste constante partout, encoches comprises.

export const CARD_W = 360;
export const CARD_H = 520;

type Pt = [number, number];
type Seg =
  | { t: "L"; p: Pt }
  | { t: "C"; c1: Pt; c2: Pt; p: Pt }
  | { t: "Q"; c: Pt; p: Pt }
  /** Arc de cercle : centre, rayon, angles de début et de fin (radians, repère écran). */
  | { t: "A"; center: Pt; r: number; a0: number; a1: number; p: Pt };

const H = Math.PI / 2;

// Contour, sens horaire à l'écran. Départ : bord gauche de la couronne.
const START: Pt = [126, 4];
const SEGS: Seg[] = [
  { t: "L", p: [234, 4] },
  // descente de la couronne vers l'épaulement droit
  { t: "C", c1: [246, 4], c2: [248, 19], p: [262, 19] },
  { t: "L", p: [326, 19] },
  // encoche concave du coin haut droit
  { t: "A", center: [356, 19], r: 30, a0: Math.PI, a1: H, p: [356, 49] },
  { t: "L", p: [356, 446] },
  // flanc bas droit vers la pointe
  { t: "C", c1: [356, 470], c2: [300, 486], p: [198, 510] },
  { t: "Q", c: [180, 515], p: [162, 510] },
  { t: "C", c1: [60, 486], c2: [4, 470], p: [4, 446] },
  { t: "L", p: [4, 49] },
  // encoche concave du coin haut gauche
  { t: "A", center: [4, 19], r: 30, a0: H, a1: 0, p: [34, 19] },
  { t: "L", p: [98, 19] },
  { t: "C", c1: [112, 19], c2: [114, 4], p: [126, 4] },
];

const f = (n: number) => (Math.round(n * 100) / 100).toString();

/** Chemin exact du contour extérieur (coordonnées du viewBox). */
export const CARD_PATH = (() => {
  let d = `M${f(START[0])} ${f(START[1])}`;
  for (const s of SEGS) {
    if (s.t === "L") d += `L${f(s.p[0])} ${f(s.p[1])}`;
    else if (s.t === "C") d += `C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p[0])} ${f(s.p[1])}`;
    else if (s.t === "Q") d += `Q${f(s.c[0])} ${f(s.c[1])} ${f(s.p[0])} ${f(s.p[1])}`;
    else d += `A${s.r} ${s.r} 0 0 ${s.a1 > s.a0 ? 1 : 0} ${f(s.p[0])} ${f(s.p[1])}`;
  }
  return d + "Z";
})();

function flatten(): Pt[] {
  const pts: Pt[] = [START];
  let cur = START;
  for (const s of SEGS) {
    if (s.t === "L") pts.push(s.p);
    else if (s.t === "C") {
      const n = 28;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        pts.push([
          u * u * u * cur[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t * t * t * s.p[0],
          u * u * u * cur[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t * t * t * s.p[1],
        ]);
      }
    } else if (s.t === "Q") {
      const n = 12;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        pts.push([u * u * cur[0] + 2 * u * t * s.c[0] + t * t * s.p[0], u * u * cur[1] + 2 * u * t * s.c[1] + t * t * s.p[1]]);
      }
    } else {
      const n = 20;
      for (let i = 1; i <= n; i++) {
        const a = s.a0 + ((s.a1 - s.a0) * i) / n;
        pts.push([s.center[0] + s.r * Math.cos(a), s.center[1] + s.r * Math.sin(a)]);
      }
    }
    cur = s.p;
  }
  pts.pop(); // le dernier point recoupe le départ
  // dédoublonne
  return pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.05;
  });
}

const POLY = flatten();

function norm(x: number, y: number): Pt {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

const cache = new Map<number, string>();

/** Contour décalé vers l'intérieur de `inset` unités (0 = contour exact). */
export function cardPath(inset = 0): string {
  if (inset === 0) return CARD_PATH;
  const hit = cache.get(inset);
  if (hit) return hit;
  const n = POLY.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = POLY[(i + n - 1) % n], b = POLY[i], c = POLY[(i + 1) % n];
    const d1 = norm(b[0] - a[0], b[1] - a[1]);
    const d2 = norm(c[0] - b[0], c[1] - b[1]);
    // normale intérieure (sens horaire à l'écran) : (-dy, dx)
    const n1: Pt = [-d1[1], d1[0]];
    const n2: Pt = [-d2[1], d2[0]];
    const turn = d1[0] * d2[1] - d1[1] * d2[0];
    const dot = d1[0] * d2[0] + d1[1] * d2[1];
    if (turn > 0 && dot < 0.985) {
      // angle convexe marqué : deux points (biseau), la boucle créée est coupée
      // ensuite au point exact par untangle (juste aussi quand un arc suit)
      out.push([b[0] + n1[0] * inset, b[1] + n1[1] * inset]);
      out.push([b[0] + n2[0] * inset, b[1] + n2[1] * inset]);
      continue;
    }
    const m = norm(n1[0] + n2[0], n1[1] + n2[1]);
    const cos = Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
    const k = inset / cos;
    out.push([b[0] + m[0] * k, b[1] + m[1] * k]);
  }
  const clean = untangle(out);
  const d = "M" + clean.map((p) => `${f(p[0])} ${f(p[1])}`).join("L") + "Z";
  cache.set(inset, d);
  return d;
}

function cross(p: Pt, q: Pt, r: Pt, t: Pt): Pt | null {
  const d1x = q[0] - p[0], d1y = q[1] - p[1], d2x = t[0] - r[0], d2y = t[1] - r[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return null;
  const u = ((r[0] - p[0]) * d2y - (r[1] - p[1]) * d2x) / den;
  const v = ((r[0] - p[0]) * d1y - (r[1] - p[1]) * d1x) / den;
  if (u <= 0 || u >= 1 || v <= 0 || v >= 1) return null;
  return [p[0] + u * d1x, p[1] + u * d1y];
}

/** Supprime les petites boucles qu'un décalage crée aux angles vifs (jonction arc / droite). */
function untangle(pts: Pt[]): Pt[] {
  const WINDOW = 40;
  let cur = pts;
  for (let pass = 0; pass < 4; pass++) {
    const n = cur.length;
    const res: Pt[] = [];
    let changed = false;
    let i = 0;
    while (i < n) {
      const a = cur[i], b = cur[(i + 1) % n];
      let hit: { j: number; p: Pt } | null = null;
      for (let j = i + 2; j < Math.min(n - (i === 0 ? 1 : 0), i + WINDOW); j++) {
        const p = cross(a, b, cur[j], cur[(j + 1) % n]);
        if (p) hit = { j, p };
      }
      res.push(a);
      if (hit) {
        res.push(hit.p);
        i = hit.j + 1;
        changed = true;
      } else i++;
    }
    cur = res;
    if (!changed) break;
  }
  return cur;
}

/** Masque CSS (data URI) de la silhouette, à étirer en 100 % 100 %. */
export const CARD_MASK_URL = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}" preserveAspectRatio="none"><path d="${CARD_PATH}" fill="#000"/></svg>`,
)}")`;
