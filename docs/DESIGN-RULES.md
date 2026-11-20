# Règles d'hygiène UI — ce que Maquette applique et vérifie

Sources : *How to Design Better UI Components 3.0* (A. Kuleszo), WCAG 2.2, Apple HIG, Material 3, Figma « Check designs ».
Chaque règle ci‑dessous est **outillée** : soit le kit l'applique par défaut, soit le lint la vérifie (code entre crochets), souvent avec une correction automatique (⚙).

Commande de référence : `node cli/mq.js audit f.mq` (score), `node cli/mq.js lint f.mq --fix` (corrections chirurgicales dans le source, commentaires conservés).
Dans l'éditeur : onglet **Lint**, avec score, barres par catégorie, marqueurs sur le canvas, « Corriger » et « Tout corriger ».

## 1. Grille et espacement
| Règle | Outil |
|---|---|
| Espacements, paddings et marges en multiples de 8 (4 pour les détails fins) : 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 80 | `[off-grid]` ⚙ arrondit au multiple de 4 le plus proche (attributs **et** classes `<styles>`) |
| Dimensions et rayons pairs, idéalement multiples de 4 | `[off-grid]` ⚙ |
| Marge latérale ≥ 16 px sur mobile | `[edge-margin]` |
| ≥ 8 px entre éléments cliquables (miss‑clicks) | `[crowded]` |
| Rien ne déborde de l'écran | `[bounds]`, `[overflow]` |
| Grilles de colonnes : mobile 4 col / marge 16 / gouttière 8 ; tablette 8/32/16 ; desktop 12/100/20 (contenu 1240) | Grilles affichables (Maj+G, `grid="12 100 20"`, `baseline=8`) |
| Conteneur centré avec largeur max | `w=fill maxw=1240 mx=auto` |
| Proximité : titre↔texte 8–20, groupes 20–40, padding de carte 16–24, 64–96 autour des sections | Valeurs du kit et des exemples |

## 2. Typographie
| Règle | Outil |
|---|---|
| Une échelle, pas des tailles au hasard | `typescale=ui|ios|material|web|tailwind` → classes `t-display … t-caption` ; `[type-scale]` ⚙ ramène à la taille d'échelle la plus proche |
| 5–7 tailles par écran (9 pour une page web) | `[type-count]` |
| Pas de tailles presque identiques (13/14, 15/16) | `[type-scale]` |
| Texte ≥ 11 px ; texte courant 14–17 px sur mobile | `[tiny-text]`, `[body-size]` |
| 45–75 caractères par ligne | `[line-length]` ⚙ ajoute `maxw` |
| Pas de longs textes en capitales | `[caps-long]` |
| Base 16 px, interligne 1,45–1,6 pour le texte | Valeur par défaut du rendu |

## 3. Couleur
| Règle | Outil |
|---|---|
| Une primaire déclinée en tints/shades, des neutres, un accent (60‑30‑10) | `primary: ramp(#hex)` → `$primary-50…950` ; `gray: neutrals($primary)` |
| Jamais de gris ou de noir purs : les teinter avec la primaire | `neutrals()` ; `[pure-color]` ⚙ propose un noir teinté |
| Couleurs système : succès, alerte, erreur, info | Tokens `success warning danger info` du kit + `Alert`, `Badge`, `Toast` |
| Utiliser les tokens plutôt que des valeurs en dur (Check designs) | `[hardcoded]` ⚙ remplace par le token équivalent ; panneau « Couleurs de la sélection » (→ token, + token) |
| Dégradés entre teintes voisines, sans transition boueuse | Interpolation OKLab par défaut ; `[gradient-muddy]` |
| Teintes : `tint(c, 20)`, `shade(c, 30)`, `mix(a, b, 50)`, `alpha(c, 40)`, `onColor(bg)` (texte lisible automatique) | Fonctions de valeur et d'expression |
| Trop de couleurs à l'écran | `[color-count]` |
| Concevoir en niveaux de gris, vérifier le daltonisme | Vue « Simulation de vision » : gris, protanopie, deutéranopie, tritanopie, achromatopsie, flou, faible contraste |

## 4. Accessibilité
| Règle | Outil |
|---|---|
| Contraste texte ≥ 4,5:1 (≥ 3:1 au‑delà de 24 px ou 18,6 px gras), opacités des parents comprises | `[contrast]` (les composants désactivés sont exemptés, comme dans le WCAG) |
| Boutons et champs se distinguent de leur fond (≥ 3:1, sinon contour ou ombre) | `[contrast-ui]` |
| Cibles tactiles 44 × 44 (iOS), 48 × 48 (Android) | `[tap-target]` selon l'appareil |
| Champs avec label visible (pas de placeholder seul) | `[input-label]` ; `Field label=…` |
| Tout geste (drag, balayage, pincer, panoramique) a une alternative au simple appui : bouton, points, appui long (WCAG 2.5.1 / 2.5.7) | `[gesture-alt]` |
| Navigation clavier et focus visibles | Runtime : tout élément cliquable est focusable (Tab, Entrée, Espace) avec anneau de focus |

