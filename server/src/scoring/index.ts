// Point d'entrée du moteur de jugement : barème, statuts, comparaison, comptages CV.
// Pur et déterministe, sans IA (SPEC §4.1).

export { scoreGithub } from "./github";
export { cvTextCounts, scoreCv } from "./cv";
export { compareCards } from "./compare";
export { SCORING, STATUSES, BUZZWORDS } from "./config";
export { isLazyCommit } from "./derive";
