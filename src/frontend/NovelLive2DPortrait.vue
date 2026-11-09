<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { live2dContext } from './live2d-context';
import { live2dPack } from '../runtime/live2d-pack';
import { live2dIdentity } from '../runtime/live2d-identity';
import { chooseLive2dOutfit, confirmLive2dOutfit } from '../runtime/live2d-wardrobe';
import type { SoyoPortrait } from './live2d-soyo-runtime';
const props=withDefaults(defineProps<{speaker:string;emotion:string;active?:boolean;dimmed?:boolean;refreshToken?:number}>(),{active:true,refreshToken:0});
const context=inject(live2dContext,undefined);
const revision=ref(0), canvasGeneration=ref(0), ready=ref(false), host=ref<HTMLElement>(), canvas=ref<HTMLCanvasElement>();
const hidden=ref(typeof document!=='undefined'&&document.hidden);
const selection=computed(()=>{
  void revision.value; void props.refreshToken;
  const value=context?.(),person=live2dIdentity(props.speaker);
  if(!props.active||!value?.enabled||!person)return null;
  const status=live2dPack()?.status();
  if(!status?.enabled)return null;
  const selected=chooseLive2dOutfit(value.session,value.state,person,status);
  return selected&&value.session?{...selected,session:value.session,person,status}:null;
});
const selectionKey=computed(()=>selection.value?JSON.stringify([selection.value.session,selection.value.person,selection.value.choice,selection.value.status.generation,props.refreshToken,hidden.value]):'');
let portrait:SoyoPortrait|undefined, abort:AbortController|undefined, observer:ResizeObserver|undefined;
let unconfirm:(()=>void)|undefined, unsubscribe:(()=>void)|undefined, epoch=0, dead=false;
function release(){
  epoch++;ready.value=false;unconfirm?.();unconfirm=undefined;
  canvas.value?.removeEventListener('webglcontextlost',lost,true);
  abort?.abort();abort=undefined;portrait?.destroy();portrait=undefined;
}
function lost(event:Event){event.preventDefault();event.stopImmediatePropagation();release();}
function resize(){const box=host.value?.getBoundingClientRect();if(box)portrait?.resize(box.width,box.height);}
async function emotion(){const request=epoch;try{await portrait?.setEmotion(props.emotion);}catch{if(request===epoch)release();}}
async function load(){
  release();const selected=selection.value;
  if(dead||hidden.value||!selected)return;
  const request=epoch, controller=new AbortController();abort=controller;canvasGeneration.value++;
  let source:Awaited<ReturnType<typeof import('./live2d-ensemble-assets').createEnsembleSource>>;
  let transferred=false;
  try{
    await nextTick();if(dead||request!==epoch||!canvas.value)return;
    const {createEnsembleSource}=await import('./live2d-ensemble-assets');
    source=await createEnsembleSource(selected.outfit,controller.signal);
    if(dead||request!==epoch){source?.lease.release();return;}
    const {createSoyoPortrait}=await import('./live2d-soyo-runtime');
    if(dead||request!==epoch||!canvas.value){source?.lease.release();return;}
    canvas.value.addEventListener('webglcontextlost',lost,true);
    transferred=true;
    const result=await createSoyoPortrait(canvas.value,controller.signal,source);
    if(dead||request!==epoch){result.destroy();return;}
    portrait=result;resize();await emotion();
    if(dead||request!==epoch)return;
    portrait.setActive(true);ready.value=true;
    await nextTick();if(dead||request!==epoch)return;resize();
    unconfirm=confirmLive2dOutfit(selected.session,selected.person,selected.choice,selected.status);
  }catch(error){if(!transferred)source?.lease.release();if(!dead&&request===epoch){release();console.warn('[UnreadCity Live2D] portrait fallback',error);}}
}
const visibility=()=>{hidden.value=document.hidden;};
watch(selectionKey,()=>void load(),{flush:'post'});
watch(()=>props.emotion,()=>void emotion());
watch(host,node=>{observer?.disconnect();if(node)observer?.observe(node);});
onMounted(()=>{
  unsubscribe=live2dPack()?.subscribe(()=>revision.value++);
  observer=new ResizeObserver(resize);if(host.value)observer.observe(host.value);
  document.addEventListener('visibilitychange',visibility);void load();
});
onBeforeUnmount(()=>{dead=true;release();unsubscribe?.();observer?.disconnect();document.removeEventListener('visibilitychange',visibility);});
</script>
<template>
  <div v-if="selection" ref="host" class="soyo-live2d" :class="{'is-dimmed':dimmed}" aria-hidden="true"
    :data-live2d-person="selection.person" :data-live2d-outfit="selection.outfit.id" :data-live2d-status="ready?'ready':'fallback'">
    <canvas :key="canvasGeneration" ref="canvas" v-show="ready" class="soyo-live2d-canvas" />
  </div>
  <slot v-if="!ready" />
</template>
