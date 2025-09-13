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

function generateHeadAndShouldersCandle() {
  if (!currentPattern) return;

  const lastPrice = data[data.length - 1].close;
  const totalSteps = currentPattern.totalSteps;
  const step = currentPattern.totalSteps - currentPattern.steps;

  let newClose = lastPrice;

  // ---- PHASES ----
  if (step < totalSteps * 0.2) {
    // Phase 1: Left Shoulder (up)
    newClose = lastPrice + getVolatility(lastPrice) * 1.2;
  } else if (step < totalSteps * 0.4) {
    // Phase 2: Head (higher peak)
    const leftShoulder = currentPattern.leftShoulderPrice || lastPrice;
    if (!currentPattern.leftShoulderPrice) currentPattern.leftShoulderPrice = lastPrice;
    const target = leftShoulder + getVolatility(lastPrice) * 1.5;
    newClose = lastPrice + (target - lastPrice) * 0.5 + (Math.random() - 0.5) * getVolatility(lastPrice) * 0.2;
    currentPattern.headPrice = target;
  } else if (step < totalSteps * 0.6) {
    // Phase 3: Pullback after Head
    newClose = lastPrice - getVolatility(lastPrice) * 0.8;
  } else if (step < totalSteps * 0.8) {
    // Phase 4: Right Shoulder (near left shoulder)
    const target = currentPattern.leftShoulderPrice;
    newClose = lastPrice + (target - lastPrice) * 0.4 + (Math.random() - 0.5) * getVolatility(lastPrice) * 0.2;
  } else {
    // Phase 5: Breakdown
    newClose = lastPrice - getVolatility(lastPrice) * 1.2;
  }

  // ---- Candle body + wick ----
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

function generateTriangleCandle() {
  if (!currentPattern.triangleType) {
    const types = ["sym", "asc", "desc"];
    currentPattern.triangleType = types[Math.floor(Math.random() * types.length)];
    console.log("Triangle type:", currentPattern.triangleType);
  }

  const lastPrice = data[data.length - 1].close;
  const progress = 1 - (currentPattern.steps / currentPattern.totalSteps); // 0 → 1

  const startRange = getVolatility(lastPrice) * 30;
  const endRange = getVolatility(lastPrice) * 5;
  const currentRange = startRange - progress * (startRange - endRange);

  let upper, lower;

  switch (currentPattern.triangleType) {
    case "sym": // symmetrical
      upper = lastPrice + (startRange / 2) * (1 - progress);
      lower = lastPrice - (startRange / 2) * (1 - progress);
      break;

    case "asc": // ascending triangle (flat top, rising bottom)
      upper = lastPrice + startRange * 0.5; // resistance line fixed
      lower = lastPrice - startRange * 0.5 * (1 - progress); // bottom rising
      break;

    case "desc": // descending triangle (flat bottom, falling top)
      upper = lastPrice + startRange * 0.5 * (1 - progress); // top falling
      lower = lastPrice - startRange * 0.5; // support fixed
      break;
  }

  // Midline moves inside the range
  const midline = (upper + lower) / 2;
  const newClose = midline + (Math.random() - 0.5) * (upper - lower);

  // Candle construction
  const open = lastPrice;
  const bodyHigh = Math.max(open, newClose);
  const bodyLow = Math.min(open, newClose);

  const wickTop = bodyHigh + Math.random() * currentRange * 0.2;
  const wickBottom = bodyLow - Math.random() * currentRange * 0.2;

  const newCandle = {
    time: ++time,
    open,
    high: Math.max(open, newClose, wickTop),
    low: Math.min(open, newClose, wickBottom),
    close: newClose
  };

  data.push(newCandle);
  if (data.length > 3000) data.shift();
  candleSeries.setData(data);
  updatePriceDisplay();
}
