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
        continuationReversalChance: 0.6, // Independent countertrend detour within eligible follow-through.
        falseBreakoutChance: 0.5, // Eligible breakouts that fail and finish against the breakout.
        sustainedReversalChance: 0.5,
        extremeStrengthChance: 0.9,
        extremeStrengthContinuationChance: 0.9,
        extremeStrengthMultiplier: 1.5,
        anticipationSeconds: 60,
        extremeSecondSpikeDelaySeconds: 4, // Measured from the first spike.
        extremeSecondSpikeFraction: 0.5, // Half the first spike's absolute price change.
        continuationSeconds: 120,
        // Each event can override these weights using its own impactChances.
        impactChances: {medium: 0.00, high: 0.00, extreme: 1.00},
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
        mediumPullbackMin: 0.45,
        mediumPullbackMax: 0.75,
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
let newsAnticipation = null;
let nextHotNewsTime = 0;
let nextFixedNewsTimes = {};
let fixedRotationIndex = 0;
const FIXED_NEWS_WARNING_SECONDS = 60;
let newsHistory = [];

function resetNews(nowSeconds) {
    newsAnticipation = null;
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
    const cfg = NEWS_CONFIG.reaction;
    const strength = Boolean(reaction.strengthMode);
    if (Math.random() >= (strength ? cfg.extremeStrengthContinuationChance : cfg.continuationChance)) return;
    const candles = data.filter(c => reaction.spikeTimes.includes(c.time));
    const reference = ended.direction > 0 ? Math.max(...candles.map(c => c.high)) : Math.min(...candles.map(c => c.low));
    const startPrice = currentTickPrice;
    const margin = Math.max(Math.abs(reference) * 0.025, reaction.size * 0.1) * (strength ? cfg.extremeStrengthMultiplier : 1);
    const breakoutTarget = ended.direction > 0 ? Math.max(reference,startPrice)+margin : Math.max(0.00001,Math.min(reference,startPrice)-margin);
    let target = breakoutTarget;
    // Finish before the active countdown ends, rather than starting at expiration.
    const ticks = Math.floor(Math.min(NEWS_CONFIG.reaction.continuationSeconds, ended.endTime-nowSeconds-0.25)/0.25);
    if (ticks < 1) return;
    // Separate draw from breakout eligibility: half of continuations take a
    // false-start / countertrend detour before returning to the breakout zone.
    const reversal = !strength && Math.random() < cfg.continuationReversalChance;
    const falseBreakout = !strength && ticks >= 24 && Math.random() < cfg.falseBreakoutChance;
    const sustainedReversal = reversal && !falseBreakout && Math.random() < cfg.sustainedReversalChance;
    const oppositeExtreme = ended.direction > 0 ? Math.min(...candles.map(c => c.low)) : Math.max(...candles.map(c => c.high));
    const legs = [];
    if (falseBreakout) {
        const breakoutTicks = Math.max(1, Math.floor(ticks * randomBetween(0.08, 0.72)));
        const failureDepth = Math.max(reaction.size * randomBetween(0.25, 0.55), margin * 2);
        // Cross the actual spike extreme first, then finish inside that extreme
        // and beyond the starting price in the opposite direction.
        target = Math.max(0.00001, ended.direction > 0
            ? Math.min(reference, startPrice) - failureDepth
            : Math.max(reference, startPrice) + failureDepth);
        legs.push({target:breakoutTarget,ticks:breakoutTicks});
        // A failed push can reclaim the extreme again before the final failure.
        // Unequal tick durations never align this sequence to numbered candles.
        const available = ticks - breakoutTicks;
        const weights = [Math.random()+0.3,Math.random()+0.3,Math.random()+0.3];
        const totalWeight = weights.reduce((a,b)=>a+b,0)+1;
        const durations = weights.map(w=>Math.max(1,Math.floor(available*w/totalWeight)));
        const renewedBreak = breakoutTarget + ended.direction * margin * randomBetween(0.2,1.2);
        legs.push({target:reference-ended.direction*margin*randomBetween(0.1,0.7),ticks:durations[0]},
            {target:renewedBreak,ticks:durations[1]},
            {target:target+(renewedBreak-target)*randomBetween(0.2,0.6),ticks:durations[2]},
            {target,ticks:available-durations.reduce((a,b)=>a+b,0)});
    } else if (reversal && ticks >= 12) {
        const firstTicks = Math.max(1, Math.floor(ticks * randomBetween(0.18, 0.30)));
        const reverseTicks = Math.max(1, Math.floor(ticks * randomBetween(0.25, 0.38)));
        const firstTarget = startPrice + (target - startPrice) * randomBetween(0.3, 0.65);
        const reverseSize = Math.max(reaction.size * randomBetween(0.25, 0.55), startPrice * 0.035);
        legs.push({target:firstTarget,ticks:firstTicks},
            {target:Math.max(0.00001, startPrice-ended.direction*reverseSize),ticks:reverseTicks});
        if (sustainedReversal) target = Math.max(0.00001, oppositeExtreme-ended.direction*margin);
        legs.push({target,ticks:ticks-firstTicks-reverseTicks});
    } else legs.push({target,ticks});
    newsContinuation = {direction:ended.direction,reference,target,startPrice,startTime:nowSeconds,
        remainingTicks:ticks,totalTicks:ticks,excursion:0,reversal:reversal && !falseBreakout,
        falseBreakout,sustainedReversal,strength,oppositeExtreme,breakoutTarget,legs,legIndex:0,legRemaining:legs[0].ticks};
}

