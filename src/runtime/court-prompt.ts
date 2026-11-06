import type { StoryGenerationOptions, WorldState } from '../frontend/types';

/** Verbatim rule strings from lite@53b11282. Selection never summarizes a rule. */
export const COURT_PROMPT_RULES = {
  foundation: '【法庭叙事规则】只有在法院或事务所正式开启诉讼时使用 courtroom。每日委托只生成公开案情和可查证的证据，不预设隐藏真相或误导剧本，也不设置唯一正确的解谜答案；LLM根据实际辩论及已知证据自然推导，不能为了改变结果而重写已确认的事实。玩家用普通自由文本发表意见、质证、辩护，不要求固定证据按钮。案件已有事实不能被自由起诉改写；无论委托或主动诉讼均不生成黑剧本，任何一方都可能败诉。不能强制 NPC 主动起诉四位主角。民事及行政纠纷不必存在犯罪者。重大刑事不得自动出现在日常委托。',
  commissions: '【委托生成】玩家在枫庭律师事务所要求查看今日三份委托时，若 courtroom.board 今日尚未生成，只生成两份随机委托；另一个预设见 courtroom.dailyPreset。必须保证三份委托覆盖玩家当前筛选的所有日常类别，不重复标题，两个随机类别须补齐预设尚未覆盖的类别。用 <world_actions>[{"type":"court_docket","offers":[{"id":"docket-1-a","category":"administrative","title":"委托名","client":"委托人","summary":"简介","difficulty":"easy","rewardYen":8000,"experience":100,"preset":false},{"id":"docket-1-b","category":"minor-criminal","title":"委托名","client":"委托人","summary":"简介","difficulty":"normal","rewardYen":12000,"experience":120,"preset":false}]}]</world_actions>；这是首日默认分类的字段示例，不要直接复制编号或类别。实际 id 分别使用 courtroom.suggestedRandomIds 的两个值；另外一份预设由程序插入。类别只能从 courtroom.categories 已勾选日常范围中选，难度 easy/normal/hard，预设随机 false。今日有公告栏时绝不能再生成。',
  special: '【特殊委托】只有玩家主动开启重大刑事委托时才允许生成，使用 <world_actions>[{"type":"court_special","offer":{"id":"special-1","category":"major-criminal","title":"案件标题","client":"临时NPC","summary":"重大刑事委托简介","difficulty":"hard","rewardYen":40000,"experience":350,"preset":false}}]</world_actions>，重大案件不占日常三份委托且涉案人默认随机临时NPC；一旦玩家明确选择该委托，再用 court_open 构造公开案情与证据。不得自动启用特殊案件。特殊案件 id 用 courtroom.suggestedSpecialId 指示的当前游戏日编号，而不是复制示例。',
  acceptance: '【随机案件受理】用户选择今日公告栏中的随机委托后，使用 <world_actions>[{"type":"court_open","offerId":"公告栏精确ID","respondent":"固定的被告或刑事嫌疑人姓名，不能是四主角","white":"面向玩家的案情，^重要词^以红色突出","evidence":[{"title":"证据名","detail":"玩家可见事实"},{"title":"证据二","detail":"另一事实"}]}]</world_actions> 锁定案情与现有证据；须有2–8项证据，后续LLM根据事实推演但不提前指定黑剧本结论。respondent 在受理时与公开证据一起冻结；之后任何裁判执行条款的 respondent 必须和此身份完全一致，不能中途把无关 NPC 判成被告。不生成地图调查阶段，受理后直接自由庭审，不得在 <story> 中输出工程变量名或所谓隐藏答案。',
  consultation: '【主动诉讼咨询】玩家明确提出起诉对象和理由并请事务所报价时，先陈述胜诉风险，费用由模型根据案情合理决定，提交 court_quote 行动：{"type":"court_quote","defendant":"被告姓名","reason":"起诉理由","risk":"仅有邀请行为可能不足以证明不正当竞争，可能承担败诉费用","category":"civil","lawyer":null,"sherry":false,"courtFeeYen":2000,"lawyerFeeYen":0,"sherryFeeYen":0}。主动提起的诉讼 category 只能为 civil 或 administrative，玩家可主动起诉另一名可操作主角（对方由LLM独立应诉，玩家继续控制原告），但不能起诉自己；NPC绝不能主动起诉四主角，日常委托也不得自动安排四主角为被告；刑事公诉依法由检察机关提出，不能通过此私人诉状入口开启刑事法庭。玩家如需举报刑事案件只能作为独立剧情向警察或检察机关告发，后续是否起诉不由玩家自行决定。选择另一主角协助时 lawyer 填其主角ID，选择雪莉协助时 sherry=true；未选时费用必须为0。此报价不收费，玩家确认后程序才扣起诉费并真实向受聘人物转账。金钱绝不只靠叙事变动，不用 activity 冒充人物转账。其他主角不自动具有日本律师执业资格，可作为协助人员。',
  hearing: '【开庭中】courtroom.active 非空时，位置为 court-hearing 正式法庭（非律师事务所），剧情锁定同一游戏日同一法庭，不得 travel/rest/购物/学习或主动改换地点。普通辩论耗时0，仅真正新的证言用 {"type":"court_step","key":"testimony-1","kind":"testimony","summary":"新证言"} 推进5分钟，关键新推理 insight 推进10分钟，真正澄清矛盾 contradiction 推进15分钟；key 在本案必须唯一，不得为刷时间重复或假造。继续质证与证言根据角色知情界限合理生成，不能代替玩家决定新台词。案件需要判决时自动或依玩家请求输出 {"type":"court_finish","verdict":"win","summary":"法庭认可的结论"}；若结论尚缺关键论据就继续庭审，而非跳过证明。',
  settlement: '【和解】只在主动民事/行政诉讼里、且对方确实通过庭审同意谈判后，使用 <world_actions>[{"type":"court_settlement","summary":"双方愿意结束纠纷","defendantConsented":true,"terms":[{"kind":"payment","from":"defendant","description":"支付已协商的款项","amountYen":3000,"dueDay":3}]}]</world_actions> 保存待确认和解。terms 可含 payment/apology/cease/return；非付款 amountYen 必须是0；dueDay 使用当前游戏日或未来日期，不能填过去。这个例子里的钱与日期都只是格式样例，实际由LLM按案情确定。defendantConsented 仅在被告明确同意对应全部条件时才允许 true。提出和解不等于玩家接受，不能用 court_finish settled 代替确认；原告必须亲自接受后才生成正式协议。仅在玩家明确提出撤诉时提示她使用法庭案卷的撤诉确认，不能替玩家撤诉。',
  judgment: '【判决执行】法官确实判定金钱或履行义务时，court_finish 可添加 order:{"respondent":"对方当事人姓名","terms":[{"kind":"payment","from":"defendant","description":"支付判定的赔偿","amountYen":5000,"dueDay":4}],"sanctions":[]}。这会写成后续可执行的判决协议，真实付款从既有双方钱包账本进行；不能仅在正文宣称转账已完成。普通赔偿和律师费不自动重复扣款。原告/被告身份以案卷为准，委托案原告是委托人而不是协助办理案件的主角。没有判令付款就省略 order；不能编造与现有情节无关的被告、资产或证据。',
  criminal: '【刑事后果】只有真正的刑事案件在有充分法律根据及定罪依据时，order.sanctions 才能记录处罚，格式为 {"personId":"既有NPC的精确personId","kind":"custody","startDay":3,"endDay":5,"detail":"判决生效后依法执行"}。必须是确实被定罪的既有NPC，不得处罚其他无关NPC或任一可操作主角。重大刑事中临时登场人物尚无地图生活排程时，仅叙述裁判结果，不虚构已执行的地图拘留状态。已保存的拘留与社区服务时段约束 NPC 现场出现；普通每日生活不能越过这一状态。',
  fulfillment: '【协议履行】法庭协议与判决已经写入 courtroom.agreements，状态为 pending、fulfilled 或逾期 overdue。NPC 或当前主角已经实际履行了非货币承诺时可用 {"type":"court_fulfill","termId":"确切条款ID","description":"已发生的履行依据"}，程序核对条款后标记 fulfilled。金钱赔偿可以通过法庭案卷中的支付按钮过账；若通过原有转账协议 <world_actions> transfer 付款，必须用该待付条款唯一 ID 作为精确的 reason 字段："court-obligation:term-..."，并确保付款人、收款人、金额与条款完全一致。程序只有在双边转账成功后才将相应条款标记 fulfilled；不要再另扣款。不能把 court_fulfill、relationship 或 activity 当作付款。违约只依据已保存的期限/履行状态推演后续剧情；不能把未经确认的谈判承诺当作和解协议。',
  relationships: '【后续人物关系】判决、和解、撤诉可能自然影响当事人对彼此的看法。只有确实已发生的事件且对象是玩家已保存的联系人，才可以附加合法的 relationship 行动改变有限好感；不得仅凭胜败就无条件让所有人讨厌原告或突然爱上律师。对未入通讯录的NPC用持续有效的案件判决、协议履行与限制状态推动后续对话，不生成工程说明文字。',
  qualification: '【律师资格】courtroom.careers 记录四主角的法律职业参与、经历与资格等级；法学在读和见习不等于持证律师。选择未持证的另一主角时是法律协助，不得把她写成法定的正式诉讼代理人；职业经验和协助费用由程序结算。橘雪莉保留原设定的见习身份。事务所受理后，程序转入正式的 court-hearing 法庭室内；法庭结案再返回事务所，叙述不能把事务所接待室当作正规法院。',
  resolution: '【判决与和解】职业委托有固定真相，艾玛推理不佳导致败诉时雪莉依已知证据自动救场，职业收益40%；玩家独立胜诉100%。玩家可以主动请求雪莉接手（通过事务所按钮或自然语言），自然语言接手必须在当前艾玛职业委托中先通过 court_assist 行动 {"type":"court_assist","who":"sherry"} 更新持久化 courtroom.active.assistance，再用独立的 court_finish 行动结案；可以在同一回复按顺序输出这两项。普通建议、参与讨论或结案说明提到雪莉，不执行 court_assist，也不扣掉独立结案的60%。结算只读取持久化变量，禁止解析剧情措辞。主动诉讼无预设真相和强制胜诉，原告可赢可输；若双方提出和解必须先用 court_settlement 写入条款，并让玩家明确接受或拒绝；玩家撤诉只能通过明确的撤诉申请与确认，court_finish 只用于胜败判决。赔偿及和解金必须经真实账本付款才能算 fulfilled，不得擅自使用 balance 发钱。法庭不能因反复对话自动跨游戏日。',
  observation: '【法院大厅旁听·自然语言行动】玩家已位于 courthouse（法院入口/大厅）或 court-hearing（公开法庭）且明确表示执行旁听时，使用 <world_actions>[{"type":"service","serviceId":"court-observe","minutes":45,"knowledgeGain":11}]</world_actions>（此为45分钟的字段格式示例，11点仅是示例，实际知识由你根据听到的证言、理解程度、注意力和旁听内容独立判断）。minutes 为玩家要求的实际整数分钟，允许1–480分钟，不设30分钟倍数门槛；knowledgeGain 为本次真正学到的非负整数，允许0–min(minutes,100)，不得按时长机械固定，也不得自行改动已存知识。两字段必须一起提供；旧式无字段 service 仍兼容按钮的30分钟默认服务。程序自动从 courthouse 进入公开法庭，统一结算精力等生理变化、准确推进游戏分钟，并把你的知识奖励写入该主角的法庭见闻及符合条件的法庭论证课程。只写旁听故事而没有相应 world_actions 不会结算。不得另加 rest、study、activity 或第二次 service 重复算时长、知识和费用。公开旁听不创建 courtroom.active 案件，不进行诉讼、判决、律师收费；正在正式开庭时禁止旁听。只在玩家明确行动时提交；询问、假设、否定、回忆不结算。若没有足够的开放时间（09:00–17:00）、精力或位置不在法院且玩家未要求前往，应如实说明无法完成，不可用其他行动绕过。若玩家明确要求从其他地点先去法院旁听，可先 travel 到 courthouse，再按上述格式使用 service；不可直接 travel 到 court-hearing。若服务无法完成，不能在正文谎称已经完成旁听。',
} as const;

