// ---- Chart setup ----
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  width: 900,
  height: 450,
  layout: { backgroundColor: '#000000', textColor: '#DDD' },
  grid: { 
    vertLines: { color: 'transparent' }, 
    horzLines: { color: 'transparent' } 
  },
});

const candleSeries = chart.addCandlestickSeries();

let data = [];
let time = 0;
let marketInterval = null;

const priceDisplay = document.getElementById('priceDisplay');

// ---- Retracement params ----
const RETRACE_THRESHOLD = 10;   // trigger only if move >= 10
const RETRACE_MIN_FRAC = 0.60;   // 60%
const RETRACE_MAX_FRAC = 0.70;   // 70%

let retraceTarget = null;
let retraceSteps = 0; // candles left in retracement

// ---- Format helper ----
function fmt(num) {
  return Number(num).toFixed(2); // only 2 decimals
}

// ---- Init first candle ----
function initChart() {
  const initialPrice = 100 + Math.random() * 900; // random between 100–1000
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
  if (!data.length) return;
  const last = data[data.length - 1].close;
  priceDisplay.textContent = 'Current: ' + fmt(last);
}

// ---- Utility: trigger retracement ----
function triggerRetracement(prevPrice, movedPrice) {
  const delta = movedPrice - prevPrice;
  if (Math.abs(delta) < RETRACE_THRESHOLD) return;

  const frac = RETRACE_MIN_FRAC + Math.random() * (RETRACE_MAX_FRAC - RETRACE_MIN_FRAC);
  retraceTarget = movedPrice - delta * frac;
  retraceTarget = Math.max(0.00001, retraceTarget);

  retraceSteps = Math.floor(Math.random() * 10) + 10; // 20–40 candles

  console.log('Retrace TRIGGERED:', {
    prevPrice,
    movedPrice,
    delta,
    frac: Number(frac.toFixed(3)),
    target: Number(retraceTarget.toFixed(5)),
    steps: retraceSteps,
  });
}

// ---- Auto market generator ----
let candleCounter = 0;
let nextBigMoveAt = Math.floor(Math.random() * 60) + 60; // between 60–120

function generateCandle() {
  time++;
  const lastPrice = data[data.length - 1].close;
  let newClose;

  // ---- Normal + Retracement only ----
  if (retraceTarget !== null && retraceSteps > 0) {
    const stepSize = (retraceTarget - lastPrice) / retraceSteps;
    const noise = (Math.random() - 0.5) * Math.abs(stepSize) * 3;
    newClose = lastPrice + stepSize + noise;
    retraceSteps--;
    if (retraceSteps <= 0) retraceTarget = null;
  } else {
    // Balanced volatility between 0.01 and 0.1
    const drift = (Math.random() < 0.5 ? -1 : 1) * (0.01 + Math.random() * 0.09);
    newClose = Math.max(0.01, lastPrice + drift);
    if (Math.abs(drift) >= RETRACE_THRESHOLD) triggerRetracement(lastPrice, newClose);
  }

  // ---- Candle body + wick ----
  const open = lastPrice;
  const bodyHigh = Math.max(open, newClose);
  const bodyLow = Math.min(open, newClose);
  const wickTop = bodyHigh + Math.random() * 0.02;
  const wickBottom = bodyLow - Math.random() * 0.02;

  const newCandle = { time, open, high: wickTop, low: wickBottom, close: newClose };
  data.push(newCandle);
  if (data.length > 500) data.shift();
  candleSeries.setData(data);
  updatePriceDisplay();
}

// ---- Pump (manual action) ----
function pump() {
  const raw = document.getElementById('priceInput').value;
  const v = Number(raw);
  if (!isFinite(v) || raw === '') return alert('Enter a valid number.');
  const delta = Math.abs(v);

  const lastPrice = data[data.length - 1].close;
  const targetPrice = Math.max(0.00001, lastPrice + delta);

  time++;
  const open = lastPrice;
  const close = targetPrice;
  const baseSpike = Math.max(Math.abs(close - open) * 0.6, 0.003);
  const high = Math.max(open, close) + Math.random() * baseSpike;
  const low  = Math.min(open, close) - Math.random() * baseSpike;

  const newCandle = { time, open, high, low, close };
  data.push(newCandle);

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
  let low  = Math.min(open, close) - Math.random() * baseSpike;

  // Prevent negative lows
  low = Math.max(0.01, low);

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
    marketInterval = setInterval(generateCandle, 1000);
    console.log('Market started.');
  }
}
