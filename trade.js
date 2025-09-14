// trade.js

let positions = []; // Active and closed trades
let orderId = 1;
const SPREAD = 0.20;
let balance = 100.00;

// Elements
const balanceDisplay = document.getElementById("balance");
const openTable = document.getElementById("openPositions");
const historyTable = document.getElementById("tradeHistory");

// ---- Place Orders ----
function placeBuy() {
  if (data.length < 1) return;
  const lastPrice = data[data.length - 1].close;
  const entry = lastPrice + SPREAD; // Buy opens at Ask

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
  if (data.length < 1) return;
  const lastPrice = data[data.length - 1].close;
  const entry = lastPrice - SPREAD; // Sell opens at Bid

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

// ---- Render Dashboard ----
function renderTables() {
  // Update balance
  balanceDisplay.textContent = balance.toFixed(2);

  // Open trades
  openTable.innerHTML = "";
  positions.filter(p => p.open).forEach(trade => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>#${trade.id}</td>
      <td>${trade.type}</td>
      <td>${trade.entry.toFixed(2)}</td>
      <td>${data[data.length - 1].close.toFixed(2)}</td>
      <td>${trade.profit.toFixed(2)}</td>
      <td><button onclick="closeTrade(${trade.id})">Close</button></td>
    `;
    openTable.appendChild(row);
  });

  // Trade history
  historyTable.innerHTML = "";
  positions.filter(p => !p.open).forEach(trade => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>#${trade.id}</td>
      <td>${trade.type}</td>
      <td>${trade.entry.toFixed(2)}</td>
      <td>${trade.exit.toFixed(2)}</td>
      <td>${trade.profit.toFixed(2)}</td>
      <td>${trade.closedAt}</td>
    `;
    historyTable.appendChild(row);
  });
}

// Expose functions globally
window.placeBuy = placeBuy;
window.placeSell = placeSell;
window.closeTrade = closeTrade;
