# jsgantt

Diagrammes de Gantt interactifs en SVG, dont tout le design est piloté par CSS.
JavaScript vanilla (ES modules), sans build, sans dépendance (le PDF charge svg2pdf.js et jsPDF à la demande).

## Démarrage

```html
<link rel="stylesheet" href="src/gantt.css">
<div id="chart"></div>
<script type="module">
  import { Gantt } from './src/gantt.js';
  const gantt = new Gantt(document.getElementById('chart'), {
    scale: 'week', // 'day' | 'week' | 'month'
    tasks: [
      { id: 'a', name: 'Conception', start: '2026-10-05', end: '2026-10-09', progress: 0.5 },
      { id: 'b', name: 'Réalisation', start: '2026-10-12', end: '2026-10-20' },
      { id: 'm', name: 'Livraison', start: '2026-10-21', milestone: true },
    ],
    links: [
      { from: 'a', to: 'b', type: 'FS' },
      { from: 'b', to: 'm', type: 'FS', lag: 0 },
    ],
  });
</script>
```

Les ES modules exigent un serveur HTTP : `python3 -m http.server 8000`, puis `http://localhost:8000/demo/index.html`.

## Données

**Tâche** : `id` (obligatoire), `name`, `start` et `end` (`AAAA-MM-JJ`, fin incluse, obligatoires sauf pour un groupe), `progress` (0 à 1), `parentId`, `collapsed`, `milestone` (jalon : `end` facultatif), `className`.
Une tâche qui a des enfants est un **groupe** : ses dates sont calculées à partir de ses enfants.

**Lien** : `from`, `to`, `type` (`FS`, `SS`, `FF`, `SF`), `lag` (jours, négatif = avance), `id` facultatif.

| Type | Contrainte sur la cible B |
|---|---|
| FS | `start(B) ≥ end(A) + 1 + lag` |
| SS | `start(B) ≥ start(A) + lag` |
| FF | `end(B) ≥ end(A) + lag` |
| SF | `end(B) ≥ start(A) - 1 + lag` |

Ajouter une tâche sous une tâche simple en fait un groupe (ses dates deviennent celles de ses enfants) ; retirer le dernier enfant d'un groupe le rend à nouveau simple, avec ses dernières dates. Un déplacement qui créerait un cycle ou un lien interdit entre un groupe et un de ses descendants est refusé.

Planification en avant : une tâche n'est jamais avancée, seulement repoussée. Un lien vers un groupe décale tout le groupe. Les cycles et les liens entre un groupe et un de ses descendants sont refusés. Un import invalide lève une exception avec un message précis.

## API

```js
const g = new Gantt(el, { tasks, links, scale, readonly, pdfLibs, historyLimit, locale, weekStart });
g.on('change' | 'select' | 'invalid' | 'scale' | 'history', handler); // retourne une fonction de désabonnement
g.undo(); g.redo();     // annuler / rétablir ; g.canUndo et g.canRedo (faux en lecture seule)
g.addTask({ name, start, end, parentId, afterId }); // sans start : jour au centre de la vue ; durée par défaut 3 jours
g.removeTask(id);        // supprime la tâche, ses descendants et leurs liens
g.moveTaskTo(id, { parentId, beforeId }); // réordonne ou change de parent
// ces trois méthodes renvoient { ok, … } ; refusées en lecture seule ou si le résultat est invalide
g.setScale('month');
g.setLocale('en');        // change la langue à chaud (voir « Localisation »)
g.getData();            // { tasks, links } au format JSON
g.setData(data);        // remplace le planning (lève avant toute modification si invalide)
g.exportSVG(filename?); // télécharge et retourne la chaîne SVG ; filename = null : pas de téléchargement
g.exportJSON(filename?);
await g.exportPDF(filename?);
g.print();
g.destroy();
```

## Clavier et accessibilité

Le diagramme est une grille arborescente (`role="treegrid"`) : chaque ligne annonce son nom, ses dates, sa progression, son niveau, son état replié/déplié et ses prédécesseurs. Les actions sont annoncées dans une zone `aria-live`, refus compris. Les couches purement graphiques (grille, barres, liens, échelle de temps) sont masquées aux technologies d'assistance. Mode contraste élevé (`forced-colors`) pris en charge.

