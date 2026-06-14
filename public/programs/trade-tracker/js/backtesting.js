// ============================================
// Backtesting Engine — TRADE TRACKER
// Self-contained ES module for strategy backtesting and symbol screening
// ============================================

import { INDICATOR_MAP } from './indicators.js?v=2';

// ─── BacktestEngine ───

export class BacktestEngine {
  constructor(config = {}) {
    this.initialCapital = config.initialCapital || 100000;
    this.commission = config.commission ?? 0.001;   // 0.1%
    this.slippage = config.slippage ?? 0.0005;      // 0.05%
    this.reset();
  }

  reset() {
    this.capital = this.initialCapital;
    this.positions = {};          // symbol -> { side, quantity, entryPrice, entryTime, commission }
    this.trades = [];             // completed trades
    this.equityCurve = { timestamps: [], equity: [] };
    this.totalCommission = 0;
    this.peakEquity = this.initialCapital;
    this.maxDrawdown = 0;
    this.maxDrawdownPercent = 0;
  }

  processBar(bar, signal) {
    // Process signal if present
    if (signal) {
      const symbol = signal.symbol || '_default';
      const pos = this.positions[symbol];

      if (signal.type === 'buy' && !pos) {
        this.openPosition(symbol, signal.quantity, signal.price || bar.close, bar.timestamp, 'long');
      } else if (signal.type === 'sell' && !pos) {
        this.openPosition(symbol, signal.quantity, signal.price || bar.close, bar.timestamp, 'short');
      } else if (signal.type === 'close' && pos) {
        this.closePosition(symbol, signal.price || bar.close, bar.timestamp);
      } else if (signal.type === 'buy' && pos && pos.side === 'short') {
        this.closePosition(symbol, signal.price || bar.close, bar.timestamp);
        if (signal.quantity) {
          this.openPosition(symbol, signal.quantity, signal.price || bar.close, bar.timestamp, 'long');
        }
      } else if (signal.type === 'sell' && pos && pos.side === 'long') {
        this.closePosition(symbol, signal.price || bar.close, bar.timestamp);
        if (signal.quantity) {
          this.openPosition(symbol, signal.quantity, signal.price || bar.close, bar.timestamp, 'short');
        }
      }
    }

    // Update equity after processing
    this.updateEquity(bar);
  }

  openPosition(symbol, quantity, price, timestamp, side) {
    // Apply slippage
    const slippageAdj = side === 'long' ? (1 + this.slippage) : (1 - this.slippage);
    const fillPrice = price * slippageAdj;

    // Calculate commission
    const notional = fillPrice * quantity;
    const comm = notional * this.commission;

    // Deduct cost from capital
    this.capital -= comm;
    if (side === 'long') {
      this.capital -= notional;
    } else {
      this.capital += notional; // short: receive proceeds
    }

    this.totalCommission += comm;

    this.positions[symbol] = {
      side,
      quantity,
      entryPrice: fillPrice,
      entryTime: timestamp,
      commission: comm,
    };
  }

  closePosition(symbol, price, timestamp) {
    const pos = this.positions[symbol];
    if (!pos) return;

    // Apply slippage (opposite direction)
    const slippageAdj = pos.side === 'long' ? (1 - this.slippage) : (1 + this.slippage);
    const fillPrice = price * slippageAdj;

    const notional = fillPrice * pos.quantity;
    const comm = notional * this.commission;

    // Return capital
    if (pos.side === 'long') {
      this.capital += notional;
    } else {
      this.capital -= notional;
    }
    this.capital -= comm;
    this.totalCommission += comm;

    // Calculate P&L
    let pnl;
    if (pos.side === 'long') {
      pnl = (fillPrice - pos.entryPrice) * pos.quantity;
    } else {
      pnl = (pos.entryPrice - fillPrice) * pos.quantity;
    }
    pnl -= (comm + pos.commission);

    const pnlPercent = (pnl / (pos.entryPrice * pos.quantity)) * 100;

    this.trades.push({
      symbol,
      side: pos.side,
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      exitPrice: fillPrice,
      entryTime: pos.entryTime,
      exitTime: timestamp,
      pnl,
      pnlPercent,
      commission: comm + pos.commission,
    });

    delete this.positions[symbol];
  }

  updateEquity(bar) {
    // Calculate current equity = capital + unrealized value of open positions
    let equity = this.capital;
    for (const sym in this.positions) {
      const pos = this.positions[sym];
      const notional = bar.close * pos.quantity;
      if (pos.side === 'long') {
        equity += notional;
      } else {
        // Short: profit = entry - current
        equity += (pos.entryPrice * pos.quantity * 2) - notional;
      }
    }

    this.equityCurve.timestamps.push(bar.timestamp);
    this.equityCurve.equity.push(equity);

    // Track drawdown
    if (equity > this.peakEquity) this.peakEquity = equity;
    const dd = this.peakEquity - equity;
    const ddPct = (dd / this.peakEquity) * 100;
    if (dd > this.maxDrawdown) this.maxDrawdown = dd;
    if (ddPct > this.maxDrawdownPercent) this.maxDrawdownPercent = ddPct;
  }

