//script.js

const chartElement = document.getElementById('chart'); 
const chart = LightweightCharts.createChart(
  chartElement, { width: chartElement.clientWidth, height: chartElement.clientHeight, 
                 layout: { background: {type: 'solid', color: '#111923'}, textColor: '#8b9bb0', fontSize: 11 },
                 grid: { vertLines: { color: '#1a2532' }, horzLines: { color: '#1a2532' } },
                 rightPriceScale: {borderColor: '#24303f', autoScale: true, scaleMargins: {top: 0.12, bottom: 0.12}},
                 timeScale: {borderColor: '#24303f', timeVisible: true, secondsVisible: true, rightOffset: 5},
                 crosshair: {vertLine: {color: '#60768e', labelBackgroundColor: '#30445b'}, horzLine: {color: '#60768e', labelBackgroundColor: '#30445b'}} });
const candleSeries = chart.addCandlestickSeries({upColor:'#54d7aa', downColor:'#f3788e', borderVisible:false, wickUpColor:'#54d7aa', wickDownColor:'#f3788e'});

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
const TICK_PATH_CONFIG = { excursionStrength: 1.0, movementMultiplier: 1.8 };

// Synthetic price structure, not real order flow. Cooldowns count quiet candles.
const STRUCTURE_CONFIG = { minCooldown: 20, maxCooldown: 40, lookback: 12,
    minPhaseTicks: 120, extraPhaseTicks: 120, driftFraction: 0.009, noiseFraction: 0.10 };
let quietSetup = null;
let quietPath = null;
let quietCooldown = STRUCTURE_CONFIG.minCooldown;

function resetQuietMarket() {
    quietSetup = null;
    quietPath = null;
    quietCooldown = STRUCTURE_CONFIG.minCooldown;
}

function buildQuietPath(defaultClose) {
    const open = currentTickPrice;
    if (!quietSetup && quietCooldown > 0) quietCooldown--;
    else if (!quietSetup && !currentPattern && !currentTrend && !patternQueue.length) {
        const history = data.filter(c => c !== currentCandle).slice(-STRUCTURE_CONFIG.lookback);
        if (history.length === STRUCTURE_CONFIG.lookback) {
            const low = Math.min(...history.map(c => c.low));
            const high = Math.max(...history.map(c => c.high));
            // Sweep only a nearby existing level; never teleport to a distant swing.
            const directions = [];
            if (Math.abs(open - low) < open * 0.06) directions.push(1);
            if (Math.abs(open - high) < open * 0.06) directions.push(-1);
            if (directions.length) {
                const direction = directions[Math.floor(Math.random() * directions.length)];
                startQuietSetup(direction, direction > 0 ? low : high,
                    open * (0.012 + Math.random() * 0.008));
            }
        }
    }

    if (quietSetup) {
        quietPath = null;
        return; // Setups have their own continuous path across candle boundaries.
    }
    const close = Math.max(open * 0.8, defaultClose);
    const body = Math.abs(close - open);
    const wick = open * (0.003 + Math.random() * 0.007) + body * (0.15 + Math.random() * 0.35);
    let high = Math.max(open, close) + wick * (0.6 + Math.random());
    let low = Math.max(open * 0.5, Math.min(open, close) - wick * (0.6 + Math.random()));
    // Visit both extremes through actual ticks, with randomized turning times.
    const lowFirst = Math.random() < 0.5;
    quietPath = { points: [open, lowFirst ? low : high, lowFirst ? high : low, close],
        ticks: [0, 12 + Math.floor(Math.random() * 9), 36 + Math.floor(Math.random() * 9), 60] };
}

function startQuietSetup(direction, level, unit) {
    quietSetup = { direction, level, unit, phase: 0, age: 0, zone: null };
    setQuietPhase(level - direction * unit * 0.45);
}

function setQuietPhase(target) {
    const s = quietSetup;
    s.target = Math.max(0.00001, target);
    s.travelDirection = Math.sign(s.target - currentTickPrice) || s.direction;
    s.age = 0;
    s.minTicks = STRUCTURE_CONFIG.minPhaseTicks + Math.floor(Math.random() * STRUCTURE_CONFIG.extraPhaseTicks);
    s.swingTicks = 0;
}

