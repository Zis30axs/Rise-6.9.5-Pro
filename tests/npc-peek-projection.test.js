import { describe, expect, it } from 'vitest';
import { peekWorld, visiblePeekSnapshot, newPeekDialogue } from '../integration/dual-protagonists/phone-peek.js';

const owner='樱羽艾玛', npc='雪';
function fixture() {
  return {
    binding:'scene-1',revision:12,owner:'emma',active:'emma',name:owner,
    npcPhone:{
      contacts:[{id:'majo-yuki',contactId:'majo-yuki',name:npc}],
      messages:[
        {id:'npc:old',owner:'emma',channel:'npc',targetId:'majo-yuki',direction:'outgoing',at:10,text:'先前真实发出的短信'},
        {id:'npc:reply',owner:'emma',channel:'npc',targetId:'majo-yuki',direction:'incoming',at:11,text:'先前真实收到的回复'},
        {id:'npc:other',owner:'soyo',channel:'npc',targetId:'majo-yuki',direction:'outgoing',at:12,text:'其他主角的私人短信'},
      ],
    },
  };
}
const simulated={
  name:npc,at:100,chats:[
    {with:owner,lines:[{from:'me',text:'被缓存的虚假主角发言'}]},
    {with:'长崎素世',lines:[{from:'长崎素世',text:'另一个主角的假消息'}]},
    {with:'朋友',lines:[{from:npc,text:'今晚见面吧'}]},
  ],
  photos:[],notes:[],searches:['音乐教室'],cart:[{name:'电吉他',price:123,note:'想买'}],
};

describe('NPC peek projection against authoritative game SMS', () => {
  it('overrides all simulated protagonist chat with real canonical history without losing cart',()=>{
    const shown=visiblePeekSnapshot(simulated,fixture());
    expect(shown.chats.map(c=>c.with)).toEqual([owner,'朋友']);
    expect(shown.chats[0].lines.map(x=>x.text)).toEqual(['先前真实发出的短信','先前真实收到的回复']);
    expect(JSON.stringify(shown)).not.toContain('其他主角的私人短信');
    expect(JSON.stringify(shown)).not.toContain('被缓存的虚假主角发言');
    expect(shown.cart[0].name).toBe('电吉他');
    expect(simulated.chats).toHaveLength(3); // Projection must never corrupt IndexedDB cached snapshot.
  });

  it('displays true NPC conversation even before the first generated full peek',()=>{
    const shown=visiblePeekSnapshot(null,fixture(),npc);
    expect(shown.name).toBe(npc);
    expect(shown.chats[0].lines).toHaveLength(2);
    expect(shown.cart).toEqual([]);
  });

  it('generates new dialogue as both characters while ignoring echoed true messages',()=>{
    const world=fixture(),contact=world.npcPhone.contacts[0];
    const draft={chats:[{with:owner,lines:[
      {from:'me',text:'先前真实发出的短信'},
      {from:npc,text:'先前真实收到的回复'},
      {from:'me',text:'我想再问一个问题。'},
      {from:npc,text:'你问吧。'},
    ]}]};
    expect(newPeekDialogue(draft,world,contact)).toEqual([
      {speaker:'protagonist',text:'我想再问一个问题。'},
      {speaker:'npc',text:'你问吧。'},
    ]);
  });

  it('rejects forged speakers, incomplete conversations and too many generated messages',()=>{
    const world=fixture(),contact=world.npcPhone.contacts[0];
    expect(()=>newPeekDialogue({chats:[{with:owner,lines:[
      {from:'me',text:'问题'}, {from:'不认识的人',text:'错误回复'},
    ]}]},world,contact)).toThrow('发言者无效');
    expect(()=>newPeekDialogue({chats:[{with:owner,lines:[
      {from:'me',text:'未完待续'},
    ]}]},world,contact)).toThrow('轮流发言');
    const eight=Array.from({length:8},(_,i)=>({from:i%2===0?'me':npc,text:'第'+i+'条'}));
    expect(()=>newPeekDialogue({chats:[{with:owner,lines:eight}]},world,contact)).toThrow('最多三轮');
  });

  it('reads the live in-card capability from the parent when in the embedded iframe',()=>{
    const snapshot=fixture();
    expect(peekWorld({parent:{__unreadCityWorldPhone:{read:()=>snapshot}}})).toBe(snapshot);
    expect(peekWorld({parent:{__unreadCityWorldPhone:{read:()=>{throw Error('disposed');}}}})).toBe(null);
  });
});
