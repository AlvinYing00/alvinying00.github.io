let positions = [];
let orderId = 1;
let balance = 100.00;
let marketOpen = true; // only controls trade placement

// Elements
const balanceDisplay = document.getElementById("balance");
const openTable = document.getElementById("openPositions");
const historyTable = document.getElementById("tradeHistory");

function toggleMarket(state) {
  marketOpen = state; // only prevent new trades when false
}

function getSpread(price) {
  return Math.max(0.01, price * 0.002); // 0.2% dynamic
}

// ---- Place Orders ----
function placeBuy() {
  if (!marketOpen || data.length < 1) return alert("Market is closed!");
  const lastPrice = data[data.length - 1].close;
  const spread = getSpread(lastPrice);

  positions.push({
    id: orderId++,
    type: "BUY",
    entry: lastPrice + spread,
    size: 1,
    open: true,
    exit: null,
    profit: 0,
    timestamp: new Date().toLocaleTimeString()
  });
  renderTables();
}

function placeSell() {
  if (!marketOpen || data.length < 1) return alert("Market is closed!");
  const lastPrice = data[data.length - 1].close;
  const spread = getSpread(lastPrice);

  positions.push({
    id: orderId++,
    type: "SELL",
    entry: Math.max(0.01, lastPrice - spread),
    size: 1,
    open: true,
    exit: null,
    profit: 0,
    timestamp: new Date().toLocaleTimeString()
  });
  renderTables();
}

// ---- Close Trades ----
function closeTrade(id) {
  const trade = positions.find(t => t.id === id && t.open);
  if (!trade) return;

  const lastPrice = data[data.length - 1].close;
  const spread = getSpread(lastPrice);
  trade.exit = trade.type === "BUY" ? lastPrice - spread : lastPrice + spread;
  trade.profit = trade.type === "BUY" ? (trade.exit - trade.entry) : (trade.entry - trade.exit);
  balance += trade.profit;
  trade.open = false;
  trade.closedAt = new Date().toLocaleTimeString();
  renderTables();
}

// ---- Floating P/L ----
function updateFloatingPL() {
  if (data.length < 1) return;
  const lastPrice = data[data.length - 1].close;
  const spread = getSpread(lastPrice);

  positions.forEach(trade => {
    if (!trade.open) return;
    const currentExit = trade.type === "BUY" ? lastPrice - spread : lastPrice + spread;
    trade.profit = trade.type === "BUY" ? (currentExit - trade.entry) : (trade.entry - currentExit);
  });
}

// ---- Render ----
function renderTables() {
  if (data.length < 1) return;

  updateFloatingPL();
  balanceDisplay.textContent = balance.toFixed(2);

  // Open trades
  openTable.innerHTML = "";
  positions.filter(t => t.open).forEach(trade => {
    const profitClass = trade.profit >= 0 ? "profit" : "loss";
    openTable.innerHTML += `
      <tr>
        <td>#${trade.id}</td>
        <td>${trade.type}</td>
        <td>${trade.entry.toFixed(2)}</td>
        <td>${data[data.length-1].close.toFixed(2)}</td>
        <td class="${profitClass}">${trade.profit.toFixed(2)}</td>
        <td><button onclick="closeTrade(${trade.id})">Close</button></td>
      </tr>`;
  });

  // Trade history
  historyTable.innerHTML = "";
  positions.filter(t => !t.open).forEach(trade => {
    const profitClass = trade.profit >= 0 ? "profit" : "loss";
    historyTable.innerHTML += `
      <tr>
        <td>#${trade.id}</td>
        <td>${trade.type}</td>
        <td>${trade.entry.toFixed(2)}</td>
        <td>${trade.exit.toFixed(2)}</td>
        <td class="${profitClass}">${trade.profit.toFixed(2)}</td>
        <td>${trade.closedAt}</td>
      </tr>`;
  });
}

// Hook after chart price updates
const oldUpdatePriceDisplay = updatePriceDisplay;
updatePriceDisplay = function() {
  oldUpdatePriceDisplay();
  renderTables();
};

// Expose
window.placeBuy = placeBuy;
window.placeSell = placeSell;
window.closeTrade = closeTrade;
window.toggleMarket = toggleMarket;
