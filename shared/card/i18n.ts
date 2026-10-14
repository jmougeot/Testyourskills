// Libellés de la carte et des compositions d'images, en français et en anglais.
import type { Lang } from "../types";

const NBSP = " ";

export const STRINGS = {
  fr: {
    freeAgent: "Agent libre",
    judged: (s: number) => `Jugé par une IA en ${s}${NBSP}s`,
    reliability: "fiabilité",
    percent: (n: number) => `${n}${NBSP}%`,
    ai: "IA",
    cvStamp: "D'APRÈS LE CV",
    sourceGithub: "GITHUB",
    sourceCv: "CV",
    insufficient: "données insuffisantes",
    buzzNote: "hors note",
    cta: "Fais la tienne",
    card: "Carte",
    cvSide: "Ce que ton CV déclare",
    githubSide: "Ce que ton GitHub prouve",
    overall: "Note",
  },
  en: {
    freeAgent: "Free agent",
    judged: (s: number) => `Judged by an AI in ${s}${NBSP}s`,
    reliability: "reliability",
    percent: (n: number) => `${n}%`,
    ai: "AI",
    cvStamp: "PER THE CV",
    sourceGithub: "GITHUB",
    sourceCv: "CV",
    insufficient: "not enough data",
    buzzNote: "not rated",
    cta: "Make yours",
    card: "Card",
    cvSide: "What your CV claims",
    githubSide: "What your GitHub proves",
    overall: "Rating",
  },
} satisfies Record<Lang, Record<string, unknown>>;

export function t(lang: Lang) {
  return STRINGS[lang] ?? STRINGS.fr;
}
