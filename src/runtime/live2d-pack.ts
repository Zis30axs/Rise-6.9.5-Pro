/** The bootstrap exposes data access, never a source-repository plugin. */
export const live2dPeople = ['soyo','anon','tomori','raana','taki','sakiko','mutsumi','uika','umiri','nyamu'] as const;
export type Live2dPerson = typeof live2dPeople[number];
export interface Live2dOutfit {
  id: string; person: Live2dPerson; label: string; description: string; tags: string[];
  definitionSha: string | null; bundledSoyo: boolean;
}
export interface Live2dPackStatus { installed: boolean; enabled: boolean; generation: number; pack: string; models: Live2dOutfit[] }
export interface Live2dPackApi {
  status(): Live2dPackStatus;
  subscribe(listener: () => void): () => void;
  getAsset(sha: string): Promise<Blob>;
}
export function live2dPack(): Live2dPackApi | undefined {
  return (globalThis as typeof globalThis & {__UC_LIVE2D__?: Live2dPackApi}).__UC_LIVE2D__;
}
