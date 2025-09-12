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

// Format helper (5 decimal places for forex-like look)
function fmt(num) {
  return Number(num).toFixed(5);
}

// Seed the chart with a first candle so chart is not blank
function initChart() {
  const initialPrice = 1.20000; // change to whatever base you prefer
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

// Update the displayed current price
function updatePriceDisplay() {
  const last = data[data.length - 1].close;
  priceDisplay.textContent = 'Current: ' + fmt(last);
}

// ---- Auto market generator ----
function generateCandle() {
  time++;
  const lastPrice = data[data.length - 1].close;

  // Stronger volatility: ±0.1 (~1000 pips)
  const drift = (Math.random() - 0.5) * 0.1;
  const newClose = Math.max(0.00001, lastPrice + drift); // keep > 0

  const open = lastPrice;
  const high = Math.max(open, newClose) + Math.random() * 0.05;
  const low = Math.min(open, newClose) - Math.random() * 0.05;

  // ✅ Safety check: ensure high >= open/close, low <= open/close
  const newCandle = {
    time: time,
    open: open,
    high: Math.max(high, open, newClose),
    low: Math.min(low, open, newClose),
    close: newClose,
  };

  data.push(newCandle);

  // Optional: keep only the last 200 candles to avoid slowdown
  if (data.length > 200) {
    data.shift();
  }

  candleSeries.setData(data);
  updatePriceDisplay();
}

// ---- Pump / Dump logic (uses input as delta) ----
function getInputValue() {
  const raw = document.getElementById('priceInput').value;
  const v = Number(raw);
  if (!isFinite(v)) return NaN;
  return v;
}

function pump() {
  const value = getInputValue();
  if (isNaN(value)) return alert('Enter a valid number (delta).');
  const delta = Math.abs(value); // ensure we add a positive delta

  const lastPrice = data[data.length - 1].close;
  const targetPrice = Math.max(0, lastPrice + delta); // prevent negative (shouldn't happen for pump)
  console.log('PUMP ->', { lastPrice, delta, targetPrice });

  addCustomCandle(targetPrice);
}

function dump() {
  const value = getInputValue();
  if (isNaN(value)) return alert('Enter a valid number (delta).');
  const delta = Math.abs(value); // ensure we subtract a positive delta

  const lastPrice = data[data.length - 1].close;
  const targetPrice = Math.max(0, lastPrice - delta); // block negative
  console.log('DUMP ->', { lastPrice, delta, targetPrice });

  addCustomCandle(targetPrice);
}

function addCustomCandle(price) {
  time++;
  const lastPrice = data[data.length - 1].close;

  const newCandle = {
    time: time,
    open: lastPrice,
    high: Math.max(lastPrice, price),
    low: Math.min(lastPrice, price),
    close: price,
  };

  data.push(newCandle);
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
