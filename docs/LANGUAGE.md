# Langage Maquette (`.mq`) — référence

Un fichier `.mq` décrit **tout** un projet : tokens, variables, styles, composants, pages, écrans, interactions, animations.
C'est la source de vérité : l'éditeur visuel le lit et le réécrit, la CLI le rend en PNG ou en vidéo.

```xml
<project name="Mon app" fonts="Inter:400;600;700|Space Grotesk:500;700" modes="light dark">
  <tokens> … </tokens>
  <vars> … </vars>
  <styles> … </styles>
  <keyframes name="…"> … </keyframes>
  <component name="Carte" props="titre='…' actif=false"> <col>…</col> </component>
  <page name="Mobile">
    <screen name="Accueil" device=iphone-16 start statusbar homebar fill=$bg pt=safe px=20 gap=16> … </screen>
  </page>
  <flow name="demo"> start Accueil / wait 800 / click cta … </flow>
</project>
```

## Syntaxe

- Attributs : `clé=valeur`, `clé="avec espaces"`, `clé={expression}`, ou drapeau seul (`row`, `clip`, `start`).
- Les valeurs nues acceptent les parenthèses : `fill=linear(90, #f0f, #0ff)`.
- `$nom` → token (ou variable). `$nom/40` → même couleur à 40 % d'opacité.
- `{expr}` → expression (dans un attribut ou dans du texte : `Bonjour {$prenom}`).
- Commentaires : `<!-- … -->` et `// …` entre les éléments. Ils sont conservés à l'enregistrement (éditeur, `drive --write`), comme les lignes vides, les balises sur plusieurs lignes et les rangées écrites sur une ligne : seules les parties modifiées du source sont réécrites.
- Du texte posé directement dans un conteneur devient un `<text>` implicite.

## Éléments

| Balise | Rôle |
|---|---|
| `screen` | Artboard / écran de prototype. `device=`, `w`/`h`, `h=auto` (hug, pages web), `start`, `statusbar[=dark|light]`, `homebar`, `x`/`y` sur le canvas, `grid="12 100 20"` (colonnes, marge, gouttière) et `baseline=8` pour les grilles de mise en page |
| `frame` `box` | Conteneur ; **sans** `row`/`col`/`grid` c'est une pile superposée (ZStack) |
| `row` `col` `grid` `stack` | Raccourcis de conteneurs auto layout |
| `text` | Texte ; enfants inline : `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<span …>`, `<br/>`, `<icon>`. Sur un texte, `fill`/`color` = couleur du texte, `bg` = fond |
| `icon name=heart` | 2 400 icônes Lucide (`mq icons cœur`) ; `size`, `color`, `stroke=1.5`, `fill=currentColor` |
| `image src=…` | `gen:mountains/3`, `avatar:Nom`, `initials:Nom`, nom d'une image intégrée (`<assets>`), URL, `data:` ; `fit=cover|contain|fill` |
| `rect` `ellipse` | Formes (`size=` pour un carré / cercle) |
| `vector d="M…" view="0 0 24 24"` | Chemin SVG (ou enfants `<path d fill stroke/>`) |
| `input` `textarea` | Champ réellement saisissable en prototype ; `bind=$var`, `placeholder`, `type` |
| `divider` `line` | Séparateur (s'adapte à la direction du parent) ; `color`, `thick` |
| `spacer` | Espace extensible (ou `size=12`) |
| `note` | Post‑it visible uniquement dans l'éditeur (annotations pour l'humain) |
| `<NomComposant …>` | Instance de composant (majuscule) |
| `slot` | Dans un composant : emplacement des enfants de l'instance |

Écrans `device=` :

| Famille | Appareils |
|---|---|
| Apple | `iphone-16`, `iphone-16-pro-max`, `iphone-se`, `iphone-mini`, `ipad`, `ipad-landscape`, `watch` |
| Samsung | `galaxy-s25` (360×780), `galaxy-s25-ultra` (412×891), `galaxy-a56` (412×915), `galaxy-z-flip` (412×1004), `galaxy-z-fold` (704×824, écran déplié), `galaxy-tab-s10`, `galaxy-watch` |
| Google / Android | `pixel-9` (412×915), `pixel-9-pro-xl` (448×998), `android` (générique 412×915) |
| Web et formats | `desktop` (1440×900), `laptop`, `hd`, `tablet`, `mobile-web`, `square`, `story`, `og` |

**Plateforme.** Chaque appareil porte un système (`ios`, `android` ou `web` par défaut) ; `platform=ios|android|web` sur l'écran le force. Il est lisible partout via `$platform` (`if={$platform == 'android'}`, `size={$platform == 'android' ? 48 : 44}`).
- Le chrome suit l'appareil : sur Android, barre d'état One UI (Samsung) ou Pixel, caméra poinçonnée et cadre fin ; `homebar` dessine la poignée de gestes, `homebar=buttons` la navigation à 3 boutons (récents · accueil · retour chez Samsung, ordre inverse sur Pixel). La zone sûre du bas passe alors à 48.
- Le kit s'adapte seul : `NavBar` devient une barre d'app Material (64 dp, flèche ←, titre à gauche ; `large` = titre 28 sous la barre), `TabBar` une barre de navigation à pastille, `Toggle` un interrupteur Material 3 (piste contournée quand il est éteint), `IconButton` passe à 48 dp.
- Le lint applique la cible tactile de la plateforme : 48 sur Android, 44 sur iOS.
- Modèle : `examples/android.mq` (le même écran sur Galaxy S25, Pixel 9 et iPhone 16, et un écran Galaxy S25 Ultra en navigation 3 boutons).

### Images intégrées (`<assets>`)

Les images importées sont redimensionnées (2048 px au plus), converties en **WebP** et intégrées au fichier, qui reste autonome (artifact, CLI, hors ligne) :

```
<assets>
  banniere-ete: data:image/webp;base64,UklGR…
  logo: https://exemple.fr/logo.svg
</assets>
…
<image src=banniere-ete w=360 h=240 radius=16/>      (ou src=asset:banniere-ete)
```

- **Éditeur** : glisser des fichiers sur le canevas (ils tombent dans le conteneur visé), coller (Ctrl+V), ou Assets → Images du projet → importer. L'inspecteur d'image affiche le format, le poids et la taille ; « Remplacer… » change le fichier pour toutes les instances, et « Proportions d'origine » remet le ratio d'origine.
- **CLI** :
  - `mq image add f.mq photo.jpg [--name hero] [--max 2048] [--quality 0.86] [--format webp|png]` affiche le gain et la balise `<image>` à coller ;
  - `mq image list f.mq` liste les images et leur poids ;
  - `mq image rm f.mq hero` retire une image.
