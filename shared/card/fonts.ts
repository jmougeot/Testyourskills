// Familles de polices utilisées dans le SVG de la carte.
// Les TTF de server/fonts ne déclarent pas tous la même famille : Barlow 600 et
// 800 s'appellent « Barlow Condensed SemiBold » / « ExtraBold » pour resvg,
// alors qu'Inter et JetBrains Mono regroupent leurs graisses sous un seul nom.
// Attention : resvg ne parcourt PAS la liste font-family ; si le premier nom
// est inconnu, il prend la police par défaut. Le premier nom doit donc exister
// tel quel dans les TTF (vérifié), le navigateur le retrouve via fonts.css.

export type FontKey =
  | "display-600"
  | "display-700"
  | "display-800"
  | "sans-400"
  | "sans-500"
  | "sans-600"
  | "sans-700"
  | "mono-400"
  | "mono-500"
  | "mono-700";

export interface FontSpec {
  family: string;
  weight: number;
}

export const FONTS: Record<FontKey, FontSpec> = {
  "display-600": { family: "'Barlow Condensed SemiBold', 'Barlow Condensed', sans-serif", weight: 600 },
  "display-700": { family: "'Barlow Condensed', sans-serif", weight: 700 },
  "display-800": { family: "'Barlow Condensed ExtraBold', 'Barlow Condensed', sans-serif", weight: 800 },
  "sans-400": { family: "Inter, sans-serif", weight: 400 },
  "sans-500": { family: "Inter, sans-serif", weight: 500 },
  "sans-600": { family: "Inter, sans-serif", weight: 600 },
  "sans-700": { family: "Inter, sans-serif", weight: 700 },
  "mono-400": { family: "'JetBrains Mono', monospace", weight: 400 },
  "mono-500": { family: "'JetBrains Mono', monospace", weight: 500 },
  "mono-700": { family: "'JetBrains Mono', monospace", weight: 700 },
};

/** Attributs SVG prêts à étaler sur un <text>. */
export function fontAttrs(key: FontKey) {
  const f = FONTS[key];
  return { fontFamily: f.family, fontWeight: f.weight };
}

/** Fichiers TTF côté serveur (relatifs à server/fonts). */
export const FONT_FILES = [
  "barlow-condensed-600.ttf",
  "barlow-condensed-700.ttf",
  "barlow-condensed-800.ttf",
  "inter-400.ttf",
  "inter-500.ttf",
  "inter-600.ttf",
  "inter-700.ttf",
  "jetbrains-mono-400.ttf",
  "jetbrains-mono-500.ttf",
  "jetbrains-mono-700.ttf",
];
