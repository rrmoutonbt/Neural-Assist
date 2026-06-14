/**
 * pricePrediction.js
 * Predict future prices using statistical methods: linear regression,
 * exponential smoothing, volatility estimation, and Monte Carlo simulation.
 * Pure JavaScript — no external dependencies required.
 */

// ---------------------------------------------------------------------------
// Statistical helpers
// ---------------------------------------------------------------------------

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

/**
 * Simple linear regression: y = intercept + slope * x
 */
function linearRegression(series) {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: series[0] || 0, r2: 0 };
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += series[i]; sxy += i * series[i]; sx2 += i * i;
  }
  const d = n * sx2 - sx * sx;
  if (d === 0) return { slope: 0, intercept: sy / n, r2: 0 };
  const slope = (n * sxy - sx * sy) / d;
  const intercept = (sy - slope * sx) / n;
  const mY = sy / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (series[i] - (intercept + slope * i)) ** 2;
    ssTot += (series[i] - mY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

/**
 * Simple Moving Average over the last `period` values.
 */
function sma(series, period) {
  if (series.length < period) return mean(series);
  return mean(series.slice(-period));
}

/**
 * Exponential Moving Average.
 */
function ema(series, period) {
  if (series.length === 0) return 0;
  const k = 2 / (period + 1);
  let val = series[0];
  for (let i = 1; i < series.length; i++) {
    val = series[i] * k + val * (1 - k);
  }
  return val;
}

/**
 * RSI (Relative Strength Index).
 */
function computeRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

/**
 * Average True Range.
 */
function computeATR(data, period = 14) {
  if (data.length < 2) return 0;
  const trueRanges = [];
  for (let i = 1; i < data.length; i++) {
    const tr = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
    trueRanges.push(tr);
  }
  return mean(trueRanges.slice(-period));
}

/**
 * Bollinger Band width (as fraction of middle band).
 */
function bbWidth(closes, period = 20, mult = 2) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mid = mean(slice);
  const sd = stdDev(slice);
  return mid === 0 ? 0 : (mult * sd * 2) / mid;
}

/**
 * Holt-Winters double exponential smoothing (additive trend, no seasonality).
 */
function holtSmooth(series, alpha = 0.3, beta = 0.1) {
  if (series.length === 0) return { level: 0, trend: 0 };
  let level = series[0];
  let trend = series.length > 1 ? series[1] - series[0] : 0;
  for (let i = 1; i < series.length; i++) {
    const prevLevel = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  return { level, trend };
}

/**
 * Seeded pseudo-random number generator (Mulberry32).
 * Returns a function that produces values in [0, 1).
 */
function prng(seed = 42) {
  let s = seed | 0;
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Box-Muller transform: convert uniform [0,1) to normal distribution.
 */
function normalRandom(rng) {
  const u1 = rng();
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1 || 1e-10)) * Math.cos(2 * Math.PI * u2);
}

// ---------------------------------------------------------------------------
// Price prediction
// ---------------------------------------------------------------------------

/**
 * Predict future prices using ensemble of statistical methods.
 *
 * @param {Array<{open, high, low, close, volume, timestamp?}>} data - OHLCV data
 * @param {number} steps - number of future bars to predict
 * @returns {{
 *   predictions: Array<{step, price, confidence}>,
 *   confidenceBands: {upper68: number[], lower68: number[], upper95: number[], lower95: number[]}
 * }}
 */
export function predictPrice(data, steps = 10) {
  if (!data || data.length < 5) {
    const empty = Array.from({ length: steps }, (_, i) => ({
      step: i + 1, price: 0, confidence: 0
    }));
    return {
      predictions: empty,
      confidenceBands: {
        upper68: new Array(steps).fill(0),
        lower68: new Array(steps).fill(0),
        upper95: new Array(steps).fill(0),
        lower95: new Array(steps).fill(0)
      }
    };
  }

  const closes = data.map(d => d.close);
  const n = closes.length;
  const lastPrice = closes[n - 1];

  // 1. Linear regression trend
  const lookback = Math.min(50, n);
  const recentCloses = closes.slice(-lookback);
  const reg = linearRegression(recentCloses);
  const regSlope = reg.slope;

  // 2. Holt-Winters smoothing
  const hw = holtSmooth(recentCloses, 0.3, 0.1);

  // 3. Volatility from log returns
  const logReturns = [];
  for (let i = 1; i < n; i++) {
    if (closes[i - 1] > 0) {
      logReturns.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  const vol = stdDev(logReturns) || 0.01;
  const drift = mean(logReturns);

  // 4. ATR-based volatility
  const atr = computeATR(data);

  // 5. Monte Carlo simulation (100 paths)
  const numPaths = 100;
  const rng = prng(12345);
  const pathEnds = Array.from({ length: steps }, () => []);

  for (let p = 0; p < numPaths; p++) {
    let price = lastPrice;
    for (let s = 0; s < steps; s++) {
      const shock = normalRandom(rng);
      price = price * Math.exp(drift + vol * shock);
      if (price < 0) price = 0.01;
      pathEnds[s].push(price);
    }
  }

  // Sort each step's outcomes for percentile extraction
  pathEnds.forEach(arr => arr.sort((a, b) => a - b));

  function percentile(sorted, p) {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * sorted.length)));
    return sorted[idx];
  }

  // 6. Build predictions: blend regression + Holt-Winters + MC median
  const predictions = [];
  const upper68 = [], lower68 = [], upper95 = [], lower95 = [];

  for (let s = 0; s < steps; s++) {
    const regPrice = lastPrice + regSlope * (s + 1);
    const hwPrice = hw.level + hw.trend * (s + 1);
    const mcMedian = percentile(pathEnds[s], 0.5);

    // Weighted blend
    const blended = regPrice * 0.25 + hwPrice * 0.35 + mcMedian * 0.40;

    // Confidence decays with distance
    const conf = Math.max(0.05, 1 - (s + 1) * 0.08);

    predictions.push({
      step: s + 1,
      price: Math.round(blended * 100) / 100,
      confidence: Math.round(conf * 1000) / 1000
    });

    upper68.push(Math.round(percentile(pathEnds[s], 0.84) * 100) / 100);
    lower68.push(Math.round(percentile(pathEnds[s], 0.16) * 100) / 100);
    upper95.push(Math.round(percentile(pathEnds[s], 0.975) * 100) / 100);
    lower95.push(Math.round(percentile(pathEnds[s], 0.025) * 100) / 100);
  }

  return {
    predictions,
    confidenceBands: { upper68, lower68, upper95, lower95 }
  };
}

