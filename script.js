// ---- Chart Setup ----
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

// ---- Retracement Params ----
const RETRACE_MIN_FRAC = 0.60;
const RETRACE_MAX_FRAC = 0.80;
let retraceTarget = null;
let retraceSteps = 0;

// ---- Pattern / Trend Variables ----
let currentPattern = null;
let patternQueue = [];
let patternCooldown = 0;
let currentTrend = null;
let trendSteps = 0;

const TREND_CHANCE = 0.15;
const TREND_MIN_STEPS = 25;
const TREND_MAX_STEPS = 50;
const TREND_VOL_FACTOR = 0.5;

// ---- Volatility Config ----
const volatilityConfig = {
    low:   { priceMin: 9,     priceMax: 10,     balance: 100 },
    medium:{ priceMin: 90,    priceMax: 100,    balance: 500 },
    high:  { priceMin: 900,   priceMax: 1000,   balance: 1000 },
    ultra: { priceMin: 9000,  priceMax: 10000,  balance: 10000 }
};
let currentVolatility = 'low';

// ---- Utilities ----
function fmt(num) { return Number(num).toFixed(2); }

let smoothedVol = null;
function getVolatility(price) {
    const MIN_MOVE = price * 0.0055;
    const MAX_MOVE = price * 0.105;
    const r = Math.random();
    const skewed = Math.pow(r, 2.5);
    const rawVol = MIN_MOVE + (MAX_MOVE - MIN_MOVE) * skewed;
    smoothedVol = smoothedVol === null ? rawVol : smoothedVol * 0.8 + rawVol * 0.2;
    return smoothedVol;
}

function getRetraceThreshold(price) {
    const magnitude = Math.floor(Math.log10(price));
    return 0.5 * Math.pow(10, magnitude);
}

// ---- Chart Init ----
let sessionHigh = null;
let sessionLow = null;

function initFirstCandle(minPrice, maxPrice) {
    const initialPrice = minPrice + Math.random() * (maxPrice - minPrice);
    const wick = initialPrice * 0.005;
    const firstCandle = {
        time: ++time,
        open: initialPrice,
        high: initialPrice + Math.random() * wick,
        low: Math.max(0.00001, initialPrice - Math.random() * wick),
        close: initialPrice
    };
    data.push(firstCandle);
    candleSeries.setData(data);
    sessionHigh = firstCandle.high;
    sessionLow = firstCandle.low;
    updatePriceDisplay();
}

// ---- Price Display ----
function updatePriceDisplay() {
    if (!data.length) return;
    const lastCandle = data[data.length - 1];
    const prevCandle = data.length > 1 ? data[data.length - 2] : lastCandle;
    const last = lastCandle.close;
    const prev = prevCandle.close;

    if (window.renderTables) window.renderTables();

    priceDisplay.textContent = fmt(last);
    priceDisplay.style.color = last > prev ? 'limegreen' : last < prev ? 'red' : '#DDD';

    if (lastCandle.high > sessionHigh) sessionHigh = lastCandle.high;
    if (lastCandle.low < sessionLow) sessionLow = lastCandle.low;

    document.getElementById('highDisplay').textContent = fmt(sessionHigh);
    document.getElementById('lowDisplay').textContent = fmt(sessionLow);
}

// ---- Patterns ----
function scheduleNextPattern() {
    const patterns = ["doubleTop", "doubleBottom", "headShoulders", "triangle", "flag", "wedge"];
    const choice = patterns[Math.floor(Math.random() * patterns.length)];
    patternQueue.push(choice);
    patternCooldown = 120;
}

function startPattern(name) {
    const steps = 80 + Math.floor(Math.random() * 71);
    currentPattern = { name, steps, totalSteps: steps };
}

function continuePattern() {
    if (!currentPattern) return;

    switch(currentPattern.name) {
        case "doubleTop": generateDoubleTopCandle(); break;
        case "doubleBottom": generateDoubleBottomCandle(); break;
        case "headShoulders": generateHeadAndShouldersCandle(); break;
        case "triangle": generateTriangleCandle(); break;
        case "flag": generateFlagCandle(); break;
        case "wedge": generateWedgeCandle(); break;
        default: generateDriftCandle();
    }

    currentPattern.steps--;
    if (currentPattern.steps <= 0) {
        currentPattern = null;
        patternCooldown = 120;
    }
}

