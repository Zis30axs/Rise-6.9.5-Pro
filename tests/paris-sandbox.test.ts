import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createApp, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import city from '../assets/paris-sandbox/places.json';
import airport from '../assets/paris-sandbox/airport.json';
import ParisSandbox from '../src/frontend/ParisSandbox.vue';
import { getNovelBackground } from '../src/frontend/novel-backgrounds';
import { internationalConnections } from '../src/runtime/california';

describe('Paris city and airport exhibits', () => {
  it.each([{file:'sandbox',places:city},{file:'airport',places:airport}])('keeps $file focus points attached to the packaged models',({file,places})=>{
    const root=resolve('assets/paris-sandbox');
    const bytes=gunzipSync(readFileSync(resolve(root,file+'.glb.gz.bin')));
    expect(bytes.toString('ascii',0,4)).toBe('glTF');
    expect(bytes.readUInt32LE(8)).toBe(bytes.length);
    const model=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
    const anchors=model.nodes.filter((n:{name:string})=>n.name?.startsWith('poi_'));
    expect(anchors.map((n:{name:string})=>n.name).sort()).toEqual(places.map(p=>'poi_'+p.id).sort());
    for (const p of places) {
      const node=anchors.find((n:{name:string})=>n.name==='poi_'+p.id);
      p.target.forEach((coordinate,i)=>expect(node.translation[i]).toBeCloseTo(coordinate,4));
      expect(readFileSync(resolve(root,'stills',p.id+'.webp')).toString('ascii',8,12)).toBe('WEBP');
      expect(getNovelBackground(file==='airport'?p.id:'paris-'+p.id,2)).toMatchObject({phase:'night',source:'city-art'});
    }
    expect(model.buffers.every((b:{uri?:string})=>!b.uri)).toBe(true);
  });

  it('starts an arrival at its terminal, previews both exhibits for free, and emits only explicit departures',async()=>{
    const host=document.createElement('div');document.body.appendChild(host);
    const travel=vi.fn(), app=createApp(ParisSandbox,{
      standalone:true,locationId:'cdg-airport',routes:internationalConnections('cdg-airport'),
      quote:(id:string)=>({blockedReason:id==='haneda-airport'?'余额不足':null}),onTravel:travel,
    });
    const ctx=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
    const err=vi.spyOn(console,'error').mockImplementation(()=>{});
    const buttons=(query:string)=>[...host.querySelectorAll<HTMLButtonElement>(query)];
    try {
      app.mount(host);await nextTick();await nextTick();
      expect(buttons('.pa-list button')).toHaveLength(2);
      expect(buttons('.pa-list button')[0].getAttribute('aria-pressed')).toBe('true');
      const money=host.querySelector<HTMLButtonElement>('[data-paris-to="haneda-airport"]')!;
      expect(money.disabled).toBe(true);
      buttons('.pa-areas button')[0].click();await nextTick();
      expect(buttons('.pa-list button')).toHaveLength(6);
      buttons('.pa-list button')[3].click();await nextTick();
      expect(host.querySelector('.pa-note')!.textContent).toContain('西岱岛');
      buttons('.pa-areas button')[1].click();await nextTick();
      expect(travel).not.toHaveBeenCalled();
      host.querySelector<HTMLButtonElement>('[data-paris-to="paris-roissypole"]')!.click();
      expect(travel.mock.calls).toEqual([['paris-roissypole']]);
    } finally {app.unmount();host.remove();ctx.mockRestore();err.mockRestore();}
  });
});
