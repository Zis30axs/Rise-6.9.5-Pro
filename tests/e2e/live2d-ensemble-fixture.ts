import { createApp, defineComponent, h, provide, reactive, ref } from 'vue';
import NovelLive2DPortrait from '../../src/frontend/NovelLive2DPortrait.vue';
import { live2dContext } from '../../src/frontend/live2d-context';
import { createInitialState } from '../../src/runtime/model';
import { live2dAppearancePrompt } from '../../src/runtime/live2d-wardrobe';
import { createEnsembleSource } from '../../src/frontend/live2d-ensemble-assets';
import { createSoyoPortrait } from '../../src/frontend/live2d-soyo-runtime';
import { live2dPack } from '../../src/runtime/live2d-pack';
import '../../src/frontend/soyo-live2d.css';
import '../../src/frontend/novel-invitation-portraits.css';
const state=reactive(createInitialState());
const paired=ref(false),visible=ref(true),nonce=ref(0);
const component=defineComponent({setup(){
  provide(live2dContext,()=>({session:'browser-live2d',state,enabled:true}));
  const portrait=()=>h(NovelLive2DPortrait,{speaker:'长崎素世',emotion:'开心',refreshToken:nonce.value},{default:()=>h('div',{'data-original-fallback':'','style':'color:white;padding:100px'},'原有立绘')});
  return ()=>h('div',{style:'position:fixed;inset:0'},visible.value?[paired.value?h('div',{class:'novel-invitation-portraits'},[h('div',{class:'novel-invitation-portraits__side'},[portrait()]),h('div',{class:'novel-invitation-portraits__side'},[portrait()])]):portrait()]:[]);
}});
createApp(component).mount('#app');
Object.assign(window,{live2dFixture:{
  prompt:()=>live2dAppearancePrompt('browser-live2d',state),
  paired:(value:boolean)=>{paired.value=value;},visible:(value:boolean)=>{visible.value=value;},refresh:()=>{nonce.value++;},
  async render(id:string){
    const outfit=live2dPack()!.status().models.find(row=>row.id===id)!;
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:400px;height:600px';document.body.append(canvas);
    const controller=new AbortController();let portrait:Awaited<ReturnType<typeof createSoyoPortrait>>|undefined;
    try{
      const source=await createEnsembleSource(outfit,controller.signal);
      portrait=await createSoyoPortrait(canvas,controller.signal,source);portrait.resize(400,600);
      await portrait.setEmotion('开心');portrait.setActive(true);
      const probe=document.createElement('canvas');probe.width=canvas.width;probe.height=canvas.height;
      const ctx=probe.getContext('2d')!;
      let opaque=0,png='';
      // Motion fade-in and the first GPU frame are asynchronous. Poll actual
      // pixels instead of assuming two animation frames imply visible output.
      for(let attempt=0;attempt<30&&opaque<1000;attempt++){
        await new Promise(resolve=>setTimeout(resolve,100));portrait.resize(400,600);
        png=canvas.toDataURL();ctx.clearRect(0,0,probe.width,probe.height);ctx.drawImage(canvas,0,0);
        const pixels=ctx.getImageData(0,0,probe.width,probe.height).data;
        opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)opaque++;
      }
      return {id,person:outfit.person,png,opaque};
    }finally{controller.abort();portrait?.destroy();canvas.remove();}
  },
}});