function structureTickMove() {
    const s = quietSetup, u = s.unit, d = s.direction;
    // A zone must actually be reached. No deadline or candle-close snap to target.
    if (s.age >= s.minTicks && (currentTickPrice - s.target) * s.travelDirection >= 0) {
        s.phase++;
        if (s.phase === 1) setQuietPhase(s.level + d * u * 0.5);
        else if (s.phase === 2) {
            const preceding = data.filter(c => c !== currentCandle).at(-1);
            s.zone = (preceding.open + preceding.close) / 2;
            setQuietPhase(s.zone + d * u * 2.5);
        } else if (s.phase === 3) setQuietPhase(s.zone);
        else if (s.phase === 4) setQuietPhase(s.zone + d * u * 3.5);
        else {
            quietSetup = null;
            quietCooldown = STRUCTURE_CONFIG.minCooldown + Math.floor(Math.random() *
                (STRUCTURE_CONFIG.maxCooldown - STRUCTURE_CONFIG.minCooldown + 1));
            return 0;
        }
    }
    s.age++;
    // Short random waves sometimes oppose the destination, producing pullbacks
    // across ticks AND candles. Their duration is independent of candle boundaries.
    if (s.swingTicks-- <= 0) {
        s.swingTicks = 20 + Math.floor(Math.random() * 100);
        s.swing = (Math.random() - 0.5) * u * 0.035;
    }
    const driftLimit = u * STRUCTURE_CONFIG.driftFraction;
    const drift = Math.max(-driftLimit, Math.min(driftLimit, (s.target - currentTickPrice) * 0.015));
    return drift + s.swing + (Math.random() - 0.5) * 2 * u * STRUCTURE_CONFIG.noiseFraction;
}

