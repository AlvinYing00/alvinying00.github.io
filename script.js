const chartElement = document.getElementById('chart');
const chart = LightweightCharts.createChart(chartElement, {
  width: chartElement.clientWidth,
  height: chartElement.clientHeight,
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
let currentPattern = null;
let patternQueue = [];
let patternCooldown = 0; // countdown in seconds
let currentTrend = null; // "up" or "down"
let trendSteps = 0;      // remaining candles in trend
const TREND_CHANCE = 0.15;   // 15% chance to start a trend when idle
const TREND_MIN_STEPS = 25;   // minimum candles per trend
const TREND_MAX_STEPS = 50;  // maximum candles per trend
const TREND_VOL_FACTOR = 0.5; // smooth the trend (less randomness)

function scheduleNextPattern() {
  const patterns = ["doubleTop", "doubleBottom", "headShoulders", "triangle", "flag", "wedge"];
  const choice = patterns[Math.floor(Math.random() * patterns.length)];
  patternQueue.push(choice);
  patternCooldown = 120;
}

function startPattern(name) {
  const steps = Math.floor(80 + Math.random() * 71); // 80–150 candles
  currentPattern = { name, steps, totalSteps: steps };
}

function continuePattern() {
  if (!currentPattern) return;

  switch(currentPattern.name) {
    case "doubleTop":
      generateDoubleTopCandle();
    break;
    case "doubleBottom":
      generateDoubleBottomCandle();
    break;
    case "headShoulders":
      generateHeadAndShouldersCandle();
    break;
    case "triangle":
      generateTriangleCandle();
    break;
    case "flag":
      generateFlagCandle();
    break;
    case "wedge":
      generateWedgeCandle();
    break;
  default:
    generateCandle();
}

  currentPattern.steps--;
  if (currentPattern.steps <= 0) {
    console.log("Pattern finished:", currentPattern.name);
    currentPattern = null;
    patternCooldown = 120;
  }
}

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
  const initialPrice = 9 + Math.random(); // random between 9 - 10
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

let sessionHigh = null;
let sessionLow = null;

function updatePriceDisplay() {
  if (data.length < 2) return;

  const lastCandle = data[data.length - 1];
  const prevCandle = data[data.length - 2];

  const last = lastCandle.close;
  const prev = prevCandle.close;

  if (window.renderTables) {
        window.renderTables();
  }

  // Update current price
  priceDisplay.textContent = fmt(last);

  // Set color (green/red/neutral)
  if (last > prev) {
    priceDisplay.style.color = 'limegreen';
  } else if (last < prev) {
    priceDisplay.style.color = 'red';
  } else {
    priceDisplay.style.color = '#DDD';
  }

  // Track session high/low using full wick values
  if (sessionHigh === null || lastCandle.high > sessionHigh) {
    sessionHigh = lastCandle.high;
  }
  if (sessionLow === null || lastCandle.low < sessionLow) {
    sessionLow = lastCandle.low;
  }

  // Update high/low display
  document.getElementById('highDisplay').textContent = fmt(sessionHigh);
  document.getElementById('lowDisplay').textContent = fmt(sessionLow);
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
function maybeStartTrend() {
  if (!currentTrend && Math.random() < TREND_CHANCE) {
    // 50/50 chance for up or down
    currentTrend = Math.random() < 0.5 ? "up" : "down";
    // Trend length (candles) more visible
    trendSteps = TREND_MIN_STEPS + Math.floor(Math.random() * (TREND_MAX_STEPS - TREND_MIN_STEPS + 1));
    console.log("Trend started:", currentTrend, "for", trendSteps, "candles");
  }
}

function generateCandle() {
  time++;
  const lastPrice = data[data.length - 1].close;
  let newClose;

  // ---- Very rare random spike (0.1% chance per candle) ----
  if (Math.random() < 0.001) {  // 0.1% = 0.001 probability
    const spikeDirection = Math.random() < 0.5 ? -1 : 1; // dump or pump
    const spikeAmount = lastPrice * 0.10 * spikeDirection; // ±10%
    newClose = Math.max(0.00001, lastPrice + spikeAmount);

    console.log("💥 SPIKE triggered!", spikeDirection > 0 ? "PUMP" : "DUMP", "to", newClose.toFixed(2));

    const open = lastPrice;
    const close = newClose;
    const high = spikeDirection > 0 ? newClose : Math.max(open, close);
    const low = spikeDirection < 0 ? newClose : Math.min(open, close);

    const spikeCandle = { time, open, high, low, close };
    data.push(spikeCandle);

    if (data.length > 3000) data.shift();
    candleSeries.setData(data);
    updatePriceDisplay();
    return; // 🚨 stop here so normal candle logic doesn’t overwrite spike
  }

  if (retraceTarget !== null && retraceSteps > 0) {
    // Retracement mode (counter-trend)
    const remainingDelta = retraceTarget - lastPrice;
    const baseStep = remainingDelta / retraceSteps;
    const noiseFactor = Math.abs(baseStep) * 0.5; // smaller noise to keep trend visible
    let noise = (Math.random() - 0.5) * noiseFactor * 2;

    // Flip chance
    if ((baseStep < 0 && Math.random() < 0.3) || (baseStep > 0 && Math.random() < 0.3)) {
      noise = -noise;
    }

    newClose = lastPrice + baseStep + noise;
    retraceSteps--;
    if (retraceSteps <= 0) {
      newClose = retraceTarget;
      retraceTarget = null;
    }

  } else if (currentTrend) {
    // Apply clear trend
    const trendDirection = currentTrend === "up" ? 1 : -1;
    const factor = trendDirection === 1 ? TREND_VOL_FACTOR : TREND_VOL_FACTOR * 1.1;
    const baseStep = getVolatility(lastPrice) * factor;
    const noise = (Math.random() - 0.5) * baseStep * 0.2; // smaller noise
    newClose = Math.max(0.01, lastPrice + baseStep * trendDirection + noise);

    trendSteps--;
    if (trendSteps <= 0) {
      console.log("Trend ended:", currentTrend);
      currentTrend = null;
    }

  } else {
    // Normal drift
    const baseVol = getVolatility(lastPrice);
    const drift = (Math.random() - 0.5) * baseVol;
    newClose = Math.max(0.01, lastPrice + drift);

    if (Math.abs(drift) >= getRetraceThreshold(lastPrice)) {
      triggerRetracement(lastPrice, newClose);
    }
  }

  // Candle body + wick
  const open = lastPrice;
  const bodyHigh = Math.max(open, newClose);
  const bodyLow = Math.min(open, newClose);
  const wickTop = Math.max(bodyHigh, bodyHigh + Math.random() * getVolatility(lastPrice) * 0.3);
  const wickBottom = Math.min(bodyLow, Math.max(0.01, bodyLow - Math.random() * getVolatility(lastPrice) * 0.3));

  const newCandle = { time, open, high: Math.max(open, newClose, wickTop), low: Math.min(open, newClose, wickBottom), close: newClose };
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

  // Pump
  const baseSpike = Math.max(Math.abs(close - open) * 0.6, getVolatility(lastPrice) * 0.03);

  // Pump
  const high = close + Math.random() * baseSpike; 
  const low = Math.min(open, close);  // lowest point = body only, no extra wick

  const newCandle = {
    time,
    open,
    high: Math.max(open, close, high),
    low: Math.min(open, close, low),
    close
  };
  data.push(newCandle);

  // Trigger retracement if necessary
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
  if (!isFinite(v) || raw === '') return alert('Enter a valid number.');
  const delta = Math.abs(v);

  const lastPrice = data[data.length - 1].close;
  const targetPrice = Math.max(0.00001, lastPrice - delta);

  time++;
  const open = lastPrice;
  const close = targetPrice;

 // Dump
  const baseSpike = Math.max(Math.abs(close - open) * 0.6, getVolatility(lastPrice) * 0.03);

  // Dump
  const high = Math.max(open, close); // highest point = body only, no extra wick
  const low = close - Math.random() * baseSpike;
  const newCandle = {
    time,
    open,
    high: Math.max(open, close, high),
    low: Math.min(open, close, Math.max(low, 0.00001)),
    close
  };
  data.push(newCandle);

  if (Math.abs(targetPrice - lastPrice) >= getRetraceThreshold(lastPrice)) {
    triggerRetracement(lastPrice, targetPrice);
  }

  if (data.length > 3000) data.shift();
  candleSeries.setData(data);
  updatePriceDisplay();
}

function generatePatternCandle() {
  if (currentPattern) {
    continuePattern();
    return;
  }

  if (patternCooldown > 0) {
    generateCandle(); // normal drift while waiting
    patternCooldown--;

    if (patternCooldown === 0) {
      scheduleNextPattern();
    }
    return;
  }

  if (patternQueue.length > 0) {
    const next = patternQueue.shift();
    startPattern(next);
    return;
  }

  // Default drift
  generateCandle();
}

// Start/Stop live market
function toggleMarket() {
  if (marketInterval) {
    clearInterval(marketInterval);
    marketInterval = null;
    console.log('Market stopped.');
  } else {
    marketInterval = setInterval(generatePatternCandle, 1000);
    console.log('Market started.');
  }
}

window.addEventListener('resize', () => {
  chart.resize(chartElement.clientWidth, chartElement.clientHeight);
});
