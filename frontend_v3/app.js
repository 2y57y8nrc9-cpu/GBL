/* Garment Bending Lab V3: local browser interface; photo inference requires Ollama. */
'use strict';
const $=id=>document.getElementById(id);
let imageData=null, original=null, mutated=null, avatarId=null, avatarJobId=null, avatarParamKey=null, avatarPromise=null, analysisSource='manual';
let avatarOrbit=null;
let analysis={};
const h=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const msg=(id,s,type='')=>{const e=$(id);e.textContent=s;e.className='report '+(type||'muted')};
async function api(url,data){let r=await fetch(url,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});let j=await r.json().catch(()=>({detail:'Réponse serveur non JSON'}));if(!r.ok)throw new Error(typeof j.detail==='string'?j.detail:JSON.stringify(j.detail));return j;}
function collectAnalysis(){let intent=$('intent').value.split(/[;\n]/).map(s=>s.trim()).filter(Boolean);return {...analysis,garment_type:$('garment').value,sleeves:$('sleeves').value,fit:$('fit').value,length:$('length').value,neckline:$('neckline').value,material:$('material').value,asymmetry:Number($('asymmetry').value),aesthetic_constraints:intent};}
function fillAnalysis(a){analysis=a;$('garment').value=[...$('garment').options].some(o=>o.value===a.garment_type)?a.garment_type:'t_shirt';for(const k of ['sleeves','fit','length','neckline','material'])if(a[k])$(k).value=a[k];$('asymmetry').value=a.asymmetry||0;if(a.aesthetic_constraints?.length)$('intent').value=a.aesthetic_constraints.join('; ');}
function measures(){return Object.fromEntries(['height','chest','waist','hips','shoulders','biceps','ease'].map(k=>[k,Number($(k).value)]));}
function draw(id,shape,color){const svg=$(id);svg.replaceChildren();if(!shape?.length){svg.innerHTML='<text x="350" y="190" text-anchor="middle" fill="#858696">Pas de patron</text>';return;}
 const NS='http://www.w3.org/2000/svg';const cols=shape.length===2?2:Math.min(2,shape.length);const rows=Math.ceil(shape.length/cols);const cellW=690/cols,cellH=405/rows;
 shape.forEach((part,index)=>{const pts=part.points||[];if(!pts.length)return;const xx=pts.map(p=>p[0]),yy=pts.map(p=>p[1]);const minx=Math.min(...xx),maxx=Math.max(...xx),miny=Math.min(...yy),maxy=Math.max(...yy);const scale=Math.min((cellW-68)/(maxx-minx||1),(cellH-48)/(maxy-miny||1));const cx=(index%cols)*cellW+cellW/2,cy=Math.floor(index/cols)*cellH+cellH/2+5;const d=pts.map((p,i)=>(i?'L':'M')+' '+(cx+(p[0]-(minx+maxx)/2)*scale).toFixed(1)+' '+(cy-(p[1]-(miny+maxy)/2)*scale).toFixed(1)).join(' ')+' Z';
 const path=document.createElementNS(NS,'path');path.setAttribute('d',d);path.setAttribute('fill',color==='purple'?'#8e7bc033':'#b6ebaa22');path.setAttribute('stroke',color==='purple'?'#c7abe9':'#b7eaa5');path.setAttribute('stroke-width','1.7');path.setAttribute('stroke-linejoin','round');svg.appendChild(path);
 const label=document.createElementNS(NS,'text');label.setAttribute('x',cx);label.setAttribute('y',Math.max(17,cy-cellH/2+20));label.setAttribute('text-anchor','middle');label.setAttribute('fill','#b6b9c4');label.textContent=part.name.replaceAll('_',' ').toUpperCase();svg.appendChild(label);
 });}
