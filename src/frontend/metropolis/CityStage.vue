<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { buildTerrain } from './terrain';
import { buildUrban } from './urban';
import { makeWorld } from './geometry';
import { createCityRenderer } from './renderer';
import type { CameraState, CityRenderer, Landmark, Layer, Mode, SceneMarker, V3, World } from './types';
const props = defineProps<{ mode: Mode; layers: Record<Layer, boolean>; traffic: boolean; labels: boolean; selected: string | null; touring: boolean; orbit: boolean; landmarks?: Landmark[]; markers?: SceneMarker[]; selectedMarker?: string | null; focusPoint?: V3 | null; route?: V3[] }>();
const emit = defineEmits<{ ready: [world: World]; select: [id: string | null]; marker: [id: string]; interaction: []; bearing: [angle: number]; failure: [message: string] }>();
const host = ref<HTMLElement>(); const canvas = ref<HTMLCanvasElement>();
const pins = ref<{id:string;name:string;category:string;x:number;y:number;visible:boolean;accent:string}[]>([]);
const gamePins = ref<(SceneMarker & {x:number;y:number;visible:boolean;compact:boolean})[]>([]);
const routePath = ref('');
let renderer: CityRenderer | null=null, world:World, raf=0, observer:ResizeObserver | null=null;
let view: (Window & typeof globalThis) | null=null;
let width=1000,height=800,elapsed=0,last=0,lastDraw=0,lastLabels=0,tourTime=0,tourIndex=0,disposed=false;
let current:CameraState={target:[0,.9,-1.4],yaw:-.52,pitch:.63,distance:46};
let destination:CameraState={...current,target:[...current.target]};
let reduced=false;
const home = ():CameraState => ({target:[0,-.75,-1.1],yaw:width<600?-1:-.52,pitch:width<600?.78:.63,distance:Math.max(50,65/Math.max(.3,width/height)),offsetY:width<600?.02:-.07});
const setDestination=(next:CameraState)=>{destination={...next,target:[...next.target]};};
const scenePlaces=()=>props.landmarks??world?.landmarks??[];
function focus(id:string|null){const place=scenePlaces().find(p=>p.id===id); if(place){const c=place.camera;setDestination({...c,distance:c.distance*Math.max(1,.92/(width/height))});}else setDestination(home());}
function focusAt(point:V3){setDestination({target:[point[0],point[1]+.6,point[2]],yaw:destination.yaw,pitch:.82,distance:Math.max(19,23/Math.max(.55,width/height)),offsetY:width<600?-.12:0});}
function reset(){emit('select',null);emit('interaction');setDestination(home());}
function zoom(mult:number){emit('interaction');destination.distance=Math.max(12,Math.min(190,destination.distance*mult));}
function exportImage(){
 if(!canvas.value)return;
 const source=canvas.value, doc=source.ownerDocument, out=doc.createElement('canvas');out.width=source.width;out.height=source.height;const c=out.getContext('2d');if(!c)return;c.drawImage(source,0,0);
 const s=out.width/1200;c.fillStyle='rgba(8,24,31,.78)';c.fillRect(0,out.height-100*s,out.width,100*s);c.fillStyle='#f0e5cd';c.font=`${24*s}px serif`;c.fillText('未读之城 · 山海都会',36*s,out.height-50*s);c.fillStyle='#a7b9bc';c.font=`${11*s}px sans-serif`;c.fillText('UNREAD CITY  /  COASTAL METROPOLIS',36*s,out.height-25*s);
 out.toBlob(blob=>{if(!blob)return;const a=doc.createElement('a');const url=URL.createObjectURL(blob);a.href=url;a.download='unread-city-metropolis.png';doc.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);},'image/png');
}
defineExpose({reset,zoom,focus,focusAt,exportImage});
watch(()=>props.selected,id=>focus(id));
watch(()=>props.focusPoint?.join(','),()=>{if(props.focusPoint)focusAt(props.focusPoint);});
watch(()=>props.touring,on=>{tourTime=0;if(on){tourIndex=0;const first=scenePlaces()[0];if(first){focus(first.id);emit('select',first.id);}}});
const pointers=new Map<number,{x:number;y:number}>();let dragDistance=0;
function pointerDown(e:PointerEvent){if(e.button!==0&&e.pointerType==='mouse')return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.value?.setPointerCapture(e.pointerId);dragDistance=0;}
function pointerMove(e:PointerEvent){const old=pointers.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;dragDistance+=Math.hypot(dx,dy);if(dragDistance>3)emit('interaction');
 if(pointers.size===2){const other=Array.from(pointers.entries()).find(([id])=>id!==e.pointerId)![1];const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(after>4)destination.distance=Math.max(12,Math.min(190,destination.distance*before/after));}
 else{destination.yaw-=dx*.006;destination.pitch=Math.max(.24,Math.min(1.33,destination.pitch+dy*.004));}
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
}
function pointerUp(e:PointerEvent){pointers.delete(e.pointerId);if(canvas.value?.hasPointerCapture(e.pointerId))canvas.value.releasePointerCapture(e.pointerId);}
function wheel(e:WheelEvent){e.preventDefault();zoom(Math.exp(Math.max(-100,Math.min(100,e.deltaY))*.0017));}
function keyboard(e:KeyboardEvent){const moves:Record<string,()=>void>={ArrowLeft:()=>{destination.yaw-=.14;},ArrowRight:()=>{destination.yaw+=.14;},ArrowUp:()=>{destination.pitch=Math.min(1.3,destination.pitch+.08);},ArrowDown:()=>{destination.pitch=Math.max(.24,destination.pitch-.08);},'+':()=>zoom(.87),'=':()=>zoom(.87),'-':()=>zoom(1.15),Home:reset};if(moves[e.key]){e.preventDefault();emit('interaction');moves[e.key]();}}
onMounted(()=>{
 try{view=canvas.value!.ownerDocument.defaultView;if(!view)throw new Error('无法取得城市窗口');reduced=view.matchMedia('(prefers-reduced-motion: reduce)').matches;
 world=makeWorld();buildTerrain(world);buildUrban(world);renderer=createCityRenderer(canvas.value!,world);emit('ready',world);
 const resize=()=>{const el=host.value!;const previous=width/height;width=el.clientWidth;height=el.clientHeight;renderer!.resize(width,height,Math.min(view!.devicePixelRatio||1,2));if(!props.selected){const h=home();if(Math.abs(previous-width/height)>.15||last===0){setDestination(h);current={...h,target:[...h.target]};}}};
 observer=new view.ResizeObserver(resize);observer.observe(host.value!);resize();
 const draw=(now:number)=>{if(disposed||!view)return;raf=view.requestAnimationFrame(draw);if(view.document.hidden){last=0;return;}if(now-lastDraw<30)return;lastDraw=now;const rawDt=last?Math.max(0,(now-last)/1000):0;const dt=Math.min(.16,rawDt);last=now;elapsed+=Math.min(.5,rawDt);const smoothing=reduced?1:1-Math.exp(-dt*4.8);
 current.offsetY=(current.offsetY??0)+((destination.offsetY??0)-(current.offsetY??0))*smoothing;current.yaw+=(destination.yaw-current.yaw)*smoothing;current.pitch+=(destination.pitch-current.pitch)*smoothing;current.distance+=(destination.distance-current.distance)*smoothing;current.target=current.target.map((v,i)=>v+(destination.target[i]-v)*smoothing) as V3;
 if(props.orbit&&!props.touring&&!reduced&&pointers.size===0)destination.yaw+=dt*.045;
 if(props.touring){tourTime+=rawDt;const places=scenePlaces();if(tourTime>8.5&&places.length){tourTime=0;tourIndex=(tourIndex+1)%places.length;emit('select',places[tourIndex].id);}}
 renderer!.render({camera:current,mode:props.mode,layers:props.layers,traffic:props.traffic,labels:props.labels,time:elapsed,selected:props.selected});
 if(now-lastLabels>70){lastLabels=now;emit('bearing',current.yaw);const used:{x:number;y:number}[]=[];
 const ordered=[...(props.markers??[])].sort((a,b)=>Number(b.id===props.selectedMarker)-Number(a.id===props.selectedMarker)||Number(b.kind==='player')-Number(a.kind==='player'));
 gamePins.value=ordered.map(marker=>{const p=renderer!.project(marker.position),important=marker.kind==='player'||marker.id===props.selectedMarker;const visible=(props.labels||important)&&p.visible&&p.x>16&&p.x<width-28&&p.y>24&&p.y<height-40;const compact=!important&&used.some(q=>Math.abs(q.x-p.x)<112&&Math.abs(q.y-p.y)<44);if(visible&&!compact)used.push({x:p.x,y:p.y});return{...marker,x:p.x,y:p.y,visible,compact};});
 pins.value=scenePlaces().map(place=>{const p=renderer!.project(place.position);let visible=props.labels&&p.visible&&p.x>40&&p.x<width-90&&p.y>30&&p.y<height-(props.markers?60:160);if(props.selected&&props.selected!==place.id&&current.distance<28)visible=false;if(used.some(q=>Math.abs(q.x-p.x)<125&&Math.abs(q.y-p.y)<46))visible=false;if(visible)used.push({x:p.x,y:p.y});return{id:place.id,name:place.name,category:place.category,x:p.x,y:p.y,visible,accent:place.accent};});
 const points=(props.route??[]).map(p=>renderer!.project(p));routePath.value=points.length>1&&points.every(p=>p.visible)?points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '):'';
 }
 };raf=view.requestAnimationFrame(draw);
 }catch(error){emit('failure',error instanceof Error?error.message:String(error));}
});
onBeforeUnmount(()=>{disposed=true;view?.cancelAnimationFrame(raf);observer?.disconnect();renderer?.dispose();});
</script>
<template>
 <div ref="host" class="city-stage">
  <canvas ref="canvas" class="city-canvas" aria-label="可旋转缩放的山海都市三维沙盘，拖动旋转，滚轮缩放，方向键调整视角" tabindex="0" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="pointerUp" @wheel="wheel" @keydown="keyboard" />
  <svg v-if="routePath" class="city-game-route" aria-hidden="true"><path :d="routePath" class="city-game-route__shadow"/><path :d="routePath"/></svg>
  <div class="city-labels" aria-label="城市地标">
   <button v-for="pin in pins" :key="pin.id" class="city-pin" :class="{active:selected===pin.id}" :style="{transform:`translate(${pin.x}px,${pin.y}px)`,opacity:pin.visible?1:0,pointerEvents:pin.visible?'auto':'none','--pin-color':pin.accent}" :tabindex="pin.visible?0:-1" :aria-label="`探索${pin.name}`" @click="emit('interaction');emit('select',pin.id)"><i></i><span>{{pin.name}}<small>{{pin.category}}</small></span></button>
  </div>
  <div v-if="markers" class="city-game-markers" aria-label="地点与附近人物">
   <button v-for="pin in gamePins" :key="pin.id" type="button" class="city-game-pin" :class="['city-game-pin--'+pin.kind,{'is-selected':selectedMarker===pin.id,'is-compact':pin.compact}]" :data-game-marker="pin.id" :style="{left:`${pin.x}px`,top:`${pin.y}px`,opacity:pin.visible?1:0,pointerEvents:pin.visible?'auto':'none','--marker-accent':pin.accent??'#debf86'}" :tabindex="pin.visible?0:-1" :aria-hidden="!pin.visible" :aria-label="`${pin.kind==='player'?'当前位置：':pin.kind==='person'?'附近人物：':''}${pin.name}`" @click="emit('interaction');emit('marker',pin.id)"><i aria-hidden="true">{{pin.kind==='player'?'◎':pin.kind==='person'?'◉':'·'}}</i><span>{{pin.name}}<small v-if="pin.detail">{{pin.detail}}</small></span></button>
  </div>
 </div>
</template>
