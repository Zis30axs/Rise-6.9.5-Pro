export const MARKET_VERSION = 1;
export const OPEN_MINUTE = 9 * 60;
export const CLOSE_MINUTE = 15 * 60 + 30;
const LUNCH_START = 11 * 60 + 30;
const LUNCH_END = 12 * 60 + 30;
const FIRST_SESSION_MINUTE = 9 * 60;

export const INSTRUMENTS = Object.freeze([
  { code:'6418', name:'神田电机', sector:'电子设备', short:'神', tone:'violet', price:1286, drift:.030, volume:2100 },
  { code:'9136', name:'湾岸物流', sector:'运输物流', short:'湾', tone:'blue', price:874, drift:-.013, volume:1650 },
  { code:'2874', name:'青叶食品', sector:'食品饮料', short:'青', tone:'mint', price:642, drift:.008, volume:1240 },
  { code:'4827', name:'月读传媒', sector:'媒体娱乐', short:'月', tone:'rose', price:1684, drift:.041, volume:2600 },
  { code:'7642', name:'高田商事', sector:'综合商社', short:'高', tone:'gold', price:1138, drift:-.025, volume:1450 },
  { code:'3516', name:'东池制药', sector:'医药健康', short:'东', tone:'blue', price:2142, drift:.016, volume:1100 },
  { code:'6953', name:'星野半导体', sector:'半导体', short:'星', tone:'violet', price:2935, drift:-.006, volume:2200 },
  { code:'T100', name:'东都精选 ETF', sector:'宽基指数', short:'东', tone:'mint', price:2234, drift:.011, volume:2850 },
].map(Object.freeze));

const dayOf = minute => Math.floor(minute / 1440);
const inDay = minute => ((minute % 1440) + 1440) % 1440;
const floorBar = minute => Math.floor(minute / 5) * 5;
const byCode = new Map(INSTRUMENTS.map(item => [item.code,item]));
const clone = value => JSON.parse(JSON.stringify(value));
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const clockOK = minute => integer(minute, 0, 525_599_999);
const quantityOK = value => integer(value, 1, 9999);
const priceOK = value => integer(value, 1, 1_000_000);
const activeOrder = order => order.status === 'open' || order.status === 'partial';
const levelKey = (code, side, index) => [code,side,index].join(':');
const bookKeyOK = key => {
  const [code,side,index,extra] = key.split(':');
  return byCode.has(code) && ['buy','sell'].includes(side) && /^[0-4]$/.test(index) && extra===undefined;
};
const emptyBook = minute => ({ at:floorBar(minute), used:{} });
const reject = message => { throw new Error(message); };

export function marketSession(minute) {
  const weekday = ((dayOf(minute) + 4) % 7 + 7) % 7;
  const time = inDay(minute);
  if (weekday === 0 || weekday === 6) return 'weekend';
  if (time < OPEN_MINUTE) return 'preopen';
  if (time < LUNCH_START || (time >= LUNCH_END && time < CLOSE_MINUTE)) return 'open';
  return time < LUNCH_END ? 'break' : 'closed';
}

export function fitsMarketSession(start, duration) {
  if (!clockOK(start) || !integer(duration,1,1440) || marketSession(start)!=='open') return false;
  const offset=inDay(start);
  return offset+duration <= (offset<LUNCH_START?LUNCH_START:CLOSE_MINUTE);
}

export function nextOpenMinute(minute) {
  let next = Math.floor(minute) + 1;
  while (marketSession(next) !== 'open') {
    const time = inDay(next);
    if (marketSession(next) === 'break') next += LUNCH_END - time;
    else if (marketSession(next) === 'preopen') next += OPEN_MINUTE - time;
    else next += 1440 - time + OPEN_MINUTE;
  }
  return next;
}

