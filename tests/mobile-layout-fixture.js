export function createFixture({ baselineCss, patchCss, mode = 'novel', safeBottom = 0, safeTop = 0 }) {
  document.body.innerHTML = '<input id="native-input" value="原生草稿不动">';
  document.body.style.cssText = 'margin:0';
  const root = document.createElement('div');
  root.setAttribute('data-unread-city-root', '');
  root.style.cssText = 'position:fixed;inset:0;height:100dvh;z-index:2147483000;isolation:isolate;';
  root.style.setProperty('--uc-safe-top', `${safeTop}px`);
  root.style.setProperty('--uc-safe-bottom', `${safeBottom}px`);
  const shadow = root.attachShadow({ mode: 'open' });
  const originalStyle = document.createElement('style'); originalStyle.textContent = baselineCss;
  const app = document.createElement('div'); app.id = 'unread-city-app';
  const labels = ['手机', '地图', '地点', '日程', '背包', '状态'];
  app.innerHTML = `<div class="uc-shell" data-presentation-mode="${mode}" data-reading-mode="compact">
    <header class="world-chrome"><div class="world-heading"><button class="wordmark">未读之城<span>一段正在发生的日常</span></button><div class="topbar-world"><span>学生宿舍</span><span>第 1 天</span><time>20:15</time></div></div><div class="host-actions"><button>切换聊天</button><button>退出酒馆 ↗</button></div></header>
    <nav class="presentation-switch"><button aria-pressed="false">3D 漫游</button><button aria-pressed="true">纯小说</button></nav>
    <nav class="tool-dock" aria-label="世界面板">${labels.map((label,i)=>`<button ${i===0?'class="phone-launcher"':''}><span class="tool-icon"><svg viewBox="0 0 24 24"><path d="M5 3h14v18H5ZM9 7h6M9 11h6M9 15h3" /></svg></span><span class="tool-label">${label}${i===0?'<small>有未读</small>':''}</span></button>`).join('')}</nav>
    <section class="reading-layer" data-reading-layer>
      <header class="reading-heading"><span>此刻的故事</span><div class="reading-actions"><button>专注阅读</button><button>收起</button></div></header>
      <p class="room-activity-receipt">查看了宿舍衣柜与房间陈设，没有取放物品。已记入状态，可继续故事。</p>
      <div class="novel-dialogue"><button class="novel-dialogue-text"><span class="novel-speech">【原型示例】傍晚的风穿过校园南门。手机轻震了两下。你可以先读消息、去一个地方，或留在这里说出自己的行动。</span></button><div class="novel-dialogue-controls"><button>全文回看</button></div></div>
      <form class="composer"><label class="sr-only" for="uc-action-input">接下来，你想做什么？</label><textarea id="uc-action-input" aria-label="接下来，你想做什么？" rows="1" maxlength="2000" placeholder="写下你的行动，或说一句想说的话……"></textarea><button type="submit">继续故事 <span>↗</span></button></form>
    </section></div>`;
  shadow.append(originalStyle,app);
  const rescue = document.createElement('button');
  rescue.type = 'button'; rescue.textContent = '恢复酒馆'; rescue.setAttribute('data-unread-city-rescue', '');
  rescue.style.cssText = 'position:fixed;right:12px;top:calc(100dvh - 46px);z-index:2147483647;padding:8px 12px;border:1px solid #a4b6a7;border-radius:6px;background:#f5f1e5;color:#263c39;font:12px system-ui;cursor:pointer;';
  document.body.append(root,rescue);
  const legacyLayout = () => {
    rescue.style.top = `${Math.max(8, window.innerHeight - (innerWidth<=760 ? 80:12) - (Math.ceil(rescue.getBoundingClientRect().height)||34))}px`;
    rescue.style.bottom = 'auto';
  };
  window.addEventListener('resize', legacyLayout); legacyLayout();
  let disposeLayout;
  const style = document.createElement('style'); style.textContent=patchCss;
  let submissions=0;
  shadow.querySelector('form').addEventListener('submit', event => { event.preventDefault(); submissions++; });
  const dispose = () => { disposeLayout?.(); window.removeEventListener('resize',legacyLayout); root.remove(); rescue.remove(); };
  rescue.addEventListener('click',dispose);
  return {
    root, rescue, shadow,
    apply(bind) { shadow.append(style); disposeLayout=bind(window,root,rescue); },
    dispose,
    submissions:()=>submissions,
  };
}

export function measureFixture(fixture) {
  const {root,rescue,shadow}=fixture;
  const box=element=>{
    const r=element.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};
  };
  const input=shadow.querySelector('textarea'), send=shadow.querySelector('.composer > button'), dock=shadow.querySelector('.tool-dock'), reading=shadow.querySelector('.reading-layer');
  const overlap=(a,b)=>a.x<b.right-.5&&a.right>b.x+.5&&a.y<b.bottom-.5&&a.bottom>b.y+.5;
  const rb=box(rescue), ib=box(input), sb=box(send), db=box(dock), vb=window.visualViewport;
  const top=vb?.offsetTop||0, left=vb?.offsetLeft||0;
  const end=top+Math.min(innerHeight,vb?.height||innerHeight);
  const inView=r=>r.x>=left-.5&&r.right<=left+(vb?.width||innerWidth)+.5&&r.y>=top-.5&&r.bottom<=end+.5;
  const point=shadow.elementFromPoint(sb.x+sb.width/2,sb.y+sb.height/2);
  const outerHit=document.elementFromPoint(sb.x+sb.width/2,sb.y+sb.height/2);
  return {
    root:box(root), input:ib, send:sb, rescue:rb, dock:db, reading:box(reading),
    overlap:overlap(rb,ib)||overlap(rb,sb), dockOverlap:overlap(rb,db),
    inputInView:inView(ib),sendInView:inView(sb),rescueInView:inView(rb),dockInView:inView(db),
    inputInsidePanel:ib.bottom<=box(reading).bottom+.5,
    sendHit:outerHit===root&&(point===send||send.contains(point)),
    readingAboveRescue:box(reading).bottom<=rb.y+.5,
    buttons:[...dock.querySelectorAll('button')].map(button=>({text:button.textContent,box:box(button),inView:inView(box(button))})),
    keyboard:root.dataset.ucKeyboard, inputValue:input.value, submissions:fixture.submissions(),
  };
}
