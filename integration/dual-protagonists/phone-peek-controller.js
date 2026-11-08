import {esc,btn,heading} from 'UNREAD_CITY_PHONE_COMMON';
import {peekPhone} from 'UNREAD_CITY_PEEK_PHONE';
import {worldPeekWallpaper} from 'UNREAD_CITY_PHONE_VISUALS';
import {peekWorld,peekProtagonist,protagonistPeekSnapshot} from './phone-peek.js';

/** Reuse the ordinary nested phone presentation with a live, permission-checked view. */
export function createProtagonistPeek(ctx,view,reset) {
  const api=ctx.win.__unreadCityWorldPhone || ctx.win.parent?.__unreadCityWorldPhone;
  let selected='',binding='',owner='',device=null,layer=null,pending=false,serial=0,disposed=false,closing=false;
  const live=()=>!disposed&&!view.disposed;
  function drop() { const old=device;device=null;layer?.remove();layer=null;closing=true;old?.close();closing=false; }
  function snapshot(data) { return {...protagonistPeekSnapshot(data),wallpaperCss:worldPeekWallpaper(data)}; }
  function render(name) {
    selected=name;
    const world=peekWorld(ctx.win),target=peekProtagonist(world,name);
    if (!target || (binding && world.binding!==binding)) { cancel();reset();return; }
    let reason=target.reason||'',data=null;
    if (binding) {
      try { data=api.readInspected({binding,owner}); }
      catch(e) { binding='';owner='';drop();reason=e.message; }
    }
    view.draw(heading(`${name} 的手机`,'','Peek')+`<div class="peek-lock"><p>${esc(reason||'拿起手机，看看最近的消息。')}</p>${btn('peek-canonical-open',pending?'正在拿起……':'拿起来看看','primary',pending||!target.read?'disabled':'')}</div>`);
    if(data&&device)device.update(snapshot(data));
  }
  async function open(name) {
    if(pending||!live())return;
    const world=peekWorld(ctx.win),target=peekProtagonist(world,name);
    if(!target?.read){render(name);return;}
    const ticket=++serial;pending=true;render(name);
    try {
      const data=await api.act({binding:world.binding,revision:world.revision,requestId:ctx.win.crypto.randomUUID(),
        owner:target.id,command:{type:'inspect',section:'messages'}});
      if(!live()||ticket!==serial||peekWorld(ctx.win)?.binding!==world.binding)return;
      binding=world.binding;owner=target.id;
      // Recheck after an asynchronous save; permission or position may have changed.
      const current=api.readInspected({binding,owner});
      drop();
      const host=ctx.doc.querySelector('.screen')||view.root;
      device=peekPhone(ctx,{host,snap:snapshot(current),canDraw:()=>false,draw:async()=>{},photo:async()=>'',view:()=>{},
        close:()=>{device=null;layer=null;if(live()&&!closing)render(selected);}});
      layer=host.querySelector('.peek-phone:last-child');
    } catch(e) {binding='';owner='';drop();if(live())ctx.notify(e.message,{error:true});}
    finally {if(live()&&ticket===serial){pending=false;render(name);}}
  }
  function cancel() { serial++;selected='';binding='';owner='';pending=false;drop(); }
  const stop=api?.subscribe?.(()=>{if(live()&&selected)render(selected);})||(()=>{});
  return {render,open,cancel,back:()=>device?device.back():false,dispose(){disposed=true;cancel();stop();}};
}
