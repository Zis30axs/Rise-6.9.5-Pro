// Real Shell CSS, viewport lease, phone host and spatial renderer; no game/LLM.
import css from '../../src/frontend/shell.css?inline';
import viewportCss from '../../src/frontend/shell-viewport.css?inline';
import {bindShellViewport} from '../../src/frontend/shell-viewport';
import {spatialPhoneLease} from '../../src/frontend/phone-spatial';
import {createPanelHost} from 'virtual:keyboard-phone-host';

const visual = new EventTarget();
Object.assign(visual,{width:innerWidth,height:innerHeight,offsetTop:0,offsetLeft:0,scale:1});
Object.defineProperty(window,'visualViewport',{configurable:true,value:visual});
const root=document.createElement('div');root.dataset.unreadCityRoot='';root.style.cssText='position:fixed;inset:0';
const shadow=root.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=css;shadow.append(style);
const app=document.createElement('div');app.id='unread-city-app';
app.innerHTML=`<div class="uc-shell" data-presentation-mode="novel" data-reading-mode="normal">
 <div class="novel-npc-portrait"></div><div class="soyo-live2d"></div><div class="novel-invitation-portraits"></div>
 <div class="keyboard-fixed-probe" style="position:fixed;inset:100px 20px 90px;pointer-events:none"></div>
 <div class="world-chrome"><div class="world-heading"><span class="wordmark">未读之城</span></div><div class="host-actions"><button>切换聊天</button></div></div>
 <section class="reading-layer"><div class="reading-heading">街角</div><div class="story-list">午后的街道很安静。</div><form class="composer"><textarea aria-label="小说输入">小说草稿</textarea><button type="button">发送</button></form></section>
 <nav class="tool-dock"><button class="phone-launcher">手机</button><button>地图</button></nav>
 <section class="floating-window phone-window" hidden><div class="phone-controls"><button>收起</button><button>放大</button></div><div class="phone-slot" data-unread-city-phone-slot></div></section>
</div>`;
shadow.append(app);document.body.append(root);
const shell=shadow.querySelector('.uc-shell'),phoneWindow=shadow.querySelector('.phone-window');
phoneWindow.style.display='none';
const viewport=bindShellViewport(window,viewportCss);
// Reproduce WebViews clearing the home-indicator inset while IME is visible.
const initialHeight=innerHeight;
const insets=document.createElement('style');
insets.textContent=':host{--uc-safe-bottom:var(--keyboard-inset,34px)}';shadow.append(insets);
viewport.refresh();
const panel=document.createElement('dialog');panel.id='sttts-panel';
const frame=document.createElement('iframe');frame.title='手机';frame.srcdoc=`<!doctype html><html lang="zh-CN"><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;font:16px sans-serif}.screen{height:100%;display:flex;flex-direction:column;background:#fff4e1;padding:35px 14px 25px}.messages{flex:1;min-height:0;overflow:auto}.row{height:80px}textarea{font:16px sans-serif;height:64px;flex-shrink:0}</style><div class="screen"><div class="messages">${Array.from({length:30},(_,i)=>`<div class="row">消息 ${i+1}</div>`).join('')}</div><textarea aria-label="短信输入">手机草稿</textarea></div></html>`;
panel.append(frame);document.body.append(panel);
await new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));
const host=createPanelHost({win:window,isActive:()=>true,ensurePanel(){},getPanel:()=>panel,getFrame:()=>frame});
let phone;
const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left-visual.offsetLeft,top:r.top-visual.offsetTop,width:r.width,height:r.height};};
window.keyboardFixture={
 visual(value){root.style.setProperty('--keyboard-inset',value.height<initialHeight?'0px':'34px');Object.assign(visual,value);visual.dispatchEvent(new Event('resize'));visual.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));},
 phone(expanded=false){shell.dataset.activeWindow='phone';shell.dataset.phoneExpanded=String(expanded);phoneWindow.hidden=false;phoneWindow.style.removeProperty('display');phone=spatialPhoneLease(host.api.mount(shadow.querySelector('.phone-slot')),window,shadow.querySelector('.phone-slot'),'soyo');},
 metrics(){return {root:rect(root),input:rect(shadow.querySelector('textarea')),chrome:rect(shadow.querySelector('.world-chrome')),dock:rect(shadow.querySelector('.tool-dock')),portrait:rect(shadow.querySelector('.novel-npc-portrait')),live2d:rect(shadow.querySelector('.soyo-live2d')),pairedPortraits:rect(shadow.querySelector('.novel-invitation-portraits')),fixed:rect(shadow.querySelector('.keyboard-fixed-probe')),slot:rect(shadow.querySelector('.phone-slot')),phone:rect(frame),scale:panel.dataset.phoneScale,short:root.dataset.ucShort,draft:shadow.querySelector('textarea').value,phoneDraft:frame.contentDocument.querySelector('textarea').value};},
 blur(){shadow.querySelector('textarea').blur();frame.contentDocument.querySelector('textarea').blur();},
 dispose(){phone?.release();host.dispose();viewport.dispose();root.remove();panel.remove();},
};
