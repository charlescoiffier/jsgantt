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

Les ES modules exigent un serveur HTTP : `npm run demo` (serveur sans cache, port 8000 ou `PORT=…`), puis `http://localhost:8000/demo/index.html`. Avec `python3 -m http.server`, le navigateur peut garder d'anciennes versions des modules : recharger sans cache (`Ctrl`/`Cmd` + `Maj` + `R`).

## Données

**Tâche** : `id` (obligatoire), `name`, `start` et `end` (`AAAA-MM-JJ`, fin incluse, obligatoires sauf pour un groupe), `progress` (0 à 1), `parentId`, `collapsed`, `milestone` (jalon : `end` facultatif), `className`, `data` (objet libre, conservé dans le JSON, modifiable avec `g.model.updateTask(id, { data })` ; utile aux colonnes personnalisées).
Par défaut, le tableau affiche le nom, le début, la fin et la **durée en jours** (jours travaillés si un calendrier est défini, calendaires sinon ; 0 pour un jalon ; un groupe affiche la durée de son étendue). Cette colonne est en lecture seule ; `g.model.durationDays(id)` donne la même valeur.

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
const g = new Gantt(el, { tasks, links, scale, readonly, pdfLibs, historyLimit, locale, weekStart, calendar, planning, showCritical,
  columns, sort, filter, tableWidth });
g.on('change' | 'select' | 'invalid' | 'scale' | 'history', handler); // retourne une fonction de désabonnement
g.undo(); g.redo();     // annuler / rétablir ; g.canUndo et g.canRedo (faux en lecture seule)
g.addTask({ name, start, end, parentId, afterId }); // sans start : jour au centre de la vue ; durée par défaut 3 jours
g.removeTask(id);        // supprime la tâche, ses descendants et leurs liens
g.moveTaskTo(id, { parentId, beforeId }); // réordonne ou change de parent
// ces trois méthodes renvoient { ok, … } ; refusées en lecture seule ou si le résultat est invalide
g.setScale('month');
g.setLocale('en');        // change la langue à chaud (voir « Localisation »)
g.setCalendar({ workingDays: [1, 2, 3, 4, 5], holidays: [], lagUnit: 'working' }); // ou null : 7 jours sur 7 ; replanifie, annulable
g.setWeekStart(0);       // 0 = dimanche, 1 = lundi
g.setConstraint(id, { type: 'SNET', date: '2026-10-12' }); // ou null ; annulable (voir « Contraintes de dates »)
g.setPlanning({ direction: 'backward', end: '2026-11-30' }); // ou null : en avant ; annulable (voir « Planification »)
g.alignEarliest(); g.alignLatest();  // cale les tâches reliées au plus tôt / au plus tard ; annulable
g.setColumns(['wbs', 'start', 'end', 'progress']); g.setSort({ column: 'start', dir: 'asc' }); g.setFilter('recette');
g.getView(); g.setView({ columns, sort, filter, tableWidth, scale }); // voir « Affichage »
g.setShowCritical(true); // affiche le chemin critique et les marges (voir « Chemin critique et marges »)
g.model.slack();         // Map id → { total, free, lateStart, lateEnd, critical } ; g.model.criticalIds()
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
| `C` | Contrainte de date de la tâche sélectionnée |
| `L` | Mode lien : `↑` `↓` choisissent la cible, `1` à `4` le type (FS, SS, FF, SF), `Entrée` valide en FS, `Échap` annule |
| `Maj`+`L` | Parcourir les liens de la tâche sélectionnée, puis `Suppr` |
| `Ctrl`/`Cmd`+`Z`, `Ctrl`/`Cmd`+`Maj`+`Z` ou `Ctrl`+`Y` | Annuler / rétablir |
| `Échap` | Désélectionner le lien, puis la tâche |

Toutes ces actions passent par le même chemin que la souris : annulables, avec les mêmes refus (cycle, dépendance bloquante). En lecture seule, seule la navigation et le repli restent actifs.

## Événements

