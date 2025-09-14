let positions = []; // Active and closed trades
let orderId = 1;
let balance = 100.00;
let marketOpen = true; // default open

// Elements
const balanceDisplay = document.getElementById("balance");
const openTable = document.getElementById("openPositions");
const historyTable = document.getElementById("tradeHistory");

function toggleMarket(state) {
  marketOpen = state;
}

// Dynamic spread: 0.2% of price, minimum 0.01
function getSpread(price) {
  return Math.max(0.01, price * 0.002);
}

// ---- Place Orders ----
function placeBuy() {
  if (!marketOpen || data.length < 1) return alert("Market is closed!");
  const lastPrice = data[data.length - 1].close;
  const spread = getSpread(lastPrice);
  const entry = lastPrice + spread; // Buy at Ask

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
  if (!marketOpen || data.length < 1) return alert("Market is closed!");
  const lastPrice = data[data.length - 1].close;
  const spread = getSpread(lastPrice);
  const entry = Math.max(0.01, lastPrice - spread); // Sell at Bid

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
    exit = lastPrice - spread; // close buy at Bid
  } else {
    exit = lastPrice + spread; // close sell at Ask
  }

  trade.exit = exit;
  trade.profit = (trade.type === "BUY")
    ? (exit - trade.entry) * trade.size
    : (trade.entry - exit) * trade.size;

  balance += trade.profit;
  trade.open = false;
  trade.closedAt = new Date().toLocaleTimeString();

  renderTables();
}

// ---- Update floating P/L ----
function updateFloatingPL() {
  if (data.length < 1) return;
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

// Hook into chart price updater
const oldUpdatePriceDisplay = updatePriceDisplay;
updatePriceDisplay = function () {
  oldUpdatePriceDisplay();
  renderTables();
};

// Expose globally
window.placeBuy = placeBuy;
window.placeSell = placeSell;
window.closeTrade = closeTrade;
window.toggleMarket = toggleMarket;