function anticipationMove(nowSeconds, price) {
    const cfg = NEWS_CONFIG.reaction;
    const due = [...(NEWS_CONFIG.fixed.enabled ? Object.values(nextFixedNewsTimes) : []),
        ...(NEWS_CONFIG.hot.enabled && nextHotNewsTime ? [nextHotNewsTime] : [])]
        .filter(t => t > nowSeconds && t-nowSeconds <= cfg.anticipationSeconds);
    if (activeNews || !due.length) { newsAnticipation=null; return null; }
    const release = Math.min(...due);
    if (!newsAnticipation || newsAnticipation.release !== release) {
        newsAnticipation = {release,anchor:price,direction:Math.random()<0.5 ? 0 : randomSign(),start:nowSeconds};
    }
    const a = newsAnticipation;
    const progress = Math.min(1,(nowSeconds-a.start)/Math.max(0.25,a.release-a.start));
    const target = a.anchor*(1+a.direction*0.12*progress);
    // News-sized two-sided ticks, without either discrete shock impulse.
    const move = (target-price)*0.08 + randomBetween(-1,1)*a.anchor*cfg.shockPriceFraction*cfg.noiseFraction;
    return Math.max(-a.anchor*0.03,Math.min(a.anchor*0.03,move));
}

function continuationGuide(leg, startPrice, tick) {
    if (!leg.path) {
        // Uneven pushes and smaller counter-moves; targets remain event-local.
        const count=Math.max(1,Math.floor(leg.ticks/60));
        const weights=Array.from({length:count},(_,i)=>
            count>=3 && i%3===1 ? -randomBetween(0.4,0.8) : randomBetween(0.75,1.8));
        const sum=weights.reduce((a,b)=>a+b,0);
        let progress=0;
        leg.path=[startPrice,...weights.map(w=>{
            progress+=w/sum;
            return startPrice+(leg.target-startPrice)*progress;
        })];
        leg.path[leg.path.length-1]=leg.target;
    }
    const position=Math.min(leg.path.length-1,tick/leg.ticks*(leg.path.length-1));
    const index=Math.min(leg.path.length-2,Math.floor(position));
    return leg.path[index]+(leg.path[index+1]-leg.path[index])*(position-index);
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
            const leg = follow.legs[follow.legIndex];
            const remaining = follow.legRemaining;
            const elapsed=leg.ticks-remaining;
            const guideBefore=continuationGuide(leg,follow.startPrice,elapsed);
            const guideAfter=continuationGuide(leg,follow.startPrice,elapsed+1);
            // Noisy bridge: alternating excursions, with an exact final breakout.
            const amplitude = Math.max(Math.abs(leg.target - follow.startPrice), follow.startPrice * 0.04);
            const nextExcursion = remaining <= 1 ? 0 : follow.excursion * (remaining - 1) / remaining +
                randomBetween(-1, 1) * amplitude * 0.055 * (follow.strength ? NEWS_CONFIG.reaction.extremeStrengthMultiplier : 1) * Math.sqrt((remaining - 1) / remaining);
            // Correct any manual price offset gradually, never flatten the
            // unequal candle pushes into one constant-speed reversal.
            const move = guideAfter-guideBefore +
                (guideBefore+follow.excursion-price)/remaining + nextExcursion-follow.excursion;
            follow.excursion = nextExcursion;
            follow.remainingTicks--;
            follow.legRemaining--;
            if (!follow.legRemaining && follow.remainingTicks) {
                follow.legIndex++;
                follow.legRemaining = follow.legs[follow.legIndex].ticks;
                follow.startPrice = leg.target;
            }
            if (!follow.remainingTicks) newsContinuation = null;
            return move;
        }
        if (!activeNews) {
            const anticipation = anticipationMove(nowSeconds,price);
            if (anticipation !== null) {
                resetQuietMarket();
                currentPattern=null;
                patternQueue=[];
                patternCooldown=12;
                return anticipation;
            }
            return baseMove * NEWS_CONFIG.volatility.normalMultiplier;
        }
        newsAnticipation = null;
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
            mediumPullbackFraction: activeNews.emotionalImpact === 'medium'
                ? randomBetween(cfg.mediumPullbackMin, cfg.mediumPullbackMax) : null,
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
        reaction.strengthMode = Math.random() < cfg.extremeStrengthChance;
        reaction.strengthAnchor = price + activeNews.direction * secondSize;
        reaction.strengthStart = nowSeconds;
        return activeNews.direction * secondSize;
    }

    if (activeNews.emotionalImpact === 'medium') {
        const elapsed = nowSeconds - reactionTime;
        const target = reaction.anchor + activeNews.direction * reaction.size * (1 - reaction.mediumPullbackFraction);
        if (elapsed <= reaction.recoverySeconds) {
            const ticksLeft = Math.max(1, Math.ceil((reaction.recoverySeconds - elapsed) / 0.25) + 1);
            const noise = ticksLeft <= 1 ? 0 : randomBetween(-1, 1) * reaction.size * 0.045 * Math.sqrt((ticksLeft - 1) / ticksLeft);
            return (target - price) / ticksLeft + noise;
        }
        return (target - price) * 0.12 + randomBetween(-1, 1) * reaction.size * 0.025;
    }

    const {anchor, size} = activeNews.reaction;
    if (reaction.strengthMode) {
        const elapsed = nowSeconds-reaction.strengthStart;
        const target = reaction.strengthAnchor+activeNews.direction*size*0.4*Math.min(1,elapsed/30);
        return (target-price)*0.08 + randomBetween(-1,1)*size*cfg.noiseFraction*cfg.extremeStrengthMultiplier;
    }
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