## 5. Composants et UX
| Règle | Outil |
|---|---|
| Un seul CTA primaire par vue ; secondaire en outline ou ghost, tertiaire en lien souligné | `Button kind=primary|secondary|tonal|outline|ghost|link|danger` ; `[multi-primary]` |
| Hauteurs 40 / 48 / 56, padding horizontal ≈ 2 × vertical, label 14–18 | Tailles du `Button` |
| États distincts mais sobres : hover, pressé, focus, désactivé, chargement | `Button state=…`, `hover:` `press:` `focus:` |
| Libellés verbe + résultat (« Supprimer le fichier », jamais « Cliquez ici » ou « Oui/Non ») | `[vague-label]` |
| Actions destructrices en rouge, avec confirmation | `[destructive]` ⚙ `kind=danger` ; `ConfirmDialog` |
| « (optionnel) » plutôt que l'astérisque | `Field optional` ; `[asterisk]` |
| CTA de formulaire dans la zone du pouce | `[thumb-zone]` |
| Erreurs en ligne avec icône et solution ; validation immédiate | `Field error=… valid` |
| Parcours longs découpés avec indicateur de progression | `Stepper` |
| Plus de 5 options : liste déroulante ; menus avec raccourcis alignés à droite et sous‑menus ▸ | `Select`, `Menu`, `MenuItem shortcut submenu` |
| Modales avec échappatoire (✕, clic extérieur, verbe d'action) | `overlay` (fermeture au clic extérieur par défaut) ; `[overlay-escape]` |
| Cartes voisines alignées en hauteur, texte tronqué proprement | `[card-height]` ⚙ `align=stretch` ; `truncate`, `lines=2` |
| Preuve sociale près des CTA | `SocialProof`, `AvatarGroup`, `Testimonial`, `Rating` |
| États vides utiles (expliquer, proposer l'action) | `EmptyState` |
| Une seule source de lumière pour les ombres | `[shadow-light]` ; recettes `soft raised layered contact brutal tinted() halo() e1…e5` |
| Contenu réel (pas de lorem ipsum) | `[placeholder]` |

## 6. Prototype
| Règle | Outil |
|---|---|
| Aucun lien cassé, aucun écran orphelin | `[broken-link]`, `[unreachable]` |
| Le smart animate exige des calques de même nom | `[smart-keys]` |

## Score
Pénalités : erreur 6, avertissement 2,5, suggestion 0,6, plafonnées par règle. Le score par catégorie s'affiche dans `mq audit` et dans l'onglet Lint. **Objectif avant livraison : ≥ 95 et zéro erreur.**

## Bordures et liserés (`edge-stroke`)

Un contour n'est pas un réflexe décoratif (Refactoring UI : *use fewer borders*). Pour séparer deux zones, essaie dans l'ordre :
1. un fond contrasté ;
2. plus d'espace ;
3. une ombre (élévation).

Garde un contour fin quand il porte une information :
- un champ de saisie, un bouton outline ou ghost (le trait est la forme) ;
- un état (sélectionné, erreur, focus) ;
- une surface plate de même couleur que son parent (sans contraste de fond, le liseré la définit) ;
- un séparateur de tableau.

Le lint signale `edge-stroke` dans deux cas :
- **contour + ombre** : le bord est dessiné deux fois, ce qui donne un aspect délavé, surtout en sombre. Garde l'ombre.
- **liseré clair sur une surface dont le fond la détache déjà** : avertissement à partir de 3 occurrences sur un écran, correction automatique `--fix` (retrait du contour).

En mode sombre, l'élévation vient de surfaces plus claires, pas de liserés. Un fin reflet intérieur (`inset 0 1px rgba(255,255,255,.06)`) se réserve aux surfaces « matière » (verre, cartes premium), avec parcimonie.

## Anatomie des composants

- Écart icône ↔ libellé ≈ la moitié de la taille du texte : 6–8 px pour un texte de 14–16 px (`icon-gap`).
- Icône de 1 à 1,5× la taille du texte (`icon-size`).
- Padding horizontal d'un bouton ≥ 12–16 px, environ deux fois le padding vertical (`button-padding`).
- Rayons imbriqués : rayon intérieur = rayon extérieur − padding (`nested-radius`).
- Toute surface cliquable réagit au survol ou à l'appui (`no-feedback`, sinon `motion=press`).

## Précision au pixel

Un décalage de 1 à 6 px n'est jamais voulu : c'est ce qui fait « amateur ». Quatre règles le traquent sur la géométrie rendue (`spacing`) :

- `misaligned` : une surcouche (indicateur de segmenté, surbrillance, pastille) recouvre presque sa cible sans la recouvrir exactement. Cause typique : un calque absolu se place sur la boîte du parent, **padding ignoré**, et ses `%` se calculent sur cette boîte. Remède : mettre l'indicateur dans un conteneur interne de la taille de la piste (`stack p=4 > stack w=fill h=40 > [indicateur, rangée]`).
- `inset` : un curseur (interrupteur, slider, poignée) centré sur un axe doit garder le même inset à l'extrémité : rail 52×32, curseur 24 → `x={on ? 24 : 4} y=4`.
- `escape` : un calque sort de la carte ou de la surface qui le contient. Un libellé dans une rangée avec un élément fixe prend `w=fill` pour passer à la ligne ; un bloc à contenu variable prend `minh=` plutôt que `h=`.
- `off-center` : un glyphe seul dans un petit contrôle (bouton icône, avatar, badge) décentré de 1 à 4 px. Une correction optique voulue (triangle « lecture ») s'assume sur le calque : `<icon name=play lint-ignore=off-center …/>` (`lint-ignore` accepte aussi une catégorie, ou rien pour tout ignorer sous ce calque).

Méthode pour chaque composant :

1. `mq inspect f.mq -s Écran --depth 12` : lire les boîtes et vérifier les insets.
2. Vérifier chaque état (valeurs extrêmes, libellé long, 0 et max), pas seulement l'état par défaut, sur un écran de test.
3. Rendre au ×2 et regarder.

Valeurs sur la grille de 4 : rail 48 = padding 4 + piste 40 ; anneau 12, écart 8. Rayons imbriqués exacts : 12 → 8 avec 4 de padding.

Repères, pour s'inspirer et non pour recopier :
- **Ce qui ne change pas d'un système à l'autre** : marge constante entre le rail et l'indicateur, rayons imbriqués, cible tactile minimale (44 pt chez Apple, 48 dp chez Material), grille de 4/8.
- **Ce qui appartient à ton système** : les valeurs exactes (hauteur, rayon, épaisseur, densité), au service du caractère du produit. Les règles de lint vérifient des relations (inset égal, R − p, contraste, grille), jamais une taille imposée.

## Plateformes : iOS et Android

On ne conçoit pas « pour téléphone » mais pour une plateforme. Le même produit garde son caractère (tokens, rayons, motion), mais respecte les conventions de navigation que l'utilisateur connaît :

| | iOS (HIG) | Android (Material 3, One UI) |
|---|---|---|
| Cible minimale | 44 pt | 48 dp |
| Barre du haut | titre centré, « ‹ Retour » | titre à gauche, flèche ←, 64 dp |
| Navigation principale | TabBar, icône teintée | barre à pastille (indicateur 64 × 32) |
| Action principale | dans la barre ou en bas | FAB possible, au-dessus de la navigation |
| Bas de l'écran | indicateur d'accueil (34) | poignée de gestes, ou 3 boutons (48) |
| Interrupteur | piste pleine, curseur fixe | piste contournée éteinte, curseur 16 → 24 |

Le kit applique ces différences par `$platform` ; teste chaque écran sur un Galaxy (360 de large, l'écran le plus étroit courant) et sur un iPhone. Samsung représente une grosse part des téléphones Android : `galaxy-s25` est un bon défaut Android, `galaxy-z-fold` vérifie la mise en page large.

## Gestes et manipulation directe

Le contenu suit le doigt, puis se pose de lui-même. Les principes viennent de la conférence WWDC 2018 « Designing Fluid Interfaces » et des guides de gestes de Material et de Compose.

- **Réponse immédiate, 1:1** : sous le doigt, l'élément bouge exactement comme lui, sans délai ni courbe. Les animations n'interviennent qu'au lâcher.
- **Interruptible et redirigeable** : on rattrape un élément en vol. Le ressort repart de la position et de la vitesse courantes.
- **Intention = projection** : la destination dépend d'où le geste *irait* (position + élan), pas de l'endroit où le doigt s'arrête. Un petit flick rapide suffit pour changer de page ou fermer un tiroir.
- **Élasticité aux bords** : au-delà d'une limite, résistance progressive plutôt qu'un mur. On sent la limite sans être bloqué.
- **Seuil et verrouillage d'axe** : 6 px avant de décider. Un drag horizontal n'empêche pas le défilement vertical de la page.
- **Liaison continue** : un tiroir pilote le fond assombri (`drag-progress=$sheet` + `opacity={$sheet * 0.4}`) ; tout ce qui en dépend suit le doigt.
- **Découvrable et accessible** : un indice visuel (poignée, chevron, page suivante qui dépasse, points) et une alternative au simple appui, toujours.
- **Cibles** : la zone saisissable fait au moins 44 px, même si le visuel est fin (piste de slider de 6 px dans une zone de 44).

Choisir le geste : `on:scrub` pour une valeur (curseur, timeline), `drag` + `snap` pour des états discrets (tiroir, ligne, carrousel), `drag` + `bounds` pour un objet libre, `on:hold` pour l'incrément répété, `on:pinch` / `on:rotate` pour le zoom et la rotation, `on:swipe-*` pour une navigation sans suivi visuel.
