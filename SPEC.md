# Testyourskills — ce qu'on veut, idéalement

*Spécification cible, écrite le 14 octobre 2026. C'est le document de référence : toute décision de design, de jugement ou de code se vérifie contre lui. Quand on tranche une question ouverte, on met à jour ce fichier.*

## 0. En une phrase

Un outil de communication pour azerit.tech : tu donnes ton pseudo GitHub ou ton CV, tu reçois en dix secondes une carte de joueur façon FIFA Ultimate Team, belle, partageable, avec des statuts ironiques. Et deux cartes si tu donnes les deux : **ce que ton CV déclare** contre **ce que ton GitHub prouve**. L'écart entre les deux, c'est la blague, la critique et le message d'Azerit en un seul écran.

## 1. Pourquoi on le fait

- **Porter la thèse d'Azerit** sans la dire : on lit le travail public, pas les CV. L'outil le fait vivre à chacun sur son propre cas.
- **Faire circuler le nom** : chaque carte partagée sur LinkedIn ou X porte le domaine. La carte est le support, la landing est l'atterrissage.
- **Montrer ce que l'IA sait faire** sur un cas concret, avec une pointe d'ironie sur le fait qu'une IA vient de juger quelqu'un en dix secondes sur deux pages de PDF, comme un recruteur pressé.
- **Récupérer des leads** : parmi ceux qui jouent, certains recrutent. Un email optionnel après la carte, et un CTA vers azerit.tech.

Audience de l'outil : les devs, en français et en anglais. Audience de la landing : ceux qui recrutent. Les deux ne se mélangent pas (voir §10).

## 2. Principes non négociables

Chaque point ci-dessous est une instruction. Si une fonctionnalité contredit l'un d'eux, c'est la fonctionnalité qu'on change.

1. **Beau avant tout.** Si la carte ne donne pas envie d'être capturée et partagée telle quelle, ce n'est pas fini. Pas de style « admin dashboard », pas de composants de librairie UI génériques.
2. **Onboarding réduit à un champ.** Pas de compte, pas de formulaire, pas d'étape intermédiaire. Pseudo GitHub ou dépôt de PDF, puis la carte.
3. **L'IA ne note jamais.** Elle lit et rend des constats structurés. Un barème fixe en code transforme les constats en chiffres. Une même entrée donne toujours la même carte.
4. **On se moque des CV et des pratiques, jamais des personnes.** Les statuts viennent d'une liste fermée, déclenchés par des règles. Aucun texte libre sur quelqu'un. Jamais sur l'origine, l'âge, le genre, le nom, la santé, l'apparence, le lieu ou l'employeur.
5. **Chaque note est explicable.** Sous la carte, « Pourquoi cette note ? » liste les faits derrière chaque axe. Si quelqu'un conteste, il voit sur quoi ça repose.
6. **Le CV n'est jamais stocké.** Il est lu en mémoire, les constats sont gardés, le fichier et le texte sont jetés.
7. **Azerit est visible, pas envahissant.** Un logo discret sur la carte, une ligne de CTA sous la carte, c'est tout.
8. **Bilingue français et anglais** dès la v1, car la landing est en anglais.
9. **Fonctionne sur mobile** aussi bien que sur desktop. La majorité des clics viendront de LinkedIn sur téléphone.

## 3. La carte

### 3.1 Anatomie

Proportions d'une carte FUT, environ 9 sur 13. De haut en bas :

- **Haut gauche** : la note globale en très grand, dessous le poste en mono, dessous le logo du langage principal (à la place du drapeau), dessous le « club » (employeur déclaré, sinon « Agent libre »).
- **Haut droite** : la marque Azerit, petite.
- **Centre** : le portrait. Avatar GitHub détouré sur un masque en dégradé, ou la photo LinkedIn si la personne connecte son compte (§16). Sans photo, les initiales en typo condensée.
- **Bandeau** : le nom ou le pseudo.
- **Bas** : six stats sur deux colonnes, code à trois ou quatre lettres et valeur sur 99.
- **Pied** : un à trois statuts en pastilles, puis une ligne en mono : « Jugé par une IA en 9 s · fiabilité 34 % ».

### 3.2 Les tiers

Le tier découle de la note globale et pilote tout le rendu de la carte (cadre, couleurs, effet).

| Tier | Note globale | Rendu |
|---|---|---|
| Bronze | moins de 60 | cuivre mat, grain |
| Argent | 60 à 74 | acier brossé |
| Or | 75 à 89 | or, reflets chauds |
| Icon | 90 et plus | blanc irisé, holo intense |

Cartes spéciales, qui remplacent le tier quand la règle s'applique :

