// ============================================
// Chart View — Single Candlestick TradingView-style
// Full overlay canvas, RSI/MACD sub-panels, all tools
// 100 Technical Indicators across 6 categories
// ============================================

import { setPageTitle } from '../components/topbar.js';
import { onViewCleanup } from '../router.js';
import { showModal, closeModal } from '../components/modal.js';
import { INDICATOR_CATEGORIES, INDICATOR_MAP } from '../indicators.js?v=2';
import { getTrades } from '../store.js';
import { formatCurrency } from '../utils/formatters.js';
import { initAlerts, addAlert, removeAlert, getAlerts, checkAlerts, getActiveAlertCount } from '../components/alerts.js';
import { showToast } from '../components/toast.js';

const SYMBOLS = ['AAPL','TSLA','NVDA','SPY','MSFT','AMZN','GOOGL','META','BTC/USD','ETH/USD','XRP/USD','XAU/USD','EUR/USD','GBP/USD'];
const FAV_INDICATORS_KEY = 'tt_fav_indicators';
function loadFavoriteIndicators() { try { return JSON.parse(localStorage.getItem(FAV_INDICATORS_KEY)) || []; } catch { return []; } }
function saveFavoriteIndicators(favs) { localStorage.setItem(FAV_INDICATORS_KEY, JSON.stringify(favs)); }
const TIMEFRAMES = ['1m','5m','15m','1h','4h','1D','1W','1M'];

