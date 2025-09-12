// ---- Chart setup ----
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  width: 900,
  height: 450,
  layout: { backgroundColor: '#000000', textColor: '#333' },
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
let retraceTarget = null;
let retraceSteps = 0;

function generateCandle() {
  time++;
  const lastPrice = data[data.length - 1].close;

  let newClose;

  if (retraceTarget !== null && retraceSteps > 0) {
    // ---- In retracement mode ----
    const stepSize = (retraceTarget - lastPrice) / retraceSteps;

    // Smooth move back toward retrace target with small noise
    newClose = lastPrice + stepSize + (Math.random() - 0.5) * 0.002;
    retraceSteps--;

    if (retraceSteps <= 0) {
      retraceTarget = null; // retracement done
    }
  } else {
    // ---- Normal volatility ----
    const drift = (Math.random() - 0.5) * 0.1; // bigger swings
    newClose = Math.max(0.00001, lastPrice + drift);

    // Detect big pump/dump -> trigger retracement
    if (Math.abs(drift) > 0.1) {
      // Retrace back 60–70% toward the last price
      const retraceAmount = drift * (Math.random() * 0.1 + 0.6); // 60–70%
      retraceTarget = lastPrice + retraceAmount;

      // Retrace takes at least 20 candles, up to 40
      retraceSteps = Math.floor(Math.random() * 20) + 20;

      console.log(
        `Retracement triggered: target=${retraceTarget.toFixed(
          5
        )}, steps=${retraceSteps}`
      );
    }
  }

  const open = lastPrice;
  const high = Math.max(open, newClose) + Math.random() * 0.02;
  const low = Math.min(open, newClose) - Math.random() * 0.02;

  const newCandle = {
    time: time,
    open: open,
    high: Math.max(high, open, newClose),
    low: Math.min(low, open, newClose),
    close: newClose,
  };

  data.push(newCandle);
  if (data.length > 500) data.shift(); // keep history light
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
