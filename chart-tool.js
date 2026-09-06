// Drawings are anchored to simulated time and price, not screen pixels.
(() => {
  const toolbar = document.createElement('div');
  toolbar.className = 'drawingToolbar';
  toolbar.innerHTML = `<button id="horizontalTool" type="button" aria-pressed="false">― Horizontal line</button>
    <button id="trendTool" type="button" aria-pressed="false">╱ Slope line</button>
    <button id="cancelDrawing" type="button" disabled>Cancel</button>
    <select id="drawingSelection" aria-label="Select drawing"><option value="">No drawings</option></select>
    <button id="deleteDrawing" type="button" disabled>Delete line</button>
    <span id="drawingHint" role="status">Choose a tool to draw on the chart.</span>`;
  chartElement.before(toolbar);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('chartOverlay');
  svg.setAttribute('aria-hidden', 'true');
  chartElement.appendChild(svg);
  const selection = document.getElementById('drawingSelection');
  const hint = document.getElementById('drawingHint');
  const drawings = [];
  let nextId = 1, mode = null, first = null, signature = '';

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
    if (!Number.isFinite(price) || price <= 0) return;
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
    hint.textContent = 'Line added. Select it in the list to delete it.';
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
  function render() {
    if (!document.hidden && data.length) {
      const width = chart.timeScale().width();
      const height = chartElement.clientHeight - chart.timeScale().height();
      const entries = positions.filter(p => p.open).map(p => ({id:p.id,type:p.type,label:formatEntryLabel(p),y:candleSeries.priceToCoordinate(p.entry)}));
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
        }
        if (marker && Number.isFinite(marker.x) && Number.isFinite(marker.y)) element('circle',{cx:marker.x,cy:marker.y,r:4,fill:'#edbe68'});
        // Keep every label at its entry level. Nearby entries intentionally overlap;
        // render in order so the newest entry appears above older ones.
        entries.filter(p => Number.isFinite(p.y) && p.y >= 0 && p.y <= height)
          .forEach(p => {
            const y = p.y;
            const color = p.type === 'BUY' ? '#2196f3' : '#ef4444';
            element('rect',{x:8,y:y-9,width:p.label.length*7+12,height:18,rx:3,fill:'#111923','fill-opacity':0.55,stroke:color,'stroke-opacity':0.7});
            element('text',{x:14,y:y+4,fill:color,'font-size':11,'font-family':'monospace'},p.label);
          });
      }
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
