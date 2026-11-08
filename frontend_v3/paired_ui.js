/* Before/after visual research library: image pairs + human-reviewed annotations.
   Ollama optional. Saving only after the user's approval checkbox is checked. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
let beforeImage=null,afterImage=null, changes=[];
const allowed=['anatomy','silhouette','seams','material','fusion','spatial','other'];
const labels={anatomy:'Anatomie',silhouette:'Silhouette',seams:'Coutures',material:'Matière',fusion:'Fusion',spatial:'Corps / environnement',other:'Autre'};
const report=(text,ok=false)=>{$('pairStatus').textContent=text;$('pairStatus').className='report '+(ok?'ok':'muted')};
function toLines(s){return String(s).split(/\n/).map(x=>x.trim()).filter(Boolean).slice(0,10);}
async function readImage(file){
  if(!file || !['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Choisir un JPEG, PNG ou WEBP.');
  if(file.size>9_000_000)throw Error('Image trop lourde. Choisir un fichier inférieur à 9 Mo.');
  const url=URL.createObjectURL(file);const img=new Image();
  try { await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url;});
    const scale=Math.min(1,1300/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.round(scale*img.naturalWidth);canvas.height=Math.round(scale*img.naturalHeight);
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.82);
  }finally{URL.revokeObjectURL(url);}
}
for(const [id,img,which] of [['pairBefore','pairBeforePreview','before'],['pairAfter','pairAfterPreview','after']]){
  $(id).addEventListener('change',async(e)=>{
    try{
      const data=await readImage(e.target.files?.[0]);
      if(which==='before')beforeImage=data;else afterImage=data;
      $(img).src=data;$(img).hidden=false;
      report(`Image ${which==='before'?'avant':'après'} chargée localement. ${beforeImage&&afterImage?'Tu peux lancer une comparaison.':'Il manque la seconde image.'}`,true);
      $('pairApproval').checked=false;
    }catch(err){report(err.message);}
  });
}
function el(tag,attrs={},text){const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
function appendChange(change={category:'anatomy',zone:'',description:'',intensity:.5}){
  const id=(typeof crypto!=='undefined' && crypto.randomUUID)?crypto.randomUUID():String(Date.now()+Math.random());
  changes.push({id,...change});renderChanges();
}
function renderChanges(){
  const host=$('pairChanges');host.replaceChildren();
  changes.forEach((item,index)=>{
    const card=el('div',{class:'paired-change'}),header=el('div',{class:'paired-change-header'});
    header.append(el('b',{},`Transformation ${index+1}`));
    const remove=el('button',{type:'button',class:'outline'},'Retirer');remove.onclick=()=>{changes=changes.filter(c=>c.id!==item.id);renderChanges();};header.append(remove);card.append(header);
    const grid=el('div',{class:'paired-change-grid'});
    let category=el('select');for(const opt of allowed){const option=el('option',{value:opt},labels[opt]);if(item.category===opt)option.selected=true;category.append(option);}
    category.onchange=()=>item.category=category.value;
    const zone=el('input',{type:'text',placeholder:'Ex. emmanchure, bassin, col',value:item.zone||''});zone.oninput=()=>item.zone=zone.value;
    const categoryLabel=el('label',{},'Nature');categoryLabel.append(category);const zoneLabel=el('label',{},'Zone concernée');zoneLabel.append(zone);grid.append(categoryLabel,zoneLabel);card.append(grid);
    const description=el('textarea',{rows:'2',placeholder:'Décrire exactement ce qui change visuellement...'});description.value=item.description||'';description.oninput=()=>item.description=description.value;
    const descLabel=el('label',{},'Modification visible');descLabel.append(description);card.append(descLabel);
    const range=el('input',{type:'range',min:'0',max:'100',value:String(Math.round((item.intensity??.5)*100))});
    const value=el('span',{},String(range.value)+' %');range.oninput=()=>{item.intensity=Number(range.value)/100;value.textContent=range.value+' %';};
    const rangeLabel=el('label',{},'Degré de changement');rangeLabel.append(range,value);card.append(rangeLabel);
    host.append(card);
  });
}
$('pairAddChange').onclick=()=>appendChange();appendChange();
function fillFromAI(review){
  $('pairFamily').value=review.garment_family||'';
  $('pairBeforeDesc').value=review.before_description||'';
  $('pairAfterDesc').value=review.after_description||'';
  $('pairInvariant').value=(review.unchanged||[]).join('\n');
  $('pairIntent').value=review.aesthetic_intent||'';
  $('pairHypotheses').value=[...(review.sewing_hypotheses||[]),...(review.uncertainties||[]).map(x=>'Incertitude : '+x)].join('\n');
  $('pairRealism').value=review.status||'uncertain';
  $('pairNotes').value=review.notes||'';
  changes=(review.changes||[]).map((c,i)=>({...c,id:String(i)+'.'+Math.random()}));if(!changes.length)changes=[{id:'initial',category:'other',description:'',zone:'',intensity:.5}];
  renderChanges();$('pairApproval').checked=false;
}
$('pairCompare').onclick=async()=>{
  if(!beforeImage||!afterImage){report('Sélectionne deux images : AVANT et APRÈS.');return;}
  const b=$('pairCompare');b.disabled=true;report('Comparaison des deux images par Ollama local...');
  try{const response=await fetch('/api/v3/pairs/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({before_image:beforeImage,after_image:afterImage,model:'qwen2.5vl:3b'})});
    const json=await response.json();if(!response.ok)throw Error(json.detail||'Erreur Ollama');
    fillFromAI(json.review);report(json.comparison_quality==='insufficient'?'Le modèle n’a pas repéré de différence structurelle fiable. Corrige manuellement les transformations avant de sauvegarder ; ce résultat ne doit pas entraîner le moteur.':'Analyse différentielle proposée (AVANT / APRÈS). Vérifie les modifications structurelles avant validation.',json.comparison_quality!=='insufficient');
  }catch(err){report('Comparaison automatique indisponible : '+err.message+' Tu peux remplir tous les champs à la main.');}
  finally{b.disabled=false;}
};
function annotation(){
  const catToOperator={anatomy:'anatomy',silhouette:'contour',seams:'contour',material:'bias',fusion:'growth',spatial:'bias',other:'contour'};
  const valid=changes.filter(c=>String(c.description).trim());
  return {garment_family:$('pairFamily').value,before_description:$('pairBeforeDesc').value,
    after_description:$('pairAfterDesc').value,unchanged:toLines($('pairInvariant').value),
    changes:valid.map(({id,...c})=>c),aesthetic_intent:$('pairIntent').value,
    sewing_hypotheses:toLines($('pairHypotheses').value),
    uncertainties:['Une photographie seule ne prouve ni la construction ni les dimensions réelles.'],
    status:$('pairRealism').value,notes:$('pairNotes').value,human_approved:$('pairApproval').checked,
    suggested_operators:[...new Set(valid.map(c=>catToOperator[c.category]||'contour'))]};
}
$('pairSave').onclick=async()=>{
  if(!beforeImage||!afterImage){report('Il faut deux photographies pour enregistrer une paire.');return;}
  if(!$('pairApproval').checked){report('Vérifie les modifications, puis coche la validation humaine.');return;}
  const b=$('pairSave');b.disabled=true;
  try{const r=await fetch('/api/v3/pairs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({before_image:beforeImage,after_image:afterImage,annotation:annotation(),consent_to_local_save:true})});
    const j=await r.json();if(!r.ok)throw Error(j.detail||'Échec de l’enregistrement');
    report('Paire '+j.id+' sauvegardée sur ton Mac. Elle pourra servir de référence textuelle lors de prochaines analyses, après validation.',true);
    await refreshArchive();
  }catch(err){report(err.message);}finally{b.disabled=false;}
};
$('pairUse').onclick=()=>{
  if(!$('pairIntent').value.trim()){report('Décris d’abord ce que tu souhaites préserver.');return;}
  $('intent').value=$('pairIntent').value.trim();
  // Transfer the HUMAN-APPROVED intention to actual GBL mutation controls,
  // without asserting the visual appearance has already become geometry.
  const mapping={anatomy:'anatomy',silhouette:'contour',seams:'contour',material:'bias',fusion:'growth',spatial:'bias',other:'contour'};
  const proposed=new Set(changes.map(c=>mapping[c.category]).filter(Boolean));
  document.querySelectorAll('.checkboxes input[type=checkbox]').forEach(c=>{c.checked=proposed.has(c.value)});
  const peak=Math.max(0,...changes.map(c=>Number(c.intensity)||0));
  if(peak>0){$('intensity').value=Math.round(peak*100);$('intensityRead').textContent=$('intensity').value+' %';}
  $('preserve').value='90';$('preserveRead').textContent='90 %';
  const family=$('pairFamily').value.toLowerCase();
  if(/t.?shirt|top/.test(family))$('garment').value='t_shirt';
  else if(/débardeur|tank/.test(family))$('garment').value='sleeveless_top';
  else if(/tunique/.test(family))$('garment').value='tunic';
  $('step2').scrollIntoView({behavior:'smooth'});
  report('L’intention esthétique est maintenant copiée dans le patronage. Elle reste à traduire en géométrie et à vérifier.',true);
};
async function refreshArchive(){
  try{
    const response=await fetch('/api/v3/pairs');const res=await response.json();
    if(!response.ok)throw Error(res.detail||'Archive indisponible');
    const host=$('pairArchive');host.replaceChildren();
    if(!res.pairs.length){host.textContent='Aucune paire enregistrée.';return;}
    res.pairs.forEach(item=>{
      const row=el('div',{class:'paired-list-item'});
      const ann=item.annotation;const summary=el('div');summary.append(el('b',{},ann.garment_family||'Vêtement'));summary.append(el('div',{class:'small'},`${ann.changes.length} changement(s) · ${ann.status} · ${item.id}`));row.append(summary);
      const del=el('button',{type:'button',class:'outline'},'Supprimer');del.onclick=async()=>{
        if(!confirm('Supprimer définitivement cette paire et ses photos locales ?'))return;
        const r=await fetch('/api/v3/pairs/'+item.id,{method:'DELETE'});if(r.ok){await refreshArchive();report('Exemple supprimé.',true);}else report('Suppression impossible.');};
      row.append(del);host.append(row);
    });
  }catch(err){report('Bibliothèque indisponible : '+err.message);}
}
$('pairRefresh').onclick=refreshArchive;
refreshArchive();
})();