  getMetrics() {
    const trades = this.trades;
    const totalTrades = trades.length;
    if (totalTrades === 0) {
      return {
        totalTrades: 0, winRate: 0, netProfit: 0, profitFactor: 0,
        avgWin: 0, avgLoss: 0, largestWin: 0, largestLoss: 0,
        maxDrawdown: 0, maxDrawdownPercent: 0,
        sharpeRatio: 0, sortinoRatio: 0, returnPercent: 0,
        initialCapital: this.initialCapital,
        finalCapital: this.capital,
        totalCommission: this.totalCommission,
      };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const winRate = (wins.length / totalTrades) * 100;
    const netProfit = trades.reduce((s, t) => s + t.pnl, 0);
    const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? Infinity : 0) : grossProfit / grossLoss;

    const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0;
    const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0;

    // Sharpe & Sortino (annualized, using daily returns from equity curve)
    const eqArr = this.equityCurve.equity;
    const returns = [];
    for (let i = 1; i < eqArr.length; i++) {
      returns.push((eqArr[i] - eqArr[i - 1]) / eqArr[i - 1]);
    }
    const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((a, r) => a + (r - meanReturn) ** 2, 0) / (returns.length - 1))
      : 0;
    const sharpeRatio = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;

    // Sortino: only downside deviation
    const downsideReturns = returns.filter(r => r < 0);
    const downsideDev = downsideReturns.length > 1
      ? Math.sqrt(downsideReturns.reduce((a, r) => a + r ** 2, 0) / downsideReturns.length)
      : 0;
    const sortinoRatio = downsideDev > 0 ? (meanReturn / downsideDev) * Math.sqrt(252) : 0;

    const finalCapital = eqArr.length > 0 ? eqArr[eqArr.length - 1] : this.capital;
    const returnPercent = ((finalCapital - this.initialCapital) / this.initialCapital) * 100;

    return {
      totalTrades, winRate, netProfit, profitFactor,
      avgWin, avgLoss, largestWin, largestLoss,
      maxDrawdown: this.maxDrawdown,
      maxDrawdownPercent: this.maxDrawdownPercent,
      sharpeRatio, sortinoRatio, returnPercent,
      initialCapital: this.initialCapital,
      finalCapital,
      totalCommission: this.totalCommission,
    };
  }

  getTrades() {
    return this.trades.slice();
  }

  getEquityCurve() {
    return {
      timestamps: this.equityCurve.timestamps.slice(),
      equity: this.equityCurve.equity.slice(),
    };
  }
}


// ─── Indicator evaluation helpers ───

function computeIndicatorValues(data, indicatorKey) {
  const ind = INDICATOR_MAP[indicatorKey];
  if (!ind || !ind.fn) return null;
  try {
    return ind.fn(data);
  } catch (e) {
    console.warn(`[Backtest] Failed to compute indicator ${indicatorKey}:`, e);
    return null;
  }
}

function extractFieldValue(result, field, barIndex) {
  if (!result) return null;

  // Check lines array (most common output format)
  if (result.lines && result.lines.length > 0) {
    // Try to match by label/name first
    for (const line of result.lines) {
      const lineName = (line.label || line.name || '').toLowerCase();
      if (lineName === field.toLowerCase() || lineName.includes(field.toLowerCase())) {
        return line.values[barIndex] ?? null;
      }
    }
    // Default to first line
    return result.lines[0].values[barIndex] ?? null;
  }

  // Check histogram
  if (result.histogram && result.histogram.values) {
    if (field.toLowerCase() === 'histogram' || field.toLowerCase() === 'hist') {
      return result.histogram.values[barIndex] ?? null;
    }
  }

  // Check band
  if (result.band) {
    if (field.toLowerCase() === 'upper') return result.band.upper?.[barIndex] ?? null;
    if (field.toLowerCase() === 'lower') return result.band.lower?.[barIndex] ?? null;
    if (field.toLowerCase() === 'middle' || field.toLowerCase() === 'mid') return result.band.middle?.[barIndex] ?? null;
  }

  return null;
}

function evaluateCondition(currentVal, prevVal, operator, value, value2) {
  if (currentVal === null || currentVal === undefined) return false;

  switch (operator) {
    case 'greater_than':
      return currentVal > value;
    case 'less_than':
      return currentVal < value;
    case 'equals':
      return Math.abs(currentVal - value) < 0.0001;
    case 'between':
      return currentVal >= value && currentVal <= (value2 ?? value);
    case 'crosses_above':
      if (prevVal === null || prevVal === undefined) return false;
      return prevVal <= value && currentVal > value;
    case 'crosses_below':
      if (prevVal === null || prevVal === undefined) return false;
      return prevVal >= value && currentVal < value;
    default:
      return false;
  }
}


