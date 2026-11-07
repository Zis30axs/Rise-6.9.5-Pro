// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, reactive, type App } from 'vue';
vi.mock('../src/frontend/store-product-images', () => ({ getStoreProductImage: (id: string) => id === 'crychic-photo' ? 'data:image/webp;base64,AA==' : null }));
import InventoryPanel from '../src/frontend/InventoryPanel.vue';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import type { ShellActions, ShellModel, WorldAction, WorldState } from '../src/frontend/types';
let app: App | undefined;
afterEach(() => { app?.unmount(); document.body.replaceChildren(); vi.restoreAllMocks(); });
function mount() {
  const root=document.createElement('div');document.body.append(root);
  const state=reduceState(enableProtagonists(createInitialState()),{type:'choose_academics',majorId:'music'});
  const model=reactive({state,busy:false,notice:''} as ShellModel);
  const save=vi.fn((candidate:WorldState)=>{model.state=parseState(JSON.parse(JSON.stringify(candidate)));});
  const interact=vi.fn();
  const actions={interact,dispatch(action:WorldAction){
    try { save(reduceState(JSON.parse(JSON.stringify(model.state)),action)); model.notice=''; }
    catch(error) {model.notice=String(error);}
  }} as unknown as ShellActions;
  app=createApp(InventoryPanel,{model,actions});app.mount(root);
  return {root,model,save,interact,actions};
}
describe('equipment in the existing backpack',()=>{
  it('renders the CRYCHIC photo artwork in the keepsake card',()=>{
    const {root}=mount();
    expect(root.querySelector('[data-equipment-item="crychic-photo"] img[data-product-image="crychic-photo"]')?.getAttribute('alt')).toBe('CRYCHIC 合照');
  });
  it('shows the owner-dependent effect and toggles through the saved action without generating',async()=>{
    const {root,model,save,interact}=mount();
    expect(root.querySelector('[data-equipment-effects]')?.textContent).toContain('社交经验 ×0.25');
    (root.querySelector('[data-equipment-item] button') as HTMLButtonElement).click();await nextTick();
    expect(save).toHaveBeenCalledTimes(1);expect(interact).not.toHaveBeenCalled();
    expect(root.querySelector('[data-equipment-status]')?.textContent).toBe('使用中');
    expect(model.state.inventory[0]?.equipped).toBe(true);
    (root.querySelector('[data-equipment-item] button') as HTMLButtonElement).click();await nextTick();
    expect(root.querySelector('[data-equipment-status]')?.textContent).toBe('已收起');
  });
  it('leaves the old equipment and receipt untouched on a failed save',async()=>{
    const {root,model,save}=mount();
    save.mockImplementationOnce(()=>{throw new Error('保存失败');});
    (root.querySelector('[data-equipment-item] button') as HTMLButtonElement).click();await nextTick();
    expect(model.state.inventory[0]?.equipped).toBeUndefined();
    expect(root.querySelector('[data-use-receipt]')).toBeNull();
    expect(model.notice).toContain('保存失败');
  });
  it('recomputes the preview and clears the previous owner receipt after a switch',async()=>{
    const {root,model,actions}=mount();
    (root.querySelector('[data-equipment-item] button') as HTMLButtonElement).click();await nextTick();
    actions.dispatch({type:'switch_protagonist',target:'sakiko'});
    actions.dispatch({type:'choose_academics',majorId:'computer-science'});await nextTick();
    expect(root.querySelector('[data-use-receipt]')).toBeNull();
    expect(root.querySelector('[data-equipment-status]')?.textContent).toBe('已收起');
    expect(root.querySelector('[data-equipment-effects]')?.textContent).toContain('音乐学习经验 ×0.5');
    expect(root.querySelector('[data-equipment-effects]')?.textContent).toContain('当前专业经验 ×1.5');
    actions.dispatch({type:'switch_protagonist',target:'emma'});await nextTick();
    expect(root.querySelector('[data-equipment-item]')).toBeNull();
    expect(model.state.inventory).toEqual([]);
  });
  it('blocks equipment during generation and protagonist switching',async()=>{
    const {root,model,save}=mount();
    for(const key of ['busy','switchingProtagonist'] as const){
      model[key]=true;await nextTick();
      const button=root.querySelector('[data-equipment-item] button') as HTMLButtonElement;
      expect(button.disabled).toBe(true);button.click();expect(save).not.toHaveBeenCalled();
      model[key]=false;
    }
  });
  it('retains consumable rows and gives the photo no consume or gifting button',async()=>{
    const {root,model}=mount();
    model.state.inventory.push({itemId:'medicine-cold',quantity:2});await nextTick();
    expect(root.querySelector('[data-inventory-product="medicine-cold"]')).not.toBeNull();
    expect(root.querySelector('[data-equipment-item]')?.textContent).not.toMatch(/kcal|使用 1|赠送/);
    expect(root.querySelector('.inventory-count')?.textContent).toBe('2 种物品');
  });
});
