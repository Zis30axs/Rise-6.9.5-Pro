// Apply private, build-time adapters to the original ST-iPhonie phone.
// Fail closed on upstream changes instead of silently dropping the integration.
export function adaptPhonePeek(relative, source, replaceOnce) {
  let code=source;
  if(relative==='ui/peek.js'){
    code="import {peekWorld,peekProtagonist,visiblePeekSnapshot} from 'virtual:unread-city-phone-peek';\nimport {createProtagonistPeek} from 'virtual:unread-city-protagonist-peek';\n"+code;
    code=replaceOnce(code,"  const busy = () => api.peekBusy?.();",
      "  const canonical=createProtagonistPeek(ctx,v,()=>{who='';render();});\n  const busy = () => api.peekBusy?.();",'shared ordinary peek entry');
    code=replaceOnce(code,
      "    const [contacts, peeks] = await Promise.all([api.chatContacts?.() || [], api.listPeeks()]);",
      "    const [phoneContacts, peeks] = await Promise.all([api.chatContacts?.() || [], api.listPeeks()]);\n"
      +"    const world=peekWorld(ctx.win);\n"
      +"    const contacts=[...new Map([...phoneContacts,...(world?.npcPhone?.contacts||[]),...(world?.others||[])].map(c=>[c.name,c])).values()].filter(c=>c.name!==world?.name);",
      'game contacts appear in original NPC peek');
    code=replaceOnce(code,"  async function renderPerson(ticket) {",
      "  async function renderPerson(ticket) {\n    if(peekProtagonist(peekWorld(ctx.win),who)){canonical.render(who);return;}",'read playable owners through existing permissions');
    code=replaceOnce(code,"    if (device) return device.back();","    if(canonical.back())return true;\n    canonical.cancel();\n    if (device) return device.back();",'canonical peek back navigation');
    code=replaceOnce(code,"v.dispose = () => { dispose.call(v);","v.dispose = () => { canonical.dispose(); dispose.call(v);",'canonical peek subscription cleanup');
    code=replaceOnce(code,"        who = el.dataset.name; await render(); v.root.scrollTop = 0;",
      "        canonical.cancel(); who = el.dataset.name; await render(); v.root.scrollTop = 0;\n        if(peekProtagonist(peekWorld(ctx.win),who)){await canonical.open(who);break;}",'open actual playable phone');
    code=replaceOnce(code,"      case 'peek-open': {","      case 'peek-canonical-open': await canonical.open(who); break;\n      case 'peek-open': {",'pick up canonical phone');
    code=replaceOnce(code,'<p class="hint">都会调用一次模型。</p>','<p class="hint">想接着上次看，还是重新查看？</p>','natural peek refresh wording');
    code=replaceOnce(code,'<strong>重新编一份</strong>','<strong>重新查看</strong>','natural peek refresh action');
    code=replaceOnce(code,"${seen.has(c.name) ? '看过 · ' + ago(seen.get(c.name).at) : '还没看过'}",
      "${peekProtagonist(world,c.name)?(c.read?'可以查看':'暂时无法查看'):seen.has(c.name) ? '看过 · ' + ago(seen.get(c.name).at) : '还没看过'}",'do not advertise simulated protagonist snapshots');
    const read="const s = await api.getPeek(who);";
    if(code.split(read).length-1!==3)throw Error('手机源码已变化，请更新内嵌适配：peek snapshot reads');
    code=code.replaceAll(read,"const s = visiblePeekSnapshot(await api.getPeek(who),peekWorld(ctx.win),who);");
    code=replaceOnce(code,
      "if (!await api.getPeek(who))",
      "if (!visiblePeekSnapshot(await api.getPeek(who),peekWorld(ctx.win),who))",
      'real SMS is visible before first model generation');
    code=replaceOnce(code,
      "        : empty('还没有联系人', '先在角色 App 里添加角色，或者在聊天里添加联系人。', 'person')));",
      "        : empty('还没有联系人', '先在游戏里认识角色，或在聊天里添加联系人。', 'person')));",
      'restore contact list hint');
    return code;
  }
  if(relative==='core/peek.js'){
    code=replaceOnce(code,"before = null}) {","before = null, allowDual = false, realHistory = '', realLife = ''}) {",'dual-speaker prompt args');
    code=replaceOnce(code,
      "    ['【' + name + '知道什么】',",
      "    realLife.trim() ? '【当前主角的近期真实游戏经历】（此信息仅属于当前主角；不能让 NPC 无端知道）\\n'+realLife.trim() : '',\n"
      +"    realHistory.trim() ? '【'+name+'与'+user+'的真实游戏短信】（时间顺序，已存档；不要再写入新聊天记录或改写）\\n'+realHistory.trim() : '',\n"
      +"    allowDual ? '【授权的双人短信续写】你可以同时扮演'+user+'和'+name+'。必须在真实短信之后写一到三轮全新的聊天，每轮由'+user+'先发、'+name+'后答；双方各自只知道自己应当知道的事实，不得复制旧短信。生成的新短信会同步写入游戏正式存档；本规则只授权短信，不授权代做购买、转账或剧情行动。' : '',\n"
      +"    ['【' + name + '知道什么】',",
      'inject true NPC SMS history');
    const original="不要写和"+'$'+"{user}的";
    const swapped='$'+'{allowDual ? "必须包括和"+user+"的双人短信续写（仅写真实短信之后的新消息）" : "不要写和"+user+"的"}';
    code=replaceOnce(code,original,swapped,'allow main character NPC chat in peek');
    code=replaceOnce(code,
      "  return [{role: 'system', content: system}, {role: 'user', content: ask}];",
      "  const extra=allowDual ? '必须把【聊天】'+user+'放在所有【聊天】段落的第一段（否则可能超出手机最多五个会话的保存限制）。包含1到3轮全新短信，严格每轮'+user+'：一句、'+name+'：一句；每条不超过180字。不能重放已有短信、不能代人物发起重大剧情决定。' : '';\n"
      +"  return [{role: 'system', content: system}, {role: 'user', content: ask+'\\n'+extra}];",
      'require two speakers in peek continuation');
    return code;
  }
  if(relative==='host-apps.js'){
    code="import {peekWorld,peekProtagonist,protagonistPeekSnapshot,peekWorldContact,peekCanonicalHistory,withoutProtagonistChats,newPeekDialogue} from 'virtual:unread-city-phone-peek';\n"+code;
    const start="  function peekLook(name, {keep = false} = {}) {";
    const end="  /** Draws one photo of a character's album";
    const i=code.indexOf(start),j=code.indexOf(end,i+start.length);
    if(i<0||j<0||code.indexOf(start,i+1)>=0||code.indexOf(end,j+1)>=0)throw Error('手机源码已变化，请更新内嵌适配：peek generation host');
    const replacement=[
      "  function peekLook(name, {keep = false} = {}) {",
      "    return run('peek', async ctx => {",
      "      const world=peekWorld(globalThis), gameContact=peekWorldContact(world,name);",
      "      const protagonist=peekProtagonist(world,name);",
      "      if(protagonist){",
      "        const data=await globalThis.__unreadCityWorldPhone.act({binding:world.binding,revision:world.revision,requestId:globalThis.crypto.randomUUID(),owner:protagonist.id,command:{type:'inspect',section:'messages'}});",
      "        return protagonistPeekSnapshot(data);",
      "      }",
      "      const key=backend.spaceKey(), {preset,user:tavernUser}=base();",
      "      const user=gameContact ? world.name : tavernUser;",
      "      const activePersona=gameContact ? world.name+'是未读之城当前可操作主角；性格、经历与知识必须依据本游戏当前剧情和世界书，不得沿用酒馆账户的用户人设。' : userPersona();",
      "      const contact=backend.contacts().find(c=>c.name===name) || gameContact;",
      "      if(!contact)throw Error('联系人里没有「'+name+'」');",
      "      const person={name,persona:contact.persona||'',card:contact.persona?'':card(name)};",
      "      const thread=gameContact ? null : currentDm(await backend.threads(),name);",
      "      const history=thread ? (await backend.chats.get(thread.id)).messages.filter(m=>m.kind!=='system').slice(-20) : [];",
      "      const story=storyLines(ctx.chat,preset,user);",
      "      const remembered=memory ? await memory.aboutPeople([name]).catch(()=>'') : '';",
      "      const saved=keep ? (await backend.apps.get(peekId(name,key))) || (key ? await backend.apps.get(peekId(name)) : null) : null;",
      "      const before=gameContact ? withoutProtagonistChats(saved) : saved;",
      "      const realHistory=gameContact ? peekCanonicalHistory(world,gameContact) : '';",
      "      const realLife=gameContact ? [...(world.peekContext?.recentStory||[]).map(row=>row.role+'：'+row.text),...(world.peekContext?.recentJournal||[]).map(row=>row.text)].join('\\n') : '';",
      "      const prompt=buildPeekRequest({preset,before,earlier:memory?.storyMemory()||'',person,story,user,userPersona:activePersona,",
      "        history,realHistory,realLife,allowDual:!!gameContact,memory:remembered,images:!!backend.drawReady(),",
      "        lore:await lore(preset,[person],story,[realHistory,...history.map(m=>m.text||'')])});",
      "      const found=parsePeek(await ask(ctx,prompt,preset),{name,user});",
      "      if(gameContact){",
      "        const next=newPeekDialogue(found,world,gameContact);",
      "        const current=peekWorld(globalThis);",
      "        if(!current || current.binding!==world.binding || current.owner!==world.owner || current.revision!==world.revision)",
      "          throw Error('剧情或主角已改变，请重新查手机以同步短信');",
      "        if(next.length){",
      "          const host=globalThis.__unreadCityWorldPhone;",
      "          if(!host?.act||!globalThis.crypto?.randomUUID)throw Error('游戏短信存档接口不可用');",
      "          await host.act({binding:world.binding,revision:world.revision,requestId:globalThis.crypto.randomUUID(),",
      "            owner:world.owner,command:{type:'peek_chat_append',npcId:gameContact.id,lines:next}});",
      "        }",
      "      }",
      "      if(gameContact){const current=peekWorld(globalThis);if(!current || current.binding!==world.binding || current.owner!==world.owner)throw Error('主角已切换；短信已保存，请重新打开手机');}",
      "      return backend.savePeek({name,...mergePeek(before,gameContact?withoutProtagonistChats(found):found)},key);",
      "    });",
      "  }",
      "",
      ""
    ].join('\n');
    return code.slice(0,i)+replacement+code.slice(j);
  }
  if(relative==='ui/peek-phone.js'){
    code=replaceOnce(code,"const chats = () => snap.chats.map((c, i) => ({...c, index: i, when: stamp(snap.at, AGO[i] ?? 60 * 24 * (i + 1)), unread: unread(c)}));",
      "const chats = () => snap.chats.map((c,i)=>({...c,index:i,when:snap.canonical?c.when:stamp(snap.at,AGO[i]??60*24*(i+1)),unread:snap.canonical?c.unread:unread(c)}));",'real timestamps and unread state');
    code=replaceOnce(code,"const app = APPS[id], now = new Date();",
      "const app = snap.canonical && ['calendar','cart','settings'].includes(id)?{...APPS[id],open:true,label:({calendar:'日历',cart:'订单',settings:'Appie Pay'})[id]}:APPS[id], now = snap.clock?new Date(snap.clock.date+'T12:00:00'):new Date();",'canonical phone apps');
    code=replaceOnce(code,"page === 'lock' ? '中国移动' : hhmm(now)","page === 'lock' ? '中国移动' : (snap.clock?.time || hhmm(now))",'inspected phone status time');
    code=replaceOnce(code,"const now = new Date(), notes = chats()","const now = snap.clock?new Date(snap.clock.date+'T12:00:00'):new Date(), notes = chats()",'inspected phone date');
    code=replaceOnce(code,'<p class="pp-clock">${hhmm(now)}</p>','<p class="pp-clock">${snap.clock?.time || hhmm(now)}</p>','inspected phone lock time');
    code=replaceOnce(code,"    const inner = PAGES[page](), onWall = page === 'lock' || page === 'home';",
      "    const records=snap.canonical&&({calendar:snap.calendar,cart:snap.orders,settings:snap.wallet})[page];\n"
      +"    const inner=records?`<div class=\"pp-app pp-notes\">${bar(({calendar:'日历',cart:'订单',settings:'Appie Pay'})[page])}<div class=\"pp-body\">${records.length?records.map(r=>`<article class=\"pp-note-row\"><b>${esc(r.title)}</b><p>${esc(r.detail)}</p></article>`).join(''):'<p class=\"pp-empty\">暂无记录</p>'}</div></div>`:PAGES[page](), onWall = page === 'lock' || page === 'home';",'read-only actual calendar wallet orders');
    code=replaceOnce(code,"wall.style.background = painted(snap.name);","wall.style.background = snap.wallpaperCss || painted(snap.name);",'use inspected owner wallpaper');
    code=replaceOnce(code,"browser: 'home', cart: 'home', home: 'lock'","browser: 'home', cart: 'home', calendar: 'home', settings: 'home', home: 'lock'",'canonical app back navigation');
    code=replaceOnce(code,"const timer = setInterval(() => { const el", "const timer = setInterval(() => { if(snap.canonical)return; const el",'keep canonical clock on game time');
    return code;
  }
  return code;
}
