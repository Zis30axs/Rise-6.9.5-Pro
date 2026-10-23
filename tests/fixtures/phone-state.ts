import { createInitialState as createProductionInitialState } from '../../src/runtime/model';
import { legacyCharacterProfile } from '../../src/runtime/characters';

/** Explicit test-only contacts: none of these belong to a new game. */
export function createInitialState() {
  const state = createProductionInitialState();
  state.contacts = [
    { id: 'lin', name: '林同学', tag: '测试联系人', summary: '用于测试手机消息与人物档案。', affinity: 12, status: '图书馆', ...legacyCharacterProfile('lin') },
    { id: 'zhou', name: '周同学', tag: '测试联系人', summary: '用于测试日程与短信。', affinity: 5, status: '社团活动', ...legacyCharacterProfile('zhou') },
  ];
  state.phone = [
    { id: 'phone-lin', npcId: 'lin', text: '图书馆见。', read: false, at: '第 1 天 17:12' },
    { id: 'phone-zhou', npcId: 'zhou', text: '晚点在咖啡店见。', read: false, at: '第 1 天 17:16' },
  ];
  state.schedule = [
    { id: 'library-notes', title: '去图书馆整理笔记', locationId: 'library', time: '17:30', done: false },
    { id: 'club-meet', title: '社团见面', locationId: 'cafe', time: '18:00', done: false },
  ];
  return state;
}
