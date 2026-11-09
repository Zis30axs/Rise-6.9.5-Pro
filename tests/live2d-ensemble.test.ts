import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { live2dIdentity, live2dNames } from '../src/runtime/live2d-identity';
import { chooseLive2dOutfit, confirmLive2dOutfit, live2dAppearancePrompt, live2dAppearanceScene, outfitEnvironment, outfitWeight, selectOutfit, visibleLive2dPeople } from '../src/runtime/live2d-wardrobe';
import { ensembleEmotion } from '../src/frontend/live2d-ensemble-assets';
import { createInitialState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { createTavernBridge } from '../src/runtime/bridge';
import manifest from '../assets/live2d-ensemble/manifest.json';
import type { Live2dOutfit, Live2dPackStatus } from '../src/runtime/live2d-pack';
const models=manifest.models as Live2dOutfit[];
let status:Live2dPackStatus;
beforeEach(()=>{localStorage.clear();sessionStorage.clear();status={installed:true,enabled:true,generation:1,pack:'test-pack',models};vi.stubGlobal('__UC_LIVE2D__',{status:()=>status});});
afterEach(()=>vi.unstubAllGlobals());
describe('optional ensemble wardrobe',()=>{
  it('matches all ten identities exactly and excludes narration and ambiguous text',()=>{
    for(const [id,name] of Object.entries(live2dNames)){expect(live2dIdentity(id)).toBe(id);expect(live2dIdentity(name)).toBe(id);}
    for(const name of ['','旁白','我想见素世','初华的朋友','Unknown'])expect(live2dIdentity(name)).toBeNull();
    expect(live2dIdentity('bang-rana')).toBe('raana');expect(live2dIdentity('protagonist-sakiko')).toBe('sakiko');
  });
  it('does nothing when absent/disabled, including no local clothing save',()=>{
    const state=createInitialState();status.enabled=false;
    expect(chooseLive2dOutfit('disabled',state,'soyo')).toBeNull();expect(live2dAppearancePrompt('disabled',state)).toBe('');
    expect(localStorage.length).toBe(0);vi.stubGlobal('__UC_LIVE2D__',undefined);
    expect(chooseLive2dOutfit('absent',state,'soyo')).toBeNull();expect(localStorage.length).toBe(0);
  });
  it('preserves choices across minute/dialogue changes and protagonist switching; confirms only loaded models',()=>{
    const state=enableProtagonists(createInitialState()),session='stable';
    const first=chooseLive2dOutfit(session,state,'soyo')!;expect(first).toBeTruthy();
    expect(live2dAppearancePrompt(session,state)).toBe('');
    const release=confirmLive2dOutfit(session,'soyo',first.choice,status);
    expect(live2dAppearancePrompt(session,state)).toContain(first.outfit.description);
    const originalMinute=state.clock.minute;state.clock.minute=(originalMinute+1)%60;
    expect(chooseLive2dOutfit(session,state,'soyo')?.choice).toEqual(first.choice);state.clock.minute=originalMinute;
    const switched=reduceState(state,{type:'switch_protagonist',target:'sakiko'});
    const returned=reduceState(switched,{type:'switch_protagonist',target:'soyo'});
    expect(chooseLive2dOutfit(session,returned,'soyo')?.choice).toEqual(first.choice);
    const stored=JSON.parse(localStorage.getItem('unread-city-live2d-wardrobe-v1:stable')!);expect(stored.soyo).toEqual(first.choice);
    release();expect(live2dAppearancePrompt(session,state)).toBe('');
  });
  it('rejects stale confirmation and never selects unseen people',()=>{
    const state=createInitialState(),session='offscene';
    const absent=models.find(row=>!visibleLive2dPeople(state).has(row.person))!.person;
    expect(chooseLive2dOutfit(session,state,absent)).toBeNull();
    const chosen=chooseLive2dOutfit(session,state,'soyo')!;
    const old={...status};status.generation++;
    confirmLive2dOutfit(session,'soyo',chosen.choice,old);expect(live2dAppearancePrompt(session,state)).toBe('');
    confirmLive2dOutfit(session,'soyo',chosen.choice,status);
    state.clock.hour=(state.clock.hour+6)%24;expect(live2dAppearancePrompt(session,state)).toBe('');
  });
  it('restores a persisted choice on a fresh session read, without restoring render confirmation',()=>{
    const state=createInitialState(),session='persisted-reentry';
    const outfit=models.find(row=>row.person==='soyo'&&row.tags.includes('school'))!;
    const choice={id:outfit.id,pack:status.pack,trigger:JSON.stringify(outfitEnvironment(state,'soyo'))};
    localStorage.setItem(`unread-city-live2d-wardrobe-v1:${session}`,JSON.stringify({soyo:choice}));
    expect(chooseLive2dOutfit(session,state,'soyo')?.choice).toEqual(choice);
    expect(live2dAppearancePrompt(session,state)).toBe('');
  });
  it('uses explicit activities, without treating observation as study or borrowing player activities for NPCs',()=>{
    const state=createInitialState();
    state.interior={roomId:'classroom',x:0,z:0,yaw:0,activityId:'classroom-window',lastRest:null,lastStudy:null};
    for(const id of ['classroom-window','classroom-board','study-shelf','study-window']){
      state.interior.activityId=id;expect(outfitEnvironment(state,'soyo').activity).toBe('ordinary');
    }
    for(const id of ['classroom-notes','study-focus','study-reading']){
      state.interior.activityId=id;expect(outfitEnvironment(state,'soyo').activity).toBe('study');
      expect(outfitEnvironment(state,'anon').activity).toBe('ordinary');
    }
    state.interior.roomId='mlm-office';state.interior.activityId='mlm-phone-sales';
    expect(outfitEnvironment(state,'soyo').activity).toBe('work');
    state.interior.activityId='mlm-observe-board';expect(outfitEnvironment(state,'soyo').activity).toBe('ordinary');
  });
  it('keeps encounter and roster outfit facts consistent with confirmed rendering and preserves fallback facts',()=>{
    const state=createInitialState(),session='scene-projection';
    const chosen=chooseLive2dOutfit(session,state,'soyo')!;
    const original={id:'soyo',outfit:'旧衣着',name:'长崎素世'};
    const unrelated={id:'unknown',outfit:'原有衣着'};
    const scene={nearbyPeople:[original,unrelated],encounter:{...original}};
    expect(live2dAppearanceScene(session,state,scene)).toEqual(scene);
    const release=confirmLive2dOutfit(session,'soyo',chosen.choice,status);
    const projected=live2dAppearanceScene(session,state,scene);
    expect(projected.encounter.outfit).toBe(`${chosen.outfit.label}。${chosen.outfit.description}`);
    expect(projected.nearbyPeople[0].outfit).toBe(projected.encounter.outfit);
    expect(projected.nearbyPeople[1]).toBe(unrelated);expect(scene.encounter.outfit).toBe('旧衣着');
    expect(live2dAppearancePrompt(session,state)).toContain(projected.encounter.outfit);
    status.pack='different-pack';expect(live2dAppearanceScene(session,state,scene)).toEqual(scene);status.pack='test-pack';
    state.clock.hour=(state.clock.hour+6)%24;expect(live2dAppearanceScene(session,state,scene)).toEqual(scene);
    state.clock.hour=(state.clock.hour+18)%24;
    release();expect(live2dAppearanceScene(session,state,scene)).toEqual(scene);
    status.enabled=false;expect(live2dAppearanceScene(session,state,scene)).toBe(scene);
    vi.stubGlobal('__UC_LIVE2D__',undefined);expect(live2dAppearanceScene(session,state,scene)).toBe(scene);
  });
  it('weights genuine environment facts and produces deterministic varied choices',()=>{
    const env=outfitEnvironment(createInitialState(),'soyo');
    const summer=models.find(row=>row.person==='soyo'&&row.tags.includes('summer'))!,winter=models.find(row=>row.person==='soyo'&&row.tags.includes('warm'))!;
    expect(outfitWeight(winter,{...env,month:1,weather:'snow'})).toBeGreaterThan(outfitWeight(summer,{...env,month:1,weather:'snow'}));
    expect(outfitWeight(summer,{...env,month:8,weather:'hot'})).toBeGreaterThan(outfitWeight(winter,{...env,month:8,weather:'hot'}));
    const school=models.find(row=>row.person==='soyo'&&row.tags.includes('school'))!;
    expect(outfitWeight(school,{...env,activity:'study'})).toBeGreaterThan(outfitWeight(school,{...env,activity:'ordinary'}));
    const stage=models.find(row=>row.person==='soyo'&&row.tags.includes('performance'))!;
    expect(outfitWeight(stage,{...env,activity:'performance'})).toBeGreaterThan(outfitWeight(stage,env)*100);
    expect(selectOutfit(models,'soyo',env,'stable')).toEqual(selectOutfit([...models].reverse(),'soyo',env,'stable'));
    expect(new Set(Array.from({length:100},(_,day)=>selectOutfit(models,'soyo',{...env,day},'varied')!.id)).size).toBeGreaterThan(2);
  });
  it('falls back only to expression and motion names present in the current model',()=>{
    const def={model:'x',textures:[],expressions:[{name:'mts_default',file:'x'},{name:'mts_smile01',file:'x'}],motions:{idle01:[{file:'x'}],smile01:[{file:'x'}]}};
    expect(ensembleEmotion(def,'开心')).toEqual({expression:'mts_smile01',motion:'smile01'});
    expect(ensembleEmotion(def,'unknown')).toEqual({expression:'mts_default',motion:'idle01'});
    expect(ensembleEmotion({...def,expressions:[],motions:{}},'生气')).toEqual({expression:undefined,motion:undefined});
  });
});

it.each(['tavern','chat','responses'])('injects the confirmed costume through the existing %s narrative route',async mode=>{
  const answer='<story>窗外很安静。</story><phone_messages>[]</phone_messages>';
  const generate=vi.fn(async()=>answer);
  const script={parent:{SillyTavern:{getContext:()=>({characterId:0,characters:{0:{avatar:'unread-city.png'}},chatId:`clothes-${mode}`,mainApi:'openai'})}},
    getVariables:()=>({}),replaceVariables:vi.fn(),eventOn:vi.fn(),eventRemoveListener:vi.fn(),tavern_events:{CHAT_CHANGED:'chat_changed'},generate,stopGenerationById:vi.fn()} as unknown as Window;
  const bridge=createTavernBridge(script)!,state=createInitialState();
  const selected=chooseLive2dOutfit(bridge.session()!,state,'soyo')!;
  const release=confirmLive2dOutfit(bridge.session()!,'soyo',selected.choice,status);
  const fetchMock=vi.fn(async()=>new Response(JSON.stringify(mode==='chat'?{choices:[{message:{content:answer}}]}:{output_text:answer}),{status:200}));
  if(mode!=='tavern'){localStorage.setItem('unread-city:story-api:v1',JSON.stringify({mode:'custom',format:mode,endpoint:'https://model.example/v1',model:'test'}));vi.stubGlobal('fetch',fetchMock);}
  await bridge.generate('看看窗外',state);
  const payload=JSON.stringify(mode==='tavern'?generate.mock.calls:fetchMock.mock.calls);
  expect(payload).toContain('当前可见衣着');expect(payload).toContain(selected.outfit.description);
  status.enabled=false;
  generate.mockClear();fetchMock.mockClear();await bridge.generate('看看窗外',state);
  expect(JSON.stringify(mode==='tavern'?generate.mock.calls:fetchMock.mock.calls)).not.toContain('当前可见衣着');
  release();bridge.dispose();
});
