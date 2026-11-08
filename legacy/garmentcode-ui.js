/* Import a structured sewing pattern directly into the existing mutation lab.
   Does not download external data and preserves original JSON metadata. */
(function(){'use strict';if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),G=window.GBLGarmentCode;
const log=(txt,bad=false)=>{$('gcdStatus').textContent=txt;$('gcdStatus').classList.toggle('alert',bad)};
let lastSpec=null,trainedModel=null;
function start(spec,source){
 const parsed=G.parse(spec),stats=G.seamStats(parsed),high=stats.filter(x=>x.mismatchPercent>22).length;lastSpec=spec;
 window.GBLStructuredSource={source,metadata:parsed.metadata};
 window.GBLImportedDraft={...parsed,source};
 const base=$('base');const option=[...base.options].find(o=>o.value==='pdf_import');if(option)option.disabled=false;
 base.value='pdf_import';
 $('linkedSeams').checked=$('gcdSeamAware').checked;
 $('autoFitSeams').checked=false; // no automatic arbitrary flattening of gathering/ease from supplied dataset stitches
 base.dispatchEvent(new Event('change',{bubbles:true}));
 log(`IMPORT OK · ${parsed.pieces.length} panneaux, ${parsed.seams.length} paires de coutures explicites, ${high} écart(s) >22 % ; ${parsed.metadata.invalidStitches.length} références invalides. Les coutures proviennent du JSON (pas de prédiction). Maillage cousu visualisé sur l'avatar.`);
 $('preview3dPanel')?.scrollIntoView({behavior:'smooth',block:'start'});
}
$('gcdImport').addEventListener('click',()=>$('gcdFile').click());
$('gcdFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{start(JSON.parse(await f.text()),f.name);}catch(err){log('Import refusé : '+err.message,true);}finally{e.target.value='';}});
// Embedded, original instructional example in the documented GarmentCode schema.
const sample={properties:{units_in_meter:100,curvature_coords:'relative'},pattern:{panels:{},stitches:[]}};
const rect=(name,x,y,z)=>{sample.pattern.panels[name]={vertices:[[-23,3],[23,3],[27,-20],[23,-65],[-23,-65],[-27,-20]],edges:[0,1,2,3,4,5].map(i=>({endpoints:[i,(i+1)%6]})),rotation:[0,0,name==='back'?180:0],translation:[x,y,z]};};
rect('front',0,0,10);rect('back',0,0,-10);
const sleeve=(name,x,ang)=>{sample.pattern.panels[name]={vertices:[[-13,5],[0,12],[13,5],[12,-38],[-12,-38]],edges:[0,1,2,3,4].map(i=>({endpoints:[i,(i+1)%5]})),rotation:[0,0,ang],translation:[x,18,0]};};
sleeve('left_sleeve',-28,0);sleeve('right_sleeve',28,0);
const pair=(a,ea,b,eb)=>sample.pattern.stitches.push([{panel:a,edge:ea},{panel:b,edge:eb}]);
pair('front',2,'back',2);pair('front',4,'back',4);pair('left_sleeve',0,'front',5);pair('left_sleeve',1,'back',5);pair('right_sleeve',0,'front',1);pair('right_sleeve',1,'back',1);
$('gcdDemo').addEventListener('click',()=>{try{start(sample,'Démo éducative originale (pas GarmentCodeData)')}catch(e){log(e.message,true)}});
$('gcdSeamAware').addEventListener('change',()=>{if(window.GBLStructuredSource){$('linkedSeams').checked=$('gcdSeamAware').checked;$('linkedSeams').dispatchEvent(new Event('change'));}});
$('seamModelImport').addEventListener('click',()=>$('seamModelFile').click());
$('seamModelFile').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{
 trainedModel=window.GBLSeamML.validate(JSON.parse(await f.text()));
 if(lastSpec){const metrics=window.GBLSeamML.evaluate(trainedModel,lastSpec);$('seamModelStatus').textContent=`Évaluation contrôlée : précision ${(100*metrics.precision).toFixed(1)} % · rappel ${(100*metrics.recall).toFixed(1)} % · F1 ${(100*metrics.f1).toFixed(1)} % sur les paires de l'exemple courant. Aucun raccord du patron n'a été modifié.`;}
 else $('seamModelStatus').textContent='Modèle chargé. Importer une spécification pour l’évaluer sur des coutures connues.';
 }catch(err){$('seamModelStatus').textContent='Modèle refusé : '+err.message;}finally{e.target.value='';}});
$('gcdAutoDiagnose').addEventListener('click',()=>{
 if(!window.GBLStructuredSource){$('gcdIterationStatus').textContent='Charge une spécification GarmentCode pour activer les diagnostics 3D.';return;}
 const level=Number($('intensity').value),seed=Number($('seed').value),operators={};
 for(const name of Object.keys(window.GBLEngine.DEFAULT_OPERATORS))operators[name]=Boolean($('op-'+name)?.checked);
 let tested=0,best=null,passes=[];
 for(const l of [level,level*.8,level*.6,level*.4,level*.2,0].map(x=>Math.round(x))){
  try{
   const r=window.GBLEngine.mutate({base:'pdf_import',intensity:l,seed,operators,linkedSeams:$('linkedSeams').checked});
   const d=window.GBLPanelPhysics.solve(r.pieces,r.seams,{steps:22,gravity:Number($('garment3dGravity').value),fabric:$('fabricPreset').value,avatar:Number($('garment3dAvatar').value)}).stats;
   const cost=d.warnings.length*20 + d.meanRelativeStrain*50+d.finalSeamGap*.15;passes.push({intensity:l,cost:+cost.toFixed(2),warnings:d.warnings});tested++;
   if(!best||cost<best.cost)best={cost,intensity:l};
   if(d.quality==='experimental-plausible')break;
  }catch(err){passes.push({intensity:l,error:err.message});}
 }
 if(best){$('intensity').value=best.intensity;$('intensity').dispatchEvent(new Event('input'));
  $('gcdIterationStatus').textContent=`${tested} essais terminés. Intensité retenue ${best.intensity} % (coût géométrique ${best.cost.toFixed(2)}). ${best.cost>20?'⚠ Les contraintes de fabrication restent non résolues.':'À inspecter avant tout prototype.'}`;
 }else $('gcdIterationStatus').textContent='Aucune variante 3D exploitable dans les six essais : revoir les pièces, les placements ou les coutures.';
 window.GBLLastDiagnosticLoop=passes;
});
$('gcdExportFeedback').addEventListener('click',()=>{
 const data={schema:'gbl.human-feedback.v1',recorded_at:new Date().toISOString(),source:window.GBLStructuredSource?.source||'PDF/autre',
   label:$('gcdUserLabel').value,notes:$('gcdUserNotes').value,
   parameters:{intensity:Number($('intensity').value),seed:Number($('seed').value),fabric:$('fabricPreset').value},
   tests:window.GBLLastDiagnosticLoop||[],warning:'Label humain non vérifié. Ce fichier constitue un journal de recherche et non une vérité de terrain.'};
 const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='GBL_feedback_'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
});
window.GBLImportGarmentCode=start;
})();
