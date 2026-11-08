import * as THREE from 'three';
import sandboxData from '../../assets/models/unread-city-tokyo-sandbox-data.json';
import { circleSandboxOverlay } from './circle-sandbox-pack';
import { tokyoCityBounds, tokyoDistricts, type TokyoScope } from './tokyo-sandbox-map';
import { resolveTokyoAtmosphere, type TokyoAtmosphereMode, type ResolvedAtmospherePreset } from './tokyo-sandbox-vfx';
import { nativeTokyoCanvasResolution } from './tokyo-sandbox-resolution';

/** A software perspective renderer for the authored city, sharing the normal map camera.
 * Scenic geometry is never written back to the simulation or saved coordinates.
 */
export interface TokyoCanvasFrame {
  width: number; height: number; mode: TokyoAtmosphereMode; clockMinutes: number;
  scope: TokyoScope; selectedDistrict?: string; time?: number; reducedMotion?: boolean;
}
export interface TokyoCanvasRenderer {
  render(camera: THREE.PerspectiveCamera, frame: TokyoCanvasFrame): void;
  triggerFlares(): void;
  dispose(): void;
}
type Point = [number, number, number];
type Projected = { x: number; y: number; z: number };
type Palette = { sky: string; halo: string; ground: string; tile: string; road: string; walk: string; wall: string; roof: string; tree: string; water: string; gold: string; window: string; night: boolean };
const palettes: Record<ResolvedAtmospherePreset, Palette> = {
  day: { sky:'#101e2d',halo:'#6a9293',ground:'#4a6466',tile:'#688478',road:'#34464d',walk:'#94a391',wall:'#93b2b4',roof:'#d4d5bc',tree:'#427b65',water:'#3e939e',gold:'#e7c68a',window:'#b9e5e6',night:false },
  dusk: { sky:'#111a2a',halo:'#8a5654',ground:'#3e514e',tile:'#626c59',road:'#293943',walk:'#827c63',wall:'#738e99',roof:'#c4b69a',tree:'#3d705d',water:'#3b8393',gold:'#f2c278',window:'#ffe0a3',night:true },
  night: { sky:'#070f1d',halo:'#254968',ground:'#1d3a42',tile:'#2b504c',road:'#122a38',walk:'#4b6261',wall:'#426579',roof:'#7a969d',tree:'#235b4d',water:'#1f697e',gold:'#e5bd78',window:'#ffd596',night:true },
  cyber: { sky:'#0d1022',halo:'#543965',ground:'#263d4b',tile:'#344c51',road:'#17243a',walk:'#4f6476',wall:'#506983',roof:'#91a2b5',tree:'#2d5965',water:'#2c8b9d',gold:'#e7b8d7',window:'#91e9f0',night:true },
};
const buildings = [...sandboxData.buildings, ...circleSandboxOverlay.buildings];
const roads = [...sandboxData.roads, ...circleSandboxOverlay.roads];
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const mod = (n: number, period: number) => ((n % period) + period) % period;
const random = (seed: number) => { const v = Math.sin(seed * 127.1 + 19.3) * 43758.5453; return v - Math.floor(v); };
function shade(hex: string, multiplier: number) {
  const n = parseInt(hex.slice(1),16);
  const rgb=hex.startsWith('#')?[n>>16,(n>>8)&255,n&255]:(hex.match(/[\d.]+/g)??['0','0','0']).slice(0,3).map(Number);
  return `rgb(${rgb.map(channel=>clamp(Math.round(channel*multiplier),0,255)).join(',')})`;
}
function rectangle(x: number, y: number, z: number, w: number, d: number, rotation = 0): Point[] {
  const c = Math.cos(rotation), s = Math.sin(rotation);
  return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b]) => [x+a*c+b*s,y,z-a*s+b*c]);
}
function mix(a: Point,b: Point,t: number): Point { return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; }