- Le SVG reste en SVG (vectoriel) ; la transparence est conservée.

## Layout (auto layout = flexbox/grid)

| Attribut | Effet |
|---|---|
| `row` / `col` / `grid` / `stack` | Mode de layout (ou `layout=row`) |
| `gap=12` · `gap=auto` | Espacement · `auto` = space-between |
| `gapx` `gapy` | Gaps séparés (grid / wrap) |
| `p=16` `p="12 20"` `px` `py` `pt` `pr` `pb` `pl` | Padding ; `pt=safe` / `pb=safe+8` = zones sûres de l'appareil |
| `m` `mx` `my` `mt` `mb` `ml` `mr` | Marges (`mx=auto` pour centrer un conteneur avec `maxw`) |
| `align=start|center|end|stretch|baseline` | Axe secondaire (défaut : `center` en row, `stretch` en col) |
| `justify=start|center|end|between|around|evenly` | Axe principal |
| `center` | align + justify au centre |
| `wrap` `reverse` | Retour à la ligne · ordre inversé |
| `cols=3` · `cols="240 1fr"` · `rows` · `span=2` · `span=all` | Grilles |
| `w` / `h` | nombre, `fill` (remplir), `hug` (ajusté), `50%`, `auto` |
| `minw` `maxw` `minh` `maxh` `aspect=16/9` | Contraintes |
| `grow` `shrink=0` `self=center` `order` `z` | Enfant flex |
| `x` `y` `top` `right` `bottom` `left` `inset` | Position absolue (contraintes) ; `x=center` |
| `place=bottom-right` | Placement dans un `stack`, ou absolu si combiné à `absolute` / `fixed` |
| `fixed` | Enfant d'écran qui ne défile pas (tab bar, header flottant, FAB) |
| `scroll=y|x|both` · `snap` + `snap=item` | Défilement · carrousel à aimantation |
| `clip` | Rogner le contenu |

## Guides, contraintes, rangement

- **Layout guides** sur un écran ou une frame : `guides="cols 12 margin=32 gutter=24 | rows 8 top size=48 gutter=16 offset=24 | grid 8"`.
  - Pour `cols`, l'alignement est `stretch` (par défaut, avec marge et gouttière), `left`, `center` ou `right` (taille fixe `size=` et décalage `offset=`). Pour `rows`, c'est `top`, `center` ou `bottom`.
  - `grid N` affiche une grille uniforme.
  - Dans l'éditeur, Maj+G affiche les guides et les objets déplacés s'y accrochent. `mq render --guides` les dessine sur le PNG.
- **Contraintes** (enfant positionné dans une stack) :
  - Gauche : `x=24` ;
  - Droite : `right=24` ;
  - Gauche et droite : `left=24 right=24`, sans `w` ;
  - Centre : `x="center 20"` (distance au centre) ;
  - Échelle : `x=25% w=50%`.
  Même chose en vertical avec `y`, `bottom`, `top`+`bottom`, `y="center 0"` et les pourcentages. L'éditeur règle tout ça depuis le panneau Aligner › Contraintes.
