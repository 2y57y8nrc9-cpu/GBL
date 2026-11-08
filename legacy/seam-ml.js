/* Linear ranker interface for seam-pair models learned from GarmentCodeData specifications.
   It DOES NOT override existing trusted stitches. All predictions remain diagnostic.
*/
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLSeamML=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const numeric=x=>Number(x)||0;
function sigmoid(z){return z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));}
function validate(model){if(model.schema!=='gbl.seam-pair-linear.v1'||model.coefficients?.length!==8||model.features?.length!==8||model.normalization?.mean?.length!==8||model.normalization?.std?.length!==8)throw Error('Modèle incompatible : attendu gbl.seam-pair-linear.v1 avec huit features');return model;}
function pairFeatures(doc,a,b){const spec=doc.pattern?.panels?doc:doc.specification||doc;
 const props=spec.properties||{},panels=spec.pattern.panels,scale=100/numeric(props.units_in_meter||100);
 const query=q=>{const p=panels[q.panel],e=p.edges[q.edge],u=p.vertices[e.endpoints[0]],v=p.vertices[e.endpoints[1]],P=u.map(x=>numeric(x)*scale),Q=v.map(x=>numeric(x)*scale);return {mid:[(P[0]+Q[0])/2,(P[1]+Q[1])/2,0],v:[Q[0]-P[0],Q[1]-P[1]],cur:e.curvature,trans:(p.translation||[0,0,0]).map(x=>numeric(x)*scale)};};
 const u=query(a),v=query(b),l1=Math.hypot(...u.v),l2=Math.hypot(...v.v);
 const mag=k=>!k?0:Array.isArray(k)?Math.abs(numeric(k[1])):.3;
 const m1=mag(u.cur),m2=mag(v.cur);
 const d3=Math.hypot(...[0,1,2].map(i=>u.mid[i]+u.trans[i]-(v.mid[i]+v.trans[i])));
 return [Math.abs(l1-l2)/Math.max(l1,l2),Math.abs(l1-l2)/(l1+l2),Math.abs(m1-m2),Math.log1p((l1+l2)/2),Math.min(10,d3/(l1+l2)),Number(a.panel===b.panel),Number(m1>.02&&m2>.02),Math.abs((u.v[0]*v.v[0]+u.v[1]*v.v[1])/(l1*l2))];
}
function score(model,features){validate(model);if(features.some(x=>!Number.isFinite(x)))return 0;return sigmoid(features.reduce((z,v,i)=>z+((v-model.normalization.mean[i])/(model.normalization.std[i]||1))*model.coefficients[i],model.intercept));}
function evaluate(model,doc,{threshold=.5}={}){
 validate(model);const spec=doc.pattern?.panels?doc:doc.specification||doc,panels=spec.pattern.panels,all=[];
 for(const [name,p] of Object.entries(panels))for(let i=0;i<p.edges.length;i++)all.push({panel:name,edge:i});
 if(all.length>150)throw Error('Trop de bords pour évaluer toutes les paires dans le navigateur');
 const key=(a,b)=>[a.panel+':'+a.edge,b.panel+':'+b.edge].sort().join('|');const truth=new Set((spec.pattern.stitches||[]).filter(v=>Array.isArray(v)&&v.length===2).map(v=>key(v[0],v[1])));
 let tp=0,fp=0,fn=0;const ranked=[];
 for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
  const a=all[i],b=all[j];if(a.panel===b.panel)continue;
  const prob=score(model,pairFeatures(spec,a,b));const label=truth.has(key(a,b));
  if(prob>=threshold){if(label)tp++;else fp++;}else if(label)fn++;
  ranked.push({a,b,prob,label});
 }
 ranked.sort((a,b)=>b.prob-a.prob);
 return {precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),f1:2*tp/(2*tp+fp+fn||1),tp,fp,fn,predictions:ranked.slice(0,15),note:'Benchmark diagnostic sur spécification déjà étiquetée : jamais preuve de précision sur PDFs non structurés.'};
}
return {validate,pairFeatures,score,evaluate};
});
