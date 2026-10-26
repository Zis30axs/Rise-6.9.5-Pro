// Private card-specific apps. Loaded through the existing ST-iPhonie app registry.
import {createView, esc, btn, heading} from 'UNREAD_CITY_PHONE_COMMON';
import {phoneArt} from 'UNREAD_CITY_PHONE_ART';
import {renderWorldMessenger,worldMessageRows,renderBandPanel} from 'UNREAD_CITY_PHONE_CHAT';
import {worldCardArt,worldDeviceHeading,worldAppearance} from 'UNREAD_CITY_PHONE_VISUALS';
export {applyWorldPhoneTheme,worldPhoneHome,worldPhoneIcon,worldPhoneState,worldPhoneTheme,saveWorldPhoneTheme} from 'UNREAD_CITY_PHONE_VISUALS';
const labels = {worldstyle:'桌面与外观',appie:'Appie Pay',worldshop:'购物',worlddelivery:'外卖',worldcalendar:'日历',worldpeek:'查手机',worldmessages:'消息',twiitch:'Twiitch'};
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
const twiitchImage = key => {const svg=phoneArt[key];return svg?`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`:'';};
/** Fully local, read-only Twiitch channel. It never starts a stream, calls a model or changes world state. */
function twiitchView(data, activeChannel = 'kaguya', show3d = false) {
  const hour = Number.isFinite(data.clock?.hour) ? data.clock.hour : 12;
  const wordmark = twiitchImage('twiitch/wordmark.svg');
  const overlay = twiitchImage('twiitch/stream-overlay.svg');
  const reaction = key => twiitchImage(`twiitch/reaction-${key}.svg`);

  const channels = {
    kaguya: {
      id: 'kaguya',
      tabLabel: '✨ 辉夜姬 · 月读空间',
      name: '辉夜姬 · 月读空间（Tsukuyomi Live）',
      tag: '虚拟歌姬 · 音乐创作与月读舞台（Model: 水色の描）',
      hoursLabel: '直播时段：18:00–21:00',
      isLive: hour >= 18 && hour < 21,
      cover: twiitchImage('twiitch/kaguya-channel-cover.svg'),
      avatar: twiitchImage('twiitch/kaguya-avatar.svg'),
      streamCard: twiitchImage('twiitch/kaguya-stream-card.svg'),
      offlineCard: twiitchImage('twiitch/kaguya-offline-card.svg'),
      livePost: '「月读空间已接入！今晚是新曲创作与即兴弹唱Live，来和我一起把歌声传回月亮吧♪」',
      offlinePost: '「今天在彩叶的房间写新曲～下次月读舞台Live时间已预约，记得准时入场哦✨」',
      badgeColor: '#7b42f6',
      reactions: [
        { key: 'star', label: '星光' },
        { key: 'heart', label: '打call' },
        { key: 'wave', label: '挥手' },
        { key: 'cat', label: '月兔' }
      ]
    },
    coco: {
      id: 'coco',
      tabLabel: '🌙 泽渡可可 · 夜间频道',
      name: '泽渡可可 · 夜间频道',
      tag: '日常杂谈 · 镜头前营业',
      hoursLabel: '直播时段：20:00–23:00',
      isLive: hour >= 20 && hour < 23,
      cover: twiitchImage('twiitch/coco-channel-cover.svg'),
      avatar: twiitchImage('twiitch/coco-avatar.svg'),
      streamCard: twiitchImage('twiitch/stream-overlay.svg'),
      offlineCard: twiitchImage('twiitch/offline-card.svg'),
      livePost: '「今晚继续闲聊，镜头前营业，镜头后照旧。」',
      offlinePost: '「直播已结束。下次开播时间由可可以自己的日程决定。」',
      badgeColor: '#b23b4e',
      reactions: [
        { key: 'heart', label: '喜欢' },
        { key: 'star', label: '收藏' },
        { key: 'wave', label: '打招呼' },
        { key: 'cat', label: '猫咪' }
      ]
    }
  };

  const ch = channels[activeChannel] || channels.kaguya;
  const live = ch.isLive;
  const cardImg = live ? (ch.streamCard || ch.offlineCard) : ch.offlineCard;

  return `<style>.tp-channel{display:grid;gap:12px;padding:0 4px 14px}.tp-channel-switch{display:flex;gap:8px;padding:2px 2px 6px;overflow-x:auto}.tp-channel-switch button{font-size:12px;padding:6px 14px;border-radius:999px;border:1px solid #8884;background:#8881;color:inherit;cursor:pointer;white-space:nowrap;min-height:36px;transition:all .15s}.tp-channel-switch button.active{background:${ch.badgeColor};color:#fff;border-color:transparent;font-weight:600}.tp-cover{position:relative;border-radius:14px;overflow:hidden;background:#1b1722;min-height:96px}.tp-cover img{display:block;width:100%;height:auto}.tp-wm{position:absolute;left:10px;top:8px;width:74px;max-height:22px;opacity:.95}.tp-head{display:flex;align-items:center;gap:10px;padding:0 2px}.tp-head img.tp-avatar{width:52px;height:52px;border-radius:50%;background:#fff2;padding:3px}.tp-head strong{display:block;font-size:15px}.tp-head small{display:block;opacity:.75}.tp-live{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;background:${ch.badgeColor};color:#fff;font-size:12px}.tp-live.off{background:#6668}.tp-card{position:relative;border-radius:14px;overflow:hidden;background:#191622;color:#f6eef6}.tp-card img{display:block;width:100%;height:auto}.tp-overlay{position:absolute;right:6px;bottom:6px;width:42%}.tp-reactions{display:flex;gap:8px;flex-wrap:wrap}.tp-reactions figure{display:flex;align-items:center;gap:5px;margin:0;padding:6px 10px;border:1px solid #8884;border-radius:999px;background:#8881}.tp-reactions img{width:22px;height:22px}.tp-post{padding:12px;border:1px solid #8883;border-radius:14px;background:#8881}.tp-post p{margin:6px 0 0}.tp-note{font-size:12px;opacity:.75;line-height:1.5}</style>
  <section class="tp-channel" aria-label="Twiitch 频道">
    <div class="tp-channel-switch" role="tablist" aria-label="频道切换">
      ${Object.values(channels).map(c=>`<button type="button" class="${c.id===ch.id?'active':''}" data-action="switch-twiitch" data-channel="${c.id}" role="tab" aria-selected="${c.id===ch.id}">${esc(c.tabLabel)}</button>`).join('')}
    </div>
    <div class="tp-cover">${ch.cover?`<img src="${ch.cover}" alt="${esc(ch.name)}封面">`:''}${wordmark?`<img class="tp-wm" src="${wordmark}" alt="Twiitch">`:''}</div>
    <div class="tp-head">${ch.avatar?`<img class="tp-avatar" src="${ch.avatar}" alt="${esc(ch.name)}头像">`:''}<div><strong>${esc(ch.name)}</strong><small>${live?ch.hoursLabel:'当前不在直播时段'}</small></div><span class="tp-live ${live?'':'off'}">${live?'直播中':'离线'}</span></div>
    ${ch.id==='kaguya'&&show3d?`<div class="tp-card tp-card-3d" style="position:relative;border-radius:14px;overflow:hidden;background:#0d0a18;min-height:500px;border:1px solid #7b42f688;box-shadow:0 8px 24px rgba(123,66,246,0.25);">
      <iframe class="tp-3d-iframe" src="outputs/kaguya-live-3d-demo.html" allow="autoplay" style="width:100%;height:500px;border:none;display:block;background:#070412;" title="超かぐや姫！3D 沉浸直播间"></iframe>
      <div style="position:absolute;top:8px;right:8px;z-index:10;display:flex;gap:6px;">
        <a href="outputs/kaguya-live-3d-demo.html" target="_blank" rel="noopener" style="font-size:11px;padding:4px 10px;border-radius:999px;background:rgba(20,15,35,0.85);backdrop-filter:blur(6px);color:#e9d5ff;border:1px solid #7b42f688;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">全屏 ↗</a>
        <button type="button" data-action="toggle-twiitch-3d" style="font-size:11px;padding:4px 10px;border-radius:999px;background:rgba(20,15,35,0.85);backdrop-filter:blur(6px);color:#f3e8ff;border:1px solid #7b42f688;cursor:pointer;">收起 3D ✕</button>
      </div>
      <div style="padding:8px 12px;background:#140e24;display:flex;justify-content:space-between;align-items:center;font-size:12px;border-top:1px solid #7b42f633;">
        <span style="color:#d8b4fe;">✨ 3D 舞台视角已激活 (支持触摸旋转/动作交互/姿态切换)</span>
      </div>
    </div>`:`<div class="tp-card" style="position:relative;border-radius:14px;overflow:hidden;background:#191622;color:#f6eef6">${cardImg?`<img src="${cardImg}" alt="Twiitch 直播画面">`:''}${live&&overlay&&ch.id==='coco'?`<img class="tp-overlay" src="${overlay}" alt="直播边框">`:''}${ch.id==='kaguya'?`<div style="position:absolute;left:8px;bottom:8px;right:8px;display:flex;justify-content:space-between;align-items:center;background:rgba(15,10,26,0.88);backdrop-filter:blur(8px);border:1px solid rgba(123,66,246,0.45);border-radius:10px;padding:7px 10px;box-shadow:0 4px 14px rgba(0,0,0,0.5);">
      <div style="font-size:11px;line-height:1.4;">
        <strong style="color:#e9d5ff;display:block;">✨ 3D 真实模型互动就绪</strong>
        <span style="font-size:10px;opacity:0.85;color:#c084fc;">胸锁呼吸 · 动作细化 (比心/挥手)</span>
      </div>
      <button type="button" data-action="toggle-twiitch-3d" style="font-size:11px;padding:5px 12px;border-radius:999px;border:none;background:linear-gradient(135deg,#7b42f6,#ff7ebb);color:#fff;cursor:pointer;font-weight:600;box-shadow:0 2px 10px rgba(123,66,246,0.5);white-space:nowrap;">开启 3D 舞台</button>
    </div>`:''}</div>`}
    <div class="tp-reactions" aria-label="频道反应">${ch.reactions.map(r=>{const src=reaction(r.key);return src?`<figure><img src="${src}" alt=""><span>${esc(r.label)}</span></figure>`:'';}).join('')}</div>
    <article class="tp-post"><strong>最近的频道动态</strong><p>${esc(live?ch.livePost:ch.offlinePost)}</p><p class="tp-note">这是本地静态频道展示，只读取游戏时钟；不会开播、发消息或调用模型。</p></article>
  </section>`;
}
function worldApp(ctx,id) {
  const v=createView(ctx,id), api=()=>ctx.win.parent.__unreadCityWorldPhone;
  let data=null,section=id,peek=false,pending=null,recipient='protagonist',chatMode='list',twiitchChannel='kaguya',twiitch3d=false,bandPanelOpen=false;
  const drafts=new Map();
  let stopUpdates=()=>{},stopPhoneUpdates=()=>{},reading=false;
  const protagonistTarget=()=>recipient.startsWith('protagonist:')?recipient.slice('protagonist:'.length):data.other.id;
  const protagonistName=()=>(data.others||[]).find(x=>x.id===protagonistTarget())?.name||data.other.name;
  async function readSelectedContact() {
    if(reading||v.disposed||peek||id!=='worldmessages'||chatMode!=='thread'||ctx.doc.hidden||ctx.visible?.(id)===false||!data||!ctx.api.listThreads)return;
    const contactId=recipient.startsWith('npc:')?data.npcPhone?.contacts.find(c=>c.id===recipient.slice(4))?.contactId:recipient.startsWith('protagonist')?'protagonist-'+protagonistTarget():null;
    if(!contactId)return;
    const binding=data.binding,selected=recipient;
    reading=true;
    try {
      const threads=await ctx.api.listThreads();
      if(v.disposed||ctx.doc.hidden||ctx.visible?.(id)===false||recipient!==selected||api()?.read().binding!==binding)return;
      for(const thread of threads)if(thread.storyLink?.npcId===contactId&&thread.unread)await ctx.api.markThreadRead(thread.id);
    } catch { /* Reading can retry after phone synchronization. */ }
    finally {reading=false;}
  }
  const options=(rows,current)=>rows.map(([value,label])=>`<option value="${esc(value)}" ${value===current?'selected':''}>${esc(label)}</option>`).join('');
  const destinations=()=>options(data.destinations.map(x=>[x.id,x.name]),data.locationId);
  const cards=()=>options(Object.entries(cardNames),'gpt');
  const payees=()=>options([...(data.others||[]).map(x=>[x.id,x.name]),...(data.npcPhone?.contacts||[]).map(c=>[c.id,c.name])],'');
  const payeeName=value=>[...(data.others||[]),...(data.npcPhone?.contacts||[])].find(x=>x.id===value)?.name||value;
  const transferArt=`<svg class="transfer-art" viewBox="0 0 320 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="联系人转账示意：款项从我的卡转入对方账户"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="10" y="16" width="100" height="40" rx="8" opacity=".5"/><path d="M10 28h100" opacity=".3"/><rect x="210" y="16" width="100" height="40" rx="8" opacity=".5"/><path d="M210 28h100" opacity=".3"/></g><text x="20" y="48" font-size="11" fill="currentColor" opacity=".8">我的卡</text><text x="220" y="48" font-size="11" fill="currentColor" opacity=".8">对方账户</text><g stroke="#8fbf9f" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M124 36h56" stroke-dasharray="7 6"/><path d="M172 28l10 8-10 8"/></g><circle cx="152" cy="36" r="11" fill="#8fbf9f" opacity=".22"/><text x="152" y="40" text-anchor="middle" font-size="12" font-weight="600" fill="#8fbf9f">¥</text></svg>`;
  const field=(label,input)=>`<label class="world-field">${esc(label)}${input}</label>`;
  function base() {
    if(!api()) throw Error('请先进入未读之城再使用应用');
    return api().read();
  }
  async function act(command,owner=data.owner) {
    pending??={binding:data.binding,revision:data.revision,requestId:requestId(ctx.win),owner,command};
    try {const saved=await api().act(pending);pending=null;data=saved.owner===saved.active?base():saved;render();if(!['send_message','send_npc_message','send_group_message'].includes(command.type))ctx.notify('已保存');return true;}
    catch(e){render();ctx.notify(e.message,{error:true});return false;}
  }
  function refresh() {bandPanelOpen=false;const before=data?.owner;data=base();section=id;peek=false;pending=null;if(before && before!==data.owner)chatMode='list';render();}
  const formValue=name=>v.root.querySelector(`[data-world-field="${name}"]`)?.value;
  function render() {
    if(v.disposed)return;
    if(id==='worldmessages'){
      if(bandPanelOpen){v.root.classList.remove('chat-mode');v.draw(renderBandPanel({...data,pendingBandSave:!!pending},{esc,btn,heading,time}));return;}
      const previous=v.root.querySelector('[data-keep-scroll]'),atBottom=!previous || previous.scrollHeight-previous.scrollTop-previous.clientHeight<70;
      const screen=renderWorldMessenger({data,recipient,mode:chatMode,drafts,pending},{esc,btn,heading,time});
      recipient=screen.recipient;
      v.root.dataset.worldOwner=data.owner;
      v.root.classList.toggle('chat-mode',chatMode==='thread');
      v.draw(screen.html);
      const current=v.root.querySelector('[data-keep-scroll]');
      if(current&&atBottom)current.scrollTop=current.scrollHeight;
      void readSelectedContact();
      return;
    }
    v.root.classList.remove('chat-mode');
    let html=heading(labels[id],'','Unread City')+`<p class="world-time">${esc(data.name)} · ${esc(time(data.now))}</p>`;
    if(data.reporting && (id==='worldcalendar' || id==='worldmessages')) html+=`<p class="hint">${esc(data.reporting)}</p>`;
    html+='<style>.world-time{margin:0 4px 14px;font-size:13px;line-height:1.5;overflow-wrap:anywhere}.sms-thread{display:grid;gap:8px;padding:12px}.sms-bubble{max-width:90%;padding:10px 13px;border-radius:14px;border:1px solid #8883;background:#8881;overflow-wrap:anywhere}.sms-bubble.outgoing{justify-self:end;background:#8aae8740}.sms-bubble.incoming{justify-self:start}.sms-bubble time{display:block;font-size:11px;opacity:.75}.sms-bubble p{margin:7px 0}.sms-bubble .sms-state{font-size:11px;opacity:.75;display:block;text-align:right}.sms-read-animation{position:relative;display:inline-grid}.sms-read-animation>i,.sms-read-animation>b{grid-area:1/1;font-style:normal}.sms-read-animation>i{animation:sms-unread-out .8s step-end forwards}.sms-read-animation>b{visibility:hidden;animation:sms-read-in .8s step-end forwards}@keyframes sms-unread-out{0%,75%{visibility:visible}76%,100%{visibility:hidden}}@keyframes sms-read-in{0%,75%{visibility:hidden}76%,100%{visibility:visible}}.world-field{display:grid;gap:7px;margin:12px 0}.world-field input,.world-field select,.world-field textarea{box-sizing:border-box;width:100%;min-height:44px;padding:10px;border:1px solid #8885;border-radius:10px;background:var(--card,#fff);color:inherit}.world-product,.world-event{padding:14px;border-bottom:1px solid #8883;overflow-wrap:anywhere}.world-product button,.world-event button{min-height:44px}.world-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.world-tabs button{min-height:44px}.world-notice{padding:12px;background:#c9a65422;border-radius:12px}.world-form{padding:12px}.world-form button{min-height:44px}.transfer-art{display:block;width:100%;height:auto;margin:2px 0 8px}</style>';
    const identity=worldDeviceHeading(data), appearance=worldAppearance(data);
    html+=`<div class="world-device-header"><div><strong>${esc(identity.device)}</strong><small>${esc(identity.title)}</small></div></div>`;
    if(id==='worldstyle')html+=`<div class="group pad world-appearance"><p class="hint">外观保存在这台手机的剧情存档中。</p>${field('壁纸',`<select data-world-field="wallpaper">${options([['signature',identity.title],['plain','纯色']],appearance.wallpaper)}</select>`)}${field('界面主题',`<select data-world-field="theme">${options([['light','日间'],['dark','夜间'],['system','跟随系统']],appearance.theme)}</select>`)}${field('应用排列',`<select data-world-field="layout">${options([['daily','日常'],['focus','专注']],appearance.layout)}</select>`)}${btn('appearance','保存外观','primary')}</div>`;
    if(pending) html+=`<div class="world-notice">${btn('retry','重试保存','secondary')}${btn('discard','取消本次操作','text-button')}</div>`;
    if(id==='worldpeek'&&!peek){
      html+=`<div class="group pad"><h3>${esc(data.other.name)}的手机</h3><p>${esc(data.other.reason||'手机在身边，可以选择查看内容。')}</p><p class="hint">读取与代操作会留下记录。锁屏和许可由手机主人设置。</p><div class="world-tabs">${['wallet','calendar','orders','messages'].map(x=>btn('inspect',({wallet:'Appie Pay',calendar:'日历',orders:'订单',messages:'消息'})[x],'secondary',`data-section="${x}" ${data.other.read?'':'disabled'}`)).join('')}</div></div>`;
    } else {
      if(id==='worldpeek')html+=`<p class="world-notice">正在查看${esc(data.name)}的真实手机记录。${btn('own','返回自己的手机','text-button')}</p><div class="world-tabs">${['wallet','calendar','orders','messages'].map(x=>btn('inspect',({wallet:'Appie Pay',calendar:'日历',orders:'订单',messages:'消息'})[x],'secondary',`data-section="${x}"`)).join('')}</div>`;
      if(section==='appie'||section==='wallet') {
        html+=`<div class="wallet-card"><small>Appie Pay · 游戏账户</small><strong>${money(total(data))}</strong></div><div class="world-cards">${Object.entries(cardNames).map(([key,label])=>`<article class="world-card ${key}" data-card-owner="${data.owner}" aria-label="${esc(data.name)}的${label}"><span class="world-card-art" style='background-image:${worldCardArt(data.owner,key)}' aria-hidden="true"></span><div class="world-card-brand"><span>${label}</span><small>APPIE PAY</small></div><strong class="world-card-balance">${money(data.cards[key])}</strong><div class="world-card-holder"><span>${esc(data.name)}<small> · 游戏账户</small></span><span>•• ${{soyo:'0101',sakiko:'0202',emma:'0303',renako:'0404'}[data.owner]} · ${key.toUpperCase()}</span></div></article>`).join('')}</div><details class="group pad"><summary>卡间转账</summary><div class="world-form">${field('转出卡',`<select data-world-field="from">${cards()}</select>`)}${field('转入卡',`<select data-world-field="to">${options(Object.entries(cardNames),'claude')}</select>`)}${field('金额（元）','<input data-world-field="amount" type="number" min="0.01" step="0.01">')}${btn('transfer','确认转账','primary')}</div></details>${!peek?`<details class="group pad"><summary>联系人转账</summary>${transferArt}<div class="world-form">${field('收款人',`<select data-world-field="payee">${payees()}</select>`)}${field('转出卡',`<select data-world-field="payFrom">${cards()}</select>`)}${field('金额（元）','<input data-world-field="payAmount" type="number" min="0.01" step="0.01">')}${btn('send-transfer','确认转账','primary')}</div><p class="hint">转给另一位主角或已保存的联系人，双边同时入账与扣款，对方会收到通知。</p></details>`:''}<div class="group">${[...data.ledger].reverse().map(e=>`<article class="world-event"><b>${esc(e.note)}</b><p>${money(e.deltaCents)} · ${cardNames[e.card]}</p></article>`).join('')||'<p class="hint">暂无流水</p>'}</div>`;
      }
      if(section==='worldshop'||section==='worlddelivery') {
        const delivery=section==='worlddelivery';
        html+=`<div class="group pad">${field('收货地点',`<select data-world-field="address">${destinations()}</select>`)}${field('支付卡',`<select data-world-field="card">${cards()}</select>`)}<p class="hint">${delivery?'配送费 ¥3，预计 30 游戏分钟':'免运费，预计 60 游戏分钟'}。确认后扣款，送达后领取到背包。</p></div><div class="group">${data.catalog.filter(x=>!delivery||x.category!=='cigarette').map(x=>`<article class="world-product"><strong>${esc(x.name)}</strong><p>¥${x.price} / ${esc(x.purchaseUnit)}</p>${btn('buy','下单','secondary',`data-item="${x.id}"`)}</article>`).join('')}</div>`;
      }
      if(['worldshop','worlddelivery','orders'].includes(section)) html+=`<h3>我的订单</h3><div class="group">${[...data.orders].reverse().map(o=>`<article class="world-event"><strong>${esc(data.catalog.find(x=>x.id===o.itemId)?.name||o.itemId)}</strong><p>${money(o.totalCents)} · ${{paid:'配送中',delivered:'已送达',received:'已领取',cancelled:'已取消'}[o.status]}</p><small>${esc(data.destinations.find(x=>x.id===o.address)?.name||o.address)} · ${time(o.due)}</small><div class="world-tabs">${o.status==='paid'?btn('cancel','取消并退款','secondary',`data-id="${o.id}"`):o.status==='delivered'?btn('receive','领取到背包','primary',`data-id="${o.id}"`):''}</div></article>`).join('')||'<p class="hint">暂无订单</p>'}</div>`;
      if(section==='worldcalendar'||section==='calendar') html+=`<div class="group">${data.dailyPlans.map(e=>`<article class="world-event">${esc(e.time)} · ${esc(e.title)}<small>${e.done?'已完成':'待办'}</small></article>`).join('')}${data.calendar.map(e=>`<article class="world-event"><b>${esc(e.title)}</b><p>${time(e.start)} · ${e.duration} 分钟 · ${e.reminded?'已提醒':'待办'}</p>${btn('delete','删除','text-button',`data-id="${e.id}"`)}</article>`).join('')}</div><details class="group pad" open><summary>新增日程</summary><div class="world-form">${field('标题','<input data-world-field="title" maxlength="100">')}${field('选择日期',`<input data-world-field="day" type="date" min="${data.calendarDate.iso}" value="${data.calendarDate.iso}">`)}${field('开始时间','<input data-world-field="time" type="time" value="19:00">')}${field('时长（分钟）','<input data-world-field="duration" type="number" min="1" max="1440" value="30">')}${field('地点',`<select data-world-field="location">${destinations()}</select>`)}${btn('calendar','保存日程','primary')}</div></details>`;
      if(id==='twiitch') html+=twiitchView(data,twiitchChannel,twiitch3d);
      if(section==='worldmessages'||section==='messages') {
        const social=data.npcPhone||{contacts:[],requests:[],groups:[],messages:[]};
        const protagonistRows=(data.others||[]).map(other=>['protagonist:'+other.id,other.name]);
        const recipients=[...protagonistRows,['protagonist',data.other.name],...social.contacts.map(c=>['npc:'+c.id,c.name]),...social.groups.map(g=>['group:'+g.id,`${g.name}（${g.memberCount}人）`])];
        if(!recipients.some(r=>r[0]===recipient))recipient='protagonist';
        const isNpc=recipient.startsWith('npc:'),isGroup=recipient.startsWith('group:');
        const targetId=isNpc?recipient.slice(4):isGroup?recipient.slice(6):null;
        const thread=targetId?social.messages.filter(m=>m.channel===(isNpc?'npc':'group')&&m.targetId===targetId):(data.conversation||[]);
        const canonicalIds=new Set(thread.map(row=>row.id));
        const contactId=isNpc?social.contacts.find(c=>c.id===targetId)?.contactId:'protagonist-'+protagonistTarget();
        const legacy=isGroup?'':data.messages.filter(m=>m.npcId===contactId&&!canonicalIds.has(m.id))
          .map(m=>`<article class="sms-bubble incoming"><time>${esc(historicalTime(m.at))}</time><p>${esc(m.text)}</p></article>`).join('');
        const shown=legacy+thread.map(m=>{
          const outgoing=m.direction==='outgoing';
          const waiting=outgoing&&(targetId?m.status==='pending':m.expectsReply&&!m.answered);
          const sent=outgoing?'<span class="sms-state" aria-label="已送达，对方已获知"><span class="sms-read-animation"><i>未读</i><b>已读 ✓</b></span></span>':'';
          const silent=outgoing&&m.status==='silent'?'<span class="sms-state">暂未回复</span>':'';
          return `<article class="sms-bubble ${outgoing?'outgoing':'incoming'}" data-message-id="${esc(m.id)}"><time>${esc(time(m.at))} · ${outgoing?'我':esc(m.speakerName||protagonistName())}</time><p>${esc(m.text)}</p>${sent}${silent}${waiting?btn('retry-reply','重新请求对方回复','text-button',`data-id="${esc(m.id)}"`):''}</article>`;
        }).join('');
        const requests=peek?'':social.requests.filter(q=>q.status==='pending').map(q=>`<article class="world-event"><strong>${esc(q.name)}${q.kind==='group'?'邀请你加入群聊':'希望添加联系方式'}</strong><p>${esc(q.quote)}</p><div class="world-tabs">${btn('accept-contact','接受','primary',`data-id="${esc(q.id)}"`)}${btn('decline-contact','婉拒','secondary',`data-id="${esc(q.id)}"`)}</div></article>`).join('');
        if(requests)html+=`<section class="group" aria-label="联系申请">${requests}</section>`;
        html+=`<div class="world-form">${field('会话',`<select data-world-field="recipient">${options(recipients,recipient)}</select>`)}</div><div class="sms-thread" aria-label="真实双向短信记录">${shown||'<p class="hint">暂无消息</p>'}</div>${!peek?`<div class="group world-form">${field('发送消息',`<textarea data-world-field="message" maxlength="1000" rows="3">${esc(drafts.get(recipient)||'')}</textarea>`)}${btn('send','发送消息','primary')}</div>`:''}`;
      }
    }
    html+=`<details class="group pad"><summary>通知 ${data.notifications.filter(x=>!x.read).length}</summary>${[...data.notifications].reverse().map(n=>`<p>${esc(n.text)}<small>${time(n.at)}</small></p>`).join('')}${btn('read','全部标为已读','text-button')}</details><details class="group pad"><summary>手机操作记录</summary>${[...data.audit].reverse().map(e=>`<p>${esc(e.at)} · ${esc(e.actor)} · ${esc(e.detail)} · ${e.authorized?'已授权':'未授权'}</p>`).join('')||'<p>暂无他人访问</p>'}</details>`;
    v.root.dataset.worldOwner=data.owner;v.draw(html);void readSelectedContact();
  }
  v.on('click','[data-action]',async el=>{
    if(pending&&!['retry','discard'].includes(el.dataset.action)) throw Error('请先重试或取消尚未保存的操作');
    switch(el.dataset.action){
      case 'open-bands':bandPanelOpen=true;render();break;
      case 'close-bands':bandPanelOpen=false;render();break;
      case 'band-invite': {
        if(!formValue('band')||!formValue('band-contact')||!formValue('band-role'))throw Error('请选择乐队、联系人和分工');
        await act({type:'band_invite',bandId:formValue('band'),contactId:formValue('band-contact'),role:formValue('band-role')});break;
      }
      case 'band-reply':await v.busy(el,async()=>{data=await api().retryReply(el.dataset.id);render();});break;
      case 'open-thread':
        if(id!=='worldmessages')break;
        recipient=el.dataset.recipient;chatMode='thread';render();break;
      case 'back-to-inbox':
        if(id!=='worldmessages')break;
        chatMode='list';render();break;
      case 'wait-read':{
        if(id!=='worldmessages'||pending)break;
        const minutes=Number(el.dataset.minutes);
        data=await api().waitForRead({binding:data.binding,revision:data.revision,now:data.now,minutes});
        render();ctx.notify('游戏时间已推进 '+minutes+' 分钟（不会自动调用 LLM）');break;
      }
      case 'request-reply':{
        if(id!=='worldmessages'||pending||chatMode!=='thread')break;
        const rows=worldMessageRows(data,recipient);
        const latest=[...rows].reverse().find(m=>m.direction==='outgoing'&&m.replyTo==null);
        if(!latest || latest.id!==el.dataset.id || !(latest.status==='pending'||latest.expectsReply&&!latest.answered))
          throw Error('消息状态已更新，请重新打开会话');
        await v.busy(el,async()=>{
          data=await api().retryReply(latest.id);
          render();ctx.notify('短信回复已处理');
        });
        break;
      }
      case 'appearance':if(await act({type:'appearance',appearance:{wallpaper:formValue('wallpaper'),theme:formValue('theme'),layout:formValue('layout')}}))ctx.win.stTtsPhone?.home?.(true);break;
      case 'retry': await act(pending.command,pending.owner);break;
      case 'discard':pending=null;data=base();peek=false;section=id;render();break;
      case 'own':refresh();break;
      case 'switch-twiitch':twiitchChannel=el.dataset.channel||'kaguya';twiitch3d=false;render();break;
      case 'toggle-twiitch-3d':twiitch3d=!twiitch3d;render();break;
      case 'inspect':{const own=base(),owner=own.other.id;data=own;if(await act({type:'inspect',section:el.dataset.section},owner)){peek=true;section=el.dataset.section;render();}break;}
      case 'buy':{const item=data.catalog.find(x=>x.id===el.dataset.item),kind=section==='worlddelivery'?'delivery':'shop',address=formValue('address'),card=formValue('card');if(await ctx.confirm(`确认购买${item.name}？`,`共 ${money(item.price*100+(kind==='delivery'?300:0))}，从 ${cardNames[card]} 支付。`))await act({type:'order',kind,itemId:item.id,quantity:1,card,address});break;}
      case 'cancel':await act({type:'cancel_order',id:el.dataset.id});break;
      case 'receive':await act({type:'receive_order',id:el.dataset.id});break;
      case 'transfer':await act({type:'transfer',from:formValue('from'),to:formValue('to'),cents:Math.round(Number(formValue('amount'))*100)});break;
      case 'send-transfer':{const to=formValue('payee'),from=formValue('payFrom'),amount=Math.round(Number(formValue('payAmount'))*100);if(!(amount>0))throw Error('请输入大于 0 的转账金额');if(await ctx.confirm('确认转账？',`向${payeeName(to)}转 ${money(amount)}，从 ${cardNames[from]} 支付。`))await act({type:'send_transfer',to,from,cents:amount});break;}
      case 'calendar':{const [h,m]=formValue('time').split(':').map(Number);await act({type:'calendar_save',id:requestId(ctx.win),title:formValue('title'),locationId:formValue('location'),start:(gameDayForDate(formValue('day'))-1)*1440+h*60+m,duration:Number(formValue('duration'))});break;}
      case 'delete':await act({type:'calendar_delete',id:el.dataset.id});break;
      case 'send':{const message=id==='worldmessages'?drafts.get(recipient):formValue('message');if(!message?.trim()){ctx.notify('请先输入消息');break;}const command=recipient.startsWith('npc:')?{type:'send_npc_message',npcId:recipient.slice(4),text:message}:recipient.startsWith('group:')?{type:'send_group_message',groupId:recipient.slice(6),text:message}:recipient.startsWith('protagonist:')?{type:'send_message',to:protagonistTarget(),text:message}:{type:'send_message',text:message};if(await act(command)){drafts.delete(recipient);render();}break;}
      case 'accept-contact':case 'decline-contact':await act({type:'resolve_contact_request',id:el.dataset.id,accept:el.dataset.action==='accept-contact'});break;
      case 'retry-reply':try{data=await api().retryReply(el.dataset.id);render();ctx.notify('对方已回复');}catch(e){ctx.notify(e.message,{error:true});}break;
      case 'read':await act({type:'read_notifications'});break;
    }
  });
  v.openContact=contactId=>{data=base();peek=false;section=id;const contact=data.npcPhone?.contacts.find(c=>c.contactId===contactId);recipient=contact?'npc:'+contact.id:contactId.startsWith('protagonist-')?'protagonist:'+contactId.slice('protagonist-'.length):'protagonist';chatMode='thread';render();};
  v.on('change','[data-world-field="recipient"]',el=>{recipient=el.value;render();});
  v.on('input','[data-world-field="message"],[data-field="draft"]',el=>{drafts.set(recipient,el.value);});
  v.on('keydown','[data-field="draft"]',(el,event)=>{
    if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){
      event.preventDefault();v.root.querySelector('[data-action="send"]')?.click();
    }
  });
  v.back=()=>{if(bandPanelOpen){bandPanelOpen=false;render();return true;}if(id==='worldmessages'&&chatMode==='thread'){chatMode='list';render();return true;}return false;};
  v.refresh=()=>{try{refresh();}catch(e){v.draw(heading(labels[id])+`<p>${esc(e.message)}</p>`);}};
  v.refresh();
  // Use the host's short-lived data subscription instead of a background poll.
  // A disposed app unregisters itself at the next update.
  stopUpdates=api()?.subscribe?.(()=>{
    if(v.disposed){stopUpdates();return;}
    if(!data||pending||peek)return;
    try{const next=base();if(next.revision!==data.revision||next.now!==data.now||next.owner!==data.owner){data=next;render();}}
    catch(e){ctx.notify(e.message,{error:true});}
  })||(()=>{});
  stopPhoneUpdates=ctx.api.subscribe?.(event=>{if(event.type==='chat'||event.type==='space')void readSelectedContact();})||(()=>{});
  const dispose=v.dispose.bind(v);v.dispose=()=>{stopUpdates();stopPhoneUpdates();dispose();};
  return v;
}
export const worldPhoneFactories=Object.fromEntries(Object.keys(labels).map(id=>[id,ctx=>worldApp(ctx,id)]));


