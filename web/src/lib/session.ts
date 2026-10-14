// Mémoire de session (en RAM) : pré-remplissage de l'entrée, cartes fraîches.
import type { Fact } from "../../../shared/types";

export type Mode = "single" | "both";
export type Tab = "github" | "cv";

export interface Prefill {
  mode?: Mode;
  tab?: Tab;
  login?: string;
  file?: File | null;
  error?: Fact | string | null;
}

let prefill: Prefill | null = null;
/** Dernière saisie, pour « Réessayer » ou « Ajoute ton CV ». */
let lastInput: { login?: string; file?: File | null } = {};
/** Cartes demandées dans cet onglet : elles ont droit à l'ouverture de pack. */
const fresh = new Map<string, number>();

export function setPrefill(p: Prefill) {
  prefill = { file: lastInput.file ?? null, ...p };
}

/** Pré-remplit l'entrée avec la dernière saisie (bouton « Réessayer »). */
export function prefillFromLast(error: Fact | string | null) {
  const { login, file } = lastInput;
  prefill = { login, file: file ?? null, mode: login && file ? "both" : "single", tab: file && !login ? "cv" : "github", error };
}

export function takePrefill(): Prefill | null {
  const p = prefill;
  prefill = null;
  return p;
}

export function rememberInput(i: { login?: string; file?: File | null }) {
  lastInput = i;
}

export function markFresh(id: string) {
  fresh.set(id, Date.now());
}

export function freshSince(id: string): number | null {
  return fresh.get(id) ?? null;
}
