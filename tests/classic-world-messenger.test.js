import { describe, expect, it } from 'vitest';
import { renderWorldMessenger, worldMessageRecipients, worldMessageRows } from '../integration/dual-protagonists/phone-messenger.js';
import { readFileSync } from 'node:fs';

const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn = (action,label,style='',attrs='') => '<button data-action="'+action+'" class="'+style+'" '+attrs+'>'+esc(label)+'</button>';
const heading = label => '<h1>'+esc(label)+'</h1>';
const time = at => '第 1 天 '+String(Math.floor(at / 60) % 24).padStart(2,'0')+':'+String(at%60).padStart(2,'0');
const helpers = {esc,btn,heading,time};
const current = {
  owner:'emma',name:'樱羽艾玛',now:1040,
  others:[{id:'soyo',name:'长崎素世'},{id:'sakiko',name:'丰川祥子'},{id:'renako',name:'甘织玲奈子'}],
  other:{id:'soyo',name:'长崎素世'},
  conversation:[
    {id:'dual:a',from:'emma',to:'soyo',text:'旧的分段短信',direction:'outgoing',at:1020,expectsReply:true,answered:false,replyTo:null,receipt:'read'},
    {id:'dual:b',from:'emma',to:'soyo',text:'你今天有空吗？',direction:'outgoing',at:1020,expectsReply:true,answered:false,replyTo:null,receipt:'read'},
    {id:'dual:c',from:'sakiko',to:'emma',text:'此处是祥子的私人会话',direction:'incoming',at:1000,replyTo:null,receipt:'received'},
  ],
  npcPhone: {
    contacts:[{id:'majo-yuki',contactId:'majo-yuki',name:'月代雪'}],
    groups:[{id:'majo-house',name:'大家的群聊',memberCount:14}],
    requests:[{id:'request-1',name:'月代雪',kind:'contact',quote:'我们交换号码吗？',status:'pending'}],
    messages:[
      {id:'npc:a',channel:'npc',targetId:'majo-yuki',direction:'outgoing',status:'pending',text:'雪，你在吗？',at:1010,replyTo:null,receipt:'read'},
      {id:'npc:b',channel:'group',targetId:'majo-house',direction:'outgoing',status:'pending',text:'大家好',at:1015,replyTo:null,receipt:'read'},
    ],
  },
  messages:[],
};

