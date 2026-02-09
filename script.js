const chartElement = document.getElementById('chart');
const chart = LightweightCharts.createChart(chartElement, {
    width: chartElement.clientWidth,
    height: chartElement.clientHeight,
    layout: { backgroundColor: '#000000', textColor: '#DDD' },
    grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } },
});
const candleSeries = chart.addCandlestickSeries();

let data = [];
let time = 0;
let marketInterval = null;
const priceDisplay = document.getElementById('priceDisplay');

// ---- Configuration & State ----
const RETRACE_MIN_FRAC = 0.60;
const RETRACE_MAX_FRAC = 0.80;
let retraceTarget = null;
let retraceSteps = 0;

let currentPattern = null;
let patternQueue = [];
let patternCooldown = 120;
let currentTrend = null;
let trendSteps = 0;

const TREND_CHANCE = 0.15;
const TREND_MIN_STEPS = 25;
const TREND_MAX_STEPS = 50;
const TREND_VOL_FACTOR = 0.5;

const volatilityConfig = {
    low:   { priceMin: 9,     priceMax: 10,     balance: 100 },
    medium:{ priceMin: 90,    priceMax: 100,    balance: 500 },
    high:  { priceMin: 900,   priceMax: 1000,   balance: 1000 },
    ultra: { priceMin: 9000,  priceMax: 10000,  balance: 10000 }
};
let currentVolatility = localStorage.getItem('selectedVolatility') || 'low';

// ---- Utilities ----
function fmt(num) { return Number(num).toFixed(2); }

let smoothedVol = null;
function getVolatility(price) {
    const MIN_MOVE = price * 0.0055;
    const MAX_MOVE = price * 0.105;
    const skewed = Math.pow(Math.random(), 2.5);
    const rawVol = MIN_MOVE + (MAX_MOVE - MIN_MOVE) * skewed;
    smoothedVol = (smoothedVol === null) ? rawVol : (smoothedVol * 0.8 + rawVol * 0.2);
    return smoothedVol;
}

function getRetraceThreshold(price) {
    return 0.5 * Math.pow(10, Math.floor(Math.log10(price)));
}

// ---- UI & Display ----
let sessionHigh = null;
let sessionLow = null;

function updatePriceDisplay() {
    if (data.length < 1) return;
    const lastCandle = data[data.length - 1];
    const prevCandle = data.length > 1 ? data[data.length - 2] : lastCandle;
    const last = lastCandle.close;

    if (window.renderTables) window.renderTables();
    priceDisplay.textContent = fmt(last);
    priceDisplay.style.color = last > prevCandle.close ? 'limegreen' : (last < prevCandle.close ? 'red' : '#DDD');

    if (sessionHigh === null || lastCandle.high > sessionHigh) sessionHigh = lastCandle.high;
    if (sessionLow === null || lastCandle.low < sessionLow) sessionLow = lastCandle.low;

    document.getElementById('highDisplay').textContent = fmt(sessionHigh);
    document.getElementById('lowDisplay').textContent = fmt(sessionLow);
}

// ---- Market Logic Functions ----
function triggerRetracement(prevPrice, movedPrice) {
    const delta = movedPrice - prevPrice;
    if (Math.abs(delta) < getRetraceThreshold(prevPrice)) return;
    const frac = RETRACE_MIN_FRAC + Math.random() * (RETRACE_MAX_FRAC - RETRACE_MIN_FRAC);
    retraceTarget = Math.max(0.00001, movedPrice - delta * frac);
    retraceSteps = 10 + Math.floor(Math.random() * 10);
}

function maybeStartTrend() {
    if (!currentTrend && Math.random() < TREND_CHANCE) {
        currentTrend = Math.random() < 0.5 ? "up" : "down";
        trendSteps = TREND_MIN_STEPS + Math.floor(Math.random() * (TREND_MAX_STEPS - TREND_MIN_STEPS));
    }
}

