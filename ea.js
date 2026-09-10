'use strict';
const ea = {config:{...EACore.defaults,strategies:[...EACore.defaults.strategies]}, enabled:false,
  state:null, logs:[], lastStatus:'EA is off.', lastRender:-Infinity, recording:false, tape:null, results:[], worker:null};
const eaField = id => document.getElementById('ea'+id);
const eaOpen = () => positions.filter(p=>p.open&&p.source==='ea');
function eaPublicNews() {
  const event=activeNews;
  const next=NEWS_CONFIG.fixed.enabled?Object.values(nextFixedNewsTimes).filter(t=>t>marketSeconds):[];
  return {active:Boolean(event),key:event?event.id+':'+event.startTime:null,start:event?event.startTime:null,
    nextFixed:next.length?Math.min(...next):null};
}
function eaLog(message) {
  if(ea.logs.at(-1)?.message===message)return;
  ea.logs.push({time:marketSeconds,message});ea.logs=ea.logs.slice(-60);
  const list=eaField('Log');if(!list)return;
  const row=document.createElement('li');row.textContent=formatNewsClock(marketSeconds)+' · '+message;list.prepend(row);
  while(list.children.length>60)list.lastElementChild.remove();
}
function eaSetStatus(message,log=false) {ea.lastStatus=message;if(log)eaLog(message);}
function eaReadConfig() {
  const c={...ea.config};
  c.strategies=Object.keys(EACore.strategies).filter(k=>document.getElementById('eaStrategy-'+k).checked);
  for(const k of ['sizing','slMode','tpMode'])c[k]=document.getElementById('ea-'+k).value;
  for(const k of ['lots','riskPct','leverage','slValue','tpValue','maxPositions','maxLots','maxDrawdown','lossLimit','cooldown','avoidSeconds','waitBars'])c[k]=Number(document.getElementById('ea-'+k).value);
  for(const k of ['tradeNews','trailing','breakEven'])c[k]=document.getElementById('ea-'+k).checked;
  return c;
}
function eaWriteConfig(c) {
  for(const k of Object.keys(EACore.strategies))document.getElementById('eaStrategy-'+k).checked=c.strategies.includes(k);
  for(const [k,v] of Object.entries(c)){if(k==='strategies')continue;const input=document.getElementById('ea-'+k);if(input){if(typeof v==='boolean')input.checked=v;else input.value=String(v);}}
  eaSelectionUI();
}
function eaSelectionUI() {
  const selected=Object.keys(EACore.strategies).filter(k=>document.getElementById('eaStrategy-'+k).checked);
  updateLiveText(eaField('SelectionCount'),selected.length+' / 3 selected');
  for(const k of Object.keys(EACore.strategies)){const box=document.getElementById('eaStrategy-'+k);box.disabled=selected.length>=3&&!box.checked;}
  const risk=document.getElementById('ea-sizing').value==='risk';
  document.getElementById('ea-lots').disabled=risk;
  document.getElementById('ea-riskPct').disabled=!risk;
  const labels={price:'% of entry price',equity:'% of equity at entry',cash:'Dollars per trade',atr:'ATR14 multiplier',swing:'ATR14 buffer beyond 10-candle swing',reward:'Multiple of initial SL distance'};
  for(const key of ['sl','tp'])updateLiveText(eaField(key==='sl'?'SLUnit':'TPUnit'),labels[document.getElementById('ea-'+key+'Mode').value]);
}
function eaStrategyChange(key) {
  const box=document.getElementById('eaStrategy-'+key);
  const count=Object.keys(EACore.strategies).filter(k=>document.getElementById('eaStrategy-'+k).checked).length;
  if(count>3){box.checked=false;notifyTrading('Select up to three EA strategies.');}
  if(key==='news'&&box.checked)document.getElementById('ea-tradeNews').checked=true;
  eaSelectionUI();
}
function eaNewsChange() {
  if(!document.getElementById('ea-tradeNews').checked)document.getElementById('eaStrategy-news').checked=false;
  eaSelectionUI();
}
function eaApplySettings() {
  const c=eaReadConfig(),error=EACore.validate(c);if(error){notifyTrading(error);return false;}
  ea.config=c;try{localStorage.setItem('frx-ea-settings-v1',JSON.stringify(c));}catch{}
  eaLog('Settings applied. Existing trade sizes and exits are unchanged.');
  eaSetStatus(ea.enabled?'Settings applied; waiting for the next candle.':'EA is off. Settings saved.');
  eaRender(true);return true;
}
function eaToggle() {
  const on=eaField('Enabled').checked;
  if(!on){ea.enabled=false;eaSetStatus('EA is off. Existing TP/SL orders remain active.',true);eaRender(true);return;}
  if(!isMarketOpen()){eaField('Enabled').checked=false;notifyTrading('Start the market before enabling the EA.');return;}
  if(ea.state?.halted){eaField('Enabled').checked=false;notifyTrading('Close EA positions and start a new EA risk session before restarting.');return;}
  if(!eaApplySettings()){eaField('Enabled').checked=false;return;}
  if(!ea.state)ea.state=EACore.state(accountSnapshot().equity);
  ea.state.lastBar=(currentCandle?data.at(-2):data.at(-1))?.time;
  ea.enabled=true;eaSetStatus('EA is on. Waiting for a completed candle.',true);eaRender(true);
}
function eaNewSession() {
  if(!isMarketOpen())return notifyTrading('Start the market before resetting EA risk tracking.');
  if(eaOpen().length)return notifyTrading('Close EA positions before starting a new risk session.');
  ea.enabled=false;eaField('Enabled').checked=false;ea.state=EACore.state(accountSnapshot().equity);
  eaSetStatus('New risk session ready. Switch EA on to trade.',true);eaRender(true);
}
function eaClosePositions() {
  if(!isMarketOpen())return notifyTrading('Start the market before closing EA trades.');
  ea.enabled=false;eaField('Enabled').checked=false;
  for(const p of eaOpen())closeTrade(p.id,true);
  eaSetStatus('EA positions closed; EA is off.',true);eaRender(true);
}
function eaOnTradeClosed(p) {
  if(!ea.state||p.source!=='ea')return;
  EACore.closed(ea.state,p);eaLog('Closed EA #'+p.id+' · '+(p.profit>=0?'+':'')+'$'+p.profit.toFixed(2));
}
function eaOnAccountReset() {
  ea.enabled=false;eaField('Enabled').checked=false;ea.state=null;
  if(ea.recording){ea.recording=false;eaLog('Recording stopped because the account was reset.');}
  eaSetStatus('Account reset. EA is off.');eaRender(true);
}
function eaPriceTick() {
  if(!isMarketOpen())return;
  const news=eaPublicNews(),account=accountSnapshot();
  if(ea.recording){
    if(ea.tape.ticks.length>=100000){ea.recording=false;eaLog('Recording reached 100,000 ticks and was stopped. Save it before starting another.');}
    else ea.tape.ticks.push({time:marketSeconds,price:currentTickPrice,news,bar:null});
  }
  if(ea.state)EACore.observe(ea.state,account,news);
  if(ea.enabled&&ea.state){
    const stopped=EACore.risk(ea.state,ea.config,account);
    if(stopped){
      ea.enabled=false;eaField('Enabled').checked=false;
      if(stopped.close)for(const p of eaOpen())closeTrade(p.id,true);
      eaSetStatus(stopped.reason+' EA is off.',true);notifyTrading(ea.lastStatus);
    }else{
      for(const p of eaOpen()){
        const stop=EACore.trailingStop(p,currentTickPrice);
        if(stop!==p.sl){p.sl=stop;createOrUpdateSLLine(p);}
      }
    }
  }
  eaRender();
}
function eaCandleClosed(candle) {
  if(ea.recording&&ea.tape.ticks.length)ea.tape.ticks.at(-1).bar={...candle};
  if(!ea.enabled||!isMarketOpen()||!ea.state)return;
  const decision=EACore.decide(ea.state,ea.config,data,eaPublicNews(),marketSeconds,currentTickPrice,accountSnapshot(),positions.filter(p=>p.open));
  if(decision.error){eaSetStatus(decision.error);if(!decision.error.startsWith('Waiting'))eaLog('Skipped: '+decision.error);}
  else {
    const p=placeOrder(decision.type,{...decision,source:'ea'});
    if(p){ea.state.lastEntry=marketSeconds;EACore.observe(ea.state,accountSnapshot(),eaPublicNews());eaLog('Opened '+p.type+' #'+p.id+' · '+p.lots.toFixed(2)+' lots · '+decision.strategies.map(k=>EACore.strategies[k][0]).join(', '));eaSetStatus('Trade opened. Waiting for the next signal.');}
    else eaSetStatus('Entry rejected by the account checks.');
  }
  eaRender(true);
}
function eaRender(force=false) {
  if(typeof batchingTicks==='boolean'&&batchingTicks)return;
  if(!force&&marketSeconds-ea.lastRender<.5)return;ea.lastRender=marketSeconds;
  updateLiveText(eaField('Status'),!isMarketOpen()&&ea.enabled?'Market paused; EA is waiting.':ea.lastStatus);
  updateLiveText(eaField('OpenCount'),String(eaOpen().length));
  updateLiveText(eaField('Drawdown'),(ea.state?.drawdown||0).toFixed(2)+'%');
  updateLiveText(eaField('Losses'),String(ea.state?.losses||0));
  updateLiveText(eaField('RecordStatus'),(ea.recording?'Recording · ':'')+(ea.tape?ea.tape.ticks.length.toLocaleString()+' ticks':'No recording'));
  updateLiveText(eaField('RecordButton'),ea.recording?'Stop recording':'Start new recording');
  const bars=currentCandle?data.slice(0,-1):data;
  const buy=EACore.plan(ea.config,'BUY',bars,currentTickPrice,accountSnapshot());
  updateLiveText(eaField('Preview'),buy.error?'Buy estimate: '+buy.error:'Buy estimate · '+buy.lots.toFixed(2)+' lots · planned loss $'+buy.risk.toFixed(2)+' · margin $'+buy.margin.toFixed(2));
}
function eaRecord() {
  if(ea.recording){ea.recording=false;eaLog('Recording stopped.');eaRender(true);return;}
  if(!isMarketOpen())return notifyTrading('Start the market before recording.');
  if(accountSnapshot().equity<=0)return notifyTrading('Reset the account to positive equity before starting a recording.');
  if(ea.tape?.ticks.length)return notifyTrading('Save your current recording, then use Clear recording before starting another.');
  ea.tape={version:1,contract:'FRX-1-unit',equity:accountSnapshot().equity,history:(currentCandle?data.slice(0,-1):data).slice(-500).map(b=>({...b})),ticks:[]};
  ea.recording=true;eaLog('Recording public ticks and closed candles. Replay starts a separate account at current equity.');eaRender(true);
}
function eaClearRecording(){if(ea.recording||ea.worker)return notifyTrading('Stop recording and cancel any replay before clearing it.');ea.tape=null;ea.results=[];eaRenderResults();eaRender(true);}
function eaDownload(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function eaSaveRecording(){if(!ea.tape?.ticks.length)return notifyTrading('Record some market ticks first.');eaDownload('frx-replay.json',ea.tape);}
function eaSavePreset(){const c=eaReadConfig(),error=EACore.validate(c);if(error)return notifyTrading(error);eaDownload('frx-ea-preset.json',{version:1,settings:c});}
function eaValidTape(t) {
  if(t?.version!==1||t.contract!=='FRX-1-unit'||!Number.isFinite(t.equity)||t.equity<=0||!Array.isArray(t.history)||t.history.length<51||t.history.length>500||!Array.isArray(t.ticks)||!t.ticks.length||t.ticks.length>100000)return false;
  const bar=b=>b&&['time','open','high','low','close'].every(k=>Number.isFinite(b[k]))&&b.low>=.01&&b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close);
  if(!t.history.every(bar)||t.history.some((b,i)=>i>0&&b.time<=t.history[i-1].time))return false;
  let time=-Infinity,barTime=t.history.at(-1).time;
  for(const f of t.ticks){if(!f||!Number.isFinite(f.time)||f.time<time||!Number.isFinite(f.price)||f.price<.01||!f.news||typeof f.news.active!=='boolean')return false;
    const n=f.news;if(n.active&&(typeof n.key!=='string'||!Number.isFinite(n.start)||n.start>f.time))return false;if(n.nextFixed!==null&&!Number.isFinite(n.nextFixed))return false;
    if(f.bar){if(!bar(f.bar)||f.bar.time<=barTime||Math.abs(f.bar.close-f.price)>1e-7)return false;barTime=f.bar.time;}time=f.time;
  }
  return true;
}
async function eaImport(input,kind) {
  const file=input.files?.[0];if(!file)return;
  try{
    if(file.size>40000000)throw Error('File is too large (40 MB maximum).');
    const value=JSON.parse(await file.text());
    if(kind==='preset'){if(value.version!==1)throw Error('Unsupported preset.');const error=EACore.validate(value.settings||{});if(error)throw Error(error);eaWriteConfig(value.settings);notifyTrading('Preset loaded. Apply settings to use it.');}
    else{if(ea.recording)throw Error('Stop recording before importing.');if(ea.tape?.ticks.length)throw Error('Save and clear your current recording before importing another.');if(!eaValidTape(value))throw Error('Invalid FRX replay file.');ea.tape=value;eaRender(true);}
  }catch(error){notifyTrading(error.message);}finally{input.value='';}
}
function eaRunReplay() {
  if(ea.worker)return notifyTrading('A replay is already running.');
  if(ea.recording)return notifyTrading('Stop recording before running a replay.');
  if(!ea.tape?.ticks.length)return notifyTrading('Record or import ticks first.');
  const c=eaReadConfig(),error=EACore.validate(c);if(error)return notifyTrading(error);
  if(typeof Worker==='undefined')return notifyTrading('Replay needs Web Worker support. Use a current browser.');
  const mode=eaField('ReplayRange').value,tape=ea.tape;
  let split=Math.floor(tape.ticks.length*.7);
  while(split<tape.ticks.length&&!tape.ticks[split].bar)split++;
  split=Math.min(tape.ticks.length,split+1);
  const from=mode==='forward'?split:0,to=mode==='development'?split:tape.ticks.length;
  if(to-from<10)return notifyTrading('Record a longer session for this test segment.');
  const label=mode==='forward'?'Forward: final 30%':mode==='development'?'First 70%':'Full recording';
  try{
    const url=URL.createObjectURL(new Blob([EACore.workerScript()],{type:'text/javascript'}));
    let worker;try{worker=new Worker(url);}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
    ea.worker=worker;eaField('ReplayButton').disabled=true;
    updateLiveText(eaField('ReplayStatus'),'Testing '+label.toLowerCase()+'…');
    worker.onmessage=event=>{
      if(ea.worker!==worker)return;
      if(event.data.error)notifyTrading(event.data.error);
      else{ea.results.push({config:c,result:event.data.result,label});ea.results=ea.results.slice(-8);eaRenderResults();}
      eaStopReplay();updateLiveText(eaField('ReplayStatus'),'Replay finished. Live account unchanged.');
    };
    worker.onerror=()=>{if(ea.worker!==worker)return;eaStopReplay();notifyTrading('Replay worker could not run. Check browser support for background workers.');};
    worker.postMessage({tape,config:c,from,to});
  }catch{eaStopReplay();notifyTrading('Replay worker could not start. Check browser support for background workers.');}
}
function eaStopReplay(){if(ea.worker)ea.worker.terminate();ea.worker=null;eaField('ReplayButton').disabled=false;updateLiveText(eaField('ReplayStatus'),'Replay idle.');}
function eaRenderResults() {
  const body=eaField('Results');body.textContent='';
  for(const [i,run] of ea.results.entries()){
    const r=run.result,row=document.createElement('tr');
    for(const text of [String(i+1),run.label,run.config.strategies.map(k=>EACore.strategies[k][0]).join(' + '),'$'+r.net.toFixed(2),r.drawdown.toFixed(2)+'%',String(r.trades),r.wins+' / '+r.losses+' / '+r.open,'$'+r.costs.toFixed(2),r.reason||'Complete']){const td=document.createElement('td');td.textContent=text;row.appendChild(td);}body.appendChild(row);
  }
  const canvas=eaField('Curve'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);
  const last=ea.results.at(-1);if(!last){updateLiveText(eaField('CurveText'),'Replay equity will appear here.');return;}
  const points=last.result.curve;if(points.length<2){updateLiveText(eaField('CurveText'),'Record more completed candles to plot an equity curve.');return;}
  const min=Math.min(...points.map(p=>p.equity)),max=Math.max(...points.map(p=>p.equity)),span=max-min||1;
  ctx.strokeStyle='#54d7aa';ctx.lineWidth=2;ctx.beginPath();points.forEach((p,i)=>{const x=12+i/(points.length-1)*(canvas.width-24),y=12+(1-(p.equity-min)/span)*(canvas.height-24);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
  updateLiveText(eaField('CurveText'),'Latest replay equity: $'+last.result.equity.toFixed(2)+'. Chart range $'+min.toFixed(2)+'–$'+max.toFixed(2)+'.');
}
function eaExportResults(){if(!ea.results.length)return notifyTrading('Run a replay first.');eaDownload('frx-ea-comparison.json',ea.results);}
function eaInit() {
  const grid=eaField('Strategies');
  for(const [key,[name,description]] of Object.entries(EACore.strategies)){
    const label=document.createElement('label'),box=document.createElement('input'),text=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');
    box.type='checkbox';box.id='eaStrategy-'+key;box.addEventListener('change',()=>eaStrategyChange(key));strong.textContent=name;small.textContent=description;text.append(strong,small);label.append(box,text);grid.appendChild(label);
  }
  try{const saved=JSON.parse(localStorage.getItem('frx-ea-settings-v1'));if(saved&&!EACore.validate(saved))ea.config=saved;}catch{}
  eaWriteConfig(ea.config);eaField('Enabled').checked=false;eaRender(true);
}
eaInit();
