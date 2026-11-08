import type { createWorldPhoneApi } from '../../src/frontend/world-phone';
type PhoneView = ReturnType<ReturnType<typeof createWorldPhoneApi>['read']>;
interface PeekLine { id:string; from:string; text:string; at:number }
interface PeekChat { id:string; with:string; when:string; unread:number; lines:PeekLine[] }
interface PeekSnapshot { name:string; owner:string; canonical:true; at:number; chats:PeekChat[] }
export function protagonistPeekSnapshot(data:PhoneView):PeekSnapshot;
export function visiblePeekSnapshot(snapshot:unknown,world:PhoneView,name?:string):unknown;
