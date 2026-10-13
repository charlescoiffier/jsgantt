# jsgantt — Spécification de design (v1)

Date : 2026-10-13

## 1. Objectif

Une bibliothèque JavaScript pour créer des diagrammes de Gantt **interactifs** et **exportables**, dont tout le design visuel est piloté par **CSS**. Référence fonctionnelle : Merlin Project (dépendances à 4 types).

### Contraintes et décisions
- JS vanilla en ES modules, **sans build** ni dépendance (sauf PDF, voir §7).
- Rendu **entièrement en SVG**, stylé par classes CSS et variables CSS.
- Interactions : glisser/redimensionner les barres, dépendances (FS/SS/FF/SF + lag), hiérarchie repliable, zoom jour/semaine/mois.
- Exports : SVG autonome, JSON (export/import), PDF en téléchargement direct, impression navigateur (`@media print`).
- Tests : runner natif de Node (`node:test`) sur la logique pure.

### Hors v1
Calendriers ouvrés et jours fériés, chemin critique et marges, planification en arrière, contraintes de dates, navigation clavier complète, tests DOM automatisés, heures (granularité = jour).

## 2. Architecture

```
src/
  dates.js        # Conversion 'YYYY-MM-DD' <-> numéro de jour (UTC)
  model.js        # Tâches, liens, validation, (dé)sérialisation JSON
  scheduler.js    # Calcul des dates (FS/SS/FF/SF + lag)
  timescale.js    # Échelles jour/semaine/mois : date <-> pixel, graduations
  renderer.js     # Produit le SVG (classes CSS, pas de style inline)
  interactions.js # Drag, resize, repli, zoom, sélection
  export.js       # SVG autonome, JSON, PDF
  gantt.js        # Façade publique : new Gantt(el, options)
  gantt.css       # Thème par défaut, piloté par variables CSS
test/             # node:test sur model, scheduler, timescale
demo/index.html   # Page de démo avec planning d'exemple
README.md         # API et liste des variables CSS
```

Le noyau (`model`, `scheduler`, `timescale`) ne touche jamais au DOM. Le renderer et les interactions s'appuient sur lui. L'export réutilise le renderer.

API publique :
```js
const g = new Gantt(el, { tasks, links, scale: 'week', readonly: false });
g.on('change' | 'select' | 'invalid' | 'scale', handler);
g.setScale('month');
g.getData();
g.exportSVG(); g.exportJSON(); await g.exportPDF();
```

Le rendu est refait en entier à chaque changement (simplicité). Optimisation différée.

## 3. Modèle de données

```js
Task: { id, name, start, end, progress (0-1), parentId|null, collapsed, milestone?, className? }
Link: { id, from, to, type: 'FS'|'SS'|'FF'|'SF', lag }  // lag en jours, négatif = avance
```
- Dates : jours entiers `YYYY-MM-DD`, traités en UTC. Fin incluse. Un jalon a une durée nulle.
- Hiérarchie par `parentId`. Un groupe n'a pas de dates propres : début = min des enfants, fin = max des enfants.

## 4. Planification

Contraintes sur la tâche cible B pour un lien depuis A :

| Type | Contrainte |
|---|---|
| FS | `start(B) ≥ end(A) + 1 + lag` |
| SS | `start(B) ≥ start(A) + lag` |
| FF | `end(B) ≥ end(A) + lag` |
| SF | `end(B) ≥ start(A) - 1 + lag` |

Les fins étant incluses, un lien FS de décalage 0 fait démarrer B le lendemain de la fin de A, et un lien SF de décalage 0 fait finir B la veille du début de A.

