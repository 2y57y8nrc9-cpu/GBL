/* Garment Bending Lab 0.5 · PDF vector import, registered page assembly, selected piece mutation */
(function(){
'use strict';
const P=window.GBLPDF,E=window.GBLEngine,M=window.GBLSeams,I=window.GBLIntelligence,AUTO=window.GBLAuto,$=id=>document.getElementById(id);
let documentPdf=null,paths=[],selected=new Set(),calibration=[],pieces=[],seams=[],lastImportFilename='PDF';
let currentView='raw',pickSide='a',anchors={a:[],b:[]},newDraft=null;
let mode='';const maxPreview=200;let semanticEdges={},assemblyProposals=[],semanticFocus=null,autoReport=null;
const fmt=n=>Number(n).toFixed(2);
function notice(s,bad=false){$('pdfStatus').textContent=s;$('pdfStatus').classList.toggle('alert',bad);}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]||c));}
function download(name,text,mime='image/svg+xml'){const blob=new Blob([text],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function asMm(pt){return pt*P.PT2MM;}
function refreshPaths(preserve=false){
 paths=P.uniquePaths(P.globalPaths(documentPdf,{darkOnly:true,minLengthPt:parseFloat($('minTraceLength').value||20)*P.MM2PT}));
 if(!preserve)selected.clear();
 $('pdfFound').textContent=`${documentPdf.pages.length} pages · ${paths.length} tracés vectoriels candidats · ${documentPdf.autoRegistered?'repères communs détectés':'alignement manuel'}`;
 renderAssembly();renderTraceList();renderPieces();
}
function pageAdjustments(){const grid=$('pdfPages');grid.replaceChildren();
 documentPdf.pages.forEach((p,i)=>{const row=document.createElement('div');row.className='pdf-page-row';
  const title=document.createElement('strong');title.textContent='A4 — '+(i+1);row.append(title);
  const x=document.createElement('input'),y=document.createElement('input');
  for(const [el,prop,label] of [[x,'dx','X'],[y,'dy','Y']]){
   el.type='number';el.step='0.1';el.value=fmt(asMm(p[prop]));el.title=label+' (mm)';el.setAttribute('aria-label',label+' page '+(i+1)+' en mm');
   el.addEventListener('change',()=>{if(!Number.isFinite(+el.value))return;p[prop]=+el.value*P.MM2PT;documentPdf.autoRegistered=false;refreshPaths(true);});
   const wrap=document.createElement('label');wrap.textContent=label+' mm ';wrap.append(el);row.append(wrap);
  }grid.append(row);
 });
}
function registrationMessage(){
 if(documentPdf.autoRegistered){
   const unique=(numbers)=>[...new Set(numbers.map(n=>Math.round(n*10)/10))].sort((a,b)=>a-b);
   const xs=unique(documentPdf.pages.map(p=>p.dx)),ys=unique(documentPdf.pages.map(p=>p.dy));
   const stepX=xs.length>1?(xs[1]-xs[0])*P.PT2MM:null;
   const stepY=ys.length>1?(ys[1]-ys[0])*P.PT2MM:null;
   const overlapX=stepX==null?null:documentPdf.pages[0].width*P.PT2MM-stepX;
   const overlapY=stepY==null?null:documentPdf.pages[0].height*P.PT2MM-stepY;
   const details=[];
   if(stepX!==null)details.push('pas horizontal '+stepX.toFixed(2)+' mm (recouvrement '+overlapX.toFixed(2)+' mm)');
   if(stepY!==null)details.push('pas vertical '+stepY.toFixed(2)+' mm (recouvrement '+overlapY.toFixed(2)+' mm)');
   $('pdfRegInfo').textContent='Repères vectoriels communs détectés : '+details.join(' · ')+'. Alignement calculé à partir des coordonnées du PDF, sans rasterisation. Contrôle visuel des raccords et test d’échelle indispensables.';
 }else $('pdfRegInfo').textContent='Mode grille manuelle : le recouvrement varie selon les fournisseurs. Ajuste X/Y en mm en comparant les lignes qui passent d’une feuille à l’autre. L’outil ne certifie pas automatiquement la justesse des jonctions.';
}
function viewBox(){const bounds=[];for(const p of documentPdf.pages)bounds.push({x:p.dx,y:p.dy,w:p.width,h:p.height});
 for(const p of paths)bounds.push(p.bbox);
 const x=Math.min(...bounds.map(b=>b.x))-30,y=Math.min(...bounds.map(b=>b.y))-30;
 const X=Math.max(...bounds.map(b=>b.x+b.w))+30,Y=Math.max(...bounds.map(b=>b.y+b.h))+30;
 return {x,y,w:Math.max(1,X-x),h:Math.max(1,Y-y)};
}
function svgSegments(p){return p.points.map((q,i)=>(i?'L':'M')+fmt(q.x)+' '+fmt(q.y)).join(' ');}
function renderAssembly(){if(currentView==='seams'&&pieces.length){renderSeamCanvas();return;}if(!documentPdf)return;const b=viewBox();const view=$('pdfAssembly');view.replaceChildren();
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',[b.x,b.y,b.w,b.h].join(' '));svg.setAttribute('role','img');svg.setAttribute('aria-label','Planche A4 assemblée et tracés sélectionnables');svg.classList.add('pdf-assembly-svg');
 for(let i=0;i<documentPdf.pages.length;i++){
  const p=documentPdf.pages[i],rect=document.createElementNS(ns,'rect');for(const [k,v] of Object.entries({x:p.dx,y:p.dy,width:p.width,height:p.height}))rect.setAttribute(k,v);
  rect.setAttribute('class','pdf-sheet');svg.append(rect);
  const t=document.createElementNS(ns,'text');t.setAttribute('x',p.dx+22);t.setAttribute('y',p.dy+28);t.setAttribute('class','pdf-sheet-label');t.textContent='A4 / '+(i+1);svg.append(t);
 }
 for(let i=0;i<paths.length;i++){
  const p=paths[i],path=document.createElementNS(ns,'path');path.setAttribute('d',svgSegments(p));path.setAttribute('class','pdf-trace'+(selected.has(i)?' selected':''));path.setAttribute('data-trace',String(i));
  const title=document.createElementNS(ns,'title');title.textContent='Trace '+(i+1)+' · '+(p.length*P.PT2MM).toFixed(1)+' mm'+(p.closed?' (fermé)':'');path.append(title);
  path.addEventListener('click',e=>{e.preventDefault();toggleTrace(i);});svg.append(path);
 }
 view.append(svg);svg.style.width=$('pdfZoom').value+'%';registrationMessage();
}
function toggleTrace(i){if(selected.has(i))selected.delete(i);else selected.add(i);renderAssembly();renderTraceList();}
function renderTraceList(){const root=$('pdfTraceList');root.replaceChildren();
 const choices=paths.map((p,i)=>({i,p})).sort((a,b)=>b.p.length-a.p.length);
 for(const {p,i} of choices.slice(0,maxPreview)){const btn=document.createElement('button');btn.type='button';btn.className='pdf-trace-button'+(selected.has(i)?' selected':'');
  const delta=Math.hypot(p.points[0].x-p.points.at(-1).x,p.points[0].y-p.points.at(-1).y)*P.PT2MM;
  btn.textContent='#'+(i+1)+' · '+fmt(p.length*P.PT2MM)+' mm · '+(delta<.8?'fermé':'ouvert '+delta.toFixed(1)+' mm');
  btn.addEventListener('click',()=>toggleTrace(i));root.append(btn);
 }
 $('pdfSelected').textContent=selected.size+' tracé(s) sélectionné(s).';
}
function setPieceRotation(piece,deg){piece.displayRotation=((Number(deg)%360)+360)%360;publishPieces();renderPieces();renderAssembly();notice(piece.role+' : orientation '+piece.displayRotation+'° (export SVG inclus). Longueurs de couture et dimensions conservées.');}
function renderPieces(){const e=$('pdfPieces');e.replaceChildren();for(const p of pieces){const div=document.createElement('div');div.className='pdf-piece-line';
  const t=document.createElement('span');t.textContent=p.label+' ('+p.vertices.length+' points)';
  const role=document.createElement('select');role.className='pdf-role-select';role.title='Rôle probable de la pièce';
  for(const [value,label] of [['autre','Autre'],['devant','Devant'],['dos','Dos'],['manche','Manche'],['col','Col'],['pantalon','Pantalon']]){const o=document.createElement('option');o.value=value;o.textContent=label;role.append(o);}role.value=p.role||'autre';
  role.addEventListener('change',()=>{p.role=role.value;semanticEdges={};assemblyProposals=[];renderSemanticResults();renderAutoAssembly();publishPieces();renderSeamControls();renderAssembly();});
  const rotation=document.createElement('div');rotation.className='rotation-tools';
  for(const [label,step,title] of [['↶',-90,'Tourner de -90°'],['↷',90,'Tourner de +90°'],['180°',180,'Retourner de 180°'],['0°',null,'Orientation d’origine']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.setAttribute('aria-label',title+' : '+p.role);b.addEventListener('click',()=>setPieceRotation(p,step===null?0:(p.displayRotation||0)+step));rotation.append(b);}
  const a=document.createElement('button');a.type='button';a.textContent='Auto ↑';a.title='Placer visuellement la pièce selon une verticale probable';a.addEventListener('click',()=>{const bb=P.bbox(p.vertices);let deg=0;if(['devant','dos'].includes(p.role)&&bb.w>bb.h*1.4)deg=-90;else if(p.role==='manche'&&bb.h>bb.w*1.25)deg=90;setPieceRotation(p,deg);});rotation.append(a);
  const rm=document.createElement('button');rm.textContent='Retirer';rm.addEventListener('click',()=>{pieces=pieces.filter(x=>x.id!==p.id);seams=seams.filter(x=>x.a[0]!==p.id&&x.b[0]!==p.id);resetAnchors();semanticEdges={};assemblyProposals=[];renderSemanticResults();renderAutoAssembly();publishPieces();renderPieces();renderAssembly();});
  div.append(t,role,rotation,rm);e.append(div);
 }$('pdfPieceCount').textContent=pieces.length+' pièce(s). ↶/↷/180° : rotation non destructive, reprise dans l’export SVG sans changer l’échelle des pièces.';
 renderSeamControls();
}

function publishPieces(){
 let offsetX=0;const cloned=pieces.map(p=>{const oriented=I.orientPiece(p),bounds=oriented.box;const next={...p,vertices:oriented.vertices.map(v=>({x:v.x-bounds.x,y:v.y-bounds.y})),layout:{x:offsetX,y:0}};offsetX+=bounds.w+40;return next;});
 window.GBLImportedDraft={source:lastImportFilename,pieces:cloned,seams:seams.map(q=>({...q,a:[...q.a],b:[...q.b]})),analysis:autoReport};
 const option=Array.from($('base').options).find(o=>o.value==='pdf_import');if(option)option.disabled=!pieces.length;
 if(pieces.length&&$('base').value==='pdf_import')$('base').dispatchEvent(new Event('change'));
}
function createPiece(){try{
 const group=[...selected].sort((a,b)=>a-b).map(i=>paths[i]);const close=$('experimentalClosure').checked;
 const p=P.combinePiecePaths(group,'pdf_'+String(pieces.length+1),'PDF / PIÈCE '+(pieces.length+1),close);
 if(p.source?.gapMm>.8)notice('Pièce enregistrée avec fermeture expérimentale : écart entre extrémités '+p.source.gapMm.toFixed(1)+' mm. À contrôler avant découpe.');
 else notice('Contour ajouté au moteur. Tu peux maintenant choisir « PDF importé » dans Construction.');
 p.role='autre';p.displayRotation=0;pieces.push(p);selected.clear();publishPieces();renderPieces();renderAssembly();renderTraceList();
 }catch(e){notice(e.message,true);}
}
function resetAnchors(){anchors={a:[],b:[]};newDraft=null;}
function autoDetectPieces(){
 if(!documentPdf)return;
 const proposals=M.proposePieces(paths,P);
 if(!proposals.length)return notice('Aucun grand contour fermé détecté. Sélectionne un tracé, vérifie les raccords puis essaie la fermeture expérimentale.',true);
 pieces=[];seams=[];semanticEdges={};assemblyProposals=[];selected.clear();resetAnchors();
 for(const item of proposals){
  try{const p=P.makePiece(paths[item.index],'pdf_'+(pieces.length+1),'PDF / '+item.role.toUpperCase()+' '+(pieces.length+1),false);
    p.role=item.role;p.displayRotation=0;p.proposal={trace:item.index+1,confidence:item.confidence};pieces.push(p);
  }catch(e){console.warn('Auto contour rejected',item.index,e.message);}
 }
 currentView='seams';publishPieces();renderPieces();renderAssembly();renderTraceList();analyzeEdges();suggestAssembly();
 notice(pieces.length+' pièces proposées automatiquement (non certifiées). Contrôle les rôles, puis lie les coutures au moyen de deux points par bord.');
}
// V0.9: safe fully local pipeline. Auto-accepting a semantic match only says
// "plausible geometry", never "physically sewn". Deliberate review gates.
function renderAutoReport(report,failures=[]){
 const panel=$('autoPipelineReport');if(!panel)return;panel.replaceChildren();
 if(!report){panel.textContent='Aucun PDF analysé.';return;}
 const h=document.createElement('strong');h.textContent='ANALYSE AUTOMATIQUE · '+(report.mode==='experimental'?'MODE EXPÉRIMENTAL':'MODE PRUDENT');panel.append(h);
 const status=document.createElement('span');status.className='auto-status';
 status.textContent=`${report.metadata.pieceCount} pièce(s) · ${report.approved.length} couture(s) associée(s) · ${report.review.length} à examiner · ${report.blocked.length+failures.length} bloquée(s)`;panel.append(status);
 const line=(klass,msg)=>{const e=document.createElement('div');e.className=klass;e.textContent=msg;panel.append(e);};
 for(const a of report.approved)line('auto-good',`LIÉE · ${a.name} · écart initial ${a.differencePct.toFixed(1)} % · provisoire`);
 for(const a of report.review)line('auto-review',`À RECONSTRUIRE · ${a.name} · ${a.differencePct.toFixed(1)} % · non cousu automatiquement`);
 for(const a of report.blocked)line('auto-bad',`BLOQUÉE · ${a.name} · ${a.reason}`);
 for(const f of failures)line('auto-bad','Échec de liaison : '+f);
 for(const warning of report.metadata.warnings)line('auto-review',warning);
 const note=document.createElement('p');note.className='note';note.textContent='Les correspondances validées sont des hypothèses calculées sur les contours vectoriels. Marge de couture, encoches, aisance, taille et topologie restent à contrôler avant découpe. Les lacunes ne sont jamais comblées par des faux raccords.';panel.append(note);
}
function autoReconstruct({afterImport=false}={}){
 if(!documentPdf){notice('Importe un PDF vectoriel pour lancer le processus automatique.',true);return;}
 const run=()=>{
  const proposals=M.proposePieces(paths,P);
  if(!proposals.length){pieces=[];seams=[];publishPieces();notice('Aucune pièce vectorielle fermée fiable. Ce PDF exige un recalage ou un tracé manuel.',true);renderAutoReport(null);return;}
  pieces=[];seams=[];selected.clear();resetAnchors();
  for(const item of proposals){try{const piece=P.makePiece(paths[item.index],'pdf_'+(pieces.length+1),'PDF / '+item.role.toUpperCase()+' '+(pieces.length+1),false);
     piece.role=item.role;piece.displayRotation=0;piece.proposal={trace:item.index+1,confidence:item.confidence};pieces.push(piece);
   }catch(e){console.warn('Auto-pièce rejetée',e.message);}}
  const mode=$('autoMode').value;
  const report=AUTO.plan(pieces,I,mode),committed=AUTO.commit(report,pieces,M);
  pieces=committed.pieces;seams=committed.seams;autoReport={...report,edges:undefined,failed:committed.failed};
  semanticEdges=report.edges;assemblyProposals=report.suggestions;currentView='seams';
  publishPieces();renderPieces();renderAssembly();renderSemanticResults();renderAutoAssembly();renderAutoReport(report,committed.failed);
  $('autoReanalyze').disabled=false;$('autoInspect').disabled=false;
  $('base').value='pdf_import';$('fitLimit').value=String(AUTO.LIMITS[mode].maxFit);
  $('autoFitSeams').checked=true;$('linkedSeams').checked=true;
  $('base').dispatchEvent(new Event('change'));
  const incomplete=report.review.length+report.blocked.length+committed.failed.length;
  notice('Analyse automatique : '+pieces.length+' pièce(s), '+seams.length+' couture(s) liées, '+incomplete+' liaison(s) à examiner. La mutation est prête. '+(incomplete?'Assemblage incomplet : inspection recommandée.':''),Boolean(incomplete));
  if(afterImport)expand(false);
  if(afterImport)$('autoPipelineReport').scrollIntoView({block:'nearest'});
 };
 try{run();}catch(e){console.error('Automatic reconstruction failure',e);notice('Analyse automatique partielle : '+e.message,true);renderAutoReport(null);}
}
function panelPlacements(){let x=0;const out=new Map();for(const p of pieces){const oriented=I.orientPiece(p),b=oriented.box;out.set(p.id,{x:x-b.x,y:15-b.y,vs:oriented.vertices});x+=b.w+55;}return {map:out,width:Math.max(100,x),height:Math.max(150,...pieces.map(p=>I.orientPiece(p).box.h+55))};}
function svgElement(name,attr={}){const e=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [k,v] of Object.entries(attr))e.setAttribute(k,v);return e;}
function highlightArc(svg,p,at,side,position){if(at.length!==2)return;try{
 const original=M.arcPoints(p.vertices,at[0],at[1]);const angle=(p.displayRotation||0)*Math.PI/180,c=Math.cos(angle),si=Math.sin(angle);const coords=original.points.map(v=>({x:v.x*c-v.y*si+position.x,y:v.x*si+v.y*c+position.y}));
 const color=side==='a'?'#ffc676':'#6dd7ca';
 const path=svgElement('path',{d:coords.map((v,i)=>(i?'L':'M')+v.x+' '+v.y).join(' '),fill:'none',stroke:color,'stroke-width':'5','stroke-linecap':'round',opacity:'.9'});svg.append(path);
 }catch(e){}
}
function renderSeamCanvas(){const target=$('pdfAssembly');target.replaceChildren();const placement=panelPlacements(),svg=svgElement('svg',{viewBox:`-18 -18 ${placement.width+20} ${placement.height+25}`,class:'pdf-assembly-svg pdf-seam-mode','aria-label':'Panneaux vectoriels : cliquer deux points pour délimiter une couture'});
 for(const p of pieces){const origin=placement.map.get(p.id),d=origin.vs.map((v,i)=>(i?'L':'M')+(v.x+origin.x).toFixed(2)+' '+(v.y+origin.y).toFixed(2)).join(' ')+' Z';
  const path=svgElement('path',{d,class:'pattern-shape',tabindex:'0'});const title=svgElement('title');title.textContent=p.label+' : sélectionner deux sommets pour marquer un bord';path.append(title);
  const click=e=>{e.preventDefault();const targetId=(pickSide==='a'?'pdfSeamA':'pdfSeamB'),wanted=$(targetId).value;
    if(p.id!==wanted){$(targetId).value=p.id;anchors[pickSide]=[];}
    const point=svg.createSVGPoint();point.x=e.clientX;point.y=e.clientY;
    const world=point.matrixTransform(svg.getScreenCTM().inverse()),local={x:world.x-origin.x,y:world.y-origin.y};
    const near=M.nearestVertex(origin.vs,local);
    if(anchors[pickSide].length===2)anchors[pickSide]=[];
    if(anchors[pickSide].length===1&&anchors[pickSide][0]===near.index)return;
    anchors[pickSide].push(near.index);renderSeamCanvas();renderSeamHint();
  };
  path.addEventListener('click',click);svg.append(path);
  const orientedBox=I.orientPiece(p).box;const label=svgElement('text',{x:origin.x+orientedBox.x+3,y:origin.y+orientedBox.y-5,fill:'#f6d7e7','font-size':'10','font-family':'monospace'});label.textContent=(p.role||'autre').toUpperCase()+' · '+p.id;svg.append(label);
  if(semanticFocus&&semanticFocus.piece===p.id)highlightArc(svg,p,[semanticFocus.start,semanticFocus.end],'a',origin);
  for(const side of ['a','b']){if($(side==='a'?'pdfSeamA':'pdfSeamB').value!==p.id)continue;
    highlightArc(svg,p,anchors[side],side,origin);
    anchors[side].forEach(idx=>{const v=origin.vs[idx],c=svgElement('circle',{cx:v.x+origin.x,cy:v.y+origin.y,r:4,class:'pdf-seam-marker'});svg.append(c);});
  }
 }
 target.append(svg);svg.style.width=$('pdfZoom').value+'%';
}
function renderSeamControls(){for(const [id,side] of [['pdfSeamA','a'],['pdfSeamB','b']]){
 const select=$(id),old=select.value;select.replaceChildren();for(const p of pieces){const o=document.createElement('option');o.value=p.id;o.textContent=p.label+' · '+(p.role||'?');select.append(o);}if(pieces.some(p=>p.id===old))select.value=old;else if(pieces.length){select.value=pieces[side==='a'?0:Math.min(1,pieces.length-1)].id;}
 }
 const list=$('pdfSeamList');list.replaceChildren();for(const s of seams){const row=document.createElement('div');row.className='pdf-seam-line';const text=document.createElement('span');text.textContent=(s.name||s.id)+' · '+s.a[0]+' → '+s.b[0];
 const ease=document.createElement('label');ease.className='seam-ease';ease.textContent='Aisance % ';const value=document.createElement('input');value.type='number';value.min='-5';value.max='12';value.step='.5';value.title='Aisance de montage indicative, à contrôler en atelier';value.value=Number(s.ease||0);value.addEventListener('change',()=>{s.ease=Math.min(12,Math.max(-5,Number(value.value)||0));value.value=s.ease;publishPieces();notice('Aisance '+s.ease+' % appliquée à '+s.id+' (hypothèse à valider sur une toile).');});ease.append(value);
 const rm=document.createElement('button');rm.textContent='Délier';rm.addEventListener('click',()=>{
   for(const [pid,edge] of [s.a,s.b]){const p=pieces.find(q=>q.id===pid);if(p)p.edgeLabels=p.edgeLabels.map(x=>x===edge?'contour':x);}
   seams=seams.filter(q=>q.id!==s.id);publishPieces();renderSeamControls();renderSeamCanvas();notice('Couture supprimée.');
 });row.append(text,ease,rm);list.append(row);}
 renderSeamHint();
}
function renderSeamHint(){const status=$('pdfSeamHint');if(!pieces.length){status.textContent='Importe un PDF et clique sur « Détecter les pièces fermées ». ';return;}
 let messages=[];for(const side of ['a','b']){const pts=anchors[side],p=pieces.find(q=>q.id===$(side==='a'?'pdfSeamA':'pdfSeamB').value);
  if(!p){messages.push('Pièce '+side.toUpperCase()+' inconnue');continue;}
  if(pts.length===2){const arc=M.shortestArc(p.vertices,pts[0],pts[1]);messages.push('Bord '+side.toUpperCase()+' · '+p.role+' · '+arc.length.toFixed(1)+' mm');}
  else messages.push('Bord '+side.toUpperCase()+': '+pts.length+'/2 point(s)');
 }
 if(anchors.a.length===2&&anchors.b.length===2){const a=pieces.find(p=>p.id===$('pdfSeamA').value),b=pieces.find(p=>p.id===$('pdfSeamB').value);if(a&&b){const la=M.shortestArc(a.vertices,...anchors.a).length,lb=M.shortestArc(b.vertices,...anchors.b).length;messages.push('Écart initial '+(100*Math.abs(la-lb)/Math.max(1,la)).toFixed(1)+' %');}}
 status.textContent=messages.join(' · ')+' — Appariement à valider à partir des indications du patron.';
}
function analyzeEdges(){if(!pieces.length){notice('Détecte d’abord les pièces du PDF.',true);return;}
 semanticEdges={};for(const p of pieces)semanticEdges[p.id]=I.inferEdges(p);
 assemblyProposals=[];renderSemanticResults();renderAutoAssembly();notice('Bords proposés pour '+pieces.length+' pièce(s) : hypothèses fondées sur la géométrie et les rôles sélectionnés, sans réseau neuronal entraîné.');
}
function renderSemanticResults(){const el=$('pdfSemanticList');if(!el)return;el.replaceChildren();let count=0;
 for(const p of pieces){const es=semanticEdges[p.id]||[];for(const edge of es){const button=document.createElement('button');button.type='button';button.className='semantic-edge';button.textContent=p.role+' · '+edge.name+' · '+edge.lengthMm.toFixed(1)+' mm · confiance '+edge.confidence;
 button.addEventListener('click',()=>{semanticFocus={piece:p.id,...edge};currentView='seams';renderAssembly();notice('Bord surligné : '+p.role+' / '+edge.name+'. Vérifie physiquement si ce tracé est la ligne de coupe ou de couture.');});el.append(button);count++;}}
 if(!count)el.textContent='Aucun bord analysé pour le moment.';
}
function suggestAssembly(){if(!Object.keys(semanticEdges).length)analyzeEdges();assemblyProposals=I.suggestAssembly(pieces,semanticEdges);renderAutoAssembly();notice(assemblyProposals.length+' proposition(s) d’assemblage. Les écarts mesurés portent sur les contours extraits, pas nécessairement les lignes de couture.');}
function renderAutoAssembly(){const target=$('pdfAutoAssembly');if(!target)return;target.replaceChildren();if(!assemblyProposals.length){target.textContent='Lance la détection pour afficher les associations suggérées.';return;}
 for(const p of assemblyProposals){const row=document.createElement('label');row.className='assembly-candidate '+(p.differencePct>12?'risky':'');const check=document.createElement('input');check.type='checkbox';check.dataset.proposal=p.id;check.checked=p.status==='à valider'&&!p.requiresSplit;check.disabled=Boolean(p.requiresSplit);
 const text=document.createElement('span');text.textContent=p.name+' · écart des contours '+p.differencePct.toFixed(1)+' % · '+p.status+(p.requiresSplit?' · division du col à réaliser':'');
 const prev=document.createElement('button');prev.type='button';prev.textContent='Voir';prev.addEventListener('click',event=>{event.preventDefault();if(!p.b)return;semanticFocus=p.a;anchors={a:[p.a.start,p.a.end],b:[p.b.start,p.b.end]};$('pdfSeamA').value=p.a.piece;$('pdfSeamB').value=p.b.piece;currentView='seams';renderAssembly();renderSeamHint();});
 row.append(check,text,prev);target.append(row);}
}
function confirmSuggestions(){if(!assemblyProposals.length)return notice('Aucune proposition disponible.',true);let linked=0,errors=[];
 for(const prop of assemblyProposals){const check=$('pdfAutoAssembly').querySelector('input[data-proposal="'+prop.id+'"]');if(!check?.checked||prop.requiresSplit||!prop.b)continue;
 const a=pieces.find(p=>p.id===prop.a.piece),b=pieces.find(p=>p.id===prop.b.piece),id='auto_'+(seams.length+1);if(!a||!b)continue;
 const snapshotA=[...a.edgeLabels],snapshotB=[...b.edgeLabels];try{
 const x=M.markEdge(a,prop.a.start,prop.a.end,id+'_A'),y=M.markEdge(b,prop.b.start,prop.b.end,id+'_B');
 seams.push({id,name:prop.name,a:[a.id,x.edge],b:[b.id,y.edge],confirmed:true,sleeve:prop.sleeve,ease:0,provenance:'heuristique + validation utilisateur',initialMismatch:prop.differencePct});linked++;
 }catch(e){a.edgeLabels=snapshotA;b.edgeLabels=snapshotB;errors.push(prop.name+' : '+e.message);}}
 publishPieces();renderSeamControls();renderAssembly();notice(linked+' raccord(s) confirmé(s). '+(errors.length?'À revoir : '+errors.join(' ; '):'Vérifier les bords sur les vraies lignes de couture.')+(assemblyProposals.some(x=>x.requiresSplit)?' La bande de col reste à répartir.':''),!!errors.length);
}
function suggestMate(){try{
 const a=pieces.find(p=>p.id===$('pdfSeamA').value);if(!a||anchors.a.length!==2)throw Error('Marque d’abord les deux extrémités du bord A.');
 const proposals=M.suggestPartner(a,...anchors.a,pieces);
 if(!proposals.length)throw Error('Pas de candidat convaincant par géométrie. Sélectionne le bord B à la main.');
 const best=proposals[0];$('pdfSeamB').value=best.pieceId;anchors.b=[best.start,best.end];currentView='seams';renderAssembly();renderSeamHint();
 notice('Suggestion non vérifiée : '+best.pieceId+', longueur '+best.lengthMm.toFixed(1)+' mm. Regarde la ligne turquoise puis confirme si elle correspond bien aux repères de couture.');
 }catch(e){notice(e.message,true);}
}
function linkSeam(){try{
 if(anchors.a.length!==2||anchors.b.length!==2)throw Error('Marque deux points sur chacune des deux pièces avant de lier.');
 const a=pieces.find(p=>p.id===$('pdfSeamA').value),b=pieces.find(p=>p.id===$('pdfSeamB').value);
 if(!a||!b||a===b)throw Error('Choisis deux pièces différentes.');
 const number=1+Math.max(0,...seams.map(x=>Number(x.id.split('_').at(-1))||0));const id='stitch_'+number;
 const aa=a.edgeLabels.slice(),bb=b.edgeLabels.slice();try{
   const sa=M.markEdge(a,...anchors.a,id+'_A'),sb=M.markEdge(b,...anchors.b,id+'_B');
   seams.push({id,a:[a.id,sa.edge],b:[b.id,sb.edge],confirmed:true,ease:0});
   const diff=(100*Math.abs(sa.lengthMm-sb.lengthMm)/Math.max(1,sa.lengthMm)).toFixed(1);
   notice('Couture '+id+' liée ; écart initial '+diff+' %. Active « Propager les coutures liées » et relance la mutation.');
 }catch(e){a.edgeLabels=aa;b.edgeLabels=bb;throw e;}
 resetAnchors();publishPieces();renderSeamControls();renderAssembly();
 }catch(e){notice(e.message,true);}
}
function svgExport(){if(!documentPdf)return '';const b=viewBox(),x=b.x*P.PT2MM,y=b.y*P.PT2MM,w=b.w*P.PT2MM,h=b.h*P.PT2MM;
 const htm=['<?xml version="1.0" encoding="UTF-8"?>',`<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm" viewBox="${b.x} ${b.y} ${b.w} ${b.h}">`,
 `<title>${escape(lastImportFilename)} — planche vectorielle reconstruite; vérifier les pièces</title>`,
 '<g fill="none" stroke="#bbbbbb" stroke-width="0.7" id="feuilles">'];
 for(const page of documentPdf.pages)htm.push(`<rect x="${page.dx}" y="${page.dy}" width="${page.width}" height="${page.height}"/>`);
 htm.push('</g><g fill="none" stroke="#101010" stroke-width="0.75" id="traces-vectoriels">');
 for(const p of paths)htm.push(`<path d="${svgSegments(p)}"/>`);
 htm.push('</g></svg>');return htm.join('\n');
}
function expand(on){$('pdfModule').classList.toggle('expanded',Boolean(on));document.body.classList.toggle('pdf-overlay-open',Boolean(on));$('pdfExpand').textContent=on?'FERMER L’ATELIER ×':'AGRANDIR L’ATELIER ⛶';}
function addWidgets(){
 $('pdfExpand').addEventListener('click',()=>expand(!$('pdfModule').classList.contains('expanded')));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('pdfModule').classList.contains('expanded'))expand(false);});
 $('pdfZoom').addEventListener('input',()=>{const v=$('pdfZoom').value;$('pdfZoomValue').textContent=v+' %';const svg=$('pdfAssembly').querySelector('svg');if(svg)svg.style.width=v+'%';});
 $('importPdf').addEventListener('click',()=>$('pdfVectorInput').click());
 const dropzone=$('pdfDropzone');
 dropzone.addEventListener('click',()=>$('pdfVectorInput').click());
 dropzone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('pdfVectorInput').click();}});
 dropzone.addEventListener('dragover',e=>{e.preventDefault();dropzone.classList.add('dragging');});
 dropzone.addEventListener('dragleave',()=>dropzone.classList.remove('dragging'));
 dropzone.addEventListener('drop',e=>{e.preventDefault();dropzone.classList.remove('dragging');const f=e.dataTransfer?.files?.[0];if(!f)return;
 if(!/\.pdf$/i.test(f.name)){notice('Dépose un PDF vectoriel (fichier .pdf).',true);return;}
 const input=$('pdfVectorInput'),transfer=new DataTransfer();transfer.items.add(f);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));});

 $('autoReanalyze').addEventListener('click',()=>autoReconstruct());
 $('autoMode').addEventListener('change',()=>{if(documentPdf&&$('autoReanalyze').disabled===false)autoReconstruct();});
 $('autoInspect').addEventListener('click',()=>{expand(true);currentView='seams';renderAssembly();});
 $('pdfVectorInput').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  notice('Lecture locale du PDF, analyse des tracés et repères…');
  try{window.GBLStructuredSource=null;documentPdf=await P.parsePDF(await file.arrayBuffer());pieces=[];seams=[];semanticEdges={};assemblyProposals=[];semanticFocus=null;autoReport=null;resetAnchors();currentView='raw';lastImportFilename=file.name;
   $('pdfImportTools').hidden=false;$('pdfExpand').hidden=false;expand(!$('autoOnImport').checked);
   $('pdfSource').textContent=file.name;
   $('pdfColCount').value=Math.max(1,Math.ceil(documentPdf.pages.length/2));
   if(documentPdf.autoRegistered)mode='vector';else{mode='grid';P.arrangeGrid(documentPdf,+$('pdfColCount').value,'column');}
   pageAdjustments();refreshPaths();publishPieces();
   if($('autoOnImport').checked){autoReconstruct({afterImport:true});if(!documentPdf.autoRegistered)notice('ASSEMBLAGE À REVÉRIFIER : pas de repères communs, grille estimée. Corrige la calibration avant toute découpe.',true);}
   else notice(documentPdf.autoRegistered?'Assemblage vectoriel automatique effectué.':'Tracés trouvés, mais pas de repères communs. Configure la grille et ajuste les pages.');
  }catch(err){documentPdf=null;$('pdfImportTools').hidden=true;notice('Import impossible : '+err.message,true);console.error(err);}
  finally{e.target.value='';}
 });
 $('pdfApplyGrid').addEventListener('click',()=>{if(!documentPdf)return;P.arrangeGrid(documentPdf,+$('pdfColCount').value,$('pdfPageOrder').value,+$('pdfOverlapX').value,+$('pdfOverlapY').value);pageAdjustments();refreshPaths(true);notice('Grille appliquée. Ajuste les décalages page par page et vérifie les jonctions : ce placement est une estimation.');});
 $('pdfAutoRegister').addEventListener('click',()=>{if(!documentPdf)return;if(documentPdf.pages.every(p=>p.reg)){const r=documentPdf.pages[0].reg;for(const p of documentPdf.pages){p.dx=r.x-p.reg.x;p.dy=r.y-p.reg.y;}documentPdf.autoRegistered=true;pageAdjustments();refreshPaths(true);notice('Alignement des repères vectoriels rétabli.');}
 else notice('Ce PDF ne fournit pas de cadre de référence global détectable. Utilise la grille manuelle.',true);
 });
 $('minTraceLength').addEventListener('change',()=>{if(documentPdf)refreshPaths(false);});
 $('pdfClearSelection').addEventListener('click',()=>{selected.clear();renderAssembly();renderTraceList();});
 $('pdfAddPiece').addEventListener('click',()=>{if(!selected.size)return autoDetectPieces();createPiece();});
 $('pdfAutoPieces').addEventListener('click',autoDetectPieces);
 $('pdfSwitchView').addEventListener('click',()=>{currentView=currentView==='seams'?'raw':'seams';renderAssembly();$('pdfSwitchView').textContent=currentView==='seams'?'Retour aux tracés bruts':'Afficher les pièces / marquer les coutures';});
 $('pdfPickA').addEventListener('click',()=>{pickSide='a';anchors.a=[];currentView='seams';renderAssembly();renderSeamHint();notice('Marque deux points sur le bord de la pièce A (en rose).');});
 $('pdfPickB').addEventListener('click',()=>{pickSide='b';anchors.b=[];currentView='seams';renderAssembly();renderSeamHint();notice('Marque deux points sur le bord de la pièce B (en rose).');});
 for(const id of ['pdfSeamA','pdfSeamB'])$(id).addEventListener('change',()=>{anchors[id==='pdfSeamA'?'a':'b']=[];renderAssembly();renderSeamHint();});
 $('pdfSuggestSeam').addEventListener('click',suggestMate);
 $('pdfLinkSeam').addEventListener('click',linkSeam);
 $('pdfAnalyzeEdges').addEventListener('click',analyzeEdges);
 $('pdfSuggestAssembly').addEventListener('click',suggestAssembly);
 $('pdfConfirmSuggested').addEventListener('click',confirmSuggestions);

 $('pdfUsePieces').addEventListener('click',()=>{if(!pieces.length)return notice('Ajoute d’abord une ou plusieurs pièces sélectionnées.',true);$('base').value='pdf_import';$('base').dispatchEvent(new Event('change'));expand(false);document.getElementById('original').scrollIntoView({behavior:'smooth',block:'center'});notice('Générateur relié : '+seams.length+' couture(s) associée(s). Active « Propager les coutures liées » pour synchroniser les bords pendant les mutations.');});
 $('pdfDownloadStitched').addEventListener('click',()=>{if(documentPdf)download('GBL_assembled_'+lastImportFilename.replace(/\.pdf$/i,'')+'.svg',svgExport());});
 $('pdfDownloadCalibration').addEventListener('click',()=>{if(documentPdf)download('GBL_calibration.json',JSON.stringify({filename:lastImportFilename,pages:documentPdf.pages.map((p,i)=>({page:i+1,widthMM:p.width*P.PT2MM,heightMM:p.height*P.PT2MM,offsetXMM:p.dx*P.PT2MM,offsetYMM:p.dy*P.PT2MM})),autoRegistered:documentPdf.autoRegistered},null,2),'application/json');});
 $('pdfLoadCalibration').addEventListener('click',()=>$('pdfCalibrationInput').click());
 $('pdfCalibrationInput').addEventListener('change',async e=>{try{const f=e.target.files?.[0];if(!f||!documentPdf)return;const o=JSON.parse(await f.text());if(!Array.isArray(o.pages)||o.pages.length!==documentPdf.pages.length)throw Error('Nombre de pages différent');for(let i=0;i<o.pages.length;i++){documentPdf.pages[i].dx=Number(o.pages[i].offsetXMM)*P.MM2PT;documentPdf.pages[i].dy=Number(o.pages[i].offsetYMM)*P.MM2PT;}documentPdf.autoRegistered=Boolean(o.autoRegistered);pageAdjustments();refreshPaths(true);notice('Calibration restaurée.');}catch(e){notice('Calibration invalide : '+e.message,true);}finally{e.target.value='';}});
}
window.GBLRestoreImportedDraft=function(raw){
 if(!raw||!Array.isArray(raw.pieces)||!raw.pieces.length)return;
 documentPdf=null;paths=[];pieces=raw.pieces.map(p=>({...p,vertices:p.vertices.map(v=>({...v})),edgeLabels:[...p.edgeLabels],layout:{...p.layout}}));
 seams=(raw.seams||[]).map(q=>({...q,a:[...q.a],b:[...q.b]}));semanticEdges={};assemblyProposals=[];autoReport=raw.analysis||null;lastImportFilename=raw.source||'Session JSON';
 resetAnchors();currentView='seams';$('pdfImportTools').hidden=false;$('pdfExpand').hidden=false;
 $('pdfSource').textContent=lastImportFilename;$('pdfFound').textContent=pieces.length+' pièces restaurées depuis JSON.';
 $('pdfRegInfo').textContent='Ce projet contient les contours et les coutures liés, mais pas le PDF d’origine. Réimporte son PDF si tu veux modifier le recalage A4.';
 publishPieces();renderPieces();renderAssembly();analyzeEdges();suggestAssembly();if(autoReport?.metadata)renderAutoReport(autoReport,autoReport.failed||[]);notice('Patron et liaisons de couture restaurés depuis JSON.');
};
addWidgets();
})();
