// Logo du langage principal (à la place du drapeau). card.mainLanguage est le
// nom linguist de GitHub en minuscules : on le rapproche d'une icône
// simple-icons (24 × 24, monochrome). Sans correspondance : repli « {} ».
import {
  siAngular, siApachegroovy, siArduino, siAssemblyscript, siAstro, siC, siClojure, siCmake, siCoffeescript,
  siCommonlisp, siCplusplus, siCrystal, siCss, siDart, siDocker, siDotnet, siElixir, siElm, siErlang,
  siFortran, siFsharp, siGleam, siGnubash, siGnuemacs, siGo, siGodotengine, siGraphql, siHaskell, siHtml5,
  siJavascript, siJulia, siJupyter, siKotlin, siLatex, siLua, siMarkdown, siMdx, siNim, siNixos, siOcaml,
  siOpenjdk, siPerl, siPhp, siPug, siPurescript, siPython, siR, siRacket, siReact, siReason, siRuby, siRust,
  siSass, siScala, siSolidity, siSvelte, siSwift, siTerraform, siTypescript, siV, siVim, siVuedotjs,
  siWebassembly, siZig, siApple, siLess, siHaxe, siPrisma, siQt,
} from "simple-icons";

export interface LangIcon {
  title: string;
  /** Chemin SVG dans un carré 24 × 24. */
  path: string;
}

type SI = { title: string; path: string };
const I = (s: SI): LangIcon => ({ title: s.title, path: s.path });

const MAP: Record<string, LangIcon> = {
  javascript: I(siJavascript),
  typescript: I(siTypescript),
  tsx: I(siReact),
  jsx: I(siReact),
  python: I(siPython),
  rust: I(siRust),
  go: I(siGo),
  c: I(siC),
  "c++": I(siCplusplus),
  cpp: I(siCplusplus),
  "c#": I(siDotnet),
  csharp: I(siDotnet),
  "visual basic .net": I(siDotnet),
  "f#": I(siFsharp),
  java: I(siOpenjdk),
  kotlin: I(siKotlin),
  swift: I(siSwift),
  "objective-c": I(siApple),
  "objective-c++": I(siApple),
  ruby: I(siRuby),
  php: I(siPhp),
  hack: I(siPhp),
  scala: I(siScala),
  elixir: I(siElixir),
  erlang: I(siErlang),
  haskell: I(siHaskell),
  clojure: I(siClojure),
  lua: I(siLua),
  perl: I(siPerl),
  r: I(siR),
  julia: I(siJulia),
  dart: I(siDart),
  shell: I(siGnubash),
  bash: I(siGnubash),
  powershell: I(siDotnet),
  html: I(siHtml5),
  css: I(siCss),
  scss: I(siSass),
  sass: I(siSass),
  less: I(siLess),
  vue: I(siVuedotjs),
  svelte: I(siSvelte),
  astro: I(siAstro),
  angular: I(siAngular),
  "jupyter notebook": I(siJupyter),
  ocaml: I(siOcaml),
  reason: I(siReason),
  zig: I(siZig),
  nim: I(siNim),
  crystal: I(siCrystal),
  solidity: I(siSolidity),
  dockerfile: I(siDocker),
  hcl: I(siTerraform),
  nix: I(siNixos),
  fortran: I(siFortran),
  elm: I(siElm),
  groovy: I(siApachegroovy),
  coffeescript: I(siCoffeescript),
  purescript: I(siPurescript),
  racket: I(siRacket),
  "common lisp": I(siCommonlisp),
  "vim script": I(siVim),
  "vim scl": I(siVim),
  "emacs lisp": I(siGnuemacs),
  tex: I(siLatex),
  markdown: I(siMarkdown),
  mdx: I(siMdx),
  cmake: I(siCmake),
  gdscript: I(siGodotengine),
  v: I(siV),
  webassembly: I(siWebassembly),
  assemblyscript: I(siAssemblyscript),
  graphql: I(siGraphql),
  pug: I(siPug),
  arduino: I(siArduino),
  gleam: I(siGleam),
  haxe: I(siHaxe),
  prisma: I(siPrisma),
  qml: I(siQt),
};

/** Icône du langage, ou null pour le repli générique « {} ». */
export function langIcon(lang: string | undefined): LangIcon | null {
  if (!lang) return null;
  return MAP[lang.trim().toLowerCase()] ?? null;
}

/** Libellé court affiché au survol / en accessibilité. */
export function langTitle(lang: string | undefined): string {
  if (!lang) return "";
  return langIcon(lang)?.title ?? lang;
}