// ---------------------------------------------------------------------------
// Market commentary
// ---------------------------------------------------------------------------

/**
 * Generate natural-language market commentary.
 *
 * @param {Array<{open, high, low, close, volume, timestamp?}>} data
 * @param {Array<{pattern, confidence, direction}>} patterns
 * @param {{predictions: Array<{price, confidence}>}} prediction
 * @returns {string}
 */
export function getMarketCommentary(data, patterns, prediction) {
  if (!data || data.length < 20) return 'Insufficient data for analysis.';

  const closes = data.map(d => d.close);
  const lastPrice = closes[closes.length - 1];

  // Trend via SMA20 vs SMA50
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, Math.min(50, closes.length));
  let trend;
  if (sma20 > sma50 * 1.005) trend = 'bullish';
  else if (sma20 < sma50 * 0.995) trend = 'bearish';
  else trend = 'neutral';

  // Momentum via RSI
  const rsi = computeRSI(closes);
  let momentum;
  if (rsi > 70) momentum = 'overbought';
  else if (rsi < 30) momentum = 'oversold';
  else if (rsi > 55) momentum = 'positive';
  else if (rsi < 45) momentum = 'negative';
  else momentum = 'neutral';

  // Volatility via BB width
  const bbw = bbWidth(closes);
  let volState;
  if (bbw > 0.08) volState = 'elevated';
  else if (bbw < 0.03) volState = 'compressed';
  else volState = 'moderate';

  // Prediction direction
  const predDir = prediction && prediction.predictions && prediction.predictions.length > 0
    ? (prediction.predictions[prediction.predictions.length - 1].price > lastPrice ? 'upward' : 'downward')
    : 'flat';

  // Build sentences
  const sentences = [];

  // Trend sentence
  const trendWords = {
    bullish: `The market is exhibiting a bullish trend with the 20-period moving average trading above the 50-period average at $${lastPrice.toFixed(2)}.`,
    bearish: `Price action is bearish with the short-term moving average crossing below the longer-term average, currently at $${lastPrice.toFixed(2)}.`,
    neutral: `The market is range-bound with converging moving averages around $${lastPrice.toFixed(2)}, suggesting indecision among participants.`
  };
  sentences.push(trendWords[trend]);

  // Momentum sentence
  const momentumWords = {
    overbought: `RSI at ${rsi.toFixed(0)} indicates overbought conditions, suggesting a potential pullback.`,
    oversold: `RSI at ${rsi.toFixed(0)} indicates oversold conditions, presenting a possible reversal opportunity.`,
    positive: `Momentum remains constructive with RSI at ${rsi.toFixed(0)}.`,
    negative: `Momentum is weakening with RSI reading ${rsi.toFixed(0)}.`,
    neutral: `Momentum indicators are neutral with RSI at ${rsi.toFixed(0)}.`
  };
  sentences.push(momentumWords[momentum]);

  // Volatility + patterns sentence
  const volWords = {
    elevated: 'Volatility is elevated',
    compressed: 'Volatility is compressed, which often precedes a significant move',
    moderate: 'Volatility remains within normal ranges'
  };
  let patternNote = '';
  if (patterns && patterns.length > 0) {
    const top = patterns[0];
    const dirLabel = top.direction === 'bullish' ? 'bullish' : top.direction === 'bearish' ? 'bearish' : 'neutral';
    patternNote = `, and a ${top.pattern.replace(/_/g, ' ')} pattern (${dirLabel}, ${(top.confidence * 100).toFixed(0)}% confidence) has been identified`;
  }
  sentences.push(`${volWords[volState]}${patternNote}.`);

  // Prediction sentence
  if (predDir === 'upward') {
    sentences.push(`Statistical models project a modest ${predDir} trajectory over the near term, though traders should monitor key support levels for confirmation.`);
  } else if (predDir === 'downward') {
    sentences.push(`Models suggest ${predDir} pressure may continue in the short term; risk management and stop-loss discipline are advised.`);
  } else {
    sentences.push('Predictive models indicate limited directional conviction, favoring a wait-and-see approach.');
  }

  return sentences.join(' ');
}
