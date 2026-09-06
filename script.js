//script.js

const chartElement = document.getElementById('chart'); 
const chart = LightweightCharts.createChart(
  chartElement, { width: chartElement.clientWidth, height: chartElement.clientHeight, 
                 layout: { backgroundColor: '#000000', textColor: '#DDD' }, 
                 grid: { vertLines: { color: 'transparent' }, 
                horzLines: { color: 'transparent' } }, });
const candleSeries = chart.addCandlestickSeries();

let data = [];
let time = 0;
let marketInterval = null;

// ---- High-frequency tick engine ----
// Price moves every 250ms; one chart candle represents 15 seconds.
const TICK_INTERVAL_MS = 250;
const CANDLE_INTERVAL_MS = 15000;
const TICKS_PER_CANDLE = CANDLE_INTERVAL_MS / TICK_INTERVAL_MS;

let tickInterval = null;
let lastTickWallTime = null;
let catchUpTimer = null;
let batchingTicks = false;
const PRELOAD_CANDLES = 250;
let candleTickCount = 0;
let currentTickPrice = null;
let currentCandle = null;
let marketSeconds = 0;
let candleMove = null;
let candleExcursion = 0;
const TICK_PATH_CONFIG = { excursionStrength: 0.65 };

const volatilitySelect = document.getElementById('volatilitySelect');
const priceDisplay = document.getElementById('priceDisplay');

// ---- Retracement params ----
const RETRACE_MIN_FRAC = 0.60;   // 60%
const RETRACE_MAX_FRAC = 0.80;   // 80%

let retraceTarget = null;
let retraceSteps = 0; // candles left in retracement
let currentPattern = null;
let patternQueue = [];
let patternCooldown = 0; // countdown in candles
let currentTrend = null; // "up" or "down"
let trendSteps = 0;      // remaining candles in trend
const TREND_CHANCE = 0.15;   // 15% chance to start a trend when idle
const TREND_MIN_STEPS = 25;   // minimum candles per trend
const TREND_MAX_STEPS = 50;  // maximum candles per trend
const TREND_VOL_FACTOR = 0.5; // smooth the trend (less randomness)

const volatilityConfig = {
  low:   { priceMin: 9,     priceMax: 10,     balance: 100 },
  medium:{ priceMin: 90,    priceMax: 100,    balance: 500 },
  high:  { priceMin: 900,   priceMax: 1000,   balance: 1000 },
  ultra: { priceMin: 9000,  priceMax: 10000,  balance: 10000 }
};

let currentVolatility = 'low';

const ma50Series = chart.addLineSeries({
  color: 'dodgerblue',
  lineWidth: 2,
  priceLineVisible: false,
  lastValueVisible: false,
});

const ma200Series = chart.addLineSeries({
  color: 'orange',
  lineWidth: 2,
  priceLineVisible: false,
  lastValueVisible: false,
});

// Hidden averages keep accumulating completed-candle values.
for (const [id, series] of [['showMA50', ma50Series], ['showMA200', ma200Series]]) {
  const checkbox = document.getElementById(id);
  if (!checkbox) continue;
  try { checkbox.checked = localStorage.getItem(id) !== 'false'; } catch (_) {}
  series.applyOptions({ visible: checkbox.checked });
  checkbox.addEventListener('change', () => {
    series.applyOptions({ visible: checkbox.checked });
    try { localStorage.setItem(id, String(checkbox.checked)); } catch (_) {}
  });
}

function calculateMA(period, index) {
  if (index + 1 < period) return null;

  let sum = 0;
  for (let i = index; i > index - period; i--) {
    sum += data[i].close;
  }
  return sum / period;
}

function updateMovingAveragesIncremental() {
  const i = data.length - 1;

  const ma50 = calculateMA(50, i);
  if (ma50 !== null) {
    ma50Series.update({
      time: data[i].time,
      value: ma50,
    });
  }

  const ma200 = calculateMA(200, i);
  if (ma200 !== null) {
    ma200Series.update({
      time: data[i].time,
      value: ma200,
    });
  }
}

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

  let target;
  switch(currentPattern.name) {
    case "doubleTop":
      target = generateDoubleTopCandle();
    break;
    case "doubleBottom":
      target = generateDoubleBottomCandle();
    break;
    case "headShoulders":
      target = generateHeadAndShouldersCandle();
    break;
    case "triangle":
      target = generateTriangleCandle();
    break;
    case "flag":
      target = generateFlagCandle();
    break;
    case "wedge":
      target = generateWedgeCandle();
    break;
  default:
    target = generateCandle();
}

  currentPattern.steps--;
  if (currentPattern.steps <= 0) {
    console.log("Pattern finished:", currentPattern.name);
    currentPattern = null;
    patternCooldown = 120;
  }
  return target;
}