- **Wonderkid** : XP sous 45 et TEC à 70 ou plus. Le junior qui monte.
- **Flashback** : au moins 60 % de l'activité GitHub a plus de cinq ans.
- **Team of the Week** (plus tard) : les cinq meilleures cartes générées dans la semaine.

### 3.3 Les six stats

| Code | Nom | Ce que ça mesure |
|---|---|---|
| TEC | Technique | la profondeur de ce qui est écrit ou décrit |
| SHIP | Livraison | la régularité réelle |
| ARCH | Rigueur | tests, CI, outillage |
| DOC | Communication | README, messages de commit, clarté du CV |
| XP | Expérience | l'ancienneté réelle ou déclarée |
| BUZZ | Buzzwords | la densité de vent |

La note globale est la moyenne pondérée des cinq premières : TEC 30 %, SHIP 20 %, ARCH 20 %, DOC 15 %, XP 15 %. **BUZZ ne compte pas dans la globale**, c'est la stat qu'on affiche pour rire.

### 3.4 Le poste

Déterminé par le code à partir des langages et des dépendances dominantes, l'IA ne tranche que si c'est ambigu : FS, BE, FE, MOB, DATA, ML, OPS, SEC, EMB. Pour un CV sans GitHub, l'IA extrait le poste parmi la même liste plus PM, DESIGN, « CTO autoproclamé » (si le titre dit CTO et que l'entreprise compte moins de cinq personnes ou n'est pas identifiable).

### 3.5 La fiabilité

La part des axes qui reposent sur des données suffisantes, affichée sur la carte. Plafonnée à 95, jamais 100. Quelqu'un dont tout le travail est privé a trois repos publics et une fiabilité basse : c'est le message, on vient de le juger sur presque rien.

Seuils de suffisance par axe (carte GitHub) :

- TEC : au moins un repo avec 20 commits ou plus.
- SHIP : le calendrier de contributions sur 52 semaines est disponible.
- ARCH : au moins deux repos actifs dans les deux dernières années.
- DOC : au moins deux repos avec des commits lisibles.
- XP : au moins un repo avec 10 commits ou plus.

Fiabilité = 19 points par axe suffisant, donc 95 au maximum.

## 4. Le jugement

### 4.1 Trois rôles séparés

1. **Le code collecte des faits.** Appels GitHub, extraction du texte du PDF, comptages.
2. **L'IA lit ce que le code ne sait pas lire.** Le code source des trois repos les plus actifs, le CV. Elle rend un JSON strict validé par schéma. Elle ne produit jamais de nombre qui finit sur la carte.
3. **Le code note.** Chaque fait ou constat passe par une échelle fixe, écrite dans un seul fichier de barème, versionné.

### 4.2 Collecte GitHub

Via l'API REST et GraphQL avec un token serveur. Exclure les forks. Garder les repos archivés comme passé.

- **Profil** : date de création du compte, nom, avatar, bio, entreprise, followers.
- **Repos** : nom, description, langage principal, octets par langage, stars, dernier push, date de création, topics, licence, nombre de mots du README.
- **Arborescence** des cinq repos les plus actifs : présence de tests (`test`, `tests`, `spec`, `__tests__`), de CI (`.github/workflows`, `.gitlab-ci.yml`), d'outillage (eslint, prettier, ruff, mypy, `tsconfig` strict), et présence de `node_modules` commité.
- **Calendrier de contributions** sur 52 semaines, nombre de semaines avec au moins une contribution.
- **Messages de commit** : les 100 derniers sur les trois repos les plus actifs. Part de messages « paresseux » : moins de 8 caractères, ou qui matchent `^(fix|wip|update|test|final|stuff|asdf|changes|minor)[\s\d.!]*$` sans tenir compte de la casse.
- **Horodatage des commits** : part entre 1 h et 5 h, part le vendredi après 18 h.
- **PR fusionnées chez les autres** : recherche `type:pr author:X is:merged -user:X`.
- **Premier vrai commit** : date du plus ancien commit de l'utilisateur dans un repo qui en compte au moins 10.
- **Repos tutoriels** : nom qui matche `todo|tutorial|hello-world|clone|portfolio-v\d|test-?\d*|learn` et moins de 5 commits.

### 4.3 Lecture par l'IA

Deux appels, chacun avec un schéma de sortie imposé, température zéro, barème et consignes en cache de prompt.

**Lecture de code.** Pour chacun des trois repos les plus actifs, le code choisit jusqu'à dix fichiers (les plus modifiés, hors générés, hors vendored, 40 Ko max en tout). L'IA rend :

```json
{
  "repo": "nom",
  "level": 3,
  "evidence_file": "src/api/router.ts",
  "evidence_quote": "moins de 200 caractères",
  "observed_traits": ["handles_errors", "typed_strictly"]
}
```

