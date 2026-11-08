/* Garment Bending Lab V0.3 — deterministic, framework-free geometry engine.
   Units: abstract drafting millimeters; NOT ready-to-cut sewing patterns. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GBLEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const OP_NAMES = {
    drift: 'Contour drift',
    displacement: 'Anatomical displacement',
    seam: 'Seam derangement',
    growth: 'Synthetic growth',
    spatial: 'Spatial assimilation',
    ghost: 'Ghost replication',
    topology: 'Topology confusion',
    joint: 'Joint collapse',
    fusion: 'Panel fusion'
  };
  const DEFAULT_OPERATORS = {drift:true, displacement:true, seam:true, growth:false, spatial:false, ghost:false, topology:false, joint:false, fusion:false};
  function seeded(seed) {let a=seed>>>0; return ()=>{a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a); t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
  function hash(text){let h=2166136261;for(const c of text){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function between(v,a,b){return Math.min(b,Math.max(a,v));}
  function mix(a,b,t){return a*(1-t)+b*t;}
  function wave(v){return 0.5-0.5*Math.cos(v*2*Math.PI);}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function normalTo(a,b){const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1;return {x:dy/l,y:-dx/l};}
  function scalarForIntensity(intensity) {
    const t=between(Number(intensity)||0,0,100)/100;
    // Smooth progress: highly restrained under 30%, accelerated beyond 65%.
    return Math.pow(t,1.65);
  }
  function v(x,y){return {x,y};}
  function piece(id,label,verts,edgeLabels,x,y) {
    if(verts.length!==edgeLabels.length)throw new Error('Edge labels must match vertex count');
    return {id,label,vertices:verts.map(q=>v(q[0],q[1])),edgeLabels,layout:{x,y}};
  }
  function torso(id, label, yBottom, widerHem, x, y) {
    const h=yBottom, w=widerHem ? 110:78;
    return piece(id,label,[[-91,18],[-52,-8],[-36,-8],[-22,13],[22,13],[36,-8],[52,-8],[91,18],[112,45],[92,67],[83,55],[w,h],[-w,h],[-83,55],[-92,67],[-112,45]],
    ['shoulder_l','collar_l','neck_l','neck_c','neck_r','collar_r','shoulder_r','armhole_r1','armhole_r2','armhole_r3','side_r','hem','side_l','armhole_l1','armhole_l2','armhole_l3'],x,y);
  }
  function sleeve(id,label,x,y) {
    return piece(id,label,[[-78,32],[-48,6],[-18,-12],[18,-12],[48,6],[78,32],[65,62],[51,66],[45,242],[-45,242],[-51,66],[-65,62]],
    ['cap_1','cap_2','cap_3','cap_4','cap_5','cap_6','armhole_tip_r','underarm_r','cuff','underarm_l','armhole_tip_l','cap_7'],x,y);
  }
  function skirt(id,label,x,y) {
    return piece(id,label,[[-93,0],[93,0],[143,278],[-143,278]],['waist','side_r','hem','side_l'],x,y);
  }
  function trouser(id,label,x,y) {
    return piece(id,label,[[-105,0],[103,0],[112,89],[88,290],[43,290],[27,134],[1,134],[-9,290],[-56,290],[-78,94]],
      ['waist','hip_r','outseam_r','hem_r','inseam_r','crotch','inseam_l','hem_l','outseam_l','hip_l'],x,y);
  }
  function model(kind, config){
    if(['pelvic_bridge','misregistered_jacket','limb_transposition','collar_slip'].includes(kind)){
      const mod=(typeof globalThis!=='undefined'&&globalThis.GBLExperimental)?globalThis.GBLExperimental:(typeof require==='function'?require('./experimental.js'):null);
      if(!mod)throw new Error('Missing experimental.js module');
      return mod.generate(kind,config);
    }
    if(kind==='pdf_import'){
      const imp=(typeof globalThis!=='undefined'&&globalThis.GBLImportedDraft)?globalThis.GBLImportedDraft:null;
      if(!imp||!Array.isArray(imp.pieces)||!imp.pieces.length)throw new Error('Importe et sélectionne des pièces du PDF avant de lancer les mutations.');
      return {kind,pieces:imp.pieces.map(p=>({...p,vertices:p.vertices.map(q=>({...q})),edgeLabels:[...p.edgeLabels],layout:{...p.layout}})),seams:(imp.seams||[]).map(q=>({...q,a:[...q.a],b:[...q.b]})),meta:{archetype:'PDF vectoriel importé',source:imp.source||'Import local',unmappedSeams:!(imp.seams||[]).length}};
    }
    if(kind==='tshirt_custom'){
      const draft=(typeof globalThis!=='undefined'&&globalThis.GBLDraft)?globalThis.GBLDraft:(typeof require==='function'?require('./draft.js'):null);
      if(!draft)throw new Error('Missing draft.js module');
      return draft.generateTshirt(config?.measurements || {},config?.fit || 'regular');
    }
    let pieces,seams;
    if(kind==='top'||kind==='dress'){
      const isDress=kind==='dress';
      const height=isDress?360:240;
      pieces=[torso('front','FRONT',height,isDress,0,0),torso('back','BACK',height,isDress,310,0),sleeve('sleeve_l','SLEEVE L',600,0),sleeve('sleeve_r','SLEEVE R',800,0)];
      seams=[{id:'side_R',a:['front','side_r'],b:['back','side_r']},{id:'side_L',a:['front','side_l'],b:['back','side_l']},{id:'shoulder_R',a:['front','shoulder_r'],b:['back','shoulder_r']},{id:'shoulder_L',a:['front','shoulder_l'],b:['back','shoulder_l']},{id:'sleeve_L_underarm',a:['sleeve_l','underarm_r'],b:['sleeve_l','underarm_l']},{id:'sleeve_R_underarm',a:['sleeve_r','underarm_r'],b:['sleeve_r','underarm_l']}];
    } else if(kind==='skirt'){
      pieces=[skirt('front','SKIRT FRONT',0,0),skirt('back','SKIRT BACK',380,0)];
      seams=[{id:'side_R',a:['front','side_r'],b:['back','side_r']},{id:'side_L',a:['front','side_l'],b:['back','side_l']}];
    } else if(kind==='trouser') {
      pieces=[trouser('front','TROUSER FRONT',0,0),trouser('back','TROUSER BACK',350,0)];
      seams=[{id:'outseam_R',a:['front','outseam_r'],b:['back','outseam_r']},{id:'outseam_L',a:['front','outseam_l'],b:['back','outseam_l']},{id:'inseam_R',a:['front','inseam_r'],b:['back','inseam_r']},{id:'inseam_L',a:['front','inseam_l'],b:['back','inseam_l']}];
    } else throw new Error('Unknown base pattern: '+kind);
    return {kind,pieces,seams};
  }
  function subdivide(basePiece,steps=basePiece.isCurveSampled?2:9){
    const out=[],p=basePiece.vertices;
    for(let i=0;i<p.length;i++){
      const a=p[i],b=p[(i+1)%p.length];
      for(let j=0;j<steps;j++){
        const t=j/steps;
        out.push({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),edge:basePiece.edgeLabels[i],t,index:i});
      }
    }
    // The parametric draft already samples curves; t must span an entire semantic edge,
    // not restart at every micro-segment. This keeps seam-derangement operative.
    if(basePiece.isCurveSampled){
      let i=0;while(i<out.length){let j=i+1;while(j<out.length && out[j].edge===out[i].edge)j++;
        for(let k=i;k<j;k++)out[k].t=(k-i)/(j-i); i=j;
      }
    }
    return {...basePiece,pts:out};
  }
  function centroid(pts){return {x:pts.reduce((a,p)=>a+p.x,0)/pts.length,y:pts.reduce((a,p)=>a+p.y,0)/pts.length};}
  function bounds(pts){return {left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};}
  function seamLength(piece,edge){let sum=0;for(let i=0;i<piece.pts.length;i++)if(piece.pts[i].edge===edge)sum+=dist(piece.pts[i],piece.pts[(i+1)%piece.pts.length]);return sum;}
  function closeness(p,q,sigma){return Math.exp(-0.5*Math.pow(dist(p,q)/(sigma||1),2));}
  const endpoints=(p,edge)=>{
    const idx=p.pts.findIndex(q=>q.edge===edge);
    if(idx<0)return null;
    const current=p.pts.filter(q=>q.edge===edge);
    return [current[0],p.pts[(idx+current.length)%p.pts.length]];
  };
  function cloneInput(c){
    const base=['top','dress','skirt','trouser','tshirt_custom','pelvic_bridge','misregistered_jacket','limb_transposition','collar_slip','pdf_import'].includes(c.base)?c.base:'tshirt_custom';
    const operators={...DEFAULT_OPERATORS};
    for(const k of Object.keys(operators)) if(c.operators&&Object.prototype.hasOwnProperty.call(c.operators,k))operators[k]=Boolean(c.operators[k]);
    return {base,intensity:between(Number(c.intensity)||0,0,100),seed:Number(c.seed)>>>0,operators,measurements:c.measurements||{},fit:c.fit||'regular',linkedSeams:c.linkedSeams!==false};
  }
  function mutate(input){
    const config=cloneInput(input),draft=model(config.base,config),s=scalarForIntensity(config.intensity);
    const original=draft.pieces.map(p=>subdivide(p));
    const pieces=draft.pieces.map(p=>subdivide(p));
    const seams=draft.seams.map(x=>({...x,a:[...x.a],b:[...x.b]}));
    const ghosts=[];const events=[];
    function opRand(tag){return seeded(config.seed ^ hash(tag));}
    const byId=id=>pieces.find(p=>p.id===id);
    if(s>0&&config.operators.drift){
      // Smooth periodic waves along the entire perimeter (no per-point white noise).
      const rand=opRand('drift');
      const freq=2+Math.floor(rand()*3),phase=rand()*Math.PI*2;
      for(const p of pieces){
        const phi=phase+rand()*1.5;
        p.pts.forEach((q,i)=>{const t=i/p.pts.length*2*Math.PI;
          q.x+=s*22*(Math.sin(freq*t+phi)+0.36*Math.sin(7*t+phi*.8));
          q.y+=s*15*(Math.cos((freq+1)*t+phi)+0.2*Math.cos(9*t+phi));
        });
      }
      events.push('Contour drift');
    }
    if(s>0&&config.operators.displacement){
      // Anatomical anomaly: a single body zone shifts while its borders remain connected.
      const rand=opRand('displacement');
      for(const p of pieces){
        const region=rand()*.5+.26,sign=rand()>.5?1:-1;
        const lim=bounds(p.pts);const targetY=mix(lim.top,lim.bottom,region);
        const sigma=Math.max(25,(lim.bottom-lim.top)*.22);
        p.pts.forEach(q=>{const w=Math.exp(-0.5*Math.pow((q.y-targetY)/sigma,2));q.x+=sign*s*53*w;q.y+=s*12*w*Math.sin((q.x+25)/55);});
      }
      events.push('Anatomical displacement');
    }
    if(s>0&&config.operators.seam){
      // Mismatch a selected sewing edge WITHOUT shifting its anchored endpoints.
      const rand=opRand('seam');
      const target=seams[Math.floor(rand()*seams.length)];
      if(target){const p=byId(target.a[0]),edge=target.a[1];const ep=endpoints(p,edge);
        if(ep){const n=normalTo(ep[0],ep[1]),amp=s*(12+rand()*75);
          for(const q of p.pts)if(q.edge===edge){const w=Math.sin(Math.PI*q.t);q.x+=n.x*amp*w;q.y+=n.y*amp*w;}
          events.push('Seam derangement: '+target.id+' / '+p.id);
        }
      }
    }
    if(s>0&&config.operators.growth){
      // A localized protrusion: a garment panel acquires an anomalous extension.
      const rand=opRand('growth');const p=pieces[Math.floor(rand()*pieces.length)],center=centroid(p.pts);
      const idx=Math.floor(rand()*p.pts.length),origin=p.pts[idx],r=Math.max(30,Math.sqrt(Math.abs(area(p.pts)))*.28);
      let outward={x:origin.x-center.x,y:origin.y-center.y};const l=Math.hypot(outward.x,outward.y)||1;outward={x:outward.x/l,y:outward.y/l};
      const amp=(18+rand()*88)*s;
      p.pts.forEach(q=>{const w=closeness(q,origin,r);q.x+=outward.x*amp*w;q.y+=outward.y*amp*w;});
      events.push('Synthetic growth: '+p.id);
    }
    if(s>0&&config.operators.spatial){
      // Rectilinear architectural pull, inspired by body/object fusions.
      const rand=opRand('spatial');const p=pieces[Math.floor(rand()*pieces.length)];
      const box=bounds(p.pts),isRight=rand()>.5;
      const x0=isRight?box.right:box.left,flat=x0+(isRight?1:-1)*s*(12+rand()*90);
      const yTarget=mix(box.top,box.bottom,.3+rand()*.4),scale=Math.max(26,(box.bottom-box.top)*.17);
      for(const q of p.pts){const w=Math.exp(-.5*Math.pow((q.y-yTarget)/scale,2));
        const sideWeight=Math.exp(-.5*Math.pow((q.x-x0)/(Math.max(30,box.right-box.left)*.35),2));
        const ww=w*sideWeight;
        q.x=mix(q.x,flat,ww*(.3+.55*s));
        q.y=mix(q.y,yTarget,ww*.22*s);
      }
      events.push('Spatial assimilation: '+p.id);
    }
    if(s>0&&config.operators.ghost){
      // An informational echo; NOT an extra cuttable panel.
      const rand=opRand('ghost'),p=pieces[Math.floor(rand()*pieces.length)];const c=centroid(p.pts);
      const shiftX=(rand()>.5?1:-1)*(13+95*s),shiftY=(-6-32*s);
      const scale=1+(.1+.25*rand())*s;
      ghosts.push({source:p.id,label:'GHOST OF '+p.id,pts:p.pts.map(q=>({...q,x:c.x+(q.x-c.x)*scale+shiftX,y:c.y+(q.y-c.y)*scale+shiftY})) ,layout:{...p.layout}});
      events.push('Ghost replication: '+p.id);
    }
    if(s>0&&config.operators.joint){
      // Localized pseudo-articulation hinge. No actual body or 3D rig is assumed.
      const rand=opRand('joint');const p=pieces[Math.floor(rand()*pieces.length)];
      const box=bounds(p.pts),centre={x:mix(box.left,box.right,.25+rand()*.5),y:mix(box.top,box.bottom,.3+rand()*.45)};
      const sigma=Math.max(28,Math.min(box.right-box.left,box.bottom-box.top)*.27);
      const direction=rand()>.5?1:-1,reach=s*(35+rand()*190);
      p.pts.forEach(q=>{const w=Math.exp(-.5*Math.pow(dist(q,centre)/sigma,2));
        q.x+=reach*direction*w;q.y-=reach*.23*w;
      });
      events.push('Joint collapse: '+p.id);
    }
    if(s>0&&config.operators.fusion && config.intensity>=42 && pieces.length>=2){
      // Invent a bridge connecting two separate flat panels. This is additional
      // cuttable-looking research geometry (not a structurally validated sewing piece).
      const rand=opRand('fusion');const a=pieces[0],b=pieces[1];
      const ap=a.pts.reduce((best,q)=>q.x>best.x?q:best,a.pts[0]);
      const bp=b.pts.reduce((best,q)=>q.x<best.x?q:best,b.pts[0]);
      const A={x:ap.x+a.layout.x,y:ap.y+a.layout.y};
      const B={x:bp.x+b.layout.x,y:bp.y+b.layout.y};
      const dy=B.y-A.y,dx=B.x-A.x,length=Math.hypot(dx,dy)||1;
      const unit={x:-dy/length,y:dx/length};const width=10+s*(30+rand()*70);
      const vertices=[
        {x:A.x+unit.x*width*.68,y:A.y+unit.y*width*.68},
        {x:A.x+dx*.28+unit.x*width,y:A.y+dy*.28+unit.y*width},
        {x:B.x-dx*.26+unit.x*width*.46,y:B.y-dy*.26+unit.y*width*.46},
        {x:B.x+unit.x*width*.65,y:B.y+unit.y*width*.65},
        {x:B.x-unit.x*width*.65,y:B.y-unit.y*width*.65},
        {x:B.x-dx*.26-unit.x*width*.55,y:B.y-dy*.26-unit.y*width*.55},
        {x:A.x+dx*.28-unit.x*width,y:A.y+dy*.28-unit.y*width},
        {x:A.x-unit.x*width*.65,y:A.y-unit.y*width*.65}
      ];
      pieces.push({id:'mutation_bridge',label:'PANNEAU FUSION (À VÉRIFIER)',layout:{x:0,y:0},pts:vertices.map((q,i)=>({...q,edge:['anchor_a','upper','upper','anchor_b','lower','lower','lower','anchor_a'][i],t:i/vertices.length,index:i})),generated:true});
      events.push('Panel fusion: '+a.id+' ↔ '+b.id+' (panneau ajouté, assemblage non vérifié)');
    }
    if(s>0&&config.operators.topology && config.intensity>=30 && seams.length>1){
      // Rewire semantic seam graph, not just pixels. Former partner becomes orphaned.
      const rand=opRand('topology');const i=Math.floor(rand()*seams.length),j=(i+1+Math.floor(rand()*(seams.length-1)))%seams.length;
      const tmp=seams[i].b;seams[i].b=seams[j].b;seams[j].b=tmp;
      seams[i].rewired=true;seams[j].rewired=true;
      events.push('Topology confusion: '+seams[i].id+' ↔ '+seams[j].id);
    }
    if(s>0 && config.base==='pdf_import' && config.linkedSeams && seams.length){
      const binder=(typeof globalThis!=='undefined'&&globalThis.GBLSeams)?globalThis.GBLSeams:(typeof require==='function'?require('./seam-graph.js'):null);
      if(binder){
        const reports=binder.propagate(pieces,seams,{fadeMm:42});
        for(const r of reports)events.push(r.ok?'Stitch propagation: '+r.id+' ('+Math.abs(r.source-r.target).toFixed(2)+' mm)':'Couture NON liée : '+r.id+' / '+r.reason);
      }
    }
    return {config,original,pieces,seams,baselineSeams:draft.seams,ghosts,events,meta:draft.meta||null,report:diagnostics(pieces,seams,original,draft.seams)};
  }
  function area(pts){let a=0;for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];a+=p.x*q.y-q.x*p.y;}return a/2;}
  function intersect(a,b,c,d){
    const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
    const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
    const eps=1e-7;
    return (((ab1>eps&&ab2<-eps)||(ab1<-eps&&ab2>eps))&&((cd1>eps&&cd2<-eps)||(cd1<-eps&&cd2>eps)));
  }
  function intersections(pts){
    let count=0;for(let i=0;i<pts.length;i++){
      const a=pts[i],b=pts[(i+1)%pts.length];
      for(let j=i+2;j<pts.length;j++){
        if(i===0&&j===pts.length-1)continue;
        if(intersect(a,b,pts[j],pts[(j+1)%pts.length]))count++;
      }
    }return count;
  }
  function diagnostics(pieces,seams,original,baselineSeams){
    const byId=(arr,id)=>arr.find(p=>p.id===id);
    const basic=pieces.map(p=>({id:p.id,label:p.label,area:Math.abs(area(p.pts)),intersections:intersections(p.pts)}));
    const pairs=seams.map(pair=>{
      const pa=byId(pieces,pair.a[0]),pb=byId(pieces,pair.b[0]);
      const la=seamLength(pa,pair.a[1]),lb=seamLength(pb,pair.b[1]);
      const delta=la-lb,percent=100*Math.abs(delta)/Math.max(1,(la+lb)/2);
      return {id:pair.id,a:pair.a.join(' / '),b:pair.b.join(' / '),lengthA:la,lengthB:lb,delta,percent,rewired:Boolean(pair.rewired)};
    });
    const baseline=baselineSeams.map(pair=>{
      const a=seamLength(byId(original,pair.a[0]),pair.a[1]),b=seamLength(byId(original,pair.b[0]),pair.b[1]);
      return {id:pair.id,percent:100*Math.abs(a-b)/Math.max(1,(a+b)/2)};
    });
    return {pieces:basic,seams:pairs,baseline,intersections:basic.reduce((n,p)=>n+p.intersections,0),maxSeamMismatch:Math.max(0,...pairs.map(x=>x.percent)),rewired:pairs.filter(x=>x.rewired).length};
  }
  function allPoints(result,type){return (type==='original'?result.original:result.pieces).flatMap(p=>p.pts.map(q=>({x:q.x+p.layout.x,y:q.y+p.layout.y}))).concat(type==='original'?[]:result.ghosts.flatMap(p=>p.pts.map(q=>({x:q.x+p.layout.x,y:q.y+p.layout.y}))));}
  function viewBox(result,type){const pts=allPoints(result,type);const b=bounds(pts);const pad=50;return [b.left-pad,b.top-pad,Math.max(1,b.right-b.left)+2*pad,Math.max(1,b.bottom-b.top)+2*pad];}
  function fmt(n){return Number(n.toFixed(3));}
  function path(pts,layout={x:0,y:0}){return 'M '+pts.map(q=>`${fmt(q.x+layout.x)} ${fmt(q.y+layout.y)}`).join(' L ')+' Z';}
  function esc(str){return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function svgString(result,options={}) {
    const variant=options.variant||'mutated',src=variant==='original'?result.original:result.pieces;
    const bbox=viewBox(result,variant),[bx,by,bw,bh]=bbox;
    const includeGhost=variant!=='original'&&options.ghost!==false;
    const extra=src.map(p=>{
      const pos={x:p.layout.x,y:p.layout.y};const c=centroid(p.pts);
      const stroke=variant==='original'?'#393d47':'#25202e';
      const title=`${p.label} / ${p.id}`;
      let segments='';
      if(options.seamHighlight!==false){for(const pair of result.seams){for(const target of [pair.a,pair.b]){
        if(target[0]!==p.id)continue;
        const coords=p.pts.map((q,i)=>q.edge===target[1]?[q,p.pts[(i+1)%p.pts.length]]:null).filter(Boolean);
        segments+=coords.map(([a,b])=>`<path d="M ${fmt(a.x+pos.x)} ${fmt(a.y+pos.y)} L ${fmt(b.x+pos.x)} ${fmt(b.y+pos.y)}" fill="none" stroke="${pair.rewired?'#b04d65':'#88669e'}" stroke-width="1.8"/>`).join('');
      }}}
      return `<g id="${esc(p.id)}"><title>${esc(title)}</title><path d="${path(p.pts,pos)}" fill="${variant==='original'?'#cdd6da':'#d2bfd8'}" fill-opacity=".42" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>${segments}<text x="${fmt(c.x+pos.x)}" y="${fmt(c.y+pos.y)}" font-size="13" font-family="monospace" fill="#24232b" text-anchor="middle">${esc(p.label)}</text></g>`;
    }).join('');
    const ghosts=includeGhost?result.ghosts.map((g,i)=>`<g id="ghost-${i}" data-cuttable="false"><title>${esc(g.label)} / ANNOTATION, NOT A CUT LINE</title><path d="${path(g.pts,g.layout)}" fill="none" stroke="#a75d83" stroke-width="2" stroke-dasharray="7 5"/></g>`).join(''):'';
    const metadata=JSON.stringify({version:'0.4',...result.config,meta:result.meta,events:result.events});
    // geometry is in design-mm at 1 SVG coordinate = 1mm (research sizes, not validated measurements)
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(bw)}mm" height="${fmt(bh)}mm" viewBox="${bbox.map(fmt).join(' ')}" role="img"><title>Garment Bending Lab — ${esc(variant)} — seed ${result.config.seed}</title><desc>EXPERIMENTAL draft, not validated for cutting. No seam allowance. 1 SVG unit = 1 mm.</desc><metadata>${esc(metadata)}</metadata><rect x="${fmt(bx)}" y="${fmt(by)}" width="${fmt(bw)}" height="${fmt(bh)}" fill="white"/>${extra}${ghosts}<text x="${fmt(bx+15)}" y="${fmt(by+bh-15)}" font-family="monospace" font-size="10" fill="#777">GBL V0.6 · 1 UNIT = 1 MM · NO SEAM ALLOWANCE · TEST FIRST</text></svg>`;
  }
  return {OP_NAMES,DEFAULT_OPERATORS,model,mutate,diagnostics,viewBox,path,svgString,scalarForIntensity,intersections,area};
});
