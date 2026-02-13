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
let marketOpen = true;

// Public setter
function setMarketOpen(state) {
    marketOpen = !!state;
    console.log("Trade module: marketOpen =", marketOpen);
    if (typeof renderTables === "function") renderTables();
}

function isMarketOpen() {
    return marketOpen;
}

// ---- Place Orders ----
function placeBuy() {
    if (!isMarketOpen()) return alert("Market is closed! Cannot place BUY order.");
    if (balance <= 0) return alert("Insufficient funds! Balance is 0.");
    if (!data || data.length < 1) return alert("No market data available.");

    const lastPrice = data[data.length - 1].close;
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

    // 🔑 calculate floating P/L immediately
    updateFloatingPL(false);
    renderTables();
}

function placeSell() {
    if (!isMarketOpen()) return alert("Market is closed! Cannot place SELL order.");
    if (balance <= 0) return alert("Insufficient funds! Balance is 0.");
    if (!data || data.length < 1) return alert("No market data available.");

    const lastPrice = data[data.length - 1].close;
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

    // 🔑 calculate floating P/L immediately
    updateFloatingPL(false);
    renderTables();
}

function setTP(id) {
    const trade = positions.find(t => t.id === id && t.open);
    if (!trade) return;

    const value = parseFloat(prompt("Enter TP price:"));
    if (isNaN(value)) return;

    trade.tp = value;
    createOrUpdateTPLine(trade);
}

function setSL(id) {
    const trade = positions.find(t => t.id === id && t.open);
    if (!trade) return;

    const value = parseFloat(prompt("Enter SL price:"));
    if (isNaN(value)) return;

    trade.sl = value;
    createOrUpdateSLLine(trade);
}

// ---- Close Trade ----
function closeTrade(id) {
    const trade = positions.find(t => t.id === id && t.open);
    if (!trade) return;

    const lastPrice = data[data.length - 1].close;
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

        const lastPrice = data[data.length - 1].close;
        const spread = getSpread(lastPrice);

        if (trade.type === "BUY") {
            trade.exit = lastPrice - spread;
            trade.profit = (trade.exit - trade.entry) * trade.size;
        } else {
            trade.exit = lastPrice + spread;
            trade.profit = (trade.entry - trade.exit) * trade.size;
        }

        trade.open = false;
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

    balance = 0.00;
    renderTables();
}

// ---- Manual Close All ----
function closeAllTrades() {
    if (!data || data.length === 0) return;

    const lastPrice = data[data.length - 1].close;
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
    const closePrice = lastCandle.close;
    const spread = getSpread(closePrice);

    // ---- 1️⃣ TP / SL Execution (intrabar realistic) ----
    const tradesToClose = [];

    positions.forEach(trade => {
        if (!trade.open) return;

        let hit = false;

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
    tradesToClose.forEach(id => closeTrade(id));

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
    if (enforceMargin) {
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

    if (hasOpenTrades) {
        balanceDisplay.style.color =
            floatingPL > 0 ? "limegreen" :
            floatingPL < 0 ? "red" : "white";
    } else {
        balanceDisplay.style.color = "white";
    }

    // ---- Close All button visibility ----
    const closeAllBtn = document.getElementById("closeAllBtn");
    if (closeAllBtn) {
        closeAllBtn.style.display = hasOpenTrades ? "inline-block" : "none";
    }

    // Open Trades
    openTable.innerHTML = "";
    positions.filter(p => p.open).forEach(trade => {
        const profitClass = trade.profit >= 0 ? "profit" : "loss";
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>#${trade.id}</td>
            <td>${trade.type}</td>
            <td>${trade.entry.toFixed(2)}</td>
            <td>${data[data.length - 1].close.toFixed(2)}</td>
            <td class="${profitClass}">${trade.profit.toFixed(2)}</td>
            <td>
                <button onclick="setTP(${trade.id})">TP</button>
                <button onclick="setSL(${trade.id})">SL</button>
                <button onclick="closeTrade(${trade.id})">Close</button>
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
            <td>${trade.type}</td>
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
