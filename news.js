// news.js
// ============================================================
// NEWS SIMULATION CONFIGURATION
// ============================================================
// Edit this file to control:
// 1. Fixed scheduled news
// 2. Hot/unexpected news
// 3. News volatility multipliers
// 4. News duration
// 5. Hot-news rotation frequency
//
// Price impact is applied by script.js on each 250ms tick.
// ============================================================

const NEWS_CONFIG = {

    // -----------------------------
    // Fixed news
    // -----------------------------
    fixed: {
        enabled: true,
        firstDelaySeconds: 60,
        gapAfterEndSeconds: 15 * 60,
        durationSeconds: 120, // All fixed-news reaction types.

        // Events rotate in this order after each release ends.
        events: [
            {
                id: "NFP",
                name: "US Non-Farm Payrolls (NFP)",
                category: "employment",
                impact: 4.0,
                surpriseRange: 0.35
            },
            {
                id: "CPI",
                name: "US Consumer Price Index (CPI)",
                category: "inflation",
                impact: 3.5,
                surpriseRange: 0.30
            },
            {
                id: "GDP",
                name: "US GDP",
                category: "growth",
                impact: 2.5,
                surpriseRange: 0.25
            },
            {
                id: "FOMC",
                name: "FOMC Interest Rate Decision",
                category: "rates",
                impact: 5.0,
                surpriseRange: 0.50
            }
        ]
    },

    // -----------------------------
    // Hot / unexpected news
    // -----------------------------
    hot: {
        enabled: true,

        // Random hot-news rotation.
        // Once every 20–35 minutes of running market time.
        minRotationSeconds: 20 * 60,
        maxRotationSeconds: 35 * 60,

        events: [
            {
                id: "PRESIDENT_SPEAK",
                name: "President Gives Unexpected Speech",
                category: "political",
                impact: 4.0,
                minDurationSeconds: 20,
                maxDurationSeconds: 60,
                direction: "uncertain"
            },
            {
                id: "GEOPOLITICAL_ATTACK",
                name: "Major Geopolitical Attack Reported",
                category: "geopolitical",
                impact: 6.0,
                minDurationSeconds: 30,
                maxDurationSeconds: 90,
                direction: "uncertain"
            },
            {
                id: "FUND_FREEZE",
                name: "Country Announces Emergency Fund Freeze",
                category: "financial",
                impact: 7.0,
                minDurationSeconds: 30,
                maxDurationSeconds: 120,
                direction: "uncertain"
            },
            {
                id: "EMERGENCY_POLICY",
                name: "Emergency Economic Policy Announced",
                category: "economic",
                impact: 5.0,
                minDurationSeconds: 25,
                maxDurationSeconds: 75,
                direction: "uncertain"
            }
        ]
    },

    // -----------------------------
    // Tick-level volatility
    // -----------------------------
    volatility: {

        // Normal market tick movement.
        normalMultiplier: 1.0,

        // Extra volatility caused by fixed news.
        fixedNewsMultiplier: 1.0,

        // Extra volatility caused by hot news.
        hotNewsMultiplier: 1.0,

    },

    // Release shock, partial recovery, then noisy price discovery.
    // Fractions are relative to the release price or initial shock.
    reaction: {
        continuationChance: 0.6, // High/Extreme follow-through probability.
        extremeSecondSpikeDelaySeconds: 4, // Measured from the first spike.
        extremeSecondSpikeFraction: 0.5, // Half the first spike's absolute price change.
        continuationSeconds: 120,
        // Each event can override these weights using its own impactChances.
        impactChances: {medium: 0.50, high: 0.30, extreme: 0.20},
        delaySeconds: 2, // News is visible immediately; price shock waits two seconds.
        panicMinTickFraction: 0.012, // Pre-spike moves: 1.2–3.5% of release price per tick.
        panicMaxTickFraction: 0.035,
        panicMaxDeviationFraction: 0.08, // Keep the two-second scramble near the release price.
        shockPriceFraction: 0.20, // 20% at impact 4, before variation and limits
        minShockPriceFraction: 0.15,
        maxShockPriceFraction: 0.25,
        shockVariationMin: 0.8,
        shockVariationMax: 1.2,
        pullbackDurationFraction: 0.35,
        pullbackFraction: 0.45, // recover part of the initial spike
        finalRetentionFraction: 0.75, // directional bias after recovery
        reversionPerTick: 0.12,
        noiseFraction: 0.09, // two-sided noise relative to initial shock
        finalNoiseMultiplier: 0.35
    }
};


// ============================================================
// Runtime news state
// ============================================================

