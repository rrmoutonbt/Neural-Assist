/**
 * tradingAgent.js
 * Rule-based trading agent with multi-factor scoring and NLP copilot.
 * Pure JavaScript — no external dependencies required.
 */

import { detectPatterns } from './patternRecognition.js';
import { predictPrice, getMarketCommentary } from './pricePrediction.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYMBOLS = [
  'AAPL', 'TSLA', 'NVDA', 'SPY', 'MSFT', 'AMZN', 'GOOGL', 'META',
  'BTC/USD', 'ETH/USD', 'XRP/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD'
];

// ---------------------------------------------------------------------------
// Indicator helpers
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

function smaArray(series, period) {
  const out = [];
  for (let i = 0; i < series.length; i++) {
    if (i < period - 1) { out.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += series[j];
    out.push(sum / period);
  }
  return out;
}

function emaArray(series, period) {
  const out = [];
  const k = 2 / (period + 1);
  for (let i = 0; i < series.length; i++) {
    if (i === 0) { out.push(series[0]); continue; }
    out.push(series[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function computeRSI(closes, period = 14) {
  const rsiArr = new Array(closes.length).fill(50);
  if (closes.length < period + 1) return rsiArr;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  rsiArr[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    rsiArr[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return rsiArr;
}

function computeMACD(closes, fast = 12, slow = 26, signal = 9) {
  const emaFast = emaArray(closes, fast);
  const emaSlow = emaArray(closes, slow);
  const macdLine = closes.map((_, i) => (emaFast[i] ?? 0) - (emaSlow[i] ?? 0));
  const signalLine = emaArray(macdLine, signal);
  const histogram = macdLine.map((v, i) => v - (signalLine[i] ?? 0));
  return { macdLine, signalLine, histogram };
}

function computeBB(closes, period = 20, mult = 2) {
  const mid = smaArray(closes, period);
  const upper = [], lower = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] === null) { upper.push(null); lower.push(null); continue; }
    const slice = closes.slice(Math.max(0, i - period + 1), i + 1);
    const sd = stdDev(slice);
    upper.push(mid[i] + mult * sd);
    lower.push(mid[i] - mult * sd);
  }
  return { upper, mid, lower };
}

// ---------------------------------------------------------------------------
// TradingAgent
// ---------------------------------------------------------------------------

export class TradingAgent {
  /**
   * @param {object} config
   * @param {number} [config.rsiPeriod=14]
   * @param {number} [config.smaPeriod=20]
   * @param {number} [config.smaLongPeriod=50]
   * @param {number} [config.buyThreshold=2]
   * @param {number} [config.sellThreshold=-2]
   * @param {number} [config.initialCapital=100000]
   */
  constructor(config = {}) {
    this.rsiPeriod = config.rsiPeriod ?? 14;
    this.smaPeriod = config.smaPeriod ?? 20;
    this.smaLongPeriod = config.smaLongPeriod ?? 50;
    this.buyThreshold = config.buyThreshold ?? 2;
    this.sellThreshold = config.sellThreshold ?? -2;
    this.initialCapital = config.initialCapital ?? 100000;
    this._lastSignals = [];
  }

  /**
   * Analyze the latest bar and return a recommendation.
   * @param {Array<{open, high, low, close, volume}>} data - OHLCV
   * @returns {{ action: string, confidence: number, reasoning: string }}
   */
  analyze(data) {
    if (!data || data.length < this.smaLongPeriod) {
      return { action: 'HOLD', confidence: 0, reasoning: 'Insufficient data for analysis.' };
    }

    const closes = data.map(d => d.close);
    const idx = closes.length - 1;

    // Compute indicators
    const rsi = computeRSI(closes, this.rsiPeriod);
    const macd = computeMACD(closes);
    const bb = computeBB(closes, this.smaPeriod);
    const sma20 = smaArray(closes, this.smaPeriod);
    const sma50 = smaArray(closes, this.smaLongPeriod);

    const score = this._score(closes, rsi, macd, bb, sma20, sma50, idx);

    let action;
    if (score >= this.buyThreshold) action = 'BUY';
    else if (score <= this.sellThreshold) action = 'SELL';
    else action = 'HOLD';

    const maxScore = 5;
    const confidence = Math.min(1, Math.abs(score) / maxScore);

    const reasoning = this._buildReasoning(closes, rsi, macd, bb, sma20, sma50, idx, score);

    return { action, confidence: Math.round(confidence * 1000) / 1000, reasoning };
  }

  /**
   * Walk all bars and generate entry/exit signals.
   * @param {Array<{open, high, low, close, volume}>} data
   * @returns {Array<{barIdx, action, price, confidence}>}
   */
  getSignals(data) {
    if (!data || data.length < this.smaLongPeriod) return [];

    const closes = data.map(d => d.close);
    const rsi = computeRSI(closes, this.rsiPeriod);
    const macd = computeMACD(closes);
    const bb = computeBB(closes, this.smaPeriod);
    const sma20 = smaArray(closes, this.smaPeriod);
    const sma50 = smaArray(closes, this.smaLongPeriod);

    const signals = [];
    let position = 'FLAT'; // FLAT, LONG, SHORT

    for (let i = this.smaLongPeriod; i < closes.length; i++) {
      const score = this._score(closes, rsi, macd, bb, sma20, sma50, i);
      const maxScore = 5;
      const conf = Math.min(1, Math.abs(score) / maxScore);

      if (score >= this.buyThreshold && position !== 'LONG') {
        if (position === 'SHORT') {
          signals.push({ barIdx: i, action: 'COVER', price: closes[i], confidence: conf });
        }
        signals.push({ barIdx: i, action: 'BUY', price: closes[i], confidence: conf });
        position = 'LONG';
      } else if (score <= this.sellThreshold && position !== 'SHORT') {
        if (position === 'LONG') {
          signals.push({ barIdx: i, action: 'SELL', price: closes[i], confidence: conf });
        }
        signals.push({ barIdx: i, action: 'SHORT', price: closes[i], confidence: conf });
        position = 'SHORT';
      }
    }

    // Close any open position at the end
    if (position === 'LONG') {
      signals.push({ barIdx: closes.length - 1, action: 'SELL', price: closes[closes.length - 1], confidence: 0.5 });
    } else if (position === 'SHORT') {
      signals.push({ barIdx: closes.length - 1, action: 'COVER', price: closes[closes.length - 1], confidence: 0.5 });
    }

    this._lastSignals = signals;
    return signals;
  }

  /**
   * Simulate the signals and return performance metrics.
   * @param {Array<{open, high, low, close, volume}>} [data] optional, re-runs getSignals if provided
   * @returns {{
   *   totalReturn: number,
   *   winRate: number,
   *   totalTrades: number,
   *   sharpeRatio: number,
   *   maxDrawdown: number,
   *   equityCurve: number[]
   * }}
   */
  getPerformance(data) {
    const signals = data ? this.getSignals(data) : this._lastSignals;
    if (!signals || signals.length === 0) {
      return {
        totalReturn: 0, winRate: 0, totalTrades: 0,
        sharpeRatio: 0, maxDrawdown: 0, equityCurve: [this.initialCapital]
      };
    }

    let capital = this.initialCapital;
    let entryPrice = 0;
    let direction = null; // 'long' | 'short'
    const trades = [];
    const equityCurve = [capital];
    const returns = [];

    for (const sig of signals) {
      if (sig.action === 'BUY') {
        entryPrice = sig.price;
        direction = 'long';
      } else if (sig.action === 'SHORT') {
        entryPrice = sig.price;
        direction = 'short';
      } else if (sig.action === 'SELL' && direction === 'long') {
        const pnl = (sig.price - entryPrice) / entryPrice;
        capital *= (1 + pnl);
        trades.push(pnl);
        returns.push(pnl);
        equityCurve.push(capital);
        direction = null;
      } else if (sig.action === 'COVER' && direction === 'short') {
        const pnl = (entryPrice - sig.price) / entryPrice;
        capital *= (1 + pnl);
        trades.push(pnl);
        returns.push(pnl);
        equityCurve.push(capital);
        direction = null;
      }
    }

    const wins = trades.filter(t => t > 0).length;
    const winRate = trades.length > 0 ? wins / trades.length : 0;
    const totalReturn = (capital - this.initialCapital) / this.initialCapital;

    // Sharpe ratio (annualized assuming daily)
    const avgReturn = mean(returns);
    const retStd = stdDev(returns);
    const sharpeRatio = retStd === 0 ? 0 : (avgReturn / retStd) * Math.sqrt(252);

    // Max drawdown
    let peak = equityCurve[0];
    let maxDd = 0;
    for (const val of equityCurve) {
      if (val > peak) peak = val;
      const dd = (peak - val) / peak;
      if (dd > maxDd) maxDd = dd;
    }

    return {
      totalReturn: Math.round(totalReturn * 10000) / 10000,
      winRate: Math.round(winRate * 1000) / 1000,
      totalTrades: trades.length,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      maxDrawdown: Math.round(maxDd * 10000) / 10000,
      equityCurve
    };
  }

  // --- private helpers ---

  _score(closes, rsi, macd, bb, sma20, sma50, idx) {
    let score = 0;

    // Factor 1: RSI
    const rsiVal = rsi[idx] ?? 50;
    if (rsiVal < 30) score += 1;
    else if (rsiVal > 70) score -= 1;

    // Factor 2: MACD histogram positive & rising
    const histCur = macd.histogram[idx] ?? 0;
    const histPrev = macd.histogram[idx - 1] ?? 0;
    if (histCur > 0 && histCur > histPrev) score += 1;
    else if (histCur < 0 && histCur < histPrev) score -= 1;

    // Factor 3: Price relative to SMA50
    const s50 = sma50[idx];
    if (s50 !== null) {
      if (closes[idx] > s50) score += 1;
      else if (closes[idx] < s50) score -= 1;
    }

    // Factor 4: Price near lower/upper Bollinger Band (mean reversion)
    const bbLow = bb.lower[idx];
    const bbUp = bb.upper[idx];
    const bbMid = bb.mid[idx];
    if (bbLow !== null && bbUp !== null && bbMid !== null) {
      const bbRange = bbUp - bbLow;
      if (bbRange > 0) {
        const pos = (closes[idx] - bbLow) / bbRange;
        if (pos < 0.15) score += 1;   // near lower band
        else if (pos > 0.85) score -= 1; // near upper band
      }
    }

    // Factor 5: SMA20 vs SMA50 crossover direction
    const s20 = sma20[idx];
    if (s20 !== null && s50 !== null) {
      if (s20 > s50) score += 1;
      else if (s20 < s50) score -= 1;
    }

    return score;
  }

  _buildReasoning(closes, rsi, macd, bb, sma20, sma50, idx, score) {
    const parts = [];
    const rsiVal = rsi[idx] ?? 50;
    parts.push(`RSI(${this.rsiPeriod}): ${rsiVal.toFixed(1)}`);

    const histCur = macd.histogram[idx] ?? 0;
    parts.push(`MACD histogram: ${histCur > 0 ? '+' : ''}${histCur.toFixed(4)}`);

    const s20 = sma20[idx];
    const s50 = sma50[idx];
    if (s20 !== null && s50 !== null) {
      parts.push(`SMA20: ${s20.toFixed(2)}, SMA50: ${s50.toFixed(2)} (${s20 > s50 ? 'bullish' : 'bearish'} alignment)`);
    }

    const bbLow = bb.lower[idx];
    const bbUp = bb.upper[idx];
    if (bbLow !== null && bbUp !== null) {
      const bbRange = bbUp - bbLow;
      const pos = bbRange > 0 ? ((closes[idx] - bbLow) / bbRange * 100).toFixed(0) : '50';
      parts.push(`BB position: ${pos}%`);
    }

    parts.push(`Composite score: ${score}/5`);

    return parts.join(' | ');
  }
}

// ---------------------------------------------------------------------------
// TradingCopilot — pattern-matching NLP
// ---------------------------------------------------------------------------

const INDICATOR_KNOWLEDGE = {
  rsi: 'RSI (Relative Strength Index) measures momentum on a 0-100 scale. Above 70 is overbought, below 30 is oversold. It helps identify potential reversal points.',
  macd: 'MACD (Moving Average Convergence Divergence) tracks trend momentum using the difference between a fast and slow EMA. A positive histogram suggests bullish momentum.',
  'bollinger bands': 'Bollinger Bands plot 2 standard deviations above and below a moving average. Price near the lower band may indicate oversold conditions, and near the upper band may indicate overbought.',
  sma: 'SMA (Simple Moving Average) smooths price data over a period. Common periods are 20 (short-term) and 50 (medium-term). A golden cross (SMA20 > SMA50) is bullish.',
  ema: 'EMA (Exponential Moving Average) weights recent prices more heavily than SMA, making it more responsive to new information.',
  atr: 'ATR (Average True Range) measures volatility by averaging the true range over a period. Higher ATR means higher volatility.',
  volume: 'Volume represents the number of shares or contracts traded. Rising price with rising volume confirms a trend; divergence may signal weakness.',
  'fibonacci': 'Fibonacci retracement levels (23.6%, 38.2%, 50%, 61.8%) are horizontal lines that indicate potential support and resistance based on prior price swings.',
  'support': 'Support is a price level where buying interest is strong enough to prevent further decline. It often forms at prior lows or round numbers.',
  'resistance': 'Resistance is a price level where selling pressure prevents further advance. It often forms at prior highs or round numbers.',
  'stop loss': 'A stop-loss order automatically sells a position when price reaches a specified level, limiting potential losses. Common placement is below recent support for longs.',
  'take profit': 'A take-profit order automatically closes a position at a target price to lock in gains. Often placed at resistance levels or based on risk/reward ratios.'
};

const INTENT_PATTERNS = [
  { intent: 'EXECUTE_TRADE', patterns: [/\b(buy|sell|short|cover|close|long)\b/i] },
  { intent: 'QUERY_POSITION', patterns: [/\b(position|portfolio|p&l|pnl|holdings?|balance)\b/i] },
  { intent: 'QUERY_ANALYSIS', patterns: [/\b(analy[sz]e|view on|what about|outlook|forecast|predict)\b/i] },
  { intent: 'SET_ALERT', patterns: [/\b(alert|notify|watch|trigger)\b.*\b(price|when|at|if)\b/i, /\b(set|create)\b.*\balert\b/i] },
  { intent: 'GENERAL_QUESTION', patterns: [/\b(what is|what are|explain|define|how does|tell me about)\b/i] }
];

function extractSymbol(text) {
  const upper = text.toUpperCase();
  for (const sym of SYMBOLS) {
    if (upper.includes(sym)) return sym;
  }
  // Try partial matches (e.g., "apple" -> AAPL)
  const aliases = {
    APPLE: 'AAPL', TESLA: 'TSLA', NVIDIA: 'NVDA', MICROSOFT: 'MSFT',
    AMAZON: 'AMZN', GOOGLE: 'GOOGL', BITCOIN: 'BTC/USD', ETHEREUM: 'ETH/USD',
    RIPPLE: 'XRP/USD', GOLD: 'XAU/USD', EURO: 'EUR/USD', POUND: 'GBP/USD',
    STERLING: 'GBP/USD', 'S&P': 'SPY', SP500: 'SPY', FACEBOOK: 'META'
  };
  for (const [alias, sym] of Object.entries(aliases)) {
    if (upper.includes(alias)) return sym;
  }
  return null;
}

function extractQuantity(text) {
  const match = text.match(/\b(\d+(?:\.\d+)?)\s*(?:shares?|units?|contracts?|lots?|qty)?\b/i);
  return match ? parseFloat(match[1]) : null;
}

function extractPrice(text) {
  const match = text.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d+)?)/);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  const atMatch = text.match(/\bat\s+(\d+(?:\.\d+)?)\b/i);
  return atMatch ? parseFloat(atMatch[1]) : null;
}

function extractAction(text) {
  const lower = text.toLowerCase();
  if (/\bbuy\b/.test(lower) || /\blong\b/.test(lower)) return 'BUY';
  if (/\bsell\b/.test(lower)) return 'SELL';
  if (/\bshort\b/.test(lower)) return 'SHORT';
  if (/\bcover\b/.test(lower)) return 'COVER';
  if (/\bclose\b/.test(lower)) return 'CLOSE';
  return null;
}

function detectIntent(text) {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pat of patterns) {
      if (pat.test(text)) return intent;
    }
  }
  return 'GENERAL_QUESTION';
}

