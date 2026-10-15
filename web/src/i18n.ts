// Toutes les chaînes du front, en français et en anglais.
// Les faits ({fr,en}) qui viennent de l'API ne passent pas par ici.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { CardStyle, Lang, StatCode } from "../../shared/types";

const fr = {
  meta: {
    title: "Testyourskills · Ta carte de dev, jugée par ton GitHub",
    titleCard: (name: string, overall: number) => `${name} · ${overall} · Testyourskills`,
  },
  common: {
    by: "par",
    langLabel: "Langue",
    skip: "Passer",
    back: "Retour",
    close: "Fermer",
    copied: "Copié",
    loading: "Chargement…",
    demo: "Mode démo · données fictives",
    skipToContent: "Aller au contenu",
  },
  home: {
    kicker: "Carte de joueur · jugée par une IA · 10 s",
    titleA: "Ton CV dit senior.",
    titleB: "Ton GitHub, on va voir.",
    tabGithub: "Ton GitHub",
    tabCv: "Ton CV",
    tabsLabel: "Source de la carte",
    loginLabel: "Pseudo GitHub ou URL du profil",
    loginPlaceholder: "ton-pseudo",
    submit: "Ouvrir mon pack",
    submitBoth: "Comparer les deux",
    submitting: "Ouverture…",
    bothLink: "ou les deux, pour voir l'écart",
    bothActive: "Mode comparaison : ton CV contre ton GitHub",
    bothBack: "une seule source",
    dropTitle: "Glisse ton CV ici",
    dropOr: "ou",
    dropBrowse: "choisis un PDF",
    dropHint: "PDF · 5 Mo · 10 pages max",
    dropReplace: "Changer de fichier",
    dropRemove: "Retirer le fichier",
    reassure: "Sans compte. Ton CV est lu en mémoire puis jeté.",
    dropAnywhere: "Lâche ton CV, on s'occupe du reste",
    inlineCv: "ou avec ton CV",
    exampleLabel: "Exemple de carte",
    errLogin: "Ce pseudo ne ressemble pas à un pseudo GitHub.",
    errEmptyLogin: "Donne-nous un pseudo GitHub (ou une URL de profil).",
    errEmptyCv: "Dépose un CV au format PDF.",
    errNotPdf: "Ce fichier n'est pas un PDF.",
    errTooLarge: (mb: string) => `Fichier de ${mb} Mo : la limite est 5 Mo. Un CV, pas une thèse.`,
    errTooManyPages: (n: number) => `${n} pages : la limite est 10. Les recruteurs s'arrêtent à la première.`,
    errNetwork: "Le serveur ne répond pas. Réessaie dans un instant.",
    // sous la ligne de flottaison
    howKicker: "Comment ça marche",
    howTitle: "Un barème public. L'IA lit, le code note.",
    howSteps: [
      { t: "Le code collecte", d: "Commits, calendrier, tests, CI, README. Des faits publics, comptés, pas devinés." },
      { t: "L'IA lit", d: "Ton code ou ton CV, pour en tirer des constats. Elle ne donne jamais de note." },
      { t: "Le barème tranche", d: "Une grille fixe, versionnée. La même entrée donne toujours la même carte." },
    ],
    statsTitle: "Six stats, dont une pour rire",
    tiersTitle: "Bronze, Argent, Or, Icon. Et quelques cartes spéciales.",
    tiersSub: "Le tier découle de la note globale. Wonderkid et Flashback se méritent autrement.",
    ctaBottom: "Prêt à te faire juger ?",
    ctaBottomBtn: "Faire ma carte",
  },
  stats: {
    TEC: { name: "Technique", what: "La profondeur de ce qui est écrit ou décrit." },
    SHIP: { name: "Livraison", what: "La régularité réelle, semaine après semaine." },
    ARCH: { name: "Rigueur", what: "Tests, CI, outillage." },
    DOC: { name: "Communication", what: "README, messages de commit, clarté du CV." },
    XP: { name: "Expérience", what: "L'ancienneté réelle ou déclarée." },
    BUZZ: { name: "Buzzwords", what: "La densité de vent. Ne compte pas dans la note." },
  } satisfies Record<StatCode, { name: string; what: string }>,
  tiers: {
    bronze: "Bronze",
    silver: "Argent",
    gold: "Or",
    icon: "Icon",
    wonderkid: "Wonderkid",
    flashback: "Flashback",
    totw: "Équipe de la semaine",
  } satisfies Record<CardStyle, string>,
  tierCard: (tier: string) => `Carte ${tier}`,
  waiting: {
    title: "Ton pack se prépare",
    elapsed: "écoulé",
    progress: {
      lazy_commits: (n?: number) => `Lecture de tes ${n ?? "nombreux"} commits « wip »…`,
      buzzwords: (n?: number) => `Comptage des buzzwords… ${n ?? 0} pour l'instant`,
      tests: () => "Recherche des tests… toujours en cours",
      readme: () => "Vérification que le README dit autre chose que « TODO »…",
      recruiter: () => "Un recruteur aurait déjà fini. On prend le temps.",
      compare: (n?: number) => `Comparaison avec ${n ? n.toLocaleString("fr-FR") : "des milliers de"} devs sourcés par Azerit…`,
      profile: () => "Profil trouvé. Il existe, c'est un début.",
      repos: (n?: number) => `${n ?? "Quelques"} repos publics repérés, forks exclus…`,
      calendar: () => "Lecture du calendrier de contributions sur 52 semaines…",
      commits: (n?: number) => `Lecture de ${n ?? 100} messages de commit…`,
      code: () => "L'IA lit ton code. Elle ne note pas. Elle prend des notes.",
      cv: () => "Lecture du PDF, en mémoire. Il sera oublié juste après.",
      pdf: () => "Extraction du texte du PDF…",
      scoring: () => "Application du barème. Aucune IA ne touche aux chiffres.",
      statuses: () => "Choix des statuts dans la liste fermée…",
      render: () => "Impression de la carte…",
      start: () => "Ouverture du dossier. Pas de café, pas de pause.",
    } as Record<string, (n?: number) => string>,
    fillers: [
      "Le barème est écrit en dur dans un fichier JSON. Pas de favoritisme.",
      "On ignore tes forks. Tout le monde a forké un tutoriel.",
      "Recherche d'un commit « final final v2 »…",
      "Calcul de la fiabilité. Jamais 100 %, personne ne l'est.",
      "On ne lit pas tes repos privés. Promis.",
      "Calibrage du tampon…",
      "Vérification que node_modules n'est pas commité…",
    ],
  },
  reveal: {
    tap: "Touche pour ouvrir",
    skip: "Passer l'animation",
    opening: "Ouverture du pack",
    revealed: (tier: string, overall: number) => `Carte ${tier}, note ${overall}.`,
  },
  result: {
    yourCard: "Ta carte",
    sharedBanner: (name: string) => `La carte de ${name}, jugée par une IA en quelques secondes.`,
    makeYours: "Fais la tienne",
    yourTurn: "À toi : ton pseudo suffit.",
    reliability: (n: number) => `Fiabilité ${n} %`,
    share: {
      title: "Partage-la",
      linkedin: "LinkedIn",
      x: "X",
      copy: "Copier le lien",
      download: "Télécharger l'image",
      native: "Partager",
      linkedinHint: "Texte copié : colle-le dans ton post LinkedIn.",
      copiedLink: "Lien copié.",
      downloadDemo: "Image indisponible en mode démo (rendue par le serveur).",
      text: (tier: string, overall: number, status: string | null, secs: number, url: string) =>
        `${tier}, ${overall}.${status ? ` Statut : « ${status} ».` : ""} Jugé par une IA en ${secs} s. Fais la tienne : ${url}`,
      textCompare: (cv: number, gh: number, headline: string, url: string) =>
        `Mon CV : ${cv}. Mon GitHub : ${gh}. ${headline}. Fais la tienne : ${url}`,
    },
    linkedin: {
      kicker: "Personnaliser ma carte",
      btn: "Mettre ma photo LinkedIn",
      noPhoto: "Ta carte n'a pas encore de photo. Prends celle de ton profil LinkedIn, rien d'autre n'est lu.",
      updated: "Photo mise à jour.",
      error: "LinkedIn n'a pas voulu, réessaie.",
    },
    why: {
      title: "Pourquoi cette note ?",
      overallLine: "Note globale = TEC 30 % · SHIP 20 % · ARCH 20 % · DOC 15 % · XP 15 %.",
      buzzNote: "BUZZ ne compte pas dans la note globale. C'est la stat qu'on affiche pour rire.",
      insufficient: "Données insuffisantes",
      statusesTitle: "Les statuts et leur règle",
      byAI: "choisi par l'IA dans une liste fermée",
      reliabilityTitle: "La fiabilité",
      reliabilityText: (n: number, ok: number) =>
        `${n} % : ${ok} axe${ok > 1 ? "s" : ""} sur 5 repose${ok > 1 ? "nt" : ""} sur assez de données (19 points par axe, 95 au maximum). Jamais 100 % : on vient de te juger en quelques secondes, comme un recruteur pressé.`,
      noFacts: "Aucun fait détaillé pour cet axe.",
      tabCv: "Carte CV",
      tabGithub: "Carte GitHub",
    },
    contest: {
      button: "Contester ma note",
      again: "Faire appel (encore)",
      title: "Décision de la VAR",
      seeFacts: "Voir les faits",
      replies: [
        "Recours examiné au ralenti, sous trois angles. La décision est maintenue.",
        "Ta réclamation a été transmise au service compétent : un fichier TODO.md qui n'existe pas encore.",
        "On a relu ton code une deuxième fois. Il n'a pas changé entre-temps.",
        "Contester est une compétence. Elle n'est malheureusement pas dans le barème.",
        "L'arbitre a consulté le barème. Le barème ne se laisse pas attendrir : il est écrit en JSON.",
        "Demande enregistrée. Délai de traitement estimé : le temps que tu ajoutes des tests.",
        "Le jury s'est réuni. Le jury, c'est une fonction pure. Elle a rendu la même note.",
      ],
      lowest: (code: string, v: number) => `Indice : ta stat la plus basse est ${code} à ${v}. Un commit vaut mieux qu'un recours.`,
    },
    addCv: { title: "Ajoute ton CV pour voir l'écart", text: "Ce que ton CV déclare contre ce que ton GitHub prouve. Deux cartes, un delta.", btn: "Ajouter mon CV" },
    addGithub: { title: "Ajoute ton GitHub pour voir l'écart", text: "Ton CV a parlé. Voyons si ton code est d'accord.", btn: "Ajouter mon GitHub" },
    roast: {
      title: "Passer en mode roast",
      soon: "Bientôt",
      text: "Plus dur, plus drôle. Réservé au propriétaire du compte, après connexion GitHub. On ne roaste pas les autres.",
    },
    email: {
      title: "Reçois ta carte par email",
      label: "Adresse email",
      placeholder: "toi@exemple.dev",
      btn: "Recevoir",
      sending: "Envoi…",
      done: "C'est noté. Ta carte arrive, avec son lien de suppression.",
      invalid: "Cette adresse ne ressemble pas à un email.",
      error: "L'envoi a échoué. Réessaie plus tard.",
      note: "Optionnel. Garde aussi ta carte au-delà de 90 jours.",
    },
    cta: { text: "Vous recrutez ? Azerit lit le GitHub de vos candidats à votre place.", link: "azerit.tech" },
    del: {
      link: "Supprimer ma carte",
      confirm: "Supprimer définitivement ?",
      yes: "Oui, supprimer",
      no: "Annuler",
      done: "Carte supprimée. Elle n'existe plus, ni son image.",
      error: "La suppression a échoué.",
    },
    again: "Faire une autre carte",
  },
  compare: {
    cvLabel: "Ce que ton CV déclare",
    ghLabel: "Ce que ton GitHub prouve",
    cvShort: "CV",
    ghShort: "GitHub",
    deltaTitle: "L'écart, stat par stat",
    legendUp: "le code vaut plus",
    legendDown: "le CV gonfle",
    overall: "Globale",
    buzzHint: "BUZZ : plus bas, c'est mieux",
    switchLabel: "Carte affichée",
  },
  errors: {
    title: "Pas de carte cette fois",
    retry: "Réessayer",
    notFound: "Cette carte n'existe pas, ou plus. Elle a peut-être été supprimée.",
    timeout: "Ça prend plus de 30 secondes, on préfère s'arrêter là plutôt que d'inventer. Réessaie.",
    generic: "Quelque chose a cassé de notre côté.",
  },
  footer: {
    tagline: "Un outil Azerit. On lit le travail, pas le CV.",
    privacy: "Confidentialité",
  },
  privacy: {
    title: "Confidentialité",
    intro: "Court, parce qu'on stocke peu.",
    sections: [
      {
        h: "Ce qu'on garde",
        p: "Les faits publics tirés de GitHub (déjà calculés), les constats de l'IA, les notes, les statuts. Ton email, seulement si tu le donnes.",
      },
      {
        h: "Ce qu'on ne garde jamais",
        p: "Ton CV : le fichier est lu en mémoire, les constats sont extraits, le fichier et son texte sont jetés. Les fichiers de code lus par l'IA ne sont pas conservés non plus.",
      },
      {
        h: "Combien de temps",
        p: "90 jours, puis la carte et ses images sont supprimées automatiquement. Sauf si tu as laissé ton email : la carte reste tant que tu ne la supprimes pas.",
      },
      {
        h: "Supprimer ta carte",
        p: "Un lien « Supprimer ma carte » est affiché sous ta carte et envoyé dans l'email. Il efface la carte et ses images immédiatement.",
      },
      {
        h: "La carte de quelqu'un d'autre",
        p: "On peut générer une carte sur n'importe quel pseudo public : elle repose sur des données publiques et reste en mode taquin. Le propriétaire du pseudo peut la faire supprimer en prouvant son compte GitHub.",
      },
      {
        h: "Photo LinkedIn",
        p: "Seulement si tu connectes LinkedIn toi-même : on récupère ta photo de profil, rangée avec la carte et supprimée avec elle. Rien d'autre n'est lu sur LinkedIn.",
      },
      {
        h: "Mesure",
        p: "Quatre événements anonymes, enregistrés par notre serveur : carte générée, carte partagée, email donné, clic vers azerit.tech. Pas de cookie publicitaire, pas d'outil tiers.",
      },
    ],
    contact: "Une question : hello@azerit.tech",
  },
  notFound: { title: "Page introuvable", text: "Même GitHub renverrait une 404 ici.", home: "Retour à l'accueil" },
};

