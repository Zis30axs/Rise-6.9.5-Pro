import { createDemoHost } from '../../src/frontend/demo';
import { mountShell } from '../../src/frontend/lifecycle';
import { createInitialState, reduceState } from '../../src/runtime/model';
import { enableProtagonists } from '../../src/runtime/protagonist-world';
import { cookingDishId } from '../../src/runtime/cooking-catalog';

localStorage.setItem('unread-city.presentation-mode.v1', 'novel');
const start = createInitialState();
start.clock = { day: 4, hour: 12, minute: 0 };
start.inventory.push({ itemId: cookingDishId('egg-fried-rice', 'normal'), quantity: 2 });
const student = reduceState(enableProtagonists(start), { type: 'choose_academics', majorId: 'music' });
const bridge = createDemoHost().createBridge();
bridge.save(reduceState(student, { type: 'novel_travel', locationId: 'commercial' }));
mountShell(window, window, bridge, () => {});
Object.assign(window, { readMealState: () => bridge.load() });