let activeNews = null;
let newsContinuation = null;
let nextHotNewsTime = 0;
let nextFixedNewsTimes = {};
let fixedRotationIndex = 0;
const FIXED_NEWS_WARNING_SECONDS = 60;
let newsHistory = [];

function resetNews(nowSeconds) {
    activeNews = null;
    newsContinuation = null;
    newsHistory = [];
    scheduleInitialNews(nowSeconds);
    renderNews(nowSeconds);
}

function randomBetween(min, max) {
    return min + Math.random() * (max - min);
}

function randomSign() {
    return Math.random() < 0.5 ? -1 : 1;
}

function scheduleInitialNews(nowSeconds) {

    nextHotNewsTime =
        nowSeconds +
        randomBetween(
            NEWS_CONFIG.hot.minRotationSeconds,
            NEWS_CONFIG.hot.maxRotationSeconds
        );

    fixedRotationIndex = 0;
    const first = NEWS_CONFIG.fixed.events[0];
    nextFixedNewsTimes = first ? {[first.id]: nowSeconds + NEWS_CONFIG.fixed.firstDelaySeconds} : {};
}

function getNewsVolatilityMultiplier() {

    if (!activeNews) {
        return NEWS_CONFIG.volatility.normalMultiplier;
    }

    const base =
        activeNews.type === "hot"
            ? NEWS_CONFIG.volatility.hotNewsMultiplier
            : NEWS_CONFIG.volatility.fixedNewsMultiplier;

    return base * activeNews.impact;
}

function startNews(event, type, nowSeconds) {

    let direction = event.direction || "uncertain";

    if (direction === "uncertain") {
        direction = randomSign();
    } else {
        direction = direction === "up" ? 1 : -1;
    }

    let durationSeconds =
        type === "hot"
            ? randomBetween(
                event.minDurationSeconds,
                event.maxDurationSeconds
              )
            : NEWS_CONFIG.fixed.durationSeconds;

    const weights = event.impactChances || NEWS_CONFIG.reaction.impactChances;
    const roll = Math.random() * (weights.medium + weights.high + weights.extreme);
    const emotionalImpact = roll < weights.medium ? 'medium'
        : roll < weights.medium + weights.high ? 'high' : 'extreme';
    // A fresh release takes priority over any older follow-through.
    newsContinuation = null;

    activeNews = {
        id: event.id,
        name: event.name,
        category: event.category,
        type,
        impact: event.impact,
        emotionalImpact,
        direction,
        startTime: nowSeconds,
        endTime: nowSeconds + durationSeconds,
        durationSeconds,
        reaction: null,
        panic: null
    };

    newsHistory.unshift({name: event.name, type, startTime: nowSeconds});
    newsHistory = newsHistory.slice(0, 6);
}

// Start follow-through only after the actual spike candle has closed.
function onNewsCandleClosed(candle, nowSeconds) {
    const ended = activeNews;
    if (!ended || !ended.reaction || ended.emotionalImpact === 'medium') return;
    const reaction = ended.reaction;
    if (reaction.continuationDecided || !reaction.spikeTimes.includes(candle.time)) return;
    if (ended.emotionalImpact === 'extreme' && !reaction.secondShockDone) return;
    reaction.continuationDecided = true;
    if (Math.random() >= NEWS_CONFIG.reaction.continuationChance) return;
    const candles = data.filter(c => reaction.spikeTimes.includes(c.time));
    const reference = ended.direction > 0 ? Math.max(...candles.map(c => c.high)) : Math.min(...candles.map(c => c.low));
    const startPrice = currentTickPrice;
    const margin = Math.max(Math.abs(reference) * 0.025, reaction.size * 0.1);
    const target = ended.direction > 0 ? Math.max(reference,startPrice)+margin : Math.max(0.00001,Math.min(reference,startPrice)-margin);
    // Finish before the active countdown ends, rather than starting at expiration.
    const ticks = Math.floor(Math.min(NEWS_CONFIG.reaction.continuationSeconds, ended.endTime-nowSeconds-0.25)/0.25);
    if (ticks < 1) return;
    newsContinuation = {direction:ended.direction,reference,target,startPrice,startTime:nowSeconds,remainingTicks:ticks,totalTicks:ticks,excursion:0};
}

