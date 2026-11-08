/* Garment Bending Lab V0.9 · cloth proxy + anatomical avatar renderer.
   Structural springs, gravity, damping and proxy body collision. This is NOT a
   physically calibrated textile simulation, does not sew individual PDF panels in 3D,
   and cannot validate fit, material stress, or real construction. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLDrape=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));const mix=(a,b,t)=>a+(b-a)*t;
const FABRICS={
 woven:{label:'Tissé souple',stretch:.76,shear:.58,bend:.30,damping:.92,weight:1.0,wrinkle:1.0},
 jersey:{label:'Jersey extensible',stretch:.48,shear:.36,bend:.10,damping:.88,weight:1.18,wrinkle:1.35},
 rigid:{label:'Toile enduite / rigide',stretch:.93,shear:.78,bend:.72,damping:.95,weight:.66,wrinkle:.25}
};
const box=pts=>{const x=pts.map(p=>p.x),y=pts.map(p=>p.y);return {x:Math.min(...x),y:Math.min(...y),w:Math.max(...x)-Math.min(...x),h:Math.max(...y)-Math.min(...y)};};
function sampleWidth(poly,t){if(!poly?.length)return 80;const b=box(poly),rot=b.w>b.h*1.20,axis=rot?'x':'y',cross=rot?'y':'x',v=b[axis]+clamp(t,.005,.995)*b[rot?'w':'h'],xs=[];
 for(let i=0;i<poly.length;i++){const a=poly[i],z=poly[(i+1)%poly.length];if((a[axis]<=v&&z[axis]>v)||(z[axis]<=v&&a[axis]>v)){const q=(v-a[axis])/(z[axis]-a[axis]);xs.push(mix(a[cross],z[cross],q));}}
 return xs.length>1?Math.max(...xs)-Math.min(...xs):b[rot?'h':'w']*.45;
}
const choose=(pieces,pattern)=>pieces.find(p=>pattern.test((p.role||'')+' '+(p.id||'')+' '+(p.label||'')));
function makeMesh(id,role,rows,cols,point,collision){const nodes=[],faces=[],springs=[];
 for(let i=0;i<=rows;i++)for(let j=0;j<cols;j++){
  const p=point(i/rows,j/cols,i,j),pin=i===0;
  nodes.push({...p,px:p.x,py:p.y,pz:p.z,ox:p.x,oy:p.y,oz:p.z,pin,invMass:pin?0:1});
 }
 const idx=(i,j)=>i*cols+(j+cols)%cols;
 function connect(i,j,k,l,group){const a=idx(i,j),b=idx(k,l);const p=nodes[a],q=nodes[b];springs.push({a,b,rest:Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z),group});}
 for(let i=0;i<=rows;i++)for(let j=0;j<cols;j++){
  if(i<rows)connect(i,j,i+1,j,'stretch');
  connect(i,j,i,j+1,'stretch');
  if(i<rows){connect(i,j,i+1,j+1,'shear');connect(i,j,i+1,j-1,'shear');}
  if(i<rows-1)connect(i,j,i+2,j,'bend');
  if(i<rows){const k=(j+1)%cols;faces.push([idx(i,j),idx(i,k),idx(i+1,k),idx(i+1,j)]);}
 }
 return {id,role,nodes,faces,springs,collision,rows,cols};
}
function avatarTorso(y,size=1){const t=clamp((y+155)/235,0,1);return {rx:size*(51+9*Math.sin(Math.PI*t)+4*(1-t)),rz:size*(32+5*Math.sin(Math.PI*t)),cy:0};}
function bodyCollision(p,region,size=1){
 if(region==='torso'){
  if(p.y< -170||p.y>90)return;
  const b=avatarTorso(p.y,size),r=Math.sqrt((p.x/b.rx)**2+(p.z/b.rz)**2);
  if(r<1.035){const factor=1.035/Math.max(.01,r);p.x*=factor;p.z*=factor;}
 } else if(region==='legLeft'||region==='legRight'){
  const sign=region==='legLeft'?-1:1,cx=sign*41*size,rad=(30-9*clamp((p.y-67)/240,0,1))*size;
  if(p.y<50||p.y>325)return;const dx=p.x-cx,z=p.z,r=Math.hypot(dx,z);if(r<rad+2){p.x=cx+dx*(rad+2)/Math.max(.01,r);p.z=z*(rad+2)/Math.max(.01,r);}
 }else if(region==='armLeft'||region==='armRight'){
  const sign=region==='armLeft'?-1:1,t=clamp((Math.abs(p.x)-68*size)/(125*size),0,1),cy=-126+91*t,rad=(22-7*t)*size;
  const dy=p.y-cy,dz=p.z,r=Math.hypot(dy,dz);if(Math.abs(p.x)<65*size||Math.abs(p.x)>210*size)return;
  if(r<rad+2){p.y=cy+dy*(rad+2)/Math.max(.01,r);p.z=dz*(rad+2)/Math.max(.01,r);}
 }
}
function createGarment(pieces,options={}){
 const size=clamp(Number(options.avatar||100)/100,.78,1.25),vol=clamp(Number(options.volume||100)/100,.65,1.6),mat=FABRICS[options.fabric]||FABRICS.woven;
 const front=choose(pieces,/devant|front/i),back=choose(pieces,/dos|back/i),sleeve=choose(pieces,/manche|sleeve/i),trouser=choose(pieces,/pants|trouser|pantalon|pelvic|inseam/i);
 const meshes=[],meshRows=20,meshCols=24;
 if(front||back){const f=(front||back).pts,b=(back||front).pts;
  const fw=sampleWidth(f,.55),bw=sampleWidth(b,.55),norm=Math.max(35,(fw+bw)/2);
  meshes.push(makeMesh('body','torso',meshRows,meshCols,(t,u,i,j)=>{
   const ang=2*Math.PI*u,body=avatarTorso(-142+218*t,size),w=(sampleWidth(f,t)+sampleWidth(b,t))*.5/norm;
   const ease=(8+Math.max(0,vol-1)*37+Math.max(0,(w-1))*24)*size;
   const fold=mat.wrinkle*2.0*Math.sin(i*.88+j*1.8)*Math.pow(t,1.45)*Math.max(0,vol-.75);
   return {x:(body.rx+ease+fold)*Math.cos(ang),y:-142+218*t,z:(body.rz+ease*.66+fold*.6)*Math.sin(ang)};
  },'torso'));
  if(sleeve){for(const sign of [-1,1]){
   const poly=sleeve.pts,normSleeve=Math.max(20,sampleWidth(poly,.45));
   meshes.push(makeMesh(sign<0?'leftSleeve':'rightSleeve',sign<0?'armLeft':'armRight',16,18,(t,u,i,j)=>{
    const theta=u*Math.PI*2,w=sampleWidth(poly,t)/normSleeve,rad=clamp((25-8*t)*w*vol*size,15,46);
    const fold=mat.wrinkle*Math.sin(i*.85+j*1.9)*1.5*t;
    return {x:sign*(74+118*t)*size,y:(-125+90*t)*size+(rad+fold)*Math.cos(theta),z:(rad+fold)*Math.sin(theta)};
   },sign<0?'armLeft':'armRight'));
  } } }
 else if(trouser){const p=trouser.pts,midW=Math.max(35,sampleWidth(p,.4));
  for(const sign of [-1,1])meshes.push(makeMesh(sign<0?'leftLeg':'rightLeg',sign<0?'legLeft':'legRight',22,20,(t,u,i,j)=>{
   const ang=u*Math.PI*2,w=sampleWidth(p,t)/midW,rad=clamp((36-11*t)*w*vol*size,18,58);
   const fold=mat.wrinkle*2.3*Math.sin(t*20+ang*4)*Math.pow(t,.8);
   return {x:sign*41*size+(rad+fold)*Math.cos(ang),y:62+256*t,z:(rad+fold)*Math.sin(ang)};
  },sign<0?'legLeft':'legRight'));
 }
 return {meshes,semantic:Boolean(front||back||trouser),avatarScale:size,material:mat};
}
function relax(mesh,{gravity=100,steps=46,fabric='woven',avatar=100}={}){
 const mat=FABRICS[fabric]||FABRICS.woven,g=clamp(Number(gravity)/100,0,2)*.14*mat.weight,size=Number(avatar)/100;
 for(let frame=0;frame<steps;frame++){
  for(const p of mesh.nodes){if(p.pin)continue;const vx=(p.x-p.px)*mat.damping,vy=(p.y-p.py)*mat.damping,vz=(p.z-p.pz)*mat.damping;
   p.px=p.x;p.py=p.y;p.pz=p.z;p.x+=vx;p.y+=vy+g;p.z+=vz;
  }
  for(let k=0;k<4;k++){
   for(const s of mesh.springs){const a=mesh.nodes[s.a],b=mesh.nodes[s.b],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,dist=Math.hypot(dx,dy,dz)||1;
    const stiffness=mat[s.group],delta=(dist-s.rest)/dist*stiffness,wa=a.invMass,wb=b.invMass,denom=wa+wb;if(!denom)continue;
    const fa=wa/denom*delta,fb=wb/denom*delta;
    if(wa){a.x+=dx*fa;a.y+=dy*fa;a.z+=dz*fa;}if(wb){b.x-=dx*fb;b.y-=dy*fb;b.z-=dz*fb;}
   }
   for(const p of mesh.nodes)if(!p.pin)bodyCollision(p,mesh.collision,size);
  }
 }
 return mesh;
}
function scene(pieces,options={}){
 const sc=createGarment(pieces,options);
 for(const mesh of sc.meshes)relax(mesh,options);
 return sc;
}
function extent(scene){const a=scene.meshes.flatMap(m=>m.nodes);if(!a.length)return null;return {minY:Math.min(...a.map(p=>p.y)),maxY:Math.max(...a.map(p=>p.y)),meanDisplacement:a.reduce((n,p)=>n+Math.hypot(p.x-p.ox,p.y-p.oy,p.z-p.oz),0)/a.length};}
return {FABRICS,sampleWidth,createGarment,relax,scene,extent};
});

(function(){'use strict';if(typeof document==='undefined')return;
const canvas=document.getElementById('garment3dCanvas');if(!canvas)return;
const ctx=canvas.getContext('2d'),get=id=>document.getElementById(id),ang=get('garment3dAngle'),vol=get('garment3dVolume'),gravity=get('garment3dGravity'),avatar=get('garment3dAvatar');
const clamp=(a,lo,hi)=>Math.min(hi,Math.max(lo,a)),api=window.GBLDrape;
let current=null,scenes=null,dragging=false,lastX=0;
function camera(v,yaw,ox){const [x,y,z]=v,c=Math.cos(yaw),s=Math.sin(yaw),xx=x*c+z*s,zz=z*c-x*s,scale=.84*620/(620+zz);
 return {x:ox+xx*scale,y:247+y*scale*.93,depth:zz};}
function normal(a,b,c){const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],x=u[1]*v[2]-u[2]*v[1],y=u[2]*v[0]-u[0]*v[2],z=u[0]*v[1]-u[1]*v[0],mag=Math.hypot(x,y,z)||1;return [x/mag,y/mag,z/mag];}
// Procedural generic adult human, not a scanned avatar or registered anthropometric mesh.
// Softly faceted surface with distinct torso, pelvis, articulated limbs, hands and feet.
function avatarPatches(size,morph='average'){
 const faces=[], shape=morph==='slim'?.86:morph==='broad'?1.18:1;
 const S=size, r=(x,y,z)=>[x*S,y*S,z*S],shade=(name,detail=0)=>name;
 function ringSurface(rings,segments,color){
  for(let i=0;i<rings.length-1;i++)for(let k=0;k<segments;k++){
   const a=rings[i][k],b=rings[i][(k+1)%segments],c=rings[i+1][(k+1)%segments],d=rings[i+1][k];
   faces.push({verts:[a,b,c,d],color});
  }
 }
 function body(name,table,N=22){const rings=[];
  for(const row of table){const [y,rx,rz,cx=0,cz=0]=row,pts=[];
   for(let i=0;i<N;i++){const a=2*Math.PI*i/N;pts.push(r(cx+Math.cos(a)*rx*shape,y,cz+Math.sin(a)*rz*shape));}rings.push(pts);}
  ringSurface(rings,N,name);
 }
 function ellipsoid(x,y,z,rx,ry,rz,color,uSteps=17,vSteps=12){const rings=[];
  for(let i=0;i<=vSteps;i++){const ph=-Math.PI/2+(i/vSteps)*Math.PI,ring=[];
   for(let j=0;j<uSteps;j++){const theta=2*Math.PI*j/uSteps;
    ring.push(r(x+rx*Math.cos(ph)*Math.cos(theta),y+ry*Math.sin(ph),z+rz*Math.cos(ph)*Math.sin(theta)));}rings.push(ring);}
  ringSurface(rings,uSteps,color);
 }
 function capsule(name,p0,p1,r0,r1,{segments=17,rings=9,bulge=.06}={}){
  const v=[p1[0]-p0[0],p1[1]-p0[1],p1[2]-p0[2]],vn=Math.hypot(...v),w=v.map(a=>a/vn);
  let axis=Math.abs(w[2])<.82?[0,0,1]:[0,1,0];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  let U=cross(w,axis),ul=Math.hypot(...U)||1;U=U.map(a=>a/ul);let V=cross(w,U);
  const circum=[];for(let i=0;i<=rings;i++){const t=i/rings,ease=1+bulge*Math.sin(Math.PI*t),R=(r0+(r1-r0)*t)*ease,ring=[];
   for(let j=0;j<segments;j++){const a=2*Math.PI*j/segments;
    ring.push(r(p0[0]+v[0]*t+R*(Math.cos(a)*U[0]+Math.sin(a)*V[0]),
     p0[1]+v[1]*t+R*(Math.cos(a)*U[1]+Math.sin(a)*V[1]),
     p0[2]+v[2]*t+R*(Math.cos(a)*U[2]+Math.sin(a)*V[2])));}circum.push(ring);}
  ringSurface(circum,segments,name);
 }
 // Bodysuit, curved rib cage, tapered waist and realistic pelvis.
 body('suit',[[ -166,11,12],[-154,29,22],[-146,43,28],[-133,57,33],[-114,58,37],[-95,56,38],[-73,49,33],[-45,43,31],[-18,45,31],[12,49,35],[39,53,36],[61,51,34],[76,38,28]],26);
 ellipsoid(0,61,0,50*shape,33,35*shape,'suit',24,12);
 // Neck, face and a restrained hair form, generic adult, non-identifiable.
 capsule('skin',[0,-177,0],[0,-199,0],12,12,{rings:5});
 ellipsoid(0,-230,3,25,31,23,'skin',24,16);
 ellipsoid(-24,-228,2,4.4,8,4,'skin',12,8);ellipsoid(24,-228,2,4.4,8,4,'skin',12,8);
 ellipsoid(0,-227,25,5.0,8,6.6,'skin',12,9); // nose
 ellipsoid(-8.6,-233,23.4,3.0,1.6,1.1,'eye',10,5);ellipsoid(8.6,-233,23.4,3.0,1.6,1.1,'eye',10,5);
 ellipsoid(0,-214,24.7,7,1.3,1.0,'lip',12,5);
 ellipsoid(0,-255,1,25,14,22,'hair',22,7);
 // Both shoulders / arms, articulated elbow, hands and fingery outline.
 for(const side of [-1,1]){
  const S0=[side*60,-133,0],E0=[side*127,-78,6],W0=[side*181,-42,10];
  ellipsoid(...S0,22,21,22,'skin',15,10);
  capsule('skin',S0,E0,22,18,{rings:10,bulge:.12});ellipsoid(...E0,17,16,17,'skin',14,9);
  capsule('skin',E0,W0,17,12,{rings:10});
  ellipsoid(side*194,-28,10,11,19,8,'skin',15,9);
  // thighs, kneecaps, shins, ankles, feet.
  const H=[side*30,78,0],K=[side*42,198,14],A=[side*44,309,1];
  ellipsoid(...H,31*shape,30,32*shape,'suit',16,11);
  capsule('skin',H,K,28*shape,20*shape,{rings:13,bulge:.1});ellipsoid(...K,20,21,20,'skin',17,9);
  capsule('skin',K,A,20*shape,11.5*shape,{rings:13,bulge:.1});
  ellipsoid(side*44,317,13,15,10,30,'skin',19,10);
 }
 return faces;
}
function projectScene(scene,ox,yaw,mutated){const items=[],avatar=get('showHuman')?.checked===false?[]:avatarPatches(scene.avatarScale,get('humanBody')?.value||'average');
 for(const p of avatar)items.push({...p,avatar:true});
 for(const mesh of scene.meshes)for(const quad of mesh.faces){items.push({verts:quad.map(i=>{const p=mesh.nodes[i];return [p.x,p.y,p.z];}),color:mesh.role,avatar:false});}
 const polygons=items.map(p=>{const pp=p.verts.map(v=>camera(v,yaw,ox)),d=pp.reduce((n,v)=>n+v.depth,0)/pp.length;return {...p,projected:pp,depth:d};});
 polygons.sort((a,b)=>b.depth-a.depth);return polygons;
}
function drawOne(sc,ox,yaw,mutated,title){ctx.save();ctx.beginPath();ctx.rect(ox-215,0,430,500);ctx.clip();
 const bg=ctx.createLinearGradient(ox-220,0,ox+205,500);bg.addColorStop(0,'#343239');bg.addColorStop(.55,'#24242d');bg.addColorStop(1,'#11151c');ctx.fillStyle=bg;ctx.fillRect(ox-215,0,430,500);
 const grd=ctx.createLinearGradient(0,467,0,501);grd.addColorStop(0,'#22252b');grd.addColorStop(1,'#0d1116');ctx.fillStyle=grd;ctx.fillRect(ox-215,463,430,37);
 ctx.save();ctx.fillStyle='rgba(0,0,0,.24)';ctx.beginPath();ctx.ellipse(ox,470,95,11,0,0,Math.PI*2);ctx.fill();ctx.restore();
 const fabric=get('fabricPreset')?.value||'woven';
 for(const face of projectScene(sc,ox,yaw,mutated)){const pts=face.projected;if(pts.some(p=>!Number.isFinite(p.x)))continue;
  const n=normal(face.verts[0],face.verts[1],face.verts[Math.min(3,face.verts.length-1)]);const light=clamp(.63+.25*(-n[0]*.4-n[1]*.6+n[2]*.65),.32,.96),front=face.avatar;
  const skinTone={warm:[186,142,122],medium:[138,101,84],deep:[85,61,57],neutral:[165,157,153]}[get('humanSkin')?.value||'warm'];
  const colors={skin:skinTone,suit:[97,99,107],hair:[39,35,37],eye:[46,41,43],lip:[140,92,88]};
  const base=front?(colors[face.color]||[113,112,117]):mutated?[113,103,125]:[138,140,150];
  const k=front?clamp(.80+ .38*(-n[0]*.36-n[1]*.3+n[2]*.78),.45,1.22):clamp(.84+.34*(-n[0]*.45-n[1]*.55+n[2]*.65),.48,1.14);
  const p=base.map(q=>Math.min(255,Math.round(q*k)));
  ctx.fillStyle=`rgb(${p.join(',')})`;ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.closePath();ctx.fill();
  if(!front){ctx.strokeStyle=mutated?'rgba(175,142,190,.07)':'rgba(204,207,216,.07)';ctx.lineWidth=.25;ctx.stroke();}
 }
 ctx.fillStyle='#f4e8f7';ctx.font='600 11px monospace';ctx.fillText(title,ox-194,25);
 ctx.fillStyle='#a6a1ad';ctx.font='11px sans-serif';ctx.fillText(sc.meshes.length?'Tombé approché · anthropométrie indicative':'Aucun panneau reconnu',ox-192,489);ctx.restore();
}
function draw(){if(!canvas)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#0f1017';ctx.fillRect(0,0,canvas.width,canvas.height);
 ctx.strokeStyle='#44404c';ctx.beginPath();ctx.moveTo(canvas.width/2,15);ctx.lineTo(canvas.width/2,canvas.height-15);ctx.stroke();
 if(!current||!scenes){ctx.fillStyle='#acabb5';ctx.font='15px sans-serif';ctx.fillText('Importe ou génère un patron pour obtenir un aperçu indicatif.',26,47);return;}
 const yaw=Number(ang.value)*Math.PI/180;
 drawOne(scenes.original,230,yaw,false,'ORIGINAL / AVATAR');drawOne(scenes.mutated,690,yaw,true,'MUTATION / DRAPÉ ESTIMÉ');
 ctx.fillStyle='#a7a3ae';ctx.font='10px monospace';ctx.fillText(scenes?.stitched?'PANNEAUX TRIANGULÉS + LIAISONS DE COUTURE · COLLISIONS APPROCHÉES':'PROXY VISUEL · PAS DE COUTURE 3D DES PANNEAUX PDF',230,canvas.height-7);
}
function simulate(){if(!current)return;const options={volume:Number(vol.value),gravity:Number(gravity.value),avatar:Number(avatar.value),fabric:get('fabricPreset')?.value||'woven',steps:40};
 const hasStructured=Boolean(window.GBLStructuredSource && current.original.some(p=>p.gcPlacement) && window.GBLPanelPhysics);
 let extra='';
 if(hasStructured){
  try{
   const physics=window.GBLPanelPhysics;
   scenes={original:physics.solve(current.original,current.seams,{...options,steps:42}),mutated:physics.solve(current.pieces,current.seams,{...options,steps:42}),stitched:true};
   const a=scenes.original.stats,b=scenes.mutated.stats;
   extra=`${b.quality==='experimental-unreliable'?'⚠ DRAPÉ NON FIABLE':'DRAPÉ EXPÉRIMENTAL'} · ${b.panels} panneaux / ${b.triangles} triangles · ${b.seamNodes} liaisons · écart couture ${b.initialSeamGap.toFixed(1)} → ${b.finalSeamGap.toFixed(1)} unités · déformation moyenne ${(100*b.meanRelativeStrain).toFixed(0)} % · ${b.warnings.length} avertissement(s)${b.warnings.length?' : '+b.warnings.slice(0,2).join(' / '):''}.`;
  }catch(e){
   scenes={original:api.scene(current.original,options),mutated:api.scene(current.pieces,options),stitched:false};
   extra='Maillage cousu non résolu ('+e.message+'). Affichage du proxy. Vérifier les auto-intersections / coutures.';
  }
 }else scenes={original:api.scene(current.original,options),mutated:api.scene(current.pieces,options),stitched:false};
 const a=api.extent(scenes.original),b=api.extent(scenes.mutated);
 const status=get('drapeStatus');if(status){const input=options.fabric==='rigid'?'rigidité élevée':options.fabric==='jersey'?'maille souple':'tissé souple';status.textContent=extra|| (a&&b?
  `Calcul local : gravité ${options.gravity}% · ${input} · déplacement moyen ${a.meanDisplacement.toFixed(1)} mm → ${b.meanDisplacement.toFixed(1)} mm (proxy, non prédictif).`:
  'Le PDF n’a pas de pièces identifiées pour une mise en volume. La simulation ne peut pas deviner son placement sur le corps.');}
 draw();
}
window.addEventListener('gbl-render',e=>{current=e.detail.result;simulate();});
ang.addEventListener('input',draw);for(const input of [vol,gravity,avatar])input?.addEventListener('input',simulate);
for(const id of ['humanSkin','humanBody','showHuman'])get(id)?.addEventListener('change',draw);
get('fabricPreset')?.addEventListener('change',simulate);
get('recalculateDrape')?.addEventListener('click',simulate);
get('save3dPreview')?.addEventListener('click',()=>{const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download='GBL_V09_human_avatar_proxy.png';document.body.append(a);a.click();a.remove();});
canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointerup',()=>dragging=false);
canvas.addEventListener('pointermove',e=>{if(!dragging)return;ang.value=clamp(Number(ang.value)+(e.clientX-lastX)*.8,-180,180);lastX=e.clientX;draw();});
get('exportMeshOBJ')?.addEventListener('click',()=>{
 if(!scenes?.stitched){window.alert('Un maillage cousu est disponible après import JSON GarmentCodeData valide.');return;}
 const data=window.GBLPanelPhysics.exportOBJ(scenes.mutated),a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type:'text/plain'}));a.href=url;a.download='GarmentBendingLab-V1-mutation-draped.obj';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 });
 get('intensity')?.dispatchEvent(new Event('input',{bubbles:true}));
})();