`level` va de 1 à 5 : 1 tutoriel suivi, 2 fonctionnel mais brut, 3 structuré et maintenable, 4 solide avec gestion d'erreurs et tests pertinents, 5 niveau mainteneur de librairie. `observed_traits` ne prend que des valeurs de la liste fermée du §5.3.

**Lecture du CV.** Le texte extrait du PDF. L'IA rend :

```json
{
  "language": "fr",
  "position": "FS",
  "years_declared": 6,
  "seniority_claimed": "senior",
  "roles": [{ "title": "", "company": "", "start": "2021-03", "end": null, "responsibilities": [""] }],
  "technos_listed": [""],
  "technos_described": [""],
  "tests_ci_review_mentions": [{ "quote": "" }],
  "projects_with_dated_outcome": 2,
  "writing_quality": 3,
  "is_dev_profile": true
}
```

`technos_described` ne contient que les technos rattachées à une responsabilité concrète, pas celles d'une simple liste. `writing_quality` de 1 à 5 juge la structure et la clarté du CV, pas la personne. Le code compte lui-même les mots creux et la longueur.

Modèle par défaut : Haiku 5.5 (voir §16). Passer à Sonnet 5.5 pour la lecture de code seulement si la calibration (§4.6) montre qu'il le faut.

### 4.4 Le barème, carte GitHub

Toutes les échelles sont linéaires par morceaux entre les points donnés, arrondies, bornées à 99.

- **SHIP** : semaines actives sur 52. 0 → 20, 13 → 50, 26 → 70, 40 → 85, 52 → 99. Bonus 5 si au moins trois releases ou tags dans l'année.
- **ARCH** : sur les cinq repos les plus actifs, score brut = 50 × part avec tests + 30 × part avec CI + 20 × part avec outillage. Brut 0 → 25, brut 100 → 99.
- **DOC** : brut = 60 × part des cinq repos actifs avec un README de 300 mots ou plus + 40 × (1 − part de commits paresseux). Brut 0 → 25, brut 100 → 99.
- **XP** : années depuis le premier vrai commit. 0 → 25, 1 → 40, 3 → 60, 5 → 75, 8 → 88, 12 et plus → 99. Bonus jusqu'à 8 pour la largeur : 4 langages avec 10 Ko ou plus → 4, 6 ou plus → 8.
- **TEC** : moyenne des `level` des trois repos lus, pondérée par leur activité. 1 → 35, 2 → 50, 3 → 65, 4 → 80, 5 → 95. Bonus 4 si au moins cinq PR fusionnées chez les autres.
- **BUZZ** : brut = 50 × part de repos tutoriels + 50 × part de commits paresseux. Brut 0 → 10, brut 100 → 99.

### 4.5 Le barème, carte CV

Même grille, mêmes bornes, sources différentes.

- **TEC** : séniorité déclarée. junior → 50, mid → 65, senior → 80, lead ou staff → 88. Plus 2 par techno décrite (pas seulement listée), jusqu'à 99.
- **SHIP** : projets avec un résultat daté. 0 → 35, 1 → 50, 3 → 70, 5 → 85, 8 et plus → 95.
- **ARCH** : mentions concrètes de tests, CI ou revue de code. 0 → 35, 1 → 60, 2 → 75, 3 et plus → 90.
- **DOC** : `writing_quality`. 1 → 30, 2 → 50, 3 → 65, 4 → 80, 5 → 95. Moins 10 si le CV dépasse 1 200 mots.
- **XP** : années déclarées, même échelle que la carte GitHub.
- **BUZZ** : mots creux pour 100 mots. 0 → 10, 1 → 40, 2 → 65, 3 → 85, 4 et plus → 99. Liste des mots creux dans un fichier dédié, en français et en anglais : passionné, dynamique, agile, synergie, disruptif, innovant, expert, ninja, rockstar, 10x, proactif, force de proposition, IA quand aucun projet IA n'est décrit.

### 4.6 Par rapport à quoi : la calibration

Les points des échelles ci-dessus sont une première hypothèse. Avant la mise en ligne, les recaler sur de vrais profils : les dumps de campagnes de sourcing d'Azerit (`../hiring-traces`, `../App/recruiting`) contiennent des milliers de profils GitHub réels. Objectif : qu'une note de 75 sur un axe signifie « dans le quart supérieur des devs qu'Azerit a réellement sourcés ». Vérifier ensuite à la main sur cinq profils connus que les cartes paraissent justes. Noter le résultat de la calibration dans ce fichier.

### 4.7 Cas particuliers

