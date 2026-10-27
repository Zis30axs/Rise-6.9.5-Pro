// The NPC's simulated phone is a view of the canonical protagonist<->NPC SMS
// history, not a second database of protagonist messages. This module is
// shared by the embedded ST-iPhonie host and iframe.
const PROTAGONIST_NAMES = new Set(['长崎素世', '丰川祥子', '樱羽艾玛', '甘织玲奈子']);

export function peekWorld(win) {
  try {
    return win?.__unreadCityWorldPhone?.read?.() || win?.parent?.__unreadCityWorldPhone?.read?.() || null;
  } catch { return null; }
}

export function peekWorldContact(world, name) {
  return world?.npcPhone?.contacts?.find(c => c.name === name) || null;
}

export function peekCanonicalMessages(world, contact) {
  if (!world || !contact) return [];
  return (world.npcPhone?.messages || [])
    .filter(m => m.owner === world.owner && m.channel === 'npc' && m.targetId === contact.id)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function peekCanonicalHistory(world, contact) {
  return peekCanonicalMessages(world, contact).slice(-20)
    .map(m => (m.direction === 'outgoing' ? world.name : contact.name) + '：' + m.text)
    .join('\n');
}

export function withoutProtagonistChats(snapshot) {
  if (!snapshot) return snapshot;
  return { ...snapshot, chats: (snapshot.chats || []).filter(c => !PROTAGONIST_NAMES.has(c.with) && c.with !== '我') };
}

export function visiblePeekSnapshot(snapshot, world) {
  if (!snapshot || !world) return snapshot;
  // Never show a prior protagonist's cached simulated messages after a switch.
  const clean = withoutProtagonistChats(snapshot);
  const contact = peekWorldContact(world, snapshot.name);
  const messages = peekCanonicalMessages(world, contact);
  if (!messages.length) return clean;
  const lines = messages.slice(-24).map(m => ({
    from: m.direction === 'outgoing' ? 'me' : snapshot.name,
    text: m.text,
  }));
  return { ...clean, chats: [{with: world.name, lines}, ...clean.chats].slice(0, 5) };
}

export function newPeekDialogue(snapshot, world, contact) {
  if (!snapshot || !world || !contact) return [];
  const generated = (snapshot.chats || [])
    .filter(c => c.with === world.name)
    .flatMap(c => (c.lines || []).filter(l => l.from === 'me' || l.from === snapshot.name)
      .map(l => ({ speaker: l.from === 'me' ? 'protagonist' : 'npc', text: String(l.text || '').trim().slice(0, 180) })))
    .filter(l => l.text);
  const existing = peekCanonicalMessages(world, contact).map(m => ({
    speaker: m.direction === 'outgoing' ? 'protagonist' : 'npc', text: m.text,
  }));
  // A model may quote the last real lines before continuing; keep only the
  // suffix that is genuinely new. No generated text may replace saved lines.
  let overlap = Math.min(generated.length, existing.length);
  while (overlap && !generated.slice(0, overlap).every((row, i) => {
    const prior = existing[existing.length - overlap + i];
    return prior.speaker === row.speaker && prior.text === row.text;
  })) overlap--;
  return generated.slice(overlap).slice(0, 6);
}
