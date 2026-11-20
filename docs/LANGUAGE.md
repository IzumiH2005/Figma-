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
- Commentaires : `<!-- … -->` et `// …` entre les éléments.
- Du texte posé directement dans un conteneur devient un `<text>` implicite.

## Éléments

| Balise | Rôle |
|---|---|
| `screen` | Artboard / écran de prototype. `device=`, `w`/`h`, `h=auto` (hug, pages web), `start`, `statusbar[=dark|light]`, `homebar`, `x`/`y` sur le canvas, `grid="12 100 20"` (colonnes, marge, gouttière) et `baseline=8` pour les grilles de mise en page |
| `frame` `box` | Conteneur ; **sans** `row`/`col`/`grid` c'est une pile superposée (ZStack) |
| `row` `col` `grid` `stack` | Raccourcis de conteneurs auto layout |
| `text` | Texte ; enfants inline : `<b>`, `<i>`, `<u>`, `<s>`, `<code>`, `<span …>`, `<br/>`, `<icon>`. Sur un texte, `fill`/`color` = couleur du texte, `bg` = fond |
| `icon name=heart` | 2 400 icônes Lucide (`mq icons cœur`) ; `size`, `color`, `stroke=1.5`, `fill=currentColor` |
| `image src=…` | `gen:mountains/3`, `avatar:Nom`, `initials:Nom`, URL, `data:` ; `fit=cover|contain|fill` |
| `rect` `ellipse` | Formes (`size=` pour un carré / cercle) |
| `vector d="M…" view="0 0 24 24"` | Chemin SVG (ou enfants `<path d fill stroke/>`) |
| `input` `textarea` | Champ réellement saisissable en prototype ; `bind=$var`, `placeholder`, `type` |
| `divider` `line` | Séparateur (s'adapte à la direction du parent) ; `color`, `thick` |
| `spacer` | Espace extensible (ou `size=12`) |
| `note` | Post‑it visible uniquement dans l'éditeur (annotations pour l'humain) |
| `<NomComposant …>` | Instance de composant (majuscule) |
| `slot` | Dans un composant : emplacement des enfants de l'instance |

Écrans `device=` : `iphone-16`, `iphone-16-pro-max`, `iphone-se`, `iphone-mini`, `pixel-9`, `android`, `ipad`, `ipad-landscape`, `watch`, `desktop` (1440×900), `laptop`, `hd`, `tablet`, `mobile-web`, `square`, `story`, `og`.

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
- Variantes = expressions sur les props (`fill={kind == 'ghost' ? …}`) ou `class="btn btn-{kind}"`.
- Kit intégré (`mq kit`) :
  - Actions : `Button` (kind `primary secondary tonal outline ghost link danger`, size `sm md lg`, `state=hover|pressed|focus|disabled|loading`), `IconButton`, `FAB`.
  - Saisie : `Field` (label, `optional`, `error`, `valid`, `hint`), `SearchBar`, `Select`, `Checkbox`, `Radio`, `Toggle`, `Slider`, `Segmented`.
  - Navigation : `NavBar`, `TabBar`, `Tabs`, `Breadcrumbs`, `Pagination`, `Stepper`, `Dots`.
  - Feedback : `Alert` (tone `info success warning error`), `Toast`, `Snackbar`, `Tooltip`, `Progress`, `Skeleton`, `EmptyState`.
  - Menus et dialogues : `Menu` + `MenuItem` (icône, `shortcut`, `submenu`, `danger`, `selected`, `disabled`), `Dialog`, `ConfirmDialog`, `Sheet`, `Grabber`, `Accordion`.
  - Contenu : `Card`, `ListItem`, `Avatar`, `AvatarGroup`, `Badge`, `Chip`, `Stat`, `Rating`, `Testimonial`, `SocialProof`, `OrDivider`.

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

**Déclencheurs** : `on:click` `on:dblclick` `on:press` `on:release` `on:longpress` `on:enter` `on:leave` `on:swipe-left|right|up|down` `on:load` `on:after-1500` `on:key-Enter` (n'importe quelle touche) `on:change` (input, `value` dans le scope) `on:submit`.

**Actions** (séparées par `;`) :

| Action | Exemple |
|---|---|
| `go Écran [transition] [ms] [easing]` | `go Détail smart 450 spring` |
| `back [transition]` | retour (transition inverse automatique) |
| `overlay Nom [center|bottom|top|left|right] [dim=.5] [blur=6] [noclose]` | ouvre un écran **ou un composant** en overlay |
| `close` · `swap Nom` | fermer / remplacer l'overlay |
| `set $v = expr [smart ms]` · `toggle $v` · `inc $v [n]` · `dec $v` | variables (re-rendu animé en smart par défaut) |
| `if expr then action [else action]` | conditionnelle |
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
| `<keyframes name="x"> 0 { opacity=0 y=20 } 100 { opacity=1 y=0 } </keyframes>` | Animation custom (`opacity x y scale rotate blur fill color radius w h`) |

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
  scroll 400
  back
  key Enter
  shot etape.png
</flow>
```

`mq video fichier.mq --flow demo -o demo.mp4` (ou `--gif`). Sans flow : visite automatique des liens `go`.
