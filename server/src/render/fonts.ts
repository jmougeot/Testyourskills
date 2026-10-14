// Polices du rendu serveur. resvg-js 2.6 ne prend que des chemins de fichiers :
// on résout et vérifie la liste une seule fois, l'OS garde les fichiers en cache.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_FILES } from "../../../shared/card/fonts";

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = resolve(here, "../../fonts");

let cached: string[] | null = null;

export function fontFiles(): string[] {
  if (cached) return cached;
  const files = FONT_FILES.map((f) => resolve(FONT_DIR, f));
  const missing = files.filter((f) => !existsSync(f));
  if (missing.length) throw new Error(`Polices manquantes : ${missing.join(", ")}`);
  cached = files;
  return files;
}
