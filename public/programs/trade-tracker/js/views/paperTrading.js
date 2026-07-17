// ============================================
// Paper Trading — TradingView-style Terminal
// Full-screen chart with bottom positions panel,
// account metrics bar, and inline order entry
// ============================================

import { state, subscribe } from '../state.js';
import { setPageTitle } from '../components/topbar.js';
import { onViewCleanup } from '../router.js';
import { showModal, closeModal, getModalContent } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { PAIRS, PAIR_BASE_PRICES, PAPER_KEY } from '../utils/constants.js';
import { render as renderChartView } from './chartView.js?v=5';
import { tradingService } from '../utils/tradingService.js';

const STARTING_BALANCE = 100000;
const MARGIN_STARTING_BALANCE = 50000;
const MAINTENANCE_MARGIN_RATIO = 0.25;
const MARGIN_CALL_RATIO = 0.30;
const LEVERAGE_OPTIONS = [2, 3, 5, 10];
const PRICE_HISTORY_BARS = 120;

const BULL = '#26a69a', BEAR = '#ef5350';
const BG = '#131722', GRID = 'rgba(42,46,57,0.5)';
const TEXT_DIM = '#787b86', TEXT = '#d1d4dc';

// ── Price History Generator ──────────────────
function generatePriceHistory(pair, bars = PRICE_HISTORY_BARS) {
  const base = PAIR_BASE_PRICES[pair] || 100;
  const data = [];
  let price = base * (0.92 + Math.random() * 0.16);
  const now = Date.now();
  const interval = 3600000;
  for (let i = 0; i < bars; i++) {
    const change = (Math.random() - 0.48) * 0.025;
    const open = price;
    const close = open * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.012);
    const low = Math.min(open, close) * (1 - Math.random() * 0.012);
    const volume = Math.floor(Math.random() * 5000 + 500);
    data.push({
      time: now - (bars - i) * interval,
      open: +open.toPrecision(6), high: +high.toPrecision(6),
      low: +low.toPrecision(6), close: +close.toPrecision(6), volume
    });
    price = close;
  }
  return data;
}

// ── Full Candlestick Chart Renderer ──────────
function renderCandlestickChart(canvas, priceData, positions) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.scale(dpr, dpr);

  const PAD_TOP = 10, PAD_BOTTOM = 24, PAD_LEFT = 4, PAD_RIGHT = 72;
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;
  if (priceData.length < 2) return;

  const allHighs = priceData.map(d => d.high);
  const allLows = priceData.map(d => d.low);
  let maxP = Math.max(...allHighs), minP = Math.min(...allLows);
  const range = maxP - minP || 1;
  maxP += range * 0.06; minP -= range * 0.06;
  const totalRange = maxP - minP;

  const barW = chartW / priceData.length;
  const candleW = Math.max(barW * 0.7, 2);
  const yScale = (price) => PAD_TOP + (1 - (price - minP) / totalRange) * chartH;
  const xScale = (i) => PAD_LEFT + i * barW + barW / 2;

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = GRID; ctx.lineWidth = 0.5;
  for (let i = 0; i <= 8; i++) {
    const y = PAD_TOP + (chartH / 8) * i;
    ctx.beginPath(); ctx.moveTo(PAD_LEFT, y); ctx.lineTo(W - PAD_RIGHT, y); ctx.stroke();
  }
  for (let i = 0; i <= 10; i++) {
    const x = PAD_LEFT + (chartW / 10) * i;
    ctx.beginPath(); ctx.moveTo(x, PAD_TOP); ctx.lineTo(x, PAD_TOP + chartH); ctx.stroke();
  }

  // Right price axis background
  ctx.fillStyle = '#1e222d';
  ctx.fillRect(W - PAD_RIGHT, 0, PAD_RIGHT, H);
  ctx.strokeStyle = '#2a2e39'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(W - PAD_RIGHT, 0); ctx.lineTo(W - PAD_RIGHT, H); ctx.stroke();

  // Price labels
  ctx.fillStyle = TEXT_DIM; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'left';
  for (let i = 0; i <= 8; i++) {
    const y = PAD_TOP + (chartH / 8) * i;
    const price = maxP - (totalRange / 8) * i;
    ctx.fillText(fmtPrice(price), W - PAD_RIGHT + 8, y + 4);
  }

  // Bottom time axis background
  ctx.fillStyle = '#1e222d';
  ctx.fillRect(0, H - PAD_BOTTOM, W - PAD_RIGHT, PAD_BOTTOM);
  ctx.strokeStyle = '#2a2e39'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H - PAD_BOTTOM); ctx.lineTo(W - PAD_RIGHT, H - PAD_BOTTOM); ctx.stroke();

  // Time labels
  ctx.fillStyle = TEXT_DIM; ctx.font = '11px Inter, sans-serif'; ctx.textAlign = 'center';
  const labelEvery = Math.max(Math.floor(priceData.length / 8), 1);
  for (let i = 0; i < priceData.length; i += labelEvery) {
    const d = priceData[i]; const x = xScale(i);
    const date = new Date(d.time);
    const hrs = date.getHours().toString().padStart(2, '0');
    const mins = date.getMinutes().toString().padStart(2, '0');
    ctx.fillText(`${hrs}:${mins}`, x, H - 6);
  }

  // Volume bars
  const maxVol = Math.max(...priceData.map(d => d.volume)) || 1;
  const volH = chartH * 0.18;
  for (let i = 0; i < priceData.length; i++) {
    const d = priceData[i], x = xScale(i);
    const h = (d.volume / maxVol) * volH;
    const bull = d.close >= d.open;
    ctx.fillStyle = bull ? 'rgba(38,166,154,0.25)' : 'rgba(239,83,80,0.25)';
    ctx.fillRect(x - candleW / 2, PAD_TOP + chartH - h, candleW, h);
  }

  // Candlesticks
  for (let i = 0; i < priceData.length; i++) {
    const d = priceData[i], x = xScale(i);
    const bull = d.close >= d.open;
    ctx.strokeStyle = ctx.fillStyle = bull ? BULL : BEAR;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yScale(d.high)); ctx.lineTo(x, yScale(d.low)); ctx.stroke();
    const bodyTop = yScale(Math.max(d.open, d.close));
    const bodyBot = yScale(Math.min(d.open, d.close));
    const bodyH = Math.max(bodyBot - bodyTop, 1);
    ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
  }

  // Position entry lines
  if (positions && positions.length > 0) {
    for (const pos of positions) {
      const y = yScale(pos.entryPrice);
      if (y < PAD_TOP || y > PAD_TOP + chartH) continue;
      const isBuy = pos.side === 'buy';
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = isBuy ? BULL : BEAR;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD_LEFT, y); ctx.lineTo(W - PAD_RIGHT, y); ctx.stroke();
      ctx.setLineDash([]);

      // Entry price tag
      const label = `${isBuy ? 'LONG' : 'SHORT'} ${fmtPrice(pos.entryPrice)}`;
      ctx.font = 'bold 10px Inter, sans-serif';
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = isBuy ? BULL : BEAR;
      const tagX = W - PAD_RIGHT - tw - 12;
      ctx.fillRect(tagX, y - 10, tw + 8, 20);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
      ctx.fillText(label, tagX + 4, y + 4);

      // Liquidation price
      if (pos.leverage && pos.liquidationPrice) {
        const liqY = yScale(pos.liquidationPrice);
        if (liqY >= PAD_TOP && liqY <= PAD_TOP + chartH) {
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(PAD_LEFT, liqY); ctx.lineTo(W - PAD_RIGHT, liqY); ctx.stroke();
          ctx.setLineDash([]);
          const liqLabel = `LIQ ${fmtPrice(pos.liquidationPrice)}`;
          ctx.font = 'bold 10px Inter, sans-serif';
          const ltw = ctx.measureText(liqLabel).width;
          ctx.fillStyle = '#ff5252';
          ctx.fillRect(PAD_LEFT, liqY - 10, ltw + 8, 20);
          ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
          ctx.fillText(liqLabel, PAD_LEFT + 4, liqY + 4);
        }
      }
    }
  }

  // Current price line + tag
  const lastBar = priceData[priceData.length - 1];
  const lastPrice = lastBar.close;
  const curY = yScale(lastPrice);
  const lastBull = lastBar.close >= lastBar.open;
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = lastBull ? BULL : BEAR; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD_LEFT, curY); ctx.lineTo(W - PAD_RIGHT, curY); ctx.stroke();
  ctx.setLineDash([]);

  // Price tag on axis
  ctx.fillStyle = lastBull ? BULL : BEAR;
  const pl = fmtPrice(lastPrice);
  ctx.font = 'bold 11px Inter, sans-serif';
  const plW = ctx.measureText(pl).width;
  ctx.fillRect(W - PAD_RIGHT, curY - 11, PAD_RIGHT, 22);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.fillText(pl, W - PAD_RIGHT + 8, curY + 4);

  return { lastBar, maxP, minP };
}

