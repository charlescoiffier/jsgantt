const INLINE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linejoin', 'stroke-linecap',
  'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'rx', 'ry',
];

const DEFAULT_PDF_LIBS = {
  jspdf: 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  svg2pdf: 'https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.3/dist/svg2pdf.umd.min.js',
};

function inlineStyles(svg) {
  const clone = svg.cloneNode(true);
  const originals = [svg, ...svg.querySelectorAll('*')];
  const clones = [clone, ...clone.querySelectorAll('*')];
  const toRemove = [];
  originals.forEach((o, i) => {
    const c = clones[i];
    if (o.getAttribute('data-export') === 'skip') {
      toRemove.push(c);
      return;
    }
    const cs = getComputedStyle(o);
    if (cs.display === 'none') {
      toRemove.push(c);
      return;
    }
    for (const prop of INLINE_PROPS) {
      let value = cs.getPropertyValue(prop);
      if (!value) continue;
      if (prop === 'rx' || prop === 'ry') {
        value = value.replace(/px$/, '');
        if (value === 'auto') continue;
      }
      c.setAttribute(prop, value);
    }
  });
  for (const node of toRemove) node.remove();
  return clone;
}

// `parts` : { main, header, table, corner } (couches du diagramme) ou un svg unique.
export function buildStandaloneSVG(parts) {
  const list = parts instanceof Element ? [parts] : [parts.main, parts.header, parts.table, parts.corner];
  const clones = list.map(inlineStyles);
  const clone = clones[0];
  let defs = clone.querySelector('defs');
  for (const extra of clones.slice(1)) {
    for (const node of [...extra.childNodes]) {
      if (node.nodeName === 'defs') {
        if (!defs) {
          defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
          clone.insertBefore(defs, clone.firstChild);
        }
        defs.append(...node.childNodes);
      } else {
        clone.append(node);
      }
    }
  }
  clone.querySelector('.gantt-overlay')?.replaceChildren();

  const bg = getComputedStyle(list[0]).backgroundColor;
  if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', clone.getAttribute('width'));
    rect.setAttribute('height', clone.getAttribute('height'));
    rect.setAttribute('fill', bg);
    clone.insertBefore(rect, clone.firstChild);
  }
  return clone;
}

export function serializeSVG(el) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(el)}`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Impossible de charger ${url}`));
    document.head.append(s);
  });
}

export async function exportPDFBlob(parts, libs = {}) {
  const urls = { ...DEFAULT_PDF_LIBS, ...libs };
  try {
    if (!window.jspdf) await loadScript(urls.jspdf);
    if (!window.svg2pdf) await loadScript(urls.svg2pdf);
  } catch (e) {
    throw new Error(`Export PDF indisponible : ${e.message}`);
  }
  const { jsPDF } = window.jspdf;
  const clone = buildStandaloneSVG(parts);
  const w = Number(clone.getAttribute('width'));
  const h = Number(clone.getAttribute('height'));
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0';
  host.append(clone);
  document.body.append(host);
  try {
    const doc = new jsPDF({ orientation: w >= h ? 'landscape' : 'portrait', unit: 'px', format: [w, h], hotfixes: ['px_scaling'] });
    const opts = { x: 0, y: 0, width: w, height: h };
    if (typeof doc.svg === 'function') await doc.svg(clone, opts);
    else await (window.svg2pdf.svg2pdf ?? window.svg2pdf)(clone, doc, opts);
    return doc.output('blob');
  } finally {
    host.remove();
  }
}