// ---- Pattern Orchestration ----
function scheduleNextPattern() {
    const patterns = ["doubleTop", "doubleBottom", "headShoulders", "triangle", "flag", "wedge"];
    patternQueue.push(patterns[Math.floor(Math.random() * patterns.length)]);
}

function startPattern(name) {
    const steps = Math.floor(80 + Math.random() * 71);
    currentPattern = { name, steps, totalSteps: steps };
}

// Pattern Stubs (Logic can be added to bias the generateCandle function)
function continuePattern() {
    if (!currentPattern) return;
    // You can add specific bias to generateCandle() here based on currentPattern.name
    generateCandle(); 
    currentPattern.steps--;
    if (currentPattern.steps <= 0) {
        currentPattern = null;
        patternCooldown = 120;
    }
}

// ---- Core Candle Generation ----
function generateCandle() {
    if (!data.length) return;
    time++;
    const lastPrice = data[data.length - 1].close;
    let newClose;

    // 1. Rare Spike
    if (Math.random() < 0.001) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        newClose = Math.max(0.00001, lastPrice + (lastPrice * (0.15 + Math.random() * 0.15) * dir));
    } 
    // 2. Retracement
    else if (retraceTarget !== null && retraceSteps > 0) {
        const step = (retraceTarget - lastPrice) / retraceSteps;
        newClose = lastPrice + step + (Math.random() - 0.5) * Math.abs(step);
        retraceSteps--;
        if (retraceSteps <= 0) { newClose = retraceTarget; retraceTarget = null; }
    } 
    // 3. Trend or Drift
    else {
        maybeStartTrend();
        const vol = getVolatility(lastPrice);
        if (currentTrend) {
            const dir = currentTrend === "up" ? 1 : -1;
            newClose = lastPrice + (vol * TREND_VOL_FACTOR * dir) + (Math.random() - 0.5) * vol * 0.2;
            trendSteps--;
            if (trendSteps <= 0) currentTrend = null;
        } else {
            const drift = (Math.random() - 0.5) * vol;
            newClose = Math.max(0.01, lastPrice + drift);
            if (Math.abs(drift) >= getRetraceThreshold(lastPrice)) triggerRetracement(lastPrice, newClose);
        }
    }

    const bodyHigh = Math.max(lastPrice, newClose);
    const bodyLow = Math.min(lastPrice, newClose);
    const v = getVolatility(lastPrice);
    
    const candle = {
        time,
        open: lastPrice,
        high: bodyHigh + Math.random() * v * 0.3,
        low: Math.max(0.00001, bodyLow - Math.random() * v * 0.3),
        close: newClose
    };

    data.push(candle);
    if (data.length > 3000) data.shift();
    candleSeries.setData(data);
    updatePriceDisplay();
    if (typeof updateFloatingPL === 'function') updateFloatingPL();
}

// Main interval driver
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

// ---- Volatility & Initialization ----
function applyVolatility(level) {
    const cfg = volatilityConfig[level];
    data = []; time = 0; sessionHigh = null; sessionLow = null;
    retraceTarget = null; currentTrend = null;
    
    const initialPrice = cfg.priceMin + Math.random() * (cfg.priceMax - cfg.priceMin);
    data.push({ time: ++time, open: initialPrice, high: initialPrice, low: initialPrice, close: initialPrice });
    candleSeries.setData(data);
    updatePriceDisplay();
}

const volatilitySelect = document.getElementById('volatilitySelect');
volatilitySelect.addEventListener('change', e => {
    localStorage.setItem('selectedVolatility', e.target.value);
    location.reload();
});

// ---- Market Controls ----
function toggleMarket() {
    if (marketInterval) {
        clearInterval(marketInterval);
        marketInterval = null;
        if (typeof window.setMarketOpen === 'function') window.setMarketOpen(false);
    } else {
        marketInterval = setInterval(tick, 1000);
        if (typeof window.setMarketOpen === 'function') window.setMarketOpen(true);
    }
}

window.addEventListener('resize', () => chart.resize(chartElement.clientWidth, chartElement.clientHeight));

// Start
volatilitySelect.value = currentVolatility;
applyVolatility(currentVolatility);
