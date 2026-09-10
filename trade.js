// trade.js

let positions = []; // Active and closed trades
let orderId = 1;
let balance = 100.00;
// FRX contract: one lot is one unit. Each order keeps its opening settings.
const ACCOUNT_CONFIG = {unitsPerLot: 1};

function accountSnapshot() {
    const open = positions.filter(p => p.open);
    const floating = open.reduce((sum, p) => sum + p.profit, 0);
    const used = open.reduce((sum, p) => sum + p.margin, 0);
    const equity = balance + floating;
    return {floating, used, equity, available: equity - used,
        level: used > 0 ? equity / used : null};
}

function orderSettings() {
    const lots = Number(document.getElementById('lotSize').value);
    const leverage = Number(document.getElementById('leverageSelect').value);
    if (!Number.isFinite(lots) || lots < 0.01 ||
        Math.abs(lots * 100 - Math.round(lots * 100)) > 1e-7 ||
        ![1, 10, 100, 1000].includes(leverage)) return null;
    return {lots, leverage, size: lots * ACCOUNT_CONFIG.unitsPerLot};
}

function updateOrderEstimate() {
    const settings = orderSettings();
    const price = typeof currentTickPrice === 'number' ? currentTickPrice : 0;
    updateLiveText(document.getElementById('orderMarginEstimate'), settings
        ? '$' + (price * settings.size / settings.leverage).toFixed(2) : 'Check lot size');
}

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
let notificationFadeTimer = null;
let notificationHideTimer = null;

function dismissTradingNotice() {
    clearTimeout(notificationFadeTimer);
    clearTimeout(notificationHideTimer);
    notificationFadeTimer = null;
    notificationHideTimer = null;
    const notification = document.getElementById('tradingNotice');
    if (notification) notification.hidden = true;
}

function notifyTrading(message) {
    const notification = document.getElementById('tradingNotice');
    if (!notification) return;
    dismissTradingNotice();
    document.getElementById('tradingNoticeText').textContent = message;
    notification.style.opacity = '1';
    notification.hidden = false;
    notificationFadeTimer = setTimeout(() => {
        notification.style.opacity = '0';
        notificationHideTimer = setTimeout(dismissTradingNotice, 300);
    }, 7000);
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

function resetAccountBalance() {
    if (!isMarketOpen()) return notifyTrading('Start the market before resetting your balance.');
    if (positions.some(trade => trade.open)) return notifyTrading('Close all open trades before resetting your balance.');
    balance = volatilityConfig[currentVolatility].balance;
    renderTables();
    notifyTrading(`Balance reset to $${balance.toFixed(2)}.`);
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
    return `${trade.type === 'BUY' ? 'Buy' : 'Sell'} ${sign}$${Math.abs(rounded).toFixed(2)}`;
}

function removeEntryLine(trade) {
    if (!trade.entryLine) return;
    candleSeries.removePriceLine(trade.entryLine);
    trade.entryLine = null;
}

// ---- Place Orders ----
function placeBuy() {
    placeOrder('BUY');
}

function placeSell() {
    placeOrder('SELL');
}

function placeOrder(type) {
    if (!isMarketOpen()) return notifyTrading('Start the market before placing a trade.');
    if (!data || data.length < 1) return notifyTrading("No market data available.");
    const settings = orderSettings();
    if (!settings) return notifyTrading('Enter a lot size of at least 0.01 in steps of 0.01 and select a leverage.');
    updateFloatingPL();
    const lastPrice =
        typeof currentTickPrice === "number"
            ? currentTickPrice
            : data[data.length - 1].close;
    const spread = getSpread(lastPrice);
    const bid = Math.max(0.01, lastPrice - spread);
    const ask = Math.max(0.01, lastPrice + spread);
    const entry = type === 'BUY' ? ask : bid;
    // Reserve gross margin per order, including hedged orders. Spread is a
    // floating loss, not another cash deduction or a leverage multiplier.
    const margin = lastPrice * settings.size / settings.leverage;
    const openingLoss = (ask - bid) * settings.size;
    const account = accountSnapshot();
    if (!Number.isFinite(margin + openingLoss) || account.equity <= 0 ||
        margin + openingLoss > account.available + 1e-9) {
        return notifyTrading('Insufficient available margin for this lot size, including spread. Reduce the lot size or close a position.');
    }
    const trade = {
        id: orderId++,
        type,
        entry,
        spread,
        ...settings,
        margin,
        open: true,
        exit: null,
        profit: -openingLoss,
        tp: null,
        sl: null,
        tpLine: null,
        slLine: null,
        timestamp: new Date().toLocaleTimeString()
    };

    positions.push(trade);
    createEntryLine(trade);

    renderTables();
}

let exitPriceEditor = null;

function openExitPriceEditor(id, kind) {
    if (!isMarketOpen()) return notifyTrading('Market is paused. Start the market to manage trades.');
    const trade = positions.find(t => t.id === id && t.open);
    if (!trade) return;

    exitPriceEditor = {id, kind};
    document.getElementById('exitPriceTitle').textContent = `${kind === 'tp' ? 'Take profit' : 'Stop loss'} · ${trade.type} #${id}`;
    const input = document.getElementById('exitPriceInput');
    input.value = trade[kind] ?? '';
    document.getElementById('exitPricePanel').hidden = false;
    input.focus?.();
}

function closeExitPriceEditor() {
    document.getElementById('exitPricePanel').hidden = true;
    exitPriceEditor = null;
}

function saveExitPrice() {
    if (!exitPriceEditor) return;
    if (!isMarketOpen()) return notifyTrading('Market is paused. Start the market to manage trades.');
    const {id, kind} = exitPriceEditor;
    const trade = positions.find(t => t.id === id && t.open);
    if (!trade) {
        closeExitPriceEditor();
        return notifyTrading('This trade has already closed.');
    }
    const raw = document.getElementById('exitPriceInput').value.trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < 0.01) return notifyTrading('Enter a valid price of at least 0.01.');
    trade[kind] = value;
    if (kind === 'tp') createOrUpdateTPLine(trade);
    else createOrUpdateSLLine(trade);
    closeExitPriceEditor();
}

