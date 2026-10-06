// Preselected semantic defects in the fixed forty-line corpus. Image-only
// trials bypass numeric gates; no fixture, reference or allowance is changed.
export const dashLinesImageDefects = [
  { name: 'missing-pattern', pathIndex: 1 },
  { name: 'wrong-phase', pathIndex: 23 },
  { name: 'missing-line', pathIndex: 1 },
  { name: 'double-width', pathIndex: 1 },
  { name: 'shift-line', pathIndex: 1 },
  { name: 'half-opacity', pathIndex: 1 },
  { name: 'truncate-odd-pattern', pathIndex: 28 },
  { name: 'single-pattern-no-gap', pathIndex: 29 },
  { name: 'zero-on-butt-cap', pathIndex: 30 },
  { name: 'late-width-capture', pathIndex: 22 },
  { name: 'early-live-width-capture', pathIndex: 19 },
  { name: 'captured-register-reapply', pathIndex: 33 },
  { name: 'inherited-width-reapply', pathIndex: 38 },
  { name: 'inherited-phase-reset', pathIndex: 39 },
  { name: 'scope-width-not-restored', pathIndex: 36 },
  { name: 'wrong-physical-literal', pathIndex: 31 },
  { name: 'empty-pattern-not-solid', pathIndex: 26 },
  { name: 'round-cap-loss', pathIndex: 19 },
  { name: 'faint-stroke-loss', pathIndex: 38 },
  { name: 'extra-faint-content', pathIndex: 0 },
  { name: 'root-crop', pathIndex: 39 }
];
export const dashLinesVisibilityControls = [
  { name: 'solid-phase-unpainted', pathIndex: 27 },
  { name: 'straight-join-unpainted', pathIndex: 0 }
];

// Standalone browser function. Modify the XML DOM, preserving physical units.
export function mutateDashLinesSvg({ actual, defect, pathPrefix = 'candidate-p' }) {
  const doc = new DOMParser().parseFromString(actual, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('Invalid fixed line SVG.');
  const root = doc.documentElement, target = doc.getElementById(pathPrefix + defect.pathIndex);
  if (!target) throw new Error('Missing fixed line target.');
  const serializer = new XMLSerializer(), before = serializer.serializeToString(root);
  const pattern = value => { target.setAttribute('stroke-dasharray', value); };
  switch (defect.name) {
    case 'missing-pattern': target.removeAttribute('stroke-dasharray'); target.removeAttribute('stroke-dashoffset'); break;
    case 'wrong-phase':
    case 'inherited-phase-reset': target.setAttribute('stroke-dashoffset', '0'); break;
    case 'missing-line': target.remove(); break;
    case 'double-width': target.setAttribute('stroke-width', '.8'); break;
    case 'shift-line': {
      const t = target.getAttribute('transform');
      if (!/^scale\(/.test(t ?? '')) throw new Error('Missing native physical transform.');
      target.setAttribute('transform', 'translate(1 0) ' + t); break;
    }
    case 'half-opacity': target.setAttribute('stroke-opacity', '.5'); break;
    case 'truncate-odd-pattern': pattern('1 2'); break;
    case 'single-pattern-no-gap': pattern('3 0'); break;
    case 'zero-on-butt-cap':
    case 'round-cap-loss': target.setAttribute('stroke-linecap', 'butt'); break;
    case 'late-width-capture': pattern('3 2 2 2'); break;
    case 'early-live-width-capture': pattern('.4 2'); break;
    case 'captured-register-reapply': pattern('2 2'); break;
    case 'inherited-width-reapply': pattern('3 2'); break;
    case 'scope-width-not-restored': target.setAttribute('stroke-width', '2'); pattern('2 2'); break;
    case 'wrong-physical-literal': {
      const dash = target.getAttribute('stroke-dasharray').split(/[ ,]+/);
      if (dash.length !== 4) throw new Error('Missing physical-literal pattern.');
      dash[2] = '1'; pattern(dash.join(' ')); break;
    }
    case 'empty-pattern-not-solid': pattern('3 3'); target.setAttribute('stroke-dashoffset', '0'); break;
    case 'faint-stroke-loss': target.setAttribute('stroke-opacity', '.98'); break;
    case 'extra-faint-content': {
      // Native y is upward: negative y places the mark inside the picture,
      // below its first line, rather than outside the natural top viewport.
      const extra = target.cloneNode(false); extra.removeAttribute('id'); extra.setAttribute('d', 'M20 -1.5 H24');
      extra.removeAttribute('stroke-dasharray'); extra.removeAttribute('stroke-dashoffset');
      extra.setAttribute('stroke-width', '1'); extra.setAttribute('stroke-opacity', '.01'); target.after(extra); break;
    }
    case 'solid-phase-unpainted': target.setAttribute('stroke-dashoffset', '37'); break;
    case 'straight-join-unpainted': target.setAttribute('stroke-linejoin', 'round'); break;
    case 'root-crop': {
      const v = root.getAttribute('viewBox').split(/[ ,]+/).map(Number);
      v[3] -= 4; root.setAttribute('viewBox', v.join(' ')); root.setAttribute('height', v[3] + 'px'); break;
    }
    default: throw new Error('Unknown line defect.');
  }
  const svg = serializer.serializeToString(root);
  if (svg === before) throw new Error('Defect did not change the input.');
  return svg;
}