function fmtPrice(price) {
  if (price >= 10000) return price.toFixed(2);
  if (price >= 1000) return price.toFixed(2);
  if (price >= 1) return price.toFixed(2);
  return price.toFixed(5);
}

// ── State Management ─────────────────────────
function loadPaperState() {
  const stored = localStorage.getItem(PAPER_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (!parsed.marginAccount) parsed.marginAccount = createFreshMarginAccount();
      return parsed;
    } catch { /* fall through */ }
  }
  return createFreshState();
}

function createFreshMarginAccount() {
  return { balance: MARGIN_STARTING_BALANCE, startingBalance: MARGIN_STARTING_BALANCE, positions: [], closedTrades: [], totalBorrowed: 0, interestAccrued: 0 };
}

function createFreshState() {
  return {
    balance: STARTING_BALANCE, startingBalance: STARTING_BALANCE,
    positions: [], closedTrades: [],
    equityCurve: [{ date: new Date().toISOString(), equity: STARTING_BALANCE }],
    leaderboard: generateLeaderboard(), startedAt: new Date().toISOString(),
    marginAccount: createFreshMarginAccount(), activeTab: 'cash',
  };
}

function generateLeaderboard() {
  const names = ['CryptoWolf_42','TrendRider','AlphaSeeker','BullishBandit','MomentumQueen','ScalpKing99','DiamondHands','SwingMaster','RiskWizard','ProfitPirate','ChartNinja','VolumeViper','BreakoutBoss','MeanRevKid','GoldenCross7'];
  return names.map(name => {
    const returnPct = (Math.random() - 0.3) * 60;
    const equity = STARTING_BALANCE * (1 + returnPct / 100);
    return { name, equity: Math.round(equity * 100) / 100, returnPct: Math.round(returnPct * 100) / 100, trades: Math.floor(Math.random() * 80 + 10), winRate: Math.round((Math.random() * 40 + 30) * 10) / 10, sharpe: Math.round((Math.random() * 3 - 0.5) * 100) / 100 };
  }).sort((a, b) => b.returnPct - a.returnPct);
}

function savePaperState(ps) { localStorage.setItem(PAPER_KEY, JSON.stringify(ps)); }

function getMockPrice(pair) {
  const base = PAIR_BASE_PRICES[pair] || 100;
  return base * (1 + (Math.random() - 0.5) * 0.04);
}

// ── Margin Calculations ──────────────────────
function calcLiquidationPrice(entryPrice, side, leverage) {
  const marginFraction = 1 / leverage;
  const moveToLiquidate = marginFraction * (1 - MAINTENANCE_MARGIN_RATIO);
  return side === 'buy' ? entryPrice * (1 - moveToLiquidate) : entryPrice * (1 + moveToLiquidate);
}

function calcMarginEquity(ma) {
  let eq = ma.balance;
  for (const p of ma.positions) { const d = p.side === 'buy' ? 1 : -1; eq += (getMockPrice(p.pair) - p.entryPrice) * p.quantity * d; }
  return eq;
}

function calcUsedMargin(ma) {
  let u = 0; for (const p of ma.positions) u += p.marginUsed || 0; return u;
}

function calcMarginLevel(ma) {
  if (ma.positions.length === 0) return Infinity;
  let eq = ma.balance, usedMargin = 0;
  for (const p of ma.positions) { const d = p.side === 'buy' ? 1 : -1; eq += (getMockPrice(p.pair) - p.entryPrice) * p.quantity * d; usedMargin += p.marginUsed || 0; }
  return usedMargin === 0 ? Infinity : eq / usedMargin;
}

