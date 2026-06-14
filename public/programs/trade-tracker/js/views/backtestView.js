// ============================================
// Backtest View — TRADE TRACKER
// Strategy builder, backtest results dashboard, trade log, and screener
// ============================================

import { setPageTitle } from '../components/topbar.js';
import { onViewCleanup } from '../router.js';
import { showToast } from '../components/toast.js';
import { formatCurrency, formatPercent } from '../utils/formatters.js';
import { INDICATOR_MAP, INDICATOR_CATEGORIES } from '../indicators.js?v=2';
import { BacktestEngine, runBacktest, screenSymbols } from '../backtesting.js';

// ─── Theme constants ───
const BG       = '#131722';
const CARD     = '#1e222d';
const BORDER   = '#2a2e39';
const TEXT      = '#d1d4dc';
const TEXT_DIM  = '#787b86';
const BULL      = '#26a69a';
const BEAR      = '#ef5350';
const ACCENT    = '#2962ff';
const FONT      = 'Inter, sans-serif';
const MONO      = "'JetBrains Mono', monospace";

const SYMBOLS = ['AAPL','TSLA','NVDA','SPY','MSFT','AMZN','GOOGL','META','BTC/USD','ETH/USD','XRP/USD','XAU/USD','EUR/USD','GBP/USD'];
const SEEDS = { 'AAPL': 185, 'TSLA': 248, 'NVDA': 892, 'SPY': 445, 'MSFT': 420, 'AMZN': 185, 'GOOGL': 175, 'META': 510, 'BTC/USD': 68500, 'ETH/USD': 3550, 'XRP/USD': 0.62, 'XAU/USD': 2380, 'EUR/USD': 1.085, 'GBP/USD': 1.268 };

const OPERATORS = [
  { value: 'greater_than',  label: '>' },
  { value: 'less_than',     label: '<' },
  { value: 'equals',        label: '=' },
  { value: 'crosses_above', label: 'Crosses Above' },
  { value: 'crosses_below', label: 'Crosses Below' },
  { value: 'between',       label: 'Between' },
];

function generateData(symbol) {
  let base = SEEDS[symbol] || 100 + Math.random() * 400;
  const data = [];
  for (let i = 0; i < 500; i++) {
    const change = (Math.random() - 0.48) * 0.03;
    const open = base, close = base * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.015);
    const low = Math.min(open, close) * (1 - Math.random() * 0.015);
    const volume = Math.floor(Math.random() * 50e6 + 10e6);
    data.push({ timestamp: new Date(Date.now() - (499 - i) * 864e5), open, high, low, close, volume });
    base = close;
  }
  return data;
}

function getIndicatorFields(key) {
  // Return reasonable field options per indicator type
  const ind = INDICATOR_MAP[key];
  if (!ind) return ['value'];
  // Try computing on tiny dataset to inspect structure
  const fields = ['value'];
  try {
    const testData = generateData('AAPL').slice(0, 60);
    const result = ind.fn(testData);
    if (result) {
      if (result.lines) {
        const labels = result.lines.map((l, i) => l.label || l.name || `line${i}`);
        if (labels.length > 0) return labels;
      }
      if (result.histogram) fields.push('histogram');
      if (result.band) { return ['upper', 'middle', 'lower']; }
    }
  } catch (_) { /* fallback */ }
  return fields;
}

function inputStyle(extra = '') {
  return `background:${BG};border:1px solid ${BORDER};color:${TEXT};padding:6px 10px;border-radius:4px;font-family:${FONT};font-size:12px;outline:none;${extra}`;
}

function btnStyle(primary = false) {
  const bg = primary ? ACCENT : CARD;
  const hover = primary ? '#1e53e5' : '#2a2e39';
  return `background:${bg};color:#fff;border:1px solid ${primary ? ACCENT : BORDER};padding:8px 20px;border-radius:4px;font-family:${FONT};font-size:13px;font-weight:600;cursor:pointer;transition:background .15s`;
}

function buildIndicatorOptions() {
  let html = '<option value="">Select Indicator</option>';
  for (const cat of INDICATOR_CATEGORIES) {
    html += `<optgroup label="${cat.name}">`;
    for (const ind of cat.indicators) {
      html += `<option value="${ind.key}">${ind.label}</option>`;
    }
    html += '</optgroup>';
  }
  return html;
}

function buildOperatorOptions() {
  return OPERATORS.map(op => `<option value="${op.value}">${op.label}</option>`).join('');
}

