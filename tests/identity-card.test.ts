import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/runtime/model';
import {
  WAKABA_MUTSUMI_CARD,
  buildContactIdentityCard,
  buildIdentityRelationshipMesh,
  formatDeterministicCardSerial,
  getIdentityCardCatalog,
  getProtagonistBondForCard,
  isCharacterInContacts,
  resolveIdentityCardById
} from '../src/frontend/identity-card';

describe('identity-card module (Wakaba Mutsumi exemplar)', () => {
  it('exposes Wakaba Mutsumi as the primary exemplar with both civil and stage (Mortis) profiles', () => {
    expect(WAKABA_MUTSUMI_CARD.id).toBe('bang-mutsumi');
    expect(WAKABA_MUTSUMI_CARD.name).toBe('若叶睦');
    expect(WAKABA_MUTSUMI_CARD.nativeName).toBe('若葉 睦');
    expect(WAKABA_MUTSUMI_CARD.birthDate).toBe('2007.01.14');
    expect(WAKABA_MUTSUMI_CARD.isExemplar).toBe(true);
    expect(WAKABA_MUTSUMI_CARD.stageProfile?.bandName).toBe('Ave Mujica');
    expect(WAKABA_MUTSUMI_CARD.stageProfile?.stageCode).toContain('Mortis');
    expect(WAKABA_MUTSUMI_CARD.mrzLine1).toHaveLength(44);
    expect(WAKABA_MUTSUMI_CARD.mrzLine2).toHaveLength(44);
  });

  it('places Wakaba Mutsumi first in the identity card catalog and includes all 4 protagonists and saved contacts', () => {
    const state = createInitialState();
    const catalog = getIdentityCardCatalog(state, 'soyo');
    expect(catalog[0].id).toBe('bang-mutsumi');
    expect(catalog.some(c => c.id === 'soyo')).toBe(true);
    expect(catalog.some(c => c.id === 'sakiko')).toBe(true);
    expect(catalog.some(c => c.id === 'emma')).toBe(true);
    expect(catalog.some(c => c.id === 'renako')).toBe(true);

    const resolvedByChinese = resolveIdentityCardById('若叶睦', state, 'soyo');
    expect(resolvedByChinese.id).toBe('bang-mutsumi');

    const fallback = resolveIdentityCardById('unknown-id', state, 'soyo');
    expect(fallback.id).toBe('bang-mutsumi');
  });

  it('computes distinct canon bond details for Soyo (62), Sakiko (78), Emma (56), and Renako (60) and detects contact registration', () => {
    const state = createInitialState();
    const baseContacts = state.contacts.filter(c => c.id !== 'bang-mutsumi');
    const soyoBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'soyo', baseContacts);
    expect(soyoBond.protagonistName).toBe('长崎素世');
    expect(soyoBond.affinity).toBe(62);
    expect(soyoBond.isRegisteredContact).toBe(false);

    const sakikoBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'sakiko', baseContacts);
    expect(sakikoBond.protagonistName).toBe('丰川祥子');
    expect(sakikoBond.affinity).toBe(78);

    const emmaBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'emma', baseContacts);
    expect(emmaBond.protagonistName).toBe('樱羽艾玛');
    expect(emmaBond.affinity).toBe(56);

    const renakoBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'renako', baseContacts);
    expect(renakoBond.protagonistName).toBe('甘织玲奈子');
    expect(renakoBond.affinity).toBe(60);

    const withMutsumiContact = [
      ...baseContacts,
      {
        id: 'bang-mutsumi',
        name: '若叶睦',
        tag: '月之森同窗 · CRYCHIC 旧友',
        summary: '常在图书馆东侧花坛照料黄瓜与绿植。',
        affinity: 82,
        status: '图书馆东侧花坛',
        portraitId: 'claude' as const,
        sourcePersonId: 'bang-mutsumi',
        isMain: true
      }
    ];
    expect(isCharacterInContacts(WAKABA_MUTSUMI_CARD, withMutsumiContact)?.id).toBe('bang-mutsumi');
    const updatedBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'soyo', withMutsumiContact);
    expect(updatedBond.isRegisteredContact).toBe(true);
    expect(updatedBond.affinity).toBe(82);
    expect(updatedBond.statusTag).toBe('挚重 · 82');
  });

  it('builds a visual relationship mesh with center node, faction satellites, and inter-character cross-links', () => {
    const state = createInitialState();
    const mesh = buildIdentityRelationshipMesh(WAKABA_MUTSUMI_CARD, state, 'soyo', 'all');
    expect(mesh.nodes[0].id).toBe('bang-mutsumi');
    expect(mesh.nodes[0].isCenter).toBe(true);
    expect(mesh.nodes.some(n => n.id === 'sakiko')).toBe(true);
    expect(mesh.nodes.some(n => n.id === 'soyo' && n.isCurrentProtagonist)).toBe(true);
    expect(mesh.edges.some(e => e.kind === 'primary')).toBe(true);
    expect(mesh.edges.some(e => e.kind === 'cross')).toBe(true);

    const mujicaOnly = buildIdentityRelationshipMesh(WAKABA_MUTSUMI_CARD, state, 'sakiko', 'mujica');
    expect(mujicaOnly.nodes.every(n => n.isCenter || n.group === 'mujica')).toBe(true);
  });

  it('synthesizes deterministic serial numbers and cards for custom contacts', () => {
    const serialA = formatDeterministicCardSerial('friend-1:林知夏');
    const serialB = formatDeterministicCardSerial('friend-1:林知夏');
    expect(serialA).toBe(serialB);
    expect(serialA).toMatch(/^5191-\d{4}-\d{4}-\d{2}$/);

    const customCard = buildContactIdentityCard({
      id: 'friend-lin',
      name: '林知夏',
      tag: '文学社学姐',
      summary: '常在街角书店整理旧书刊。',
      affinity: 68,
      status: '街角书店',
      portraitId: 'deepseek',
      sourcePersonId: null,
      isMain: true
    });
    expect(customCard.name).toBe('林知夏');
    expect(customCard.gradeOrTitle).toBe('文学社学姐');
  });
});
