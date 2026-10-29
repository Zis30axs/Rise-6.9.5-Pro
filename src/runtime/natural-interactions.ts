import type { StoryAction, WorldState } from '../frontend/types';
import { PROTAGONISTS, type ProtagonistId } from './dual-protagonists';
import { gameMinute } from './protagonist-world';

/** "Go home" follows the selected character, not the shared outdoor housing district. */
export const protagonistHomeRooms: Readonly<Record<ProtagonistId, string>> = Object.freeze({
  soyo: 'dorm-room',
  sakiko: 'toyokawa-house',
  emma: 'emma-yuki-home',
  renako: 'amaori-family-home',
});

export interface GamePurchase {
  id: string;
  owner: ProtagonistId;
  game: string;
  benefit: string;
  amountYen: number;
  at: number;
}

const purchaseLimit = 200;
function invalid(message: string): never { throw new Error('游戏消费记录无效：' + message); }

/** Game purchases are fictional Appie Pay expenses; never external payment requests. */
export function parseGamePurchases(raw: unknown, now: number): GamePurchase[] {
  if (!Array.isArray(raw) || raw.length > purchaseLimit) return invalid('数量');
  const used = new Set<string>();
  return raw.map((value, index) => {
    const path = '第' + (index + 1) + '笔';
    if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid(path);
    const r = value as Record<string, unknown>;
    const keys = ['id', 'owner', 'game', 'benefit', 'amountYen', 'at'];
    if (Object.keys(r).length !== keys.length || Object.keys(r).some(key => !keys.includes(key))) return invalid(path + '字段');
    if (typeof r.id !== 'string' || !/^[A-Za-z0-9][\w.:-]{0,127}$/.test(r.id) || used.has(r.id)) return invalid(path + 'ID');
    used.add(r.id);
    if (!PROTAGONISTS.includes(r.owner as ProtagonistId)) return invalid(path + '主角');
    if (typeof r.game !== 'string' || !r.game.trim() || r.game.length > 80 ||
      typeof r.benefit !== 'string' || !r.benefit.trim() || r.benefit.length > 100) return invalid(path + '内容');
    if (!Number.isSafeInteger(r.amountYen) || (r.amountYen as number) < 1 || (r.amountYen as number) > 100000) return invalid(path + '金额');
    if (!Number.isSafeInteger(r.at) || (r.at as number) < 0 || (r.at as number) > now) return invalid(path + '时间');
    return { id: r.id, owner: r.owner, game: r.game.trim(), benefit: r.benefit.trim(), amountYen: r.amountYen, at: r.at } as GamePurchase;
  });
}

/** The old player ledger is charged first; only then record what the game credited. */
export function recordGamePurchases(state: WorldState, actions: readonly StoryAction[], turnId: string): WorldState {
  const purchases = actions.filter((action): action is Extract<StoryAction, { type: 'game_topup' }> => action.type === 'game_topup');
  if (!purchases.length) return state;
  if (!state.protagonists || purchases.length !== 1) throw new Error('游戏消费必须由当前主角单笔结算');
  const next: WorldState = JSON.parse(JSON.stringify(state));
  const owner = next.protagonists!.accounts.active;
  const row = purchases[0]!;
  const id = turnId + ':game-topup';
  const saved = next.protagonists!.gamePurchases ?? [];
  if (saved.some(item => item.id === id)) return next;
  saved.push({ id, owner, game: row.game, benefit: row.benefit, amountYen: row.amountYen, at: gameMinute(next) });
  next.protagonists!.gamePurchases = saved.slice(-purchaseLimit);
  return next;
}
