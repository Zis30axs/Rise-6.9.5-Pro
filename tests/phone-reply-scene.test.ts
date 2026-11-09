import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { applyPhoneReply, enableProtagonists } from '../src/runtime/protagonist-world';
import { applyNpcPhoneReply } from '../src/runtime/npc-phone';
import { parsePhoneReply, parseNpcPhoneReply, parsePhoneReplyWithScene } from '../src/runtime/phone-reply';
import { appendPhoneReplyScene, mainStoryEntries, phoneSceneId } from '../src/runtime/phone-scene';
import { createWorldPhoneApi } from '../src/frontend/world-phone';

const id = 'npc:42bbbc3d-eac6-4e5c-91a4-1b9dd455abb7';
const narrated = '目白台的房间里安静下来。\n“周六吗。”<tts>王冢真唯|confident|周六吗。</tts>';
const combined = '<phone_reply>{"messageId":"' + id + '","text":"十点见！"}</phone_reply>\n' + narrated;

describe('optional manual SMS off-screen narrative', () => {
  it('keeps the phone reply JSON separate from the trailing novel, accepting original output', () => {
    expect(parseNpcPhoneReply(combined,id)).toBe('十点见！');
    expect(parsePhoneReply(combined,id)).toBe('十点见！');
    expect(parsePhoneReplyWithScene(combined,id,true)).toEqual({text:'十点见！',sceneText:narrated});
    expect(parsePhoneReplyWithScene('<phone_reply>{"messageId":"' + id + '","text":"好的"}</phone_reply>',id))
      .toEqual({text:'好的'});
  });

  it('accepts a phone tag after unstructured model reasoning', () => {
    const raw = '[assistant]\n[reasoning]\n思考内容\n[content]\n' + combined;
    expect(parsePhoneReplyWithScene(raw, id, true)).toEqual({ text: '十点见！', sceneText: narrated });
  });

  it('chooses the final complete phone tag instead of an example inside planning', () => {
    const raw = [
      '[assistant]',
      '[reasoning]',
      '准备回复。',
      '[content]',
      '<konatan_planning~>',
      '格式示例：`<phone_reply>{"messageId":"' + id + '","text":"示例内容"}</phone_reply>`',
      '</konatan_planning~>',
      '<tucao>只保存正式短信。</tucao>',
      '<phone_reply>{"messageId":"' + id + '","text":"正式回复"}</phone_reply>',
      narrated,
    ].join('\n');
    expect(parsePhoneReplyWithScene(raw, id, true)).toEqual({ text: '正式回复', sceneText: narrated });
  });

  it('still rejects missing tags, wrong message IDs and extra action tags', () => {
    expect(() => parsePhoneReplyWithScene('只有普通正文。', id)).toThrow('phone_reply');
    expect(() => parsePhoneReplyWithScene('前言\n<phone_reply>{"messageId":"wrong","text":"好的"}</phone_reply>', id))
      .toThrow('事件 ID');
    expect(() => parsePhoneReplyWithScene('前言\n' + combined + '<world_actions>[]</world_actions>', id))
      .toThrow('不允许的标签');
  });

  it('rejects mismatched IDs, extra machine actions, invalid JSON and silence plus prose', () => {
    expect(() => parsePhoneReplyWithScene(combined,'npc:other',true)).toThrow('事件 ID');
    expect(() => parsePhoneReplyWithScene(combined+'<world_actions>[]</world_actions>',id,true)).toThrow('不允许的标签');
    expect(() => parsePhoneReplyWithScene('<phone_reply>{"messageId":"' + id + '","text":null}</phone_reply>\n'+narrated,id,true)).toThrow('不能附加');
    expect(() => parsePhoneReplyWithScene('<phone_reply>{"messageId":"' + id + '","text":null}</phone_reply>',id)).toThrow('事件 ID');
    expect(() => parsePhoneReplyWithScene('<phone_reply>{"messageId":"' + id + '","text":"A","extra":true}</phone_reply>',id,true)).toThrow('事件 ID');
  });

  it('atomically records an NPC reply scene as one assistant story entry without changing game time', () => {
    let state=reduceState(enableProtagonists(createInitialState()),{type:'switch_protagonist',target:'emma'});
    state=reduceState(state,{type:'phone_app',requestId:'scene-npc',owner:'emma',command:{type:'send_npc_message',npcId:'majo-yuki',text:'今晚见？'}});
    const before=state.clock, storyLength=state.story.length;
    const reply=applyNpcPhoneReply(state,'npc:scene-npc','当然。');
    const added=appendPhoneReplyScene(reply,'npc:scene-npc:reply',narrated);
    expect(added.clock).toEqual(before);
    expect(added.protagonists!.npcPhone!.messages.at(-1)?.text).toBe('当然。');
    expect(added.story).toHaveLength(storyLength+1);
    expect(mainStoryEntries(added.story)).toHaveLength(storyLength);
    expect(added.story.at(-1)).toMatchObject({id:phoneSceneId('npc:scene-npc:reply'),role:'assistant'});
    expect(added.story.at(-1)!.text).toContain('|王冢真唯|开心|周六吗。|');
    expect(added.story.at(-1)!.text).not.toContain('<tts>');
    expect(added.story.at(-1)!.text).not.toContain('“周六吗。”');
    expect(parseState(added)).toEqual(added);
    expect(appendPhoneReplyScene(added,'npc:scene-npc:reply',narrated)).toEqual(added);
    expect(() => appendPhoneReplyScene(reply,'npc:unknown:reply',narrated)).toThrow('真实收到');
  });

  it('exposes only the current protagonist continuation and validates the return link', () => {
    let state=enableProtagonists(createInitialState());
    state=reduceState(state,{type:'phone_app',requestId:'scene-pro',owner:'soyo',command:{type:'send_message',to:'sakiko',text:'你在吗？'}});
    state=appendPhoneReplyScene(applyPhoneReply(state,'dual:scene-pro','我在。'),'dual:scene-pro:reply','祥子放下了书。');
    const opened:{id:string;viewpoint:string}[]=[];
    const api=createWorldPhoneApi({
      session:'scene-session',current:()=>true,busy:()=>false,state:()=>state,
      commit:action=>{state=reduceState(state,action);return state;},openStory:(id,viewpoint)=>opened.push({id,viewpoint}),
    });
    const view=api.read();
    expect(view.phoneScenes).toEqual([{messageId:'dual:scene-pro:reply',storyId:phoneSceneId('dual:scene-pro:reply')}]);
    api.returnToStory({binding:view.binding,storyId:view.phoneScenes[0].storyId});
    expect(opened).toEqual([{id:phoneSceneId('dual:scene-pro:reply'),viewpoint:'丰川祥子'}]);
    expect(() => api.returnToStory({binding:'wrong',storyId:view.phoneScenes[0].storyId})).toThrow('切换');
    state=reduceState(state,{type:'switch_protagonist',target:'emma'});
    expect(api.read().phoneScenes).toEqual([]);
    expect(() => api.returnToStory({binding:api.read().binding,storyId:view.phoneScenes[0].storyId})).toThrow('已不可查看');
  });
});
