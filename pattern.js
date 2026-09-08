// Synthetic chart-pattern targets, anchored to the start of this pattern.
// The tick engine alone creates OHLC and advances the 15-second candle clock.
function patternTarget(name) {
  const p=currentPattern;
  if (!p) return data[data.length-1].close;
  if (!p.anchor) {
    p.anchor=currentTickPrice ?? data[data.length-1].close;
    p.amplitude=p.anchor*(0.035+Math.random()*0.02);
    p.sign=Math.random()<0.5?-1:1;
  }
  const shapes={
    doubleTop:[0,1,0.3,0.97,0.25,-0.45],
    doubleBottom:[0,-1,-0.3,-0.97,-0.25,0.45],
    headShoulders:[0,0.65,0.15,1,0.15,0.65,-0.5],
    triangle:[0,1,-0.8,0.65,-0.45,0.3,-0.15,1.1],
    flag:[0,1,0.65,0.85,0.5,0.72,1.45],
    wedge:[0,0.7,0.25,1,0.65,1.2,1,-0.1]
  };
  const shape=shapes[name];
  const progress=(p.totalSteps-p.steps+1)/p.totalSteps;
  const position=Math.min(shape.length-1,progress*(shape.length-1));
  const i=Math.min(shape.length-2,Math.floor(position));
  const offset=shape[i]+(shape[i+1]-shape[i])*(position-i);
  const sign=['triangle','flag','wedge'].includes(name)?p.sign:1;
  return Math.max(0.00001,p.anchor+sign*p.amplitude*offset+(Math.random()-.5)*p.amplitude*.045);
}
function generateDoubleTopCandle(){return patternTarget('doubleTop');}
function generateDoubleBottomCandle(){return patternTarget('doubleBottom');}
function generateHeadAndShouldersCandle(){return patternTarget('headShoulders');}
function generateTriangleCandle(){return patternTarget('triangle');}
function generateFlagCandle(){return patternTarget('flag');}
function generateWedgeCandle(){return patternTarget('wedge');}
