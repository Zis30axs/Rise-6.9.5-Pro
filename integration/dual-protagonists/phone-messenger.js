// The native ST-iPhonie messaging layout, projected from authoritative game SMS.
// This view never keeps its own message database and never invokes a model on Send.

const CHAT_STYLE = '<style>'
  + '.uc-phone-header{padding:8px 16px 4px}.uc-phone-header h2{margin:2px 0 4px;font-size:22px}.uc-phone-header small{color:var(--ink2)}'
  + '.uc-conv-list{margin-top:8px}.uc-portrait{display:grid;place-items:center;flex-shrink:0;width:48px;height:48px;border-radius:17px;background:var(--accent-soft);color:var(--accent-ink);font-size:18px;font-weight:900}'
  + '.uc-requests{margin:14px 12px;padding:10px 12px;border-radius:18px;background:var(--card2)}.uc-requests article{padding:8px 0;border-bottom:1px solid var(--line)}.uc-requests article:last-child{border:0}'
  + '.uc-requests p{margin:4px 0;font-size:12px;line-height:1.5}.uc-requests .actions{display:flex;gap:8px;flex-wrap:wrap}'
  + '.uc-thread .th-head{padding-top:8px}.uc-thread .th-title small{white-space:normal;line-height:1.45}'
  + '.uc-thread .msgs{padding-bottom:18px;-webkit-overflow-scrolling:touch}.uc-thread .chat-bubble{white-space:pre-wrap}'
  + '.uc-meta{font-size:11px;color:var(--ink2);max-width:100%;white-space:nowrap;padding:2px 6px}'
  + '.uc-reply-tools{flex-shrink:0;display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:7px 10px;background:var(--card2);border-top:1px solid var(--line)}'
  + '.uc-reply-tools button{min-height:36px;padding:6px 10px;border-radius:16px;font-size:12px}.uc-reply-tools button:disabled{opacity:.4}'
  + '.uc-tool-hint{flex:1;font-size:11px;color:var(--ink2)}.uc-thread .uc-composer{padding-bottom:max(18px,env(safe-area-inset-bottom,0px))}'
  + '.uc-composer textarea.field-in{resize:none;min-height:44px;max-height:90px;padding:10px 13px;border-radius:16px;line-height:1.35}'
  + '.uc-composer button{flex-shrink:0;min-height:44px;border-radius:16px;padding:8px 12px}.uc-thread .msg{max-width:92%}'
  + '.uc-thread .chat-bubble{max-width:100%;font-size:14px}.uc-thread .msgs .sys{font-size:11px}'
  + '@media(max-width:360px){.uc-reply-tools{gap:4px;padding:6px}.uc-reply-tools button{font-size:11px;padding:6px 8px}.uc-composer button{padding:8px 10px}}'
  + '</style>';

const trimPreview = text => String(text || '').replace(/\s+/g,' ').slice(0,65);

export function worldMessageRecipients(data) {
  const social = data.npcPhone || {};
  return [
    ...(data.others || []).map(person => ({key:'protagonist:' + person.id, name:person.name,kind:'主角'})),
    ...(social.contacts || []).map(person => ({key:'npc:' + person.id,name:person.name,kind:'联系人'})),
    ...(social.groups || []).map(group => ({key:'group:' + group.id,name:group.name,kind:group.memberCount + '人群聊'})),
  ];
}

function historyMinute(stamp) {
  if (typeof stamp === 'number') return stamp;
  const match = /^第 (\d+) 天 (\d\d):(\d\d)$/.exec(String(stamp));
  return match ? (Number(match[1])-1)*1440 + Number(match[2])*60 + Number(match[3]) : 0;
}

export function worldMessageRows(data,key) {
  const social = data.npcPhone || {contacts:[],messages:[]};
  const pro = key.startsWith('protagonist:'), npc = key.startsWith('npc:'), group = key.startsWith('group:');
  const target = key.slice(key.indexOf(':')+1);
  const rows = pro
    ? (data.conversation || []).filter(m =>
        (m.from===data.owner && m.to===target) || (m.from===target && m.to===data.owner))
    : (social.messages || []).filter(m => m.channel===(npc?'npc':'group') && m.targetId===target);
  const knownIds = new Set(rows.map(m=>m.id));
  const contactId = npc ? social.contacts.find(c=>c.id===target)?.contactId :
    pro ? 'protagonist:'+target.replace(/^/,'').slice(0,0) : null;
  // Protagonist inbox records use "protagonist-" (not the selector's ":").
  const inboxId = pro ? 'protagonist-' + target : contactId;
  const legacy = group ? [] : (data.messages || [])
    .filter(m => m.npcId===inboxId && !knownIds.has(m.id))
    .map(m => ({...m, at:historyMinute(m.at), direction:'incoming', receipt:'received', legacy:true}));
  return [...legacy,...rows].map((m,index)=>({...m,__index:index}))
    .sort((a,b)=>a.at-b.at || a.__index-b.__index);
}

function replyCandidate(rows) {
  const latest = [...rows].reverse().find(m => m.direction==='outgoing' && m.replyTo==null);
  if (!latest) return null;
  if (latest.status==='pending' || latest.expectsReply===true && !latest.answered) return latest.id;
  return null;
}

