import {forumApp} from '../../../ST-iPhonie/ui/forum.js';
import {TTSBackend} from '../../../ST-iPhonie/core/backend.js';
import {AppStore} from '../../../ST-iPhonie/core/app-store.js';
import {parseForum} from '../../../ST-iPhonie/core/forum.js';
import {keepNetworkGuests} from '../../../ST-iPhonie/core/network.js';
import {createInitialState, parseState, reduceState} from '../../src/runtime/model';
import {enableProtagonists} from '../../src/runtime/protagonist-world';
import {createWorldPhoneApi} from '../../src/frontend/world-phone';

const saved=localStorage.getItem('xitter-qa-world');
let state=saved ? parseState(JSON.parse(saved)) : enableProtagonists(createInitialState());
let generationCount=0,view;
const commit=a=>{state=reduceState(state,a);localStorage.setItem('xitter-qa-world',JSON.stringify(state));return state;};
const host=createWorldPhoneApi({session:'["xitter-qa","offline"]',current:()=>true,busy:()=>false,state:()=>state,commit});
window.__unreadCityWorldPhone=host;
const b=Object.create(TTSBackend.prototype);
b.assertOpen=()=>{}; b.emit=()=>{}; b.getState=()=>({chat:{netNames:{}}}); b.contacts=()=>[];
b.here=()=>({key:'unread-city:qa-'+state.protagonists.accounts.active,strict:true});
b.cardKey=()=>b.here().key;
b.apps=new AppStore('xitter-qa',{database:'xitter-qa-only'});
b.appsMutate=async(_kind,fn)=>fn();
const api={...b.api(),forumBusy:()=>false,
  forumRefresh:async()=>{
    generationCount++;
    const found=parseForum('【帖子】person:bang-mutsumi｜窗边的花｜今天也慢慢长大了。\n【回复】person:bang-tomori：花开了。\n【帖子】路过的纸飞机｜晚风｜散步回来，准备休息。\n【帖子】institution:weather｜天气｜今天多云。\n【依据】weather',{network:host.network()});
    await keepNetworkGuests(host.network(),found);
    return b.addForumPosts(found.posts);
  },
};
function mount(){
  view?.dispose();document.querySelector('#app').replaceChildren();
  view=forumApp({api,win:window,doc:document,engineOf:()=>'',notify:(text)=>{document.querySelector('#notice').textContent=text;},
    confirm:async()=>true,dialog:(title,html)=>{
      const el=document.createElement('dialog');el.innerHTML=`<h2>${title}</h2><div>${html}</div>`;document.body.append(el);el.showModal();
      return {body:el.querySelector('div'),close:()=>el.remove()};
    }});
  document.querySelector('#app').append(view.root);
}
async function start(){
  if(!(await b.apps.list('forum')).length){
    await b.addForumPosts([{author:'person:bang-mutsumi',title:'一片新叶',text:'给窗边的植物浇了水。',replies:[{from:'person:bang-tomori',text:'我也想看看。'}]}]);
    await b.apps.put([{id:'legacy',kind:'forum',author:'旧日路人',title:'过去的记录',text:'这是一条旧帖子。',space:b.here().key,source:'auto',likes:0,heat:1,replies:[],at:1}]);
  }
  mount();
  window.xitterQA={
    back:()=>view.back(),
    switchOwner:owner=>{commit({type:'switch_protagonist',target:owner});mount();},
    count:()=>generationCount,
    network:()=>host.network(),
    raw:()=>b.apps.list('forum'),
    post:text=>api.postForum({title:'我的动态',text}),
    refresh:()=>view.refresh(),
  };
  document.querySelector('#back').onclick=()=>view.back();
}
start().catch(e=>{document.querySelector('#notice').textContent=e.stack;throw e;});