Quand le diagramme a le focus :

| Touches | Action |
|---|---|
| `↑` `↓` `Début` `Fin` | Sélectionner une ligne |
| `→` / `←` | Déplier ou aller au premier enfant / replier ou aller au parent |
| `Entrée` / `Maj`+`Entrée` | Ajouter une tâche en dessous / une sous-tâche (le nom s'édite aussitôt) |
| `F2` | Éditer le nom (`Tab` : champ suivant, `Maj`+`Tab` : précédent) |
| `Suppr` | Supprimer la tâche sélectionnée (ou le lien sélectionné), la ligne voisine est sélectionnée |
| `Alt`+`←` `→` / `Alt`+`PgPréc` `PgSuiv` | Déplacer d'un jour / d'une semaine |
| `Maj`+`←` `→` | Raccourcir / allonger la fin d'un jour |
| `Alt`+`Maj`+`←` `→` | Avancer / reculer le début d'un jour |
| `Alt`+`↑` `↓` | Monter / descendre parmi ses frères |
| `Alt`+`Maj`+`↑` / `↓` | Sortir du parent / devenir enfant du frère précédent |
| `+` / `-` | Progression de ±10 % |
| `L` | Mode lien : `↑` `↓` choisissent la cible, `1` à `4` le type (FS, SS, FF, SF), `Entrée` valide en FS, `Échap` annule |
| `Maj`+`L` | Parcourir les liens de la tâche sélectionnée, puis `Suppr` |
| `Ctrl`/`Cmd`+`Z`, `Ctrl`/`Cmd`+`Maj`+`Z` ou `Ctrl`+`Y` | Annuler / rétablir |
| `Échap` | Désélectionner le lien, puis la tâche |

Toutes ces actions passent par le même chemin que la souris : annulables, avec les mêmes refus (cycle, dépendance bloquante). En lecture seule, seule la navigation et le repli restent actifs.

## Événements

`change` (détail : `type` parmi `move`, `resize`, `progress`, `link`, `unlink`, `rename`, `dates`, `add`, `remove`, `reorder`, `collapse`, `undo`, `redo`, plus `id` d'une tâche ou `linkId` d'un lien), `select`, `invalid` (`reason` traduit et `code` stable), `scale`, `history`, `locale` (`canUndo`, `canRedo`).
L'historique garde `historyLimit` étapes (100 par défaut) ; `setData` le vide.

## Interactions

Glisser une barre (déplace), ses bords (redimensionne), le triangle sous la barre (progression) ; glisser une ancre ronde vers une autre barre (crée un lien, le type dépend des ancres) ; clic sur un lien puis `Suppr` ; chevron pour replier ; ligne « + Ajouter une tâche » en bas du tableau, et au survol d'une ligne : poignée (glisser pour réordonner : trait entre deux lignes = même niveau, milieu d'une ligne = en faire un enfant), « + » (ajoute en dessous) et corbeille ; `Suppr` supprime la tâche sélectionnée (ou le lien sélectionné), annulable ; double-clic sur une cellule du tableau pour éditer ; `Ctrl`/`Cmd` + `Z` annule, `Ctrl`/`Cmd` + `Maj` + `Z` ou `Ctrl` + `Y` rétablit (le repli d'un groupe n'est pas annulable) ; `Ctrl`/`Cmd` + molette pour zoomer ; `Échap` annule un glissement.

## Styles

Tout le design passe par CSS. Variables principales (définies sur `.gantt-root`) :