`change` (détail : `type` parmi `move`, `resize`, `progress`, `link`, `unlink`, `rename`, `dates`, `add`, `remove`, `reorder`, `calendar`, `constraint`, `planning`, `align` (avec `mode`), `collapse`, `undo`, `redo`, plus `id` d'une tâche ou `linkId` d'un lien), `select`, `invalid` (`reason` traduit et `code` stable), `scale`, `history`, `locale` (`canUndo`, `canRedo`).
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
| `--gantt-critical`, `--gantt-slack` | Chemin critique, traits de marge |
| `--gantt-row-height`, `--gantt-bar-height`, `--gantt-header-height`, `--gantt-table-width`, `--gantt-date-col-width`, `--gantt-duration-col-width`, `--gantt-indent` | Géométrie (lue par le JS) |
| `--gantt-link-gap`, `--gantt-link-radius` | Tracé des liens |
| `--gantt-col-width-day`, `--gantt-col-width-week`, `--gantt-col-width-month` | Largeur d'une colonne par échelle |
| `--gantt-max-height` | Hauteur maximale du conteneur (défilement vertical) |

Classes : `gantt-row`, `gantt-row--alt`, `gantt-bar`, `gantt-bar--group`, `gantt-bar--milestone`, `gantt-progress`, `gantt-label`, `gantt-handle`, `gantt-link`, `gantt-link--fs|ss|ff|sf`, `gantt-today`, `gantt-weekend` ; états `is-selected`, `is-collapsed`, `is-dragging`, `is-invalid`. Chaque tâche porte `data-id` et sa classe libre `className`, ce qui permet de styler par catégorie.

Thème sombre d'exemple : `data-theme="dark"` sur l'élément racine, puis `gantt.refresh()`.

Thème « Todoist » : charger `src/themes/todoist.css` après `gantt.css`, puis `data-theme="todoist"` sur l'élément racine et `gantt.refresh()`. Il change aussi la géométrie (lignes de 40 px, barres en pilule). Les priorités se posent avec la classe `p1`, `p2` ou `p3` dans le `className` d'une tâche (`p4`, gris, par défaut). Les groupes y sont dessinés comme une pilule fine (le rendu produit aussi cette forme, masquée par défaut : classes `gantt-group-pill` et `gantt-group-pill-progress`).
Après un changement de variable de géométrie, appeler `gantt.refresh()`.

## Calendrier : jours ouvrés, ouvrables et fériés

Sans calendrier, tous les jours comptent (comportement par défaut). Un calendrier se donne à la création, avec `setCalendar` ou dans les données (`{ tasks, links, calendar }`, donc exporté et importé avec le JSON).

```js
import { WEEK, frenchHolidays, americanHolidays } from './src/calendar.js';

new Gantt(el, {
  calendar: {
    workingDays: WEEK.OUVRES,   // WEEK.OUVRES : lundi–vendredi · WEEK.OUVRABLES : lundi–samedi · WEEK.ALL : 7 j/7 · ou [0..6] (0 = dimanche)
    holidays: [...frenchHolidays([2026, 2027]), { date: '2026-12-31', name: 'Réveillon' }], // 'AAAA-MM-JJ' ou { date, name? }
    lagUnit: 'working',         // unité du décalage (lag) des liens : 'working' (défaut) ou 'calendar'
  },
});
```

- **Durée :** une tâche dure un nombre de jours travaillés ; son début et sa fin tombent toujours sur un jour travaillé. Une date saisie, importée ou obtenue en déplaçant une barre sur un jour non travaillé est ramenée au jour travaillé le plus proche (début vers l'avant, fin vers l'arrière ; un déplacement suit le sens du geste). Une barre qui traverse un week-end reste continue.
- **Liens :** FS, SS, FF et SF gardent leurs formules, mais le « +1 jour » se compte en jours travaillés : un lien FS (décalage 0) fait démarrer la tâche suivante le prochain jour travaillé. Le décalage (`lag`) se compte en jours travaillés avec `lagUnit: 'working'`, en jours calendaires avec `'calendar'` (le résultat est alors ramené sur un jour travaillé). Les groupes décalés gardent leur structure interne.
- **Affichage :** les jours non travaillés sont grisés, les jours fériés ont leur teinte (`--gantt-holiday`, classe `gantt-holiday`) et une infobulle avec leur nom. Sans calendrier, seuls les samedis et dimanches sont grisés.
- **Jours fériés :** `frenchHolidays(année ou [années])` (11 jours, Pâques et dérivés calculés) et `americanHolidays(année ou [années])` (jours fériés fédéraux ; un férié à date fixe un samedi est reporté au vendredi, un dimanche au lundi, nom suffixé « (observed) »).
- **Remarque :** pour les calendriers ouvrés ou ouvrables, `setCalendar` ramène les dates existantes sur des jours travaillés ; une tâche qui ne couvrait que des jours non travaillés se réduit à un jour.

