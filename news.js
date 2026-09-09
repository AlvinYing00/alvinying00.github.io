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
// Price impact is applied by script.js on each simulated price tick.
// ============================================================

const NEWS_CONFIG = {

    // -----------------------------
    // Fixed news
    // -----------------------------
    fixed: {
        enabled: true,
        firstDelaySeconds: 60,
        gapAfterEndSeconds: 15 * 60,
        durationSeconds: 5 * 60, // All fixed-news reaction types.

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
        // Once every 25–85 minutes of running market time.
        minRotationSeconds: 25 * 60,
        maxRotationSeconds: 85 * 60,

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
        continuationChance: 0.65, // High/Extreme follow-through probability.
        continuationReversalChance: 0.5, // Mutually exclusive choice before a confirmed breakout.
        falseBreakoutChance: 0.5, // Rolled once, only after a completed later candle breaks the first spike extreme.
        sustainedReversalChance: 0.5,
        extremeStrengthChance: 0.9,
        extremeStrengthContinuationChance: 0.9,
        extremeStrengthMultiplier: 1.5,
        anticipationSeconds: 60,
        extremeSecondSpikeDelaySeconds: 4, // Measured from the first spike.
        extremeSecondSpikeFraction: 0.5, // Half the first spike's absolute price change.
        // Each event can override these weights using its own impactChances.
        impactChances: {medium: 0.30, high: 0.35, extreme: 0.35},
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
        noiseFraction: 0.09 // Constant two-sided tick volatility throughout active news.
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
    if (!ended || !ended.reaction) return;
    const reaction = ended.reaction;
    if (candle.time === reaction.spikeTimes[0]) {
        reaction.firstCandle = {time:candle.time, high:candle.high, low:candle.low};
    }
    if (reaction.continuationDecided) {
        selectNewsOutcome(candle, nowSeconds);
        return;
    }
    if (!reaction.spikeTimes.includes(candle.time)) return;
    if (ended.emotionalImpact === 'extreme' && !reaction.secondShockDone) return;
    reaction.continuationDecided = true;
    const cfg = NEWS_CONFIG.reaction;
    const strength = Boolean(reaction.strengthMode);
    if (Math.random() >= (strength ? cfg.extremeStrengthContinuationChance : cfg.continuationChance)) {
        // Missing the breakout roll means a developing recovery, not a fixed
        // price to orbit for the rest of the event. Strength mode keeps its bias.
        const ticks=Math.floor((ended.endTime-nowSeconds-TICK_SECONDS)/TICK_SECONDS + 1e-8);
        if(ticks>0) {
            const direction=strength ? ended.direction : -ended.direction;
            const distance=reaction.size*randomBetween(.55,.95);
            reaction.discovery={startPrice:currentTickPrice,startTime:nowSeconds,
                target:Math.max(reaction.anchor*.1,currentTickPrice+direction*distance),
                ticks,remaining:ticks,excursion:0,direction};
        }
        return;
    }
    const candles = [reaction.firstCandle || candle];
    const reference = ended.direction > 0 ? Math.max(...candles.map(c => c.high)) : Math.min(...candles.map(c => c.low));
    const startPrice = currentTickPrice;
    const margin = Math.max(Math.abs(reference) * 0.025, reaction.size * 0.1) * (strength ? cfg.extremeStrengthMultiplier : 1);
    const breakoutTarget = ended.direction > 0 ? Math.max(reference,startPrice)+margin : Math.max(0.00001,Math.min(reference,startPrice)-margin);
    let target = breakoutTarget;
    // Finish before the active countdown ends, rather than starting at expiration.
    const ticks = Math.floor((ended.endTime-nowSeconds-TICK_SECONDS)/TICK_SECONDS + 1e-8);
    if (ticks < 1) return;
    // Begin a developing path; special outcomes require a later closed candle.
    const oppositeExtreme = ended.direction > 0 ? candles[0].low : candles[0].high;
    const legs = [{target,ticks}];
    newsContinuation = {direction:ended.direction,reference,target,startPrice,startTime:nowSeconds,
        remainingTicks:ticks,totalTicks:ticks,excursion:0,reversal:false,
        falseBreakout:false,sustainedReversal:false,strength,oppositeExtreme,breakoutTarget,
        noiseAmplitude:newsNoiseAmplitude(reaction),legs,legIndex:0,legRemaining:ticks};
}

// Decide once using actual completed follow-up OHLC, never a planned target.
function selectNewsOutcome(candle, nowSeconds) {
    const event = activeNews, r = event?.reaction, cfg = NEWS_CONFIG.reaction;
    if (!r?.firstCandle || r.outcomeDecided || r.strengthMode ||
        candle.time <= r.firstCandle.time || r.spikeTimes.includes(candle.time)) return;
    const ticks = Math.floor((event.endTime-nowSeconds-TICK_SECONDS)/TICK_SECONDS + 1e-8);
    if (ticks < 3) return;
    const d = event.direction;
    const reference = d > 0 ? r.firstCandle.high : r.firstCandle.low;
    const oppositeExtreme = d > 0 ? r.firstCandle.low : r.firstCandle.high;
    const broke = d > 0 ? candle.high > reference : candle.low < reference;
    r.followingBroke = Boolean(r.followingBroke || broke);
    let outcome = 'none';
    if (r.followingBroke) {
        if (Math.random() < cfg.falseBreakoutChance) outcome = 'falseBreakout';
    } else {
        const total = cfg.continuationReversalChance + cfg.sustainedReversalChance;
        if (total > 0) outcome = Math.random() * total < cfg.continuationReversalChance
            ? 'continuationReversal' : 'sustainedReversal';
    }
    r.outcomeDecided = true;
    r.outcome = outcome;
    r.outcomeTime = nowSeconds;
    r.outcomeTriggerCount = outcome === 'none' ? 0 : 1;
    if (outcome === 'none') return;
    const startPrice = currentTickPrice;
    const margin = Math.max(Math.abs(reference)*.025,r.size*.1);
    const breakoutTarget = Math.max(.00001,reference+d*margin);
    const reverseSize = Math.max(r.size*randomBetween(.25,.55),startPrice*.035);
    let target;
    const legs=[];
    if (outcome === 'continuationReversal') {
        const pullbackTicks = Math.max(1,Math.floor(ticks*randomBetween(.25,.55)));
        target = breakoutTarget;
        legs.push({target:Math.max(.00001,startPrice-d*reverseSize),ticks:pullbackTicks},
            {target,ticks:ticks-pullbackTicks});
    } else {
        target = Math.max(.00001,outcome === 'sustainedReversal'
            ? oppositeExtreme-d*margin
            : (d>0?Math.min(reference,startPrice):Math.max(reference,startPrice))-d*reverseSize);
        // An irregular multi-wave path can retest the broken level before failing.
        legs.push({target,ticks});
    }
    r.discovery = null;
    newsContinuation = {direction:d,reference,oppositeExtreme,breakoutTarget,target,startPrice,startTime:nowSeconds,
        remainingTicks:ticks,totalTicks:ticks,excursion:0,
        reversal:outcome==='continuationReversal',falseBreakout:outcome==='falseBreakout',
        sustainedReversal:outcome==='sustainedReversal',strength:false,
        noiseAmplitude:newsNoiseAmplitude(r),legs,legIndex:0,legRemaining:legs[0].ticks};
}

function newsNoiseAmplitude(reaction) {
    return reaction.size * NEWS_CONFIG.reaction.noiseFraction *
        (reaction.strengthMode ? NEWS_CONFIG.reaction.extremeStrengthMultiplier : 1);
}

function rescaleNewsTicks(ratio) {
    const scalePath = path => {
        path.ticks *= ratio;
        if (path.turns) path.turns = path.turns.map(t => t * ratio);
    };
    if (newsContinuation) {
        newsContinuation.legs.forEach(scalePath);
        for (const key of ['remainingTicks','totalTicks','legRemaining']) newsContinuation[key] *= ratio;
    }
    const discovery = activeNews?.reaction?.discovery;
    if (discovery) {
        scalePath(discovery);
        discovery.remaining *= ratio;
    }
}

// Occasional transient level probes, independent of trade entries and outcome rolls.
function newsSweepOffset(state, remaining, price, previous, guideMove) {
    const r=activeNews?.reaction;
    if (!state || !r?.firstCandle || !r.continuationDecided) return 0;
    const now=marketSeconds;
    if (r.nextSweepTime === undefined) r.nextSweepTime=now+randomBetween(12,35);
    if (!state.sweep && now>=r.nextSweepTime && (r.sweepCount||0)<3) {
        r.nextSweepTime=now+randomBetween(40,75);
        if (Math.random()<.60 && remaining*TICK_SECONDS>35) {
            const side=Math.random()<.5?-1:1;
            const recent=data.filter(c=>c.time>r.firstCandle.time).slice(-4);
            const levels=recent.map(c=>side>0?c.high:c.low)
                .filter(level=>(level-price)*side>=0 && Math.abs(level-price)<price*.035);
            if (levels.length) {
                const level=side>0?Math.min(...levels):Math.max(...levels);
                const base=price-previous;
                // Only some proposed sweeps use the rapid rejection profile.
                const fastRejection=Math.random()<.40;
                const overshoot=fastRejection?randomBetween(.010,.020):randomBetween(.003,.009);
                const peak=level+side*price*overshoot-base;
                if (peak*side>0 && Math.abs(peak)<price*.045) {
                    const reject=fastRejection || Math.random()<.65;
                    // Total excursion time, not candle duration: candles remain 15s.
                    const total=randomBetween(1,2);
                    const push=fastRejection?total*.30:randomBetween(2,3);
                    const hold=fastRejection?total*.10:reject?randomBetween(.2,1):randomBetween(3,7);
                    const recover=fastRejection?total-push-hold:reject?randomBetween(4,9):randomBetween(9,16);
                    state.sweep={start:now,peak,level,side,reject,fastRejection,push,hold,recover};
                    r.sweepCount=(r.sweepCount||0)+1;
                }
            }
        }
    }
    const sweep=state.sweep;
    if (!sweep) return 0;
    const age=now-sweep.start;
    const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
    let weight;
    if(age<sweep.push)weight=smooth(age/sweep.push);
    else if(age<sweep.push+sweep.hold)weight=1;
    else weight=1-smooth((age-sweep.push-sweep.hold)/sweep.recover);
    if(age>=sweep.push+sweep.hold+sweep.recover) {
        state.sweep=null;
        r.nextSweepTime=Math.max(r.nextSweepTime,now+randomBetween(35,65));
        return 0;
    }
    // Let the selected outcome finish on time even if this path is replaced.
    return sweep.peak*weight*Math.min(1,Math.max(0,remaining-1)*TICK_SECONDS/2);
}

// Strong directional legs need meaningful counter-moves, even when ordinary
// tick noise hits its price cap. These temporary offsets are visited by live ticks.
function newsCandlePullback(state, remaining, price) {
    if (!state) return 0;
    const barTime=currentCandle?currentCandle.time:time+CANDLE_INTERVAL_MS/1000;
    const elapsedMs=Math.round(marketSeconds*1000)%CANDLE_INTERVAL_MS;
    const progress=elapsedMs===0?1:elapsedMs/CANDLE_INTERVAL_MS;
    if (state.pullbackProfile?.time!==barTime) {
        const leg=state.legs?state.legs[state.legIndex]:state;
        const elapsed=leg.ticks-(state.legRemaining??state.remaining);
        const barTicks=(1-progress)*CANDLE_INTERVAL_MS/TICK_INTERVAL_MS;
        const before=continuationGuide(leg,state.startPrice,Math.max(0,elapsed));
        const end=continuationGuide(leg,state.startPrice,Math.min(leg.ticks,elapsed+barTicks));
        const move=end-before;
        state.pullbackProfile={time:barTime,start:progress,move,
            early:randomBetween(.12,.24),late:randomBetween(.72,.87),
            tail:randomBetween(.10,.24),wick:randomBetween(.10,.24),
            enabled:Math.abs(move)>price*.006 && progress<.35};
    }
    const p=state.pullbackProfile;
    if (!p.enabled || progress>=1) return 0;
    const t=Math.max(0,Math.min(1,(progress-p.start)/(1-p.start)));
    const smooth=x=>x*x*(3-2*x);
    // Different peak times and depths prevent a repeated candle template.
    const knots=[0,p.early,.48,p.late,1];
    const offsets=[0,-p.move*(p.early+p.tail),0,p.move*(1-p.late+p.wick),0];
    let i=0;while(i<3&&t>knots[i+1])i++;
    const u=smooth(Math.max(0,Math.min(1,(t-knots[i])/(knots[i+1]-knots[i]))));
    return (offsets[i]+(offsets[i+1]-offsets[i])*u)*Math.min(1,Math.max(0,remaining-1)*TICK_SECONDS/2);
}

function momentumExcursion(previous, remaining, amplitude, guideMove, price, state) {
    if (remaining<=1) { if(state){state.sweepOffset=0;state.pullbackOffset=0;} return 0; }
    // Persistent intrabar noise crosses candle boundaries. Only the event leg's
    // final few ticks settle toward its outcome; a candle close never resets it.
    const settling=Math.min(1,(remaining-1)/legacyTicks(16));
    // Size intratick fluctuations against the local move, not the release shock.
    // Keep opposing ticks, but prevent spike-sized noise from drowning the trend.
    const localCandleMove = Math.abs(guideMove) * CANDLE_INTERVAL_MS / TICK_INTERVAL_MS;
    // Each candle gets its own fluctuation scale and burst duration. The price
    // excursion carries across the boundary; neither OHLC nor the close is forced.
    const candleTime = currentCandle ? currentCandle.time : time + CANDLE_INTERVAL_MS / 1000;
    const reaction = activeNews?.reaction;
    if (reaction && reaction.wickProfile?.time !== candleTime) {
        reaction.wickProfile = {time:candleTime,
            fraction:randomBetween(.30,.60) * (Math.random()<.15 ? 1.35 : 1),
            persistence:randomBetween(.88,.95)};
    }
    const profile = reaction?.wickProfile || {fraction:.45,persistence:.91};
    const localAmplitude = Math.min(amplitude, Math.max(price * 0.0008,
        Math.min(price * 0.005, localCandleMove * profile.fraction)));
    const persistence = profile.persistence;
    const noiseScale = Math.sqrt((1-Math.pow(persistence*persistence,TICK_TIME_SCALE))/(1-persistence*persistence));
    const oldSweep=state?.sweepOffset||0;
    const offset=newsSweepOffset(state,remaining,price,previous,guideMove);
    const oldPullback=state?.pullbackOffset||0;
    const pullback=newsCandlePullback(state,remaining,price);
    if(state){state.sweepOffset=offset;state.pullbackOffset=pullback;}
    return ((previous-oldSweep-oldPullback)*Math.pow(persistence,TICK_TIME_SCALE)+randomBetween(-1,1)*localAmplitude*0.65*noiseScale)*settling+offset+pullback;
}

function anticipationMove(nowSeconds, price) {
    const cfg = NEWS_CONFIG.reaction;
    // Unexpected hot news must never signal its arrival through anticipation.
    const due = (NEWS_CONFIG.fixed.enabled ? Object.values(nextFixedNewsTimes) : [])
        .filter(t => t > nowSeconds && t-nowSeconds <= cfg.anticipationSeconds);
    if (activeNews || !due.length) { newsAnticipation=null; return null; }
    const release = Math.min(...due);
    if (!newsAnticipation || newsAnticipation.release !== release) {
        newsAnticipation = {release,anchor:price,direction:Math.random()<0.5 ? 0 : randomSign(),start:nowSeconds};
    }
    const a = newsAnticipation;
    const progress = Math.min(1,(nowSeconds-a.start)/Math.max(TICK_SECONDS,a.release-a.start));
    const target = a.anchor*(1+a.direction*0.12*progress);
    // News-sized two-sided ticks, without either discrete shock impulse.
    const move = (target-price)*(1-Math.pow(0.92,TICK_TIME_SCALE)) + randomBetween(-1,1)*a.anchor*cfg.shockPriceFraction*cfg.noiseFraction*TICK_NOISE_SCALE;
    return Math.max(-a.anchor*0.03*TICK_NOISE_SCALE,Math.min(a.anchor*0.03*TICK_NOISE_SCALE,move));
}

function continuationGuide(leg, startPrice, tick) {
    if (!leg.path) {
        // Irregular 15–45 second pushes/pullbacks can span candle boundaries.
        leg.turns=[0];
        while(leg.ticks-leg.turns.at(-1)>legacyTicks(240)) {
            leg.turns.push(leg.turns.at(-1)+legacyTicks(Math.floor(randomBetween(60,180))));
        }
        leg.turns.push(leg.ticks);
        const count=leg.turns.length-1;
        const weights=Array.from({length:count},()=>
            randomBetween(0.25,1.8)*(Math.random()<0.3?-1:1));
        // Bound normalization so random opposing waves cannot amplify a small
        // net sum into an oversized move. There is no repeating candle pattern.
        const minimum=count*0.3;
        if(!weights.some(w=>w>0))weights[Math.floor(Math.random()*count)]=randomBetween(.75,1.8);
        const positive=weights.filter(w=>w>0).reduce((a,b)=>a+b,0);
        const negative=-weights.filter(w=>w<0).reduce((a,b)=>a+b,0);
        const positiveScale=Math.max(1,(negative+minimum)/positive);
        // Scale forward waves only; adding a constant to every weight could
        // turn all the intended counter-moves into forward staircase steps.
        for(let i=0;i<count;i++)if(weights[i]>0)weights[i]*=positiveScale;
        const sum=weights.reduce((a,b)=>a+b,0);
        let progress=0;
        leg.path=[startPrice,...weights.map(w=>{
            progress+=w/sum;
            return startPrice+(leg.target-startPrice)*progress;
        })];
        leg.path[leg.path.length-1]=leg.target;
    }
    const index=Math.max(0,Math.min(leg.path.length-2,leg.turns.findIndex(t=>t>=tick)-1));
    const progress=Math.max(0,Math.min(1,(tick-leg.turns[index])/(leg.turns[index+1]-leg.turns[index])));
    // Retain speed through wave transitions instead of pausing at every turn.
    const eased=0.65*progress+0.35*progress*progress*(3-2*progress);
    return leg.path[index]+(leg.path[index+1]-leg.path[index])*eased;
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
        updateLiveText(element, text);
    };
    const upcoming = NEWS_CONFIG.fixed.enabled
        ? NEWS_CONFIG.fixed.events.map(event => ({event, time: nextFixedNewsTimes[event.id]}))
            .filter(item => Number.isFinite(item.time)).sort((a,b) => a.time - b.time)
        : [];
    const warnings = upcoming.filter(item => item.time - nowSeconds <= FIXED_NEWS_WARNING_SECONDS);
    const next = upcoming[0];
    const chartNews=document.getElementById('chartNews');
    if(chartNews) {
        chartNews.className='chartNews'+(activeNews ? ` active ${activeNews.type}` : warnings.length ? ' incoming' : '');
        setText('chartNewsLabel',activeNews ? `ACTIVE ${activeNews.type.toUpperCase()} NEWS` : next ? 'INCOMING NEWS' : 'MARKET NEWS');
        setText('chartNewsName',activeNews ? activeNews.name : next ? next.event.name : 'No scheduled release');
        setText('chartNewsClock',activeNews ? `${formatNewsClock(activeNews.endTime-nowSeconds)} remaining` :
            next ? `Starts in ${formatNewsClock(next.time-nowSeconds)}` : 'Market calm');
    }
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
        const noticeText = warnings.length
            ? warnings.map(({event,time}) => `${event.name} — ${time <= nowSeconds ? 'Awaiting current news to finish' : `Starts in ${formatNewsClock(time - nowSeconds)}`}`).join(' • ')
            : next ? `${next.event.name} — Starts in ${formatNewsClock(next.time - nowSeconds)}`
            : activeNews?.type === 'fixed' ? 'The next fixed-news countdown starts when this release ends.'
            : 'Fixed news is disabled or no events are scheduled.';
        updateLiveText(notice, noticeText);
    }
    const history = document.getElementById('newsHistory');
    if (history && history.newsSignature !== JSON.stringify(newsHistory)) {
        history.newsSignature = JSON.stringify(newsHistory);
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
            const step = Math.min(1, remaining);
            const guideAfter=continuationGuide(leg,follow.startPrice,elapsed+step);
            // Noisy bridge: alternating excursions, with an exact final breakout.
            const nextExcursion = momentumExcursion(follow.excursion,remaining,
                follow.noiseAmplitude,guideAfter-guideBefore,price,follow);
            // Correct any manual price offset gradually, never flatten the
            // unequal candle pushes into one constant-speed reversal.
            const move = guideAfter-guideBefore +
                (guideBefore+follow.excursion-price)/Math.max(1,remaining) + nextExcursion-follow.excursion;
            follow.excursion = nextExcursion;
            follow.remainingTicks -= step;
            follow.legRemaining -= step;
            if (follow.legRemaining < 1e-7 && follow.legIndex < follow.legs.length - 1) {
                follow.legIndex++;
                follow.legRemaining = follow.legs[follow.legIndex].ticks;
                follow.startPrice = leg.target;
            }
            if (follow.remainingTicks < 1e-7) newsContinuation = null;
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
        const magnitude = panic.anchor * randomBetween(cfg.panicMinTickFraction, cfg.panicMaxTickFraction) * TICK_NOISE_SCALE;
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
            recoverySeconds: Math.max(TICK_SECONDS, (TICKS_PER_CANDLE - candleTickCount - 1) * TICK_SECONDS) };
        // One delayed shock tick; candle creation/closure stays with the tick engine.
        return activeNews.direction * activeNews.reaction.size;
    }

    const reaction = activeNews.reaction;
    if(reaction.discovery && nowSeconds>reaction.discovery.startTime) {
        const flow=reaction.discovery, remaining=flow.remaining;
        if(remaining>0) {
            const elapsed=flow.ticks-remaining;
            const before=continuationGuide(flow,flow.startPrice,elapsed);
            const step = Math.min(1,remaining);
            const after=continuationGuide(flow,flow.startPrice,elapsed+step);
            const excursion=momentumExcursion(flow.excursion,remaining,newsNoiseAmplitude(reaction),after-before,price,flow);
            const move=after-before+(before+flow.excursion-price)/Math.max(1,remaining)+excursion-flow.excursion;
            flow.excursion=excursion;flow.remaining=Math.max(0,remaining-step);
            return move;
        }
    }
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
            const ticksLeft = Math.max(1, Math.ceil((reaction.recoverySeconds - elapsed) / TICK_SECONDS - 1e-8) + 1);
            const noise = ticksLeft <= 1 ? 0 : randomBetween(-1, 1) * newsNoiseAmplitude(reaction) * TICK_NOISE_SCALE * Math.sqrt((ticksLeft - 1) / ticksLeft);
            return (target - price) / ticksLeft + noise;
        }
        // The completed spike candle selects the shared continuation/discovery
        // path above. No separate always-same-direction Medium trend remains.
        return baseMove;
    }

    const {anchor, size} = activeNews.reaction;
    if (reaction.strengthMode) {
        const elapsed = nowSeconds-reaction.strengthStart;
        const target = reaction.strengthAnchor+activeNews.direction*size*0.4*Math.min(1,elapsed/30);
        return (target-price)*(1-Math.pow(0.92,TICK_TIME_SCALE)) + randomBetween(-1,1)*newsNoiseAmplitude(reaction)*TICK_NOISE_SCALE;
    }
    const progress = Math.min(1, (nowSeconds - reactionTime) /
        Math.max(TICK_SECONDS, activeNews.endTime - reactionTime));
    const recoveryEnd = cfg.pullbackDurationFraction;
    const retained = progress < recoveryEnd
        ? 1 - cfg.pullbackFraction * progress / recoveryEnd
        : (1 - cfg.pullbackFraction) +
            (cfg.finalRetentionFraction - (1 - cfg.pullbackFraction)) *
            (progress - recoveryEnd) / (1 - recoveryEnd);
    const target = anchor + activeNews.direction * size * retained;
    const noise = randomBetween(-1, 1) * newsNoiseAmplitude(reaction) * TICK_NOISE_SCALE;
    // Pull toward a changing reference price, not a fixed one-way tick drift.
    return (target - price) * (1-Math.pow(1-cfg.reversionPerTick,TICK_TIME_SCALE)) + noise;
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


