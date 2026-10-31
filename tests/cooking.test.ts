import { describe, expect, it } from 'vitest';
import { commitStoryTurn, createInitialState, parseState, reduceState } from '../src/runtime/model';
import { getCookingRecipe, cookingQuality, cookingZones, drawCookingCenter, COOKING_RECIPES, COOKING_DIFFICULTY } from '../src/runtime/cooking-recipes';
import { COOKING_KITCHENS, cookQuote, cookedDishQuote, cookingNarrativeContext, parseCookingState } from '../src/runtime/cooking';
import { protagonistHomeRooms } from '../src/runtime/natural-interactions';
import { activeProtagonist, enableProtagonists } from '../src/runtime/protagonist-world';
import { PROTAGONISTS, type ProtagonistId } from '../src/runtime/dual-protagonists';
import { getUseItemQuote, getStoreItem } from '../src/runtime/convenience-store';
import { canCheckInteractionEvent } from '../src/runtime/interaction-event-rate';
import { validateStoryActions } from '../src/runtime/story-actions';

function home(owner: ProtagonistId) {
  let state = enableProtagonists(createInitialState());
  if (owner !== 'soyo') state = reduceState(state, { type: 'switch_protagonist', target: owner });
  const roomId = protagonistHomeRooms[owner];
  state = reduceState(state, { type: 'novel_travel', locationId: roomId });
  state = reduceState(state, { type: 'novel_approach', interactionId: COOKING_KITCHENS[roomId] });
  state.player.energy = 95;
  state.inventory = [
    { itemId: 'ingredient-egg', quantity: 12 },
    { itemId: 'ingredient-bread', quantity: 12 },
    { itemId: 'ingredient-rice', quantity: 12 },
    { itemId: 'ingredient-chicken', quantity: 12 },
    { itemId: 'ingredient-vegetable', quantity: 12 },
  ];
  return parseState(state);
}

describe('analog cooking meter', () => {
  it('offers exactly eight recipes and stable shrinking quality zones', () => {
    expect(COOKING_RECIPES).toHaveLength(8);
    for (const difficulty of ['easy', 'normal', 'hard', 'expert'] as const) {
      const cfg = COOKING_DIFFICULTY[difficulty];
      const center = drawCookingCenter(difficulty, 0.41);
      const zones = cookingZones(difficulty, center);
      expect(zones.ordinaryStart).toBeGreaterThanOrEqual(0);
      expect(zones.ordinaryEnd).toBeLessThanOrEqual(1);
      expect(zones.perfectEnd - zones.perfectStart).toBeCloseTo(cfg.perfect);
      expect(zones.ordinaryEnd - zones.ordinaryStart).toBeCloseTo(cfg.perfect + cfg.ordinary);
      expect(cookingQuality(difficulty, center, center)).toBe('perfect');
      expect(cookingQuality(difficulty, center, (zones.perfectEnd + zones.ordinaryEnd) / 2)).toBe('ordinary');
      expect(cookingQuality(difficulty, center, 0)).toBe('failed');
    }
    expect(COOKING_DIFFICULTY.easy.perfect).toBeGreaterThan(COOKING_DIFFICULTY.expert.perfect);
    expect(drawCookingCenter('normal', 0)).not.toBe(drawCookingCenter('normal', 1));
    expect(() => cookingQuality('normal', 0.5, 1.5)).toThrow();
  });

  it('keeps the eight recipe ingredient IDs in the actual shop catalog', () => {
    for (const recipe of COOKING_RECIPES) {
      expect(recipe.servings).toBeGreaterThan(0);
      for (const row of recipe.ingredients) {
        expect(getStoreItem(row.itemId)?.category).toBe('ingredient');
        expect(row.quantity).toBeGreaterThan(0);
        expect(getUseItemQuote({
          ...createInitialState(), inventory: [{ itemId: row.itemId, quantity: 1 }],
        }, row.itemId).blockedReason).toMatch(/烹饪食材/);
      }
    }
  });
});

