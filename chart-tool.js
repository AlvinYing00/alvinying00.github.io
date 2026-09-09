// Drawings are anchored to simulated time and price, not screen pixels.
(() => {
  const toolbar = document.createElement('div');
  toolbar.className = 'drawingToolbar';
  toolbar.innerHTML = `<button id="horizontalTool" type="button" aria-pressed="false">― Horizontal line</button>
    <button id="trendTool" type="button" aria-pressed="false">╱ Slope line</button>
    <button id="cancelDrawing" type="button" disabled>Cancel</button>
    <select id="drawingSelection" aria-label="Select drawing"><option value="">No drawings</option></select>
    <button id="deleteDrawing" type="button" disabled>Delete line</button>
    <span id="drawingHint" role="status">Draw a line, then drag it or its endpoints to edit.</span>`;
  chartElement.before(toolbar);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('chartOverlay');
  svg.setAttribute('aria-hidden', 'true');
  chartElement.appendChild(svg);
  const selection = document.getElementById('drawingSelection');
  const hint = document.getElementById('drawingHint');
  const drawings = [];
  let nextId = 1, mode = null, first = null, signature = '';
  let drag = null;
  let chartInView = true;
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver(entries => {
      chartInView = entries[0].isIntersecting;
    }).observe(chartElement);
  }

  function setMode(value) {
    mode = value; first = null;
    document.getElementById('horizontalTool').setAttribute('aria-pressed', String(value === 'horizontal'));
    document.getElementById('trendTool').setAttribute('aria-pressed', String(value === 'slope'));
    document.getElementById('cancelDrawing').disabled = !value;
    hint.textContent = value === 'horizontal' ? 'Click the chart at your price level.' : value === 'slope'
      ? 'Click two different candles to draw a slope line.' : 'Choose a tool to draw on the chart.';
  }
  function refreshList(selected) {
    selection.replaceChildren();
    if (!drawings.length) selection.add(new Option('No drawings', ''));
    for (const line of drawings) selection.add(new Option(`${line.type === 'horizontal' ? 'Horizontal' : 'Slope'} #${line.id}`, String(line.id)));
    if (selected) selection.value = String(selected);
    document.getElementById('deleteDrawing').disabled = !drawings.length;
    signature = '';
  }
  document.getElementById('horizontalTool').addEventListener('click', () => setMode('horizontal'));
  document.getElementById('trendTool').addEventListener('click', () => setMode('slope'));
  document.getElementById('cancelDrawing').addEventListener('click', () => setMode(null));
  document.getElementById('deleteDrawing').addEventListener('click', () => {
    const index = drawings.findIndex(line => String(line.id) === selection.value);
    if (index >= 0) drawings.splice(index, 1);
    refreshList();
    hint.textContent = 'Drawing deleted.';
  });
  selection.addEventListener('change', () => { signature = ''; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setMode(null); });
  chart.subscribeClick(param => {
    if (!mode || !param.point) return;
    const price = candleSeries.coordinateToPrice(param.point.y);
    if (!Number.isFinite(price) || price < 0.01) return;
    if (mode === 'horizontal') {
      drawings.push({id: nextId++, type: mode, price});
    } else {
      if (typeof param.time !== 'number') { hint.textContent = 'Choose a point above an existing candle.'; return; }
      const point = {time:param.time, price};
      if (!first) { first = point; hint.textContent = 'Now click a second candle. Escape cancels.'; return; }
      if (first.time === point.time) { hint.textContent = 'Choose a different candle for the second point.'; return; }
      drawings.push({id: nextId++, type: mode, first, second:point});
    }
    refreshList(nextId - 1); setMode(null);
    hint.textContent = 'Drag the line to move it; drag its handles to change the slope.';
  });
  function element(tag, attrs, text) {
    const node = document.createElementNS(svg.namespaceURI, tag);
    for (const [key,value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    if (text) node.textContent = text;
    svg.appendChild(node);
    return node;
  }
  function xForTime(time) {
    // Logical conversion keeps endpoints anchored after the history limit rolls.
    return chart.timeScale().logicalToCoordinate((time - data[0].time) / (CANDLE_INTERVAL_MS / 1000));
  }
  function coordinates(line) {
    if(line.type==='horizontal') {
      const y=candleSeries.priceToCoordinate(line.price);
      return {x1:0,x2:chart.timeScale().width(),y1:y,y2:y};
    }
    return {x1:xForTime(line.first.time),x2:xForTime(line.second.time),
      y1:candleSeries.priceToCoordinate(line.first.price),y2:candleSeries.priceToCoordinate(line.second.price)};
  }
  function hitTest(point) {
    const ordered=[...drawings].sort((a,b)=>Number(String(a.id)===selection.value)-Number(String(b.id)===selection.value)).reverse();
    for(const line of ordered) {
      const c=coordinates(line);
      if(!Object.values(c).every(Number.isFinite))continue;
      if(line.type==='slope' && String(line.id)===selection.value) {
        if(Math.hypot(point.x-c.x1,point.y-c.y1)<14)return {line,part:'first'};
        if(Math.hypot(point.x-c.x2,point.y-c.y2)<14)return {line,part:'second'};
      }
      const dx=c.x2-c.x1,dy=c.y2-c.y1;
      const t=Math.max(0,Math.min(1,((point.x-c.x1)*dx+(point.y-c.y1)*dy)/(dx*dx+dy*dy||1)));
      if(Math.hypot(point.x-c.x1-t*dx,point.y-c.y1-t*dy)<10)return {line,part:'body'};
    }
    return null;
  }
  function pointerPoint(event) {
    const rect=chartElement.getBoundingClientRect();
    return {x:event.clientX-rect.left,y:event.clientY-rect.top};
  }
  function stopEvent(event) {event.preventDefault();event.stopImmediatePropagation();}
  function finishDrag(cancel=false) {
    if(!drag)return;
    const done=drag;drag=null;
    if(cancel)Object.assign(done.line,done.original);
    chart.applyOptions({handleScroll:done.scroll,handleScale:done.scale});
    chart.priceScale('right').applyOptions({autoScale:done.autoScale});
    if(chartElement.hasPointerCapture?.(done.id))chartElement.releasePointerCapture(done.id);
    signature='';
  }
  chartElement.addEventListener('pointerdown',event=>{
    if(mode || drag || (event.button!==undefined && event.button!==0) || event.isPrimary===false)return;
    const point=pointerPoint(event);
    if(point.x<0||point.x>chart.timeScale().width()||point.y<0||point.y>chartElement.clientHeight-chart.timeScale().height())return;
    const hit=hitTest(point);if(!hit)return;
    const price=candleSeries.coordinateToPrice(point.y),logical=chart.timeScale().coordinateToLogical(point.x);
    if(!Number.isFinite(price)||!Number.isFinite(logical))return;
    const options=chart.options();
    drag={...hit,id:event.pointerId,price,logical,original:JSON.parse(JSON.stringify(hit.line)),
      scroll:{...options.handleScroll},scale:JSON.parse(JSON.stringify(options.handleScale)),
      autoScale:chart.priceScale('right').options().autoScale};
    selection.value=String(hit.line.id);signature='';
    chart.applyOptions({handleScroll:false,handleScale:false});
    chart.priceScale('right').applyOptions({autoScale:false});
    chartElement.setPointerCapture(event.pointerId);stopEvent(event);
    hint.textContent='Drag to edit. Escape cancels. Delete removes the selected drawing.';
  },{capture:true,passive:false});
  chartElement.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    stopEvent(event);
    const point=pointerPoint(event),price=candleSeries.coordinateToPrice(point.y);
    const logical=chart.timeScale().coordinateToLogical(point.x);
    if(!Number.isFinite(price)||!Number.isFinite(logical))return;
    const line=drag.line,original=drag.original;
    if(line.type==='horizontal')line.price=Math.max(.01,original.price+price-drag.price);
    else if(drag.part==='body') {
      const dt=Math.round(logical-drag.logical)*CANDLE_INTERVAL_MS/1000;
      const dp=Math.max(price-drag.price,.01-Math.min(original.first.price,original.second.price));
      line.first={time:original.first.time+dt,price:original.first.price+dp};
      line.second={time:original.second.time+dt,price:original.second.price+dp};
    } else {
      const nextTime=data[0].time+Math.round(logical)*CANDLE_INTERVAL_MS/1000;
      const other=drag.part==='first'?'second':'first';
      if(nextTime!==line[other].time)line[drag.part]={time:nextTime,price:Math.max(.01,price)};
    }
    signature='';
  },{capture:true,passive:false});
  chartElement.addEventListener('pointerup',event=>{if(drag&&event.pointerId===drag.id){stopEvent(event);finishDrag();}},{capture:true});
  chartElement.addEventListener('pointercancel',event=>{if(drag&&event.pointerId===drag.id){stopEvent(event);finishDrag(true);}},{capture:true});
  chartElement.addEventListener('lostpointercapture',()=>finishDrag(true));
  // Prevent legacy chart touch handlers from also panning during a drawing drag.
  for(const name of ['touchstart','touchmove'])chartElement.addEventListener(name,event=>{if(drag)stopEvent(event);},{capture:true,passive:false});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')finishDrag(true);
    if(['INPUT','TEXTAREA','SELECT'].includes(event.target?.tagName))return;
    if(event.key==='Delete'&&!mode&&!drag)document.getElementById('deleteDrawing').click();
  });
  function render() {
    if (!document.hidden && chartInView && data.length) {
      const width = chart.timeScale().width();
      const height = chartElement.clientHeight - chart.timeScale().height();
      const entries = positions.filter(p => p.open).map(p => ({id:p.id,type:p.type,label:formatEntryLabel(p),profitClass:p.profit >= 0 ? 'profit' : 'loss',y:candleSeries.priceToCoordinate(p.entry)}));
      const lines = drawings.map(line => line.type === 'horizontal'
        ? {id:line.id,x1:0,x2:width,y1:candleSeries.priceToCoordinate(line.price),y2:candleSeries.priceToCoordinate(line.price)}
        : {id:line.id,x1:xForTime(line.first.time),x2:xForTime(line.second.time),y1:candleSeries.priceToCoordinate(line.first.price),y2:candleSeries.priceToCoordinate(line.second.price)});
      const marker = first ? {x:xForTime(first.time),y:candleSeries.priceToCoordinate(first.price)} : null;
      const next = JSON.stringify([width,height,entries,lines,selection.value,marker]);
      if (next !== signature) {
        signature = next;
        svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
        svg.replaceChildren();
        for (const line of lines) {
          if (![line.x1,line.x2,line.y1,line.y2].every(Number.isFinite)) continue;
          element('line', {...line, stroke:String(line.id) === selection.value ? '#ffe5a4' : '#edbe68', 'stroke-width':2});
          if(String(line.id)===selection.value) {
            const drawing=drawings.find(d=>d.id===line.id);
            if(drawing.type==='slope')for(const point of [{x:line.x1,y:line.y1},{x:line.x2,y:line.y2}])
              element('circle',{cx:point.x,cy:point.y,r:6,fill:'#111923',stroke:'#ffe5a4','stroke-width':2});
          }
        }
        if (marker && Number.isFinite(marker.x) && Number.isFinite(marker.y)) element('circle',{cx:marker.x,cy:marker.y,r:4,fill:'#edbe68'});
        // Keep every label at its entry level. Nearby entries intentionally overlap;
        // render in order so the newest entry appears above older ones.
        entries.filter(p => Number.isFinite(p.y) && p.y >= 0 && p.y <= height)
          .forEach(p => {
            const y = p.y;
            const color = p.type === 'BUY' ? '#2196f3' : '#ef4444';
            element('rect',{x:8,y:y-9,width:p.label.length*7+12,height:18,rx:3,fill:'#111923','fill-opacity':0.55,stroke:color,'stroke-opacity':0.7});
            // Share the dashboard's P/L classes so both displays always match.
            element('text',{x:14,y:y+4,class:p.profitClass,fill:'currentColor','font-size':11,'font-family':'monospace'},p.label);
          });
      }
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
