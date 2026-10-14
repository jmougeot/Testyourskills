// Comparaison CV contre GitHub (SPEC §6.5) : delta par stat et titre par règle.

import type { CardData, ComparisonData, StatCode } from "../../../shared/types";
import { STAT_CODES } from "../../../shared/types";
import { STATUSES } from "./config";
import { fillTemplate } from "./statuses";

export function compareCards(cv: CardData, github: CardData): Omit<ComparisonData, "id" | "createdAt"> {
  const value = (c: CardData, code: StatCode) => c.stats.find((s) => s.code === code)?.value ?? 0;
  const deltas = Object.fromEntries(STAT_CODES.map((c) => [c, value(github, c) - value(cv, c)])) as Record<StatCode, number>;
  const n = cv.overall - github.overall;
  const tpl = n > 0 ? STATUSES.comparison.cvAhead : n < 0 ? STATUSES.comparison.codeAhead : STATUSES.comparison.even;
  const vars = { n: Math.abs(n) };
  return {
    cv,
    github,
    deltas,
    headline: { fr: fillTemplate(tpl.fr, vars, "fr")!, en: fillTemplate(tpl.en, vars, "en")! },
  };
}
