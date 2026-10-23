import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h, nextTick, type App } from 'vue';
import CampusMapScene from '../src/frontend/CampusMapScene.vue';

let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = ''; });

async function mount(people: Array<Record<string, unknown>>, width = 620, height = 420) {
  const host = document.createElement('div');
  document.body.append(host);
  app = createApp({ render: () => h(CampusMapScene, {
    width, height, locationId: 'gate', busy: false,
    roadEvents: [], people, position: { x: 0, z: 25 },
    playerId: 'emma', playerName: '樱羽艾玛',
  }) });
  app.mount(host);
  await nextTick();
  return host;
}

describe('地图人物头像标记', () => {
  it('主角和附近人物使用圆形头像且点击后能显示身份', async () => {
    const host = await mount([{
      contactId: 'majo-hiro', personId: 'majo-hiro', name: '二阶堂希罗',
      position: { x: 2, z: 25 }, source: 'scene',
    }]);
    const player = host.querySelector<HTMLElement>('[data-map-player]')!;
    expect(player.getAttribute('aria-label')).toContain('樱羽艾玛');
    expect(player.querySelector('[data-map-avatar-kind="sprite"]')).not.toBeNull();
    expect(player.querySelector('img.cms-avatar-headshot')?.getAttribute('src')).toContain('pbs.twimg.com/profile_images/');
    const npc = host.querySelector<HTMLButtonElement>('[data-map-person-id="majo-hiro"]')!;
    expect(npc.querySelector('[data-map-avatar-kind="sprite"]')).not.toBeNull();
    npc.click(); await nextTick();
    expect(npc.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.cms-person-detail')?.textContent).toContain('二阶堂希罗');
    host.querySelector<HTMLButtonElement>('[aria-label="关闭人物信息"]')!.click(); await nextTick();
    expect(host.querySelector('.cms-person-detail')).toBeNull();
  });

  it('缺专属立绘时保持身份安全的姓名头像，窄屏仍可触摸', async () => {
    const host = await mount([{ contactId: 'majo-yuki', personId: 'majo-yuki', name: '月代雪',
      position: { x: 4, z: 29 }, source: 'scene' }], 320, 568);
    const npc = host.querySelector<HTMLButtonElement>('[data-map-person-id="majo-yuki"]')!;
    expect(npc.querySelector('[data-map-avatar-kind="initials"]')?.textContent).toContain('代雪');
    expect(npc.getAttribute('aria-label')).toContain('月代雪');
  });
});
