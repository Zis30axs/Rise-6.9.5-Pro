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
    id: 'dislike', label: '反感', min: -49, max: -10,
    note: '明显不想亲近，但还可能因为场合被迫打交道。',
    hint: '语气冷淡，避开私事和肢体接触，对玩笑和请求多半拒绝或敷衍，很少主动找对方。按本人性格表达不悦，不要写成无差别辱骂。',
  },
  {
    id: 'distant', label: '陌生', min: -9, max: 9,
    note: '尚未建立信任，或关系已经淡到几乎不来往。',
    hint: '保持礼貌距离和普通称呼，不分享秘密，也不做出亲昵动作。只接受顺手的小事，不会为对方改日程；没有旧交就不要假装熟络。',
  },
  {
    id: 'acquainted', label: '认识', min: 10, max: 29,
    note: '知道彼此是谁，可以正常说话，但还不是自己人。',
    hint: '可以打招呼和短聊，称呼依本人习惯。小忙可以帮，重要的事和秘密会推开，玩笑点到为止，很少主动发消息。',
  },
  {
    id: 'familiar', label: '熟人', min: 30, max: 49,
    note: '常见面或同在一个圈子，相处自然，仍留有分寸。',
    hint: '交谈可以谈到近况和一般烦恼，愿意顺路帮忙。重要秘密和亲昵距离仍要看是否真的放心；可以偶尔主动联系，拒绝时会说明原因。',
  },
  {
    id: 'friend', label: '朋友', min: 50, max: 69,
    note: '把对方当朋友，会惦记，也接受适度的玩笑。',
    hint: '会主动关心近况，并愿意挪一点时间帮忙，可以分享日常里的小秘密。重大决定和深的创伤仍会犹豫；亲近是朋友式的陪伴，不要写成恋爱。',
  },
  {
    id: 'close', label: '挚友', min: 70, max: 89,
    note: '非常信任的挚友，或可以依靠的亲近家人。',
    hint: '用此人的性格表现深度信任：会主动联系、坦白烦恼，并接受更近的距离。家人是依靠与照应，朋友是并肩，都不要默认成恋爱；只有碰到本人的底线才会拒绝。',
  },
  {
    id: 'bond', label: '羁绊', min: 90, max: 100,
    note: '无论家人、朋友还是同伴，都已是难以替代的关系。',
    hint: '把对方放在很重要的位置：会主动分担、保护，并说出很少告诉别人的事，称呼和距离都更自然。家人写成毫无保留的家的温暖，同伴写成熟悉后的信任，不要只因高好感变成恋爱或丢掉本人性格。',
  },
];

export function affinityTier(value: number): AffinityTier {
  const affinity = Math.max(-100, Math.min(100, Math.trunc(value)));
  const tier = AFFINITY_TIERS.find(row => affinity >= row.min && affinity <= row.max);
  if (!tier) throw new Error('好感档位没有覆盖 ' + affinity);
  return tier;
}

/** Compact bond for a prompt: number, tier id, label, and the behavior hint. */
export function affinityRelation(value: number) {
  const tier = affinityTier(value);
  return { affinity: Math.max(-100, Math.min(100, Math.trunc(value))), tier: tier.id, label: tier.label, hint: tier.hint };
}

export function affinityContactLine(value: number) {
  const relation = affinityRelation(value);
  return `好感 ${relation.affinity} · ${relation.label}`;
}
