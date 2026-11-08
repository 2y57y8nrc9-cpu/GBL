/* Garment Bending Lab V0.9 / autonomous, conservative stitch planning.
 * Rules are inspectable heuristics, NOT machine learning or production sewing certification.
 * No ambiguous pairing is silently accepted. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLAuto=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const LIMITS={
  conservative:{shoulder:6,side:7,sleeve:9,underarm:7,other:4,maxFit:8},
  experimental:{shoulder:12,side:18,sleeve:20,underarm:13,other:8,maxFit:18}
};
function typology(proposal){const n=proposal.name.toLowerCase();if(n.includes('épaule'))return 'shoulder';if(n.includes('côté'))return 'side';if(n.includes('emmanchure'))return 'sleeve';if(n.includes('dessous'))return 'underarm';return 'other';}
function stableEndpoints(p){return Array.isArray(p?.vertices)&&p.vertices.length>=3&&p.vertices.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y));}
function plan(pieces,Intelligence,mode='conservative'){
 const limits=LIMITS[mode]||LIMITS.conservative;
 const edges=Object.fromEntries(pieces.map(p=>[p.id,Intelligence.inferEdges(p)]));
 const front=pieces.find(p=>p.role==='devant'),back=pieces.find(p=>p.role==='dos');
 const safeBodyPair=front&&back&&((a,b)=>{const bb=x=>({w:Math.max(...x.map(q=>q.x))-Math.min(...x.map(q=>q.x)),h:Math.max(...x.map(q=>q.y))-Math.min(...x.map(q=>q.y))});const u=bb(a.vertices),v=bb(b.vertices);return Math.abs(u.w-v.w)/Math.max(u.w,v.w)<.3&&Math.abs(u.h-v.h)/Math.max(u.h,v.h)<.3;})(front,back);
 const suggestions=Intelligence.suggestAssembly(pieces,edges);
 const approved=[],review=[],blocked=[];
 const used=new Set();
 for(const suggestion of suggestions){
  const type=typology(suggestion), a=suggestion.a,b=suggestion.b;
  const aPiece=pieces.find(p=>p.id===a?.piece),bPiece=pieces.find(p=>p.id===b?.piece);
  const reasons=[];
  if(suggestion.requiresSplit||!b)reasons.push('Raccord multi-pièces non modélisé automatiquement (col / encolures).');
  if(['shoulder','side','sleeve'].includes(type)&&!safeBodyPair)reasons.push('Famille de vêtement inconnue ou devant/dos incompatibles : assemblage automatique refusé.');
  if(!aPiece||!stableEndpoints(aPiece)||(b&&!bPiece)||(bPiece&&!stableEndpoints(bPiece)))reasons.push('Géométrie incomplète.');
  if(a?.lengthMm<15||b?.lengthMm<15)reasons.push('Segment trop court pour une couture structurelle.');
  if(!Number.isFinite(suggestion.differencePct))reasons.push('Longueurs non mesurables.');
  const k1=a&&a.piece+'|'+a.name,k2=b&&b.piece+'|'+b.name;
  if(used.has(k1)||used.has(k2))reasons.push('Bord déjà réservé par une autre liaison.');
  const max=limits[type];
  let status='accepted';
  if(reasons.length)status='blocked';
  else if(suggestion.differencePct>max)status='review';
  const result={...suggestion,edgeKind:type,approval:status,limitPct:max,
   reason:reasons.join(' ')||(status==='review'?'Écart '+suggestion.differencePct.toFixed(1)+' % au-dessus du seuil '+max+' % ; couture non forcée.':'Association géométrique provisoire, à contrôler sur les lignes de piqûre.')};
  if(status==='accepted'){used.add(k1);used.add(k2);approved.push(result);}
  else if(status==='review')review.push(result);
  else blocked.push(result);
 }
 const missingRoles=Array.from(new Set(pieces.filter(p=>p.role==='autre').map(p=>p.id)));
 const total=suggestions.length,score=total?Math.round(100*approved.length/total):0;
 const metadata={pieceCount:pieces.length,accepted:approved.length,review:review.length,blocked:blocked.length,score,recognizedFamily:safeBodyPair?'corsage compatible / T-shirt probable':'famille non validée',
  status:review.length||blocked.length?'partiel':approved.length?'provisoire complet':'sans liaison',
  warnings:[...missingRoles.map(id=>`Pièce ${id} sans typologie reconnue`),
   ...(approved.length===0?['Aucune association sûre : l’outil ne fabrique pas de raccord arbitraire.']:[])]};
 return {edges,suggestions,approved,review,blocked,metadata,mode};
}
function commit(plan,pieces,Seams){
 const work=pieces.map(p=>({...p,edgeLabels:[...(p.edgeLabels||p.vertices.map(()=>'contour'))]})),links=[],failure=[];
 for(const suggestion of plan.approved){
  const a=work.find(p=>p.id===suggestion.a.piece),b=work.find(p=>p.id===suggestion.b.piece);
  if(!a||!b){failure.push(suggestion.name+': pièce absente');continue;}
  const id='inferred_'+(links.length+1),prevA=[...a.edgeLabels],prevB=a===b?null:[...b.edgeLabels];
  try{
   const ea=Seams.markEdge(a,suggestion.a.start,suggestion.a.end,id+'_A');
   const eb=Seams.markEdge(b,suggestion.b.start,suggestion.b.end,id+'_B');
   links.push({id,name:suggestion.name,a:[a.id,ea.edge],b:[b.id,eb.edge],
    confirmed:true,autoInferred:true,approval:'provisional',sleeve:!!suggestion.sleeve,ease:0,
    provenance:'inférence géométrique V0.9 · validité de couture non garantie',initialMismatch:suggestion.differencePct});
  }catch(e){a.edgeLabels=prevA;if(prevB)b.edgeLabels=prevB;failure.push(suggestion.name+': '+e.message);}
 }
 return {pieces:work,seams:links,failed:failure};
}
return {LIMITS,plan,commit,typology};
});
