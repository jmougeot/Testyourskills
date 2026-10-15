// Enveloppe React de la scène 3D (web/src/three/walkout.ts) : monte le canvas
// plein écran, attend les polices et les assets 3D (préchargés pendant
// l'attente), relaie le clic d'ouverture, les feux d'artifice (clic ou
// Espace), la passation à la carte HTML et la fin. Sans WebGL ou sans assets :
// on passe directement au résultat.
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";
import { siGithub } from "simple-icons";
import type { CardData, Lang } from "../../../shared/types";
import { langIcon, langTitle } from "../../../shared/card/languages";
import { useT } from "../i18n";
import { accentOf } from "../lib/util";
import { preloadWalkoutAssets } from "../three/assets";
import { loadCardTexture } from "../three/cardTexture";
import { loadSceneFonts } from "../three/textures";
import { createWalkout, type WalkoutCue, type WalkoutHandle } from "../three/walkout";
import type { Phase } from "./Reveal";

export { preloadWalkoutAssets };

/** Document (CV) en 24 × 24, logo de la ligue CV. */
const DOC_PATH = "M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z";
/** Chevrons de code en 24 × 24, quand aucun langage n'est reconnu. */
const CODE_PATH = "M8.7 16.6 4.1 12l4.6-4.6L7.3 6l-6 6 6 6 1.4-1.4zm6.6 0 4.6-4.6-4.6-4.6L16.7 6l6 6-6 6-1.4-1.4z";
/** Au-delà, on renonce à la scène plutôt que de faire attendre. */
const ASSET_TIMEOUT = 12000;

export interface WalkoutControl {
  /** Clic sur la scène pendant la séquence : vrai si la scène l'a utilisé. */
  interact(): boolean;
}

interface Props {
  card: CardData;
  lang: Lang;
  /** Comparaison GitHub × CV : le « double walkout ». */
  double: boolean;
  phase: Phase;
  /** Élément contenant un [data-scene-anchor] : la carte 3D vient s'y poser. */
  anchorRef: RefObject<HTMLElement | null>;
  controlRef: MutableRefObject<WalkoutControl | null>;
  onHandoff: () => void;
  onDone: () => void;
}

export function Walkout3D({ card, lang, double, phase, anchorRef, controlRef, onHandoff, onDone }: Props) {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handle = useRef<WalkoutHandle | null>(null);
  const pendingOpen = useRef(false);
  const cb = useRef({ onHandoff, onDone });
  cb.current = { onHandoff, onDone };
  const [cue, setCue] = useState<WalkoutCue>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let alive = true;
    const icon = langIcon(card.mainLanguage);
    const tells = t.reveal.tells;
    const texts = {
      langName: icon ? langTitle(card.mainLanguage) : tells.noLanguage,
      langLabel: tells.language,
      leagueName: double ? tells.leagueBoth : card.source === "cv" ? tells.leagueCv : tells.leagueGithub,
      leagueLabel: tells.league,
      position: card.position,
      positionName: t.positions[card.position],
      positionLabel: tells.position,
      club: card.club ?? tells.freeAgent,
      clubLabel: tells.club,
      statusLabel: t.reveal.statusLabel,
      statuses: t.reveal.statuses,
      idleTitle: "DEV PACK",
      idleSubtitle: tells.idle,
      graphLabel: tells.graph,
    };
    (async () => {
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("assets 3D trop lents")), ASSET_TIMEOUT));
      let assets;
      try {
        [assets] = await Promise.race([Promise.all([preloadWalkoutAssets(), loadSceneFonts()]), timeout]);
      } catch (e) {
        console.warn("[walkout] assets indisponibles, affichage direct", e);
        if (alive) cb.current.onDone();
        return;
      }
      if (!alive) return;
      try {
        const h = createWalkout({
          canvas,
          lang,
          double,
          accent: accentOf(card),
          texts,
          logoPath: icon?.path ?? CODE_PATH,
          leaguePath: card.source === "cv" && !double ? DOC_PATH : siGithub.path,
          langKey: card.mainLanguage,
          login: card.login ?? card.name,
          overall: card.overall,
          assets,
          cardTexture: loadCardTexture(card, lang),
          anchor: () => anchorRef.current?.querySelector<HTMLElement>("[data-scene-anchor]")?.getBoundingClientRect() ?? null,
          onHandoff: () => cb.current.onHandoff(),
          onDone: () => cb.current.onDone(),
          onCue: (c) => alive && setCue(c),
        });
        handle.current = h;
        controlRef.current = { interact: () => h.interact() };
        if (pendingOpen.current) h.open();
      } catch (e) {
        console.warn("[walkout] WebGL indisponible, affichage direct", e);
        cb.current.onDone();
      }
    })();
    return () => {
      alive = false;
      controlRef.current = null;
      handle.current?.dispose();
      handle.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    if (handle.current) handle.current.open();
    else pendingOpen.current = true;
  }, [phase]);

  // Espace : feux d'artifice, comme L1/R1 dans le jeu
  useEffect(() => {
    if (cue !== "fireworks") return;
    const on = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Enter") return;
      if (handle.current?.interact()) e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [cue]);

  return (
    <>
      <canvas ref={canvasRef} className={`walkout-canvas${phase === "handoff" ? " is-fading" : ""}`} aria-hidden />
      {cue && phase === "playing" && (
        <p key={cue} className="walkout-cue" aria-hidden>
          {t.reveal.fireworks}
        </p>
      )}
    </>
  );
}
