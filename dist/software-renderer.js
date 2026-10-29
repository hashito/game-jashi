import * as THREE from './vendor/three.module.js';

// A small, dependency-free Canvas2D renderer for browsers without WebGL.
// The game keeps its ordinary Three.js world, camera, collision and animation.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const srgb=v=>Math.round(255*(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055));
const colorRGB=c=>c?[srgb(c.r),srgb(c.g),srgb(c.b)]:[255,255,255];
const sameMatrix=(a,b)=>{for(let i=0;i<16;i++)if(a[i]!==b[i])return false;return true;};
const multiplyPoint=(m,x,y,z)=>[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];

export class SoftwareRenderer {
  constructor(){
    this.isSoftware=true;
    this.domElement=document.createElement('canvas');
    this.domElement.style.display='block';
    this.domElement.style.width='100%';
    this.domElement.style.height='100%';
    this.context=this.domElement.getContext('2d',{alpha:false,desynchronized:true});
    if(!this.context)throw new Error('Canvas2D is unavailable');
    this.shadowMap={enabled:false,type:0};
    this.toneMappingExposure=1;
    this.outputColorSpace=THREE.SRGBColorSpace;
    this.toneMapping=0;
    this._geometries=new WeakMap();
    this._objects=new WeakMap();
    this._materials=new WeakMap();
    this._textures=new WeakMap();this._frame=0;
    this._scratchMatrix=new THREE.Matrix4();
    this._combinedMatrix=new THREE.Matrix4();
    this._pixelRatio=1;
    this.info={render:{triangles:0,calls:0},memory:{geometries:0}};
    this.setSize(800,450);
  }
  setPixelRatio(n){this._pixelRatio=Math.min(1,n||1);}
  setSize(w,h){
    // Resolution rather than simulation fidelity is reduced on the CPU path.
    const scale=Math.min(1,640/Math.max(1,w),400/Math.max(1,h));
    this.width=Math.max(1,Math.round(w*scale));
    this.height=Math.max(1,Math.round(h*scale));
    this.domElement.width=this.width;
    this.domElement.height=this.height;
    this.domElement.style.width=`${w}px`;
    this.domElement.style.height=`${h}px`;
  }
  dispose(){this._geometries=new WeakMap();this._objects=new WeakMap();}

