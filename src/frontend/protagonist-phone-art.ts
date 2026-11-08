/**
 * Protagonist phone poses, shown while the phone window is open instead of the
 * muted standing portrait. Presentation-only art selection; a protagonist
 * without an authored pose stays absent rather than borrowing another identity.
 */
import soyoPhone from '../../assets/protagonist-phone/soyo-phone.webp?inline';
import sakikoCasualPhone from '../../assets/downtown-art/characters/sakiko/uniform/thinking.webp?inline';
import sakikoHomePhone from '../../assets/downtown-art/characters/sakiko/indoor/thinking.webp?inline';
import emmaPhone from '../../assets/protagonist-phone/emma-phone.webp?inline';
import renakoPhone from '../../assets/protagonist-phone/renako-phone.webp?inline';
import { resolveSakikoOutfit, type SakikoOutfit } from './sakiko-art-policy';
import type { ProtagonistId } from '../runtime/dual-protagonists';

export interface ProtagonistPhonePose {
  readonly protagonist: ProtagonistId;
  /** Only Sakiko has outfit variants; the others wear their default look. */
  readonly outfit: SakikoOutfit | null;
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

const soyo: ProtagonistPhonePose = Object.freeze({ protagonist: 'soyo', outfit: null, src: soyoPhone, width: 1023, height: 1537 });
const emma: ProtagonistPhonePose = Object.freeze({ protagonist: 'emma', outfit: null, src: emmaPhone, width: 1024, height: 1536 });
const renako: ProtagonistPhonePose = Object.freeze({ protagonist: 'renako', outfit: null, src: renakoPhone, width: 1024, height: 1536 });

const poses: Partial<Record<ProtagonistId, (outfit: SakikoOutfit) => ProtagonistPhonePose>> = Object.freeze({
  soyo: () => soyo,
  sakiko: outfit => outfit === 'home'
    ? { protagonist: 'sakiko', outfit, src: sakikoHomePhone, width: 768, height: 1344 }
    : { protagonist: 'sakiko', outfit, src: sakikoCasualPhone, width: 768, height: 1344 },
  emma: () => emma,
  renako: () => renako,
});

/** Same outfit policy as the standing Sakiko sprite: explicit choice, then Toyokawa interiors. */
export function resolveProtagonistPhonePose(protagonist: ProtagonistId, options: {
  locationId?: unknown; outfit?: unknown;
} = {}): ProtagonistPhonePose | null {
  const pose = poses[protagonist];
  if (!pose) return null;
  if (protagonist === 'sakiko') return pose(resolveSakikoOutfit(options.outfit, options.locationId));
  return pose('casual');
}

/** Protagonists without an authored pose keep their standing portrait when the phone opens. */
export function hasProtagonistPhonePose(protagonist: ProtagonistId): boolean {
  return !!poses[protagonist];
}
