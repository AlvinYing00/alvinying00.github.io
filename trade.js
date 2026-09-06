// trade.js

let positions = []; // Active and closed trades
let orderId = 1;
let balance = 100.00;

// Elements
const balanceDisplay = document.getElementById("balance");
const openTable = document.getElementById("openPositions");
const historyTable = document.getElementById("tradeHistory");

// Spread helper (dynamic)
function getSpread(price) {
    return Math.max(0.01, price * 0.002); // 0.2% of price, min 0.01
}

// Market state
let marketOpen = false;

function notifyTrading(message) {
    const notification = document.getElementById('tradingNotice');
    if (!notification) return;
    document.getElementById('tradingNoticeText').textContent = message;
    notification.hidden = false;
}

// Public setter
function setMarketOpen(state) {
    marketOpen = !!state;
    console.log("Trade module: marketOpen =", marketOpen);
    if (typeof renderTables === "function") renderTables();
}

function isMarketOpen() {
    return marketOpen;
}

function createEntryLine(trade) {
    trade.entryLine = candleSeries.createPriceLine({
        price: trade.entry,
        color: trade.type === 'BUY' ? '#2196f3' : '#ef4444',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: false,
        title: ''
    });
}

function formatEntryLabel(trade) {
    const rounded = Number(trade.profit.toFixed(2));
    const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
    return `${trade.type.toLowerCase()} ${sign}$${Math.abs(rounded).toFixed(2)}`;
}

function removeEntryLine(trade) {
    if (!trade.entryLine) return;
    candleSeries.removePriceLine(trade.entryLine);
    trade.entryLine = null;
}

// ---- Place Orders ----
function placeBuy() {
    if (!isMarketOpen()) return notifyTrading("Market is closed! Cannot place BUY order.");
    if (balance <= 0) return notifyTrading("Insufficient funds! Balance is 0.");
    if (!data || data.length < 1) return notifyTrading("No market data available.");

    const lastPrice =
        typeof currentTickPrice === "number"
            ? currentTickPrice
            : data[data.length - 1].close;
    const spread = getSpread(lastPrice);
    const entry = lastPrice + spread;

    const trade = {
        id: orderId++,
        type: "BUY",
        entry,
        spread,
        size: 1,
        open: true,
        exit: null,
        profit: 0,
        tp: null,
        sl: null,
        tpLine: null,
        slLine: null,
        timestamp: new Date().toLocaleTimeString()
    };

    positions.push(trade);
    createEntryLine(trade);

    // 🔑 calculate floating P/L immediately
    updateFloatingPL(false);
    renderTables();
}

function placeSell() {
    if (!isMarketOpen()) return notifyTrading("Market is closed! Cannot place SELL order.");
    if (balance <= 0) return notifyTrading("Insufficient funds! Balance is 0.");
    if (!data || data.length < 1) return notifyTrading("No market data available.");

    const lastPrice =
        typeof currentTickPrice === "number"
            ? currentTickPrice
            : data[data.length - 1].close;
    const spread = getSpread(lastPrice);
    const entry = Math.max(0.01, lastPrice - spread);

    const trade = {
        id: orderId++,
        type: "SELL",
        entry,
        spread,
        size: 1,
        open: true,
        exit: null,
        profit: 0,
        tp: null,
        sl: null,
        tpLine: null,
        slLine: null,
        timestamp: new Date().toLocaleTimeString()
    };

    positions.push(trade);
    createEntryLine(trade);

    // 🔑 calculate floating P/L immediately
    updateFloatingPL(false);
    renderTables();
}

function setTP(id) {
    if (!isMarketOpen()) return notifyTrading('Market is paused. Start the market to manage trades.');
    const trade = positions.find(t => t.id === id && t.open);
    if (!trade) return;

    const value = parseFloat(prompt("Enter TP price:"));
    if (isNaN(value)) return;

    trade.tp = value;
    createOrUpdateTPLine(trade);
}

function setSL(id) {
    if (!isMarketOpen()) return notifyTrading('Market is paused. Start the market to manage trades.');
    const trade = positions.find(t => t.id === id && t.open);
    if (!trade) return;

    const value = parseFloat(prompt("Enter SL price:"));
    if (isNaN(value)) return;

    trade.sl = value;
    createOrUpdateSLLine(trade);
}

