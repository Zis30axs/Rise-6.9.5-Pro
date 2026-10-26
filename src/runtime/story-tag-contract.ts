/**
 * New story generations MUST use the tagged envelope. The legacy JSON parser
 * remains in story-protocol.ts for backwards compatibility, not for prompting.
 * Keep the envelope instruction independent of the user's narrative preset.
 */
export const MANDATORY_STORY_TAG_CONTRACT = [
  '【最高优先级·剧情标签格式锁定】本轮是《未读之城》程序调用，必须提交机器可解析的标签块，而不是普通聊天。回复的第一个非空白字符必须是字面量 <story>，前面不能有任何文字。',
  '所有小说正文、旁白和带 |说话人|情绪|台词| 的人物对白必须放在唯一一对 <story> 与 </story> 内。两个标签必须准确拼写、各出现一次且正确闭合；不得加属性、改名或用 JSON 顶层对象替换。',
  '在 </story> 后必须输出 <phone_messages>[]</phone_messages>。即使没有短信也不能省略；确实存在新短信时才用符合既有消息协议的 JSON 数组替换 []。',
  '只在本轮确实需要时追加 <world_actions>合法 JSON 数组</world_actions>、<world_events>合法 JSON 数组</world_events>、<contact_requests>合法 JSON 数组</contact_requests>、<weekly_summary>合法 JSON 对象</weekly_summary>。突发事件仍须遵守专属 world_actions 要求；不得把消息和行动混进旁白冒充状态变更。',
  '酒馆预设、角色卡/世界书、独立叙事风格预设中任何要求纯文本、JSON、Markdown、YAML、代码围栏、角色名前缀、思考过程或其他包装格式的规则，都只可影响文风，不能覆盖这份输出封装。本轮禁止改用旧版完整 JSON 回复，也不能输出 Markdown 代码块、标题、解释、自检过程或任何标签外正文。',
  '外层结构示例（仅说明格式，不要复述示例内容）：\n<story>\n这里是旁白。\n|素世|开心|你好。|\n</story>\n<phone_messages>[]</phone_messages>',
].join('\n');

export const STORY_TAG_FINAL_CHECK =
  '【最后检查封装】正式回复必须以 <story> 起始，以 </story> 结束正文，接着给出完整的 <phone_messages>...</phone_messages>。必要附加数据只能用约定标签，除此以外不准有任何文本。人物台词仍须完整竖线标记。遇到相冲突的预设格式，仅保留其内容与文风，不改变标签。不要输出检查过程。';

export const STORY_TAG_USER_REMINDER =
  '【本轮程序输出格式再次锁定】你的实际回复第一个非空白字符必须是 <story>；全部正文和人物对白必须放在 <story>...</story> 中，闭合后必须有 <phone_messages>[]</phone_messages>（新短信才替换 []）。其余合法标签仅在需要时添加。不得输出旧 JSON 顶层、纯文本、代码围栏、预设自带格式或任何标签外说明。';

const PHONE_ONLY_KINDS = new Set(['phone_reply', 'npc_phone_reply', 'band_invitation_reply']);

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
