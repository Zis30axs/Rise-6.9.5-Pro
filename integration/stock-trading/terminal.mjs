import { INSTRUMENTS, fitsMarketSession, quote, chartBars, accountSummary, bookLevels, estimateOrder, maxOrderQuantity, marketSession, nextOpenMinute } from '../../src/runtime/stock-market/market.mjs';

import { GAME_START_DATE } from '../../src/runtime/game-calendar.ts';

const MARKET_EPOCH = Date.parse(GAME_START_DATE+'T00:00:00Z');
const symbols = {
  search:'<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/>',
  arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
  up:'<path d="m6 15 5-5 3 3 4-5m-4 0h4v4"/>',
  down:'<path d="m6 9 5 5 3-3 4 5m-4 0h4v-4"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  orders:'<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6m-6 4h6m-6 4h4"/>',
  layers:'<path d="m12 4 8 4-8 4-8-4 8-4Zm-8 8 8 4 8-4m-16 4 8 4 8-4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  book:'<path d="M4 6h16M4 11h16M4 16h16m-11-8v8m6-8v8"/>',
};

const icon = name => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+symbols[name]+'</svg>';
const esc = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const numbers = new Intl.NumberFormat('zh-CN',{maximumFractionDigits:0});
const decimal = new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const num = value => numbers.format(value);
const fixed = value => decimal.format(value);
const yen = value => '¥'+num(value);
const sign = value => value>0?'+':value<0?'−':'';
const signedYen = value => sign(value)+yen(Math.abs(value));
const signedPct = value => sign(value)+Math.abs(value).toFixed(2)+'%';
const changeClass = value => value>0?'gain':value<0?'loss':'neutral';
const compact = value => value>=10000?(value/10000).toFixed(value>=100000?0:1)+'万':num(value);
const names = Object.fromEntries(INSTRUMENTS.map(item=>[item.code,item]));
const sessionLabels = {open:'交易中',break:'午间休市',closed:'已收盘',preopen:'待开盘',weekend:'周末休市'};
const statusLabels = {open:'待成交',partial:'部分成交',filled:'已成交',cancelled:'已撤销',expired:'已过期'};
const pad = value => String(value).padStart(2,'0');
const formatTime = minute => pad(Math.floor((minute%1440+1440)%1440/60))+':'+pad((minute%60+60)%60);
const formatDate = (minute,year=false) => {
  const date=new Date(MARKET_EPOCH+Math.floor(minute/1440)*86400000);
  return (year?date.getUTCFullYear()+'/':'')+pad(date.getUTCMonth()+1)+'/'+pad(date.getUTCDate());
};
const timeStamp = minute => formatDate(minute)+' '+formatTime(minute);

const groups = [
  { name:'东都综合指数', code:'TMI', base:3184, members:['T100','6418','7642','3516','2874'] },
  { name:'成长市场指数', code:'TGI', base:1652, members:['4827','6953','6418'] },
  { name:'湾岸运输指数', code:'BTI', base:2067, members:['9136','7642'] },
  { name:'防御板块指数', code:'TDI', base:1246, members:['2874','3516','T100'] },
];

function summaryCards(state) {
  return groups.map(({name,code,base,members})=>{
    const series=members.map(item=>chartBars(item,state.minute,5,32));
    const indexValue=prices=>base*prices.reduce((sum,price,i)=>sum+price/names[members[i]].price,0)/members.length;
    const values=series[0].map((_,i)=>indexValue(series.map(bars=>bars[i].close)));
    const previous=indexValue(members.map(item=>quote(item,state.minute).previous));
    const pct=(values.at(-1)/previous-1)*100;
    const min=Math.min(...values),max=Math.max(...values);
    const points=values.map((value,i)=>[i*102/(values.length-1),26-(value-min)/(max-min||1)*22]);
    const line=points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
    return `<article class="index-card"><div class="index-label"><span>${name}</span><span class="ticker-code">${code}</span></div>
      <div class="index-value"><strong>${fixed(values.at(-1))}</strong><span class="${changeClass(pct)}">${signedPct(pct)}</span></div>
      <svg class="spark ${changeClass(pct)}" viewBox="0 0 102 32" aria-hidden="true"><path d="${line}L102 32H0Z" fill="currentColor" opacity=".10"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
    </article>`;
  }).join('');
}

