/* GBL 0.5 — local vector PDF reader and multi-sheet registration.
   Pure JS, no uploads. Scope: conventional PDF page trees, FlateDecode
   streams and stroked path operators. Raster-only / encrypted / object-stream
   PDFs are reported unsupported rather than silently vectorized. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GBLPDF=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PT2MM=25.4/72, MM2PT=72/25.4;
const decodeLatin=bytes=>{let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return result;};
const numeric=s=>Number(s||0);
const getRef=(str,key)=>{const m=str.match(new RegExp('\\/'+key+'\\s+(\\d+)\\s+\\d+\\s+R'));return m?+m[1]:null;};
function refs(s){return [...s.matchAll(/(\d+)\s+\d+\s+R/g)].map(m=>Number(m[1]));}
function objectsFromBinary(bytes){
 const src=decodeLatin(bytes);const objects=new Map();const re=/(\d+)\s+\d+\s+obj\b/g;let m;
 while((m=re.exec(src))){let end=src.indexOf('endobj',re.lastIndex);if(end<0)break;
  const content=src.slice(re.lastIndex,end);objects.set(Number(m[1]),{text:content,begin:re.lastIndex,end});re.lastIndex=end+6;
 }return {src,objects};
}
function listPages(objs){
 const catalog=[...objs.entries()].find(([,v])=>/\/Type\s*\/Catalog\b/.test(v.text));
 const start=catalog?getRef(catalog[1].text,'Pages'):null;
 const out=[],seen=new Set();
 function visit(id){if(id==null||seen.has(id))return;seen.add(id);const obj=objs.get(id);if(!obj)return;
  if(/\/Type\s*\/Page\b/.test(obj.text)){out.push({id,body:obj.text});return;}
  const kid=obj.text.match(/\/Kids\s*\[([\s\S]*?)\]/);if(kid)for(const ref of refs(kid[1]))visit(ref);
 }
 if(start)visit(start);
 if(!out.length){for(const [id,obj] of objs)if(/\/Type\s*\/Page\b/.test(obj.text))out.push({id,body:obj.text});}
 return out;
}
function mediaBox(text,objs,id){let body=text;let guard=0;
 while(guard++<5){const m=body.match(/\/(?:CropBox|MediaBox)\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/);
  if(m){const nums=m.slice(1).map(Number);return {x0:nums[0],y0:nums[1],width:nums[2]-nums[0],height:nums[3]-nums[1]};}
  const parent=getRef(body,'Parent');if(!parent||!objs.has(parent))break;body=objs.get(parent).text;
 }return {x0:0,y0:0,width:595.276,height:841.89};
}
function contentRefs(body){const arr=body.match(/\/Contents\s*\[([\s\S]*?)\]/);if(arr)return refs(arr[1]);const single=getRef(body,'Contents');return single?[single]:[];}
async function inflate(buf){
 if(typeof globalThis!=='undefined'&&globalThis.pako?.inflate){try{return globalThis.pako.inflate(buf);}catch(e){throw Error('Erreur Pako : '+e.message);}}
 if(typeof DecompressionStream!=='undefined'){
  const ds=new DecompressionStream('deflate');const stream=new Blob([buf]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
 }
 if(typeof require==='function')return new Uint8Array(require('node:zlib').inflateSync(Buffer.from(buf)));
 throw Error('Ce navigateur ne prend pas en charge la décompression des PDF (DecompressionStream).');
}
async function streamData(src,objs,id){
 const obj=objs.get(id);if(!obj)throw Error('Flux PDF introuvable : '+id);
 const str=obj.text,mat=str.match(/stream\r?\n/);
 if(!mat)throw Error('Pas de flux dans l’objet '+id);
 const start=obj.begin+mat.index+mat[0].length;
 const lengthMatch=str.match(/\/Length\s+(\d+)\b/);
 const endMatch=str.indexOf('endstream',mat.index+mat[0].length);
 const length=lengthMatch?Number(lengthMatch[1]):Math.max(0,endMatch-mat.index-mat[0].length);
 let raw=new Uint8Array(length);for(let i=0;i<length;i++)raw[i]=src.charCodeAt(start+i)&255;
 if(/\/Filter\s*\/FlateDecode\b/.test(str)||/\/Filter\s*\[\s*\/FlateDecode/.test(str)){try{raw=await inflate(raw);}catch(e){throw Error('Échec décompression objet PDF '+id+' (octets '+length+') : '+e.message);}}
 else if(/\/Filter\b/.test(str))throw Error('Compression PDF non prise en charge dans l’objet '+id);
 return decodeLatin(raw);
}
// Tokenizer intentionally skips string/hex text objects; only vector graphics commands matter.
function tokenize(s){const out=[];let i=0;
 while(i<s.length){const c=s[i];if(/\s/.test(c)){i++;continue;}
  if(c==='%'){while(i<s.length&&s[i]!=='\n')i++;continue;}
  if(c==='('){let depth=1;i++;while(i<s.length&&depth){if(s[i]==='\\'){i+=2;continue;}if(s[i]==='(')depth++;else if(s[i]===')')depth--;i++;}out.push('#str');continue;}
  if(c==='<'){if(s[i+1]==='<'){out.push('<<');i+=2;}else{const e=s.indexOf('>',i+1);i=e<0?s.length:e+1;out.push('#hex');}continue;}
  if(c==='['){let depth=1;i++;while(i<s.length&&depth){if(s[i]==='[')depth++;if(s[i]===']')depth--;i++;}out.push('#array');continue;}
  if(c==='/' ){const m=s.slice(i).match(/^\/[A-Za-z0-9_.+-]+/);if(m){out.push(m[0]);i+=m[0].length;continue;}}
  const n=s.slice(i).match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[Ee][+-]?\d+)?/);
  if(n){out.push(+n[0]);i+=n[0].length;continue;}
  const m=s.slice(i).match(/^[^\s\[\]()<>/%]+/);if(m){out.push(m[0]);i+=m[0].length;continue;}i++;
 }return out;
}
function tx(p,m,h){return {x:m[0]*p.x+m[2]*p.y+m[4],y:h-(m[1]*p.x+m[3]*p.y+m[5])};}
function mul(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];}
function segmentDistPoint(p,a,b){const vx=b.x-a.x,vy=b.y-a.y;const len=Math.hypot(vx,vy)||1;return Math.abs((p.x-a.x)*vy-(p.y-a.y)*vx)/len;}
function cubic(p0,p1,p2,p3,out,depth=0){
 const flat=Math.max(segmentDistPoint(p1,p0,p3),segmentDistPoint(p2,p0,p3));
 if(flat<0.22||depth>=11){out.push(p3);return;}
 const midpoint=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
 const a=midpoint(p0,p1),b=midpoint(p1,p2),c=midpoint(p2,p3),d=midpoint(a,b),e=midpoint(b,c),f=midpoint(d,e);
 cubic(p0,a,d,f,out,depth+1);cubic(f,e,c,p3,out,depth+1);
}
function runGraphics(content,width,height,pageNumber){
 const toks=tokenize(content),paths=[];let args=[],sub=[],all=[],state={matrix:[1,0,0,1,0,0],stroke:[0,0,0],lineWidth:1},stack=[],curPdf=null,origin=null;
 const scalar=(n)=>args.slice(-n).map(Number);
 function stroke(close=false){if(close&&sub.length>1){if(Math.hypot(sub[0].x-sub.at(-1).x,sub[0].y-sub.at(-1).y)>0.05)sub.push({...sub[0]});}
  if(sub.length>1)all.push(sub);sub=[];curPdf=null;origin=null;
  for(const p of all)if(p.length>=2){const l=p.reduce((n,q,i)=>i?n+Math.hypot(q.x-p[i-1].x,q.y-p[i-1].y):0,0);
   if(l>.2)paths.push({points:p,sourcePage:pageNumber,color:[...state.stroke],length:l,closed:Math.hypot(p[0].x-p.at(-1).x,p[0].y-p.at(-1).y)<.6});}
  all=[];
 }
 function newSub(){if(sub.length>1)all.push(sub);sub=[];curPdf=null;origin=null;}
 function point(x,y){return tx({x,y},state.matrix,height);}
 for(const t of toks){if(typeof t==='number'||String(t).startsWith('/')||String(t).startsWith('#')){args.push(t);continue;}
 switch(t){
  case 'q':stack.push({matrix:[...state.matrix],stroke:[...state.stroke],lineWidth:state.lineWidth});break;
  case 'Q':if(stack.length)state=stack.pop();break;
  case 'cm':if(args.length>=6)state.matrix=mul(state.matrix,scalar(6));break;
  case 'G':{const a=scalar(1)[0];if(Number.isFinite(a))state.stroke=[a,a,a];break;}
  case 'RG':{if(args.length>=3)state.stroke=scalar(3);break;}
  case 'SC':case 'SCN':{const colors=args.filter(a=>typeof a==='number');if(colors.length>=3)state.stroke=colors.slice(-3);else if(colors.length===1)state.stroke=[colors[0],colors[0],colors[0]];break;}
  case 'w':state.lineWidth=scalar(1)[0];break;
  case 'm':{if(args.length>=2){newSub();const [x,y]=scalar(2);curPdf={x,y};origin={x,y};sub.push(point(x,y));}break;}
  case 'l':{if(args.length>=2){const [x,y]=scalar(2);if(!curPdf)sub.push(point(x,y));else sub.push(point(x,y));curPdf={x,y};}break;}
  case 'c':{if(args.length>=6&&curPdf){const a=scalar(6);const p0=point(curPdf.x,curPdf.y),p1=point(a[0],a[1]),p2=point(a[2],a[3]),p3=point(a[4],a[5]);cubic(p0,p1,p2,p3,sub);curPdf={x:a[4],y:a[5]};}break;}
  case 'v':{if(args.length>=4&&curPdf){const a=scalar(4);cubic(point(curPdf.x,curPdf.y),point(curPdf.x,curPdf.y),point(a[0],a[1]),point(a[2],a[3]),sub);curPdf={x:a[2],y:a[3]};}break;}
  case 'y':{if(args.length>=4&&curPdf){const a=scalar(4);cubic(point(curPdf.x,curPdf.y),point(a[0],a[1]),point(a[2],a[3]),point(a[2],a[3]),sub);curPdf={x:a[2],y:a[3]};}break;}
  case 're':{if(args.length>=4){const [x,y,w,h]=scalar(4);newSub();sub=[point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h),point(x,y)];curPdf={x,y};origin={x,y};}break;}
  case 'h':if(origin&&sub.length>1){if(Math.hypot(sub[0].x-sub.at(-1).x,sub[0].y-sub.at(-1).y)>0.01)sub.push({...sub[0]});curPdf={...origin};}break;
  case 'S':stroke();break;
  case 's':stroke(true);break;
  case 'B':case 'B*':case 'b':case 'b*':stroke(t[0]==='b');break;
  case 'f':case 'F':case 'f*':case 'n':all=[];sub=[];curPdf=null;origin=null;break;
 }args=[];
 }
 return paths;
}
function bbox(points){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}return {x:x0,y:y0,w:x1-x0,h:y1-y0};}
function registration(page){
 const suspects=page.paths.filter(p=>p.color[0]>.44&&p.color[0]<.65&&bbox(p.points).w>page.width*1.7&&bbox(p.points).h>page.height*1.5);
 if(!suspects.length)return null;
 const score=p=>bbox(p.points).w*bbox(p.points).h;
 const b=bbox(suspects.sort((a,b)=>score(b)-score(a))[0].points);
 return {x:b.x,y:b.y};
}
async function parsePDF(buffer){
 const bytes=new Uint8Array(buffer);if(bytes.length>40000000)throw Error('PDF supérieur à 40 Mo : import par lots recommandé.');
 if(decodeLatin(bytes.subarray(0,7)).indexOf('%PDF-')!==0)throw Error('Le fichier n’est pas un PDF valide.');
 const {src,objects}=objectsFromBinary(bytes),pageRecords=listPages(objects);
 if(!pageRecords.length)throw Error('Aucune page PDF lisible. Les objets compressés ObjStm ne sont pas encore pris en charge.');
 if(pageRecords.length>60)throw Error('Cette version accepte au maximum 60 pages PDF.');
 const pages=[];
 for(let i=0;i<pageRecords.length;i++){
  const p=pageRecords[i],size=mediaBox(p.body,objects,p.id);
  if(/\/Rotate\s+(90|180|270)/.test(p.body))throw Error('Page '+(i+1)+' tournée dans le PDF : faire pivoter le fichier avant import.');
  const streamIds=contentRefs(p.body);let paths=[];
  for(const id of streamIds){const str=await streamData(src,objects,id);paths=paths.concat(runGraphics(str,size.width,size.height,i));}
  pages.push({number:i+1,width:size.width,height:size.height,paths,reg:null,dx:0,dy:0});
 }
 for(const p of pages)p.reg=registration(p);
 const auto=pages.every(p=>Boolean(p.reg));
 if(auto){const b=pages[0].reg;for(const p of pages){p.dx=b.x-p.reg.x;p.dy=b.y-p.reg.y;}}
 return {pages,autoRegistered:auto, source:'local PDF',type:'vector',notes:auto?['Repères vectoriels communs détectés : registration submillimétrique théorique (avant contrôle du PDF).']:['Aucun cadre commun reconnu : utiliser la grille A4 et ajuster les pages avec les repères imprimés.']};
}
function arrangeGrid(doc,cols=2,order='column',overlapX=14,overlapY=17){
 const colsN=Math.max(1,Math.round(cols)),rowsN=Math.ceil(doc.pages.length/colsN);
 doc.autoRegistered=false;
 for(let i=0;i<doc.pages.length;i++){
  const col=order==='column'?Math.floor(i/rowsN):i%colsN;
  const row=order==='column'?i%rowsN:Math.floor(i/colsN);
  const p=doc.pages[i];p.dx=col*(p.width-overlapX*MM2PT);p.dy=row*(p.height-overlapY*MM2PT);
 }
 return doc;
}
function globalPaths(doc,{darkOnly=true,minLengthPt=20}={}){
 const out=[];for(const page of doc.pages){for(const path of page.paths){
  if(darkOnly&&Math.max(...path.color)>.43)continue;
  if(path.length<minLengthPt)continue;
  const pts=path.points.map(p=>({x:p.x+page.dx,y:p.y+page.dy}));
  out.push({...path,points:pts,length:path.length,bbox:bbox(pts)});
 }}return out;
}
// Dedupe is intentionally limited: original geometric provenance is retained.
function uniquePaths(paths,precision=.55){const found=new Set(),output=[];
 for(const path of paths){const b=path.bbox||bbox(path.points);const p=path.points;
  const anchors=[p[0],p[Math.floor(p.length/2)],p.at(-1)];
  const signature=[b.x,b.y,b.w,b.h,path.length,...anchors.flatMap(q=>[q.x,q.y])].map(n=>Math.round(n/precision)).join(',');
  if(!found.has(signature)){found.add(signature);output.push(path);}
 }return output;
}
function millimeters(p){return {x:p.x*PT2MM,y:p.y*PT2MM};}
function makePiece(path,id,label,closeOpen=false){
 const orig=path.points.map(millimeters);
 const verts=[];for(const p of orig)if(!verts.length||Math.hypot(p.x-verts.at(-1).x,p.y-verts.at(-1).y)>.08)verts.push(p);
 if(verts.length<3)throw Error('Ce tracé ne contient pas assez de points pour définir une pièce.');
 const gap=Math.hypot(verts[0].x-verts.at(-1).x,verts[0].y-verts.at(-1).y);
 if(gap>.8&&!closeOpen)throw Error('Le contour est ouvert (écart '+gap.toFixed(1)+' mm). Active « fermeture expérimentale » après vérification.');
 if(gap<=.8)verts.pop();
 const box=bbox(verts),offset={x:box.x,y:box.y};
 let points=verts.map(p=>({x:p.x-box.x,y:p.y-box.y}));
 // Only simplify with a controlled *geometric tolerance*; never silently
 // decimate by vertex index (which could destroy accurate sewing curves).
 function rdp(arr,tolerance){
  if(arr.length<=2)return arr;
  const start=arr[0],end=arr.at(-1);let farthest=0,index=0;
  for(let i=1;i<arr.length-1;i++){
   const d=segmentDistPoint(arr[i],start,end);
   if(d>farthest){farthest=d;index=i;}
  }
  if(farthest<=tolerance)return [start,end];
  return rdp(arr.slice(0,index+1),tolerance).slice(0,-1).concat(rdp(arr.slice(index),tolerance));
 }
 if(points.length>480){
  // Preserve the closing geometry by splitting the cycle in two arcs.
  const half=Math.floor(points.length/2);
  points=rdp(points.slice(0,half+1),0.12).slice(0,-1).concat(rdp(points.slice(half).concat([points[0]]),0.12));
  if(Math.hypot(points[0].x-points.at(-1).x,points[0].y-points.at(-1).y)<.01)points.pop();
 }
 if(points.length>900)throw Error('Contour très dense : plus de 900 sommets même après simplification contrôlée (0,12 mm). Prépare le tracé dans un éditeur vectoriel avant import.');
 if(points.length<3)throw Error('Contours insuffisants');
 return {id,label,vertices:points,edgeLabels:points.map(()=>'contour'),layout:{x:0,y:0},isCurveSampled:true,source:{page:path.sourcePage+1,closed:gap<=.8,gapMm:gap,origin:offset}};
}
function combinePiecePaths(paths,id,label,closeOpen=false){
 if(!paths.length)throw Error('Sélectionne au moins un tracé.');
 if(paths.length===1)return makePiece(paths[0],id,label,closeOpen);
 // Match endpoints across overlapping A4 fragments without creating a guessed ordering.
 const segments=paths.map(p=>p.points.map(q=>({...q})));let assembled=segments.shift();
 while(segments.length){let best=null;for(let k=0;k<segments.length;k++){
  const s=segments[k];const candidates=[
   [Math.hypot(assembled.at(-1).x-s[0].x,assembled.at(-1).y-s[0].y),'append',false],
   [Math.hypot(assembled.at(-1).x-s.at(-1).x,assembled.at(-1).y-s.at(-1).y),'append',true],
   [Math.hypot(assembled[0].x-s.at(-1).x,assembled[0].y-s.at(-1).y),'prepend',false],
   [Math.hypot(assembled[0].x-s[0].x,assembled[0].y-s[0].y),'prepend',true]
  ];for(const [d,side,reverse] of candidates)if(!best||d<best.d)best={d,k,side,reverse};
 }
  if(best.d>MM2PT*1.5)throw Error('Les tracés sélectionnés ne se raccordent pas : distance '+(best.d*PT2MM).toFixed(1)+' mm. Sélectionne des portions appartenant au même contour.');
  let s=segments.splice(best.k,1)[0];if(best.reverse)s=s.reverse();
  if(best.side==='append')assembled=assembled.concat(s.slice(1));else assembled=s.slice(0,-1).concat(assembled);
 }
 return makePiece({points:assembled,sourcePage:paths[0].sourcePage},id,label,closeOpen);
}
return {PT2MM,MM2PT,parsePDF,arrangeGrid,globalPaths,uniquePaths,makePiece,combinePiecePaths,bbox,registration,runGraphics,objectsFromBinary};
});