Dans la démo, le bouton **Paramètres** ouvre une modale : langue, thème, début de semaine, jours travaillés (calendaires, ouvrables, ouvrés), jours fériés (aucun, France, États-Unis), unité du décalage des liens et lecture seule.

## Planification : en avant, en arrière

Les liens se résolvent dans un sens :
- **En avant** (défaut) : une tâche qui passerait avant la fin de son prédécesseur est repoussée plus tard ; un prédécesseur n'est jamais avancé.
- **En arrière** (`planning: { direction: 'backward', end: 'AAAA-MM-JJ' }`, aussi dans les données JSON) : le miroir, à partir d'une **fin imposée**. Une tâche qui finirait après cette date est ramenée plus tôt, avec ses prédécesseurs ; déplacer une tâche plus tôt avance aussi ses prédécesseurs, la déplacer plus tard ne repousse pas ses successeurs. Sans `end`, la fin actuelle du projet est retenue. Une ligne « Fin imposée » (`--gantt-planning-end`, classe `gantt-end-line`) marque la date.

Les formules des liens FS/SS/FF/SF, le décalage (`lag`, jours travaillés ou calendaires), le calendrier et les groupes sont repris à l'envers. Un redimensionnement qui irait contre un lien est refusé dans les deux sens.

`g.alignEarliest()` et `g.alignLatest()` (annulables) calent d'un coup les tâches **reliées** : au plus tôt (toutes partent du début actuel du projet puis sont repoussées par leurs liens) ou au plus tard (toutes finissent à la fin imposée, ou à la fin actuelle du projet, puis sont avancées par leurs liens). Les tâches sans lien ne bougent pas. Les contraintes de dates restent indicatives.

## Affichage : colonnes, tri, filtre

La **vue** règle l'affichage du tableau. Elle n'entre ni dans les données JSON ni dans l'historique ; chaque changement émet l'événement `view` (détail : `getView()`), ce qui permet de la mémoriser (la démo la garde dans `localStorage`).

- **Colonnes** (`columns`, `g.setColumns`) : le nom est toujours la première. Colonnes fournies : `wbs` (numéro hiérarchique 1, 1.1…), `start`, `end`, `duration`, `progress` (%), `slack` (marge totale). Par défaut : `['start', 'end', 'duration']`. Colonne personnalisée, en lecture seule : `{ id, label, width, value: (task) => texte }`, par exemple `{ id: 'owner', label: 'Responsable', width: 96, value: (t) => t.data?.owner }`. Largeurs en CSS : `--gantt-date-col-width`, `--gantt-duration-col-width`, `--gantt-wbs-col-width`, `--gantt-progress-col-width`, `--gantt-slack-col-width`. Seuls le nom, le début et la fin s'éditent en ligne (`Tab` passe d'une colonne éditable affichée à la suivante).
- **Largeur du tableau** (`tableWidth`, `g.setTableWidth(px)`, ou en glissant le bord droit du tableau, aussi en lecture seule) : le nom prend la place restante, au moins 120 px. Sans valeur, `--gantt-table-width`.
- **Tri** (`sort: { column, dir: 'asc' | 'desc' }`, `g.setSort`, ou clic sur un en-tête : croissant, décroissant, ordre du plan) : entre tâches sœurs, la hiérarchie est conservée ; ne change que l'affichage. Pendant un tri, réordonner une tâche (souris ou clavier) est refusé (`reorder.sorted`). La colonne triée doit être affichée ; la retirer annule le tri. Pendant un glissement, l'ordre des lignes est figé.
- **Filtre** (`filter`, `g.setFilter`) : texte cherché dans les noms (sans tenir compte de la casse ni des accents, `matchesText` dans `src/view.js`) ou fonction `(task) => booléen`. Les groupes parents des tâches retenues restent affichés, le repli est ignoré, les liens vers des tâches masquées sont masqués.
- Les changements de tri et de filtre sont annoncés (« Trié par Début, croissant », « 3 lignes affichées »). La navigation clavier suit les lignes affichées.