describe('classic fictional messenger presentation', () => {
  it('lists real recipients and separates each protagonist and NPC/group thread', () => {
    expect(worldMessageRecipients(current).map(row=>row.key)).toEqual([
      'protagonist:soyo','protagonist:sakiko','protagonist:renako','npc:majo-yuki','group:majo-house',
    ]);
    expect(worldMessageRows(current,'protagonist:soyo').map(m=>m.text)).toEqual(['旧的分段短信','你今天有空吗？']);
    expect(worldMessageRows(current,'protagonist:sakiko').map(m=>m.text)).toEqual(['此处是祥子的私人会话']);
    expect(worldMessageRows(current,'npc:majo-yuki').map(m=>m.text)).toEqual(['雪，你在吗？']);
    expect(worldMessageRows(current,'group:majo-house').map(m=>m.text)).toEqual(['大家好']);
  });

  it('restores the native contacts list and keeps the contact invitation workflow', () => {
    const result = renderWorldMessenger({data:current,recipient:'protagonist:soyo',mode:'list',drafts:new Map(),pending:null},helpers);
    expect(result.html).toContain('class="conv"');
    expect(result.html).toContain('data-action="open-thread"');
    expect(result.html).toContain('data-action="accept-contact"');
    expect(result.html).toContain('大家的群聊');
    expect(result.html).toContain('樱羽艾玛');
    expect(result.html).not.toContain('发送不会自动请求模型');
    // A contact-list preview may show this owner's other conversations; only the open thread is isolated.
  });

  it('uses a native-style bubble composer; explicit manual reply targets the latest segment', () => {
    const drafts = new Map([['protagonist:soyo','继续补充一句…']]);
    const result = renderWorldMessenger({data:current,recipient:'protagonist:soyo',mode:'thread',drafts,pending:null},helpers);
    expect(result.replyId).toBe('dual:b');
    expect(result.html).toContain('class="chat-thread uc-thread"');
    expect(result.html).toContain('class="msgs"');
    expect(result.html).toContain('data-field="draft"');
    expect(result.html).toContain('继续补充一句…');
    expect(result.html).toContain('data-action="request-reply"');
    expect(result.html).toContain('data-id="dual:b"');
    expect(result.html).toContain('data-action="wait-read"');
    expect(result.html).toContain('data-minutes="5"');
    expect(result.html).toContain('✓✓ 已读');
    expect(result.html).not.toContain('此处是祥子的私人会话');
    expect(result.html).not.toContain('sms-read-animation');
  });

  it('keeps developer mechanics out of player-visible message chrome', () => {
    const list = renderWorldMessenger({data:current,recipient:'protagonist:soyo',mode:'list',drafts:new Map(),pending:null},helpers);
    const thread = renderWorldMessenger({data:current,recipient:'protagonist:soyo',mode:'thread',drafts:new Map(),pending:null},helpers);
    expect(thread.html).toContain('<div class="th-title"><strong>长崎素世</strong></div>');
    expect(thread.html).toContain('data-action="request-reply"');
    expect(thread.html).toContain('data-action="wait-read"');
    for (const html of [list.html, thread.html]) {
      for (const forbidden of ['可连续发送','不触发正文','手动触发回复','发送不会自动请求模型','已读按游戏分钟模拟','不调用模型']) {
        expect(html).not.toContain(forbidden);
      }
    }
    const empty = structuredClone(current);
    empty.conversation = [];
    const emptyThread = renderWorldMessenger({data:empty,recipient:'protagonist:soyo',mode:'thread',drafts:new Map(),pending:null},helpers);
    expect(emptyThread.html).toContain('暂无消息');
    expect(emptyThread.html).not.toContain('发几条消息都可以');
  });

  it('only displays real returned read status, not a decorative timer animation', () => {
    const data = structuredClone(current);
    data.conversation[0].receipt = 'delivered';
    data.conversation[1].receipt = 'delivered';
    const sent = renderWorldMessenger({data,recipient:'protagonist:soyo',mode:'thread',drafts:new Map(),pending:null},helpers);
    expect(sent.html).toContain('✓ 已送达');
    expect(sent.html).not.toContain('✓✓ 已读');
  });

  it('does not interpolate untrusted messages as HTML', () => {
    const data=structuredClone(current);
    data.conversation[1].text='<img src=x onerror=alert(1)>';
    const view=renderWorldMessenger({data,recipient:'protagonist:soyo',mode:'thread',drafts:new Map(),pending:null},helpers);
    expect(view.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(view.html).not.toContain('<img src=x');
  });

  it('shows a centered return-to-story cue only after the matching incoming reply', () => {
    const data=structuredClone(current);
    data.npcPhone.messages.push({id:'npc:a:reply',channel:'npc',targetId:'majo-yuki',direction:'incoming',text:'我知道啦。',speakerName:'月代雪',at:1040,replyTo:'npc:a'});
    data.phoneScenes=[{messageId:'npc:a:reply',storyId:'phone-scene:npc:a:reply'}];
    const view=renderWorldMessenger({data,recipient:'npc:majo-yuki',mode:'thread',drafts:new Map(),pending:null},helpers);
    expect(view.html).toContain('class="uc-scene-handoff"');
    expect(view.html).toContain('data-action="return-to-story"');
    expect(view.html).toContain('data-id="phone-scene:npc:a:reply"');
    expect(view.html.indexOf('data-message-id="npc:a:reply"')).toBeLessThan(view.html.indexOf('class="uc-scene-handoff"'));
    expect(renderWorldMessenger({data,recipient:'protagonist:soyo',mode:'thread',drafts:new Map(),pending:null},helpers).html).not.toContain('uc-scene-handoff" role=');
    data.phoneScenes=[];
    expect(renderWorldMessenger({data,recipient:'npc:majo-yuki',mode:'thread',drafts:new Map(),pending:null},helpers).html).not.toContain('uc-scene-handoff" role=');
  });

  it('includes the actual app lifecycle with manual-only reply and time notifications', () => {
    const life=readFileSync('src/frontend/lifecycle.ts','utf8');
    const api=readFileSync('src/frontend/world-phone.ts','utf8');
    const app=readFileSync('integration/dual-protagonists/phone-apps.js','utf8');
    const build=readFileSync('scripts/build_embedded_phone.mjs','utf8');
    expect(life).not.toContain('onOutgoingMessage(messageId)');
    expect(life).not.toContain('if (pendingReply && !doc.hidden)');
    expect(api).toContain('async waitForRead(');
    expect(api).not.toContain('options.onOutgoingMessage?.(');
    expect(app).toContain("case 'request-reply'");
    expect(app).toContain("case 'wait-read'");
    expect(app).toContain("renderWorldMessenger(");
    expect(build).toContain('UNREAD_CITY_PHONE_CHAT');
  });
});