function buildFieldOptions(indicatorKey) {
  const fields = getIndicatorFields(indicatorKey);
  return fields.map(f => `<option value="${f}">${f}</option>`).join('');
}

// ─── Rule Row HTML ───
function ruleRowHTML(type, index, rule = {}) {
  const prefix = type === 'entry' ? 'entry' : 'exit';
  const actions = type === 'entry'
    ? '<option value="buy">Buy</option><option value="sell">Sell</option>'
    : '<option value="close_long">Close Long</option><option value="close_short">Close Short</option><option value="close">Close Any</option>';
  return `
    <div class="bt-rule-row" data-prefix="${prefix}" data-index="${index}" style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      <select class="bt-rule-indicator" style="${inputStyle('flex:1;min-width:160px')}">${buildIndicatorOptions()}</select>
      <select class="bt-rule-field" style="${inputStyle('width:100px')}">${rule.indicator ? buildFieldOptions(rule.indicator) : '<option value="value">value</option>'}</select>
      <select class="bt-rule-operator" style="${inputStyle('width:120px')}">${buildOperatorOptions()}</select>
      <input class="bt-rule-value" type="number" step="any" placeholder="Value" style="${inputStyle('width:80px')}" value="${rule.value ?? ''}">
      <select class="bt-rule-action" style="${inputStyle('width:110px')}">${actions}</select>
      <button class="bt-rule-remove" style="background:none;border:none;color:${BEAR};font-size:18px;cursor:pointer;padding:2px 6px" title="Remove">&times;</button>
    </div>`;
}


// ─── Main Render ───

