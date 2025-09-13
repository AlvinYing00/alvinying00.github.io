function generateDoubleTopCandle() {
  if (!currentPattern) return;
  const lastPrice = data[data.length - 1].close;
  const totalSteps = currentPattern.totalSteps;
  const step = totalSteps - currentPattern.steps;

  let newClose = lastPrice;

  if (step < totalSteps * 0.2) {
    newClose = lastPrice + getVolatility(lastPrice) * 1.5;
  } else if (step < totalSteps * 0.35) {
    newClose = lastPrice + (Math.random() - 0.5) * getVolatility(lastPrice) * 0.2;
  } else if (step < totalSteps * 0.55) {
    newClose = lastPrice - getVolatility(lastPrice) * 0.8;
  } else if (step < totalSteps * 0.75) {
    if (!currentPattern.firstTopPrice) currentPattern.firstTopPrice = sessionHigh || lastPrice;
    const target = currentPattern.firstTopPrice;
    newClose = lastPrice + (target - lastPrice) * 0.3 + (Math.random() - 0.5) * getVolatility(lastPrice) * 0.2;
  } else {
    newClose = lastPrice - getVolatility(lastPrice) * 1.2;
  }

  time++;
  const open = lastPrice;
  const bodyHigh = Math.max(open, newClose);
  const bodyLow = Math.min(open, newClose);
  const wickTop = bodyHigh + Math.random() * getVolatility(lastPrice) * 0.3;
  const wickBottom = Math.max(0.01, bodyLow - Math.random() * getVolatility(lastPrice) * 0.3);

  const newCandle = { time, open, high: wickTop, low: wickBottom, close: newClose };
  data.push(newCandle);
  if (data.length > 3000) data.shift();
  candleSeries.setData(data);
  updatePriceDisplay();
}

function generateDoubleBottomCandle() {
  if (!currentPattern) return;
  const lastPrice = data[data.length - 1].close;
  const totalSteps = currentPattern.totalSteps;
  const step = totalSteps - currentPattern.steps;

  let newClose = lastPrice;

  if (step < totalSteps * 0.2) {
    newClose = lastPrice - getVolatility(lastPrice) * 1.5;
  } else if (step < totalSteps * 0.35) {
    newClose = lastPrice + (Math.random() - 0.5) * getVolatility(lastPrice) * 0.2;
  } else if (step < totalSteps * 0.55) {
    newClose = lastPrice + getVolatility(lastPrice) * 0.8;
  } else if (step < totalSteps * 0.75) {
    if (!currentPattern.firstBottomPrice) currentPattern.firstBottomPrice = sessionLow || lastPrice;
    const target = currentPattern.firstBottomPrice;
    newClose = lastPrice - (lastPrice - target) * 0.3 + (Math.random() - 0.5) * getVolatility(lastPrice) * 0.2;
  } else {
    newClose = lastPrice + getVolatility(lastPrice) * 1.2;
  }

  time++;
  const open = lastPrice;
  const bodyHigh = Math.max(open, newClose);
  const bodyLow = Math.min(open, newClose);
  const wickTop = bodyHigh + Math.random() * getVolatility(lastPrice) * 0.3;
  const wickBottom = Math.max(0.01, bodyLow - Math.random() * getVolatility(lastPrice) * 0.3);

  const newCandle = { time, open, high: wickTop, low: wickBottom, close: newClose };
  data.push(newCandle);
  if (data.length > 3000) data.shift();
  candleSeries.setData(data);
  updatePriceDisplay();
}