// ---- Close Trade ----
function closeTrade(id, automatic = false) {
    if (!automatic && !isMarketOpen()) return notifyTrading('Market is paused. Start the market to close trades.');
    const trade = positions.find(t => t.id === id && t.open);
    if (!trade) return;

    const lastPrice =
        typeof currentTickPrice === "number"
            ? currentTickPrice
            : data[data.length - 1].close;
    const spread = getSpread(lastPrice);

    let exit;
    if (trade.type === "BUY") {
        exit = lastPrice - spread;
        trade.profit = (exit - trade.entry) * trade.size;
    } else {
        exit = lastPrice + spread;
        trade.profit = (trade.entry - exit) * trade.size;
    }

    trade.exit = exit;
    trade.open = false;
    removeEntryLine(trade);
    if (trade.tpLine) {
        candleSeries.removePriceLine(trade.tpLine);
        trade.tpLine = null;
    }

    if (trade.slLine) {
        candleSeries.removePriceLine(trade.slLine);
        trade.slLine = null;
    }
    trade.closedAt = new Date().toLocaleTimeString();

    balance += trade.profit;
    renderTables();
}

// ---- Force Close All (margin call) ----
function forceCloseAll() {
    positions.forEach(trade => {
        if (!trade.open) return;

        const lastPrice =
        typeof currentTickPrice === "number"
            ? currentTickPrice
            : data[data.length - 1].close;
        const spread = getSpread(lastPrice);

        if (trade.type === "BUY") {
            trade.exit = lastPrice - spread;
            trade.profit = (trade.exit - trade.entry) * trade.size;
        } else {
            trade.exit = lastPrice + spread;
            trade.profit = (trade.entry - trade.exit) * trade.size;
        }

        trade.open = false;
        removeEntryLine(trade);
         if (trade.tpLine) {
            candleSeries.removePriceLine(trade.tpLine);
            trade.tpLine = null;
        }
        if (trade.slLine) {
            candleSeries.removePriceLine(trade.slLine);
            trade.slLine = null;
        }
        trade.closedAt = new Date().toLocaleTimeString();
    });

    notifyTrading('Insufficient funds. All positions were closed by the margin check.');
    balance = 0.00;
    renderTables();
}

// ---- Manual Close All ----
function closeAllTrades() {
    if (!isMarketOpen()) return notifyTrading('Market is paused. Start the market to close trades.');
    if (!data || data.length === 0) return;

    const lastPrice =
        typeof currentTickPrice === "number"
            ? currentTickPrice
            : data[data.length - 1].close;
    const spread = getSpread(lastPrice);

    positions.forEach(trade => {
        if (!trade.open) return;

        let exit;

        if (trade.type === "BUY") {
            exit = lastPrice - spread;
            trade.profit = (exit - trade.entry) * trade.size;
        } else {
            exit = lastPrice + spread;
            trade.profit = (trade.entry - exit) * trade.size;
        }

        trade.exit = exit;
        trade.open = false;
        removeEntryLine(trade);
        trade.closedAt = new Date().toLocaleTimeString();

        // Remove TP line
        if (trade.tpLine) {
            candleSeries.removePriceLine(trade.tpLine);
            trade.tpLine = null;
        }

        // Remove SL line
        if (trade.slLine) {
            candleSeries.removePriceLine(trade.slLine);
            trade.slLine = null;
        }

        balance += trade.profit;
    });

    renderTables();
}

// ---- Update floating P/L ----
function updateFloatingPL(enforceMargin = true) {
    if (!data || data.length === 0) return;

    const lastCandle = data[data.length - 1];
    // Use live 250ms tick price when available.
    const closePrice =
        typeof currentTickPrice === "number"
            ? currentTickPrice
            : lastCandle.close;
    const spread = getSpread(closePrice);

    // ---- 1️⃣ TP / SL Execution (intrabar realistic) ----
    const tradesToClose = [];

    positions.forEach(trade => {
        if (!trade.open) return;

        let hit = false;
        if (!marketOpen) return;

        if (trade.type === "BUY") {
            if (trade.tp !== null && lastCandle.high >= trade.tp) {
                hit = true;
            } else if (trade.sl !== null && lastCandle.low <= trade.sl) {
                hit = true;
            }
        } else { // SELL
            if (trade.tp !== null && lastCandle.low <= trade.tp) {
                hit = true;
            } else if (trade.sl !== null && lastCandle.high >= trade.sl) {
                hit = true;
            }
        }

        if (hit) {
            tradesToClose.push(trade.id);
        }
    });

    // Close outside iteration (safe)
    tradesToClose.forEach(id => closeTrade(id, true));

    // ---- 2️⃣ Recalculate floating P/L ----
    positions.forEach(trade => {
        if (!trade.open) return;

        if (trade.type === "BUY") {
            const currentExit = closePrice - spread;
            trade.profit = (currentExit - trade.entry) * trade.size;
        } else {
            const currentExit = closePrice + spread;
            trade.profit = (trade.entry - currentExit) * trade.size;
        }
    });

    // ---- 3️⃣ Margin Check ----
    if (enforceMargin && marketOpen) {
        const totalFloatingLoss = positions
            .filter(p => p.open && p.profit < 0)
            .reduce((sum, p) => sum + Math.abs(p.profit), 0);

        if (totalFloatingLoss > balance) {
            forceCloseAll();
        }
    }
}

