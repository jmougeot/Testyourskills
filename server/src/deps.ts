// Câblage réel des modules du moteur dans le pipeline. Les tests ne passent pas
// par ici : ils injectent leurs propres `Deps`.

import { collectGithub, pickFilesForReading } from "./github/collect";
import { scoreGithub, cvTextCounts, scoreCv, compareCards } from "./scoring/index";
import { readCode } from "./ai/readCode";
import { readCv } from "./ai/readCv";
import { aiAvailable } from "./ai/budget";
import { extractPdfText } from "./cv/extract";
import { renderImage } from "./render/index";
import type { Deps } from "./pipeline";

export const realDeps: Deps = {
  collectGithub,
  pickFilesForReading,
  readCode,
  aiAvailable,
  scoreGithub,
  extractPdfText,
  cvTextCounts,
  readCv,
  scoreCv,
  compareCards,
  renderImage,
};
