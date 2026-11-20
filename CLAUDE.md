# Maquette — guide pour Claude

Maquette est un éditeur d'interfaces façon Figma **conçu pour être piloté par toi**. La source de vérité est un fichier texte `.mq` (référence complète : `docs/LANGUAGE.md`). L'humain l'ouvre dans l'éditeur visuel (`dist/maquette.html`, publié en artifact) ; toi, tu l'écris et tu vérifies ton travail avec la CLI.

## Installation

```bash
npm install          # esbuild + icônes lucide-static
npm run build        # dist/runtime.js + dist/maquette.html (tous les examples/ intégrés)
npm test             # parse/serialize + lint + rendu de chaque exemple
```

Playwright et Chromium sont préinstallés dans l'environnement ; ffmpeg sert pour les vidéos.

## Boucle de travail recommandée

1. **Écrire** le `.mq` (partir d'un exemple de `examples/` ou du squelette de `docs/LANGUAGE.md`).
2. **Vérifier sans pixels** : `node cli/mq.js inspect f.mq -s Écran --depth 4` affiche l'arbre de layout calculé (boîtes `[x,y w×h]`, ⚠ débordements, ▶ zones interactives).
3. **Auditer et corriger** : `node cli/mq.js audit f.mq` donne un score d'hygiène par catégorie. `node cli/mq.js lint f.mq --fix` applique les corrections sûres par patch chirurgical du source (grille 4/8, échelle typo, tokens, `kind=danger`…). `--only contrast,spacing` filtre par règle ou par catégorie. Règles détaillées : `docs/DESIGN-RULES.md`. **Ne livre rien sous 95/100 ou avec une erreur.**
4. **Regarder** : `node cli/mq.js render f.mq -s Écran --frame -o out` (PNG avec cadre d'appareil), ou `board` pour tout le canvas. Lis le PNG avec l'outil Read.
5. **Animer** : `node cli/mq.js motion f.mq -s Écran` lit la motion en texte (timing, spacing en points, transitions) ; `node cli/mq.js video f.mq --flow demo -o out/demo.mp4` (`--gif`, `--slowmo 0.25` pour vérifier anticipation et arcs) ; `anim -s Écran` pour les entrées seules. Principes et syntaxe : `docs/MOTION-RULES.md`.
5 bis. **Sculpter à la souris** (formes, encoches, courbes organiques) : `node cli/mq.js drive f.mq gestes.txt --write [--video s.mp4] [--shots dossier]`, ou en une ligne `-e "zoom barre; edit encoche; anchors"`. Ce pilote envoie à l'éditeur réel des gestes continus, comme une main : vitesse à profil « minimum-jerk », petits arcs, 60 i/s. On peut éditer les points des opérandes d'un booléen, le résultat étant recalculé en direct.
   - `anchors` liste les points en coordonnées locales.
   - `drag anchor 3 to local 96 22`, `drag handle 2.out by -5 0`, `drag rig 0 by 10 0` déplacent les points, les poignées et les rigs.
   - `pen 10,20 60,0>80,0 …` trace à la plume, `pencil x,y x,y … ms=1200` à main levée.
   - `shot f.png calque` fait une capture.
   - `rigs` liste les rigs (éditeur ou prototype) ; `rig value 0.8` glisse la poignée jusqu'à la valeur.
   - `present [Écran]` lance le prototype, puis `click proto "Bluetooth"` ; `rclick`/`menu "…"`, `resize`, `rotate`, `expect nom attr = v`.
   - `studio [Composant]` ouvre le Component Studio : `click ui "Ajouter une propriété"; menu "Booléen"; type "on"; key Enter`, `rig …` sur son playground.
   - `--serve` garde le navigateur ouvert entre deux appels (`mq drive send "…"`).
   Méthode : se fixer des repères (centre, rayon, tangentes), glisser chaque point et chaque poignée vers sa cible, puis regarder la capture et faire une passe de plus. Ne pas taper des `d=` à la main pour une forme organique.
6. **Livrer** : `node cli/mq.js build f.mq -o out/maquette.html`, puis publie ce fichier en artifact ; envoie PNG et MP4 avec SendUserFile.

## Règles de conception utiles

- **S'inspirer, pas recopier.** Apple HIG, Material 3, Carbon, shadcn… sont des sources d'inspiration, pas des gabarits : on n'y prend pas une valeur (« 32 px pour X ») pour la reproduire telle quelle. Chaque interface et chaque composant a son propre caractère : ses proportions, ses rayons, sa densité, sa motion, ses tokens. C'est le sens de créer son design system. Ce qui reste **non négociable** : l'hygiène UI vérifiée par `mq audit` et `mq lint`.
  - la grille de 4/8 ;
  - le contraste AA ;
  - les cibles tactiles ≥ 44 ;
  - les rayons imbriqués, les insets égaux, l'alignement au pixel ;
  - la cohérence des tokens et de l'échelle typographique ;
  - les principes de motion.

- **Design system d'abord** : `<system brand=#hex radius=… density=… motion=…/>` génère primitives, rôles AA clair/sombre, échelles et tokens de composant ; écris tes composants avec `$primary`, `$surface`, `$card-radius`, `$space-4`, `$shadow-2`, `$dur-base`… pour qu'ils suivent le système. `mq ds f.mq` contrôle, `--guide` montre, `--export dtcg|css|tailwind` livre.
- Fondations d'abord : `primary: ramp(#hex)`, `gray: neutrals($primary)`, `typescale=…` puis `class=t-h1` / `t-body`… plutôt que des tailles libres ; espacements dans 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- Un seul `Button` primaire par vue ; verbes d'action ; `kind=danger` et `ConfirmDialog` pour le destructif ; formulaires avec `Field label=… optional error=…`.
- Motion : décide séparément le timing (durée) et le spacing (courbe) ; jamais de `linear` pour un déplacement ; `anticipate`/`snap` avant une action importante, `hard` (rebond) ou `soft` (amorti) pour l'arrivée, `arc` pour les trajets longs, cascades décalées (`stagger … drag=1.1`), une seule boucle visible, l'écran posé en moins de 1,2 s.
- **Pas de liseré par défaut** : sépare par le fond, l'espace ou une ombre. Un contour fin seulement pour un champ, un état, un bouton outline ou une surface sans contraste de fond. Jamais de contour + grande ombre (double bord). Le lint `edge-stroke` le vérifie.
- **Précision au pixel** : un calque absolu ignore le padding du parent (indicateur de segmenté dans une piste interne, curseur d'interrupteur à `x={on ? 24 : 4} y=4`) ; libellé `w=fill` à côté d'un élément fixe ; teste chaque état (libellé long, 0, max) sur un écran de test. Le lint le vérifie (`misaligned`, `inset`, `escape`, `off-center`).
- Composants : écart icône/libellé ≈ ½ taille du texte, padding horizontal ≥ 12–16, rayons imbriqués = R − padding, et `motion="press appear"` pour qu'ils réagissent et apparaissent proprement. Vérifie avec `mq spec f.mq Composant` et l'audit du Studio.
- Pour lire un texte sur une couleur arbitraire : `color={onColor($fond)}`. Pour les variations : `shade($primary, 10)` au survol, `alpha($primary, 12)` pour un fond doux.

- **Bibliothèques** : range les composants réutilisables et le design system dans une bibliothèque (`mq lib publish f.mq A,B --to libs/ui.mq --group Dossier --system`) que les projets lient avec `<use lib="Nom"/>`. Elle reste liée : la modifier met tous ses projets à jour. Modèle : `examples/vitrine-ui.mq` + `component-showcase.mq`.
- Composants : props en `{expr}`, variantes en enum (`desc="kind: a|b"`), échange d'instance (`lead: swap(A|B)` + `<instance of={lead}/>`), slots nommés (`<slot name=footer>défaut</slot>` + `slot=footer`), état d'instance (`change on={!on}`), rigs (`rig:value="angle 0..1 in=face"`). Mets-les au point dans le Component Studio (`drive … -e "studio Nom"`). Modèle : `examples/component-lab.mq`.
- **Gestes** (doigt et souris) : `drag=x|y|xy bounds="-104..0" snap="0, -104"|page drag-index=prop drag-progress=$var` (élastique, élan projeté, ressort parti de la vitesse du doigt) ; `on:scrub="change value={px}"` pour un curseur, `on:hold` (répétition), `on:pan`, `on:pinch` / `on:rotate`, `on:swipe-*`, `on:drag-end`. Kit : `Slider`, `SwipeRow`, `Carousel`. Toujours une alternative au simple appui (lint `gesture-alt`). Flow : `drag "clé" by dx dy ms`. Modèle : `examples/gestures.mq` ; section « Geste » de l'inspecteur Prototype.
- Nomme (`name=`) les éléments qui doivent se transformer entre deux écrans ou deux états : c'est la clé du smart animate.
- Un écran mobile : `device=iphone-16|galaxy-s25|pixel-9 statusbar homebar pt=safe` ; un `NavBar` du kit gère déjà `pt=safe`. **Ne suppose pas l'iPhone** : demande-toi pour quelle plateforme on conçoit. Sur Android, le kit suit `$platform` (barre d'app Material, barre de navigation à pastille, interrupteur M3, cibles 48 dp) et `homebar=buttons` donne la navigation à 3 boutons. Pour un écran sans le kit, branche sur `$platform`. Modèle : `examples/android.mq`.
- Barres fixes : `fixed place=bottom w=fill` (la TabBar du kit gère `pb=safe`) ; ajoute `pb` au contenu pour qu'il ne passe pas dessous.
- Pages web longues : `device=desktop h=auto` ; responsive avec `md:` / `lg:` et un composant partagé entre un écran desktop et un écran `mobile-web`.
- Conteneur centré : `w=fill maxw=1180 mx=auto`.
- Les props passées en `{expr}` gardent leur type ; les valeurs nues numériques deviennent des nombres.
- Préfère les tokens (`$primary`) aux couleurs en dur, et vérifie le contraste avec `lint` (les boutons pleins demandent un `primary` assez foncé pour du texte blanc).
- Les annotations pour l'humain passent par `<note x= y= w=>` au niveau de la page.
- shadcn/ui : `node cli/mq.js shadcn add button card … --into f.mq` importe les vrais composants du registre (`ui.Button variant=outline`, `ui.Card` + `ui.CardHeader`…, états via `state=`), stylés par `tw="…"` (Tailwind) et les tokens `$sh-*`. `mq kit ui.` liste leurs props.
- Métaballes vectorielles (affiches à la Figma) : `<boolean op=union radius=140 smoothing=0.4>` arrondit le résultat, creux compris ; glisser une opérande (`drag node slab by …`) refond la forme en direct ; `toggle $var smart` interpole positions et rayon. Modèle : `examples/cluster.mq`.
- **Mesh gradient** (les points-membrane de Figma) : `fill="meshgrid(#a #b #c, #d #e@55:40 #f, #g #h #i)"`. Dans l'éditeur, chaque point est une pastille à glisser (`drag rig mesh.1,1 by 40 -20`), le double-clic change sa couleur, et les boutons « + Ligne » / « + Colonne » enrichissent la grille. Avec `meshgrid(elastic=0.6, …)`, la membrane suit le pointeur en prototype. Modèle : `examples/membrane.mq`.
- Filtres et shaders : `fx="halftone size=6; gradmap colors=#102,#f06,#fe8"` (pile de filtres non destructifs : adjust, halftone, dither, refract, metal, rgb-split…) et `shader="mesh"` / `caustics` / `grid shape=hex` (fonds WebGL animables). Les pastilles roses se glissent : `drag rig halftone.angle by 30 0`. Liste complète : `docs/LANGUAGE.md` § Vecteurs, formes et 3D.
- Images : `gen:<scène>/<graine>` (`mq scenes`) et `avatar:Nom` fonctionnent hors ligne et dans les artifacts. Une vraie image s'intègre au fichier, convertie en WebP, avec `mq image add f.mq photo.jpg --name hero`, puis `<image src=hero …/>` (bloc `<assets>`).

## Architecture

- `src/core/` : runtime partagé (`window.MQ`) : `parse.js` (langage), `expr.js` (expressions sûres, sans eval), `project.js` (tokens, composants, appareils), `render.js` (nœuds → DOM), `proto.js` (Player : navigation, transitions, smart animate, overlays, variables), `anim.js` (presets, ressorts), `inspect.js` (inspect + lint), `gen.js` (images procédurales), `chrome.js` (barre d'état, cadres d'appareil), `kit.mq` (composants intégrés).
- `src/editor/` : éditeur visuel (canvas, calques, inspecteur Design/Prototype/Motion/Code/Lint, timeline, code bidirectionnel, mode présentation).
- `cli/mq.js` : CLI (Playwright).
- `scripts/build.js` : bundle esbuild, génère `src/core/icons.js` depuis lucide-static.