// ─── runBacktest ───

export function runBacktest(data, strategy, config = {}) {
  if (!data || data.length < 50) {
    return { metrics: null, trades: [], equityCurve: { timestamps: [], equity: [] }, error: 'Insufficient data (need at least 50 bars)' };
  }

  const engine = new BacktestEngine({
    initialCapital: config.initialCapital || 100000,
    commission: config.commission ?? 0.001,
    slippage: config.slippage ?? 0.0005,
  });

  const positionSize = strategy.positionSize || 0.1;
  const symbol = strategy.symbol || '_default';

  // Pre-compute all indicator results for the full dataset
  const indicatorCache = {};
  const allRules = [...(strategy.entryRules || []), ...(strategy.exitRules || [])];
  for (const rule of allRules) {
    if (rule.indicator && !indicatorCache[rule.indicator]) {
      indicatorCache[rule.indicator] = computeIndicatorValues(data, rule.indicator);
    }
  }

  // Walk through each bar
  for (let i = 1; i < data.length; i++) {
    const bar = data[i];
    let signal = null;

    const currentPosition = engine.positions[symbol];

    // Check exit rules first (if we have a position)
    if (currentPosition) {
      for (const rule of (strategy.exitRules || [])) {
        const result = indicatorCache[rule.indicator];
        const currentVal = extractFieldValue(result, rule.field, i);
        const prevVal = extractFieldValue(result, rule.field, i - 1);

        if (evaluateCondition(currentVal, prevVal, rule.operator, rule.value, rule.value2)) {
          if (
            (rule.action === 'close_long' && currentPosition.side === 'long') ||
            (rule.action === 'close_short' && currentPosition.side === 'short') ||
            rule.action === 'close'
          ) {
            signal = { type: 'close', symbol, price: bar.close };
            break;
          }
        }
      }
    }

    // Check entry rules (if no position and no close signal)
    if (!currentPosition && !signal) {
      for (const rule of (strategy.entryRules || [])) {
        const result = indicatorCache[rule.indicator];
        const currentVal = extractFieldValue(result, rule.field, i);
        const prevVal = extractFieldValue(result, rule.field, i - 1);

        if (evaluateCondition(currentVal, prevVal, rule.operator, rule.value, rule.value2)) {
          // Calculate position size based on current equity
          const eqArr = engine.equityCurve.equity;
          const currentEquity = eqArr.length > 0 ? eqArr[eqArr.length - 1] : engine.initialCapital;
          const allocAmount = currentEquity * positionSize;
          const quantity = Math.floor(allocAmount / bar.close);

          if (quantity > 0) {
            const type = rule.action === 'sell' ? 'sell' : 'buy';
            signal = { type, symbol, quantity, price: bar.close };
            break;
          }
        }
      }
    }

    engine.processBar(bar, signal);
  }

  // Close any remaining open position at last bar
  const lastBar = data[data.length - 1];
  if (engine.positions[symbol]) {
    engine.closePosition(symbol, lastBar.close, lastBar.timestamp);
    engine.updateEquity(lastBar);
  }

  return {
    metrics: engine.getMetrics(),
    trades: engine.getTrades(),
    equityCurve: engine.getEquityCurve(),
  };
}


// ─── screenSymbols ───

export function screenSymbols(symbolDataMap, criteria) {
  if (!criteria || !criteria.conditions || criteria.conditions.length === 0) {
    return [];
  }

  const logic = criteria.logic || 'AND'; // AND or OR
  const results = [];

  for (const [symbol, data] of Object.entries(symbolDataMap)) {
    if (!data || data.length < 50) continue;

    const lastIndex = data.length - 1;
    const lastBar = data[lastIndex];
    const conditionResults = [];
    const values = {};

    for (const cond of criteria.conditions) {
      // Compute indicator
      const result = computeIndicatorValues(data, cond.indicator);
      const currentVal = extractFieldValue(result, cond.field, lastIndex);
      const prevVal = extractFieldValue(result, cond.field, lastIndex - 1);

      values[`${cond.indicator}.${cond.field}`] = currentVal;

      const match = evaluateCondition(currentVal, prevVal, cond.operator, cond.value, cond.value2);
      conditionResults.push(match);
    }

    const allMatch = logic === 'AND'
      ? conditionResults.every(Boolean)
      : conditionResults.some(Boolean);

    results.push({
      symbol,
      matches: allMatch,
      conditionResults,
      values,
      price: lastBar.close,
      volume: lastBar.volume,
      change: lastBar.close && data.length > 1
        ? ((lastBar.close - data[lastIndex - 1].close) / data[lastIndex - 1].close) * 100
        : 0,
      timestamp: lastBar.timestamp,
    });
  }

  // Sort: matches first, then by symbol
  results.sort((a, b) => {
    if (a.matches !== b.matches) return a.matches ? -1 : 1;
    return a.symbol.localeCompare(b.symbol);
  });

  return results;
}