export function createTokyoCanvasRenderer(canvas: HTMLCanvasElement): TokyoCanvasRenderer {
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Canvas map rendering unavailable');
  const cached = canvas.ownerDocument.createElement('canvas');
  const cacheContext = cached.getContext('2d');
  if (!cacheContext) throw new Error('Canvas map backing surface unavailable');
  let disposed = false, lastKey = '', flareStarted = -1;
  let width=1,height=1,dpr=1,ctx=context,camera:THREE.PerspectiveCamera,pal=palettes.dusk;
  const vector = new THREE.Vector3();
  const project = (p: Point): Projected => {
    vector.set(...p).project(camera);
    return {x:(vector.x+1)*width/2,y:(1-vector.y)*height/2,z:vector.z};
  };
  function path(points: Projected[], close = true) {
    ctx.beginPath(); points.forEach((p,i) => i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y)); if(close)ctx.closePath();
  }
  function polygon(vertices: Point[], fill: string, stroke?: string, lineWidth=.6, alpha=1) {
    const ps = vertices.map(project);
    if(ps.some(p=>!Number.isFinite(p.x+p.y+p.z)||p.z<=-1||p.z>=1))return;
    if(ps.every(p=>p.x<0)||ps.every(p=>p.x>width)||ps.every(p=>p.y<0)||ps.every(p=>p.y>height))return;
    ctx.globalAlpha=alpha;path(ps);ctx.fillStyle=fill;ctx.fill();
    if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}ctx.globalAlpha=1;
  }
  function line(vertices: Point[], color: string, weight=1, alpha=1) {
    const ps=vertices.map(project); if(ps.some(p=>!Number.isFinite(p.x+p.y+p.z)||p.z<=-1||p.z>=1))return;
    ctx.globalAlpha=alpha;path(ps,false);ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.stroke();ctx.globalAlpha=1;
  }
  function point(p:Point,radius:number,color:string,glow=0) {
    const v=project(p);if(v.z<=-1||v.z>=1||v.x<0||v.x>width||v.y<0||v.y>height)return;
    const r=Math.max(.2,radius);
    if(glow>0){const g=ctx.createRadialGradient(v.x,v.y,0,v.x,v.y,r*glow);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.beginPath();ctx.arc(v.x,v.y,r*glow,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(v.x,v.y,r,0,Math.PI*2);ctx.fill();
  }
  function sky() {
    ctx.clearRect(0,0,width,height);
    const bg=ctx.createLinearGradient(0,0,width,height);bg.addColorStop(0,pal.sky);bg.addColorStop(.65,shade(pal.sky,1.5));bg.addColorStop(1,pal.sky);ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    const halo=ctx.createRadialGradient(width*.3,height*.15,0,width*.3,height*.15,Math.max(width,height)*.75);halo.addColorStop(0,pal.halo+'72');halo.addColorStop(1,pal.halo+'00');ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#d8d9b6';
    for(let i=0;i<90;i++){ctx.globalAlpha=(pal.night?.12:.055)+random(i+13)*.15;const x=random(i+80)*width,y=random(i+290)*height;ctx.fillRect(x,y,i%7===0?1.7:.8,i%7===0?1.7:.8);}ctx.globalAlpha=1;
    // A quiet drafting grid lives outside the model, never in the saved world.
    ctx.strokeStyle='#cdb981';ctx.globalAlpha=.045;ctx.lineWidth=.7;
    for(let x=-height;x<width+height;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+height*.6,height);ctx.stroke();}
    ctx.globalAlpha=1;
  }
  type Face = { vertices:Point[]; fill:string; stroke?:string; alpha?:number; windows?:{levels:number;columns:number;seed:number}; depth?:number };
  function box(faces:Face[],x:number,y:number,z:number,w:number,h:number,d:number,color:string,windows=false,seed=0) {
    const base=rectangle(x,y,z,w,d),top=base.map(p=>[p[0],p[1]+h,p[2]] as Point);
    const normals=[[0,0,-1],[1,0,0],[0,0,1],[-1,0,0]];
    for(let i=0;i<4;i++){
      const normal=normals[i];const a=base[i],b=base[(i+1)%4];
      if((camera.position.x-x)*normal[0]+(camera.position.z-z)*normal[2]<=0)continue;
      faces.push({vertices:[a,b,top[(i+1)%4],top[i]],fill:shade(color,[.72,.9,1.08,.82][i]),stroke:pal.night?'#a6c4ce25':'#ebedce30',windows:windows?{levels:clamp(Math.floor(h/3.1),1,12),columns:clamp(Math.floor((i%2?d:w)/3.2),1,14),seed:seed+i*17}:undefined});
    }
    faces.push({vertices:top,fill:shade(pal.roof,.84+random(seed)*.2),stroke:pal.gold+'70'});
  }
  function mountain(faces:Face[],x:number,z:number,radius:number,h:number,seed:number) {
    const count=9,base:Point[]=[],mid:Point[]=[];
    for(let i=0;i<count;i++){const a=i/count*Math.PI*2,r=radius*(.8+random(i+seed)*.2);base.push([x+Math.cos(a)*r,.25,z+Math.sin(a)*r]);mid.push([x+Math.cos(a)*r*.46,h*.5+random(i+seed+44)*h*.12,z+Math.sin(a)*r*.46]);}
    const top:Point=[x+radius*.06,h,z-radius*.08];
    for(let i=0;i<count;i++){const next=(i+1)%count;faces.push({vertices:[base[i],base[next],mid[next],mid[i]],fill:shade(pal.tree,.6+random(seed+i)*.5)});faces.push({vertices:[mid[i],mid[next],top],fill:shade(pal.tree,.8+random(seed+i+38)*.8),stroke:pal.gold+'18'});}
  }
  function drawWindows(face:Face) {
    if(!face.windows)return;
    const {levels,columns,seed}=face.windows,vs=face.vertices;
    // Perspective quadrilaterals keep window grids attached to their buildings.
    for(let row=0;row<levels;row++)for(let col=0;col<columns;col++){
      const x0=(col+.23)/columns,x1=(col+.74)/columns,y0=(row+.25)/levels,y1=(row+.7)/levels;
      const left0=mix(vs[0],vs[3],y0),right0=mix(vs[1],vs[2],y0),left1=mix(vs[0],vs[3],y1),right1=mix(vs[1],vs[2],y1);
      const lit=pal.night&&random(seed+row*51+col*13)>.34;
      polygon([mix(left0,right0,x0),mix(left0,right0,x1),mix(left1,right1,x1),mix(left1,right1,x0)],lit?pal.window:'#243e53',undefined,.5,lit?.85:.55);
    }
  }
  function staticCity(frame:TokyoCanvasFrame) {
    sky();
    const b=tokyoCityBounds,minX=b.minX-12,maxX=b.maxX+12,minZ=b.minZ-12,maxZ=b.maxZ+12;
    const bevel=15;
    const perimeter:Point[]=[[minX+bevel,0,minZ],[maxX-bevel,0,minZ],[maxX,0,minZ+bevel],[maxX,0,maxZ-bevel],[maxX-bevel,0,maxZ],[minX+bevel,0,maxZ],[minX,0,maxZ-bevel],[minX,0,minZ+bevel]];
    const shadow=perimeter.map(p=>[p[0]+9,-27,p[2]+11] as Point);polygon(shadow,'#02060e',undefined,1,.5);
    for(let i=0;i<perimeter.length;i++){
      const a=perimeter[i],c=perimeter[(i+1)%perimeter.length];
      polygon([[a[0],-22,a[2]],[c[0],-22,c[2]],c,a],i<4?'#1b313a':'#112632','#b6a16d40',.7);
      line([[a[0],-14,a[2]],[c[0],-14,c[2]]],pal.gold,1,.3);
      line([[a[0],-20,a[2]],[c[0],-20,c[2]]],pal.gold,.6,.2);
    }
    polygon(perimeter,pal.ground,pal.gold,1.4);
    for(const district of tokyoDistricts){
      const selected=frame.scope===district.id||frame.selectedDistrict===district.id;
      polygon(rectangle((district.minX+district.maxX)/2,.12,(district.minZ+district.maxZ)/2,district.maxX-district.minX-3,district.maxZ-district.minZ-3),shade(pal.tile,district.id==='takao-mountain'?.76:1),selected?pal.gold:pal.gold+'42',selected?1.35:.5,.96);
    }
    // River and banks sit inside the authored riverside district.
    const river:Point[]=[];
    for(let i=0;i<=30;i++){const z=-207+i*8,x=167+Math.sin(i*.23)*7;river.push([x,.22,z]);}
    for(let i=0;i<river.length-1;i++){const a=river[i],c=river[i+1];polygon([[a[0]-10,.22,a[2]],[c[0]-10,.22,c[2]],[c[0]+10,.22,c[2]],[a[0]+10,.22,a[2]]],pal.water);}
    line(river.map(p=>[p[0]-10,.3,p[2]]),pal.gold,1,.5);line(river.map(p=>[p[0]+10,.3,p[2]]),'#a5dce6',.8,.4);
    for(const road of roads){
      polygon(rectangle(road.x,.35,road.z,road.width,road.depth,road.rotationY??0),road.kind==='road'?pal.road:pal.walk,undefined,.5,road.kind==='road'?1:.75);
      if(road.kind!=='road')continue;
      const horizontal=road.width>road.depth,len=horizontal?road.width:road.depth;
      for(let j=-len/2+6;j<len/2-4;j+=11){
        const angle=road.rotationY??0,offsetX=horizontal?j:0,offsetZ=horizontal?0:j;
        const stripe=rectangle(road.x+offsetX*Math.cos(angle)+offsetZ*Math.sin(angle),.41,road.z-offsetX*Math.sin(angle)+offsetZ*Math.cos(angle),horizontal?5:.45,horizontal?.45:5,angle);
        polygon(stripe,pal.gold,undefined,.5,.65);
      }
    }
    // Court and athletic field are display details, not additional destinations.
    polygon(rectangle(46,.5,-35,33,48),'#3b7765','#c4d7bb',.6);
    for(const ratio of [-.5,0,.5])line([[31,.55,-35+ratio*42],[61,.55,-35+ratio*42]],'#d7dfc2',.7,.8);
    line([[46,.55,-57],[46,.55,-13]],'#d7dfc2',.6,.8);
    for(const building of buildings){
      const x=building.x,z=building.z,w=building.width,d=building.depth,h=building.height;
      polygon([[x-w/2,.46,z-d/2],[x+w/2,.46,z-d/2],[x+w/2+h*.75,.46,z+d/2+h*.35],[x-w/2+h*.75,.46,z+d/2+h*.35]],'#020c1a',undefined,1,pal.night?.22:.3);
    }
    const faces:Face[]=[];
    mountain(faces,4,-188,51,68,82);mountain(faces,-41,-182,39,49,20);mountain(faces,48,-188,33,42,57);
    buildings.forEach((building,i)=>{
      const x=building.x,z=building.z,h=building.height,w=building.width,d=building.depth;
      // Respect authored envelopes; roof details are ornamental only.
      box(faces,x,.6,z,w,h,d,shade(pal.wall,.8+random(i+3)*.4),true,i*23);
      const roof='roofType' in building?building.roofType:'flat';
      if(roof==='pitched'||roof==='japanese'||roof==='mansion'){
        const points=rectangle(x,h+.65,z,w+1,d+1),peak1:Point=[x-w/2,h+3.6,z],peak2:Point=[x+w/2,h+3.6,z];
        faces.push({vertices:[points[0],points[1],peak2,peak1],fill:shade(pal.roof,.6),stroke:pal.gold+'80'});
        faces.push({vertices:[points[3],peak1,peak2,points[2]],fill:shade(pal.roof,.86),stroke:pal.gold+'80'});
      } else box(faces,x,h+.65,z,w*.64,.8,d*.64,pal.roof,false,i);
      if(roof==='clock')box(faces,x,h+.6,z,4,7.5,4,pal.roof,true,91);
      if(roof==='helipad')box(faces,x,h+1.5,z,2.2,9,2.2,pal.roof,false,51);
    });
    // Stable planted avenues fill the spaces between the authored blocks.
    const treePositions:Point[]=[];
    for(let z=-196;z<177;z+=16)for(const x of [-65,65,103,181])treePositions.push([x,0,z]);
    for(let x=-176;x<181;x+=16)for(const z of [65,102,-60])treePositions.push([x,0,z]);
    for(let i=0;i<treePositions.length;i++){
      const [x,,z]=treePositions[i];
      if(buildings.some(v=>Math.abs(v.x-x)<v.width/2+3&&Math.abs(v.z-z)<v.depth/2+3))continue;
      const h=3.7+random(i+100)*3.2;box(faces,x,.5,z,1.1,h*.55,1.1,'#725e47');
      const crown:Point=[x,h+2,z],ring=rectangle(x,h*.5,z,5.4,5.4,Math.PI/4);
      for(let j=0;j<4;j++)faces.push({vertices:[ring[j],ring[(j+1)%4],crown],fill:shade(pal.tree,.74+random(i+j)*.6)});
    }
    for(const face of faces){face.depth=face.vertices.reduce((sum,p)=>sum+project(p).z,0)/face.vertices.length;}
    faces.sort((a,b)=>b.depth!-a.depth!);
    for(const face of faces){polygon(face.vertices,face.fill,face.stroke,.6,face.alpha??1);drawWindows(face);}
    // Light pools are deliberately small so landmarks and labels remain readable.
    for(let x=-174;x<181;x+=21)for(const z of [39,109]){
      line([[x,.7,z],[x,4,z]],pal.gold,.6,.7);if(pal.night)point([x,4,z],.8,pal.window,5);
    }
    const vignette=ctx.createRadialGradient(width/2,height*.45,Math.min(width,height)*.18,width/2,height*.45,Math.max(width,height)*.8);vignette.addColorStop(0,'#02071200');vignette.addColorStop(1,'#02071270');ctx.fillStyle=vignette;ctx.fillRect(0,0,width,height);
  }
  function dynamicCity(frame:TokyoCanvasFrame) {
    const time=frame.reducedMotion?0:Math.max(0,frame.time??0)*.001;
    for(let i=0;i<22;i++){
      const x=-174+mod(i*37+time*(i%2?9:-8),348),z=i%2?48:118;
      polygon(rectangle(x,.6,z+(i%2?-2.4:2.4),3.4,1.6),i%3?'#b4c7c4':pal.gold);
      if(pal.night)point([x+(i%2?1.7:-1.7),1,z+(i%2?-2.4:2.4)],.75,pal.window,3);
    }
    const riverPhase=time*.18;
    for(let i=0;i<20;i++){const z=-198+i*11,x=167+Math.sin((z+207)/8*.23)*7;line([[x-5,.7,z],[x+2+Math.sin(i+riverPhase)*2,.7,z+1]],'#c5eeee',.6,.13);}
    if(pal===palettes.cyber&&!frame.reducedMotion){ctx.strokeStyle='#adcef0';ctx.globalAlpha=.1;ctx.lineWidth=.6;for(let i=0;i<55;i++){const x=random(i+50)*width,y=mod(random(i+150)*height+time*190,height);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y+12);ctx.stroke();}ctx.globalAlpha=1;}
    if(flareStarted>=0){const age=(frame.time??0)-flareStarted;if(age>=0&&age<2600){for(let i=0;i<16;i++){const t=age/1000,a=i/16*Math.PI*2;point([Math.cos(a)*t*14,65-t*t*7,-30+Math.sin(a)*t*14],Math.max(.2,2-t*.6),'#ffd599',5);}}else if(age>=2600)flareStarted=-1;}
  }
  return {
    render(nextCamera,frame){
      if(disposed)return;camera=nextCamera;
      const resolution=nativeTokyoCanvasResolution(frame.width,frame.height,canvas.ownerDocument.defaultView?.devicePixelRatio);
      width=resolution.width;height=resolution.height;dpr=resolution.pixelRatio;
      const pixelWidth=Math.floor(width*dpr),pixelHeight=Math.floor(height*dpr);
      if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=cached.width=pixelWidth;canvas.height=cached.height=pixelHeight;lastKey='';}
      const preset=resolveTokyoAtmosphere(frame.mode,frame.clockMinutes).preset;pal=palettes[preset];
      const key=[width,height,dpr,preset,frame.scope,frame.selectedDistrict,...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join('|');
      if(key!==lastKey){ctx=cacheContext;ctx.setTransform(dpr,0,0,dpr,0,0);staticCity(frame);lastKey=key;}
      ctx=context;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(cached,0,0);ctx.setTransform(dpr,0,0,dpr,0,0);dynamicCity(frame);
    },
    triggerFlares(){flareStarted=canvas.ownerDocument.defaultView?.performance.now()??0;},
    dispose(){disposed=true;cached.width=cached.height=1;lastKey='';},
  };
}
