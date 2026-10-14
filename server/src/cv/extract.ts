// Extraction du texte d'un CV PDF, en mémoire uniquement (SPEC §2.6, §6.1, §11).
// Rien n'est écrit sur disque, rien du contenu n'est loggué.

import { extractText, getDocumentProxy } from "unpdf";

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
/** En dessous, on considère le PDF vide (PDF scanné, image seule). */
const MIN_TEXT_CHARS = 20;

export type CvErrorCode = "not_a_pdf" | "pdf_too_large" | "empty_pdf";

export class CvError extends Error {
  constructor(public code: CvErrorCode) {
    super(code);
    this.name = "CvError";
  }
}

/** Signature %PDF- dans les 1024 premiers octets (tolérée par les lecteurs après un préambule). */
function hasPdfSignature(buf: Uint8Array): boolean {
  const head = buf.subarray(0, Math.min(buf.length, 1024));
  for (let i = 0; i + 4 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) {
      return true;
    }
  }
  return false;
}

export async function extractPdfText(buf: Uint8Array): Promise<{ text: string; pages: number }> {
  if (buf.length > MAX_PDF_BYTES) throw new CvError("pdf_too_large");
  if (!hasPdfSignature(buf)) throw new CvError("not_a_pdf");

  // pdf.js peut détacher le tampon reçu : on lui passe une copie.
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(buf), { verbosity: 0 });
  } catch {
    throw new CvError("not_a_pdf");
  }

  try {
    const pages = doc.numPages;
    if (pages > MAX_PDF_PAGES) throw new CvError("pdf_too_large");
    let text: string;
    try {
      ({ text } = await extractText(doc, { mergePages: true }));
    } catch {
      throw new CvError("not_a_pdf");
    }
    text = text
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (text.replace(/\s/g, "").length < MIN_TEXT_CHARS) throw new CvError("empty_pdf");
    return { text, pages };
  } finally {
    // Libère le document et le worker pdf.js : rien ne reste en mémoire.
    await doc.loadingTask.destroy().catch(() => {});
  }
}