export type CourtRuleId = keyof typeof COURT_PROMPT_RULES;
export type CourtPromptStage = 'entry' | 'commissions' | 'consultation' | 'acceptance'
  | 'hearing' | 'settlement' | 'enforcement' | 'observation';

export const COURT_PROMPT_GROUPS = {
  entry: ['foundation', 'qualification'],
  commissions: ['commissions', 'special'],
  consultation: ['consultation'],
  acceptance: ['acceptance'],
  hearing: ['hearing', 'resolution'],
  settlement: ['settlement'],
  enforcement: ['judgment', 'criminal', 'fulfillment', 'relationships'],
  observation: ['observation'],
} as const satisfies Record<CourtPromptStage, readonly CourtRuleId[]>;

export const COURT_RULE_TEXTS: ReadonlySet<string> = new Set(Object.values(COURT_PROMPT_RULES));
const ALL_STAGES = Object.keys(COURT_PROMPT_GROUPS) as CourtPromptStage[];

// The whole request must fit a closed, single-action grammar to omit anything.
// These are positive proofs of a narrow request, NOT a legal-keyword blacklist.
// Arbitrary objects, pronouns, extra clauses, quotations and unfamiliar language
// deliberately fall back to every rule. Extending vocabulary is optional for
// savings, never required to make a new natural-language action work.
const DAILY_REQUESTS = [
  /^(?:我(?:想|要)?|请)?(?:去)?(?:食堂吃饭|便利店买(?:一)?瓶水|便利店购物|图书馆看书|教室上课|校园散步|商店购物|商业街逛街|逛街|吃饭|喝水|看看窗外|回家睡觉)$/u,
  /^(?:我(?:想|要)?|请)?(?:休息|睡觉|睡|等候|等待)(?:[0-9一二三四五六七八九十半]+)(?:分钟|小时|min)$/iu,
];
const OBSERVATION_REQUEST = /^(?:我(?:想|要)?|请)?(?:在法院大厅|在法院|去法院|前往法院|到法院)?旁听(?:[0-9一二三四五六七八九十半]+(?:分钟|小时|min))?$/iu;
const CONSULTATION_REQUEST = /^(?:我(?:想|要)?|请)?(?:咨询法律问题|咨询起诉费用|了解起诉风险)$/u;
const COMMISSION_REQUESTS = new Set([
  '查看今日委托', '查看特殊委托',
  '请让我看看今天枫庭律师事务所的委托目录。我想先挑选一份合适的案件，不急着开庭',
  '我想看看今天是否有需要特别办理的重大刑事委托。先让我看一看案情概要',
]);
// History hints can only ADD rules. In particular, do not truncate before this
// check: a legal reference near the end of a long previous turn still counts.
const LEGAL_CONTINUITY = /court[_-]|legal-office|法院|法庭|律师|法律|诉讼|起诉|委托|证言|质证|案卷|判决|和解|撤诉|赔偿|拘留|社区服务|履行|败诉|被告|原告|受理|官司|court|lawsuit|lawyer/iu;

