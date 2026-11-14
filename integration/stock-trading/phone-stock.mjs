import { mountTradingTerminal } from './terminal.mjs';
import styles from './terminal.css?raw';

export function stockPhoneView(ctx, view) {
  const api = () => ctx.win.parent.__unreadCityWorldPhone;
  const host = ctx.doc.createElement('div');
  let terminal;
  view.root.style.padding = '0';
  view.root.append(host);

  const dispatch = async (envelope, requestId, command) => {
    const bridge = api();
    const current = bridge.stock();
    if (current.binding !== envelope.binding) throw Error('主角或聊天已切换');
    await bridge.act({ binding: current.binding, revision: current.phoneRevision, owner: current.owner, requestId, command });
    return bridge.stock();
  };
  const adapter = {
    read: () => api().stock(),
    dispatch: ({action, ...envelope}) => {
      const {requestId, ...trade}=action;
      return dispatch(envelope,requestId,{type:'stock_trade',trade,minute:envelope.minute,revision:envelope.revision});
    },
    funds: ({requestId,binding,...fields}) => dispatch({binding},requestId,{type:'stock_funds',...fields}),
    schedule: ({requestId,binding,code,date,time,duration}) =>
      api().scheduleStock({requestId,binding,code,date,time,duration}),
    subscribe: listener => api().subscribe(() => {
      if (ctx.visible?.('worldstock') !== false) listener();
    }),
  };
  view.refresh = () => {
    if (terminal) { terminal.refresh(); return; }
    try { terminal = mountTradingTerminal(host,{adapter,styles}); }
    catch (error) { host.textContent = error.message; }
  };
  view.selectSymbol = code => { view.refresh(); terminal?.selectSymbol(code); };
  view.leave = () => { terminal?.destroy(); terminal=undefined; };
  const dispose=view.dispose.bind(view);
  view.dispose=()=>{ view.leave(); dispose(); };
  view.refresh();
  return view;
}
