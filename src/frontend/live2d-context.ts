import type { InjectionKey } from 'vue';
import type { WorldState } from './types';
export const live2dContext: InjectionKey<() => {session:string|undefined;state:WorldState;enabled:boolean}> = Symbol('live2d-context');