- **Moins de trois repos publics** : carte générée, fiabilité basse, statut « Repo privé, talent privé ».
- **Compte d'organisation** : refusé avec un message.
- **CV qui n'est pas un CV** ou profil non dev : carte CV seule, poste PM ou DESIGN, pas de carte GitHub.
- **Pseudo inconnu** : message clair, pas de carte vide.
- **Même pseudo demandé deux fois** : la carte est mise en cache 24 h, on ne refait pas les appels.

## 5. Les statuts

### 5.1 Règles de composition

- Au plus trois statuts par carte, au moins un positif si un positif s'applique.
- Priorité : spéciaux, puis ceux de l'écart CV contre GitHub, puis négatifs, puis positifs.
- Un statut ne se déclenche que par une règle sur des faits, ou par l'IA qui choisit dans la liste fermée du §5.3. Aucun texte libre.
- Mode « taquin » par défaut. Mode « roast », plus dur, uniquement si la personne prouve que c'est son compte via GitHub OAuth (§6.4). On ne roaste pas quelqu'un d'autre.

### 5.2 Catalogue de départ, par règle

Les valeurs entre accolades sont remplies par le code. Ajouter au catalogue sans supprimer, chaque statut a un identifiant stable.

Depuis GitHub :

- « Commits : fix, fix2, final fix » — part de commits paresseux à 40 % ou plus.
- « Tests : bientôt » — aucun test sur les cinq repos actifs.
- « README en construction depuis {année} » — README du repo principal sous 50 mots, repo de deux ans ou plus.
- « Push sur main le vendredi soir » — 30 % ou plus des commits le vendredi après 18 h.
- « Commit de 3 h du matin » — 15 % ou plus des commits entre 1 h et 5 h.
- « A fini le tutoriel » — trois repos tutoriels ou plus.
- « {n} repos, {m} vivants » — dix repos ou plus, au plus 20 % actifs dans l'année.
- « Contributeur fantôme » — aucune PR fusionnée chez les autres, compte de trois ans ou plus.
- « Migre de framework chaque année » — quatre frameworks front ou plus sur l'ensemble des repos.
- « Stars : sa mère et lui » — deux stars au total ou moins, cinq repos ou plus.
- « Repo privé, talent privé » — moins de trois repos publics.
- « Archéologue » — 60 % ou plus de l'activité a plus de cinq ans.
- « Polyglotte (ou indécis) » — six langages ou plus avec 10 Ko ou plus.
- « node_modules commité » — dossier trouvé dans l'arborescence.
- « Ship ou rien » (positif) — SHIP à 85 ou plus.
- « Accepté chez les autres » (positif) — dix PR fusionnées chez les autres ou plus.
- « Documente (si, si) » (positif) — DOC à 80 ou plus.
- « Lu par d'autres » (positif) — 100 stars cumulées ou plus.
- « Mainteneur » (positif) — un repo avec dix contributeurs externes ou plus.

Depuis le CV :

- « Senior depuis le CV » — années déclarées supérieures d'au moins trois ans à l'ancienneté GitHub.
- « Expert en {n} frameworks (d'après le CV) » — douze technos listées ou plus.
- « Passionné (mentionné {n} fois) » — le mot apparaît deux fois ou plus.
- « A ajouté IA à son titre en {année} » — IA ou AI dans le titre, aucun repo ni projet IA décrit.
- « CV plus long que ses README » — mots du CV supérieurs à la somme des README des cinq repos actifs.
- « Agile, synergie, disruptif » — trois mots creux ou plus pour 100 mots.
- « Dit ce qu'il fait » (positif) — au moins cinq technos décrites avec une responsabilité.

Jamais : tout statut qui révèle un problème de sécurité d'une personne (secrets dans l'historique, dépendance vulnérable). On ne l'affiche pas, point.

### 5.3 Liste fermée pour l'IA

L'IA peut poser un seul statut par carte, choisi ici d'après ce qu'elle a lu dans le code :

- « Variables nommées a, b, tmp »
- « Fonction de 400 lignes repérée »
- « Commentaires en franglais »
- « console.log en prod »
- « Copié-collé en série »
- « Gère ses erreurs (rare) » (positif)
- « Typé jusqu'au bout » (positif)
- « Architecture propre, vraiment » (positif)

## 6. Le parcours

### 6.1 Entrée

Une page, un champ, deux onglets : « Ton GitHub » (pseudo ou URL) et « Ton CV » (dépôt de PDF, 5 Mo et 10 pages maximum). Un lien discret « les deux » pour la comparaison. Rien d'autre au-dessus de la ligne de flottaison, à part une carte d'exemple qui bouge pour montrer ce qu'on va recevoir.

Trois raccourcis qui évitent le champ ou le clic :