export async function render(container) {
  setPageTitle('Backtesting');

  let entryRuleCount = 1;
  let exitRuleCount = 1;
  let lastResults = null;   // { metrics, trades, equityCurve } or screener results
  let lastMode = null;      // 'backtest' or 'screener'
  let sortCol = null;
  let sortAsc = true;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:calc(100vh - 56px);margin:-24px -32px;overflow-y:auto;background:${BG};color:${TEXT};font-family:${FONT}">

      <!-- Strategy Builder -->
      <div style="padding:20px 24px;border-bottom:1px solid ${BORDER}">
        <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:${TEXT}">Strategy Builder</h2>

        <!-- Config Row -->
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:16px">
          <label style="font-size:12px;color:${TEXT_DIM}">Symbol
            <select id="bt-symbol" style="${inputStyle('margin-left:6px')}">
              ${SYMBOLS.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:12px;color:${TEXT_DIM}">Initial Capital
            <input id="bt-capital" type="number" value="100000" style="${inputStyle('width:110px;margin-left:6px')}">
          </label>
          <label style="font-size:12px;color:${TEXT_DIM}">Commission %
            <input id="bt-commission" type="number" value="0.1" step="0.01" style="${inputStyle('width:70px;margin-left:6px')}">
          </label>
          <label style="font-size:12px;color:${TEXT_DIM}">Slippage %
            <input id="bt-slippage" type="number" value="0.05" step="0.01" style="${inputStyle('width:70px;margin-left:6px')}">
          </label>
          <label style="font-size:12px;color:${TEXT_DIM}">Position Size %
            <input id="bt-possize" type="number" value="10" step="1" min="1" max="100" style="${inputStyle('width:60px;margin-left:6px')}">
          </label>
        </div>

        <!-- Entry Rules -->
        <div style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:13px;font-weight:600;color:${BULL}">Entry Rules</span>
            <button id="bt-add-entry" style="${btnStyle()};padding:4px 12px;font-size:11px">+ Add</button>
          </div>
          <div id="bt-entry-rules">${ruleRowHTML('entry', 0)}</div>
        </div>

        <!-- Exit Rules -->
        <div style="margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <span style="font-size:13px;font-weight:600;color:${BEAR}">Exit Rules</span>
            <button id="bt-add-exit" style="${btnStyle()};padding:4px 12px;font-size:11px">+ Add</button>
          </div>
          <div id="bt-exit-rules">${ruleRowHTML('exit', 0)}</div>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;gap:12px">
          <button id="bt-run" style="${btnStyle(true)}">Run Backtest</button>
          <button id="bt-screener" style="${btnStyle()}">Run Screener</button>
        </div>
      </div>

      <!-- Results Area -->
      <div id="bt-results" style="flex:1;min-height:0;overflow-y:auto;padding:0 24px 24px"></div>
    </div>
  `;

  // ─── Event Wiring ───

  // Indicator change -> update field dropdown
  container.addEventListener('change', (e) => {
    if (e.target.classList.contains('bt-rule-indicator')) {
      const row = e.target.closest('.bt-rule-row');
      const fieldSel = row.querySelector('.bt-rule-field');
      fieldSel.innerHTML = buildFieldOptions(e.target.value);
    }
  });

  // Remove rule
  container.addEventListener('click', (e) => {
    if (e.target.classList.contains('bt-rule-remove')) {
      const row = e.target.closest('.bt-rule-row');
      row.remove();
    }
  });

  // Add entry rule
  document.getElementById('bt-add-entry').addEventListener('click', () => {
    const rulesDiv = document.getElementById('bt-entry-rules');
    rulesDiv.insertAdjacentHTML('beforeend', ruleRowHTML('entry', entryRuleCount++));
  });

  // Add exit rule
  document.getElementById('bt-add-exit').addEventListener('click', () => {
    const rulesDiv = document.getElementById('bt-exit-rules');
    rulesDiv.insertAdjacentHTML('beforeend', ruleRowHTML('exit', exitRuleCount++));
  });

  // Run Backtest
  document.getElementById('bt-run').addEventListener('click', () => {
    const strategy = collectStrategy();
    if (!strategy) return;
    const config = collectConfig();
    const symbol = document.getElementById('bt-symbol').value;
    const data = generateData(symbol);

    showToast(`Running backtest on ${symbol}...`, 'info');
    try {
      const result = runBacktest(data, { ...strategy, symbol }, config);
      if (result.error) { showToast(result.error, 'error'); return; }
      lastResults = result;
      lastMode = 'backtest';
      renderBacktestResults(result);
      showToast(`Backtest complete: ${result.trades.length} trades`, 'success');
    } catch (err) {
      console.error('[Backtest]', err);
      showToast('Backtest failed: ' + err.message, 'error');
    }
  });

  // Run Screener
  document.getElementById('bt-screener').addEventListener('click', () => {
    const strategy = collectStrategy();
    if (!strategy) return;

    showToast('Screening all symbols...', 'info');
    try {
      const symbolDataMap = {};
      for (const sym of SYMBOLS) {
        symbolDataMap[sym] = generateData(sym);
      }

      const criteria = {
        conditions: (strategy.entryRules || []).map(r => ({
          indicator: r.indicator,
          field: r.field,
          operator: r.operator,
          value: r.value,
          value2: r.value2,
        })),
        logic: 'AND',
      };

      const results = screenSymbols(symbolDataMap, criteria);
      lastResults = results;
      lastMode = 'screener';
      renderScreenerResults(results);
      const matchCount = results.filter(r => r.matches).length;
      showToast(`Screener complete: ${matchCount}/${results.length} symbols match`, 'success');
    } catch (err) {
      console.error('[Screener]', err);
      showToast('Screener failed: ' + err.message, 'error');
    }
  });


  // ─── Helpers ───

  function collectConfig() {
    return {
      initialCapital: parseFloat(document.getElementById('bt-capital').value) || 100000,
      commission: (parseFloat(document.getElementById('bt-commission').value) || 0.1) / 100,
      slippage: (parseFloat(document.getElementById('bt-slippage').value) || 0.05) / 100,
    };
  }

  function collectStrategy() {
    const entryRows = document.querySelectorAll('#bt-entry-rules .bt-rule-row');
    const exitRows = document.querySelectorAll('#bt-exit-rules .bt-rule-row');

    const entryRules = parseRules(entryRows);
    const exitRules = parseRules(exitRows);

    if (entryRules.length === 0) {
      showToast('Add at least one entry rule', 'error');
      return null;
    }

    return {
      name: 'Custom Strategy',
      entryRules,
      exitRules,
      positionSize: (parseFloat(document.getElementById('bt-possize').value) || 10) / 100,
    };
  }

  function parseRules(rows) {
    const rules = [];
    for (const row of rows) {
      const indicator = row.querySelector('.bt-rule-indicator').value;
      if (!indicator) continue;
      rules.push({
        indicator,
        field: row.querySelector('.bt-rule-field').value || 'value',
        operator: row.querySelector('.bt-rule-operator').value,
        value: parseFloat(row.querySelector('.bt-rule-value').value) || 0,
        action: row.querySelector('.bt-rule-action').value,
      });
    }
    return rules;
  }


  // ─── Render Backtest Results ───

  function renderBacktestResults(result) {
    const { metrics, trades, equityCurve } = result;
    const resultsDiv = document.getElementById('bt-results');
    if (!metrics) { resultsDiv.innerHTML = '<p style="color:' + TEXT_DIM + '">No results.</p>'; return; }

    const m = metrics;
    const profitColor = m.netProfit >= 0 ? BULL : BEAR;

    resultsDiv.innerHTML = `
      <!-- Stats Grid -->
      <div style="margin-top:20px">
        <h3 style="font-size:14px;font-weight:600;color:${TEXT};margin:0 0 12px">Performance Summary</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-bottom:20px">
          ${statCard('Net Profit', formatCurrency(m.netProfit), profitColor)}
          ${statCard('Return', (m.returnPercent >= 0 ? '+' : '') + m.returnPercent.toFixed(2) + '%', profitColor)}
          ${statCard('Total Trades', m.totalTrades, TEXT)}
          ${statCard('Win Rate', m.winRate.toFixed(1) + '%', m.winRate >= 50 ? BULL : BEAR)}
          ${statCard('Profit Factor', m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2), m.profitFactor >= 1 ? BULL : BEAR)}
          ${statCard('Sharpe Ratio', m.sharpeRatio.toFixed(2), m.sharpeRatio >= 1 ? BULL : TEXT)}
          ${statCard('Sortino Ratio', m.sortinoRatio.toFixed(2), m.sortinoRatio >= 1 ? BULL : TEXT)}
          ${statCard('Max Drawdown', m.maxDrawdownPercent.toFixed(2) + '%', BEAR)}
          ${statCard('Avg Win', formatCurrency(m.avgWin), BULL)}
          ${statCard('Avg Loss', formatCurrency(m.avgLoss), BEAR)}
          ${statCard('Largest Win', formatCurrency(m.largestWin), BULL)}
          ${statCard('Largest Loss', formatCurrency(m.largestLoss), BEAR)}
        </div>
      </div>

      <!-- Equity Curve -->
      <div style="background:${CARD};border:1px solid ${BORDER};border-radius:6px;margin-bottom:20px;overflow:hidden">
        <div style="padding:10px 16px;border-bottom:1px solid ${BORDER};font-size:13px;font-weight:600;color:${TEXT}">Equity Curve</div>
        <canvas id="bt-equity-canvas" style="width:100%;height:180px;display:block"></canvas>
      </div>

      <!-- Trade Log -->
      <div style="background:${CARD};border:1px solid ${BORDER};border-radius:6px;overflow:hidden">
        <div style="padding:10px 16px;border-bottom:1px solid ${BORDER};font-size:13px;font-weight:600;color:${TEXT}">Trade Log (${trades.length} trades)</div>
        <div style="overflow-x:auto;max-height:320px;overflow-y:auto" id="bt-trade-log-wrap">
          ${buildTradeTable(trades)}
        </div>
      </div>
    `;

    drawEquityCurve(equityCurve, m.initialCapital);
    wireTradeSort(trades);
  }

  function statCard(label, value, color) {
    return `<div style="background:${CARD};border:1px solid ${BORDER};border-radius:6px;padding:12px 14px">
      <div style="font-size:11px;color:${TEXT_DIM};margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">${label}</div>
      <div style="font-size:16px;font-weight:700;color:${color};font-family:${MONO}">${value}</div>
    </div>`;
  }

  function buildTradeTable(trades, sortKey, asc) {
    let sorted = trades.slice();
    if (sortKey) {
      sorted.sort((a, b) => {
        let va = a[sortKey], vb = b[sortKey];
        if (va instanceof Date) { va = va.getTime(); vb = vb.getTime(); }
        if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va);
        return asc ? va - vb : vb - va;
      });
    }

    const cols = [
      { key: '#', label: '#' },
      { key: 'side', label: 'Side' },
      { key: 'entryPrice', label: 'Entry' },
      { key: 'exitPrice', label: 'Exit' },
      { key: 'quantity', label: 'Qty' },
      { key: 'entryTime', label: 'Entry Date' },
      { key: 'exitTime', label: 'Exit Date' },
      { key: 'pnl', label: 'P&L' },
      { key: 'pnlPercent', label: 'P&L %' },
      { key: 'commission', label: 'Comm.' },
    ];

    const thStyle = `padding:8px 10px;text-align:left;font-size:11px;color:${TEXT_DIM};text-transform:uppercase;border-bottom:1px solid ${BORDER};cursor:pointer;user-select:none;white-space:nowrap`;
    const tdStyle = `padding:7px 10px;font-size:12px;font-family:${MONO};border-bottom:1px solid ${BORDER};white-space:nowrap`;

    let html = `<table style="width:100%;border-collapse:collapse"><thead><tr>`;
    for (const c of cols) {
      const arrow = sortKey === c.key ? (asc ? ' ▲' : ' ▼') : '';
      html += `<th data-sort="${c.key}" style="${thStyle}">${c.label}${arrow}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      const color = t.pnl >= 0 ? BULL : BEAR;
      const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)';
      const fmtPrice = (p) => p >= 1 ? p.toFixed(2) : p.toFixed(5);
      const fmtDate = (d) => d instanceof Date ? d.toLocaleDateString() : String(d).slice(0, 10);

      html += `<tr style="background:${rowBg}">`;
      html += `<td style="${tdStyle};color:${TEXT_DIM}">${i + 1}</td>`;
      html += `<td style="${tdStyle};color:${t.side === 'long' ? BULL : BEAR};font-weight:600">${t.side.toUpperCase()}</td>`;
      html += `<td style="${tdStyle}">${fmtPrice(t.entryPrice)}</td>`;
      html += `<td style="${tdStyle}">${fmtPrice(t.exitPrice)}</td>`;
      html += `<td style="${tdStyle}">${t.quantity}</td>`;
      html += `<td style="${tdStyle};color:${TEXT_DIM}">${fmtDate(t.entryTime)}</td>`;
      html += `<td style="${tdStyle};color:${TEXT_DIM}">${fmtDate(t.exitTime)}</td>`;
      html += `<td style="${tdStyle};color:${color};font-weight:600">${t.pnl >= 0 ? '+' : ''}${formatCurrency(t.pnl)}</td>`;
      html += `<td style="${tdStyle};color:${color}">${t.pnlPercent >= 0 ? '+' : ''}${t.pnlPercent.toFixed(2)}%</td>`;
      html += `<td style="${tdStyle};color:${TEXT_DIM}">${formatCurrency(t.commission)}</td>`;
      html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
  }

  function wireTradeSort(trades) {
    const wrap = document.getElementById('bt-trade-log-wrap');
    if (!wrap) return;
    wrap.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const key = th.dataset.sort;
      if (key === '#') return;
      if (sortCol === key) { sortAsc = !sortAsc; } else { sortCol = key; sortAsc = true; }
      wrap.innerHTML = buildTradeTable(trades, sortCol, sortAsc);
    });
  }


  // ─── Equity Curve Canvas ───

  function drawEquityCurve(curve, initialCapital) {
    const canvas = document.getElementById('bt-equity-canvas');
    if (!canvas || !curve || curve.equity.length < 2) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.scale(dpr, dpr);

    const PAD = { top: 16, bottom: 28, left: 60, right: 16 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;

    const eqs = curve.equity;
    let minE = Math.min(...eqs, initialCapital);
    let maxE = Math.max(...eqs, initialCapital);
    const range = maxE - minE || 1;
    minE -= range * 0.05; maxE += range * 0.05;
    const totalRange = maxE - minE;

    const toX = (i) => PAD.left + (i / (eqs.length - 1)) * cW;
    const toY = (v) => PAD.top + (1 - (v - minE) / totalRange) * cH;

    // Background
    ctx.fillStyle = CARD;
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = BORDER; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (cH / 4) * i;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
      // Y-axis labels
      const val = maxE - (i / 4) * totalRange;
      ctx.fillStyle = TEXT_DIM; ctx.font = '10px ' + MONO; ctx.textAlign = 'right';
      ctx.fillText(val >= 1000 ? (val / 1000).toFixed(1) + 'K' : val.toFixed(0), PAD.left - 6, y + 3);
    }

    // X-axis date labels
    const labelCount = Math.min(6, eqs.length);
    ctx.fillStyle = TEXT_DIM; ctx.font = '10px ' + MONO; ctx.textAlign = 'center';
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.floor((i / (labelCount - 1)) * (eqs.length - 1));
      const ts = curve.timestamps[idx];
      const dateStr = ts instanceof Date ? (ts.getMonth() + 1) + '/' + ts.getDate() : '';
      ctx.fillText(dateStr, toX(idx), H - 6);
    }

    // Initial capital dashed line
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = TEXT_DIM; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, toY(initialCapital)); ctx.lineTo(W - PAD.right, toY(initialCapital)); ctx.stroke();
    ctx.setLineDash([]);

    // Equity line
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < eqs.length; i++) {
      const x = toX(i), y = toY(eqs[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    const lastEq = eqs[eqs.length - 1];
    ctx.strokeStyle = lastEq >= initialCapital ? BULL : BEAR;
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(toX(eqs.length - 1), PAD.top + cH);
    ctx.lineTo(PAD.left, PAD.top + cH);
    ctx.closePath();
    ctx.fillStyle = lastEq >= initialCapital ? 'rgba(38,166,154,0.1)' : 'rgba(239,83,80,0.1)';
    ctx.fill();
  }


  // ─── Render Screener Results ───

  function renderScreenerResults(results) {
    const resultsDiv = document.getElementById('bt-results');

    const thStyle = `padding:8px 12px;text-align:left;font-size:11px;color:${TEXT_DIM};text-transform:uppercase;border-bottom:1px solid ${BORDER};cursor:pointer;user-select:none;white-space:nowrap`;
    const tdStyle = `padding:8px 12px;font-size:12px;font-family:${MONO};border-bottom:1px solid ${BORDER};white-space:nowrap`;

    const matchCount = results.filter(r => r.matches).length;

    let html = `
      <div style="margin-top:20px">
        <h3 style="font-size:14px;font-weight:600;color:${TEXT};margin:0 0 12px">Screener Results <span style="color:${TEXT_DIM};font-weight:400;font-size:12px">${matchCount} of ${results.length} match</span></h3>
        <div style="background:${CARD};border:1px solid ${BORDER};border-radius:6px;overflow:hidden">
          <div style="overflow-x:auto;max-height:500px;overflow-y:auto" id="bt-screener-wrap">
            <table style="width:100%;border-collapse:collapse">
              <thead><tr>
                <th style="${thStyle}">Symbol</th>
                <th style="${thStyle}">Price</th>
                <th style="${thStyle}">Change %</th>
                <th style="${thStyle}">Volume</th>
                <th style="${thStyle}">Match</th>
              </tr></thead>
              <tbody>`;

    for (const r of results) {
      const chColor = r.change >= 0 ? BULL : BEAR;
      const matchIcon = r.matches ? `<span style="color:${BULL};font-weight:700">YES</span>` : `<span style="color:${TEXT_DIM}">NO</span>`;
      const fmtPrice = r.price >= 1 ? r.price.toFixed(2) : r.price.toFixed(5);
      const fmtVol = r.volume >= 1e6 ? (r.volume / 1e6).toFixed(1) + 'M' : r.volume.toLocaleString();
      const rowBg = r.matches ? 'rgba(38,166,154,0.04)' : 'transparent';

      html += `<tr style="background:${rowBg}">
        <td style="${tdStyle};font-weight:600;color:${TEXT}">${r.symbol}</td>
        <td style="${tdStyle}">${fmtPrice}</td>
        <td style="${tdStyle};color:${chColor}">${r.change >= 0 ? '+' : ''}${r.change.toFixed(2)}%</td>
        <td style="${tdStyle};color:${TEXT_DIM}">${fmtVol}</td>
        <td style="${tdStyle}">${matchIcon}</td>
      </tr>`;
    }

    html += '</tbody></table></div></div></div>';
    resultsDiv.innerHTML = html;

    // Screener column sorting
    const wrap = document.getElementById('bt-screener-wrap');
    if (wrap) {
      let scrSortCol = null, scrSortAsc = true;
      wrap.addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th) return;
        const colIdx = Array.from(th.parentNode.children).indexOf(th);
        const keys = ['symbol', 'price', 'change', 'volume', 'matches'];
        const key = keys[colIdx];
        if (scrSortCol === key) { scrSortAsc = !scrSortAsc; } else { scrSortCol = key; scrSortAsc = true; }
        results.sort((a, b) => {
          let va = a[key], vb = b[key];
          if (typeof va === 'boolean') { va = va ? 1 : 0; vb = vb ? 1 : 0; }
          if (typeof va === 'string') return scrSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
          return scrSortAsc ? va - vb : vb - va;
        });
        renderScreenerResults(results);
      });
    }
  }


  // ─── Cleanup ───
  onViewCleanup(() => {
    setPageTitle('TRADE TRACKER');
  });
}
