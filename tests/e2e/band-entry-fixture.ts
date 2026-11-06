import { createInitialState, reduceState } from '../../src/runtime/model';
import { enableProtagonists } from '../../src/runtime/protagonist-world';

// Only the host and saved starting state are fixtures; the UI is the release IIFE.
let state=enableProtagonists(createInitialState());
for(const owner of ['soyo','sakiko','emma','renako'] as const) {
  state=reduceState(state,{type:'switch_protagonist',target:owner});
  state=reduceState(state,{type:'choose_academics',majorId:'computer-science'});
}
state=reduceState(state,{type:'switch_protagonist',target:'soyo'});
const host=window as unknown as Record<string, unknown>;
let modelCalls=0;
const denied=async()=>{modelCalls++;throw Error('Model calls are disabled in this fixture');};
const context={
  characterId:0,groupId:null,chatId:'band-entry',mainApi:'openai',
  characters:[{avatar:'band-entry.png',name:'乐队入口回归',data:{}}],
  groups:[],chat:[],chatMetadata:{},extensionSettings:{},name1:'我',name2:'乐队入口回归',
  eventSource:{on(){},removeListener(){}},eventTypes:{},
  setExtensionPrompt(){},updateMessageBlock(){},messageFormatting:(value:string)=>value,
  saveSettingsDebounced(){},getRequestHeaders:()=>({'Content-Type':'application/json'}),
  getCurrentChatId:()=>context.chatId,generateRaw:denied,generateQuietPrompt:denied,getThumbnailUrl:()=>'',
};
host.SillyTavern={getContext:()=>context};
host.toastr={info(){},warning(){},error(){},success(){}};
localStorage.setItem('unread-city.presentation-mode.v1','novel');
const iframe=document.createElement('iframe');iframe.id='band-entry-helper';iframe.hidden=true;
iframe.srcdoc='<!doctype html><html><body></body></html>';
iframe.addEventListener('load',()=>{
  const helper=iframe.contentWindow as unknown as Record<string, unknown>;
  let variables={unread_city:state};
  Object.assign(helper,{
    tavern_events:{CHAT_CHANGED:'chat_id_changed'},getVariables:()=>variables,
    replaceVariables:(next:typeof variables)=>{variables=next;},eventOn(){},eventRemoveListener(){},
    getButtonEvent:(name:string)=>`button:${name}`,generate:denied,stopGenerationById:()=>true,
  });
  host.bandEntryFixture={read:()=>structuredClone(variables.unread_city),modelCalls:()=>modelCalls};
  const script=iframe.contentDocument!.createElement('script');
  script.src='/dist/immersive-shell-lite.js';iframe.contentDocument!.body.append(script);
},{once:true});
document.body.append(iframe);
