// Apply private, build-time adapters to the original ST-iPhonie phone.
// Fail closed on upstream changes instead of silently dropping the integration.
export function adaptPhonePeek(relative, source, replaceOnce) {
  let code=source;
  if(relative==='ui/peek.js'){
    code="import {peekWorld,visiblePeekSnapshot} from 'virtual:unread-city-phone-peek';\n"+code;
    code=replaceOnce(code,
      "    const [contacts, peeks] = await Promise.all([api.chatContacts?.() || [], api.listPeeks()]);",
      "    const [phoneContacts, peeks] = await Promise.all([api.chatContacts?.() || [], api.listPeeks()]);\n"
      +"    const world=peekWorld(ctx.win);\n"
      +"    const contacts=[...new Map([...phoneContacts,...(world?.npcPhone?.contacts||[])].map(c=>[c.name,c])).values()];",
      'game contacts appear in original NPC peek');
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
    code=replaceOnce(code,"before = null}) {","before = null, allowDual = false, realHistory = ''}) {",'dual-speaker prompt args');
    code=replaceOnce(code,
      "    ['【' + name + '知道什么】',",
      "    realHistory.trim() ? '【'+name+'与'+user+'的真实游戏短信】（时间顺序，已存档；不要再写入新聊天记录或改写）\\n'+realHistory.trim() : '',\n"
      +"    allowDual ? '【授权的双人短信续写】你可以同时扮演'+user+'和'+name+'。必须在真实短信之后写一到三轮全新的聊天，每轮由'+user+'先发、'+name+'后答；双方各自只知道自己应当知道的事实，不得复制旧短信。生成的新短信会同步写入游戏正式存档；本规则只授权短信，不授权代做购买、转账或剧情行动。' : '',\n"
      +"    ['【' + name + '知道什么】',",
      'inject true NPC SMS history');
    const original="不要写和"+'$'+"{user}的";
    const swapped='$'+'{allowDual ? "必须包括和"+user+"的双人短信续写（仅写真实短信之后的新消息）" : "不要写和"+user+"的"}';
    code=replaceOnce(code,original,swapped,'allow main character NPC chat in peek');
    code=replaceOnce(code,
      "  return [{role: 'system', content: system}, {role: 'user', content: ask}];",
      "  const extra=allowDual ? '另写【聊天】'+user+'，包含1到3轮新短信，严格每轮'+user+'：一句、'+name+'：一句；每条不超过180字。不能重放已有的短信、不能代人物发起重大剧情决定。' : '';\n"
      +"  return [{role: 'system', content: system}, {role: 'user', content: ask+'\\n'+extra}];",
      'require two speakers in peek continuation');
    return code;
  }
  if(relative==='host-apps.js'){
    code="import {peekWorld,peekWorldContact,peekCanonicalHistory,withoutProtagonistChats,newPeekDialogue} from 'virtual:unread-city-phone-peek';\n"+code;
    const start="  function peekLook(name, {keep = false} = {}) {";
    const end="  /** Draws one photo of a character's album";
    const i=code.indexOf(start),j=code.indexOf(end,i+start.length);
    if(i<0||j<0||code.indexOf(start,i+1)>=0||code.indexOf(end,j+1)>=0)throw Error('手机源码已变化，请更新内嵌适配：peek generation host');
    const replacement=[
      "  function peekLook(name, {keep = false} = {}) {",
      "    return run('peek', async ctx => {",
      "      const world=peekWorld(globalThis), gameContact=peekWorldContact(world,name);",
      "      const key=backend.spaceKey(), {preset,user:tavernUser}=base();",
      "      const user=gameContact ? world.name : tavernUser;",
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
      "      const prompt=buildPeekRequest({preset,before,earlier:memory?.storyMemory()||'',person,story,user,userPersona:userPersona(),",
      "        history,realHistory,allowDual:!!gameContact,memory:remembered,images:!!backend.drawReady(),",
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
      "      return backend.savePeek({name,...mergePeek(before,gameContact?withoutProtagonistChats(found):found)},key);",
      "    });",
      "  }",
      "",
      ""
    ].join('\n');
    return code.slice(0,i)+replacement+code.slice(j);
  }
  return code;
}