function quietTickMove() {
    if (quietSetup) return structureTickMove();
    // News may expire mid-candle; keep ticking until a fresh full-bar path starts.
    if (!quietPath) return (Math.random() - 0.5) * currentTickPrice * 0.004;
    const tick = candleTickCount + 1;
    const segment = quietPath.ticks.findIndex(t => t >= tick);
    const remaining = quietPath.ticks[segment] - tick + 1;
    const target = quietPath.points[segment];
    const noiseScale = Math.max(quietPath.points[0] * 0.004, Math.abs(target - currentTickPrice) / remaining * 4);
    const noise = remaining === 1 ? 0 : (Math.random() - 0.5) * noiseScale;
    return (target - currentTickPrice) / remaining + noise;
}

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
  if (index < 0) return null;
  const count = Math.min(period, index + 1);

  let sum = 0;
  for (let i = index; i > index - count; i--) {
    sum += data[i].close;
  }
  return sum / count;
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
    // Give synthetic history readable, asymmetric wicks without oversized tails.
    // This only shapes preloaded OHLC; live candles still use actual tick extremes.
    const body = Math.abs(candle.close - candle.open);
    const bodyHigh = Math.max(candle.open, candle.close);
    const bodyLow = Math.min(candle.open, candle.close);
    const wickLimit = candle.open * 0.012;
    const historyWick = () => Math.min(wickLimit,
      body * (0.25 + Math.random() * 0.35) + candle.open * (0.0015 + Math.random() * 0.0015));
    candle.high = bodyHigh + Math.min(wickLimit, Math.max(candle.high - bodyHigh, historyWick()));
    candle.low = Math.max(0.00001, bodyLow - Math.min(wickLimit, Math.max(bodyLow - candle.low, historyWick())));
    // Occasional one-sided rejection candles: extend only the wick OR tail.
    if (Math.random() < 0.25) {
      const extension = 2 + Math.random();
      if (Math.random() < 0.5) {
        candle.high = bodyHigh + (candle.high - bodyHigh) * extension;
      } else {
        candle.low = Math.max(0.00001, bodyLow - (bodyLow - candle.low) * extension);
      }
    }
    data.push(candle);
  }
  // Keep the live starting price inside the selected volatility range.
  const scale = initialPrice / price;
  for (const candle of data) {
    for (const key of ['open', 'high', 'low', 'close']) candle[key] *= scale;
  }
  candleSeries.setData(data);
  for (const [period, series] of [[50, ma50Series], [200, ma200Series]]) {
    series.setData(data.map((candle, index) => ({
      time: candle.time, value: calculateMA(period, index)
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
  updateMarketControls();

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
    priceDisplay.style.color = '#54d7aa';
  } else if (last < prev) {
    priceDisplay.style.color = '#ff7b8d';
  } else {
    priceDisplay.style.color = '#e7edf5';
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
        candleMove = (target - currentTickPrice) * TICK_PATH_CONFIG.movementMultiplier / TICKS_PER_CANDLE;
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

    // Resolve releases first so quiet setups cannot act on a news-release tick.
    updateNews(marketSeconds);
    const newsDriven = Boolean(activeNews || newsContinuation);
    if (newsDriven) {
        resetQuietMarket();
        candleMove = null;
    }
    let move = 0;
    if (!newsDriven) {
        if (candleTickCount === 0) {
            move = generateTickMove();
            buildQuietPath(currentTickPrice + move * TICKS_PER_CANDLE);
        }
        move = quietTickMove();
    }


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
        applyNewsToPriceMove(newsDriven ? tickNoise : move, marketSeconds, currentTickPrice);

    updateCurrentCandle(nextPrice);

    candleTickCount++;

    // Finalize every 15 seconds.
    if (candleTickCount >= TICKS_PER_CANDLE) {

        candleTickCount = 0;

        // Make sure the current candle's final close is exact.
        currentCandle.close = currentTickPrice;

        if (!batchingTicks) candleSeries.update(currentCandle);

        updateMovingAveragesIncremental();
        onNewsCandleClosed(currentCandle, marketSeconds);

        // Start the next candle on the next tick (or manual price move).
        currentCandle = null;
        candleMove = null;
        candleExcursion = 0;
        quietPath = null;
    }
    if (!batchingTicks) updateMarketControls();
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
  if (!marketInterval) return notifyTrading('Market is paused. Start the market to use Pump or Dump.');
  const raw = document.getElementById('priceInput').value;
  const value = Number(raw);
  if (!Number.isFinite(value) || raw.trim() === '') return notifyTrading('Enter a valid number for the manual price move.');
  const previousPrice = currentTickPrice;
  const targetPrice = Math.max(0.00001, previousPrice + direction * Math.abs(value));
  if (!Number.isFinite(targetPrice)) return notifyTrading('Enter a valid number for the manual price move.');
  updateCurrentCandle(targetPrice);
  // Keep the remaining intrabar path relative to the manually shifted price.
  if (quietPath) quietPath.points = quietPath.points.map(p => Math.max(0.00001, p + targetPrice - previousPrice));
  quietSetup = null;
  quietCooldown = STRUCTURE_CONFIG.minCooldown;
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
  updateMarketControls();
}

function updateMarketControls() {
  for (const id of ['pumpBtn', 'dumpBtn']) {
    const control = document.getElementById(id);
    if (control) control.disabled = !marketInterval;
  }
  const button = document.getElementById('marketToggle');
  if (button) button.textContent = marketInterval ? 'Ⅱ Pause market' : '▶ Start market';
  const status = document.getElementById('marketStatus');
  if (status) {
    status.textContent = marketInterval ? '● Market running' : '● Paused';
    status.className = marketInterval ? 'statusBadge running' : 'statusBadge';
  }
  const countdown = document.getElementById('candleCountdown');
  if (countdown) countdown.textContent = ((TICKS_PER_CANDLE - candleTickCount) * 0.25).toFixed(1) + 's';
}

function resetPriceScale() {
  chart.priceScale('right').applyOptions({autoScale:true});
  document.getElementById('autoScale').checked = true;
}
function zoomChart(factor) {
  const scale = chart.timeScale();
  const range = scale.getVisibleLogicalRange();
  if (!range) return;
  const span = Math.max(15, Math.min(3000, (range.to - range.from) * factor));
  const center = (range.from + range.to) / 2;
  scale.setVisibleLogicalRange({from:center - span / 2, to:center + span / 2});
}
document.getElementById('zoomIn')?.addEventListener('click', () => zoomChart(0.75));
document.getElementById('zoomOut')?.addEventListener('click', () => zoomChart(1.35));
document.getElementById('fitChart')?.addEventListener('click', () => {resetPriceScale(); chart.timeScale().fitContent();});
document.getElementById('latestChart')?.addEventListener('click', () => {
  resetPriceScale();
  chart.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length - 100), to:data.length + 5});
});
document.getElementById('autoScale')?.addEventListener('change', e => {
  chart.priceScale('right').applyOptions({autoScale:e.target.checked});
});
// Manual axis scaling disables auto-fit; reflect that in the checkbox.
chartElement.addEventListener('pointerup', () => {
  document.getElementById('autoScale').checked = chart.priceScale('right').options().autoScale;
});
if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => chart.resize(chartElement.clientWidth, chartElement.clientHeight)).observe(chartElement);
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
    resetQuietMarket();
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

