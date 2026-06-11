// ============================================
// Paper Trading & Leaderboard
// Simulated trading with starting balance,
// equity curve, competitive leaderboard,
// inline price chart, and margin accounts
// ============================================

import { state, subscribe } from '../state.js';
import { setPageTitle } from '../components/topbar.js';
import { renderKpiCards } from '../components/kpiCard.js';
import { createLineChart, CHART_COLORS } from '../components/charts.js';
import { onViewCleanup } from '../router.js';
import { showModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { PAIRS, PAIR_BASE_PRICES, PAPER_KEY } from '../utils/constants.js';

const STARTING_BALANCE = 100000;
const MARGIN_STARTING_BALANCE = 50000;
const MAINTENANCE_MARGIN_RATIO = 0.25; // 25% maintenance margin
const MARGIN_CALL_RATIO = 0.30;        // 30% triggers warning
const LEVERAGE_OPTIONS = [2, 3, 5, 10];
const PRICE_HISTORY_BARS = 80;

// ── Price History Generator ──────────────────
function generatePriceHistory(pair, bars = PRICE_HISTORY_BARS) {
  const base = PAIR_BASE_PRICES[pair] || 100;
  const data = [];
  let price = base * (0.92 + Math.random() * 0.16);
  const now = Date.now();
  const interval = 3600000; // 1h bars

  for (let i = 0; i < bars; i++) {
    const change = (Math.random() - 0.48) * 0.025;
    const open = price;
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.012);
    const low = Math.min(open, close) * (1 - Math.random() * 0.012);
    const volume = Math.floor(Math.random() * 5000 + 500);
    data.push({
      time: now - (bars - i) * interval,
      open: +open.toPrecision(6),
      high: +high.toPrecision(6),
      low: +low.toPrecision(6),
      close: +close.toPrecision(6),
      volume
    });
    price = close;
  }
  return data;
}

