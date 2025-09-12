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

// Generate random candle
function generateCandle() {
    time++;
    let lastPrice = data.length ? data[data.length - 1].close : 1.2000;

    let direction = Math.random() > 0.5 ? "up" : "down";
    let newCandle;

    if (direction === "up") {
        newCandle = {
            time: time,
            open: lastPrice,
            high: lastPrice + Math.random() * 0.002,
            low: lastPrice - Math.random() * 0.001,
            close: lastPrice + Math.random() * 0.0015,
        };
    } else {
        newCandle = {
            time: time,
            open: lastPrice,
            high: lastPrice + Math.random() * 0.001,
            low: lastPrice - Math.random() * 0.002,
            close: lastPrice - Math.random() * 0.0015,
        };
    }

    data.push(newCandle);
    candleSeries.setData(data);
}

// Pump chart to target price
function pump() {
    const price = parseFloat(document.getElementById("priceInput").value);
    if (isNaN(price)) return alert("Enter a valid price!");

    time++;
    let lastPrice = data.length ? data[data.length - 1].close : 1.2000;

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

// Dump chart to target price
function dump() {
    const price = parseFloat(document.getElementById("priceInput").value);
    if (isNaN(price)) return alert("Enter a valid price!");

    time++;
    let lastPrice = data.length ? data[data.length - 1].close : 1.2000;

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
