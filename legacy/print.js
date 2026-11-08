/* Offline A4 sheet assembly from generated SVG. Browser print-to-PDF, not a PDF library.
   A4: 210 x 297 mm; content tile 190 x 267 mm with 10 mm margins. */
(function(root,factory){const a=factory();if(typeof module!=='undefined'&&module.exports)module.exports=a;root.GBLPrint=a;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const PAGE_W=210,PAGE_H=297,TILE_W=190,TILE_H=267;
function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function buildPrintHtml(result,engine,variant='mutated'){
 const [bx,by,bw,bh]=engine.viewBox(result,variant);
 const svg=engine.svgString(result,{variant,seamHighlight:true});
 const svgInner=svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>'));
 const cols=Math.ceil(bw/TILE_W),rows=Math.ceil(bh/TILE_H);
 const pages=[];
 pages.push(`<section class="page cover"><div class="head">GARMENT BENDING LAB / 0.3</div><h1>PATRON EXPÉRIMENTAL</h1><p>${escapeHtml(result.config.base)} · seed #${result.config.seed} · intensité ${result.config.intensity}%</p><p>${cols} × ${rows} pages à assembler · ${cols*rows} feuilles de patron + 1 feuille de contrôle.</p><p><strong>ÉCHELLE :</strong> imprimer en 100 %, désactiver « Ajuster à la page ». Mesurer le carré ci-dessous : 50 × 50 mm exacts.</p><svg width="60mm" height="60mm" viewBox="0 0 60 60"><rect x="5" y="5" width="50" height="50" fill="none" stroke="black" stroke-width=".35"/><text x="30" y="31" text-anchor="middle" font-size="4">50 × 50 mm</text></svg><p><strong>ATTENTION :</strong> marges de couture non incluses ; assemblage et morphologie non validés ; toujours faire une toile.</p><p>Des lignes et annotations peuvent traverser plusieurs pages. Joindre selon les coordonnées rangée/colonne.</p></section>`);
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
   const tx=bx+col*TILE_W,ty=by+row*TILE_H;
   pages.push(`<section class="page"><div class="page-label">GBL V0.3 — ${escapeHtml(variant.toUpperCase())} · R${row+1}/${rows} C${col+1}/${cols} · seed ${result.config.seed}</div><div class="tile"><svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="267mm" viewBox="0 0 190 267" role="img"><g transform="translate(${-tx} ${-ty})">${svgInner}</g><path d="M 0 5 H 5 M 5 0 V 5 M 185 0 V 5 M 190 5 H 185 M 0 262 H 5 M 5 267 V 262 M 185 267 V 262 M 190 262 H 185" stroke="#777" stroke-width=".25" fill="none"/></svg></div></section>`);
 }
 return `<!doctype html><html lang="fr"><head><meta charset="UTF-8"><title>GBL A4 · ${escapeHtml(variant)} · seed ${result.config.seed}</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;background:white;color:#1e1a20;font-family:Arial,sans-serif}.page{width:210mm;height:297mm;padding:10mm;break-after:page;page-break-after:always;position:relative;overflow:hidden}.page:last-child{break-after:auto}.tile{width:190mm;height:267mm;overflow:hidden}.tile svg{display:block}.page-label{position:absolute;top:4mm;left:10mm;font:9px monospace;background:white}.cover{padding:24mm 18mm}.cover h1{font-size:25px;letter-spacing:2px}.cover p{font-size:12px;line-height:1.6;max-width:145mm}.head{font:10px monospace;letter-spacing:2px;color:#888}@media screen{body{background:#dedbe0}.page{margin:12px auto;box-shadow:0 4px 25px #999}}@media print{.page{margin:0;box-shadow:none}}</style></head><body>${pages.join('')}</body></html>`;
}
return {PAGE_W,PAGE_H,TILE_W,TILE_H,buildPrintHtml};
});
