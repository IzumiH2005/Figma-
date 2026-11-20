# Maquette

**Un Figma conçu pour être piloté par Claude.** Canvas infini, auto layout, composants et variantes, tokens multi‑modes, prototypage (smart animate, overlays, variables, conditions), motion (timeline, ressorts, cascades), mode présentation. Tout cela repose sur un langage texte (`.mq`) qu'une IA écrit nativement, et l'éditeur visuel reste synchronisé dans les deux sens.

| | Figma | Maquette |
|---|---|---|
| Source | Fichier binaire, API plugin | Texte `.mq` lisible et diffable, édition visuelle ⇄ code en direct |
| Auto layout, grilles, contraintes | ✓ | ✓ (flex/grid réels, breakpoints `md:` `lg:`) |
| Composants, variantes, slots | ✓ | ✓ (props typées, expressions, `<slot/>`, kit de 26 composants) |
| Variables et modes | ✓ | ✓ (tokens par mode, variables d'état, expressions, boucles `each`/`repeat`) |
| Prototypage | ✓ | ✓ et plus : smart animate aussi sur les changements de variables, champs réellement saisissables, swipe, clavier, conditions |
| Motion | Figma Motion (2026) | Presets d'entrée et de boucle, ressorts physiques, keyframes, cascades, timeline éditable |
| Vérification | Plugins | `inspect` (layout en texte), `lint` (contraste WCAG, zones tactiles, débordements, liens cassés) |
| Exports | PNG, prototypes | PNG, board, MP4/GIF scénarisés, prototype HTML autonome, HTML statique |
| Images de démo | À importer | Générées (paysages, avatars, cartes…), sans aucun réseau |

## Démarrer

```bash
npm install
npm run build                      # dist/maquette.html : l'éditeur avec les exemples
npm test
node cli/mq.js help
```

Ouvre `dist/maquette.html` dans un navigateur. Raccourcis principaux : `V F R O T I N` (outils), `P` (prototype), `Ctrl+/` (code), `Ctrl+Entrée` (présenter), `Maj+1` (tout voir), `Alt` au survol (mesures), `Alt+glisser` (dupliquer).

## CLI

```bash
node cli/mq.js render  examples/orbit-banking.mq -s Home --frame -o out   # PNG
node cli/mq.js board   examples/orbit-banking.mq -o out/board.png         # canvas entier
node cli/mq.js inspect examples/orbit-banking.mq -s Home --depth 3        # layout en texte
node cli/mq.js lint    examples/orbit-banking.mq                          # audit design
node cli/mq.js video   examples/orbit-banking.mq --flow demo -o out/demo.mp4
node cli/mq.js build   mon-projet.mq -o out/maquette.html                 # éditeur autonome
node cli/mq.js export  mon-projet.mq -o out/prototype.html                # prototype seul
node cli/mq.js kit | icons <mot> | scenes
```

Documentation du langage : [`docs/LANGUAGE.md`](docs/LANGUAGE.md). Guide de travail pour Claude : [`CLAUDE.md`](CLAUDE.md).
