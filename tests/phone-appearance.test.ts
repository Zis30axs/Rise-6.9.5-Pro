import {describe,expect,it} from 'vitest';
import {createInitialState,parseState,reduceState} from '../src/runtime/model';
import {defaultPhoneAppearance,enableProtagonists,parsePhoneAppearance} from '../src/runtime/protagonist-world';
import {createWorldPhoneApi} from '../src/frontend/world-phone';

describe('device-owned phone appearance',()=>{
  it('reads old PR4 saves without adding fields or changing balances',()=>{
    const old=enableProtagonists(createInitialState()), copy=structuredClone(old);
    const parsed=parseState(JSON.parse(JSON.stringify(old)));
    expect(parsed).toEqual(copy);
    expect(defaultPhoneAppearance('soyo').theme).toBe('light');
    expect(defaultPhoneAppearance('sakiko').theme).toBe('dark');
    expect(defaultPhoneAppearance('emma').theme).toBe('dark');
  });
  it('persists each device after switching, serializing and reloading',()=>{
    let s=enableProtagonists(createInitialState());
    const soyo={wallpaper:'plain',theme:'dark',layout:'focus'} as const;
    const sakiko={wallpaper:'signature',theme:'light',layout:'daily'} as const;
    s=reduceState(s,{type:'phone_app',owner:'soyo',requestId:'visual-soyo',command:{type:'appearance',appearance:soyo}});
    s=reduceState(s,{type:'switch_protagonist',target:'sakiko'});
    s=reduceState(s,{type:'phone_app',owner:'sakiko',requestId:'visual-sakiko',command:{type:'appearance',appearance:sakiko}});
    s=reduceState(s,{type:'switch_protagonist',target:'emma'});
    const emma={wallpaper:'signature',theme:'light',layout:'focus'} as const;
    s=reduceState(s,{type:'phone_app',owner:'emma',requestId:'visual-emma',command:{type:'appearance',appearance:emma}});
    s=parseState(JSON.parse(JSON.stringify(s)));
    s=reduceState(s,{type:'switch_protagonist',target:'soyo'});
    expect(s.protagonists!.devices.soyo.appearance).toEqual(soyo);
    expect(s.protagonists!.devices.sakiko.appearance).toEqual(sakiko);
    expect(s.protagonists!.devices.emma.appearance).toEqual(emma);
  });
  it('rejects invalid resource choices and changing another device',()=>{
    expect(()=>parsePhoneAppearance({wallpaper:['plain'],theme:'dark',layout:'daily'})).toThrow();
    expect(()=>parsePhoneAppearance({wallpaper:'https://example.com/a',theme:'dark',layout:'daily'})).toThrow();
    expect(()=>parsePhoneAppearance({wallpaper:'plain',theme:'dark',layout:'daily',url:'file://bad'})).toThrow();
    const s=enableProtagonists(createInitialState());
    expect(()=>reduceState(s,{type:'phone_app',owner:'sakiko',requestId:'not-my-phone',command:{type:'appearance',appearance:defaultPhoneAppearance('sakiko')}})).toThrow(/只有本人/);
  });
  it('rejects a late preference save after a protagonist switch',async()=>{
    let s=enableProtagonists(createInitialState());
    const api=createWorldPhoneApi({session:'appearance-test',current:()=>true,busy:()=>false,state:()=>s,commit:action=>(s=reduceState(s,action))});
    const binding=api.read();
    expect(binding.deviceId).toBe('unread-city-phone-soyo');
    s=reduceState(s,{type:'switch_protagonist',target:'sakiko'});
    await expect(api.act({binding:binding.binding,revision:binding.revision,requestId:'stale-theme',owner:'soyo',command:{type:'appearance',appearance:defaultPhoneAppearance('soyo')}})).rejects.toThrow(/已经切换/);
    expect(api.read().deviceId).toBe('unread-city-phone-sakiko');
  });
});
