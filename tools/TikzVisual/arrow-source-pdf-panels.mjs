import {shapePdfRasterRectangle} from './shape-pdf-camera.mjs';
import {arrowSourcePdfControl} from './arrow-source-pdf-model.mjs';

export function arrowSourcePdfFocus(model,records,frames){
 const focus=[];
 for(const r of records){
  const v=r.view,f=frames.find(f=>f.caseId===v.caseId),control=arrowSourcePdfControl(v);
  const p=model.policies.find(p=>p.caseId===v.caseId&&p.route===v.route&&p.raster===v.raster);
  for(const type of ['source','scene']){
   const ids=control?[control.target]:v.kind==='calibration'?p[type].rows.find(q=>q.frame===v.frame&&q.scale===v.scale).regions.filter(q=>q.basis==='nonzero-native-ink-below-mask').map(q=>q.id):[];
   if(v.kind==='calibration'&&v.caseId==='dimensions'&&v.frame==='natural')ids.push('paint-17.endpoint-0');
   for(const id of new Set(ids)){
    const rectangle=id==='outside-diagram'?shapePdfRasterRectangle({x:r.extra.world.x-2,y:r.extra.world.y-2,width:12,height:12},f.paper.camera,v.scale):f.paper.regions.find(q=>q.id===id).rasterRectangles[v.scale+'x'];
    const folder='focus/'+v.id+'/'+type+'/'+id;
    focus.push({viewId:v.id,type,regionId:id,rectangle,pageSize:r[type].pageSize,reference:r.files.pdf,actual:r.files[type].images['svg-page'],
     images:Object.fromEntries(['reference','actual','amplified','sheet'].map(k=>[k,folder+'-'+k+'.png']))});
   }
  }
 }
 return focus;
}

export function arrowSourcePdfIndex(model,focus){
 return'<!doctype html><html lang="en"><meta charset="utf-8"><title>Native arrow source PDF</title><style>body{font:16px sans-serif;margin:24px}img{image-rendering:pixelated;max-width:100%}pre{white-space:pre-wrap}</style><h1>Native arrow source and full-page PDF; admission pending</h1><p>Source frames and source pixels are required before full-page scene comparison. Original PDF pages remain unchanged. Both raster routes and every declared view remain present. These native experiments do not depict public converter output.</p><a href="report.json">Compact report</a> · <a href="policies.json">Native-only limits and strict diagnostics</a><pre>'+JSON.stringify(model.summary,null,2)+'</pre>'+focus.filter(p=>p.viewId.includes('/1x-white')).map(p=>'<article><h2>'+p.viewId+' · '+p.type+' · '+p.regionId+'</h2><p>Ordinary PDF | '+p.type+' SVG | raw difference ×16; integer enlargement ×8. <a href="'+p.actual+'">Full saved SVG page</a></p><img src="'+p.images.sheet+'" alt="Paired native PDF and SVG pixels"></article>').join('')+'<h2>All view gates</h2><ul>'+model.evaluations.map(e=>'<li><a href="views/'+e.view.id+'/gates.json">'+e.view.id+'</a> · '+(e.passed?'native gates passed':'native gates failed')+'</li>').join('')+'</ul></html>\n';
}
