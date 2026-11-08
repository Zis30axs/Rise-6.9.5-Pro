// Restore the original simulated NPC phone, while projecting real game SMS.
// The protagonist's visible messages always come from the canonical game save.
const PROTAGONIST_NAMES = new Set(['长崎素世','丰川祥子','樱羽艾玛','甘织玲奈子']);
const PROTAGONISTS = {soyo:'长崎素世',sakiko:'丰川祥子',emma:'樱羽艾玛',renako:'甘织玲奈子'};

export function peekProtagonist(world, name) {
  if (!world) return null;
  return (world.others || []).find(person => person.name === name) ||
    (world.name === name ? {id:world.owner,name,read:true,reason:''} : null);
}

/** Project a permission-checked owner view. Never merge an old simulated snapshot. */
export function protagonistPeekSnapshot(data) {
  const threads = new Map(), seen = new Set();
  const unread = new Set((data.messages || []).filter(m=>!m.read).map(m=>m.id));
  const names = new Map(Object.entries(PROTAGONISTS).map(([id,name])=>['protagonist-'+id,name]));
  for (const c of data.npcPhone?.contacts || []) names.set(c.contactId,c.name);
  const stamp = minute => `第 ${Math.floor(minute/1440)+1} 天 ${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
  const add = (key,name,message,from,at) => {
    if (seen.has(message.id)) return;
    seen.add(message.id);
    if (!threads.has(key)) threads.set(key,{id:key,with:name,lines:[],when:'',unread:0});
    const thread=threads.get(key);
    thread.lines.push({id:message.id,from,text:message.text,at});
    if(unread.has(message.id))thread.unread++;
  };
  for (const m of data.conversation || []) {
    const peer = m.from === data.owner ? m.to : m.from;
    add('protagonist:'+peer,PROTAGONISTS[peer] || peer,m,PROTAGONISTS[m.from] || m.from,m.at);
  }
  for (const m of data.npcPhone?.messages || []) {
    if (m.owner !== data.owner) continue;
    const contact = (m.channel === 'group' ? data.npcPhone.groups : data.npcPhone.contacts)?.find(c=>c.id===m.targetId);
    add(m.channel+':'+m.targetId,contact?.name || m.targetId,m,
      m.direction === 'outgoing' ? data.name : m.speakerName || contact?.name || m.targetId,m.at);
  }
  for (const m of data.messages || []) {
    const contact = data.npcPhone?.contacts?.find(c=>c.contactId===m.npcId);
    const key = m.npcId?.startsWith('protagonist-') ? 'protagonist:'+m.npcId.slice(12) : 'npc:'+(contact?.id || m.npcId);
    add(key,names.get(m.npcId) || m.npcId,m,names.get(m.npcId) || m.npcId,historicalGameMinute(m.at));
  }
  const chats = [...threads.values()].map(thread => {
    thread.lines.sort((a,b)=>a.at-b.at);
    thread.when = stamp(thread.lines.at(-1).at);
    return thread;
  }).sort((a,b)=>b.lines.at(-1).at-a.lines.at(-1).at);
  return {name:data.name,owner:data.owner,canonical:true,at:data.now*60000,chats,
    photos:[],notes:[],searches:[],cart:[],
    clock:{time:`${String(data.clock.hour).padStart(2,'0')}:${String(data.clock.minute).padStart(2,'0')}`,date:data.calendarDate.iso},
    calendar:[...(data.dailyPlans||[]).map(e=>({title:e.title,detail:`${e.time} · ${e.done?'已完成':'待办'}`})),
      ...(data.calendar||[]).map(e=>({title:e.title,detail:`${stamp(e.start)} · ${e.duration} 分钟`}))],
    orders:(data.orders||[]).map(o=>({title:data.catalog?.find(c=>c.id===o.itemId)?.name||o.itemId,
      detail:`¥${(o.totalCents/100).toFixed(2)} · ${{paid:'配送中',delivered:'已送达',received:'已领取',cancelled:'已取消'}[o.status]}`})),
    wallet:Object.entries(data.cards||{}).map(([id,cents])=>({title:({gpt:'GPT',claude:'Claude',gemini:'Gemini'})[id]||id,detail:`¥${(cents/100).toFixed(2)}`})),
  };
}

export function peekWorld(win) {
  try {
    return win?.__unreadCityWorldPhone?.read?.() || win?.parent?.__unreadCityWorldPhone?.read?.() || null;
  } catch { return null; }
}

export function peekWorldContact(world, name) {
  return world?.npcPhone?.contacts?.find(c => c.name === name) || null;
}

function historicalGameMinute(stamp) {
  const match = /^第 (\d+) 天 (\d\d):(\d\d)$/.exec(String(stamp || ''));
  return match ? (Number(match[1])-1)*1440+Number(match[2])*60+Number(match[3]) : 0;
}

export function peekCanonicalMessages(world, contact) {
  if (!world || !contact) return [];
  const canonical=(world.npcPhone?.messages || [])
    .filter(m => m.owner === world.owner && m.channel === 'npc' && m.targetId === contact.id);
  const canonicalIds=new Set(canonical.map(m=>m.id));
  // Main-story phone_messages and older saves keep incoming SMS in the player's
  // legacy inbox, not necessarily in npcPhone.messages. Mirror worldMessageRows.
  const legacy=(world.messages || [])
    .filter(m => m.npcId === contact.contactId && !canonicalIds.has(m.id))
    .map(m=>({id:m.id,owner:world.owner,channel:'npc',targetId:contact.id,
      direction:'incoming',text:m.text,at:historicalGameMinute(m.at),legacy:true}));
  return [...canonical,...legacy].map((m,index)=>({m,index}))
    .sort((a,b)=>a.m.at-b.m.at || a.index-b.index).map(row=>row.m);
}

export function peekCanonicalHistory(world, contact) {
  return peekCanonicalMessages(world, contact).slice(-20)
    .map(m => (m.direction === 'outgoing' ? world.name : contact.name) + '：' + m.text)
    .join('\n');
}

export function withoutProtagonistChats(snapshot) {
  if (!snapshot) return snapshot;
  return {...snapshot, chats:(snapshot.chats || []).filter(c => c.with !== '我' && !PROTAGONIST_NAMES.has(c.with))};
}

export function visiblePeekSnapshot(snapshot, world, name = snapshot?.name) {
  if (!world || !name) return snapshot;
  // Playable people require their own inspected view, never this viewer's cache.
  if (peekProtagonist(world,name) || PROTAGONIST_NAMES.has(name)) return null;
  const contact = peekWorldContact(world, name);
  const messages = peekCanonicalMessages(world, contact);
  // Show an existing real SMS thread even before the first model generation.
  if (!snapshot && !messages.length) return null;
  const original = withoutProtagonistChats(snapshot) || {
    name, at:Date.now(), chats:[], searches:[], notes:[], photos:[], cart:[],
  };
  if (!messages.length) return original;
  const lines = messages.slice(-24).map(m => ({
    from:m.direction === 'outgoing' ? world.name : name,
    text:m.text,
  }));
  return {...original, chats:[{with:world.name,lines}, ...original.chats].slice(0,5)};
}

export function newPeekDialogue(found, world, contact) {
  if (!world || !contact) return [];
  const chat = (found.chats || []).find(c => c.with === world.name);
  if (!chat) return [];
  const generated = (chat.lines || []).map(l => {
    if (l.from !== 'me' && l.from !== contact.name) throw Error('主角聊天的发言者无效，请重新生成');
    return {speaker:l.from === 'me' ? 'protagonist' : 'npc', text:String(l.text || '').trim()};
  }).filter(row => row.text);
  if (generated.length > 24) throw Error('主角聊天生成过长，请重新生成');
  const existing = peekCanonicalMessages(world, contact).map(m => ({
    speaker:m.direction === 'outgoing' ? 'protagonist' : 'npc', text:m.text,
  }));
  // Ignore a prefix copied from the real chat; only append newly developed lines.
  let overlap = Math.min(generated.length, existing.length);
  while (overlap && !generated.slice(0,overlap).every((line,i) => {
    const old = existing[existing.length-overlap+i];
    return old.speaker === line.speaker && old.text === line.text;
  })) overlap--;
  const next = generated.slice(overlap);
  if (next.length > 6 || next.length % 2 !== 0 || next.some((row,i) =>
    row.speaker !== (i % 2 === 0 ? 'protagonist' : 'npc') || row.text.length > 180))
    throw Error('生成的主角短信必须从主角开始、双方轮流发言（最多三轮，每条180字），请重新生成');
  return next;
}
