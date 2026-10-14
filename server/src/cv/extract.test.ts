import { describe, expect, it } from "vitest";
import { CvError, extractPdfText, MAX_PDF_BYTES } from "./extract";

/** Construit un PDF minimal valide, une ligne de texte par page, offsets xref exacts. */
function buildPdf(pages: string[]): Uint8Array {
  const objects: string[] = [];
  const n = pages.length;
  // 1 : catalogue, 2 : pages, 3 : police, puis pour chaque page : page + contenu.
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((text, i) => {
    const safe = text.replace(/[\\()]/g, (c) => `\\${c}`);
    const stream = text ? `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET` : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof CvError ? e.code : `other:${String(e)}`;
  }
}

describe("extractPdfText", () => {
  it("extrait le texte et compte les pages", async () => {
    const pdf = buildPdf(["Camille Durand, developpeuse back-end", "Experience : Parcelio depuis 2021"]);
    const res = await extractPdfText(pdf);
    expect(res.pages).toBe(2);
    expect(res.text).toContain("Camille Durand");
    expect(res.text).toContain("Parcelio");
  });

  it("ne détache pas le tampon de l'appelant", async () => {
    const pdf = buildPdf(["Un texte suffisamment long pour etre lu"]);
    await extractPdfText(pdf);
    expect(pdf.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
  });

  it("refuse ce qui n'a pas la signature %PDF", async () => {
    expect(await codeOf(extractPdfText(new TextEncoder().encode("Bonjour, ceci est un CV en texte")))).toBe("not_a_pdf");
    expect(await codeOf(extractPdfText(new Uint8Array(0)))).toBe("not_a_pdf");
  });

  it("refuse un faux PDF illisible", async () => {
    expect(await codeOf(extractPdfText(new TextEncoder().encode("%PDF-1.4\nn'importe quoi")))).toBe("not_a_pdf");
  });

  it("refuse plus de 5 Mo", async () => {
    const big = new Uint8Array(MAX_PDF_BYTES + 1);
    big.set(new TextEncoder().encode("%PDF-1.4\n"));
    expect(await codeOf(extractPdfText(big))).toBe("pdf_too_large");
  });

  it("refuse plus de 10 pages", async () => {
    const pdf = buildPdf(Array.from({ length: 11 }, (_, i) => `Page ${i + 1} du CV, du texte`));
    expect(await codeOf(extractPdfText(pdf))).toBe("pdf_too_large");
    const ok = buildPdf(Array.from({ length: 10 }, (_, i) => `Page ${i + 1} du CV, du texte`));
    expect((await extractPdfText(ok)).pages).toBe(10);
  });

  it("signale un PDF sans texte", async () => {
    expect(await codeOf(extractPdfText(buildPdf(["", ""])))).toBe("empty_pdf");
  });
});
