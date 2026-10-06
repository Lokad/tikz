// Fixed image-only controls for the trusted 28-node corpus. These never
// alter the trusted TikZ source or infer a tolerance from a public candidate.
export function curvedNodeDefects(indexes) {
  return [
    {name:'missing-period',target:'glyph-'+indexes.period},
    {name:'missing-font-glyph',target:'glyph-'+indexes.font},
    {name:'missing-border',target:'shape-c-regular'},
    {name:'double-border',target:'shape-c-regular'},
    {name:'shift-glyph',target:'glyph-0'},
    {name:'half-opacity',target:'glyph-'+indexes.font},
    {name:'quarter-pixel-shift',target:'shape-c-font'},
    {name:'height-crop',target:'shape-c-shear',naturalOnly:true},
    {name:'extra-ink',target:null},
    {name:'faint-glyph-loss',target:'glyph-'+indexes.period},
    {name:'faint-border-loss',target:'shape-c-regular'},
    {name:'extra-faint-ink',target:null},
    {name:'extra-outside-whole',target:'outside-whole-picture',pdfOnly:true,naturalOnly:true}
  ];
}
// Standalone browser function. Native reconstruction and public SVG have
// different identifiers; their geometry/paint units are preserved.
export function mutateCurvedNodeSvg({actual,defect,indexes,publicCandidate=false}) {
  const doc=new DOMParser().parseFromString(actual,'image/svg+xml'),svg=doc.documentElement;
  if(doc.querySelector('parsererror')||doc.doctype)throw Error('Invalid curved-node SVG.');
  const selected=id=>{const e=doc.getElementById(id);if(!e)throw Error('Missing curved-node control target.');return e;};
  const glyph=i=>selected(publicCandidate?'candidate-g'+i:'native-glyph-'+i),border=()=>selected(publicCandidate?'candidate-p'+indexes.regular:'native-shape-c-regular');
  const before=new XMLSerializer().serializeToString(svg);
  switch(defect.name){
    case'missing-period':glyph(indexes.period).remove();break;
    case'missing-font-glyph':glyph(indexes.font).remove();break;
    case'missing-border':border().remove();break;
    case'double-border':{const p=border();p.setAttribute('stroke-width',String(Number(p.getAttribute('stroke-width'))*2));break;}
    case'shift-glyph':{const p=glyph(0),m=/^matrix\(([^)]+)\)$/.exec(p.getAttribute('transform'))?.[1].split(/[ ,]+/).map(Number);if(!m||m.length!==6)throw Error('Missing glyph matrix.');m[4]+=1;p.setAttribute('transform','matrix('+m.join(' ')+')');break;}
    case'half-opacity':glyph(indexes.font).setAttribute('opacity','.5');break;
    case'faint-glyph-loss':glyph(indexes.period).setAttribute('opacity','.99');break;
    case'faint-border-loss':border().setAttribute('stroke-opacity','.99');break;
    case'quarter-pixel-shift':{const g=doc.createElementNS('http://www.w3.org/2000/svg','g');g.setAttribute('transform','translate(.25 .125)');while(svg.firstChild)g.append(svg.firstChild);svg.append(g);break;}
    case'height-crop':{const v=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);v[3]-=4;svg.setAttribute('viewBox',v.join(' '));svg.setAttribute('height',v[3]+'px');break;}
    case'extra-ink':case'extra-faint-ink':case'extra-outside-whole':{
      const p=doc.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',defect.name==='extra-outside-whole'?'M150 600h3v3h-3Z':'M130 600h2v2h-2Z');p.setAttribute('fill','#000');if(defect.name==='extra-faint-ink')p.setAttribute('fill-opacity','.01');svg.append(p);
      if(defect.name==='extra-outside-whole'){const v=svg.getAttribute('viewBox').split(/[ ,]+/).map(Number);v[2]+=40;svg.setAttribute('viewBox',v.join(' '));svg.setAttribute('width',v[2]+'px');}break;
    }
    case'unpainted-cap':border().setAttribute('stroke-linecap','round');break;
    case'unpainted-solid-phase':border().setAttribute('stroke-dashoffset','37');break;
    default:throw Error('Unknown curved-node control.');
  }
  const changed=new XMLSerializer().serializeToString(svg);if(changed===before)throw Error('Unchanged curved-node mutation.');return changed;
}