function setTP(id) { openExitPriceEditor(id, 'tp'); }
function setSL(id) { openExitPriceEditor(id, 'sl'); }

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
        exit = Math.max(0.01, lastPrice - spread);
        trade.profit = (exit - trade.entry) * trade.size;
    } else {
        exit = Math.max(0.01, lastPrice + spread);
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
            trade.exit = Math.max(0.01, lastPrice - spread);
            trade.profit = (trade.exit - trade.entry) * trade.size;
        } else {
            trade.exit = Math.max(0.01, lastPrice + spread);
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
        balance += trade.profit;
    });

    notifyTrading('Account equity reached zero or below. All positions were closed because your balance could no longer cover net trading losses.');
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
            exit = Math.max(0.01, lastPrice - spread);
            trade.profit = (exit - trade.entry) * trade.size;
        } else {
            exit = Math.max(0.01, lastPrice + spread);
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
    // Use live tick price when available.
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
            const executablePrice = Math.max(0.01, closePrice - spread);
            if (trade.tp !== null && executablePrice >= trade.tp) {
                hit = true;
            } else if (trade.sl !== null && executablePrice <= trade.sl) {
                hit = true;
            }
        } else { // SELL
            const executablePrice = Math.max(0.01, closePrice + spread);
            if (trade.tp !== null && executablePrice <= trade.tp) {
                hit = true;
            } else if (trade.sl !== null && executablePrice >= trade.sl) {
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
            const currentExit = Math.max(0.01, closePrice - spread);
            trade.profit = (currentExit - trade.entry) * trade.size;
        } else {
            const currentExit = Math.max(0.01, closePrice + spread);
            trade.profit = (trade.entry - currentExit) * trade.size;
        }
    });

    // ---- 3️⃣ Margin Check ----
    if (enforceMargin && marketOpen) {
        const account = accountSnapshot();
        // Net all winners and losers; reserved margin only limits new orders.
        if (positions.some(p => p.open) && account.equity <= 0) {
            forceCloseAll();
        }
    }
}

// ---- Render Dashboard ----
// Preserve live text nodes and avoid DOM mutations when a displayed value is unchanged.
function updateLiveText(element, value) {
    if (!element || element.textContent === value) return;
    if (element.childNodes?.length === 1 && element.firstChild.nodeType === 3) {
        element.firstChild.nodeValue = value;
    } else {
        element.textContent = value;
    }
}

function renderTables() {
    if (!data || data.length < 1) return;

    document.getElementById("buyBtn").disabled = !marketOpen;
    document.getElementById("sellBtn").disabled = !marketOpen;

    const floatingPL = positions
        .filter(p => p.open)
        .reduce((sum, p) => sum + p.profit, 0);

    const effectiveBalance = balance + floatingPL;
    updateLiveText(balanceDisplay, effectiveBalance.toFixed(2));

    const hasOpenTrades = positions.some(p => p.open);
    const uiText = (id, value) => {
        const element = document.getElementById(id);
        updateLiveText(element, value);
    };
    uiText('cashBalance', '$' + balance.toFixed(2));
    const account = accountSnapshot();
    uiText('usedMargin', '$' + account.used.toFixed(2));
    uiText('availableMargin', '$' + account.available.toFixed(2));
    uiText('marginLevel', account.level === null ? '—' : (account.level * 100).toFixed(1) + '%');
    updateOrderEstimate();
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
    const openTrades = positions.filter(p => p.open);
    const openSignature = JSON.stringify([marketOpen, openTrades.map(p => [p.id, p.type, p.entry])]);
    if (openTable.tradeSignature !== openSignature) {
      openTable.tradeSignature = openSignature;
      openTable.tradeRows = new Map();
      openTable.innerHTML = "";
      openTrades.forEach(trade => {
        const profitClass = trade.profit >= 0 ? "profit" : "loss";
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>#${trade.id}<small class="positionTerms">${trade.lots.toFixed(2)} lots · 1:${trade.leverage}</small></td>
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
        openTable.tradeRows.set(trade.id, row);
      });
    }
    // Keep action buttons mounted while updating prices and P/L every tick.
    for (const trade of openTrades) {
        const cells = openTable.tradeRows.get(trade.id)?.cells;
        if (!cells) continue;
        updateLiveText(cells[3], data[data.length - 1].close.toFixed(2));
        updateLiveText(cells[4], trade.profit.toFixed(2));
        cells[4].className = trade.profit >= 0 ? 'profit' : 'loss';
    }

    // Trade History
    const closedTrades = positions.filter(p => !p.open);
    const historySignature = JSON.stringify(closedTrades);
    if (historyTable.tradeSignature === historySignature) return;
    historyTable.tradeSignature = historySignature;
    historyTable.innerHTML = "";
    closedTrades.forEach(trade => {
        const profitClass = trade.profit >= 0 ? "profit" : "loss";
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>#${trade.id}<small class="positionTerms">${trade.lots.toFixed(2)} lots · 1:${trade.leverage}</small></td>
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