describe('four-viewpoint deterministic cooking settlement', () => {
  it.each(PROTAGONISTS)('%s can use their home kitchen and keeps their own skill and dishes', owner => {
    const before = home(owner);
    const original = structuredClone(before);
    const quote = cookQuote(before, 'fried-egg');
    expect(quote.blockedReason).toBeNull();
    const center = drawCookingCenter('easy', 0.4);
    expect(canCheckInteractionEvent(before, { type: 'cook_dish', recipeId: 'fried-egg', dialCenter: center, needle: center })).toBe(false);
    const after = reduceState(before, { type: 'cook_dish', recipeId: 'fried-egg', dialCenter: center, needle: center });
    expect(activeProtagonist(after)).toBe(owner);
    expect(after.cooking?.experience[owner]).toBe(9);
    for (const other of PROTAGONISTS) if (other !== owner) expect(after.cooking?.experience[other]).toBe(0);
    expect(after.cooking?.dishes).toContainEqual(expect.objectContaining({
      owner, chef: owner, recipeId: 'fried-egg', quality: 'perfect', servings: 1,
    }));
    expect(after.clock.day * 1440 + after.clock.hour * 60 + after.clock.minute
      - (before.clock.day * 1440 + before.clock.hour * 60 + before.clock.minute)).toBe(10);
    expect(after.inventory.find(item => item.itemId === 'ingredient-egg')?.quantity).toBe(10);
    expect(after.journal.at(-1)?.text).toContain('完美品质');
    expect(cookingNarrativeContext(after).unreported).toHaveLength(1);
    expect(parseState(JSON.parse(JSON.stringify(after)))).toEqual(after);
    expect(before).toEqual(original);
  });

  it('produces separate failed and ordinary batches, consumes supplies exactly once', () => {
    let state = home('emma');
    const c = drawCookingCenter('normal', 0.41);
    state = reduceState(state, { type: 'cook_dish', recipeId: 'fried-rice', dialCenter: c, needle: 0 });
    expect(state.cooking!.dishes[0].quality).toBe('failed');
    const ordinary = cookingZones('normal', c);
    state = reduceState(state, { type: 'cook_dish', recipeId: 'fried-rice', dialCenter: c,
      needle: (ordinary.perfectEnd + ordinary.ordinaryEnd) / 2 });
    expect(state.cooking!.dishes.map(x => x.quality)).toEqual(['failed', 'ordinary']);
    expect(state.cooking!.experience.emma).toBe(9);
    expect(state.inventory.find(x => x.itemId === 'ingredient-rice')?.quantity).toBe(8);
    expect(state.inventory.find(x => x.itemId === 'ingredient-egg')?.quantity).toBe(10);
    expect(state.cooking!.dishes.every(dish => dish.servings === 2)).toBe(true);
  });

  it('eats a failed portion without converting its fixed quality or inventing a reward', () => {
    let state = home('emma');
    const center = drawCookingCenter('easy', 0.5);
    state = reduceState(state, { type: 'cook_dish', recipeId: 'fried-egg', dialCenter: center, needle: 0 });
    const id = state.cooking!.dishes[0].id;
    const old = structuredClone(state);
    expect(canCheckInteractionEvent(state, { type: 'eat_cooked', dishId: id })).toBe(false);
    state = reduceState(state, { type: 'eat_cooked', dishId: id });
    expect(state.cooking!.dishes.find(row => row.id === id)).toBeUndefined();
    expect(state.cooking!.experience.emma).toBe(3);
    expect(state.journal.at(-1)?.text).toContain('失败品质');
    expect(state.player.morale).toBeLessThanOrEqual(old.player.morale);
    expect(state.cooking!.pending.map(row => row.kind)).toEqual(['cooked', 'eaten']);
    expect(() => reduceState(state, { type: 'eat_cooked', dishId: id })).toThrow(/没有这份料理/);
  });

  it('rejects missing ingredients, out-of-room cooking, and arbitrary dial positions', () => {
    const before = home('emma');
    const noEgg = structuredClone(before);
    noEgg.inventory = noEgg.inventory.filter(row => row.itemId !== 'ingredient-egg');
    expect(cookQuote(noEgg, 'fried-egg').blockedReason).toMatch(/食材不足/);
    expect(() => reduceState(noEgg, { type: 'cook_dish', recipeId: 'fried-egg', dialCenter: 0.5, needle: 0.5 })).toThrow();
    expect(() => reduceState(before, { type: 'cook_dish', recipeId: 'fried-egg', dialCenter: -2, needle: 0 })).toThrow();
    const distant = structuredClone(before);
    distant.interior = null;
    distant.locationId = 'convenience';
    expect(cookQuote(distant, 'fried-egg').blockedReason).toMatch(/厨房/);
  });

  it('acknowledges only previously saved cooking events after a successful story turn', () => {
    const before = reduceState(home('emma'), { type: 'cook_dish', recipeId: 'fried-egg', dialCenter: 0.5, needle: 0.5 });
    expect(before.cooking!.pending).toHaveLength(1);
    const after = commitStoryTurn(before, '看着刚才做的煎蛋。',
      { text: '|旁白|平静|灶台旁还留着刚做完煎蛋的香气。|', phoneMessages: [], worldActions: [] },
      { userId: 'cooking-ack-user', assistantId: 'cooking-ack-story' });
    expect(after.cooking!.pending).toHaveLength(0);
    expect(after.cooking!.dishes[0].quality).toBe('perfect');
    expect(parseState(after)).toEqual(after);
    expect(before.cooking!.pending).toHaveLength(1);
  });

  it('keeps shared meal consumption unavailable without two portions and actual NPC consent', () => {
    let state = home('emma');
    const center = drawCookingCenter('easy', 0.5);
    state = reduceState(state, { type: 'cook_dish', recipeId: 'fried-egg', dialCenter: center, needle: center });
    const id = state.cooking!.dishes[0].id;
    expect(cookedDishQuote(state, id, 'majo-yuki').blockedReason).toBeTruthy();
    expect(() => validateStoryActions([{ type: 'share_meal', dishId: id, npcId: 'majo-yuki', consentQuote: '好。' }], state)).toThrow();
  });

  it('lets Yuki voluntarily share Emma\'s dish only after her exact on-scene acceptance', () => {
    let state = home('emma');
    state.clock = { day: state.clock.day, hour: 20, minute: 10 };
    if (state.protagonists?.backgroundLife) {
      const current = (state.clock.day - 1) * 1440 + state.clock.hour * 60 + state.clock.minute;
      state.protagonists.backgroundLife.cursor = current;
      for (const life of Object.values(state.protagonists.backgroundLife.people))
        life.nextDecisionAt = Math.max(current, life.nextDecisionAt);
    }
    state = parseState(state);
    state = reduceState(state, { type: 'cook_dish', recipeId: 'fried-rice', dialCenter: 0.5, needle: 0.5 });
    const dishId = state.cooking!.dishes[0].id;
    expect(cookedDishQuote(state, dishId, 'majo-yuki').blockedReason).toBeNull();
    const consent = '好呀，我们一起吃吧。';
    const action = { type: 'share_meal' as const, dishId, npcId: 'majo-yuki', consentQuote: consent };
    expect(() => commitStoryTurn(state, '邀请雪吃饭。',
      { text: '|月代雪|平静|我还不饿呢。|', phoneMessages: [], worldActions: [action] },
      { userId: 'cook-yuki-refuse-user', assistantId: 'cook-yuki-refuse-assistant' })).toThrow(/缺少/);
    const accepted = commitStoryTurn(state, '邀请雪吃饭。',
      { text: '|月代雪|开心|' + consent + '|', phoneMessages: [], worldActions: [action] },
      { userId: 'cook-yuki-accept-user', assistantId: 'cook-yuki-accept-assistant' });
    expect(accepted.cooking!.dishes).toHaveLength(0);
    expect(accepted.journal.at(-1)?.text).toContain('与月代雪共餐');
    expect(accepted.cooking!.pending).toHaveLength(0);
    expect(parseState(accepted)).toEqual(accepted);
    expect(state.cooking!.dishes[0].servings).toBe(2);
  });

  it('migrates legacy saves with no cooking state and rejects malformed saved batches', () => {
    const state = createInitialState();
    delete state.cooking;
    expect(parseState(state).cooking).toEqual(expect.objectContaining({ version: 1, serial: 0, dishes: [] }));
    const damaged = structuredClone(createInitialState());
    damaged.cooking!.dishes.push({ id: 'dish-2', owner: 'soyo', chef: 'soyo', recipeId: 'fried-egg',
      quality: 'perfect', servings: 1, at: 0 });
    expect(() => parseState(damaged)).toThrow(/烹饪状态/);
    expect(() => parseCookingState({ version: 1, serial: 0, experience: {}, dishes: [], pending: [] }, 0)).toThrow();
  });
});
