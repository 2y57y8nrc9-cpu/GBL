/* Garment Bending Lab V0.3 - independently written, parametric jersey T-shirt draft.
   Inputs in cm, geometry in mm. No seam/cut allowances; fit must be tested physically.
   This is NOT Nastix source code and does not use their algorithms. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLDraft=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const defaults={chest:92,hips:98,waist:78,inseam:76,length:64,shoulder:12,armhole:22,sleeve:22,bicep:31,neckWidth:7.8,frontDrop:8.5,backDrop:2.5,chestEase:10,hemEase:8,bicepEase:4,neckbandWidth:3.5,neckbandRatio:0.88};
const ranges={chest:[65,155],hips:[65,170],waist:[50,150],inseam:[35,110],length:[35,100],shoulder:[8,20],armhole:[14,34],sleeve:[15,75],bicep:[22,56],neckWidth:[5,12],frontDrop:[4,19],backDrop:[1,6],chestEase:[-2,40],hemEase:[-2,40],bicepEase:[1,20],neckbandWidth:[1.5,5],neckbandRatio:[0.75,1]};
const presets={regular:{chestEase:10,hemEase:8,bicepEase:4},relaxed:{chestEase:16,hemEase:16,bicepEase:7},cropped:{chestEase:12,hemEase:9,bicepEase:5},oversized:{chestEase:30,hemEase:29,bicepEase:13}};
function clamp(n,min,max){return Math.min(max,Math.max(min,n));}
function normalize(source={}){const m={};for(const k of Object.keys(defaults)){const n=Number(source[k]);m[k]=Number.isFinite(n)&&source[k]!==null&&source[k]!==undefined&&source[k]!==''?clamp(n,...ranges[k]):defaults[k];}return m;}
function pt(x,y){return {x,y};}
function cubic(a,b,c,d,t){const u=1-t;return pt(u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y);}
function line(a,b){return [a,b];}
function curve(a,b,c,d,count=20){return Array.from({length:count+1},(_,i)=>cubic(a,b,c,d,i/count));}
function length(pts){let out=0;for(let i=1;i<pts.length;i++)out+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);return out;}
function piece(id,label,sections,x,y,extras={}){let vertices=[],edgeLabels=[];for(const seg of sections){for(let i=0;i<seg.points.length-1;i++){const p=seg.points[i];vertices.push({x:p.x,y:p.y});edgeLabels.push(seg.edge);}}return {id,label,vertices,edgeLabels,layout:{x,y},isCurveSampled:true,...extras};}
function body(kind,m,fit){
 const factor=10, chestW=(m.chest+m.chestEase)*factor/4, hemW=(m.hips+m.hemEase)*factor/4;
 const drop=(kind==='front'?m.frontDrop:m.backDrop)*factor, neckX=m.neckWidth*factor, shoulder= m.shoulder*factor, slope=22;
 const shoulderX=neckX+Math.sqrt(Math.max(400,shoulder*shoulder-slope*slope));
 const armY=m.armhole*factor, len=m.length*factor*(fit==='cropped'?.81:1);
 const a=pt(0,drop),b=pt(neckX,0),c=pt(shoulderX,slope),d=pt(chestW,armY),e=pt(hemW,len),f=pt(0,len);
 const neck=curve(a,pt(0,drop*.44),pt(neckX*.52,0),b,22);
 const arm=curve(c,pt(shoulderX+25,slope+64),pt(chestW-36,armY-55),d,30);
 const sections=[{edge:'neckline',points:neck},{edge:'shoulder',points:line(b,c)},{edge:'armhole',points:arm},{edge:'side',points:line(d,e)},{edge:'hem',points:line(e,f)},{edge:'fold',points:line(f,a)}];
 return {sections,armLength:length(arm),neckLength:length(neck),sideLength:length(line(d,e)),shoulderLength:length(line(b,c)),height:len,sideX:chestW};
}
function capCurve(hw,h){return [curve(pt(-hw,h),pt(-hw*.72,h*.58),pt(-hw*.36,0),pt(0,0),30),curve(pt(0,0),pt(hw*.36,0),pt(hw*.72,h*.58),pt(hw,h),30)];}
function generateTshirt(input={},fit='regular'){
 const m=normalize(input);const front=body('front',m,fit),back=body('back',m,fit);
 const target=front.armLength+back.armLength;
 const hw=(m.bicep+m.bicepEase)*5;
 const sleeveLen=m.sleeve*10;
 const low=20,high=Math.max(low+1,sleeveLen-25);
 const capTotal=h=>capCurve(hw,h).reduce((n,p)=>n+length(p),0);
 let h=low;
 if(target>=capTotal(high))h=high;else if(target<=capTotal(low))h=low;else {let lo=low,hi=high;for(let i=0;i<42;i++){const mid=(lo+hi)/2;if(capTotal(mid)<target)lo=mid;else hi=mid;}h=(lo+hi)/2;}
 const [capFront,capBack]=capCurve(hw,h);
 const sleeve=[{edge:'cap_front',points:capFront},{edge:'cap_back',points:capBack},
   {edge:'underarm_right',points:line(pt(hw,h),pt(hw*.83,sleeveLen))},
   {edge:'cuff',points:line(pt(hw*.83,sleeveLen),pt(-hw*.83,sleeveLen))},
   {edge:'underarm_left',points:line(pt(-hw*.83,sleeveLen),pt(-hw,h))}];
 const neckline=2*(front.neckLength+back.neckLength);
 const bandLength=neckline*m.neckbandRatio,bandWidth=m.neckbandWidth*20;
 const rectangle=(w,h)=>[{edge:'long_a',points:line(pt(0,0),pt(w,0))},{edge:'end_r',points:line(pt(w,0),pt(w,h))},{edge:'long_b',points:line(pt(w,h),pt(0,h))},{edge:'end_l',points:line(pt(0,h),pt(0,0))}];
 const frontPiece=piece('front','DEVANT / PLI',front.sections,0,0,{cutOnFold:true});
 const backPiece=piece('back','DOS / PLI',back.sections,Math.max(front.sideX,back.sideX)+125,0,{cutOnFold:true});
 const sleevePiece=piece('sleeve','MANCHE / ×2',sleeve,Math.max(front.sideX,back.sideX)*2+hw+270,0,{cutOnFold:false});
 const bandPiece=piece('neckband','BANDE ENCOLURE',rectangle(bandLength,bandWidth),0,Math.max(front.height,back.height)+125,{cutOnFold:false});
 const seams=[
 {id:'side',a:['front','side'],b:['back','side']},
 {id:'shoulder',a:['front','shoulder'],b:['back','shoulder']},
 {id:'cap_front',a:['front','armhole'],b:['sleeve','cap_front']},
 {id:'cap_back',a:['back','armhole'],b:['sleeve','cap_back']},
 {id:'sleeve_underarm',a:['sleeve','underarm_left'],b:['sleeve','underarm_right']}
 ];
 const capActual=capTotal(h);
 return {kind:'tshirt_custom',pieces:[frontPiece,backPiece,sleevePiece,bandPiece],seams,
  meta:{measurements:m,fit,units:'mm',allowance:0,neckline,bandLength,bandRatio:m.neckbandRatio,
  capTarget:target,capActual,capDelta:capActual-target,capHeight:h,capClamped:(target<capTotal(low)||target>capTotal(high)),
  note:'Experimental measured draft; no allowances; physical fitting and seam calibration required.'}};
}
return {defaults,ranges,presets,normalize,generateTshirt};
});