function noise(value, salt) {
  let hash = Math.imul(value ^ (salt * 733), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}

function priorSessionBar(minute) {
  let bar = floorBar(minute);
  while (marketSession(bar) !== 'open') {
    const time = inDay(bar);
    if (marketSession(bar) === 'break') bar += LUNCH_START - 5 - time;
    else if (marketSession(bar) === 'closed') bar += CLOSE_MINUTE - 5 - time;
    else bar -= time + 515;
  }
  return bar;
}

function closingPrice(item, bar) {
  const day = dayOf(bar);
  const time = inDay(bar);
  const phase = (time - OPEN_MINUTE - (time >= LUNCH_END ? LUNCH_END-LUNCH_START : 0)) / 330;
  const salt = Number(item.code.replace('T','9'));
  const cycle = Math.sin(day * .28) * .042 + Math.sin(day * .79) * .017;
  const curve = Math.sin(phase * 17 - 1.1) * .011 + Math.sin(phase * 51 + salt) * .0045;
  const bias = item.drift * (.62 + phase * .86);
  const scenario = item.code === '6418' && day >= 0 ? .032 * Math.exp(-day / 9) : 0;
  const change = cycle + curve + bias + scenario + (noise(bar,salt)-.5)*.012;
  return Math.max(5, Math.round(item.price * (1 + change)));
}

function candle(item, at) {
  const salt = Number(item.code.replace('T','9'));
  const close = closingPrice(item, at);
  const previous = closingPrice(item, priorSessionBar(at - 5));
  const open = inDay(at) === OPEN_MINUTE ? Math.round((previous + close*3)/4) : previous;
  const wick = Math.max(2, Math.round(item.price * .006));
  const high = Math.max(open,close) + 1 + Math.floor(noise(at,salt+9)*wick);
  const low = Math.max(1, Math.min(open,close) - 1 - Math.floor(noise(at,salt+17)*wick));
  const volume = Math.round(item.volume * (.2 + noise(at,salt+44)*.9) + Math.abs(close-open)*31);
  return { at, open, high, low, close, volume };
}

export function chartBars(code, minute, interval = 5, limit = 62) {
  const item = byCode.get(code);
  if (!item || ![5,15,30,1440].includes(interval) || !integer(limit,1,180)) return [];
  const bars = [];
  let at = priorSessionBar(minute);
  while (bars.length < limit) {
    const offset = inDay(at);
    const start = interval === 1440 ? at - offset + OPEN_MINUTE
      : at - ((offset - (offset >= LUNCH_END ? LUNCH_END : OPEN_MINUTE)) % interval);
    const constituents = [candle(item,at)];
    at = priorSessionBar(at-5);
    while (at >= start) {
      constituents.push(candle(item,at));
      at = priorSessionBar(at-5);
    }
    bars.push({
      at:start, open:constituents.at(-1).open, close:constituents[0].close,
      high:Math.max(...constituents.map(bar=>bar.high)), low:Math.min(...constituents.map(bar=>bar.low)),
      volume:constituents.reduce((sum,bar)=>sum+bar.volume,0),
    });
  }
  return bars.reverse();
}

export function quote(code, minute) {
  const item = byCode.get(code);
  if (!item) return null;
  const [previous, current] = chartBars(code,minute,1440,2);
  return { ...current, code, previous:previous.close, change:current.close-previous.close,
    pct:(current.close/previous.close-1)*100 };
}

export function bookLevels(state, code, side) {
  const item = byCode.get(code);
  if (!item || !['buy','sell'].includes(side) || marketSession(state.minute) !== 'open') return [];
  const at = floorBar(state.minute);
  const last = closingPrice(item,at);
  const spread = last >= 2000 ? 2 : 1;
  return Array.from({length:5},(_,index)=>{
    const salt = item.price + 31*index + (side==='buy'?13:59);
    const capacity = Math.floor((.24 + noise(at,salt)) * 240 + index*60);
    const key = levelKey(code,side,index);
    const used = state.book.at === at ? (state.book.used[key] ?? 0) : 0;
    return { key, price:Math.max(1,last+(side==='buy'?1:-1)*(spread+index)), quantity:Math.max(0,capacity-used) };
  });
}

export function commission(gross) {
  return gross > 0 ? Math.max(1, Math.ceil(gross*8/10000)) : 0;
}

export function accountSummary(state) {
  const reservations = Object.create(null);
  let frozenCash = 0;
  for (const order of state.orders.filter(activeOrder)) {
    const remaining = order.quantity - order.filled;
    if (order.side === 'sell') {
      reservations[order.code] = (reservations[order.code] ?? 0) + remaining;
      continue;
    }
    const gross = remaining * order.limit;
    frozenCash += gross + commission(order.gross + gross) - order.fee;
  }
  const positions = INSTRUMENTS.flatMap(item=>{
    const holding = state.positions[item.code];
    if (!holding?.quantity) return [];
    const last = quote(item.code,state.minute).close;
    const value = last * holding.quantity;
    return [{ ...holding, code:item.code, last, value, costPerShare:holding.cost/holding.quantity,
      profit:value-holding.cost, available:holding.quantity-(reservations[item.code]??0) }];
  });
  const marketValue = positions.reduce((sum,position)=>sum+position.value,0);
  const unrealized = positions.reduce((sum,position)=>sum+position.profit,0);
  return { cash:state.cash, availableCash:state.cash-frozenCash, frozenCash, marketValue, unrealized,
    equity:state.cash+marketValue, realized:state.realized, positions };
}

export function createTradingState({ minute=FIRST_SESSION_MINUTE }={}) {
  if (!clockOK(minute)) reject('账户初始时间无效');
  return { version:MARKET_VERSION, revision:0, minute, cash:0, realized:0,
    nextId:1, positions:{}, orders:[], fills:[], book:emptyBook(minute), receipts:[] };
}

function isStoredOrder(order) {
  return order && typeof order.id==='string' && /^UC\d{6,}$/.test(order.id) && byCode.has(order.code)
    && ['buy','sell'].includes(order.side) && ['market','limit'].includes(order.kind) && quantityOK(order.quantity)
    && integer(order.filled,0,order.quantity) && integer(order.gross,0,1e10) && order.fee===commission(order.gross)
    && (order.kind==='limit'?priceOK(order.limit):order.limit===null) && clockOK(order.created)
    && ['open','partial','filled','cancelled','expired'].includes(order.status)
    && (order.status==='filled'?order.filled===order.quantity:order.filled<order.quantity)
    && (order.status!=='open'||order.filled===0)
    && (order.status!=='partial'||order.filled>0)
    && (!activeOrder(order)||order.kind==='limit');
}

function isStoredFill(fill) {
  return fill && typeof fill.id==='string' && typeof fill.orderId==='string' && byCode.has(fill.code)
    && ['buy','sell'].includes(fill.side) && priceOK(fill.price) && quantityOK(fill.quantity)
    && clockOK(fill.at) && integer(fill.fee,0,1e10) && integer(fill.realized,-1e12,1e12);
}

function validPositions(positions) {
  return positions && typeof positions==='object' && !Array.isArray(positions)
    && Object.entries(positions).every(([key,p])=>byCode.has(key)&&p
      && integer(p.quantity,1,1e9)&&integer(p.cost,1,1e12));
}

export function restoreTradingState(raw) {
  if (!raw || raw.version!==MARKET_VERSION || !clockOK(raw.minute) || !integer(raw.cash,0,1e12)
    || !integer(raw.revision,0,1e9) || !integer(raw.nextId,1,1e9) || !integer(raw.realized,-1e12,1e12)
    || !validPositions(raw.positions) || !Array.isArray(raw.orders) || raw.orders.length>MAX_OPEN_ORDERS+300 || !raw.orders.every(isStoredOrder)
    || !Array.isArray(raw.fills) || raw.fills.length>600 || !raw.fills.every(isStoredFill)
    || !Array.isArray(raw.receipts) || raw.receipts.length>120 || !raw.receipts.every(item=>item && typeof item.id==='string' && typeof item.signature==='string')
    || !raw.book || raw.book.at!==floorBar(raw.minute) || !raw.book.used || typeof raw.book.used!=='object'
    || Array.isArray(raw.book.used) || !Object.entries(raw.book.used).every(([key,n])=>bookKeyOK(key)&&integer(n,0,1000))) {
    reject('交易存档无效');
  }
  const ids = raw.orders.map(order=>order.id);
  if (new Set(ids).size!==ids.length || ids.some(id=>Number(id.slice(2))>=raw.nextId)) reject('委托编号无效');
  const summary = accountSummary(raw);
  if (summary.availableCash<0 || raw.orders.some(order=>activeOrder(order) && order.side==='sell' && !raw.positions[order.code])
    || summary.positions.some(position=>position.available<0)) reject('交易存档的冻结资产无效');
  return clone(raw);
}

const MAX_OPEN_ORDERS = 100;

function prune(state) {
  const closed = state.orders.filter(order=>!activeOrder(order)).slice(-300);
  const kept = new Set(closed.map(order=>order.id));
  state.orders = state.orders.filter(order=>activeOrder(order)||kept.has(order.id));
  state.fills = state.fills.slice(-600);
  state.receipts = state.receipts.slice(-120);
}

function recordFill(state, order, level, quantity) {
  const gross = level.price * quantity;
  const fee = commission(order.gross + gross) - order.fee;
  let realized = 0;
  if (order.side==='buy') {
    const position = state.positions[order.code] ?? {quantity:0,cost:0};
    state.positions[order.code] = { quantity:position.quantity+quantity, cost:position.cost+gross+fee };
    state.cash -= gross+fee;
  } else {
    const position = state.positions[order.code];
    const cost = Math.round(position.cost*quantity/position.quantity);
    const left = position.quantity-quantity;
    if (left) state.positions[order.code] = {quantity:left,cost:position.cost-cost};
    else delete state.positions[order.code];
    realized = gross-fee-cost;
    state.cash += gross-fee;
    state.realized += realized;
  }
  order.filled += quantity;
  order.gross += gross;
  order.fee += fee;
  state.book.used[level.key] = (state.book.used[level.key]??0)+quantity;
  state.fills.push({ id:order.id+'-'+order.filled, orderId:order.id, at:state.minute,
    code:order.code, side:order.side, quantity, price:level.price, fee, realized });
}

function crosses(order, price) {
  return order.kind==='market'||(order.side==='buy'?price<=order.limit:price>=order.limit);
}

function match(state, order) {
  for (const level of bookLevels(state,order.code,order.side)) {
    const count = Math.min(level.quantity,order.quantity-order.filled);
    if (count>0 && crosses(order,level.price)) recordFill(state,order,level,count);
  }
  if (order.filled===order.quantity) order.status='filled';
  else if (order.kind==='market') order.status='cancelled';
  else order.status=order.filled?'partial':'open';
}

function matchResting(state) {
  const orders = state.orders.filter(activeOrder).sort((a,b)=>{
    if (a.code===b.code&&a.side===b.side&&a.limit!==b.limit) return a.side==='buy'?b.limit-a.limit:a.limit-b.limit;
    if (a.code!==b.code) return a.code.localeCompare(b.code);
    if (a.side!==b.side) return a.side.localeCompare(b.side);
    return Number(a.id.slice(2))-Number(b.id.slice(2));
  });
  for (const order of orders) match(state,order);
}

function moveClock(state, target, allowMatching=true) {
  if (!clockOK(target) || target<state.minute) reject('交易时钟无效');
  const deadline = dayOf(state.minute)*1440+CLOSE_MINUTE;
  for (let at=state.book.at+5; allowMatching && at<=target && at<deadline && state.orders.some(activeOrder); at+=5) {
    if (marketSession(at)!=='open') continue;
    state.minute=at;
    state.book=emptyBook(at);
    matchResting(state);
  }
  if (target>=deadline) {
    for (const order of state.orders.filter(activeOrder)) order.status='expired';
  }
  state.minute=target;
  if (state.book.at!==floorBar(target)) state.book=emptyBook(target);
}

export function advanceTradingState(previous, target, allowMatching=true) {
  if (target===previous.minute) return previous;
  const state=clone(previous);
  moveClock(state,target,allowMatching);
  state.revision+=1;
  prune(state);
  return state;
}

export function estimateOrder(state, request) {
  const {code,side,kind,quantity,limit}=request;
  if (!byCode.has(code) || !['buy','sell'].includes(side) || !['market','limit'].includes(kind)
    || !quantityOK(quantity) || (kind==='limit'&&!priceOK(limit))) return null;
  if (kind==='limit') {
    const gross = limit*quantity;
    return {quantity,gross,fee:commission(gross),total:gross+(side==='buy'?1:-1)*commission(gross)};
  }
  let left=quantity;
  let gross=0;
  for (const level of bookLevels(state,code,side)) {
    const take=Math.min(left,level.quantity);
    left-=take;
    gross+=take*level.price;
  }
  const fee=commission(gross);
  return {quantity:quantity-left,gross,fee,total:gross+(side==='buy'?fee:-fee)};
}

export function maxOrderQuantity(state, request) {
  const summary=accountSummary(state);
  if (request.side==='sell') return Math.min(9999,summary.positions.find(p=>p.code===request.code)?.available??0);
  let low=0;
  let high=request.kind==='market'?Math.min(9999,bookLevels(state,request.code,'buy').reduce((sum,level)=>sum+level.quantity,0)):9999;
  while (low<high) {
    const middle=Math.ceil((low+high)/2);
    const estimate=estimateOrder(state,{...request,quantity:middle});
    if (estimate&&estimate.total<=summary.availableCash) low=middle;
    else high=middle-1;
  }
  return low;
}

export function applyTradeAction(previous, action, minute=previous.minute) {
  if (!action || !['submit','cancel'].includes(action.type)
    || typeof action.requestId!=='string'||!/^[A-Za-z0-9][\w:.-]{0,79}$/.test(action.requestId)) reject('交易请求无效');
  const signature=JSON.stringify(action.type==='cancel'
    ? [action.type,action.orderId] : [action.type,action.code,action.side,action.kind,action.quantity,action.kind==='limit'?action.limit:null]);
  const receipt=previous.receipts.find(item=>item.id===action.requestId);
  if (receipt) {
    if (receipt.signature!==signature) reject('交易请求编号重复');
    return previous;
  }
  const state=clone(previous);
  moveClock(state,minute);
  if (action.type==='cancel') {
    const order=state.orders.find(item=>item.id===action.orderId);
    if (!order||!activeOrder(order)) reject('这笔委托已结束');
    order.status='cancelled';
  } else {
    if (marketSession(state.minute)!=='open') reject('当前休市，暂不可下单');
    const estimate=estimateOrder(state,action);
    if (!estimate) reject('请检查股票、数量和委托价格');
    if (estimate.quantity===0) reject('盘口暂无可成交数量');
    const summary=accountSummary(state);
    if (action.side==='buy'&&estimate.total>summary.availableCash) reject('可用资金不足');
    if (action.side==='sell'&&action.quantity>(summary.positions.find(p=>p.code===action.code)?.available??0)) reject('可用股数不足');
    if (state.orders.filter(activeOrder).length>=MAX_OPEN_ORDERS) reject('未完成委托已满');
    const id='UC'+String(state.nextId++).padStart(6,'0');
    const order={id,code:action.code,side:action.side,kind:action.kind,quantity:action.quantity,
      limit:action.kind==='limit'?action.limit:null,filled:0,gross:0,fee:0,created:state.minute,status:'open'};
    state.orders.push(order);
    matchResting(state);
    if (order.kind==='market') match(state,order);
  }
  state.receipts.push({id:action.requestId,signature});
  state.revision+=1;
  prune(state);
  return state;
}
