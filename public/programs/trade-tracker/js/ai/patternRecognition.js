/**
 * patternRecognition.js
 * Detect chart patterns using heuristic/statistical methods on OHLCV data.
 * Pure JavaScript — no external dependencies required.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Find local peaks (highs) and troughs (lows) using a lookback window.
 * @param {number[]} series - price series
 * @param {number} window - lookback/lookahead bars
 * @returns {{ peaks: {idx, price}[], troughs: {idx, price}[] }}
 */
function findPivots(series, window = 5) {
  const peaks = [];
  const troughs = [];
  for (let i = window; i < series.length - window; i++) {
    let isPeak = true;
    let isTrough = true;
    for (let j = 1; j <= window; j++) {
      if (series[i] <= series[i - j] || series[i] <= series[i + j]) isPeak = false;
      if (series[i] >= series[i - j] || series[i] >= series[i + j]) isTrough = false;
    }
    if (isPeak) peaks.push({ idx: i, price: series[i] });
    if (isTrough) troughs.push({ idx: i, price: series[i] });
  }
  return { peaks, troughs };
}

/**
 * Linear regression on a numeric series.
 * Returns { slope, intercept, r2 }.
 */
function linearRegression(series) {
  const n = series.length;
  if (n < 2) return { slope: 0, intercept: series[0] || 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += series[i];
    sumXY += i * series[i];
    sumX2 += i * i;
    sumY2 += series[i] * series[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const ssRes = series.reduce((s, y, i) => {
    const yHat = intercept + slope * i;
    return s + (y - yHat) ** 2;
  }, 0);
  const meanY = sumY / n;
  const ssTot = series.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2 };
}

/**
 * Percentage distance between two values.
 */
function pctDiff(a, b) {
  return Math.abs(a - b) / ((Math.abs(a) + Math.abs(b)) / 2 || 1);
}

// ---------------------------------------------------------------------------
// Classic Pattern Detectors
// ---------------------------------------------------------------------------

function detectHeadAndShoulders(peaks, troughs, closes) {
  const results = [];
  for (let i = 0; i < peaks.length - 2; i++) {
    const [lp, mp, rp] = [peaks[i], peaks[i + 1], peaks[i + 2]];
    // Middle peak must be the highest
    if (mp.price <= lp.price || mp.price <= rp.price) continue;
    // Shoulders should be roughly equal
    const shoulderDiff = pctDiff(lp.price, rp.price);
    if (shoulderDiff > 0.05) continue;
    // Find troughs between shoulders
    const leftTroughs = troughs.filter(t => t.idx > lp.idx && t.idx < mp.idx);
    const rightTroughs = troughs.filter(t => t.idx > mp.idx && t.idx < rp.idx);
    if (leftTroughs.length === 0 || rightTroughs.length === 0) continue;
    const lt = leftTroughs[leftTroughs.length - 1];
    const rt = rightTroughs[0];
    const neckline = (lt.price + rt.price) / 2;
    const patternHeight = mp.price - neckline;
    const priceTarget = neckline - patternHeight;
    const conf = Math.max(0, 1 - shoulderDiff * 10 - pctDiff(lt.price, rt.price) * 5);
    results.push({
      pattern: 'head_and_shoulders',
      confidence: Math.min(1, Math.max(0.1, conf)),
      startIdx: lp.idx,
      endIdx: rp.idx,
      direction: 'bearish',
      priceTarget
    });
  }
  return results;
}

function detectInverseHeadAndShoulders(peaks, troughs, closes) {
  const results = [];
  for (let i = 0; i < troughs.length - 2; i++) {
    const [lt, mt, rt] = [troughs[i], troughs[i + 1], troughs[i + 2]];
    if (mt.price >= lt.price || mt.price >= rt.price) continue;
    const shoulderDiff = pctDiff(lt.price, rt.price);
    if (shoulderDiff > 0.05) continue;
    const leftPeaks = peaks.filter(p => p.idx > lt.idx && p.idx < mt.idx);
    const rightPeaks = peaks.filter(p => p.idx > mt.idx && p.idx < rt.idx);
    if (leftPeaks.length === 0 || rightPeaks.length === 0) continue;
    const lp = leftPeaks[leftPeaks.length - 1];
    const rp = rightPeaks[0];
    const neckline = (lp.price + rp.price) / 2;
    const patternHeight = neckline - mt.price;
    const priceTarget = neckline + patternHeight;
    const conf = Math.max(0, 1 - shoulderDiff * 10 - pctDiff(lp.price, rp.price) * 5);
    results.push({
      pattern: 'inverse_head_and_shoulders',
      confidence: Math.min(1, Math.max(0.1, conf)),
      startIdx: lt.idx,
      endIdx: rt.idx,
      direction: 'bullish',
      priceTarget
    });
  }
  return results;
}

function detectDoubleTop(peaks, troughs, closes) {
  const results = [];
  for (let i = 0; i < peaks.length - 1; i++) {
    const [p1, p2] = [peaks[i], peaks[i + 1]];
    const diff = pctDiff(p1.price, p2.price);
    if (diff > 0.03) continue;
    const betweenTroughs = troughs.filter(t => t.idx > p1.idx && t.idx < p2.idx);
    if (betweenTroughs.length === 0) continue;
    const valley = betweenTroughs.reduce((min, t) => t.price < min.price ? t : min, betweenTroughs[0]);
    const avgTop = (p1.price + p2.price) / 2;
    const patternHeight = avgTop - valley.price;
    const priceTarget = valley.price - patternHeight;
    const conf = Math.max(0.1, 1 - diff * 20);
    results.push({
      pattern: 'double_top',
      confidence: Math.min(1, conf),
      startIdx: p1.idx,
      endIdx: p2.idx,
      direction: 'bearish',
      priceTarget
    });
  }
  return results;
}

function detectDoubleBottom(peaks, troughs, closes) {
  const results = [];
  for (let i = 0; i < troughs.length - 1; i++) {
    const [t1, t2] = [troughs[i], troughs[i + 1]];
    const diff = pctDiff(t1.price, t2.price);
    if (diff > 0.03) continue;
    const betweenPeaks = peaks.filter(p => p.idx > t1.idx && p.idx < t2.idx);
    if (betweenPeaks.length === 0) continue;
    const peak = betweenPeaks.reduce((max, p) => p.price > max.price ? p : max, betweenPeaks[0]);
    const avgBottom = (t1.price + t2.price) / 2;
    const patternHeight = peak.price - avgBottom;
    const priceTarget = peak.price + patternHeight;
    const conf = Math.max(0.1, 1 - diff * 20);
    results.push({
      pattern: 'double_bottom',
      confidence: Math.min(1, conf),
      startIdx: t1.idx,
      endIdx: t2.idx,
      direction: 'bullish',
      priceTarget
    });
  }
  return results;
}

function detectTriangles(peaks, troughs, closes) {
  const results = [];
  if (peaks.length < 2 || troughs.length < 2) return results;

  // Use the most recent 2+ peaks and 2+ troughs
  const recentPeaks = peaks.slice(-4);
  const recentTroughs = troughs.slice(-4);
  if (recentPeaks.length < 2 || recentTroughs.length < 2) return results;

  const peakPrices = recentPeaks.map(p => p.price);
  const troughPrices = recentTroughs.map(t => t.price);

  const peakReg = linearRegression(peakPrices);
  const troughReg = linearRegression(troughPrices);

  const startIdx = Math.min(recentPeaks[0].idx, recentTroughs[0].idx);
  const endIdx = Math.max(
    recentPeaks[recentPeaks.length - 1].idx,
    recentTroughs[recentTroughs.length - 1].idx
  );
  const lastClose = closes[closes.length - 1];

  const flatThreshold = 0.002;
  const peakSlope = peakReg.slope / (peakPrices[0] || 1);
  const troughSlope = troughReg.slope / (troughPrices[0] || 1);

  // Ascending triangle: flat resistance, rising support
  if (Math.abs(peakSlope) < flatThreshold && troughSlope > flatThreshold) {
    const resistance = peakPrices.reduce((a, b) => a + b, 0) / peakPrices.length;
    const height = resistance - troughPrices[troughPrices.length - 1];
    results.push({
      pattern: 'ascending_triangle',
      confidence: Math.min(1, Math.max(0.1, peakReg.r2 * 0.5 + troughReg.r2 * 0.5)),
      startIdx, endIdx,
      direction: 'bullish',
      priceTarget: resistance + height
    });
  }

  // Descending triangle: falling resistance, flat support
  if (peakSlope < -flatThreshold && Math.abs(troughSlope) < flatThreshold) {
    const support = troughPrices.reduce((a, b) => a + b, 0) / troughPrices.length;
    const height = peakPrices[0] - support;
    results.push({
      pattern: 'descending_triangle',
      confidence: Math.min(1, Math.max(0.1, peakReg.r2 * 0.5 + troughReg.r2 * 0.5)),
      startIdx, endIdx,
      direction: 'bearish',
      priceTarget: support - height
    });
  }

  // Symmetrical triangle: converging lines (one falling, one rising)
  if (peakSlope < -flatThreshold && troughSlope > flatThreshold) {
    const midPrice = lastClose;
    const height = peakPrices[0] - troughPrices[0];
    // Direction based on prior trend
    const priorTrend = closes[startIdx] < closes[0] ? 'bullish' : 'bearish';
    const target = priorTrend === 'bullish' ? midPrice + height * 0.5 : midPrice - height * 0.5;
    results.push({
      pattern: 'symmetrical_triangle',
      confidence: Math.min(1, Math.max(0.1, (peakReg.r2 + troughReg.r2) * 0.4)),
      startIdx, endIdx,
      direction: priorTrend,
      priceTarget: target
    });
  }

  return results;
}

function detectWedges(peaks, troughs, closes) {
  const results = [];
  if (peaks.length < 2 || troughs.length < 2) return results;

  const recentPeaks = peaks.slice(-4);
  const recentTroughs = troughs.slice(-4);
  if (recentPeaks.length < 2 || recentTroughs.length < 2) return results;

  const peakPrices = recentPeaks.map(p => p.price);
  const troughPrices = recentTroughs.map(t => t.price);

  const peakReg = linearRegression(peakPrices);
  const troughReg = linearRegression(troughPrices);

  const startIdx = Math.min(recentPeaks[0].idx, recentTroughs[0].idx);
  const endIdx = Math.max(
    recentPeaks[recentPeaks.length - 1].idx,
    recentTroughs[recentTroughs.length - 1].idx
  );

  const threshold = 0.001;

  // Rising wedge: both slopes positive, resistance slope < support slope (converging)
  if (peakReg.slope > threshold && troughReg.slope > threshold) {
    // Converging = gap between lines is shrinking
    const startGap = peakPrices[0] - troughPrices[0];
    const endGap = peakPrices[peakPrices.length - 1] - troughPrices[troughPrices.length - 1];
    if (endGap < startGap && startGap > 0) {
      const height = startGap;
      results.push({
        pattern: 'rising_wedge',
        confidence: Math.min(1, Math.max(0.1, 0.5 + (1 - endGap / startGap) * 0.3)),
        startIdx, endIdx,
        direction: 'bearish',
        priceTarget: troughPrices[troughPrices.length - 1] - height
      });
    }
  }

  // Falling wedge: both slopes negative, converging
  if (peakReg.slope < -threshold && troughReg.slope < -threshold) {
    const startGap = peakPrices[0] - troughPrices[0];
    const endGap = peakPrices[peakPrices.length - 1] - troughPrices[troughPrices.length - 1];
    if (endGap < startGap && startGap > 0) {
      const height = startGap;
      results.push({
        pattern: 'falling_wedge',
        confidence: Math.min(1, Math.max(0.1, 0.5 + (1 - endGap / startGap) * 0.3)),
        startIdx, endIdx,
        direction: 'bullish',
        priceTarget: peakPrices[peakPrices.length - 1] + height
      });
    }
  }

  return results;
}

function detectFlags(data) {
  const results = [];
  const closes = data.map(d => d.close);
  if (closes.length < 20) return results;

  // Look for a sharp move followed by a small consolidation channel
  const poleLen = 10;
  const flagLen = 8;
  const minLen = poleLen + flagLen;
  if (closes.length < minLen) return results;

  // Check the most recent potential flag
  for (let offset = 0; offset <= Math.min(10, closes.length - minLen); offset++) {
    const end = closes.length - 1 - offset;
    const flagStart = end - flagLen;
    const poleStart = flagStart - poleLen;
    if (poleStart < 0) continue;

    const poleMove = closes[flagStart] - closes[poleStart];
    const poleRange = Math.abs(poleMove);
    const avgPrice = (closes[flagStart] + closes[poleStart]) / 2;
    const polePct = poleRange / avgPrice;

    // Pole must be a significant move (> 3%)
    if (polePct < 0.03) continue;

    // Flag channel: small range relative to pole
    const flagSlice = closes.slice(flagStart, end + 1);
    const flagHigh = Math.max(...flagSlice);
    const flagLow = Math.min(...flagSlice);
    const flagRange = flagHigh - flagLow;

    if (flagRange > poleRange * 0.5) continue; // Flag should be < 50% of pole

    const flagReg = linearRegression(flagSlice);

    if (poleMove > 0 && flagReg.slope < 0) {
      // Bullish flag: sharp rise, then descending channel
      results.push({
        pattern: 'bullish_flag',
        confidence: Math.min(1, Math.max(0.2, 0.6 + polePct * 2 - (flagRange / poleRange) * 0.5)),
        startIdx: poleStart,
        endIdx: end,
        direction: 'bullish',
        priceTarget: closes[end] + poleRange
      });
    } else if (poleMove < 0 && flagReg.slope > 0) {
      // Bearish flag: sharp drop, then ascending channel
      results.push({
        pattern: 'bearish_flag',
        confidence: Math.min(1, Math.max(0.2, 0.6 + polePct * 2 - (flagRange / poleRange) * 0.5)),
        startIdx: poleStart,
        endIdx: end,
        direction: 'bearish',
        priceTarget: closes[end] - poleRange
      });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Candlestick Pattern Detectors
// ---------------------------------------------------------------------------

function candleBody(bar) {
  return Math.abs(bar.close - bar.open);
}

function candleRange(bar) {
  return bar.high - bar.low || 0.0001; // avoid division by zero
}

function upperShadow(bar) {
  return bar.high - Math.max(bar.open, bar.close);
}

function lowerShadow(bar) {
  return Math.min(bar.open, bar.close) - bar.low;
}

function isBullish(bar) {
  return bar.close >= bar.open;
}

function detectCandlestickPatterns(data) {
  const results = [];
  if (!data || data.length < 3) return results;

  const n = data.length;

  // Check last bar for single-bar patterns
  const last = data[n - 1];
  const body = candleBody(last);
  const range = candleRange(last);
  const ls = lowerShadow(last);
  const us = upperShadow(last);

  // Doji: body < 10% of range
  if (body / range < 0.10 && range > 0) {
    results.push({
      pattern: 'doji',
      confidence: Math.min(1, 1 - (body / range) * 10),
      startIdx: n - 1,
      endIdx: n - 1,
      direction: 'neutral',
      priceTarget: last.close
    });
  }

  // Hammer: small body at top, long lower shadow (> 2x body)
  if (body > 0 && ls > body * 2 && us < body * 0.5) {
    results.push({
      pattern: 'hammer',
      confidence: Math.min(1, Math.max(0.3, Math.min(ls / body, 5) / 5)),
      startIdx: n - 1,
      endIdx: n - 1,
      direction: 'bullish',
      priceTarget: last.close + range * 0.5
    });
  }

  // Shooting star: small body at bottom, long upper shadow
  if (body > 0 && us > body * 2 && ls < body * 0.5) {
    results.push({
      pattern: 'shooting_star',
      confidence: Math.min(1, Math.max(0.3, Math.min(us / body, 5) / 5)),
      startIdx: n - 1,
      endIdx: n - 1,
      direction: 'bearish',
      priceTarget: last.close - range * 0.5
    });
  }

  // Two-bar patterns (need at least 2 bars)
  if (n >= 2) {
    const prev = data[n - 2];
    const prevBody = candleBody(prev);
    const lastBody = candleBody(last);

    // Engulfing bullish: red candle then larger green candle
    if (!isBullish(prev) && isBullish(last) &&
        last.open <= prev.close && last.close >= prev.open &&
        lastBody > prevBody) {
      results.push({
        pattern: 'engulfing_bullish',
        confidence: Math.min(1, Math.max(0.3, lastBody / (prevBody || 0.01) * 0.3)),
        startIdx: n - 2,
        endIdx: n - 1,
        direction: 'bullish',
        priceTarget: last.close + lastBody
      });
    }

    // Engulfing bearish: green candle then larger red candle
    if (isBullish(prev) && !isBullish(last) &&
        last.open >= prev.close && last.close <= prev.open &&
        lastBody > prevBody) {
      results.push({
        pattern: 'engulfing_bearish',
        confidence: Math.min(1, Math.max(0.3, lastBody / (prevBody || 0.01) * 0.3)),
        startIdx: n - 2,
        endIdx: n - 1,
        direction: 'bearish',
        priceTarget: last.close - lastBody
      });
    }
  }

  // Three-bar patterns (need at least 3 bars)
  if (n >= 3) {
    const bar1 = data[n - 3];
    const bar2 = data[n - 2];
    const bar3 = data[n - 1];
    const body1 = candleBody(bar1);
    const body2 = candleBody(bar2);
    const body3 = candleBody(bar3);
    const avgBody = (body1 + body3) / 2;

    // Morning star: red, small body, green
    if (!isBullish(bar1) && body1 > 0 &&
        body2 < avgBody * 0.4 &&
        isBullish(bar3) && body3 > 0 &&
        bar3.close > (bar1.open + bar1.close) / 2) {
      results.push({
        pattern: 'morning_star',
        confidence: Math.min(1, Math.max(0.3, 0.5 + (1 - body2 / (avgBody || 0.01)) * 0.3)),
        startIdx: n - 3,
        endIdx: n - 1,
        direction: 'bullish',
        priceTarget: bar3.close + body3
      });
    }

    // Evening star: green, small body, red
    if (isBullish(bar1) && body1 > 0 &&
        body2 < avgBody * 0.4 &&
        !isBullish(bar3) && body3 > 0 &&
        bar3.close < (bar1.open + bar1.close) / 2) {
      results.push({
        pattern: 'evening_star',
        confidence: Math.min(1, Math.max(0.3, 0.5 + (1 - body2 / (avgBody || 0.01)) * 0.3)),
        startIdx: n - 3,
        endIdx: n - 1,
        direction: 'bearish',
        priceTarget: bar3.close - body3
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Detect chart patterns on OHLCV data.
 *
 * @param {Array<{open, high, low, close, volume, timestamp?}>} data
 * @returns {Array<{pattern, confidence, startIdx, endIdx, direction, priceTarget}>}
 */
export function detectPatterns(data) {
  if (!data || data.length < 10) return [];

  const closes = data.map(d => d.close);
  const highs = data.map(d => d.high);
  const lows = data.map(d => d.low);

  // Find pivots on highs/lows for classic patterns
  const window = Math.min(5, Math.floor(data.length / 6));
  const { peaks, troughs } = findPivots(highs, Math.max(2, window));
  const { peaks: peaksLow, troughs: troughsLow } = findPivots(lows, Math.max(2, window));

  // Merge peak/trough sets — use highs for peaks, lows for troughs
  const allPeaks = peaks;
  const allTroughs = (() => {
    const lowTroughs = findPivots(lows, Math.max(2, window)).troughs;
    // Re-map prices from lows array
    return lowTroughs.map(t => ({ idx: t.idx, price: lows[t.idx] }));
  })();

  // Collect all detected patterns
  let patterns = [];

  // Classic patterns
  patterns = patterns.concat(detectHeadAndShoulders(allPeaks, allTroughs, closes));
  patterns = patterns.concat(detectInverseHeadAndShoulders(allPeaks, allTroughs, closes));
  patterns = patterns.concat(detectDoubleTop(allPeaks, allTroughs, closes));
  patterns = patterns.concat(detectDoubleBottom(allPeaks, allTroughs, closes));
  patterns = patterns.concat(detectTriangles(allPeaks, allTroughs, closes));
  patterns = patterns.concat(detectWedges(allPeaks, allTroughs, closes));
  patterns = patterns.concat(detectFlags(data));

  // Candlestick patterns
  patterns = patterns.concat(detectCandlestickPatterns(data));

  // Sort by confidence descending
  patterns.sort((a, b) => b.confidence - a.confidence);

  // Clamp all confidences to [0, 1]
  patterns.forEach(p => {
    p.confidence = Math.round(Math.min(1, Math.max(0, p.confidence)) * 1000) / 1000;
  });

  return patterns;
}
