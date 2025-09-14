// trade.js

let positions = []; // Active and closed trades
let orderId = 1;
const SPREAD = 0.20;
let balance = 100.00;

// Elements
const balanceDisplay = document.getElementById("balance");
const openTable = document.getElementById("openPositions");
const historyTable = document.getElementById("tradeHistory");

function getSpread(price) {
  return Math.max(0.01, price * 0.002); // e.g. 0.2% of price, min 0.01
}

// ---- Place Orders ----
function placeBuy() {
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
  let exit;

  if (trade.type === "BUY") {
    exit = lastPrice - SPREAD; // Close buy at Bid
  } else {
    exit = lastPrice + SPREAD; // Close sell at Ask
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
  if (data.length < 1) return;
  const lastPrice = data[data.length - 1].close;

  positions.forEach(trade => {
    if (!trade.open) return;

    let currentExit;
    if (trade.type === "BUY") {
      currentExit = lastPrice - SPREAD; // if closed now
      trade.profit = (currentExit - trade.entry) * trade.size;
    } else {
      currentExit = lastPrice + SPREAD;
      trade.profit = (trade.entry - currentExit) * trade.size;
    }
  });
}

// ---- Render Dashboard ----
function renderTables() {
  if (data.length < 1) return;

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

// Hook into your chart price updater
const oldUpdatePriceDisplay = updatePriceDisplay;
updatePriceDisplay = function () {
  oldUpdatePriceDisplay(); // keep chart updates
  renderTables();          // tables now always use updated P/L
};

// Expose functions globally
window.placeBuy = placeBuy;
window.placeSell = placeSell;
window.closeTrade = closeTrade;
