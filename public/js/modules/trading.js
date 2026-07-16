/* ========================================
   TRADING MODULE
   Trading terminal functionality
   ======================================== */

const Trading = (function() {
  'use strict';

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
    positions: []
  };

  const TF_BAR_COUNTS = { '1m': 90, '5m': 80, '15m': 70, '1H': 60, '4H': 50, '1D': 40 };

  // DOM cache
  let elements = {};

  // Initialize
  function init() {
    cacheElements();
    bindEvents();
    loadMarketData();
    updateChart();
    startRealtimeUpdates();
  }

  function cacheElements() {
    elements = {
      pairSelector: document.getElementById('pair-selector'),
      priceChart: document.getElementById('price-chart'),
      orderBook: document.getElementById('order-book'),
      tradeHistory: document.getElementById('trade-history'),
      orderForm: document.getElementById('order-form'),
      priceInput: document.getElementById('order-price'),
      amountInput: document.getElementById('order-amount'),
      totalDisplay: document.getElementById('order-total'),
      buyBtn: document.querySelector('[data-side="buy"]'),
      sellBtn: document.querySelector('[data-side="sell"]'),
      limitBtn: document.querySelector('[data-type="limit"]'),
      marketBtn: document.querySelector('[data-type="market"]'),
      stopBtn: document.querySelector('[data-type="stop"]')
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

    // Order submission
    elements.orderForm?.addEventListener('submit', handleOrderSubmit);

    // Order book click to fill
    elements.orderBook?.addEventListener('click', handleOrderBookClick);

    // Timeframe buttons
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tf = btn.textContent.trim();
        if (!TF_BAR_COUNTS[tf]) return;
        state.timeframe = tf;
        document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.toggle('active', b === btn));
        updateChart();
      });
    });

    // Redraw chart on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateChart, 150);
    });
  }

  function handlePairChange(e) {
    state.pair = e.target.value;
    loadMarketData();
    updateChart();
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
    
    // Update button color
    const submitBtn = elements.orderForm?.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.className = `btn btn-${side === 'buy' ? 'success' : 'danger'} w-full`;
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
      elements.totalDisplay.textContent = Utils.formatCurrency(state.total);
    }
  }

  function handleOrderBookClick(e) {
    const row = e.target.closest('[data-price]');
    if (row && elements.priceInput) {
      elements.priceInput.value = row.dataset.price;
      calculateTotal();
    }
  }

  async function handleOrderSubmit(e) {
    e.preventDefault();
    
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

  function loadMarketData() {
    // Load order book
    const orderBook = MockData.generateOrderBook();
    state.orderBook = orderBook;
    renderOrderBook(orderBook);

    // Load recent trades
    const trades = MockData.generateTrades(20);
    state.trades = trades;
    renderTrades(trades);
  }

  function renderOrderBook(data) {
    if (!elements.orderBook) return;

    const askHtml = data.asks.slice(0, 10).reverse().map(ask => `
      <div class="order-book-row ask" data-price="${ask.price}">
        <span class="price text-red">${ask.price.toFixed(4)}</span>
        <span class="amount">${ask.amount.toFixed(2)}</span>
        <span class="total">${(ask.price * ask.amount).toFixed(2)}</span>
        <div class="depth-bar ask" style="width: ${ask.depth}%"></div>
      </div>
    `).join('');

    const bidHtml = data.bids.slice(0, 10).map(bid => `
      <div class="order-book-row bid" data-price="${bid.price}">
        <span class="price text-green">${bid.price.toFixed(4)}</span>
        <span class="amount">${bid.amount.toFixed(2)}</span>
        <span class="total">${(bid.price * bid.amount).toFixed(2)}</span>
        <div class="depth-bar bid" style="width: ${bid.depth}%"></div>
      </div>
    `).join('');

    const spread = data.asks[0]?.price - data.bids[0]?.price || 0;
    const spreadHtml = `
      <div class="order-book-spread">
        <span>Spread: ${spread.toFixed(4)} (${((spread / data.bids[0]?.price) * 100).toFixed(2)}%)</span>
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
        <span class="price ${trade.side === 'buy' ? 'text-green' : 'text-red'}">${trade.price.toFixed(4)}</span>
        <span class="amount">${trade.amount.toFixed(2)}</span>
        <span class="time">${Utils.formatTime(trade.time)}</span>
      </div>
    `).join('');
  }

  function updateChart() {
    if (!elements.priceChart) return;
    const count = TF_BAR_COUNTS[state.timeframe] || 60;
    const data = MockData.generateCandlestickData({
      count,
      timeframe: state.timeframe,
      symbol: state.pair,
    });
    Charts.candlestick(elements.priceChart, data);
    // Cache the most recent frame so live ticks can mutate the last bar
    state.candles = data;
  }

  function startRealtimeUpdates() {
    // Simulate real-time updates
    setInterval(() => {
      updateOrderBook();
      addNewTrade();
    }, 2000);
  }

  function updateOrderBook() {
    // Slightly modify existing order book
    state.orderBook.bids.forEach(bid => {
      bid.amount += (Math.random() - 0.5) * 100;
      bid.amount = Math.max(10, bid.amount);
    });
    state.orderBook.asks.forEach(ask => {
      ask.amount += (Math.random() - 0.5) * 100;
      ask.amount = Math.max(10, ask.amount);
    });
    renderOrderBook(state.orderBook);
  }

  function addNewTrade() {
    const lastPrice = state.trades[0]?.price || 2.5;
    const newTrade = {
      price: lastPrice + (Math.random() - 0.5) * 0.01,
      amount: Math.random() * 1000 + 100,
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      time: new Date()
    };
    state.trades.unshift(newTrade);
    state.trades = state.trades.slice(0, 20);
    renderTrades(state.trades);
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
