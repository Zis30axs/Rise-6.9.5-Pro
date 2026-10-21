// Private card-specific apps. Loaded through the existing ST-iPhonie app registry.
import {createView, esc, btn, heading} from 'UNREAD_CITY_PHONE_COMMON';
import {worldCardArt,worldDeviceHeading,worldAppearance} from 'UNREAD_CITY_PHONE_VISUALS';
export {applyWorldPhoneTheme,worldPhoneHome,worldPhoneIcon,worldPhoneState,worldPhoneTheme,saveWorldPhoneTheme} from 'UNREAD_CITY_PHONE_VISUALS';
const labels = {worldstyle:'桌面与外观',appie:'Appie Pay',worldshop:'购物',worlddelivery:'外卖',worldcalendar:'日历',worldpeek:'查手机',worldmessages:'主角消息'};
const cardNames = {gpt:'GPT Card',claude:'ClaudeCard',gemini:'GeminiCard'};
const money = cents => '¥' + (cents / 100).toFixed(2);
// The same UTC day-1 anchor as src/runtime/game-calendar.ts. Host clock stays authoritative.
const CALENDAR_EPOCH = Date.UTC(2025, 7, 28);
const DAY_MILLISECONDS = 86400000;
const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const civilDate = day => {
  const d = new Date(CALENDAR_EPOCH + (day - 1) * DAY_MILLISECONDS);
  return `${d.getUTCFullYear()}年${d.getUTCMonth()+1}月${d.getUTCDate()}日 ${weekday[d.getUTCDay()]}`;
};
const time = minutes => `${civilDate(Math.floor(minutes/1440)+1)} ${String(Math.floor(minutes/60)%24).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
const historicalTime = stamp => {
  const found = /^第 ([0-9]+) 天 ([0-9]{2}:[0-9]{2})$/.exec(stamp);
  return found ? `${civilDate(Number(found[1]))} ${found[2]}` : stamp;
};
const gameDayForDate = iso => {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso)) throw Error('请选择有效的年月日');
  const utc = Date.parse(iso + 'T00:00:00.000Z');
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0,10) !== iso) throw Error('日期无效');
  const day = (utc - CALENDAR_EPOCH) / DAY_MILLISECONDS + 1;
  if (!Number.isSafeInteger(day) || day < 1 || day > 365000) throw Error('日期不在游戏时间范围内');
  return day;
};
const requestId = win => win.crypto.randomUUID();
const total = data => Object.values(data.cards).reduce((a,b)=>a+b,0);
function worldApp(ctx,id) {
  const v=createView(ctx,id), api=()=>ctx.win.parent.__unreadCityWorldPhone;
  let data=null,section=id,peek=false,pending=null;
  let stopUpdates=()=>{};
  const options=(rows,current)=>rows.map(([value,label])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');
  const destinations=()=>options(data.destinations.map(x=>[x.id,x.name]),data.locationId);
  const cards=()=>options(Object.entries(cardNames),'gpt');
  const field=(label,input)=>`<label class="world-field">${esc(label)}${input}</label>`;
  function base() {
    if(!api()) throw Error('请先进入未读之城再使用应用');
    return api().read();
  }
  async function act(command,owner=data.owner) {
    pending??={binding:data.binding,revision:data.revision,requestId:requestId(ctx.win),owner,command};
    try {data=await api().act(pending);pending=null;render();ctx.notify('已保存');return true;}
    catch(e){render();ctx.notify(e.message,{error:true});return false;}
  }
  function refresh() {data=base();section=id;peek=false;pending=null;render();}
  const formValue=name=>v.root.querySelector(`[data-world-field="${name}"]`)?.value;
  function render() {
    if(v.disposed)return;
    let html=heading(labels[id],`${data.name} · ${time(data.now)}`,'Unread City');
    if(data.reporting && (id==='worldcalendar' || id==='worldmessages')) html+=`<p class="hint">${esc(data.reporting)}</p>`;
    html+='<style>.sms-thread{display:grid;gap:8px;padding:12px}.sms-bubble{max-width:90%;padding:10px 13px;border-radius:14px;border:1px solid #8883;background:#8881;overflow-wrap:anywhere}.sms-bubble.outgoing{justify-self:end;background:#8aae8740}.sms-bubble.incoming{justify-self:start}.sms-bubble time{display:block;font-size:11px;opacity:.75}.sms-bubble p{margin:7px 0}.sms-bubble .sms-state{font-size:11px;opacity:.75;display:block;text-align:right}.sms-read-animation{position:relative;display:inline-grid}.sms-read-animation>i,.sms-read-animation>b{grid-area:1/1;font-style:normal}.sms-read-animation>i{animation:sms-unread-out .8s step-end forwards}.sms-read-animation>b{visibility:hidden;animation:sms-read-in .8s step-end forwards}@keyframes sms-unread-out{0%,75%{visibility:visible}76%,100%{visibility:hidden}}@keyframes sms-read-in{0%,75%{visibility:hidden}76%,100%{visibility:visible}}.world-field{display:grid;gap:7px;margin:12px 0}.world-field input,.world-field select,.world-field textarea{box-sizing:border-box;width:100%;min-height:44px;padding:10px;border:1px solid #8885;border-radius:10px;background:var(--card,#fff);color:inherit}.world-product,.world-event{padding:14px;border-bottom:1px solid #8883;overflow-wrap:anywhere}.world-product button,.world-event button{min-height:44px}.world-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.world-tabs button{min-height:44px}.world-notice{padding:12px;background:#c9a65422;border-radius:12px}.world-form{padding:12px}.world-form button{min-height:44px}</style>';
    const identity=worldDeviceHeading(data), appearance=worldAppearance(data);
    html+=`<div class="world-device-header"><div><strong>${esc(identity.device)}</strong><small>${esc(identity.title)}</small></div></div>`;
    if(id==='worldstyle')html+=`<div class="group pad world-appearance"><p class="hint">外观保存在这台手机的剧情存档中。</p>${field('壁纸',`<select data-world-field="wallpaper">${options([['signature',identity.title],['plain','纯色']],appearance.wallpaper)}</select>`)}${field('界面主题',`<select data-world-field="theme">${options([['light','日间'],['dark','夜间'],['system','跟随系统']],appearance.theme)}</select>`)}${field('应用排列',`<select data-world-field="layout">${options([['daily','日常'],['focus','专注']],appearance.layout)}</select>`)}${btn('appearance','保存外观','primary')}</div>`;
    if(pending) html+=`<div class="world-notice">${btn('retry','重试保存','secondary')}${btn('discard','取消本次操作','text-button')}</div>`;
    if(id==='worldpeek'&&!peek){
      html+=`<div class="group pad"><h3>${esc(data.other.name)}的手机</h3><p>${esc(data.other.reason||'手机在身边，可以选择查看内容。')}</p><p class="hint">读取与代操作会留下记录。锁屏和许可由手机主人设置。</p><div class="world-tabs">${['wallet','calendar','orders','messages'].map(x=>btn('inspect',({wallet:'Appie Pay',calendar:'日历',orders:'订单',messages:'消息'})[x],'secondary',`data-section="${x}" ${data.other.read?'':'disabled'}`)).join('')}</div></div>`;
    } else {
      if(id==='worldpeek')html+=`<p class="world-notice">正在查看${esc(data.name)}的真实手机记录。${btn('own','返回自己的手机','text-button')}</p><div class="world-tabs">${['wallet','calendar','orders','messages'].map(x=>btn('inspect',({wallet:'Appie Pay',calendar:'日历',orders:'订单',messages:'消息'})[x],'secondary',`data-section="${x}"`)).join('')}</div>`;
      if(section==='appie'||section==='wallet') {
        html+=`<div class="wallet-card"><small>Appie Pay · 游戏账户</small><strong>${money(total(data))}</strong></div><div class="world-cards">${Object.entries(cardNames).map(([key,label])=>`<article class="world-card ${key}" data-card-owner="${data.owner}" aria-label="${esc(data.name)}的${label}"><span class="world-card-art" style='background-image:${worldCardArt(data.owner,key)}' aria-hidden="true"></span><div class="world-card-brand"><span>${label}</span><small>APPIE PAY</small></div><strong class="world-card-balance">${money(data.cards[key])}</strong><div class="world-card-holder"><span>${esc(data.name)}<small> · 游戏账户</small></span><span>•• ${data.owner==='sakiko'?'0202':'0101'} · ${key.toUpperCase()}</span></div></article>`).join('')}</div><details class="group pad"><summary>卡间转账</summary><div class="world-form">${field('转出卡',`<select data-world-field="from">${cards()}</select>`)}${field('转入卡',`<select data-world-field="to">${options(Object.entries(cardNames),'claude')}</select>`)}${field('金额（元）','<input data-world-field="amount" type="number" min="0.01" step="0.01">')}${btn('transfer','确认转账','primary')}</div></details><div class="group">${[...data.ledger].reverse().map(e=>`<article class="world-event"><b>${esc(e.note)}</b><p>${money(e.deltaCents)} · ${cardNames[e.card]}</p></article>`).join('')||'<p class="hint">暂无流水</p>'}</div>`;
      }
      if(section==='worldshop'||section==='worlddelivery') {
        const delivery=section==='worlddelivery';
        html+=`<div class="group pad">${field('收货地点',`<select data-world-field="address">${destinations()}</select>`)}${field('支付卡',`<select data-world-field="card">${cards()}</select>`)}<p class="hint">${delivery?'配送费 ¥3，预计 30 游戏分钟':'免运费，预计 60 游戏分钟'}。确认后扣款，送达后领取到背包。</p></div><div class="group">${data.catalog.filter(x=>!delivery||x.category!=='cigarette').map(x=>`<article class="world-product"><strong>${esc(x.name)}</strong><p>¥${x.price} / ${esc(x.purchaseUnit)}</p>${btn('buy','下单','secondary',`data-item="${x.id}"`)}</article>`).join('')}</div>`;
      }
      if(['worldshop','worlddelivery','orders'].includes(section)) html+=`<h3>我的订单</h3><div class="group">${[...data.orders].reverse().map(o=>`<article class="world-event"><strong>${esc(data.catalog.find(x=>x.id===o.itemId)?.name||o.itemId)}</strong><p>${money(o.totalCents)} · ${{paid:'配送中',delivered:'已送达',received:'已领取',cancelled:'已取消'}[o.status]}</p><small>${esc(data.destinations.find(x=>x.id===o.address)?.name||o.address)} · ${time(o.due)}</small><div class="world-tabs">${o.status==='paid'?btn('cancel','取消并退款','secondary',`data-id="${o.id}"`):o.status==='delivered'?btn('receive','领取到背包','primary',`data-id="${o.id}"`):''}</div></article>`).join('')||'<p class="hint">暂无订单</p>'}</div>`;
      if(section==='worldcalendar'||section==='calendar') html+=`<div class="group">${data.dailyPlans.map(e=>`<article class="world-event">${esc(e.time)} · ${esc(e.title)}<small>${e.done?'已完成':'待办'}</small></article>`).join('')}${data.calendar.map(e=>`<article class="world-event"><b>${esc(e.title)}</b><p>${time(e.start)} · ${e.duration} 分钟 · ${e.reminded?'已提醒':'待办'}</p>${btn('delete','删除','text-button',`data-id="${e.id}"`)}</article>`).join('')}</div><details class="group pad" open><summary>新增日程</summary><div class="world-form">${field('标题','<input data-world-field="title" maxlength="100">')}${field('选择日期',`<input data-world-field="day" type="date" min="${data.calendarDate.iso}" value="${data.calendarDate.iso}">`)}${field('开始时间','<input data-world-field="time" type="time" value="19:00">')}${field('时长（分钟）','<input data-world-field="duration" type="number" min="1" max="1440" value="30">')}${field('地点',`<select data-world-field="location">${destinations()}</select>`)}${btn('calendar','保存日程','primary')}</div></details>`;
      if(section==='worldmessages'||section==='messages') {
        const thread=(data.conversation||[]);
        const shown=thread.length?thread.map(m=>{
          const outgoing=m.direction==='outgoing';
          const waiting=outgoing&&m.expectsReply&&!m.answered;
          const sent=outgoing?'<span class="sms-state" aria-label="已送达，对方已获知"><span class="sms-read-animation"><i>未读</i><b>已读 ✓</b></span></span>':'';
          return `<article class="sms-bubble ${outgoing?'outgoing':'incoming'}" data-message-id="${esc(m.id)}"><time>${esc(time(m.at))} · ${outgoing?'我':esc(data.other.name)}</time><p>${esc(m.text)}</p>${sent}${waiting?btn('retry-reply','重新请求对方回复','text-button',`data-id="${esc(m.id)}"`):''}</article>`;
        }).join(''):data.messages.map(m=>`<article class="sms-bubble incoming"><time>${esc(historicalTime(m.at))}</time><p>${esc(m.text)}</p></article>`).join('');
        html+=`<div class="sms-thread" aria-label="真实双向短信记录">${shown||'<p class="hint">暂无消息</p>'}</div>${!peek?`<div class="group world-form">${field('发给另一位主角','<textarea data-world-field="message" maxlength="1000" rows="3"></textarea>')}${btn('send','发送消息','primary')}</div>`:''}`;
      }
    }
    if(!peek)html+=`<details class="group pad"><summary>锁屏与共享许可</summary><div class="world-form">${field('锁屏',`<select data-world-field="locked">${options([['false','解锁'],['true','锁定']],String(data.locked))}</select>`)}${field('借用许可',`<select data-world-field="share">${options([['none','未授权'],['read','允许查看'],['write','允许代操作']],data.share)}</select>`)}${btn('device','保存手机设置','secondary')}</div></details>`;
    html+=`<details class="group pad"><summary>通知 ${data.notifications.filter(x=>!x.read).length}</summary>${[...data.notifications].reverse().map(n=>`<p>${esc(n.text)}<small>${time(n.at)}</small></p>`).join('')}${btn('read','全部标为已读','text-button')}</details><details class="group pad"><summary>手机操作记录</summary>${[...data.audit].reverse().map(e=>`<p>${esc(e.at)} · ${esc(e.actor)} · ${esc(e.detail)} · ${e.authorized?'已授权':'未授权'}</p>`).join('')||'<p>暂无他人访问</p>'}</details>`;
    v.root.dataset.worldOwner=data.owner;v.draw(html);
  }
  v.on('click','[data-action]',async el=>{
    if(pending&&!['retry','discard'].includes(el.dataset.action)) throw Error('请先重试或取消尚未保存的操作');
    switch(el.dataset.action){
      case 'appearance':if(await act({type:'appearance',appearance:{wallpaper:formValue('wallpaper'),theme:formValue('theme'),layout:formValue('layout')}}))ctx.win.stTtsPhone?.home?.(true);break;
      case 'retry': await act(pending.command,pending.owner);break;
      case 'discard':pending=null;data=base();peek=false;section=id;render();break;
      case 'own':refresh();break;
      case 'inspect':{const own=base(),owner=own.other.id;data=own;if(await act({type:'inspect',section:el.dataset.section},owner)){peek=true;section=el.dataset.section;render();}break;}
      case 'buy':{const item=data.catalog.find(x=>x.id===el.dataset.item),kind=section==='worlddelivery'?'delivery':'shop',address=formValue('address'),card=formValue('card');if(await ctx.confirm(`确认购买${item.name}？`,`共 ${money(item.price*100+(kind==='delivery'?300:0))}，从 ${cardNames[card]} 支付。`))await act({type:'order',kind,itemId:item.id,quantity:1,card,address});break;}
      case 'cancel':await act({type:'cancel_order',id:el.dataset.id});break;
      case 'receive':await act({type:'receive_order',id:el.dataset.id});break;
      case 'transfer':await act({type:'transfer',from:formValue('from'),to:formValue('to'),cents:Math.round(Number(formValue('amount'))*100)});break;
      case 'calendar':{const [h,m]=formValue('time').split(':').map(Number);await act({type:'calendar_save',id:requestId(ctx.win),title:formValue('title'),locationId:formValue('location'),start:(gameDayForDate(formValue('day'))-1)*1440+h*60+m,duration:Number(formValue('duration'))});break;}
      case 'delete':await act({type:'calendar_delete',id:el.dataset.id});break;
      case 'send':await act({type:'send_message',text:formValue('message')});break;
      case 'retry-reply':try{data=await api().retryReply(el.dataset.id);render();ctx.notify('对方已回复');}catch(e){ctx.notify(e.message,{error:true});}break;
      case 'device':await act({type:'device',locked:formValue('locked')==='true',share:formValue('share')});break;
      case 'read':await act({type:'read_notifications'});break;
    }
  });
  v.refresh=()=>{try{refresh();}catch(e){v.draw(heading(labels[id])+`<p>${esc(e.message)}</p>`);}};
  v.refresh();
  // Use the host's short-lived data subscription instead of a background poll.
  // A disposed app unregisters itself at the next update.
  stopUpdates=api()?.subscribe?.(()=>{
    if(v.disposed){stopUpdates();return;}
    if(!data||pending||peek)return;
    try{const next=base();if(next.revision!==data.revision){data=next;render();}}
    catch(e){ctx.notify(e.message,{error:true});}
  })||(()=>{});
  return v;
}
export const worldPhoneFactories=Object.fromEntries(Object.keys(labels).map(id=>[id,ctx=>worldApp(ctx,id)]));
