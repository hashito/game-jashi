const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class TapeEffects {
  constructor(){
    this.canvas=document.createElement('canvas');this.canvas.id='tape-effects';this.canvas.setAttribute('aria-hidden','true');document.body.append(this.canvas);this.ctx=this.canvas.getContext('2d');
    this.grain=document.createElement('canvas');this.grain.width=160;this.grain.height=90;this.gctx=this.grain.getContext('2d');this.pixels=this.gctx.createImageData(160,90);
    this.face=new Image();this.face.src='assets/textures/monster-face-v4.webp';this.pulse=0;this.kind='';this.elapsed=0;this.grainTimer=0;this.tearTimer=0;this.tear=null;this.dead=false;
    this.resize=()=>{this.canvas.width=Math.min(960,innerWidth);this.canvas.height=Math.round(this.canvas.width*innerHeight/innerWidth);};this.resize();addEventListener('resize',this.resize);
  }
  trigger(kind){this.kind=kind;this.pulse=kind==='death'?2.8:kind==='hit'?1.1:kind==='encounter'?1.25:.8;this.elapsed=0;if(kind==='death')this.dead=true;}
  clear(){this.pulse=0;this.dead=false;this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);}
  update({dt=0,time=0,danger=0,source,enabled=true,intensity=.65,reduced=false,playing=true,health=100}){
    const c=this.ctx,w=this.canvas.width,h=this.canvas.height;c.clearRect(0,0,w,h);this.pulse=Math.max(0,this.pulse-dt);this.elapsed+=dt;
    this.canvas.hidden=!playing;if(!playing)return;
    const amount=enabled?clamp(intensity,0,1):0,threat=clamp(danger,0,1);this.grainTimer-=dt;this.tearTimer-=dt;
    if(amount>0){
      if(this.grainTimer<=0){this.grainTimer=.09;const p=this.pixels.data;for(let i=0;i<p.length;i+=4){const n=Math.random()*210;p[i]=n;p[i+1]=n+6;p[i+2]=n+8;p[i+3]=Math.random()*(9+threat*22)*amount;}this.gctx.putImageData(this.pixels,0,0);}
      c.imageSmoothingEnabled=false;c.drawImage(this.grain,0,0,w,h);c.imageSmoothingEnabled=true;
      c.fillStyle=`rgba(0,0,0,${.065*amount})`;for(let y=0;y<h;y+=3)c.fillRect(0,y,w,1);
      // Tracking failures are local displaced bands, never full-screen flashes.
      if(!reduced&&this.tearTimer<=0){this.tearTimer=.25+Math.random()*2/(1+threat*5);if(Math.random()<.2+threat*.8||this.pulse>0)this.tear={y:Math.random()*h,height:3+Math.random()*(10+threat*36),shift:(Math.random()-.5)*(12+threat*80),life:.04+Math.random()*.10};}
      if(this.tear&&source){this.tear.life-=dt;try{const t=this.tear,sy=t.y/h*source.height,sh=t.height/h*source.height;c.globalAlpha=.5+threat*.4;c.drawImage(source,0,sy,source.width,sh,t.shift,t.y,w,t.height);c.globalAlpha=1;c.fillStyle=`rgba(167,197,175,${.12*amount})`;c.fillRect(0,t.y-1,w,1);c.fillStyle='rgba(9,16,13,.32)';c.fillRect(0,t.y+t.height,w,2);}catch{}if(this.tear.life<=0)this.tear=null;}
      if(threat>.45||this.pulse>0){const y=(time*75)%h;c.fillStyle=`rgba(180,202,193,${.035*amount})`;c.fillRect(0,y,w,12);c.fillStyle=`rgba(0,0,0,${.11*amount})`;c.fillRect(0,y+14,w,5);}
      if(!reduced&&threat>.72){c.strokeStyle=`rgba(176,83,62,${(threat-.7)*amount})`;c.lineWidth=2;c.strokeRect(3,1,w-7,h-3);c.strokeStyle=`rgba(76,147,157,${(threat-.7)*amount})`;c.strokeRect(6,1,w-10,h-3);}
    }
    if(this.pulse>0){
      const p=clamp(this.pulse,0,1);c.fillStyle=`rgba(9,13,11,${.35*p})`;c.fillRect(0,0,w,h);
      if((this.kind==='death'||this.kind==='hit')&&this.face.complete&&this.face.naturalWidth){
        const death=this.kind==='death',alpha=death?clamp((this.elapsed-.1)*1.6,0,.92):Math.max(0,.23-this.elapsed)*2;
        if(alpha>0){const size=(death?h*1.2:h*.8)*(1+Math.min(this.elapsed,.8)*.23);c.globalAlpha=alpha;c.drawImage(this.face,(w-size)/2,(h-size)/2,size,size);c.globalAlpha=1;}
      }
      if(!reduced&&amount>0){c.fillStyle=`rgba(7,12,9,${.6*p})`;for(let k=0;k<5;k++){const y=((k*.193+time*1.07)%1)*h;c.fillRect(0,y,w,3+Math.random()*9);}}
    }
    const vignette=c.createRadialGradient(w/2,h*.46,h*.2,w/2,h*.46,h*.85);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,`rgba(${health<45?'42,8,5':'0,3,2'},${.26+threat*.35})`);c.fillStyle=vignette;c.fillRect(0,0,w,h);
    if(this.dead&&this.elapsed>1.9){c.fillStyle=`rgba(0,0,0,${clamp((this.elapsed-1.9)*2,0,1)})`;c.fillRect(0,0,w,h);}
  }
}
