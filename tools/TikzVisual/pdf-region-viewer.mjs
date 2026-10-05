export function pdfRegionViewer(caseId, mode, measured, captures, source, options = {}) {
  const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const data = JSON.stringify(measured).replaceAll('<', '\\u003c');
  const crops = captures.filter(id => id !== 'whole-picture').map(id =>
    '<h2>' + escape(id) + '</h2>' + ((measured.regionDefinitions ?? []).find(r => r.id === id)?.sourceLine
      ? '<p>Named node <a href="#line-' + measured.regionDefinitions.find(r => r.id === id).sourceLine + '">'
        + escape(measured.regionDefinitions.find(r => r.id === id).nativeNode) + '</a> (identifier declaration)</p>' : '')
    + '<div class="crops">' + ['pdf', 'svg', 'difference'].map(label =>
      '<figure><figcaption>' + label + ' (4x' + (label === 'difference' ? ', 16x error gain' : '') + ')</figcaption>'
      + '<a href="' + id + '-4x-' + label + '.png"><img src="' + id + '-4x-' + label + '.png"></a></figure>').join('') + '</div>').join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>' + escape(caseId + '/' + mode) + ' PDF regions</title>'
    + '<style>body{font:16px system-ui;margin:24px;background:#eee;color:#222}#frame{position:relative;overflow:auto;background:white;height:480px}'
    + '#camera{position:relative;transform-origin:0 0}#camera img{position:absolute;left:0;top:0}#actual{opacity:.5}pre{white-space:pre-wrap;background:white;padding:16px}'
    + '.crops{display:flex;gap:12px;flex-wrap:wrap}.crops img{min-width:128px;max-width:400px;image-rendering:pixelated}figure{margin:0}a{color:#124c8e}</style>'
    + '<h1>' + escape(caseId + '/' + mode) + ': independent PDF measurements</h1>'
    + '<p>' + escape(options.scope ?? 'Oracle-only experiment. Ordinary PDF versus oracle SVG on white paper, at measured page registration. No approved PDF allowance or candidate conformance claim.') + '</p>'
    + '<p><a href="measurements.json">Raw measurements</a> · <a href="comparison-input.json">Physical camera and fixed regions</a> · <a href="'
    + escape(options.svgFile ?? 'oracle.svg') + '">' + escape(options.svgLabel ?? 'Oracle SVG') + '</a> · <a href="source.tikz">Source</a></p>'
    + '<label>Zoom <input id="zoom" type="range" min=".5" max="4" step=".5" value="1"></label>'
    + '<label>SVG opacity <input id="opacity" type="range" min="0" max="1" step=".05" value=".5"></label>'
    + '<button id="pdf">PDF</button><button id="svg">SVG</button><button id="difference">Difference</button><button id="blink">Blink</button>'
    + '<div id="frame"><div id="camera"><img id="reference" src="whole-picture-4x-pdf.png"><img id="actual" src="whole-picture-4x-svg.png"></div></div>'
    + crops + '<h2>Raw region metrics</h2><pre id="metrics"></pre><h2>Source</h2><pre>'
    + source.split('\n').map((s, i) => '<span id="line-' + (i + 1) + '">' + (i + 1) + ' ' + escape(s) + '</span>').join('\n') + '</pre>'
    + '<script>const report=' + data + ';const actual=document.getElementById("actual");let timer;'
    + 'document.getElementById("metrics").textContent=JSON.stringify(report,null,2);'
    + 'function stop(){clearInterval(timer);timer=undefined;actual.src="whole-picture-4x-svg.png";}'
    + 'document.getElementById("zoom").oninput=e=>document.getElementById("camera").style.transform="scale("+e.target.value+")";'
    + 'document.getElementById("opacity").oninput=e=>{stop();actual.style.opacity=e.target.value;};'
    + 'document.getElementById("pdf").onclick=()=>{stop();actual.style.opacity=0;};'
    + 'document.getElementById("svg").onclick=()=>{stop();actual.style.opacity=1;};'
    + 'document.getElementById("difference").onclick=()=>{stop();actual.src="whole-picture-4x-difference.png";actual.style.opacity=1;};'
    + 'document.getElementById("blink").onclick=()=>{stop();timer=setInterval(()=>actual.style.opacity=actual.style.opacity==="1"?"0":"1",500);};</script></html>';
}
