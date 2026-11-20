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
3. **Linter** : `node cli/mq.js lint f.mq` (contraste WCAG, zones tactiles < 44 px, textes trop petits ou débordants, liens cassés, écrans inaccessibles, icônes et composants inconnus).
4. **Regarder** : `node cli/mq.js render f.mq -s Écran --frame -o out` (PNG avec cadre d'appareil), ou `board` pour tout le canvas. Lis le PNG avec l'outil Read.
5. **Animer** : `node cli/mq.js video f.mq --flow demo -o out/demo.mp4` (ajoute `--gif` si besoin) ; `anim -s Écran` pour les animations d'entrée seules.
6. **Livrer** : `node cli/mq.js build f.mq -o out/maquette.html`, puis publie ce fichier en artifact ; envoie PNG et MP4 avec SendUserFile.

## Règles de conception utiles

- Nomme (`name=`) les éléments qui doivent se transformer entre deux écrans ou deux états : c'est la clé du smart animate.
- Un écran mobile : `device=iphone-16 statusbar homebar pt=safe` ; un `NavBar` du kit gère déjà `pt=safe`.
- Barres fixes : `fixed place=bottom w=fill` (la TabBar du kit gère `pb=safe`) ; ajoute `pb` au contenu pour qu'il ne passe pas dessous.
- Pages web longues : `device=desktop h=auto` ; responsive avec `md:` / `lg:` et un composant partagé entre un écran desktop et un écran `mobile-web`.
- Conteneur centré : `w=fill maxw=1180 mx=auto`.
- Les props passées en `{expr}` gardent leur type ; les valeurs nues numériques deviennent des nombres.
- Préfère les tokens (`$primary`) aux couleurs en dur, et vérifie le contraste avec `lint` (les boutons pleins demandent un `primary` assez foncé pour du texte blanc).
- Les annotations pour l'humain passent par `<note x= y= w=>` au niveau de la page.
- Images : `gen:<scène>/<graine>` (`mq scenes`) et `avatar:Nom` fonctionnent hors ligne et dans les artifacts.

## Architecture

- `src/core/` : runtime partagé (`window.MQ`) : `parse.js` (langage), `expr.js` (expressions sûres, sans eval), `project.js` (tokens, composants, appareils), `render.js` (nœuds → DOM), `proto.js` (Player : navigation, transitions, smart animate, overlays, variables), `anim.js` (presets, ressorts), `inspect.js` (inspect + lint), `gen.js` (images procédurales), `chrome.js` (barre d'état, cadres d'appareil), `kit.mq` (composants intégrés).
- `src/editor/` : éditeur visuel (canvas, calques, inspecteur Design/Prototype/Motion/Code/Lint, timeline, code bidirectionnel, mode présentation).
- `cli/mq.js` : CLI (Playwright).
- `scripts/build.js` : bundle esbuild, génère `src/core/icons.js` depuis lucide-static.