function markup() {
  return `<div class="terminal">
    <main class="main">
      <div class="heading">
        <div><div class="eyebrow"><span></span> 东京市场</div><h1>东都证券</h1></div>
        <div class="market-clock"><div id="session" class="session"></div><span class="clock-time" id="clock"></span>
        </div>
      </div>
      <section id="indices" class="indices" aria-label="市场指数"></section>
      <div class="market-links"><button data-action="jump-trade">交易下单</button><button data-action="jump-assets">账户</button><button data-action="schedule">安排行情回顾</button></div>
      <div class="workspace">
        <section class="panel watch" aria-labelledby="watch-title">
          <div class="watch-head"><h2 id="watch-title">自选列表</h2><span class="count" id="watch-count"></span></div>
          <label class="search">${icon('search')}<input id="search" type="search" placeholder="搜索名称或代码" aria-label="搜索名称或代码"></label>
          <div class="watch-columns"><span>证券</span><span>最新 / 涨跌幅</span></div><div id="watch-list"></div>
          <div class="watch-foot"><span class="venue-mark"></span><span>东都交易所</span><span class="mono">JPY</span></div>
        </section>
        <section class="panel chart-panel" id="market-panel" aria-label="证券行情">
          <div class="symbol-row" id="symbol-row"></div>
          <div class="quote-row" id="quote-row"></div>
          <div class="chart-tools"><div class="intervals" aria-label="K线周期">
            <button data-interval="5" class="selected" aria-pressed="true">5分</button><button data-interval="15" aria-pressed="false">15分</button><button data-interval="30" aria-pressed="false">30分</button><button data-interval="1440" aria-pressed="false">日K</button>
          </div><button data-action="ma" class="ma-button selected" aria-pressed="true">MA</button></div>
          <div class="legend" id="legend"></div>
          <div class="chart-holder" id="chart-holder"><canvas id="chart" role="img" aria-label="价格K线与成交量图"></canvas></div>
          <div class="chart-foot"><span><i></i> 成交量</span><span>东京时间 <b>UTC+9</b></span></div>
        </section>
        <section class="panel book" aria-labelledby="book-title">
          <div class="book-head"><h2 id="book-title">五档盘口</h2><span>${icon('book')}</span></div>
          <div class="book-columns"><span>档位</span><span>价格 <small>JPY</small></span><span>数量</span></div>
          <div id="order-book"></div>
        </section>
        <section class="panel account" id="account-panel" aria-label="账户与交易记录">
          <div id="account-summary" class="account-summary"></div>
          <div class="funds"><button data-action="funds" id="funds-button">Appie Pay 划转</button><span id="funds-status"></span></div>
          <div class="table-bar"><div class="table-tabs" role="tablist" aria-label="账户明细">
            <button role="tab" aria-controls="account-table" id="tab-positions" data-tab="positions" aria-selected="true" class="selected">${icon('layers')} 持仓 <span id="position-count"></span></button>
            <button role="tab" aria-controls="account-table" id="tab-orders" data-tab="orders" aria-selected="false">${icon('orders')} 委托 <span id="order-count"></span></button>
            <button role="tab" aria-controls="account-table" id="tab-fills" data-tab="fills" aria-selected="false">${icon('check')} 成交</button>
          </div></div>
          <div id="account-table" role="tabpanel" aria-labelledby="tab-positions" class="account-table"></div>
        </section>
        <section class="panel ticket" id="trade-panel" aria-labelledby="ticket-title">
          <div class="ticket-head"><h2 id="ticket-title">交易下单</h2><span id="ticket-code"></span></div>
          <div class="direction" aria-label="买卖方向"><button type="button" data-side="buy" class="selected" aria-pressed="true">买入</button><button type="button" data-side="sell" aria-pressed="false">卖出</button></div>
          <form id="order-form">
            <div class="form-grid">
              <label>委托类型<select id="kind"><option value="limit">限价单</option><option value="market">市价单</option></select></label>
              <label>委托价格<div class="input-unit"><input id="limit" inputmode="numeric" type="number" min="1" max="1000000" step="1" aria-label="委托价格"><span>JPY</span></div></label>
            </div>
            <label class="quantity-label">委托数量<div class="input-unit"><input id="quantity" inputmode="numeric" type="number" min="1" max="9999" step="1" value="10" required aria-label="委托数量"><button type="button" data-action="max" title="填入最大可委托数量">最大</button><span>股</span></div></label>
            <div class="order-estimate" id="order-estimate"></div>
            <button id="submit" type="submit" class="place-order">预览买入 ${icon('arrow')}</button>
          </form>
        </section>
      </div>
      <footer class="footer"><span>东都证券</span><span>JPY <b>·</b> 每笔佣金 0.08%</span></footer>
    </main>
    <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
    <dialog id="dialog" aria-labelledby="dialog-title"><div id="dialog-body"></div></dialog>
  </div>`;
}