function lookupIndicator(text) {
  const lower = text.toLowerCase();
  for (const [key, explanation] of Object.entries(INDICATOR_KNOWLEDGE)) {
    if (lower.includes(key)) return { term: key, explanation };
  }
  return null;
}

export class TradingCopilot {
  constructor() {
    this._agent = new TradingAgent();
    this._history = [];
  }

  /**
   * Process a natural-language message.
   *
   * @param {string} message - user input
   * @param {{ data?: Array, positions?: Array, portfolio?: object }} [context={}]
   * @returns {{ response: string, intent: string, suggestions: string[] }}
   */
  processMessage(message, context = {}) {
    if (!message || typeof message !== 'string') {
      return { response: 'Please enter a message.', intent: 'UNKNOWN', suggestions: [] };
    }

    this._history.push({ role: 'user', text: message });

    const intent = detectIntent(message);
    const symbol = extractSymbol(message);
    const quantity = extractQuantity(message);
    const price = extractPrice(message);
    const action = extractAction(message);

    let response = '';
    let suggestions = [];

    switch (intent) {
      case 'EXECUTE_TRADE':
        response = this._handleTrade(action, symbol, quantity, price);
        suggestions = [
          symbol ? `Analyze ${symbol}` : 'Analyze SPY',
          'Show portfolio',
          'Set alert'
        ];
        break;

      case 'QUERY_POSITION':
        response = this._handlePositionQuery(context);
        suggestions = ['Analyze SPY', 'Buy AAPL', 'What is RSI?'];
        break;

      case 'QUERY_ANALYSIS':
        response = this._handleAnalysis(symbol, context);
        suggestions = [
          symbol ? `Buy ${symbol}` : 'Buy SPY',
          symbol ? `Sell ${symbol}` : 'Sell SPY',
          'Show portfolio'
        ];
        break;

      case 'SET_ALERT':
        response = this._handleAlert(symbol, price);
        suggestions = ['Show alerts', `Analyze ${symbol || 'SPY'}`, 'Show portfolio'];
        break;

      case 'GENERAL_QUESTION':
      default: {
        const indicator = lookupIndicator(message);
        if (indicator) {
          response = `${indicator.term.toUpperCase()}: ${indicator.explanation}`;
          suggestions = [
            `Analyze ${symbol || 'SPY'} using ${indicator.term}`,
            'What is MACD?',
            'Show portfolio'
          ];
        } else {
          response = 'I can help with trading analysis, executing trades, managing your portfolio, or explaining market concepts. Try asking me to analyze a symbol, place a trade, or explain an indicator.';
          suggestions = ['Analyze TSLA', 'Buy 10 AAPL', 'What is RSI?', 'Show portfolio'];
        }
        break;
      }
    }

    this._history.push({ role: 'assistant', text: response });

    return { response, intent, suggestions };
  }

