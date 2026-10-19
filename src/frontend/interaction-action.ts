import type { ShellActions, ShellModel, WorldAction } from './types';

/** A true result means the complete interaction, including an accepted event, was saved. */
export async function runInteraction(model: ShellModel, actions: ShellActions, action: WorldAction): Promise<boolean> {
  if (model.busy) return false;
  if (actions.interact) return actions.interact(action);
  // Component fixtures and older hosts can still use the ordinary synchronous action path.
  actions.dispatch(action);
  return !model.notice;
}
