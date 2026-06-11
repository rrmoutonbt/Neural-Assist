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
  let eq = ma.balance, tot = 0;
  for (const p of ma.positions) { const d = p.side === 'buy' ? 1 : -1; eq += (getMockPrice(p.pair) - p.entryPrice) * p.quantity * d; tot += p.notionalValue || (p.entryPrice * p.quantity); }
  return tot === 0 ? Infinity : eq / tot;
}

// ── Main Render ──────────────────────────────
export async function render(container) {
  setPageTitle('Paper Trading');

  let ps = loadPaperState();
  let selectedPair = PAIRS[0];
  let priceHistoryCache = {};
  let bottomTab = 'positions'; // positions | pending | closed

  function getPriceHistory(pair) {
    if (!priceHistoryCache[pair]) priceHistoryCache[pair] = generatePriceHistory(pair);
    return priceHistoryCache[pair];
  }

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

  function renderView() {
    const isMargin = ps.activeTab === 'margin';
    const equity = isMargin ? calcMarginEquity(ps.marginAccount) : getTotalEquity();
    const balance = isMargin ? ps.marginAccount.balance : ps.balance;
    const pnl = getTotalPnL();
    const positions = isMargin ? ps.marginAccount.positions : ps.positions;
    const closedTrades = isMargin ? ps.marginAccount.closedTrades : ps.closedTrades;
    const usedMargin = isMargin ? calcUsedMargin(ps.marginAccount) : 0;
    const marginAvail = isMargin ? Math.max(0, equity - usedMargin) : balance;
    const marginLevel = isMargin ? calcMarginLevel(ps.marginAccount) : Infinity;
    const lastBar = getPriceHistory(selectedPair).slice(-1)[0];
    const curPrice = lastBar ? lastBar.close : 0;

    container.innerHTML = `
      <div class="pt-terminal" style="display:flex;flex-direction:column;height:calc(100vh - 56px);background:${BG};color:${TEXT};font-family:Inter,sans-serif;overflow:hidden;margin:-24px -32px -24px -32px">

        <!-- Top Toolbar -->
        <div class="pt-toolbar" style="display:flex;align-items:center;gap:12px;padding:6px 12px;background:#1e222d;border-bottom:1px solid #2a2e39;flex-shrink:0;min-height:40px">
          <select id="pt-pair-select" style="background:#2a2e39;color:${TEXT};border:1px solid #363a45;border-radius:4px;padding:4px 8px;font-size:13px;font-weight:600;cursor:pointer;outline:none">
            ${PAIRS.map(p => `<option value="${p}" ${p === selectedPair ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
          <div style="display:flex;gap:2px" id="pt-tf-btns">
            ${['1m','5m','15m','1h','4h','1D'].map((tf, i) => `<button class="pt-tf-btn ${i === 3 ? 'active' : ''}" data-tf="${tf}" style="padding:4px 10px;font-size:11px;border:none;border-radius:3px;cursor:pointer;font-weight:500;${i === 3 ? `background:#2962ff;color:#fff` : `background:transparent;color:${TEXT_DIM}`}">${tf}</button>`).join('')}
          </div>
          <div style="width:1px;height:20px;background:#363a45"></div>
          <span style="font-size:12px;color:${TEXT_DIM}">● <span style="color:#26a69a">Trading Open</span></span>
          <div style="flex:1"></div>
          <!-- Account tabs -->
          <div style="display:flex;gap:2px;background:#2a2e39;border-radius:4px;padding:2px">
            <button class="pt-acct-tab ${!isMargin ? 'active' : ''}" data-tab="cash" style="padding:4px 14px;font-size:11px;border:none;border-radius:3px;cursor:pointer;font-weight:500;${!isMargin ? 'background:#363a45;color:#fff' : `background:transparent;color:${TEXT_DIM}`}">Cash</button>
            <button class="pt-acct-tab ${isMargin ? 'active' : ''}" data-tab="margin" style="padding:4px 14px;font-size:11px;border:none;border-radius:3px;cursor:pointer;font-weight:500;${isMargin ? 'background:#7b1fa2;color:#fff' : `background:transparent;color:${TEXT_DIM}`}">Margin</button>
          </div>
          <button id="pt-reset-btn" style="background:transparent;border:1px solid #363a45;color:${TEXT_DIM};border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer">Reset</button>
        </div>

        <!-- OHLC Overlay -->
        <div class="pt-ohlcv" style="position:absolute;top:52px;left:16px;z-index:5;font-size:12px;display:flex;gap:6px;align-items:center;pointer-events:none">
          <span style="font-weight:600;color:${TEXT}">${selectedPair}</span>
          <span style="color:${TEXT_DIM}">O</span><span style="color:${lastBar && lastBar.close >= lastBar.open ? BULL : BEAR}">${lastBar ? fmtPrice(lastBar.open) : '-'}</span>
          <span style="color:${TEXT_DIM}">H</span><span style="color:${lastBar && lastBar.close >= lastBar.open ? BULL : BEAR}">${lastBar ? fmtPrice(lastBar.high) : '-'}</span>
          <span style="color:${TEXT_DIM}">L</span><span style="color:${lastBar && lastBar.close >= lastBar.open ? BULL : BEAR}">${lastBar ? fmtPrice(lastBar.low) : '-'}</span>
          <span style="color:${TEXT_DIM}">C</span><span style="color:${lastBar && lastBar.close >= lastBar.open ? BULL : BEAR}">${lastBar ? fmtPrice(lastBar.close) : '-'}</span>
          <span style="color:${TEXT_DIM}">Vol</span><span style="color:${TEXT_DIM}">${lastBar ? lastBar.volume.toLocaleString() : '-'}</span>
        </div>

        <!-- Chart Area -->
        <div style="flex:1;position:relative;min-height:0">
          <canvas id="pt-chart-canvas" style="width:100%;height:100%;display:block"></canvas>
        </div>

        <!-- Account Metrics Bar -->
        <div class="pt-metrics" style="display:flex;align-items:center;gap:0;background:#1e222d;border-top:1px solid #2a2e39;border-bottom:1px solid #2a2e39;flex-shrink:0;padding:0 16px;min-height:42px;font-size:12px">
          <div style="display:flex;gap:24px;flex:1">
            <div><span style="color:${TEXT_DIM}">BALANCE</span><br><span class="font-mono" style="color:${TEXT};font-weight:600">${formatCurrency(balance)}</span></div>
            <div><span style="color:${TEXT_DIM}">PROFIT & LOSS</span><br><span class="font-mono" style="color:${pnl >= 0 ? BULL : BEAR};font-weight:600">${pnl >= 0 ? '+' : ''}${formatCurrency(pnl)}</span></div>
            <div><span style="color:${TEXT_DIM}">EQUITY</span><br><span class="font-mono" style="color:${TEXT};font-weight:600">${formatCurrency(equity)}</span></div>
            ${isMargin ? `
            <div><span style="color:${TEXT_DIM}">MARGIN USED</span><br><span class="font-mono" style="color:#ff9800;font-weight:600">${formatCurrency(usedMargin)}</span></div>
            <div><span style="color:${TEXT_DIM}">MARGIN AVAILABLE</span><br><span class="font-mono" style="color:${TEXT};font-weight:600">${formatCurrency(marginAvail)}</span></div>
            <div><span style="color:${TEXT_DIM}">MARGIN LEVEL</span><br><span class="font-mono" style="color:${marginLevel > 0.5 ? BULL : marginLevel > MARGIN_CALL_RATIO ? '#ff9800' : BEAR};font-weight:600">${marginLevel === Infinity ? '---' : (marginLevel * 100).toFixed(1) + '%'}</span></div>
            ` : ''}
          </div>
          <button id="pt-close-all-btn" style="background:#363a45;color:${TEXT};border:1px solid #4a4e59;border-radius:4px;padding:5px 16px;font-size:11px;cursor:pointer;font-weight:500;display:${positions.length > 0 ? 'block' : 'none'}">Close All ▾</button>
        </div>

        <!-- Bottom Panel: Positions / Closed -->
        <div class="pt-bottom" style="flex-shrink:0;max-height:240px;display:flex;flex-direction:column;background:#131722">
          <!-- Panel Tabs -->
          <div style="display:flex;align-items:center;gap:0;border-bottom:1px solid #2a2e39;padding:0 12px;min-height:32px">
            <button class="pt-panel-tab ${bottomTab === 'positions' ? 'active' : ''}" data-panel="positions" style="padding:6px 14px;font-size:12px;border:none;cursor:pointer;font-weight:500;border-bottom:2px solid ${bottomTab === 'positions' ? '#2962ff' : 'transparent'};color:${bottomTab === 'positions' ? TEXT : TEXT_DIM};background:transparent">
              Positions <span style="background:${positions.length > 0 ? '#2962ff' : '#363a45'};color:#fff;border-radius:3px;padding:0 5px;font-size:10px;margin-left:4px">${positions.length}</span>
            </button>
            <button class="pt-panel-tab ${bottomTab === 'closed' ? 'active' : ''}" data-panel="closed" style="padding:6px 14px;font-size:12px;border:none;cursor:pointer;font-weight:500;border-bottom:2px solid ${bottomTab === 'closed' ? '#2962ff' : 'transparent'};color:${bottomTab === 'closed' ? TEXT : TEXT_DIM};background:transparent">
              Closed Positions
            </button>
            <div style="flex:1"></div>
          </div>

          <!-- Panel Content -->
          <div id="pt-panel-content" style="flex:1;overflow-y:auto;font-size:12px">
            ${bottomTab === 'positions' ? renderPositionsTable(positions, isMargin) : renderClosedTable(closedTrades, isMargin)}
          </div>
        </div>

        <!-- Floating Order Panel (modeled after control.png) -->
        ${(() => {
          const spread = curPrice * 0.0003;
          const sellPrice = curPrice - spread;
          const buyPrice = curPrice + spread;
          const orderQty = 1000;
          const initMargin = isMargin ? `~${formatCurrency(orderQty / (3))}` : `~${formatCurrency(orderQty)}`;
          return `
        <div id="pt-order-widget" style="position:absolute;bottom:280px;left:50%;transform:translateX(-50%);background:#1e222d;border:1px solid #363a45;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.6);z-index:10;width:520px;overflow:hidden">
          <!-- Top Row: Symbol + Order Type Tabs + Collapse -->
          <div style="display:flex;align-items:center;padding:10px 16px;gap:10px;border-bottom:1px solid #2a2e39">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:14px;font-weight:700;color:${TEXT}">${selectedPair}</span>
            </div>
            <div style="display:flex;gap:0;margin-left:8px">
              <button class="pt-otype-btn active" data-otype="market" style="padding:5px 14px;font-size:11px;font-weight:600;border:1px solid #363a45;border-radius:4px 0 0 4px;cursor:pointer;background:#363a45;color:#fff;letter-spacing:0.3px">MARKET ⟲</button>
              <button class="pt-otype-btn" data-otype="pending" style="padding:5px 14px;font-size:11px;font-weight:600;border:1px solid #363a45;border-left:none;cursor:pointer;background:transparent;color:${TEXT_DIM};letter-spacing:0.3px">PENDING</button>
            </div>
            <div style="flex:1"></div>
            <button class="pt-otype-btn" style="padding:5px 14px;font-size:11px;font-weight:600;border:1px solid #363a45;border-radius:4px;cursor:pointer;background:transparent;color:${TEXT_DIM}">RISK</button>
            <button class="pt-otype-btn" style="padding:5px 14px;font-size:11px;font-weight:600;border:1px solid #363a45;border-radius:4px;cursor:pointer;background:transparent;color:${TEXT_DIM}">SL</button>
            <button class="pt-otype-btn" style="padding:5px 14px;font-size:11px;font-weight:600;border:1px solid #363a45;border-radius:4px;cursor:pointer;background:transparent;color:${TEXT_DIM}">TP</button>
            <button id="pt-widget-toggle" style="background:transparent;border:1px solid #363a45;border-radius:4px;color:${TEXT_DIM};cursor:pointer;padding:4px 8px;font-size:14px;line-height:1">⌃</button>
          </div>

          <!-- Margin Info -->
          <div style="text-align:center;padding:8px 16px;font-size:12px;color:${TEXT_DIM}">
            Init. Margin: <strong style="color:${TEXT}">${initMargin}</strong> ${isMargin ? `(${document.getElementById?.('pt-order-leverage')?.value || '3'}x)` : '(∞)'}
            ${isMargin ? `<select id="pt-order-leverage" style="background:#2a2e39;color:${TEXT};border:1px solid #363a45;border-radius:4px;padding:2px 6px;font-size:11px;margin-left:8px">${LEVERAGE_OPTIONS.map(l => `<option value="${l}" ${l === 3 ? 'selected' : ''}>${l}x</option>`).join('')}</select>` : ''}
          </div>

          <!-- Bottom Row: Sell / Qty / Buy -->
          <div style="display:flex;align-items:stretch;padding:8px 16px 14px;gap:0">
            <!-- SELL Box -->
            <button id="pt-sell-btn" style="flex:1;background:transparent;border:2px solid ${BEAR};border-radius:6px;padding:10px 8px;cursor:pointer;text-align:center">
              <div class="font-mono" style="font-size:18px;font-weight:700;color:${BEAR};line-height:1.2">${fmtPrice(sellPrice)}</div>
              <div style="font-size:10px;font-weight:600;color:${BEAR};letter-spacing:1px;margin-top:2px">SELL</div>
            </button>

            <!-- Qty Controls -->
            <div style="display:flex;align-items:center;gap:0;padding:0 12px;flex-shrink:0">
              <button id="pt-qty-minus" style="background:transparent;border:none;color:${TEXT_DIM};cursor:pointer;font-size:22px;padding:4px 8px;line-height:1">−</button>
              <div style="text-align:center;min-width:70px">
                <input id="pt-order-qty" type="number" value="1000" step="100" style="width:70px;background:transparent;border:none;color:${TEXT};text-align:center;font-size:18px;font-weight:700;font-family:var(--font-mono);outline:none;line-height:1.2">
                <div style="font-size:10px;color:${TEXT_DIM};letter-spacing:0.5px">USD</div>
              </div>
              <button id="pt-qty-plus" style="background:transparent;border:none;color:${TEXT_DIM};cursor:pointer;font-size:22px;padding:4px 8px;line-height:1">+</button>
            </div>

            <!-- BUY Box -->
            <button id="pt-buy-btn" style="flex:1;background:transparent;border:2px solid ${BULL};border-radius:6px;padding:10px 8px;cursor:pointer;text-align:center">
              <div class="font-mono" style="font-size:18px;font-weight:700;color:${BULL};line-height:1.2">${fmtPrice(buyPrice)}</div>
              <div style="font-size:10px;font-weight:600;color:${BULL};letter-spacing:1px;margin-top:2px">BUY</div>
            </button>
          </div>
        </div>`;
        })()}

      </div>
    `;

    // Render chart
    const priceCanvas = document.getElementById('pt-chart-canvas');
    if (priceCanvas) {
      const history = getPriceHistory(selectedPair);
      const relevantPositions = positions.filter(p => p.pair === selectedPair);
      renderCandlestickChart(priceCanvas, history, relevantPositions);
    }
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
            <td style="padding:6px 8px;text-align:center">
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
    renderView();
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
        openedAt: new Date().toISOString()
      });
    } else {
      ps.balance -= amount;
      ps.positions.push({
        pair: selectedPair, side, amount,
        entryPrice: Math.round(price * 10000) / 10000,
        quantity: Math.round(quantity * 10000) / 10000,
        openedAt: new Date().toISOString()
      });
      ps.equityCurve.push({ date: new Date().toISOString(), equity: Math.round(getTotalEquity() * 100) / 100 });
    }
    savePaperState(ps);
    const levText = isMargin ? ` (${leverage}x)` : '';
    showToast(`${side.toUpperCase()} ${selectedPair}${levText} — ${quantity.toFixed(4)} @ ${formatCurrency(price)}`, 'success');
    renderView();
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
          savePaperState(ps); closeModal(); showToast('Account reset', 'success'); renderView();
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

  // ── Delegated listeners ──
  container.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('.paper-close-btn');
    if (closeBtn) { handleClosePosition(Number(closeBtn.dataset.idx)); return; }

    const acctTab = e.target.closest('.pt-acct-tab');
    if (acctTab) { ps.activeTab = acctTab.dataset.tab; savePaperState(ps); renderView(); return; }

    const panelTab = e.target.closest('.pt-panel-tab');
    if (panelTab) { bottomTab = panelTab.dataset.panel; renderView(); return; }

    const tfBtn = e.target.closest('.pt-tf-btn');
    if (tfBtn) { renderView(); return; }

    if (e.target.closest('#pt-buy-btn')) { handleTrade('buy'); return; }
    if (e.target.closest('#pt-sell-btn')) { handleTrade('sell'); return; }
    if (e.target.closest('#pt-reset-btn')) { handleReset(); return; }
    if (e.target.closest('#pt-close-all-btn')) { handleCloseAll(); return; }

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
      renderView();
    }
  });

  // Resize handler
  const ro = new ResizeObserver(() => {
    const canvas = document.getElementById('pt-chart-canvas');
    if (canvas) {
      const isMargin = ps.activeTab === 'margin';
      const positions = isMargin ? ps.marginAccount.positions : ps.positions;
      const history = getPriceHistory(selectedPair);
      renderCandlestickChart(canvas, history, positions.filter(p => p.pair === selectedPair));
    }
  });

  renderView();

  requestAnimationFrame(() => {
    const chartArea = document.getElementById('pt-chart-canvas')?.parentElement;
    if (chartArea) ro.observe(chartArea);
  });

  onViewCleanup(() => { ro.disconnect(); });
}
