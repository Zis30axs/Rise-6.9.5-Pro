import { describe, it, expect } from 'vitest';
import { createApp, reactive, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import LivehousePanel from '../src/frontend/LivehousePanel.vue';
import { renderBandPanel, renderWorldMessenger } from '../integration/dual-protagonists/phone-messenger.js';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';

const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const btn=(action,label,cls='',attrs='')=>`<button type="button" class="${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const heading=s=>`<h2>${esc(s)}</h2>`;
const time=n=>`第 ${Math.floor(n/1440)+1} 天 ${String(Math.floor(n%1440/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
function model() {return reactive({state:enableProtagonists(createInitialState()),busy:false,notice:''});}
function mount(mode='register',options={}) {
  const target=document.createElement('div');document.body.append(target);
  const m=model(),calls=[],closes=[];
  const actions={dispatch:()=>{},interact:async action=>{calls.push(action);return options.success!==false;}};
  const app=createApp(LivehousePanel,{model:m,actions,mode,onClose:()=>closes.push(true)});app.mount(target);
  const fill=async(selector,value)=>{const input=target.querySelector(selector);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));await nextTick();};
  return {target,m,calls,closes,fill,cleanup(){app.unmount();target.remove();}};
}
describe('Live House explicit player forms',()=>{
  it('starts without invented names, roles or members; cancel is free',async()=>{
    const x=mount();await nextTick();
    expect(readFileSync('src/frontend/shell.css','utf8')).toContain("@import './livehouse.css'");
    expect(x.target.querySelector('[data-band-name]').value).toBe('');
    expect(x.target.querySelector('[data-founder-role]').value).toBe('');
    x.target.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await nextTick();
    expect(x.calls).toHaveLength(0);expect(x.target.textContent).toContain('请填写乐队名');
    [...x.target.querySelectorAll('button')].find(b=>b.textContent==='取消').click();expect(x.closes).toHaveLength(1);expect(x.calls).toHaveLength(0);x.cleanup();
  });
  it('uses player input exactly, keeps the request ID after a save failure and closes only after success',async()=>{
    const x=mount('register',{success:false});
    await x.fill('[data-band-name]','玩家起的名字');await x.fill('[data-founder-role]','bass');
    x.target.querySelector('[data-confirm-founder]').click();await nextTick();
    for(let n=0;n<2;n++) {x.target.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));}
    expect(x.calls).toHaveLength(2);expect(x.calls[0]).toEqual(x.calls[1]);expect(x.calls[0].registration.name).toBe('玩家起的名字');expect(x.closes).toHaveLength(0);x.cleanup();
  });
  it('books an explicitly selected band, game day, time and duration',async()=>{
    const x=mount('book');x.m.state.livehouse={version:1,bands:[{id:'band-a',name:'玩家乐队',founder:'soyo',createdAt:0,members:[{personId:'protagonist-soyo',name:'素世',role:'bass',joinedAt:0}]}],profiles:[],invitations:[],bookings:[]};await nextTick();
    expect(x.target.querySelector('[data-booking-time]').value).toBe('');
    await x.fill('[data-booking-band]','band-a');await x.fill('[data-booking-title]','夜场');await x.fill('[data-booking-day]','8');await x.fill('[data-booking-time]','19:30');await x.fill('[data-booking-duration]','90');
    x.target.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
    expect(x.calls[0].booking).toMatchObject({bandId:'band-a',title:'夜场',start:7*1440+19*60+30,duration:90});expect(x.closes).toHaveLength(1);x.cleanup();
  });
});
describe('existing phone Messages band entry',()=>{
  const data={binding:'qa-soyo',revision:0,owner:'soyo',active:'soyo',name:'素世',now:1000,conversation:[],messages:[],others:[],npcPhone:{contacts:[],groups:[],requests:[],messages:[]},music:{bands:[],bookings:[],invitations:[],contacts:[]}};
  it('shows the band entry, fixed saved abilities and escapes user-controlled names and replies',()=>{
    const skills={vocal:25,guitar:25,bass:90,drums:25,keyboard:25};
    const html=renderBandPanel({...data,music:{...data.music,bands:[{id:'one',name:'<img src=x onerror=alert(1)>',members:[{name:'素世',role:'bass',profile:{source:'fixed',skills}}]}],invitations:[{bandId:'one',name:'立希',role:'drums',from:'soyo',status:'pending',messageId:'npc:one',reply:null}]}},{esc,btn,heading,time});
    const root=document.createElement('div');root.innerHTML=html;
    expect(root.querySelector('img')).toBeNull();expect(root.querySelector('[data-action=band-reply]')).not.toBeNull();expect(root.querySelector('meter[value="90"]')).not.toBeNull();
    const screen=renderWorldMessenger({data,recipient:'',mode:'list',drafts:new Map(),pending:null},{esc,btn,heading,time});expect(screen.html).toContain('我的乐队');
  });
  it('wires real phone buttons to save an invitation and request a reply only after an explicit click',async()=>{
    let current={...data,music:{...data.music,bands:[{id:'band-one',name:'夜读',members:[{personId:'protagonist-soyo',name:'素世',role:'bass',profile:{source:'fixed',skills:{bass:90}}}]}],contacts:[{id:'taki',name:'椎名立希'}]}},sends=0,replies=0,onWorldUpdate=()=>{};
    const api={read:()=>current,subscribe:callback=>{onWorldUpdate=callback;return ()=>{};},act:async raw=>{sends++;current={...current,music:{...current.music,invitations:[{bandId:'band-one',name:'椎名立希',role:'drums',from:'soyo',status:'pending',messageId:'npc:invite-one',reply:null}]}};expect(raw.command).toEqual({type:'band_invite',bandId:'band-one',contactId:'taki',role:'drums'});return current;},retryReply:async()=>{replies++;return current;}};
    const root=document.createElement('div'),handlers=new Map();document.body.append(root);
    const view={root,disposed:false,on:(type,selector,fn)=>handlers.set(type+selector,fn),draw:html=>{root.innerHTML=html;},busy:async(el,fn)=>fn(),dispose(){}};
    const source=readFileSync('integration/dual-protagonists/phone-apps.js','utf8').replace(/\r\n/g,'\n').replace(/^import .*;\n/gm,'').replace(/^export \{.*;\n/gm,'').replace('export const worldPhoneFactories','const worldPhoneFactories');
    const factories=new Function('createView','esc','btn','heading','renderBandPanel','renderWorldMessenger','worldMessageRows','phoneArt','worldCardArt','worldDeviceHeading','worldAppearance',source+'\nreturn worldPhoneFactories;')(()=>view,esc,btn,heading,renderBandPanel,renderWorldMessenger,()=>[],{},()=>'',()=>'',()=>({}));
    const ctx={win:{parent:{__unreadCityWorldPhone:api},setInterval:()=>1,clearInterval:()=>{},crypto},doc:document,api:{},notify:()=>{}};
    const v=factories.worldmessages(ctx);const click=handlers.get('click[data-action]');
    await click(root.querySelector('[data-action=open-bands]'));
    root.querySelector('[data-world-field=band]').value='band-one';root.querySelector('[data-world-field=band-contact]').value='taki';root.querySelector('[data-world-field=band-role]').value='drums';
    root.querySelector('[data-band-member]').open=true;root.scrollTop=180;root.querySelector('[data-world-field=band-role]').focus();
    current={...current,revision:current.revision+1};onWorldUpdate();
    expect(root.querySelector('[data-band-member]').open).toBe(true);expect(root.scrollTop).toBe(180);expect(document.activeElement).toBe(root.querySelector('[data-world-field=band-role]'));
    expect(root.querySelector('[data-world-field=band]').value).toBe('band-one');expect(root.querySelector('[data-world-field=band-contact]').value).toBe('taki');expect(root.querySelector('[data-world-field=band-role]').value).toBe('drums');
    await click(root.querySelector('[data-action=band-invite]'));expect(sends).toBe(1);expect(replies).toBe(0);await click(root.querySelector('[data-action=band-reply]'));expect(replies).toBe(1);
    current={...current,binding:'qa-new-chat',revision:current.revision+1};onWorldUpdate();
    expect(root.querySelector('[data-world-field=band]').value).toBe('');expect(root.querySelector('[data-band-member]').open).toBe(false);root.remove();
  });
});
