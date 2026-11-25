import {expect,it,vi} from 'vitest';
import {createApp,h,nextTick} from 'vue';
import {createInitialState,novelDestinations} from '../src/runtime/model';
import type {ShellActions,ShellModel} from '../src/frontend/types';
import {regions,sheets,positionOf} from '../src/frontend/flat-map/maps';
import {mapTrip,submitMapTrip} from '../src/frontend/map-travel';
import MapView from '../src/frontend/MapView.vue';
import {setMapMode} from '../src/frontend/flat-map/preference';
import {sandboxCacheKey} from '../src/frontend/sandbox-cache';
const legacy=vi.hoisted(()=>({mounts:0,releases:0}));
vi.mock('../src/frontend/WorldMap.vue',async()=>{const {defineComponent,h,onBeforeUnmount}=await import('vue');return {default:defineComponent({setup(){legacy.mounts++;onBeforeUnmount(()=>legacy.releases++);return ()=>h('canvas')}})}});
const model=()=>({state:createInitialState(),busy:false,notice:''} as ShellModel);
it('covers the authoritative destinations once, including overseas airports, with no travel IDs for exhibits',()=>{
 const pins=regions.flatMap(k=>sheets[k].pins.filter(p=>p.kind==='place').map(p=>p.id));
 expect(pins.sort()).toEqual(novelDestinations.map(p=>p.id).sort());
 for(const k of regions){const s=sheets[k];expect(Object.values(s.layers).every(p=>p.startsWith('M')&&!p.includes('NaN'))).toBe(true);
 for(const p of s.pins){expect(p.x).toBeGreaterThanOrEqual(s.bounds[0]);expect(p.x).toBeLessThanOrEqual(s.bounds[2]);expect(p.y).toBeGreaterThanOrEqual(s.bounds[1]);expect(p.y).toBeLessThanOrEqual(s.bounds[3])}}
 expect(positionOf('haneda-airport')?.region).toBe('tokyo');expect(positionOf('cdg-airport')?.region).toBe('cdg');expect(positionOf('apple-park')).toBeUndefined();
});
it('browsing cannot create a cross-border shortcut; legal departures use the existing transaction only once',async()=>{
 const m=model(),state=JSON.stringify(m.state),interact=vi.fn(async()=>true),actions={interact} as unknown as ShellActions;
 for(const id of [m.state.locationId,'cdg-airport','apple-park']){expect(mapTrip(m,id,true).blocked).toBeTruthy();expect(await submitMapTrip(m,actions,id,true)).toBe(false)}
 expect(JSON.stringify(m.state)).toBe(state);expect(interact).not.toHaveBeenCalled();expect(await submitMapTrip(m,actions,'library',true)).toBe(true);expect(interact.mock.calls).toEqual([[{type:'novel_travel',locationId:'library'}]]);
 m.busy=true;expect(await submitMapTrip(m,actions,'library',true)).toBe(false);expect(interact).toHaveBeenCalledTimes(1);
});
it('does not mount a 3D scene in 2D, and switching back unmounts before releasing the retained cache',async()=>{
 const el=document.createElement('div'),events:number[]=[];const app=createApp({render:()=>h(MapView,{model:model(),actions:{} as ShellActions,novelMode:true})});
 app.provide(sandboxCacheKey,{clear:()=>events.push(legacy.releases)} as unknown as NonNullable<ReturnType<typeof import('../src/frontend/sandbox-cache').createSandboxCache>>);
 app.mount(el);try{
 expect(el.querySelector('[data-map-view="2d"]')).toBeTruthy();expect(legacy.mounts).toBe(0);expect(el.querySelector('canvas')).toBeNull();
 setMapMode('3d');await vi.waitFor(()=>expect(el.querySelector('canvas')).toBeTruthy());expect(legacy.mounts).toBe(1);
 setMapMode('2d');await nextTick();expect(events).toEqual([1]);expect(el.querySelector('canvas')).toBeNull();expect(el.querySelector('.fm-svg')).toBeTruthy();
 }finally{app.unmount();setMapMode('2d')}
});
it('opens every region, previews blocked trips and exhibits, and locates the same room without a renderer or save',async()=>{
 setMapMode('2d');
 const m=model(),snapshot=JSON.stringify(m.state),dispatch=vi.fn(),el=document.createElement('div');
 const gl=vi.spyOn(HTMLCanvasElement.prototype,'getContext'),raf=vi.spyOn(window,'requestAnimationFrame');
 const app=createApp(MapView,{model:m,actions:{dispatch} as unknown as ShellActions,novelMode:true});
 try{app.mount(el);await nextTick();
 const original=el.querySelector('.fm-detail h3')?.textContent;
 for(const [region,id] of [['world','atlas-fuji'],['tokyo','library'],['beijing','beijing-forbidden-city'],['california','apple-park'],['london','london-anon-school'],['moscow','moscow-palace-soviets'],['paris','paris-eiffel'],['cdg','cdg-airport']]){
  const area=el.querySelector<HTMLSelectElement>('.fm-region select')!;area.value=region;area.dispatchEvent(new Event('change'));await nextTick();
  const input=el.querySelector<HTMLInputElement>('.fm-tools input')!;input.value=id;input.dispatchEvent(new Event('input'));await nextTick();
  el.querySelector<HTMLButtonElement>('[data-place="'+id+'"]')!.click();await nextTick();
  expect(el.querySelector('.fm-detail h3')?.textContent).not.toBe('');
  if (['beijing','london','moscow','paris','cdg'].includes(region)) {
    const image = el.querySelector<HTMLImageElement>('.fm-bg-preview img');
    expect(image?.getAttribute('src')).toMatch(/(?:\.webp|data:image\/webp)/);
    expect(image?.alt).toContain(el.querySelector('.fm-detail h3')!.textContent);
  }
  const travel=el.querySelector<HTMLButtonElement>('.fm-go');
  if(['california','world','london','moscow'].includes(region))expect(travel).toBeNull();else expect(travel?.disabled).toBe(region!=='tokyo');
  expect(el.querySelector('canvas')).toBeNull();
 }
 el.querySelector<HTMLButtonElement>('.fm-locate')!.click();await nextTick();expect(el.querySelector('.fm-detail h3')?.textContent).toBe(original);
 expect(dispatch).not.toHaveBeenCalled();expect(JSON.stringify(m.state)).toBe(snapshot);expect(gl).not.toHaveBeenCalled();expect(raf).not.toHaveBeenCalled();
 }finally{app.unmount();gl.mockRestore();raf.mockRestore()}
});
