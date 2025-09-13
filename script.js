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
const RETRACE_MIN_FRAC = 0.60;   // 60%
const RETRACE_MAX_FRAC = 0.80;   // 80%

let retraceTarget = null;
let retraceSteps = 0; // candles left in retracement

// ---- Format helper ----
function fmt(num) {
  return Number(num).toFixed(2); // only 2 decimals
}

// ---- Dynamic volatility & retrace threshold ----
function getVolatility(price) {
  const magnitude = Math.floor(Math.log10(price));
  const base = 0.01 * Math.pow(10, magnitude);
  return base + Math.random() * base * 7; // scales from base → base*8
}

function getRetraceThreshold(price) {
  const magnitude = Math.floor(Math.log10(price));
  return 0.5 * Math.pow(10, magnitude); // scales threshold with price
}

// ---- Init first candle ----
function initChart() {
  const initialPrice = 1 + Math.random() * 9; // random between 1 - 10
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
  if (Math.abs(delta) < getRetraceThreshold(prevPrice)) return;

  const frac = RETRACE_MIN_FRAC + Math.random() * (RETRACE_MAX_FRAC - RETRACE_MIN_FRAC);
  retraceTarget = movedPrice - delta * frac;
  retraceTarget = Math.max(0.00001, retraceTarget);

  retraceSteps = Math.floor(Math.random() * 10) + 10; // 10–19 candles

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
    // --- Retracement mode ---
    const stepSize = (retraceTarget - lastPrice) / retraceSteps;
    const noise = (Math.random() - 0.5) * Math.abs(stepSize) * 1.5;
    newClose = lastPrice + stepSize + noise;
    retraceSteps--;
    if (retraceSteps <= 0) retraceTarget = null;
  } else {
    // --- Normal drift mode ---
    const baseVol = getVolatility(lastPrice);
    const drift = (Math.random() - 0.5) * baseVol;
    newClose = Math.max(0.01, lastPrice + drift);

    // Trigger retracement if drift exceeds dynamic threshold
    if (Math.abs(drift) >= getRetraceThreshold(lastPrice)) {
      triggerRetracement(lastPrice, newClose);
    }
  }

  // ---- Candle body + wick ----
  const open = lastPrice;
  const bodyHigh = Math.max(open, newClose);
  const bodyLow = Math.min(open, newClose);
  const wickTop = bodyHigh + Math.random() * getVolatility(lastPrice) * 0.3;
  const wickBottom = Math.max(0.01, bodyLow - Math.random() * getVolatility(lastPrice) * 0.3);

  const newCandle = { time, open, high: wickTop, low: wickBottom, close: newClose };
  data.push(newCandle);

  if (data.length > 3000) data.shift();
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
  const baseSpike = Math.max(Math.abs(close - open) * 0.6, getVolatility(lastPrice) * 0.03);
  const high = Math.max(open, close) + Math.random() * baseSpike;
  const low  = Math.max(0.01, Math.min(open, close) - Math.random() * baseSpike);

  const newCandle = { time, open, high, low, close };
  data.push(newCandle);

  if (Math.abs(targetPrice - lastPrice) >= getRetraceThreshold(lastPrice)) {
    triggerRetracement(lastPrice, targetPrice);
  }

  if (data.length > 3000) data.shift();
  candleSeries.setData(data);
  updatePriceDisplay();
}

// ---- Dump (manual action) ----
function dump() {
  const raw = document.getElementById('priceInput').value;
  const v = Number(raw);
  if (!isFinite(v) || raw === '') return alert('Enter a valid number (delta).');
  const delta = Math.abs(v);

  const lastPrice = data[data.length - 1].close;
  const targetPrice = Math.max(0.00001, lastPrice - delta);

  time++;
  const open = lastPrice;
  const close = targetPrice;
  const baseSpike = Math.max(Math.abs(close - open) * 0.6, getVolatility(lastPrice) * 0.03);
  const high = Math.max(open, close) + Math.random() * baseSpike;
  const low  = Math.max(0.01, Math.min(open, close) - Math.random() * baseSpike);

  const newCandle = { time, open, high, low, close };
  data.push(newCandle);

  if (Math.abs(targetPrice - lastPrice) >= getRetraceThreshold(lastPrice)) {
    triggerRetracement(lastPrice, targetPrice);
  }

  if (data.length > 3000) data.shift();
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
