import type { CharacterContact, ConfessionStatus } from '../frontend/types';

/** Saved affinity bands. Higher tiers change manners; personality still comes from the worldbook. */
export interface AffinityTier {
  id: string;
  label: string;
  min: number;
  max: number;
  /** Short note for the contact list and for developers. */
  note: string;
  /** How to act toward the protagonist. Not a romance switch and not a new personality. */
  hint: string;
}

export const AFFINITY_TIERS: readonly AffinityTier[] = [
  {
    id: 'hostile', label: '敌视', min: -100, max: -50,
    note: '把对方当成必须防备的人，正常来往已经破裂。',
    hint: '用此人一贯的性格表现敌意：拉开距离，拒绝帮忙、秘密和身体亲近，不主动联系，话少或带刺。若是家人或旧识跌到这一档，写成决裂后的冷硬，而不是突然失忆。',
  },
  {
    id: 'dislike', label: '反感', min: -49, max: -25,
    note: '明显不想亲近，但还可能因为场合被迫打交道。',
    hint: '语气冷淡，避开私事和肢体接触，对玩笑和请求多半拒绝或敷衍，很少主动找对方。按本人性格表达不悦，不要写成无差别辱骂。',
  },
  {
    id: 'guarded', label: '戒备', min: -24, max: -10,
    note: '仍有顾虑，必要时肯与对方接触。',
    hint: '只处理能说清的小事，边界说出口后，留意对方是否尊重。旧识可以一边留有情分，一边保持距离。',
  },
  {
    id: 'distant', label: '陌生', min: -9, max: 9,
    note: '尚未建立信任，或关系已经淡到几乎不来往。',
    hint: '保持礼貌距离和普通称呼，不分享秘密，也不做出亲昵动作。只接受顺手的小事，不会为对方改日程；没有旧交就不要假装熟络。',
  },
  {
    id: 'acquainted', label: '认识', min: 10, max: 19,
    note: '知道彼此是谁，可以正常说话，但还不是自己人。',
    hint: '可以打招呼和短聊，称呼依本人习惯。小忙可以帮，重要的事和秘密会推开，玩笑点到为止，很少主动发消息。',
  },
  {
    id: 'regular', label: '常来往', min: 20, max: 29,
    note: '多次打过交道，能接上以前的话。',
    hint: '能记住一个习惯、一个没有聊完的话题或一项已经说好的事。通常在见面时自然接续，各自仍有各自的生活。',
  },
  {
    id: 'familiar', label: '熟人', min: 30, max: 39,
    note: '常见面或同在一个圈子，相处自然，仍留有分寸。',
    hint: '交谈可以谈到近况和一般烦恼，愿意顺路帮忙。重要秘密和亲昵距离仍要看是否真的放心；可以偶尔主动联系，拒绝时会说明原因。',
  },
  {
    id: 'in_sync', label: '合拍', min: 40, max: 49,
    note: '已有共同的节奏，待在一起渐渐轻松。',
    hint: '会因共同兴趣、合作习惯或一个彼此都懂的笑点主动靠近。可以享受相处，私事仍由各自决定说多少。',
  },
  {
    id: 'casual_friend', label: '普通朋友', min: 50, max: 59,
    note: '愿意主动相约，一起分享平常的乐趣。',
    hint: '开始把对方算进日常小安排，也乐意让其他朋友加入。写出相处的乐趣，尊重各自的朋友圈，已有家人或伴侣关系仍按存档。',
  },
  {
    id: 'friend', label: '朋友', min: 60, max: 69,
    note: '把对方当朋友，会惦记，也接受适度的玩笑。',
    hint: '会主动关心近况，并愿意挪一点时间帮忙，可以分享日常里的小秘密。可能在某次相处时心动、轻微吃味或希望单独相约，平常仍能各自和别人来往；一次失落也可能只是错过朋友。',
  },
  {
    id: 'confidant', label: '知心', min: 70, max: 79,
    note: '肯认真谈论自己的真实心意。',
    hint: '能私下坦白顾虑、偏心或愿望，愿听对方表达不同意见。若确实动心，可以主动邀约或告白，关系如何发展取决于双方。',
  },
  {
    id: 'close', label: '挚友', min: 80, max: 89,
    note: '非常信任的挚友，或可以依靠的亲近家人。',
    hint: '用此人的性格表现深度信任：会主动联系、坦白烦恼，并接受更近的距离。亲人可以坦言委屈，挚友可以一直并肩。若已有心动和相处依据，角色可主动追求或告白，把答复留给对方。',
  },
  {
    id: 'bond', label: '羁绊', min: 90, max: 95,
    note: '无论家人、朋友还是同伴，都已是难以替代的关系。',
    hint: '把对方放在很重要的位置：会主动分担、保护，并说出很少告诉别人的事，称呼和距离都更自然。家人和知己有各自的亲近方式。动心时可以主动表白，双方确认后才按恋人相处；珍重彼此也容得下分歧。',
  },
  {
    id: 'lasting', label: '长久羁绊', min: 96, max: 100,
    note: '在各有生活的日子里也能长久信赖彼此。',
    hint: '能协商承诺、照顾与独处，在分歧或久别之后继续相伴。具体表现按亲人、同伴、知己或已经确认的伴侣来写。',
  },
];