- **L'URL directe** `/{pseudo}` lance la carte sans rien saisir et remplace l'adresse par `/c/{id}`. C'est le lien à mettre dans les messages de sourcing d'Azerit, qui connaissent déjà le pseudo. En cas d'erreur (pseudo inconnu, limite atteinte), retour à l'entrée avec le pseudo prérempli et le message.
- **Coller une URL GitHub ou déposer un PDF n'importe où sur la page** lance la carte. Un mot collé seul ne déclenche rien : il faut une URL `github.com/…`. Un dépôt en mode comparaison remplit le CV et attend le pseudo s'il manque.
- **Le bandeau d'une carte partagée porte le champ.** La plupart des visiteurs arrivent sur `/c/{id}` depuis LinkedIn : ils saisissent leur pseudo là, sans repasser par l'accueil. Un lien « ou avec ton CV » renvoie à l'entrée, onglet CV.

Sur desktop, le champ a le focus à l'arrivée. Pas sur mobile : le clavier cacherait la carte d'exemple. Le clavier mobile affiche « Ouvrir » comme touche d'envoi.

### 6.2 Attente

Entre cinq et quinze secondes. Afficher des messages qui défilent, en lien avec les faits déjà collectés quand c'est possible :

- « Lecture de tes {n} commits « wip »… »
- « Comptage des buzzwords… {n} pour l'instant »
- « Recherche des tests… toujours en cours »
- « Vérification que le README dit autre chose que « TODO »… »
- « Un recruteur aurait déjà fini. On prend le temps. »
- « Comparaison avec {n} devs sourcés par Azerit… »

### 6.3 Révélation

Ouverture de pack, sautable d'un clic, moins de trois secondes en tout : le pack flotte sur fond sombre, clic, tremblement, flash, la carte se retourne, les stats montent de zéro à leur valeur l'une après l'autre, le tier se tamponne en dernier. Respecter `prefers-reduced-motion` : dans ce cas, affichage direct.

### 6.4 Après la carte

Dans cet ordre, sous la carte :

1. Boutons de partage (§7) et téléchargement de l'image.
2. « Pourquoi cette note ? » déplié : les faits par axe, la liste des statuts avec leur règle.
3. « Contester ma note » : réponse canned et drôle, puis renvoi vers les faits. Easter egg, pas un vrai formulaire.
4. Si une seule source : « Ajoute ton CV (ou ton GitHub) pour voir l'écart ».
5. « Passer en mode roast » : demande GitHub OAuth, réservé au propriétaire du compte.
6. Email optionnel : « Reçois ta carte par email ». Un champ, un bouton. Envoie le même événement que la page Try de la landing, avec `event: "card_email"`.
7. CTA Azerit, une ligne : « Vous recrutez ? Azerit lit le GitHub de vos candidats à votre place. » Lien vers azerit.tech.

### 6.5 Comparaison

Quand les deux sources sont là : les deux cartes côte à côte sur desktop, empilées avec un curseur sur mobile. Entre les deux, le delta par stat en pastilles colorées. Un titre généré par règle : « Ton CV te vend {n} points de plus que ton code » ou l'inverse « Ton code vaut {n} points de plus que ton CV, change de CV ».

## 7. Partage

- **URL unique** par carte : `/c/{id}` avec un id court, non devinable.
- **Page de carte** rendue côté serveur avec les balises Open Graph et Twitter, pour que LinkedIn et X affichent l'image.
- **Image générée côté serveur** à partir du même composant que la carte, pas une capture d'écran. Deux formats : 1200 × 630 pour l'aperçu de lien, 1080 × 1350 pour LinkedIn et Instagram en portrait.
- **Textes préremplis**, en FR et en EN, qui citent la note, le tier et un statut. Exemple : « Carte Or, 78. Statut : « Commits : fix, fix2, final fix ». Jugé par une IA en 9 s. Fais la tienne : {url} ».
- **Boutons** : LinkedIn, X, copier le lien, télécharger le PNG. Pas de SDK tiers, des liens d'intention.
- **La carte comparée** a aussi son URL et son image, avec les deux cartes.

## 8. Le visuel

### 8.1 Système

- **Palette** : celle de la landing. Fond `#0a0f16`, surfaces `#101722`, bordures `#223040`, texte `#e6ecf2`, texte atténué `#8494a5`, accent teal `#52d0bd`, bleu `#6cb6ff`. Les tiers ont leurs propres dégradés métallisés, définis une fois en variables CSS.
- **Typo** : une condensée pour les gros chiffres et le nom (Barlow Condensed en 700 et 800, via Google Fonts), Inter pour le texte, JetBrains Mono pour les codes de stats et le pied de carte, comme sur la landing.
- **Dimensions** : 360 × 520 sur desktop, largeur de l'écran moins les marges sur mobile, jamais de défilement horizontal.
- **Logos de langages** : SVG monochromes, inline, pas de police d'icônes.

