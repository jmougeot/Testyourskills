import { Resvg } from "@resvg/resvg-js";
import { writeFileSync } from "node:fs";
import { renderSvg } from "./server/src/render/index";
import { FIXTURES } from "./shared/fixtures";
import { fontFiles } from "./server/src/render/fonts";
const svg = await renderSvg({ format: "card", card: FIXTURES.lowReliability, lang: "fr" });
writeFileSync("var/renders/zoom-full.png", new Resvg(svg, { font: { fontFiles: fontFiles(), loadSystemFonts: false }, fitTo: { mode: "zoom", value: 8 } }).render().asPng());
