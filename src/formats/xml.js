import { GanttError } from '../i18n.js';

// Lecteur XML minimal (sans dépendance, utilisable sous Node) : éléments, texte, entités, CDATA.
// Les attributs, commentaires, instructions et DOCTYPE sont ignorés. Nœud : { name, children, text }.

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  return ENTITIES[e] ?? m;
});

export function parseXML(text) {
  const root = { name: '#document', children: [], text: '' };
  const stack = [root];
  let i = 0;
  const top = () => stack[stack.length - 1];
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    if (lt > i) top().text += decode(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      i = text.indexOf('-->', lt) + 3;
    } else if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt);
      top().text += text.slice(lt + 9, end);
      i = end + 3;
    } else if (text.startsWith('<?', lt) || text.startsWith('<!', lt)) {
      i = text.indexOf('>', lt) + 1;
    } else if (text[lt + 1] === '/') {
      const end = text.indexOf('>', lt);
      const name = text.slice(lt + 2, end).trim();
      if (stack.length < 2 || top().name !== name) throw new GanttError('xml.malformed', { tag: name });
      stack.pop();
      i = end + 1;
    } else {
      const end = text.indexOf('>', lt);
      if (end === -1) throw new GanttError('xml.malformed', { tag: '?' });
      const inner = text.slice(lt + 1, end);
      const selfClosing = inner.endsWith('/');
      const name = inner.replace(/\/$/, '').trim().split(/\s/)[0];
      const node = { name, children: [], text: '' };
      top().children.push(node);
      if (!selfClosing) stack.push(node);
      i = end + 1;
    }
    if (i <= 0) throw new GanttError('xml.malformed', { tag: '?' });
  }
  if (stack.length !== 1) throw new GanttError('xml.malformed', { tag: top().name });
  return root;
}

export const child = (node, name) => node?.children.find((c) => c.name === name) ?? null;
export const children = (node, name) => node?.children.filter((c) => c.name === name) ?? [];
export const textOf = (node, name) => {
  const c = child(node, name);
  return c ? c.text.trim() : '';
};
