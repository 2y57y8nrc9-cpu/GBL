/* GBL V0.6 · pattern-piece proposals, editable stitch arcs, and constraint propagation.
   No claim of automatic sewing-semantic recognition: provenance and confirmation remain visible. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLSeams=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const bb=p=>{const xx=p.map(q=>q.x),yy=p.map(q=>q.y);return {x:Math.min(...xx),y:Math.min(...yy),w:Math.max(...xx)-Math.min(...xx),h:Math.max(...yy)-Math.min(...yy)};};
const polygonArea=pts=>Math.abs(pts.reduce((a,p,i)=>{const q=pts[(i+1)%pts.length];return a+p.x*q.y-q.x*p.y;},0)/2);
function proposePieces(paths,PDF){
 const all=paths.map((p,i)=>({p,index:i,box:p.bbox||PDF.bbox(p.points),gap:dist(p.points[0],p.points.at(-1))*PDF.PT2MM}));
 const loops=all.filter(x=>x.gap<.8&&x.p.length*PDF.PT2MM>420&&Math.min(x.box.w,x.box.h)*PDF.PT2MM>28);
 loops.sort((a,b)=>polygonArea(b.p.points)-polygonArea(a.p.points));
 const kept=[];
 for(const a of loops){
  const A=a.box;
  const near=kept.some(k=>{const B=k.box;
    const dx=Math.abs(A.x-B.x)*PDF.PT2MM,dy=Math.abs(A.y-B.y)*PDF.PT2MM;
    const dw=Math.abs(A.w-B.w)*PDF.PT2MM,dh=Math.abs(A.h-B.h)*PDF.PT2MM;
    return dx<22&&dy<22&&dw<35&&dh<35;
  });
  if(!near)kept.push(a);
 }
 const body=kept.filter(x=>x.box.w*PDF.PT2MM>330&&x.box.h*PDF.PT2MM>100).sort((a,b)=>a.box.y-b.box.y);
 return kept.sort((a,b)=>a.index-b.index).map((x)=>{
   const w=x.box.w*PDF.PT2MM,h=x.box.h*PDF.PT2MM;
   let role='autre',confidence='faible';
   if(body.includes(x)){role=body.indexOf(x)===0?'dos':'devant';confidence='moyenne';}
   else if(h>180&&w<270&&h>w*1.12){role='manche';confidence='moyenne';}
   else if(w>h*3.2&&h<110){role='col';confidence='moyenne';}
   return {index:x.index,role,confidence,perimeterMm:x.p.length*PDF.PT2MM,boxMm:{x:x.box.x*PDF.PT2MM,y:x.box.y*PDF.PT2MM,w,h}};
 });
}
function shortestArc(vertices,start,end){
 const n=vertices.length;if(n<3||start===end)throw Error('Choisis deux points distincts du contour.');
 function walk(dir){const edges=[];let length=0,cur=start,guard=0;
  while(cur!==end&&guard++<n){const next=(cur+dir+n)%n,edge=dir===1?cur:next;
   length+=dist(vertices[cur],vertices[next]);edges.push(edge);cur=next;
  }
  return {edges,length};
 }
 const forward=walk(1),reverse=walk(-1);
 return forward.length<=reverse.length?forward:reverse;
}
function markEdge(piece,start,end,label){
 if(!piece?.vertices||!piece?.edgeLabels)throw Error('Pièce sans contour géométrique.');
 const arc=shortestArc(piece.vertices,start,end);
 const old=new Set(arc.edges.map(i=>piece.edgeLabels[i]).filter(x=>x!=='contour'));
 if(old.size)throw Error('Ce tronçon chevauche une couture déjà attribuée : '+[...old].join(', '));
 arc.edges.forEach(i=>piece.edgeLabels[i]=label);
 return {piece:piece.id,edge:label,start,end,indices:arc.edges,lengthMm:arc.length};
}
function nearestVertex(vertices,p){let best=0,d=Infinity;vertices.forEach((v,i)=>{const e=dist(v,p);if(e<d){best=i;d=e;}});return {index:best,distanceMm:d};}
function indexedEdge(piece,label){const pts=piece.pts||piece.vertices.map((q,i)=>({...q,edge:piece.edgeLabels[i]}));
 const n=pts.length;const ids=[];for(let i=0;i<n;i++)if(pts[i].edge===label)ids.push(i);
 if(!ids.length)return null;
 // A semantic edge can wrap across the polygon's index-zero seam.
 let start=ids[0];for(const i of ids)if(pts[(i-1+n)%n].edge!==label){start=i;break;}
 const seq=[start];let j=start;while(pts[j].edge===label){j=(j+1)%n;seq.push(j);if(seq.length>n)break;}
 return {indices:seq,points:seq.map(i=>pts[i]),length:seq.slice(1).reduce((a,_,i)=>a+dist(pts[seq[i]],pts[seq[i+1]]),0)};
}
function resampleAt(points,t){const lengths=[0];for(let i=1;i<points.length;i++)lengths.push(lengths[i-1]+dist(points[i-1],points[i]));const total=lengths.at(-1)||1,target=t*total;
 for(let i=1;i<points.length;i++)if(lengths[i]>=target){const z=(target-lengths[i-1])/(lengths[i]-lengths[i-1]||1);return {x:points[i-1].x+(points[i].x-points[i-1].x)*z,y:points[i-1].y+(points[i].y-points[i-1].y)*z};}
 return {...points.at(-1)};
}
function arcPoints(vertices,start,end){
 const a=shortestArc(vertices,start,end),dir=a.edges[0]===start?1:-1,points=[vertices[start]];
 let i=start;for(let n=0;n<vertices.length&&i!==end;n++){i=(i+dir+vertices.length)%vertices.length;points.push(vertices[i]);}
 return {points,length:a.length};
}
function curveSignature(points){
 const first=points[0],last=points.at(-1),dx=last.x-first.x,dy=last.y-first.y,den=Math.hypot(dx,dy)||1;
 return [.2,.4,.6,.8].map(t=>{const p=resampleAt(points,t);return ((p.x-first.x)*(-dy)+(p.y-first.y)*dx)/(den*den);});
}
function suggestPartner(sourcePiece,start,end,otherPieces){
 const source=arcPoints(sourcePiece.vertices,start,end),sig=curveSignature(source.points);const proposals=[];
 for(const p of otherPieces){if(p.id===sourcePiece.id)continue;
  const n=p.vertices.length,step=Math.max(1,Math.floor(n/65));let best=null;
  for(let i=0;i<n;i+=step){for(let count=3;count<Math.min(n/2,Math.max(8,Math.round(n*.65)));count+=step){
   for(const dir of [1,-1]){
    const j=(i+dir*count+n*2)%n;if(i===j)continue;
    const arc=arcPoints(p.vertices,i,j);
    const ld=Math.abs(arc.length-source.length)/(source.length||1);if(ld>.22)continue;
    const otherSig=curveSignature(arc.points);
    const err=Math.min(
      otherSig.reduce((acc,v,k)=>acc+Math.pow(v-sig[k],2),0),
      otherSig.reduce((acc,v,k)=>acc+Math.pow(v+sig[k],2),0)
    );
    let rolePenalty=.20;
    if((sourcePiece.role==='devant'||sourcePiece.role==='dos')&&p.role==='manche')rolePenalty=-.08;
    if((sourcePiece.role==='devant'||sourcePiece.role==='dos')&&(p.role==='dos'||p.role==='devant'))rolePenalty=0;
    const score=ld*2+Math.sqrt(err)+rolePenalty;
    if(!best||score<best.score)best={pieceId:p.id,start:i,end:j,lengthMm:arc.length,score,relativeLengthError:ld};
   }
  }}
  if(best)proposals.push(best);
 }
 return proposals.sort((a,b)=>a.score-b.score);
}
function conformPair(byId,pair,{ease=0,fadeMm=42}={}){
 const pa=byId(pair.a[0]),pb=byId(pair.b[0]);if(!pa||!pb)return {ok:false,reason:'Pièce absente'};
 const sa=indexedEdge(pa,pair.a[1]),sb=indexedEdge(pb,pair.b[1]);if(!sa||!sb||sa.indices.length<3||sb.indices.length<3)return {ok:false,reason:'Couture absente ou trop courte'};
 const src=sa.points, dst=sb.points,srcFirst=src[0],srcLast=src.at(-1),dstFirst=dst[0],dstLast=dst.at(-1);
 const angle=Math.atan2(dstLast.y-dstFirst.y,dstLast.x-dstFirst.x)-Math.atan2(srcLast.y-srcFirst.y,srcLast.x-srcFirst.x);
 const cos=Math.cos(angle),sin=Math.sin(angle),factor=1+ease;
 const rot=q=>{const x=q.x-srcFirst.x,y=q.y-srcFirst.y;return {x:dstFirst.x+(x*cos-y*sin)*factor,y:dstFirst.y+(x*sin+y*cos)*factor};};
 const original=pb.pts.map(p=>({...p})), originalSeam=dst.map(p=>({...p}));
 const out=sb.indices.map((idx,i)=>{
   const t=i/(sb.indices.length-1);return rot(resampleAt(src,t));
 });
 // Soften the rest of the *same panel* around the sewn edge; never modify the source.
 // Prevent huge relocations where the source and receiver are geometrically incompatible.
 const endpointShift=dist(dstLast,out.at(-1));
 if(endpointShift>Math.max(80,sa.length*.50))return {ok:false,reason:'Incompatibilité de chordes : déplacement de '+endpointShift.toFixed(1)+' mm'};
 const sewn=new Set(sb.indices);
 for(let i=0;i<pb.pts.length;i++){
  if(sewn.has(i))continue;
  const old=original[i];let best=Infinity,shift=null;
  for(let k=0;k<originalSeam.length;k++){
   const d=dist(old,originalSeam[k]);if(d<best){best=d;shift={x:out[k].x-originalSeam[k].x,y:out[k].y-originalSeam[k].y};}
  }
  const weight=.45*Math.exp(-Math.pow(best/fadeMm,2));pb.pts[i].x=old.x+shift.x*weight;pb.pts[i].y=old.y+shift.y*weight;
 }
 sb.indices.forEach((idx,i)=>{pb.pts[idx].x=out[i].x;pb.pts[idx].y=out[i].y;});
 return {ok:true,source:sa.length,target:indexedEdge(pb,pair.b[1]).length,endpointShiftMm:endpointShift};
}
function propagate(pieces,seams,{fadeMm=42}={}){
 const byId=id=>pieces.find(p=>p.id===id);const events=[];
 for(const pair of seams){const r=conformPair(byId,pair,{ease:Number(pair.ease||0)/100,fadeMm});
  events.push({id:pair.id,...r});
 }
 return events;
}
return {proposePieces,markEdge,shortestArc,nearestVertex,indexedEdge,conformPair,propagate,suggestPartner,arcPoints};
});