async function updateDrawing(id,doc,color){let j=await api('/api/validate',doc);draw(id,j.shape,color);return j;}
function saveJSON(name,doc){const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000)}
function resetAfterOriginal(){mutated=null;$('bend').disabled=false;$('downloadOriginal').disabled=false;$('downloadMutant').disabled=true;const parts=Object.keys(original?.pattern?.panels||{});const sewnTop=parts.length===4 && parts.filter(n=>/manche|sleeve/i.test(n)).length===2;$('simulate').disabled=!sewnTop;$('acceptance').disabled=false;if(!sewnTop)msg('simStatus','Simulation multi-panneaux disponible uniquement pour un haut à 4 panneaux avec deux manches (prototype). Les autres patrons restent modifiables en 2D.','warn');draw('patternB',[]);}
async function start(){try{let s=await api('/api/v3/status');let v=s.vision;msg('visionStatus',v.available?`Ollama local disponible. Modèles : ${v.models.join(', ')||'aucun'} — installer qwen2.5vl:3b si nécessaire.`:'Ollama non détecté. Mode manuel disponible ; aucun modèle visuel n’est intégré sans installation.',v.available?'ok':'warn');}catch(e){msg('visionStatus',e.message,'warn')}}
$('photo').addEventListener('change',async ev=>{let f=ev.target.files?.[0];if(!f)return;if(!f.type.startsWith('image/')){msg('visionStatus','Fichier non image.','warn');return;}const img=new Image();const src=URL.createObjectURL(f);await new Promise((yes,no)=>{img.onload=yes;img.onerror=no;img.src=src});let ratio=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(img.naturalWidth*ratio);canvas.height=Math.round(img.naturalHeight*ratio);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);imageData=canvas.toDataURL('image/jpeg',.82);$('previewPhoto').src=imageData;$('previewPhoto').hidden=false;$('photoEmpty').hidden=true;URL.revokeObjectURL(src);msg('visionStatus',`Image prête (${canvas.width} × ${canvas.height}). Analyse Ollama locale possible.`,'ok');});
$('analyze').addEventListener('click',async()=>{if(!imageData){msg('visionStatus','Choisir une photo avant l’analyse.','warn');return;}let b=$('analyze');b.disabled=true;msg('photoResult','Analyse visuelle locale en cours…');try{const out=await api('/api/v3/photo',{image:imageData,model:'qwen2.5vl:3b'});fillAnalysis(out.analysis);analysisSource='ollama';msg('photoResult',`Observation : ${out.analysis.garment_type} · confiance déclarée ${Math.round(out.analysis.confidence*100)} %\nTraits visibles : ${(out.analysis.visible_features||[]).join(' ; ')||'aucun'}\nContraintes : ${(out.analysis.aesthetic_constraints||[]).join(' ; ')||'aucune'}\nInconnues : ${(out.analysis.uncertainties||[]).join(' ; ')||'non renseignées'}\nInterprétation modifiable.`, 'ok');}catch(e){msg('photoResult',e.message+'\nTu peux démarrer sans IA en réglant les caractéristiques manuellement.','warn')}finally{b.disabled=false}});
$('demo').addEventListener('click',()=>{analysisSource='manual';analysis={confidence:0,visible_features:[],uncertainties:['Photo non analysée automatiquement.','Dimensions réelles inconnues.']};msg('photoResult','Mode manuel activé. Les champs à droite décrivent une hypothèse choisie par toi, pas une analyse d’image.','ok');});
$('build').addEventListener('click',async()=>{let b=$('build');b.disabled=true;msg('patternReport','Construction du patron et vérification des coutures…');try{let res=await api('/api/v3/construct',{analysis:collectAnalysis(),measurements:measures()});original=res.specification;let d=await updateDrawing('patternA',original,'green');resetAfterOriginal();const review=res.review;msg('patternReport',`${d.diagnostic.summary.panels} panneaux · ${d.diagnostic.summary.stitches} coutures · écart max ${d.diagnostic.summary.max_mismatch_percent} %\n${review.warnings.slice(0,5).join('\n')||'Alerte géométrique majeure non détectée'}\nInconnues : ${review.unobserved.join('; ')}\nImportant : hypothèse non validée en confection.`,d.diagnostic.ok?'ok':'warn');}catch(e){msg('patternReport',e.message,'warn')}finally{b.disabled=false}});
$('jsonInput').addEventListener('change',async e=>{let f=e.target.files?.[0];if(!f)return;try{let doc=JSON.parse(await f.text());let diag=await updateDrawing('patternA',doc,'green');if(!diag.diagnostic.ok)throw new Error(diag.diagnostic.errors.join('; '));original=doc;resetAfterOriginal();msg('patternReport',`Patron JSON chargé : ${diag.diagnostic.summary.panels} panneaux, ${diag.diagnostic.summary.stitches} coutures. Source externe : vérifier la licence et l’échelle.`, 'ok');}catch(err){msg('patternReport',err.message,'warn')}});
$('downloadOriginal').addEventListener('click',()=>original&&saveJSON('GBL_V3_original_specification.json',original));
$('intensity').addEventListener('input',()=> $('intensityRead').textContent=$('intensity').value+' %');$('preserve').addEventListener('input',()=> $('preserveRead').textContent=$('preserve').value+' %');
$('bend').addEventListener('click',async()=>{if(!original)return;msg('mutationReport','Quatre variantes déterministes en cours d’évaluation…');let selected=[...document.querySelectorAll('.checkboxes input:checked')].map(e=>e.value);if(!selected.length){msg('mutationReport','Sélectionner au moins un opérateur.','warn');return;}try{let res=await api('/api/v3/mutate',{specification:original,intensity:Number($('intensity').value),seed:Number($('seed').value),operators:selected,preserve:Number($('preserve').value)/100,mode:$('mode').value});mutated=res.specification;await updateDrawing('patternB',mutated,'purple');$('downloadMutant').disabled=false;let picked=res.selection;msg('mutationReport',`Variante retenue : ${picked.intensity} % · écart silhouette normalisé ${picked.deviation} · couture max ${picked.seam_mismatch} % · intersections ${picked.intersections}.\n${res.warning}`,'ok');}catch(e){msg('mutationReport',e.message,'warn')}});
$('downloadMutant').addEventListener('click',()=>mutated&&saveJSON('GBL_V3_malformation_specification.json',mutated));
$('acceptance').addEventListener('click',async()=>{try{let res=await api('/api/v3/acceptance',{specification:mutated||original});msg('acceptanceReport',`Coutures : ${res.seams_declared}, écarts supérieurs à 5 % : ${res.seams_over_5pct}.\nConstruction : ${res.construction_status}.\nPhoto : ${res.photo_reconstruction_validation}.\nCousabilité : ${res.sewing_manufacturability}.\nDrapé : ${res['3d_drape']}.`,res.seams_over_5pct?'warn':'ok');}catch(e){msg('acceptanceReport',e.message,'warn')}});
// MPFB is generated through Blender via the server: no manual OBJ import.
const avatarFieldMap=[['mpfbMorphology','morphology','morphologyRead'],['mpfbBodyShape','body_shape','bodyShapeRead'],['mpfbMuscle','muscle','muscleRead'],['mpfbProportions','proportions','proportionsRead'],['mpfbAge','age_shape','ageRead']];
function avatarParameters(){
  const params={height_cm:Number($('height').value)};
  avatarFieldMap.forEach(([id,key])=>params[key]=Number($(id).value)/100);
  return params;
}
function currentAvatarKey(){return JSON.stringify(avatarParameters())}
function invalidateAvatar(){
  if(avatarParamKey!==currentAvatarKey()){
    avatarId=null;avatarJobId=null;
    $('avatarPreview').hidden=true;$('avatarOrbit').hidden=true;$('orbitReset').disabled=true;$('avatarPlaceholder').hidden=false;
    if(avatarOrbit)avatarOrbit.clear();
    $('avatarFiles').replaceChildren();
    msg('avatarStatus','Morphologie modifiée. L’avatar sera régénéré lors de la prochaine simulation, ou avec le bouton Générer.','muted');
  }
}
for(const [id,key,read] of avatarFieldMap){
  $(id).addEventListener('input',()=>{$(read).textContent=$(id).value+' %';invalidateAvatar()});
}
$('height').addEventListener('input',()=>{ $('mpfbHeightRead').textContent=$('height').value+' cm';invalidateAvatar() });
function avatarFileLink(id,name,label){let a=document.createElement('a');a.href=`/api/v3/mpfb/jobs/${id}/file/${name}`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;return a;}
async function generateAvatar(){
  const key=currentAvatarKey();
  if(avatarId && avatarParamKey===key)return avatarId;
  if(avatarPromise)return avatarPromise;
  const button=$('avatarGenerate');button.disabled=true;
  const promise=(async()=>{
    msg('avatarStatus','GBL démarre MPFB dans Blender. Le premier lancement peut nécessiter le chargement de l’extension…');
    const job=await api('/api/v3/mpfb/generate',avatarParameters());
    for(let n=0;n<185;n++){
      await sleep(2000);
      const result=await api('/api/v3/mpfb/jobs/'+job.id);
      if(result.status==='completed'){
        if(currentAvatarKey()!==key){
          msg('avatarStatus','Les réglages ont changé pendant la génération ; lance une nouvelle génération.','warn');
          return null;
        }
        avatarId=result.avatar_id;avatarParamKey=key;avatarJobId=job.id;
        $('avatarFiles').replaceChildren();
        const pngUrl=`/api/v3/mpfb/jobs/${job.id}/file/avatar.png`;
        $('avatarPreview').src=pngUrl;
        if(result.files?.includes('avatar.obj')) {
          try {
            if(!avatarOrbit)avatarOrbit=window.GBLAvatarOrbit($('avatarOrbit'));
            $('avatarOrbit').hidden=false;$('avatarPlaceholder').hidden=true;
            const geometry=await avatarOrbit.load(`/api/v3/mpfb/jobs/${job.id}/file/avatar.obj`);
            $('avatarPreview').hidden=true;$('orbitReset').disabled=false;
            $('orbitStatus').textContent=`Rotation souris · zoom molette · ${geometry.vertices.toLocaleString()} sommets · hauteur ${geometry.height.toFixed(2)} m`;
          } catch (err) {
            $('avatarOrbit').hidden=true;$('avatarPreview').hidden=false;$('avatarPlaceholder').hidden=true;
            $('orbitStatus').textContent=`Aperçu 3D indisponible : ${err.message}. Image statique affichée.`;
          }
        } else if(result.files?.includes('avatar.png')) {
          $('avatarOrbit').hidden=true;$('avatarPreview').hidden=false;$('avatarPlaceholder').hidden=true;
        }
        $('avatarFiles').appendChild(avatarFileLink(job.id,'avatar.blend','Ouvrir dans Blender'));
        $('avatarFiles').appendChild(avatarFileLink(job.id,'avatar.obj','OBJ généré'));
        $('avatarFiles').appendChild(avatarFileLink(job.id,'avatar_metrics.json','Mesures techniques'));
        msg('avatarStatus',`Avatar MPFB généré : ${result.avatar_vertices?.toLocaleString()||'?'} sommets et ${result.avatar_faces?.toLocaleString()||'?'} faces. Corps morphologiquement paramétré, dimensions de confection encore non calibrées.`, 'ok');
        return avatarId;
      }
      if(result.status==='failed'){
        $('avatarFiles').replaceChildren();$('avatarFiles').appendChild(avatarFileLink(job.id,'mpfb.log','Journal MPFB'));
        throw new Error(result.message||'Échec de génération. Voir journal MPFB.');
      }
      if(n%4===0)msg('avatarStatus','Blender génère l’avatar : '+result.status+'…');
    }
    throw new Error('Le délai d’attente de GBL est dépassé. Voir le journal Blender.');
  })();
  avatarPromise=promise;
  try{return await promise;}
  finally{avatarPromise=null;button.disabled=false;}
}
$('orbitReset').addEventListener('click',()=>{if(avatarOrbit)avatarOrbit.reset();});
$('avatarGenerate').addEventListener('click',async()=>{
  try{await generateAvatar();}catch(e){msg('avatarStatus',e.message+'\nInstalle MPFB depuis Blender → Get Extensions → MPFB, puis réessaie.','warn');}
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
$('simulate').addEventListener('click',async()=>{if(!original)return;let b=$('simulate');b.disabled=true;$('simOutputs').replaceChildren();msg('simStatus','Création de la tâche Blender…');try{if(!avatarId||avatarParamKey!==currentAvatarKey()){msg('simStatus','Préparation automatique de l’avatar MPFB…');await generateAvatar();}if(!avatarId)throw new Error('Avatar non généré : vérifier MPFB et relancer.');let started=await api('/api/v3/simulate',{specification:mutated||original,avatar_id:avatarId,mesh_levels:Number($('meshLevels').value),placement_mode:$('placementMode').value,assembly_mode:$('assemblyMode').value});for(let n=0;n<450;n++){await sleep(2000);let j=await api('/api/mac/jobs/'+started.id);if(j.status==='completed'||j.status==='failed'){if(j.status==='failed'){msg('simStatus','Blender a signalé une erreur. Consulter le journal ci-dessous. '+(j.message||''),'warn');}else{const r=j.report||{};msg('simStatus',`Blender a terminé le calcul — ${r.quality_status==='drape_non_fiable'?'DRAPÉ NON FIABLE':'à vérifier'} : ${r.quality_status||'inconnue'}.
Avatar : ${r.avatar?.source||'proxy'} · faces : ${r.cloth_faces||'non indiqué'}
Assemblage : ${r.assembly_mode==='preassembled'?'coutures soudées avant drapé':'ressorts expérimentaux'} · sommets fusionnés : ${r.joined_seam_vertices??'n.d.'}
Dégagement du corps : ${r.dressed_body_clearance?.initial_penetrations??'n.d.'} points à corriger avant drapé
Orientation : ${r.avatar?.orientation_after?.plausibly_upright?'Z-up vérifiée':'à vérifier'} · Collision avatar : ${r.avatar?.collision_enabled?'active':'non confirmée'} · Déplacements de dégagement : ${r.initial_collision_clearance?.adjusted_points??'n.d.'}
Pré-placement : ${r.clo_style_prearrangement?.mode||'inconnu'} · écart moyen initial projeté ${r.clo_style_prearrangement?.after?.mean_cm??'n.d.'} cm (avant : ${r.clo_style_prearrangement?.before?.mean_cm??'n.d.'} cm)
Raisons : ${(r.quality_reasons||[]).join(' ; ')||'diagnostic à consulter'}
La dernière frame ne prouve pas la faisabilité physique.`,r.quality_status==='candidate_for_visual_review'?'ok':'warn');
const al=r.avatar_garment_alignment;
if(al){msg('avatarAlignment',`Axe Z du corps : ${al.avatar_vertical?'vertical, tête en haut':'orientation non validée'} · hauteur corps ${al.avatar_height_m} m
Écart des épaules avant simulation : ${al.initial_shoulder_offset_cm} cm · après : ${al.final_shoulder_offset_cm ?? 'inconnu'} cm · glissement du corsage : ${al.bodice_center_drop_cm ?? 'inconnu'} cm
${al.warning||'Contrôle de positionnement réalisé : le corps et le T-shirt doivent encore être inspectés visuellement.'}`,al.status==='needs_review'?'warn':'ok');}}
 let files=[...(j.files||[]),'blender.log'];for(let f of files){let a=document.createElement('a');a.href=`/api/mac/jobs/${started.id}/file/${f}`;a.target='_blank';a.textContent=f;$('simOutputs').appendChild(a);}break;}if(n%6===0)msg('simStatus',`Blender : ${j.status}. Calcul sur ton Mac (il peut être long en maillage détaillé).`);}
 }catch(e){msg('simStatus',e.message,'warn')}finally{b.disabled=false}});
start();
api('/api/v3/mpfb/status').then(s=>{ if(!s.blender_available)msg('avatarStatus','Blender introuvable : installe Blender pour générer ton avatar MPFB.','warn'); }).catch(()=>{});