### 8.2 Effets

- **Inclinaison 3D** au survol, douze degrés maximum, qui suit le pointeur. Sur mobile, suit le gyroscope si disponible.
- **Reflet holographique** qui se déplace avec le pointeur, intensité selon le tier, technique des cartes Pokémon en CSS. Un grain de feuille métallique par bruit SVG.
- **Balayage de lumière** à la révélation.
- Tout en CSS et transformations, pas de WebGL, pour que ça tourne sur n'importe quel téléphone.
- `prefers-reduced-motion` désactive l'inclinaison et le balayage, garde le rendu statique.

### 8.3 Barre de qualité

- La carte se lit en une seconde : la note, le tier, le portrait, puis les stats.
- Aucun texte ne déborde. Les noms longs se réduisent, les statuts se tronquent avec des points de suspension.
- L'image partagée est pixel-identique à la carte à l'écran.
- Contraste suffisant sur chaque tier, y compris Or et Icon.
- Un avis extérieur valide le look avant d'écrire le backend.

## 9. Stack et architecture

Reprendre les habitudes des autres projets Azerit, pas de nouvelle stack.

- **Front** : Vite, React 19, TypeScript, CSS simple avec variables, comme `../LandingPage`. Aucune librairie UI.
- **Backend** : Node 22, TypeScript, Hono. Endpoints : `POST /api/card` (pseudo ou PDF) qui répond un id et traite en tâche de fond, `GET /api/card/:id` pour le résultat, `GET /c/:id` page rendue côté serveur avec les balises OG, `GET /og/:id.png` et `GET /og/:id-portrait.png`.
- **IA** : via OpenRouter (API compatible OpenAI, appelée en `fetch`), sortie structurée par schéma, température zéro, barème et consignes en cache de prompt. Haiku 5.5 (`anthropic/claude-haiku-5.5`) par défaut dans `.env`.
- **GitHub** : REST et GraphQL avec un token serveur. Plus tard, une app OAuth pour le mode roast.
- **PDF** : extraction de texte côté serveur, en mémoire, puis suppression.
- **Images** : rendu du composant carte en SVG puis PNG côté serveur (satori et resvg), mis en cache sur disque.
- **Stockage** : SQLite, une table `cards` avec id, date, source, pseudo, JSON de la carte, email optionnel, jeton de suppression. Jamais le texte du CV.
- **Déploiement** : Docker, docker-compose, extrait Caddy, comme `../App` et `../Linkedin_mcp`. Sous-domaine à confirmer, proposition `skills.azerit.tech`.
- **Variables d'environnement** : `OPENROUTER_API_KEY`, `GITHUB_TOKEN`, `BASE_URL`, `DB_PATH`, `LEADS_ENDPOINT`.
- **Mesure** : le même outil d'analytics que la landing, quatre événements : `card_generated`, `card_shared`, `card_email`, `cta_azerit_clicked`.

Le barème (§4.4, §4.5), le catalogue de statuts (§5) et la liste des mots creux vivent dans trois fichiers de données séparés du code, pour qu'on puisse les ajuster sans toucher à la logique.

## 10. Lien avec azerit.tech

- L'outil vit sur son sous-domaine, pas dans la landing : audiences et tons différents, et la landing reste un site statique.
- Trois points de contact, pas plus : le CTA sous la carte, une ligne sous la section « Read the work, not the CV » de la landing (« Curious what your own GitHub says about you? Get your card. »), un lien dans le pied de page.
- Pas d'entrée dans la navigation principale.

## 11. Données et RGPD

- On stocke : les faits publics GitHub déjà calculés, les constats de l'IA, les notes, les statuts, l'email si donné, la photo LinkedIn si la personne l'a connectée. On ne stocke pas : le fichier CV, son texte, les fichiers de code lus.
- Conservation : 90 jours, puis suppression automatique de la carte et de ses images, sauf si la personne a laissé son email.
- « Supprimer ma carte » : lien avec jeton envoyé sur la page de résultat et dans l'email.
- Une carte générée sur le pseudo de quelqu'un d'autre repose sur des données publiques et reste en mode taquin. Le propriétaire du pseudo peut la faire supprimer en prouvant le compte via OAuth.
- Page de confidentialité courte, en FR et EN, qui dit tout ça.

## 12. Garde-fous