export function mountTradingTerminal(host,{ adapter, styles='' }) {
  const doc=host.ownerDocument, win=doc.defaultView;
  const root=host.shadowRoot??host.attachShadow({mode:'open'});
  const stylesheet=doc.createElement('style');
  stylesheet.textContent=styles;
  root.replaceChildren(stylesheet,doc.createRange().createContextualFragment(markup()));
  const $=selector=>root.querySelector(selector);
  const chart=$('#chart'), dialog=$('#dialog'), toast=$('#toast');
  const lifecycle=new win.AbortController();
  const on=(target,type,handler)=>target.addEventListener(type,handler,{signal:lifecycle.signal});
  let snapshot=adapter.read();
  let code=INSTRUMENTS[0].code, side='buy', interval=5, tab='positions', movingAverage=true;
  let query='', toastTimer=null, pending=false, disposed=false, draft=null, cursor=null;
  let requestCounter=0, chartData=null;
  const newRequestId=()=>win.crypto?.randomUUID?.()??('tt:'+Date.now().toString(36)+':'+(++requestCounter)+':'+Math.random().toString(36).slice(2,9));
  const state=()=>snapshot.state;
  const canTrade=()=>snapshot.canTrade===true;
  const ticket=()=>({code,side,kind:$('#kind').value,quantity:$('#quantity').valueAsNumber,limit:$('#limit').valueAsNumber});
  const bestPrice=()=>bookLevels(state(),code,side).find(level=>level.quantity)?.price??quote(code,state().minute).close;
  const setDefaultLimit=()=>{ $('#limit').value=String(bestPrice()); };

  function message(text,error=false) {
    toast.innerHTML=`<span>${icon(error?'close':'check')}</span>${esc(text)}`;
    toast.classList.toggle('error',error);
    toast.hidden=false;
    win.clearTimeout(toastTimer);
    toastTimer=win.setTimeout(()=>{toast.hidden=true;},3800);
  }

  function setTab(next,scroll=false) {
    tab=next;
    renderTable();
    if(scroll) $('#account-panel').scrollIntoView({behavior:'smooth',block:'start'});
  }

  function updateSnapshot(next) {
    const changed=snapshot.binding!==next.binding;
    if (snapshot.canTrade && !next.canTrade && dialog.open && dialog.dataset.requiresControl==='true') dialog.close();
    snapshot=next;
    if (changed) {
      if(dialog.open) dialog.close();
      draft=null;
      $('#quantity').value='10';
      setDefaultLimit();
    }
    render();
  }

  function refresh() {
    if(disposed) return;
    try { updateSnapshot(adapter.read()); }
    catch(error) { message(error.message,true); }
  }

  async function commit(method,envelope,notice) {
    if (pending||disposed) return;
    pending=true;
    const binding=snapshot.binding;
    renderTicket();
    try {
      const next=await adapter[method](envelope);
      if (disposed) return;
      if(snapshot.binding!==binding || next.binding!==binding) {
        refresh();
        return;
      }
      updateSnapshot(next);
      if (notice) message(typeof notice==='function'?notice(next.state):notice);
    } catch(error) {
      if (!disposed) {
        refresh();
        message(error.message??'交易暂未完成，请重试',true);
      }
    } finally {
      pending=false;
      if(!disposed) renderTicket();
    }
  }

  function renderHeader() {
    const minute=state().minute;
    const session=marketSession(minute);
    $('#session').classList.toggle('live',session==='open');
    $('#session').innerHTML=`<i></i>${sessionLabels[session]}`;
    $('#clock').innerHTML=`<span>${formatDate(minute,true)}</span> <b>${formatTime(minute)}</b>`;
    $('#indices').innerHTML=summaryCards(state());
  }

  function renderWatch() {
    const normalized=query.trim().toLowerCase();
    const items=INSTRUMENTS.filter(item=>[item.name,item.code,item.sector].some(value=>value.toLowerCase().includes(normalized)));
    $('#watch-count').textContent=String(items.length);
    $('#watch-list').innerHTML=items.map(item=>{
      const q=quote(item.code,state().minute);
      return `<button class="watch-item ${item.code===code?'selected':''}" data-symbol="${item.code}" aria-pressed="${item.code===code}">
        <span class="symbol-icon ${item.tone}">${item.short}</span><span class="watch-name"><strong>${item.name}</strong><small>${item.code}</small></span>
        <span class="watch-value"><strong>${num(q.close)}</strong><small class="${changeClass(q.change)}">${signedPct(q.pct)}</small></span>
      </button>`;
    }).join('')||'<div class="empty watch-empty">未找到证券</div>';
  }

  function renderQuote() {
    const item=names[code], q=quote(code,state().minute);
    $('#symbol-row').innerHTML=`<span class="symbol-icon large ${item.tone}">${item.short}</span><div><h2>${item.name}</h2><p class="symbol-meta"><span>${code} · TOTO</span><span>${item.sector}</span></p></div><span class="symbol-currency">JPY</span>`;
    $('#quote-row').innerHTML=`<div class="last-price"><strong>${fixed(q.close)}</strong><span class="price-change ${changeClass(q.change)}">${icon(q.change<0?'down':'up')} ${sign(q.change)+fixed(Math.abs(q.change))} <b>(${signedPct(q.pct)})</b></span></div>
      <div class="quote-stats"><div><span>今开</span><strong>${num(q.open)}</strong></div><div><span>最高</span><strong>${num(q.high)}</strong></div><div><span>最低</span><strong>${num(q.low)}</strong></div><div><span>昨收</span><strong>${num(q.previous)}</strong></div></div>`;
    $('#ticket-code').textContent=item.name+' · '+code;
    root.querySelectorAll('[data-interval]').forEach(button=>{
      const active=Number(button.dataset.interval)===interval;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }

  function renderBook() {
    const asks=bookLevels(state(),code,'buy'), bids=bookLevels(state(),code,'sell');
    if (!asks.length) {
      $('#order-book').innerHTML='<div class="empty book-empty">当前休市</div>';
      return;
    }
    const max=Math.max(1,...asks.concat(bids).map(row=>row.quantity));
    const rows=(levels,isAsk)=>levels.map((level,i)=>({level,i})).sort((a,b)=>isAsk?b.i-a.i:a.i-b.i).map(({level,i})=>
      `<button class="book-row ${isAsk?'ask':'bid'}" data-book-price="${level.price}" data-book-side="${isAsk?'buy':'sell'}" style="--depth:${level.quantity/max*100}%" aria-label="${isAsk?'卖':'买'}${i+1} ${level.price} 日元，填入${isAsk?'买':'卖'}单"><span>${isAsk?'卖':'买'}${i+1}</span><strong>${fixed(level.price)}</strong><span>${num(level.quantity)}</span></button>`).join('');
    const bestAsk=asks.find(level=>level.quantity);
    const bestBid=bids.find(level=>level.quantity);
    const totalBids=bids.reduce((sum,level)=>sum+level.quantity,0);
    const totalAsks=asks.reduce((sum,level)=>sum+level.quantity,0);
    const ratio=totalBids/(totalBids+totalAsks||1)*100;
    $('#order-book').innerHTML=rows(asks,true)+
      `<div class="spread"><span>买卖价差</span><strong>${bestAsk&&bestBid?fixed(bestAsk.price-bestBid.price):'—'}</strong></div>`+rows(bids,false)+
      `<div class="book-ratio"><div><span class="gain">买盘 ${ratio.toFixed(0)}%</span><span class="loss">卖盘 ${(totalBids+totalAsks?100-ratio:0).toFixed(0)}%</span></div><i style="--ratio:${ratio}%"></i></div>`;
  }

  function renderAccount() {
    const summary=accountSummary(state());
    const cells=[
      ['总资产',yen(summary.equity),'neutral'],['可用资金',yen(summary.availableCash),'neutral'],
      ['冻结资金',yen(summary.frozenCash),'neutral'],['持仓市值',yen(summary.marketValue),'neutral'],
      ['浮动盈亏',signedYen(summary.unrealized),changeClass(summary.unrealized)],
    ];
    $('#funds-button').disabled=!canTrade();
    $('#funds-status').textContent=canTrade()?'':'托管期间仅可查看';
    $('#account-summary').innerHTML=cells.map(([label,value,tone])=>`<div><span>${label}</span><strong class="${tone}">${value}</strong></div>`).join('');
    $('#position-count').textContent=String(summary.positions.length);
    $('#order-count').textContent=String(state().orders.filter(order=>['open','partial'].includes(order.status)).length);
    renderTable(summary);
  }

  function renderTable(summary=accountSummary(state())) {
    root.querySelectorAll('[data-tab]').forEach(button=>{
      const active=button.dataset.tab===tab;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-selected',String(active));
      button.tabIndex=active?0:-1;
    });
    const section=$('#account-table');
    section.setAttribute('aria-labelledby','tab-'+tab);
    const table=(head,rows,empty)=>rows.length?`<table><thead><tr>${head.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`:`<div class="empty account-empty">${empty}</div>`;
    const stock=code=>`<button class="table-stock" data-symbol="${code}"><strong>${names[code].name}</strong><small>${code}</small></button>`;
    if (tab==='positions') {
      section.innerHTML=table(['证券','持仓 / 可卖','成本价','现价','市值','浮动盈亏'],summary.positions.map(position=>
        `<tr><td>${stock(position.code)}</td><td>${num(position.quantity)} <small>/ ${num(position.available)}</small></td><td>${fixed(position.costPerShare)}</td><td>${fixed(position.last)}</td><td>${yen(position.value)}</td><td class="${changeClass(position.profit)}">${signedYen(position.profit)}</td></tr>`),'暂无持仓');
    } else if(tab==='orders') {
      section.innerHTML=table(['证券','方向','委托价','已成 / 委托','状态','时间','操作'],state().orders.slice().reverse().map(order=>{
        const open=['open','partial'].includes(order.status);
        return `<tr><td>${stock(order.code)}</td><td class="${order.side==='buy'?'gain':'loss'}">${order.side==='buy'?'买入':'卖出'}</td><td>${order.kind==='market'?'市价':num(order.limit)}</td><td>${order.filled} <small>/ ${order.quantity}</small></td><td><span class="order-status ${open?'active':''}">${statusLabels[order.status]}</span></td><td>${timeStamp(order.created)}</td><td>${open?`<button class="cancel-order" data-cancel="${order.id}" ${canTrade()?'':'disabled'}>撤单</button>`:'—'}</td></tr>`;
      }),'暂无委托');
    } else {
      section.innerHTML=table(['证券','方向','成交数量','成交价','佣金','已实现盈亏','时间'],state().fills.slice().reverse().map(fill=>
        `<tr><td>${stock(fill.code)}</td><td class="${fill.side==='buy'?'gain':'loss'}">${fill.side==='buy'?'买入':'卖出'}</td><td>${num(fill.quantity)}</td><td>${fixed(fill.price)}</td><td>${yen(fill.fee)}</td><td class="${changeClass(fill.realized)}">${fill.side==='sell'?signedYen(fill.realized):'—'}</td><td>${timeStamp(fill.at)}</td></tr>`),'暂无成交');
    }
  }

  function renderTicket() {
    const order=ticket();
    const estimate=estimateOrder(state(),order);
    const summary=accountSummary(state());
    const available=summary.positions.find(item=>item.code===code)?.available??0;
    const buy=side==='buy';
    const market=order.kind==='market';
    const open=marketSession(state().minute)==='open';
    root.querySelectorAll('[data-side]').forEach(button=>{
      const active=button.dataset.side===side;
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('#limit').disabled=market;
    $('#limit').placeholder=market?'按盘口成交':'';
    $('#limit').required=!market;
    $('#order-estimate').innerHTML=`<div><span>${buy?'可用资金':'可卖股数'}</span><b>${buy?yen(summary.availableCash):num(available)+' 股'}</b></div>
      <div><span>${buy?(market?'预计扣款':'最高冻结'):'预计实收'}</span><b>${estimate?yen(estimate.total):'—'}</b></div>`;
    const submit=$('#submit');
    submit.classList.toggle('sell',!buy);
    submit.disabled=!canTrade()||!open||pending;
    submit.innerHTML=(pending?'处理中':!canTrade()?'接管后可下单':!open?'当前休市':buy?'预览买入':'预览卖出')+' '+icon('arrow');
  }

  function render() {
    renderHeader(); renderWatch(); renderQuote(); renderBook(); renderAccount(); renderTicket(); drawChart();
  }

  function drawChart() {
    const bounds=chart.getBoundingClientRect();
    const w=bounds.width,h=bounds.height;
    if(!w||!h) return;
    const ratio=Math.min(2,win.devicePixelRatio||1);
    chart.width=Math.round(w*ratio);
    chart.height=Math.round(h*ratio);
    const ctx=chart.getContext('2d');
    ctx.scale(ratio,ratio);
    const left=4,right=w-48,top=8,priceBottom=h*.73,volTop=priceBottom+12,volBottom=h-24;
    const count=Math.max(26,Math.min(73,Math.floor((right-left)/8.7)));
    const key=[code,state().minute,interval,count].join(':');
    if(chartData?.key!==key) {
      const all=chartBars(code,state().minute,interval,count+19);
      const bars=all.slice(-count);
      const avgs=period=>bars.map((_,i)=>{
        const end=all.length-count+i+1;
        return all.slice(end-period,end).reduce((sum,bar)=>sum+bar.close,0)/period;
      });
      chartData={key,bars,ma5:avgs(5),ma20:avgs(20)};
    }
    const {bars,ma5,ma20}=chartData;
    const high=Math.max(...bars.map(bar=>bar.high),...(movingAverage?ma20:[]));
    const low=Math.min(...bars.map(bar=>bar.low),...(movingAverage?ma20:[]));
    const step=[1,2,5,10,20,25,50,100,200,500,1000].find(value=>value>=(high-low)/5)??1000;
    const lo=Math.floor((low-step*.16)/step)*step;
    const hi=Math.ceil((high+step*.16)/step)*step;
    const stepX=(right-left-5)/count;
    const x=i=>left+(i+.5)*stepX;
    const y=value=>priceBottom-(value-lo)/(hi-lo)*(priceBottom-top);
    const volMax=Math.max(...bars.map(bar=>bar.volume));
    const colors={ muted:'#7d8499', line:'#232938', rise:'#43d5a3', fall:'#f37e94', ma5:'#b7a1fa', ma20:'#d3a564' };
    const mono='10px "IBM Plex Mono", ui-monospace, monospace';
    const line=(x1,y1,x2,y2,color)=>{
      ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    };
    ctx.font=mono;
    ctx.textBaseline='middle';
    for(let value=lo;value<=hi;value+=step) {
      const yy=Math.round(y(value))+.5;
      line(left,yy,right,yy,colors.line);
      ctx.fillStyle=colors.muted;ctx.fillText(num(value),right+7,yy);
    }
    const timeGrid=w<365?4:6;
    for(let i=0;i<timeGrid;i++) {
      const index=Math.round(i*(count-1)/(timeGrid-1));
      const xx=x(index);
      line(Math.round(xx)+.5,top,Math.round(xx)+.5,volBottom,colors.line);
      const label=interval===1440||index===0||Math.floor(bars[index].at/1440)!==Math.floor(bars[index-1].at/1440)?formatDate(bars[index].at):formatTime(bars[index].at);
      ctx.fillStyle=colors.muted;
      ctx.fillText(label,Math.min(right-24,Math.max(left,xx-ctx.measureText(label).width/2)),h-10);
    }
    line(left,volBottom+.5,right,volBottom+.5,colors.line);
    const candleWidth=Math.max(3,Math.floor(stepX*.65));
    bars.forEach((bar,i)=>{
      const xx=Math.round(x(i)),open=y(bar.open),close=y(bar.close);
      const color=bar.close>=bar.open?colors.rise:colors.fall;
      line(xx+.5,y(bar.high),xx+.5,y(bar.low),color);
      ctx.fillStyle=color;
      ctx.fillRect(Math.round(xx-candleWidth/2),Math.min(open,close),candleWidth,Math.max(1.7,Math.abs(close-open)));
      const barHeight=Math.max(1,bar.volume/volMax*(volBottom-volTop));
      ctx.globalAlpha=.45;
      ctx.fillRect(Math.round(xx-candleWidth/2),volBottom-barHeight,candleWidth,barHeight);
      ctx.globalAlpha=1;
    });
    if (movingAverage) {
      [[ma5,colors.ma5],[ma20,colors.ma20]].forEach(([series,color])=>{
        ctx.strokeStyle=color;ctx.lineWidth=1.3;ctx.beginPath();
        series.forEach((value,i)=>i?ctx.lineTo(x(i),y(value)):ctx.moveTo(x(i),y(value)));
        ctx.stroke();ctx.lineWidth=1;
      });
    }
    const selected=cursor?Math.max(0,Math.min(count-1,Math.round((cursor.x-left)/stepX-.5))):count-1;
    const bar=bars[selected];
    const priceColor=bars.at(-1).close>=bars.at(-1).open?colors.rise:colors.fall;
    const lastY=y(bars.at(-1).close);
    ctx.setLineDash([3,4]);
    line(left,lastY,right,lastY,priceColor+'70');
    ctx.setLineDash([]);
    ctx.fillStyle=priceColor;
    ctx.fillRect(right+3,lastY-8,42,16);
    ctx.fillStyle='#0d1118';
    ctx.fillText(num(bars.at(-1).close),right+7,lastY);
    if (cursor) {
      const xx=Math.round(x(selected))+.5;
      const yy=Math.max(top,Math.min(priceBottom,cursor.y));
      ctx.setLineDash([3,3]);
      line(xx,top,xx,volBottom,'#969bb4');
      if (cursor.y<=priceBottom) line(left,yy,right,yy,'#969bb4');
      ctx.setLineDash([]);
      const label=interval===1440?formatDate(bar.at):timeStamp(bar.at);
      const width=ctx.measureText(label).width+12;
      const labelX=Math.max(left,Math.min(right-width,xx-width/2));
      ctx.fillStyle='#343b53';ctx.fillRect(labelX,h-19,width,18);
      ctx.fillStyle='#f2f4ff';ctx.fillText(label,labelX+6,h-10);
    }
    $('#legend').innerHTML=`<span>开 <b>${num(bar.open)}</b></span><span>高 <b>${num(bar.high)}</b></span><span>低 <b>${num(bar.low)}</b></span><span>收 <b>${num(bar.close)}</b></span><span>量 <b>${compact(bar.volume)}</b></span>`+
      (movingAverage?`<span class="legend-ma purple">MA5 ${fixed(ma5[selected])}</span><span class="legend-ma gold">MA20 ${fixed(ma20[selected])}</span>`:'');
  }

  function openDialog(title,description,rows,confirmLabel,confirm,secondary='返回') {
    dialog.dataset.requiresControl='true';
    $('#dialog-body').innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button type="button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></div>
      <p>${esc(description)}</p>${rows.length?`<dl>${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}
      <div class="dialog-actions"><button type="button" data-action="close-dialog" autofocus>${esc(secondary)}</button><button type="button" class="primary" data-action="confirm">${esc(confirmLabel)}</button></div>`;
    draft=confirm;
    dialog.showModal();
  }

  function preview(event) {
    event.preventDefault();
    if (pending||!canTrade()) return;
    const order=ticket(), estimate=estimateOrder(state(),order), summary=accountSummary(state());
    if (!estimate||!estimate.quantity) { message('请检查委托价格和数量',true); return; }
    if (order.side==='buy'&&estimate.total>summary.availableCash) { message('可用资金不足',true); return; }
    if (order.side==='sell'&&order.quantity>(summary.positions.find(item=>item.code===code)?.available??0)) { message('可用股数不足',true); return; }
    const action={...order,limit:order.kind==='market'?null:order.limit,type:'submit',requestId:newRequestId()};
    const envelope={binding:snapshot.binding,revision:state().revision,minute:state().minute,action};
    const buy=side==='buy', market=order.kind==='market';
    const label=buy?'买入':'卖出';
    const rows=[['证券',names[code].name+' · '+code],['委托类型',market?'市价单':'限价单'],['委托数量',num(order.quantity)+' 股'],
      [market?'预计成交':'委托价格',market?num(estimate.quantity)+' 股':yen(order.limit)],
      ['预计佣金',yen(estimate.fee)],[buy?(market?'预计扣款':'最高冻结'):'预计实收',yen(estimate.total)]];
    openDialog(label+'确认',market?'按当前盘口立即撮合，未成交部分自动撤销。':'当日有效，未成交部分可撤单。',rows,'确认'+label,()=>{
      commit('dispatch',envelope,after=>{
        setTab('orders');
        const saved=after.orders.find(item=>Number(item.id.slice(2))===after.nextId-1);
        if(!saved) return '委托已提交';
        return saved.filled ? '已成交 '+saved.filled+' 股 · '+statusLabels[saved.status] : '委托'+statusLabels[saved.status];
      });
    },'返回修改');
  }

  function chooseSymbol(next,fromWatch=false) {
    code=next;cursor=null;setDefaultLimit();
    renderWatch();renderQuote();renderBook();renderTicket();drawChart();
    if(fromWatch) root.querySelector('.watch-item.selected')?.focus({preventScroll:true});
  }

  function chooseSide(next) {
    side=next;setDefaultLimit();renderTicket();
  }

  function openForm(title, content, confirmLabel, submit, requiresControl=false) {
    dialog.dataset.requiresControl=String(requiresControl);
    $('#dialog-body').innerHTML=`<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button type="button" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></div>
      <form class="action-form">${content}<div class="dialog-actions"><button type="button" data-action="close-dialog">返回</button><button class="primary" type="submit">${esc(confirmLabel)}</button></div></form>`;
    const form=$('.action-form');
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const values=Object.fromEntries(new win.FormData(form));
      dialog.close();
      submit(values);
    },{once:true});
    dialog.showModal();
  }

  function openFunds() {
    if (pending||!canTrade()) return;
    const base={binding:snapshot.binding,revision:state().revision,minute:state().minute,requestId:newRequestId()};
    const cards={gpt:'GPT Card',claude:'ClaudeCard',gemini:'GeminiCard'};
    openForm('Appie Pay 划转', `<p>证券账户可转出 ${yen(accountSummary(state()).availableCash)}</p>
      <label>方向<select name="direction"><option value="deposit">转入证券账户</option><option value="withdraw">转出至 Appie Pay</option></select></label>
      <label>Appie Pay 卡<select name="card">${Object.entries(cards).map(([id,label])=>`<option value="${id}">${label} · ¥${fixed((snapshot.cards?.[id]??0)/100)}</option>`).join('')}</select></label>
      <label>金额（日元）<input name="yen" type="number" min="1" max="20000000" step="1" inputmode="numeric" required></label>`,
      '确认划转',values=>commit('funds',{...base,...values,yen:Number(values.yen)},'划转已完成'),true);
  }

  function openSchedule() {
    if (pending) return;
    const minute=state().minute;
    let start=nextOpenMinute(minute);
    // The suggested five-minute review must fit within one session.
    if (!fitsMarketSession(start,5)) start=nextOpenMinute(start+5);
    const date=new Date(MARKET_EPOCH+Math.floor(start/1440)*86400000).toISOString().slice(0,10);
    const base={binding:snapshot.binding,code,requestId:newRequestId()};
    openForm('安排行情回顾',`<p>${esc(names[code].name)} · ${esc(code)}</p>
      <label>日期<input name="date" type="date" value="${date}" required></label>
      <label>时间<input name="time" type="time" value="${formatTime(start)}" required></label>
      <label>时长（分钟）<input name="duration" type="number" min="1" max="180" value="5" required></label>`,
      '加入日程',values=>commit('schedule',{...base,...values,duration:Number(values.duration)},'已加入日程'));
  }

  on(root,'click',event=>{
    const button=event.target.closest('button');
    if(!button||button.disabled) return;
    const data=button.dataset;
    if(data.symbol) { chooseSymbol(data.symbol,button.classList.contains('watch-item'));return; }
    if(data.interval) { interval=Number(data.interval);cursor=null;renderQuote();drawChart();return; }
    if(data.side) { chooseSide(data.side);return; }
    if(data.tab) { setTab(data.tab);return; }
    if(data.bookPrice) {
      chooseSide(data.bookSide);
      $('#kind').value='limit';$('#limit').value=data.bookPrice;
      renderTicket();
      $('#quantity').focus({preventScroll:true});
      if(host.clientWidth<=620) $('#trade-panel').scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
    if(data.cancel) {
      const order=state().orders.find(item=>item.id===data.cancel);
      if(!order||pending||!canTrade()) return;
      const envelope={binding:snapshot.binding,revision:state().revision,minute:state().minute,action:{type:'cancel',orderId:order.id,requestId:newRequestId()}};
      openDialog('撤销委托','未成交部分将撤销并释放冻结资产。',[['证券',names[order.code].name],['未成交',num(order.quantity-order.filled)+' 股']],'确认撤单',()=>commit('dispatch',envelope,'委托已撤销'));
      return;
    }
    switch(data.action) {
      case 'jump-trade': $('#trade-panel').scrollIntoView({block:'start'});break;
      case 'jump-assets': $('#account-panel').scrollIntoView({block:'start'});break;
      case 'funds': openFunds();break;
      case 'schedule': openSchedule();break;
      case 'ma':
        movingAverage=!movingAverage;
        button.classList.toggle('selected',movingAverage);
        button.setAttribute('aria-pressed',String(movingAverage));
        drawChart();break;
      case 'max': {
        const max=maxOrderQuantity(state(),ticket());
        if(max) { $('#quantity').value=String(max);renderTicket(); }
        else message('当前没有可委托数量',true);
        break;
      }
      case 'close-dialog': dialog.close();break;
      case 'confirm': {
        const action=draft;
        dialog.close();
        action?.();
        break;
      }
    }
  });

  on($('#search'),'input',event=>{query=event.target.value;renderWatch();});
  on($('#order-form'),'submit',preview);
  on($('#order-form'),'input',renderTicket);
  on($('#kind'),'change',()=>{
    if($('#kind').value==='market') $('#limit').value='';
    else setDefaultLimit();
    renderTicket();
  });
  on(dialog,'close',()=>{draft=null;});
  on(chart,'pointermove',event=>{cursor={x:event.offsetX,y:event.offsetY};drawChart();});
  on(chart,'pointerleave',()=>{cursor=null;drawChart();});
  on($('.table-tabs'),'keydown',event=>{
    const keys=['positions','orders','fills'];
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index=keys.indexOf(tab);
    const next=event.key==='Home'?keys[0]:event.key==='End'?keys.at(-1):keys[(index+(event.key==='ArrowRight'?1:2))%3];
    setTab(next);$('#tab-'+next).focus();
  });
  const observer=new win.ResizeObserver(()=>{cursor=null;drawChart();});
  observer.observe($('#chart-holder'));
  const unsubscribe=adapter.subscribe?.(refresh);
  setDefaultLimit();
  render();

  return {
    refresh,
    selectSymbol(next) { if (names[next]) chooseSymbol(next); },
    destroy() {
      disposed=true;
      win.clearTimeout(toastTimer);
      observer.disconnect();
      unsubscribe?.();
      lifecycle.abort();
      root.replaceChildren();
    },
  };
}
