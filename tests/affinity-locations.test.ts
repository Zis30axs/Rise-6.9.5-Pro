import { describe, expect, it } from 'vitest';
import { affinityLocationNotes, affinityLocationRules as rules } from '../src/runtime/affinity-locations';
import { affinityPersonaPrompt } from '../src/runtime/affinity-personas';
import { AFFINITY_TIERS } from '../src/runtime/affinity-tiers';
import { createInitialState, novelDestinations, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { createAgenda, socialMinute } from '../src/runtime/social-agenda';
import type { SocialInvitation } from '../src/runtime/natural-interactions';
import { validateStoryActions } from '../src/runtime/story-actions';
import { worldSceneContext } from '../src/runtime/world-presence';
import venues from '../src/runtime/affinity-venues.json';
import book from '../src/worldbook/affinity-personas.json';

describe('location-specific affinity personas', () => {
  it('resolves every author, place, tier interval and venue override', () => {
    const characters = new Set(book.entries.map(row => row.extensions.affinityPersona.characterId));
    const destinations = new Set(novelDestinations.map(row => row.id));
    const tiers = AFFINITY_TIERS.map(row => row.id);
    expect(rules).toHaveLength(30);
    expect(new Set(rules.map(rule => rule.characterId)).size).toBe(20);
    for (const rule of rules) {
      expect(characters.has(rule.characterId)).toBe(true);
      for (const place of rule.places) expect(destinations.has(place)).toBe(true);
      for (const reaction of rule.reactions) {
        const first = reaction.from ?? tiers[0]!;
        const last = reaction.through ?? tiers[tiers.length - 1]!;
        expect(tiers).toContain(first);
        expect(tiers).toContain(last);
        expect(tiers.indexOf(first)).toBeLessThanOrEqual(tiers.indexOf(last));
        if (reaction.onlyPlace) expect(rule.places).toContain(reaction.onlyPlace);
      }
    }
  });

  it('travels to each new destination, reloads it and returns via its access point', () => {
    const start = createInitialState();
    for (const venue of venues) {
      const travel = { type: 'travel', locationId: venue.id };
      const schedule = { type: 'schedule', title: '傍晚散步', locationId: venue.id, time: '18:30' };
      expect(validateStoryActions([travel, schedule], start)).toEqual([travel, schedule]);
      const arrived = reduceState(start, { type: 'novel_travel', locationId: venue.id });
      const restored = parseState(JSON.parse(JSON.stringify(arrived)));
      expect(restored.locationId).toBe(venue.id);
      expect(worldSceneContext(restored)?.outdoors).toBe(venue.outdoors);
      expect(reduceState(restored, { type: 'leave_interior' }).locationId).toBe(venue.accessLandmark);
    }
  });

  it('selects just the matching tier, time, weather and branch of an outing', () => {
    const soyo = (tier: string) => affinityLocationNotes('protagonist-soyo', tier, 'asukayama', 12, 'sunny').join('');
    expect(soyo('guarded')).toContain('大幅扣好感');
    expect(soyo('distant')).not.toContain('大幅扣好感');
    expect(soyo('confidant')).toContain('自嘲');
    expect(soyo('confidant')).not.toContain('平静新回忆');
    expect(soyo('bond')).toContain('平静新回忆');
    const bench = (hour: number, weather: 'sunny' | 'snow') =>
      affinityLocationNotes('majo-yuki', 'confidant', 'park-bench', hour, weather);
    expect(bench(12, 'sunny')).toEqual([]);
    expect(bench(17, 'sunny').join('')).toContain('空气');
    expect(bench(19, 'sunny')).toEqual([]);
    expect(bench(12, 'snow').join('')).toContain('空气');
    expect(affinityLocationNotes('watanare-mai', 'friend', 'queen-rose-street', 12, 'sunny').join('')).not.toContain('系上围裙');
    expect(affinityLocationNotes('watanare-mai', 'friend', 'ouzuka-residence', 12, 'sunny').join('')).toContain('系上围裙');
    expect(affinityLocationNotes('bang-tomori', 'hostile', 'aquarium', 12, 'sunny')).toEqual([]);
    expect(affinityLocationNotes('bang-taki', 'friend', 'circle-studio', 12, 'sunny')).toEqual([]);
  });

  it('injects at an actual appointment, then stops when the companion leaves', () => {
    const state = enableProtagonists(createInitialState());
    const invite: SocialInvitation = {
      id: 'bridge-walk', owner: 'soyo', targetId: 'bang-anon', targetName: '千早爱音',
      source: 'meeting', locationId: 'chitose-bridge', day: 1, time: '18:10',
      message: '傍晚去千登世桥走走吧。', status: 'accepted', createdAt: socialMinute(state),
      messageId: null, response: '那就桥上见！',
    };
    invite.agenda = createAgenda({ rationale: '放学后去桥上会面。', steps: [
      { kind: 'depart', day: 1, time: '18:00', detail: '出发' },
      { kind: 'arrive', day: 1, time: '18:10', detail: '到达桥上' },
      { kind: 'leave', day: 1, time: '18:30', detail: '告别回家' },
    ] }, invite, socialMinute(state));
    state.protagonists!.socialInvitations = [invite];
    const prompt = (s: typeof state, kind?: 'phone_reply' | 'interaction_event') =>
      affinityPersonaPrompt(s, worldSceneContext(s), '和爱音聊起千登世桥。', kind);
    const early = reduceState(state, { type: 'novel_travel', locationId: invite.locationId });
    expect(prompt(early)).not.toContain('自己以前追着大家跑的糗事');
    const minutes = 18 * 60 + 10 - socialMinute(early);
    const together = parseState(reduceState(early, { type: 'wait', minutes }));
    expect(prompt(together, 'interaction_event')).toContain('自己以前追着大家跑的糗事');
    expect(prompt(together, 'phone_reply')).toBe('');
    const later = reduceState(together, { type: 'wait', minutes: 20 });
    expect(prompt(later)).not.toContain('自己以前追着大家跑的糗事');
  });
});
