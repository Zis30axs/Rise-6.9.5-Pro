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

describe('identity-card module', () => {
  it('exposes Wakaba Mutsumi as a full resident profile with civil and stage (Mortis) cards without exemplar tag', () => {
    expect(WAKABA_MUTSUMI_CARD.id).toBe('bang-mutsumi');
    expect(WAKABA_MUTSUMI_CARD.name).toBe('若叶睦');
    expect(WAKABA_MUTSUMI_CARD.nativeName).toBe('若葉 睦');
    expect(WAKABA_MUTSUMI_CARD.birthDate).toBe('2007.01.14');
    expect(WAKABA_MUTSUMI_CARD.isExemplar).toBeFalsy();
    expect(WAKABA_MUTSUMI_CARD.categoryBadge).not.toContain('范例');
    expect(WAKABA_MUTSUMI_CARD.stageProfile?.bandName).toBe('Ave Mujica');
    expect(WAKABA_MUTSUMI_CARD.stageProfile?.stageCode).toContain('Mortis');
    expect(WAKABA_MUTSUMI_CARD.mrzLine1).toHaveLength(44);
    expect(WAKABA_MUTSUMI_CARD.mrzLine2).toHaveLength(44);
  });

  it('places active protagonist first in the identity card catalog and includes all 4 protagonists and saved contacts', () => {
    const state = createInitialState();
    const catalog = getIdentityCardCatalog(state, 'soyo');
    expect(catalog[0].id).toBe('soyo');
    expect(catalog.some(c => c.id === 'soyo')).toBe(true);
    expect(catalog.some(c => c.id === 'sakiko')).toBe(true);
    expect(catalog.some(c => c.id === 'emma')).toBe(true);
    expect(catalog.some(c => c.id === 'renako')).toBe(true);
    expect(catalog.some(c => c.id === 'bang-mutsumi')).toBe(true);

    const resolvedByChinese = resolveIdentityCardById('若叶睦', state, 'soyo');
    expect(resolvedByChinese.id).toBe('bang-mutsumi');

    const fallback = resolveIdentityCardById('unknown-id', state, 'soyo');
    expect(fallback.id).toBe('soyo');
  });

  it('computes authentic canon bonds for Soyo (62) and Sakiko (78) while confirming Mutsumi has no pre-existing acquaintance with Emma or Renako', () => {
    const state = createInitialState();
    const baseContacts = state.contacts.filter(c => c.id !== 'bang-mutsumi');

    // 素世与祥子是睦真实结识的初中同窗与乐团旧友/青梅
    const soyoBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'soyo', baseContacts);
    expect(soyoBond.protagonistName).toBe('长崎素世');
    expect(soyoBond.affinity).toBe(62);
    expect(soyoBond.isRegisteredContact).toBe(false);

    const sakikoBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'sakiko', baseContacts);
    expect(sakikoBond.protagonistName).toBe('丰川祥子');
    expect(sakikoBond.affinity).toBe(78);

    // 小睦并不认识艾玛与玲奈子，在无真实通讯往来时羁绊未建立（好感为 0）
    const emmaBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'emma', baseContacts);
    expect(emmaBond.protagonistName).toBe('樱羽艾玛');
    expect(emmaBond.affinity).toBe(0);
    expect(emmaBond.statusTag).toContain('未结识');

    const renakoBond = getProtagonistBondForCard(WAKABA_MUTSUMI_CARD, 'renako', baseContacts);
    expect(renakoBond.protagonistName).toBe('甘织玲奈子');
    expect(renakoBond.affinity).toBe(0);
    expect(renakoBond.statusTag).toContain('未结识');

    // 睦的卡片预设中不包含艾玛和玲奈子
    expect(WAKABA_MUTSUMI_CARD.bonds.some(b => b.personId === 'emma')).toBe(false);
    expect(WAKABA_MUTSUMI_CARD.bonds.some(b => b.personId === 'renako')).toBe(false);

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

  it('allocates correct age and birthDate for Amaori Haruna (2009.05.28) making her younger than Renako (2007.03.03)', () => {
    const state = createInitialState();
    const renakoCard = resolveIdentityCardById('renako', state, 'renako');
    const harunaCard = resolveIdentityCardById('watanare-haruna', state, 'renako');
    const harunaByCn = resolveIdentityCardById('甘织遥奈', state, 'renako');

    expect(renakoCard.birthDate).toBe('2007.03.03');
    expect(harunaCard.birthDate).toBe('2009.05.28');
    expect(harunaByCn.birthDate).toBe('2009.05.28');
    expect(harunaCard.zodiac).toBe('双子座');
    expect(harunaCard.gradeOrTitle).toContain('高等部一年级');
    expect(harunaCard.schoolOrAffiliation).toContain('月之森女子学园');

    // 解析年份，确保遥奈出生年份晚于玲奈子（妹妹年龄严格小于姐姐）
    const renakoBirthYear = Number(renakoCard.birthDate.split('.')[0]);
    const harunaBirthYear = Number(harunaCard.birthDate.split('.')[0]);
    expect(harunaBirthYear).toBeGreaterThan(renakoBirthYear);
    expect(harunaBirthYear - renakoBirthYear).toBe(2);

    // MRZ 码第 2 行严格以出生年月日 YYMMDD 开头
    expect(harunaCard.mrzLine2.startsWith('090528')).toBe(true);
    expect(renakoCard.mrzLine2.startsWith('070303')).toBe(true);
  });

  it('differentiates mother and adult generations from student age brackets', () => {
    const state = createInitialState();

    // 甘织美代子（母亲长辈，44岁左右）
    const miyokoCard = buildContactIdentityCard({
      id: 'watanare-miyoko',
      name: '甘织美代子',
      tag: '甘织家母亲',
      summary: '玲奈子与遥奈的母亲。',
      affinity: 70,
      status: '甘织家',
      portraitId: 'claude',
      sourcePersonId: 'watanare-miyoko',
      isMain: false
    });
    expect(miyokoCard.birthDate).toBe('1981.04.18');
    expect(Number(miyokoCard.birthDate.split('.')[0])).toBeLessThan(1990);
    expect(miyokoCard.zodiac).toBe('白羊座');

    // 长崎夫人（素世的母亲长辈，46岁左右）
    const nagasakiMotherCard = buildContactIdentityCard({
      id: 'nagasaki-mother',
      name: '长崎夫人',
      tag: '企业高管 · 素世母亲',
      summary: '长崎素世的单亲母亲。',
      affinity: 65,
      status: '长崎家高层公寓',
      portraitId: 'claude',
      sourcePersonId: 'nagasaki-mother',
      isMain: false
    });
    expect(nagasakiMotherCard.birthDate).toBe('1979.08.12');
    expect(Number(nagasakiMotherCard.birthDate.split('.')[0])).toBeLessThan(1985);
    expect(nagasakiMotherCard.zodiac).toBe('狮子座');

    // 鬼瓦星来（遥奈的高一同班好友，16岁）
    const seiraCard = buildContactIdentityCard({
      id: 'watanare-seira',
      name: '鬼瓦星来',
      tag: '月之森高一生 · 遥奈好友',
      summary: '月之森女子学园高等部在读学生。',
      affinity: 72,
      status: '鬼瓦洗衣店',
      portraitId: 'claude',
      sourcePersonId: 'watanare-seira',
      isMain: false
    });
    expect(seiraCard.birthDate).toBe('2009.02.10');
    expect(seiraCard.zodiac).toBe('水瓶座');

    // 王冢真唯（大一，18岁）
    const maiCard = buildContactIdentityCard({
      id: 'watanare-mai',
      name: '王冢真唯',
      tag: '大学一年级 · 现役模特',
      summary: '芦谷五人组成员。',
      affinity: 85,
      status: '校园西门',
      portraitId: 'claude',
      sourcePersonId: 'watanare-mai',
      isMain: true
    });
    expect(maiCard.birthDate).toBe('2007.09.01');
    expect(maiCard.zodiac).toBe('处女座');
  });

  it('removes Mutsumi bonds from Emma and Renako and links Renako to Haruna and Emma to Yuki', () => {
    const state = createInitialState();
    const renakoCard = resolveIdentityCardById('renako', state, 'renako');
    const emmaCard = resolveIdentityCardById('emma', state, 'emma');

    // 玲奈子与艾玛均不认识若叶睦
    expect(renakoCard.bonds.some(b => b.personId === 'bang-mutsumi')).toBe(false);
    expect(emmaCard.bonds.some(b => b.personId === 'bang-mutsumi')).toBe(false);

    // 玲奈子包含亲妹妹遥奈（至亲家庭羁绊）
    const harunaBond = renakoCard.bonds.find(b => b.personId === 'watanare-haruna');
    expect(harunaBond).toBeDefined();
    expect(harunaBond?.affinity).toBe(90);
    expect(harunaBond?.group).toBe('family');

    // 艾玛包含合租室友月代雪
    const yukiBond = emmaCard.bonds.find(b => b.personId === 'majo-yuki');
    expect(yukiBond).toBeDefined();
    expect(yukiBond?.affinity).toBe(84);

    // 玲奈子的关系网在 family 过滤下仅展示家人，阻断交叉杂线遮挡
    const familyMesh = buildIdentityRelationshipMesh(renakoCard, state, 'renako', 'family');
    expect(familyMesh.nodes.every(n => n.isCenter || n.group === 'family')).toBe(true);
    expect(familyMesh.nodes.some(n => n.id === 'watanare-haruna')).toBe(true);
  });
});
