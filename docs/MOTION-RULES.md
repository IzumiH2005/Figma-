# Motion — principes d'animation appliqués à l'interface

Sources : *The Illusion of Life* (F. Thomas & O. Johnston, les 12 principes Disney) et *The Animator's Survival Kit* (R. Williams).
Comme pour `DESIGN-RULES.md`, chaque principe est **outillé** : une syntaxe dans le langage, un réglage dans l'éditeur, une vérification du lint (code entre crochets) ou une commande pour le contrôler.

Outils de contrôle :
- `node cli/mq.js motion f.mq -s Écran` : spec textuelle de chaque animation, avec le **timing** (départ, durée) séparé du **spacing** (courbe + graphe de points à intervalles de temps égaux, comme les « charts » de Williams). Liste aussi les transitions de l'écran.
- Éditeur → Timeline : lecture au **ralenti** (0,5× / 0,25× / 0,1×) et **Trajectoires**, qui tracent la position de chaque élément image par image (24 i/s) sur le canvas : on vérifie les arcs et le spacing d'un coup d'œil.
- Présenter → menu **Ralenti** ; `mq video --slowmo 0.25`.
- `mq audit` : catégorie **Motion**.

## Timing et spacing : deux décisions distinctes
| Principe | Dans Maquette |
|---|---|
| Le timing (combien de temps) et le spacing (comment le mouvement se répartit) se décident séparément | Onglet Motion : blocs **Timing** (durée, délai) et **Spacing** (courbe) ; `mq motion` les affiche séparément |
| Slow in / slow out : tout corps accélère au départ et ralentit à l'arrivée ; le linéaire est mécanique | Easings `smooth expo cushion snap in-out`, ressorts `spring bouncy gentle` ; éditeur de Bézier avec graphe de spacing ; `[motion-linear]` ⚙ |
| Le nombre d'images change le sens : vif = assuré ou urgent, lent = hésitant ou posé | `[motion-duration]` : entrées 200–600 ms, ⚙ ramène à 600 ; transitions ≤ 600 ms `[transition-duration]` ⚙ |
| Une grande distance prend plus de temps qu'une petite | Smart animate sans durée explicite : durée calculée selon la distance parcourue (260–620 ms) |
| Ne jamais caler toute une séquence sur le même tempo | `[motion-tempo]` |

## Anticipation
| Principe | Dans Maquette |
|---|---|
| Un mouvement opposé, plus lent, prépare l'action et lui donne du poids | `anim="… anticipate"` (ou `antic=0.3`) : pré‑mouvement opposé au premier geste, lent, puis action |
| Anticipation invisible : 1–2 images opposées sous le seuil de perception donnent du « snap » | `snap` |
| L'intensité de l'anticipation règle la force perçue de l'action | `antic=0.1` (subtil) à `antic=0.4` (appuyé) |

