/* ========================================
   TRADING MODULE
   Trading terminal functionality
   Live Binance data via REST + WebSocket
   ======================================== */

const Trading = (function() {
  'use strict';

  // ── Binance symbol / interval mappings ──
  const PAIR_TO_BINANCE = {
    'XRP/USD': 'XRPUSDT', 'BTC/USD': 'BTCUSDT', 'ETH/USD': 'ETHUSDT',
    'SOL/USD': 'SOLUSDT', 'DOGE/USD': 'DOGEUSDT', 'ADA/USD': 'ADAUSDT',
    'AVAX/USD': 'AVAXUSDT', 'DOT/USD': 'DOTUSDT', 'LINK/USD': 'LINKUSDT',
    'MATIC/USD': 'MATICUSDT', 'BNB/USD': 'BNBUSDT', 'LTC/USD': 'LTCUSDT',
    'SHIB/USD': 'SHIBUSDT', 'TRX/USD': 'TRXUSDT', 'UNI/USD': 'UNIUSDT',
    'ATOM/USD': 'ATOMUSDT', 'XLM/USD': 'XLMUSDT', 'NEAR/USD': 'NEARUSDT',
    'APT/USD': 'APTUSDT', 'FIL/USD': 'FILUSDT', 'AAVE/USD': 'AAVEUSDT',
    'ARB/USD': 'ARBUSDT', 'OP/USD': 'OPUSDT', 'PEPE/USD': 'PEPEUSDT',
    'SUI/USD': 'SUIUSDT', 'INJ/USD': 'INJUSDT', 'RENDER/USD': 'RENDERUSDT',
    'FET/USD': 'FETUSDT', 'WIF/USD': 'WIFUSDT', 'HBAR/USD': 'HBARUSDT',
  };
  const PAIR_NAMES = {
    'XRP/USD': 'Ripple', 'BTC/USD': 'Bitcoin', 'ETH/USD': 'Ethereum',
    'SOL/USD': 'Solana', 'DOGE/USD': 'Dogecoin', 'ADA/USD': 'Cardano',
    'AVAX/USD': 'Avalanche', 'DOT/USD': 'Polkadot', 'LINK/USD': 'Chainlink',
    'MATIC/USD': 'Polygon', 'BNB/USD': 'BNB', 'LTC/USD': 'Litecoin',
    'SHIB/USD': 'Shiba Inu', 'TRX/USD': 'TRON', 'UNI/USD': 'Uniswap',
    'ATOM/USD': 'Cosmos', 'XLM/USD': 'Stellar', 'NEAR/USD': 'NEAR Protocol',
    'APT/USD': 'Aptos', 'FIL/USD': 'Filecoin', 'AAVE/USD': 'Aave',
    'ARB/USD': 'Arbitrum', 'OP/USD': 'Optimism', 'PEPE/USD': 'Pepe',
    'SUI/USD': 'Sui', 'INJ/USD': 'Injective', 'RENDER/USD': 'Render',
    'FET/USD': 'Fetch.ai', 'WIF/USD': 'dogwifhat', 'HBAR/USD': 'Hedera',
  };
  const TF_TO_BINANCE = {
    '1m': '1m', '5m': '5m', '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d',
  };

  // State
  let state = {
    pair: 'XRP/USD',
    timeframe: '15m',
    orderType: 'limit',
    side: 'buy',
    price: 0,
    amount: 0,
    total: 0,
    orderBook: { bids: [], asks: [] },
    trades: [],
    positions: [],
    chartOptions: {
      chartType: 'candle',
      showEMA9: true, showSMA: true, showBB: true,
      showVWAP: true, showRSI: true, showMACD: false,
      showStoch: false, showVolume: true
    }
  };

  let chartController = null;
  let ws = null;           // Binance kline WebSocket
  let wsDepth = null;      // Binance depth WebSocket
  let wsTrades = null;     // Binance trade WebSocket

  const TF_BAR_COUNTS = { '1m': 120, '5m': 100, '15m': 90, '1H': 75, '4H': 60, '1D': 50 };

  // DOM cache
  let elements = {};

  // ── Searchable asset list ──
  const ASSET_LIST = [
    { pair: 'BTC/USD', symbol: 'BTCUSDT', name: 'Bitcoin', color: '#f7931a' },
    { pair: 'ETH/USD', symbol: 'ETHUSDT', name: 'Ethereum', color: '#627eea' },
    { pair: 'XRP/USD', symbol: 'XRPUSDT', name: 'Ripple', color: '#00aae4' },
    { pair: 'SOL/USD', symbol: 'SOLUSDT', name: 'Solana', color: '#9945ff' },
    { pair: 'DOGE/USD', symbol: 'DOGEUSDT', name: 'Dogecoin', color: '#c2a633' },
    { pair: 'ADA/USD', symbol: 'ADAUSDT', name: 'Cardano', color: '#0033ad' },
    { pair: 'AVAX/USD', symbol: 'AVAXUSDT', name: 'Avalanche', color: '#e84142' },
    { pair: 'DOT/USD', symbol: 'DOTUSDT', name: 'Polkadot', color: '#e6007a' },
    { pair: 'LINK/USD', symbol: 'LINKUSDT', name: 'Chainlink', color: '#2a5ada' },
    { pair: 'MATIC/USD', symbol: 'MATICUSDT', name: 'Polygon', color: '#8247e5' },
    { pair: 'BNB/USD', symbol: 'BNBUSDT', name: 'BNB', color: '#f3ba2f' },
    { pair: 'LTC/USD', symbol: 'LTCUSDT', name: 'Litecoin', color: '#bfbbbb' },
    { pair: 'SHIB/USD', symbol: 'SHIBUSDT', name: 'Shiba Inu', color: '#ffa409' },
    { pair: 'TRX/USD', symbol: 'TRXUSDT', name: 'TRON', color: '#eb0029' },
    { pair: 'UNI/USD', symbol: 'UNIUSDT', name: 'Uniswap', color: '#ff007a' },
    { pair: 'ATOM/USD', symbol: 'ATOMUSDT', name: 'Cosmos', color: '#2e3148' },
    { pair: 'XLM/USD', symbol: 'XLMUSDT', name: 'Stellar', color: '#14b6e7' },
    { pair: 'NEAR/USD', symbol: 'NEARUSDT', name: 'NEAR Protocol', color: '#00c1de' },
    { pair: 'APT/USD', symbol: 'APTUSDT', name: 'Aptos', color: '#4cd7c6' },
    { pair: 'FIL/USD', symbol: 'FILUSDT', name: 'Filecoin', color: '#0090ff' },
    { pair: 'AAVE/USD', symbol: 'AAVEUSDT', name: 'Aave', color: '#b6509e' },
    { pair: 'ARB/USD', symbol: 'ARBUSDT', name: 'Arbitrum', color: '#28a0f0' },
    { pair: 'OP/USD', symbol: 'OPUSDT', name: 'Optimism', color: '#ff0420' },
    { pair: 'PEPE/USD', symbol: 'PEPEUSDT', name: 'Pepe', color: '#479e34' },
    { pair: 'SUI/USD', symbol: 'SUIUSDT', name: 'Sui', color: '#4da2ff' },
    { pair: 'INJ/USD', symbol: 'INJUSDT', name: 'Injective', color: '#00f2fe' },
    { pair: 'RENDER/USD', symbol: 'RENDERUSDT', name: 'Render', color: '#000' },
    { pair: 'FET/USD', symbol: 'FETUSDT', name: 'Fetch.ai', color: '#1c1c3d' },
    { pair: 'WIF/USD', symbol: 'WIFUSDT', name: 'dogwifhat', color: '#c77dff' },
    { pair: 'HBAR/USD', symbol: 'HBARUSDT', name: 'Hedera', color: '#000' },
  ];
  let assetPriceCache = {};
  let searchHighlightIdx = -1;

  // Initialize
  async function init() {
    cacheElements();
    bindEvents();
    bindAssetSearch();
    loadMarketData();
    await updateChart();
    startRealtimeUpdates();
    prefetchAssetPrices();
  }

  function cacheElements() {
    elements = {
      pairSelector: document.getElementById('pair-selector'),
      priceChart: document.getElementById('price-chart'),
      orderBook: document.getElementById('order-book'),
      tradeHistory: document.getElementById('recent-trades'),
      orderForm: document.getElementById('order-form'),
      priceInput: document.getElementById('order-price'),
      amountInput: document.getElementById('order-amount'),
      totalDisplay: document.getElementById('order-total'),
      buyBtn: document.querySelector('[data-side="buy"]'),
      sellBtn: document.querySelector('[data-side="sell"]'),
      limitBtn: document.querySelector('[data-type="limit"]'),
      marketBtn: document.querySelector('[data-type="market"]'),
      stopBtn: document.querySelector('[data-type="stop"]'),
      assetSearch: document.getElementById('asset-search'),
      assetResults: document.getElementById('asset-search-results'),
    };
  }

  function bindEvents() {
    // Pair selection
    elements.pairSelector?.addEventListener('change', handlePairChange);

    // Order type tabs
    document.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => setOrderType(btn.dataset.type));
    });

    // Buy/Sell tabs
    document.querySelectorAll('[data-side]').forEach(btn => {
      btn.addEventListener('click', () => setSide(btn.dataset.side));
    });

    // Price/Amount inputs
    elements.priceInput?.addEventListener('input', calculateTotal);
    elements.amountInput?.addEventListener('input', calculateTotal);

    // Order submission (button click, no form element)
    const placeOrderBtn = document.getElementById('place-order-btn');
    if (placeOrderBtn) {
      placeOrderBtn.addEventListener('click', handleOrderSubmit);
    }

    // Order book click to fill price
    elements.orderBook?.addEventListener('click', handleOrderBookClick);

    // Chart navigation arrows — cycle through assets
    const prevBtn = document.getElementById('chart-nav-prev');
    const nextBtn = document.getElementById('chart-nav-next');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const idx = ASSET_LIST.findIndex(a => a.pair === state.pair);
        const prev = idx <= 0 ? ASSET_LIST.length - 1 : idx - 1;
        selectAsset(ASSET_LIST[prev].pair);
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const idx = ASSET_LIST.findIndex(a => a.pair === state.pair);
        const next = idx >= ASSET_LIST.length - 1 ? 0 : idx + 1;
        selectAsset(ASSET_LIST[next].pair);
      });
    }

    // Timeframe buttons
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tf = btn.textContent.trim();
        if (!TF_BAR_COUNTS[tf]) return;
        state.timeframe = tf;
        document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.toggle('active', b === btn));
        updateChart().then(() => connectKlineWS());
      });
    });

    // Indicator toggle buttons
    document.querySelectorAll('.indicator-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.indicator;
        if (!key) return;
        state.chartOptions[key] = !state.chartOptions[key];
        btn.classList.toggle('active', state.chartOptions[key]);
        rerenderChart();
      });
    });

    // Chart type buttons
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.chartType;
        if (!type) return;
        state.chartOptions.chartType = type;
        document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.toggle('active', b === btn));
        rerenderChart();
      });
    });

    // Drawing tool buttons
    document.querySelectorAll('.drawing-tool-btn[data-drawing]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.drawing;
        if (!chartController) return;
        const isActive = btn.classList.contains('active');
        // Deactivate all drawing buttons
        document.querySelectorAll('.drawing-tool-btn[data-drawing]').forEach(b => b.classList.remove('active'));
        if (isActive) {
          // Toggle off
          chartController.setDrawingMode(null);
        } else {
          btn.classList.add('active');
          chartController.setDrawingMode(mode);
        }
      });
    });

    // Clear drawings button
    const clearBtn = document.getElementById('clear-drawings-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!chartController) return;
        chartController.clearDrawings();
        document.querySelectorAll('.drawing-tool-btn[data-drawing]').forEach(b => b.classList.remove('active'));
      });
    }

    // Fullscreen button
    const fsBtn = document.getElementById('chart-fullscreen-btn');
    const chartCard = document.getElementById('price-chart')?.closest('.card');
    if (fsBtn && chartCard) {
      fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
          chartCard.requestFullscreen().then(() => {
            chartCard.classList.add('chart-card-fullscreen');
            setTimeout(() => {
              if (chartController) { chartController.destroy(); chartController = null; }
              rerenderChart();
            }, 100);
          }).catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      });
      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          chartCard.classList.remove('chart-card-fullscreen');
          setTimeout(() => {
            if (chartController) { chartController.destroy(); chartController = null; }
            rerenderChart();
          }, 100);
        }
      });
    }

    // Redraw chart on resize (destroy + recreate for new dimensions)
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (chartController) { chartController.destroy(); chartController = null; }
        rerenderChart();
      }, 200);
    });
  }

  function handlePairChange(e) {
    state.pair = e.target.value;
    closeAllSockets();
    loadMarketData();
    updateChart().then(() => startRealtimeUpdates());
  }

  function selectAsset(pair) {
    state.pair = pair;
    // Sync hidden select
    if (elements.pairSelector) elements.pairSelector.value = pair;
    // Update header display
    const asset = ASSET_LIST.find(a => a.pair === pair);
    const pairName = document.getElementById('pair-name');
    const pairSub = document.getElementById('pair-subtitle');
    if (pairName) pairName.textContent = 'Digital Currencies';
    if (pairSub) pairSub.textContent = `${pair} · ${asset ? asset.name : ''}`;
    // Update chart header label
    const chartLabel = document.getElementById('chart-pair-label');
    if (chartLabel) chartLabel.textContent = pair;
    // Update order panel label
    const amtLabel = document.getElementById('order-amount-label');
    if (amtLabel) amtLabel.textContent = pair.split('/')[0];
    const placeBtn = document.getElementById('place-order-btn');
    if (placeBtn) placeBtn.textContent = `${state.side === 'sell' ? 'Sell' : 'Buy'} ${pair.split('/')[0]}`;
    // Clear search
    if (elements.assetSearch) elements.assetSearch.value = '';
    if (elements.assetResults) elements.assetResults.classList.remove('show');
    // Reload data
    closeAllSockets();
    loadMarketData();
    updateChart().then(() => startRealtimeUpdates());
    // Also add this pair to PAIR_TO_BINANCE if not present
    if (asset && !PAIR_TO_BINANCE[pair]) {
      PAIR_TO_BINANCE[pair] = asset.symbol;
      PAIR_NAMES[pair] = asset.name;
    }
  }

  async function prefetchAssetPrices() {
    try {
      const symbols = ASSET_LIST.map(a => a.symbol);
      const url = `${BINANCE_REST}/ticker/price`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      data.forEach(d => { assetPriceCache[d.symbol] = parseFloat(d.price); });
    } catch (e) { /* silent */ }
  }

  function bindAssetSearch() {
    const input = elements.assetSearch;
    const results = elements.assetResults;
    if (!input || !results) return;

    // Keyboard shortcut: "/" to focus search (skip if user is in an input/textarea)
    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (e.key === '/' && document.activeElement !== input && !e.ctrlKey && !e.metaKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        input.focus();
      }
      if (e.key === 'Escape' && document.activeElement === input) {
        input.blur();
        results.classList.remove('show');
      }
    });

    input.addEventListener('focus', () => {
      renderSearchResults(input.value);
      results.classList.add('show');
    });

    input.addEventListener('input', () => {
      searchHighlightIdx = -1;
      renderSearchResults(input.value);
      results.classList.add('show');
    });

    // Arrow keys + enter
    input.addEventListener('keydown', (e) => {
      const items = results.querySelectorAll('.asset-result-item');
      if (!items.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchHighlightIdx = Math.min(searchHighlightIdx + 1, items.length - 1);
        items.forEach((it, i) => it.classList.toggle('highlighted', i === searchHighlightIdx));
        items[searchHighlightIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchHighlightIdx = Math.max(searchHighlightIdx - 1, 0);
        items.forEach((it, i) => it.classList.toggle('highlighted', i === searchHighlightIdx));
        items[searchHighlightIdx]?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = items[searchHighlightIdx >= 0 ? searchHighlightIdx : 0];
        if (item) {
          const pair = item.dataset.pair;
          if (pair) selectAsset(pair);
        }
      }
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.asset-search-wrapper')) {
        results.classList.remove('show');
      }
    });
  }

  function renderSearchResults(query) {
    const results = elements.assetResults;
    if (!results) return;
    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? ASSET_LIST.filter(a =>
          a.pair.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.symbol.toLowerCase().includes(q) ||
          a.pair.split('/')[0].toLowerCase() === q
        )
      : ASSET_LIST;

    results.innerHTML = filtered.map((a, i) => {
      const ticker = a.pair.split('/')[0];
      const price = assetPriceCache[a.symbol];
      const priceStr = price ? (price >= 1 ? '$' + price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$' + price.toFixed(6)) : '...';
      const isActive = a.pair === state.pair;
      return `
        <div class="asset-result-item${isActive ? ' highlighted' : ''}" data-pair="${a.pair}">
          <div class="asset-result-icon" style="background:${a.color};">${ticker.slice(0, 2)}</div>
          <div class="asset-result-info">
            <div class="asset-result-symbol">${a.pair}${isActive ? ' <span style="color:#10b981;font-size:0.65rem;">ACTIVE</span>' : ''}</div>
            <div class="asset-result-name">${a.name}</div>
          </div>
          <div class="asset-result-price">
            <div class="asset-result-price-val">${priceStr}</div>
          </div>
        </div>`;
    }).join('');

    // Click handler for results
    results.querySelectorAll('.asset-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const pair = item.dataset.pair;
        if (pair) selectAsset(pair);
      });
    });
  }

  function setOrderType(type) {
    state.orderType = type;
    document.querySelectorAll('[data-type]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    // Show/hide price input for market orders
    if (elements.priceInput) {
      const priceGroup = elements.priceInput.closest('.form-group');
      if (priceGroup) {
        priceGroup.style.display = type === 'market' ? 'none' : 'block';
      }
    }
  }

  function setSide(side) {
    state.side = side;
    document.querySelectorAll('[data-side]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.side === side);
    });

    // Update place-order button
    const submitBtn = document.getElementById('place-order-btn');
    if (submitBtn) {
      submitBtn.className = `btn ${side === 'buy' ? 'btn-buy' : 'btn-sell'}`;
      submitBtn.textContent = `${side === 'buy' ? 'Buy' : 'Sell'} ${state.pair.split('/')[0]}`;
    }
  }

  function calculateTotal() {
    const price = parseFloat(elements.priceInput?.value) || 0;
    const amount = parseFloat(elements.amountInput?.value) || 0;
    state.price = price;
    state.amount = amount;
    state.total = price * amount;
    
    if (elements.totalDisplay) {
      elements.totalDisplay.value = state.total.toFixed(2);
    }
    // Update fee display
    const feeEl = document.getElementById('order-fee');
    if (feeEl) feeEl.textContent = '$' + (state.total * 0.001).toFixed(2);
  }

  function handleOrderBookClick(e) {
    const row = e.target.closest('[data-price]');
    if (row && elements.priceInput) {
      elements.priceInput.value = row.dataset.price;
      calculateTotal();
    }
  }

  async function handleOrderSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();

    if (!state.amount || (state.orderType !== 'market' && !state.price)) {
      Components.toast('Please fill in all required fields', 'error');
      return;
    }

    const order = {
      pair: state.pair,
      type: state.orderType,
      side: state.side,
      price: state.orderType === 'market' ? null : state.price,
      amount: state.amount,
      total: state.total
    };

    try {
      // Simulate order submission
      await simulateOrder(order);
      Components.toast(`${state.side.toUpperCase()} order placed successfully`, 'success');
      resetForm();
    } catch (error) {
      Components.toast('Order failed: ' + error.message, 'error');
    }
  }

  function simulateOrder(order) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.1) {
          resolve({ orderId: 'ORD-' + Date.now() });
        } else {
          reject(new Error('Insufficient balance'));
        }
      }, 500);
    });
  }

  function resetForm() {
    if (elements.priceInput) elements.priceInput.value = '';
    if (elements.amountInput) elements.amountInput.value = '';
    state.price = 0;
    state.amount = 0;
    state.total = 0;
    calculateTotal();
  }

  // ── Binance REST helpers ──
  const BINANCE_REST = 'https://api.binance.com/api/v3';

  async function fetchKlines(symbol, interval, limit) {
    const url = `${BINANCE_REST}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance klines ${res.status}`);
    const raw = await res.json();
    return raw.map(k => ({
      timestamp: new Date(k[0]),
      open:   parseFloat(k[1]),
      high:   parseFloat(k[2]),
      low:    parseFloat(k[3]),
      close:  parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  }

  async function fetchTicker(symbol) {
    const url = `${BINANCE_REST}/ticker/24hr?symbol=${symbol}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  async function fetchDepth(symbol, limit = 10) {
    const url = `${BINANCE_REST}/depth?symbol=${symbol}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  async function fetchRecentTrades(symbol, limit = 20) {
    const url = `${BINANCE_REST}/trades?symbol=${symbol}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  }

  // ── Update pair info header with real 24h data ──
  async function updatePairInfo() {
    const sym = PAIR_TO_BINANCE[state.pair];
    if (!sym) return;
    const ticker = await fetchTicker(sym).catch(() => null);
    if (!ticker) return;

    const price = parseFloat(ticker.lastPrice);
    const changePercent = parseFloat(ticker.priceChangePercent);
    const priceName = document.getElementById('pair-name');
    const priceSubtitle = document.getElementById('pair-subtitle');
    const priceEl = document.getElementById('pair-price');
    const changeEl = document.getElementById('pair-change');

    if (priceName) priceName.textContent = 'Digital Currencies';
    if (priceSubtitle) priceSubtitle.textContent = `${state.pair} · ${PAIR_NAMES[state.pair] || ''}`;
    const chartLabel = document.getElementById('chart-pair-label');
    if (chartLabel) chartLabel.textContent = state.pair;
    if (priceEl) priceEl.textContent = '$' + (price >= 1 ? price.toFixed(2) : price.toFixed(4));
    if (changeEl) {
      const sign = changePercent >= 0 ? '+' : '';
      changeEl.textContent = `${sign}${changePercent.toFixed(2)}% (24h)`;
      changeEl.className = `pair-change ${changePercent >= 0 ? 'text-green' : 'text-red'}`;
    }

    // Update order price input
    if (elements.priceInput && !elements.priceInput.value) {
      elements.priceInput.value = price >= 1 ? price.toFixed(2) : price.toFixed(4);
    }
  }

  async function loadMarketData() {
    const sym = PAIR_TO_BINANCE[state.pair];
    if (!sym) return;

    updatePairInfo();

    // Load real order book
    const depth = await fetchDepth(sym, 10).catch(() => null);
    if (depth) {
      const maxBid = Math.max(...depth.bids.map(b => parseFloat(b[1])));
      const maxAsk = Math.max(...depth.asks.map(a => parseFloat(a[1])));
      state.orderBook = {
        bids: depth.bids.map(b => ({ price: parseFloat(b[0]), amount: parseFloat(b[1]), depth: (parseFloat(b[1]) / maxBid) * 100 })),
        asks: depth.asks.map(a => ({ price: parseFloat(a[0]), amount: parseFloat(a[1]), depth: (parseFloat(a[1]) / maxAsk) * 100 })),
      };
      renderOrderBook(state.orderBook);
    }

    // Load real recent trades
    const rawTrades = await fetchRecentTrades(sym, 20).catch(() => null);
    if (rawTrades) {
      state.trades = rawTrades.map(t => ({
        price: parseFloat(t.price),
        amount: parseFloat(t.qty),
        side: t.isBuyerMaker ? 'sell' : 'buy',
        time: new Date(t.time),
      })).reverse();
      renderTrades(state.trades);
    }
  }

  // Smart price formatting: auto-detect decimal places based on price magnitude
  function fmtPrice(p) {
    if (p >= 1000) return p.toFixed(2);
    if (p >= 1) return p.toFixed(4);
    if (p >= 0.01) return p.toFixed(6);
    return p.toFixed(8);
  }
  function fmtAmount(a) {
    if (a >= 1000) return a.toFixed(0);
    if (a >= 1) return a.toFixed(2);
    return a.toFixed(4);
  }

  function renderOrderBook(data) {
    if (!elements.orderBook) return;

    const askHtml = data.asks.slice(0, 10).reverse().map(ask => `
      <div class="order-book-row ask" data-price="${ask.price}">
        <span class="price text-red">${fmtPrice(ask.price)}</span>
        <span class="amount">${fmtAmount(ask.amount)}</span>
        <span class="total">${(ask.price * ask.amount).toFixed(2)}</span>
        <div class="depth-bar ask" style="width: ${ask.depth}%"></div>
      </div>
    `).join('');

    const bidHtml = data.bids.slice(0, 10).map(bid => `
      <div class="order-book-row bid" data-price="${bid.price}">
        <span class="price text-green">${fmtPrice(bid.price)}</span>
        <span class="amount">${fmtAmount(bid.amount)}</span>
        <span class="total">${(bid.price * bid.amount).toFixed(2)}</span>
        <div class="depth-bar bid" style="width: ${bid.depth}%"></div>
      </div>
    `).join('');

    const spread = data.asks[0]?.price - data.bids[0]?.price || 0;
    const spreadPct = data.bids[0]?.price ? ((spread / data.bids[0].price) * 100).toFixed(3) : '0.000';
    const spreadHtml = `
      <div class="order-book-spread">
        <span>Spread: ${fmtPrice(Math.abs(spread))} (${spreadPct}%)</span>
      </div>
    `;

    elements.orderBook.innerHTML = `
      <div class="order-book-header">
        <span>Price</span><span>Amount</span><span>Total</span>
      </div>
      <div class="order-book-asks">${askHtml}</div>
      ${spreadHtml}
      <div class="order-book-bids">${bidHtml}</div>
    `;
  }

  function renderTrades(trades) {
    if (!elements.tradeHistory) return;

    elements.tradeHistory.innerHTML = trades.map(trade => `
      <div class="trade-row ${trade.side}">
        <span class="price ${trade.side === 'buy' ? 'text-green' : 'text-red'}">${fmtPrice(trade.price)}</span>
        <span class="amount">${fmtAmount(trade.amount)}</span>
        <span class="time">${Utils.formatTime(trade.time)}</span>
      </div>
    `).join('');
  }

  // Map timeframe string to milliseconds
  const TF_MS = { '1m': 60000, '5m': 300000, '15m': 900000, '1H': 3600000, '4H': 14400000, '1D': 86400000 };

  // Re-render chart with existing data (instant — no network request)
  // Used for indicator toggles, chart type changes, fullscreen, resize
  function rerenderChart() {
    if (!elements.priceChart || !state.candles || !state.candles.length) return;
    if (chartController) { chartController.destroy(); chartController = null; }
    const opts = Object.assign({}, state.chartOptions, {
      timeframeMs: TF_MS[state.timeframe] || 0,
    });
    chartController = Charts.candlestick(elements.priceChart, state.candles, opts);
  }

  // Fetch new data from Binance and render (used for pair/timeframe changes)
  async function updateChart() {
    if (!elements.priceChart) return;
    if (chartController) { chartController.destroy(); chartController = null; }

    const sym = PAIR_TO_BINANCE[state.pair];
    const interval = TF_TO_BINANCE[state.timeframe] || '15m';
    const count = TF_BAR_COUNTS[state.timeframe] || 60;

    let data;
    try {
      data = await fetchKlines(sym, interval, count);
    } catch (e) {
      console.warn('Binance kline fetch failed, falling back to mock data:', e);
      data = MockData.generateCandlestickData({ count, timeframe: state.timeframe, symbol: state.pair });
    }

    const opts = Object.assign({}, state.chartOptions, {
      timeframeMs: TF_MS[state.timeframe] || 0,
    });
    chartController = Charts.candlestick(elements.priceChart, data, opts);
    state.candles = data;

    // Update price display from last candle
    if (data.length) {
      const last = data[data.length - 1];
      const priceEl = document.getElementById('pair-price');
      if (priceEl) priceEl.textContent = '$' + (last.close >= 1 ? last.close.toFixed(2) : last.close.toFixed(4));
      if (elements.priceInput) {
        elements.priceInput.value = last.close >= 1 ? last.close.toFixed(2) : last.close.toFixed(4);
      }
    }
  }

  // ── WebSocket streaming ──
  const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

  function closeAllSockets() {
    [ws, wsDepth, wsTrades].forEach(s => { if (s) { s.onclose = null; s.close(); } });
    ws = null; wsDepth = null; wsTrades = null;
  }

  function startRealtimeUpdates() {
    connectKlineWS();
    connectDepthWS();
    connectTradeWS();
  }

  function connectKlineWS() {
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    const sym = PAIR_TO_BINANCE[state.pair]?.toLowerCase();
    const interval = TF_TO_BINANCE[state.timeframe] || '15m';
    if (!sym) return;

    ws = new WebSocket(`${BINANCE_WS}/${sym}@kline_${interval}`);
    ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (!msg.k) return;
      const k = msg.k;
      const candle = {
        timestamp: new Date(k.t),
        open:   parseFloat(k.o),
        high:   parseFloat(k.h),
        low:    parseFloat(k.l),
        close:  parseFloat(k.c),
        volume: parseFloat(k.v),
      };

      if (!chartController || !state.candles || !state.candles.length) return;

      // Update price header
      const priceEl = document.getElementById('pair-price');
      if (priceEl) priceEl.textContent = '$' + (candle.close >= 1 ? candle.close.toFixed(2) : candle.close.toFixed(4));

      const lastCandle = state.candles[state.candles.length - 1];
      if (lastCandle.timestamp.getTime() === candle.timestamp.getTime()) {
        // Same bar — update in place
        lastCandle.high = candle.high;
        lastCandle.low = candle.low;
        lastCandle.close = candle.close;
        lastCandle.volume = candle.volume;
        chartController.updateTick({ price: candle.close });
      } else if (k.x || candle.timestamp.getTime() > lastCandle.timestamp.getTime()) {
        // New bar
        if (k.x) {
          // Finalize previous bar then add new
          chartController.addCandle(candle);
          state.candles.push(candle);
        } else {
          // New bar started (not yet closed)
          chartController.addCandle(candle);
          state.candles.push(candle);
        }
      }
    };
    ws.onerror = (e) => console.warn('Kline WS error:', e);
    ws.onclose = () => { setTimeout(() => { if (state.pair) connectKlineWS(); }, 5000); };
  }

  function connectDepthWS() {
    if (wsDepth) { wsDepth.onclose = null; wsDepth.close(); wsDepth = null; }
    const sym = PAIR_TO_BINANCE[state.pair]?.toLowerCase();
    if (!sym) return;

    wsDepth = new WebSocket(`${BINANCE_WS}/${sym}@depth10@1000ms`);
    wsDepth.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (!msg.bids || !msg.asks) return;
      const maxBid = Math.max(...msg.bids.map(b => parseFloat(b[1])));
      const maxAsk = Math.max(...msg.asks.map(a => parseFloat(a[1])));
      state.orderBook = {
        bids: msg.bids.map(b => ({ price: parseFloat(b[0]), amount: parseFloat(b[1]), depth: (parseFloat(b[1]) / maxBid) * 100 })),
        asks: msg.asks.map(a => ({ price: parseFloat(a[0]), amount: parseFloat(a[1]), depth: (parseFloat(a[1]) / maxAsk) * 100 })),
      };
      renderOrderBook(state.orderBook);
    };
    wsDepth.onerror = (e) => console.warn('Depth WS error:', e);
    wsDepth.onclose = () => { setTimeout(() => { if (state.pair) connectDepthWS(); }, 5000); };
  }

  function connectTradeWS() {
    if (wsTrades) { wsTrades.onclose = null; wsTrades.close(); wsTrades = null; }
    const sym = PAIR_TO_BINANCE[state.pair]?.toLowerCase();
    if (!sym) return;

    wsTrades = new WebSocket(`${BINANCE_WS}/${sym}@trade`);
    wsTrades.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      if (!msg.p) return;
      const trade = {
        price: parseFloat(msg.p),
        amount: parseFloat(msg.q),
        side: msg.m ? 'sell' : 'buy',
        time: new Date(msg.T),
      };
      state.trades.unshift(trade);
      state.trades = state.trades.slice(0, 20);
      renderTrades(state.trades);
    };
    wsTrades.onerror = (e) => console.warn('Trade WS error:', e);
    wsTrades.onclose = () => { setTimeout(() => { if (state.pair) connectTradeWS(); }, 5000); };
  }

  // Public API
  return {
    init,
    setOrderType,
    setSide,
    getState: () => ({ ...state })
  };
})();

// Auto-initialize if on trading page
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('trading-terminal') || document.getElementById('price-chart')) {
    Trading.init();
  }
});