// Premium Lucide-quality SVG icons — rounded joins, 1.75 stroke, pixel-hinted
const I = (d, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  candlestick: I('<path d="M9 4v3"/><path d="M9 15v5"/><path d="M15 4v5"/><path d="M15 17v3"/><rect x="7" y="7" width="4" height="8" rx="1" fill="currentColor" opacity="0.15"/><rect x="13" y="9" width="4" height="8" rx="1"/><rect x="7" y="7" width="4" height="8" rx="1"/>'),
  line: I('<path d="M3 17l5-5 4 4 9-9"/><circle cx="21" cy="7" r="1.5" fill="currentColor" opacity="0.3"/>'),
  area: I('<path d="M3 17l5-5 4 4 9-9"/><path d="M3 17l5-5 4 4 9-9v10H3z" fill="currentColor" opacity="0.08"/>'),
  trendline: I('<path d="M4 20L20 4"/><circle cx="4" cy="20" r="2" fill="currentColor" opacity="0.25"/><circle cx="20" cy="4" r="2" fill="currentColor" opacity="0.25"/>'),
  horizontal: I('<path d="M2 12h20" stroke-dasharray="5 3"/><circle cx="2" cy="12" r="1.5" fill="currentColor" opacity="0.3"/><circle cx="22" cy="12" r="1.5" fill="currentColor" opacity="0.3"/>'),
  fibonacci: I('<path d="M4 4v16"/><path d="M4 4h16" opacity="0.7"/><path d="M4 8.5h16" opacity="0.5"/><path d="M4 12h16" opacity="0.4" stroke-dasharray="3 2"/><path d="M4 15.5h16" opacity="0.5"/><path d="M4 20h16" opacity="0.7"/><text x="21" y="5.5" font-size="5" fill="currentColor" stroke="none" opacity="0.5">0</text><text x="21" y="21" font-size="5" fill="currentColor" stroke="none" opacity="0.5">1</text>'),
  rectangle: I('<rect x="4" y="6" width="16" height="12" rx="1.5" stroke-dasharray="5 3"/><rect x="4" y="6" width="16" height="12" rx="1.5" fill="currentColor" opacity="0.05"/>'),
  text: I('<path d="M5 7V4h14v3"/><path d="M9 20h6"/><path d="M12 4v16"/><circle cx="12" cy="4" r="1" fill="currentColor" opacity="0.3"/>'),
  crosshair: I('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v5"/><path d="M12 17v5"/><path d="M2 12h5"/><path d="M17 12h5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>'),
  measure: I('<path d="M3 12h18"/><path d="M3 12l3.5-3.5"/><path d="M3 12l3.5 3.5"/><path d="M21 12l-3.5-3.5"/><path d="M21 12l-3.5 3.5"/><path d="M8 9v6" opacity="0.3"/><path d="M12 9v6" opacity="0.3"/><path d="M16 9v6" opacity="0.3"/>'),
  magnet: I('<path d="M6 3v5a6 6 0 0012 0V3"/><path d="M6 3h4"/><path d="M14 3h4"/><path d="M6 8h4"/><path d="M14 8h4"/><circle cx="12" cy="16" r="1" fill="currentColor" opacity="0.4"/>'),
  indicator: I('<path d="M3 3v18h18"/><path d="M7 14l3-6 4 4 5-8"/><circle cx="7" cy="14" r="1.5" fill="currentColor" opacity="0.2"/><circle cx="19" cy="4" r="1.5" fill="currentColor" opacity="0.2"/>'),
  maximize: I('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>'),
  minimize: I('<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>'),
  settings: I('<circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>'),
  chevDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  chevRight: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  camera: I('<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/><circle cx="12" cy="13" r="1.5" fill="currentColor" opacity="0.15"/>'),
  undo: I('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>'),
  redo: I('<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.13-9.36L23 10"/>'),
  trash: I('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>'),
  replay: I('<path d="M3 12a9 9 0 109-9"/><polyline points="3 3 3 9 9 9" fill="none"/><path d="M7 15l2-3h6l2 3" opacity="0.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
  bell: I('<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>'),
};

const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS = ['#f85149','#ffa657','#d2a8ff','#58a6ff','#79c0ff','#56d364','#f85149'];

const DEFAULT_FIB_CURVES = [
  { visible: true,  coefficient: -1.618, color: '#56d364', style: 'dashed', width: 1 },
  { visible: true,  coefficient: -0.618, color: '#56d364', style: 'dashed', width: 1 },
  { visible: true,  coefficient: -0.27,  color: '#56d364', style: 'dashed', width: 1 },
  { visible: true,  coefficient:  0,     color: '#58a6ff', style: 'dashed', width: 1 },
  { visible: false, coefficient:  0.236, color: '#58a6ff', style: 'dashed', width: 1 },
  { visible: true,  coefficient:  0.382, color: '#58a6ff', style: 'dashed', width: 1 },
  { visible: true,  coefficient:  0.5,   color: '#58a6ff', style: 'dashed', width: 1 },
  { visible: true,  coefficient:  0.618, color: '#58a6ff', style: 'dashed', width: 1 },
  { visible: false, coefficient:  0.702, color: '#ffd23f', style: 'dashed', width: 1 },
  { visible: true,  coefficient:  0.786, color: '#58a6ff', style: 'dashed', width: 1 },
  { visible: true,  coefficient:  0.886, color: '#58a6ff', style: 'dashed', width: 1 },
  { visible: true,  coefficient:  1,     color: '#f85149', style: 'dashed', width: 1 },
  { visible: true,  coefficient:  1.1,   color: '#f85149', style: 'dashed', width: 1 },
];
let FIB_DEFAULT_OVERRIDE = null;
let fibNameCounter = 0;
function makeDefaultFibProps() {
  const base = FIB_DEFAULT_OVERRIDE || {
    leftExtension: 'Off', rightExtension: 'On',
    showCoefficients: 'On the right', showPrice: 'On the right',
    curves: DEFAULT_FIB_CURVES,
    trendlineColor: '#30363d', trendlineStyle: 'dashed', trendlineWidth: 1,
  };
  return {
    name: `Fibonacci Retracements${++fibNameCounter}`,
    leftExtension: base.leftExtension,
    rightExtension: base.rightExtension,
    showCoefficients: base.showCoefficients,
    showPrice: base.showPrice,
    curves: base.curves.map(c => ({ ...c })),
    trendlineColor: base.trendlineColor,
    trendlineStyle: base.trendlineStyle,
    trendlineWidth: base.trendlineWidth,
  };
}
function setDash(ctx, style) {
  if (style === 'solid') ctx.setLineDash([]);
  else if (style === 'dotted') ctx.setLineDash([2, 3]);
  else ctx.setLineDash([5, 4]);
}

const DEFAULT_SETTINGS = () => ({
  bgColor: '#0d1117', gridColor: 'rgba(48,54,61,0.5)', showGrid: true,
  bullColor: '#56d364', bearColor: '#f85149',
  crosshairColor: 'rgba(88,166,255,0.35)',
});

export async function render(container) {
  setPageTitle('Chart');

  // Build categorized indicator menu HTML
  let favIndicators = loadFavoriteIndicators();

  // Flat lookup: key -> {label, color, category}
  const allIndicatorsFlat = {};
  INDICATOR_CATEGORIES.forEach(cat => cat.indicators.forEach(ind => { allIndicatorsFlat[ind.key] = { ...ind, category: cat.name, catColor: cat.color }; }));

  function buildIndicatorMenuHTML() {
    let activeKeys;
    try { activeKeys = cs.indicators; } catch(e) { activeKeys = ['VOL', 'BB', 'MACD']; }
    const favKeys = favIndicators.filter(k => allIndicatorsFlat[k]);

    // Active section
    const activeSection = activeKeys.length > 0 ? `
      <div class="tv-ind-category tv-ind-section-active" data-cat="__active__">
        <div class="tv-ind-cat-header" style="border-left: 3px solid #3b82f6">
          <span class="tv-ind-cat-chevron" style="transform:rotate(90deg)">${ICONS.chevRight}</span>
          <span class="tv-ind-cat-name">Active</span>
          <span class="tv-ind-cat-count">${activeKeys.length}</span>
        </div>
        <div class="tv-ind-cat-items" style="display:block">
          ${activeKeys.map(key => {
            const ind = allIndicatorsFlat[key];
            if (!ind) return '';
            const isFav = favIndicators.includes(key);
            return `<div class="tv-indicator-item tv-ind-active-item" data-indicator="${key}" style="background:rgba(88,166,255,0.06)">
              <input type="checkbox" checked />
              <span class="tv-ind-dot" style="background:${ind.color}"></span>
              <span class="tv-ind-label">${ind.label}</span>
              <span class="tv-ind-fav-btn" data-fav-key="${key}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}" style="margin-left:auto;cursor:pointer;font-size:13px;opacity:${isFav ? '1' : '0.3'};color:#ffa657;transition:opacity 150ms">${isFav ? '★' : '☆'}</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Favorites section
    const favSection = favKeys.length > 0 ? `
      <div class="tv-ind-category tv-ind-section-favs" data-cat="__favorites__">
        <div class="tv-ind-cat-header" style="border-left: 3px solid #ffa657">
          <span class="tv-ind-cat-chevron" style="transform:rotate(90deg)">${ICONS.chevRight}</span>
          <span class="tv-ind-cat-name">★ Favorites</span>
          <span class="tv-ind-cat-count">${favKeys.length}</span>
        </div>
        <div class="tv-ind-cat-items" style="display:block">
          ${favKeys.map(key => {
            const ind = allIndicatorsFlat[key];
            if (!ind) return '';
            const isActive = activeKeys.includes(key);
            return `<div class="tv-indicator-item tv-ind-fav-item" data-indicator="${key}">
              <input type="checkbox" ${isActive ? 'checked' : ''} />
              <span class="tv-ind-dot" style="background:${ind.color}"></span>
              <span class="tv-ind-label">${ind.label}</span>
              <span class="tv-ind-fav-btn" data-fav-key="${key}" title="Remove from favorites" style="margin-left:auto;cursor:pointer;font-size:13px;opacity:1;color:#ffa657;transition:opacity 150ms">★</span>
            </div>`;
          }).join('')}
        </div>
      </div>` : '';

    // Category sections
    const categoryHTML = INDICATOR_CATEGORIES.map(cat => `
      <div class="tv-ind-category" data-cat="${cat.name}">
        <div class="tv-ind-cat-header" style="border-left: 3px solid ${cat.color}">
          <span class="tv-ind-cat-chevron">${ICONS.chevRight}</span>
          <span class="tv-ind-cat-name">${cat.name}</span>
          <span class="tv-ind-cat-count">${cat.count}</span>
        </div>
        <div class="tv-ind-cat-items" style="display:none">
          ${cat.indicators.map(ind => {
            const isActive = activeKeys.includes(ind.key);
            const isFav = favIndicators.includes(ind.key);
            return `<label class="tv-indicator-item" data-indicator="${ind.key}" style="${isActive ? 'background:rgba(88,166,255,0.06)' : ''}">
              <input type="checkbox" ${isActive ? 'checked' : ''} />
              <span class="tv-ind-dot" style="background:${ind.color}"></span>
              <span class="tv-ind-label">${ind.label}</span>
              <span class="tv-ind-fav-btn" data-fav-key="${ind.key}" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}" style="margin-left:auto;cursor:pointer;font-size:13px;opacity:${isFav ? '1' : '0.3'};color:#ffa657;transition:opacity 150ms">${isFav ? '★' : '☆'}</span>
            </label>`;
          }).join('')}
        </div>
      </div>
    `).join('');

    return activeSection + favSection + categoryHTML;
  }

  const indicatorMenuHTML = buildIndicatorMenuHTML();

  container.innerHTML = `
    <div class="tv-chart-wrapper">
      <div class="tv-toolbar">
        <div class="tv-toolbar-left">
          <div class="tv-dropdown" id="symbol-dropdown">
            <button class="tv-toolbar-btn tv-symbol-btn" id="symbol-btn">
              ${ICONS.search}
              <span id="active-symbol">AAPL</span>
              ${ICONS.chevDown}
            </button>
            <div class="tv-dropdown-menu" id="symbol-menu">
              <input type="text" class="tv-dropdown-search" placeholder="Search symbol..." id="symbol-search-input" />
              <div class="tv-dropdown-list" id="symbol-list"></div>
            </div>
          </div>
          <div class="tv-timeframe-bar" id="timeframe-bar">
            ${TIMEFRAMES.map(tf => `<button class="tv-tf-btn ${tf === '1D' ? 'active' : ''}" data-tf="${tf}">${tf}</button>`).join('')}
          </div>
          <div class="tv-separator"></div>
          <div class="tv-btn-group">
            <button class="tv-toolbar-btn active" data-chart-type="candlestick" title="Candlestick">${ICONS.candlestick}</button>
            <button class="tv-toolbar-btn" data-chart-type="line" title="Line">${ICONS.line}</button>
            <button class="tv-toolbar-btn" data-chart-type="area" title="Area">${ICONS.area}</button>
          </div>
          <div class="tv-separator"></div>
          <div class="tv-dropdown" id="indicator-dropdown">
            <button class="tv-toolbar-btn" id="indicator-btn" title="Indicators">
              ${ICONS.indicator}
              <span>Indicators</span>
              <span class="tv-ind-badge" id="ind-badge">3</span>
              ${ICONS.chevDown}
            </button>
            <div class="tv-dropdown-menu tv-indicator-menu" id="indicator-menu">
              <div class="tv-dropdown-title">Technical Indicators <span class="tv-ind-total">100 indicators</span></div>
              <input type="text" class="tv-dropdown-search" placeholder="Search indicators..." id="indicator-search-input" />
              <div class="tv-ind-categories" id="indicator-categories">
                ${indicatorMenuHTML}
              </div>
            </div>
          </div>
        </div>
        <div class="tv-toolbar-right">
          <button class="tv-toolbar-btn" id="replay-btn" title="Trade Replay">${ICONS.replay}<span>Replay</span></button>
          <button class="tv-toolbar-btn" id="alert-btn" title="Price Alerts">${ICONS.bell}<span>Alerts</span><span class="tv-ind-badge" id="alert-badge" style="display:none">0</span></button>
          <div class="tv-separator"></div>
          <button class="tv-toolbar-btn disabled" id="undo-btn" title="Undo (Ctrl+Z)">${ICONS.undo}</button>
          <button class="tv-toolbar-btn disabled" id="redo-btn" title="Redo (Ctrl+Shift+Z)">${ICONS.redo}</button>
          <div class="tv-separator"></div>
          <button class="tv-toolbar-btn" id="screenshot-btn" title="Screenshot">${ICONS.camera}</button>
          <button class="tv-toolbar-btn" id="settings-btn" title="Chart Settings">${ICONS.settings}</button>
          <button class="tv-toolbar-btn" id="maximize-btn" title="Fullscreen">${ICONS.maximize}</button>
        </div>
      </div>

      <div class="tv-body">
        <div class="tv-draw-sidebar">
          <button class="tv-draw-btn active" data-tool="crosshair" title="Crosshair">${ICONS.crosshair}</button>
          <div class="tv-draw-sep"></div>
          <button class="tv-draw-btn" data-tool="trendline" title="Trendline">${ICONS.trendline}</button>
          <button class="tv-draw-btn" data-tool="horizontal" title="Horizontal Line">${ICONS.horizontal}</button>
          <button class="tv-draw-btn" data-tool="fibonacci" title="Fibonacci Retracement">${ICONS.fibonacci}</button>
          <button class="tv-draw-btn" data-tool="rectangle" title="Rectangle">${ICONS.rectangle}</button>
          <button class="tv-draw-btn" data-tool="text" title="Text Annotation">${ICONS.text}</button>
          <div class="tv-draw-sep"></div>
          <button class="tv-draw-btn" data-tool="measure" title="Measure">${ICONS.measure}</button>
          <button class="tv-draw-btn" data-tool="magnet" title="Magnet Mode">${ICONS.magnet}</button>
          <div class="tv-draw-sep"></div>
          <button class="tv-draw-btn tv-draw-danger" id="clear-drawings-btn" title="Clear Drawings">${ICONS.trash}</button>
        </div>

        <div class="tv-chart-area" id="chart-area">
          <canvas id="main-chart-canvas"></canvas>
          <canvas id="overlay-chart-canvas"></canvas>

          <div class="tv-chart-nav" id="chart-nav-bar">
            <button class="tv-chart-nav-btn" id="chart-zoom-out" title="Zoom out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>
            </button>
            <button class="tv-chart-nav-btn" id="chart-zoom-in" title="Zoom in">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            </button>
            <button class="tv-chart-nav-btn" id="chart-nav-left" title="Scroll left">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <button class="tv-chart-nav-btn" id="chart-nav-right" title="Scroll right">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
            <button class="tv-chart-nav-btn" id="chart-nav-reset" title="Reset view">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 105.64-8.36L1 10"/></svg>
            </button>
          </div>

          <div class="tv-ohlcv-overlay" id="ohlcv-overlay">
            <span class="tv-ohlcv-symbol" id="overlay-symbol">AAPL</span>
            <span class="tv-ohlcv-tf" id="overlay-tf">1D</span>
            <span class="tv-ohlcv-label">O</span><span class="tv-ohlcv-val" id="overlay-open">-</span>
            <span class="tv-ohlcv-label">H</span><span class="tv-ohlcv-val" id="overlay-high">-</span>
            <span class="tv-ohlcv-label">L</span><span class="tv-ohlcv-val" id="overlay-low">-</span>
            <span class="tv-ohlcv-label">C</span><span class="tv-ohlcv-val" id="overlay-close">-</span>
            <span class="tv-ohlcv-change" id="overlay-change">-</span>
            <span class="tv-ohlcv-label tv-ml">Vol</span><span class="tv-ohlcv-val" id="overlay-vol">-</span>
          </div>
          <div class="tv-indicator-overlay" id="indicator-overlay"></div>
        </div>
      </div>

      <div class="tv-statusbar">
        <div class="tv-statusbar-left">
          <span class="tv-status-dot tv-dot-green"></span>
          <span>Market Open</span>
          <span class="tv-status-sep">|</span>
          <span id="status-price" class="tv-status-price">$0.00</span>
          <span id="status-change" class="tv-status-change">+0.00 (0.00%)</span>
        </div>
        <div class="tv-statusbar-right">
          <span id="status-time"></span>
        </div>
      </div>
    </div>
  `;

  // ---- State ----
  const VISIBLE_BARS = 120;
  const TOTAL_BARS = 500;
  const SCROLL_STEP = 20;
  const cs = {
    symbol: 'AAPL', timeframe: '1D', chartType: 'candlestick',
    indicators: ['VOL', 'BB', 'MACD'], activeTool: 'crosshair',
    drawings: [], undoStack: [], redoStack: [],
    drawingInProgress: null, activeMeasurement: null,
    data: [], fullData: [], viewStart: 0, visibleBars: VISIBLE_BARS, indicatorCache: {},
    isMaximized: false, magnetMode: false, showTradeReplay: false,
    settings: DEFAULT_SETTINGS(),
  };

  function updateViewData() {
    cs.data = cs.fullData.slice(cs.viewStart, cs.viewStart + cs.visibleBars);
    invalidateCache();
    updateNavArrows();
  }

  function updateNavArrows() {
    const leftBtn = document.getElementById('chart-nav-left');
    const rightBtn = document.getElementById('chart-nav-right');
    const zoomInBtn = document.getElementById('chart-zoom-in');
    const zoomOutBtn = document.getElementById('chart-zoom-out');
    if (leftBtn) leftBtn.classList.toggle('disabled', cs.viewStart <= 0);
    if (rightBtn) rightBtn.classList.toggle('disabled', cs.viewStart >= cs.fullData.length - cs.visibleBars);
    if (zoomInBtn) zoomInBtn.classList.toggle('disabled', cs.visibleBars <= 30);
    if (zoomOutBtn) zoomOutBtn.classList.toggle('disabled', cs.visibleBars >= cs.fullData.length);
  }

  // ---- Canvas refs ----
  const mainCanvas = document.getElementById('main-chart-canvas');
  const overlayCanvas = document.getElementById('overlay-chart-canvas');
  if (!mainCanvas || !overlayCanvas) return;
  const mainCtx = mainCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');
  if (!mainCtx || !overlayCtx) return;
  let updateInterval = null;
  const RIGHT_MARGIN = 72;
  const BOTTOM_MARGIN = 28;

  // ---- Indicator computation & caching ----
  function invalidateCache() { cs.indicatorCache = {}; }

  function getIndicatorResult(key) {
    if (cs.indicatorCache[key]) return cs.indicatorCache[key];
    const def = INDICATOR_MAP[key];
    if (!def || !def.fn) return null;
    const result = def.fn(cs.data);
    cs.indicatorCache[key] = result;
    return result;
  }

  // Collect sub-panel indicators
  function getPanelIndicators() {
    const panels = [];
    for (const key of cs.indicators) {
      const result = getIndicatorResult(key);
      if (result && result.type === 'panel') panels.push({ key, result });
    }
    return panels;
  }

  // ---- Layout helpers ----
  function getLayout() {
    const area = document.getElementById('chart-area');
    if (!area) return null;
    const rect = area.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const panelIndicators = getPanelIndicators();
    const subCount = panelIndicators.length;
    const maxSubFraction = 0.5;
    const subFraction = Math.min(subCount * 0.12, maxSubFraction);
    const subTotalH = Math.floor((h - BOTTOM_MARGIN) * subFraction);
    const subH = subCount > 0 ? Math.floor(subTotalH / subCount) : 0;
    const mainH = h - BOTTOM_MARGIN - subH * subCount;
    const chartW = w - RIGHT_MARGIN;
    const panels = [];
    let yOffset = mainH;
    for (const pi of panelIndicators) {
      panels.push({ key: pi.key, result: pi.result, y: yOffset, h: subH });
      yOffset += subH;
    }
    return { w, h, chartW, mainH, panels, subH, subCount };
  }

  function getPriceRange() {
    const d = cs.data;
    if (!d.length) return { min: 0, max: 1 };
    const min = Math.min(...d.map(c => c.low));
    const max = Math.max(...d.map(c => c.high));
    const pad = (max - min) * 0.08;
    return { min: min - pad, max: max + pad };
  }

  // ---- Resize ----
  function resizeCanvas() {
    const area = document.getElementById('chart-area');
    if (!area) return;
    const rect = area.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    [mainCanvas, overlayCanvas].forEach(c => {
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      c.style.width = rect.width + 'px';
      c.style.height = rect.height + 'px';
    });
    drawChart();
  }

  // ---- Data generation ----
  function generateData(symbol) {
    const seeds = { 'AAPL': 185, 'TSLA': 248, 'NVDA': 892, 'SPY': 445, 'MSFT': 420, 'AMZN': 185, 'GOOGL': 175, 'META': 510, 'BTC/USD': 68500, 'ETH/USD': 3550, 'XRP/USD': 0.62, 'XAU/USD': 2380, 'EUR/USD': 1.085, 'GBP/USD': 1.268 };
    let base = seeds[symbol] || 100 + Math.random() * 400;
    const data = [];
    for (let i = 0; i < TOTAL_BARS; i++) {
      const change = (Math.random() - 0.48) * 0.03;
      const open = base, close = base * (1 + change);
      const high = Math.max(open, close) * (1 + Math.random() * 0.015);
      const low = Math.min(open, close) * (1 - Math.random() * 0.015);
      const volume = Math.floor(Math.random() * 50e6 + 10e6);
      data.push({ timestamp: new Date(Date.now() - (TOTAL_BARS - 1 - i) * 864e5), open, high, low, close, volume });
      base = close;
    }
    return data;
  }

  // ---- Format ----
  function fmt(n) { return n >= 1 ? n.toFixed(2) : n.toFixed(5); }

  // ---- Generic indicator rendering ----

  function drawOverlayIndicator(ctx, result, chartW, mainH, min, range, data) {
    if (!result) return;
    const toY = (p) => mainH - ((p - min) / range) * mainH;
    const toX = (i) => (i / data.length) * chartW + (chartW / data.length) / 2;

    // Band fills (Bollinger, Keltner, etc.)
    if (result.band) {
      const { upper, lower, fill } = result.band;
      if (fill) {
        ctx.fillStyle = fill;
        ctx.beginPath();
        let started = false;
        for (let j = 0; j < upper.length; j++) {
          if (upper[j] === null) continue;
          const x = toX(j);
          if (!started) { ctx.moveTo(x, toY(upper[j])); started = true; } else ctx.lineTo(x, toY(upper[j]));
        }
        for (let j = lower.length - 1; j >= 0; j--) {
          if (lower[j] === null) continue;
          ctx.lineTo(toX(j), toY(lower[j]));
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // Cloud fills (Ichimoku)
    if (result.cloud) {
      const { senkouA, senkouB, bullColor, bearColor } = result.cloud;
      for (let i = 1; i < data.length; i++) {
        if (senkouA[i] === null || senkouB[i] === null || senkouA[i-1] === null || senkouB[i-1] === null) continue;
        ctx.fillStyle = senkouA[i] >= senkouB[i] ? bullColor : bearColor;
        ctx.beginPath();
        ctx.moveTo(toX(i-1), toY(senkouA[i-1]));
        ctx.lineTo(toX(i), toY(senkouA[i]));
        ctx.lineTo(toX(i), toY(senkouB[i]));
        ctx.lineTo(toX(i-1), toY(senkouB[i-1]));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Lines
    if (result.lines) {
      for (const line of result.lines) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width || 1.5;
        if (line.dash) ctx.setLineDash(line.dash);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < data.length; i++) {
          if (line.values[i] === null || line.values[i] === undefined) continue;
          const x = toX(i), y = toY(line.values[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (line.dash) ctx.setLineDash([]);
      }
    }

    // Dots (Parabolic SAR)
    if (result.dots) {
      for (const dot of result.dots) {
        const r = dot.radius || 2;
        for (let i = 0; i < data.length; i++) {
          if (dot.values[i] === null) continue;
          ctx.fillStyle = dot.directions && dot.directions[i] === 1 ? dot.bullColor : dot.bearColor;
          ctx.beginPath();
          ctx.arc(toX(i), toY(dot.values[i]), r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Segments (SuperTrend — color changes by direction)
    if (result.segments) {
      for (const seg of result.segments) {
        ctx.lineWidth = seg.width || 2;
        for (let i = 1; i < data.length; i++) {
          if (seg.values[i] === null || seg.values[i - 1] === null) continue;
          ctx.strokeStyle = seg.directions[i] === 1 ? seg.bullColor : seg.bearColor;
          ctx.beginPath();
          ctx.moveTo(toX(i - 1), toY(seg.values[i - 1]));
          ctx.lineTo(toX(i), toY(seg.values[i]));
          ctx.stroke();
        }
      }
    }

    // Markers (Fractals)
    if (result.markers) {
      for (const marker of result.markers) {
        for (let i = 0; i < data.length; i++) {
          if (marker.values[i] === null) continue;
          const x = toX(i), y = toY(marker.values[i]) + (marker.offset || 0);
          ctx.fillStyle = marker.color;
          const s = marker.size || 6;
          ctx.beginPath();
          if (marker.symbol === 'triangle_up') {
            ctx.moveTo(x, y - s); ctx.lineTo(x - s / 2, y); ctx.lineTo(x + s / 2, y);
          } else {
            ctx.moveTo(x, y + s); ctx.lineTo(x - s / 2, y); ctx.lineTo(x + s / 2, y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  function drawVolumeProfile(ctx, result, chartW, mainH, min, range) {
    if (result.type !== 'volume_profile' || !result.profile) return;
    const { profile, lo, hi, step, bins } = result;
    const maxVol = Math.max(...profile);
    const barMaxW = chartW * 0.15;
    const toY = (p) => mainH - ((p - min) / range) * mainH;
    ctx.globalAlpha = 0.2;
    for (let b = 0; b < bins; b++) {
      const price = lo + b * step;
      const y1 = toY(price + step), y2 = toY(price);
      const w = (profile[b] / maxVol) * barMaxW;
      ctx.fillStyle = profile[b] === maxVol ? 'rgba(255,193,7,0.5)' : 'rgba(88,166,255,0.35)';
      ctx.fillRect(0, Math.min(y1, y2), w, Math.abs(y2 - y1));
    }
    ctx.globalAlpha = 1;
  }

  function drawDarvasBoxes(ctx, result, chartW, mainH, min, range, data) {
    if (result.type !== 'darvas' || !result.boxes) return;
    const toY = (p) => mainH - ((p - min) / range) * mainH;
    const toX = (i) => (i / data.length) * chartW;
    ctx.strokeStyle = 'rgba(120,144,156,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const box of result.boxes) {
      const x1 = toX(box.start), x2 = toX(box.end);
      const y1 = toY(box.high), y2 = toY(box.low);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.fillStyle = 'rgba(120,144,156,0.05)';
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    ctx.setLineDash([]);
  }

  function drawRenkoBricks(ctx, result, chartW, mainH, min, range, data) {
    if (result.type !== 'renko' || !result.bricks) return;
    const toY = (p) => mainH - ((p - min) / range) * mainH;
    const toX = (i) => (i / data.length) * chartW;
    const brickH = Math.abs(toY(min) - toY(min + result.brickSize));
    const brickW = Math.max(chartW / data.length * 0.8, 4);
    for (const brick of result.bricks) {
      const x = toX(brick.idx);
      const y = toY(brick.price);
      ctx.fillStyle = brick.dir === 1 ? 'rgba(86,211,100,0.35)' : 'rgba(248,81,73,0.35)';
      ctx.strokeStyle = brick.dir === 1 ? '#56d364' : '#f85149';
      ctx.lineWidth = 1;
      ctx.fillRect(x - brickW / 2, y, brickW, brick.dir === 1 ? -brickH : brickH);
      ctx.strokeRect(x - brickW / 2, y, brickW, brick.dir === 1 ? -brickH : brickH);
    }
  }

  function drawPanelIndicator(ctx, panel, chartW, data) {
    const { result, y: py, h: ph } = panel;
    if (!result) return;

    // Separator
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(chartW, py); ctx.stroke();
    // Background
    ctx.fillStyle = 'rgba(13,17,23,0.6)'; ctx.fillRect(0, py, chartW, ph);
    // Grid
    if (cs.settings.showGrid) {
      ctx.strokeStyle = cs.settings.gridColor; ctx.lineWidth = 0.3;
      for (let g = 1; g < 4; g++) { const gy = py + (ph / 4) * g; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(chartW, gy); ctx.stroke(); }
    }

    // Determine Y-axis range
    let yMin, yMax;
    if (result.auto) {
      const allVals = [];
      if (result.lines) result.lines.forEach(l => l.values.forEach(v => { if (v !== null) allVals.push(v); }));
      if (result.histogram) result.histogram.values.forEach(v => { if (v !== null) allVals.push(v); });
      if (result.histogram2) result.histogram2.values.forEach(v => { if (v !== null) allVals.push(v); });
      if (allVals.length) { yMin = Math.min(...allVals); yMax = Math.max(...allVals); }
      else { yMin = 0; yMax = 1; }
      const pad = (yMax - yMin) * 0.1 || 1;
      yMin -= pad; yMax += pad;
    } else {
      yMin = result.min ?? 0;
      yMax = result.max ?? 100;
    }
    const yRange = yMax - yMin;
    const toMY = (v) => py + ph - ((v - yMin) / yRange) * ph;

    // Zone lines
    if (result.zones) {
      result.zones.forEach(zone => {
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = 0.7;
        if (zone.dash && zone.dash[0] > 0) ctx.setLineDash(zone.dash);
        ctx.beginPath();
        const zy = toMY(zone.y);
        ctx.moveTo(0, zy); ctx.lineTo(chartW, zy);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }

    // Fills
    if (result.fills) {
      result.fills.forEach(fill => {
        ctx.fillStyle = fill.color;
        const y1 = toMY(fill.from), y2 = toMY(fill.to);
        ctx.fillRect(0, Math.min(y1, y2), chartW, Math.abs(y2 - y1));
      });
    }

    // Histogram
    const drawHist = (hist) => {
      if (!hist || !hist.values) return;
      const candleW = (chartW / data.length) * 0.6;
      for (let i = 0; i < data.length; i++) {
        if (hist.values[i] === null) continue;
        const x = (i / data.length) * chartW + (chartW / data.length - candleW) / 2;
        const zeroY = toMY(0);
        const valY = toMY(hist.values[i]);
        let color;
        if (hist.useChange) {
          const prev = i > 0 ? (hist.values[i - 1] ?? 0) : 0;
          color = hist.values[i] >= prev ? hist.bullColor : hist.bearColor;
        } else {
          color = hist.values[i] >= 0 ? hist.bullColor : hist.bearColor;
        }
        ctx.fillStyle = color;
        ctx.fillRect(x, Math.min(zeroY, valY), candleW, Math.abs(valY - zeroY));
      }
    };
    drawHist(result.histogram);
    drawHist(result.histogram2);

    // Lines
    if (result.lines) {
      for (const line of result.lines) {
        ctx.strokeStyle = line.color;
        ctx.lineWidth = line.width || 1.5;
        if (line.dash) ctx.setLineDash(line.dash);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < data.length; i++) {
          if (line.values[i] === null || line.values[i] === undefined) continue;
          const x = (i / data.length) * chartW + (chartW / data.length) / 2;
          const y = toMY(line.values[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (line.dash) ctx.setLineDash([]);
      }
    }

    // Panel label
    const def = INDICATOR_MAP[panel.key];
    if (def) {
      ctx.font = '10px Inter, sans-serif';
      ctx.fillStyle = def.color;
      ctx.textAlign = 'left';
      const lastLine = result.lines && result.lines[0];
      const lastVal = lastLine ? lastLine.values.filter(v => v !== null).pop() : null;
      ctx.fillText(`${def.label}${lastVal != null ? ': ' + (Math.abs(lastVal) > 10 ? lastVal.toFixed(2) : lastVal.toFixed(4)) : ''}`, 6, py + 14);
    }

    return { yMin, yMax };
  }

  // ---- Main chart draw ----
  function drawChart() {
    const L = getLayout();
    if (!L) return;
    const { w, h, chartW, mainH } = L;
    const dpr = window.devicePixelRatio || 1;
    const ctx = mainCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = cs.settings.bgColor;
    ctx.fillRect(0, 0, w, h);

    const d = cs.data;
    if (!d.length) return;
    const { min, max } = getPriceRange();
    const range = max - min || 1;
    const toY = (p) => mainH - ((p - min) / range) * mainH;
    const toX = (i) => (i / d.length) * chartW;
    const candleW = (chartW / d.length) * 0.7;
    const S = cs.settings;

    // Grid
    if (S.showGrid) {
      ctx.strokeStyle = S.gridColor; ctx.lineWidth = 0.5;
      for (let i = 0; i <= 8; i++) { const y = (mainH / 8) * i; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke(); }
      for (let i = 0; i <= 12; i++) { const x = (chartW / 12) * i; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke(); }
    }

    // Volume bars (special handling — drawn on main chart)
    if (cs.indicators.includes('VOL')) {
      const maxVol = Math.max(...d.map(c => c.volume));
      const volH = mainH * 0.15;
      d.forEach((c, i) => {
        const x = toX(i) + (chartW / d.length - candleW) / 2;
        const barH = (c.volume / maxVol) * volH;
        ctx.fillStyle = c.close >= c.open ? 'rgba(86,211,100,0.18)' : 'rgba(248,81,73,0.18)';
        ctx.fillRect(x, mainH - barH, candleW, barH);
      });
    }

    // Volume MA overlays (render even without VOL bars enabled)
    for (const key of cs.indicators) {
      const result = getIndicatorResult(key);
      if (!result) continue;
      if (result.type === 'volume_ma') {
        const maxVol = Math.max(...d.map(c => c.volume));
        const volH = mainH * 0.15;
        ctx.strokeStyle = result.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < d.length; i++) {
          if (result.values[i] === null) continue;
          const x = toX(i) + (chartW / d.length) / 2;
          const y = mainH - (result.values[i] / maxVol) * volH;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // Overlay indicators (drawn before price data so candles are on top)
    for (const key of cs.indicators) {
      const result = getIndicatorResult(key);
      if (!result) continue;
      if (result.type === 'overlay') drawOverlayIndicator(ctx, result, chartW, mainH, min, range, d);
      else if (result.type === 'volume_profile') drawVolumeProfile(ctx, result, chartW, mainH, min, range);
      else if (result.type === 'darvas') drawDarvasBoxes(ctx, result, chartW, mainH, min, range, d);
      else if (result.type === 'renko') drawRenkoBricks(ctx, result, chartW, mainH, min, range, d);
    }

    // Heikin Ashi override
    let drawData = d;
    let useHA = false;
    if (cs.indicators.includes('HEIKINASHI')) {
      const haResult = getIndicatorResult('HEIKINASHI');
      if (haResult && haResult.type === 'heikin_ashi') { drawData = haResult.data; useHA = true; }
    }

    // Price data
    if (cs.chartType === 'candlestick') {
      drawData.forEach((c, i) => {
        const x = toX(i) + (chartW / d.length - candleW) / 2;
        const green = c.close >= c.open;
        ctx.strokeStyle = ctx.fillStyle = green ? S.bullColor : S.bearColor;
        ctx.lineWidth = 1;
        const cx = x + candleW / 2;
        ctx.beginPath(); ctx.moveTo(cx, toY(c.high)); ctx.lineTo(cx, toY(c.low)); ctx.stroke();
        const bodyTop = toY(Math.max(c.open, c.close));
        const bodyBot = toY(Math.min(c.open, c.close));
        const bodyH = Math.max(bodyBot - bodyTop, 1);
        if (green) ctx.fillRect(x, bodyTop, candleW, bodyH);
        else { ctx.lineWidth = 1.5; ctx.strokeRect(x, bodyTop, candleW, bodyH); }
      });
    } else if (cs.chartType === 'line') {
      ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2; ctx.beginPath();
      drawData.forEach((c, i) => { const x = toX(i) + (chartW / d.length) / 2; i === 0 ? ctx.moveTo(x, toY(c.close)) : ctx.lineTo(x, toY(c.close)); });
      ctx.stroke();
    } else if (cs.chartType === 'area') {
      const grad = ctx.createLinearGradient(0, 0, 0, mainH);
      grad.addColorStop(0, 'rgba(88,166,255,0.25)'); grad.addColorStop(1, 'rgba(88,166,255,0.02)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(toX(0) + (chartW / d.length) / 2, mainH);
      drawData.forEach((c, i) => ctx.lineTo(toX(i) + (chartW / d.length) / 2, toY(c.close)));
      ctx.lineTo(toX(drawData.length - 1) + (chartW / d.length) / 2, mainH); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 2; ctx.beginPath();
      drawData.forEach((c, i) => { const x = toX(i) + (chartW / d.length) / 2; i === 0 ? ctx.moveTo(x, toY(c.close)) : ctx.lineTo(x, toY(c.close)); });
      ctx.stroke();
    }

    // Annotations
    drawAnnotations(ctx, cs.drawings, chartW, mainH, min, range, d, toX, toY);

    // Trade Replay markers
    drawTradeReplay(ctx, chartW, mainH, min, range, d, toX, toY);

    // Alert lines
    drawAlertLines(ctx, chartW, mainH, min, range, toY);

    // Current price line
    const lastC = d[d.length - 1];
    const lastY = toY(lastC.close);
    ctx.strokeStyle = lastC.close >= lastC.open ? S.bullColor : S.bearColor;
    ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, lastY); ctx.lineTo(chartW, lastY); ctx.stroke();
    ctx.setLineDash([]);

    // ---- Sub-panels ----
    const panelAxes = [];
    L.panels.forEach(panel => {
      const axes = drawPanelIndicator(ctx, panel, chartW, d);
      panelAxes.push({ panel, axes });
    });

    // ---- Right-side price axis ----
    ctx.fillStyle = '#161b22'; ctx.fillRect(chartW, 0, RIGHT_MARGIN, h);
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(chartW, 0); ctx.lineTo(chartW, h); ctx.stroke();
    ctx.font = '11px Inter, sans-serif'; ctx.fillStyle = '#8b949e'; ctx.textAlign = 'left';
    for (let i = 0; i <= 8; i++) {
      const price = max - (range / 8) * i;
      ctx.fillText(fmt(price), chartW + 8, (mainH / 8) * i + 4);
    }

    // Sub-panel axis labels
    panelAxes.forEach(({ panel, axes }) => {
      if (!axes) return;
      const { yMin, yMax } = axes;
      const steps = 3;
      for (let i = 0; i <= steps; i++) {
        const val = yMax - ((yMax - yMin) / steps) * i;
        const y = panel.y + (panel.h / steps) * i;
        ctx.fillStyle = '#8b949e';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(Math.abs(val) > 999 ? (val / 1e6).toFixed(1) + 'M' : val.toFixed(Math.abs(val) < 10 ? 2 : 0), chartW + 4, y + 4);
      }
    });

    // Price tag on last price
    ctx.fillStyle = lastC.close >= lastC.open ? S.bullColor : S.bearColor;
    ctx.fillRect(chartW, lastY - 10, RIGHT_MARGIN, 20);
    ctx.fillStyle = '#0d1117'; ctx.font = 'bold 11px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(fmt(lastC.close), chartW + 8, lastY + 4);

    // ---- Bottom time axis ----
    const timeY = h - BOTTOM_MARGIN;
    ctx.fillStyle = '#161b22'; ctx.fillRect(0, timeY, w, BOTTOM_MARGIN);
    ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, timeY); ctx.lineTo(w, timeY); ctx.stroke();
    ctx.font = '10px Inter, sans-serif'; ctx.fillStyle = '#8b949e'; ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(d.length / 8));
    for (let i = 0; i < d.length; i += step) {
      const x = toX(i) + (chartW / d.length) / 2;
      const ts = d[i].timestamp;
      ctx.fillText(`${ts.getMonth() + 1}/${ts.getDate()}`, x, timeY + 16);
    }

    updateOverlays(d.length - 1);
    updateUndoRedoButtons();
    clearOverlay();
  }

  // ---- Trade Replay Markers ----
  function drawTradeReplay(ctx, chartW, mainH, min, range, data, toX, toY) {
    if (!cs.showTradeReplay) return;
    const trades = getTrades();
    if (!trades.length || !data.length) return;
    const startDate = data[0].timestamp.getTime();
    const endDate = data[data.length - 1].timestamp.getTime();
    const dateRange = endDate - startDate;
    if (dateRange <= 0) return;

    // Match trades whose pair maps to current symbol (crypto pairs match directly)
    const symbolPairs = { 'BTC/USD': 'BTC/USD', 'ETH/USD': 'ETH/USD', 'XRP/USD': 'XRP/USD' };
    const matchingTrades = trades.filter(t => {
      if (symbolPairs[cs.symbol] && t.pair === cs.symbol) return true;
      if (cs.symbol === t.pair) return true;
      return false;
    });

    for (const trade of matchingTrades) {
      const entryTime = new Date(trade.entryDate).getTime();
      if (entryTime < startDate || entryTime > endDate) continue;
      const barIdx = Math.round(((entryTime - startDate) / dateRange) * (data.length - 1));
      const x = toX(barIdx) + (chartW / data.length) / 2;
      const isBuy = trade.side === 'buy';
      const price = trade.entryPrice;
      const y = toY(price);

      // Arrow
      ctx.fillStyle = isBuy ? '#3fb950' : '#f85149';
      ctx.beginPath();
      if (isBuy) {
        ctx.moveTo(x, y + 4); ctx.lineTo(x - 7, y + 16); ctx.lineTo(x + 7, y + 16);
      } else {
        ctx.moveTo(x, y - 4); ctx.lineTo(x - 7, y - 16); ctx.lineTo(x + 7, y - 16);
      }
      ctx.closePath(); ctx.fill();

      // Label
      ctx.font = 'bold 9px Inter, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = isBuy ? '#3fb950' : '#f85149';
      ctx.fillText(isBuy ? 'BUY' : 'SELL', x, isBuy ? y + 28 : y - 20);

      // Exit marker
      if (trade.exitDate && trade.exitPrice) {
        const exitTime = new Date(trade.exitDate).getTime();
        if (exitTime >= startDate && exitTime <= endDate) {
          const exitIdx = Math.round(((exitTime - startDate) / dateRange) * (data.length - 1));
          const ex = toX(exitIdx) + (chartW / data.length) / 2;
          const ey = toY(trade.exitPrice);

          // Dashed line connecting entry to exit
          ctx.strokeStyle = (trade.realizedPnL || 0) >= 0 ? 'rgba(63,185,80,0.4)' : 'rgba(248,81,73,0.4)';
          ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
          ctx.setLineDash([]);

          // Exit X marker
          ctx.strokeStyle = '#d2a8ff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ex - 5, ey - 5); ctx.lineTo(ex + 5, ey + 5); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ex + 5, ey - 5); ctx.lineTo(ex - 5, ey + 5); ctx.stroke();

          // P&L label
          const pnl = trade.realizedPnL || 0;
          const pnlText = (pnl >= 0 ? '+' : '') + formatCurrency(pnl);
          ctx.font = 'bold 9px Inter, sans-serif';
          ctx.fillStyle = pnl >= 0 ? '#3fb950' : '#f85149';
          ctx.fillText(pnlText, ex, ey - 10);
        }
      }
    }
  }

  // ---- Alert lines on chart ----
  function drawAlertLines(ctx, chartW, mainH, min, range, toY) {
    const alerts = getAlerts().filter(a => a.active && a.symbol === cs.symbol);
    for (const alert of alerts) {
      const y = toY(alert.price);
      if (y < 0 || y > mainH) continue;
      ctx.strokeStyle = '#ffa657'; ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      ctx.setLineDash([]);
      // Bell icon + label
      ctx.fillStyle = 'rgba(255,166,87,0.15)';
      ctx.fillRect(chartW - 70, y - 10, 70, 20);
      ctx.fillStyle = '#ffa657'; ctx.font = 'bold 10px Inter, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`🔔 ${alert.condition === 'above' ? '≥' : '≤'} ${fmt(alert.price)}`, chartW - 4, y + 4);
    }
  }

  function updateAlertBadge() {
    const badge = document.getElementById('alert-badge');
    const count = getActiveAlertCount();
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? '' : 'none';
    }
  }

  // ---- Annotations ----
  function drawAnnotations(ctx, drawings, chartW, mainH, min, range, data, toX, toY) {
    drawings.forEach(d => {
      ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5;
      if (d.type === 'horizontal') {
        const y = toY(d.price);
        ctx.setLineDash([6, 3]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#58a6ff'; ctx.font = '11px Inter'; ctx.textAlign = 'right';
        ctx.fillText(fmt(d.price), chartW - 4, y - 4);
      } else if (d.type === 'trendline') {
        ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke(); ctx.setLineDash([]);
      } else if (d.type === 'rectangle') {
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(Math.min(d.x1, d.x2), Math.min(d.y1, d.y2), Math.abs(d.x2 - d.x1), Math.abs(d.y2 - d.y1));
        ctx.fillStyle = 'rgba(88,166,255,0.06)';
        ctx.fillRect(Math.min(d.x1, d.x2), Math.min(d.y1, d.y2), Math.abs(d.x2 - d.x1), Math.abs(d.y2 - d.y1));
        ctx.setLineDash([]);
      } else if (d.type === 'fibonacci') {
        if (!d.props) d.props = makeDefaultFibProps();
        const props = d.props;
        const pBegin = d.price1, pEnd = d.price2;
        const pRange = pEnd - pBegin;
        const xMin = Math.min(d.x1, d.x2), xMax = Math.max(d.x1, d.x2);
        const xStart = props.leftExtension === 'On' ? 0 : xMin;
        const xEnd = props.rightExtension === 'On' ? chartW : xMax;
        const visibleCurves = props.curves.filter(c => c.visible);
        const sorted = visibleCurves.slice().sort((a, b) => a.coefficient - b.coefficient);
        for (let i = 0; i < sorted.length - 1; i++) {
          const y1 = toY(pBegin + pRange * sorted[i].coefficient);
          const y2 = toY(pBegin + pRange * sorted[i + 1].coefficient);
          ctx.fillStyle = i % 2 === 0 ? 'rgba(88,166,255,0.03)' : 'rgba(88,166,255,0.06)';
          ctx.fillRect(xStart, Math.min(y1, y2), xEnd - xStart, Math.abs(y2 - y1));
        }
        ctx.strokeStyle = props.trendlineColor || '#30363d';
        ctx.lineWidth = props.trendlineWidth || 1;
        setDash(ctx, props.trendlineStyle || 'dashed');
        ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
        ctx.setLineDash([]);
        visibleCurves.forEach(c => {
          const price = pBegin + pRange * c.coefficient;
          const y = toY(price);
          ctx.strokeStyle = c.color; ctx.lineWidth = c.width || 1;
          setDash(ctx, c.style || 'dashed');
          ctx.beginPath(); ctx.moveTo(xStart, y); ctx.lineTo(xEnd, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = c.color; ctx.font = '10px Inter';
          const coefLabel = `${(c.coefficient * 100).toFixed(1)}%`;
          const priceLabel = fmt(price);
          if (props.showCoefficients === 'On the left') { ctx.textAlign = 'left'; ctx.fillText(coefLabel, xStart + 4, y - 3); }
          else if (props.showCoefficients === 'On the right') { ctx.textAlign = 'right'; ctx.fillText(coefLabel, xEnd - 4, y - 3); }
          if (props.showPrice === 'On the left') { ctx.textAlign = 'left'; ctx.fillText(priceLabel, xStart + 48, y - 3); }
          else if (props.showPrice === 'On the right') { ctx.textAlign = 'right'; const offset = props.showCoefficients === 'On the right' ? 52 : 4; ctx.fillText(priceLabel, xEnd - offset, y - 3); }
        });
      } else if (d.type === 'text') {
        ctx.fillStyle = d.color || '#e6edf3'; ctx.font = `${d.fontSize || 13}px Inter, sans-serif`; ctx.textAlign = 'left';
        ctx.fillText(d.text, d.x, d.y);
      } else if (d.type === 'measure') {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = '#ffa657'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke(); ctx.setLineDash([]);
        [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }].forEach(pt => {
          ctx.fillStyle = '#ffa657'; ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
        });
        const midX = (d.x1 + d.x2) / 2, midY = (d.y1 + d.y2) / 2;
        ctx.fillStyle = 'rgba(22,27,34,0.9)'; ctx.fillRect(midX - 2, midY - 32, 130, 28);
        ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1; ctx.strokeRect(midX - 2, midY - 32, 130, 28);
        ctx.fillStyle = '#e6edf3'; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText(d.label || '', midX + 4, midY - 14);
      }
    });
  }

  // ---- Overlay canvas (crosshair + in-progress drawings) ----
  function clearOverlay() {
    const L = getLayout();
    if (!L) return;
    const dpr = window.devicePixelRatio || 1;
    overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlayCtx.clearRect(0, 0, L.w, L.h);
  }

  function drawOverlay(mx, my) {
    const L = getLayout();
    if (!L) return;
    const { w, h, chartW, mainH } = L;
    const dpr = window.devicePixelRatio || 1;
    const ctx = overlayCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const totalChartH = h - BOTTOM_MARGIN;
    if (mx < 0 || mx > chartW || my < 0 || my > totalChartH) return;

    ctx.strokeStyle = cs.settings.crosshairColor; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, my); ctx.lineTo(chartW, my); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, totalChartH); ctx.stroke();
    ctx.setLineDash([]);

    // Price label on Y-axis
    let priceLabel = '';
    const inMain = my < mainH;
    if (inMain) {
      const { min, max } = getPriceRange();
      const price = max - (my / mainH) * (max - min);
      priceLabel = fmt(price);
    } else {
      for (const panel of L.panels) {
        if (my >= panel.y && my < panel.y + panel.h) {
          const ratio = (panel.y + panel.h - my) / panel.h;
          const result = panel.result;
          if (result) {
            if (result.auto) {
              const allVals = [];
              if (result.lines) result.lines.forEach(l => l.values.forEach(v => { if (v !== null) allVals.push(v); }));
              if (result.histogram) result.histogram.values.forEach(v => { if (v !== null) allVals.push(v); });
              if (result.histogram2) result.histogram2.values.forEach(v => { if (v !== null) allVals.push(v); });
              if (allVals.length) {
                const mn = Math.min(...allVals), mx2 = Math.max(...allVals);
                const pad = (mx2 - mn) * 0.1 || 1;
                priceLabel = (mn - pad + ratio * (mx2 - mn + 2 * pad)).toFixed(2);
              }
            } else {
              priceLabel = ((result.min ?? 0) + ratio * ((result.max ?? 100) - (result.min ?? 0))).toFixed(1);
            }
          }
        }
      }
    }
    ctx.fillStyle = '#58a6ff';
    ctx.fillRect(chartW + 1, my - 9, RIGHT_MARGIN - 2, 18);
    ctx.fillStyle = '#0d1117'; ctx.font = 'bold 10px Inter'; ctx.textAlign = 'left';
    ctx.fillText(priceLabel, chartW + 6, my + 4);

    // Time label on X-axis
    const idx = Math.min(Math.floor((mx / chartW) * cs.data.length), cs.data.length - 1);
    if (idx >= 0 && cs.data[idx]) {
      const ts = cs.data[idx].timestamp;
      const label = `${ts.getMonth() + 1}/${ts.getDate()}`;
      ctx.fillStyle = '#58a6ff'; ctx.fillRect(mx - 20, totalChartH + 1, 40, BOTTOM_MARGIN - 2);
      ctx.fillStyle = '#0d1117'; ctx.font = 'bold 10px Inter'; ctx.textAlign = 'center';
      ctx.fillText(label, mx, totalChartH + 16);
    }

    // In-progress drawing
    if (drawStart) {
      ctx.strokeStyle = '#58a6ff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      if (cs.activeTool === 'trendline' || cs.activeTool === 'fibonacci') {
        ctx.beginPath(); ctx.moveTo(drawStart.x, drawStart.y); ctx.lineTo(mx, my); ctx.stroke();
      } else if (cs.activeTool === 'rectangle') {
        ctx.strokeRect(Math.min(drawStart.x, mx), Math.min(drawStart.y, my), Math.abs(mx - drawStart.x), Math.abs(my - drawStart.y));
        ctx.fillStyle = 'rgba(88,166,255,0.08)';
        ctx.fillRect(Math.min(drawStart.x, mx), Math.min(drawStart.y, my), Math.abs(mx - drawStart.x), Math.abs(my - drawStart.y));
      } else if (cs.activeTool === 'measure') {
        ctx.strokeStyle = '#ffa657';
        ctx.beginPath(); ctx.moveTo(drawStart.x, drawStart.y); ctx.lineTo(mx, my); ctx.stroke();
        const { min, max } = getPriceRange();
        const rng = max - min;
        const p1 = max - (drawStart.y / mainH) * rng;
        const p2 = max - (my / mainH) * rng;
        const diff2 = p2 - p1;
        const pct = p1 !== 0 ? (diff2 / p1 * 100) : 0;
        const bars = cs.data.length > 0 ? Math.abs(Math.floor((mx - drawStart.x) / (chartW / cs.data.length))) : 0;
        const labelText = `${diff2 >= 0 ? '+' : ''}${fmt(diff2)} (${pct.toFixed(2)}%) | ${bars} bars`;
        const lx = (drawStart.x + mx) / 2, ly = (drawStart.y + my) / 2;
        const tw = ctx.measureText(labelText).width + 12;
        ctx.fillStyle = 'rgba(22,27,34,0.92)'; ctx.fillRect(lx - 4, ly - 22, tw, 20);
        ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1; ctx.strokeRect(lx - 4, ly - 22, tw, 20);
        ctx.fillStyle = '#ffa657'; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'left';
        ctx.fillText(labelText, lx + 2, ly - 8);
      }
      ctx.setLineDash([]);
    }
  }

  // ---- Overlay updates ----
  function updateOverlays(barIdx) {
    const d = cs.data;
    if (!d.length) return;
    barIdx = Math.min(Math.max(barIdx, 0), d.length - 1);
    const bar = d[barIdx];
    const el = (id) => document.getElementById(id);

    el('overlay-symbol').textContent = cs.symbol;
    el('overlay-tf').textContent = cs.timeframe;
    el('overlay-open').textContent = fmt(bar.open);
    el('overlay-high').textContent = fmt(bar.high);
    el('overlay-low').textContent = fmt(bar.low);
    el('overlay-close').textContent = fmt(bar.close);
    el('overlay-vol').textContent = (bar.volume / 1e6).toFixed(1) + 'M';
    const chg = bar.close - bar.open;
    const chgPct = bar.open !== 0 ? (chg / bar.open) * 100 : 0;
    const changeEl = el('overlay-change');
    changeEl.textContent = `${chg >= 0 ? '+' : ''}${fmt(chg)} (${chgPct.toFixed(2)}%)`;
    changeEl.className = `tv-ohlcv-change ${chg >= 0 ? 'tv-positive' : 'tv-negative'}`;

    const last = d[d.length - 1];
    const lchg = last.close - last.open;
    const lpct = last.open !== 0 ? (lchg / last.open) * 100 : 0;
    el('status-price').textContent = `$${fmt(last.close)}`;
    const statusChg = el('status-change');
    statusChg.textContent = `${lchg >= 0 ? '+' : ''}${fmt(lchg)} (${lpct.toFixed(2)}%)`;
    statusChg.className = `tv-status-change ${lchg >= 0 ? 'tv-positive' : 'tv-negative'}`;
    el('status-time').textContent = new Date().toLocaleTimeString();

    // Indicator overlay text — show values for overlay AND panel indicators at hovered bar
    const indOverlay = el('indicator-overlay');
    if (indOverlay) {
      const parts = [];
      for (const key of cs.indicators) {
        const def = INDICATOR_MAP[key];
        if (!def) continue;
        const result = getIndicatorResult(key);
        if (!result) continue;
        if ((result.type === 'overlay' || result.type === 'panel') && result.lines) {
          for (const line of result.lines.slice(0, 2)) {
            const v = line.values[barIdx];
            if (v !== null && v !== undefined) {
              const fmtVal = Math.abs(v) > 999 ? (v / 1e6).toFixed(1) + 'M' : (Math.abs(v) > 10 ? v.toFixed(2) : v.toFixed(4));
              parts.push(`<span style="color:${line.color}">${line.label}: ${fmtVal}</span>`);
            }
          }
        }
        // Show histogram value for histogram-only panel indicators (AO, AC, etc.)
        if (result.type === 'panel' && result.histogram && (!result.lines || result.lines.length === 0)) {
          const v = result.histogram.values[barIdx];
          if (v !== null && v !== undefined) {
            parts.push(`<span style="color:${def.color}">${def.label}: ${v.toFixed(2)}</span>`);
          }
        }
      }
      indOverlay.innerHTML = parts.slice(0, 12).join(' &nbsp; ');
    }
  }

  // ---- Undo / Redo ----
  function snapshotDrawings() {
    cs.undoStack.push(JSON.parse(JSON.stringify(cs.drawings)));
    cs.redoStack = [];
    if (cs.undoStack.length > 50) cs.undoStack.shift();
    updateUndoRedoButtons();
  }

  function handleUndo() {
    if (!cs.undoStack.length) return;
    cs.redoStack.push(JSON.parse(JSON.stringify(cs.drawings)));
    cs.drawings = cs.undoStack.pop();
    drawChart();
  }

  function handleRedo() {
    if (!cs.redoStack.length) return;
    cs.undoStack.push(JSON.parse(JSON.stringify(cs.drawings)));
    cs.drawings = cs.redoStack.pop();
    drawChart();
  }

  function updateUndoRedoButtons() {
    document.getElementById('undo-btn')?.classList.toggle('disabled', cs.undoStack.length === 0);
    document.getElementById('redo-btn')?.classList.toggle('disabled', cs.redoStack.length === 0);
  }

  // ---- Settings Modal ----
  function openSettingsModal() {
    const S = cs.settings;
    showModal({
      title: 'Chart Settings',
      width: '480px',
      body: `
        <div class="tv-settings-section"><h4>Appearance</h4>
          <div class="tv-settings-row"><label>Background Color</label><input type="color" id="s-bgColor" value="${S.bgColor}" /></div>
          <div class="tv-settings-row"><label>Show Grid</label><input type="checkbox" id="s-showGrid" ${S.showGrid ? 'checked' : ''} /></div>
          <div class="tv-settings-row"><label>Bullish Color</label><input type="color" id="s-bullColor" value="${S.bullColor}" /></div>
          <div class="tv-settings-row"><label>Bearish Color</label><input type="color" id="s-bearColor" value="${S.bearColor}" /></div>
        </div>
      `,
      actions: [
        { label: 'Reset Defaults', class: 'btn btn-secondary', onClick: () => { cs.settings = DEFAULT_SETTINGS(); invalidateCache(); closeModal(); drawChart(); } },
        { label: 'Apply', class: 'btn btn-primary', onClick: () => {
          cs.settings.bgColor = document.getElementById('s-bgColor').value;
          cs.settings.showGrid = document.getElementById('s-showGrid').checked;
          cs.settings.bullColor = document.getElementById('s-bullColor').value;
          cs.settings.bearColor = document.getElementById('s-bearColor').value;
          invalidateCache();
          closeModal();
          drawChart();
        }}
      ]
    });
  }

  // ---- Load symbol ----
  function loadSymbol(symbol) {
    cs.symbol = symbol;
    cs.fullData = generateData(symbol);
    cs.viewStart = cs.fullData.length - cs.visibleBars;
    updateViewData();
    document.getElementById('active-symbol').textContent = symbol;
    drawChart();
  }

  // ---- Badge update ----
  function updateBadge() {
    const badge = document.getElementById('ind-badge');
    if (badge) {
      badge.textContent = cs.indicators.length;
      badge.style.display = cs.indicators.length > 0 ? '' : 'none';
    }
  }

  // ==== EVENT WIRING ====

  // Symbol dropdown
  const symbolMenu = document.getElementById('symbol-menu');
  const symbolBtn = document.getElementById('symbol-btn');
  const symbolList = document.getElementById('symbol-list');
  const symbolSearchInput = document.getElementById('symbol-search-input');

  function renderSymbolList(filter = '') {
    const q = filter.toUpperCase();
    symbolList.innerHTML = SYMBOLS.filter(s => s.includes(q)).map(s =>
      `<div class="tv-dropdown-item ${s === cs.symbol ? 'active' : ''}" data-symbol="${s}">${s}</div>`
    ).join('');
  }
  // Delegated click handler for symbol items (attached once)
  symbolList.addEventListener('click', (e) => {
    const item = e.target.closest('.tv-dropdown-item');
    if (item) { loadSymbol(item.dataset.symbol); symbolMenu.classList.remove('open'); }
  });

  symbolBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.tv-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    symbolMenu.classList.toggle('open');
    if (symbolMenu.classList.contains('open')) { renderSymbolList(); symbolSearchInput.value = ''; symbolSearchInput.focus(); }
  });
  symbolSearchInput?.addEventListener('input', (e) => renderSymbolList(e.target.value));

  // ---- Indicator dropdown with categories ----
  const indicatorMenu = document.getElementById('indicator-menu');
  const indicatorSearchInput = document.getElementById('indicator-search-input');
  const indicatorCategoriesEl = document.getElementById('indicator-categories');

  // Rebuild indicator menu HTML (Active + Favorites + Categories)
  function refreshIndicatorMenu() {
    if (!indicatorCategoriesEl) return;
    indicatorCategoriesEl.innerHTML = buildIndicatorMenuHTML();
  }

  document.getElementById('indicator-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.tv-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    indicatorMenu.classList.toggle('open');
    if (indicatorMenu.classList.contains('open')) {
      refreshIndicatorMenu();
      if (indicatorSearchInput) { indicatorSearchInput.value = ''; indicatorSearchInput.focus(); }
    }
  });

  // Delegated event handler for entire indicator menu (handles checkboxes, stars, headers)
  indicatorCategoriesEl.addEventListener('click', (e) => {
    // ── Star/favorite button ──
    const favBtn = e.target.closest('.tv-ind-fav-btn');
    if (favBtn) {
      e.preventDefault();
      e.stopPropagation();
      const key = favBtn.dataset.favKey;
      if (favIndicators.includes(key)) {
        favIndicators = favIndicators.filter(k => k !== key);
      } else {
        favIndicators.push(key);
      }
      saveFavoriteIndicators(favIndicators);
      refreshIndicatorMenu();
      return;
    }

    // ── Category header collapse/expand ──
    const header = e.target.closest('.tv-ind-cat-header');
    if (header) {
      e.stopPropagation();
      const cat = header.closest('.tv-ind-category');
      const items = cat.querySelector('.tv-ind-cat-items');
      const chevron = cat.querySelector('.tv-ind-cat-chevron');
      const isOpen = items.style.display !== 'none';
      items.style.display = isOpen ? 'none' : 'block';
      chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
      return;
    }
  });

  // Delegated checkbox change handler
  indicatorCategoriesEl.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    e.stopPropagation();
    const key = cb.closest('.tv-indicator-item')?.dataset?.indicator;
    if (!key) return;
    if (cb.checked) { if (!cs.indicators.includes(key)) cs.indicators.push(key); }
    else { cs.indicators = cs.indicators.filter(k => k !== key); }
    invalidateCache();
    updateBadge();
    drawChart();
    refreshIndicatorMenu();
  });

  // Search filter
  function filterIndicators(query) {
    const q = query.toLowerCase();
    indicatorCategoriesEl.querySelectorAll('.tv-ind-category').forEach(cat => {
      const catName = cat.dataset.cat || '';
      // Always show Active and Favorites when no query
      if (!q && (catName === '__active__' || catName === '__favorites__')) { cat.style.display = ''; return; }
      const items = cat.querySelectorAll('.tv-indicator-item');
      let anyVisible = false;
      items.forEach(item => {
        const label = item.querySelector('.tv-ind-label')?.textContent.toLowerCase() || '';
        const key = item.dataset.indicator?.toLowerCase() || '';
        const match = !q || label.includes(q) || key.includes(q);
        item.style.display = match ? '' : 'none';
        if (match) anyVisible = true;
      });
      cat.style.display = anyVisible ? '' : 'none';
      if (q && anyVisible) {
        cat.querySelector('.tv-ind-cat-items').style.display = 'block';
        const chevron = cat.querySelector('.tv-ind-cat-chevron');
        if (chevron) chevron.style.transform = 'rotate(90deg)';
      }
    });
  }
  indicatorSearchInput?.addEventListener('input', (e) => filterIndicators(e.target.value));

  // Close dropdowns
  const closeDropdowns = () => document.querySelectorAll('.tv-dropdown-menu.open').forEach(m => m.classList.remove('open'));
  document.addEventListener('click', closeDropdowns);
  document.querySelectorAll('.tv-dropdown-menu').forEach(m => m.addEventListener('click', (e) => e.stopPropagation()));

  // Timeframe
  document.querySelectorAll('.tv-tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tv-tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cs.timeframe = btn.dataset.tf;
      cs.data = generateData(cs.symbol);
      invalidateCache();
      drawChart();
    });
  });

  // Chart type
  document.querySelectorAll('[data-chart-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-chart-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      cs.chartType = btn.dataset.chartType;
      drawChart();
    });
  });

  // Drawing tools
  document.querySelectorAll('.tv-draw-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool === 'magnet') { cs.magnetMode = !cs.magnetMode; btn.classList.toggle('active', cs.magnetMode); return; }
      document.querySelectorAll('.tv-draw-btn[data-tool]').forEach(b => { if (b.dataset.tool !== 'magnet') b.classList.remove('active'); });
      btn.classList.add('active');
      cs.activeTool = tool;
      overlayCanvas.style.cursor = tool === 'crosshair' ? 'crosshair' : 'copy';
    });
  });

  document.getElementById('clear-drawings-btn')?.addEventListener('click', () => {
    if (cs.drawings.length) { snapshotDrawings(); cs.drawings = []; drawChart(); }
  });

  // Undo / Redo buttons
  document.getElementById('undo-btn')?.addEventListener('click', handleUndo);
  document.getElementById('redo-btn')?.addEventListener('click', handleRedo);

  // Keyboard shortcuts
  const keyHandler = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) { e.preventDefault(); handleRedo(); }
  };
  document.addEventListener('keydown', keyHandler);

  // Price Alerts
  document.getElementById('alert-btn')?.addEventListener('click', () => {
    const alerts = getAlerts();
    const activeAlerts = alerts.filter(a => a.active && a.symbol === cs.symbol);
    const triggeredAlerts = alerts.filter(a => !a.active && a.symbol === cs.symbol);
    const lastPrice = cs.data.length ? cs.data[cs.data.length - 1].close : 0;

    const body = `
      <div style="margin-bottom:16px">
        <h4 style="font-size:13px;margin-bottom:8px;color:var(--color-text-muted)">Add Alert for ${cs.symbol}</h4>
        <div style="display:flex;gap:8px;align-items:flex-end">
          <div style="flex:1">
            <label class="form-label" style="font-size:11px">Condition</label>
            <select class="form-select" id="alert-condition" style="font-size:12px">
              <option value="above">Price crosses above</option>
              <option value="below">Price crosses below</option>
            </select>
          </div>
          <div style="flex:1">
            <label class="form-label" style="font-size:11px">Price</label>
            <input type="number" class="form-input" id="alert-price" step="any" placeholder="${fmt(lastPrice)}" style="font-size:12px">
          </div>
          <button class="btn btn-primary" id="add-alert-btn" style="font-size:12px;padding:6px 14px;white-space:nowrap">Add Alert</button>
        </div>
      </div>
      <div>
        <h4 style="font-size:13px;margin-bottom:8px;color:var(--color-text-muted)">Active Alerts (${activeAlerts.length})</h4>
        ${activeAlerts.length === 0 ? '<p style="font-size:12px;color:var(--color-text-dim)">No active alerts for this symbol.</p>' :
          `<table class="data-table" style="font-size:12px"><thead><tr><th>Condition</th><th>Price</th><th></th></tr></thead><tbody>
          ${activeAlerts.map(a => `<tr>
            <td>${a.condition === 'above' ? '≥ Above' : '≤ Below'}</td>
            <td class="font-mono">${fmt(a.price)}</td>
            <td><button class="btn btn-ghost btn-sm alert-remove-btn" data-id="${a.id}" style="font-size:11px;color:var(--color-red)">Remove</button></td>
          </tr>`).join('')}
          </tbody></table>`}
      </div>
      ${triggeredAlerts.length > 0 ? `
        <div style="margin-top:12px">
          <h4 style="font-size:13px;margin-bottom:8px;color:var(--color-text-dim)">Triggered (${triggeredAlerts.length})</h4>
          <div style="font-size:11px;color:var(--color-text-dim)">${triggeredAlerts.map(a =>
            `${a.condition === 'above' ? '▲' : '▼'} ${fmt(a.price)} — ${new Date(a.triggeredAt).toLocaleString()}`
          ).join('<br>')}</div>
        </div>` : ''}
    `;

    showModal({ title: `Price Alerts — ${cs.symbol}`, body, width: '480px', actions: [
      { label: 'Close', class: 'btn btn-secondary', onClick: closeModal }
    ]});

    setTimeout(() => {
      document.getElementById('add-alert-btn')?.addEventListener('click', () => {
        const price = Number(document.getElementById('alert-price')?.value);
        const condition = document.getElementById('alert-condition')?.value || 'above';
        if (!price || price <= 0) { showToast('Enter a valid price', 'error'); return; }
        addAlert(cs.symbol, price, condition);
        updateAlertBadge();
        drawChart();
        closeModal();
        showToast(`Alert set: ${cs.symbol} ${condition} $${fmt(price)}`, 'success');
      });
      document.querySelectorAll('.alert-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          removeAlert(btn.dataset.id);
          updateAlertBadge();
          drawChart();
          closeModal();
        });
      });
    }, 50);
  });

  // Trade Replay toggle
  document.getElementById('replay-btn')?.addEventListener('click', () => {
    cs.showTradeReplay = !cs.showTradeReplay;
    document.getElementById('replay-btn')?.classList.toggle('active', cs.showTradeReplay);
    drawChart();
  });

  // Settings
  document.getElementById('settings-btn')?.addEventListener('click', openSettingsModal);

  // Screenshot
  document.getElementById('screenshot-btn')?.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `${cs.symbol}_${cs.timeframe}_chart.png`;
    link.href = mainCanvas.toDataURL();
    link.click();
  });

  // Maximize
  document.getElementById('maximize-btn')?.addEventListener('click', () => {
    const wrapper = document.querySelector('.tv-chart-wrapper');
    cs.isMaximized = !cs.isMaximized;
    wrapper.classList.toggle('tv-maximized', cs.isMaximized);
    document.getElementById('maximize-btn').innerHTML = cs.isMaximized ? ICONS.minimize : ICONS.maximize;
    setTimeout(resizeCanvas, 100);
  });

  // Chart navigation bar
  document.getElementById('chart-nav-left')?.addEventListener('click', () => {
    if (cs.viewStart > 0) {
      cs.viewStart = Math.max(0, cs.viewStart - SCROLL_STEP);
      updateViewData();
      drawChart();
    }
  });
  document.getElementById('chart-nav-right')?.addEventListener('click', () => {
    const maxStart = cs.fullData.length - cs.visibleBars;
    if (cs.viewStart < maxStart) {
      cs.viewStart = Math.min(maxStart, cs.viewStart + SCROLL_STEP);
      updateViewData();
      drawChart();
    }
  });
  document.getElementById('chart-zoom-out')?.addEventListener('click', () => {
    const newBars = Math.min(cs.fullData.length, cs.visibleBars + 30);
    cs.visibleBars = newBars;
    if (cs.viewStart + cs.visibleBars > cs.fullData.length) {
      cs.viewStart = Math.max(0, cs.fullData.length - cs.visibleBars);
    }
    updateViewData();
    drawChart();
  });
  document.getElementById('chart-zoom-in')?.addEventListener('click', () => {
    const newBars = Math.max(30, cs.visibleBars - 30);
    cs.visibleBars = newBars;
    updateViewData();
    drawChart();
  });
  document.getElementById('chart-nav-reset')?.addEventListener('click', () => {
    cs.visibleBars = VISIBLE_BARS;
    cs.viewStart = cs.fullData.length - cs.visibleBars;
    updateViewData();
    drawChart();
  });

  // ==== MOUSE EVENTS on overlay canvas ====
  let drawStart = null;

  overlayCanvas.addEventListener('mousemove', (e) => {
    const rect = overlayCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const L = getLayout();
    if (!L) return;

    drawOverlay(mx, my);

    const idx = Math.min(Math.floor((mx / L.chartW) * cs.data.length), cs.data.length - 1);
    if (idx >= 0 && cs.data[idx]) updateOverlays(idx);
  });

  overlayCanvas.addEventListener('mouseleave', () => {
    clearOverlay();
    if (cs.data.length) updateOverlays(cs.data.length - 1);
  });

  // ---- Fibonacci hit-test + right-click context menu ----
  function hitTestFibonacci(mx, my) {
    const L = getLayout(); if (!L) return -1;
    const { chartW, mainH } = L;
    if (my > mainH) return -1;
    const { min, max } = getPriceRange(); const range = max - min;
    const toY = (price) => mainH - ((price - min) / range) * mainH;
    for (let i = cs.drawings.length - 1; i >= 0; i--) {
      const d = cs.drawings[i];
      if (d.type !== 'fibonacci') continue;
      if (!d.props) d.props = makeDefaultFibProps();
      const props = d.props;
      const xMin = Math.min(d.x1, d.x2), xMax = Math.max(d.x1, d.x2);
      const xStart = props.leftExtension === 'On' ? 0 : xMin;
      const xEnd = props.rightExtension === 'On' ? chartW : xMax;
      if (mx < xStart - 4 || mx > xEnd + 4) continue;
      const visible = props.curves.filter(c => c.visible);
      if (!visible.length) continue;
      const ys = visible.map(c => toY(d.price1 + (d.price2 - d.price1) * c.coefficient));
      const yMin = Math.min(...ys), yMax = Math.max(...ys);
      if (my >= yMin - 6 && my <= yMax + 6) return i;
    }
    return -1;
  }

  let openCtxMenu = null;
  function closeCtxMenu() {
    if (openCtxMenu) { openCtxMenu.remove(); openCtxMenu = null; }
    document.removeEventListener('mousedown', onDocCtxClose, true);
  }
  function onDocCtxClose(e) {
    if (openCtxMenu && !openCtxMenu.contains(e.target)) closeCtxMenu();
  }
  function showFibContextMenu(clientX, clientY, idx) {
    closeCtxMenu();
    const menu = document.createElement('div');
    menu.className = 'tv-ctx-menu';
    menu.innerHTML = `
      <div class="tv-ctx-item tv-ctx-primary" data-act="edit">Edit properties...</div>
      <div class="tv-ctx-item" data-act="activate">Activate drawing</div>
      <div class="tv-ctx-item" data-act="duplicate">Duplicate drawing</div>
      <div class="tv-ctx-item" data-act="remove">Remove drawing</div>
      <div class="tv-ctx-item" data-act="extendLeft">Extend to the left</div>
      <div class="tv-ctx-item" data-act="cancelRight">Cancel right extension</div>
      <div class="tv-ctx-sep"></div>
      <div class="tv-ctx-item tv-ctx-sub">Add a drawing<span class="tv-ctx-arrow">&#9656;</span></div>
      <div class="tv-ctx-sep"></div>
      <div class="tv-ctx-item" data-act="clearSet">Clear drawing set</div>
      <div class="tv-ctx-item" data-act="removeOld">Remove old drawings</div>
      <div class="tv-ctx-sep"></div>
      <div class="tv-ctx-item tv-ctx-sub">BUY<span class="tv-ctx-arrow">&#9656;</span></div>
      <div class="tv-ctx-item tv-ctx-sub">SELL<span class="tv-ctx-arrow">&#9656;</span></div>
      <div class="tv-ctx-item tv-ctx-sub">Buy custom<span class="tv-ctx-arrow">&#9656;</span></div>
      <div class="tv-ctx-item tv-ctx-sub">Sell custom<span class="tv-ctx-arrow">&#9656;</span></div>
      <div class="tv-ctx-item tv-ctx-sub"><span class="tv-ctx-icon">&#128276;</span>Create alert...<span class="tv-ctx-arrow">&#9656;</span></div>
      <div class="tv-ctx-item tv-ctx-sub">Analyze<span class="tv-ctx-arrow">&#9656;</span></div>
      <div class="tv-ctx-sep"></div>
      <div class="tv-ctx-item"><span class="tv-ctx-icon">&#9974;</span>Restore cells</div>
    `;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    let x = clientX, y = clientY;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 4;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 4;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    openCtxMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', onDocCtxClose, true), 0);

    menu.addEventListener('click', (ev) => {
      const item = ev.target.closest('.tv-ctx-item');
      if (!item) return;
      const act = item.dataset.act;
      const d = cs.drawings[idx];
      if (!d || d.type !== 'fibonacci') { closeCtxMenu(); return; }
      if (act === 'edit') {
        showFibPropertiesModal(idx);
      } else if (act === 'duplicate') {
        snapshotDrawings();
        const clone = JSON.parse(JSON.stringify(d));
        clone.x1 += 20; clone.x2 += 20;
        clone.props.name = clone.props.name + ' copy';
        cs.drawings.push(clone); drawChart();
      } else if (act === 'remove') {
        snapshotDrawings(); cs.drawings.splice(idx, 1); drawChart();
      } else if (act === 'extendLeft') {
        snapshotDrawings(); d.props.leftExtension = d.props.leftExtension === 'On' ? 'Off' : 'On'; drawChart();
      } else if (act === 'cancelRight') {
        snapshotDrawings(); d.props.rightExtension = 'Off'; drawChart();
      } else if (act === 'activate') {
        cs.activeTool = 'fibonacci';
        document.querySelectorAll('.tv-draw-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === 'fibonacci'));
      } else if (act === 'clearSet') {
        snapshotDrawings(); cs.drawings = cs.drawings.filter(x => x.type !== 'fibonacci'); drawChart();
      } else if (act === 'removeOld') {
        snapshotDrawings();
        const fibs = cs.drawings.filter(x => x.type === 'fibonacci');
        if (fibs.length > 1) {
          const keep = fibs[fibs.length - 1];
          cs.drawings = cs.drawings.filter(x => x.type !== 'fibonacci' || x === keep);
          drawChart();
        }
      }
      closeCtxMenu();
    });
  }

  // ---- Fibonacci Properties editor modal ----
  function dateToParts(ts) {
    if (!(ts instanceof Date)) ts = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return {
      date: `${pad(ts.getMonth() + 1)}/${pad(ts.getDate())}/${ts.getFullYear()}`,
      time: `${pad(ts.getHours())}:${pad(ts.getMinutes())}:${pad(ts.getSeconds())}`,
    };
  }
  function getBarTimestampForX(x) {
    const L = getLayout(); if (!L || !cs.data.length) return new Date();
    const idx = Math.min(Math.max(Math.floor((x / L.chartW) * cs.data.length), 0), cs.data.length - 1);
    return cs.data[idx].timestamp || new Date();
  }
  function styleOptions(sel) {
    return ['solid','dashed','dotted'].map(s => `<option value="${s}" ${s===sel?'selected':''}>${s==='solid'?'─────':s==='dashed'?'- - - -':'· · · ·'}</option>`).join('');
  }
  function selectOpt(opts, sel) {
    return opts.map(o => `<option value="${o}" ${o===sel?'selected':''}>${o}</option>`).join('');
  }

  function showFibPropertiesModal(idx) {
    const d = cs.drawings[idx];
    if (!d || d.type !== 'fibonacci') return;
    if (!d.props) d.props = makeDefaultFibProps();
    const work = JSON.parse(JSON.stringify(d.props));
    let workPrice1 = d.price1, workPrice2 = d.price2;
    const beginTs = getBarTimestampForX(d.x1);
    const endTs = getBarTimestampForX(d.x2);
    const beginParts = dateToParts(beginTs);
    const endParts = dateToParts(endTs);

    const renderRows = (curves) => curves.map((c, i) => `
      <tr data-row="${i}">
        <td><input type="checkbox" data-f="visible" ${c.visible ? 'checked' : ''}></td>
        <td><input type="number" step="0.001" data-f="coefficient" value="${c.coefficient}"></td>
        <td><input type="color" data-f="color" value="${c.color}"></td>
        <td><select data-f="style">${styleOptions(c.style)}</select></td>
        <td><input type="number" min="1" max="6" step="1" data-f="width" value="${c.width}"></td>
      </tr>
    `).join('');

    const body = `
      <div class="fib-props">
        <div class="fib-row">
          <label>Name:</label>
          <input class="fib-name" type="text" value="${work.name.replace(/"/g, '&quot;')}">
        </div>
        <div class="fib-row fib-grid3">
          <div><label>Left extension:</label><select class="fib-le">${selectOpt(['Off','On'], work.leftExtension)}</select></div>
          <div><label>Right extension:</label><select class="fib-re">${selectOpt(['Off','On'], work.rightExtension)}</select></div>
          <div><label>Show coefficients:</label><select class="fib-sc">${selectOpt(['None','On the left','On the right'], work.showCoefficients)}</select></div>
        </div>
        <div class="fib-row fib-grid3">
          <div><label>Show price:</label><select class="fib-sp">${selectOpt(['None','On the left','On the right'], work.showPrice)}</select></div>
          <div></div><div></div>
        </div>
        <div class="fib-section-title">Begin point:</div>
        <div class="fib-row fib-grid3">
          <div><label>Value:</label><input class="fib-bv" type="number" step="0.0001" value="${workPrice1}"></div>
          <div><label>Date:</label><input class="fib-bd" type="text" value="${beginParts.date}"></div>
          <div><label>Time:</label><input class="fib-bt" type="text" value="${beginParts.time}"></div>
        </div>
        <div class="fib-section-title">End point:</div>
        <div class="fib-row fib-grid3">
          <div><label>Value:</label><input class="fib-ev" type="number" step="0.0001" value="${workPrice2}"></div>
          <div><label>Date:</label><input class="fib-ed" type="text" value="${endParts.date}"></div>
          <div><label>Time:</label><input class="fib-et" type="text" value="${endParts.time}"></div>
        </div>
        <div class="fib-section-title">Fibonacci curve properties:</div>
        <div class="fib-table-wrap">
          <table class="fib-table">
            <thead><tr><th>Visible</th><th>Coefficient</th><th>Color</th><th>Style</th><th>Width</th></tr></thead>
            <tbody class="fib-tbody">${renderRows(work.curves)}</tbody>
          </table>
        </div>
        <div class="fib-row fib-btn-row">
          <button class="btn btn-secondary fib-add-curve">Add curve</button>
          <button class="btn btn-secondary fib-remove-curve">Remove curve</button>
          <button class="btn btn-secondary fib-set-all">Set color for all curves</button>
        </div>
        <div class="fib-section-title">Trendline curve properties:</div>
        <div class="fib-row fib-grid3">
          <div><label>Color:</label><input class="fib-tlc" type="color" value="${work.trendlineColor}"></div>
          <div><label>Style:</label><select class="fib-tls">${styleOptions(work.trendlineStyle)}</select></div>
          <div><label>Width:</label><input class="fib-tlw" type="number" min="1" max="6" value="${work.trendlineWidth}"></div>
        </div>
      </div>
    `;

    showModal({
      title: 'Properties',
      width: '640px',
      body,
      actions: [
        { label: 'Reset to factory default', class: 'btn-secondary', onClick: () => {
            FIB_DEFAULT_OVERRIDE = null;
            snapshotDrawings();
            const keepName = d.props.name;
            d.props = makeDefaultFibProps();
            d.props.name = keepName;
            closeModal();
            drawChart();
            showFibPropertiesModal(idx);
          } },
        { label: 'Save as default', class: 'btn-secondary', onClick: () => { collect(); FIB_DEFAULT_OVERRIDE = JSON.parse(JSON.stringify(work)); } },
        { label: 'OK', class: 'btn-primary', onClick: () => { collect(); commit(); closeModal(); drawChart(); } },
        { label: 'Cancel', class: 'btn-secondary', onClick: () => closeModal() },
      ],
    });

    const root = document.querySelector('.fib-props');
    if (!root) return;
    let selectedRow = -1;
    const tbody = root.querySelector('.fib-tbody');
    tbody.addEventListener('click', (ev) => {
      const tr = ev.target.closest('tr');
      if (!tr) return;
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      selectedRow = parseInt(tr.dataset.row, 10);
    });
    root.querySelector('.fib-add-curve').addEventListener('click', () => {
      collectRows();
      work.curves.push({ visible: true, coefficient: 0, color: '#58a6ff', style: 'dashed', width: 1 });
      tbody.innerHTML = renderRows(work.curves);
    });
    root.querySelector('.fib-remove-curve').addEventListener('click', () => {
      collectRows();
      if (selectedRow >= 0 && selectedRow < work.curves.length) {
        work.curves.splice(selectedRow, 1);
        selectedRow = -1;
        tbody.innerHTML = renderRows(work.curves);
      }
    });
    root.querySelector('.fib-set-all').addEventListener('click', () => {
      const picker = document.createElement('input');
      picker.type = 'color'; picker.value = '#58a6ff';
      picker.addEventListener('input', () => {
        collectRows();
        work.curves.forEach(c => c.color = picker.value);
        tbody.innerHTML = renderRows(work.curves);
      });
      picker.click();
    });

    function collectRows() {
      tbody.querySelectorAll('tr').forEach((tr, i) => {
        if (!work.curves[i]) return;
        work.curves[i].visible = tr.querySelector('[data-f="visible"]').checked;
        work.curves[i].coefficient = parseFloat(tr.querySelector('[data-f="coefficient"]').value) || 0;
        work.curves[i].color = tr.querySelector('[data-f="color"]').value;
        work.curves[i].style = tr.querySelector('[data-f="style"]').value;
        work.curves[i].width = parseInt(tr.querySelector('[data-f="width"]').value, 10) || 1;
      });
    }
    function collect() {
      work.name = root.querySelector('.fib-name').value;
      work.leftExtension = root.querySelector('.fib-le').value;
      work.rightExtension = root.querySelector('.fib-re').value;
      work.showCoefficients = root.querySelector('.fib-sc').value;
      work.showPrice = root.querySelector('.fib-sp').value;
      workPrice1 = parseFloat(root.querySelector('.fib-bv').value);
      workPrice2 = parseFloat(root.querySelector('.fib-ev').value);
      work.trendlineColor = root.querySelector('.fib-tlc').value;
      work.trendlineStyle = root.querySelector('.fib-tls').value;
      work.trendlineWidth = parseInt(root.querySelector('.fib-tlw').value, 10) || 1;
      collectRows();
    }
    function commit() {
      snapshotDrawings();
      d.props = JSON.parse(JSON.stringify(work));
      if (!Number.isNaN(workPrice1)) d.price1 = workPrice1;
      if (!Number.isNaN(workPrice2)) d.price2 = workPrice2;
    }
  }

  overlayCanvas.addEventListener('contextmenu', (e) => {
    const rect = overlayCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const idx = hitTestFibonacci(mx, my);
    if (idx >= 0) {
      e.preventDefault();
      showFibContextMenu(e.clientX, e.clientY, idx);
    }
  });

  overlayCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const L = getLayout();
    if (!L) return;

    if (cs.activeTool === 'crosshair') return;

    if (cs.activeTool === 'horizontal') {
      if (my < L.mainH) {
        const { min, max } = getPriceRange();
        const price = max - (my / L.mainH) * (max - min);
        snapshotDrawings();
        cs.drawings.push({ type: 'horizontal', price });
        drawChart();
      }
    } else if (cs.activeTool === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'tv-text-input';
      input.style.left = mx + 'px';
      input.style.top = my + 'px';
      document.getElementById('chart-area').appendChild(input);
      input.focus();
      const commitText = () => {
        const text = input.value.trim();
        if (text) {
          snapshotDrawings();
          cs.drawings.push({ type: 'text', x: mx, y: my, text, color: '#e6edf3', fontSize: 13 });
          drawChart();
        }
        input.remove();
      };
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') commitText(); if (ev.key === 'Escape') input.remove(); });
      input.addEventListener('blur', commitText);
    } else if (['trendline', 'rectangle', 'fibonacci', 'measure'].includes(cs.activeTool)) {
      drawStart = { x: mx, y: my };
    }
  });

  overlayCanvas.addEventListener('mouseup', (e) => {
    if (!drawStart) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const L = getLayout();

    if (Math.abs(mx - drawStart.x) > 5 || Math.abs(my - drawStart.y) > 5) {
      snapshotDrawings();

      if (cs.activeTool === 'trendline') {
        cs.drawings.push({ type: 'trendline', x1: drawStart.x, y1: drawStart.y, x2: mx, y2: my });
      } else if (cs.activeTool === 'rectangle') {
        cs.drawings.push({ type: 'rectangle', x1: drawStart.x, y1: drawStart.y, x2: mx, y2: my });
      } else if (cs.activeTool === 'fibonacci') {
        const { min, max } = getPriceRange();
        const range = max - min;
        const price1 = max - (drawStart.y / L.mainH) * range;
        const price2 = max - (my / L.mainH) * range;
        cs.drawings.push({ type: 'fibonacci', price1, price2, x1: drawStart.x, y1: drawStart.y, x2: mx, y2: my, props: makeDefaultFibProps() });
      } else if (cs.activeTool === 'measure') {
        const { min, max } = getPriceRange();
        const range = max - min;
        const p1 = max - (drawStart.y / L.mainH) * range;
        const p2 = max - (my / L.mainH) * range;
        const diff2 = p2 - p1;
        const pct = p1 !== 0 ? (diff2 / p1 * 100) : 0;
        const bars = cs.data.length > 0 ? Math.abs(Math.floor((mx - drawStart.x) / (L.chartW / cs.data.length))) : 0;
        const label = `${diff2 >= 0 ? '+' : ''}${fmt(diff2)} (${pct.toFixed(2)}%) | ${bars} bars`;
        cs.drawings.push({ type: 'measure', x1: drawStart.x, y1: drawStart.y, x2: mx, y2: my, label });
      }
      drawChart();
    }
    drawStart = null;
    clearOverlay();
  });

  // ---- ResizeObserver ----
  const ro = new ResizeObserver(() => resizeCanvas());
  const chartArea = document.getElementById('chart-area');
  if (chartArea) ro.observe(chartArea);

  // ---- Init ----
  initAlerts();
  cs.fullData = generateData(cs.symbol);
  cs.viewStart = cs.fullData.length - cs.visibleBars;
  updateViewData();
  updateBadge();
  updateAlertBadge();
  setTimeout(resizeCanvas, 50);

  // Live updates
  updateInterval = setInterval(() => {
    const d = cs.fullData;
    if (d.length) {
      const last = d[d.length - 1];
      const change = (Math.random() - 0.5) * 0.008;
      last.close *= (1 + change);
      last.high = Math.max(last.high, last.close);
      last.low = Math.min(last.low, last.close);
      checkAlerts(cs.symbol, last.close);
      updateAlertBadge();
      updateViewData();
      drawChart();
    }
  }, 2000);

  // ---- Cleanup ----
  onViewCleanup(() => {
    if (updateInterval) clearInterval(updateInterval);
    ro.disconnect();
    document.removeEventListener('click', closeDropdowns);
    document.removeEventListener('keydown', keyHandler);
    closeCtxMenu();
  });
}