export interface CourtPromptPlan {
  stages: CourtPromptStage[];
  reason: 'uncertain-request' | 'court-state' | 'court-place' | 'legal-continuity' | 'bounded-request';
}

/** Include successors reachable within the SAME generated action batch. */
function expandStages(seeds: readonly CourtPromptStage[]): CourtPromptStage[] {
  const selected = new Set<CourtPromptStage>(seeds);
  if (selected.has('commissions') || selected.has('acceptance') || selected.has('hearing') || selected.has('settlement')) {
    // Docket/special -> accept -> hearing -> settlement/judgment -> return to
    // office -> another consultation/commission. Never wait for the next turn.
    return [...ALL_STAGES];
  }
  return ALL_STAGES.filter(stage => selected.has(stage));
}

export function courtPromptPlan(state: WorldState, input: string, options?: StoryGenerationOptions): CourtPromptPlan {
  const all = (reason: CourtPromptPlan['reason']): CourtPromptPlan => ({ stages: [...ALL_STAGES], reason });
  const court = state.courtroom;
  // Shared active cases must constrain every viewpoint, even if the public
  // courtStoryContext hides another protagonist's private active-case details.
  if (court?.active || court?.filing || court?.pendingSettlement ||
    Object.values(state.lawCareer?.owners ?? {}).some(owner => owner?.active)) return all('court-state');
  if (options) return all('uncertain-request'); // Prepared events may introduce a legal transition.

  const request = input.trim().replace(/[。！!？?]$/u, '');
  const daily = DAILY_REQUESTS.some(pattern => pattern.test(request));
  const observation = OBSERVATION_REQUEST.test(request);
  const consultation = CONSULTATION_REQUEST.test(request);
  const commissions = COMMISSION_REQUESTS.has(request);
  if (!daily && !observation && !consultation && !commissions) return all('uncertain-request');

  // A closed request in a legal scene may continue a consultation or resume an
  // old offer. Public observation without an active case is the narrow exception.
  const places = [state.locationId, state.interior?.roomId, state.scene?.areaId];
  if (places.includes('legal-office') || (!observation &&
    places.some(id => id === 'courthouse' || id === 'court-hearing'))) return all('court-place');

  if (state.story.slice(-6).some(row => LEGAL_CONTINUITY.test(row.text + '\n' + (row.returnStory ?? ''))) ||
    state.journal.slice(-7).some(row => LEGAL_CONTINUITY.test(row.text))) return all('legal-continuity');

  // Entry rules, quotation/consent and travel+observation remain available even
  // in ordinary scenes. No new output tag, model request, or save field is used.
  const stages: CourtPromptStage[] = ['entry', 'consultation', 'observation'];
  if (commissions) stages.push('commissions');
  if (court?.agreements?.length || court?.sanctions?.some(row => row.endDay >= state.clock.day) ||
    court?.results.length || Object.values(court?.pendingRecaps ?? {}).some(Boolean)) stages.push('enforcement');
  return { stages: expandStages(stages), reason: 'bounded-request' };
}

export function selectCourtPromptRules(state: WorldState, input: string, options?: StoryGenerationOptions): ReadonlySet<string> {
  const rules = courtPromptPlan(state, input, options).stages.flatMap(stage => [...COURT_PROMPT_GROUPS[stage]]);
  return new Set(rules.map(id => COURT_PROMPT_RULES[id]));
}
