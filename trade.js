// trade.js
let positions = []; // Active and closed trades
let orderId = 1;
const SPREAD = 0.20;
let balance = 100.00;

// Elements (make sure these exist in DOM)
const balanceDisplay = document.getElementById("balance");
const openTable = document.getElementById("openPositions");
const historyTable = document.getElementById("tradeHistory");

// Dynamic spread helper
function getSpread(price) {
  return Math.max(0.01, price * 0.002); // 0.2% of price, min 0.01
}

// market state used by trade.js
let marketOpen = true; // default open

// Public setter (do NOT name this `toggleMarket` or you'll clash with script.js)
function setMarketOpen(state) {
  marketOpen = !!state;
  console.log("Trade module: marketOpen =", marketOpen);
  // update UI immediately so user sees closed/open state
  if (typeof renderTables === "function") renderTables();
}

// convenience getter
function isMarketOpen() {
  return marketOpen;
}

// ---- Place Orders ----
function placeBuy() {
  if (!marketOpen) return alert("Market is closed! Cannot place BUY order.");

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
  if (!marketOpen) return alert("Market is closed! Cannot place SELL order.");

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
  const spread = getSpread(lastPrice); // ✅ use dynamic spread
  let exit;

  if (trade.type === "BUY") {
    exit = lastPrice - spread; // Close buy at Bid
  } else {
    exit = lastPrice + spread; // Close sell at Ask
  }

  trade.exit = exit;
  trade.profit = (trade.type === "BUY")
    ? (exit - trade.entry) * trade.size
    : (trade.entry - exit) * trade.size;

  balance += trade.profit; // update balance
  trade.open = false;
  trade.closedAt = new Date().toLocaleTimeString();

  renderTables();
}

// ---- Update floating P/L for open trades ----
function updateFloatingPL() {
  if (!data || data.length < 1) return;
  const lastPrice = data[data.length - 1].close;
  const spread = getSpread(lastPrice);

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
}

// ---- Render Dashboard ----
function renderTables() {
  if (!data || data.length < 1) return;

  updateFloatingPL(); // keep P/L fresh
  balanceDisplay.textContent = balance.toFixed(2);

  // Open trades
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

  // Trade history
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

// Export small API so script.js can inform trade module about market state
window.setMarketOpen = setMarketOpen;
window.isMarketOpen = isMarketOpen;

// Expose trade functions globally (so your HTML buttons can call them)
window.placeBuy = placeBuy;
window.placeSell = placeSell;
window.closeTrade = closeTrade;
window.renderTables = renderTables;