// ── Mini Candlestick Chart Renderer ──────────
function renderCandlestickChart(canvas, priceData, positions, closedTrades) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const PAD_TOP = 24, PAD_BOTTOM = 28, PAD_LEFT = 8, PAD_RIGHT = 62;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  if (priceData.length < 2) return;

  const allHighs = priceData.map(d => d.high);
  const allLows = priceData.map(d => d.low);
  let maxP = Math.max(...allHighs);
  let minP = Math.min(...allLows);
  const range = maxP - minP || 1;
  maxP += range * 0.05;
  minP -= range * 0.05;
  const totalRange = maxP - minP;

  const barW = chartW / priceData.length;
  const candleW = Math.max(barW * 0.7, 2);

  const yScale = (price) => PAD_TOP + (1 - (price - minP) / totalRange) * chartH;
  const xScale = (i) => PAD_LEFT + i * barW + barW / 2;

  // Colors matching Charts tab exactly
  const BULL = '#56d364', BEAR = '#f85149';

  // Background (dark, matching Charts tab)
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // Grid lines (matching Charts tab)
  ctx.strokeStyle = 'rgba(48,54,61,0.5)';
  ctx.lineWidth = 0.5;
  const gridLines = 8;
  for (let i = 0; i <= gridLines; i++) {
    const y = PAD_TOP + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, y);
    ctx.lineTo(W - PAD_RIGHT, y);
    ctx.stroke();
  }
  // Vertical grid
  for (let i = 0; i <= 12; i++) {
    const x = PAD_LEFT + (chartW / 12) * i;
    ctx.beginPath();
    ctx.moveTo(x, PAD_TOP);
    ctx.lineTo(x, PAD_TOP + chartH);
    ctx.stroke();
  }

  // Price axis labels
  for (let i = 0; i <= gridLines; i++) {
    const y = PAD_TOP + (chartH / gridLines) * i;
    const price = maxP - (totalRange / gridLines) * i;
    ctx.fillStyle = '#8b949e';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(formatPriceShort(price), W - PAD_RIGHT + 6, y + 3);
  }

  // Volume bars (background, matching Charts tab colors)
  const maxVol = Math.max(...priceData.map(d => d.volume));
  const volH = chartH * 0.15;
  for (let i = 0; i < priceData.length; i++) {
    const d = priceData[i];
    const x = xScale(i);
    const h = (d.volume / maxVol) * volH;
    const bullish = d.close >= d.open;
    ctx.fillStyle = bullish ? 'rgba(86,211,100,0.18)' : 'rgba(248,81,73,0.18)';
    ctx.fillRect(x - candleW / 2, PAD_TOP + chartH - h, candleW, h);
  }

  // Candlesticks (matching Charts tab exactly)
  for (let i = 0; i < priceData.length; i++) {
    const d = priceData[i];
    const x = xScale(i);
    const bullish = d.close >= d.open;

    ctx.strokeStyle = ctx.fillStyle = bullish ? BULL : BEAR;
    ctx.lineWidth = 1;

    // Wick
    ctx.beginPath();
    ctx.moveTo(x, yScale(d.high));
    ctx.lineTo(x, yScale(d.low));
    ctx.stroke();

    // Body
    const bodyTop = yScale(Math.max(d.open, d.close));
    const bodyBot = yScale(Math.min(d.open, d.close));
    const bodyH = Math.max(bodyBot - bodyTop, 1);
    if (bullish) {
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    } else {
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - candleW / 2, bodyTop, candleW, bodyH);
    }
  }

  // Draw position entry markers
  const lastBar = priceData[priceData.length - 1];
  if (positions && positions.length > 0) {
    for (const pos of positions) {
      const y = yScale(pos.entryPrice);
      if (y >= PAD_TOP && y <= PAD_TOP + chartH) {
        // Dashed line
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = pos.side === 'buy' ? 'rgba(86,211,100,0.6)' : 'rgba(248,81,73,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD_LEFT, y);
        ctx.lineTo(W - PAD_RIGHT, y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Label
        const label = `${pos.side === 'buy' ? 'L' : 'S'} ${formatPriceShort(pos.entryPrice)}`;
        ctx.font = 'bold 9px Inter, sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = pos.side === 'buy' ? BULL : BEAR;
        ctx.fillRect(W - PAD_RIGHT - tw - 8, y - 8, tw + 6, 16);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(label, W - PAD_RIGHT - tw - 5, y + 3);
      }

      // Liquidation price marker for margin positions
      if (pos.leverage && pos.liquidationPrice) {
        const liqY = yScale(pos.liquidationPrice);
        if (liqY >= PAD_TOP && liqY <= PAD_TOP + chartH) {
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = 'rgba(248,81,73,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(PAD_LEFT, liqY);
          ctx.lineTo(W - PAD_RIGHT, liqY);
          ctx.stroke();
          ctx.setLineDash([]);

          const liqLabel = `LIQ ${formatPriceShort(pos.liquidationPrice)}`;
          ctx.font = 'bold 9px Inter, sans-serif';
          const ltw = ctx.measureText(liqLabel).width;
          ctx.fillStyle = BEAR;
          ctx.fillRect(PAD_LEFT, liqY - 8, ltw + 6, 16);
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'left';
          ctx.fillText(liqLabel, PAD_LEFT + 3, liqY + 3);
        }
      }
    }
  }

  // Current price line (matching Charts tab — color based on last candle)
  const lastPrice = lastBar.close;
  const curY = yScale(lastPrice);
  const lastBull = lastBar.close >= lastBar.open;
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = lastBull ? BULL : BEAR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_LEFT, curY);
  ctx.lineTo(W - PAD_RIGHT, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Current price badge (matching Charts tab)
  ctx.fillStyle = lastBull ? BULL : BEAR;
  const priceLabel = formatPriceShort(lastPrice);
  ctx.font = 'bold 11px Inter, sans-serif';
  const plW = ctx.measureText(priceLabel).width;
  ctx.fillRect(W - PAD_RIGHT, curY - 10, plW + 16, 20);
  ctx.fillStyle = '#0d1117';
  ctx.textAlign = 'left';
  ctx.fillText(priceLabel, W - PAD_RIGHT + 8, curY + 4);

  // Time labels
  ctx.fillStyle = '#8b949e';
  ctx.font = '10px Inter, sans-serif';
  ctx.textAlign = 'center';
  const labelEvery = Math.max(Math.floor(priceData.length / 6), 1);
  for (let i = 0; i < priceData.length; i += labelEvery) {
    const d = priceData[i];
    const x = xScale(i);
    const date = new Date(d.time);
    const label = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:00`;
    ctx.fillText(label, x, H - 6);
  }
}

function formatPriceShort(price) {
  if (price >= 1000) return '$' + price.toFixed(0);
  if (price >= 1) return '$' + price.toFixed(2);
  return '$' + price.toFixed(4);
}

// ── State Management ─────────────────────────
function loadPaperState() {
  const stored = localStorage.getItem(PAPER_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Migrate: ensure margin fields exist
      if (!parsed.marginAccount) {
        parsed.marginAccount = createFreshMarginAccount();
      }
      return parsed;
    } catch { /* fall through */ }
  }
  return createFreshState();
}

function createFreshMarginAccount() {
  return {
    balance: MARGIN_STARTING_BALANCE,
    startingBalance: MARGIN_STARTING_BALANCE,
    positions: [],
    closedTrades: [],
    totalBorrowed: 0,
    interestAccrued: 0,
  };
}

function createFreshState() {
  return {
    balance: STARTING_BALANCE,
    startingBalance: STARTING_BALANCE,
    positions: [],
    closedTrades: [],
    equityCurve: [{ date: new Date().toISOString(), equity: STARTING_BALANCE }],
    leaderboard: generateLeaderboard(),
    startedAt: new Date().toISOString(),
    marginAccount: createFreshMarginAccount(),
    activeTab: 'cash',
  };
}

function generateLeaderboard() {
  const names = [
    'CryptoWolf_42', 'TrendRider', 'AlphaSeeker', 'BullishBandit',
    'MomentumQueen', 'ScalpKing99', 'DiamondHands', 'SwingMaster',
    'RiskWizard', 'ProfitPirate', 'ChartNinja', 'VolumeViper',
    'BreakoutBoss', 'MeanRevKid', 'GoldenCross7'
  ];
  return names.map(name => {
    const returnPct = (Math.random() - 0.3) * 60;
    const equity = STARTING_BALANCE * (1 + returnPct / 100);
    const trades = Math.floor(Math.random() * 80 + 10);
    const winRate = Math.random() * 40 + 30;
    const sharpe = (Math.random() * 3 - 0.5);
    return { name, equity: Math.round(equity * 100) / 100, returnPct: Math.round(returnPct * 100) / 100, trades, winRate: Math.round(winRate * 10) / 10, sharpe: Math.round(sharpe * 100) / 100 };
  }).sort((a, b) => b.returnPct - a.returnPct);
}

function savePaperState(ps) {
  localStorage.setItem(PAPER_KEY, JSON.stringify(ps));
}

function getMockPrice(pair) {
  const base = PAIR_BASE_PRICES[pair] || 100;
  return base * (1 + (Math.random() - 0.5) * 0.04);
}

// ── Margin Calculations ──────────────────────
function calcLiquidationPrice(entryPrice, side, leverage) {
  // Distance from entry that wipes margin (maintenance margin = 25%)
  const marginFraction = 1 / leverage;
  const moveToLiquidate = marginFraction * (1 - MAINTENANCE_MARGIN_RATIO);
  if (side === 'buy') {
    return entryPrice * (1 - moveToLiquidate);
  } else {
    return entryPrice * (1 + moveToLiquidate);
  }
}

function calcMarginLevel(marginAccount) {
  if (marginAccount.positions.length === 0) return Infinity;
  let equity = marginAccount.balance;
  let totalNotional = 0;
  for (const p of marginAccount.positions) {
    const price = getMockPrice(p.pair);
    const direction = p.side === 'buy' ? 1 : -1;
    const unrealizedPnl = (price - p.entryPrice) * p.quantity * direction;
    equity += unrealizedPnl;
    totalNotional += p.notionalValue || (p.entryPrice * p.quantity);
  }
  if (totalNotional === 0) return Infinity;
  return equity / totalNotional;
}

function calcMarginEquity(marginAccount) {
  let equity = marginAccount.balance;
  for (const p of marginAccount.positions) {
    const price = getMockPrice(p.pair);
    const direction = p.side === 'buy' ? 1 : -1;
    equity += (price - p.entryPrice) * p.quantity * direction;
  }
  return equity;
}

function calcBuyingPower(marginAccount) {
  const equity = calcMarginEquity(marginAccount);
  let usedMargin = 0;
  for (const p of marginAccount.positions) {
    usedMargin += p.marginUsed || 0;
  }
  return Math.max(0, (equity - usedMargin) * 5); // max 5x on available
}

function calcUsedMargin(marginAccount) {
  let used = 0;
  for (const p of marginAccount.positions) {
    used += p.marginUsed || 0;
  }
  return used;
}

// ── Main Render ──────────────────────────────
export async function render(container) {
  setPageTitle('Paper Trading');

  let ps = loadPaperState();
  let charts = [];
  let selectedChartPair = PAIRS[0];
  let priceHistoryCache = {};

  function destroyCharts() { charts.forEach(c => c?.destroy()); charts.length = 0; }

  function getTotalEquity() {
    let posValue = 0;
    for (const p of ps.positions) {
      const price = getMockPrice(p.pair);
      const direction = p.side === 'buy' ? 1 : -1;
      posValue += (price - p.entryPrice) * p.quantity * direction;
    }
    return ps.balance + posValue;
  }

  function getPriceHistory(pair) {
    if (!priceHistoryCache[pair]) {
      priceHistoryCache[pair] = generatePriceHistory(pair);
    }
    return priceHistoryCache[pair];
  }

  function renderView() {
    destroyCharts();
    const isMargin = ps.activeTab === 'margin';
    const equity = getTotalEquity();
    const marginEquity = calcMarginEquity(ps.marginAccount);
    const returnPct = ((equity - ps.startingBalance) / ps.startingBalance) * 100;
    const wins = ps.closedTrades.filter(t => t.pnl > 0).length;
    const total = ps.closedTrades.length;
    const winRate = total > 0 ? (wins / total) * 100 : 0;

    const mWins = ps.marginAccount.closedTrades.filter(t => t.pnl > 0).length;
    const mTotal = ps.marginAccount.closedTrades.length;
    const mWinRate = mTotal > 0 ? (mWins / mTotal) * 100 : 0;
    const marginLevel = calcMarginLevel(ps.marginAccount);
    const usedMargin = calcUsedMargin(ps.marginAccount);
    const buyingPower = calcBuyingPower(ps.marginAccount);
    const marginReturnPct = ((marginEquity - ps.marginAccount.startingBalance) / ps.marginAccount.startingBalance) * 100;

    // Insert user into leaderboard (combined equity)
    const combinedReturn = (((equity + marginEquity) - (ps.startingBalance + MARGIN_STARTING_BALANCE)) / (ps.startingBalance + MARGIN_STARTING_BALANCE)) * 100;
    const userEntry = {
      name: 'You', equity: Math.round((equity + marginEquity) * 100) / 100,
      returnPct: Math.round(combinedReturn * 100) / 100,
      trades: total + mTotal, winRate: Math.round(((wins + mWins) / Math.max(total + mTotal, 1)) * 1000) / 10,
      sharpe: 0, isUser: true
    };
    const fullBoard = [...ps.leaderboard.filter(e => !e.isUser), userEntry]
      .sort((a, b) => b.returnPct - a.returnPct);
    const userRank = fullBoard.findIndex(e => e.isUser) + 1;

    const positions = isMargin ? ps.marginAccount.positions : ps.positions;
    const closedTrades = isMargin ? ps.marginAccount.closedTrades : ps.closedTrades;

    container.innerHTML = `
      <div class="page-header">
        <h2>Paper Trading</h2>
        <div style="display:flex;gap:var(--space-3)">
          <button class="btn btn-primary" id="paper-trade-btn">New Trade</button>
          <button class="btn btn-secondary" id="paper-reset-btn">Reset Account</button>
        </div>
      </div>

      <!-- Account Type Tabs -->
      <div class="paper-account-tabs" style="display:flex;gap:4px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:4px;margin-bottom:var(--space-6);width:fit-content">
        <button class="paper-tab ${!isMargin ? 'active' : ''}" data-tab="cash"
          style="padding:8px 20px;border-radius:var(--radius-md);font-size:var(--text-sm);font-weight:500;cursor:pointer;transition:all 150ms ease;border:none;
          ${!isMargin ? 'background:var(--color-bg-card);color:var(--color-text);box-shadow:var(--shadow-sm)' : 'background:transparent;color:var(--color-text-muted)'}">
          Cash Account
        </button>
        <button class="paper-tab ${isMargin ? 'active' : ''}" data-tab="margin"
          style="padding:8px 20px;border-radius:var(--radius-md);font-size:var(--text-sm);font-weight:500;cursor:pointer;transition:all 150ms ease;border:none;
          ${isMargin ? 'background:linear-gradient(135deg,#7b1fa2,#9c27b0);color:white;box-shadow:0 2px 8px rgba(123,31,162,0.3)' : 'background:transparent;color:var(--color-text-muted)'}">
          Margin Account
        </button>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-4 stagger-children" id="paper-kpis"></div>

      <!-- Price Chart -->
      <div class="card card--elevated mt-6">
        <div class="card-header" style="padding-bottom:var(--space-3);margin-bottom:0;border-bottom:none">
          <h3>Price Chart</h3>
          <div style="display:flex;gap:var(--space-2);align-items:center">
            <select class="form-select" id="chart-pair-select" style="width:auto;min-width:120px;padding:4px 30px 4px 10px;font-size:12px">
              ${PAIRS.map(p => `<option value="${p}" ${p === selectedChartPair ? 'selected' : ''}>${p}</option>`).join('')}
            </select>
          </div>
        </div>
        <div style="position:relative;height:280px;border-radius:var(--radius-md);overflow:hidden;border:1px solid var(--color-border-light)">
          <canvas id="price-chart-canvas" style="width:100%;height:100%"></canvas>
        </div>
        <div style="display:flex;gap:var(--space-4);padding-top:var(--space-3);font-size:11px;color:var(--color-text-muted)">
          <span>
            <span style="display:inline-block;width:10px;height:3px;background:#3949ab;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Current Price
          </span>
          <span>
            <span style="display:inline-block;width:10px;height:3px;background:#1a8a4a;border-radius:2px;vertical-align:middle;margin-right:4px;border-style:dashed"></span>Long Entry
          </span>
          <span>
            <span style="display:inline-block;width:10px;height:3px;background:#c62828;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Short Entry / Liq. Price
          </span>
        </div>
      </div>

      ${isMargin ? `
      <!-- Margin Health Bar -->
      <div class="card card--elevated mt-6" style="padding:var(--space-4) var(--space-6)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-2)">
          <span style="font-size:var(--text-sm);font-weight:600;color:var(--color-text)">Margin Health</span>
          <span style="font-size:12px;color:var(--color-text-muted)">
            Margin Level: <strong style="color:${marginLevel > 0.5 ? 'var(--color-green)' : marginLevel > MARGIN_CALL_RATIO ? 'var(--color-gold)' : 'var(--color-red)'}">${marginLevel === Infinity ? '---' : (marginLevel * 100).toFixed(1) + '%'}</strong>
            &nbsp;|&nbsp; Used: <strong>${formatCurrency(usedMargin)}</strong>
            &nbsp;|&nbsp; Available: <strong>${formatCurrency(Math.max(0, marginEquity - usedMargin))}</strong>
          </span>
        </div>
        <div style="height:8px;background:var(--color-surface);border-radius:var(--radius-full);overflow:hidden;border:1px solid var(--color-border-light)">
          <div style="height:100%;width:${marginLevel === Infinity ? 0 : Math.min(100, (1 / marginLevel) * 100)}%;border-radius:var(--radius-full);transition:width 300ms ease;
            background:${marginLevel > 0.5 ? 'linear-gradient(90deg,#1a8a4a,#2ecc71)' : marginLevel > MARGIN_CALL_RATIO ? 'linear-gradient(90deg,#b8860b,#f39c12)' : 'linear-gradient(90deg,#c62828,#e74c3c)'}">
          </div>
        </div>
        ${marginLevel !== Infinity && marginLevel <= MARGIN_CALL_RATIO ? `
        <div style="margin-top:var(--space-2);padding:var(--space-2) var(--space-3);background:var(--color-red-light);border:1px solid rgba(198,40,40,0.3);border-radius:var(--radius-md);font-size:12px;color:var(--color-red);font-weight:500">
          Margin Call Warning — Deposit funds or close positions to avoid liquidation
        </div>` : ''}
      </div>` : ''}

      <div class="grid grid-cols-2 mt-6">
        <div class="chart-card">
          <h3>Equity Curve</h3>
          <div class="chart-container" style="height:220px;"><canvas id="equity-chart"></canvas></div>
        </div>
        <div class="card card--elevated">
          <div class="card-header">
            <h3>${isMargin ? 'Margin' : 'Open'} Positions (${positions.length})</h3>
          </div>
          <div id="paper-positions"></div>
        </div>
      </div>

      <div class="card card--elevated mt-6">
        <div class="card-header">
          <h3>Leaderboard</h3>
          <span style="font-size:12px;color:var(--color-text-muted)">Your Rank: <strong style="color:var(--color-gold)">#${userRank}</strong> of ${fullBoard.length}</span>
        </div>
        <table class="data-table" style="font-size:12px">
          <thead><tr>
            <th style="width:40px">#</th><th>Trader</th><th style="text-align:right">Equity</th>
            <th style="text-align:right">Return</th><th style="text-align:right">Trades</th>
            <th style="text-align:right">Win Rate</th><th style="text-align:right">Sharpe</th>
          </tr></thead>
          <tbody>
            ${fullBoard.map((e, i) => `
              <tr style="${e.isUser ? 'background:var(--color-gold-light);font-weight:600' : ''}">
                <td>${i + 1 <= 3 ? ['🥇','🥈','🥉'][i] : i + 1}</td>
                <td>${e.name}${e.isUser ? ' ⭐' : ''}</td>
                <td class="font-mono" style="text-align:right">${formatCurrency(e.equity)}</td>
                <td class="font-mono" style="text-align:right;color:${e.returnPct >= 0 ? 'var(--color-green)' : 'var(--color-red)'}">
                  ${e.returnPct >= 0 ? '+' : ''}${e.returnPct.toFixed(2)}%
                </td>
                <td style="text-align:right">${e.trades}</td>
                <td style="text-align:right">${e.winRate.toFixed(1)}%</td>
                <td class="font-mono" style="text-align:right">${e.sharpe.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="card card--elevated mt-6">
        <div class="card-header"><h3>Trade History</h3></div>
        <div id="paper-history"></div>
      </div>
    `;

    // ── KPIs ──
    const kpiEl = document.getElementById('paper-kpis');
    if (kpiEl) {
      if (isMargin) {
        renderKpiCards(kpiEl, [
          {
            label: 'Margin Equity',
            value: formatCurrency(marginEquity),
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
            iconColor: marginEquity >= ps.marginAccount.startingBalance ? 'green' : 'red',
            trend: { direction: marginReturnPct >= 0 ? 'up' : 'down', text: `${marginReturnPct >= 0 ? '+' : ''}${marginReturnPct.toFixed(2)}%` }
          },
          {
            label: 'Buying Power',
            value: formatCurrency(buyingPower),
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
            iconColor: 'purple',
          },
          {
            label: 'Margin Used',
            value: formatCurrency(usedMargin),
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
            iconColor: usedMargin > marginEquity * 0.7 ? 'red' : 'blue',
            trend: marginEquity > 0 ? { direction: usedMargin / marginEquity < 0.5 ? 'up' : 'down', text: `${((usedMargin / marginEquity) * 100).toFixed(0)}% utilized` } : undefined,
          },
          {
            label: 'Win Rate',
            value: mTotal > 0 ? `${mWinRate.toFixed(1)}%` : 'N/A',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
            iconColor: mWinRate >= 50 ? 'green' : 'gold',
          }
        ]);
      } else {
        renderKpiCards(kpiEl, [
          {
            label: 'Equity',
            value: formatCurrency(equity),
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>',
            iconColor: equity >= ps.startingBalance ? 'green' : 'red',
            trend: { direction: returnPct >= 0 ? 'up' : 'down', text: `${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%` }
          },
          {
            label: 'Cash Balance',
            value: formatCurrency(ps.balance),
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 00-8 0v2"/></svg>',
            iconColor: 'blue',
          },
          {
            label: 'Win Rate',
            value: total > 0 ? `${winRate.toFixed(1)}%` : 'N/A',
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
            iconColor: winRate >= 50 ? 'green' : 'gold',
          },
          {
            label: 'Leaderboard Rank',
            value: `#${userRank}`,
            icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 7 7 7 7M18 9h1.5a2.5 2.5 0 000-5C17 4 17 7 17 7"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg>',
            iconColor: userRank <= 3 ? 'gold' : 'blue',
          }
        ]);
      }
    }

    // ── Equity curve chart ──
    const eqCanvas = document.getElementById('equity-chart');
    if (eqCanvas && ps.equityCurve.length > 1) {
      charts.push(createLineChart(eqCanvas, {
        labels: ps.equityCurve.map(p => new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
        data: ps.equityCurve.map(p => p.equity),
        label: 'Equity',
        color: equity >= ps.startingBalance ? CHART_COLORS.green : CHART_COLORS.red
      }));
    }

    // ── Price chart ──
    const priceCanvas = document.getElementById('price-chart-canvas');
    if (priceCanvas) {
      const history = getPriceHistory(selectedChartPair);
      const relevantPositions = positions.filter(p => p.pair === selectedChartPair);
      renderCandlestickChart(priceCanvas, history, relevantPositions, closedTrades);
    }

    // Chart pair selector
    document.getElementById('chart-pair-select')?.addEventListener('change', (e) => {
      selectedChartPair = e.target.value;
      const canvas = document.getElementById('price-chart-canvas');
      if (canvas) {
        const history = getPriceHistory(selectedChartPair);
        const relevantPositions = positions.filter(p => p.pair === selectedChartPair);
        renderCandlestickChart(canvas, history, relevantPositions, closedTrades);
      }
    });

    // ── Open positions table ──
    const posEl = document.getElementById('paper-positions');
    if (posEl) {
      if (positions.length === 0) {
        posEl.innerHTML = `<p style="padding:var(--space-4);color:var(--color-text-dim);font-size:var(--text-sm)">No open positions. Click "New Trade" to start.</p>`;
      } else if (isMargin) {
        posEl.innerHTML = `
          <div style="overflow-x:auto">
          <table class="data-table" style="font-size:12px">
            <thead><tr>
              <th>Pair</th><th>Side</th><th style="text-align:right">Qty</th>
              <th style="text-align:right">Entry</th><th style="text-align:center">Lvg</th>
              <th style="text-align:right">Margin</th><th style="text-align:right">Liq. Price</th>
              <th style="text-align:right">P&L</th><th></th>
            </tr></thead>
            <tbody>
              ${positions.map((p, i) => {
                const curPrice = getMockPrice(p.pair);
                const direction = p.side === 'buy' ? 1 : -1;
                const pnl = (curPrice - p.entryPrice) * p.quantity * direction;
                const pnlPct = (pnl / (p.marginUsed || 1)) * 100;
                return `<tr>
                  <td><strong>${p.pair}</strong></td>
                  <td style="color:${p.side === 'buy' ? 'var(--color-green)' : 'var(--color-red)'}">${p.side.toUpperCase()}</td>
                  <td class="font-mono" style="text-align:right">${p.quantity.toFixed(4)}</td>
                  <td class="font-mono" style="text-align:right">${formatCurrency(p.entryPrice)}</td>
                  <td style="text-align:center">
                    <span style="background:var(--color-purple-light);color:var(--color-purple);padding:2px 6px;border-radius:var(--radius-sm);font-size:11px;font-weight:600">${p.leverage}x</span>
                  </td>
                  <td class="font-mono" style="text-align:right">${formatCurrency(p.marginUsed)}</td>
                  <td class="font-mono" style="text-align:right;color:var(--color-red);font-size:11px">${formatPriceShort(p.liquidationPrice)}</td>
                  <td class="font-mono" style="text-align:right;color:${pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)'}">
                    ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}
                    <span style="font-size:10px;opacity:0.7"> (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)</span>
                  </td>
                  <td><button class="btn btn-ghost btn-sm paper-close-btn" data-idx="${i}" style="font-size:11px;color:var(--color-red)">Close</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
          </div>
        `;
      } else {
        posEl.innerHTML = `
          <table class="data-table" style="font-size:12px">
            <thead><tr><th>Pair</th><th>Side</th><th style="text-align:right">Qty</th><th style="text-align:right">Entry</th><th style="text-align:right">P&L</th><th></th></tr></thead>
            <tbody>
              ${positions.map((p, i) => {
                const curPrice = getMockPrice(p.pair);
                const pnl = (curPrice - p.entryPrice) * p.quantity * (p.side === 'buy' ? 1 : -1);
                return `<tr>
                  <td><strong>${p.pair}</strong></td>
                  <td style="color:${p.side === 'buy' ? 'var(--color-green)' : 'var(--color-red)'}">${p.side.toUpperCase()}</td>
                  <td class="font-mono" style="text-align:right">${p.quantity.toFixed(4)}</td>
                  <td class="font-mono" style="text-align:right">${formatCurrency(p.entryPrice)}</td>
                  <td class="font-mono" style="text-align:right;color:${pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)'}">
                    ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}
                  </td>
                  <td><button class="btn btn-ghost btn-sm paper-close-btn" data-idx="${i}" style="font-size:11px;color:var(--color-red)">Close</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        `;
      }

      // Close position handlers
      posEl.querySelectorAll('.paper-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          if (isMargin) {
            const pos = ps.marginAccount.positions[idx];
            if (!pos) return;
            const exitPrice = getMockPrice(pos.pair);
            const direction = pos.side === 'buy' ? 1 : -1;
            const pnl = (exitPrice - pos.entryPrice) * pos.quantity * direction;
            ps.marginAccount.balance += (pos.marginUsed || 0) + pnl;
            ps.marginAccount.closedTrades.push({
              ...pos, exitPrice, pnl: Math.round(pnl * 100) / 100, closedAt: new Date().toISOString()
            });
            ps.marginAccount.positions.splice(idx, 1);
            savePaperState(ps);
            showToast(`Closed ${pos.leverage}x ${pos.pair} ${pos.side} for ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}`, pnl >= 0 ? 'success' : 'warning');
          } else {
            const pos = ps.positions[idx];
            if (!pos) return;
            const exitPrice = getMockPrice(pos.pair);
            const pnl = (exitPrice - pos.entryPrice) * pos.quantity * (pos.side === 'buy' ? 1 : -1);
            ps.balance += (pos.amount || pos.entryPrice * pos.quantity) + pnl;
            ps.closedTrades.push({ ...pos, exitPrice, pnl: Math.round(pnl * 100) / 100, closedAt: new Date().toISOString() });
            ps.positions.splice(idx, 1);
            ps.equityCurve.push({ date: new Date().toISOString(), equity: Math.round(getTotalEquity() * 100) / 100 });
            savePaperState(ps);
            showToast(`Closed ${pos.pair} ${pos.side} for ${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}`, pnl >= 0 ? 'success' : 'warning');
          }
          renderView();
        });
      });
    }

    // ── Trade history ──
    const histEl = document.getElementById('paper-history');
    if (histEl) {
      if (closedTrades.length === 0) {
        histEl.innerHTML = '<p style="padding:var(--space-4);color:var(--color-text-dim);font-size:var(--text-sm)">No completed trades yet.</p>';
      } else {
        histEl.innerHTML = `
          <div style="overflow-x:auto">
          <table class="data-table" style="font-size:12px">
            <thead><tr>
              <th>Pair</th><th>Side</th>
              ${isMargin ? '<th style="text-align:center">Lvg</th>' : ''}
              <th style="text-align:right">Entry</th><th style="text-align:right">Exit</th>
              <th style="text-align:right">Qty</th><th style="text-align:right">P&L</th><th>Date</th>
            </tr></thead>
            <tbody>
              ${closedTrades.slice().reverse().slice(0, 30).map(t => `
                <tr>
                  <td><strong>${t.pair}</strong></td>
                  <td style="color:${t.side === 'buy' ? 'var(--color-green)' : 'var(--color-red)'}">${t.side.toUpperCase()}</td>
                  ${isMargin ? `<td style="text-align:center"><span style="background:var(--color-purple-light);color:var(--color-purple);padding:1px 5px;border-radius:var(--radius-sm);font-size:10px;font-weight:600">${t.leverage || 1}x</span></td>` : ''}
                  <td class="font-mono" style="text-align:right">${formatCurrency(t.entryPrice)}</td>
                  <td class="font-mono" style="text-align:right">${formatCurrency(t.exitPrice)}</td>
                  <td class="font-mono" style="text-align:right">${t.quantity.toFixed(4)}</td>
                  <td class="font-mono" style="text-align:right;color:${t.pnl >= 0 ? 'var(--color-green)' : 'var(--color-red)'}">
                    ${t.pnl >= 0 ? '+' : ''}${formatCurrency(t.pnl)}
                  </td>
                  <td style="font-size:11px;color:var(--color-text-muted)">${new Date(t.closedAt).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          </div>
        `;
      }
    }

    // ── Tab switching ──
    document.querySelectorAll('.paper-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        ps.activeTab = tab.dataset.tab;
        savePaperState(ps);
        renderView();
      });
    });

    // ── New trade button ──
    document.getElementById('paper-trade-btn')?.addEventListener('click', () => openPaperTradeModal(isMargin));

    // ── Reset button ──
    document.getElementById('paper-reset-btn')?.addEventListener('click', () => {
      showModal({
        title: 'Reset Paper Account',
        body: `<p style="color:var(--color-text-muted)">This will reset your <strong>${isMargin ? 'margin' : 'cash'}</strong> paper trading account${isMargin ? ` to $${MARGIN_STARTING_BALANCE.toLocaleString()}` : ' to $100,000'} and clear all positions and history. This cannot be undone.</p>`,
        width: '400px',
        actions: [
          { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
          { label: 'Reset Account', class: 'btn btn-primary', onClick: () => {
            if (isMargin) {
              ps.marginAccount = createFreshMarginAccount();
            } else {
              const newState = createFreshState();
              ps.balance = newState.balance;
              ps.startingBalance = newState.startingBalance;
              ps.positions = newState.positions;
              ps.closedTrades = newState.closedTrades;
              ps.equityCurve = newState.equityCurve;
              ps.leaderboard = newState.leaderboard;
              ps.startedAt = newState.startedAt;
            }
            savePaperState(ps);
            closeModal();
            showToast(`${isMargin ? 'Margin' : 'Cash'} account reset`, 'success');
            renderView();
          }}
        ]
      });
    });
  }

  // ── Trade Modal ─────────────────────────────
  function openPaperTradeModal(isMargin) {
    const acctBalance = isMargin ? ps.marginAccount.balance : ps.balance;
    const defaultLeverage = 3;

    const body = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Pair</label>
          <select class="form-select" id="paper-pair">
            ${PAIRS.map(p => `<option value="${p}">${p}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Side</label>
          <div class="radio-pills">
            <div class="radio-pill buy active" data-side="buy">Buy / Long</div>
            <div class="radio-pill sell" data-side="sell">Sell / Short</div>
          </div>
          <input type="hidden" id="paper-side" value="buy">
        </div>
      </div>

      ${isMargin ? `
      <div class="form-group">
        <label class="form-label">Leverage</label>
        <div style="display:flex;gap:var(--space-2);margin-top:var(--space-1)" id="leverage-pills">
          ${LEVERAGE_OPTIONS.map(lev => `
            <div class="leverage-pill" data-leverage="${lev}"
              style="flex:1;text-align:center;padding:8px;border:1px solid ${lev === defaultLeverage ? 'var(--color-purple)' : 'var(--color-border)'};
              border-radius:var(--radius-md);cursor:pointer;font-size:var(--text-sm);font-weight:600;transition:all 150ms ease;
              ${lev === defaultLeverage ? 'background:var(--color-purple-light);color:var(--color-purple)' : 'color:var(--color-text-muted)'}">
              ${lev}x
            </div>
          `).join('')}
        </div>
        <input type="hidden" id="paper-leverage" value="${defaultLeverage}">
      </div>` : ''}

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${isMargin ? 'Margin Amount ($)' : 'Amount ($)'}</label>
          <input type="number" class="form-input" id="paper-amount" step="any" placeholder="1000" value="1000">
        </div>
        ${isMargin ? `
        <div class="form-group">
          <label class="form-label">Position Size</label>
          <div id="paper-position-size" style="padding:8px 12px;background:var(--color-surface);border:1px solid var(--color-border-light);border-radius:var(--radius-md);font-family:var(--font-mono);font-size:var(--text-sm);color:var(--color-text)">
            $${(1000 * defaultLeverage).toLocaleString()}
          </div>
        </div>` : ''}
      </div>

      ${isMargin ? `
      <div id="paper-margin-info" style="background:var(--color-surface);border:1px solid var(--color-border-light);border-radius:var(--radius-md);padding:var(--space-3);margin-top:var(--space-2)">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);font-size:12px">
          <div>
            <span style="color:var(--color-text-muted)">Leverage:</span>
            <strong id="info-leverage" style="color:var(--color-purple)">${defaultLeverage}x</strong>
          </div>
          <div>
            <span style="color:var(--color-text-muted)">Notional:</span>
            <strong id="info-notional">$${(1000 * defaultLeverage).toLocaleString()}</strong>
          </div>
          <div>
            <span style="color:var(--color-text-muted)">Liq. Price:</span>
            <strong id="info-liq" style="color:var(--color-red)">---</strong>
          </div>
          <div>
            <span style="color:var(--color-text-muted)">Maint. Margin:</span>
            <strong id="info-maint">${formatCurrency(1000 * defaultLeverage * MAINTENANCE_MARGIN_RATIO)}</strong>
          </div>
        </div>
      </div>` : ''}

      <p style="font-size:12px;color:var(--color-text-muted);margin-top:8px">
        Available: <strong>${formatCurrency(acctBalance)}</strong>
        ${isMargin ? ' | Maintenance Margin: 25%' : ' | Executes at current market price'}
      </p>
    `;

    showModal({
      title: isMargin ? 'Margin Trade' : 'Paper Trade',
      body,
      width: '480px',
      actions: [
        { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
        { label: isMargin ? 'Open Margin Position' : 'Execute Trade', class: 'btn btn-primary', onClick: () => {
          const pair = document.getElementById('paper-pair')?.value;
          const side = document.getElementById('paper-side')?.value || 'buy';
          const amount = Number(document.getElementById('paper-amount')?.value) || 0;
          const leverage = isMargin ? Number(document.getElementById('paper-leverage')?.value) || 3 : 1;

          if (!pair || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
          if (amount > acctBalance) { showToast('Insufficient balance', 'error'); return; }

          const price = getMockPrice(pair);
          const notionalValue = amount * leverage;
          const quantity = notionalValue / price;

          if (isMargin) {
            const liquidationPrice = calcLiquidationPrice(price, side, leverage);
            ps.marginAccount.balance -= amount;
            ps.marginAccount.positions.push({
              pair, side, amount, leverage,
              entryPrice: Math.round(price * 10000) / 10000,
              quantity: Math.round(quantity * 10000) / 10000,
              notionalValue: Math.round(notionalValue * 100) / 100,
              marginUsed: amount,
              liquidationPrice: Math.round(liquidationPrice * 10000) / 10000,
              openedAt: new Date().toISOString()
            });
          } else {
            ps.balance -= amount;
            ps.positions.push({
              pair, side, amount,
              entryPrice: Math.round(price * 10000) / 10000,
              quantity: Math.round(quantity * 10000) / 10000,
              openedAt: new Date().toISOString()
            });
            ps.equityCurve.push({ date: new Date().toISOString(), equity: Math.round(getTotalEquity() * 100) / 100 });
          }
          savePaperState(ps);

          closeModal();
          const leverageText = isMargin ? ` (${leverage}x)` : '';
          showToast(`Opened ${side.toUpperCase()} ${pair}${leverageText} — ${quantity.toFixed(4)} @ ${formatCurrency(price)}`, 'success');
          renderView();
        }}
      ]
    });

    // Wire up interactive elements after modal renders
    setTimeout(() => {
      // Side pills
      document.querySelectorAll('.radio-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          document.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          document.getElementById('paper-side').value = pill.dataset.side;
          if (isMargin) updateMarginInfo();
        });
      });

      // Leverage pills
      if (isMargin) {
        document.querySelectorAll('.leverage-pill').forEach(pill => {
          pill.addEventListener('click', () => {
            document.querySelectorAll('.leverage-pill').forEach(p => {
              p.style.borderColor = 'var(--color-border)';
              p.style.background = 'transparent';
              p.style.color = 'var(--color-text-muted)';
            });
            pill.style.borderColor = 'var(--color-purple)';
            pill.style.background = 'var(--color-purple-light)';
            pill.style.color = 'var(--color-purple)';
            document.getElementById('paper-leverage').value = pill.dataset.leverage;
            updateMarginInfo();
          });
        });

        // Amount input change
        document.getElementById('paper-amount')?.addEventListener('input', updateMarginInfo);
        document.getElementById('paper-pair')?.addEventListener('change', updateMarginInfo);
        updateMarginInfo();
      }
    }, 50);
  }

  function updateMarginInfo() {
    const pair = document.getElementById('paper-pair')?.value;
    const side = document.getElementById('paper-side')?.value || 'buy';
    const amount = Number(document.getElementById('paper-amount')?.value) || 0;
    const leverage = Number(document.getElementById('paper-leverage')?.value) || 3;
    const price = getMockPrice(pair);
    const notional = amount * leverage;
    const liqPrice = calcLiquidationPrice(price, side, leverage);
    const maint = notional * MAINTENANCE_MARGIN_RATIO;

    const posSize = document.getElementById('paper-position-size');
    if (posSize) posSize.textContent = formatCurrency(notional);

    const infoLev = document.getElementById('info-leverage');
    if (infoLev) infoLev.textContent = leverage + 'x';

    const infoNot = document.getElementById('info-notional');
    if (infoNot) infoNot.textContent = formatCurrency(notional);

    const infoLiq = document.getElementById('info-liq');
    if (infoLiq) infoLiq.textContent = formatPriceShort(liqPrice);

    const infoMaint = document.getElementById('info-maint');
    if (infoMaint) infoMaint.textContent = formatCurrency(maint);
  }

  renderView();
  onViewCleanup(() => destroyCharts());
}
