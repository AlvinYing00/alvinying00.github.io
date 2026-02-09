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
        size: 1,
        open: true,
        exit: null,
        profit: 0,
        timestamp: new Date().toLocaleTimeString()
    };

    positions.push(trade);
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
        size: 1,
        open: true,
        exit: null,
        profit: 0,
        timestamp: new Date().toLocaleTimeString()
    };

    positions.push(trade);
    renderTables();
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
        trade.closedAt = new Date().toLocaleTimeString();
    });

    balance = 0.00;
    renderTables();
}

// ---- Update floating P/L ----
function updateFloatingPL(enforceMargin = true) {
    if (!data || data.length < 1) return;

    const lastPrice = data[data.length - 1].close;
    const spread = getSpread(lastPrice);

    // 1️⃣ Recalculate floating P/L
    positions.forEach(trade => {
        if (!trade.open) return;

        if (trade.type === "BUY") {
            const currentExit = lastPrice - spread;
            trade.profit = (currentExit - trade.entry) * trade.size;
        } else {
            const currentExit = lastPrice + spread;
            trade.profit = (trade.entry - currentExit) * trade.size;
        }
    });

    // 2️⃣ Compute floating loss AFTER update
    const totalFloatingLoss = positions
        .filter(p => p.open && p.profit < 0)
        .reduce((sum, p) => sum + Math.abs(p.profit), 0);

    // 3️⃣ Enforce margin ONLY when explicitly requested
    if (enforceMargin && totalFloatingLoss > balance) {
        forceCloseAll();
    }
}

// ---- Render Dashboard ----
function renderTables() {
    if (!data || data.length < 1) return;

    // ❗ NO margin enforcement here
    updateFloatingPL(false);

    document.getElementById("buyBtn").disabled = !marketOpen;
    document.getElementById("sellBtn").disabled = !marketOpen;

    const floatingPL = positions
        .filter(p => p.open)
        .reduce((sum, p) => sum + p.profit, 0);

    const effectiveBalance = balance + floatingPL;
    balanceDisplay.textContent = effectiveBalance.toFixed(2);

    if (positions.some(p => p.open)) {
        balanceDisplay.style.color =
            floatingPL > 0 ? "limegreen" :
            floatingPL < 0 ? "red" : "white";
    } else {
        balanceDisplay.style.color = "white";
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
            <td><button onclick="closeTrade(${trade.id})">Close</button></td>
        `;
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

// Initial sync
balanceDisplay.textContent = balance.toFixed(2);
