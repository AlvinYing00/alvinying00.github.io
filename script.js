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

// ---- Retracement params ----
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

// ---- UTILITIES ----
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

// ---- CHART INITIALIZATION ----
let sessionHigh = null;
let sessionLow = null;

function initFirstCandle(minPrice, maxPrice) {
    const initialPrice = minPrice + Math.random() * (maxPrice - minPrice);
    const wick = initialPrice * 0.005 ; //small wick around price
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

// ---- PRICE DISPLAY ----
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

// ---- RETRACEMENT ----
function triggerRetracement(prevPrice, movedPrice) {
    const delta = movedPrice - prevPrice;
    if (Math.abs(delta) < getRetraceThreshold(prevPrice)) return;

    const frac = RETRACE_MIN_FRAC + Math.random() * (RETRACE_MAX_FRAC - RETRACE_MIN_FRAC);
    retraceTarget = movedPrice - delta * frac;
    retraceTarget = Math.max(0.00001, retraceTarget);
    retraceSteps = 10 + Math.floor(Math.random() * 10);
}

// ---- CANDLE GENERATION ----
function generateCandle() {
    if (!data.length) return;

    time++;
    const lastPrice = data[data.length - 1].close;
    let newClose;

    // Rare spike
    if (Math.random() < 0.001) {
        const direction = Math.random() < 0.5 ? -1 : 1;
        const spike = lastPrice * (0.15 + Math.random() * 0.15) * direction;
        newClose = Math.max(0.00001, lastPrice + spike);
    } else if (retraceTarget !== null && retraceSteps > 0) {
        const step = (retraceTarget - lastPrice) / retraceSteps;
        const noise = (Math.random() - 0.5) * Math.abs(step);
        newClose = lastPrice + step + noise;
        retraceSteps--;
        if (retraceSteps <= 0) retraceTarget = null;
    } else {
        const drift = (Math.random() - 0.5) * getVolatility(lastPrice);
        newClose = Math.max(0.01, lastPrice + drift);
        if (Math.abs(drift) >= getRetraceThreshold(lastPrice)) {
            triggerRetracement(lastPrice, newClose);
        }
    }

    // Add wick around the body
    const bodyHigh = Math.max(lastPrice, newClose);
    const bodyLow = Math.min(lastPrice, newClose);
    const wickHigh = bodyHigh + Math.random() * getVolatility(lastPrice) * 0.5;
    const wickLow = Math.max(0.00001, bodyLow - Math.random() * getVolatility(lastPrice) * 0.5);

    const candle = {
        time,
        open: lastPrice,
        high: Math.max(bodyHigh, wickHigh),
        low: Math.min(bodyLow, wickLow),
        close: newClose
    };

    data.push(candle);
    if (data.length > 3000) data.shift();
    candleSeries.setData(data);
    updatePriceDisplay();

    // ---- Update floating P/L for open trades ----
    if (typeof updateFloatingPL === 'function') updateFloatingPL();
    renderTables(); // make sure tables reflect updated P/L
}

// ---- VOLATILITY ----
function applyVolatility(level) {
    currentVolatility = level;
    const cfg = volatilityConfig[level];

    // Reset everything
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

    // Init first candle with wick
    initFirstCandle(cfg.priceMin, cfg.priceMax);
}

const volatilitySelect = document.getElementById('volatilitySelect');
volatilitySelect.addEventListener('change', e => applyVolatility(e.target.value));

// ---- MARKET CONTROL ----
function toggleMarket() {
    if (marketInterval) {
        clearInterval(marketInterval);
        marketInterval = null;
        console.log('Market stopped.');
        if (typeof window.setMarketOpen === 'function') window.setMarketOpen(false);
    } else {
        marketInterval = setInterval(generateCandle, 1000);
        console.log('Market started.');
        if (typeof window.setMarketOpen === 'function') window.setMarketOpen(true);
    }
}

window.addEventListener('resize', () => {
    chart.resize(chartElement.clientWidth, chartElement.clientHeight);
});

// ---- START ----
applyVolatility(currentVolatility);