## Chemin critique et marges

Calculés en jours travaillés (calendrier compris), sans rien déplacer :

- **Fin de référence :** la fin imposée en planification en arrière, sinon la fin la plus tardive du projet (comme Merlin Project).
- **Dates au plus tard :** chaque tâche placée le plus tard possible avant la fin de référence, en respectant ses liens vers ses successeurs (types, décalage, groupes).
- **Marge totale :** retard possible sans repousser la fin de référence (début au plus tard − début). **Marge libre :** retard possible sans décaler aucun successeur direct (ni ceux des groupes de la tâche) ; jamais plus grande que la marge totale.
- **Critique :** marge totale nulle (ou négative). Une tâche terminée (100 %) n'est jamais critique, elle ne peut plus repousser la fin. Un groupe a la plus petite marge de ses tâches et est critique si l'une d'elles l'est.
- Les contraintes de dates, indicatives, n'entrent pas dans le calcul.

`g.model.slack()` renvoie `Map` id → `{ total, free, lateStart, lateEnd, critical }` (jours en numéros, comme `getTask`) ; `g.model.criticalIds()` la liste des tâches et groupes critiques.

Affichage (option `showCritical`, ou `g.setShowCritical(bool)`, désactivé par défaut) : barres critiques avec la classe `is-critical` (`--gantt-critical`), liens entre deux tâches critiques sans écart avec `gantt-link--critical`, et un trait fin `gantt-slack` (`--gantt-slack`) de la fin de chaque barre non terminée jusqu'à sa fin au plus tard. Les descriptions des lignes et les annonces de dates mentionnent « sur le chemin critique » ou la marge. L'export et l'impression reprennent l'affichage. Tout est recalculé en direct pendant un glissement.

## Contraintes de dates

Une tâche simple peut porter **une** contrainte, `constraint: { type, date }` dans les données (importée et exportée avec le JSON) ou avec `g.setConstraint(id, { type, date } | null)` (annulable).

| Type | Nom | Non respectée quand… |
|---|---|---|
| `SNET` | Début au plus tôt | le début est avant la date |
| `FNET` | Fin au plus tôt | la fin est avant la date |
| `SNLT` | Début au plus tard | le début est après la date |
| `FNLT` | Fin au plus tard | la fin est après la date |
| `MSO` | Doit commencer le | le début n'est pas la date |
| `MFO` | Doit finir le | la fin n'est pas la date |

- **Indicatives :** une contrainte ne déplace **jamais** une tâche et son drapeau ne bouge pas (déplacer, redimensionner, replanifier ou éditer les dates ne la modifie pas). Seule une indication graphique signale qu'elle n'est pas respectée.
- **Affichage :** un drapeau marque la date de chaque contrainte sur la ligne de la tâche (côté gauche pour un début, droit pour une fin, infobulle avec le texte) ; il passe en rouge, avec la barre cerclée de rouge, quand la contrainte n'est pas respectée (`--gantt-constraint`, `--gantt-invalid`, classes `gantt-constraint`, `is-violated`). `g.model.violations()` donne la liste.
- **Calendrier :** une date non travaillée est interprétée sur le jour travaillé suivant pour un début, précédent pour une fin.
- **Groupes :** ils ne portent pas de contrainte (leurs enfants oui) ; une tâche qui devient un groupe perd la sienne.
- **Édition :** icône drapeau au survol de la ligne, clic sur le drapeau, ou touche `C` : une petite fenêtre (type, date ; `Entrée` valide, `Échap` annule, « Retirer »). Les libellés sont traduits.

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

Heures (granularité = jour).
