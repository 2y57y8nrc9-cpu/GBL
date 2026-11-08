/* Garment Bending Lab v1.0 · prototype triangle-panel solver.
   Explicit polygon meshes + cross-panel seam springs + gravity + approximate avatar collision.
   Not the official GarmentCode/NVIDIA Warp solver; not calibrated for production fitting.
*/
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLPanelPhysics=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),EPS=1e-8;
const FABRICS={woven:{stiffness:.67,damping:.97,bend:.20,mass:1},jersey:{stiffness:.47,damping:.962,bend:.08,mass:1.1},rigid:{stiffness:.89,damping:.984,bend:.65,mass:.82}};
const a2=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function signedArea(p){return p.reduce((s,v,i)=>s+v.x*p[(i+1)%p.length].y-p[(i+1)%p.length].x*v.y,0)/2;}
function pointInTri(p,a,b,c){const d=a2(a,b,c),r=a2(p,b,c)/d,s=a2(a,p,c)/d,t=a2(a,b,p)/d;return r>-1e-6&&s>-1e-6&&t>-1e-6;}
function triangulate(p){const n=p.length;if(n<3)throw Error('Contour : au moins trois sommets requis');let ids=Array.from({length:n},(_,i)=>i);if(signedArea(p)<0)ids.reverse();const tris=[],limit=n*n*3;let guard=0;
 while(ids.length>3&&guard++<limit){let chosen=-1,best=-Infinity;
  for(let k=0;k<ids.length;k++){const ia=ids[(k+ids.length-1)%ids.length],ib=ids[k],ic=ids[(k+1)%ids.length],a=p[ia],b=p[ib],c=p[ic],twice=a2(a,b,c);if(twice<=EPS)continue;
   let blocked=false;for(const j of ids){if(j===ia||j===ib||j===ic)continue;if(pointInTri(p[j],a,b,c)){blocked=true;break;}}
   if(!blocked&&twice>best){chosen=k;best=twice;}
  }
  if(chosen<0)break;const ia=ids[(chosen+ids.length-1)%ids.length],ib=ids[chosen],ic=ids[(chosen+1)%ids.length];tris.push([ia,ib,ic]);ids.splice(chosen,1);
 }
 if(ids.length===3)tris.push([ids[0],ids[1],ids[2]]);
 if(tris.length!==n-2)throw Error('Triangulation impossible : contour auto-intersecté ou sommets dupliqués ('+tris.length+'/'+(n-2)+')');
 return tris;
}
function fallback3d(p,pts){const roles=p.role||'',name=(p.id||'').toLowerCase(),bb={minX:Math.min(...pts.map(v=>v.x)),maxX:Math.max(...pts.map(v=>v.x)),minY:Math.min(...pts.map(v=>v.y)),maxY:Math.max(...pts.map(v=>v.y))};
 const x0=(bb.minX+bb.maxX)/2,y0=(bb.minY+bb.maxY)/2;
 return (q)=>{let x=(q.x-x0)*.68,y=(q.y-y0)*.68-48,z=42;
  if(roles==='dos'||name.includes('back'))z=-43;
  else if(roles==='manche'||name.includes('sleeve')){const sign=/right|r_/.test(name)?1:-1;x=sign*(90+(q.x-x0)*.62);y=(q.y-y0)*.62-97;z=20;}
  else if(roles==='col'||name.includes('collar')){y-=105;z=20;}
  else if(roles==='pantalon'||/pant|skirt/.test(name)){y+=170;z=39;}
  return {x,y,z};};
}
function placement3d(p,pts,avatar=100){const meta=p.gcPlacement;
 if(!meta)return fallback3d(p,pts);
 const t=meta.translation||[0,0,0],ang=(meta.rotation||[0,0,0]).map(v=>v*Math.PI/180),
  [sx,cx]=[Math.sin(ang[0]||0),Math.cos(ang[0]||0)],
  [sy,cy]=[Math.sin(ang[1]||0),Math.cos(ang[1]||0)],
  [sz,cz]=[Math.sin(ang[2]||0),Math.cos(ang[2]||0)];
 const b={x:(Math.min(...pts.map(v=>v.x))+Math.max(...pts.map(v=>v.x)))/2,y:(Math.min(...pts.map(v=>v.y))+Math.max(...pts.map(v=>v.y)))/2};
 return (q)=>{
  // Coordinates in the JSON are centimeters converted to millimeters. Normalize around body's position.
  let x=q.x-b.x,y=-(q.y-b.y),z=0;
  let Y=y*cx-z*sx,Z=y*sx+z*cx;y=Y;z=Z;
  let X=x*cy+z*sy;Z=-x*sy+z*cy;x=X;z=Z;
  X=x*cz-y*sz;Y=x*sz+y*cz;
  return {x:(X+t[0])*.39,y:(-Y-t[1])*.39-50,z:(z+t[2])*.39};
 };
}
function buildMesh(piece,{avatar=100}={}){
 const poly=(piece.pts||piece.vertices).map((v,i)=>({x:Number(v.x),y:Number(v.y),edge:String(v.edge||piece.edgeLabels?.[i]||'contour')}));
 if(poly.length>1000)throw Error('Trop de sommets pour le solveur navigateur, réduire la résolution de '+piece.id);
 // Avoid duplicate closing vertex from exported SVG loops.
 if(poly.length>3&&Math.hypot(poly[0].x-poly.at(-1).x,poly[0].y-poly.at(-1).y)<1e-6)poly.pop();
 const triangles=triangulate(poly),convert=placement3d(piece,poly,avatar),nodes=poly.map(p=>{const pos=convert(p);return {...pos,px:pos.x,py:pos.y,pz:pos.z,ox:pos.x,oy:pos.y,oz:pos.z,invMass:1};}),faces=[],links=[],seen=new Set();
 const key=(a,b)=>Math.min(a,b)+':'+Math.max(a,b);
 function connect(a,b,strength){if(a===b||seen.has(key(a,b)))return;seen.add(key(a,b));links.push({a,b,rest:distance(nodes[a],nodes[b]),strength});}
 for(const [a,b,c] of triangles){
  const a0=nodes[a],b0=nodes[b],c0=nodes[c],m={x:(a0.x+b0.x+c0.x)/3,y:(a0.y+b0.y+c0.y)/3,z:(a0.z+b0.z+c0.z)/3};
  const mid=nodes.length;nodes.push({...m,px:m.x,py:m.y,pz:m.z,ox:m.x,oy:m.y,oz:m.z,invMass:1});
  faces.push([a,b,mid],[b,c,mid],[c,a,mid]);connect(a,b,.83);connect(b,c,.83);connect(c,a,.83);connect(a,mid,.48);connect(b,mid,.48);connect(c,mid,.48);
 }
 const idsByLabel={};poly.forEach((p,i)=>{(idsByLabel[p.edge]||=[]).push(i);});
 // Tether only a couple of upper anchor points so gravity does not teleport garments to floor.
 const ys=nodes.slice(0,poly.length).map(p=>p.y),minY=Math.min(...ys),candidate=nodes.slice(0,poly.length).map((p,i)=>({i,y:p.y})).filter(q=>q.y<minY+5);
 candidate.sort((a,b)=>a.i-b.i);for(const c of [candidate[0],candidate.at(-1)])if(c)nodes[c.i].invMass=.025;
 return {id:piece.id,role:piece.role||'panel',nodes,faces,springs:links,idsByLabel,poly,triangles:triangles.length};
}
function stitchConnections(meshes,stitches){const byId=Object.fromEntries(meshes.map(m=>[m.id,m])),pairs=[],issues=[];
 for(const s of stitches){const a=byId[s.a[0]],b=byId[s.b[0]];if(!a||!b){issues.push(s.id+': panneau absent');continue;}
  let aa=a.idsByLabel[s.a[1]],bb=b.idsByLabel[s.b[1]];if(!aa?.length||!bb?.length){issues.push(s.id+': bord absent');continue;}
  const point=(m,id)=>m.nodes[id],ends=[distance(point(a,aa[0]),point(b,bb[0]))+distance(point(a,aa.at(-1)),point(b,bb.at(-1))),distance(point(a,aa[0]),point(b,bb.at(-1)))+distance(point(a,aa.at(-1)),point(b,bb[0]))];
  if(ends[1]<ends[0])bb=[...bb].reverse();
  if(aa.length!==bb.length){issues.push(s.id+': échantillonnage inégal '+aa.length+'/'+bb.length+' ; interpolation de contraintes');}
  const N=Math.max(aa.length,bb.length),sample=(list,j)=>list[Math.round(j*(list.length-1)/Math.max(1,N-1))];
  for(let i=0;i<N;i++)pairs.push({a,b,ia:sample(aa,i),ib:sample(bb,i),id:s.id});
 }
 return {pairs,issues};
}
function collision(p,scale){const sc=(scale||100)/100;
 if(p.y>-170*sc&&p.y<90*sc){const t=clamp((p.y+150*sc)/(250*sc),0,1),rx=(49+8*Math.sin(Math.PI*t))*sc,rz=(31+6*Math.sin(Math.PI*t))*sc,q=Math.hypot(p.x/rx,p.z/rz);if(q<1.02){const k=1.02/Math.max(.04,q);p.x*=k;p.z*=k;}}
 // rudimentary separate limb cylinders (not biomechanical contact).
 else if(p.y>=90*sc&&p.y<330*sc){for(const sign of [-1,1]){const cx=sign*40*sc,r=20*sc,d=Math.hypot(p.x-cx,p.z);if(d<r){p.x=cx+(p.x-cx)*r/Math.max(d,.001);p.z=p.z*r/Math.max(d,.001);}}}
}
function solve(pieces,stitches,options={}){
 const meshes=pieces.map(p=>buildMesh(p,options)),S=stitchConnections(meshes,stitches),mat=FABRICS[options.fabric]||FABRICS.woven;
 const gravity=clamp(Number(options.gravity??100)/100,0,2)*.15*mat.mass,iterations=clamp(options.steps??75,1,160),substeps=4;
 const startMismatch=S.pairs.reduce((a,s)=>a+distance(s.a.nodes[s.ia],s.b.nodes[s.ib]),0)/(S.pairs.length||1);
 for(let frame=0;frame<iterations;frame++){
  for(const m of meshes)for(const p of m.nodes){const vx=(p.x-p.px)*mat.damping,vy=(p.y-p.py)*mat.damping,vz=(p.z-p.pz)*mat.damping;p.px=p.x;p.py=p.y;p.pz=p.z;p.x+=vx;p.y+=vy+gravity*p.invMass;p.z+=vz;}
  for(let k=0;k<substeps;k++){
   for(const m of meshes)for(const sp of m.springs){const a=m.nodes[sp.a],b=m.nodes[sp.b],dd=distance(a,b)||1,delta=(dd-sp.rest)/dd*sp.strength*mat.stiffness,wa=a.invMass,wb=b.invMass,sum=wa+wb;if(!sum)continue;
    const dx=(b.x-a.x)*delta,dy=(b.y-a.y)*delta,dz=(b.z-a.z)*delta;
    a.x+=dx*wa/sum;a.y+=dy*wa/sum;a.z+=dz*wa/sum;b.x-=dx*wb/sum;b.y-=dy*wb/sum;b.z-=dz*wb/sum;}
   for(const s of S.pairs){const a=s.a.nodes[s.ia],b=s.b.nodes[s.ib],wa=a.invMass,wb=b.invMass,denom=wa+wb||1;
    const dx=(b.x-a.x)*.58,dy=(b.y-a.y)*.58,dz=(b.z-a.z)*.58;
    a.x+=dx*wa/denom;a.y+=dy*wa/denom;a.z+=dz*wa/denom;b.x-=dx*wb/denom;b.y-=dy*wb/denom;b.z-=dz*wb/denom;
   }
   if(options.collision!==false)for(const m of meshes)for(const p of m.nodes)if(p.invMass>.03)collision(p,options.avatar);
  }
 }
 const endMismatch=S.pairs.reduce((a,s)=>a+distance(s.a.nodes[s.ia],s.b.nodes[s.ib]),0)/(S.pairs.length||1),displacement=meshes.reduce((sum,m)=>sum+m.nodes.reduce((s,p)=>s+Math.hypot(p.y-p.oy,p.x-p.ox,p.z-p.oz),0),0)/Math.max(1,meshes.reduce((sum,m)=>sum+m.nodes.length,0));
 const validity=[...meshes.flatMap(m=>m.nodes)].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z));
 if(!validity)throw Error('Instabilité numérique dans le solveur');
 // A converged seam is NOT sufficient to claim a realistic garment. Inspect edge strains.
 const ratios=meshes.flatMap(m=>m.springs.filter(sp=>sp.rest>1).map(sp=>distance(m.nodes[sp.a],m.nodes[sp.b])/sp.rest));
 const severe=ratios.filter(q=>q>1.35||q<.72).length;
 const meanStrain=ratios.reduce((t,q)=>t+Math.abs(q-1),0)/(ratios.length||1);
 const maxStretch=Math.max(1,...ratios),warnings=[...S.issues];
 if(startMismatch>80)warnings.push('Placement initial incompatible : le solveur rapproche des coutures éloignées, ce qui peut produire un rendu déchiré.');
 if(severe/(ratios.length||1)>.15)warnings.push('Forte déformation du maillage : '+(100*severe/(ratios.length||1)).toFixed(0)+' % des ressorts hors plage.');
 if(endMismatch>15)warnings.push('Coutures encore éloignées de plus de 15 unités 3D.');
 if(maxStretch>2)warnings.push('Allongement extrême de certains triangles (×'+maxStretch.toFixed(1)+').');
 const quality=warnings.length?'experimental-unreliable':'experimental-plausible';
 return {meshes,avatarScale:clamp(Number(options.avatar||100)/100,.78,1.25),stats:{panels:meshes.length,triangles:meshes.reduce((s,m)=>s+m.faces.length,0),seamNodes:S.pairs.length,unresolved:S.issues,initialSeamGap:startMismatch,finalSeamGap:endMismatch,meanDisplacement:displacement,meanRelativeStrain:meanStrain,maxStretch,severelyDeformedEdges:severe,totalSprings:ratios.length,quality,warnings,steps:iterations,solver:'position constraints / approximate avatar collisions'}};
}
function exportOBJ(scene){let out=['# Experimental Garment Bending Lab cloth mesh','o garment'];let count=0;for(const mesh of scene.meshes){out.push('g '+mesh.id.replace(/[^a-z0-9_-]/gi,'_'));for(const v of mesh.nodes)out.push('v '+(v.x/1000).toFixed(6)+' '+(-v.y/1000).toFixed(6)+' '+(v.z/1000).toFixed(6));for(const f of mesh.faces)out.push('f '+f.map(i=>count+i+1).join(' '));count+=mesh.nodes.length;}return out.join('\n')+'\n';}
return {FABRICS,triangulate,buildMesh,stitchConnections,solve,exportOBJ,signedArea};
});
