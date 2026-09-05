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

        // How often the simulator checks for fixed news.
        // The actual events below use the candle/tick clock.
        events: [
            {
                id: "NFP",
                name: "US Non-Farm Payrolls (NFP)",
                category: "employment",
                intervalSeconds: 60 * 60,
                impact: 4.0,
                durationSeconds: 30,
                surpriseRange: 0.35
            },
            {
                id: "CPI",
                name: "US Consumer Price Index (CPI)",
                category: "inflation",
                intervalSeconds: 60 * 90,
                impact: 3.5,
                durationSeconds: 30,
                surpriseRange: 0.30
            },
            {
                id: "GDP",
                name: "US GDP",
                category: "growth",
                intervalSeconds: 60 * 120,
                impact: 2.5,
                durationSeconds: 25,
                surpriseRange: 0.25
            },
            {
                id: "FOMC",
                name: "FOMC Interest Rate Decision",
                category: "rates",
                intervalSeconds: 60 * 150,
                impact: 5.0,
                durationSeconds: 45,
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
        // Example: every 5–12 minutes.
        minRotationSeconds: 300,
        maxRotationSeconds: 720,

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

        // Maximum additional random shock per 250ms tick.
        maxShockFraction: 0.35,

        // How quickly a news shock fades.
        decay: 0.94
    }
};


// ============================================================
// Runtime news state
// ============================================================

let activeNews = null;
let nextHotNewsTime = 0;
let nextFixedNewsTimes = {};

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

    nextFixedNewsTimes = {};

    NEWS_CONFIG.fixed.events.forEach(event => {
        nextFixedNewsTimes[event.id] =
            nowSeconds + event.intervalSeconds;
    });
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

    const durationSeconds =
        type === "hot"
            ? randomBetween(
                event.minDurationSeconds,
                event.maxDurationSeconds
              )
            : event.durationSeconds;

    activeNews = {
        id: event.id,
        name: event.name,
        category: event.category,
        type,
        impact: event.impact,
        direction,
        startTime: nowSeconds,
        endTime: nowSeconds + durationSeconds,
        durationSeconds,
        shock: 1
    };

    console.log("📰 NEWS:", activeNews.name, activeNews);

    addNewsToHistory(activeNews);
    updateNewsUI();
}

function updateNews(nowSeconds) {

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

                nextFixedNewsTimes[event.id] += event.intervalSeconds;

                break;
            }
        }
    }

    // -----------------------------
    // Hot news
    // -----------------------------
    if (
        NEWS_CONFIG.hot.enabled &&
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

    // -----------------------------
    // News expiration
    // -----------------------------
    if (activeNews && nowSeconds >= activeNews.endTime) {

        console.log("📰 NEWS ENDED:", activeNews.name);

        activeNews = null;
    }

    // -----------------------------
    // Shock decay
    // -----------------------------
    if (activeNews) {
        activeNews.shock *= NEWS_CONFIG.volatility.decay;
    }
}

function applyNewsToPriceMove(baseMove, nowSeconds) {

    updateNews(nowSeconds);

    if (!activeNews) {
        return baseMove;
    }

    const multiplier = getNewsVolatilityMultiplier();

    // Directional component.
    const directionalMove =
        baseMove * activeNews.direction * multiplier;

    // Additional uncertainty/noise.
    const shock =
        Math.random() *
        Math.abs(baseMove) *
        multiplier *
        NEWS_CONFIG.volatility.maxShockFraction *
        activeNews.shock;

    const uncertainty =
        randomSign() * shock;

    return directionalMove + uncertainty;
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

// ============================================================
// NEWS UI
// ============================================================

const newsHistory = [];

function updateNewsUI() {

    const typeElement = document.getElementById("newsType");
    const titleElement = document.getElementById("newsTitle");
    const impactElement = document.getElementById("newsImpact");
    const directionElement = document.getElementById("newsDirection");
    const timeElement = document.getElementById("newsTime");
    const remainingElement = document.getElementById("newsRemaining");
    const statusElement = document.getElementById("newsStatus");
    const panelElement = document.getElementById("newsPanel");

    if (!typeElement) return;

    // No active news
    if (!activeNews) {

        typeElement.textContent = "NO ACTIVE NEWS";
        titleElement.textContent = "Market is trading normally.";

        impactElement.textContent = "—";
        directionElement.textContent = "—";
        timeElement.textContent = "—";
        remainingElement.textContent = "—";

        statusElement.textContent = "● MARKET CALM";

        panelElement.classList.remove("news-active");

        return;
    }

    // Active news
    typeElement.textContent =
        activeNews.type === "hot"
            ? "🔥 HOT NEWS"
            : "📰 FIXED NEWS";

    titleElement.textContent = activeNews.name;

    impactElement.textContent =
        getImpactLabel(activeNews.impact);

    directionElement.textContent =
        getDirectionLabel(activeNews.direction);

    const startDate =
        new Date().toLocaleTimeString();

    timeElement.textContent = startDate;

    const remaining =
        Math.max(
            0,
            activeNews.endTime - marketSeconds
        );

    remainingElement.textContent =
        remaining.toFixed(1) + "s";

    statusElement.textContent =
        "● NEWS ACTIVE";

    panelElement.classList.add("news-active");
}


function getImpactLabel(impact) {

    if (impact >= 7) return "EXTREME";
    if (impact >= 5) return "HIGH";
    if (impact >= 3) return "MEDIUM";
    return "LOW";
}


function getDirectionLabel(direction) {

    if (direction === 1) return "BULLISH";
    if (direction === -1) return "BEARISH";

    return "UNCERTAIN";
}


// ============================================================
// NEWS HISTORY
// ============================================================

function addNewsToHistory(news) {

    if (!news) return;

    newsHistory.unshift({
        name: news.name,
        type: news.type,
        time: new Date().toLocaleTimeString()
    });

    // Keep last 5 events
    if (newsHistory.length > 5) {
        newsHistory.pop();
    }

    renderNewsHistory();
}


function renderNewsHistory() {

    const container =
        document.getElementById("newsHistory");

    if (!container) return;

    container.innerHTML = "";

    newsHistory.forEach(item => {

        const row =
            document.createElement("div");

        row.className =
            "newsHistoryItem " +
            (item.type === "hot"
                ? "hot-news"
                : "fixed-news");

        row.innerHTML = `
            <div class="newsHistoryName">
                ${item.name}
            </div>

            <div class="newsHistoryType">
                ${item.type === "hot"
                    ? "HOT"
                    : "FIXED"}
            </div>

            <div class="newsHistoryTime">
                ${item.time}
            </div>
        `;

        container.appendChild(row);
    });
}


// ============================================================
// UPDATE UI EVERY 250ms
// ============================================================

setInterval(() => {

    if (typeof updateNewsUI === "function") {
        updateNewsUI();
    }

}, 250);
