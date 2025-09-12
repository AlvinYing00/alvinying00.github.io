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
        open: 1.2000,
        high: 1.2010,
        low: 1.1990,
        close: 1.2005,
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
        high: lastPrice + (direction === "up" ? Math.random() * 0.002 : Math.random() * 0.001),
        low: lastPrice - (direction === "up" ? Math.random() * 0.001 : Math.random() * 0.002),
        close: lastPrice + (direction === "up" ? Math.random() * 0.0015 : -Math.random() * 0.0015),
    };

    data.push(newCandle);
    candleSeries.setData(data);
}

// Pump chart to target price
function pump() {
    const price = parseFloat(document.getElementById("priceInput").value);
    if (isNaN(price)) return alert("Enter a valid price!");
    addCustomCandle(price);
}

// Dump chart to target price
function dump() {
    const price = parseFloat(document.getElementById("priceInput").value);
    if (isNaN(price)) return alert("Enter a valid price!");
    addCustomCandle(price);
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
