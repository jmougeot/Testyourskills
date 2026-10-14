import type { Fact } from "../../../shared/types";

/** Erreur lisible renvoyée par l'API, avec son message bilingue. */
export class ApiError extends Error {
  code: string;
  fact: Fact | null;
  status: number;
  constructor(status: number, code: string, fact: Fact | null) {
    super(fact?.en ?? code);
    this.status = status;
    this.code = code;
    this.fact = fact;
  }
}