/** The caller owns the active tab, authoritative state and short-lived per-thread drafts. */
export function renderWorldMessenger({data,recipient,mode,drafts,pending},{esc,btn,heading,time}) {
  const recipients=worldMessageRecipients(data);
  const chosen=recipients.some(row=>row.key===recipient) ? recipient : recipients[0]?.key || '';
  const requests=(data.npcPhone?.requests || []).filter(r=>r.status==='pending');
  const reqHTML=requests.length ? '<section class="uc-requests" aria-label="联系申请"><strong>联系申请</strong>'
    + requests.map(r=>'<article><strong>'+esc(r.name)+(r.kind==='group'?'邀请你加入群聊':'请求交换联系方式')
      + '</strong><p>'+esc(r.quote)+'</p><div class="actions">'
      + btn('accept-contact','接受','secondary','data-id="'+esc(r.id)+'"')
      + btn('decline-contact','拒绝','text-button','data-id="'+esc(r.id)+'"')+'</div></article>').join('')
    + '</section>' : '';
  if(mode !== 'thread' || !chosen) {
    const list=recipients.map(rec=>{
      const rows=worldMessageRows(data,rec.key);
      const last=rows[rows.length-1];
      const when=last && Number.isSafeInteger(last.at) ? time(last.at).split(' ').slice(-1)[0] : '';
      return '<button type="button" class="conv" data-action="open-thread" data-recipient="'+esc(rec.key)+'">'
        + '<span class="uc-portrait" aria-hidden="true">'+esc(rec.name.slice(0,1))+'</span>'
        + '<span class="grow"><span class="conv-top"><strong>'+esc(rec.name)+'</strong><small class="conv-time">'+esc(when)+'</small></span>'
        + '<span class="conv-bot"><span class="pv">'+esc(last ? (last.direction==='outgoing'?'我：':'')+trimPreview(last.text) : rec.kind+' · 点击开始对话')+'</span></span></span></button>';
    }).join('');
    return {recipient:chosen,replyId:null,html:CHAT_STYLE+heading('消息','','Messages')
      + '<div class="uc-phone-header"><small>'+esc(data.name)+' · '+esc(time(data.now))
      + ' · 发送不会自动请求模型</small></div>'+reqHTML
      + '<div class="conv-list uc-conv-list" role="list">'+(list||'<p class="chat-empty">暂无可联系的角色</p>')+'</div>'};
  }
  const contact=recipients.find(r=>r.key===chosen);
  const rows=worldMessageRows(data,chosen);
  const lastPending=replyCandidate(rows);
  const draft=drafts.get(chosen)||'';
  const bubbles=rows.map(m=>{
    const outgoing=m.direction==='outgoing';
    const clock=Number.isSafeInteger(m.at)?time(m.at):'';
    const receipt=outgoing
      ? m.receipt==='read' ? '✓✓ 已读' : '✓ 已送达'
      : '';
    const status=outgoing && m.status==='silent' ? ' · 暂无回复' : '';
    const speaker=outgoing ? '我' : (m.speakerName||contact.name);
    return '<article class="msg'+(outgoing?' me':'')+'" data-message-id="'+esc(m.id)+'">'
      +(outgoing?'':'<span class="uc-portrait" style="width:32px;height:32px;border-radius:50%;font-size:12px" aria-hidden="true">'+esc(speaker.slice(0,1))+'</span>')
      +'<div class="m-body">'+(chosen.startsWith('group:')?'<span class="m-name">'+esc(speaker)+'</span>':'')
      +'<div class="chat-bubble">'+esc(m.text)+'</div>'
      +'<small class="uc-meta">'+esc(clock.split(' ').slice(-1)[0])+(receipt?' · '+receipt:'')+status+'</small></div></article>';
  }).join('');
  const pendingUI=pending ? '<div class="sys" role="status">发送未保存 · 可重试'+btn('retry','重试','text-button')+btn('discard','取消','text-button')+'</div>' : '';
  const tools='<div class="uc-reply-tools">'
    + btn('request-reply','让对方回复','secondary','data-id="'+esc(lastPending||'')+'"'+(lastPending&&!pending?'':' disabled'))
    + btn('wait-read','等5分钟','text-button','data-minutes="5"'+(pending?' disabled':''))
    + btn('wait-read','等15分钟','text-button','data-minutes="15"'+(pending?' disabled':''))
    + '<span class="uc-tool-hint">等待仅推进游戏时间，不调用模型</span></div>';
  const composer='<div class="composer-wrap"><div class="composer uc-composer">'
    + '<textarea class="field-in" data-field="draft" maxlength="1000" rows="2" enterkeyhint="send" aria-label="输入消息" placeholder="发消息…">'+esc(draft)+'</textarea>'
    + btn('send','发送','primary',pending?'disabled':'')+'</div></div>';
  return {recipient:chosen,replyId:lastPending,html:CHAT_STYLE+'<div class="chat-thread uc-thread">'
    + '<header class="th-head">'+btn('back-to-inbox','‹ 返回','text-button')
    +'<span class="uc-portrait" style="width:36px;height:36px;border-radius:50%" aria-hidden="true">'+esc(contact.name.slice(0,1))+'</span>'
    + '<div class="th-title"><strong>'+esc(contact.name)+'</strong><small>可连续发送 · 手动触发回复</small></div></header>'
    + '<div class="msgs" data-keep-scroll="world-sms-'+esc(chosen)+'" role="log" aria-live="polite">'
    +(bubbles||'<p class="chat-empty">发几条消息都可以。发送后再点“让对方回复”，或等一段游戏时间查看已读状态。</p>')
    +pendingUI+'</div>'+tools+composer+'</div>'};
}
