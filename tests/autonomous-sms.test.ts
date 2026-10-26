import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, gameMinute } from '../src/runtime/protagonist-world';
import { stageAutonomousSms, autonomousSmsContext, applyAutonomousSms, parseAutonomousSmsReply } from '../src/runtime/autonomous-sms';
import { storySmsContext } from '../src/runtime/phone-sms';

function prepared() {
  let state = reduceState(enableProtagonists(createInitialState()), {type:'switch_protagonist',target:'emma'});
  const before = state;
  state = reduceState(state, {type:'wait',minutes:120});
  state = stageAutonomousSms(before,state,() => 0);
  return state;
}

describe('autonomous SMS (SillyTavern)', () => {
  it('reserves one candidate on game-time advance, never rerolls on reload', () => {
    const state = prepared();
    expect(state.autonomousSms?.pending).toBeTruthy();
    const id = state.autonomousSms!.pending!.id;
    expect(stageAutonomousSms(state, parseState(state), () => 0).autonomousSms?.pending?.id).toBe(id);
    expect(parseState(state)).toEqual(state);
  });

  it('keeps the agent's private context limited to its own knowledge', () => {
    const state = prepared();
    const id = state.autonomousSms!.pending!.id;
    const ctx = autonomousSmsContext(state,id);
    expect(ctx.task).toBe('consider_unsolicited_sms');
    expect(ctx.recipient.id).toBe('emma');
    expect(JSON.stringify(ctx)).not.toContain('weeklyMemory');
    expect(JSON.stringify(ctx)).not.toContain('otherProtagonist');
  });

  it('delivers unsolicited NPC SMS with canonical thread, unread inbox and notification', () => {
    const state = prepared();
    const task = state.autonomousSms!.pending!;
    expect(task.kind).toBe('npc');
    const next = applyAutonomousSms(state,task.id,'今天有空吗？');
    expect(next.protagonists!.npcPhone!.messages.at(-1)).toMatchObject({
      id:task.id,direction:'incoming',replyTo:null,text:'今天有空吗？',
    });
    expect(next.phone.at(-1)).toMatchObject({id:task.id,read:false});
    expect(next.protagonists!.devices.emma.notifications.at(-1)!.id).toBe('message:' + task.id);
    expect(parseState(next)).toEqual(next);
    expect(applyAutonomousSms(next,task.id,'今天有空吗？')).toEqual(next);
    expect(storySmsContext(next).some(row=>row.text==='今天有空吗？')).toBe(true);
  });

  it('accepts a silence decision without delivery and never replays it', () => {
    const state=prepared(), id=state.autonomousSms!.pending!.id;
    const next=applyAutonomousSms(state,id,null);
    expect(next.autonomousSms?.pending).toBeNull();
    expect(next.phone.some(row=>row.id===id)).toBe(false);
    expect(stageAutonomousSms(next,parseState(next),()=>0).autonomousSms?.pending).toBeNull();
  });

  it('rejects unsolicited replies with unknown ids, additional keys or other operations', () => {
    expect(parseAutonomousSmsReply('<autonomous_sms>{"id":"auto:emma:999","text":null}</autonomous_sms>','auto:emma:999')).toBeNull();
    expect(() => parseAutonomousSmsReply('<autonomous_sms>{"id":"wrong","text":"hi"}</autonomous_sms>','auto:emma:999')).toThrow();
    expect(() => parseAutonomousSmsReply('<autonomous_sms>{"id":"auto:emma:999","text":"hi","action":"travel"}</autonomous_sms>','auto:emma:999')).toThrow();
    expect(() => parseAutonomousSmsReply('<story>Hi</story>','auto:emma:999')).toThrow();
  });

  it('limits SMS checks by game clock, not the device clock', () => {
    const state = prepared();
    const id = state.autonomousSms!.pending!.id;
    const settled = applyAutonomousSms(state,id,'好久不见。');
    const now=gameMinute(settled);
    const later=reduceState(settled,{type:'wait',minutes:5});
    const checked=stageAutonomousSms(settled,later,()=>0);
    expect(checked.autonomousSms!.nextAt).toBeGreaterThan(now);
    expect(checked.autonomousSms!.pending).toBeNull();
  });
});