// ── Main Render ──────────────────────────────
export async function render(container) {
  setPageTitle('Paper Trading');

  let ps = loadPaperState();
  let selectedPair = PAIRS[0];
  let bottomTab = 'positions';
  let orderWidgetCollapsed = false;
  let chartCleanup = null;
  let slActive = false;
  let tpActive = false;
  let slTpCheckInterval = null;

  function getTotalEquity() {
    let v = 0;
    for (const p of ps.positions) { const d = p.side === 'buy' ? 1 : -1; v += (getMockPrice(p.pair) - p.entryPrice) * p.quantity * d; }
    return ps.balance + v;
  }

  function getTotalPnL() {
    const isMargin = ps.activeTab === 'margin';
    const positions = isMargin ? ps.marginAccount.positions : ps.positions;
    let pnl = 0;
    for (const p of positions) {
      const d = p.side === 'buy' ? 1 : -1;
      pnl += (getMockPrice(p.pair) - p.entryPrice) * p.quantity * d;
    }
    return pnl;
  }

  function renderTradingPanel() {
    const isMargin = ps.activeTab === 'margin';
    const equity = isMargin ? calcMarginEquity(ps.marginAccount) : getTotalEquity();
    const balance = isMargin ? ps.marginAccount.balance : ps.balance;
    const pnl = getTotalPnL();
    const positions = isMargin ? ps.marginAccount.positions : ps.positions;
    const closedTrades = isMargin ? ps.marginAccount.closedTrades : ps.closedTrades;
    const usedMargin = isMargin ? calcUsedMargin(ps.marginAccount) : 0;
    const marginAvail = isMargin ? Math.max(0, equity - usedMargin) : balance;
    const marginLevel = isMargin ? calcMarginLevel(ps.marginAccount) : Infinity;
    // Build the trading panel overlay HTML
    const curPrice = getMockPrice(selectedPair);
    const spread = curPrice * 0.0003;
    const sellPrice = curPrice - spread;
    const buyPrice = curPrice + spread;
    const orderQty = 1000;
    const initMargin = isMargin ? `~${formatCurrency(orderQty / 3)}` : `~${formatCurrency(orderQty)}`;
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')} UTC`;
    const widgetCollapsed = orderWidgetCollapsed;

    const tradingOverlay = document.getElementById('pt-trading-overlay');
    if (!tradingOverlay) return;

    tradingOverlay.innerHTML = `
      <!-- Account Metrics Bar + Positions Tabs -->
      <div style="display:flex;align-items:center;background:#1e222d;border-top:1px solid #2a2e39;flex-shrink:0;padding:0 12px;min-height:36px;font-size:11px">
        <button class="pt-panel-tab ${bottomTab === 'positions' ? 'active' : ''}" data-panel="positions" style="padding:8px 12px;font-size:12px;border:none;cursor:pointer;font-weight:500;border-bottom:2px solid ${bottomTab === 'positions' ? '#2962ff' : 'transparent'};color:${bottomTab === 'positions' ? TEXT : TEXT_DIM};background:transparent;margin-right:4px">
          Positions <span style="background:${positions.length > 0 ? '#2962ff' : '#363a45'};color:#fff;border-radius:3px;padding:0 5px;font-size:10px;margin-left:2px">${positions.length}</span>
        </button>
        <button class="pt-panel-tab" data-panel="pending" style="padding:8px 12px;font-size:12px;border:none;cursor:pointer;font-weight:500;border-bottom:2px solid transparent;color:${TEXT_DIM};background:transparent;margin-right:4px">
          Pending <span style="background:#363a45;color:#fff;border-radius:3px;padding:0 5px;font-size:10px;margin-left:2px">0</span>
        </button>
        <button class="pt-panel-tab ${bottomTab === 'closed' ? 'active' : ''}" data-panel="closed" style="padding:8px 12px;font-size:12px;border:none;cursor:pointer;font-weight:500;border-bottom:2px solid ${bottomTab === 'closed' ? '#2962ff' : 'transparent'};color:${bottomTab === 'closed' ? TEXT : TEXT_DIM};background:transparent;margin-right:4px">
          Closed Positions
        </button>
        <button class="pt-panel-tab ${bottomTab === 'equity' ? 'active' : ''}" data-panel="equity" style="padding:8px 12px;font-size:12px;border:none;cursor:pointer;font-weight:500;border-bottom:2px solid ${bottomTab === 'equity' ? '#2962ff' : 'transparent'};color:${bottomTab === 'equity' ? TEXT : TEXT_DIM};background:transparent;margin-right:4px">
          Equity Curve
        </button>
        <span style="color:${TEXT_DIM};padding:0 8px">›</span>
        <div style="flex:1"></div>
        <div style="display:flex;gap:16px;align-items:center">
          <div><span style="color:${TEXT_DIM}">BALANCE</span> <span class="font-mono" style="color:${TEXT};font-weight:600">${formatCurrency(balance)}</span></div>
          <div><span style="color:${TEXT_DIM}">PROFIT & LOSS</span> <span class="font-mono" style="color:${pnl >= 0 ? BULL : BEAR};font-weight:600">${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}</span></div>
          <div><span style="color:${TEXT_DIM}">EQUITY</span> <span class="font-mono" style="color:${TEXT};font-weight:600">${formatCurrency(equity)}</span></div>
          ${isMargin ? `
          <div><span style="color:${TEXT_DIM}">MARGIN USED</span> <span class="font-mono" style="color:#ff9800;font-weight:600">${formatCurrency(usedMargin)}</span></div>
          <div><span style="color:${TEXT_DIM}">MARGIN AVAILABLE</span> <span class="font-mono" style="color:${TEXT};font-weight:600">${formatCurrency(marginAvail)}</span></div>
          <div><span style="color:${TEXT_DIM}">MARGIN LEVEL ⓘ</span> <span class="font-mono" style="color:${marginLevel > 0.5 ? BULL : marginLevel > MARGIN_CALL_RATIO ? '#ff9800' : BEAR};font-weight:600">${marginLevel === Infinity ? '–' : (marginLevel * 100).toFixed(1) + '%'}</span></div>
          ` : ''}
        </div>
        <button id="pt-close-all-btn" style="background:#363a45;color:${TEXT};border:1px solid #4a4e59;border-radius:4px;padding:4px 14px;font-size:11px;cursor:pointer;font-weight:500;margin-left:12px;display:${positions.length > 0 ? 'block' : 'none'}">Close All ▾</button>
      </div>

      <!-- Positions Table -->
      <div style="flex-shrink:0;max-height:180px;overflow-y:auto;background:${BG};font-size:12px">
        ${bottomTab === 'positions' ? renderPositionsTable(positions, isMargin) : bottomTab === 'equity' ? `<div id="pt-equity-curve-container" style="width:100%;height:100%;min-height:160px"></div>` : renderClosedTable(closedTrades, isMargin)}
      </div>

      <!-- Floating Order Widget -->
      <div id="pt-order-widget" style="position:fixed;background:#1e222dF0;backdrop-filter:blur(12px);border:1px solid #363a45;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,0.7);z-index:10;width:540px;overflow:hidden;cursor:default" data-default-bottom="${240 + (positions.length > 0 ? 40 * Math.min(positions.length, 3) : 30)}">
        ${widgetCollapsed ? `
        <div style="display:flex;align-items:center;padding:8px 16px;gap:10px">
          <span style="font-size:13px;font-weight:700;color:${TEXT}">${selectedPair}</span>
          <span style="font-size:11px;color:${TEXT_DIM}">MARKET</span>
          <div style="flex:1"></div>
          <span class="font-mono" style="font-size:12px;color:${BEAR}">${fmtPrice(sellPrice)}</span>
          <span style="color:#363a45">/</span>
          <span class="font-mono" style="font-size:12px;color:${BULL}">${fmtPrice(buyPrice)}</span>
          <button id="pt-widget-toggle" style="background:transparent;border:1px solid #363a45;border-radius:4px;color:${TEXT_DIM};cursor:pointer;padding:3px 8px;font-size:12px;line-height:1">⌄</button>
        </div>
        ` : `
        <div style="display:flex;align-items:center;padding:8px 14px;gap:8px;border-bottom:1px solid #2a2e39">
          <span style="font-size:14px;font-weight:700;color:${TEXT}">${selectedPair}</span>
          <div style="display:flex;gap:0;margin-left:6px">
            <button class="pt-otype-btn" style="padding:4px 12px;font-size:10px;font-weight:600;border:1px solid #363a45;border-radius:4px 0 0 4px;cursor:pointer;background:#363a45;color:#fff">MARKET ⟲</button>
            <button class="pt-otype-btn" style="padding:4px 12px;font-size:10px;font-weight:600;border:1px solid #363a45;border-left:none;border-radius:0 4px 4px 0;cursor:pointer;background:transparent;color:${TEXT_DIM}">PENDING</button>
          </div>
          <div style="flex:1"></div>
          <button class="pt-otype-btn" style="padding:4px 12px;font-size:10px;font-weight:600;border:1px solid #363a45;border-radius:4px;cursor:pointer;background:transparent;color:${TEXT_DIM}">RISK</button>
          <button id="pt-sl-toggle" class="pt-otype-btn" style="padding:4px 12px;font-size:10px;font-weight:600;border:1px solid ${slActive ? BEAR : '#363a45'};border-radius:4px;cursor:pointer;background:${slActive ? 'rgba(239,83,80,0.15)' : 'transparent'};color:${slActive ? BEAR : TEXT_DIM}">SL</button>
          <button id="pt-tp-toggle" class="pt-otype-btn" style="padding:4px 12px;font-size:10px;font-weight:600;border:1px solid ${tpActive ? BULL : '#363a45'};border-radius:4px;cursor:pointer;background:${tpActive ? 'rgba(38,166,154,0.15)' : 'transparent'};color:${tpActive ? BULL : TEXT_DIM}">TP</button>
          <button id="pt-widget-toggle" style="background:transparent;border:1px solid #363a45;border-radius:4px;color:${TEXT_DIM};cursor:pointer;padding:3px 8px;font-size:12px;line-height:1">⌃</button>
        </div>
        <div style="text-align:center;padding:6px 14px;font-size:12px;color:${TEXT_DIM}">
          Init. Margin: <strong style="color:${TEXT}">${initMargin}</strong> (∞)
          ${isMargin ? `<select id="pt-order-leverage" style="background:#2a2e39;color:${TEXT};border:1px solid #363a45;border-radius:4px;padding:2px 6px;font-size:11px;margin-left:8px">${LEVERAGE_OPTIONS.map(l => `<option value="${l}" ${l === 3 ? 'selected' : ''}>${l}x</option>`).join('')}</select>` : ''}
        </div>
        ${slActive || tpActive ? `<div style="display:flex;gap:8px;padding:4px 14px;align-items:center;justify-content:center">
          ${slActive ? `<div style="display:flex;align-items:center;gap:4px"><span style="color:${BEAR};font-size:11px;font-weight:600">SL:</span><input id="pt-sl-price" type="number" step="0.01" placeholder="Stop Loss Price" style="width:110px;background:#2a2e39;border:1px solid ${BEAR};border-radius:4px;color:${TEXT};padding:4px 8px;font-size:12px;font-family:var(--font-mono);outline:none"></div>` : ''}
          ${tpActive ? `<div style="display:flex;align-items:center;gap:4px"><span style="color:${BULL};font-size:11px;font-weight:600">TP:</span><input id="pt-tp-price" type="number" step="0.01" placeholder="Take Profit Price" style="width:110px;background:#2a2e39;border:1px solid ${BULL};border-radius:4px;color:${TEXT};padding:4px 8px;font-size:12px;font-family:var(--font-mono);outline:none"></div>` : ''}
        </div>` : ''}
        <div style="display:flex;align-items:stretch;padding:6px 14px 12px;gap:0">
          <button id="pt-sell-btn" style="flex:1;background:transparent;border:2px solid ${BEAR};border-radius:6px;padding:8px 6px;cursor:pointer;text-align:center">
            <div class="font-mono" style="font-size:17px;font-weight:700;color:${BEAR};line-height:1.2">${fmtPrice(sellPrice)}</div>
            <div style="font-size:9px;font-weight:600;color:${BEAR};letter-spacing:1px;margin-top:1px">SELL</div>
          </button>
          <div style="display:flex;align-items:center;gap:0;padding:0 10px;flex-shrink:0">
            <button id="pt-qty-minus" style="background:transparent;border:none;color:${TEXT_DIM};cursor:pointer;font-size:22px;padding:2px 8px;line-height:1">−</button>
            <div style="text-align:center;min-width:64px">
              <input id="pt-order-qty" type="number" value="1000" step="100" style="width:64px;background:transparent;border:none;color:${TEXT};text-align:center;font-size:17px;font-weight:700;font-family:var(--font-mono);outline:none;line-height:1.2">
              <div style="font-size:9px;color:${TEXT_DIM};letter-spacing:0.5px">USD</div>
            </div>
            <button id="pt-qty-plus" style="background:transparent;border:none;color:${TEXT_DIM};cursor:pointer;font-size:22px;padding:2px 8px;line-height:1">+</button>
          </div>
          <button id="pt-buy-btn" style="flex:1;background:transparent;border:2px solid ${BULL};border-radius:6px;padding:8px 6px;cursor:pointer;text-align:center">
            <div class="font-mono" style="font-size:17px;font-weight:700;color:${BULL};line-height:1.2">${fmtPrice(buyPrice)}</div>
            <div style="font-size:9px;font-weight:600;color:${BULL};letter-spacing:1px;margin-top:1px">BUY</div>
          </button>
        </div>
        `}
      </div>
    `;
  }

  function renderPositionsTable(positions, isMargin) {
    if (positions.length === 0) {
      return `<div style="padding:16px;color:${TEXT_DIM};text-align:center">No open positions</div>`;
    }
    return `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="color:${TEXT_DIM};text-align:left;border-bottom:1px solid #2a2e39">
        <th style="padding:6px 12px;font-weight:500">Instrument</th>
        <th style="padding:6px 8px;font-weight:500">Side</th>
        <th style="padding:6px 8px;font-weight:500;text-align:right">Size</th>
        <th style="padding:6px 8px;font-weight:500">Entry / Market</th>
        ${isMargin ? '<th style="padding:6px 8px;font-weight:500;text-align:center">Lvg</th>' : ''}
        ${isMargin ? '<th style="padding:6px 8px;font-weight:500;text-align:right">Margin</th>' : ''}
        <th style="padding:6px 8px;font-weight:500;text-align:right">Exposure</th>
        <th style="padding:6px 8px;font-weight:500;text-align:right">Profit & Loss</th>
        <th style="padding:6px 8px;font-weight:500;text-align:center">Actions</th>
      </tr></thead>
      <tbody>
        ${positions.map((p, i) => {
          const curPrice = getMockPrice(p.pair);
          const direction = p.side === 'buy' ? 1 : -1;
          const pnl = (curPrice - p.entryPrice) * p.quantity * direction;
          const exposure = curPrice * p.quantity;
          return `<tr style="border-bottom:1px solid #1e222d;${pnl >= 0 ? '' : ''}">
            <td style="padding:6px 12px;font-weight:600;color:${TEXT}">● ${p.pair}</td>
            <td style="padding:6px 8px;color:${p.side === 'buy' ? BULL : BEAR};font-weight:600">${p.side.toUpperCase()}</td>
            <td class="font-mono" style="padding:6px 8px;text-align:right;color:${TEXT}">${p.quantity.toFixed(4)}</td>
            <td class="font-mono" style="padding:6px 8px;color:${TEXT}">${fmtPrice(p.entryPrice)} → <span style="color:${pnl >= 0 ? BULL : BEAR}">${fmtPrice(curPrice)}</span></td>
            ${isMargin ? `<td style="padding:6px 8px;text-align:center"><span style="background:rgba(123,31,162,0.2);color:#ce93d8;padding:2px 6px;border-radius:3px;font-size:11px;font-weight:600">${p.leverage}x</span></td>` : ''}
            ${isMargin ? `<td class="font-mono" style="padding:6px 8px;text-align:right;color:${TEXT}">${formatCurrency(p.marginUsed)}</td>` : ''}
            <td class="font-mono" style="padding:6px 8px;text-align:right;color:${TEXT}">${formatCurrency(exposure)}</td>
            <td class="font-mono" style="padding:6px 8px;text-align:right;color:${pnl >= 0 ? BULL : BEAR};font-weight:600">${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}</td>
            <td style="padding:6px 8px;text-align:center;white-space:nowrap">
              <button class="paper-edit-btn" data-idx="${i}" style="background:transparent;border:1px solid #363a45;color:${TEXT_DIM};border-radius:3px;padding:3px 8px;font-size:11px;cursor:pointer;margin-right:2px" title="Edit position">✎</button>
              <button class="paper-notes-btn" data-idx="${i}" style="background:transparent;border:1px solid ${p.notes ? '#2962ff' : '#363a45'};color:${p.notes ? '#2962ff' : TEXT_DIM};border-radius:3px;padding:3px 8px;font-size:11px;cursor:pointer;margin-right:2px" title="${p.notes || 'No notes'}">📝</button>
              <button class="paper-close-btn" data-idx="${i}" style="background:transparent;border:1px solid #363a45;color:${TEXT_DIM};border-radius:3px;padding:3px 10px;font-size:11px;cursor:pointer" title="Close position">✕</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;
  }

  function renderClosedTable(closedTrades, isMargin) {
    if (closedTrades.length === 0) {
      return `<div style="padding:16px;color:${TEXT_DIM};text-align:center">No closed trades yet</div>`;
    }
    return `<table style="width:100%;border-collapse:collapse">
      <thead><tr style="color:${TEXT_DIM};text-align:left;border-bottom:1px solid #2a2e39">
        <th style="padding:6px 12px;font-weight:500">Instrument</th>
        <th style="padding:6px 8px;font-weight:500">Side</th>
        ${isMargin ? '<th style="padding:6px 8px;font-weight:500;text-align:center">Lvg</th>' : ''}
        <th style="padding:6px 8px;font-weight:500;text-align:right">Entry</th>
        <th style="padding:6px 8px;font-weight:500;text-align:right">Exit</th>
        <th style="padding:6px 8px;font-weight:500;text-align:right">Qty</th>
        <th style="padding:6px 8px;font-weight:500;text-align:right">P&L</th>
        <th style="padding:6px 8px;font-weight:500">Closed</th>
        <th style="padding:6px 8px;font-weight:500;text-align:center">Notes</th>
      </tr></thead>
      <tbody>
        ${closedTrades.slice().reverse().slice(0, 50).map(t => `<tr style="border-bottom:1px solid #1e222d">
          <td style="padding:5px 12px;font-weight:600;color:${TEXT}">${t.pair}</td>
          <td style="padding:5px 8px;color:${t.side === 'buy' ? BULL : BEAR};font-weight:600">${t.side.toUpperCase()}</td>
          ${isMargin ? `<td style="padding:5px 8px;text-align:center"><span style="background:rgba(123,31,162,0.2);color:#ce93d8;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:600">${t.leverage || 1}x</span></td>` : ''}
          <td class="font-mono" style="padding:5px 8px;text-align:right;color:${TEXT}">${fmtPrice(t.entryPrice)}</td>
          <td class="font-mono" style="padding:5px 8px;text-align:right;color:${TEXT}">${fmtPrice(t.exitPrice)}</td>
          <td class="font-mono" style="padding:5px 8px;text-align:right;color:${TEXT}">${t.quantity.toFixed(4)}</td>
          <td class="font-mono" style="padding:5px 8px;text-align:right;color:${t.pnl >= 0 ? BULL : BEAR};font-weight:600">${t.pnl >= 0 ? '+' : ''}${formatCurrency(t.pnl)}</td>
          <td style="padding:5px 8px;font-size:11px;color:${TEXT_DIM}">${new Date(t.closedAt).toLocaleDateString()}</td>
          <td style="padding:5px 8px;text-align:center"><span style="cursor:default;opacity:${t.notes ? 1 : 0.3}" title="${t.notes ? t.notes.replace(/"/g, '&quot;') : 'No notes'}">📝</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  // ── Close position ──
  function handleClosePosition(idx) {
    const isMargin = ps.activeTab === 'margin';
    if (isMargin) {
      const pos = ps.marginAccount.positions[idx];
      if (!pos) return;
      const exitPrice = getMockPrice(pos.pair);
      const d = pos.side === 'buy' ? 1 : -1;
      const pnl = (exitPrice - pos.entryPrice) * pos.quantity * d;
      ps.marginAccount.balance += (pos.marginUsed || 0) + pnl;
      ps.marginAccount.closedTrades.push({ ...pos, exitPrice, pnl: Math.round(pnl * 100) / 100, closedAt: new Date().toISOString() });
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
    renderTradingPanel();
  }

  function handleTrade(side) {
    const isMargin = ps.activeTab === 'margin';
    const amount = Number(document.getElementById('pt-order-qty')?.value) || 0;
    const leverage = isMargin ? Number(document.getElementById('pt-order-leverage')?.value) || 3 : 1;
    const acctBalance = isMargin ? ps.marginAccount.balance : ps.balance;

    if (amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
    if (amount > acctBalance) { showToast('Insufficient balance', 'error'); return; }

    const price = getMockPrice(selectedPair);
    const notionalValue = amount * leverage;
    const quantity = notionalValue / price;

    const slPrice = slActive ? Number(document.getElementById('pt-sl-price')?.value) || 0 : 0;
    const tpPrice = tpActive ? Number(document.getElementById('pt-tp-price')?.value) || 0 : 0;

    if (isMargin) {
      const liquidationPrice = calcLiquidationPrice(price, side, leverage);
      ps.marginAccount.balance -= amount;
      ps.marginAccount.positions.push({
        pair: selectedPair, side, amount, leverage,
        entryPrice: Math.round(price * 10000) / 10000,
        quantity: Math.round(quantity * 10000) / 10000,
        notionalValue: Math.round(notionalValue * 100) / 100,
        marginUsed: amount,
        liquidationPrice: Math.round(liquidationPrice * 10000) / 10000,
        openedAt: new Date().toISOString(),
        stopLoss: slPrice || null,
        takeProfit: tpPrice || null,
        notes: ''
      });
    } else {
      ps.balance -= amount;
      ps.positions.push({
        pair: selectedPair, side, amount,
        entryPrice: Math.round(price * 10000) / 10000,
        quantity: Math.round(quantity * 10000) / 10000,
        openedAt: new Date().toISOString(),
        stopLoss: slPrice || null,
        takeProfit: tpPrice || null,
        notes: ''
      });
      ps.equityCurve.push({ date: new Date().toISOString(), equity: Math.round(getTotalEquity() * 100) / 100 });
    }
    savePaperState(ps);
    const levText = isMargin ? ` (${leverage}x)` : '';
    showToast(`${side.toUpperCase()} ${selectedPair}${levText} — ${quantity.toFixed(4)} @ ${formatCurrency(price)}`, 'success');
    renderTradingPanel();
  }

  function handleReset() {
    const isMargin = ps.activeTab === 'margin';
    showModal({
      title: 'Reset Account',
      body: `<p style="color:var(--color-text-muted)">Reset your <strong>${isMargin ? 'margin' : 'cash'}</strong> account? This cannot be undone.</p>`,
      width: '380px',
      actions: [
        { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
        { label: 'Reset', class: 'btn btn-primary', onClick: () => {
          if (isMargin) { ps.marginAccount = createFreshMarginAccount(); }
          else { const n = createFreshState(); ps.balance = n.balance; ps.startingBalance = n.startingBalance; ps.positions = n.positions; ps.closedTrades = n.closedTrades; ps.equityCurve = n.equityCurve; ps.leaderboard = n.leaderboard; ps.startedAt = n.startedAt; }
          savePaperState(ps); closeModal(); showToast('Account reset', 'success'); renderTradingPanel();
        }}
      ]
    });
  }

  function handleCloseAll() {
    const isMargin = ps.activeTab === 'margin';
    const positions = isMargin ? ps.marginAccount.positions : ps.positions;
    if (positions.length === 0) return;
    // Close all from end to start
    while (positions.length > 0) { handleClosePosition(0); }
  }

  // ── Stop Loss / Take Profit checker ──
  function checkStopLossAndTakeProfit() {
    const isMargin = ps.activeTab === 'margin';
    const positions = isMargin ? ps.marginAccount.positions : ps.positions;
    let triggered = false;
    for (let i = positions.length - 1; i >= 0; i--) {
      const p = positions[i];
      if (!p.stopLoss && !p.takeProfit) continue;
      const curPrice = getMockPrice(p.pair);
      const isBuy = p.side === 'buy';
      let reason = null;
      if (p.stopLoss) {
        if (isBuy && curPrice <= p.stopLoss) reason = 'Stop Loss';
        if (!isBuy && curPrice >= p.stopLoss) reason = 'Stop Loss';
      }
      if (p.takeProfit) {
        if (isBuy && curPrice >= p.takeProfit) reason = 'Take Profit';
        if (!isBuy && curPrice <= p.takeProfit) reason = 'Take Profit';
      }
      if (reason) {
        showToast(`${reason} triggered on ${p.pair} ${p.side.toUpperCase()}`, reason === 'Take Profit' ? 'success' : 'warning');
        handleClosePosition(i);
        triggered = true;
      }
    }
    if (triggered) renderTradingPanel();
  }

  // ── Edit position modal ──
  function showEditPositionModal(idx) {
    const isMargin = ps.activeTab === 'margin';
    const positions = isMargin ? ps.marginAccount.positions : ps.positions;
    const p = positions[idx];
    if (!p) return;
    showModal({
      title: `Edit Position — ${p.pair} ${p.side.toUpperCase()}`,
      body: `
        <div style="display:flex;flex-direction:column;gap:12px;padding:8px 0">
          <div>
            <label style="display:block;font-size:12px;color:var(--color-text-muted);margin-bottom:4px">Stop Loss Price</label>
            <input id="edit-sl-price" type="number" step="0.01" value="${p.stopLoss || ''}" placeholder="None" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg-secondary);color:var(--color-text);font-size:14px;font-family:var(--font-mono)">
          </div>
          <div>
            <label style="display:block;font-size:12px;color:var(--color-text-muted);margin-bottom:4px">Take Profit Price</label>
            <input id="edit-tp-price" type="number" step="0.01" value="${p.takeProfit || ''}" placeholder="None" style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg-secondary);color:var(--color-text);font-size:14px;font-family:var(--font-mono)">
          </div>
          <div>
            <label style="display:block;font-size:12px;color:var(--color-text-muted);margin-bottom:4px">Trade Notes</label>
            <textarea id="edit-trade-notes" rows="4" placeholder="Enter trade notes..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg-secondary);color:var(--color-text);font-size:13px;resize:vertical;font-family:inherit">${p.notes || ''}</textarea>
          </div>
        </div>
      `,
      width: '420px',
      actions: [
        { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
        { label: 'Save', class: 'btn btn-primary', onClick: () => {
          const sl = Number(document.getElementById('edit-sl-price')?.value) || 0;
          const tp = Number(document.getElementById('edit-tp-price')?.value) || 0;
          const notes = document.getElementById('edit-trade-notes')?.value || '';
          p.stopLoss = sl || null;
          p.takeProfit = tp || null;
          p.notes = notes;
          savePaperState(ps);
          closeModal();
          showToast('Position updated', 'success');
          renderTradingPanel();
        }}
      ]
    });
  }

  // ── Equity Curve renderer ──
  function renderEquityCurve() {
    const container = document.getElementById('pt-equity-curve-container');
    if (!container) return;
    const curve = ps.equityCurve || [];
    const startBal = ps.startingBalance || STARTING_BALANCE;
    const currentEq = getTotalEquity();
    const totalReturn = ((currentEq - startBal) / startBal) * 100;
    const tradeCount = (ps.closedTrades || []).length;

    // Calculate max drawdown
    let peak = startBal, maxDD = 0;
    for (const pt of curve) {
      if (pt.equity > peak) peak = pt.equity;
      const dd = (peak - pt.equity) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }

    container.innerHTML = `
      <div style="display:flex;gap:24px;padding:8px 16px;align-items:center;flex-wrap:wrap">
        <div><span style="color:${TEXT_DIM};font-size:11px">EQUITY</span> <span class="font-mono" style="color:${TEXT};font-weight:600;font-size:13px">${formatCurrency(currentEq)}</span></div>
        <div><span style="color:${TEXT_DIM};font-size:11px">RETURN</span> <span class="font-mono" style="color:${totalReturn >= 0 ? BULL : BEAR};font-weight:600;font-size:13px">${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%</span></div>
        <div><span style="color:${TEXT_DIM};font-size:11px">MAX DRAWDOWN</span> <span class="font-mono" style="color:${BEAR};font-weight:600;font-size:13px">${maxDD.toFixed(2)}%</span></div>
        <div><span style="color:${TEXT_DIM};font-size:11px">TRADES</span> <span class="font-mono" style="color:${TEXT};font-weight:600;font-size:13px">${tradeCount}</span></div>
      </div>
      <canvas id="pt-equity-canvas" style="width:100%;height:110px;display:block"></canvas>
    `;

    const canvas = document.getElementById('pt-equity-canvas');
    if (!canvas || curve.length < 2) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const PAD = { top: 8, bottom: 4, left: 4, right: 4 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;

    const eqs = curve.map(c => c.equity);
    let minE = Math.min(...eqs, startBal);
    let maxE = Math.max(...eqs, startBal);
    const range = maxE - minE || 1;
    minE -= range * 0.05; maxE += range * 0.05;
    const totalRange = maxE - minE;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = GRID; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    }

    // Starting balance dashed line
    const balY = PAD.top + (1 - (startBal - minE) / totalRange) * cH;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = TEXT_DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, balY); ctx.lineTo(W - PAD.right, balY); ctx.stroke();
    ctx.setLineDash([]);

    // Equity line
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < curve.length; i++) {
      const x = PAD.left + (i / (curve.length - 1)) * cW;
      const y = PAD.top + (1 - (curve[i].equity - minE) / totalRange) * cH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const lastEq = curve[curve.length - 1].equity;
    ctx.strokeStyle = lastEq >= startBal ? BULL : BEAR;
    ctx.stroke();

    // Fill under line
    const lastX = PAD.left + cW;
    const lastY = PAD.top + (1 - (lastEq - minE) / totalRange) * cH;
    ctx.lineTo(lastX, PAD.top + cH);
    ctx.lineTo(PAD.left, PAD.top + cH);
    ctx.closePath();
    ctx.fillStyle = lastEq >= startBal ? 'rgba(38,166,154,0.08)' : 'rgba(239,83,80,0.08)';
    ctx.fill();
  }

  // ── Initial layout: Chart View + Trading Overlay ──
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:calc(100vh - 56px);margin:-24px -32px;overflow:hidden">
      <div id="pt-chart-container" style="flex:1;min-height:0;overflow:hidden"></div>
      <div id="pt-trading-overlay" style="flex-shrink:0;background:#131722;color:#d1d4dc;font-family:Inter,sans-serif"></div>
    </div>
  `;

  // Render the full chart view (with all toolbars, indicators, drawing tools)
  const chartContainer = document.getElementById('pt-chart-container');
  if (chartContainer) {
    await renderChartView(chartContainer);
    // Restore our page title (chartView sets it to "Chart")
    setPageTitle('Paper Trading');
    // Override the chart wrapper height to fill the flex container
    const wrapper = chartContainer.querySelector('.tv-chart-wrapper');
    if (wrapper) {
      wrapper.style.height = '100%';
      wrapper.style.minHeight = '0';
    }
  }

  // Render the trading panel
  renderTradingPanel();
  if (bottomTab === 'equity') requestAnimationFrame(() => renderEquityCurve());

  // ── SL/TP check interval ──
  slTpCheckInterval = setInterval(() => {
    checkStopLossAndTakeProfit();
    // Record equity curve snapshot every 30 seconds while positions are open
    const positions = ps.activeTab === 'margin' ? ps.marginAccount.positions : ps.positions;
    if (positions.length > 0) {
      const lastSnap = ps.equityCurve[ps.equityCurve.length - 1];
      const elapsed = lastSnap ? Date.now() - new Date(lastSnap.date).getTime() : Infinity;
      if (elapsed >= 30000) {
        ps.equityCurve.push({ date: new Date().toISOString(), equity: Math.round(getTotalEquity() * 100) / 100 });
        savePaperState(ps);
      }
    }
  }, 2000);

  // ── Delegated listeners ──
  container.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.paper-close-btn');
    if (closeBtn) { handleClosePosition(Number(closeBtn.dataset.idx)); return; }

    const editBtn = e.target.closest('.paper-edit-btn');
    if (editBtn) { showEditPositionModal(Number(editBtn.dataset.idx)); return; }

    const notesBtn = e.target.closest('.paper-notes-btn');
    if (notesBtn) { showEditPositionModal(Number(notesBtn.dataset.idx)); return; }

    if (e.target.closest('#pt-sl-toggle')) { slActive = !slActive; renderTradingPanel(); return; }
    if (e.target.closest('#pt-tp-toggle')) { tpActive = !tpActive; renderTradingPanel(); return; }

    const acctTab = e.target.closest('.pt-acct-tab');
    if (acctTab) { ps.activeTab = acctTab.dataset.tab; savePaperState(ps); renderTradingPanel(); return; }

    const panelTab = e.target.closest('.pt-panel-tab');
    if (panelTab) {
      bottomTab = panelTab.dataset.panel;
      renderTradingPanel();
      if (bottomTab === 'equity') requestAnimationFrame(() => renderEquityCurve());
      return;
    }

    const tfBtn = e.target.closest('.pt-tf-btn');
    if (tfBtn) { renderTradingPanel(); return; }

    if (e.target.closest('#pt-buy-btn')) { handleTrade('buy'); return; }
    if (e.target.closest('#pt-sell-btn')) { handleTrade('sell'); return; }
    if (e.target.closest('#pt-reset-btn')) { handleReset(); return; }
    if (e.target.closest('#pt-close-all-btn')) { handleCloseAll(); return; }

    if (e.target.closest('#pt-widget-toggle')) {
      orderWidgetCollapsed = !orderWidgetCollapsed;
      renderTradingPanel();
      return;
    }

    if (e.target.closest('#pt-qty-minus')) {
      const inp = document.getElementById('pt-order-qty');
      if (inp) inp.value = Math.max(100, Number(inp.value) - 100);
      return;
    }
    if (e.target.closest('#pt-qty-plus')) {
      const inp = document.getElementById('pt-order-qty');
      if (inp) inp.value = Number(inp.value) + 100;
      return;
    }
  });

  container.addEventListener('change', (e) => {
    if (e.target.id === 'pt-pair-select') {
      selectedPair = e.target.value;
      renderTradingPanel();
    }
  });

  // ── Floating Order Widget — Drag to reposition ──
  let widgetPos = null; // { top, left } when user has dragged it
  let widgetDragging = false;

  function applyWidgetPosition() {
    const widget = document.getElementById('pt-order-widget');
    if (!widget) return;
    if (widgetPos) {
      widget.style.top = widgetPos.top + 'px';
      widget.style.left = widgetPos.left + 'px';
      widget.style.bottom = 'auto';
      widget.style.transform = 'none';
    } else {
      const defaultBottom = widget.dataset.defaultBottom || '270';
      widget.style.bottom = defaultBottom + 'px';
      widget.style.left = '50%';
      widget.style.transform = 'translateX(-50%)';
      widget.style.top = 'auto';
    }
  }

  // Apply position after each render
  const origRender = renderTradingPanel;
  renderTradingPanel = function() {
    origRender();
    requestAnimationFrame(applyWidgetPosition);
  };
  // Apply for the initial render that already happened
  requestAnimationFrame(applyWidgetPosition);

  container.addEventListener('mousedown', (e) => {
    // Only start drag on the widget header bar (first child row with pair name)
    const widget = document.getElementById('pt-order-widget');
    if (!widget) return;
    const header = widget.firstElementChild;
    if (!header || !header.contains(e.target)) return;
    // Don't drag if clicking a button/input inside the header
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;

    e.preventDefault();
    widgetDragging = true;
    const rect = widget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;
    widget.style.cursor = 'grabbing';
    header.style.cursor = 'grabbing';

    const onMove = (ev) => {
      if (!widgetDragging) return;
      let newLeft = ev.clientX - offsetX;
      let newTop = ev.clientY - offsetY;
      // Clamp to viewport
      newLeft = Math.max(0, Math.min(window.innerWidth - widget.offsetWidth, newLeft));
      newTop = Math.max(0, Math.min(window.innerHeight - widget.offsetHeight, newTop));
      widgetPos = { top: newTop, left: newLeft };
      widget.style.top = newTop + 'px';
      widget.style.left = newLeft + 'px';
      widget.style.bottom = 'auto';
      widget.style.transform = 'none';
    };

    const onUp = () => {
      widgetDragging = false;
      widget.style.cursor = 'default';
      if (header) header.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Set grab cursor on the header
  requestAnimationFrame(() => {
    const widget = document.getElementById('pt-order-widget');
    if (widget && widget.firstElementChild) {
      widget.firstElementChild.style.cursor = 'grab';
    }
  });

  onViewCleanup(() => {
    if (slTpCheckInterval) { clearInterval(slTpCheckInterval); slTpCheckInterval = null; }
  });
}
