import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('embedded phone Settings privacy integration', () => {
  const builder = readFileSync('scripts/build_embedded_phone.mjs', 'utf8');
  const apps = readFileSync('integration/dual-protagonists/phone-apps.js', 'utf8');

  it('only injects native Settings controls in the embedded build', () => {
    expect(builder).toContain("if (relative === 'ui/settings.js')");
    expect(builder).toContain("virtual:unread-city-phone-settings");
    expect(builder).toContain("src/frontend/phone-device-settings.ts");
    expect(builder).toContain("groupTitle('锁屏与共享')");
    expect(builder).toContain('worldDeviceSettingsMarkup(ctx.win)');
    expect(builder).toContain('saveWorldDeviceSettings(ctx.win, v.root)');
    expect(builder).toContain("case 'world-device-save'");
  });

  it('moves the cosmetic lockscreen preference without duplication', () => {
    expect(builder).toContain('move original cosmetic lockscreen preference into privacy section');
    expect(builder).toContain("toggle('lockOnOpen'");
    expect(builder).toContain('unify lockscreen and sharing inside native Settings');
  });

  it('removes all world-app copies of the permission controls, not the permission model', () => {
    expect(apps).not.toContain('<summary>锁屏与共享许可</summary>');
    expect(apps).not.toContain('data-world-field="locked"');
    expect(apps).not.toContain('data-world-field="share"');
    expect(apps).not.toContain("case 'device':");
    expect(apps).not.toContain("worldpeek");
    const peek = readFileSync('integration/dual-protagonists/phone-peek-controller.js','utf8');
    expect(peek).toContain("command:{type:'inspect',section:'messages'}");
  });
});