// ---- Candle Generator ----
function generateDriftCandle() {
    if (!data.length) return;
    time++;
    const lastPrice = data[data.length - 1].close;
    let newClose;

    if (Math.random() < 0.001) {
        const spikeDir = Math.random() < 0.5 ? -1 : 1;
        const spikeAmt = lastPrice * (0.15 + Math.random() * 0.15) * spikeDir;
        newClose = Math.max(0.00001, lastPrice + spikeAmt);
    } else if (retraceTarget !== null && retraceSteps > 0) {
        const step = (retraceTarget - lastPrice) / retraceSteps;
        const noise = (Math.random() - 0.5) * Math.abs(step);
        newClose = lastPrice + step + noise;
        retraceSteps--;
        if (retraceSteps <= 0) retraceTarget = null;
    } else if (currentTrend) {
        const trendDir = currentTrend === "up" ? 1 : -1;
        const baseStep = getVolatility(lastPrice) * TREND_VOL_FACTOR * trendDir;
        const noise = (Math.random() - 0.5) * baseStep * 0.2;
        newClose = Math.max(0.01, lastPrice + baseStep + noise);
        trendSteps--;
        if (trendSteps <= 0) currentTrend = null;
    } else {
        const drift = (Math.random() - 0.5) * getVolatility(lastPrice);
        newClose = Math.max(0.01, lastPrice + drift);
        if (Math.abs(drift) >= getRetraceThreshold(lastPrice)) triggerRetracement(lastPrice, newClose);
    }

    // Candle + wick
    const bodyHigh = Math.max(lastPrice, newClose);
    const bodyLow = Math.min(lastPrice, newClose);
    const wickHigh = bodyHigh + Math.random() * getVolatility(lastPrice) * 0.5;
    const wickLow = Math.max(0.00001, bodyLow - Math.random() * getVolatility(lastPrice) * 0.5);

    const candle = { time, open: lastPrice, high: Math.max(bodyHigh, wickHigh), low: Math.min(bodyLow, wickLow), close: newClose };
    data.push(candle);
    if (data.length > 3000) data.shift();
    candleSeries.setData(data);
    updatePriceDisplay();

    if (typeof updateFloatingPL === 'function') updateFloatingPL();
}

// ---- Pattern / Drift Controller ----
function generatePatternCandle() {
    if (currentPattern) {
        continuePattern();
        return;
    }
    if (patternCooldown > 0) {
        generateDriftCandle();
        patternCooldown--;
        if (patternCooldown === 0) scheduleNextPattern();
        return;
    }
    if (patternQueue.length > 0) {
        const next = patternQueue.shift();
        startPattern(next);
        return;
    }
    generateDriftCandle();
}

// ---- Pump / Dump ----
function pump() {
    const v = Number(document.getElementById('priceInput').value);
    if (!isFinite(v) || v === '') return alert('Enter a valid number.');
    const lastPrice = data[data.length - 1].close;
    const target = lastPrice + Math.abs(v);
    pushManualCandle(lastPrice, target);
}

function dump() {
    const v = Number(document.getElementById('priceInput').value);
    if (!isFinite(v) || v === '') return alert('Enter a valid number.');
    const lastPrice = data[data.length - 1].close;
    const target = lastPrice - Math.abs(v);
    pushManualCandle(lastPrice, target);
}

function pushManualCandle(open, close) {
    time++;
    const baseSpike = Math.max(Math.abs(close - open) * 0.6, getVolatility(open) * 0.03);
    const high = Math.max(open, close) + Math.random() * baseSpike;
    const low = Math.min(open, close) - Math.random() * baseSpike;
    const candle = { time, open, high: Math.max(open, close, high), low: Math.max(0.00001, low), close };
    data.push(candle);
    if (data.length > 3000) data.shift();
    candleSeries.setData(data);
    updatePriceDisplay();
}

// ---- Trend Starter ----
function maybeStartTrend() {
    if (!currentTrend && Math.random() < TREND_CHANCE) {
        currentTrend = Math.random() < 0.5 ? "up" : "down";
        trendSteps = TREND_MIN_STEPS + Math.floor(Math.random() * (TREND_MAX_STEPS - TREND_MIN_STEPS + 1));
    }
}

// ---- Market Control ----
function toggleMarket() {
    if (marketInterval) {
        clearInterval(marketInterval);
        marketInterval = null;
        if (typeof window.setMarketOpen === 'function') window.setMarketOpen(false);
    } else {
        marketInterval = setInterval(() => {
            maybeStartTrend();
            generatePatternCandle();
        }, 1000);
        if (typeof window.setMarketOpen === 'function') window.setMarketOpen(true);
    }
}

// ---- Volatility ----
function applyVolatility(level) {
    currentVolatility = level;
    const cfg = volatilityConfig[level];
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

    balance = cfg.balance;
    if (window.renderTables) window.renderTables();
    initFirstCandle(cfg.priceMin, cfg.priceMax);
}

// ---- Event Listeners ----
document.getElementById('volatilitySelect').addEventListener('change', e => {
    const selectedVol = e.target.value;
    localStorage.setItem('selectedVolatility', selectedVol);
    location.reload();
});

window.addEventListener('load', () => {
    const savedVol = localStorage.getItem('selectedVolatility');
    if (savedVol) {
        document.getElementById('volatilitySelect').value = savedVol;
        applyVolatility(savedVol);
    } else applyVolatility(currentVolatility);
});

window.addEventListener('resize', () => {
    chart.resize(chartElement.clientWidth, chartElement.clientHeight);
});
