import { describe, expect, it, vi } from 'vitest';
import { saveWorldDeviceSettings, worldDeviceSettingsMarkup } from '../src/frontend/phone-device-settings';

type Owner = 'soyo' | 'sakiko' | 'emma' | 'renako';
type Share = 'none' | 'read' | 'write';
function snapshot(owner: Owner, locked = true, share: Share = 'none', binding = 'active-chat') {
  const names: Record<Owner, string> = { soyo: '长崎素世', sakiko: '丰川祥子', emma: '樱羽艾玛', renako: '甘织玲奈子' };
  return { active: owner, owner, deviceId: `unread-city-phone-${owner}`, name: names[owner],
    binding, revision: 3, locked, share };
}
function fixture(owner: Owner = 'soyo') {
  let active = snapshot(owner);
  const read = vi.fn(() => active);
  const act = vi.fn(async (request: unknown) => request);
  const win = { parent: { __unreadCityWorldPhone: { read, act } },
    crypto: { randomUUID: () => 'request-unique-1' } } as unknown as Window;
  const root = document.createElement('section');
  const paint = () => { root.innerHTML = worldDeviceSettingsMarkup(win); return root; };
  return { win, root, read, act, paint, change(s: typeof active) { active = s; } };
}
function choose(root: Element, locked: boolean, share: Share) {
  const lock = root.querySelector<HTMLSelectElement>('[data-field="world-device-locked"]')!;
  const permit = root.querySelector<HTMLSelectElement>('[data-field="world-device-share"]')!;
  lock.value = String(locked); permit.value = share;
}

describe('native phone Settings: character-card lock and sharing', () => {
  it.each(['soyo', 'sakiko', 'emma', 'renako'] as const)('shows %s its own saved permissions', owner => {
    const f = fixture(owner);
    const root = f.paint();
    expect(root.textContent).toContain(snapshot(owner).name);
    expect(root.textContent).toContain('剧情手机锁定');
    expect(root.textContent).toContain('共享许可');
    expect(root.querySelector<HTMLSelectElement>('[data-field="world-device-locked"]')!.value).toBe('true');
    expect(root.querySelector<HTMLSelectElement>('[data-field="world-device-share"]')!.value).toBe('none');
    expect(root.querySelector('[data-action="world-device-save"]')).toBeTruthy();
  });

  it('persists only the current protagonist device through the canonical world-phone action', async () => {
    const f = fixture('emma');
    f.paint();
    choose(f.root, false, 'write');
    expect(await saveWorldDeviceSettings(f.win, f.root)).toBe(true);
    expect(f.act).toHaveBeenCalledOnce();
    expect(f.act).toHaveBeenCalledWith({
      binding: 'active-chat', revision: 3, requestId: 'request-unique-1', owner: 'emma',
      command: { type: 'device', locked: false, share: 'write' },
    });
  });

  it('does not issue an action if both settings remain unchanged', async () => {
    const f = fixture('renako');
    f.paint();
    expect(await saveWorldDeviceSettings(f.win, f.root)).toBe(false);
    expect(f.act).not.toHaveBeenCalled();
  });

  it('rejects switching protagonists before an asynchronous save', async () => {
    const f = fixture('soyo');
    f.paint();
    choose(f.root, false, 'read');
    f.change(snapshot('sakiko'));
    await expect(saveWorldDeviceSettings(f.win, f.root)).rejects.toThrow('主角或聊天已切换');
    expect(f.act).not.toHaveBeenCalled();
  });

  it('rejects changing chats while keeping the same protagonist', async () => {
    const f = fixture('soyo');
    f.paint();
    choose(f.root, false, 'read');
    f.change(snapshot('soyo', true, 'none', 'another-chat'));
    await expect(saveWorldDeviceSettings(f.win, f.root)).rejects.toThrow('主角或聊天已切换');
    expect(f.act).not.toHaveBeenCalled();
  });

  it('rejects stale permission values instead of overwriting a newer choice', async () => {
    const f = fixture('soyo');
    f.paint();
    choose(f.root, false, 'write');
    f.change(snapshot('soyo', true, 'read'));
    await expect(saveWorldDeviceSettings(f.win, f.root)).rejects.toThrow('手机权限已更新');
    expect(f.act).not.toHaveBeenCalled();
  });

  it('uses the most recent revision when unrelated world state advances', async () => {
    const f = fixture('soyo');
    f.paint();
    choose(f.root, true, 'read');
    f.change({ ...snapshot('soyo'), revision: 4 });
    await saveWorldDeviceSettings(f.win, f.root);
    expect(f.act).toHaveBeenCalledWith(expect.objectContaining({ revision: 4 }));
  });

  it('does not expose unauthorized choices or perform saves for disconnected devices', async () => {
    const f = fixture('soyo');
    const bridge = (f.win.parent as Window & { __unreadCityWorldPhone?: unknown });
    delete bridge.__unreadCityWorldPhone;
    const root = f.paint();
    expect(root.textContent).toContain('进入《未读之城》后可用');
    expect(root.querySelector('[data-action="world-device-save"]')).toBeNull();
    await expect(saveWorldDeviceSettings(f.win, root)).rejects.toThrow('表单未就绪');
    expect(f.act).not.toHaveBeenCalled();
  });

  it('rejects invalid selections, identities and a missing secure operation ID', async () => {
    const f = fixture('soyo');
    f.paint();
    const share = f.root.querySelector<HTMLSelectElement>('[data-field="world-device-share"]')!;
    share.insertAdjacentHTML('beforeend', '<option value="admin">admin</option>');
    share.value = 'admin';
    await expect(saveWorldDeviceSettings(f.win, f.root)).rejects.toThrow('选择无效');
    f.change({ ...snapshot('soyo'), deviceId: 'unread-city-phone-emma' });
    expect(worldDeviceSettingsMarkup(f.win)).not.toContain('data-action="world-device-save"');
    f.change(snapshot('soyo'));
    choose(f.root, false, 'read');
    Object.defineProperty(f.win, 'crypto', { value: {}, configurable: true });
    await expect(saveWorldDeviceSettings(f.win, f.root)).rejects.toThrow('安全的手机操作编号');
    expect(f.act).not.toHaveBeenCalled();
  });

  it('escapes device names and bindings in Settings HTML', () => {
    const f = fixture('emma');
    f.change({ ...snapshot('emma'), name: '<img src=x onerror=alert(1)>', binding: '\" onclick=\"bad()' });
    const root = f.paint();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('[onclick]')).toBeNull();
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
