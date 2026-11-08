/* Garment Bending Lab v1.0 · importer for GarmentCode / GarmentCodeData specification JSON.
   Independent implementation of a published open schema (not copied upstream code).
   Does not infer unknown PDF sewing topology; uses explicit edge-pair stitches.
*/
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLGarmentCode=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function pointRel(a,b,t,n){let dx=b.x-a.x,dy=b.y-a.y;return {x:a.x+dx*t-dy*n,y:a.y+dy*t+dx*n};}
function quadratic(a,c,b,t){const s=1-t;return {x:s*s*a.x+2*s*t*c.x+t*t*b.x,y:s*s*a.y+2*s*t*c.y+t*t*b.y};}
function cubic(a,c1,c2,b,t){const s=1-t;return {x:s*s*s*a.x+3*s*s*t*c1.x+3*s*t*t*c2.x+t*t*t*b.x,y:s*s*s*a.y+3*s*s*t*c1.y+3*s*t*t*c2.y+t*t*t*b.y};}
function readSpec(doc){const spec=doc?.pattern?doc:doc?.specification?.pattern?doc.specification:null;if(!spec||!spec.pattern?.panels)throw Error('JSON attendu : {pattern:{panels:{...},stitches:[...]},properties:{...}}.');return spec;}
function readCurve(edge,a,b,t,properties){const c=edge.curvature;if(!c)return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
 const control=Array.isArray(c)?c:(c.type==='quadratic'?c.params?.[0]:null);
 if(control){const p=properties.curvature_coords==='absolute'?{x:Number(control[0]),y:Number(control[1])}:pointRel(a,b,Number(control[0]),-Number(control[1]));return quadratic(a,p,b,t);}
 if(c.type==='cubic'&&c.params?.length===2){const p=c.params.map(c=>pointRel(a,b,Number(c[0]),-Number(c[1])));return cubic(a,p[0],p[1],b,t);}
 if(c.type==='circle')throw Error('Arc circulaire non pris en charge par ce moteur : utiliser un export rééchantillonné / SVG.');
 throw Error('Type de courbe GarmentCode non pris en charge : '+(c.type||'inconnu'));
}
function parse(doc,{samplesPerEdge=5}={}){
 const spec=readSpec(doc),props=spec.properties||{};
 if(!['relative',undefined,'absolute'].includes(props.curvature_coords))throw Error('Coordonnées de courbure inconnues');
 const unit=10*100/Number(props.units_in_meter||100); // data convention: cm => mm
 if(!Number.isFinite(unit)||unit<=0)throw Error('Unité métrique invalide');
 const panels=spec.pattern.panels,order=spec.pattern.panel_order||Object.keys(panels),draft=[];
 for(const name of order){if(name===null)continue;const pan=panels[name];if(!pan||!Array.isArray(pan.edges)||!pan.edges.length)continue;
  const pts=[],labels=[],map={};for(let i=0;i<pan.edges.length;i++){
   const edge=pan.edges[i],a0=pan.vertices[edge.endpoints[0]],b0=pan.vertices[edge.endpoints[1]];
   if(!a0||!b0)throw Error('Sommet manquant : '+name+', bord '+i);
   const a={x:Number(a0[0]),y:Number(a0[1])},b={x:Number(b0[0]),y:Number(b0[1])};
   map[i]=[];
   for(let k=0;k<samplesPerEdge;k++){
    const t=k/samplesPerEdge,p=readCurve(edge,a,b,t,props),v={x:p.x*unit,y:-p.y*unit,edge:'edge_'+i,index:pts.length};
    if(!Number.isFinite(v.x)||!Number.isFinite(v.y))throw Error('Coordonnées invalides : '+name);
    map[i].push(pts.length);pts.push(v);labels.push(v.edge);
   }
  }
  if(pts.length<3)continue;
  const minX=Math.min(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y));
  // Preserve the true 2D geometry + original 3D initial transform as metadata.
  const vertices=pts.map(p=>({x:p.x-minX,y:p.y-minY}));
  draft.push({id:String(name),label:String(name),role:/sleeve|manche/i.test(name)?'manche':/front|devant/i.test(name)?'devant':/back|dos/i.test(name)?'dos':/collar|neck|col/i.test(name)?'col':'autre',vertices,edgeLabels:labels,layout:{x:0,y:0},gcPlacement:{rotation:pan.rotation||[0,0,0],translation:(pan.translation||[0,0,0]).map(v=>Number(v)*unit),centering:[minX,minY],unitsMm:true},gcEdgeMap:map,source:{kind:'garmentcode-json',name},isCurveSampled:true});
 }
 const seams=[],failures=[],pairs=spec.pattern.stitches||[];
 pairs.forEach((pair,i)=>{
  if(!Array.isArray(pair)||pair.length!==2){failures.push('Paire #'+i+' incorrecte');return;}
  const [a,b]=pair,pa=draft.find(x=>x.id===a.panel),pb=draft.find(x=>x.id===b.panel);
  if(!pa||!pb||!pa.gcEdgeMap[a.edge]||!pb.gcEdgeMap[b.edge]){failures.push('Bord introuvable : couture '+i);return;}
  seams.push({id:'gcd_stitch_'+i,name:'GarmentCode '+a.panel+':'+a.edge+' ↔ '+b.panel+':'+b.edge,a:[a.panel,'edge_'+a.edge],b:[b.panel,'edge_'+b.edge],confirmed:true,explicit:true,provenance:'GarmentCode JSON : association fournie par la source',ease:0});
 });
 if(!draft.length)throw Error('Aucun panneau exploitable dans le JSON');
 // Lay out raw panels side-by-side for the existing mutation engine, without scaling.
 let xoff=0;for(const p of draft){p.layout={x:xoff,y:0};xoff+=Math.max(...p.vertices.map(v=>v.x))+60;}
 return {source:'GarmentCodeData JSON (local)',pieces:draft,seams,metadata:{panels:draft.length,explicitStitches:seams.length,invalidStitches:failures,unitsMm:true,provenance:'GarmentCode / GarmentCodeData specification schema',note:'Stitches are supplied, not predicted. Physics remains approximate.'}};
}
function seamStats(parsed){const result=[];for(const s of parsed.seams){const lens=s.a.concat(s.b).map((_,i)=>{const side=i===0?s.a:s.b,p=parsed.pieces.find(p=>p.id===side[0]);let len=0;if(!p)return NaN;const ids=p.edgeLabels.map((v,j)=>v===side[1]?j:-1).filter(j=>j>=0);for(let j=0;j<ids.length;j++){const a=p.vertices[ids[j]],b=p.vertices[(ids[j]+1)%p.vertices.length];len+=dist(a,b);}return len;});result.push({name:s.name,aMm:lens[0],bMm:lens[1],mismatchPercent:200*Math.abs(lens[0]-lens[1])/(lens[0]+lens[1]||1)});}return result;}
return {readSpec,parse,seamStats,readCurve,pointRel};
});
