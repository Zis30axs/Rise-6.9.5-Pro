import { describe, expect, it } from 'vitest';
import { createInitialState, parseState, reduceState } from '../src/runtime/model';
import { enableProtagonists, personState } from '../src/runtime/protagonist-world';
import {
  STARTING_AFFINITY, STARTING_RELATION, startingAffinity,
} from '../src/runtime/initial-contacts';

const owners = ['soyo', 'sakiko', 'emma', 'renako'] as const;

describe('starting affinity for people who already know each other', () => {
  const world = () => enableProtagonists(createInitialState());

  it('seeds each protagonist from the bond table, all at least the sandbox line', () => {
    const state = world();
    for (const owner of owners) {
      const contacts = personState(state, owner).contacts;
      expect(contacts.map(contact => contact.id).sort()).toEqual(Object.keys(STARTING_RELATION[owner]).sort());
      for (const contact of contacts) {
        const expected = startingAffinity(owner, contact.id);
        expect(contact.affinity, `${owner} → ${contact.id}`).toBe(expected);
        expect(expected).toBeGreaterThanOrEqual(10);
        expect(expected).toBeLessThanOrEqual(100);
        expect(Number.isInteger(expected)).toBe(true);
      }
    }
    expect(STARTING_AFFINITY.parent).toBe(80);
    expect(startingAffinity('renako', 'watanare-ajisai')).toBe(80);
    expect(startingAffinity('renako', 'watanare-mai')).toBe(75);
    expect(startingAffinity('renako', 'watanare-satsuki')).toBe(62);
    expect(startingAffinity('renako', 'watanare-kaho')).toBe(62);
    const renako = personState(state, 'renako').contacts;
    expect(renako.find(contact => contact.id === 'watanare-ajisai')?.relationNote).toContain('三人知情同意');
    expect(renako.find(contact => contact.id === 'watanare-mai')?.relationNote).toContain('三人知情同意');
    expect(renako.find(contact => contact.id === 'watanare-satsuki')?.relationNote).toBeUndefined();
    expect(startingAffinity('soyo', 'nagasaki-mother')).toBe(80);
    expect(startingAffinity('soyo', 'protagonist-sakiko')).toBe(startingAffinity('sakiko', 'protagonist-soyo'));
    expect(startingAffinity('soyo', 'protagonist-sakiko')).toBeLessThan(STARTING_AFFINITY.dearest);
  });

  it('leaves a newly saved stranger at 0 and does not reset an existing bond', () => {
    const seeded = createInitialState();
    const sakiko = seeded.contacts.find(contact => contact.id === 'protagonist-sakiko')!;
    const added = reduceState(seeded, {
      type: 'save_contact', id: 'passer-1', name: '路过的同学', portraitId: 'deepseek', summary: '今天才交换了姓名。',
    });
    expect(added.contacts.find(contact => contact.id === 'passer-1')?.affinity).toBe(0);
    const edited = reduceState(added, {
      type: 'save_contact', id: sakiko.id, name: sakiko.name, portraitId: sakiko.portraitId, summary: '补了一句近况。',
    });
    expect(edited.contacts.find(contact => contact.id === sakiko.id)?.affinity).toBe(sakiko.affinity);
  });

  it('loads an older save without raising affinity or inserting the new family contact', () => {
    const raw = JSON.parse(JSON.stringify(createInitialState())) as ReturnType<typeof createInitialState>;
    raw.contacts = raw.contacts
      .filter(contact => contact.id !== 'nagasaki-mother')
      .map(contact => ({ ...contact, affinity: 0 }));
    const loaded = parseState(raw);
    expect(loaded.contacts.some(contact => contact.id === 'nagasaki-mother')).toBe(false);
    expect(loaded.contacts.every(contact => contact.affinity === 0)).toBe(true);
    const live = enableProtagonists(createInitialState());
    const savedAjisai = personState(live, 'renako').contacts.find(contact => contact.id === 'watanare-ajisai')!;
    delete savedAjisai.relationNote;
    savedAjisai.affinity = 5;
    const kept = personState(parseState(JSON.parse(JSON.stringify(live))), 'renako').contacts.find(contact => contact.id === 'watanare-ajisai')!;
    expect(kept.affinity).toBe(5);
    expect(kept.relationNote).toBeUndefined();
    const roundTrip = parseState(JSON.parse(JSON.stringify(createInitialState())));
    expect(roundTrip.contacts.map(contact => [contact.id, contact.affinity])).toEqual(
      createInitialState().contacts.map(contact => [contact.id, contact.affinity]),
    );
  });
});