function updateNews(nowSeconds) {

    if (activeNews && nowSeconds >= activeNews.endTime) {
        if (activeNews.type === 'fixed' && NEWS_CONFIG.fixed.events.length) {
            const next = NEWS_CONFIG.fixed.events[fixedRotationIndex];
            nextFixedNewsTimes = {[next.id]: activeNews.endTime + NEWS_CONFIG.fixed.gapAfterEndSeconds};
        }
        activeNews = null;
    }

    // First initialization.
    if (!nextHotNewsTime && !Object.keys(nextFixedNewsTimes).length) {
        scheduleInitialNews(nowSeconds);
    }

    // -----------------------------
    // Fixed news
    // -----------------------------
    if (NEWS_CONFIG.fixed.enabled) {

        for (const event of NEWS_CONFIG.fixed.events) {

            if (nowSeconds >= nextFixedNewsTimes[event.id]) {

                startNews(event, "fixed", nowSeconds);

                fixedRotationIndex = (NEWS_CONFIG.fixed.events.indexOf(event) + 1) % NEWS_CONFIG.fixed.events.length;
                nextFixedNewsTimes = {};

                break;
            }
        }
    }

    // -----------------------------
    // Hot news
    // -----------------------------
    if (
        NEWS_CONFIG.hot.enabled &&
        NEWS_CONFIG.hot.events.length > 0 &&
        nowSeconds >= nextHotNewsTime &&
        !activeNews
    ) {

        const events = NEWS_CONFIG.hot.events;
        const event = events[Math.floor(Math.random() * events.length)];

        startNews(event, "hot", nowSeconds);

        nextHotNewsTime =
            nowSeconds +
            randomBetween(
                NEWS_CONFIG.hot.minRotationSeconds,
                NEWS_CONFIG.hot.maxRotationSeconds
            );
    }

    renderNews(nowSeconds);
}

function formatNewsClock(seconds) {
    const value = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function renderNews(nowSeconds) {
    if (typeof batchingTicks !== 'undefined' && batchingTicks) return;
    const setText = (id, text) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    };
    const upcoming = NEWS_CONFIG.fixed.enabled
        ? NEWS_CONFIG.fixed.events.map(event => ({event, time: nextFixedNewsTimes[event.id]}))
            .filter(item => Number.isFinite(item.time)).sort((a,b) => a.time - b.time)
        : [];
    const warnings = upcoming.filter(item => item.time - nowSeconds <= FIXED_NEWS_WARNING_SECONDS);
    const next = upcoming[0];
    const panel = document.getElementById('newsPanel');
    if (panel) panel.className = activeNews ? `news-active ${activeNews.type}-news` : '';
    setText('newsStatus', activeNews ? '● NEWS ACTIVE' : warnings.length ? '● NEWS INCOMING' : '● MARKET CALM');
    setText('newsType', activeNews ? `${activeNews.type.toUpperCase()} NEWS` : 'NO ACTIVE NEWS');
    setText('newsTitle', activeNews ? activeNews.name : 'Waiting for market news...');
    setText('newsTime', activeNews ? `Market ${formatNewsClock(activeNews.startTime)}` : '—');
    setText('newsRemaining', activeNews ? formatNewsClock(activeNews.endTime - nowSeconds) : '—');
    const notice = document.getElementById('fixedNewsNotice');
    if (notice) {
        notice.className = warnings.length ? 'news-countdown' : '';
        notice.textContent = warnings.length
            ? warnings.map(({event,time}) => `${event.name} — ${time <= nowSeconds ? 'Awaiting current news to finish' : `Starts in ${formatNewsClock(time - nowSeconds)}`}`).join(' • ')
            : next ? `${next.event.name} — Starts in ${formatNewsClock(next.time - nowSeconds)}`
            : activeNews?.type === 'fixed' ? 'The next fixed-news countdown starts when this release ends.'
            : 'Fixed news is disabled or no events are scheduled.';
    }
    const history = document.getElementById('newsHistory');
    if (history) {
        history.innerHTML = '';
        for (const event of newsHistory) {
            const row = document.createElement('div');
            row.className = 'newsHistoryItem';
            row.textContent = `${event.type.toUpperCase()} · ${event.name} · Market ${formatNewsClock(event.startTime)}`;
            history.appendChild(row);
        }
    }
}

