/* Local WebGL2 OBJ viewer: camera orbits the user's generated MPFB geometry.
   No external scripts, CDN or cloud uploads. Geometry is preview-only. */
(function () {
  'use strict';
  function norm(v) { const n=Math.hypot(...v)||1;return v.map(x=>x/n); }
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function lookAt(eye,target){
    const z=norm(eye.map((x,i)=>x-target[i]));
    const x=norm(cross([0,0,1],z));const y=cross(z,x);
    return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
  }
  function perspective(aspect){const f=1/Math.tan(.44),near=.04,far=80;return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
  function compile(gl,type,source){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Shader');return s;
  }
  function parseOBJ(text){
    const verts=[],faces=[];let seenFaces=0;
    for(const line of text.split(/\r?\n/)){
      if(line.startsWith('v ')){
        const w=line.trim().split(/\s+/);const vals=[Number(w[1]),Number(w[2]),Number(w[3])];
        if(vals.every(Number.isFinite))verts.push(vals);
      }else if(line.startsWith('f ')){
        const raw=line.trim().split(/\s+/).slice(1),ids=raw.map(v=>Number(v.split('/')[0])).map(n=>n>0?n-1:verts.length+n);
        if(ids.length>=3&&ids.every(v=>Number.isInteger(v)&&v>=0&&v<verts.length)){
          for(let i=1;i<ids.length-1;i++)faces.push([ids[0],ids[i],ids[i+1]]);
        }
        seenFaces++;
      }
      if(verts.length>500000||faces.length>1200000)throw Error('Avatar trop volumineux pour l’aperçu WebGL');
    }
    if(verts.length<100||faces.length<100)throw Error('OBJ sans corps 3D exploitable');
    const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
    for(const v of verts) for(let j=0;j<3;j++){mins[j]=Math.min(mins[j],v[j]);maxs[j]=Math.max(maxs[j],v[j]);}
    let renderFaces=faces;
    if(faces.length>110000){const stride=Math.ceil(faces.length/110000);renderFaces=faces.filter((f,i)=>i%stride===0);}
    // Smooth per-vertex normals, preserving a continuous body appearance.
    const normals=Array.from({length:verts.length},()=>[0,0,0]);
    for(const tri of faces){
      const a=verts[tri[0]],b=verts[tri[1]],c=verts[tri[2]];
      const n=cross(b.map((v,i)=>v-a[i]),c.map((v,i)=>v-a[i]));
      for(const ix of tri){for(let j=0;j<3;j++)normals[ix][j]+=n[j];}
    }
    const packed=new Float32Array(verts.length*6);
    for(let i=0;i<verts.length;i++){
      const n=norm(normals[i]);packed.set([...verts[i],...n],i*6);
    }
    return {packed, indices:new Uint32Array(renderFaces.flat()),mins,maxs,vertexCount:verts.length,faceCount:faces.length};
  }
  // Software fallback for browsers where WebGL2 is disabled.
  // Renders a coarser rotating mesh, so mouse orbit still works offline.
  function canvas2DViewer(canvas){
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Aucun moteur de dessin disponible.');
    let geometry=null,look=[0,0,.9],extent=1.7,yaw=-Math.PI/2,pitch=.10,dist=2.9,held=false,lastX=0,lastY=0,token=0;
    function render(){
      const w=Math.max(10,Math.round(canvas.clientWidth)),h=Math.max(10,Math.round(canvas.clientHeight));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      ctx.fillStyle='#16181e';ctx.fillRect(0,0,w,h);
      if(!geometry)return;
      const eye=[look[0]+dist*Math.cos(pitch)*Math.cos(yaw),look[1]+dist*Math.cos(pitch)*Math.sin(yaw),look[2]+dist*Math.sin(pitch)];
      const v=lookAt(eye,look),f=1/Math.tan(.44),ratio=w/h;
      const positions=geometry.packed,idx=geometry.indices;
      function project(id){
        const i=id*6,px=positions[i],py=positions[i+1],pz=positions[i+2];
        const x=v[0]*px+v[4]*py+v[8]*pz+v[12];
        const y=v[1]*px+v[5]*py+v[9]*pz+v[13];
        const z=v[2]*px+v[6]*py+v[10]*pz+v[14];
        if(z>-.06)return null;
        return [w*.5+(x/-z)*(f/ratio)*w*.5,h*.5-(y/-z)*f*h*.5,z];
      }
      const tris=[],stride=Math.max(1,Math.ceil(idx.length/3/4500));
      for(let i=0;i<idx.length;i+=3*stride){
        const a=project(idx[i]),b=project(idx[i+1]),c=project(idx[i+2]);if(!a||!b||!c)continue;
        const n=idx[i]*6;
        const lum=Math.min(1,Math.max(.3,.50+.42*(positions[n+3]*-.4+positions[n+4]*-.5+positions[n+5]*.8)));
        tris.push({a,b,c,z:(a[2]+b[2]+c[2])/3,fill:Math.round(lum*210)});
      }
      tris.sort((a,b)=>a.z-b.z);
      for(const t of tris){ctx.beginPath();ctx.moveTo(t.a[0],t.a[1]);ctx.lineTo(t.b[0],t.b[1]);ctx.lineTo(t.c[0],t.c[1]);ctx.closePath();ctx.fillStyle=`rgb(${t.fill},${t.fill-3},${t.fill+2})`;ctx.fill();}
    }
    const schedule=()=>requestAnimationFrame(render);
    canvas.addEventListener('pointerdown',e=>{held=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId)});
    canvas.addEventListener('pointermove',e=>{if(!held)return;yaw-=(e.clientX-lastX)*.011;pitch=Math.max(-1.23,Math.min(1.23,pitch+(e.clientY-lastY)*.008));lastX=e.clientX;lastY=e.clientY;schedule()});
    canvas.addEventListener('pointerup',()=>held=false);canvas.addEventListener('pointercancel',()=>held=false);
    canvas.addEventListener('wheel',e=>{e.preventDefault();dist=Math.max(.75*extent,Math.min(5*extent,dist*Math.exp(e.deltaY*.001)));schedule()},{passive:false});
    if(window.ResizeObserver)new ResizeObserver(schedule).observe(canvas);
    function reset(){yaw=-Math.PI/2;pitch=.10;dist=1.55*extent;schedule()}
    return {async load(url){const current=++token;const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('OBJ introuvable');const m=parseOBJ(await response.text());if(token!==current)return null;geometry=m;look=m.mins.map((x,i)=>(x+m.maxs[i])/2);extent=Math.max(.25,Math.max(...m.maxs.map((x,i)=>x-m.mins[i])));reset();return {vertices:m.vertexCount,faces:m.faceCount,height:m.maxs[2]-m.mins[2],software_render:true}},reset,clear(){token++;geometry=null;schedule()}};
  }
  window.GBLAvatarOrbit=function(canvas){
    const gl=canvas.getContext('webgl2',{antialias:true,alpha:false});
    if(!gl)return canvas2DViewer(canvas);
    const vs=compile(gl,gl.VERTEX_SHADER,`#version 300 es
      in vec3 aPos; in vec3 aNormal;
      uniform mat4 uView,uProj;
      out vec3 vNormal;
      void main(){gl_Position=uProj*uView*vec4(aPos,1.0);vNormal=aNormal;}`);
    const fs=compile(gl,gl.FRAGMENT_SHADER,`#version 300 es
      precision mediump float;
      in vec3 vNormal;out vec4 outColor;
      void main(){ vec3 n=normalize(vNormal);
        vec3 key=normalize(vec3(-.6,-.55,.9));
        float diffuse=.39+.61*abs(dot(n,key));
        vec3 skin=vec3(.71,.70,.72);
        outColor=vec4(skin*diffuse,1.0); }`);
    const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader de prévisualisation invalide');
    gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.clearColor(.085,.09,.11,1);
    const posLoc=gl.getAttribLocation(program,'aPos'),norLoc=gl.getAttribLocation(program,'aNormal');
    const viewLoc=gl.getUniformLocation(program,'uView'),projLoc=gl.getUniformLocation(program,'uProj');
    let vbo=null,ibo=null,count=0,look=[0,0,.9],extent=1.7,yaw=-Math.PI/2,pitch=.10,dist=2.85;
    let held=false,lastX=0,lastY=0,token=0;
    function render(){
      if(!count)return;
      const ratio=window.devicePixelRatio||1;
      const w=Math.max(10,Math.round(canvas.clientWidth*ratio)),h=Math.max(10,Math.round(canvas.clientHeight*ratio));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const eye=[look[0]+dist*Math.cos(pitch)*Math.cos(yaw),look[1]+dist*Math.cos(pitch)*Math.sin(yaw),look[2]+dist*Math.sin(pitch)];
      gl.uniformMatrix4fv(viewLoc,false,lookAt(eye,look));gl.uniformMatrix4fv(projLoc,false,perspective(w/h));
      gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);
      gl.vertexAttribPointer(posLoc,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(norLoc,3,gl.FLOAT,false,24,12);gl.enableVertexAttribArray(norLoc);
      gl.drawElements(gl.TRIANGLES,count,gl.UNSIGNED_INT,0);
    }
    const renderSoon=()=>requestAnimationFrame(render);
    canvas.addEventListener('pointerdown',e=>{held=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!held)return;yaw-=(e.clientX-lastX)*.011;pitch=Math.max(-1.23,Math.min(1.23,pitch+(e.clientY-lastY)*.008));lastX=e.clientX;lastY=e.clientY;renderSoon();});
    canvas.addEventListener('pointerup',()=>held=false);canvas.addEventListener('pointercancel',()=>held=false);
    canvas.addEventListener('wheel',e=>{e.preventDefault();dist=Math.max(.75*extent,Math.min(5*extent,dist*Math.exp(e.deltaY*.001)));renderSoon();},{passive:false});
    const ro=window.ResizeObserver?new ResizeObserver(renderSoon):null;if(ro)ro.observe(canvas);
    function reset(){yaw=-Math.PI/2;pitch=.10;dist=1.55*extent;renderSoon();}
    async function load(url){
      const current=++token;
      const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error('Impossible de charger l’OBJ de l’avatar.');
      const parsed=parseOBJ(await response.text());if(token!==current)return null;
      if(vbo)gl.deleteBuffer(vbo);if(ibo)gl.deleteBuffer(ibo);
      vbo=gl.createBuffer();ibo=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,parsed.packed,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,parsed.indices,gl.STATIC_DRAW);
      count=parsed.indices.length;
      look=parsed.mins.map((v,i)=>(v+parsed.maxs[i])/2);
      extent=Math.max(0.25,Math.max(...parsed.maxs.map((v,i)=>v-parsed.mins[i])));
      reset();return {vertices:parsed.vertexCount,faces:parsed.faceCount,height:parsed.maxs[2]-parsed.mins[2]};
    }
    return {load,reset,clear(){token++;count=0;renderSoon();}};
  };
})();
