// Create chart
const chart = LightweightCharts.createChart(document.getElementById('chart'), {
    width: 800,
    height: 400,
    layout: {
        backgroundColor: '#ffffff',
        textColor: '#333',
    },
    grid: {
        vertLines: { color: '#eee' },
        horzLines: { color: '#eee' },
    },
});

const candleSeries = chart.addCandlestickSeries();

let data = [];
let time = 0;
let marketInterval = null;

// Seed the chart with the first candle
function initChart() {
    let firstCandle = {
        time: ++time,
        open: 100,
        high: 102,
        low: 98,
        close: 100,
    };
    data.push(firstCandle);
    candleSeries.setData(data);
}
initChart();

// Generate random candle every tick
function generateCandle() {
    time++;
    let lastPrice = data[data.length - 1].close;

    let direction = Math.random() > 0.5 ? "up" : "down";
    let newCandle = {
        time: time,
        open: lastPrice,
        high: lastPrice + (direction === "up" ? Math.random() * 2 : Math.random() * 1),
        low: lastPrice - (direction === "up" ? Math.random() * 1 : Math.random() * 2),
        close: Math.max(0, lastPrice + (direction === "up" ? Math.random() * 1.5 : -Math.random() * 1.5)),
    };

    data.push(newCandle);
    candleSeries.setData(data);
}

// Pump chart (add value to current price)
function pump() {
    const value = parseFloat(document.getElementById("priceInput").value);
    if (isNaN(value)) return alert("Enter a valid number!");

    let lastPrice = data[data.length - 1].close;
    let targetPrice = lastPrice + value; // add instead of set
    addCustomCandle(targetPrice);
}

// Dump chart (subtract value from current price)
function dump() {
    const value = parseFloat(document.getElementById("priceInput").value);
    if (isNaN(value)) return alert("Enter a valid number!");

    let lastPrice = data[data.length - 1].close;
    let targetPrice = Math.max(0, lastPrice - value); // prevent negative
    addCustomCandle(targetPrice);
}

// Add manual candle
function addCustomCandle(price) {
    time++;
    let lastPrice = data[data.length - 1].close;

    let newCandle = {
        time: time,
        open: lastPrice,
        high: Math.max(lastPrice, price),
        low: Math.min(lastPrice, price),
        close: price,
    };

    data.push(newCandle);
    candleSeries.setData(data);
}

// Start/Stop Market
function toggleMarket() {
    if (marketInterval) {
        clearInterval(marketInterval);
        marketInterval = null;
        console.log("Market stopped.");
    } else {
        marketInterval = setInterval(generateCandle, 1000);
        console.log("Market started.");
    }
}