  // --- private intent handlers ---

  _handleTrade(action, symbol, quantity, price) {
    if (!action) return 'Please specify an action: buy, sell, short, or close.';
    if (!symbol) return `I understood you want to ${action.toLowerCase()}, but which symbol? Supported: ${SYMBOLS.join(', ')}`;

    const qtyStr = quantity ? `${quantity} shares of` : '';
    const priceStr = price ? ` at $${price.toFixed(2)}` : ' at market';

    return `Ready to ${action} ${qtyStr} ${symbol}${priceStr}. Please confirm to execute this order.`;
  }

  _handlePositionQuery(context) {
    if (context.portfolio) {
      const p = context.portfolio;
      const parts = [`Portfolio value: $${(p.totalValue || 0).toLocaleString()}`];
      if (p.dailyPnL !== undefined) parts.push(`Daily P&L: ${p.dailyPnL >= 0 ? '+' : ''}$${p.dailyPnL.toLocaleString()}`);
      if (context.positions && context.positions.length > 0) {
        parts.push(`Open positions: ${context.positions.length}`);
        context.positions.slice(0, 5).forEach(pos => {
          parts.push(`  ${pos.symbol}: ${pos.quantity} @ $${pos.avgPrice?.toFixed(2) || '?'}`);
        });
      } else {
        parts.push('No open positions.');
      }
      return parts.join('\n');
    }
    return 'No portfolio data available. Connect your account to view positions and P&L.';
  }