| Variable | Rôle |
|---|---|
| `--gantt-font`, `--gantt-font-size` | Typographie |
| `--gantt-bg`, `--gantt-text`, `--gantt-text-muted`, `--gantt-border` | Couleurs de base |
| `--gantt-row-alt`, `--gantt-weekend`, `--gantt-header-bg`, `--gantt-today-color` | Grille |
| `--gantt-bar-bg`, `--gantt-bar-stroke`, `--gantt-progress-bg`, `--gantt-bar-radius` | Barres |
| `--gantt-group-bg`, `--gantt-milestone-bg` | Groupes, jalons |
| `--gantt-link-color`, `--gantt-link-width`, `--gantt-link-selected` | Liens |
| `--gantt-selected`, `--gantt-invalid` | États |
| `--gantt-row-height`, `--gantt-bar-height`, `--gantt-header-height`, `--gantt-table-width`, `--gantt-date-col-width`, `--gantt-indent` | Géométrie (lue par le JS) |
| `--gantt-link-gap`, `--gantt-link-radius` | Tracé des liens |
| `--gantt-col-width-day`, `--gantt-col-width-week`, `--gantt-col-width-month` | Largeur d'une colonne par échelle |
| `--gantt-max-height` | Hauteur maximale du conteneur (défilement vertical) |

Classes : `gantt-row`, `gantt-row--alt`, `gantt-bar`, `gantt-bar--group`, `gantt-bar--milestone`, `gantt-progress`, `gantt-label`, `gantt-handle`, `gantt-link`, `gantt-link--fs|ss|ff|sf`, `gantt-today`, `gantt-weekend` ; états `is-selected`, `is-collapsed`, `is-dragging`, `is-invalid`. Chaque tâche porte `data-id` et sa classe libre `className`, ce qui permet de styler par catégorie.

Thème sombre d'exemple : `data-theme="dark"` sur l'élément racine, puis `gantt.refresh()`.

Thème « Todoist » : charger `src/themes/todoist.css` après `gantt.css`, puis `data-theme="todoist"` sur l'élément racine et `gantt.refresh()`. Il change aussi la géométrie (lignes de 40 px, barres en pilule). Les priorités se posent avec la classe `p1`, `p2` ou `p3` dans le `className` d'une tâche (`p4`, gris, par défaut). Les groupes y sont dessinés comme une pilule fine (le rendu produit aussi cette forme, masquée par défaut : classes `gantt-group-pill` et `gantt-group-pill-progress`).
Après un changement de variable de géométrie, appeler `gantt.refresh()`.

## Localisation

Langues fournies : français (par défaut) et anglais.

```js
new Gantt(el, { locale: 'en' });          // 'fr' | 'en'
g.setLocale('fr');                        // à chaud, tableau, échelle et annonces compris

// Ajouter ou compléter une langue (les clés absentes retombent sur `base`, puis sur le français) :
new Gantt(el, {
  locale: {
    code: 'es',
    base: 'en',                           // facultatif
    months: { short: ['ene', 'feb', /* … 12 */], long: ['enero', 'febrero', /* … 12 */] },
    messages: { 'ui.addTask': 'Añadir una tarea', 'ui.name': 'Nombre' },
  },
});

new Gantt(el, { weekStart: 0 });          // début de semaine : 1 = lundi (défaut), 0 = dimanche
```

Sont traduits : en-têtes du tableau, mois, infobulles, libellés et annonces d'accessibilité, aide du mode lien, refus et erreurs d'import. Les clés disponibles sont dans `src/i18n.js` (`BUILTIN_LOCALES.fr.messages`). Les paramètres s'écrivent `{nom}` ; les pluriels utilisent les variantes `clé.one` / `clé.other` (règles `Intl.PluralRules`).

Les refus (`invalid`, résultats de `addTask`, `moveTaskTo`…) et les exceptions d'import portent un `code` stable (`link.cycle`, `task.unknown`…) et des `params` : ils restent traduisibles quelle que soit la langue du diagramme. Les noms de tâches sont des données et ne sont jamais traduits. Les dates restent au format `AAAA-MM-JJ`. Seules les erreurs d'arguments destinées aux développeurs (option `scale` inconnue, etc.) restent en français.

## Tests

`npm test` (runner natif de Node) couvre les dates, le modèle, le planificateur, l'échelle de temps et la mise en page. Le rendu, les interactions et les exports se vérifient dans `demo/index.html`.

## Hors v1

Calendriers ouvrés, chemin critique, planification en arrière, contraintes de dates, navigation clavier complète, heures.