## Follow-through et overlapping action
| Principe | Dans Maquette |
|---|---|
| Rien ne s'arrête d'un bloc : la masse dépasse puis revient | `overshoot` (ou `overshoot=0.2`) |
| **Accent dur** (rebond après le contact, assertif) contre **accent doux** (arrivée amortie, posée) : un choix, pas une intensité | `hard` / `soft` (sélecteur « Accent » de l'onglet Motion) |
| Les parties ne partent pas ensemble : elles se suivent, les plus lourdes traînent | `stagger="60 fade-up 450 drag=1.1 from=center"` (départ `start end center edges random`) ; `[motion-sync]` |
| Une action secondaire est décalée et subordonnée | Cascades décalées ; smart animate `overlap` |
| Une pose tenue ne se fige jamais (moving hold) | `loop="moving-hold"` |

## Arcs, squash & stretch, smear
| Principe | Dans Maquette |
|---|---|
| Le vivant se déplace en arcs ; une ligne droite doit se justifier | `arc` (`arc=0.6` plus prononcé) sur les animations ; `go Écran smart arc` sur les transitions |
| Squash & stretch à **volume constant** (sx · sy ≈ 1), avec une **frame de contact pur** avant l'écrasement | `land` (étirement en chute → contact → écrasement → rebond) ; `squish`, `jelly`, `rubber`, `stretch-in` |
| Un objet rigide ne se déforme pas : son poids se lit dans le spacing | Choisir `fade-down` / `drop` plutôt que `land` pour un élément rigide |
| Smear : sur un geste très rapide, l'image intermédiaire s'étire dans l'axe | Smart animate `smear` (étirement et flou à mi‑parcours des grands sauts) |

## Staging, secondary action, appeal
| Principe | Dans Maquette |
|---|---|
| Un seul point d'attention à la fois ; une action secondaire ne vole jamais la vedette | `[motion-loops]` (> 2 boucles visibles) |
| L'écran doit se poser vite : l'animation sert le contenu | `[motion-settle]` (> 1,6 s), `[motion-step]` (cascade hachée) |
| Vérifier en mouvement, à vitesse réelle et au ralenti, pas sur une image fixe | Ralenti, trajectoires, `mq video` |
| Accessibilité | `prefers-reduced-motion` respecté : boucles coupées, entrées en fondu court, transitions en fondu |

## Exemples de spec
```xml
<FAB anim="land 700 delay=500 anticipate"/>                      <!-- recul, chute, contact, écrasement, rebond -->
<Button anim="fade-up 360 delay=80 snap"/>                       <!-- anticipation invisible : claquant -->
<Card anim="scale-in 420 hard"/>                                 <!-- accent dur : rebond -->
<Toast anim="fade-up 380 soft"/>                                 <!-- accent doux : se pose -->
<row stagger="70 grow-up 520 cushion drag=1.12 from=center"/>    <!-- overlapping action depuis le centre -->
<Avatar loop="moving-hold 3200"/>                                <!-- pose vivante -->
<Button on:click="toggle $open smart arc overlap smear"/>        <!-- changement d'état organique -->
```
Pour écrire un `$` littéral dans une valeur (documentation), utiliser `$$`.
Pour ignorer volontairement une règle sur un écran (page de démonstration) : `<screen lint-ignore="motion-loops">`.

## Auto-keyframe (éditeur)

Timeline › **Auto-keyframe** (bouton rouge, comme dans Figma Motion) : place la tête de lecture, puis déplace, tourne, estompe ou redimensionne l'élément sélectionné. Chaque modification devient une image clé au temps courant, dans un bloc `<keyframes name="<nom>-motion">`, et l'élément reçoit `anim="<nom>-motion <durée>"`. La valeur de base n'est pas modifiée. x/y sont enregistrés en décalages ; rotate, opacity et scale en valeurs absolues. Si tu enregistres au-delà de la durée, elle s'allonge et les images clés existantes sont recalées. Recliquer arrête l'enregistrement.

## Booléens animés (smart animate)

Quand un `<boolean>` garde la même structure d'un état à l'autre, mais qu'un de ses opérandes s'est déplacé (par exemple l'encoche d'une barre d'onglets, `x={84 + $tab * 96}`), le smart animate interpole la position des opérandes et recalcule l'opération à chaque image. L'encoche glisse donc le long de la barre au lieu d'être déformée point par point. Pendant le mouvement, le remplissage est dessiné en SVG direct, sans masque CSS à re-décoder, donc sans clignotement. L'exemple `examples/notch-menu.mq` reproduit un menu à encoche : encoche et pastille synchronisées, icônes fixes en fondu de couleur, `smart 320 gentle`.

## Gestes : la motion prend le relais du doigt

Au lâcher d'un `drag`, aucune durée fixe : un ressort (`release="spring(k, c)"`, 320/30 par défaut) part de la **vitesse du doigt**, ce qui supprime l'à-coup entre geste et animation. Une raideur plus haute donne une pose plus vive ; un amortissement plus bas, un léger dépassement (follow-through). La destination est projetée (`momentum`) : position + v × 0,99 / (1 − 0,99). Pour vérifier : `mq video f.mq --flow demo --slowmo 0.25` avec des `drag "clé" by dx dy ms` courts (≤ 260 ms) pour un flick, longs (≥ 500 ms) pour un glissé lent.
