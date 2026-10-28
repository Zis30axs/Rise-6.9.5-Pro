import { describe, expect, it } from 'vitest';
import {
  diagnosePlayerIllnesses,
  getIllnessDebuffs,
  isPlayerIll,
  formatIllnessStoryContext,
} from '../src/runtime/illness';
import {
  createInitialState,
  getNovelTravelQuote,
  reduceState,
} from '../src/runtime/model';
import { getLocationServiceQuote } from '../src/runtime/location-services';
import { enableProtagonists } from '../src/runtime/protagonist-world';
import { storeCatalog } from '../src/runtime/convenience-store';

describe('Illness System', () => {
  describe('Diagnosis & triggers', () => {
    it('returns empty illnesses for healthy character', () => {
      const healthyPlayer = {
        health: 85,
        energy: 90,
        satiety: 80,
        foodEnergy: 1600,
        stress: 15,
        morale: 85,
      };
      expect(isPlayerIll(healthyPlayer)).toBe(false);
      expect(diagnosePlayerIllnesses(healthyPlayer)).toHaveLength(0);
      const debuffs = getIllnessDebuffs(healthyPlayer);
      expect(debuffs.travelEnergyMultiplier).toBe(1);
      expect(debuffs.bedRestEnergyMultiplier).toBe(1);
      expect(debuffs.prohibitHeavyLabor).toBe(false);
      expect(debuffs.preventHeavyLabor).toBe(false);
    });

    it('diagnoses cold when health is low', () => {
      const mildCold = {
        health: 35,
        energy: 50,
        satiety: 70,
        foodEnergy: 1200,
        stress: 20,
        morale: 70,
      };
      const illnesses = diagnosePlayerIllnesses(mildCold);
      expect(illnesses.some(i => i.id === 'cold')).toBe(true);
      const cold = illnesses.find(i => i.id === 'cold')!;
      expect(cold.name).toBe('风寒感冒');
      expect(cold.severity).toBe('mild');

      const severeCold = {
        health: 20,
        energy: 10,
        satiety: 70,
        foodEnergy: 1200,
        stress: 20,
        morale: 70,
      };
      const severeIllnesses = diagnosePlayerIllnesses(severeCold);
      const severe = severeIllnesses.find(i => i.id === 'cold')!;
      expect(severe.severity).toBe('severe');
      expect(severe.severityLabel).toBe('急性重症');
    });

    it('diagnoses gastro illness from prolonged hunger', () => {
      const starving = {
        health: 60,
        energy: 40,
        satiety: 10,
        foodEnergy: 100,
        stress: 30,
        morale: 60,
      };
      const illnesses = diagnosePlayerIllnesses(starving);
      expect(illnesses.some(i => i.id === 'gastro')).toBe(true);
      const gastro = illnesses.find(i => i.id === 'gastro')!;
      expect(gastro.name).toBe('胃痛与虚脱');
      expect(gastro.symptoms).toContain('胃部隐痛');
    });

    it('diagnoses anxiety from high stress and low morale', () => {
      const brokenMind = {
        health: 70,
        energy: 50,
        satiety: 60,
        foodEnergy: 1000,
        stress: 85,
        morale: 20,
      };
      const illnesses = diagnosePlayerIllnesses(brokenMind);
      expect(illnesses.some(i => i.id === 'anxiety')).toBe(true);
      const anxiety = illnesses.find(i => i.id === 'anxiety')!;
      expect(anxiety.name).toBe('神经衰弱');
      expect(anxiety.category).toBe('mental');
    });

    it('diagnoses exhaustion when energy is drained', () => {
      const drained = {
        health: 30,
        energy: 4,
        satiety: 50,
        foodEnergy: 800,
        stress: 40,
        morale: 50,
      };
      const illnesses = diagnosePlayerIllnesses(drained);
      expect(illnesses.some(i => i.id === 'exhaustion')).toBe(true);
      const exhaustion = illnesses.find(i => i.id === 'exhaustion')!;
      expect(exhaustion.name).toBe('重度疲劳综合征');
    });
  });

  describe('Debuffs and behavioral restrictions', () => {
    it('applies travel energy multiplier and prevents heavy labor when having cold', () => {
      const sickPlayer = {
        health: 30,
        energy: 25,
        satiety: 60,
        foodEnergy: 1000,
        stress: 30,
        morale: 60,
      };
      const debuffs = getIllnessDebuffs(sickPlayer);
      expect(debuffs.travelEnergyMultiplier).toBeGreaterThan(1);
      expect(debuffs.prohibitHeavyLabor).toBe(true);
      expect(debuffs.preventHeavyLabor).toBe(true);
    });

    it('blocks heavy construction labor when player has cold', () => {
      let state = enableProtagonists(createInitialState());
      state.locationId = 'construction-site';
      state.player.energy = 85;
      state.player.health = 30; // Cold triggered: health < 40

      const quote = getLocationServiceQuote(state, 'construction-carry');
      expect(quote.blockedReason).toContain('无法承担重体力劳动');

      expect(() => {
        reduceState(state, { type: 'location_service', serviceId: 'construction-carry' });
      }).toThrow(/无法承担重体力劳动/);
    });

    it('increases travel energy consumption when sick', () => {
      let healthyState = enableProtagonists(createInitialState());
      healthyState.locationId = 'gate';
      healthyState.player.health = 90;
      healthyState.player.energy = 80;
      healthyState.player.satiety = 90;
      healthyState.player.stress = 10;

      const healthyQuote = getNovelTravelQuote(healthyState, 'commercial');

      let sickState = enableProtagonists(createInitialState());
      sickState.locationId = 'gate';
      sickState.player.health = 30; // Cold active
      sickState.player.energy = 80;
      sickState.player.satiety = 90;
      sickState.player.stress = 10;

      const sickQuote = getNovelTravelQuote(sickState, 'commercial');
      expect(sickQuote.calculatedEnergyCost).toBeGreaterThan(healthyQuote.calculatedEnergyCost);
    });
  });

  describe('Remedy and recovery paths', () => {
    it('provides OTC medicines in convenience store catalog under medicine category', () => {
      const coldMeds = storeCatalog.find(item => item.id === 'medicine-cold');
      expect(coldMeds).toBeDefined();
      expect(coldMeds?.category).toBe('medicine');
      expect(coldMeds?.price).toBe(480);

      const gastroMeds = storeCatalog.find(item => item.id === 'medicine-gastro');
      expect(gastroMeds).toBeDefined();
      expect(gastroMeds?.category).toBe('medicine');

      const sootheMeds = storeCatalog.find(item => item.id === 'medicine-soothe');
      expect(sootheMeds).toBeDefined();
      expect(sootheMeds?.category).toBe('medicine');

      const vitalityMeds = storeCatalog.find(item => item.id === 'medicine-vitality');
      expect(vitalityMeds).toBeDefined();
      expect(vitalityMeds?.category).toBe('medicine');
    });

    it('cures cold and generates journal note upon taking cold medicine', () => {
      let state = enableProtagonists(createInitialState());
      state.locationId = 'convenience';
      state.player.health = 38;
      state.player.energy = 50;
      state.player.stress = 40;
      expect(diagnosePlayerIllnesses(state.player).some(i => i.id === 'cold')).toBe(true);

      // Add medicine to inventory and use it
      state.inventory.push({ itemId: 'medicine-cold', quantity: 1 });
      const next = reduceState(state, { type: 'use_item', itemId: 'medicine-cold' });

      // Health rises from 38 + 25 = 63
      expect(next.player.health).toBe(63);
      expect(diagnosePlayerIllnesses(next.player).some(i => i.id === 'cold')).toBe(false);

      const lastJournal = next.journal[next.journal.length - 1];
      expect(lastJournal.text).toContain('身体好转：风寒感冒的症状已完全消退。');
    });

    it('cures anxiety upon taking soothing medicine', () => {
      let state = enableProtagonists(createInitialState());
      state.locationId = 'dorm';
      state.player.stress = 78;
      state.player.morale = 32;
      expect(diagnosePlayerIllnesses(state.player).some(i => i.id === 'anxiety')).toBe(true);

      state.inventory.push({ itemId: 'medicine-soothe', quantity: 1 });
      const next = reduceState(state, { type: 'use_item', itemId: 'medicine-soothe' });

      expect(next.player.stress).toBe(43); // 78 - 35
      expect(next.player.morale).toBe(57); // 32 + 25
      expect(diagnosePlayerIllnesses(next.player).some(i => i.id === 'anxiety')).toBe(false);

      const lastJournal = next.journal[next.journal.length - 1];
      expect(lastJournal.text).toContain('身体好转：神经衰弱的症状已完全消退。');
    });

    it('offers clinic consultation at pocket park that restores health and cures cold', () => {
      let state = enableProtagonists(createInitialState());
      state.locationId = 'pocket-park';
      state.player.health = 35;
      state.player.energy = 50;
      state.player.stress = 50;

      const clinicQuote = getLocationServiceQuote(state, 'clinic-treatment');
      expect(clinicQuote.blockedReason).toBeNull();
      expect(clinicQuote.price).toBe(1800);

      const next = reduceState(state, { type: 'location_service', serviceId: 'clinic-treatment' });
      expect(next.player.health).toBe(70); // 35 + 35
      expect(diagnosePlayerIllnesses(next.player).some(i => i.id === 'cold')).toBe(false);

      const lastJournal = next.journal[next.journal.length - 1];
      expect(lastJournal.text).toContain('诊所全科问诊');
      expect(lastJournal.text).toContain('身体好转：风寒感冒的症状已完全消退。');
    });

    it('offers campus infirmary consultation at sports field that restores health', () => {
      let state = enableProtagonists(createInitialState());
      state.locationId = 'sports';
      state.player.health = 38;
      state.player.energy = 40;

      const infirmaryQuote = getLocationServiceQuote(state, 'campus-infirmary');
      expect(infirmaryQuote.blockedReason).toBeNull();
      expect(infirmaryQuote.price).toBe(450);

      const next = reduceState(state, { type: 'location_service', serviceId: 'campus-infirmary' });
      expect(next.player.health).toBe(63); // 38 + 25
      expect(diagnosePlayerIllnesses(next.player).some(i => i.id === 'cold')).toBe(false);
    });
  });

  describe('Multi-protagonist isolation', () => {
    it('isolates illnesses per protagonist', () => {
      let state = enableProtagonists(createInitialState());
      // Soyo is active, make her sick
      state.player.health = 30;
      state.player.energy = 20;
      expect(diagnosePlayerIllnesses(state.player).some(i => i.id === 'cold')).toBe(true);

      // Switch to Sakiko
      state = reduceState(state, { type: 'switch_protagonist', target: 'sakiko' });
      // Sakiko has fresh healthy state
      expect(diagnosePlayerIllnesses(state.player).length).toBe(0);

      // Switch back to Soyo
      state = reduceState(state, { type: 'switch_protagonist', target: 'soyo' });
      expect(state.player.health).toBe(30);
      expect(diagnosePlayerIllnesses(state.player).some(i => i.id === 'cold')).toBe(true);
    });
  });

  describe('Story context helper', () => {
    it('formats illness summary for prompt context', () => {
      const sickPlayer = {
        health: 20,
        energy: 10,
        satiety: 60,
        foodEnergy: 1000,
        stress: 30,
        morale: 60,
      };
      const storyContext = formatIllnessStoryContext(sickPlayer);
      expect(storyContext).toContain('风寒感冒');
      expect(storyContext).toContain('额头发烫');

      const healthyPlayer = {
        health: 80,
        energy: 80,
        satiety: 80,
        foodEnergy: 1500,
        stress: 20,
        morale: 80,
      };
      expect(formatIllnessStoryContext(healthyPlayer)).toBeNull();
    });
  });
});
