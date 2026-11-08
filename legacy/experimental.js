/* Garment Bending Lab V0.4 — ORIGINAL schematic pattern archetypes.
   Independent drawings informed by user aesthetics. Not reconstructed from DRCOS.
   Coordinates in millimeters. NOT PRODUCTION PATTERNS; seam allowances excluded. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLExperimental=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const seg=(x,y,edge)=>({x,y,edge});
 function p(id,label,coords,edges,x,y){return {id,label,vertices:coords.map(([a,b])=>({x:a,y:b})),edgeLabels:edges,layout:{x,y},experimental:true};}
 function stitch(id,a,b){return {id,a,b};}
 function validate(g){for(const piece of g.pieces){if(piece.vertices.length!==piece.edgeLabels.length)throw Error('Bad labels '+piece.id);}}
 function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
 function pelvic(input={}){
  const m=input.measurements||{};const hip=clamp(Number(m.hips)||98,70,170)*10;
  const inseam=clamp(Number(m.inseam)||76,35,110)*10;
  const waist=clamp(Number(m.waist)||78,55,150)*10;
  const hipQ=hip/4,waistQ=waist/4,rise=Math.max(230,hip*.25),leg=inseam+rise;
  const panel=(id,label,x,asym)=>p(id,label,
   [[0,0],[waistQ*.93,0],[hipQ*1.12,rise*.38],[hipQ*.94,leg],[hipQ*.58,leg],[hipQ*.43,rise*.98],[hipQ*.21,rise*.88],[-hipQ*.22,rise*1.03],[-hipQ*.37,leg],[-hipQ*.64,leg],[-hipQ*.89,rise*.38]],
   ['waist','waist_to_hip','outer','ankle_outer','ankle_inner','inner','crotch_right','crotch_left','ankle_other','outer_other','hip_to_waist'],x,asym);
  const a=panel('left_leg','JAMBE A / PONT',0,0),b=panel('right_leg','JAMBE B / PONT',hipQ*2.4,0);
  const width=Math.max(250,hip*.63);
  const bridge=p('bridge','PONT PELVIEN',[[0,0],[width,0],[width*.85,120],[width*.76,220],[width*.2,240],[0,130]],['top','upper','right','bottom','left','side'],hipQ*.5,leg+130);
  const seams=[stitch('entrejambe_A',['left_leg','crotch_right'],['right_leg','crotch_left']),stitch('bord_pont_A',['left_leg','inner'],['bridge','left']),stitch('bord_pont_B',['right_leg','inner'],['bridge','right'])];
  const g={kind:'pelvic_bridge',pieces:[a,b,bridge],seams,meta:{archetype:'Pelvic Bridge',measurements:m,units:'mm',allowance:0,note:'Invented research geometry. Not a validated trouser pattern or DRCOS reproduction.'}};validate(g);return g;
 }
 function jacket(input={}){
  const m=input.measurements||{},chest=clamp(Number(m.chest)||92,65,155)*10;
  const quarter=(chest+110)/4,bodyHeight=clamp(Number(m.length)||64,40,100)*10;
  const side=quarter*.91;
  const front=(id,label,x,flip)=>p(id,label,
   [[0,60],[65,2],[153,2],[quarter+30,115],[side,bodyHeight],[0,bodyHeight*.95],[-35,bodyHeight*.62],[-10,bodyHeight*.38]],
   ['neck','shoulder','armhole','side','hem','centre','lapel','lapel_return'],x,0);
  const a=front('front_A','DEVANT A',0),b=front('front_B','DEVANT B',quarter+170);
  const back=p('back','DOS',[[0,30],[80,0],[240,0],[quarter+35,120],[quarter+10,bodyHeight],[0,bodyHeight]],['neck','shoulder','armhole','side','hem','centre'],(quarter+170)*2,0);
  const sleeve=(id,label,x)=>p(id,label,[[0,55],[55,2],[115,0],[170,58],[145,520],[50,520]],['cap_left','cap_top','cap_right','outer','cuff','under'],x,0);
  const sl=sleeve('sleeve_A','MANCHE A',(quarter+170)*3,0),sr=sleeve('sleeve_B','MANCHE B',(quarter+170)*3+260,0);
  const collar=p('collar','COL NON ENREGISTRÉ',[[0,0],[250,-30],[310,12],[260,100],[20,95]],['top','corner','side','bottom','return'],0,bodyHeight+140);
  const seams=[stitch('shoulder_A',['front_A','shoulder'],['back','shoulder']),stitch('shoulder_B',['front_B','shoulder'],['back','shoulder']),stitch('body_side_A',['front_A','side'],['back','side']),stitch('body_side_B',['front_B','side'],['back','side']),stitch('sleeve_A',['front_A','armhole'],['sleeve_A','cap_right']),stitch('sleeve_B',['front_B','armhole'],['sleeve_B','cap_right']),stitch('collar_attach',['collar','bottom'],['back','neck'])];
  const g={kind:'misregistered_jacket',pieces:[a,b,back,sl,sr,collar],seams,meta:{archetype:'Misregistered Jacket',measurements:m,units:'mm',allowance:0,note:'Deliberately schematic, some mismatch is built into the base. Not DRCOS.'}};validate(g);return g;
 }
 function limb(input={}){
  const m=input.measurements||{},chest=clamp(Number(m.chest)||92,65,155)*10;
  const h=clamp(Number(m.length)||64,35,100)*10,w=(chest+80)/4;
  const torso=p('body','TORSE / MEMBRANE',[[0,82],[75,7],[160,8],[w+40,124],[w,h],[0,h]],['neck','shoulder','armhole','side','hem','fold'],0,0);
  const sleeve=p('limb','MEMBRE DÉPLACÉ',[[0,90],[60,0],[140,0],[215,90],[175,h*.84],[95,h*.84]],['cap_A','cap_B','cap_C','outer','cuff','under'],w+145,0);
  const membrane=p('membrane','ZONE DE FUSION',[[0,40],[145,0],[275,150],[220,270],[80,300],[-12,160]],['anchor','shoulder','outer','base','return','inner'],0,h+135);
  const seams=[stitch('shoulder_to_limb',['body','armhole'],['limb','cap_C']),stitch('skin_graft',['body','side'],['membrane','outer']),stitch('membrane_sleeve',['membrane','anchor'],['limb','under'])];
  const g={kind:'limb_transposition',pieces:[torso,sleeve,membrane],seams,meta:{archetype:'Limb Transposition',measurements:m,units:'mm',allowance:0,note:'Original invention; graphic suggestion of arm/torso misregistration only.'}};validate(g);return g;
 }
 function collar(input={}){
  const m=input.measurements||{},chest=clamp(Number(m.chest)||92,65,155)*10,w=(chest+110)/4;
  const h=clamp(Number(m.length)||64,35,100)*10;
  const body=p('body','CORPS / COLLET',[[0,80],[45,-5],[150,-5],[w+40,100],[w,h],[0,h]],['neck','shoulder','arm','side','hem','fold'],0,0);
  const long=p('infinite_collar','COL DÉROULÉ',[[0,0],[175,-30],[255,40],[235,430],[145,590],[50,430]],['top','neck','outside','tip','inside','return'],w+120,0);
  const sleeve=p('sleeve','BRAS / ÉCHO',[[0,80],[50,10],[100,0],[152,80],[125,550],[50,550]],['cap1','cap2','cap3','outside','cuff','inside'],w+500,0);
  const seams=[stitch('col_corporel',['body','neck'],['infinite_collar','top']),stitch('bras',['body','arm'],['sleeve','cap3'])];
  const g={kind:'collar_slip',pieces:[body,long,sleeve],seams,meta:{archetype:'Collar Slip',measurements:m,units:'mm',allowance:0,note:'Invented research archetype; not a pattern copied from the site.'}};validate(g);return g;
 }
 function generate(kind,config){switch(kind){case 'pelvic_bridge':return pelvic(config);case 'misregistered_jacket':return jacket(config);case 'limb_transposition':return limb(config);case 'collar_slip':return collar(config);default:throw Error('Unknown experimental archetype '+kind);}}
 return {generate,archetypes:['pelvic_bridge','misregistered_jacket','limb_transposition','collar_slip']};
});
