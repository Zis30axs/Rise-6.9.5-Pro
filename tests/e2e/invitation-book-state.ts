import { createInitialState, parseState, reduceState } from '../../src/runtime/model';
import { enableProtagonists } from '../../src/runtime/protagonist-world';

export function invitationBookFixtureState() {
const seed = createInitialState();
seed.clock = { day: 2, hour: 17, minute: 0 };
let state = parseState(enableProtagonists(seed));
state = reduceState(state, { type: 'choose_academics', majorId: 'computer-science' });
state.protagonists!.socialInvitations = [
  { id: 'tea', owner: 'soyo', targetId: 'sakiko', targetName: '丰川祥子', source: 'meeting', locationId: 'cafe', day: 2, time: '18:30', message: '今天傍晚有空吗？想和你去街角喝杯茶。上次想说的话，还没有说完。', status: 'accepted', createdAt: 2400, messageId: null, response: '六点半吧。我会过去的。' },
  { id: 'walk', owner: 'soyo', targetId: 'anon', targetName: '千早爱音', source: 'meeting', locationId: 'pocket-park', day: 3, time: '16:00', message: '明天下午一起出去走走吧。', status: 'accepted', createdAt: 2400, messageId: null, response: '好呀！记得等我哦。' },
  { id: 'wait', owner: 'soyo', targetId: 'mutsumi', targetName: '若叶睦', source: 'meeting', locationId: 'cafe', day: 3, time: '15:00', message: '明天要一起喝茶吗？', status: 'pending', createdAt: 2400, messageId: null, response: null },
  { id: 'past', owner: 'soyo', targetId: 'sakiko', targetName: '丰川祥子', source: 'meeting', locationId: 'cafe', day: 1, time: '17:00', message: '放学后一起坐一会儿？', status: 'declined', createdAt: 900, messageId: null, response: '抱歉，今天还有安排。' },
];
return parseState(state);
}
