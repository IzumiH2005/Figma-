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
