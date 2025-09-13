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
let currentPattern = null;
let patternQueue = [];
let patternCooldown = 0; // countdown in seconds

function scheduleNextPattern() {
  const patterns = ["doubleTop", "headShoulders", "triangle", "flag", "wedge"];
  const choice = patterns[Math.floor(Math.random() * patterns.length)];

  patternQueue.push(choice);
  patternCooldown = 120; // wait 120 seconds before new pattern
  console.log("Next pattern scheduled:", choice);
}

function startPattern(name) {
  const steps = Math.floor(80 + Math.random() * 71); // 80–150 candles
  currentPattern = { name, steps, totalSteps: steps };
}

// ---- Double Top Pattern ----
function generateDoubleTopCandle() {
  if (!currentPattern) return;

  const lastPrice = data[data.length - 1].close;
  const totalSteps = currentPattern.totalSteps;
  const step = currentPattern.totalSteps - currentPattern.steps;

  let newClose = lastPrice;

  // --- PHASES ---
  if (step < totalSteps * 0.2) {
    // Phase 1: Impulse Up
    newClose = lastPrice + getVolatility(lastPrice) * 1.5;
  } else if (step < totalSteps * 0.35) {
    // Phase 2: First Top (flat-ish)
    newClose = lastPrice + (Math.random() - 0.5) * getVolatility(lastPrice) * 0.2;
  } else if (step < totalSteps * 0.55) {
    // Phase 3: Pullback
    newClose = lastPrice - getVolatility(lastPrice) * 0.8;
  } else if (step < totalSteps * 0.75) {
    // Phase 4: Second Top (near first top)
    const firstTop = currentPattern.firstTopPrice;
    if (!firstTop) currentPattern.firstTopPrice = sessionHigh || lastPrice;
    const target = currentPattern.firstTopPrice;
    newClose = lastPrice + (target - lastPrice) * 0.3 + (Math.random() - 0.5) * getVolatility(lastPrice) * 0.2;
  } else {
    // Phase 5: Breakdown
    newClose = lastPrice - getVolatility(lastPrice) * 1.2;
  }

  // ---- Candle body + wick ----
  time++;
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

function continuePattern() {
  if (!currentPattern) return;

  switch (currentPattern.name) {
    case "doubleTop":
      generateDoubleTopCandle();
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

let sessionHigh = null;
let sessionLow = null;

function updatePriceDisplay() {
  if (data.length < 2) return;
  const last = data[data.length - 1].close;
  const prev = data[data.length - 2].close;

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

  // Track session high/low
  if (sessionHigh === null || last > sessionHigh) {
    sessionHigh = last;
  }
  if (sessionLow === null || last < sessionLow) {
    sessionLow = last;
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
function generateCandle() {
  time++;
  const lastPrice = data[data.length - 1].close;
  let newClose;

  if (retraceTarget !== null && retraceSteps > 0) {
    // --- Retracement mode with counter-trend candles ---
    const remainingDelta = retraceTarget - lastPrice;
    const baseStep = remainingDelta / retraceSteps;
    const noiseFactor = Math.abs(baseStep) * 0.6;
    let noise = (Math.random() - 0.5) * noiseFactor * 2;

    // ~35% chance to flip the step slightly to create green candles during down retrace
    const directionFlipChance = 0.35;
    let step = baseStep + noise;
    if (step < 0 && Math.random() < directionFlipChance) {
      step = -step * (0.3 + Math.random() * 0.7); // partial flip
    } else if (step > 0 && Math.random() < directionFlipChance) {
      step = -step * (0.3 + Math.random() * 0.7);
    }

    newClose = lastPrice + step;

    retraceSteps--;
    if (retraceSteps <= 0) {
      newClose = retraceTarget; // ensure final candle hits retracement target exactly
      retraceTarget = null;
    }
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

  // --- Pump spike ---
  const baseSpike = Math.max(Math.abs(close - open) * 0.6, getVolatility(lastPrice) * 0.03);

  // High wick above close
  const high = close + Math.random() * baseSpike;

  // Low wick should not go below original price
  const low = open - Math.random() * baseSpike * 0.1; // tiny tail for realism

  const newCandle = { time, open, high, low: Math.max(low, open), close }; 
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

  const baseSpike = Math.max(Math.abs(close - open) * 0.6, getVolatility(lastPrice) * 0.03);

  // High wick should not go above original price
  const high = open + Math.random() * baseSpike * 0.1; // tiny tail
  // Low wick below close
  const low = close - Math.random() * baseSpike;

  const newCandle = { time, open, high: Math.min(high, open), low: Math.max(low, 0.00001), close };
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

// ---- Start/Stop live market ----
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
