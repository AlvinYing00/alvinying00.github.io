// Shared, deterministic decision engine for live automation and recorded replay.
// Inputs contain observed OHLC/quotes and public news timing only.
(function installEACore(root) {
  'use strict';
  const strategies = {
    trend: ['Trend pullback', 'A pullback through MA20 closes back with the MA20/50 trend.'],
    crossover: ['MA crossover', 'MA10 crosses MA30 on a completed candle.'],
    breakout: ['Range breakout', 'A close breaks the preceding 20-candle high or low.'],
    sweep: ['Liquidity rejection', 'Price sweeps a 10-candle extreme and closes back inside.'],
    snr: ['Key levels & SNR', 'Confirmed support/resistance zones: rejection bounces and breakout retests.'],
    engulfing: ['Engulfing reversal', 'An opposing candle body engulfs the previous body.'],
    rsi: ['RSI recovery', 'RSI14 returns above 30 or below 70 after an extreme.'],
    bands: ['Bollinger re-entry', 'Price returns inside a 20-candle, two-deviation band.'],
    inside: ['Inside-bar breakout', 'A close breaks the mother candle after an inside bar.'],
    momentum: ['Momentum breakout', 'A strong body breaks the previous high/low with above-average range.'],
    news: ['News reaction', 'A later candle closes beyond the first observed release candle. Requires news trading.']
  };
  const defaults = {strategies:['trend'], tradeNews:false, sizing:'fixed', lots:.01, riskPct:1, leverage:10,
    slMode:'atr', slValue:1.5, tpMode:'reward', tpValue:2, trailing:false, breakEven:false,
    maxPositions:3, maxLots:1, maxDrawdown:10, lossLimit:3, cooldown:30, avoidSeconds:60, waitBars:1};
  const mean = a => a.reduce((s,v)=>s+v,0)/a.length;
  const ma = (bars,n) => mean(bars.slice(-n).map(b=>b.close));
  function atr(bars,n=14) {
    const last=bars.slice(-(n+1));
    return mean(last.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-last[i].close),Math.abs(b.low-last[i].close))));
  }
  function rsi(bars) {
    const last=bars.slice(-15);let gain=0,loss=0;
    for(let i=1;i<last.length;i++){const d=last[i].close-last[i-1].close;gain+=Math.max(0,d);loss+=Math.max(0,-d);}
    return gain+loss===0?50:100*gain/(gain+loss);
  }
  function band(bars) {const values=bars.slice(-20).map(b=>b.close),mid=mean(values),dev=Math.sqrt(mean(values.map(v=>(v-mid)**2)));return {high:mid+2*dev,low:mid-2*dev};}
  function keyLevels(history) {
    // Only earlier completed candles enter level discovery. A pivot needs two
    // candles on both sides, and a zone needs two distinct visits, five bars apart.
    const past=history.slice(-80);
    if(past.length<15)return [];
    const volatility=atr(past);
    if(!Number.isFinite(volatility)||volatility<=0)return [];
    const tolerance=Math.max(volatility*.18,Math.abs(past.at(-1).close)*.0005,1e-8);
    const zones=[];
    for(let i=2;i<past.length-2;i++) {
      const neighbors=[past[i-2],past[i-1],past[i+1],past[i+2]];
      for(const role of ['support','resistance']) {
        const field=role==='support'?'low':'high',price=past[i][field];
        const pivot=role==='support'
          ? neighbors.every(b=>price<=b.low)&&neighbors.some(b=>price<b.low)
          : neighbors.every(b=>price>=b.high)&&neighbors.some(b=>price>b.high);
        if(!pivot)continue;
        const zone=zones.find(z=>z.originalRole===role&&Math.abs(z.price-price)<=tolerance&&
          Math.max(z.max,price)-Math.min(z.min,price)<=tolerance*2);
        if(zone) {
          if(i-zone.lastTouch<5)continue;
          zone.price=(zone.price*zone.touches+price)/(zone.touches+1);
          zone.touches++;zone.lastTouch=i;zone.min=Math.min(zone.min,price);zone.max=Math.max(zone.max,price);
          if(zone.touches===2)zone.established=i+2;
        } else zones.push({price,originalRole:role,role,touches:1,lastTouch:i,min:price,max:price,established:null});
      }
    }
    return zones.filter(z=>z.touches>=2).map(zone=>{
      const z={...zone,tolerance,volatility,flipped:false};
      // A completed close through a zone changes its role. The signal candle
      // cannot establish or flip a level and trade its own breakout at once.
      for(let i=z.established;i<past.length;i++) {
        if(z.role==='resistance'&&past[i].close>z.price+tolerance){z.role='support';z.flipped=true;}
        else if(z.role==='support'&&past[i].close<z.price-tolerance){z.role='resistance';z.flipped=true;}
      }
      return z;
    });
  }
  function supportResistanceSignal(bars) {
    if(bars.length<51)return 0;
    const b=bars.at(-1),p=bars.at(-2),range=b.high-b.low;
    if(range<=0||Math.abs(b.close-b.open)<range*.35)return 0;
    const side=b.close>b.open?1:-1;
    if(side>0&&b.close<b.low+range*.65)return 0;
    if(side<0&&b.close>b.high-range*.65)return 0;
    const zones=keyLevels(bars.slice(0,-1));
    for(const z of zones) {
      const {price,tolerance,volatility}=z;
      const bounce=side>0
        ? z.role==='support'&&p.close>price+tolerance&&b.open>=price-tolerance&&
          b.low<=price+tolerance&&b.low>=price-volatility*.5&&b.close>price+tolerance
        : z.role==='resistance'&&p.close<price-tolerance&&b.open<=price+tolerance&&
          b.high>=price-tolerance&&b.high<=price+volatility*.5&&b.close<price-tolerance;
      if(!bounce)continue;
      // Skip a bounce straight into another established opposing zone.
      const crowded=zones.some(other=>side>0
        ? other.role==='resistance'&&other.price>b.close&&other.price-b.close<volatility*.75
        : other.role==='support'&&other.price<b.close&&b.close-other.price<volatility*.75);
      if(!crowded)return side;
    }
    return 0;
  }
  function validate(c) {
    if(!c||!Array.isArray(c.strategies)||c.strategies.length<1||c.strategies.length>3||new Set(c.strategies).size!==c.strategies.length||c.strategies.some(k=>!Object.hasOwn(strategies,k)))return 'Choose one to three different strategies.';
    if(c.strategies.includes('news')&&!c.tradeNews)return 'News reaction requires Trade news.';
    for(const k of ['tradeNews','trailing','breakEven'])if(typeof c[k]!=='boolean')return 'Invalid '+k+' setting.';
    if(!['fixed','risk'].includes(c.sizing)||![1,10,100,1000].includes(c.leverage))return 'Choose a valid sizing mode and leverage.';
    for(const k of ['lots','riskPct','slValue','tpValue','maxPositions','maxLots','maxDrawdown','lossLimit','cooldown','avoidSeconds','waitBars'])if(!Number.isFinite(c[k]))return 'Enter a valid number for '+k+'.';
    if(c.lots<.01||c.maxLots<.01||[c.lots,c.maxLots].some(v=>Math.abs(v*100-Math.round(v*100))>1e-7))return 'Lots must be at least 0.01, in steps of 0.01.';
    if(c.riskPct<=0||c.riskPct>100||c.maxDrawdown<=0||c.maxDrawdown>100||c.slValue<=0||c.tpValue<=0)return 'Risk, drawdown and exit values must be positive; percentages cannot exceed 100.';
    if(!Number.isInteger(c.maxPositions)||c.maxPositions<1||c.maxPositions>100||!Number.isInteger(c.lossLimit)||c.lossLimit<0||c.lossLimit>100)return 'Positions must be 1–100; consecutive losses must be 0–100.';
    if(c.cooldown<0||c.avoidSeconds<0||c.cooldown>86400||c.avoidSeconds>3600||!Number.isInteger(c.waitBars)||c.waitBars<0||c.waitBars>100)return 'Check cooldown, scheduled-news avoidance and waiting candles.';
    if(!['price','equity','cash','atr','swing'].includes(c.slMode)||!['price','equity','cash','atr','swing','reward'].includes(c.tpMode))return 'Choose valid TP and SL modes.';
    if((['price','equity'].includes(c.slMode)&&c.slValue>100)||(['price','equity'].includes(c.tpMode)&&c.tpValue>100))return 'TP/SL percentages cannot exceed 100.';
    if(c.sizing==='risk'&&['equity','cash'].includes(c.slMode))return 'Risk-based lots need a price, ATR or swing stop. For an equity/dollar stop, choose fixed lots.';
    return null;
  }
  function state(equity) {return {peak:Math.max(0,equity),drawdown:0,maxDD:0,losses:0,halted:'',lastEntry:-Infinity,lastBar:null,newsKey:null,newsRef:null,newsBars:0,lastRelease:null,seen:new Set()};}
  function observe(s,a,news) {
    s.peak=Math.max(s.peak,a.equity);s.drawdown=s.peak>0?Math.max(0,(s.peak-a.equity)/s.peak*100):0;s.maxDD=Math.max(s.maxDD,s.drawdown);
    if(news.active&&s.newsKey!==news.key){s.newsKey=news.key;s.newsRef=null;s.newsBars=0;s.lastRelease=news.start;}
  }
  function closed(s,p) {if(p.source!=='ea'||s.seen.has(p.id))return;s.seen.add(p.id);s.losses=p.profit<0?s.losses+1:0;}
  function risk(s,c,a) {
    if(s.halted)return null;
    if(a.equity<=0){s.halted='Account equity reached zero.';return {close:true,reason:s.halted};}
    if(s.drawdown>=c.maxDrawdown){s.halted='Maximum account drawdown reached.';return {close:true,reason:s.halted};}
    if(c.lossLimit>0&&s.losses>=c.lossLimit){s.halted='Consecutive-loss limit reached.';return {close:false,reason:s.halted};}
    return null;
  }
  function signals(bars,keys,news,reference) {
    if(bars.length<51)return [];
    const b=bars.at(-1),p=bars.at(-2),before=bars.slice(0,-1),prior=bars.slice(-11,-1);
    const high=Math.max(...prior.map(v=>v.high)),low=Math.min(...prior.map(v=>v.low)),a=atr(bars),out=[];
    const direction=b.close>b.open?1:b.close<b.open?-1:0;
    for(const key of keys){let side=0;
      if(key==='trend'){const fast=ma(bars,20),slow=ma(bars,50);if(fast>slow&&p.close<=ma(before,20)&&b.close>fast&&direction>0)side=1;if(fast<slow&&p.close>=ma(before,20)&&b.close<fast&&direction<0)side=-1;}
      if(key==='crossover'){const old=ma(before,10)-ma(before,30),next=ma(bars,10)-ma(bars,30);if(old<=0&&next>0)side=1;if(old>=0&&next<0)side=-1;}
      if(key==='breakout'){const window=bars.slice(-21,-1);if(b.close>Math.max(...window.map(v=>v.high)))side=1;else if(b.close<Math.min(...window.map(v=>v.low)))side=-1;}
      if(key==='sweep'){if(b.low<low&&b.close>low&&direction>0)side=1;if(b.high>high&&b.close<high&&direction<0)side=-1;}
      if(key==='snr')side=supportResistanceSignal(bars);
      if(key==='engulfing'){if(p.close<p.open&&direction>0&&b.open<=p.close&&b.close>p.open)side=1;if(p.close>p.open&&direction<0&&b.open>=p.close&&b.close<p.open)side=-1;}
      if(key==='rsi'){if(rsi(before)<30&&rsi(bars)>=30)side=1;if(rsi(before)>70&&rsi(bars)<=70)side=-1;}
      if(key==='bands'){const old=band(before),now=band(bars);if(p.close<old.low&&b.close>now.low)side=1;if(p.close>old.high&&b.close<now.high)side=-1;}
      if(key==='inside'){const mother=bars.at(-3);if(p.high<mother.high&&p.low>mother.low){if(b.close>mother.high)side=1;if(b.close<mother.low)side=-1;}}
      if(key==='momentum'&&Math.abs(b.close-b.open)>(b.high-b.low)*.65&&b.high-b.low>a*1.1){if(direction>0&&b.close>p.high)side=1;if(direction<0&&b.close<p.low)side=-1;}
      if(key==='news'&&news.active&&reference&&reference.time!==b.time){if(b.close>reference.high)side=1;if(b.close<reference.low)side=-1;}
      if(side)out.push({key,side});
    }
    return out;
  }
  const spread = p=>Math.max(.01,p*.002);
  const exitPrice = (p,side)=>Math.max(.01,p+(side==='BUY'?-1:1)*spread(p));
  function plan(c,side,bars,price,account) {
    if(!Number.isFinite(price)||price<.01||account.equity<=0)return {error:'No usable price or account equity.'};
    const d=side==='BUY'?1:-1,entry=Math.max(.01,price+d*spread(price)),a=atr(bars),recent=bars.slice(-10);
    let lots=c.lots;
    function distance(mode,value,isStop) {
      if(mode==='price')return entry*value/100;
      if(mode==='equity')return account.equity*value/100/lots;
      if(mode==='cash')return value/lots;
      if(mode==='atr')return a*value;
      if(mode==='swing'){
        const low=Math.min(...recent.map(b=>b.low)),high=Math.max(...recent.map(b=>b.high));
        return isStop?(d>0?entry-low:high-entry)+a*value:(d>0?high-entry:entry-low)+a*value;
      }
      return NaN;
    }
    const stopDistance=distance(c.slMode,c.slValue,true);
    if(!Number.isFinite(stopDistance)||stopDistance<=0)return {error:'No valid stop distance.'};
    if(c.sizing==='risk')lots=Math.floor((account.equity*c.riskPct/100/stopDistance)*100+1e-9)/100;
    if(lots<.01)return {error:'Minimum 0.01 lots exceeds the risk budget.'};
    const sl=entry-d*stopDistance,tpDistance=c.tpMode==='reward'?stopDistance*c.tpValue:distance(c.tpMode,c.tpValue,false),tp=entry+d*tpDistance;
    const currentExit=exitPrice(price,side);
    if(!Number.isFinite(tp)||sl<.01||tp<.01||tpDistance<=0)return {error:'TP/SL would cross the price floor or an invalid swing. Adjust exit settings.'};
    if(d*(currentExit-sl)<=0||d*(tp-currentExit)<=0)return {error:'Exit distance is inside the current spread. Widen TP/SL.'};
    const margin=price*lots/c.leverage,openingLoss=(entry-currentExit)*d*lots;
    if(!Number.isFinite(margin+openingLoss)||margin+openingLoss>account.available+1e-9)return {error:'Insufficient available margin, including spread.'};
    return {type:side,lots,size:lots,leverage:c.leverage,entry,marketPrice:price,sl,tp,margin,openingLoss,risk:stopDistance*lots,initialRiskDistance:stopDistance,
      trailing:c.trailing,breakEven:c.breakEven,equityAtEntry:account.equity};
  }
  function decide(s,c,bars,news,now,price,account,open) {
    const b=bars.at(-1);if(!b||s.lastBar===b.time)return {error:'Waiting for the next candle.'};s.lastBar=b.time;
    if(s.lastRelease!==null&&now>=s.lastRelease+2){s.newsBars++;if(news.active&&!s.newsRef)s.newsRef={...b};}
    if(s.halted)return {error:s.halted};
    if(news.active&&!c.tradeNews)return {error:'News trading is off.'};
    if(news.nextFixed!==null&&news.nextFixed>now&&news.nextFixed-now<=c.avoidSeconds)return {error:'Waiting through the scheduled-news window.'};
    if(s.lastRelease!==null&&s.newsBars<c.waitBars)return {error:'Waiting for post-release candles.'};
    if(now-s.lastEntry<c.cooldown)return {error:'Entry cooldown.'};
    if(open.length>=c.maxPositions)return {error:'Maximum open positions reached.'};
    const found=signals(bars,c.strategies,news,s.newsRef);
    if(!found.length)return {error:'Waiting for a strategy signal.'};
    if(found.some(v=>v.side!==found[0].side))return {error:'Strategies disagree; entry skipped.'};
    const order=plan(c,found[0].side>0?'BUY':'SELL',bars,price,account);if(order.error)return order;
    if(open.reduce((sum,p)=>sum+p.lots,0)+order.lots>c.maxLots+1e-9)return {error:'Maximum total lots reached.'};
    return {...order,strategies:found.map(v=>v.key)};
  }
  function trailingStop(p,price) {
    if(!p.trailing&&!p.breakEven)return p.sl;
    const d=p.type==='BUY'?1:-1,exit=exitPrice(price,p.type),gain=d*(exit-p.entry),r=p.initialRiskDistance;
    if(!(r>0)||gain<r)return p.sl;
    let next=p.sl;
    if(p.breakEven)next=d>0?Math.max(next,p.entry):Math.min(next,p.entry);
    if(p.trailing){const candidate=exit-d*r;next=d>0?Math.max(next,candidate):Math.min(next,candidate);}
    return Math.max(.01,next);
  }
  // Replay is isolated from the live account and never invokes market RNG.
  function replay(record,c,from=0,to=record.ticks.length) {
    const error=validate(c);if(error)throw Error(error);
    let bars=record.history.map(b=>({...b})),balance=record.equity,orders=[],id=0,net=0,wins=0,losses=0,costs=0,reason='';
    const s=state(balance),curve=[];
    function account(){const open=orders.filter(p=>p.open),equity=balance+open.reduce((n,p)=>n+p.profit,0),used=open.reduce((n,p)=>n+p.margin,0);return {equity,available:equity-used};}
    function close(p,price){if(!p.open)return;p.exitMid=price;p.profit=(exitPrice(price,p.type)-p.entry)*(p.type==='BUY'?1:-1)*p.size;p.open=false;balance+=p.profit;net+=p.profit;if(p.profit>0)wins++;else if(p.profit<0)losses++;closed(s,p);}
    for(let i=0;i<to;i++){
      const f=record.ticks[i];
      if(i<from){observe(s,account(),f.news);if(f.bar){bars.push(f.bar);bars=bars.slice(-500);if(s.lastRelease!==null&&f.time>=s.lastRelease+2){s.newsBars++;if(f.news.active&&!s.newsRef)s.newsRef={...f.bar};}}continue;}
      for(const p of orders.filter(p=>p.open)){const exit=exitPrice(f.price,p.type),d=p.type==='BUY'?1:-1;p.profit=(exit-p.entry)*d*p.size;if(d*(exit-p.sl)<=0||d*(exit-p.tp)>=0)close(p,f.price);}
      // Account liquidation remains active after an EA loss-streak pause.
      if(account().equity<=0)orders.filter(p=>p.open).forEach(p=>close(p,f.price));
      observe(s,account(),f.news);const stopped=risk(s,c,account());if(stopped){reason=stopped.reason;if(stopped.close)orders.filter(p=>p.open).forEach(p=>close(p,f.price));}
      if(!s.halted)for(const p of orders.filter(p=>p.open))p.sl=trailingStop(p,f.price);
      if(f.bar){bars.push(f.bar);bars=bars.slice(-500);if(!s.halted){const p=decide(s,c,bars,f.news,f.time,f.price,account(),orders.filter(p=>p.open));if(!p.error){orders.push({...p,id:++id,open:true,source:'ea',profit:-p.openingLoss});costs+=p.openingLoss;s.lastEntry=f.time;}}}
      observe(s,account(),f.news);
      if(f.bar)curve.push({time:f.time,equity:account().equity});
    }
    const final=account();
    costs=orders.reduce((sum,p)=>{const mid=p.open?record.ticks[to-1].price:p.exitMid,d=p.type==='BUY'?1:-1;return sum+d*(p.entry-p.marketPrice+mid-exitPrice(mid,p.type))*p.size;},0);
    return {equity:final.equity,net:final.equity-record.equity,realized:net,drawdown:s.maxDD,trades:orders.length,wins,losses,open:orders.filter(p=>p.open).length,costs,reason,curve};
  }
  // Bundle the same engine into a worker without fetching another file. This
  // also permits replay when the simulator is opened directly from disk.
  function workerScript() {
    return '('+installEACore.toString()+')(self);self.onmessage = function(event) { try { const {tape,config,from,to}=event.data;self.postMessage({result:self.EACore.replay(tape,config,from,to)}); } catch(error) { self.postMessage({error:error.message}); } };';
  }
  const api={strategies,defaults,validate,state,observe,closed,risk,signals,plan,decide,trailingStop,spread,exitPrice,replay,atr,workerScript,keyLevels,supportResistanceSignal};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.EACore=api;
})(typeof globalThis==='object'?globalThis:this);