function applyNewsToPriceMove(baseMove, nowSeconds, price) {

    updateNews(nowSeconds);

    {
        if (newsContinuation) {
            const follow = newsContinuation;
            if (nowSeconds <= follow.startTime) return baseMove * NEWS_CONFIG.volatility.normalMultiplier;
            const remaining = follow.remainingTicks;
            // Noisy bridge: alternating excursions, with an exact final breakout.
            const amplitude = Math.max(Math.abs(follow.target - follow.startPrice), follow.startPrice * 0.04);
            const nextExcursion = remaining <= 1 ? 0 : follow.excursion * (remaining - 1) / remaining +
                randomBetween(-1, 1) * amplitude * 0.055 * Math.sqrt((remaining - 1) / remaining);
            const move = (follow.target - price + follow.excursion) / remaining + nextExcursion - follow.excursion;
            follow.excursion = nextExcursion;
            follow.remainingTicks--;
            if (!follow.remainingTicks) newsContinuation = null;
            return move;
        }
        if (!activeNews) return baseMove * NEWS_CONFIG.volatility.normalMultiplier;
    }

    const cfg = NEWS_CONFIG.reaction;
    const reactionTime = activeNews.startTime + cfg.delaySeconds;
    if (nowSeconds < reactionTime) {
        if (!activeNews.panic) activeNews.panic = {anchor: price, sign: 0, run: 0};
        const panic = activeNews.panic;
        // Direction-independent bursts; no more than two ticks in one direction.
        let sign = panic.run >= 2 ? -panic.sign : randomSign();
        const magnitude = panic.anchor * randomBetween(cfg.panicMinTickFraction, cfg.panicMaxTickFraction);
        const limit = panic.anchor * cfg.panicMaxDeviationFraction;
        if (Math.abs(price + sign * magnitude - panic.anchor) > limit) sign = -sign;
        panic.run = sign === panic.sign ? panic.run + 1 : 1;
        panic.sign = sign;
        return sign * magnitude;
    }
    if (!activeNews.reaction) {
        const fraction = Math.max(cfg.minShockPriceFraction, Math.min(cfg.maxShockPriceFraction,
            cfg.shockPriceFraction * getNewsVolatilityMultiplier() / 4 *
            randomBetween(cfg.shockVariationMin, cfg.shockVariationMax)));
        activeNews.reaction = { anchor: price, size: price * fraction, fraction,
            secondShockDone: false,
            spikeTimes: [currentCandle ? currentCandle.time : time + CANDLE_INTERVAL_MS / 1000],
            recoverySeconds: Math.max(0.25, (TICKS_PER_CANDLE - candleTickCount - 1) * 0.25) };
        // One delayed shock tick; candle creation/closure stays with the tick engine.
        return activeNews.direction * activeNews.reaction.size;
    }

    const reaction = activeNews.reaction;
    if (activeNews.emotionalImpact === 'extreme' && !reaction.secondShockDone && nowSeconds >= reactionTime + cfg.extremeSecondSpikeDelaySeconds) {
        reaction.secondShockDone = true;
        reaction.spikeTimes.push(currentCandle ? currentCandle.time : time + CANDLE_INTERVAL_MS / 1000);
        const secondSize = reaction.anchor * reaction.fraction * cfg.extremeSecondSpikeFraction;
        // Same direction, with half the original impulse's price change.
        reaction.size = Math.abs(price + activeNews.direction * secondSize - reaction.anchor);
        return activeNews.direction * secondSize;
    }

    if (activeNews.emotionalImpact === 'medium') {
        const elapsed = nowSeconds - reactionTime;
        const target = reaction.anchor + activeNews.direction * reaction.size * 0.25;
        if (elapsed <= reaction.recoverySeconds) {
            const ticksLeft = Math.max(1, Math.ceil((reaction.recoverySeconds - elapsed) / 0.25) + 1);
            const noise = ticksLeft <= 1 ? 0 : randomBetween(-1, 1) * reaction.size * 0.045 * Math.sqrt((ticksLeft - 1) / ticksLeft);
            return (target - price) / ticksLeft + noise;
        }
        return (target - price) * 0.12 + randomBetween(-1, 1) * reaction.size * 0.025;
    }

    const {anchor, size} = activeNews.reaction;
    const progress = Math.min(1, (nowSeconds - reactionTime) /
        Math.max(0.25, activeNews.endTime - reactionTime));
    const recoveryEnd = cfg.pullbackDurationFraction;
    const retained = progress < recoveryEnd
        ? 1 - cfg.pullbackFraction * progress / recoveryEnd
        : (1 - cfg.pullbackFraction) +
            (cfg.finalRetentionFraction - (1 - cfg.pullbackFraction)) *
            (progress - recoveryEnd) / (1 - recoveryEnd);
    const target = anchor + activeNews.direction * size * retained;
    const noiseScale = 1 - progress * (1 - cfg.finalNoiseMultiplier);
    const noise = randomBetween(-1, 1) * size * cfg.noiseFraction * noiseScale;
    // Pull toward a changing reference price, not a fixed one-way tick drift.
    return (target - price) * cfg.reversionPerTick + noise;
}


// ============================================================
// Optional API for UI / debugging
// ============================================================

function getActiveNews() {
    return activeNews;
}

window.getActiveNews = getActiveNews;
window.updateNews = updateNews;
window.NEWS_CONFIG = NEWS_CONFIG;