  _handleAnalysis(symbol, context) {
    const sym = symbol || 'SPY';

    if (context.data && context.data.length > 0) {
      const analysis = this._agent.analyze(context.data);
      const patterns = detectPatterns(context.data);
      const prediction = predictPrice(context.data, 5);
      const commentary = getMarketCommentary(context.data, patterns, prediction);

      const parts = [
        `Analysis for ${sym}:`,
        `Signal: ${analysis.action} (confidence: ${(analysis.confidence * 100).toFixed(0)}%)`,
        `Factors: ${analysis.reasoning}`,
        '',
        commentary
      ];

      if (patterns.length > 0) {
        parts.push('');
        parts.push('Detected patterns:');
        patterns.slice(0, 3).forEach(p => {
          parts.push(`  - ${p.pattern.replace(/_/g, ' ')} (${p.direction}, ${(p.confidence * 100).toFixed(0)}% confidence, target: $${p.priceTarget.toFixed(2)})`);
        });
      }

      if (prediction.predictions.length > 0) {
        const lastPred = prediction.predictions[prediction.predictions.length - 1];
        parts.push('');
        parts.push(`${prediction.predictions.length}-step forecast: $${lastPred.price.toFixed(2)} (confidence: ${(lastPred.confidence * 100).toFixed(0)}%)`);
      }

      return parts.join('\n');
    }

    return `To analyze ${sym}, I need price data. Load the chart for ${sym} and try again.`;
  }

  _handleAlert(symbol, price) {
    if (!symbol && !price) return 'Please specify a symbol and price for the alert. Example: "Alert me when AAPL hits $200"';
    if (!symbol) return `Alert set at $${price.toFixed(2)}. Which symbol should I watch? Supported: ${SYMBOLS.join(', ')}`;
    if (!price) return `Which price level should I watch for ${symbol}?`;
    return `Alert created: Notify when ${symbol} reaches $${price.toFixed(2)}. You will be notified when this level is hit.`;
  }
}
