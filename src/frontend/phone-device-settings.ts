/**
 * Character-card device privacy belongs in the embedded phone's real Settings
 * app, not at the bottom of every world app. This module is deliberately
 * independent of ST-iPhonie and persists only via the canonical world-phone API.
 */
const OWNERS = new Set(['soyo', 'sakiko', 'emma', 'renako']);
const SHARES = new Set(['none', 'read', 'write']);
type Owner = 'soyo' | 'sakiko' | 'emma' | 'renako';
type Share = 'none' | 'read' | 'write';

interface PrivacySnapshot {
  binding: string;
  revision: number;
  active: Owner;
  owner: Owner;
  deviceId: string;
  name: string;
  locked: boolean;
  share: Share;
}
interface WorldPhoneBridge {
  read(): unknown;
  act(request: {
    binding: string;
    revision: number;
    requestId: string;
    owner: Owner;
    command: { type: 'device'; locked: boolean; share: Share };
  }): Promise<unknown>;
}

const HTML_ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => HTML_ENTITIES[character] ?? character);

function linkedDevice(win: Window): { bridge: WorldPhoneBridge; snapshot: PrivacySnapshot } {
  const parent = win.parent as Window & { __unreadCityWorldPhone?: WorldPhoneBridge };
  const bridge = parent.__unreadCityWorldPhone;
  if (!bridge || typeof bridge.read !== 'function' || typeof bridge.act !== 'function')
    throw new Error('剧情手机暂未连接，无法修改锁屏或共享权限。');
  const raw = bridge.read();
  if (!raw || typeof raw !== 'object') throw new Error('剧情手机状态不可用，请重新进入角色卡。');
  const state = raw as Record<string, unknown>;
  if (typeof state.active !== 'string' || !OWNERS.has(state.active) ||
      state.owner !== state.active || state.deviceId !== `unread-city-phone-${state.active}` ||
      typeof state.binding !== 'string' || !state.binding ||
      !Number.isSafeInteger(state.revision) || (state.revision as number) < 0 ||
      typeof state.name !== 'string' ||
      typeof state.locked !== 'boolean' || typeof state.share !== 'string' || !SHARES.has(state.share))
    throw new Error('剧情手机身份或设置状态无效，请重新进入角色卡。');
  return { bridge, snapshot: state as unknown as PrivacySnapshot };
}

const option = (value: string, label: string, current: string) =>
  `<option value="${value}"${current === value ? ' selected' : ''}>${label}</option>`;

/** The embedded Settings page calls this when it renders; unavailable hosts never show system-time fallbacks. */
export function worldDeviceSettingsMarkup(win: Window): string {
  let device: PrivacySnapshot;
  try { device = linkedDevice(win).snapshot; }
  catch {
    return '<p class="hint" role="status">剧情设备的锁定与共享设置在进入《未读之城》后可用。</p>';
  }
  return `<div data-world-device-settings data-world-owner="${device.active}" data-world-binding="${escapeHtml(device.binding)}" data-world-locked="${device.locked}" data-world-share="${device.share}">
    <p class="hint">${escapeHtml(device.name)}的剧情手机 · 此处的访问权限与上方“打开时显示锁屏”的外观效果相互独立。</p>
    <div class="field"><span>剧情手机锁定</span><span class="select"><select data-field="world-device-locked" aria-label="剧情手机锁定">
      ${option('false', '解锁', String(device.locked))}${option('true', '锁定', String(device.locked))}
    </select></span></div>
    <div class="field"><span>共享许可</span><span class="select"><select data-field="world-device-share" aria-label="共享许可">
      ${option('none', '未授权', device.share)}${option('read', '允许查看', device.share)}${option('write', '允许查看与代操作', device.share)}
    </select></span></div>
    <p class="hint">对方仍须来到你身边才能接触手机。锁定后按照共享许可控制查看或代操作；未锁定时，附近的人可能直接访问，即使没有许可也会留下操作记录。</p>
    <div class="actions"><button type="button" class="secondary" data-action="world-device-save">保存锁屏与共享</button></div>
  </div>`;
}

/** Reject a stale character/chat binding and never write another protagonist's device. */
export async function saveWorldDeviceSettings(win: Window, root: ParentNode): Promise<boolean> {
  const fields = root.querySelector<HTMLElement>('[data-world-device-settings]');
  const lockedField = fields?.querySelector<HTMLSelectElement>('[data-field="world-device-locked"]');
  const shareField = fields?.querySelector<HTMLSelectElement>('[data-field="world-device-share"]');
  if (!fields || !lockedField || !shareField) throw new Error('锁屏与共享表单未就绪。');
  const lockedValue = lockedField.value;
  const share = shareField.value;
  if (!['true', 'false'].includes(lockedValue) || !SHARES.has(share))
    throw new Error('锁屏或共享权限的选择无效。');
  const { bridge, snapshot } = linkedDevice(win);
  if (fields.dataset.worldOwner !== snapshot.active || fields.dataset.worldBinding !== snapshot.binding)
    throw new Error('主角或聊天已切换，请重新打开手机设置。');
  if (fields.dataset.worldLocked !== String(snapshot.locked) || fields.dataset.worldShare !== snapshot.share)
    throw new Error('手机权限已更新，请重新查看设置后再保存。');
  const locked = lockedValue === 'true';
  if (locked === snapshot.locked && share === snapshot.share) return false;
  const requestId = win.crypto?.randomUUID?.();
  if (!requestId) throw new Error('当前浏览器无法创建安全的手机操作编号。');
  await bridge.act({
    binding: snapshot.binding,
    revision: snapshot.revision,
    requestId,
    owner: snapshot.active,
    command: { type: 'device', locked, share: share as Share },
  });
  return true;
}