// ---- Render Dashboard ----
function renderTables() {
    if (!data || data.length < 1) return;

    document.getElementById("buyBtn").disabled = !marketOpen;
    document.getElementById("sellBtn").disabled = !marketOpen;

    const floatingPL = positions
        .filter(p => p.open)
        .reduce((sum, p) => sum + p.profit, 0);

    const effectiveBalance = balance + floatingPL;
    balanceDisplay.textContent = effectiveBalance.toFixed(2);

    const hasOpenTrades = positions.some(p => p.open);
    const uiText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    uiText('cashBalance', '$' + balance.toFixed(2));
    uiText('floatingPL', (floatingPL > 0 ? '+$' : floatingPL < 0 ? '−$' : '$') + Math.abs(floatingPL).toFixed(2));
    const floatingDisplay = document.getElementById('floatingPL');
    if (floatingDisplay) floatingDisplay.className = floatingPL > 0 ? 'profit' : floatingPL < 0 ? 'loss' : '';
    uiText('positionCount', String(positions.filter(p => p.open).length));
    const emptyPositions = document.getElementById('positionsEmpty');
    if (emptyPositions) emptyPositions.hidden = hasOpenTrades;
    const emptyHistory = document.getElementById('historyEmpty');
    if (emptyHistory) emptyHistory.hidden = positions.some(p => !p.open);

    if (hasOpenTrades) {
        balanceDisplay.style.color =
            floatingPL > 0 ? "#54d7aa" :
            floatingPL < 0 ? "#ff7b8d" : "#e7edf5";
    } else {
        balanceDisplay.style.color = "#e7edf5";
    }

    // ---- Keep Close All visible; enable it when there are open trades ----
    const closeAllBtn = document.getElementById("closeAllBtn");
    if (closeAllBtn) {
        closeAllBtn.disabled = !hasOpenTrades || !marketOpen;
    }

    // Open Trades
    openTable.innerHTML = "";
    positions.filter(p => p.open).forEach(trade => {
        const profitClass = trade.profit >= 0 ? "profit" : "loss";
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>#${trade.id}</td>
            <td><span class="tradeSide ${trade.type.toLowerCase()}">${trade.type}</span></td>
            <td>${trade.entry.toFixed(2)}</td>
            <td>${data[data.length - 1].close.toFixed(2)}</td>
            <td class="${profitClass}">${trade.profit.toFixed(2)}</td>
            <td>
                <button onclick="setTP(${trade.id})" ${marketOpen ? '' : 'disabled'}>TP</button>
                <button onclick="setSL(${trade.id})" ${marketOpen ? '' : 'disabled'}>SL</button>
                <button onclick="closeTrade(${trade.id})" ${marketOpen ? '' : 'disabled'}>Close</button>
            </td>`;
        openTable.appendChild(row);
    });

    // Trade History
    historyTable.innerHTML = "";
    positions.filter(p => !p.open).forEach(trade => {
        const profitClass = trade.profit >= 0 ? "profit" : "loss";
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>#${trade.id}</td>
            <td><span class="tradeSide ${trade.type.toLowerCase()}">${trade.type}</span></td>
            <td>${trade.entry.toFixed(2)}</td>
            <td>${trade.exit.toFixed(2)}</td>
            <td class="${profitClass}">${trade.profit.toFixed(2)}</td>
            <td>${trade.closedAt}</td>
        `;
        historyTable.appendChild(row);
    });
}

// ---- Expose API ----
window.setMarketOpen = setMarketOpen;
window.isMarketOpen = isMarketOpen;
window.placeBuy = placeBuy;
window.placeSell = placeSell;
window.closeTrade = closeTrade;
window.renderTables = renderTables;
window.setTP = setTP;
window.setSL = setSL;
window.closeAllTrades = closeAllTrades;

// Initial sync
balanceDisplay.textContent = balance.toFixed(2);
