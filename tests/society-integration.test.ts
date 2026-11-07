import { describe, it, expect } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';

describe('strategy social organizations in canonical save', () => {
  it('migrates earlier Lite saves without a society record', () => {
    const before = enableProtagonists(createInitialState());
    delete before.protagonists!.society;
    const next = parseState(JSON.parse(JSON.stringify(before)));
    expect(next.protagonists!.society?.version).toBe(1);
    expect(next.protagonists!.society?.circles).toEqual([]);
  });
  it('creates an independent circle with canonical active owner and preserves it across time/viewpoint changes', () => {
    const world = enableProtagonists(createInitialState());
    const first = reduceState(world, {type:'society',requestId:'circle-start',
      command:{type:'create_circle',id:'little_circle',title:'小小的社交圈'}});
    expect(first.protagonists!.society!.circles[0].founder).toBe('soyo');
    expect(first.protagonists!.society!.circles[0].memberIds).toContain('protagonist-soyo');
    const replay = reduceState(first,{type:'society',requestId:'circle-start',
      command:{type:'create_circle',id:'little_circle',title:'小小的社交圈'}});
    expect(replay).toEqual(first);
    const later = reduceState(first,{type:'wait',minutes:15});
    const viewed = reduceState(later,{type:'switch_protagonist',target:'sakiko'});
    expect(parseState(viewed).protagonists!.society!.circles).toEqual(first.protagonists!.society!.circles);
    expect(() => reduceState(viewed,{type:'society',requestId:'circle-start',
      command:{type:'create_circle',id:'little_circle',title:'错误改名'}})).toThrow(/重复请求/);
  });
});
