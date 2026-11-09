import { isAnonSpeaker } from '../frontend/anon-art-policy';
import { isMutsumiSpeaker } from '../frontend/mutsumi-art-policy';
import { isRaanaSpeaker } from '../frontend/raana-art-policy';
import { isTakiSpeaker } from '../frontend/taki-art-policy';
import { isTomoriSpeaker } from '../frontend/tomori-art-policy';
import { isSakikoSpeaker } from '../frontend/sakiko-art-policy';
import type { Live2dPerson } from './live2d-pack';

export const live2dNames: Record<Live2dPerson,string> = {soyo:'长崎素世',anon:'千早爱音',tomori:'高松灯',raana:'要乐奈',taki:'椎名立希',sakiko:'丰川祥子',mutsumi:'若叶睦',uika:'三角初华',umiri:'八幡海铃',nyamu:'祐天寺若麦'};
const aliases: Partial<Record<Live2dPerson,readonly string[]>> = {
  soyo:['soyo','长崎素世','素世','protagonist-soyo'],
  sakiko:['protagonist-sakiko'], raana:['bang-rana','bang-raana','rana','raana'],
  uika:['uika','misumi uika','uika misumi','misumi-uika','bang-uika','三角初华','初华','doloris'],
  umiri:['umiri','yahata umiri','umiri yahata','yahata-umiri','bang-umiri','八幡海铃','海铃','timoris'],
  nyamu:['nyamu','yutenji nyamu','nyamu yutenji','yutenji-nyamu','bang-nyamu','祐天寺若麦','若麦','喵梦','amoris'],
};
/** No substring matches; narration/empty names never identify a person. */
export function live2dIdentity(value: string): Live2dPerson | null {
  const text = value.trim().toLowerCase();
  if (!text || text === '旁白') return null;
  for (const [person, names] of Object.entries(aliases)) if (names.includes(text)) return person as Live2dPerson;
  const policies = {anon:isAnonSpeaker,mutsumi:isMutsumiSpeaker,raana:isRaanaSpeaker,taki:isTakiSpeaker,tomori:isTomoriSpeaker,sakiko:isSakikoSpeaker};
  for (const [person, matches] of Object.entries(policies)) if (matches(text)) return person as Live2dPerson;
  return null;
}