- Planification **en avant seulement** : une tâche liée n'est jamais avancée, seulement repoussée si une contrainte est violée (durée conservée).
- Tri topologique du graphe de liens ; déplacer une tâche repousse ses successeurs en cascade, jamais ses prédécesseurs.
- **Liens vers un groupe** : autorisés, appliqués à ses dates agrégées. Si un lien contraint un groupe, **tout le groupe** (tous les descendants) est décalé du même delta, puis les contraintes internes sont rejouées.
- Un lien entre un groupe et un de ses descendants (dans un sens ou dans l'autre) est rejeté.
- Cycles détectés à l'ajout d'un lien (un lien vers un groupe compte comme un lien vers chacun de ses descendants) : lien refusé, événement `invalid` avec la raison.

## 5. Rendu SVG et thème CSS

Couches `<g>` dans l'ordre de dessin : `gantt-grid`, `gantt-header`, `gantt-table`, `gantt-links`, `gantt-bars`, `gantt-overlay`.

- Classes (contrat public du thème) : `gantt-row`, `gantt-row--alt`, `gantt-bar`, `gantt-bar--group`, `gantt-bar--milestone`, `gantt-progress`, `gantt-label`, `gantt-handle`, `gantt-link`, `gantt-link--fs|ss|ff|sf`, `gantt-today`, `gantt-weekend`. États : `is-selected`, `is-collapsed`, `is-dragging`, `is-invalid`. Chaque tâche porte `data-id` et son `className` libre.
- Variables CSS : couleurs, polices, traits, rayons (`--gantt-bar-bg`, `--gantt-bar-radius`, `--gantt-link-color`, `--gantt-font`…).
- Géométrie : le JS lit au montage `--gantt-row-height`, `--gantt-bar-height`, `--gantt-table-width`, `--gantt-header-height`, `--gantt-col-width-day|week|month` via `getComputedStyle` et calcule les coordonnées SVG (attributs). Aucune couleur ni taille codée en dur dans le JS.
- Liens : `<path>` à angles droits arrondis, pointes en `<marker>` stylés par classe.
- Zoom : 3 échelles, en-tête sur 2 niveaux, la date au centre de la vue est conservée.
- Accessibilité minimale : `role="img"` et `aria-label` (nom, dates) sur les barres.

## 6. Interactions

Pointer Events (souris et tactile) :

| Geste | Effet |
|---|---|
| Glisser le corps d'une barre | Déplace (durée conservée) ; un groupe déplace ses descendants |
| Glisser une poignée gauche/droite | Redimensionne (pas pour groupe/jalon) |
| Glisser la poignée de progression | Ajuste `progress` |
| Glisser d'une ancre vers une autre barre | Crée un lien ; type selon les ancres début/fin source et cible |
| Clic sur un lien + `Suppr` | Supprime le lien |
| Clic sur le chevron d'un groupe | Replie/déplie |
| Ctrl/Cmd + molette, boutons | Zoom |
| Double-clic sur une cellule | Édition en ligne (input HTML superposé ; `Entrée` valide, `Échap` annule) |

- Accrochage au jour entier ; infobulle de dates pendant le drag.
- Le planificateur tourne en prévisualisation pendant le drag ; le modèle n'est modifié qu'au relâchement ; `Échap` annule.
- Cibles de lien invalides : classe `is-invalid`, relâchement sans effet.
- `readonly: true` désactive les interactions.

## 7. Exports

- **SVG** : réutilise le renderer ; les styles calculés sont inlinés et les variables CSS résolues en valeurs concrètes pour un fichier autonome.
- **JSON** : même format que `getData()`, avec import validé.
- **PDF** : généré depuis le SVG exporté avec svg2pdf.js + jsPDF, chargés à la demande (seule dépendance, optionnelle). Échec de chargement : `exportPDF()` rejette avec une erreur claire.
- **Impression** : `@media print` masque les contrôles, fond blanc, adaptation à la largeur de page.

## 8. Gestion des erreurs

- Import JSON invalide (cycle, `parentId` inconnu, boucle de hiérarchie, date illisible, lien vers tâche absente) : exception avec message précis, aucun état partiel appliqué.
- Opérations interdites : refusées avec événement `invalid`, jamais de modification silencieuse.

## 9. Tests

- `node:test` sur `model` (validation, import/export, cycles), `scheduler` (4 types, lag positif/négatif, cascade, groupes et liens vers un groupe), `timescale` (conversion date/pixel, graduations, changement d'échelle). Développement en TDD.
- Rendu et interactions vérifiés visuellement dans `demo/index.html` (4 types de lien, repli, zoom, drag, exports SVG/PDF).

## 10. Livrables v1

`src/`, `gantt.css` (thème clair par défaut, thème sombre en exemple), `demo/index.html`, `README.md`, `test/`.
