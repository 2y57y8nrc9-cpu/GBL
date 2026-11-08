/* GBL V0.7 – explicit, inspectable geometric heuristics. NOT a trained neural network.
   Cut outlines cannot establish seam lines, notches or wearing fit alone.
   API is pure to support regression tests and user corrections. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLIntelligence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const box=pts=>{const x=pts.map(p=>p.x),y=pts.map(p=>p.y),minX=Math.min(...x),minY=Math.min(...y),maxX=Math.max(...x),maxY=Math.max(...y);return {x:minX,y:minY,w:maxX-minX,h:maxY-minY};};
function transformedVertices(vertices,rotation=0){const rad=(Number(rotation)||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad);return vertices.map(p=>({x:p.x*c-p.y*s,y:p.x*s+p.y*c}));}
function orientPiece(piece){const verts=transformedVertices(piece.vertices,piece.displayRotation||0),b=box(verts);return {vertices:verts,box:b};}
function nearest(points,x,y,exclude=[]){let best=0,bd=Infinity;for(let i=0;i<points.length;i++){if(exclude.includes(i))continue;const dd=(points[i].x-x)**2+(points[i].y-y)**2;if(dd<bd){bd=dd;best=i;}}return best;}
function pathRange(vs,start,end){const n=vs.length;if(start===end)return {start,end,indices:[],length:0};let i=start,route=[i],total=0;while(i!==end&&route.length<=n+1){const next=(i+1)%n;total+=d(vs[i],vs[next]);i=next;route.push(i);}return {start,end,indices:route,length:total};}
function shorterArc(vs,start,end){const n=vs.length,a=pathRange(vs,start,end),b=pathRange(vs,end,start);return a.length<=b.length?{start,end,indices:a.indices,length:a.length}:{start:end,end:start,indices:b.indices,length:b.length};}
function polygonSigned(vs){let n=0;for(let i=0;i<vs.length;i++){const p=vs[i],q=vs[(i+1)%vs.length];n+=p.x*q.y-q.x*p.y;}return n/2;}
function finiteGeometry(vs){return Array.isArray(vs)&&vs.length>=3&&vs.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y));}
function arcDefinition(p,role,confidence,source,refs){const v=p.vertices;const available=[];
 for(const [name,a,b] of refs){if(a===b)continue;const arc=shorterArc(v,a,b);if(arc.length<8)continue;available.push({name,start:arc.start,end:arc.end,lengthMm:arc.length,confidence,source});}
 return available;
}
function inferEdges(piece){const v=piece.vertices||[],role=piece.role||'autre';if(!finiteGeometry(v))return [];
 const B=box(v),near=(xx,yy,exclude=[])=>nearest(v,B.x+xx*B.w,B.y+yy*B.h,exclude);
 // The DRCOS-pattern family consists of half bodice panels laid sideways.
 // The ratio gate intentionally rejects other silhouettes to avoid false confidence.
 if(['devant','dos'].includes(role)&&B.w>B.h*1.58&&v.length>=35){
  const F=role==='devant',ref=F?{
   hemSide:near(0,0),sideUnderarm:near(.86,0),armPeak:near(1,.51),shoulderNeck:near(.92,.83),neckFold:near(.64,1),hemFold:near(0,1)
  }:{
   hemSide:near(0,1),sideUnderarm:near(.93,.86),armPeak:near(1,.49),shoulderNeck:near(.92,.16),neckFold:near(.64,0),hemFold:near(0,0)
  };
  return arcDefinition(piece,role,'moyenne','géométrie du demi-corsage',[
   ['côté',ref.hemSide,ref.sideUnderarm],['emmanchure',ref.sideUnderarm,ref.armPeak],
   ['épaule',ref.armPeak,ref.shoulderNeck],['encolure',ref.shoulderNeck,ref.neckFold],
   ['pli / milieu',ref.neckFold,ref.hemFold],['ourlet',ref.hemFold,ref.hemSide]
  ]);
 }
 if(role==='manche'&&B.h>B.w*1.3&&v.length>25){const pts={
  cuffUpper:near(1,0),capUpper:near(.60,.03),capCrown:near(0,.5),capLower:near(.60,.97),cuffLower:near(1,1)
 };return arcDefinition(piece,role,'moyenne','profil de manche',[
  ['tête de manche · dos',pts.capUpper,pts.capCrown],['tête de manche · devant',pts.capCrown,pts.capLower],
  ['dessous manche · dos',pts.cuffUpper,pts.capUpper],['dessous manche · devant',pts.capLower,pts.cuffLower],
  ['poignet',pts.cuffLower,pts.cuffUpper]
 ]);}
 if(role==='col'&&v.length>=4){const long=B.w>=B.h;const pts=long?[near(0,0),near(1,0),near(1,1),near(0,1)]:[near(1,0),near(1,1),near(0,1),near(0,0)];return arcDefinition(piece,role,'faible','bande rectangulaire',[
  ['bord à assembler',pts[0],pts[1]],['extrémité A',pts[1],pts[2]],['bord libre',pts[2],pts[3]],['extrémité B',pts[3],pts[0]]]);}
 // Unsupported patterns: suggest generic edge groups, explicitly without sewing-semantic claims.
 const candidates=[];const n=v.length,chunk=Math.max(3,Math.floor(n/6));for(let i=0;i<n;i+=chunk){let j=(i+chunk)%n;if(i!==j){const arc=shorterArc(v,i,j);if(arc.length>12)candidates.push({name:'bord non identifié '+(candidates.length+1),start:arc.start,end:arc.end,lengthMm:arc.length,confidence:'faible',source:'segmentation sans typologie'});}}
 return candidates;
}
const pairRules=[
 {name:'Épaule devant ↔ dos',a:'devant',ea:'épaule',b:'dos',eb:'épaule'},
 {name:'Côté devant ↔ dos',a:'devant',ea:'côté',b:'dos',eb:'côté'},
 {name:'Emmanchure devant ↔ tête de manche avant',a:'devant',ea:'emmanchure',b:'manche',eb:'tête de manche · devant',sleeve:true},
 {name:'Emmanchure dos ↔ tête de manche arrière',a:'dos',ea:'emmanchure',b:'manche',eb:'tête de manche · dos',sleeve:true},
 {name:'Dessous de manche',a:'manche',ea:'dessous manche · devant',b:'manche',eb:'dessous manche · dos',self:true}
];
function suggestAssembly(pieces,edgesByPiece){const byRole=role=>pieces.filter(p=>p.role===role),out=[];
 for(const rule of pairRules){const A=byRole(rule.a),B=byRole(rule.b);if(!A.length||!B.length)continue;
  const a=A[0],b=B[0],ea=(edgesByPiece[a.id]||[]).find(q=>q.name===rule.ea),eb=(edgesByPiece[b.id]||[]).find(q=>q.name===rule.eb);if(!ea||!eb)continue;
  const diff=100*Math.abs(ea.lengthMm-eb.lengthMm)/Math.max(ea.lengthMm,eb.lengthMm,1);const limit=rule.sleeve?12:6;
  const status=diff<=limit?'à valider':diff<=25?'écart important':'incompatible sans modification';
  out.push({id:'proposal_'+out.length,name:rule.name,a:{piece:a.id,...ea},b:{piece:b.id,...eb},differencePct:diff,status,confidence:diff<=limit?'moyenne':'faible',sleeve:Boolean(rule.sleeve),self:Boolean(rule.self),isCutEdge:true});
 }
 const necks=['devant','dos'].map(role=>{const p=byRole(role)[0];return p&&{piece:p,edge:(edgesByPiece[p.id]||[]).find(e=>e.name==='encolure')};}).filter(x=>x&&x.edge);
 const collars=byRole('col');if(collars.length&&necks.length){const collar=collars[0],edge=(edgesByPiece[collar.id]||[]).find(e=>e.name==='bord à assembler');if(edge){const combined=necks.reduce((sum,x)=>sum+x.edge.lengthMm,0);out.push({id:'proposal_neckband',name:'Bande de col ↔ encolures devant + dos',a:{piece:collar.id,...edge},b:null,combinedLengthMm:combined,differencePct:100*Math.abs(edge.lengthMm-combined)/Math.max(1,combined),status:'à répartir en deux raccords',confidence:'faible',requiresSplit:true,notes:'La bande de col doit être divisée en segments et interprétée selon son élasticité, son pli et les marges.'});}}
 return out;
}
function segmentsIntersect(a,b,c,d0){const cr=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x),v1=cr(a,b,c),v2=cr(a,b,d0),v3=cr(c,d0,a),v4=cr(c,d0,b);return ((v1>1e-7&&v2< -1e-7)||(v1< -1e-7&&v2>1e-7))&&((v3>1e-7&&v4< -1e-7)||(v3< -1e-7&&v4>1e-7));}
function intersections(points){if(!finiteGeometry(points))return Infinity;const n=points.length,step=Math.max(1,Math.ceil(n/450));const vs=points.filter((_,i)=>i%step===0),m=vs.length;let count=0;for(let i=0;i<m;i++)for(let j=i+2;j<m;j++){if(i===0&&j===m-1)continue;if(segmentsIntersect(vs[i],vs[(i+1)%m],vs[j],vs[(j+1)%m]))count++;}return count;}
function area(vs){return Math.abs(polygonSigned(vs));}
function minEdge(vs){let min=Infinity;for(let i=0;i<vs.length;i++){const x=d(vs[i],vs[(i+1)%vs.length]);if(x>1e-6)min=Math.min(min,x);}return min;}
function diagnostic(result,{fabric="woven"}={}){if(!result||!Array.isArray(result.pieces))return {status:'inconnu',score:0,flags:[{severity:'danger',text:'Aucune géométrie mutée.'}]};
 const flags=[];let fatal=false,review=false;const originalById=new Map((result.original||[]).map(p=>[p.id,p]));
 for(const p of result.pieces){const vs=p.pts||p.vertices,base=originalById.get(p.id),ov=base&&(base.pts||base.vertices);if(!finiteGeometry(vs)){fatal=true;flags.push({severity:'danger',text:`${p.id} : points invalides.`});continue;}
  const cross=intersections(vs),baseCross=ov?intersections(ov):0;
  if(cross>0){fatal=true;flags.push({severity:'danger',text:`${p.id} : ${cross} auto-intersection(s) (${baseCross} à l'origine).`});}
  const a=area(vs),ao=ov?area(ov):a,ratio=ao>1?a/ao:1;
  if(a<50||ratio<.22){fatal=true;flags.push({severity:'danger',text:`${p.id} : surface réduite ou effondrée (${Math.round(ratio*100)} % de l'original).`});}
  else if(ratio>2.4||ratio<.6){review=true;flags.push({severity:'warning',text:`${p.id} : surface modifiée de ${Math.round((ratio-1)*100)} %. Toile nécessaire.`});}
  const min=minEdge(vs),origMin=ov?minEdge(ov):min;if(min<.35&&origMin>1.5){review=true;flags.push({severity:'warning',text:`${p.id} : segment nouveau très court, point singulier possible.`});}
 }
 for(const pair of result.seams||[]){const get=(id,tag)=>{const p=result.pieces.find(x=>x.id===id),pts=p?.pts;if(!pts)return 0;let len=0;for(let i=0;i<pts.length;i++)if(pts[i].edge===tag)len+=d(pts[i],pts[(i+1)%pts.length]);return len;};
  const la=get(...pair.a),lb=get(...pair.b);if(la<=0||lb<=0){review=true;flags.push({severity:'warning',text:`${pair.id} : couture manquante après mutation.`});continue;}
  const error=100*Math.abs(la-lb)/Math.max(la,lb);
  // Exploratory thresholds, not standardized material mechanics.
  const limits={woven:pair.sleeve?12:6,jersey:pair.sleeve?18:10,rigid:pair.sleeve?6:3};const limit=limits[fabric]??limits.woven;
  if(error>25){fatal=true;flags.push({severity:'danger',text:`${pair.id} : écart de couture ${error.toFixed(1)} %, montage sans correction improbable.`});}
  else if(error>limit){review=true;flags.push({severity:'warning',text:`${pair.id} : écart de couture ${error.toFixed(1)} %, recalcule l'aisance et les repères.`});}
 }
 if(result.ghosts?.length){review=true;flags.push({severity:'warning',text:'Volumes fantômes : aucune pièce physique définie pour ces éléments.'});}
 if(!flags.length)flags.push({severity:'info',text:'Les contrôles géométriques élémentaires passent ; coupe, tissu et tombé restent non validés.'});
 return {status:fatal?'reconstruction nécessaire':review?'toile expérimentale':'géométrie plausible',score:fatal?15:review?55:80,flags,notProductionReady:true,fabric,method:'heuristiques géométriques (sans modèle entraîné ni simulation textile)',cutLineWarning:'Les contours extraits du PDF peuvent représenter la ligne de coupe, non la ligne de couture.'};
}
return {transformedVertices,orientPiece,box,inferEdges,suggestAssembly,pairRules,diagnostic,intersections,polygonSigned,shorterArc};
});
