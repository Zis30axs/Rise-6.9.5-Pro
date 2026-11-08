import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createTokyoCanvasRenderer, type TokyoCanvasFrame } from '../src/frontend/tokyo-sandbox-canvas';
import { frameTokyoMapCamera } from '../src/frontend/tokyo-sandbox-camera';
import { tokyoCityBounds } from '../src/frontend/tokyo-sandbox-map';

function surface() {
  const gradient={addColorStop:vi.fn()};
  const methods=['beginPath','lineTo','moveTo','closePath','fill','stroke','arc','fillRect','clearRect','setTransform','drawImage'];
  const contexts:Record<string,ReturnType<typeof vi.fn>>[]=[];
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(function(){
    const ctx=Object.fromEntries(methods.map(key=>[key,vi.fn()]));
    ctx.createLinearGradient=vi.fn(()=>gradient);ctx.createRadialGradient=vi.fn(()=>gradient);contexts.push(ctx);
    return ctx as unknown as CanvasRenderingContext2D;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext);
  const canvas=document.createElement('canvas'),renderer=createTokyoCanvasRenderer(canvas);
  const camera=new THREE.PerspectiveCamera();
  frameTokyoMapCamera(camera,{bounds:tokyoCityBounds,width:640,height:420,bearing:0,zoom:1});
  const frame:TokyoCanvasFrame={width:640,height:420,mode:'dusk',clockMinutes:1050,scope:'city',time:1000};
  return {canvas,renderer,camera,frame,contexts};
}
afterEach(()=>vi.restoreAllMocks());

describe('software city map rendering',()=>{
  it('keeps native DPR, the supplied camera and saved framing intact',()=>{
    vi.spyOn(window,'devicePixelRatio','get').mockReturnValue(2.5);
    const {canvas,renderer,camera,frame,contexts}=surface();
    const position=camera.position.clone(),matrix=camera.matrixWorld.clone();
    renderer.render(camera,frame);
    expect([canvas.width,canvas.height]).toEqual([1600,1050]);
    expect(camera.position.equals(position)).toBe(true);expect(camera.matrixWorld.equals(matrix)).toBe(true);
    for(const ctx of contexts)for(const name of ['moveTo','lineTo','arc']){
      for(const args of ctx[name].mock.calls){expect(args.every(Number.isFinite)).toBe(true);if(name==='arc')expect(args[2]).toBeGreaterThan(0);}
    }
    expect(contexts[1].fill.mock.calls.length).toBeGreaterThan(500);
    renderer.dispose();
  });
  it('reuses detailed scenery between animation frames and redraws for camera or atmosphere changes',()=>{
    const {renderer,camera,frame,contexts}=surface();
    renderer.render(camera,frame);const first=contexts[1].clearRect.mock.calls.length;
    renderer.render(camera,{...frame,time:1200});expect(contexts[1].clearRect).toHaveBeenCalledTimes(first);
    renderer.render(camera,{...frame,mode:'night'});expect(contexts[1].clearRect).toHaveBeenCalledTimes(first+1);
    camera.position.x+=5;camera.updateMatrixWorld(true);renderer.render(camera,{...frame,mode:'night'});
    expect(contexts[1].clearRect).toHaveBeenCalledTimes(first+2);
    renderer.dispose();
  });
  it('stops drawing after disposal and handles negative first-frame timing without invalid radii',()=>{
    const {renderer,camera,frame,contexts}=surface();renderer.triggerFlares();
    renderer.render(camera,{...frame,time:-16});renderer.dispose();
    const calls=contexts[0].drawImage.mock.calls.length;renderer.render(camera,{...frame,time:2000});
    expect(contexts[0].drawImage).toHaveBeenCalledTimes(calls);
    for(const args of contexts[0].arc.mock.calls)expect(args[2]).toBeGreaterThan(0);
  });
  it('reports an unavailable 2D context without pretending the map loaded',()=>{
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
    expect(()=>createTokyoCanvasRenderer(document.createElement('canvas'))).toThrow('Canvas map rendering unavailable');
  });
});
