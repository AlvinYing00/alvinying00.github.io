// ---- Chart setup ----
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  width: 900,
  height: 450,
  layout: { backgroundColor: '#ffffff', textColor: '#333' },
  grid: { vertLines: { color: '#eee' }, horzLines: { color: '#eee' } },
});
const candleSeries = chart.addCandlestickSeries();

let data = [];
let time = 0;
let marketInterval = null;

const priceDisplay = document.getElementById('priceDisplay');

// ---- Retracement params ----
const RETRACE_THRESHOLD = 0.1; // only trigger retrace for moves >= 0.1
const RETRACE_MIN_FRAC = 0.60; // 60% back
const RETRACE_MAX_FRAC = 0.70; // 70% back

let retraceTarget = null;
let retraceStepsRemaining = 0;
let retraceTotalSteps = 0;

// Format helper (5 decimal places for forex-like look)
function fmt(num) {
  return Number(num).toFixed(5);
}

// Seed the chart with a first candle so chart is not blank
function initChart() {
  const initialPrice = 1.20000; // starting price
  const firstCandle = {
    time: ++time,
    open: initialPrice,
    high: initialPrice + 0.0010,
    low: initialPrice - 0.0010,
    close: initialPrice,
  };
  data.push(firstCandle);
  candleSeries.setData(data);
  updatePriceDisplay();
}
initChart();

function updatePriceDisplay() {
  const last = data[data.length - 1].close;
  priceDisplay.textContent = 'Current: ' + fmt(last);
}

// ---- Utility: trigger retracement after a big move ----
function triggerRetracement(prevPrice, movedPrice) {
  const delta = movedPrice - prevPrice;
  if (Math.abs(delta) < RETRACE_THRESHOLD) return; // don't trigger

  const frac = RETRACE_MIN_FRAC + Math.random() * (RETRACE_MAX_FRAC - RETRACE_MIN_FRAC); // 0.60-0.70
  const target = movedPrice - delta * frac; // move back by frac of the big move

  retraceTarget = Math.max(0.00001, target); // safety floor
  retraceStepsRemaining = Math.floor(Math.random() * 4) + 3; // 3 - 6 candles
  retraceTotalSteps = retraceStepsRemaining;

  console.log('Retrace TRIGGERED:', {
    prevPrice: prevPrice,
    movedPrice: movedPrice,
    delta: delta,
    frac: Number(frac.toFixed(3)),
    target: Number(retraceTarget.toFixed(5)),
    steps: retraceStepsRemaining,
  });
}

// ---- Auto market generator ----
function generateCandle() {
  time++;
  const lastPrice = data[data.length - 1].close;
  let newClose;

  if (retraceTarget !== null && retraceStepsRemaining > 0) {
    // ---- Retracement mode: move smoothly toward retraceTarget ----
    // Compute linear step and add a little small noise (kept small)
    const step = (retraceTarget - lastPrice) / retraceStepsRemaining;
    const noiseBound = Math.min(Math.abs(step) * 0.25, 0.005); // noise <= 0.005 or 25% of step
    const noise = (Math.random() - 0.5) * 2 * noiseBound;
    newClose = lastPrice + step + noise;
    retraceStepsRemaining--;

    if (retraceStepsRemaining <= 0) {
      // finish retrace (tiny final snap to target if very close)
      newClose = retraceTarget;
      retraceTarget = null;
      retraceStepsRemaining = 0;
    }
  } else {
    // ---- Normal (volatile) mode ----
    // Use a stronger volatility but keep values safe
    const drift = (Math.random() - 0.5) * 0.12; // typical ±0.06 (adjust to taste)
    newClose = Math.max(0.00001, lastPrice + drift);
  }

  // Build valid high/low so chart library never errors
  const open = lastPrice;
  const baseSpike = Math.max(Math.abs(newClose - lastPrice) * 0.6, 0.003); // taller when move is large
  let high = Math.max(open, newClose) + Math.random() * baseSpike;
  let low  = Math.min(open, newClose) - Math.random() * baseSpike;

  // Safety corrections
  high = Math.max(high, open, newClose);
  low  = Math.min(low, open, newClose);
  low  = Math.max(low, 0.00001); // never go to zero or negative

  const newCandle = {
    time: time,
    open: open,
    high: high,
    low: low,
    close: newClose,
  };

  // Push candle
  data.push(newCandle);

  // If this candle was a "big move" (and not already in retrace), schedule retrace for next ticks
  const moveAmount = newClose - open;
  if (!retraceTarget && Math.abs(moveAmount) >= RETRACE_THRESHOLD) {
    // Trigger retrace based on this big candle
    triggerRetracement(open, newClose);
  }

  // Keep memory light
  if (data.length > 500) data.shift();

  // Render + update display
  candleSeries.setData(data);
  updatePriceDisplay();
}

// ---- Pump (manual user action) ----
function pump() {
  const raw = document.getElementById('priceInput').value;
  const v = Number(raw);
  if (!isFinite(v) || raw === '') return alert('Enter a valid number (delta).');
  const delta = Math.abs(v);

  const lastPrice = data[data.length - 1].close;
  const targetPrice = Math.max(0.00001, lastPrice + delta); // pump up

  // Add manual big-move candle
  time++;
  const open = lastPrice;
  const close = targetPrice;
  const baseSpike = Math.max(Math.abs(close - open) * 0.6, 0.003);
  const high = Math.max(open, close) + Math.random() * baseSpike;
  const low  = Math.min(open, close) - Math.random() * baseSpike;

  const newCandle = {
    time: time,
    open: open,
    high: Math.max(high, open, close),
    low:  Math.min(low, open, close),
    close: close,
  };

  data.push(newCandle);

  // Immediately trigger retracement if this was a big move (>= threshold)
  if (Math.abs(targetPrice - lastPrice) >= RETRACE_THRESHOLD) {
    triggerRetracement(lastPrice, targetPrice);
  }

  if (data.length > 500) data.shift();
  candleSeries.setData(data);
  updatePriceDisplay();
}

// ---- Optional: keep dump() if you need it later ----
function dump() {
  const raw = document.getElementById('priceInput').value;
  const v = Number(raw);
  if (!isFinite(v) || raw === '') return alert('Enter a valid number (delta).');
  const delta = Math.abs(v);

  const lastPrice = data[data.length - 1].close;
  const targetPrice = Math.max(0.00001, lastPrice - delta); // dump down

  time++;
  const open = lastPrice;
  const close = targetPrice;
  const baseSpike = Math.max(Math.abs(close - open) * 0.6, 0.003);
  const high = Math.max(open, close) + Math.random() * baseSpike;
  const low  = Math.min(open, close) - Math.random() * baseSpike;

  const newCandle = {
    time: time,
    open: open,
    high: Math.max(high, open, close),
    low:  Math.min(low, open, close),
    close: close,
  };

  data.push(newCandle);

  if (Math.abs(targetPrice - lastPrice) >= RETRACE_THRESHOLD) {
    triggerRetracement(lastPrice, targetPrice);
  }

  if (data.length > 500) data.shift();
  candleSeries.setData(data);
  updatePriceDisplay();
}

// ---- Start/Stop live market ----
function toggleMarket() {
  if (marketInterval) {
    clearInterval(marketInterval);
    marketInterval = null;
    console.log('Market stopped.');
  } else {
    marketInterval = setInterval(generateCandle, 1000); // 1 second
    console.log('Market started.');
  }
}
