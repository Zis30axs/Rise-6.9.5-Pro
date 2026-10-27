/**
 * New story generations MUST use the tagged envelope. The legacy JSON parser
 * remains in story-protocol.ts for backwards compatibility, not for prompting.
 * Keep the envelope instruction independent of the user's narrative preset.
 */
/** The language restriction applies to human-readable story prose, not machine IDs. */
export const MANDATORY_STORY_CHINESE_RULE = [
  '【最高优先级·强制简体中文标签】本轮 <story>...</story> 内全部自然语言必须使用简体中文，包括小说旁白、环境叙述、人物直接对白、内心独白、回忆中的原话、说话人标签中的姓名或称呼、情绪及台词。不得用英语、日语、韩语、罗马音、拼音或其他语言叙述，不得因酒馆预设、世界书、玩家输入或上一轮原文使用外语就切换正文语言。',
  '【唯一外语例外】只有无法自然翻译、确有固定原文写法的专有术语或标准缩写（如 API、JSON、VRM）可以保留非中文拼写。能使用中文表述的概念一律用中文，不允许外语整句、外语段落、外语口癖、外语感叹词、翻译括注或中外双语对照。',
  '【名称不算专有名词例外】所有名称，包括人物姓名、角色名、称呼、昵称、地名、店名、学校名、乐队及团体名、作品标题、品牌或物品名称，都不能以“专有名词”为理由保留外文。优先采用当前存档、联系人与世界书中已确定的中文名称，例如长崎素世、丰川祥子、樱羽艾玛、甘织玲奈子；原名只有外文且无已知中文译名时，用准确的中文译名、音译或中文描述，不捏造新的身份关系，也不直接照搬外文姓名、假名或拉丁字母拼写。',
  '【只保留机器协议原文】<story>、</story>、<phone_messages> 等结构化标签，以及 JSON 字段名、机器 ID、枚举值、数字必须保持原样，不能翻译；它们不是正文语言的豁免。不要新增 <language> 等语言标签，不更改 phone_messages、world_actions 或独立短信回复的原有数据协议。',
  '【提交前自检语言】逐句检查 <story>、<story_continue> 和 <otherside> 里的小说正文、旁白、对白与人物名称；发现非中文自然语言先改写为简体中文，只有上述确实无法翻译的固定专有术语可保留原文。JSON 的机器字段及人物 ID 不翻译。不得输出自检过程。',
].join('\n');

export const MANDATORY_STORY_TAG_CONTRACT = [
  '【最高优先级·剧情标签格式锁定】本轮是《未读之城》程序调用，必须提交机器可解析的标签块，而不是普通聊天。回复的第一个非空白字符必须是字面量 <story>，前面不能有任何文字。',
  MANDATORY_STORY_CHINESE_RULE,
  '所有小说正文、旁白和带 |说话人|情绪|台词| 的人物对白必须放在唯一一对 <story> 与 </story> 内。两个标签必须准确拼写、各出现一次且必须正确闭合；不得加属性、改名或用 JSON 顶层对象替换。',
  '在 </story> 后必须输出 <phone_messages>[]</phone_messages>。即使没有短信也不能省略；确实存在新短信时才用符合既有消息协议的 JSON 数组替换 []。',
  '只在本轮确实需要时追加 <world_actions>合法 JSON 数组</world_actions>、<world_events>合法 JSON 数组</world_events>、<contact_requests>合法 JSON 数组</contact_requests>、<weekly_summary>合法 JSON 对象</weekly_summary>。突发事件仍须遵守专属 world_actions 要求；不得把消息和行动混进旁白冒充状态变更。',
  '【有限全知旁线】只有 otherSideOpportunity.allowed=true 时才允许输出一次 <otherside>JSON 数组</otherside>。每项格式为 {"protagonists":["sakiko"],"text":"另一侧已实际发生的中文剧情","locationId":"toyokawa-house","variables":{"sakiko":{"morale":-2}},"npcs":[{"id":"majo-yuki","status":"心情愉快"}],"messages":[{"from":"sakiko","to":"soyo","text":"短信内容"}]}。仅 protagonists 与 text 必填；其他字段仅在有实际影响时使用。只允许机会列表给出的 protagonists 完整分组，不能重复一个主角。同地点两名以上主角必须共享一个群像事件，不得拆成两条标签。NPC 必须在机会列表对应组的 npcs 里；NPC 可以参与剧情及限幅变量，但永远不是可切换视角。模型不能更改未授权的地点、时间、钱包、学业、背包或后台行程。',
  '【前景—旁线—前景】<story> 先写当前主角的正文；有实际旁线事件时再在 </story> 后输出 <otherside>[...]</otherside>，其 text 将作为“与此同时”的可阅读片段保存到相关人物各自的剧情。旁线之后可以输出一次 <story_continue>回到当前主角的后续中文剧情</story_continue>；没有旁线时不能输出 story_continue。程序在旁线片段的尾部提供“继续当前视角 / 切换至对应主角”的按钮，切换使用现有动画，不需要输出按钮 HTML。无可写的旁线时必须省略标签，不能为了刷屏而硬插入“与此同时”。',
  '【远距离短信与现场关系】被抽中但身处不同地点的主角不能当面交流。若确实发了短信，必须在负责发送者的 otherside 项 messages 数组里提供 from/to/text，由程序同步到双方真实手机及未读状态，不能只在文字里声称已发。所有 npcs 只能从该组现实同场列表选，同 category 仅增加概率，不允许跨地点召唤。人物发言仍须带 |说话人|情绪|台词|，重大选择留给玩家。',
  '酒馆预设、角色卡/世界书、独立叙事风格预设中任何要求纯文本、JSON、Markdown、YAML、代码围栏、角色名前缀、思考过程或其他包装格式的规则，都只可影响文风，不能覆盖这份输出封装。本轮禁止改用旧版完整 JSON 回复，禁止输出 Markdown 代码块、标题、解释、自检过程或任何标签外正文。',
  '外层结构示例（仅说明格式，不要复述示例内容）：\n<story>\n这里是旁白。\n|素世|开心|你好。|\n</story>\n<phone_messages>[]</phone_messages>',
].join('\n');