export type Dict = typeof fr;

const en: Dict = {
  meta: {
    title: "Testyourskills · Your dev card, judged by your GitHub",
    titleCard: (name, overall) => `${name} · ${overall} · Testyourskills`,
  },
  common: {
    by: "by",
    langLabel: "Language",
    skip: "Skip",
    back: "Back",
    close: "Close",
    copied: "Copied",
    loading: "Loading…",
    demo: "Demo mode · mock data",
    skipToContent: "Skip to content",
  },
  home: {
    kicker: "Player card · judged by an AI · 10 s",
    titleA: "Your CV says senior.",
    titleB: "Let's ask your GitHub.",
    tabGithub: "Your GitHub",
    tabCv: "Your CV",
    tabsLabel: "Card source",
    loginLabel: "GitHub username or profile URL",
    loginPlaceholder: "your-username",
    submit: "Open my pack",
    submitBoth: "Compare both",
    submitting: "Opening…",
    bothLink: "or both, to see the gap",
    bothActive: "Comparison mode: your CV against your GitHub",
    bothBack: "just one source",
    dropTitle: "Drop your CV here",
    dropOr: "or",
    dropBrowse: "pick a PDF",
    dropHint: "PDF · 5 MB · 10 pages max",
    dropReplace: "Change file",
    dropRemove: "Remove file",
    reassure: "No account. Your CV is read in memory, then thrown away.",
    dropAnywhere: "Let go of your CV, we'll take it from here",
    inlineCv: "or with your CV",
    exampleLabel: "Example card",
    errLogin: "That doesn't look like a GitHub username.",
    errEmptyLogin: "Give us a GitHub username (or profile URL).",
    errEmptyCv: "Drop a CV as a PDF.",
    errNotPdf: "That file isn't a PDF.",
    errTooLarge: (mb) => `${mb} MB file: the limit is 5 MB. A CV, not a thesis.`,
    errTooManyPages: (n) => `${n} pages: the limit is 10. Recruiters stop at page one.`,
    errNetwork: "The server isn't answering. Try again in a moment.",
    howKicker: "How it works",
    howTitle: "A public rubric. The AI reads, the code scores.",
    howSteps: [
      { t: "Code collects", d: "Commits, calendar, tests, CI, READMEs. Public facts, counted, not guessed." },
      { t: "The AI reads", d: "Your code or your CV, to extract findings. It never hands out a score." },
      { t: "The rubric decides", d: "A fixed, versioned grid. Same input, same card, every time." },
    ],
    statsTitle: "Six stats, one of them for laughs",
    tiersTitle: "Bronze, Silver, Gold, Icon. Plus a few special cards.",
    tiersSub: "The tier comes from the overall rating. Wonderkid and Flashback are earned differently.",
    ctaBottom: "Ready to be judged?",
    ctaBottomBtn: "Make my card",
  },
  stats: {
    TEC: { name: "Technique", what: "How deep the written or described work goes." },
    SHIP: { name: "Shipping", what: "Real consistency, week after week." },
    ARCH: { name: "Rigor", what: "Tests, CI, tooling." },
    DOC: { name: "Communication", what: "READMEs, commit messages, CV clarity." },
    XP: { name: "Experience", what: "Real or claimed seniority." },
    BUZZ: { name: "Buzzwords", what: "Hot-air density. Doesn't count toward the rating." },
  },
  tiers: {
    bronze: "Bronze",
    silver: "Silver",
    gold: "Gold",
    icon: "Icon",
    wonderkid: "Wonderkid",
    flashback: "Flashback",
    totw: "Team of the Week",
  },
  tierCard: (tier) => `${tier} card`,
  waiting: {
    title: "Your pack is getting ready",
    elapsed: "elapsed",
    progress: {
      lazy_commits: (n) => `Reading your ${n ?? "many"} “wip” commits…`,
      buzzwords: (n) => `Counting buzzwords… ${n ?? 0} so far`,
      tests: () => "Looking for tests… still looking",
      readme: () => "Checking the README says more than “TODO”…",
      recruiter: () => "A recruiter would be done by now. We're taking our time.",
      compare: (n) => `Comparing with ${n ? n.toLocaleString("en-US") : "thousands of"} devs sourced by Azerit…`,
      profile: () => "Profile found. It exists, that's a start.",
      repos: (n) => `${n ?? "A few"} public repos spotted, forks excluded…`,
      calendar: () => "Reading 52 weeks of contribution calendar…",
      commits: (n) => `Reading ${n ?? 100} commit messages…`,
      code: () => "The AI is reading your code. It doesn't score. It takes notes.",
      cv: () => "Reading the PDF, in memory. It'll be forgotten right after.",
      pdf: () => "Extracting text from the PDF…",
      scoring: () => "Applying the rubric. No AI touches the numbers.",
      statuses: () => "Picking statuses from the closed list…",
      render: () => "Printing the card…",
      start: () => "Opening the file. No coffee, no break.",
    },
    fillers: [
      "The rubric is hard-coded in a JSON file. No favoritism.",
      "Ignoring your forks. Everyone forked a tutorial once.",
      "Looking for a “final final v2” commit…",
      "Computing reliability. Never 100%, nobody is.",
      "We don't read your private repos. Promise.",
      "Calibrating the stamp…",
      "Checking node_modules isn't committed…",
    ],
  },
  reveal: {
    tap: "Tap to open",
    skip: "Skip animation",
    opening: "Opening the pack",
    revealed: (tier, overall) => `${tier} card, rated ${overall}.`,
  },
  result: {
    yourCard: "Your card",
    sharedBanner: (name) => `${name}'s card, judged by an AI in a few seconds.`,
    makeYours: "Make yours",
    yourTurn: "Your turn: a username is enough.",
    reliability: (n) => `Reliability ${n}%`,
    share: {
      title: "Share it",
      linkedin: "LinkedIn",
      x: "X",
      copy: "Copy link",
      download: "Download image",
      native: "Share",
      linkedinHint: "Text copied: paste it into your LinkedIn post.",
      copiedLink: "Link copied.",
      downloadDemo: "Image unavailable in demo mode (rendered by the server).",
      text: (tier, overall, status, secs, url) =>
        `${tier}, ${overall}.${status ? ` Status: “${status}”.` : ""} Judged by an AI in ${secs}s. Make yours: ${url}`,
      textCompare: (cv, gh, headline, url) => `My CV: ${cv}. My GitHub: ${gh}. ${headline}. Make yours: ${url}`,
    },
    linkedin: {
      kicker: "Customize my card",
      btn: "Use my LinkedIn photo",
      noPhoto: "Your card has no photo yet. Use your LinkedIn profile picture, nothing else is read.",
      updated: "Photo updated.",
      error: "LinkedIn said no. Try again.",
    },
    why: {
      title: "Why this rating?",
      overallLine: "Overall = TEC 30% · SHIP 20% · ARCH 20% · DOC 15% · XP 15%.",
      buzzNote: "BUZZ doesn't count toward the overall rating. It's the stat we show for laughs.",
      insufficient: "Not enough data",
      statusesTitle: "Statuses and their rule",
      byAI: "picked by the AI from a closed list",
      reliabilityTitle: "Reliability",
      reliabilityText: (n, ok) =>
        `${n}%: ${ok} of 5 axes rest on enough data (19 points per axis, 95 max). Never 100%: we just judged you in a few seconds, like a rushed recruiter.`,
      noFacts: "No detailed facts for this axis.",
      tabCv: "CV card",
      tabGithub: "GitHub card",
    },
    contest: {
      button: "Dispute my rating",
      again: "Appeal (again)",
      title: "VAR decision",
      seeFacts: "See the facts",
      replies: [
        "Appeal reviewed in slow motion, from three angles. The decision stands.",
        "Your complaint has been forwarded to the relevant department: a TODO.md that doesn't exist yet.",
        "We read your code a second time. It hadn't changed in the meantime.",
        "Disputing is a skill. Sadly, it isn't in the rubric.",
        "The referee checked the rubric. The rubric can't be sweet-talked: it's written in JSON.",
        "Request logged. Estimated processing time: however long it takes you to add tests.",
        "The jury met. The jury is a pure function. It returned the same rating.",
      ],
      lowest: (code, v) => `Hint: your lowest stat is ${code} at ${v}. A commit beats an appeal.`,
    },
    addCv: { title: "Add your CV to see the gap", text: "What your CV claims against what your GitHub proves. Two cards, one delta.", btn: "Add my CV" },
    addGithub: { title: "Add your GitHub to see the gap", text: "Your CV has spoken. Let's see if your code agrees.", btn: "Add my GitHub" },
    roast: {
      title: "Switch to roast mode",
      soon: "Soon",
      text: "Harsher, funnier. Only for the account owner, after GitHub sign-in. We don't roast other people.",
    },
    email: {
      title: "Get your card by email",
      label: "Email address",
      placeholder: "you@example.dev",
      btn: "Send it",
      sending: "Sending…",
      done: "Done. Your card is on its way, with its delete link.",
      invalid: "That doesn't look like an email address.",
      error: "Sending failed. Try again later.",
      note: "Optional. Also keeps your card beyond 90 days.",
    },
    cta: { text: "Hiring? Azerit reads your candidates' GitHub for you.", link: "azerit.tech" },
    del: {
      link: "Delete my card",
      confirm: "Delete for good?",
      yes: "Yes, delete",
      no: "Cancel",
      done: "Card deleted. It's gone, image included.",
      error: "Deletion failed.",
    },
    again: "Make another card",
  },
  compare: {
    cvLabel: "What your CV claims",
    ghLabel: "What your GitHub proves",
    cvShort: "CV",
    ghShort: "GitHub",
    deltaTitle: "The gap, stat by stat",
    legendUp: "code is worth more",
    legendDown: "CV inflates",
    overall: "Overall",
    buzzHint: "BUZZ: lower is better",
    switchLabel: "Card shown",
  },
  errors: {
    title: "No card this time",
    retry: "Try again",
    notFound: "This card doesn't exist, or no longer does. It may have been deleted.",
    timeout: "It's taking over 30 seconds. We'd rather stop than make things up. Try again.",
    generic: "Something broke on our side.",
  },
  footer: {
    tagline: "An Azerit tool. We read the work, not the CV.",
    privacy: "Privacy",
  },
  privacy: {
    title: "Privacy",
    intro: "Short, because we keep very little.",
    sections: [
      {
        h: "What we keep",
        p: "Public facts derived from GitHub (already computed), the AI's findings, the ratings, the statuses. Your email, only if you give it.",
      },
      {
        h: "What we never keep",
        p: "Your CV: the file is read in memory, findings are extracted, then the file and its text are thrown away. Code files read by the AI aren't kept either.",
      },
      {
        h: "How long",
        p: "90 days, then the card and its images are deleted automatically. Unless you left your email: then the card stays until you delete it.",
      },
      {
        h: "Deleting your card",
        p: "A “Delete my card” link is shown under your card and sent in the email. It erases the card and its images immediately.",
      },
      {
        h: "Someone else's card",
        p: "Anyone can generate a card for any public username: it relies on public data and stays in teasing mode. The username's owner can have it deleted by proving the GitHub account is theirs.",
      },
      {
        h: "LinkedIn photo",
        p: "Only if you connect LinkedIn yourself: we fetch your profile picture, stored with the card and deleted with it. Nothing else is read from LinkedIn.",
      },
      {
        h: "Measurement",
        p: "Four anonymous events, recorded by our own server: card generated, card shared, email given, click to azerit.tech. No ad cookies, no third-party tools.",
      },
    ],
    contact: "Questions: hello@azerit.tech",
  },
  notFound: { title: "Page not found", text: "Even GitHub would return a 404 here.", home: "Back to home" },
};

export const DICTS: Record<Lang, Dict> = { fr, en };

const STORAGE_KEY = "tys_lang";

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "en") return stored;
  } catch {
    /* stockage indisponible */
  }
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  if (path.startsWith("/privacy")) return "en";
  if (path.startsWith("/confidentialite")) return "fr";
  const nav = typeof navigator !== "undefined" ? navigator.language : "fr";
  return nav.toLowerCase().startsWith("fr") ? "fr" : "en";
}

interface LangCtx {
  lang: Lang;
  t: Dict;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangCtx | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* rien */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, t: DICTS[lang], setLang }), [lang, setLang]);
  return createElement(Ctx.Provider, { value }, children);
}

export function useT(): LangCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useT hors de LangProvider");
  return v;
}

/** Choisit la langue d'un fait venu de l'API. */
export function pick(f: { fr: string; en: string } | undefined | null, lang: Lang): string {
  if (!f) return "";
  return f[lang] || f.fr || f.en;
}