- Vingt cartes par adresse IP et par jour.
- Une carte par pseudo par 24 h, servie depuis le cache.
- Timeout de 30 secondes par carte, au-delà message d'erreur honnête et pas de carte vide.
- Budget de tokens par carte plafonné, coût suivi par jour.
- Tout ce qui sort de l'IA est validé par schéma, une sortie invalide relance une fois puis rend une carte à fiabilité réduite sans TEC.

## 13. Ce qu'on mesure

Cartes générées, part partagée, part avec email, clics vers azerit.tech, demandes de démo attribuées. Un tableau par semaine, pas plus.

## 14. Ordre de construction

Chaque étape a sa définition de « fini ». On ne passe à la suivante qu'une fois la précédente validée.

1. **Maquette de la carte.** HTML et CSS dans ce repo, données fictives, les quatre tiers et les cartes spéciales, inclinaison et holo, version mobile. Fini quand Jacques et un avis extérieur veulent la partager telle quelle.
2. **Collecte GitHub et barème.** Code pur, sans IA, sortie JSON. Fini quand cinq profils connus donnent des notes qui paraissent justes et que la calibration du §4.6 est notée.
3. **Lecture par l'IA.** Les deux appels, schémas, cache de prompt. Fini quand TEC et les statuts de l'IA sont stables sur trois exécutions du même profil.
4. **La page complète.** Entrée, attente, révélation, carte, partage avec URL et images serveur. Fini quand un lien collé sur LinkedIn affiche la carte.
5. **Carte CV et comparaison.** Extraction, barème CV, vue comparée, image comparée.
6. **Déploiement.** Docker, Caddy, sous-domaine, analytics, lien depuis la landing, page de confidentialité.
7. **Après lancement** : mode roast avec OAuth, Team of the Week, percentiles.

## 15. Décisions ouvertes

- Le nom de l'outil et le sous-domaine.
- Autoriser ou non la génération sur le pseudo de quelqu'un d'autre en v1 (proposition : oui, en mode taquin).
- Le modèle pour la lecture de code, à trancher par la calibration.
- L'outil d'analytics, à aligner sur la landing.

## 16. Décisions prises

*Ajoutées le 14 octobre 2026, au lancement de la construction.*

