/** 
 * Regex pruning is deliberately limited to known generated-variable wrappers.
 * Do not regex-strip natural-language story or user input, and do not mutate
 * the authoritative unread_city save. Every generation receives a self-contained
 * bounded projection because Tavern mode uses max_chat_history: 0.
 */
export const PROMPT_CONTEXT_LIMITS = {
  // Forward every journal entry retained by WorldState to the narrator.
  journalEntries: 100,
  // Do not silently omit the end of a saved action receipt.
  journalText: 1000,
  storyTurns: 6,
  storyText: 650,
  phoneMessages: 8,
  phoneText: 280,
  calendarEntries: 12,
  notifications: 6,
  mainCharacters: 16,
  mainCharacterSummary: 350,
} as const;

// Both patterns require a recognisable, balanced wrapper. Ordinary quotes,
// JSON embedded in prose, dialogue tags and the player's request are untouched.
const MACHINE_TAG = /<unread_city_(state|variables)>[\s\S]*?<\/unread_city_\1>/gi;
const MACHINE_FENCE = /```(?:unread_city_state|unread_city_variables)[ \t]*\r?\n[\s\S]*?\r?\n```/gi;

export function pruneVariableEcho(savedText: string): string {
  return savedText.replace(MACHINE_TAG, '').replace(MACHINE_FENCE, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

export interface PromptJournal { id: string; at: string; text: string }
export interface PromptStory { role: 'user' | 'assistant'; text: string; returnStory?: string }
export interface PromptPhone { npcId: string; text: string; read: boolean; at: string }

export function selectPromptJournal(rows: readonly PromptJournal[], excludedIds: ReadonlySet<string> = new Set()): PromptJournal[] {
  const seen = new Set<string>(excludedIds);
  const newest: PromptJournal[] = [];
  for (const row of [...rows].reverse()) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const text = pruneVariableEcho(row.text).slice(0, PROMPT_CONTEXT_LIMITS.journalText);
    if (!text) continue;
    newest.push({ id: row.id, at: row.at, text });
    if (newest.length === PROMPT_CONTEXT_LIMITS.journalEntries) break;
  }
  return newest.reverse();
}

/** Read-only prose projection. The foreground return AFTER an off-screen cut is
 * the actual last narrated moment, so always reserve room for it. Never append
 * otherSideBeats: those are private, non-witnessed events in other saves. */
export function selectPromptStory(rows: readonly PromptStory[]): PromptStory[] {
  return rows.slice(-PROMPT_CONTEXT_LIMITS.storyTurns).map(row => {
    const beginning = pruneVariableEcho(row.text);
    const resumed = row.role === 'assistant' && row.returnStory
      ? pruneVariableEcho(row.returnStory).slice(-300) : '';
    const tail = resumed ? '\n【回到当前视角后已经发生的正文】\n' + resumed : '';
    const available = PROMPT_CONTEXT_LIMITS.storyText - tail.length;
    return { role: row.role, text: beginning.slice(0, available) + tail };
  }).filter(row => row.text);
}

export function selectPromptPhone(rows: readonly PromptPhone[]): PromptPhone[] {
  // Keep the latest records as well as the unread ones, but never infer that
  // a received message has been read by the current protagonist.
  const latest = rows.slice(-PROMPT_CONTEXT_LIMITS.phoneMessages);
  return latest.map(row => ({
    npcId: row.npcId, text: pruneVariableEcho(row.text).slice(0, PROMPT_CONTEXT_LIMITS.phoneText),
    read: row.read, at: row.at,
  })).filter(row => row.text);
}

/** Only retrieval switches, never executable action decisions. */
export function promptTopicHints(input: string) {
  return {
    study: /学习|上课|课程|读书|专业|考试|复习|图书馆|教室|书店|课表|学科|study|class|school/i.test(input),
    shopping: /买|购物|超市|商店|便利店|外卖|点餐|食物|饮料|用餐|打包|食堂|咖啡|购买|shop|food|delivery/i.test(input),
    room: /进入|房间|宿舍|教室|办公室|室内|物品|书架|床|课桌|门|互动|interact|room/i.test(input),
  };
}