// ---- Format helper ----
function fmt(num) {
  return Number(num).toFixed(2); // only 2 decimals
}

// ---- Dynamic volatility & retrace threshold ----
let smoothedVol = null;

function getVolatility(price) {
  // Target range at price ≈ 9.00
  const MIN_MOVE = price * 0.0055;   // ~0.05 at 9
  const MAX_MOVE = price * 0.105;    // ~0.95 at 9

  // Heavy-tail distribution (bias toward small moves)
  const r = Math.random();
  const skewed = Math.pow(r, 2.5); // higher = rarer big moves

  const rawVol = MIN_MOVE + (MAX_MOVE - MIN_MOVE) * skewed;

  // Smooth volatility regime
  if (smoothedVol === null) {
    smoothedVol = rawVol;
  } else {
    smoothedVol = smoothedVol * 0.8 + rawVol * 0.2;
  }

  return smoothedVol;
}

function getRetraceThreshold(price) {
  const magnitude = Math.floor(Math.log10(price));
  return 0.5 * Math.pow(10, magnitude); // scales threshold with price
}

// ---- Random completed history, generated without advancing live/news clocks ----
function initChart(priceMin = 9, priceMax = 10) { 
  const initialPrice = priceMin + Math.random() * (priceMax - priceMin);
  let price = initialPrice;
  for (let index = 0; index < PRELOAD_CANDLES; index++) {
    const candle = {time: (time += CANDLE_INTERVAL_MS / 1000), open: price, high: price, low: price, close: price};
    const drift = (Math.random() - 0.5) * 0.0008;
    for (let tick = 0; tick < TICKS_PER_CANDLE; tick++) {
      price *= Math.exp(drift + (Math.random() - 0.5) * 0.006);
      candle.high = Math.max(candle.high, price);
      candle.low = Math.min(candle.low, price);
    }
    candle.close = price;
    data.push(candle);
  }
  // Keep the live starting price inside the selected volatility range.
  const scale = initialPrice / price;
  for (const candle of data) {
    for (const key of ['open', 'high', 'low', 'close']) candle[key] *= scale;
  }
  candleSeries.setData(data);
  for (const [period, series] of [[50, ma50Series], [200, ma200Series]]) {
    series.setData(data.slice(period - 1).map((candle, index) => ({
      time: candle.time, value: calculateMA(period, index + period - 1)
    })));
  }
  currentTickPrice = data[data.length - 1].close;
  currentCandle = null;
  candleTickCount = 0;
  sessionHigh = Math.max(...data.map(candle => candle.high));
  sessionLow = Math.min(...data.map(candle => candle.low));
  chart.timeScale().fitContent();
  updatePriceDisplay();
}

let sessionHigh = null;
let sessionLow = null;