- **Rendu de la carte : un seul composant SVG React** (`shared/card/`), rendu dans le navigateur et côté serveur par `react-dom/server` puis resvg, avec les mêmes polices TTF (`server/fonts/`). Satori n'est pas utilisé : son sous-ensemble CSS empêche d'avoir une image pixel-identique à la carte à l'écran (§8.3). Les effets (inclinaison, holo, balayage) sont des calques CSS posés au-dessus du SVG dans le navigateur, absents de l'image partagée.
- **Polices côté serveur** : resvg ne parcourt pas une liste `font-family`, il prend la police par défaut quand le premier nom est inconnu. Chaque clé de police (`shared/card/fonts.ts`) résout donc un fichier TTF précis. resvg-js 2.6 ne décode pas le webp : un avatar webp retombe sur les initiales.
- **Un seul paquet** : `web/` (Vite, React 19), `server/` (Hono, Node 22, exécuté par tsx), `shared/` (types, composant carte, fixtures), `data/` (barème, statuts, mots creux).
- **Génération sur le pseudo de quelqu'un d'autre en v1** : oui, en mode taquin (proposition du §15 retenue).
- **Analytics** : la landing n'embarque aucun outil d'analytics. Les quatre événements du §9 sont enregistrés par le serveur dans une table `events` SQLite (`POST /api/event`) et relayés à `LEADS_ENDPOINT` si défini.
- **Fournisseur IA : OpenRouter** à la place de l'API Anthropic directe (demande de Jacques, 14 octobre 2026). Mêmes modèles Claude, appelés par `https://openrouter.ai/api/v1/chat/completions` avec `response_format` json_schema strict et `cache_control` sur le prompt système. Modèles surchargeables par `AI_MODEL_CODE` et `AI_MODEL_CV`, budget du jour par `AI_DAILY_BUDGET_USD`.
- **Modèle IA : Haiku 5.5** (`anthropic/claude-haiku-5.5`) à la place de Haiku 4.5 (demande de Jacques, 14 octobre 2026) : successeur direct, 0,10 $ / 0,50 $ par million de tokens sur OpenRouter contre 1 $ / 5 $, soit dix fois moins cher, avec `structured_outputs`. Comme Sonnet et Opus 5, il refuse `temperature` : le client ne l'envoie pas (sinon OpenRouter répond 404 avec `require_parameters`). Réglé par `AI_MODEL_CODE` et `AI_MODEL_CV` ; la valeur de repli du code reste Haiku 4.5 tant que la calibration (§4.6) n'a pas tourné sur 5.5.
- **Photo LinkedIn** (demande de Jacques, 14 octobre 2026) : après la carte, le créateur (celui qui détient le jeton de suppression) peut cliquer sur « Mettre ma photo LinkedIn ». Le bouton passe par « Sign in with LinkedIn using OpenID Connect » (scopes `openid profile`) et récupère le claim `picture`. Pas de scraping de LinkedIn : c'est interdit par leurs conditions, bloqué par le mur d'authentification, et ça permettrait de mettre la photo de quelqu'un sur une carte qu'il n'a pas demandée. La photo est téléchargée, stockée avec la carte et supprimée avec elle. Le token LinkedIn n'est jamais conservé. Les variables `LINKEDIN_CLIENT_ID` et `LINKEDIN_CLIENT_SECRET` sont nécessaires ; sans elles, le bouton est masqué.
- **Nom et sous-domaine** : « Testyourskills » et `skills.azerit.tech` en attendant un choix.
- **Onboarding raccourci** (demande de Jacques, 14 octobre 2026) : les trois raccourcis du §6.1 (URL directe `/{pseudo}`, collage et dépôt n'importe où, champ dans le bandeau visiteur) et le focus automatique sur desktop. La route `/{pseudo}` est servie par le repli SPA du serveur et traitée côté navigateur : aucun appel GitHub ou IA tant que le JavaScript ne tourne pas, donc aucun coût sur un crawl. Les premiers segments `api`, `og`, `c`, `auth`, `avatar`, `assets`, `privacy` et `confidentialite` ne sont jamais pris pour un pseudo. Les onglets GitHub / CV et le lien « les deux » restent : l'idée d'un champ unique sans onglets est écartée pour l'instant, parce qu'elle cacherait le chemin CV qui porte le message.

### 16.1 Barème : ajustements de la première version (0.1.0)

Observés sur des profils publics connus. Notes obtenues sans lecture IA (TEC au repli 50), puis avec un `level` 4 simulé :

| Profil | Sans IA | Level 4 |
|---|---|---|
| sindresorhus | Or 85 | Icon 94 |
| torvalds | Argent 71 | Or 80 |
| gaearon | Argent 69 | Or 78 |
| tj | Argent 65, Flashback | Argent 74 |
| compte vide | Bronze 34 | — |

La calibration du §4.6 sur les dumps de sourcing reste à faire : leur lecture est refusée aux agents, car ce sont des données personnelles. Jacques doit la faire lui-même.

- **Flashback et Archéologue** demandent en plus 26 semaines actives sur 52 au plus. Sans cette condition, la règle des 60 % d'activité de plus de cinq ans touchait tous les vétérans encore actifs.
- **Statut de repli** « Casier vierge » (positif) quand aucune règle ne se déclenche.
- **Statut posé par l'IA** : il passe en tête de son ton. Quand la carte n'a aucun statut positif mais qu'un positif s'applique, il remplace le troisième.
- **Outillage reconnu en plus** : biome, xo, golangci, rustfmt, clippy, pre-commit. Un tsconfig qui étend une config stricte connue compte comme strict.
- **Tests reconnus en plus** des dossiers : des motifs de fichiers (`*.test.ts`, `_test.go`, `test_*.py`…).
- **Poste** : score par part d'octets du langage, plus 3 points par dépendance reconnue, plus les marqueurs d'arbre et les topics. FS quand FE et BE dépassent tous deux la moitié du meilleur score, FS par défaut.
- **« Migre de framework »** : les frameworks sont comptés par famille (react, next et gatsby font un seul framework).
- **Horaires** : l'API GitHub ne donne les dates qu'en UTC. Le fuseau dominant est lu dans l'en-tête `Date:` de six patchs de l'échantillon, UTC si inconnu.
- **IA et AI** ne comptent comme mots creux qu'en majuscules, et pas quand le CV décrit un projet IA.
- **Fiabilité de la carte CV** :
  - TEC et SHIP : au moins un rôle ;
  - ARCH, DOC et BUZZ : au moins 150 mots ;
  - XP : des années déclarées ou un rôle daté.
- **CV hors profil dev** : poste PM, sauf si l'IA a dit DESIGN.
- **Égalité dans la comparaison** : « CV et code à égalité. Rare, donc suspect. »
- **Langage principal** (barème 0.1.1) : chaque repo vote pour son langage principal avec un poids de 1 + ln(1 + activité), les octets départagent les égalités, les langages de balisage ne comptent qu'à défaut. Un seul repo énorme ne peut plus l'emporter : le repo Lean de gaearon donnait « lean », il donne maintenant « javascript ».
- **Coût GitHub** : environ 45 requêtes par carte, soit environ 200 cartes par heure avec un seul token. Le cache de 24 h est donc indispensable.