- **Tidy up** (Ctrl+Alt+T, ou le bouton grille d'Aligner) : détecte les rangées et range la sélection avec un espacement régulier (la médiane des écarts actuels, arrondie à 4). Le champ « Espacement » impose un écart précis.

## Apparence

| Attribut | Valeurs |
|---|---|
| `fill` (`bg`) | couleur · `$token` · `linear(90, #a, #b 60, #c)` · `radial(at 30% 20%, …)` · `conic(…)` · `mesh(c1,c2,c3,c4)` · `aurora(…)` (animé) · `noise(.1)` · `dots(color,size,gap)` · `grid(color,size)` · `stripes(color,w,angle)` · `image(src)` — superposer avec ` + ` |
| `color` | Couleur du texte (hérite) — un dégradé donne un texte dégradé |
| `stroke` | `"1 $border"`, `"2 #000 outside dashed"` ; `stroke-t|b|l|r` pour un seul côté |
| `radius` | `12`, `full`, `"16 16 0 0"` |
| `shadow` | élévations `e1…e5`, recettes `soft raised layered contact brutal inner inner-light`, `xs…2xl`, `tinted(#couleur, 30)` (ombre de la couleur du bouton), `halo(couleur, 40)` (élévation sur fond sombre), `glow(#f0f, 30)`, ou `"0 8 24 rgba(0,0,0,.2)"` ; combiner avec ` + ` |
| `opacity` `blur` `bgblur` `blend` `grayscale` `brightness` `saturate` `hue` | Effets |
| `rotate` `scale` `dx` `dy` `rotx` `roty` `perspective` `flipx` `origin` | Transformations |
| `css="…"` | Échappatoire : CSS brut |

## Typographie (hérite comme en CSS)

Polices variables et OpenType :
- `fonts="Roboto Flex:opsz,wdth,wght@8..144,25..151,100..1000"` charge les plages d'axes ;
- `axes="wght 650, wdth 90, opsz 32"` règle les axes de la police variable ;
- `features="tnum ss01 frac smcp zero -liga"` active les fonctions OpenType (`-` désactive).


`font` (famille ou `$token`, `mono`, `serif`), `size`, `weight` (`400` ou `semibold`…), `lh` (≤4 = multiplicateur), `ls` (px ou `%`), `align` (sur un texte) / `talign`, `upper` `lower` `caps` `italic` `underline` `strike` `tabular` `nowrap` `balance` `truncate` `lines=2`.

## Tokens, modes, styles, fondations

```xml
<project modes="light dark">
<tokens>
  bg: #FFFFFF | #0E0E12        // une valeur par mode
  primary: #5B5BF7
  link: $primary               // référence
  radius: 14
</tokens>
<styles>
  .card { fill=$surface radius=20 p=16 col gap=8 }
  .title { size=22 weight=700 md:size=32 }
</styles>
```

- `primary: ramp(#0F7B6C)` génère `$primary-50 … $primary-950` (rampe OKLCH ; la couleur de base garde sa place) ; `gray: neutrals($primary, 0.012)` génère des gris teintés.
- Fonctions de couleur utilisables partout (valeurs et tokens) : `tint(c, 20)`, `shade(c, 30)`, `mix(a, b, 50)`, `alpha(c, 40)`. Dans une expression `{…}`, en plus : `onColor(fond)` renvoie le texte (blanc ou quasi noir) le plus lisible, `dollar('nom')` lit un token par son nom.
- `<project typescale=ui|ios|material|web|tailwind>` crée les classes `t-display t-h1 … t-body t-caption` (tailles, interlignes, graisses de l'échelle choisie). Le lint compare toutes les tailles à cette échelle.
- `class="card title"` applique des styles (les attributs de l'élément gagnent).
- Préfixes conditionnels : `dark:fill=…` (mode), `md:cols=3` (largeur d'écran ≥ sm 640 / md 768 / lg 1024 / xl 1280), `hover:` `press:` `focus:` (états interactifs, avec transition auto).
- Le kit fournit des tokens par défaut (`primary on-primary primary-soft bg surface surface-2 text muted border danger success warning radius`) ; le projet peut les redéfinir.

## Vecteurs, formes et 3D

Tout ce qui se dessine dans Figma (formes, plume, booléens, texte sur chemin) existe en texte, et reste éditable à la souris.

```xml
<!-- formes paramétriques (rig) : chaque paramètre est un attribut, et une poignée orange sur le canvas -->
<shape kind=star points=6 inner=0.5 radius=4 w=120 h=120 fill=$primary/>
<shape kind=squircle n=5 w=96 h=96 fill={linear(135, $brand-300, $brand-600)}/>
<shape kind=ellipse start=-90 sweep=270 ratio=0.7 w=80 h=80 fill=$accent/>   <!-- arc / jauge / donut -->
<shape kind=blob seed=7 wobble=0.3 w=200 h=180 fill=alpha($primary,20) morph="blob seed=12" loop="morph 3s"/>
```

| `kind` | paramètres (défaut) |
|---|---|
| `rect` | `radius` (0, ou « 8 8 0 0 »), `smoothing` (0–1, coins continus iOS) |
| `squircle` | `n` (4.5) |
| `ellipse` | `start`, `sweep` (360), `ratio` (trou intérieur 0–1) |
| `ring` | `ratio` (0.6), `start`, `sweep` |
| `polygon` | `sides` (6), `radius`, `rotate` (-90) |
| `triangle` · `chevron` · `cross` · `arrow` | `radius` ; `thickness` ; `head`/`shaft` |
| `star` · `burst` | `points`, `inner`/`depth`, `radius` |
| `heart` · `line` · `spiral` (`turns`) · `wave` (`waves`, `amp`) · `gear` (`teeth`, `depth`, `hole`) · `bubble` (`radius`, `tail`) · `blob` (`seed`, `points`, `wobble`) | |

```xml
<!-- tracé libre : syntaxe SVG `d`, coordonnées locales à la boîte w×h -->
<vector w=120 h=80 d="M0 80C20 0 100 0 120 80" stroke="3 $primary" cap=round end=arrow fill=none/>

<!-- booléens (Figma : Union / Soustraire / Intersection / Exclure) ; enfants positionnés en x/y -->
<boolean op=subtract w=120 h=120 fill=$primary>
  <shape kind=squircle w=120 h=120/>
  <ellipse x=40 y=40 w=40 h=40/>            <!-- contre-forme -->
</boolean>

<!-- texte sur chemin -->
<textpath path="ellipse" w=160 h=160 size=13 ls=4 color=$muted>BADGE · ÉDITION LIMITÉE ·</textpath>
```

- **Contour** : `stroke="2 $primary inside|outside"`, `dash="6 4"`, `cap=round|square`, `join=round|bevel`, `start=`/`end=` `arrow|triangle|circle|square|bar`, `fill-rule=evenodd` pour les contre-formes.
- **Masques** (tout élément) : `mask="star points=6"`, `mask="blob seed=3"`, `mask="fade bottom|edges"`.
- **Arrondir un résultat (métaballes vectorielles)** : `radius=` sur un `<boolean>` (ou un `<path>`/`<vector d=…>`) arrondit les coins **du résultat**, creux compris : les jonctions entre formes deviennent des congés liquides, comme le « corner radius » appliqué à une union dans Figma. `radius=full` donne la goutte maximale, `smoothing=0..1` étire les congés (lissage continu). Les opérandes restent éditables : double-clic (ou ⌘/Ctrl-clic) dans le booléen pour en saisir une, glisser pour la déplacer : le résultat se recalcule en direct et la boîte du booléen suit son contour. Les opérandes pilotés par une expression (`x={$fused ? 230 : 290}`) deviennent littéraux là où on les lâche. `grain=` suit le contour, pas la boîte. Smart animate interpole positions des opérandes **et** rayon (`toggle $fused smart 600 hard`). Inspecteur : champs « Arrondi des coins » / « Lissage » + préréglages Net · Doux 24 · Goutte 80 · Métaballe. Exemple : `examples/cluster.mq`.
  ```xml
  <boolean name=cluster op=union radius=140 smoothing=0.4 w=680 h=640 fill=$blob grain=0.16>
    <ellipse name=sun y=20 w=320 h=320/>
    <rect name=slab x=230 y=70 w=300 h=260/>
    <ellipse name=drop x=430 y=400 w=220 h=220/>
  </boolean>
  ```
- **Sélectionner les calques correspondants** (menu contextuel) : même type, remplissage, contour, classe, taille, rayon dans la même maquette, comme dans Figma.
- **Fusion de formes** : `goo=10` sur un conteneur fond les enfants qui se touchent (métaballes ; à animer pour un effet liquide).
- **Morphing** : `morph="heart"` (forme cible) + `loop="morph 2s"`, ou deux écrans dont un vecteur nommé change de `d` (smart animate interpole le tracé).
- **Modificateurs de tracé (non destructifs)** :
  - `offset=10` grossit et `offset=-6` rétrécit la forme, avec des jonctions arrondies. `offset-smooth` lisse le résultat. Figma n'a pas cette fonction en natif.
  - `width-profile=taper|taper-start|taper-end|brush|ink|calligraphy|bulge|wedge|marker`, ou des points `"0:0.1 0.3:1 1:0.2"`, donne une épaisseur variable au contour (`stroke="14 $ink"`).
  - `brush="scatter star size=12 spacing=18 jitter=0.3 scale=0.6..1.2 rotate=follow|random|30"` est un pinceau scatter : la forme est répétée le long du tracé.
  - Ces modificateurs se combinent. « Figer les modificateurs » les transforme en vecteurs simples.
- **Vectoriser le contour** (Outline Stroke, Ctrl+Alt+O) : transforme un contour en forme pleine (centré, intérieur ou extérieur, profils et pinceaux compris). Si la forme a un remplissage, il est conservé à part.
- **Shape Builder** (Maj+M sur des formes qui se chevauchent) : la sélection est découpée en régions. Glisser sur des régions les fusionne, Alt+clic en retire une, Entrée applique et produit des vecteurs éditables.
- **Motifs** (Pattern fill) : `fill="pattern(star, 10, 8, #7C5CFF, grid, 15) + #EDE9FF"`. Les arguments sont : forme (toute forme paramétrique, ou `icon:nom`), taille, espacement, couleur, pavage (`grid | brick | brick-v | half-drop`), rotation.
- **Répétitions** (Figma Draw : Repeat) :
  - `clone="radial 12 r=60"` (`angle=120 start=-60` pour un éventail) ;
  - `clone="linear 6 dx=24 dy=0 rotate=8 scale=0.9 opacity=0.85"` : progression à chaque copie ;
  - `clone="grid 4 3 gap=12"`.
  L'élément garde sa place dans la mise en page.
- **Effets** :
  - `grain=0.15` : bruit ;
  - `texture=3` : bords irréguliers, effet fait main (`seed=`) ;
  - `glass` ou `glass="frost=14 refraction=6 tint=… light=-45"` : verre dépoli, réfraction et reflet ;
  - `pblur="18 bottom"` : flou d'arrière-plan progressif.
- **Filtres non destructifs** (Figma : effets d'image, plugins Halftone, Dither, Glass…) : `fx="effet k=v …; effet2 …"` empile des filtres SVG sur n'importe quel calque (image, texte, groupe, vecteur). L'ordre compte, de gauche à droite.

  | Effet | Paramètres principaux |
  |---|---|
  | `adjust` | `exposure` (stops), `contrast brightness highlights shadows black white gamma temperature tint saturation vibrance hue definition` sur l'échelle Figma −100..100 |
  | `preset` | `grayscale · sepia · vintage · warm · cool · noir · fade · vivid · invert`, `intensity` |
  | `gradmap` / `duotone` | `colors=#000,#f06,#fff offset repeat mirror mix` · `dark light` |
  | `channels` | `r=#f00 g=#0f0 b=#00f` ou `swap=gbr` |
  | `halftone` | `size angle shape=dot\|line\|square\|diamond mode=bw\|dark\|color\|cmyk\|rgb ink paper softness contrast` |
  | `dither` | `mode=bayer\|noise\|threshold levels size mono ink paper` |
  | `pixelate` | `size shape=square\|circle gap` |
  | `hatching` | `style=lines\|waves\|zigzag\|circles\|cross density angle frequency amplitude ink paper` |
  | `outlines` / `edges` | `mode=luma\|inverse\|alpha levels spacing thickness ink paper` · `width color bg gain` |
  | `bloom` / `bokeh` | `threshold intensity radius color` · `radius highlights` |
  | `rgb-split` | `amount angle` |
  | `lens` / `warp` | `distortion cx cy aberration zoom` · `type=sine\|ripple\|twist\|swirl\|bulge\|pinch\|flag\|squeeze cx cy amount frequency angle phase radius` |
  | `refract` | `pattern=lenticular\|zigzag\|waves\|grid\|circular size strength angle frost dispersion` (verre cannelé) |
  | `stretch` / `slice` | `position angle` · `slices shift angle random seed` |
  | `metal` | `rounding depth roughness split repeats angle colors` (chrome) |
  | autres | `gooey vignette posterize invert threshold sharpen emboss noise` |

  Alias : `dots`, `mosaic`, `glow`, `chromatic`, `chrome`, `gradient-map`, `contour`… Exemple : `fx="adjust contrast=20; halftone size=6 mode=cmyk; noise amount=0.08"`.
- **Remplissages shader** (Figma Config 2026 : shader fills) : `shader="type k=v …"` peint un fond WebGL2 animable sous le contenu, découpé par `radius` et par le contour des vecteurs. Types : `mesh` (`warp cols grain`), `clouds` (`coverage softness layers drift`), `noise` (`type=value|perlin|voronoi layers contrast warp`), `wave` (`amplitude frequency thickness glow lines`), `caustics` (`intensity depth`), `nebula` (`travel stars density`), `moire` (`mode=rings|lines offset sharpness angle`), `concentric` (`cx cy period` en px, `steps twist`), `grid` (`shape=diamond|circle|box|triangle|hex|cross|ring layout=grid|brick|hex size rotate wave gradient`). Communs : `colors=#a,#b,#c scale= speed= phase= seed= opacity= blend=`. `speed=0` fige l'image ; sans WebGL, repli en dégradé.
- **Poignées d'effets** : quand un calque a `fx=` ou `shader=`, des pastilles roses apparaissent sur le canvas (centre de `lens`/`warp`/`vignette`, angle de `halftone`/`hatching`/`refract`/`metal`, taille de trame, position de `stretch`, centre/échelle/décalage des shaders). La souris les glisse ; le pilote aussi : `drive f.mq -e "select photo; rigs; drag rig halftone.angle by 30 0"`. L'inspecteur a une section **Effets avancés** : pile éditable (paramètres, réordonner, retirer, `+param`), ajout depuis la liste, presets (Risographie, Néon, Gravure, Rétro 1-bit, Verre cannelé, Chrome, Film) et réglages du shader.
- **Groupes de masque** (Figma : Use as mask, Ctrl+Alt+M) : `<stack mask=first mask-type=alpha|vector|luminance>`. Le premier enfant masque les suivants. Un dégradé dans le masque alpha donne un fondu. En luminance, ce sont les zones claires qui révèlent.
- **Pseudo-3D** : `tilt="20 -12"` (rotateX rotateY [rotateZ]), `perspective=900`, `skew="8 0"`, `depth=8` (extrusion de la vraie silhouette, `depth-color`, `depth-dir="1 1"`), `tilt=pointer` (suit le pointeur).

**Dans l'éditeur** : outil Formes (S) avec un menu de 15 formes, Plume (P : clic = angle, glisser = courbe, clic sur le premier point = fermer), Crayon (Maj+P : tracé lissé automatiquement). Double-clic ou Entrée sur une forme = édition des points (glisser un point ou une poignée, Alt casse la symétrie, clic sur le tracé ajoute un point, double-clic bascule angle/courbe, Suppr retire). Les losanges orange sont les poignées de rig (branches d'étoile, arc, rayon…). Sélection multiple → Union / Soustraire / Intersection / Exclure ; Ctrl+E aplatit en vecteur. Panneaux Forme, Tracé (Lisser, Simplifier, Miroirs), 3D (presets Carte posée / Isométrique / Relief) et Masque & fusion.

## Tailwind et composants shadcn/ui

**Classes Tailwind** : n'importe quel élément accepte `tw="…"` (Tailwind v4, 1 unité = 4 px). Les attributs explicites restent prioritaires.
```xml
<row tw="items-center gap-2 px-4 h-9 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 dark:bg-input/30">…</row>
```
Couleurs sémantiques → tokens `$sh-*` (background, foreground, primary, muted, accent, destructive, border, input, ring, card, popover, chart-1…5, sidebar-*), opacité `/90`, rayons `rounded-sm|md|lg|xl` dérivés de `$sh-radius`, états `hover:` `focus-visible:` `active:`, `dark:` (mode nommé *dark*), breakpoints `sm: md: lg:`. Les classes de comportement (transition, ring, animate, sélecteurs arbitraires) sont ignorées.

**Importer shadcn/ui** (registre officiel, licence MIT conservée) : les composants sont téléchargés, convertis et ajoutés au projet sous `ui.*`.
```bash
mq shadcn list                                   # les 61 composants du registre
mq shadcn add button card dialog --into app.mq   # + dépendances du registre + thème (tokens sh-*)
mq shadcn add all --into app.mq --theme zinc     # tout le registre (≈ 330 composants)
mq shadcn theme globals.css --into app.mq        # ton propre thème (:root / .dark, oklch ou HSL)
```
Dans l'éditeur : Assets › shadcn/ui › Importer (en ligne), ou colle le JSON d'un élément du registre / un `.tsx` (hors ligne, dans l'artifact).

Conversion : `cva` → props (`variant`, `size`…) avec leurs valeurs par défaut ; `data-[state=…]:` → prop `state` (repos : `unchecked`, `closed`, `inactive`) ; `data-[k]:`, `disabled:`, `aria-invalid:` → props `k`, `disabled`, `invalid` ; `{children}` → `<slot/>` ; icônes lucide → `<icon>` ; `className` → prop `className` (classes Tailwind ajoutées à la racine). La composition se lit comme en React :
```xml
<ui.Card className="w-96">
  <ui.CardHeader><ui.CardTitle>Créer un projet</ui.CardTitle><ui.CardDescription>En un clic.</ui.CardDescription></ui.CardHeader>
  <ui.CardContent><ui.Label>Nom</ui.Label><ui.Input placeholder="Mon projet"/></ui.CardContent>
  <ui.CardFooter className="justify-between"><ui.Button variant=outline>Annuler</ui.Button><ui.Button>Déployer</ui.Button></ui.CardFooter>
</ui.Card>
<ui.Switch state=checked/>  <ui.TabsTrigger state=active>Compte</ui.TabsTrigger>
```
Les tokens acceptent des **modes nommés** (`sh-primary: light: #171717 | dark: #E5E5E5`) indépendants de l'ordre des modes du projet, et les couleurs `oklch()` / `hsl()`.

## Design system (`<system>`)

```xml
<system brand=#0F766E accent=#F97316 neutral=warm radius=round density=comfortable elevation=soft motion=calm type="Inter/Fraunces" scale=major-third/>
```

Une ligne génère un design system complet en trois niveaux (primitives → sémantique → composant, comme les collections de variables de Figma). Les choix « perceptifs » sont la personnalité de la marque :
- `neutral` : `tinted | pure | warm | cool | olive` ;
- `radius` : `soft | sharp | round | pill | <n>` ;
- `density` : `compact | comfortable | spacious` ;
- `elevation` : `soft | flat | deep` ;
- `motion` : `calm | snappy | playful` ;
- `type` : polices « texte/titres » ;
- `scale` : `minor-third | major-third | perfect-fourth | golden` ou un ratio.

Ce qui est généré :
- **Primitives** : rampes OKLCH `brand-50…950`, `accent-*`, `gray-*` (neutres), `success-* warning-* danger-* info-*`.
- **Sémantique**, par mode `light` / `dark` :
  - surfaces `bg surface surface-2 surface-3`, textes `text muted subtle`, lignes `border divider` ;
  - pour chaque rôle (`primary accent success warning danger info`) : le rôle, `on-<rôle>`, `<rôle>-hover`, `<rôle>-soft`, `<rôle>-text` ;
  - `focus` et `shadow-1…4`.

  Chaque teinte est choisie pour **passer AA** (texte ≥ 4,5:1 sur ses surfaces, `on-primary` sur `primary`, UI ≥ 3:1). En sombre, les rôles s'éclaircissent et l'élévation vient de surfaces plus claires.
- **Échelles** : `space-1…10`, `radius-sm|md|lg|xl|full`, `text-xs…5xl`, `font-sans|display|mono`, `dur-fast|base|slow`, `ease-standard|enter|exit`, `spring`.
- **Composant** : `button-h-sm|md|lg button-radius button-px input-h input-radius card-radius card-pad chip-radius dialog-radius`.
- **Alias shadcn** (`sh-*`) : les composants `ui.*` importés suivent le système.

Le kit (Button, Field, Card, Chip, Dialog…) et tes composants lisent ces noms : changer `brand` ou `radius` rethème tout. Les `<tokens>` du projet restent prioritaires sur le système.

Ligne de commande :
- `mq ds f.mq` : résumé et contrôles de contraste ;
- `--init "brand=#hex radius=soft"` : crée le `<system>` ;
- `--export dtcg|css|tailwind -o …` : W3C DTCG 2025.10 avec alias `{color.brand.600}` et modes en `$extensions`, variables CSS `[data-theme=dark]`, config Tailwind ;
- `--import tokens.json` : DTCG vers `<tokens>` ;
- `--guide -o guide.png [--write]` : page de style générée avec les vrais composants.

Éditeur : panneau **Tokens › Design system** (marque, accent, neutres, formes, densité, élévation, motion, échelle, polices ; contrôles AA en direct ; **Page de style** ; exports).

## Bibliothèques (`library`, `<use lib>`)

Une bibliothèque est un fichier `.mq` marqué `library`. Elle regroupe :
- des composants, rangés en dossiers avec `group=` ;
- un design system (`<system>`) et des tokens ;
- des keyframes et des styles.

Elle peut avoir ses propres écrans, par exemple une page « Catalogue » de contrôle. Ces écrans ne sont pas importés dans les projets qui l'utilisent.

```
<project name="Vitrine UI" library>          <!-- examples/vitrine-ui.mq -->
  <system brand=#6D5AE6 radius=round …/>
  <component name=Switch group=Contrôles …>…</component>
</project>

<project name="Mon app">
  <use lib="Vitrine UI"/>                    <!-- composants, système, tokens, keyframes disponibles -->
  <screen …><Switch/></screen>
</project>
```

- **Lié, pas copié.** Modifier la bibliothèque met à jour tous les projets qui l'utilisent.
- **Priorités.** Un composant ou un token défini dans le projet l'emporte sur celui de la bibliothèque (c'est le « détacher »). Un projet sans `<system>` hérite de celui de sa bibliothèque. Une bibliothèque peut elle-même en utiliser une autre.
- **Éditeur** (Assets) :
  - clic droit sur un composant → **Ranger dans un dossier…**, **Publier dans 📚 …** ou **dans une nouvelle bibliothèque…**. Le composant part avec ses sous-composants, ses keyframes et ses tokens propres, puis le projet est lié ;
  - section **Bibliothèques** : créer, lier ou délier, ouvrir, envoyer le design system (**Système → …**) ;
  - les composants liés apparaissent sous « 📚 Nom · dossier » ; clic droit → **Détacher** (copie locale modifiable).
- **CLI** :
  - `mq lib new "Nom" -o libs/nom.mq [--from f.mq --system]` ;
  - `mq lib publish f.mq A,B --to libs/nom.mq [--group Dossier] [--system] [--no-link]` ;
  - `mq lib link f.mq libs/nom.mq`, `mq lib unlink f.mq "Nom"` ;
  - `mq lib list libs/nom.mq`, `mq lib deps f.mq Comp`.

  Les commandes (`render`, `audit`, `video`, `build`, `drive`…) cherchent les bibliothèques dans le dossier du fichier, dans `./libs` et dans `../libs`, par nom de fichier ou par nom de bibliothèque. `build` et `drive` les embarquent dans l'éditeur.

## Composants

```xml
<component name="Tag" props="label='Nouveau' tone=primary" desc="Étiquette. tone: primary|neutral">
  <row h=24 px=10 radius=full fill={tone == 'primary' ? $primary-soft : $surface}>
    <text size=12 weight=600>{label}</text>
  </row>
</component>

<Tag label="Promo" tone=neutral w=fill on:click="go Promo"/>
```

- Les props déclarées vont dans le scope du composant ; les autres attributs de l'instance (`w`, `grow`, `x`, `on:click`, `anim`, `name`…) s'appliquent à sa racine.
- `<slot/>` insère les enfants de l'instance. Un texte seul comme enfant devient `label`.
- **Slots nommés** (les « slots » de Figma) : `<slot name=footer/>` reçoit les enfants de l'instance marqués `slot=footer` ; `<slot/>` reçoit les autres. Les enfants d'un slot sont son contenu par défaut, affiché quand l'instance ne fournit rien :

```xml
<component name=Panel props="title='Titre'">
  <col p=24 gap=16>
    <slot name=header><text weight=600>{title}</text></slot>
    <slot><text color=$muted>Contenu vide</text></slot>
    <slot name=footer/>
  </col>
</component>

<Panel>
  <row slot=header justify=between><text weight=600>Abonnement</text><Tag label=Actif/></row>
  <text>Corps</text>
  <Button slot=footer label=Gérer/>
</Panel>
```
- Variantes = expressions sur les props (`fill={kind == 'ghost' ? …}`) ou `class="btn btn-{kind}"`.
- Kit intégré (`mq kit`) :
  - Actions : `Button` (kind `primary secondary tonal outline ghost link danger`, size `sm md lg`, `state=hover|pressed|focus|disabled|loading`), `IconButton`, `FAB`.
  - Saisie : `Field` (label, `optional`, `error`, `valid`, `hint`), `SearchBar`, `Select`, `Checkbox`, `Radio`, `Toggle`, `Slider`, `Segmented`.
  - Navigation : `NavBar`, `TabBar`, `Tabs`, `Breadcrumbs`, `Pagination`, `Stepper`, `Dots`.
  - Feedback : `Alert` (tone `info success warning error`), `Toast`, `Snackbar`, `Tooltip`, `Progress`, `Skeleton`, `EmptyState`.
  - Menus et dialogues : `Menu` + `MenuItem` (icône, `shortcut`, `submenu`, `danger`, `selected`, `disabled`), `Dialog`, `ConfirmDialog`, `Sheet`, `Grabber`, `Accordion`.
  - Contenu : `Card`, `ListItem`, `Avatar`, `AvatarGroup`, `Badge`, `Chip`, `Stat`, `Rating`, `Testimonial`, `SocialProof`, `OrDivider`.

**Composants interactifs** (état propre à chaque instance) : dans un composant, `change on={!on}` ou `inc count` / `dec count` modifient la **prop de l'instance**, pas une variable globale. Chaque instance garde son état et le re-rendu passe par smart animate : `<row on:click="change on={!on} smart 320 gentle">`. Dans Figma, les props ne sont pas modifiables par une interaction ; ici elles le sont.

**Rigs** (contrôle à la souris) : `rig:<cible>="<mode> min..max [step=] [from= to=] [in=calque] [group=] [label=]"` transforme un geste en valeur.
- Modes : `x` et `y` (glisser), `angle` (tourner autour du centre ; `from`/`to` en degrés, 0 = haut, sens horaire), `radius` (distance au centre). Un intervalle inversé (`y 100..0`) inverse le sens.
- Cible : une prop du composant (`rig:value=…` sur `<component>`, valable pour toutes les instances), une variable (`rig:$volume=…`) ou n'importe quel attribut d'un nœud (`<shape kind=star rig:points="x 3..12 step=1"/>`).
- `in=track` : la zone de geste est le calque nommé `track` du composant. Deux rigs du même `group=` forment un pad 2D.
- En prototype, on glisse directement sur l'élément ; dans l'éditeur, une poignée verte écrit la valeur dans le code. Une instance peut désactiver un rig hérité avec `rig:value=false`.

```xml
<component name=Knob props="value=0.5 size=120" rig:value="angle 0..1 from=-135 to=135 in=face">
  <stack name=face w={size} h={size} center> … rotate={-135 + value * 270} … </stack>
</component>
```

**Component Studio** (bouton ◇ de la barre du haut, Ctrl+Maj+K, ou clic droit › « Ouvrir dans le Studio ») : l'atelier de composants.
- Playground vivant : largeur et zoom réglables, rigs et interactions actifs, valeurs courantes affichées et « Garder ces valeurs ».
- Contrôles automatiques comme dans Storybook : interrupteur, puces d'enum, liste d'échange, curseur, champ texte.
- Matrice des variantes, à la manière des component sets de Figma : deux axes au choix parmi les enums, les booléens et les props d'échange ; un clic sur une cellule l'essaie.
- Édition des propriétés : Texte, Nombre, Booléen, Variante, Échange d'instance, Slot. Renommer une prop réécrit les expressions, les interactions, les rigs et les instances.
- Rigs, presets d'interaction (bascule, compteur, survol), utilisations, « Insérer » une instance, « Copier dans le projet » pour un composant du kit.
- Le panneau de droite de l'éditeur propose aussi une section **Rig** sur tout calque : props, position, taille, rotation, paramètres de forme, variables.

**Recettes de motion** pour les composants : `motion="press lift appear"` sur la racine (ou sur une instance) se déplie en états et animations réglés selon `docs/MOTION-RULES.md`. Les attributs écrits à la main restent prioritaires.
- `press` : press:scale 0.97.
- `lift` : ombre douce et +1,5 % au survol.
- `sink` : la carte s'enfonce.
- `glow` : focus doux.
- `appear` : fade-up amorti.
- `pop` : apparition avec léger rebond.
- `rise` : trajet en arc.
- `cascade` / `cascade-pop` : les enfants entrent décalés.
- `breathe` / `attention` : une seule boucle visible.

**Anatomie contrôlée par le lint** (dans les écrans comme dans le Studio) :
- écart icône ↔ libellé ≈ la moitié de la taille du texte (`icon-gap`) ;
- icône de 1 à 1,5× le texte (`icon-size`) ;
- padding horizontal d'un bouton ≥ 12–16 px (`button-padding`) ;
- rayon intérieur ≈ rayon extérieur − padding (`nested-radius`) ;
- une surface cliquable réagit au survol ou à l'appui (`no-feedback`) ;
- en plus des règles de contraste, de cibles tactiles et de grille.

Dans le Studio, la section **Hygiène & motion** audite chaque combinaison de props (score et défauts par variante, un clic l'essaie) et active les recettes de motion. **Fiche technique** : `mq spec f.mq Button --props 'label="Envoyer" icon=send' -o spec.png` rend la redline du composant (paddings, écarts, taille, rayon, anatomie numérotée, tokens utilisés).

**Instance swap** : `<instance of={done ? 'Badge' : 'Chip'} label="…"/>` affiche le composant nommé avec les mêmes props. Une prop déclarée `icon: swap(IconButton|FAB)` dans `desc` (ou dont la valeur par défaut est le nom d'un composant) propose une liste de remplacement, avec ses valeurs préférées en tête. Clic droit sur une instance › « Remplacer l'instance… ».

## Plugins intégrés

Les plugins Figma les plus utilisés existent ici en natif :
- **Contenu réaliste** (Content Reel) : `{fake('name', 3)}`. Les types sont `name first last initials email username phone company job city address product price amount number percent rating date time ago word title tag sentence paragraph color avatar image`. La graine rend le résultat stable. `{fakeList(5, 'name,job,avatar', 7)}` produit 5 fiches pour un `each`. Dans l'éditeur : clic droit › Contenu réaliste, qui remplit les textes sélectionnés.
- **Ombre douce** (Smooth Shadow) : `shadow="smooth(14)"`, avec l'élévation, puis en option la couleur et l'intensité (`smooth(20, rgba(91,91,247,1), .25)`). Cinq couches progressives remplacent une ombre dure.
- **Connecteurs** (Autoflow) : `<connector from=a to=b curve=curve|elbow|straight end=arrow|dot|none start=… label="…" color= width= dash="4 4" flow reveal/>` relie deux calques nommés de l'écran, en se recalculant d'après leur position. `flow` anime le pointillé, `reveal` dessine le trait.
- **Graphiques** (Chart) : `<chart type=bar|line|area|spark|donut|pie data={[…]} labels="a,b,c" colors="$primary,$accent" w h reveal dots center="45 %"/>`. Une série multiple s'écrit `data={[[…],[…]]}`. Avec `reveal`, les barres poussent en cascade avec un léger dépassement, la courbe se trace, les points rebondissent.
- **Renommer en lot** (Rename It) : Ctrl+R, motifs `carte-$n`, `$nn`, `$name`, `$tag`, `$text`. **Rechercher et remplacer** : Ctrl+F, dans les textes et les noms de calques de la page.

## Données, boucles, conditions

```xml
<vars>
  tab: 0
  panier: []
  produits: [{"id":1,"nom":"Lampe","prix":49}, {"id":2,"nom":"Vase","prix":29}]
</vars>

<col each={$produits} as=p gap=4> <text>{p.nom} — {money(p.prix)}</text> </col>
<frame repeat=5 w=8 h=8 fill={i == $tab ? $primary : $border}/>
<text if={len($panier) == 0}>Panier vide</text>
```

Dans une boucle : `item` (ou `as=`), `i`, `first`, `last`.
Expressions : littéraux, tableaux/objets, `+ - * / %`, comparaisons, `&& || ! ?? ? :`, accès `a.b` / `a[0]`.
Fonctions : `len min max round floor ceil abs clamp fixed money(n,'€') percent pad upper lower str num replace split trim join includes push without toggleIn sum slice filter find map first last range pick(i, a, b, c) date(offset) now()`.

## Prototype : interactions

```xml
<Button label="Payer" on:click="if len($panier) > 0 then go Paiement push else play panier shake"/>
<row on:swipe-left="inc $slide" on:swipe-right="dec $slide"/>
<screen on:after-2000="go Accueil dissolve 600"> …
```

**Déclencheurs** : `on:click` `on:dblclick` / `on:doubletap` `on:press` `on:release` `on:longpress` `on:enter` `on:leave` `on:swipe-left|right|up|down` `on:load` `on:after-1500` `on:key-Enter` (n'importe quelle touche) `on:change` (input, `value` dans le scope) `on:submit`, plus les gestes continus ci-dessous.

### Gestes (doigt et souris)

Tout se manipule au doigt **et** à la souris (Pointer Events), avec un seuil de 6 px et un verrouillage d'axe : un drag horizontal laisse défiler la page verticalement.

```xml
<!-- manipulation directe : l'élément suit le doigt, puis se pose sur un aimant -->
<row drag=x bounds="-104..0" snap="0, -104" drag-index=open>…</row>              <!-- ligne balayable -->
<col drag=y snap="0, -360" drag-progress=$sheet>…</col>                           <!-- tiroir lié à une variable -->
<row w={count * 100 + '%'} drag=x snap=page drag-index=page><slot/></row>         <!-- carrousel -->
<frame drag=xy bounds=parent elastic=0.5 release="spring(400, 28)"/>             <!-- objet libre -->

<!-- gestes qui pilotent une valeur -->
<stack on:scrub="change value={px}">…</stack>          <!-- curseur : px, py ∈ 0..1 sous le doigt, dès l'appui -->
<stack on:hold="inc $qty">…</stack>                    <!-- maintien : répète (400 ms, puis de plus en plus vite) -->
<frame on:pan="set $x = {$x + dx}"/>                   <!-- dx, dy depuis le dernier évènement ; vx, vy en px/ms -->
<image on:pinch="set $zoom = {$zoom * scale}" on:rotate="set $a = {$a + angle}"/>   <!-- deux doigts ; ctrl/⌘ + molette, maj + molette -->
<frame on:wheel="set $y = {$y + dy}"/>
```

| Attribut | Rôle |
|---|---|
| `drag=x\|y\|xy` | Rend l'élément manipulable (translation, sans relayout). |
| `bounds="lo..hi"` · `bounds="x=-50..50 y=0..200"` · `bounds=parent` | Limites. Au-delà, résistance élastique (`elastic=0.35` par défaut, `0` = mur). |
| `snap="0, -104"` · `snap=page` · `snap="x=0,100 y=0"` | Aimants. À la fin du geste, la position est **projetée** selon la vitesse (`momentum=0.99`, `momentum=false` pour couper), puis va à l'aimant le plus proche. Un « flick » franc atteint toujours l'aimant voisin. `page` = multiples de la largeur (hauteur) du parent. |
| `release="spring(320, 30)"` | Ressort de pose (raideur, amortissement). Il part de la vitesse du doigt, sans à-coup. |
| `drag-index=prop` · `drag-index=$var` | Écrit le n° de l'aimant atteint, et inversement : changer la prop ou la variable (`change page=2`, `set $tab = 1`) y anime l'élément. |
| `drag-progress=$var` | Liaison continue 0..1 entre le premier et le dernier aimant (ou les limites). Tout ce qui dépend de `$var` suit le doigt en direct (fond assombri, échelle, opacité). |

**Évènements de drag** : `on:drag-start`, `on:drag` (continu), `on:drag-end`, `on:drag-rest`. Ils reçoivent `x y dx dy vx vy progress index`.
**Évènements de geste** : `on:swipe-*` (≥ 40 px, ou ≥ 12 px à ≥ 0,3 px/ms), `on:pan-start` / `on:pan` / `on:pan-end`, `on:scrub` / `on:scrub-end`, `on:hold`, `on:pinch` / `on:rotate` / `on:pinch-end` (`scale`, `angle`), `on:wheel` (`dx`, `dy`).
**Kit** : `Slider` (scrub), `SwipeRow` (balayer pour révéler une action, ou appui long), `Carousel` (paginé, points cliquables).
**Accessibilité** : chaque geste doit avoir une alternative au simple appui (bouton, points, appui long) : WCAG 2.5.1 et 2.5.7, lint `gesture-alt`.
**Flows** : `drag "clé" by dx dy [ms]` rejoue un geste continu (lâché en mouvement, donc avec élan).

**Actions** (séparées par `;`) :

| Action | Exemple |
|---|---|
| `go Écran [transition] [ms] [easing]` | `go Détail smart 450 spring` |
| `back [transition]` | retour (transition inverse automatique) |
| `overlay Nom [center|bottom|top|left|right] [dim=.5] [blur=6] [noclose]` | ouvre un écran **ou un composant** en overlay |
| `close` · `swap Nom` | fermer / remplacer l'overlay |
| `set $v = expr [smart ms]` · `toggle $v` · `inc $v [n]` · `dec $v` | variables (re-rendu animé en smart par défaut) |
| `change k=v [smart ms easing]` · `inc k` · `dec k` (sans `$`) | dans un composant : modifie la prop de cette instance |
| `if expr then action [else action]` · `if {expr} action` | conditionnelle |
| `scroll clé` · `scroll top` | défilement doux vers un élément nommé |
| `play clé preset` | jouer une animation (ex. `shake` sur erreur) |
| `mode dark` · `mode next` | changer de mode de tokens en direct |
| `wait 300` · `restart` · `url https://…` | divers |

**Transitions** : `instant dissolve smart ios push push-left|right|up|down slide slide-left|right|up|down scale flip`.
**Easings** : `smooth expo cushion snap accelerate spring bouncy snappy gentle wobbly stiff back anticipate in out in-out linear bounce standard emphasized`, `spring(raideur, amortissement)`, `cubic-bezier(…)`.

**Smart animate** : les éléments de même `name` (ou `key`) entre deux états/écrans sont interpolés (position, taille, couleur, rayon, opacité) ; les autres apparaissent/disparaissent en fondu. Fonctionne aussi sur les changements de variables (`set … smart`), ce que Figma ne sait pas faire.

## Motion

| Attribut | Effet |
|---|---|
| `anim="fade-up 500 delay=100 spring"` | Animation d'entrée (à l'apparition de l'écran) |
| `loop="float 3000"` | Animation en boucle |
| `stagger="60 fade-up 450"` | Sur un parent : cascade sur ses enfants |
| `transition=250` | Transition CSS sur tout changement (états, smart) |
| `<keyframes name="x"> 0 { opacity=0 y=20 } 100 { opacity=1 y=0 } </keyframes>` | Animation custom (`opacity x y scale rotate blur fill color radius w h`). Une animation unique qui finit à `opacity=0` (éclat, confettis) garde sa dernière image ; `hold` force ce comportement (`anim="spark 640 hold"`) |

Entrées : `fade fade-up fade-down fade-left fade-right scale-in zoom-in pop land stretch-in slide-up slide-down slide-left slide-right blur-in rotate-in flip-in drop reveal reveal-up reveal-down typewriter grow grow-up count` (`count` anime le nombre du texte de 0 à sa valeur ; `land` = chute, contact, écrasement à volume constant, rebond).
Boucles : `moving-hold pulse breathe spin float bounce shake wiggle heartbeat ping blink sway shimmer orbit`. Accents (avec `play clé …`) : `squish jelly rubber shake wiggle`.

**Modificateurs** (cumulables, détail dans `docs/MOTION-RULES.md`) : `anticipate` / `antic=0.3` (pré‑mouvement opposé), `snap` (anticipation invisible), `overshoot` / `overshoot=0.2` (follow-through), `arc` / `arc=0.5` (trajectoire courbe), `hard` (accent avec rebond) ou `soft` (accent amorti), `dist=40` (amplitude du preset).
**Cascade** : `stagger="60 fade-up 450 from=center drag=1.1"` (`from=start|end|center|edges|random`, `drag` = chaque élément suivant dure ×drag).
**Transitions smart** : `go X smart arc overlap smear` (sans durée explicite, la durée suit la distance parcourue).
`prefers-reduced-motion` est respecté (boucles coupées, entrées et transitions en fondu court).

## Flows (vidéos)

```xml
<flow name="demo">
  start Splash
  caption "Onboarding"
  wait 1200
  click cta            # clé (name/key), texte visible, ou nom de composant
  type email "ada@orbit.fr"
  swipe left
  drag promo by -240 0 200   # geste continu (ms = durée)
  scroll 400
  back
  key Enter
  shot etape.png
</flow>
```

`mq video fichier.mq --flow demo -o demo.mp4` (ou `--gif`). Sans flow : visite automatique des liens `go`.
