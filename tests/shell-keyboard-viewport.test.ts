import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {bindShellViewport, type ShellViewportLease} from '../src/frontend/shell-viewport';

let lease:ShellViewportLease|undefined;
let visual:EventTarget & {width:number;height:number;offsetTop:number;offsetLeft:number;scale:number};
let root:HTMLElement,shadow:ShadowRoot,input:HTMLTextAreaElement;
function size(width:number,height:number,layoutHeight=844,top=0){
  Object.assign(visual,{width,height,offsetTop:top});
  vi.stubGlobal('innerWidth',width);vi.stubGlobal('innerHeight',layoutHeight);
  visual.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('resize'));
  lease!.refresh();
}
beforeEach(()=>{
  vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844);
  vi.stubGlobal('matchMedia',()=>({matches:true}));
  visual=Object.assign(new EventTarget(),{width:390,height:844,offsetTop:0,offsetLeft:0,scale:1});
  vi.stubGlobal('visualViewport',visual);
  root=document.createElement('div');root.dataset.unreadCityRoot='';root.style.cssText='color:red';
  shadow=root.attachShadow({mode:'open'});input=document.createElement('textarea');shadow.append(input);document.body.append(root);
  root.getBoundingClientRect=()=>({left:parseFloat(root.style.left)||0,top:parseFloat(root.style.top)||0,width:parseFloat(root.style.width)||0,height:parseFloat(root.style.height)||0} as DOMRect);
  lease=bindShellViewport(window,'');
});
afterEach(()=>{lease?.dispose();lease=undefined;document.body.replaceChildren();vi.unstubAllGlobals();});
describe('keyboard overlays a stable Shell',()=>{
  it('freezes height and origin from the first keyboard animation frame and waits through blur until dismissal',()=>{
    input.value='草稿';input.focus();
    size(390,820,844,5);expect(root.style.height).toBe('844px');expect(parseFloat(root.style.top)-visual.offsetTop).toBe(0);
    size(390,400,400,70);expect(root.style.height).toBe('844px');expect(root.dataset.ucShort).toBe('false');
    input.blur();size(390,450,450,25);expect(root.style.height).toBe('844px');
    size(390,844);expect(root.style.height).toBe('844px');
    size(390,760,760);expect(root.style.height).toBe('760px');expect(input.value).toBe('草稿');
  });
  it('finds an input inside the original same-origin hosted phone iframe',()=>{
    const panel=document.createElement('div');panel.id='sttts-panel';panel.className='st-iphonie-hosted';
    const frame=document.createElement('iframe');panel.append(frame);document.body.append(panel);
    const phoneInput=frame.contentDocument!.createElement('textarea');frame.contentDocument!.body.append(phoneInput);phoneInput.focus();
    size(390,400,400,60);expect(root.style.height).toBe('844px');expect(parseFloat(root.style.top)-visual.offsetTop).toBe(0);
  });
  it('does not freeze an unrelated iframe, a read-only input or a desktop window resize',()=>{
    const unrelated=document.createElement('iframe');document.body.append(unrelated);
    const externalInput=unrelated.contentDocument!.createElement('textarea');unrelated.contentDocument!.body.append(externalInput);externalInput.focus();
    size(390,740,740);expect(root.style.height).toBe('740px');
    input.readOnly=true;input.focus();size(390,700,700);expect(root.style.height).toBe('700px');
    input.blur();input.readOnly=false;vi.stubGlobal('matchMedia',()=>({matches:false}));
    input.focus();size(390,620,620);expect(root.style.height).toBe('620px');
  });
  it('adapts to an orientation/width change even with the keyboard focused',()=>{
    input.focus();size(390,400,400);expect(root.style.height).toBe('844px');
    size(844,180,180);expect(root.style.width).toBe('844px');expect(root.style.height).toBe('180px');
    size(844,390,390);expect(root.style.width).toBe('844px');expect(root.style.height).toBe('390px');
  });
  it('handles WebViews that resize innerHeight without a VisualViewport API',()=>{
    vi.stubGlobal('visualViewport',undefined);input.focus();size(390,400,400);
    expect(root.style.height).toBe('844px');
    input.blur();size(390,844);expect(root.style.height).toBe('844px');
  });
  it('keeps height breakpoints stable until the keyboard closes',()=>{
    input.focus();lease!.refresh();size(390,400,400);
    expect(root.dataset.ucMaxHeight).toBe('');
    input.blur();size(390,844);
    size(390,568,568);expect(root.dataset.ucMaxHeight?.split(' ')).toEqual(['580','620','650','670','840']);
  });
  it('still follows ordinary browser viewport changes and restores its lease on exit',()=>{
    size(390,780,844,10);expect(root.style.height).toBe('780px');expect(root.style.top).toBe('10px');
    lease!.dispose();lease=undefined;expect(root.style.color).toBe('red');expect(root.style.height).toBe('');
    expect(root.hasAttribute('data-uc-viewport')).toBe(false);
  });
});