function updatePriceDisplay() {
  if (data.length < 1) return;

  // 🔴 ENFORCE MARGIN ON PRICE UPDATE
  if (typeof updateFloatingPL === "function") {
    updateFloatingPL(true);
  }
  if (batchingTicks) return;

  const lastCandle = data[data.length - 1];
  const prevCandle = data[data.length - 2] || lastCandle;

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


// ============================================================
// TICK ENGINE
// ============================================================
// Choose movement once per candle; only the tick engine writes chart data.
function generateTickMove() {
    if (candleMove === null) {
        const target = generatePatternCandle();
        candleMove = (target - currentTickPrice) / TICKS_PER_CANDLE;
    }
    return candleMove;
}

function beginCandle() {
    const price = currentTickPrice ?? data[data.length - 1].close;

    time += CANDLE_INTERVAL_MS / 1000;

    currentCandle = {
        time,
        open: price,
        high: price,
        low: price,
        close: price
    };

    data.push(currentCandle);

    if (data.length > 3000) {
        data.shift();
        if (!batchingTicks) candleSeries.setData(data);
    }
}

function updateCurrentCandle(price) {

    if (!currentCandle) {
        beginCandle();
    }

    currentTickPrice = Math.max(0.00001, price);

    currentCandle.high = Math.max(
        currentCandle.high,
        currentTickPrice
    );

    currentCandle.low = Math.min(
        currentCandle.low,
        currentTickPrice
    );

    currentCandle.close = currentTickPrice;

    if (!batchingTicks) candleSeries.update(currentCandle);
    sessionHigh = Math.max(sessionHigh ?? currentTickPrice, currentCandle.high);
    sessionLow = Math.min(sessionLow ?? currentTickPrice, currentCandle.low);

    updatePriceDisplay();
}

function generateMarketTick() {

    if (!marketInterval) return;

    // 250ms = 0.25 second.
    marketSeconds += TICK_INTERVAL_MS / 1000;

    // Generate an intended movement from the existing market engine.
    let move = generateTickMove();


    const noiseBase =
        getVolatility(currentTickPrice || data[data.length - 1].close);

    // A random intrabar excursion that gradually returns toward the candle's
    // drift path. All highs/lows are real tick prices, never painted-on wicks.
    const remainingTicks = TICKS_PER_CANDLE - candleTickCount;
    const nextExcursion = remainingTicks <= 1 ? 0 :
        candleExcursion * (remainingTicks - 1) / remainingTicks +
        (Math.random() - 0.5) * 2 * noiseBase *
        TICK_PATH_CONFIG.excursionStrength / Math.sqrt(TICKS_PER_CANDLE) *
        Math.sqrt((remainingTicks - 1) / remainingTicks);
    const tickNoise = nextExcursion - candleExcursion;
    candleExcursion = nextExcursion;

    const nextPrice =
        (currentTickPrice || data[data.length - 1].close) +
        applyNewsToPriceMove(move + tickNoise, marketSeconds, currentTickPrice);

    updateCurrentCandle(nextPrice);

    candleTickCount++;

    // Finalize every 15 seconds.
    if (candleTickCount >= TICKS_PER_CANDLE) {

        candleTickCount = 0;

        // Make sure the current candle's final close is exact.
        currentCandle.close = currentTickPrice;

        if (!batchingTicks) candleSeries.update(currentCandle);

        updateMovingAveragesIncremental();

        // Start the next candle on the next tick (or manual price move).
        currentCandle = null;
        candleMove = null;
        candleExcursion = 0;
    }
}

function startTickEngine() {

    if (tickInterval) return;

    // Reset only the wall-clock anchor; pausing never consumes market time.
    lastTickWallTime = Date.now();

    tickInterval = setInterval(
        syncMarketClock,
        TICK_INTERVAL_MS
    );
}

function syncMarketClock(flush = false) {
    if (!marketInterval || lastTickWallTime === null) return;
    const now = Date.now();
    if (now < lastTickWallTime) { lastTickWallTime = now; return; }
    const due = Math.floor((now - lastTickWallTime) / TICK_INTERVAL_MS);
    const count = flush ? due : Math.min(due, 2400);
    if (!count) return;
    batchingTicks = count > 1;
    try {
        for (let tick = 0; tick < count; tick++) {
            generateMarketTick();
            lastTickWallTime += TICK_INTERVAL_MS;
        }
    } finally {
        const needsRefresh = batchingTicks;
        batchingTicks = false;
        if (needsRefresh) {
            candleSeries.setData(data);
            updatePriceDisplay();
            renderNews(marketSeconds);
        }
    }
    // Large backlogs yield between batches so the page stays responsive.
    if (due > count && catchUpTimer === null) {
        catchUpTimer = setTimeout(() => {
            catchUpTimer = null;
            syncMarketClock();
        }, 0);
    }
}

document.addEventListener('visibilitychange', () => syncMarketClock());
window.addEventListener('focus', () => syncMarketClock());
window.addEventListener('pageshow', () => syncMarketClock());

function stopTickEngine() {

    if (!tickInterval) return;

    clearInterval(tickInterval);
    tickInterval = null;
    if (catchUpTimer !== null) clearTimeout(catchUpTimer);
    catchUpTimer = null;
    lastTickWallTime = null;
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
  const lastPrice = data[data.length - 1].close;
  let newClose;

  // ---- Very rare random spike (0.0556% chance per candle) ----
  if (Math.random() < 0.000556) {  // 0.0556% probability
    const spikeDirection = Math.random() < 0.5 ? -1 : 1; // dump or pump
    const spikePct = 0.15 + Math.random() * 0.15; // 15%–30%
    const spikeAmount = lastPrice * spikePct * spikeDirection;
    newClose = Math.max(0.00001, lastPrice + spikeAmount);

    console.log("💥 SPIKE triggered!", spikeDirection > 0 ? "PUMP" : "DUMP", "to", newClose.toFixed(2));

    return newClose;
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

  return Math.max(0.00001, newClose);
}

// Manual moves share the active candle and do not advance its clock.
function applyManualMove(direction) {
  const raw = document.getElementById('priceInput').value;
  const value = Number(raw);
  if (!Number.isFinite(value) || raw.trim() === '') return alert('Enter a valid number.');
  const previousPrice = currentTickPrice;
  const targetPrice = Math.max(0.00001, previousPrice + direction * Math.abs(value));
  if (!Number.isFinite(targetPrice)) return alert('Enter a valid number.');
  updateCurrentCandle(targetPrice);
  triggerRetracement(previousPrice, targetPrice);
}

function pump() { applyManualMove(1); }
function dump() { applyManualMove(-1); }

function generatePatternCandle() {
  if (currentPattern) return continuePattern();
  if (patternCooldown > 0) {
    patternCooldown--;
    return generateCandle();
  }
  if (patternQueue.length > 0) {
    startPattern(patternQueue.shift());
    return continuePattern();
  }
  return generateCandle();
}

// Start/Stop live market
function toggleMarket() {
  if (marketInterval) {
    syncMarketClock(true);

    marketInterval = null;
    stopTickEngine();

    console.log('Market stopped.');

    if (typeof window.setMarketOpen === "function") {
      window.setMarketOpen(false);
    }

  } else {

    marketInterval = true;
    startTickEngine();

    console.log('Market started. Price ticks every 0.25s; candles every 15s.');

    if (typeof window.setMarketOpen === "function") {
      window.setMarketOpen(true);
    }
  }
}

function createOrUpdateTPLine(trade) {
    if (!trade.tp) return;

    if (trade.tpLine) {
        trade.tpLine.applyOptions({ price: trade.tp });
        return;
    }

    trade.tpLine = candleSeries.createPriceLine({
        price: trade.tp,
        color: "green",
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `TP #${trade.id}`
    });
}

function createOrUpdateSLLine(trade) {
    if (!trade.sl) return;

    if (trade.slLine) {
        trade.slLine.applyOptions({ price: trade.sl });
        return;
    }

    trade.slLine = candleSeries.createPriceLine({
        price: trade.sl,
        color: "red",
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `SL #${trade.id}`
    });
}

// ---- VOLATILITY ----
function applyVolatility(level) {
    currentVolatility = level;
    const cfg = volatilityConfig[level];

    // Reset state
    data = [];
    time = 0;
    sessionHigh = null;
    sessionLow = null;
    retraceTarget = null;
    retraceSteps = 0;
    currentPattern = null;
    patternQueue = [];
    patternCooldown = 0;
    currentTrend = null;
    trendSteps = 0;
    candleTickCount = 0;
    currentTickPrice = null;
    currentCandle = null;
    marketSeconds = 0;
    if (marketInterval) lastTickWallTime = Date.now();
    resetNews(marketSeconds);
    candleMove = null;
    candleExcursion = 0;
    smoothedVol = null;

    // 🔴 RESET CHART SERIES (IMPORTANT)
    candleSeries.setData([]);
    ma50Series.setData([]);
    ma200Series.setData([]);

    balance = cfg.balance;       // now actually takes effect
  
    // Update balance in UI right away
    if (window.renderTables) {
        window.renderTables(); // make sure your balance table refreshes
    } else {
        // fallback: if renderTables not ready, just update manually
        const balanceDisplay = document.getElementById('balanceDisplay');
        if (balanceDisplay) balanceDisplay.textContent = balance.toFixed(2);
    }

    // Init first candle using configured range
    initChart(cfg.priceMin, cfg.priceMax);
}

volatilitySelect.addEventListener('change', e => {
    const selectedVol = e.target.value;
    
    // Optional: store selection in localStorage to remember after reload
    localStorage.setItem('selectedVolatility', selectedVol);

    // Reload the page
    location.reload();
});

// On page load, apply saved volatility if any
window.addEventListener('load', () => {
    const savedVol = localStorage.getItem('selectedVolatility');
    if (savedVol) {
        volatilitySelect.value = savedVol;
        applyVolatility(savedVol); // initialize with saved volatility
    }
});


window.addEventListener('resize', () => {
  chart.resize(chartElement.clientWidth, chartElement.clientHeight);
});

window.createOrUpdateTPLine = createOrUpdateTPLine;
window.createOrUpdateSLLine = createOrUpdateSLLine;
window.getCurrentTickPrice = function () {
    return currentTickPrice;
};

// ---- START ----
applyVolatility(currentVolatility);