export function affinityTier(value: number): AffinityTier {
  const affinity = Math.max(-100, Math.min(100, Math.trunc(value)));
  const tier = AFFINITY_TIERS.find(row => affinity >= row.min && affinity <= row.max);
  if (!tier) throw new Error('好感档位没有覆盖 ' + affinity);
  return tier;
}

/** Ordinary gains stop at the current ceiling. Losses can cross any number of tiers. */
export function adjustedAffinity(value: number, delta: number): number {
  return Math.max(-100, Math.min(affinityTier(value).max, value + delta));
}

export function availablePromotion(value: number): AffinityTier | undefined {
  const tier = affinityTier(value);
  return value === tier.max && value < 100 ? affinityTier(value + 1) : undefined;
}

const confessionLabels: Record<ConfessionStatus, string> = {
  pending: '对方已告白，等待答复',
  declined: '已婉拒对方的告白',
  dating: '恋人（双方已经确认交往）',
};

export function isConfessionStatus(value: unknown): value is ConfessionStatus {
  return typeof value === 'string' && Object.hasOwn(confessionLabels, value);
}

export function contactRelationNote(contact: Pick<CharacterContact, 'relationNote' | 'confession'>): string | undefined {
  if (!contact.confession) return contact.relationNote;
  return [contact.relationNote, confessionLabels[contact.confession]].filter(Boolean).join(' · ');
}

/** Compact bond for a prompt. A relation note is a saved fact and outranks the tier's romance caution. */
export function affinityRelation(value: number, relationNote?: string | null) {
  const tier = affinityTier(value);
  const note = relationNote?.trim() || undefined;
  let hint = tier.hint;
  if (note) {
    hint += ` 已存关系「${note}」优先。`;
    if (note.startsWith('恋人') || note.includes(confessionLabels.dating))
      hint += '双方已认真交往，依当下的相处表现亲密、在意、占有欲或撒娇，遵守已有约定。';
    else if (note.includes(confessionLabels.pending)) hint += '给对方时间，本人已告过白，等待对方自己答复。';
    else if (note.includes(confessionLabels.declined)) hint += '尊重已经给出的答复，留意彼此愿意保留的距离。';
  }
  return {
    affinity: Math.max(-100, Math.min(100, Math.trunc(value))),
    tier: tier.id, label: tier.label, hint,
    ...(note ? { relationNote: note } : {}),
  };
}

export function affinityContactLine(value: number, relationNote?: string | null) {
  const relation = affinityRelation(value, relationNote);
  return relation.relationNote
    ? `好感 ${relation.affinity} · ${relation.label} · ${relation.relationNote}`
    : `好感 ${relation.affinity} · ${relation.label}`;
}
