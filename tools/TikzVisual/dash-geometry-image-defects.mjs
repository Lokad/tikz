// These controls change emitted images while deliberately bypassing numeric
// gates. Each target belongs to the fixed sixteen-path repository fixture.
export const dashGeometryImageDefects = [
  { name: 'missing-pattern', pathIndex: 0 },
  { name: 'wrong-phase', pathIndex: 3 },
  { name: 'truncate-odd-pattern', pathIndex: 3 },
  { name: 'late-width-capture', pathIndex: 2 },
  { name: 'wrong-control', pathIndex: 0 },
  { name: 'missing-subpath', pathIndex: 4 },
  { name: 'missing-closed-edge', pathIndex: 5 },
  { name: 'missing-continuation', pathIndex: 7 },
  { name: 'round-square-caps', pathIndex: 8 },
  { name: 'miter-round-joins', pathIndex: 5 },
  { name: 'scaled-stroke-width', pathIndex: 14 },
  { name: 'shift-physical-transform', pathIndex: 10 },
  { name: 'faint-stroke-loss', pathIndex: 1 },
  { name: 'missing-translucent-fill', pathIndex: 6 },
  { name: 'missing-clip', pathIndex: 12 },
  { name: 'missing-inner-clip', pathIndex: 13 },
  { name: 'shift-clip', pathIndex: 12 },
  { name: 'extra-faint-content', pathIndex: 0 },
  { name: 'root-crop', pathIndex: 15 }
];

// A standalone browser function: DOMParser/XMLSerializer use the same pinned
// browser as the raster comparisons, with no regex-based XML rewriting.
export function mutateDashGeometrySvg({ actual, defect, pathPrefix = 'geometry-p', clipPrefix = 'geometry-c' }) {
  const doc = new DOMParser().parseFromString(actual, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid candidate XML.');
  const root = doc.documentElement, target = doc.getElementById(pathPrefix + defect.pathIndex);
  if (!target) throw new Error('Missing fixed defect target.');
  const before = new XMLSerializer().serializeToString(root);
  const replaceData = (pattern, replacement) => {
    const d = target.getAttribute('d');
    if (!pattern.test(d)) throw new Error('Unexpected fixed fixture path.');
    target.setAttribute('d', d.replace(pattern, replacement));
  };
  const prependShift = element => {
    const transform = element.getAttribute('transform');
    if (!/^scale\(/.test(transform ?? '')) throw new Error('Missing native physical scale.');
    element.setAttribute('transform', 'translate(1 0) ' + transform);
  };
  switch (defect.name) {
    case 'missing-pattern': target.removeAttribute('stroke-dasharray'); target.removeAttribute('stroke-dashoffset'); break;
    case 'wrong-phase': target.setAttribute('stroke-dashoffset', '-1'); break;
    case 'truncate-odd-pattern': target.setAttribute('stroke-dasharray', '2 3'); break;
    case 'late-width-capture': target.setAttribute('stroke-dasharray', '3 2 2 2'); break;
    case 'wrong-control': replaceData(/C0 20 /, 'C0 22 '); break;
    case 'missing-subpath': replaceData(/ M35 -160 L60 -145$/, ''); break;
    case 'missing-closed-edge': replaceData(/ Z$/, ''); break;
    case 'missing-continuation': replaceData(/ L60 -280$/, ''); break;
    case 'round-square-caps': target.setAttribute('stroke-linecap', 'round'); break;
    case 'unpainted-join':
    case 'miter-round-joins': target.setAttribute('stroke-linejoin', 'miter'); break;
    case 'scaled-stroke-width': target.setAttribute('stroke-width', '3'); break;
    case 'shift-physical-transform': prependShift(target); break;
    case 'faint-stroke-loss': target.setAttribute('stroke-opacity', '.98'); break;
    case 'missing-translucent-fill': target.setAttribute('fill', 'none'); break;
    case 'missing-clip': target.parentElement.removeAttribute('clip-path'); break;
    case 'missing-inner-clip': target.parentElement.removeAttribute('clip-path'); break;
    case 'shift-clip': prependShift(doc.getElementById(clipPrefix + '0').querySelector('path')); break;
    case 'subpixel-faint-content':
    case 'extra-faint-content': {
      const extra = target.cloneNode(false); extra.removeAttribute('id');
      extra.setAttribute('d', 'M20 0 L24 0'); extra.removeAttribute('stroke-dasharray'); extra.removeAttribute('stroke-dashoffset');
      extra.setAttribute('stroke-opacity', '.01');
      if (defect.name === 'extra-faint-content') extra.setAttribute('stroke-width', '1');
      target.after(extra); break;
    }
    case 'root-crop': {
      const view = root.getAttribute('viewBox').split(/[ ,]+/).map(Number);
      view[3] -= 4; root.setAttribute('viewBox', view.join(' ')); root.setAttribute('height', view[3] + 'px'); break;
    }
    default: throw new Error('Unknown fixed geometry defect.');
  }
  const svg = new XMLSerializer().serializeToString(root);
  if (svg === before) throw new Error('Defect did not change the candidate.');
  return svg;
}
