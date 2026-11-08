/* Garment Bending Lab V0.4 — functional UI, measured drafts, art studies, and exports. */
(function(){
'use strict';
const E=window.GBLEngine,D=window.GBLDraft,P=window.GBLPrint,F=window.GBLStitchFit,$=id=>document.getElementById(id);
const ops=Object.keys(E.OP_NAMES),STORE='GBL_V09_MUTATION_HISTORY';
const measures=[
 ['chest','Tour poitrine','Corps, au plus fort'],['waist','Tour taille','Corps, au niveau souhaité'],
 ['hips','Tour hanches','Corps, au plus fort'],['length','Longueur vêtement','Épaule à ourlet'],
 ['shoulder','Longueur épaule','Base cou à épaule'],['armhole','Profondeur emmanchure','Épaule à aisselle'],
 ['sleeve','Longueur manche','Depuis tête de manche'],['bicep','Tour biceps','Bras détendu'],
 ['inseam','Entrejambe','Pour les recherches pantalons'],
 ['neckWidth','Demi-largeur encolure','À plat'],['frontDrop','Profondeur col devant','À plat'],
 ['backDrop','Profondeur col dos','À plat'],['chestEase','Aisance poitrine','Ajoutée au tour corps'],
 ['hemEase','Aisance bassin','Ajoutée au tour bassin'],['bicepEase','Aisance biceps','Ajoutée au tour de bras'],
 ['neckbandWidth','Hauteur bande col finie','Après pliage'],['neckbandRatio','Ratio bande encolure','0,75 à 1 ; sans unité']
];
const advanced=new Set(['neckWidth','frontDrop','backDrop','chestEase','hemEase','bicepEase','neckbandWidth','neckbandRatio']);
const catalog=[
 {name:'Turtleneck / Col roulé',url:'https://dr-cos.info/fp-turtleneck.html',note:'IMG_0159 · IMG_9999 · jersey sombre'},
 {name:'Sarrouel pants',url:'https://dr-cos.info/fp-sarrouelpants.html',note:'IMG_0159 · pont entre jambes'},
 {name:'Wide pants / Pantalon ample',url:'https://dr-cos.info/fp-widepants.html',note:'IMG_0821 · distorsion de bassin'},
 {name:'Skinny pants',url:'https://dr-cos.info/fp-skinnypants.html',note:'IMG_0300 · IMG_9978'},
 {name:'Jacket / Blazer',url:'https://dr-cos.info/fp-jacket.html',note:'IMG_0300 · IMG_0821'},
 {name:'Sleeveless coat',url:'https://dr-cos.info/fp-sleevelesscoat.html',note:'IMG_1137 · structure rigide'},
 {name:'Stand collar blouse 2',url:'https://dr-cos.info/fp-standcollarblouse2.html',note:'IMG_0522 · bras déplacé'},
 {name:'High neck vest',url:'https://dr-cos.info/fp-highneckvest.html',note:'IMG_9999 · col glissé'},
 {name:'Poncho / Volume planaire',url:'https://dr-cos.info/fp-poncho.html',note:'Fusion environnement / vêtement'},
 {name:'Aladdin pants',url:'https://dr-cos.info/fp-aladdinpants.html',note:'IMG_0159 · volume pelvien'}
];
const study={
 pelvis:{base:'pelvic_bridge',seed:15940,intensity:75,enabled:['drift','displacement','growth','spatial','joint','fusion']},
 jacket:{base:'misregistered_jacket',seed:82119,intensity:52,enabled:['drift','seam','topology','joint']},
 limb:{base:'limb_transposition',seed:52203,intensity:84,enabled:['displacement','growth','spatial','joint','ghost','fusion']},
 collar:{base:'collar_slip',seed:99994,intensity:67,enabled:['drift','seam','growth','ghost','joint','fusion']}
};
let current=null,history=[],refUrl=null;
try{history=JSON.parse(localStorage.getItem(STORE)||'[]');if(!Array.isArray(history))history=[];}catch(e){history=[];}
function createFields(){
 const basic=$('measureFields'),detail=$('advancedFields');
 for(const [id,title,tip] of measures){
   const label=document.createElement('label');label.setAttribute('for','m-'+id);label.textContent=title;
   const n=document.createElement('input');n.type='number';n.id='m-'+id;n.name=id;
   n.min=D.ranges[id][0];n.max=D.ranges[id][1];n.step=(id==='neckbandRatio')?'0.01':'0.1';n.value=D.defaults[id];n.title=tip;
   label.appendChild(n);(advanced.has(id)?detail:basic).appendChild(label);
   n.addEventListener('change',()=>{const val=Number(n.value);if(!Number.isFinite(val)||n.value===''){n.value=D.defaults[id];}
      else n.value=Math.min(D.ranges[id][1],Math.max(D.ranges[id][0],val));render(false);});
 }
}
function readMeasures(){const v={};for(const [id] of measures){const n=$('m-'+id);v[id]=n?.value||D.defaults[id];}return D.normalize(v);}
function writeMeasures(m){const values=D.normalize(m);for(const [id] of measures){const n=$('m-'+id);if(n)n.value=values[id];}}
function cfg(){const operators={};for(const name of ops)operators[name]=$('op-'+name).checked;
 return {base:$('base').value,fit:$('fit').value,measurements:readMeasures(),seed:Number($('seed').value)>>>0,intensity:Number($('intensity').value),operators,linkedSeams:$('linkedSeams').checked,autoFitSeams:$('autoFitSeams').checked,fitStrategy:$('fitStrategy').value,fitLimitPercent:Number($('fitLimit').value)};
}
function assign(c){if(!c)return;$('base').value=c.base||'tshirt_custom';$('fit').value=c.fit||'regular';
 $('intensity').value=c.intensity??40;$('seed').value=c.seed??2841;
 for(const op of ops)$('op-'+op).checked=!!(c.operators||E.DEFAULT_OPERATORS)[op];
 if(c.measurements)writeMeasures(c.measurements);$('linkedSeams').checked=c.linkedSeams!==false;$('autoFitSeams').checked=c.autoFitSeams!==false;$('fitStrategy').value=c.fitStrategy||'balanced';$('fitLimit').value=String(c.fitLimitPercent??18);updateMeasurementState();
}
function phase(n){return n<=30?'ALMOST REAL / erreur à peine perceptible':n<=70?'UNCANNY / structure incertaine':'UNRECOGNIZABLE / effondrement de la structure';}
function remember(c){history.unshift(JSON.parse(JSON.stringify(c)));history=history.slice(0,25);try{localStorage.setItem(STORE,JSON.stringify(history));}catch(e){}renderHistory();}
function renderHistory(){$('history').replaceChildren();history.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.textContent=`${c.base} · #${c.seed} · ${c.intensity}%`;b.title=`Restaurer l'expérience ${i+1}`;b.addEventListener('click',()=>{assign(c);render(false);});$('history').appendChild(b);});}
function updateMeasurementState(){const base=$('base').value,custom=['tshirt_custom','pelvic_bridge','misregistered_jacket','limb_transposition','collar_slip'].includes(base);
 $('parametricControls').classList.toggle('not-parametric',!custom);
 $('draftNote').textContent=custom?'Paramètres en cm. Les pièces expérimentales sont des constructions de recherche, non validées pour la coupe.':'Les silhouettes V0.2 sont schématiques et ignorent les mensurations.';
}
function showMeasures(visible){$('measurementPanel').hidden=!visible;$('toggleMeasurements').textContent=visible?'Masquer les mensurations ▴':'Modifier les mensurations ▾';$('toggleMeasurements').setAttribute('aria-expanded',String(visible));}
function detailMetrics(r){$('patternMetrics').replaceChildren();$('draftWarnings').replaceChildren();
 const blocks=[];
 if(r.meta?.capDelta!==undefined){blocks.push(['Écart tête de manche',(r.meta.capDelta/10).toFixed(2)+' cm']);
  blocks.push(['Bande d’encolure',(r.meta.bandLength/10).toFixed(1)+' cm']);
  blocks.push(['Encolure totale',(r.meta.neckline/10).toFixed(1)+' cm']);
  if(r.meta.capClamped){addWarning('Le raccord tête de manche/emmanchure est hors plage pour ces mensurations. Contrôler manuellement.');}
 }
 blocks.push(['Pièces',r.pieces.length+''],['Base',r.meta?.archetype||r.config.base],['Seam allowance','0 mm']);
 for(const [label,value] of blocks){const d=document.createElement('div');const a=document.createElement('span');a.textContent=label;const b=document.createElement('strong');b.textContent=value;d.append(a,b);$('patternMetrics').append(d);}
 const maxBaseline=Math.max(0,...r.report.baseline.map(x=>x.percent));
 if(maxBaseline>8)addWarning('La base comporte déjà '+maxBaseline.toFixed(1)+' % d’écart maximal sur les coutures suivies : il ne faut pas l’attribuer uniquement à la mutation.');
 if(r.pieces.some(p=>p.generated))addWarning('Un panneau de fusion a été inventé par le moteur : son tracé est expérimental et ses raccords restent à construire.');
 if(r.config.base==='pdf_import' && !r.seams.length)addWarning('PDF : aucune couture liée. Ouvre l’atelier PDF → Liaison des coutures ; sélectionne deux bords et confirme l’association.');
 if(r.config.base==='pdf_import' && r.seams.length)addWarning(r.seams.length+' raccord(s) enregistré(s). Les appariements sont des hypothèses à vérifier sur toile ; la propagation agit sur les bords liés et non sur une simulation physique.');
 if(r.config.base!=='tshirt_custom'&&r.config.base!=='pdf_import')addWarning('Archétype inventé : les coutures et l’aisance ne sont pas validées. Référence esthétique, non patron de prêt-à-porter.');
}
function showFitReport(fitResult){
 const target=$('fitSummary');target.replaceChildren();
 if(!fitResult){const note=document.createElement('p');note.className='note';note.textContent='Égalisation désactivée. Les relations de couture restent mesurées sans correction supplémentaire.';target.append(note);return;}
 const lead=document.createElement('p');lead.className='note';lead.textContent=`Écart maximal mesuré : ${fitResult.maxBefore.toFixed(2)} % → ${fitResult.maxAfter.toFixed(2)} %. Calcul sur contours de coupe, NON sur lignes de piqûre garanties.`;target.append(lead);
 for(const row of fitResult.rows){const el=document.createElement('div');el.className='fit-line'+(['écart restant','partiel'].includes(row.status)?' fit-warning':(['bloqué','ignoré'].includes(row.status)?' fit-danger':''));
  const label=document.createElement('span');label.textContent=row.id+' · '+row.status;label.title=row.reason||'';
  const metrics=document.createElement('strong');metrics.textContent=row.mismatchPct===null?'non lié':`${row.initialMismatchPct.toFixed(1)} → ${row.mismatchPct.toFixed(1)} %`;
  el.append(label,metrics);target.append(el);
  if(row.reason){const info=document.createElement('p');info.className='note';info.textContent=row.reason;target.append(info);}
 }
}
function addWarning(msg){const div=document.createElement('div');div.className='alert';div.textContent=msg;$('draftWarnings').appendChild(div);}
function render(save=false){
 try{
  const c=cfg(),useFit=Boolean(c.autoFitSeams&&c.linkedSeams),r=E.mutate(useFit?{...c,linkedSeams:false}:c);
  let fitting=null;
  if(useFit&&r.seams.length){fitting=F.fit(r.pieces,r.seams,{strategy:c.fitStrategy,limitPercent:c.fitLimitPercent,iterations:3});
   r.pieces=fitting.pieces;r.report=E.diagnostics(r.pieces,r.seams,r.original,r.baselineSeams||r.seams);
   r.events.push('Seam fitter : '+fitting.maxBefore.toFixed(2)+' % → '+fitting.maxAfter.toFixed(2)+' %, limites '+c.fitLimitPercent+' %');
  }
  r.config={...r.config,linkedSeams:c.linkedSeams,autoFitSeams:c.autoFitSeams,fitStrategy:c.fitStrategy,fitLimitPercent:c.fitLimitPercent};r.fitting=fitting;
  current=r;showFitReport(fitting);
  $('intensityValue').textContent=c.intensity+' %';$('meterBar').style.width=c.intensity+'%';$('modeText').textContent=phase(c.intensity);
  $('stamp').textContent='#'+c.seed+' / '+c.intensity+' %';
  $('original').innerHTML=E.svgString(r,{variant:'original',seamHighlight:false});
  $('mutated').innerHTML=E.svgString(r,{variant:'mutated',seamHighlight:true});
  $('intersections').textContent=r.report.intersections;
  $('mismatch').textContent=r.report.maxSeamMismatch.toFixed(1)+' %';
  $('rewired').textContent=r.report.rewired/2;
  $('events').replaceChildren();
  for(const item of (r.events.length?r.events:['Aucune mutation : intensité 0 ou opérateurs désactivés'])){const el=document.createElement('li');el.textContent=item;$('events').append(el);}
  $('seams').replaceChildren();for(const pair of r.report.seams){const el=document.createElement('div');el.className='seam-row'+(pair.rewired?' rewired':'');
    const a=document.createElement('span');a.textContent=pair.id+(pair.rewired?' [réassigné]':'');const b=document.createElement('strong');b.textContent=pair.percent.toFixed(1)+' %';el.append(a,b);$('seams').append(el);
  }
  window.dispatchEvent(new CustomEvent('gbl-render',{detail:{result:r}}));
  if(window.GBLIntelligence)showFeasibility(r);
  const messages=[];
  if(r.report.intersections>0)messages.push(['alert',`${r.report.intersections} auto-intersection(s) : contour potentiellement non découpable.`]);
  if(r.report.maxSeamMismatch>8)messages.push(['alert',`Écart maximal entre deux bords associés : ${r.report.maxSeamMismatch.toFixed(1)} % (base + mutation).`]);
  if(r.report.rewired>0)messages.push(['alert','Associations de couture permutées intentionnellement.']);
  if(!messages.length)messages.push(['alert ok','Pas d’anomalie géométrique détectée par ces tests partiels ; la confection n’est pas garantie.']);
  $('alerts').replaceChildren();for(const [cls,msg] of messages){const p=document.createElement('div');p.className=cls;p.textContent=msg;$('alerts').append(p);}
  detailMetrics(r);if(save)remember(c);
 }catch(err){console.error('GBL render failure',err);$('alerts').textContent='Erreur moteur : '+err.message;}
}
function showFeasibility(result){const diagnosis=window.GBLIntelligence.diagnostic(result,{fabric:$('fabricPreset').value}),status=$('feasibilityStatus'),details=$('feasibilityDetails');
 status.textContent=diagnosis.status.toUpperCase()+' · heuristique uniquement';details.replaceChildren();
 for(const f of diagnosis.flags.slice(0,12)){const el=document.createElement('div');el.className='feasibility-flag '+f.severity;el.textContent=f.text;details.append(el);}
 const warning=document.createElement('p');warning.className='note';warning.textContent=diagnosis.cutLineWarning;details.append(warning);
}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function fileName(ext){return `GBL_V09_${current.config.base}_seed-${current.config.seed}_${current.config.intensity}pct.${ext}`;}
function savePrint(){return P.buildPrintHtml(current,E,'mutated');}
function wire(){
 $('toggleMeasurements').addEventListener('click',()=>showMeasures($('measurementPanel').hidden));
 $('resetMeasurements').addEventListener('click',()=>{writeMeasures(D.defaults);$('fit').value='regular';render(false);});
 $('updateDraft').addEventListener('click',()=>{render(true);$('draftNote').textContent='Patron recalculé avec les mesures affichées. Échelle non validée pour découpe directe.';});
 $('fit').addEventListener('change',()=>{const preset=D.presets[$('fit').value]||D.presets.regular;
   const m=readMeasures();for(const key of ['chestEase','hemEase','bicepEase'])m[key]=preset[key];writeMeasures(m);render(false);});
 $('base').addEventListener('change',()=>{updateMeasurementState();render(false);});
 $('linkedSeams').addEventListener('change',()=>render(false));
 for(const id of ['autoFitSeams','fitStrategy','fitLimit'])$(id).addEventListener('change',()=>render(false));
 $('fitNow').addEventListener('click',()=>{$('autoFitSeams').checked=true;$('linkedSeams').checked=true;render(true);$('fitSummary').scrollIntoView({behavior:'smooth',block:'center'});});
 $('fabricPreset').addEventListener('change',()=>{if(current)showFeasibility(current);});
 $('reduceMutation').addEventListener('click',()=>{const start=Number($('intensity').value);if(start===0)return;const target=cfg();let found=null;for(let level=start;level>=0;level-=3){const test=E.mutate({...target,intensity:level}),report=window.GBLIntelligence.diagnostic(test,{fabric:$('fabricPreset').value});if(report.status==='géométrie plausible'){found=level;break;}}if(found===null){window.alert('Aucune intensité automatiquement plausible détectée. Le patron de départ ou les coutures doivent être revus ; aucune correction de confection ne peut être garantie.');return;}$('intensity').value=found;render(true);});
 $('generate').addEventListener('click',()=>render(true));
 $('shuffle').addEventListener('click',()=>{$('seed').value=Math.floor(Math.random()*4294967296);render(true);});
 $('intensity').addEventListener('input',()=>render(false));
 $('seed').addEventListener('change',()=>render(false));
 for(const k of ops)$('op-'+k).addEventListener('change',()=>render(false));
 $('saveSvg').addEventListener('click',()=>download(fileName('svg'),E.svgString(current,{variant:'mutated'}),'image/svg+xml;charset=utf-8'));
 $('saveOriginal').addEventListener('click',()=>download(fileName('original.svg'),E.svgString(current,{variant:'original'}),'image/svg+xml;charset=utf-8'));
 $('saveA4').addEventListener('click',()=>download(fileName('a4.html'),savePrint(),'text/html;charset=utf-8'));
 $('printA4').addEventListener('click',()=>{const u=URL.createObjectURL(new Blob([savePrint()],{type:'text/html;charset=utf-8'}));const w=window.open(u,'_blank');
  if(!w)window.alert('Fenêtre bloquée. Utiliser « Planches A4 · HTML », puis imprimer à 100 %.');setTimeout(()=>URL.revokeObjectURL(u),60000);
 });
 $('saveJson').addEventListener('click',()=>download(fileName('json'),JSON.stringify({version:'0.9',config:current.config,meta:current.meta,events:current.events,fitting:current.fitting?.rows||[],diagnostics:current.report,importedDraft:current.config.base==='pdf_import'?window.GBLImportedDraft:null},null,2),'application/json;charset=utf-8'));
 $('saveArchive').addEventListener('click',()=>download('GBL_V09_session_archive.json',JSON.stringify({version:'0.9',history},null,2),'application/json;charset=utf-8'));
 $('loadJson').addEventListener('click',()=>$('fileInput').click());
 $('fileInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const raw=JSON.parse(await f.text()),c=raw.config||(Array.isArray(raw.history)?raw.history[0]:raw);if(!c||!c.base||!c.operators)throw Error('Structure JSON inconnue');if(raw.importedDraft){window.GBLImportedDraft=raw.importedDraft;window.GBLStructuredSource=raw.importedDraft.pieces?.some(p=>p.gcPlacement)?{source:raw.importedDraft.source||'Projet enregistré',metadata:raw.importedDraft.metadata||{}}:null;if(typeof window.GBLRestoreImportedDraft==='function')window.GBLRestoreImportedDraft(raw.importedDraft);const option=[...$('base').options].find(x=>x.value==='pdf_import');if(option)option.disabled=false;}assign(c);render(true);}catch(err){window.alert('Échec import JSON : '+err.message);}finally{e.target.value='';}});
 const presets={subtle:{intensity:19,ops:['drift','displacement']},liminal:{intensity:56,ops:['drift','displacement','seam','growth','joint','fusion']},radical:{intensity:91,ops:ops}};
 for(const b of document.querySelectorAll('[data-preset]'))b.addEventListener('click',()=>{const p=presets[b.dataset.preset];$('intensity').value=p.intensity;for(const op of ops)$('op-'+op).checked=p.ops.includes(op);render(true);});
 for(const b of document.querySelectorAll('[data-study]'))b.addEventListener('click',()=>{const s=study[b.dataset.study];$('base').value=s.base;$('intensity').value=s.intensity;$('seed').value=s.seed;
  for(const op of ops)$('op-'+op).checked=s.enabled.includes(op);updateMeasurementState();render(true);
  $('mutated').scrollIntoView({behavior:'smooth',block:'center'});
 });
 const c=$('catalog');for(const item of catalog){const a=document.createElement('a');a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.className='catalog-item';
   const title=document.createElement('strong');title.textContent=item.name;const note=document.createElement('small');note.textContent=item.note;a.append(title,note);c.append(a);}
}
createFields();wire();updateMeasurementState();showMeasures(true);renderHistory();render(false);
})();
