/* Garment Bending Lab V0.8 · deterministic 2D seam-length equalizer.
   Operates on CUT-LINE arcs, not certified stitch-lines. Preserves originals and
   makes every correction explicit. Not an automatic garment-fit solution. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLStitchFit=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const length=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function getEdge(p,tag){if(!p?.pts?.length)return null;const pts=p.pts,n=pts.length,ids=[];
 for(let i=0;i<n;i++)if(pts[i].edge===tag)ids.push(i);
 if(!ids.length)return null;
 const starts=ids.filter(i=>pts[(i-1+n)%n].edge!==tag);
 if(starts.length!==1)return null; // disconnected or entire perimeter: not an identified stitch arc
 const seq=[starts[0]];let i=starts[0];for(let guard=0;guard<n;guard++){
  if(pts[i].edge!==tag)break;i=(i+1)%n;seq.push(i);
 }
 if(seq.length<3||seq.length>n)return null;
 const dist=seq.slice(1).reduce((acc,_,j)=>acc+length(pts[seq[j]],pts[seq[j+1]]),0);
 return {indices:seq,lengthMm:dist,first:pts[seq[0]],last:pts[seq.at(-1)]};
}
function mismatch(a,b,ease=0){const target=a*(1+ease);return 100*Math.abs(b-target)/Math.max(1,(b+target)/2);}
function metrics(pieces,seams){const byId=id=>pieces.find(p=>p.id===id);
 return seams.map(pair=>{const a=getEdge(byId(pair.a[0]),pair.a[1]);const b=getEdge(byId(pair.b[0]),pair.b[1]);const ease=clamp(Number(pair.ease||0)/100,-.05,.12);
 return {id:pair.id,hasEdges:Boolean(a&&b),lengthA:a?.lengthMm||0,lengthB:b?.lengthMm||0,easePct:ease*100,mismatchPct:a&&b?mismatch(a.lengthMm,b.lengthMm,ease):null};
 });
}
function perimeterDistances(pts,edgeIndices){const n=pts.length,edgeSet=new Set(edgeIndices),distance=Array(n).fill(Infinity),nearest=Array(n).fill(-1);
 // Geodesic search along contour from seam endpoints, not across an adjacent fold.
 const seeds=[edgeIndices[0],edgeIndices.at(-1)];
 for(const seed of seeds)for(const dir of [-1,1]){
  let prev=seed,d=0;
  for(let step=0;step<n;step++){
   if(step>0 && edgeSet.has(prev))break;
   if(d<distance[prev]){distance[prev]=d;nearest[prev]=seed;}
   const next=(prev+dir+n)%n;
   if(edgeSet.has(next)&&next!==seed)break;
   d+=length(pts[prev],pts[next]);prev=next;
  }
 }
 return {distance,nearest};
}
function scaleEdge(piece,tag,scale,{fadeMm=65,maxShiftMm=130}={}){
 const edge=getEdge(piece,tag);if(!edge)return {ok:false,reason:'Bord introuvable ou discontinu'};
 if(!Number.isFinite(scale)||scale<=0||scale>4)return {ok:false,reason:'Rapport d’échelle invalide'};
 const pts=piece.pts,before=pts.map(p=>({x:p.x,y:p.y})),mid={x:(edge.first.x+edge.last.x)/2,y:(edge.first.y+edge.last.y)/2};
 const moved=new Map(),arc=new Set(edge.indices);
 let furthest=0;
 for(const i of edge.indices){const p=pts[i],dx=(p.x-mid.x)*(scale-1),dy=(p.y-mid.y)*(scale-1);const change=Math.hypot(dx,dy);furthest=Math.max(furthest,change);moved.set(i,{dx,dy});}
 if(furthest>maxShiftMm)return {ok:false,reason:'Déplacement maximal '+furthest.toFixed(1)+' mm > seuil '+maxShiftMm+' mm'};
 const geo=perimeterDistances(pts,edge.indices);
 const aIdx=edge.indices[0],bIdx=edge.indices.at(-1);
 // Add the same endpoint displacement to neighbouring perimeter points,
 // tapered by distance ALONG that perimeter. Keep seam points exact.
 for(let i=0;i<pts.length;i++){
  if(arc.has(i)){pts[i].x=before[i].x+moved.get(i).dx;pts[i].y=before[i].y+moved.get(i).dy;continue;}
  const start=geo.nearest[i];if(start<0)continue;
  const w=Math.exp(-Math.pow(geo.distance[i]/Math.max(1,fadeMm),2)*1.15);
  const delta=moved.get(start===aIdx? aIdx:bIdx);
  pts[i].x=before[i].x+delta.dx*w;pts[i].y=before[i].y+delta.dy*w;
 }
 return {ok:true,maxShiftMm:furthest,scale,edgeLengthBefore:edge.lengthMm,edgeLengthAfter:getEdge(piece,tag)?.lengthMm};
}
function polygonCrossings(points){const sample=points.length>340?points.filter((_,i)=>i%Math.ceil(points.length/340)===0):points;
 const orient=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);let n=0;
 for(let i=0;i<sample.length;i++)for(let j=i+2;j<sample.length;j++){
  if(i===0&&j===sample.length-1)continue;
  const a=sample[i],b=sample[(i+1)%sample.length],c=sample[j],d=sample[(j+1)%sample.length];
  const z=[orient(a,b,c),orient(a,b,d),orient(c,d,a),orient(c,d,b)];
  if(z[0]*z[1]<-1e-8&&z[2]*z[3]<-1e-8)n++;
 }return n;
}
function fit(pieces,seams,options={}){
 const cfg={strategy:options.strategy==='receiver'?'receiver':'balanced',limitPercent:clamp(Number(options.limitPercent??18),1,65),fadeMm:clamp(Number(options.fadeMm??62),15,180),maxShiftMm:clamp(Number(options.maxShiftMm??110),15,300),iterations:clamp(Math.round(options.iterations??3),1,5),allowRewired:Boolean(options.allowRewired)};
 const working=pieces.map(p=>({...p,pts:p.pts.map(q=>({...q}))}));
 const initial=metrics(working,seams),flags=[];const byId=id=>working.find(p=>p.id===id);
 const edgeBudget=new Map();for(const pair of seams)for(const [id,tag] of [pair.a,pair.b]){const key=id+'::'+tag;if(!edgeBudget.has(key)){const edge=getEdge(byId(id),tag);if(edge)edgeBudget.set(key,edge.lengthMm);}}
 function allowedRatio(id,tag,current,wished){const initial=edgeBudget.get(id+'::'+tag)||current;
  const min=initial*(1-cfg.limitPercent/100),max=initial*(1+cfg.limitPercent/100);
  return clamp(wished,min,max)/Math.max(.001,current);
 }
 const counts=new Map(working.map(p=>[p.id,polygonCrossings(p.pts)]));
 for(let pass=0;pass<cfg.iterations;pass++)for(const pair of seams){
  if(pair.rewired&&!cfg.allowRewired){if(pass===0)flags.push({id:pair.id,status:'ignoré',reason:'Coutures réassignées volontairement : à confirmer avant égalisation.'});continue;}
  if(pair.confirmed===false){if(pass===0)flags.push({id:pair.id,status:'ignoré',reason:'Raccord non confirmé.'});continue;}
  const pa=byId(pair.a[0]),pb=byId(pair.b[0]),ea=getEdge(pa,pair.a[1]),eb=getEdge(pb,pair.b[1]);
  if(!ea||!eb){if(pass===0)flags.push({id:pair.id,status:'ignoré',reason:'Tronçon de couture manquant, discontinu ou trop court.'});continue;}
  const ease=clamp(Number(pair.ease||0)/100,-.05,.12),La=ea.lengthMm,Lb=eb.lengthMm;
  if(La<8||Lb<8)continue;
  const goalA=cfg.strategy==='balanced'?Math.sqrt(La*Lb/(1+ease)):La;
  const goalB=goalA*(1+ease);
  const scaleA=allowedRatio(pa.id,pair.a[1],La,goalA);
  const scaleB=allowedRatio(pb.id,pair.b[1],Lb,goalB);
  const snapshots=new Map([[pa.id,pa.pts.map(q=>({...q}))],[pb.id,pb.pts.map(q=>({...q}))]]);
  const a=cfg.strategy==='receiver'?{ok:true,maxShiftMm:0}:scaleEdge(pa,pair.a[1],scaleA,cfg);
  const b=a.ok?scaleEdge(pb,pair.b[1],scaleB,cfg):{ok:false,reason:a.reason};
  if(!a.ok||!b.ok){for(const [id,snap] of snapshots)byId(id).pts=snap;if(pass===0)flags.push({id:pair.id,status:'bloqué',reason:a.ok?b.reason:a.reason});continue;}
  let crosses=false;
  for(const [id] of snapshots){const now=polygonCrossings(byId(id).pts);if(now>counts.get(id)){crosses=true;break;}}
  if(crosses){for(const [id,snap] of snapshots)byId(id).pts=snap;if(pass===0)flags.push({id:pair.id,status:'bloqué',reason:'Correction annulée : nouvelle auto-intersection.'});continue;}
 }
 const after=metrics(working,seams),rows=initial.map((b,i)=>{
  const a=after[i],flag=flags.find(x=>x.id===a.id);
  const status=flag?.status||(a.mismatchPct===null?'ignoré':a.mismatchPct<.8?'égalé':a.mismatchPct<5?'partiel':'écart restant');
  return {...a,initialMismatchPct:b.mismatchPct,status,reason:flag?.reason||(status==='partiel'||status==='écart restant'?'Correction plafonnée ou raccords concurrents : contrôler la forme globale.':''),residualMm:a.hasEdges?Math.abs(a.lengthB-a.lengthA*(1+a.easePct/100)):null};
 });
 const maxBefore=Math.max(0,...initial.map(x=>x.mismatchPct??0)),maxAfter=Math.max(0,...after.map(x=>x.mismatchPct??0));
 return {pieces:working,rows,options:cfg,maxBefore,maxAfter,changed:rows.some(r=>r.initialMismatchPct!==null&&r.mismatchPct!==null&&r.mismatchPct<r.initialMismatchPct-.001)};
}
return {fit,metrics,getEdge,scaleEdge,mismatch,polygonCrossings};
});
