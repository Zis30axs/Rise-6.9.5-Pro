import { expect, type Page } from '@playwright/test';
import { createInitialState } from '../../src/runtime/model';
import type { WorldState } from '../../src/frontend/types';

/** Existing-character fixtures start with an explicitly authored selection.
 * Keep the original journal so unrelated route seeds and count assertions stay valid.
 */
export function createSelectedInitialState(): WorldState {
  const state = createInitialState();
  state.academics = {
    majorId: 'computer-science',
    subjects: [
      { subjectId: 'cs-programming', points: 0 },
      { subjectId: 'cs-algorithms', points: 0 },
      { subjectId: 'cs-networks', points: 0 },
    ],
    lastGain: null,
  };
  return state;
}

/** New demo chats and migrated saves must use the real confirmation flow. */
export async function completeAcademicSetup(page: Page): Promise<void> {
  await expect(page.locator('.uc-shell')).toBeVisible();
  const setup = page.locator('[data-academic-setup]');
  if (await setup.count() === 0) return;
  await expect(setup).toBeVisible();
  await setup.locator('[data-academic-major="computer-science"]').click();
  await setup.locator('[data-academic-confirm]').click();
  await expect(setup).toHaveCount(0);
}
