// ---- Chart setup ----
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  width: 900,
  height: 450,
  layout: { backgroundColor: '#ffffff', textColor: '#DDD' },
  grid: { vertLines: { color: '#222' }, horzLines: { color: '#222' } },
});
const candleSeries = chart.addCandlestickSeries();

let data = [];
let time = 0;
let marketInterval = null;

const priceDisplay = document.getElementById('priceDisplay');

// ---- Retracement params ----
const RETRACE_THRESHOLD = 0.1;   // trigger only if move >= 0.1
const RETRACE_MIN_FRAC = 0.60;   // 60%
const RETRACE_MAX_FRAC = 0.70;   // 70%

let retraceTarget = null;
let retraceSteps = 0; // candles left in retracement

// ---- Format helper ----
function fmt(num) {
  return Number(num).toFixed(5);
}

// ---- Init first candle ----
function initChart() {
  const initialPrice = 1.20000;
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

  retraceSteps = Math.floor(Math.random() * 20) + 20; // 20–40 candles

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
function generateCandle() {
  time++;
  const lastPrice = data[data.length - 1].close;
  let newClose;

  if (retraceTarget !== null && retraceSteps > 0) {
    // ---- Retracement mode ----
    const stepSize = (retraceTarget - lastPrice) / retraceSteps;

    // Zig-zag movement
    const noise = (Math.random() - 0.5) * stepSize * 2;
    newClose = lastPrice + stepSize + noise;

    retraceSteps--;

    // Clamp overshoot
    if ((stepSize > 0 && newClose > retraceTarget) ||
        (stepSize < 0 && newClose < retraceTarget)) {
      newClose = retraceTarget;
    }

    if (retraceSteps <= 0) retraceTarget = null;
  } else {
    // ---- Normal volatility ----
    const drift = (Math.random() - 0.5) * 0.1;
    newClose = Math.max(0.00001, lastPrice + drift);

    if (Math.abs(drift) >= RETRACE_THRESHOLD) {
      triggerRetracement(lastPrice, newClose);
    }
  }

  const open = lastPrice;
  const high = Math.max(open, newClose) + Math.random() * 0.02;
  const low = Math.min(open, newClose) - Math.random() * 0.02;

  const newCandle = {
    time,
    open,
    high: Math.max(high, open, newClose),
    low: Math.min(low, open, newClose),
    close: newClose,
  };

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