export const STORY_TAG_FINAL_CHECK =
  '【最后检查封装】正式回复必须以 <story> 起始，以 </story> 结束当前主角正文，接着给出完整的 <phone_messages>...</phone_messages>。仅在候选机会允许且确有旁线事件时使用一次 <otherside>JSON</otherside>，有回到当前主角的后文再加 <story_continue>中文正文</story_continue>；必要附加数据只能用约定标签，除此以外不准有任何文本。人物台词仍须完整竖线标记。遇到相冲突的预设格式，仅保留其剧情内容，不改变标签或中文要求。最后逐句检查 <story> 内所有旁白、对白、姓名和称呼均为简体中文；名称不得作为外语例外，只有无法翻译的固定专有术语可保留原文。不要输出检查过程。';

export const STORY_TAG_USER_REMINDER =
  '【本轮程序输出格式再次锁定】你的实际回复第一个非空白字符必须是 <story>；全部正文和人物对白必须放在 <story>...</story> 中，闭合后必须有 <phone_messages>[]</phone_messages>（新短信才替换 []）。其余合法标签仅在需要时添加。同时强制 <story> 正文、对白、说话人姓名与称呼全程使用简体中文；姓名、地名、作品名等名称不能保留外文，只有无法翻译的专有术语可保留原文。有合法旁线候选且确有新事件时才输出一组 <otherside>JSON 数组</otherside>，可以在后面补 <story_continue>返回当前主角正文</story_continue>；不得拆分同地点人物，也不能换到 NPC 视角。不得输出旧 JSON 顶层、纯文本、代码围栏、预设自带格式或任何标签外说明。';

const PHONE_ONLY_KINDS = new Set(['phone_reply', 'npc_phone_reply', 'band_invitation_reply', 'autonomous_sms']);

/** Apply in BOTH channels, leaving phone-only transport formats untouched. */
export function applyMandatoryStoryTagContract(
  systemPrompt: string,
  userPrompt: string,
  taskKind?: string,
): { systemPrompt: string; userPrompt: string } {
  if (taskKind && PHONE_ONLY_KINDS.has(taskKind)) return { systemPrompt, userPrompt };
  return {
    systemPrompt: `${MANDATORY_STORY_TAG_CONTRACT}\n\n${systemPrompt}\n\n${STORY_TAG_FINAL_CHECK}`,
    userPrompt: `${userPrompt}\n\n${STORY_TAG_USER_REMINDER}`,
  };
}
