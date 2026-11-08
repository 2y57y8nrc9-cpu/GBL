/* Garment Bending Lab V2 — local browser interface to Python + official sim adapter. */
(()=>{'use strict';
const $=id=>document.getElementById(id); const colors=['#c8b6ff','#83b1cf','#a5d4b9','#efc8ad','#d1b1b3','#c7babb'];
let catalog=[],active=null,original=null,lastResult=null,shape=[],model=null,angle=.35,elevation=.3;
let modelCanvas=$('viewer'),drag=null;
const htmlEsc=str=>String(str).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
async function api(path,method='GET',data=null){const res=await fetch(path,{method,headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});let out;try{out=await res.json();}catch{throw Error('Réponse JSON illisible, HTTP '+res.status)}if(!res.ok)throw Error(typeof out.detail==='string'?out.detail:JSON.stringify(out.detail||out));return out;}
function status(s,isError=false){$('mutateNote').textContent=s;$('mutateNote').className=isError?'small err':'small';}
function download(data,filename){const blob=new Blob([typeof data==='string'?data:JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function setName(title,desc){$('patternTitle').textContent=title;$('patternDesc').textContent=desc||'Spécification structurée importée.';}
function renderCatalog(){const filter=$('search').value.toLowerCase().trim();$('catalog').innerHTML=catalog.filter(x=>(x.title+' '+x.category+' '+x.description).toLowerCase().includes(filter)).map(x=>`<button class="cat ${x.id===active?'active':''}" data-slug="${x.id}"><span class="no">${x.id.slice(0,2)}</span><span><strong>${htmlEsc(x.title)}</strong><small>${htmlEsc(x.category)} · ${x.panels} panneaux · ${x.stitches} coutures</small></span></button>`).join('');for(const item of $('catalog').querySelectorAll('[data-slug]'))item.addEventListener('click',()=>choose(item.dataset.slug));}
async function choose(slug){try{const spec=await api('/api/pattern/'+encodeURIComponent(slug));const row=catalog.find(x=>x.id===slug);active=slug;original=structuredClone(spec);lastResult=null;model=null;setName(row.title,row.description);$('typeChip').textContent=row.category;renderCatalog();await update(original);status('Patron chargé ; tu peux maintenant modifier le niveau de corruption.');}catch(e) {status(e.message,true);}}
async function update(spec){const data=await api('/api/validate','POST',spec);drawSVG('original',(await api('/api/validate','POST',original)).shape);drawSVG('mutant',data.shape);displayDiagnostics(data.diagnostic);displayFit(data.fitting);render3D(spec);}
function drawSVG(svgId,panels){const svg=$(svgId);if(!panels||!panels.length){svg.innerHTML='';return;}const cols=Math.ceil(Math.sqrt(panels.length)),rows=Math.ceil(panels.length/cols),pad=17,cellW=200,cellH=250;let markup='';let allW=cols*cellW,allH=rows*cellH;
 panels.forEach((panel,i)=>{const pts=panel.points;let minX=Math.min(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxX=Math.max(...pts.map(p=>p[0])),maxY=Math.max(...pts.map(p=>p[1]));let w=Math.max(.01,maxX-minX),h=Math.max(.01,maxY-minY),scale=Math.min((cellW-2*pad)/w,(cellH-2*pad-22)/h),offX=i%cols*cellW+cellW/2-w*scale/2,offY=Math.floor(i/cols)*cellH+cellH/2-h*scale/2;
 const pl=pts.map(p=>`${(offX+(p[0]-minX)*scale).toFixed(2)},${(offY+(p[1]-minY)*scale).toFixed(2)}`).join(' ');
 markup+=`<polygon points="${pl}" fill="${colors[i%colors.length]}24" stroke="${colors[i%colors.length]}" stroke-width="1.7" stroke-linejoin="round"/>`;
 markup+=`<text x="${(i%cols+.5)*cellW}" y="${Math.floor(i/cols)*cellH+cellH-9}" fill="#bfc1cb" font-size="9" text-anchor="middle">${htmlEsc(panel.name.replaceAll('_',' '))}</text>`;
 });svg.setAttribute('viewBox',`0 0 ${allW} ${allH}`);svg.innerHTML=markup;}
function displayDiagnostics(d){$('panelCount').textContent=d.summary.panels;$('stitchCount').textContent=d.summary.stitches;$('maxGap').textContent=d.summary.max_mismatch_percent+'%';$('diagLabel').textContent=d.ok?'Géométrie analysée':'Erreurs détectées';$('diagLabel').style.color=d.ok?'var(--accent)':'var(--danger)';let issues=[...d.errors.map(x=>'⨯ '+x),...d.warnings.map(x=>'! '+x)];$('warnings').innerHTML=issues.length?issues.slice(0,8).map(x=>`<div class="${x[0]==='⨯'?'err':'warn'}">${htmlEsc(x)}</div>`).join(''):'Aucune erreur géométrique détectée. Cela ne prouve pas la faisabilité physique.';
 $('seamList').innerHTML='<table>'+d.seams.slice(0,28).map(s=>`<tr><td>${htmlEsc(s.a.replaceAll('corsage_',''))}<br>${htmlEsc(s.b.replaceAll('corsage_',''))}</td><td class="${s.grade==='OK'?'ok':s.grade==='INCOMPATIBLE'?'err':'warn'}">${s.mismatch_percent}%</td></tr>`).join('')+'</table>';}
function displayFit(f){
 if(!f?.applicable){$('fitReport').textContent='Dimensions non évaluées : patron non reconnu comme T-shirt à quatre panneaux.';return;}
 const rows=[
 ['Corsage (total)',f.corsage_total_cm,'Buste proxy',f.buste_proxy_cm,f.aisance_buste_cm],
 ['Manche (biceps)',f.tour_haut_manche_cm,'Bras proxy',f.bras_proxy_cm,f.aisance_haut_bras_cm],
 ['Poignet',f.tour_poignet_cm,'Avant-bras proxy',f.avant_bras_proxy_cm,f.aisance_avant_bras_cm]
 ];
 $('fitReport').innerHTML=rows.map(r=>`<div style="display:flex;gap:7px;justify-content:space-between;padding:6px 0;border-bottom:1px solid #353943"><span>${htmlEsc(r[0])} : ${r[1]} cm</span><span class="${r[4]<0?'err':'ok'}">aisance ${r[4]>=0?'+':''}${r[4]} cm</span></div>`).join('')
  +(f.warnings?.length?'<p class="err">'+f.warnings.map(htmlEsc).join(' · ')+'</p>':'<p class="ok">Cohérence dimensionnelle approximative : aucun conflit majeur détecté.</p>');
}
function deg(v){return (v||0)*Math.PI/180;}
function rotated(v,r){let [x,y,z]=v;let [a,b,c]=(r||[0,0,0]).map(deg);let t=y*Math.cos(a)-z*Math.sin(a);z=y*Math.sin(a)+z*Math.cos(a);y=t;t=x*Math.cos(b)+z*Math.sin(b);z=-x*Math.sin(b)+z*Math.cos(b);x=t;t=x*Math.cos(c)-y*Math.sin(c);y=x*Math.sin(c)+y*Math.cos(c);x=t;return[x,y,z];}
function trianglesFromSpec(spec){if(!spec?.pattern)return[];const parts=[];let i=0;for(const [name,p] of Object.entries(spec.pattern.panels)){let raw=p.vertices; if(raw.length<3)continue;let midX=raw.reduce((s,v)=>s+v[0],0)/raw.length,midY=raw.reduce((s,v)=>s+v[1],0)/raw.length;let r=p.rotation||[0,0,0],tr=p.translation||[0,0,0];let pts=raw.map(v=>{let a=rotated([v[0]-midX,v[1]-midY,0],r);return[a[0]+tr[0],a[1]+tr[1],a[2]+tr[2]]});parts.push({name,vertices:pts,fill:colors[i++%colors.length]});}return parts;}
function draw3D(){const dpr=window.devicePixelRatio||1,canvas=modelCanvas,w=canvas.clientWidth||500,h=canvas.clientHeight||310;canvas.width=Math.floor(w*dpr);canvas.height=Math.floor(h*dpr);const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#111318';ctx.fillRect(0,0,w,h);
 const polys=(model?.polys)||[];if(!polys.length){ctx.font='13px system-ui';ctx.fillStyle='#757b89';ctx.fillText('Aucun panneau 3D chargé',16,h/2);return;}
 let pts=polys.flatMap(p=>p.vertices);let center=[0,0,0];for(let p of pts)for(let k=0;k<3;k++)center[k]+=p[k]/pts.length;let box=Math.max(...[0,1,2].map(k=>Math.max(...pts.map(p=>Math.abs(p[k]-center[k])))),1);let az=angle,el=elevation;const project=p=>{let [x,y,z]=p.map((v,k)=>(v-center[k])/box),ca=Math.cos(az),sa=Math.sin(az),ce=Math.cos(el),se=Math.sin(el);let rx=x*ca+z*sa,rz=-x*sa+z*ca,ry=y*ce-rz*se,zz=y*se+rz*ce;let s=Math.min(w,h)*.31/(1+zz*.28);return [w/2+rx*s,h/2-ry*s,zz]};
 let faces=[];for(const p of polys){if(!p.faces){for(let j=1;j<p.vertices.length-1;j++)faces.push({verts:[p.vertices[0],p.vertices[j],p.vertices[j+1]],color:p.fill});}else for(const f of p.faces)faces.push({verts:f.map(j=>p.vertices[j]),color:p.fill});}faces=faces.map(f=>({color:f.color,pts:f.verts.map(project)})).sort((a,b)=>b.pts.reduce((s,p)=>s+p[2],0)-a.pts.reduce((s,p)=>s+p[2],0));
 for(const f of faces){const pts=f.pts;ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let j=1;j<pts.length;j++)ctx.lineTo(pts[j][0],pts[j][1]);ctx.closePath();ctx.fillStyle=f.color+'31';ctx.strokeStyle=f.color+'aa';ctx.lineWidth=.85;ctx.fill();ctx.stroke();}ctx.fillStyle='#9296a6';ctx.font='10px ui-monospace,monospace';ctx.fillText('CAMERA : ROTATION MANUELLE · VISUALISATION GÉOMÉTRIQUE',12,h-13);}
function render3D(spec){model={polys:trianglesFromSpec(spec)};draw3D();}
function loadObj(text){let verts=[],faces=[];for(const l of text.split(/\r?\n/)){if(l.startsWith('v ')){const v=l.trim().split(/\s+/).slice(1,4).map(Number);if(v.length===3&&v.every(Number.isFinite))verts.push(v);}else if(l.startsWith('f ')){let f=l.trim().split(/\s+/).slice(1).map(a=>Number(a.split('/')[0])-1);if(f.length>=3&&f.every(Number.isFinite))for(let j=1;j<f.length-1;j++)faces.push([f[0],f[j],f[j+1]]);}}if(!verts.length||!faces.length)throw Error('OBJ sans faces exploitables');let step=Math.max(1,Math.ceil(faces.length/2600));model={polys:[{vertices:verts,faces:faces.filter((_,i)=>i%step===0),fill:'#c3c9e5'}]};draw3D();}
async function mutateNow(){if(!original){status('Charge d’abord un patron JSON.',true);return;}try{status('Calcul de la mutation…');$('mutate').disabled=true;const body={specification:original,intensity:Number($('intensity').value),seed:Number($('seed').value),operators:[...document.querySelectorAll('fieldset input:checked')].map(x=>x.value),mode:$('mode').value,equalize:$('equalize').checked};let result=await api('/api/mutate','POST',body);lastResult=result;const orig=await api('/api/validate','POST',original);drawSVG('original',orig.shape);drawSVG('mutant',result.shape);displayDiagnostics(result.diagnostic);displayFit(result.fitting);render3D(result.specification);status('Mutation créée · '+result.reduced_steps+' réduction(s) de l’intensité pour limiter les intersections.');}catch(e){status('Erreur mutation : '+e.message,true)}finally{$('mutate').disabled=false;}}
async function importLocal(file){try{const text=await file.text(),doc=JSON.parse(text);const check=await api('/api/validate','POST',doc);if(!check.diagnostic.ok)throw Error(check.diagnostic.errors.join(' ; '));active=null;original=doc;lastResult=null;renderCatalog();setName(file.name,'Import personnel · Coutures explicites reprises depuis le JSON');$('typeChip').textContent='JSON importé';await update(original);status('Spécification importée et analysée : '+file.name);}catch(e){status('Import refusé : '+e.message,true)}}
async function simulation(){let spec=lastResult?.specification||original;if(!spec){status('Aucun patron à simuler.',true);return;}try{let run=await api('/api/native/simulate','POST',spec);$('jobStatus').textContent='Simulation officielle envoyée au moteur : job '+run.id;let count=0;const polling=async()=>{let job=await api('/api/native/jobs/'+run.id);$('jobStatus').textContent='GarmentCode officiel : '+job.status+' · job '+run.id;if(job.status==='running'||job.status==='queued'){if(++count<600)setTimeout(polling,1800);return;}if(job.status==='failed'){status('Échec du moteur officiel ; consulter le journal.',true);$('jobStatus').innerHTML+=` · <a href="/api/native/jobs/${run.id}/log" target="_blank">journal</a>`;return;}if(job.status==='completed'){status('Simulation officielle terminée ; inspection du résultat recommandée.');if(job.output_paths?.length){let path='/api/native/jobs/'+run.id+'/model/0';$('jobStatus').innerHTML+=` · <a href="${path}">OBJ</a>`;try{let r=await fetch(path);loadObj(await r.text())}catch(e){status('Simulation terminée, mais aperçu OBJ indisponible : '+e.message,true)}}else $('jobStatus').textContent+=' · aucune sortie OBJ détectée automatiquement (voir le dossier du simulateur).';}};await polling();}catch(e){status('Simulation non lancée : '+e.message,true)}}

async function simulateMac(){
 const spec=lastResult?.specification||original;
 if(!spec){status('Sélectionne d’abord un patron JSON.',true);return;}
 $('simulateMac').disabled=true;
 try{
  $('macJobStatus').textContent='Lancement du test de drapé Blender…';
  const run=await api('/api/mac/simulate','POST',spec);
  let polls=0;
  async function poll(){
   const job=await api('/api/mac/jobs/'+run.id);
   $('macJobStatus').textContent='Blender : '+job.status+' · '+run.id;
   if(job.status==='queued'||job.status==='running'){
    if(++polls<310){setTimeout(poll,1800);}else{$('macJobStatus').textContent='Calcul long : consulter le journal du job.';}
    return;
   }
   const base='/api/mac/jobs/'+run.id+'/file/';
   if(job.status==='completed'){
    $('macJobStatus').innerHTML='Simulation du panneau terminée (pas le vêtement cousu).'
      +' · <a href="'+base+'tissu_drape.obj">OBJ</a>'
      +' · <a href="'+base+'atelier_drape.blend">Blender</a>'
      +' · <a href="'+base+'rapport.json">Rapport</a>';
    try{const response=await fetch(base+'tissu_drape.obj'); if(response.ok)loadObj(await response.text());}
    catch(e){status('OBJ disponible mais prévisualisation impossible : '+e.message,true);}
   }else{
    $('macJobStatus').innerHTML='Échec Blender : '+htmlEsc(job.message||'voir journal')
      +' · <a href="'+base+'blender.log" target="_blank">Journal</a>';
   }
  }
  await poll();
 }catch(e){$('macJobStatus').textContent='Blender : '+e.message; status('Erreur : '+e.message,true)}
 finally{$('simulateMac').disabled=false;}
}


async function simulateSewn(){
 const spec=lastResult?.specification||original;
 if(!spec){status('Sélectionne d’abord un patron JSON.',true);return;}
 $('simulateSewn').disabled=true;
 $('sewnJobStatus').textContent='Préparation des panneaux et des ressorts de couture…';
 try{
  const run=await api('/api/mac/sewn','POST',spec);
  let polls=0;
  async function poll(){
   const job=await api('/api/mac/jobs/'+run.id);
   $('sewnJobStatus').textContent='Couture Blender : '+job.status+' · '+run.id;
   if(job.status==='queued'||job.status==='running'){
    if(++polls<360)setTimeout(poll,1800);
    else $('sewnJobStatus').textContent='Calcul très long : consulter le journal.';
    return;
   }
   const base='/api/mac/jobs/'+run.id+'/file/';
   if(job.status==='completed'){
    const report=job.report||{};
    const initial=report.initial_gap?.mean_m,final=report.final_gap?.mean_m;
    const resultText=(Number.isFinite(initial)&&Number.isFinite(final))
       ?'Distance moyenne entre points cousus : '+(initial*100).toFixed(1)+' cm → '+(final*100).toFixed(1)+' cm. '
       :'Rapport de couture disponible. ';
    const trustworthy=report.quality_status==='candidate_for_visual_review';
    const label=trustworthy
      ? '<span class="ok">● Calcul terminé — vérifier le rendu physique</span>'
      : '<span class="err">● Calcul terminé — drapé NON FIABLE (analyse nécessaire)</span>';
    const worst=Array.isArray(report.worst_seams)
      ? report.worst_seams.slice(0,2).map(s=>`${s.left} ↔ ${s.right} : ${s.max_cm} cm`).join(' ; ')
      : '';
    const reasons=Array.isArray(report.quality_reasons)?report.quality_reasons.join(' ; '):'';
    $('sewnJobStatus').innerHTML=label+'<br>'+htmlEsc(resultText)
      +(worst?'<br>Raccords problématiques : '+htmlEsc(worst):'')
      +(reasons?'<br>Alertes : '+htmlEsc(reasons):'')
      +'<br><a href="'+base+'tshirt_cousu.obj">OBJ</a>'
      +' · <a href="'+base+'atelier_tshirt_cousu.blend">Ouvrir dans Blender</a>'
      +' · <a href="'+base+'rapport_couture.json">Rapport</a>';
    try{const response=await fetch(base+'tshirt_cousu.obj');if(response.ok)loadObj(await response.text());}
    catch(e){status('OBJ créé mais aperçu 3D indisponible : '+e.message,true);}
   }else{
    $('sewnJobStatus').innerHTML='Échec couture Blender : '+htmlEsc(job.message||'voir journal')
      +' · <a href="'+base+'blender.log" target="_blank">Journal</a>';
   }
  }
  await poll();
 }catch(e){$('sewnJobStatus').textContent='Couture Blender : '+e.message;status('Erreur : '+e.message,true);}
 finally{$('simulateSewn').disabled=false;}
}

function listen(){ $('search').addEventListener('input',renderCatalog);$('importBtn').addEventListener('click',()=>$('upload').click());$('upload').addEventListener('change',e=>{if(e.target.files?.[0])importLocal(e.target.files[0]);e.target.value='';});$('intensity').addEventListener('input',e=>$('intensityValue').textContent=e.target.value+'%');$('mutate').addEventListener('click',mutateNow);$('reset').addEventListener('click',async()=>{lastResult=null;model=null;if(original){await update(original);status('Original restauré.')}});$('download').addEventListener('click',()=>{let spec=lastResult?.specification||original;if(spec)download(spec,'GBL_V2_'+(active||'mon_patron')+'_specification.json');else status('Aucun patron à exporter.',true)});$('downloadAll').addEventListener('click',()=>download(catalog,'catalogue_GBL_V2.json'));$('simulate').addEventListener('click',simulation);$('simulateMac').addEventListener('click',simulateMac);$('simulateSewn').addEventListener('click',simulateSewn);
 modelCanvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];modelCanvas.setPointerCapture(e.pointerId)});modelCanvas.addEventListener('pointermove',e=>{if(!drag)return;angle+=(e.clientX-drag[0])*.008;elevation=Math.max(-1.3,Math.min(1.3,elevation+(e.clientY-drag[1])*.006));drag=[e.clientX,e.clientY];draw3D()});modelCanvas.addEventListener('pointerup',()=>drag=null);modelCanvas.addEventListener('pointercancel',()=>drag=null);window.addEventListener('resize',draw3D);
}
async function start(){listen();try{catalog=await api('/api/catalog');renderCatalog();const run=await api('/api/native/status');$('warpStatus').innerHTML=run.enabled?'<span class="ok">● Connexion configurée</span><br>Prêt à demander un calcul au moteur GarmentCode (exécution non encore vérifiée).':'<span class="warn">● Simulateur externe non installé / non configuré</span><br>Le laboratoire JSON et les mutations fonctionnent. Pour le drapé réel, configure GarmentCode officiel et son fork NVIDIA Warp.';$('simulate').disabled=!run.enabled;try{const mac=await api('/api/mac/status');$('macStatus').innerHTML=(mac.warp_cpu?.available?'<span class="ok">● Warp CPU fonctionne</span>':'<span class="warn">● Warp CPU non détecté par ce serveur</span>')+'<br>'+(mac.enabled?'<span class="ok">● Blender disponible</span>':'<span class="warn">● Blender non installé / non détecté</span>')+'<br>GarmentCode officiel : installation distincte.';$('simulateMac').disabled=!mac.enabled;$('simulateSewn').disabled=!mac.enabled;}catch(e){$('macStatus').textContent='Diagnostic macOS indisponible : '+e.message;}if(catalog[0])await choose(catalog[0].id);}catch(e){status('Démarrage : '+e.message,true)}}
start();
})();