  _geometry(geo){
    let cached=this._geometries.get(geo);if(cached)return cached;
    const pos=geo.getAttribute('position');if(!pos)return null;
    geo.computeBoundingSphere();
    const index=geo.index,uv=geo.getAttribute('uv'),colors=geo.getAttribute('color');
    const triangles=[],params=geo.parameters||{};
    const terrain=geo.type==='PlaneGeometry'&&params.widthSegments>24&&params.heightSegments>24;
    if(terrain){
      // Keep the actual heights and vertex colors, but use a coarser terrain grid.
      const sx=params.widthSegments,sy=params.heightSegments,step=4;
      for(let y=0;y<sy;y+=step)for(let x=0;x<sx;x+=step){
        const xx=Math.min(x+step,sx),yy=Math.min(y+step,sy);
        const a=y*(sx+1)+x,b=y*(sx+1)+xx,c=yy*(sx+1)+x,d=yy*(sx+1)+xx;
        triangles.push([a,c,b,0],[c,d,b,0]);
      }
    }else{
      const count=index?index.count:pos.count,groups=geo.groups||[];
      let group=0;
      for(let i=0;i+2<count;i+=3){
        while(group+1<groups.length&&i>=groups[group].start+groups[group].count)group++;
        triangles.push([index?index.getX(i):i,index?index.getX(i+1):i+1,index?index.getX(i+2):i+2,groups[group]?.materialIndex||0]);
      }
    }
    const n=triangles.length,vertices=new Float32Array(n*9),texcoords=new Float32Array(n*6),tints=new Float32Array(n*3),materials=new Uint8Array(n);
    for(let i=0;i<n;i++){
      const t=triangles[i];materials[i]=t[3];let cr=0,cg=0,cb=0;
      for(let j=0;j<3;j++){
        const v=t[j],k=i*9+j*3,q=i*6+j*2;
        vertices[k]=pos.getX(v);vertices[k+1]=pos.getY(v);vertices[k+2]=pos.getZ(v);
        texcoords[q]=uv?.getX(v)||0;texcoords[q+1]=uv?.getY(v)||0;
        cr+=colors?colors.getX(v):1;cg+=colors?colors.getY(v):1;cb+=colors?colors.getZ(v):1;
      }
      tints[i*3]=cr/3;tints[i*3+1]=cg/3;tints[i*3+2]=cb/3;
    }
    cached={vertices,texcoords,tints,materials,count:n,terrain,colors:!!colors,sphere:geo.boundingSphere.clone()};
    this._geometries.set(geo,cached);this.info.memory.geometries++;
    return cached;
  }
  _worldGeometry(geometry,matrix){
    const local=geometry.vertices,world=new Float32Array(local.length),normals=new Float32Array(geometry.count*3),centers=new Float32Array(geometry.count*3);
    for(let i=0;i<local.length;i+=3){
      const x=local[i],y=local[i+1],z=local[i+2];
      world[i]=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12];
      world[i+1]=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13];
      world[i+2]=matrix[2]*x+matrix[6]*y+matrix[10]*z+matrix[14];
    }
    for(let i=0;i<geometry.count;i++){
      const k=i*9,j=i*3,ax=world[k+3]-world[k],ay=world[k+4]-world[k+1],az=world[k+5]-world[k+2],bx=world[k+6]-world[k],by=world[k+7]-world[k+1],bz=world[k+8]-world[k+2];
      let nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx;const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
      normals[j]=nx;normals[j+1]=ny;normals[j+2]=nz;
      centers[j]=(world[k]+world[k+3]+world[k+6])/3;
      centers[j+1]=(world[k+1]+world[k+4]+world[k+7])/3;
      centers[j+2]=(world[k+2]+world[k+5]+world[k+8])/3;
    }
    return {world,normals,centers};
  }
  _material(material){
    let data=this._materials.get(material);
    const key=material.color?.getHex()||0xffffff;
    if(!data||data.key!==key){data={key,rgb:colorRGB(material.color)};this._materials.set(material,data);}
    return data;
  }
  _makeEntry(object,geometry,matrix,color=null){
    const m=matrix.elements?matrix.elements:matrix,s=geometry.sphere;
    const center=multiplyPoint(m,s.center.x,s.center.y,s.center.z);
    const scale=Math.max(Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10]));
    return {object,geometry,matrix:Float64Array.from(m),center,radius:s.radius*scale,color,world:null};
  }
  _meshEntries(object){
    const geometry=this._geometry(object.geometry);if(!geometry)return [];
    let data=this._objects.get(object);
    if(object.isInstancedMesh){
      if(!data||data.count!==object.count||data.instanceVersion!==object.instanceMatrix.version||!sameMatrix(data.matrix,object.matrixWorld.elements)){
        const entries=[];
        for(let i=0;i<object.count;i++){
          object.getMatrixAt(i,this._scratchMatrix);
          this._combinedMatrix.multiplyMatrices(object.matrixWorld,this._scratchMatrix);
          const c=object.instanceColor?new THREE.Color().fromArray(object.instanceColor.array,i*3):null;
          const entry=this._makeEntry(object,geometry,this._combinedMatrix,c?colorRGB(c):null);entry.instance=i;entries.push(entry);
        }
        data={count:object.count,instanceVersion:object.instanceMatrix.version,matrix:Float64Array.from(object.matrixWorld.elements),entries};this._objects.set(object,data);
      }
      return data.entries;
    }
    if(!data||!sameMatrix(data.matrix,object.matrixWorld.elements)){
      data=this._makeEntry(object,geometry,object.matrixWorld);this._objects.set(object,data);
    }
    return [data];
  }

  _textureData(texture){
    const source=texture?.image;if(!source||!(source.width||source.videoWidth))return null;
    let cached=this._textures.get(texture);if(cached?.source===source)return cached;
    const repeating=texture.wrapS===THREE.RepeatWrapping||texture.wrapT===THREE.RepeatWrapping,max=repeating?96:texture.userData.cutout?192:256,sw=source.width||source.videoWidth,sh=source.height||source.videoHeight,scale=Math.min(1,max/Math.max(sw,sh));
    let image=source,average=null,pixels=null;
    try{const small=document.createElement('canvas');small.width=Math.max(1,Math.round(sw*scale));small.height=Math.max(1,Math.round(sh*scale));const c=small.getContext('2d');c.drawImage(source,0,0,small.width,small.height);const data=c.getImageData(0,0,small.width,small.height).data;let r=0,g=0,b=0,n=0;for(let i=0;i<data.length;i+=64){const alpha=data[i+3]/255;r+=data[i]*alpha;g+=data[i+1]*alpha;b+=data[i+2]*alpha;n+=alpha;}average=n?[r/n,g/n,b/n]:null;image=small;pixels=data;}catch{}
    cached={source,image,average,pixels,variants:new Map(),pattern:null,patternContext:null,frame:-1};this._textures.set(texture,cached);return cached;
  }
  _cutoutTexture(texture,tint,shade,fog,fogColor,alphaTest){
    const data=this._textureData(texture);if(!data)return null;if(!data.pixels)return data.image;
    // Fog and light are applied to occupied texels before the projection. Filling
    // a translucent triangle afterwards would turn every gap into a solid card.
    const light=Math.round(clamp(shade,.2,2.4)*5)/5,haze=Math.round(clamp(fog,0,1)*8)/8;
    const key=`${light}/${haze}/${tint.join(',')}/${fogColor.join(',')}/${alphaTest}`;
    if(data.variants.has(key))return data.variants.get(key);
    const image=document.createElement('canvas');image.width=data.image.width;image.height=data.image.height;
    const context=image.getContext('2d'),out=context.createImageData(image.width,image.height),src=data.pixels,dst=out.data,limit=alphaTest*255;
    for(let i=0;i<src.length;i+=4){if(src[i+3]<limit)continue;for(let channel=0;channel<3;channel++)dst[i+channel]=clamp(src[i+channel]*tint[channel]/255*light*(1-haze)+fogColor[channel]*haze,0,255);dst[i+3]=src[i+3];}
    context.putImageData(out,0,0);data.variants.set(key,image);if(data.variants.size>128)data.variants.delete(data.variants.keys().next().value);return image;
  }
  _texture(ctx,texture,points,overrideImage=null){
    // CanvasPattern repeats the real bitmap in UV space, including negative UVs.
    // It avoids allocating a giant tiled canvas for the forest floor every frame.
    const cached=this._textureData(texture);if(!cached)return;const image=overrideImage||cached.image,iw=image.width||image.videoWidth,ih=image.height||image.videoHeight;
    if(!overrideImage&&cached.patternContext!==ctx){const sx=texture.wrapS===THREE.RepeatWrapping,sy=texture.wrapT===THREE.RepeatWrapping;try{if(sx||sy)cached.pattern=ctx.createPattern(image,sx&&sy?'repeat':sx?'repeat-x':'repeat-y');}catch{}cached.patternContext=ctx;}
    if(cached.frame!==this._frame){if(texture.matrixAutoUpdate)texture.updateMatrix();cached.frame=this._frame;}
    const m=texture.matrix.elements,uv=p=>{const u=m[0]*p.u+m[3]*p.v+m[6],v=m[1]*p.u+m[4]*p.v+m[7];return [u*iw,(texture.flipY?1-v:v)*ih];};
    const a=points[0];
    for(let i=1;i+1<points.length;i++){
      const b=points[i],c=points[i+1],[u0,v0]=uv(a),[u1,v1]=uv(b),[u2,v2]=uv(c);
      const det=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);if(Math.abs(det)<1e-5)continue;
      const ax=(a.x*(v1-v2)+b.x*(v2-v0)+c.x*(v0-v1))/det;
      const bx=(a.x*(u2-u1)+b.x*(u0-u2)+c.x*(u1-u0))/det;
      const cx=(a.x*(u1*v2-u2*v1)+b.x*(u2*v0-u0*v2)+c.x*(u0*v1-u1*v0))/det;
      const ay=(a.y*(v1-v2)+b.y*(v2-v0)+c.y*(v0-v1))/det;
      const by=(a.y*(u2-u1)+b.y*(u0-u2)+c.y*(u1-u0))/det;
      const cy=(a.y*(u1*v2-u2*v1)+b.y*(u2*v0-u0*v2)+c.y*(u0*v1-u1*v0))/det;
      ctx.save();ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.clip();ctx.setTransform(ax,ay,bx,by,cx,cy);
      if(!overrideImage&&cached.pattern){ctx.fillStyle=cached.pattern;const x=Math.min(u0,u1,u2),y=Math.min(v0,v1,v2);ctx.fillRect(x,y,Math.max(u0,u1,u2)-x,Math.max(v0,v1,v2)-y);}else ctx.drawImage(image,0,0);
      ctx.restore();
    }
  }

  render(scene,camera){
    const started=performance.now();
    this._frame++;
    scene.updateMatrixWorld();camera.updateMatrixWorld();
    const ctx=this.context,w=this.width,h=this.height;
    const fogColor=colorRGB(scene.fog?.color||scene.background),density=scene.fog?.density||.027;
    ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;
    const gradient=ctx.createLinearGradient(0,0,0,h);gradient.addColorStop(0,`rgb(${fogColor.map(v=>Math.round(v*.62)).join(',')})`);gradient.addColorStop(.65,`rgb(${fogColor.join(',')})`);gradient.addColorStop(1,'#3c4536');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    const vm=camera.matrixWorldInverse.elements,cm=camera.matrixWorld.elements;
    const cameraX=cm[12],cameraY=cm[13],cameraZ=cm[14],near=Math.max(.12,camera.near||.08),far=camera.fov<25?75:52;
    const fy=h/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)),fx=fy,halfW=w/2,halfH=h/2;
    const tanY=h/(2*fy),tanX=w/(2*fx),exposure=clamp(this.toneMappingExposure||1,.45,2.7);
    // Telescope magnification keeps distant face detail in view on the CPU path.
    const detailScale=clamp(Math.tan(THREE.MathUtils.degToRad(68)/2)/Math.tan(THREE.MathUtils.degToRad(camera.fov)/2),1,6.5);
    const lightList=[];let flashlight=false;
    const meshList=[];
    function collect(o){if(!o.visible)return;if(o.isMesh)meshList.push(o);if(o.isPointLight&&o.intensity>1)lightList.push(o);if(o.isSpotLight&&o.intensity>0)flashlight=true;for(const c of o.children)collect(c);}
    collect(scene);
    const lights=lightList.map(l=>({x:l.matrixWorld.elements[12],y:l.matrixWorld.elements[13],z:l.matrixWorld.elements[14],power:Math.min(l.intensity,15),distance:l.distance||8}));
    const skyline=[],ground=[],faces=[];
    for(const object of meshList){
      const entries=this._meshEntries(object),instanced=object.isInstancedMesh,params=object.geometry.parameters||{};
      // Mountains are a backdrop at 78–96 m. The ordinary 52 m detail budget
      // must never cut individual faces out of their continuous silhouette.
      const drawFar=object.userData.skyline?Math.max(far,camera.far||155):far;
      for(const entry of entries){
        const [cx,cy,cz]=entry.center,rad=entry.radius,dx=cx-cameraX,dz=cz-cameraZ,distXZ=Math.hypot(dx,dz);
        // Tiny litter and grass never consume the distant woodland budget.
        if(instanced&&object.userData.smallDetail&&(distXZ>8||entry.instance%4))continue;
        if(instanced&&object.userData.trunks&&((distXZ>32&&entry.instance%3!==0)||(distXZ>20&&entry.instance%2!==0)))continue;
        if(instanced&&object.userData.branches&&distXZ>20)continue;
        if(instanced&&object.userData.foliage&&(distXZ>44||(distXZ>29&&entry.instance%6!==0)||(distXZ>15&&entry.instance%3!==0)))continue;
        if(!entry.geometry.terrain&&distXZ>drawFar+rad)continue;
        const vx=vm[0]*cx+vm[4]*cy+vm[8]*cz+vm[12],vy=vm[1]*cx+vm[5]*cy+vm[9]*cz+vm[13],vz=-(vm[2]*cx+vm[6]*cy+vm[10]*cz+vm[14]);
        if(!entry.geometry.terrain&&(vz+rad<near||vz-rad>drawFar||Math.abs(vx)>Math.max(near,vz)*tanX+rad*1.8||Math.abs(vy)>Math.max(near,vz)*tanY+rad*1.8))continue;
        if(!entry.geometry.terrain&&rad*fy/Math.max(near,vz)<.65)continue;
        if(!entry.world)entry.world=this._worldGeometry(entry.geometry,entry.matrix);
        const {geometry}=entry,{world,normals,centers}=entry.world;
        const isPath=!!object.userData.path;
        const isGround=geometry.terrain||object.userData.ground||isPath;
        for(let t=0;t<geometry.count;t++){
          const n=t*3,k=t*9,q=t*6,tx=centers[n],ty=centers[n+1],tz=centers[n+2];
          const depth=-(vm[2]*tx+vm[6]*ty+vm[10]*tz+vm[14]);
          if(depth>drawFar||depth<-rad)continue;
          if(geometry.terrain&&Math.hypot(tx-cameraX,tz-cameraZ)>far)continue;
          const material=Array.isArray(object.material)?object.material[geometry.materials[t]]:object.material;
          if(!material||!material.visible||material.opacity===0)continue;
          const dot=normals[n]*(cameraX-tx)+normals[n+1]*(cameraY-ty)+normals[n+2]*(cameraZ-tz);
          if(!isGround&&material.side!==THREE.DoubleSide&&((material.side===THREE.BackSide)?dot>=0:dot<=0))continue;
          let vertices=[];let allBehind=true;
          for(let v=0;v<3;v++){
            const j=k+v*3,x=world[j],y=world[j+1],z=world[j+2],d=-(vm[2]*x+vm[6]*y+vm[10]*z+vm[14]);
            if(d>=near)allBehind=false;
            vertices.push({x:vm[0]*x+vm[4]*y+vm[8]*z+vm[12],y:vm[1]*x+vm[5]*y+vm[9]*z+vm[13],z:d,u:geometry.texcoords[q+v*2],v:geometry.texcoords[q+v*2+1]});
          }
          if(allBehind)continue;
          // Clip triangles to the near plane, retaining UVs for mapped signs.
          if(vertices.some(v=>v.z<near)){
            const clipped=[];
            for(let i=0;i<vertices.length;i++){
              const a=vertices[i],b=vertices[(i+1)%vertices.length],insideA=a.z>=near,insideB=b.z>=near;
              if(insideA)clipped.push(a);
              if(insideA!==insideB){const s=(near-a.z)/(b.z-a.z);clipped.push({x:a.x+(b.x-a.x)*s,y:a.y+(b.y-a.y)*s,z:near,u:a.u+(b.u-a.u)*s,v:a.v+(b.v-a.v)*s});}
            }
            vertices=clipped;
          }
          if(vertices.length<3)continue;
          let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
          for(const v of vertices){v.x=halfW+v.x*fx/v.z;v.y=halfH-v.y*fy/v.z;minX=Math.min(minX,v.x);maxX=Math.max(maxX,v.x);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}
          if(maxX<0||minX>w||maxY<0||minY>h)continue;
          const area=(maxX-minX)*(maxY-minY);if(area<.7)continue;
          const cutout=!!material.map&&(material.alphaTest>0||material.map.userData.cutout);
          const originalBase=entry.color||this._material(material).rgb,textureData=this._textureData(material.map),base=textureData?.average?originalBase.map((v,i)=>v*textureData.average[i]/255):originalBase;
          if(cutout&&(!textureData||area<3))continue;
          let shade=material.isMeshBasicMaterial?1:.65+.31*Math.max(0,-normals[n]*.43+normals[n+1]*.78-normals[n+2]*.45);
          const dd=Math.hypot(tx-cameraX,ty-cameraY,tz-cameraZ);
          if(flashlight&&depth>0&&dd<25){const xx=(minX+maxX)/2/w-.5,yy=(minY+maxY)/2/h-.5;shade+=Math.max(0,1-Math.hypot(xx,yy)*2.3)*Math.max(0,1-dd/25)*.8;}
          let warm=0;for(const l of lights){const d=Math.hypot(tx-l.x,ty-l.y,tz-l.z);if(d<l.distance)warm+=Math.pow(1-d/l.distance,2)*.28;}
          shade=(shade+warm)*exposure;
          const fog=1-Math.exp(-density*density*Math.max(0,depth)*Math.max(0,depth));
          const lit=base.map((v,i)=>{
            let value=v;
            if(geometry.colors&&material.vertexColors)value*=srgb(geometry.tints[n+i])/255;
            value*=shade;if(warm&&i===0)value+=warm*25;
            return value;
          });
          // Compress brightness with one factor for all three channels. Applying
          // the shoulder independently erased warm skin/hair color under a torch.
          // Warm illumination is included before this factor, so it keeps its hue.
          const peak=Math.max(...lit),highlightScale=!material.isMeshBasicMaterial&&peak>190?(190+(peak-190)/(1+(peak-190)/65))/peak:1;
          const rgb=lit.map((value,i)=>Math.round(clamp(value*highlightScale*(1-fog)+fogColor[i]*fog,0,255)));
          const textureDistance=material.map?.wrapS===THREE.RepeatWrapping?(geometry.terrain?19:instanced?13:19):28;
          const texture=textureData&&(cutout||depth<textureDistance*detailScale&&area>15)?material.map:null;
          const textureShade=shade*(originalBase[0]+originalBase[1]+originalBase[2])/765;
          // Expand shared edges by a fraction of a pixel to seal antialias gaps.
          const mx=vertices.reduce((s,p)=>s+p.x,0)/vertices.length,my=vertices.reduce((s,p)=>s+p.y,0)/vertices.length;
          for(const p of vertices){const d=Math.hypot(p.x-mx,p.y-my)||1,expand=cutout?.12:.55;p.x+=(p.x-mx)/d*expand;p.y+=(p.y-my)/d*expand;}
          (object.userData.skyline?skyline:isGround?ground:faces).push({vertices,depth:depth+(isPath?-.1:0),layer:geometry.terrain?0:1,rgb,opacity:material.opacity??1,texture,fog,shade:textureShade,area,cutout,tint:originalBase,light:shade,alphaTest:material.alphaTest||0});
        }
      }
    }
    skyline.sort((a,b)=>b.depth-a.depth);ground.sort((a,b)=>a.layer-b.layer||b.depth-a.depth);faces.sort((a,b)=>b.depth-a.depth);
    const ordered=skyline.concat(ground,faces);
    this.info.render.triangles=ordered.length;this.info.render.groundTriangles=ground.length;this.info.render.calls=meshList.length;
    for(const face of ordered){
      if(face.cutout){ctx.globalAlpha=face.opacity;const bitmap=this._cutoutTexture(face.texture,face.tint,face.light,face.fog,fogColor,face.alphaTest);if(bitmap)this._texture(ctx,face.texture,face.vertices,bitmap);continue;}
      const p=face.vertices;ctx.globalAlpha=face.opacity;ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);ctx.closePath();ctx.fillStyle=`rgb(${face.rgb.join(',')})`;ctx.fill();
      if(face.texture){
        this._texture(ctx,face.texture,p);
        if(face.shade<.98){ctx.globalAlpha=face.opacity*clamp(1-face.shade,0,.7);ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);ctx.closePath();ctx.fillStyle='#000';ctx.fill();}
        else if(face.shade>1.06){ctx.globalAlpha=face.opacity*clamp((face.shade-1)*.18,0,.18);ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);ctx.closePath();ctx.fillStyle='#fff1c6';ctx.fill();}
        if(face.fog>.03){ctx.globalAlpha=face.opacity*face.fog;ctx.beginPath();ctx.moveTo(p[0].x,p[0].y);for(let i=1;i<p.length;i++)ctx.lineTo(p[i].x,p[i].y);ctx.closePath();ctx.fillStyle=`rgb(${fogColor.join(',')})`;ctx.fill();}
      }
    }
    ctx.globalAlpha=1;
    // A quiet vignette keeps the software scene close to the WebGL atmosphere.
    const vignette=ctx.createRadialGradient(halfW,halfH,h*.2,halfW,halfH,Math.max(w,h)*.64);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.31)');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
    this.info.render.frameMs=Math.round((performance.now()-started)*10)/10;
    if(this.domElement.dataset&&this._frame%15===1){this.domElement.dataset.renderTriangles=String(this.info.render.triangles);this.domElement.dataset.renderCalls=String(meshList.length);this.domElement.dataset.frameMs=String(this.info.render.frameMs);this.domElement.dataset.textureFaces=String(ordered.filter(f=>f.texture).length);this.domElement.dataset.cutoutFaces=String(ordered.filter(f=>f.cutout).length);}
  }
}
