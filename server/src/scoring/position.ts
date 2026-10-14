// Poste déterminé par le code (SPEC §3.4) : langages, dépendances, marqueurs d'arbre, topics.

import type { Position } from "../../../shared/types";
import type { GithubFacts } from "../github/facts";
import { SCORING } from "./config";
import type { GithubMetrics } from "./derive";

const P = SCORING.position;

export function positionScores(f: GithubFacts, m: GithubMetrics): Partial<Record<Position, number>> {
  const s: Partial<Record<Position, number>> = {};
  const add = (p: Position, v: number) => (s[p] = (s[p] ?? 0) + v);

  const totalBytes = Object.values(m.languageBytes).reduce((a, b) => a + b, 0);
  if (totalBytes > 0) {
    for (const [lang, bytes] of Object.entries(m.languageBytes)) {
      const w = P.languages[lang];
      if (!w) continue;
      for (const [pos, k] of Object.entries(w)) add(pos as Position, (bytes / totalBytes) * P.languageWeight * (k ?? 0));
    }
  } else {
    // Pas d'octets mesurés : langages principaux des repos.
    const langs = f.repos.map((r) => r.language).filter((l): l is string => !!l);
    for (const lang of langs) {
      const w = P.languages[lang];
      if (w) for (const [pos, k] of Object.entries(w)) add(pos as Position, (P.languageWeight * (k ?? 0)) / langs.length);
    }
  }

  const depSets = Object.entries(P.deps).map(([pos, list]) => [pos as Position, new Set(list)] as const);
  const topicSets = Object.entries(P.topics).map(([pos, list]) => [pos as Position, new Set(list)] as const);
  for (const r of f.repos) {
    const deps = r.deps ?? [];
    // Dépendances distinctes reconnues par poste, plafonnées par repo.
    for (const [pos, set] of depSets) add(pos, P.depWeight * Math.min(P.maxDepsPerRepo, deps.filter((d) => set.has(d)).length));
    const topics = r.topics.map((t) => t.toLowerCase());
    for (const [pos, set] of topicSets) if (topics.some((t) => set.has(t))) add(pos, P.topicWeight);
  }
  for (const t of f.trees)
    for (const mk of t.markers) for (const [pos, k] of Object.entries(P.markers[mk] ?? {})) add(pos as Position, k ?? 0);
  return s;
}

export function githubPosition(f: GithubFacts, m: GithubMetrics): Position {
  const s = positionScores(f, m);
  const ranked = (Object.entries(s) as [Position, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!ranked.length) return P.default;
  const [best, top] = ranked[0];
  const fe = s.FE ?? 0;
  const be = s.BE ?? 0;
  if ((best === "FE" || best === "BE" || best === "FS") && fe >= P.fsRatio * top && be >= P.fsRatio * top) return "FS";
  return best;
}
