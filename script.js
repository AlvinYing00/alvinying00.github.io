// -----------------------------
// Chart Setup
// -----------------------------
const chartElement = document.getElementById('chart'); 
const chart = LightweightCharts.createChart(chartElement, {
    width: chartElement.clientWidth,
    height: chartElement.clientHeight,
    layout: { backgroundColor: '#000000', textColor: '#DDD' },
    grid: { vertLines: { color: 'transparent' }, horzLines: { color: 'transparent' } }
});
const candleSeries = chart.addCandlestickSeries();

let data = [];
let time = 0;
let marketInterval = null;

const priceDisplay = document.getElementById('priceDisplay');

window.addEventListener('resize', () => {
    chart.resize(chartElement.clientWidth, chartElement.clientHeight);
});

// -----------------------------
// Market & Pattern Config
// -----------------------------
const RETRACE_MIN_FRAC = 0.60; 
const RETRACE_MAX_FRAC = 0.80; 

let retraceTarget = null;
let retraceSteps = 0;
let currentPattern = null;
let patternQueue = [];
let patternCooldown = 0;

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
let currentVolatility = 'low';
let smoothedVol = null;

// -----------------------------
// Volatility Selector
// -----------------------------
const volatilitySelect = document.getElementById('volatilitySelect');
volatilitySelect.addEventListener('change', (e) => {
    applyVolatility(e.target.value);
});

// -----------------------------
// Helper Functions
// -----------------------------
function fmt(num) {
    return Number(num).toFixed(2);
}

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

// -----------------------------
// Price Display & Session Tracking
// -----------------------------
let sessionHigh = null;
let sessionLow = null;

function updatePriceDisplay() {
    if (!data.length) return;

    const lastCandle = data[data.length - 1];
    const prevCandle = data.length > 1 ? data[data.length - 2] : lastCandle;

    const last = lastCandle.close;
    const prev = prevCandle.close;

    if (window.renderTables) window.renderTables();

    priceDisplay.textContent = fmt(last);
    priceDisplay.style.color = last > prev ? 'limegreen' : last < prev ? 'red' : '#DDD';

    // Update high/low
    sessionHigh = sessionHigh === null ? lastCandle.high : Math.max(sessionHigh, lastCandle.high);
    sessionLow = sessionLow === null ? lastCandle.low : Math.min(sessionLow, lastCandle.low);

    document.getElementById('highDisplay').textContent = fmt(sessionHigh);
    document.getElementById('lowDisplay').textContent = fmt(sessionLow);
}

// -----------------------------
// Retracement & Pattern
// -----------------------------
function triggerRetracement(prevPrice, movedPrice) {
    const delta = movedPrice - prevPrice;
    if (Math.abs(delta) < getRetraceThreshold(prevPrice)) return;

    const frac = RETRACE_MIN_FRAC + Math.random() * (RETRACE_MAX_FRAC - RETRACE_MIN_FRAC);
    retraceTarget = movedPrice - delta * frac;
    retraceTarget = Math.max(0.00001, retraceTarget);
    retraceSteps = 10 + Math.floor(Math.random() * 10);

    console.log('Retrace TRIGGERED:', { prevPrice, movedPrice, delta, frac, target: retraceTarget, steps: retraceSteps });
}

function scheduleNextPattern() {
    const patterns = ["doubleTop", "doubleBottom", "headShoulders", "triangle", "flag", "wedge"];
    patternQueue.push(patterns[Math.floor(Math.random() * patterns.length)]);
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
        default: generateCandle();
    }

    currentPattern.steps--;
    if (currentPattern.steps <= 0) {
        console.log("Pattern finished:", currentPattern.name);
        currentPattern = null;
        patternCooldown = 120;
    }
}

// -----------------------------
// Candle Generation
// -----------------------------
function generateCandle() {
    time++;
    const lastPrice = data[data.length - 1].close;
    let newClose = lastPrice;

    // Retracement logic
    if (retraceTarget !== null && retraceSteps > 0) {
        const remainingDelta = retraceTarget - lastPrice;
        const baseStep = remainingDelta / retraceSteps;
        const noise = (Math.random() - 0.5) * Math.abs(baseStep);
        newClose = lastPrice + baseStep + noise;
        retraceSteps--;
        if (retraceSteps <= 0) retraceTarget = null;
    } else if (currentTrend) {
        const trendDirection = currentTrend === "up" ? 1 : -1;
        const baseStep = getVolatility(lastPrice) * TREND_VOL_FACTOR;
        const noise = (Math.random() - 0.5) * baseStep * 0.2;
        newClose = Math.max(0.01, lastPrice + baseStep * trendDirection + noise);
        trendSteps--;
        if (trendSteps <= 0) currentTrend = null;
    } else {
        const baseVol = getVolatility(lastPrice);
        const drift = (Math.random() - 0.5) * baseVol;
        newClose = Math.max(0.01, lastPrice + drift);
        if (Math.abs(drift) >= getRetraceThreshold(lastPrice)) triggerRetracement(lastPrice, newClose);
    }

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

function generatePatternCandle() {
    if (currentPattern) { continuePattern(); return; }
    if (patternCooldown > 0) { generateCandle(); patternCooldown--; if (patternCooldown === 0) scheduleNextPattern(); return; }
    if (patternQueue.length > 0) { startPattern(patternQueue.shift()); return; }
    generateCandle();
}

// -----------------------------
// Market Control
// -----------------------------
function toggleMarket() {
    if (marketInterval) {
        clearInterval(marketInterval);
        marketInterval = null;
        console.log('Market stopped.');
        if (typeof window.setMarketOpen === "function") window.setMarketOpen(false);
    } else {
        marketInterval = setInterval(generatePatternCandle, 1000);
        console.log('Market started.');
        if (typeof window.setMarketOpen === "function") window.setMarketOpen(true);
    }
}

// -----------------------------
// Volatility Application
// -----------------------------
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

    // Update global balance from trade.js
    balance = cfg.balance;
    if (window.renderTables) window.renderTables();

    // First candle
    const initialPrice = cfg.priceMin + Math.random() * (cfg.priceMax - cfg.priceMin);
    const wick = initialPrice * 0.001;
    const firstCandle = { time: ++time, open: initialPrice, high: initialPrice + wick, low: initialPrice - wick, close: initialPrice };
    data.push(firstCandle);
    candleSeries.setData(data);
    updatePriceDisplay();
}

// -----------------------------
// Initialize Chart with Default Volatility
// -----------------------------
applyVolatility(currentVolatility);
