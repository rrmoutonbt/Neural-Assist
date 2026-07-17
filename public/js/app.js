/* app.js - Main Application */

const App = {
  // Current page state
  currentPage: null,
  user: null,

  // Initialize application
  async init() {
    try {
      // Check authentication
      if (!Auth.isAuthenticated() && !window.location.pathname.includes('login')) {
        window.location.href = 'login.html';
        return;
      }

      this.user = Auth.getUser();

      // Set up navigation
      this.setupNavigation();

      // Set up mobile menu
      this.setupMobileMenu();

      // Initialize page-specific functionality
      await this.initPage();

      // Update user info in sidebar
      this.updateUserInfo();
    } catch (error) {
      this.handleError(error, 'Application initialization failed');
    }
  },

  // Error handler
  handleError(error, context = 'Error') {
    const message = error?.message || String(error);
    if (Components.toast) { Components.toast(`${context}: ${message}`, 'error'); } else { alert(`${context}: ${message}`); }
  },

  // Setup navigation active states
  setupNavigation() {
    const currentPath = window.location.pathname;
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
      const href = item.getAttribute('href');
      if (href && currentPath.includes(href.replace('../', '').replace('.html', ''))) {
        item.classList.add('active');
      }
    });
  },

  // Mobile menu toggle
  setupMobileMenu() {
    const menuBtn = document.getElementById('menu-toggle');
    const sidebar = document.querySelector('.sidebar');

    if (menuBtn && sidebar) {
      menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      });
    }
  },

  // Update user info display
  updateUserInfo() {
    const userNameEl = document.querySelector('.user-name');
    const userRoleEl = document.querySelector('.user-role');
    const userAvatarEl = document.querySelector('.user-avatar');

    if (this.user) {
      const safeName = Utils.escapeHtml(this.user.firstName && this.user.lastName ? this.user.firstName + ' ' + this.user.lastName : (this.user.username || this.user.email || 'User'));
      const safeRole = Utils.escapeHtml(this.user.role || 'Member');
      if (userNameEl) userNameEl.textContent = safeName;
      if (userRoleEl) userRoleEl.textContent = safeRole;
      const userEmailEl = document.querySelector('.user-email');
      if (userEmailEl) userEmailEl.textContent = this.user.email || '';
      if (userAvatarEl) userAvatarEl.textContent = safeName.slice(0, 2).toUpperCase();
    }
  },

  // Initialize page-specific functionality
  async initPage() {
    const path = window.location.pathname;

    try {
      // Determine current page
      if (path.includes('dashboard') || path === '/' || path.endsWith('index.html')) {
        await this.initDashboard();
      } else if (path.includes('trading')) {
        await this.initTrading();
      } else if (path.includes('wallet')) {
        await this.initWallet();
      } else if (path.includes('accounts')) {
        await this.initAccounts();
      } else if (path.includes('treasury')) {
        await this.initTreasury();
      } else if (path.includes('holdings')) {
        await this.initHoldings();
      } else if (path.includes('defi')) {
        await this.initDefi();
      } else if (path.includes('total-assets')) {
        await this.initTotalAssets();
      } else if (path.includes('portfolio')) {
        await this.initPortfolio();
      } else if (path.includes('ai-insights')) {
        await this.initAIInsights();
      } else if (path.includes('compliance')) {
        await this.initCompliance();
      } else if (path.includes('kyc')) {
        await this.initKYC();
      } else if (path.includes('system')) {
        await this.initSystemHealth();
      } else if (path.includes('loans')) {
        await this.initLoans();
      } else if (path.includes('transactions')) {
        await this.initTransactions();
      } else if (path.includes('reports')) {
        await this.initReports();
      } else if (path.includes('aum')) {
        await this.initAUM();
      } else if (path.includes('institutional-trader')) {
        await this.initInstitutionalTrader();
      } else if (path.includes('video2text')) {
        await this.initVideo2Text();
      } else if (path.includes('programs')) {
        await this.initPrograms();
      } else if (path.includes('library')) {
        // Library rendering handled by library.js + library.data.js
      }
    } catch (error) {
      this.handleError(error, 'Page initialization failed');
    }
  },

  // =========================================================
  // DASHBOARD
  // =========================================================
  async initDashboard() {
    try {
      this.currentPage = 'dashboard';

      // Fetch real data from API
      const [kpiResponse, accountsResponse] = await Promise.all([
        API.kpis.getDashboard().catch(() => null),
        API.banking.getAccounts().catch(() => null)
      ]);

      // TradeLocker account data (GenFX Demo accounts)
      const tradeLockerAccounts = [
        { id: 'tl-2323405', name: 'Convergence Alpha', accountNumber: 'D#2323405', type: 'tradelocker', balance: 833.63, equity: 751.97, closedPL: -164.59, status: 'active', platform: 'TradeLocker', server: 'GENFX', leverage: '1:500' },
        { id: 'tl-2239952', name: 'paper', accountNumber: 'D#2239952', type: 'tradelocker', balance: 6988.82, equity: 6540.03, closedPL: -3004.53, status: 'active', platform: 'TradeLocker', server: 'GENFX', leverage: '1:500' },
        { id: 'tl-2340741', name: 'Paper2', accountNumber: 'D#2340741', type: 'tradelocker', balance: 1000.00, equity: 1000.00, closedPL: 0, status: 'active', platform: 'TradeLocker', server: 'GENFX', leverage: '1:500' },
      ];
      const tlTotalEquity = tradeLockerAccounts.reduce((s, a) => s + a.equity, 0);

      // Render KPIs — include TradeLocker equity in totals
      const kpiContainer = document.getElementById('kpi-grid');
      if (kpiContainer && kpiResponse?.data?.kpis) {
        const kpis = kpiResponse.data.kpis.map(kpi => {
          // Add TradeLocker equity to Total Assets
          if (kpi.id === 'total-assets') kpi.value += tlTotalEquity;
          return kpi;
        });
        // Add Trading Equity KPI
        kpis.push({ id: 'trading-equity', label: 'Trading Equity', value: tlTotalEquity, change: -1.8, icon: '\u{1F4CA}', color: 'purple' });
        kpiContainer.innerHTML = kpis.map(kpi => Components.kpiCard({
          label: Utils.escapeHtml(kpi.label),
          value: kpi.value,
          change: kpi.change,
          icon: kpi.icon,
          color: kpi.color
        })).join('');
      } else if (kpiContainer) {
        kpiContainer.innerHTML = [
          Components.kpiCard({ label: 'Total Assets', value: tlTotalEquity, change: 0, icon: '\u{1F4B0}', color: 'cyan' }),
          Components.kpiCard({ label: 'Banking Balance', value: 0, change: 0, icon: '\u{1F3E6}', color: 'gold' }),
          Components.kpiCard({ label: 'Trading Equity', value: tlTotalEquity, change: -1.8, icon: '\u{1F4CA}', color: 'purple' }),
          Components.kpiCard({ label: 'Active Loans', value: 0, change: 0, icon: '\u{1F4CB}', color: 'green' })
        ].join('');
      }

      // Render portfolio chart from real transaction data, with Binance BTC fallback
      const chartContainer = document.getElementById('portfolio-chart');
      if (chartContainer) {
        try {
          const chartRes = await API.get('/kpis/chart').catch(() => null);
          if (chartRes?.data?.chartData?.length > 1) {
            Charts.lineChart(chartContainer, chartRes.data.chartData, { color: Charts.colors.cyan });
          } else if (typeof BinanceService !== 'undefined') {
            // Fallback: show BTC 30-day price as portfolio proxy
            const klines = await BinanceService.getKlines('BTCUSDT', '1d', 30).catch(() => null);
            if (klines && klines.length > 1) {
              const chartData = klines.map(k => ({ value: k.close }));
              Charts.lineChart(chartContainer, chartData, { color: Charts.colors.cyan });
            } else {
              chartContainer.innerHTML = '<div class="flex items-center justify-center" style="height:200px;color:var(--text-muted);font-size:0.875rem;">No transaction history yet. Deposit funds to see portfolio performance.</div>';
            }
          } else {
            chartContainer.innerHTML = '<div class="flex items-center justify-center" style="height:200px;color:var(--text-muted);font-size:0.875rem;">No transaction history yet. Deposit funds to see portfolio performance.</div>';
          }
        } catch (e) {
          chartContainer.innerHTML = '<div class="flex items-center justify-center" style="height:200px;color:var(--text-muted);font-size:0.875rem;">Portfolio chart unavailable</div>';
        }

        // Wire up timeframe buttons to load BTC klines for different periods
        if (typeof BinanceService !== 'undefined') {
          const timeframeMap = { '1D': ['1h', 24], '1W': ['4h', 42], '1M': ['1d', 30], '3M': ['1d', 90], '1Y': ['1w', 52] };
          document.querySelectorAll('.timeframe-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              document.querySelectorAll('.timeframe-btn').forEach(b => b.classList.remove('active'));
              btn.classList.add('active');
              const tf = timeframeMap[btn.textContent.trim()];
              if (!tf) return;
              try {
                const klines = await BinanceService.getKlines('BTCUSDT', tf[0], tf[1]);
                if (klines && klines.length > 1) {
                  chartContainer.innerHTML = '';
                  Charts.lineChart(chartContainer, klines.map(k => ({ value: k.close })), { color: Charts.colors.cyan });
                }
              } catch (e) { /* keep current chart on failure */ }
            });
          });
        }
      }

      // Render accounts from API + TradeLocker accounts
      const bankAccounts = accountsResponse?.data?.accounts?.slice(0, 2) || [];
      const allDashAccounts = [
        ...bankAccounts,
        ...tradeLockerAccounts.map(tl => ({
          id: tl.id,
          name: tl.name,
          accountNumber: tl.accountNumber,
          balance: tl.equity,
          status: tl.status,
          type: 'tradelocker',
          _tradelocker: tl
        }))
      ];
      if (allDashAccounts.length > 0) {
        this.renderDashboardAccounts(allDashAccounts.slice(0, 5));
      } else {
        const accountsList = document.getElementById('accounts-list');
        if (accountsList) accountsList.innerHTML = '<div class="card text-center text-muted py-4">No accounts yet. <a href="accounts.html" class="text-cyan">Open an account</a> to get started.</div>';
      }

      // Crypto holdings from API, enriched with real Binance prices
      const cryptoResponse = await API.crypto.getHoldings().catch(() => null);
      if (cryptoResponse?.data?.holdings?.length > 0) {
        const mockHoldings = cryptoResponse.data.holdings.slice(0, 5);
        // Render immediately with API/mock data
        this.renderHoldings(mockHoldings);
        // Then enrich with live Binance prices in the background
        if (typeof BinanceService !== 'undefined') {
          BinanceService.enrichHoldings(mockHoldings).then(enriched => {
            this.renderHoldings(enriched);
          }).catch(() => { /* keep mock data on failure */ });
        }
      } else {
        const holdingsList = document.getElementById('holdings-list');
        if (holdingsList) holdingsList.innerHTML = '<div class="card text-center text-muted py-4">No crypto holdings yet.</div>';
      }
    } catch (error) {
      this.handleError(error, 'Dashboard initialization failed');
    }
  },

  // =========================================================
  // TRADING
  // =========================================================
  async initTrading() {
    try {
      this.currentPage = 'trading';
      this.tradingPair = 'XRP/USD';
      this.tradingSide = 'buy';
      this.tradingOrderType = 'limit';

      // Fetch data from API
      const [obRes, tradesRes, openRes] = await Promise.all([
        API.trading.getOrderBook(this.tradingPair).catch(() => null),
        API.trading.getRecentTrades(this.tradingPair).catch(() => null),
        API.trading.getOpenOrders().catch(() => null)
      ]);

      // Render chart from API trade data or show empty
      const basePrice = obRes?.data?.basePrice || 2.52;
      const chartContainer = document.getElementById('price-chart');
      if (chartContainer) {
        if (tradesRes?.data?.trades?.length > 5) {
          const priceData = tradesRes.data.trades.slice().reverse().map(t => ({
            open: t.price * 0.999,
            high: t.price * 1.01,
            low: t.price * 0.99,
            close: t.price
          }));
          Charts.candlestick(chartContainer, priceData);
        } else {
          chartContainer.innerHTML = '<div class="flex items-center justify-center" style="height:200px;color:var(--text-muted);font-size:0.875rem;">No trade history yet. Place trades to see price chart.</div>';
        }
      }

      // Update pair info
      const priceEl = document.getElementById('pair-price');
      if (priceEl) priceEl.textContent = `$${basePrice.toFixed(4)}`;
      const orderPriceInput = document.getElementById('order-price');
      if (orderPriceInput) orderPriceInput.value = basePrice.toFixed(4);

      // Render order book and trades
      if (obRes?.data) {
        this.renderOrderBook(obRes.data);
      }
      if (tradesRes?.data?.trades) {
        this.renderTrades(tradesRes.data.trades);
      }

      // Render open orders
      if (openRes?.data?.orders) {
        this.renderOpenOrders(openRes.data.orders);
      }

      // Setup trading controls
      this.setupTradingControls(basePrice);
    } catch (error) {
      this.handleError(error, 'Trading page initialization failed');
    }
  },

  setupTradingControls(basePrice) {
    // Pair selector
    const pairSelector = document.getElementById('pair-selector');
    if (pairSelector) {
      pairSelector.addEventListener('change', async () => {
        this.tradingPair = pairSelector.value;
        await this.initTrading();
      });
    }

    // Buy/sell tabs
    const tabBuy = document.getElementById('tab-buy');
    const tabSell = document.getElementById('tab-sell');
    const orderBtn = document.getElementById('place-order-btn');
    const symbol = this.tradingPair.split('/')[0];

    if (tabBuy) tabBuy.addEventListener('click', () => {
      this.tradingSide = 'buy';
      tabBuy.classList.add('active');
      tabSell?.classList.remove('active');
      if (orderBtn) { orderBtn.textContent = `Buy ${symbol}`; orderBtn.className = 'btn btn-buy'; }
    });
    if (tabSell) tabSell.addEventListener('click', () => {
      this.tradingSide = 'sell';
      tabSell.classList.add('active');
      tabBuy?.classList.remove('active');
      if (orderBtn) { orderBtn.textContent = `Sell ${symbol}`; orderBtn.className = 'btn btn-sell'; }
    });

    // Order type tabs
    document.querySelectorAll('.order-type-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.order-type-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.tradingOrderType = tab.dataset.type;
        const priceInput = document.getElementById('order-price');
        if (priceInput) priceInput.disabled = (this.tradingOrderType === 'market');
      });
    });

    // Price * Amount = Total calculation
    const priceInput = document.getElementById('order-price');
    const amountInput = document.getElementById('order-amount');
    const totalInput = document.getElementById('order-total');
    const feeEl = document.getElementById('order-fee');

    const calcTotal = () => {
      const p = parseFloat(priceInput?.value) || 0;
      const a = parseFloat(amountInput?.value) || 0;
      const total = p * a;
      if (totalInput) totalInput.value = total.toFixed(2);
      if (feeEl) feeEl.textContent = `$${(total * 0.001).toFixed(2)}`;
    };

    priceInput?.addEventListener('input', calcTotal);
    amountInput?.addEventListener('input', calcTotal);

    // Place order
    if (orderBtn) {
      orderBtn.addEventListener('click', async () => {
        const price = parseFloat(priceInput?.value);
        const amount = parseFloat(amountInput?.value);

        if (!amount || amount <= 0) {
          Components.toast('Enter an amount', 'warning');
          return;
        }
        if (!price || price <= 0) {
          Components.toast('Enter a price', 'warning');
          return;
        }

        orderBtn.disabled = true;
        orderBtn.textContent = 'Placing...';

        try {
          const result = await API.trading.placeOrder({
            pair: this.tradingPair,
            side: this.tradingSide,
            orderType: this.tradingOrderType,
            price,
            amount
          });
          Components.toast(result.message || 'Order placed!', 'success');
          if (amountInput) amountInput.value = '';
          if (totalInput) totalInput.value = '';
          // Refresh open orders
          const openRes = await API.trading.getOpenOrders().catch(() => null);
          if (openRes?.data?.orders) this.renderOpenOrders(openRes.data.orders);
        } catch (error) {
          Components.toast(error.message || 'Order failed', 'danger');
        } finally {
          orderBtn.disabled = false;
          orderBtn.textContent = `${this.tradingSide === 'buy' ? 'Buy' : 'Sell'} ${symbol}`;
        }
      });
    }
  },

  renderOpenOrders(orders) {
    const container = document.getElementById('open-orders');
    if (!container) return;

    if (!orders.length) {
      container.innerHTML = '<div class="empty-state"><p class="text-sm text-muted">No open orders</p></div>';
      return;
    }

    container.innerHTML = orders.map(o => `
      <div class="flex justify-between items-center py-2 border-b" style="font-size: 0.8125rem;">
        <div>
          <div class="${o.side === 'buy' ? 'text-green' : 'text-red'} font-medium">${o.side.toUpperCase()} ${Utils.formatNumber(o.amount, 0)}</div>
          <div class="text-xs text-muted">@ $${o.price.toFixed(4)}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="App.cancelOrder('${o._id || o.id}')">Cancel</button>
      </div>
    `).join('');
  },

  async cancelOrder(orderId) {
    try {
      await API.trading.cancelOrder(orderId);
      Components.toast('Order cancelled', 'success');
      const openRes = await API.trading.getOpenOrders().catch(() => null);
      if (openRes?.data?.orders) this.renderOpenOrders(openRes.data.orders);
    } catch (error) {
      Components.toast(error.message || 'Cancel failed', 'danger');
    }
  },

  // =========================================================
  // WALLET
  // =========================================================
  async initWallet() {
    try {
      this.currentPage = 'wallet';

      const [walletRes, stakingRes] = await Promise.all([
        API.wallet.getWallets().catch(() => null),
        API.wallet.getStaking().catch(() => null)
      ]);

      const wallets = walletRes?.data?.wallets || [];
      const summary = walletRes?.data?.summary || {};
      const stakingSummary = stakingRes?.data?.summary || {};

      // Render KPIs
      const kpiContainer = document.getElementById('wallet-kpis');
      if (kpiContainer) {
        kpiContainer.innerHTML = [
          Components.kpiCard({ label: 'Total Balance', value: summary.totalBalance || 0, change: 0, icon: '\u{1F4B0}', color: 'cyan' }),
          Components.kpiCard({ label: 'Staked Amount', value: summary.totalStaked || 0, change: 0, icon: '\u{1F512}', color: 'purple' }),
          Components.kpiCard({ label: 'Rewards Earned', value: summary.totalRewards || 0, change: 0, icon: '\u{1F381}', color: 'green' }),
          Components.kpiCard({ label: 'Assets', value: summary.assetCount || wallets.length, change: 0, icon: '\u{1F4CA}', color: 'gold', format: 'number' })
        ].join('');
      }

      // Render staking card
      if (stakingRes?.data?.positions?.length > 0) {
        const topStake = stakingRes.data.positions[0];
        const apyEl = document.getElementById('staking-apy');
        const earnedEl = document.getElementById('staking-earned');
        if (apyEl) apyEl.textContent = `${topStake.apy}% APY`;
        if (earnedEl) earnedEl.textContent = `$${Utils.formatNumber(stakingSummary.totalRewards || 0, 2)} earned in rewards`;
      }

      // Render wallet assets table
      this.renderWalletAssets(wallets);

      // Wire buttons
      this.setupWalletButtons(wallets);
    } catch (error) {
      this.handleError(error, 'Wallet page initialization failed');
    }
  },

  setupWalletButtons(wallets) {
    // Add Asset button
    const addBtn = document.getElementById('add-asset-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        Components.toast('Add Asset - Contact treasury admin', 'info');
      });
    }

    // Manage Staking
    const stakeBtn = document.getElementById('manage-staking-btn');
    if (stakeBtn) {
      stakeBtn.addEventListener('click', () => {
        window.location.href = window.location.pathname.includes('crypto/') ? '../wallet.html' : 'wallet.html';
        // Show staking modal for the primary asset
        this.showStakeModal(wallets.find(w => w.staked > 0) || wallets[0]);
      });
    }
  },

  showStakeModal(wallet) {
    if (!wallet) return;
    const container = document.getElementById('modal-container');
    if (!container) return;

    container.innerHTML = Components.modal({
      id: 'stake-modal',
      title: `Stake ${wallet.symbol}`,
      content: `
        <div class="form-group">
          <label class="form-label">Amount to Stake</label>
          <input type="number" class="input" id="stake-amount" placeholder="0.00" max="${wallet.amount - wallet.staked}">
          <div class="text-xs text-muted mt-1">Available: ${Utils.formatNumber(wallet.amount - wallet.staked, 4)} ${Utils.escapeHtml(wallet.symbol)}</div>
        </div>
      `,
      footer: `<button class="btn btn-primary" id="submit-stake-btn">Stake ${Utils.escapeHtml(wallet.symbol)}</button>`
    });

    Components.openModal('stake-modal');

    document.getElementById('submit-stake-btn')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('stake-amount')?.value);
      if (!amount || amount <= 0) {
        Components.toast('Enter a valid amount', 'warning');
        return;
      }

      try {
        const result = await API.wallet.stake({ symbol: wallet.symbol, amount });
        Components.closeModal('stake-modal');
        Components.toast(result.message || 'Staked!', 'success');
        await this.initWallet();
      } catch (error) {
        Components.toast(error.message || 'Staking failed', 'danger');
      }
    });
  },

  // =========================================================
  // ACCOUNTS PAGE
  // =========================================================
  async initAccounts() {
    this.currentPage = 'accounts';

    try {
      const [accountsRes, txnRes] = await Promise.all([
        API.banking.getAccounts(),
        API.banking.getTransactions({ limit: 10 })
      ]);

      const accounts = accountsRes.data.accounts;
      const transactions = txnRes.data.transactions;

      this.renderAccountCards(accounts);
      this.populateTransferForm(accounts);
      this.renderRecentActivity(transactions);
      this.setupTransferHandler(accounts);
      this.setupOpenAccountHandler();
    } catch (error) {
      this.handleError(error, 'Failed to load accounts');
    }
  },

  renderAccountCards(accounts) {
    const container = document.getElementById('accounts-grid');
    if (!container) return;

    const typeClass = { checking: 'checking', savings: 'savings', investment: 'investment', crypto_linked: 'crypto' };

    container.innerHTML = accounts.map(acc => {
      const cssClass = typeClass[acc.type] || 'checking';
      let extraInfo = '';
      if (acc.type === 'savings' && acc.interestRate) {
        extraInfo = `<span class="text-sm text-green">${acc.interestRate}% APY</span>`;
      } else if (acc.type === 'crypto_linked') {
        extraInfo = `${Components.badge('XRP Backed', 'info')}`;
      } else {
        extraInfo = `${Components.badge(Utils.escapeHtml(acc.status), 'success')}`;
      }

      return `
        <div class="account-card ${cssClass}">
          <div class="account-type">${Utils.escapeHtml(acc.name)}</div>
          <div class="account-balance">${Utils.formatCurrency(acc.balance)}</div>
          <div class="account-number">${Utils.escapeHtml(acc.accountNumber)}</div>
          <div class="flex justify-between items-center mt-4">
            ${extraInfo}
            <button class="btn btn-ghost btn-sm">Manage &rarr;</button>
          </div>
        </div>
      `;
    }).join('');
  },

  populateTransferForm(accounts) {
    const fromSelect = document.getElementById('transfer-from');
    const toSelect = document.getElementById('transfer-to');
    if (!fromSelect || !toSelect) return;

    const options = accounts.filter(a => a.status === 'active').map(a =>
      `<option value="${a.id}">${Utils.escapeHtml(a.name)} ${Utils.escapeHtml(a.accountNumber)} - ${Utils.formatCurrency(a.balance)}</option>`
    ).join('');

    fromSelect.innerHTML = options;
    toSelect.innerHTML = options;

    // Default to different accounts
    if (toSelect.options.length > 1) {
      toSelect.selectedIndex = 1;
    }
  },

  renderRecentActivity(transactions) {
    const tbody = document.getElementById('recent-activity');
    if (!tbody) return;

    if (!transactions.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">No recent transactions</td></tr>';
      return;
    }

    tbody.innerHTML = transactions.map(txn => {
      const amountClass = txn.amount >= 0 ? 'text-green' : 'text-red';
      const amountStr = txn.amount >= 0 ? `+${Utils.formatCurrency(txn.amount)}` : Utils.formatCurrency(txn.amount);
      const statusBadge = Components.badge(Utils.escapeHtml(txn.status), txn.status === 'completed' ? 'success' : txn.status === 'pending' ? 'warning' : 'danger');

      return `<tr>
        <td class="text-muted">${Utils.formatDate(txn.date, 'medium')}</td>
        <td>${Utils.escapeHtml(txn.description)}</td>
        <td>${Utils.escapeHtml(txn.accountNumber)}</td>
        <td class="font-mono ${amountClass}">${amountStr}</td>
        <td>${statusBadge}</td>
      </tr>`;
    }).join('');
  },

  setupTransferHandler(accounts) {
    const btn = document.getElementById('transfer-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const fromId = document.getElementById('transfer-from')?.value;
      const toId = document.getElementById('transfer-to')?.value;
      const amount = parseFloat(document.getElementById('transfer-amount')?.value);
      const memo = document.getElementById('transfer-memo')?.value || '';

      if (!fromId || !toId) {
        Components.toast('Please select accounts', 'warning');
        return;
      }
      if (fromId === toId) {
        Components.toast('Cannot transfer to the same account', 'warning');
        return;
      }
      if (!amount || amount <= 0) {
        Components.toast('Please enter a valid amount', 'warning');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Processing...';

      try {
        const result = await API.banking.transfer({ fromAccountId: fromId, toAccountId: toId, amount, memo });
        Components.toast(result.message || 'Transfer completed!', 'success');
        document.getElementById('transfer-amount').value = '';
        document.getElementById('transfer-memo').value = '';
        // Refresh data
        await this.initAccounts();
      } catch (error) {
        Components.toast(error.message || 'Transfer failed', 'danger');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Transfer Funds';
      }
    });
  },

  setupOpenAccountHandler() {
    const btn = document.getElementById('open-account-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const container = document.getElementById('modal-container');
      if (!container) return;

      container.innerHTML = Components.modal({
        id: 'open-account-modal',
        title: 'Open New Account',
        content: `
          <div class="form-group">
            <label class="form-label">Account Name</label>
            <input type="text" class="input" id="new-account-name" placeholder="e.g., My Savings" required>
          </div>
          <div class="form-group">
            <label class="form-label">Account Type</label>
            <select class="select" id="new-account-type">
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="investment">Investment</option>
              <option value="crypto_linked">Crypto-Linked</option>
            </select>
          </div>
        `,
        footer: `<button class="btn btn-primary" id="create-account-submit">Create Account</button>`
      });

      Components.openModal('open-account-modal');

      document.getElementById('create-account-submit')?.addEventListener('click', async () => {
        const name = document.getElementById('new-account-name')?.value?.trim();
        const type = document.getElementById('new-account-type')?.value;

        if (!name) {
          Components.toast('Please enter an account name', 'warning');
          return;
        }

        try {
          await API.banking.createAccount({ name, type });
          Components.closeModal('open-account-modal');
          Components.toast('Account created!', 'success');
          await this.initAccounts();
        } catch (error) {
          Components.toast(error.message || 'Failed to create account', 'danger');
        }
      });
    });
  },

  // =========================================================
  // TRANSACTIONS PAGE
  // =========================================================
  async initTransactions() {
    this.currentPage = 'transactions';
    this.txnPage = 1;
    this.txnFilters = {};

    try {
      const accountsRes = await API.banking.getAccounts();
      this.txnAccounts = accountsRes.data.accounts;
      this.populateAccountFilter(this.txnAccounts);
      await this.loadTransactions();
      this.setupTransactionFilters();
      this.setupExportHandler();
    } catch (error) {
      this.handleError(error, 'Failed to load transactions');
    }
  },

  async loadTransactions() {
    try {
      const params = { page: this.txnPage, limit: 20, ...this.txnFilters };
      const res = await API.banking.getTransactions(params);

      this.renderTransactionKPIs(res.data.summary);
      this.renderTransactionTable(res.data.transactions);
      this.renderTransactionPagination(res.data.pagination);
    } catch (error) {
      this.handleError(error, 'Failed to load transactions');
    }
  },

  populateAccountFilter(accounts) {
    const select = document.getElementById('account-filter');
    if (!select) return;

    select.innerHTML = '<option value="">All Accounts</option>' +
      accounts.map(a => `<option value="${a.id}">${Utils.escapeHtml(a.name)}</option>`).join('');

    select.addEventListener('change', () => {
      this.txnFilters.accountId = select.value || undefined;
      this.txnPage = 1;
      this.loadTransactions();
    });
  },

  renderTransactionKPIs(summary) {
    const container = document.getElementById('txn-kpi-grid');
    if (!container || !summary) return;

    container.innerHTML = [
      Components.kpiCard({ label: 'Total Deposits', value: summary.totalDeposits, icon: '\u2193', color: 'green' }),
      Components.kpiCard({ label: 'Total Withdrawals', value: summary.totalWithdrawals, icon: '\u2191', color: 'red' }),
      Components.kpiCard({ label: 'Transfers', value: summary.transferCount, icon: '\u{1F504}', color: 'cyan', format: 'number' }),
      Components.kpiCard({ label: 'Net Flow', value: summary.netFlow, icon: '\u{1F4CA}', color: 'purple' })
    ].join('');
  },

  renderTransactionTable(transactions) {
    const tbody = document.getElementById('txn-table-body');
    const countInfo = document.getElementById('txn-count-info');
    if (!tbody) return;

    if (!transactions.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">No transactions found</td></tr>';
      if (countInfo) countInfo.textContent = '0 transactions';
      return;
    }

    if (countInfo) countInfo.textContent = `Showing ${transactions.length} transactions`;

    const typeBadge = { deposit: 'success', withdrawal: 'danger', transfer: 'info', payment: 'purple', interest: 'success' };

    tbody.innerHTML = transactions.map(txn => {
      const amountClass = txn.amount >= 0 ? 'text-green' : 'text-red';
      const amountStr = txn.amount >= 0 ? `+${Utils.formatCurrency(txn.amount)}` : Utils.formatCurrency(txn.amount);
      const badge = Components.badge(Utils.escapeHtml(txn.type.charAt(0).toUpperCase() + txn.type.slice(1)), typeBadge[txn.type] || 'default');

      return `<tr>
        <td>${Utils.formatDate(txn.date, 'medium')}</td>
        <td>${Utils.escapeHtml(txn.description)}</td>
        <td>${badge}</td>
        <td>${Utils.escapeHtml(txn.accountName)}</td>
        <td class="text-muted">${Utils.escapeHtml(txn.reference || '')}</td>
        <td class="font-mono ${amountClass}">${amountStr}</td>
        <td class="font-mono">${txn.balanceAfter != null ? Utils.formatCurrency(txn.balanceAfter) : '-'}</td>
      </tr>`;
    }).join('');
  },

  renderTransactionPagination(pagination) {
    if (!pagination) return;

    const pageInfo = document.getElementById('txn-page-info');
    const prevBtn = document.getElementById('txn-prev-btn');
    const nextBtn = document.getElementById('txn-next-btn');

    if (pageInfo) pageInfo.textContent = `Page ${pagination.page} of ${pagination.pages || 1}`;

    if (prevBtn) {
      prevBtn.disabled = pagination.page <= 1;
      prevBtn.onclick = () => {
        if (this.txnPage > 1) {
          this.txnPage--;
          this.loadTransactions();
        }
      };
    }

    if (nextBtn) {
      nextBtn.disabled = pagination.page >= pagination.pages;
      nextBtn.onclick = () => {
        if (this.txnPage < pagination.pages) {
          this.txnPage++;
          this.loadTransactions();
        }
      };
    }
  },

  setupTransactionFilters() {
    const applyBtn = document.getElementById('filter-apply-btn');
    if (!applyBtn) return;

    applyBtn.addEventListener('click', () => {
      const typeFilter = document.getElementById('filter-type')?.value;
      if (typeFilter) {
        this.txnFilters.type = typeFilter;
      } else {
        delete this.txnFilters.type;
      }
      this.txnPage = 1;
      this.loadTransactions();
    });
  },

  setupExportHandler() {
    const btn = document.getElementById('export-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true;
        btn.textContent = 'Exporting...';

        const res = await API.banking.getTransactions({ limit: 1000 });
        const transactions = res.data.transactions;

        // Build CSV
        const headers = ['Date', 'Description', 'Type', 'Account', 'Reference', 'Amount', 'Balance'];
        const rows = transactions.map(t => [
          new Date(t.date).toLocaleDateString(),
          `"${t.description}"`,
          t.type,
          t.accountName,
          t.reference || '',
          t.amount,
          t.balanceAfter || ''
        ]);

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        Components.toast('Transactions exported!', 'success');
      } catch (error) {
        Components.toast('Export failed', 'danger');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Export';
      }
    });
  },

  // =========================================================
  // LOANS PAGE
  // =========================================================
  async initLoans() {
    this.currentPage = 'loans';

    try {
      const [loansRes, accountsRes] = await Promise.all([
        API.loans.getAll(),
        API.banking.getAccounts()
      ]);

      const loans = loansRes.data.loans;
      this.loanAccounts = accountsRes.data.accounts;

      this.renderLoanKPIs(loans);
      this.renderLoanCards(loans.filter(l => l.status === 'active'));
      this.renderPaymentHistory(loans);
      this.setupApplyLoanHandler();
    } catch (error) {
      this.handleError(error, 'Failed to load loans');
    }
  },

  renderLoanKPIs(loans) {
    const container = document.getElementById('loan-kpi-grid');
    if (!container) return;

    const active = loans.filter(l => l.status === 'active');
    const totalBorrowed = loans.reduce((s, l) => s + l.principalAmount, 0);
    const outstanding = active.reduce((s, l) => s + l.currentBalance, 0);
    const nextPayment = active.length > 0 ? active.reduce((s, l) => s + l.monthlyPayment, 0) : 0;

    container.innerHTML = [
      Components.kpiCard({ label: 'Active Loans', value: active.length, icon: '\u{1F4B3}', color: 'purple', format: 'number' }),
      Components.kpiCard({ label: 'Total Borrowed', value: totalBorrowed, icon: '\u{1F4B0}', color: 'cyan' }),
      Components.kpiCard({ label: 'Outstanding Balance', value: outstanding, icon: '\u{1F4CA}', color: 'gold' }),
      Components.kpiCard({ label: 'Next Payment', value: nextPayment, icon: '\u{1F4C5}', color: 'green' })
    ].join('');
  },

  renderLoanCards(loans) {
    const container = document.getElementById('loans-grid');
    if (!container) return;

    if (!loans.length) {
      container.innerHTML = '<div class="card text-center text-muted py-8">No active loans</div>';
      return;
    }

    container.innerHTML = loans.map(loan => {
      const pctPaid = parseFloat(loan.percentPaid) || 0;
      return `
        <div class="card">
          <div class="flex justify-between items-start mb-4">
            <div>
              <div class="font-semibold">${Utils.escapeHtml(loan.name)}</div>
              <div class="text-sm text-muted">ID: ${Utils.escapeHtml(loan.loanNumber)}</div>
            </div>
            ${Components.badge('Active', 'success')}
          </div>
          <div class="mb-4">
            <div class="flex justify-between text-sm mb-1"><span class="text-muted">Principal</span><span class="font-mono">${Utils.formatCurrency(loan.principalAmount)}</span></div>
            <div class="flex justify-between text-sm mb-1"><span class="text-muted">Balance</span><span class="font-mono">${Utils.formatCurrency(loan.currentBalance)}</span></div>
            <div class="flex justify-between text-sm mb-1"><span class="text-muted">APR</span><span class="font-mono">${loan.interestRate}%</span></div>
            <div class="flex justify-between text-sm"><span class="text-muted">Monthly</span><span class="font-mono">${Utils.formatCurrency(loan.monthlyPayment)}</span></div>
          </div>
          <div class="mb-3">
            <div class="text-xs text-muted mb-1">${pctPaid}% Paid</div>
            <div class="progress"><div class="progress-bar" style="width: ${pctPaid}%;"></div></div>
          </div>
          <button class="btn btn-secondary btn-sm w-full" onclick="App.showMakePaymentModal('${loan.id}', '${Utils.escapeHtml(loan.name)}', ${loan.monthlyPayment})">Make Payment</button>
        </div>
      `;
    }).join('');
  },

  renderPaymentHistory(loans) {
    const tbody = document.getElementById('payments-table-body');
    if (!tbody) return;

    // Fetch payments from each loan's embedded data
    const allPayments = [];
    loans.forEach(loan => {
      if (loan.paymentCount > 0) {
        // We need to fetch payments separately since getAll doesn't return them
        // For now, show a summary
      }
    });

    // Load payments from API for each loan
    this.loadAllPayments(loans);
  },

  async loadAllPayments(loans) {
    const tbody = document.getElementById('payments-table-body');
    if (!tbody) return;

    try {
      const paymentPromises = loans.map(loan =>
        API.loans.getPayments(loan.id).then(res => ({
          loanName: loan.name,
          payments: res.data.payments || []
        })).catch(() => ({ loanName: loan.name, payments: [] }))
      );

      const results = await Promise.all(paymentPromises);
      const allPayments = [];

      results.forEach(({ loanName, payments }) => {
        payments.forEach(p => {
          allPayments.push({ ...p, loanName });
        });
      });

      // Sort by date desc
      allPayments.sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));

      if (!allPayments.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">No payments yet</td></tr>';
        return;
      }

      tbody.innerHTML = allPayments.slice(0, 20).map(p => `
        <tr>
          <td>${Utils.formatDate(p.paidAt, 'medium')}</td>
          <td>${Utils.escapeHtml(p.loanName)}</td>
          <td class="font-mono">${Utils.formatCurrency(p.amount)}</td>
          <td class="font-mono">${Utils.formatCurrency(p.principal)}</td>
          <td class="font-mono">${Utils.formatCurrency(p.interest)}</td>
          <td>${Components.badge(Utils.escapeHtml(p.status || 'completed'), p.status === 'completed' ? 'success' : 'warning')}</td>
        </tr>
      `).join('');
    } catch (error) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Failed to load payments</td></tr>';
    }
  },

  showMakePaymentModal(loanId, loanName, suggestedAmount) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    const accountOptions = (this.loanAccounts || [])
      .filter(a => a.status === 'active')
      .map(a => `<option value="${a.id}">${Utils.escapeHtml(a.name)} - ${Utils.formatCurrency(a.balance)}</option>`)
      .join('');

    container.innerHTML = Components.modal({
      id: 'make-payment-modal',
      title: `Payment - ${loanName}`,
      content: `
        <div class="form-group">
          <label class="form-label">Payment Amount</label>
          <input type="number" class="input" id="payment-amount" value="${suggestedAmount}" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">From Account</label>
          <select class="select" id="payment-account">${accountOptions}</select>
        </div>
      `,
      footer: `<button class="btn btn-primary" id="submit-payment-btn">Submit Payment</button>`
    });

    Components.openModal('make-payment-modal');

    document.getElementById('submit-payment-btn')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('payment-amount')?.value);
      const accountId = document.getElementById('payment-account')?.value;

      if (!amount || amount <= 0) {
        Components.toast('Please enter a valid amount', 'warning');
        return;
      }

      try {
        const result = await API.loans.makePayment(loanId, { amount, accountId });
        Components.closeModal('make-payment-modal');
        Components.toast(result.message || 'Payment completed!', 'success');
        await this.initLoans();
      } catch (error) {
        Components.toast(error.message || 'Payment failed', 'danger');
      }
    });
  },

  setupApplyLoanHandler() {
    const btn = document.getElementById('apply-loan-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const container = document.getElementById('modal-container');
      if (!container) return;

      container.innerHTML = Components.modal({
        id: 'apply-loan-modal',
        title: 'Apply for Loan',
        content: `
          <div class="form-group">
            <label class="form-label">Loan Type</label>
            <select class="select" id="loan-type">
              <option value="personal">Personal Loan</option>
              <option value="auto">Auto Loan</option>
              <option value="home_equity">Home Equity</option>
              <option value="mortgage">Mortgage</option>
              <option value="business">Business Loan</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Loan Amount ($)</label>
            <input type="number" class="input" id="loan-amount" placeholder="25000" min="1000" step="1000">
          </div>
          <div class="form-group">
            <label class="form-label">Term (months)</label>
            <select class="select" id="loan-term">
              <option value="12">12 months</option>
              <option value="24">24 months</option>
              <option value="36" selected>36 months</option>
              <option value="48">48 months</option>
              <option value="60">60 months</option>
            </select>
          </div>
        `,
        footer: `<button class="btn btn-primary" id="submit-loan-btn">Submit Application</button>`
      });

      Components.openModal('apply-loan-modal');

      document.getElementById('submit-loan-btn')?.addEventListener('click', async () => {
        const type = document.getElementById('loan-type')?.value;
        const amount = parseFloat(document.getElementById('loan-amount')?.value);
        const termMonths = parseInt(document.getElementById('loan-term')?.value);

        if (!amount || amount < 1000) {
          Components.toast('Minimum loan amount is $1,000', 'warning');
          return;
        }

        try {
          const result = await API.loans.apply({ type, amount, termMonths });
          Components.closeModal('apply-loan-modal');
          Components.toast(result.message || 'Loan approved!', 'success');
          await this.initLoans();
        } catch (error) {
          Components.toast(error.message || 'Application failed', 'danger');
        }
      });
    });
  },

  // =========================================================
  // RENDER HELPERS (shared)
  // =========================================================
  renderAccounts(accounts) {
    const container = document.getElementById('accounts-list');
    if (!container) return;

    container.innerHTML = accounts.map(acc => `
      <div class="card">
        <div class="flex justify-between items-start mb-2">
          <span class="text-sm text-muted">${Utils.escapeHtml(acc.name)}</span>
          ${Components.badge(Utils.escapeHtml(acc.status), 'success')}
        </div>
        <div class="text-xl font-bold font-mono mb-1">${Utils.formatCurrency(acc.balance)}</div>
        <div class="text-xs text-dim">${Utils.escapeHtml(acc.accountNumber)}</div>
      </div>
    `).join('');
  },

  // Dashboard accounts with deposit/withdraw actions
  renderDashboardAccounts(accounts) {
    const container = document.getElementById('accounts-list');
    if (!container) return;

    container.innerHTML = accounts.map(acc => {
      if (acc.type === 'tradelocker') {
        const tl = acc._tradelocker || {};
        const plClass = tl.closedPL >= 0 ? 'text-green' : 'text-red';
        const plSign = tl.closedPL >= 0 ? '+' : '';
        return `
          <div class="card" style="border-left: 3px solid rgba(33,150,243,0.5);">
            <div class="flex justify-between items-start mb-2">
              <span class="text-sm text-muted">${Utils.escapeHtml(acc.name)}</span>
              <span style="display:inline-flex;align-items:center;gap:3px;padding:1px 8px;border-radius:10px;background:rgba(16,185,129,0.12);color:#10b981;font-size:0.65rem;font-weight:600;text-transform:uppercase;">
                <span style="width:5px;height:5px;border-radius:50%;background:#10b981;"></span> Active
              </span>
            </div>
            <div class="text-xl font-bold font-mono mb-1">${Utils.formatCurrency(tl.equity)}</div>
            <div class="text-xs text-dim mb-2">${Utils.escapeHtml(acc.accountNumber)} · ${tl.platform}</div>
            <div class="flex justify-between text-xs mb-3">
              <span class="text-muted">Balance: <span class="font-mono">${Utils.formatCurrency(tl.balance)}</span></span>
              <span class="text-muted">P&L: <span class="font-mono ${plClass}">${plSign}${Utils.formatCurrency(tl.closedPL)}</span></span>
            </div>
            <div class="flex gap-2">
              <a href="institutional-trader.html" class="btn btn-primary btn-sm" style="flex:1;font-size:0.75rem;">Trade</a>
              <a href="programs.html" class="btn btn-ghost btn-sm" style="flex:1;font-size:0.75rem;">Details</a>
            </div>
          </div>`;
      }
      return `
        <div class="card">
          <div class="flex justify-between items-start mb-2">
            <span class="text-sm text-muted">${Utils.escapeHtml(acc.name)}</span>
            ${Components.badge(Utils.escapeHtml(acc.status), 'success')}
          </div>
          <div class="text-xl font-bold font-mono mb-1">${Utils.formatCurrency(acc.balance)}</div>
          <div class="text-xs text-dim mb-3">${Utils.escapeHtml(acc.accountNumber)}</div>
          <div class="flex gap-2">
            <button class="btn btn-primary btn-sm" onclick="App.showQuickDeposit('${acc.id}', '${Utils.escapeHtml(acc.name)}')" style="flex:1;font-size:0.75rem;">+ Deposit</button>
            <button class="btn btn-ghost btn-sm" onclick="App.showQuickWithdraw('${acc.id}', '${Utils.escapeHtml(acc.name)}', ${acc.balance})" style="flex:1;font-size:0.75rem;">- Withdraw</button>
          </div>
        </div>`;
    }).join('');
  },

  showQuickDeposit(accountId, accountName) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    container.innerHTML = Components.modal({
      id: 'quick-deposit-modal',
      title: `Deposit to ${accountName}`,
      content: `
        <div class="form-group">
          <label class="form-label">Amount</label>
          <input type="number" class="input" id="quick-deposit-amount" placeholder="0.00" min="0.01" step="0.01">
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input type="text" class="input" id="quick-deposit-desc" placeholder="e.g., Wire Transfer, Payroll">
        </div>
      `,
      footer: `<button class="btn btn-primary" id="quick-deposit-submit">Deposit</button>`
    });

    Components.openModal('quick-deposit-modal');

    document.getElementById('quick-deposit-submit')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('quick-deposit-amount')?.value);
      const description = document.getElementById('quick-deposit-desc')?.value || 'Deposit';

      if (!amount || amount <= 0) {
        Components.toast('Enter a valid amount', 'warning');
        return;
      }

      try {
        await API.banking.deposit(accountId, { amount, description });
        Components.closeModal('quick-deposit-modal');
        Components.toast(`$${amount.toLocaleString()} deposited successfully`, 'success');
        await this.initDashboard();
      } catch (error) {
        Components.toast(error.message || 'Deposit failed', 'danger');
      }
    });
  },

  showQuickWithdraw(accountId, accountName, balance) {
    const container = document.getElementById('modal-container');
    if (!container) return;

    container.innerHTML = Components.modal({
      id: 'quick-withdraw-modal',
      title: `Withdraw from ${accountName}`,
      content: `
        <div class="form-group">
          <label class="form-label">Amount</label>
          <input type="number" class="input" id="quick-withdraw-amount" placeholder="0.00" min="0.01" step="0.01" max="${balance}">
          <div class="text-xs text-muted mt-1">Available: ${Utils.formatCurrency(balance)}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Description</label>
          <input type="text" class="input" id="quick-withdraw-desc" placeholder="e.g., Wire Transfer, Payment">
        </div>
      `,
      footer: `<button class="btn btn-primary" id="quick-withdraw-submit">Withdraw</button>`
    });

    Components.openModal('quick-withdraw-modal');

    document.getElementById('quick-withdraw-submit')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('quick-withdraw-amount')?.value);
      const description = document.getElementById('quick-withdraw-desc')?.value || 'Withdrawal';

      if (!amount || amount <= 0) {
        Components.toast('Enter a valid amount', 'warning');
        return;
      }

      try {
        await API.banking.withdraw(accountId, { amount, description });
        Components.closeModal('quick-withdraw-modal');
        Components.toast(`$${amount.toLocaleString()} withdrawn successfully`, 'success');
        await this.initDashboard();
      } catch (error) {
        Components.toast(error.message || 'Withdrawal failed', 'danger');
      }
    });
  },

  renderHoldings(holdings) {
    const container = document.getElementById('holdings-list');
    if (!container) return;

    container.innerHTML = holdings.map(h => `
      <div class="card flex justify-between items-center">
        <div class="flex items-center gap-3">
          <div class="kpi-icon ${h.change24h >= 0 ? 'green' : 'red'}">${h.icon}</div>
          <div>
            <div class="font-semibold">${Utils.escapeHtml(h.symbol)}</div>
            <div class="text-sm text-muted">${Utils.escapeHtml(h.name)}</div>
          </div>
        </div>
        <div class="text-right">
          <div class="font-mono">${Utils.formatCurrency(h.value)}</div>
          <div class="text-sm ${h.change24h >= 0 ? 'text-green' : 'text-red'}">${Utils.formatPercent(h.change24h)}</div>
        </div>
      </div>
    `).join('');
  },

  renderOrderBook(orderBook) {
    const bidsContainer = document.getElementById('bids');
    const asksContainer = document.getElementById('asks');

    if (bidsContainer) {
      bidsContainer.innerHTML = orderBook.bids.slice(0, 10).map(b => `
        <div class="orderbook-row" style="--depth: ${(b.total / orderBook.bids[9].total) * 100}%">
          <span class="orderbook-price bid">${b.price.toFixed(4)}</span>
          <span>${Utils.formatNumber(b.amount, 0)}</span>
          <span class="text-muted">${Utils.formatNumber(b.total, 0)}</span>
        </div>
      `).join('');
    }

    if (asksContainer) {
      asksContainer.innerHTML = orderBook.asks.slice(0, 10).map(a => `
        <div class="orderbook-row" style="--depth: ${(a.total / orderBook.asks[9].total) * 100}%">
          <span class="orderbook-price ask">${a.price.toFixed(4)}</span>
          <span>${Utils.formatNumber(a.amount, 0)}</span>
          <span class="text-muted">${Utils.formatNumber(a.total, 0)}</span>
        </div>
      `).join('');
    }
  },

  renderTrades(trades) {
    const container = document.getElementById('recent-trades');
    if (!container) return;

    container.innerHTML = trades.map(t => `
      <div class="trade-row">
        <span class="trade-price ${t.side}">${t.price.toFixed(4)}</span>
        <span>${Utils.formatNumber(t.amount, 0)}</span>
        <span class="trade-time">${Utils.formatDate(t.time, 'time')}</span>
      </div>
    `).join('');
  },

  renderWalletAssets(holdings) {
    const container = document.getElementById('wallet-assets');
    if (!container) return;

    container.innerHTML = holdings.map(h => `
      <tr>
        <td>
          <div class="flex items-center gap-3">
            <span class="text-xl">${h.icon}</span>
            <div>
              <div class="font-semibold">${Utils.escapeHtml(h.symbol)}</div>
              <div class="text-xs text-muted">${Utils.escapeHtml(h.name)}</div>
            </div>
          </div>
        </td>
        <td class="font-mono">${Utils.formatNumber(h.amount, 4)}</td>
        <td class="font-mono">${Utils.formatCurrency(h.currentPrice)}</td>
        <td class="font-mono">${Utils.formatCurrency(h.value)}</td>
        <td class="${h.change24h >= 0 ? 'text-green' : 'text-red'}">${Utils.formatPercent(h.change24h)}</td>
        <td>
          <button class="btn btn-sm btn-ghost" onclick="App.showSendModal('${Utils.escapeHtml(h.symbol)}')">Send</button>
          <button class="btn btn-sm btn-ghost" onclick="App.showReceiveModal('${Utils.escapeHtml(h.symbol)}')">Receive</button>
        </td>
      </tr>
    `).join('');
  },

  // AUM page
  async initAUM() {
    this.currentPage = 'aum';
    try {
      const response = await API.unified.getAUM().catch(() => null);
      if (!response?.data) return;
      const data = response.data;

      const kpiContainer = document.getElementById('aum-kpis');
      if (kpiContainer) {
        kpiContainer.innerHTML = [
          Components.kpiCard({ label: 'Total AUM', value: data.grandTotal, change: 6.8, icon: '\u{1F4BC}', color: 'cyan' }),
          Components.kpiCard({ label: 'Commodities', value: data.commoditiesTotal, change: data.commodities[0]?.change || 0, icon: '\u{1F947}', color: 'gold' }),
          Components.kpiCard({ label: 'Art Collection', value: data.artTotal, change: data.art[0]?.change || 0, icon: '\u{1F3A8}', color: 'purple' }),
          Components.kpiCard({ label: 'Instruments', value: data.instrumentsTotal, change: data.instruments[0]?.change || 0, icon: '\u{1F4C8}', color: 'green' })
        ].join('');
      }

      const commoditiesBody = document.getElementById('commodities-body');
      if (commoditiesBody) {
        commoditiesBody.innerHTML = data.commodities.map(c => `
          <tr>
            <td><div class="flex items-center gap-3"><span class="text-xl">${c.icon}</span><div><div class="font-semibold">${Utils.escapeHtml(c.name)}</div><div class="text-xs text-muted">${Utils.escapeHtml(c.type)}</div></div></div></td>
            <td class="font-mono">${Utils.escapeHtml(c.units)}</td>
            <td class="font-mono">${Utils.formatCurrency(c.unitPrice)}</td>
            <td class="font-mono font-semibold">${Utils.formatCurrency(c.value)}</td>
            <td class="${c.change >= 0 ? 'text-green' : 'text-red'}">${Utils.formatPercent(c.change)}</td>
          </tr>
        `).join('');
      }

      const artBody = document.getElementById('art-body');
      if (artBody) {
        artBody.innerHTML = data.art.map(a => `
          <tr>
            <td><div class="flex items-center gap-3"><span class="text-xl">${a.icon}</span><div><div class="font-semibold">${Utils.escapeHtml(a.name)}</div><div class="text-xs text-muted">${Utils.escapeHtml(a.artist)}</div></div></div></td>
            <td>${Utils.escapeHtml(a.medium)}</td>
            <td class="text-muted">${Utils.formatDate(a.acquired)}</td>
            <td class="font-mono font-semibold">${Utils.formatCurrency(a.value)}</td>
            <td class="${a.change >= 0 ? 'text-green' : 'text-red'}">${Utils.formatPercent(a.change)}</td>
          </tr>
        `).join('');
      }

      const cryptoBody = document.getElementById('crypto-aum-body');
      if (cryptoBody) {
        cryptoBody.innerHTML = data.crypto.map(c => `
          <tr>
            <td><div class="flex items-center gap-3"><span class="text-xl">${c.icon}</span><div><div class="font-semibold">${Utils.escapeHtml(c.symbol)}</div><div class="text-xs text-muted">${Utils.escapeHtml(c.name)}</div></div></div></td>
            <td class="font-mono">${Utils.formatNumber(c.amount, 2)}</td>
            <td class="font-mono">${Utils.formatCurrency(c.price)}</td>
            <td class="font-mono font-semibold">${Utils.formatCurrency(c.value)}</td>
            <td class="${c.change >= 0 ? 'text-green' : 'text-red'}">${Utils.formatPercent(c.change)}</td>
          </tr>
        `).join('');
      }

      const instrumentsBody = document.getElementById('instruments-body');
      if (instrumentsBody) {
        instrumentsBody.innerHTML = data.instruments.map(i => `
          <tr>
            <td><div class="flex items-center gap-3"><span class="text-xl">${i.icon}</span><div><div class="font-semibold">${Utils.escapeHtml(i.name)}</div><div class="text-xs text-muted">${Utils.escapeHtml(i.type)}</div></div></div></td>
            <td>${Utils.escapeHtml(i.rating)}</td>
            <td>${Utils.escapeHtml(i.maturity)}</td>
            <td class="font-mono">${i.yield > 0 ? Utils.formatPercent(i.yield) : 'N/A'}</td>
            <td class="font-mono font-semibold">${Utils.formatCurrency(i.value)}</td>
            <td class="${i.change >= 0 ? 'text-green' : 'text-red'}">${Utils.formatPercent(i.change)}</td>
          </tr>
        `).join('');
      }

      const chartContainer = document.getElementById('aum-allocation-chart');
      if (chartContainer && data.allocation) {
        chartContainer.innerHTML = data.allocation.map(d => {
          return `
            <div class="flex justify-between items-center mb-3">
              <div class="flex items-center gap-2">
                <div style="width:12px;height:12px;border-radius:var(--radius-full);background:${d.color}"></div>
                <span>${Utils.escapeHtml(d.label)}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="font-mono">${Utils.formatCurrency(d.value, 'USD', true)}</span>
                <span class="text-muted">${d.percentage}%</span>
              </div>
            </div>
            <div class="progress mb-4"><div class="progress-bar" style="width:${d.percentage}%;background:${d.color}"></div></div>
          `;
        }).join('');
      }
    } catch (error) {
      this.handleError(error, 'AUM page initialization failed');
    }
  },

  // =========================================================
  // TREASURY
  // =========================================================
  async initTreasury() {
    try {
      this.currentPage = 'treasury';

      const res = await API.crypto.getTreasury().catch(() => null);
      const data = res?.data;

      if (data) {
        // Total value
        const totalEl = document.getElementById('treasury-total');
        if (totalEl) totalEl.textContent = Utils.formatCurrency(data.totalValue);

        // Change
        const changeEl = document.getElementById('treasury-change');
        if (changeEl) changeEl.textContent = `+${data.change}%`;

        // Reserve composition bar
        const barEl = document.getElementById('reserve-bar');
        const legendEl = document.getElementById('reserve-legend');
        const colors = ['var(--color-cyan)', 'var(--color-gold)', 'var(--color-purple)', 'var(--color-green)', 'var(--color-blue)'];

        if (barEl && data.composition) {
          barEl.innerHTML = data.composition.map((c, i) =>
            `<div class="reserve-segment" style="width: ${c.percentage}%; background: ${colors[i % colors.length]};"></div>`
          ).join('');
        }

        if (legendEl && data.composition) {
          legendEl.innerHTML = data.composition.map((c, i) =>
            `<div class="legend-item"><div class="legend-dot" style="background: ${colors[i % colors.length]};"></div><span>${Utils.escapeHtml(c.symbol)} ${c.percentage}%</span></div>`
          ).join('');
        }

        // XRP cards
        const xrpCards = document.getElementById('xrp-cards');
        if (xrpCards && data.xrp) {
          const x = data.xrp;
          xrpCards.innerHTML = `
            <div class="xrp-card">
              <div class="xrp-icon">\u{1F48E}</div>
              <div class="text-sm text-muted mb-1">XRP Holdings</div>
              <div class="text-2xl font-bold font-mono">${Utils.formatNumber(x.amount, 0)} XRP</div>
              <div class="text-sm text-cyan mt-2">${Utils.formatCurrency(x.value)}</div>
            </div>
            <div class="xrp-card">
              <div class="xrp-icon">\u{1F4C8}</div>
              <div class="text-sm text-muted mb-1">Avg. Entry Price</div>
              <div class="text-2xl font-bold font-mono">${Utils.formatCurrency(x.avgEntry)}</div>
              <div class="text-sm text-green mt-2">+${x.pl}% P&L</div>
            </div>
            <div class="xrp-card">
              <div class="xrp-icon">\u{1F512}</div>
              <div class="text-sm text-muted mb-1">Staked / Escrow</div>
              <div class="text-2xl font-bold font-mono">${Utils.formatNumber(x.staked, 0)} XRP</div>
              <div class="text-sm text-purple mt-2">${x.stakedPercent}% of holdings</div>
            </div>
            <div class="xrp-card">
              <div class="xrp-icon">\u26A1</div>
              <div class="text-sm text-muted mb-1">Liquid Reserves</div>
              <div class="text-2xl font-bold font-mono">${Utils.formatNumber(x.liquid, 0)} XRP</div>
              <div class="text-sm text-cyan mt-2">Instant availability</div>
            </div>
          `;
        }

        // Recent movements
        const movementsEl = document.getElementById('treasury-movements');
        if (movementsEl && data.movements) {
          if (data.movements.length === 0) {
            movementsEl.innerHTML = '<div class="text-center text-muted py-4">No recent movements</div>';
          } else {
            movementsEl.innerHTML = data.movements.map((m, i) => {
              const isInflow = m.type === 'inflow';
              const border = i < data.movements.length - 1 ? 'border-b' : '';
              return `
                <div class="flex justify-between items-center py-2 ${border}">
                  <div>
                    <div class="font-medium ${isInflow ? 'text-green' : 'text-red'}">${isInflow ? '+' : '-'} ${Utils.formatNumber(m.amount, 2)} ${Utils.escapeHtml(m.symbol)}</div>
                    <div class="text-xs text-muted">${Utils.escapeHtml(m.description)}</div>
                  </div>
                  <div class="text-xs text-muted">${Utils.formatDate(m.date, 'relative')}</div>
                </div>
              `;
            }).join('');
          }
        }
      }

      // Treasury chart from real data
      const chartContainer = document.getElementById('treasury-chart');
      if (chartContainer) {
        const chartRes = await API.get('/kpis/chart').catch(() => null);
        if (chartRes?.data?.chartData?.length > 1) {
          Charts.lineChart(chartContainer, chartRes.data.chartData, { color: Charts.colors.cyan });
        } else {
          chartContainer.innerHTML = '<div class="flex items-center justify-center" style="height:200px;color:var(--text-muted);font-size:0.875rem;">No data available yet</div>';
        }
      }
    } catch (error) {
      this.handleError(error, 'Treasury initialization failed');
    }
  },

  // =========================================================
  // HOLDINGS
  // =========================================================
  async initHoldings() {
    try {
      this.currentPage = 'holdings';

      const res = await API.crypto.getHoldings().catch(() => null);
      let holdings = res?.data?.holdings || [];
      const summary = res?.data?.summary || {};

      // Render immediately with mock/API data, then enrich with Binance
      this._renderHoldingsPage(holdings, summary);

      // Enrich with real Binance prices in background
      if (typeof BinanceService !== 'undefined' && holdings.length > 0) {
        BinanceService.enrichHoldings(holdings).then(enriched => {
          // Recalculate allocations based on real values
          const totalValue = enriched.reduce((sum, h) => sum + (h.value || 0), 0);
          enriched = enriched.map(h => ({
            ...h,
            allocation: totalValue > 0 ? parseFloat(((h.value / totalValue) * 100).toFixed(1)) : h.allocation
          }));
          // Recalculate summary from enriched data
          const realSummary = {
            totalValue: totalValue,
            change24h: enriched.reduce((sum, h) => sum + ((h._binanceData?.change || 0) * (h.amount || 0)), 0),
            change24hPercent: totalValue > 0 ? enriched.reduce((sum, h) => sum + ((h.change24h || 0) * ((h.value || 0) / totalValue)), 0) : 0,
            unrealizedPL: summary.unrealizedPL || 0,
            unrealizedPLPercent: summary.unrealizedPLPercent || 0,
            assetCount: enriched.length
          };
          this._renderHoldingsPage(enriched, realSummary);
        }).catch(() => { /* keep mock data on failure */ });
      }
    } catch (error) {
      this.handleError(error, 'Holdings initialization failed');
    }
  },

  // Helper to render the full holdings page (used for initial + Binance-enriched render)
  _renderHoldingsPage(holdings, summary) {
      // KPIs
      const kpiGrid = document.getElementById('holdings-kpi-grid');
      if (kpiGrid) {
        kpiGrid.innerHTML = [
          Components.kpiCard({ label: 'Total Value', value: summary.totalValue || 0, change: summary.change24hPercent || 0, icon: '\u{1F4B0}', color: 'cyan' }),
          Components.kpiCard({ label: 'Unrealized P&L', value: summary.unrealizedPL || 0, change: summary.unrealizedPLPercent || 0, icon: '\u{1F4C8}', color: 'green' }),
          Components.kpiCard({ label: 'Total Assets', value: summary.assetCount || 0, change: 0, icon: '\u{1F522}', color: 'purple', format: 'number' }),
          Components.kpiCard({ label: '24h Change', value: summary.change24h || 0, change: summary.change24hPercent || 0, icon: '\u26A1', color: 'gold' })
        ].join('');
      }

      // Holdings rows
      const rowsEl = document.getElementById('holdings-rows');
      const colors = ['var(--color-cyan)', 'var(--color-gold)', 'var(--color-purple)', 'var(--color-green)', 'var(--color-blue)'];

      if (rowsEl) {
        rowsEl.innerHTML = holdings.map((h, i) => `
          <div class="holding-row">
            <div class="holding-asset">
              <div class="holding-icon">${h.icon || '\u{1F4B0}'}</div>
              <div><div class="font-semibold">${Utils.escapeHtml(h.symbol)}</div><div class="text-xs text-muted">${Utils.escapeHtml(h.name)}</div></div>
            </div>
            <div class="font-mono">${Utils.formatNumber(h.amount, h.amount < 100 ? 1 : 0)}</div>
            <div class="font-mono">${Utils.formatCurrency(h.currentPrice)}</div>
            <div class="font-mono font-semibold">${Utils.formatCurrency(h.value)}</div>
            <div class="${h.change24h >= 0 ? 'text-green' : 'text-red'}">${h.change24h >= 0 ? '+' : ''}${h.change24h.toFixed(2)}%</div>
            <div>
              <div class="allocation-bar"><div class="allocation-fill" style="width: ${h.allocation}%; background: ${colors[i % colors.length]};"></div></div>
              <div class="text-xs text-muted mt-1">${h.allocation}%</div>
            </div>
          </div>
        `).join('');
      }

      // Allocation chart
      const chartContainer = document.getElementById('allocation-chart');
      if (chartContainer && holdings.length > 0) {
        Charts.donutChart(chartContainer, holdings.map((h, i) => ({
          value: h.allocation,
          color: colors[i % colors.length].replace('var(--color-', '').replace(')', '')
        })).map(item => {
          const colorMap = { cyan: '#00e5ff', gold: '#00e5ff', purple: '#cc00ff', green: '#2ecc71', blue: '#cc00ff' };
          return { value: item.value, color: colorMap[item.color] || '#00e5ff' };
        }), { width: 200, height: 200 });
      }

      // Allocation legend
      const legendEl = document.getElementById('allocation-legend');
      if (legendEl) {
        legendEl.innerHTML = holdings.map((h, i) => {
          const border = i < holdings.length - 1 ? 'border-b' : '';
          return `
            <div class="flex justify-between items-center py-2 ${border}">
              <div class="flex items-center gap-2"><div class="legend-dot" style="background: ${colors[i % colors.length]}; width: 10px; height: 10px; border-radius: 2px;"></div><span>${Utils.escapeHtml(h.symbol)}</span></div>
              <span class="font-mono">${h.allocation}%</span>
            </div>
          `;
        }).join('');
      }
  },

  // =========================================================
  // DEFI
  // =========================================================
  async initDefi() {
    try {
      this.currentPage = 'defi';

      const res = await API.crypto.getDefi().catch(() => null);
      const positions = res?.data?.positions || [];
      const summary = res?.data?.summary || {};

      // KPIs
      const kpiGrid = document.getElementById('defi-kpi-grid');
      if (kpiGrid) {
        kpiGrid.innerHTML = [
          Components.kpiCard({ label: 'Total DeFi TVL', value: summary.totalTVL || 0, change: 0, icon: '\u{1F517}', color: 'purple' }),
          Components.kpiCard({ label: 'Pending Rewards', value: summary.totalRewards || 0, change: 0, icon: '\u{1F33E}', color: 'green' }),
          Components.kpiCard({ label: 'Avg. APY', value: `${summary.avgApy || 0}%`, change: 0, icon: '\u{1F4CA}', color: 'cyan', format: 'text' }),
          Components.kpiCard({ label: 'Active Positions', value: summary.activePositions || 0, change: 0, icon: '\u26A1', color: 'gold', format: 'number' })
        ].join('');
      }

      // Position cards
      const grid = document.getElementById('defi-positions-grid');
      if (grid) {
        const protocolClasses = { 'XRPL AMM': 'xrpl', 'Aave V3': 'aave', 'Uniswap V3': 'uniswap', 'Compound III': 'compound' };
        const protocolIcons = { 'XRPL AMM': '\u{1F48E}', 'Aave V3': '\u{1F47B}', 'Uniswap V3': '\u{1F984}', 'Compound III': '\u{1F3DB}\uFE0F' };
        const protocolColors = { 'XRPL AMM': 'rgba(0, 229, 255, 0.15)', 'Aave V3': 'rgba(204, 0, 255, 0.15)', 'Uniswap V3': 'rgba(224, 64, 251, 0.15)', 'Compound III': 'rgba(46, 204, 113, 0.15)' };

        grid.innerHTML = positions.map(p => {
          const cssClass = protocolClasses[p.protocol] || '';
          const icon = protocolIcons[p.protocol] || '\u{1F4B0}';
          const bgColor = protocolColors[p.protocol] || 'rgba(0, 229, 255, 0.15)';

          let details = '';
          if (p.type === 'liquidity') {
            details = `
              <div class="position-stat"><div class="position-stat-label">Deposited</div><div class="position-stat-value">${Utils.formatCurrency(p.deposited)}</div></div>
              <div class="position-stat"><div class="position-stat-label">Current Value</div><div class="position-stat-value text-green">${Utils.formatCurrency(p.currentValue)}</div></div>
              <div class="position-stat"><div class="position-stat-label">Rewards Earned</div><div class="position-stat-value">${Utils.formatCurrency(p.rewards)}</div></div>
              <div class="position-stat"><div class="position-stat-label">${p.poolShare ? 'Pool Share' : 'Price Range'}</div><div class="position-stat-value">${p.poolShare ? p.poolShare + '%' : (p.priceRange || 'N/A')}</div></div>
            `;
          } else if (p.type === 'lending') {
            details = `
              <div class="position-stat"><div class="position-stat-label">Supplied</div><div class="position-stat-value">${Utils.formatCurrency(p.deposited)}</div></div>
              <div class="position-stat"><div class="position-stat-label">Earned Interest</div><div class="position-stat-value text-green">${Utils.formatCurrency(p.rewards)}</div></div>
              <div class="position-stat"><div class="position-stat-label">Health Factor</div><div class="position-stat-value text-green">${p.healthFactor || 'N/A'}</div></div>
              <div class="position-stat"><div class="position-stat-label">Collateral</div><div class="position-stat-value">${p.collateral ? Utils.formatCurrency(p.collateral) : 'None'}</div></div>
            `;
          } else if (p.type === 'borrowing') {
            details = `
              <div class="position-stat"><div class="position-stat-label">Collateral</div><div class="position-stat-value">${Utils.formatCurrency(p.collateral)}</div></div>
              <div class="position-stat"><div class="position-stat-label">Borrowed</div><div class="position-stat-value">${Utils.formatCurrency(p.borrowed)}</div></div>
              <div class="position-stat"><div class="position-stat-label">LTV</div><div class="position-stat-value">${p.ltv}%</div></div>
              <div class="position-stat"><div class="position-stat-label">Liquidation At</div><div class="position-stat-value">$62,500</div></div>
            `;
          }

          const harvestBtn = p.rewards > 0 ? `<button class="btn btn-primary btn-sm flex-1" onclick="App.harvestRewards('${p._id || p.id}')">Harvest</button>` : '';

          return `
            <div class="defi-card ${cssClass}">
              <div class="flex justify-between items-start">
                <div>
                  <div class="protocol-logo" style="background: ${bgColor};">${icon}</div>
                  <div class="font-semibold text-lg">${Utils.escapeHtml(p.protocol)}</div>
                  <div class="text-sm text-muted">${Utils.escapeHtml(p.pool)}</div>
                </div>
                <div class="apy-badge">${p.apy}% APY</div>
              </div>
              <div class="position-details">${details}</div>
              <div class="flex gap-2 mt-4">
                <button class="btn btn-secondary btn-sm flex-1">Add</button>
                <button class="btn btn-ghost btn-sm flex-1">${p.type === 'borrowing' ? 'Repay' : 'Remove'}</button>
                ${harvestBtn}
              </div>
            </div>
          `;
        }).join('');
      }

      // Harvest All button
      const harvestAllBtn = document.getElementById('harvest-all-btn');
      if (harvestAllBtn) {
        harvestAllBtn.addEventListener('click', async () => {
          const harvestable = positions.filter(p => p.rewards > 0);
          if (harvestable.length === 0) {
            Components.toast('No rewards to harvest', 'info');
            return;
          }

          harvestAllBtn.disabled = true;
          harvestAllBtn.textContent = 'Harvesting...';

          try {
            for (const p of harvestable) {
              await API.crypto.harvestRewards ? API.post(`/crypto/defi/${p._id || p.id}/harvest`) : null;
            }
            Components.toast('All rewards harvested!', 'success');
            await this.initDefi();
          } catch (error) {
            Components.toast('Harvest failed', 'danger');
          } finally {
            harvestAllBtn.disabled = false;
            harvestAllBtn.textContent = 'Harvest All';
          }
        });
      }
    } catch (error) {
      this.handleError(error, 'DeFi initialization failed');
    }
  },

  async harvestRewards(positionId) {
    try {
      await API.post(`/crypto/defi/${positionId}/harvest`);
      Components.toast('Rewards harvested!', 'success');
      await this.initDefi();
    } catch (error) {
      Components.toast(error.message || 'Harvest failed', 'danger');
    }
  },

  // Placeholder initializers for other pages (still use mock data)
  // =========================================================
  // TOTAL ASSETS
  // =========================================================
  async initTotalAssets() {
    this.currentPage = 'total-assets';
    try {
      const response = await API.unified.getTotalAssets().catch(() => null);
      if (!response?.data) return;
      const d = response.data;
      const fmt = (v) => v >= 1000000 ? '$' + (v / 1000000).toFixed(1) + 'M' : '$' + v.toLocaleString();

      const heroEl = document.getElementById('total-assets-value');
      if (heroEl) heroEl.textContent = '$' + d.totalAssets.toLocaleString(undefined, { maximumFractionDigits: 0 });

      const changeEl = document.getElementById('total-assets-change');
      if (changeEl) changeEl.textContent = (d.change >= 0 ? '+' : '') + d.change + '%';

      // Breakdown bar
      const barEl = document.getElementById('breakdown-bar');
      const legendEl = document.getElementById('breakdown-legend');
      if (barEl && d.breakdown) {
        barEl.innerHTML = d.breakdown.map(b =>
          `<div class="breakdown-segment" style="width: ${b.percentage}%; background: var(--color-${b.color});"></div>`
        ).join('');
      }
      if (legendEl && d.breakdown) {
        legendEl.innerHTML = d.breakdown.map(b =>
          `<div class="flex items-center gap-2"><div style="width: 12px; height: 12px; background: var(--color-${b.color}); border-radius: 3px;"></div><span>${Utils.escapeHtml(b.category)} ${b.percentage}%</span></div>`
        ).join('');
      }

      // KPI category cards
      const catEl = document.getElementById('asset-categories');
      if (catEl && d.kpis) {
        const icons = { 'Banking': '🏦', 'Crypto Holdings': '₿', 'DeFi Positions': '🔗', 'Loans Outstanding': '📉' };
        const bgs = { gold: 'rgba(0, 229, 255, 0.15)', cyan: 'rgba(0, 229, 255, 0.15)', purple: 'rgba(204, 0, 255, 0.15)', red: 'rgba(231, 76, 60, 0.15)' };
        catEl.innerHTML = d.kpis.map(k => `
          <div class="asset-category">
            <div class="category-icon" style="background: ${bgs[k.color] || bgs.cyan}; color: var(--color-${k.color});">${icons[k.label] || k.icon}</div>
            <div class="text-sm text-muted mb-1">${Utils.escapeHtml(k.label)}</div>
            <div class="category-value">${fmt(k.value)}</div>
            <div class="category-change ${k.change >= 0 ? 'up' : 'down'}">${k.change >= 0 ? '↑' : '↓'} ${k.change >= 0 ? '+' : ''}${k.change}%</div>
          </div>
        `).join('');
      }

      // Top holdings
      const holdEl = document.getElementById('top-holdings');
      if (holdEl && d.topHoldings) {
        const typeIcons = { crypto: '💎', banking: '🏦' };
        holdEl.innerHTML = d.topHoldings.map(h => `
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
              <span>${typeIcons[h.type] || '📊'}</span><span class="font-medium">${Utils.escapeHtml(h.name)}</span>
            </div>
            <div class="text-right">
              <div class="font-mono">${fmt(h.value)}</div>
              ${h.change ? `<div class="text-xs ${h.change >= 0 ? 'text-green' : 'text-red'}">${h.change >= 0 ? '+' : ''}${h.change}%</div>` : ''}
            </div>
          </div>
        `).join('');
      }

      // Chart from real data
      const chartEl = document.getElementById('networth-chart');
      if (chartEl && typeof Charts !== 'undefined') {
        const chartRes = await API.get('/kpis/chart').catch(() => null);
        if (chartRes?.data?.chartData?.length > 1) {
          Charts.lineChart(chartEl, chartRes.data.chartData, { color: Charts.colors.cyan });
        } else {
          chartEl.innerHTML = '<div class="flex items-center justify-center" style="height:200px;color:var(--text-muted);font-size:0.875rem;">No transaction history yet</div>';
        }
      }
    } catch (error) {
      this.handleError(error, 'Total Assets initialization failed');
    }
  },

  // =========================================================
  // PORTFOLIO
  // =========================================================
  async initPortfolio() {
    this.currentPage = 'portfolio';
    try {
      const response = await API.unified.getPortfolio().catch(() => null);
      if (!response?.data) return;
      const d = response.data;
      const fmt = (v) => {
        if (Math.abs(v) >= 1000000) return (v >= 0 ? '+$' : '-$') + (Math.abs(v) / 1000000).toFixed(1) + 'M';
        if (Math.abs(v) >= 1000) return (v >= 0 ? '+$' : '-$') + (Math.abs(v) / 1000).toFixed(0) + 'K';
        return (v >= 0 ? '+$' : '-$') + Math.abs(v).toLocaleString();
      };

      // Performance cards
      const perfEl = document.getElementById('portfolio-perf-cards');
      if (perfEl && d.performance) {
        perfEl.innerHTML = d.performance.map(p => `
          <div class="performance-card">
            <div class="text-sm text-muted mb-2">${Utils.escapeHtml(p.label)}</div>
            <div class="performance-value ${p.value >= 0 ? 'positive' : 'negative'}">${fmt(p.value)}</div>
            <div class="text-sm ${p.value >= 0 ? 'text-green' : 'text-red'} mt-1">${p.percent >= 0 ? '+' : ''}${p.percent}%</div>
          </div>
        `).join('');
      }

      // Allocation bars
      const allocEl = document.getElementById('allocation-bars');
      if (allocEl && d.allocation) {
        const colors = ['cyan', 'gold', 'purple', 'green', 'blue'];
        allocEl.innerHTML = d.allocation.slice(0, 5).map((a, i) => `
          <div class="stat-bar">
            <div class="stat-bar-label">${Utils.escapeHtml(a.name)}</div>
            <div class="stat-bar-track"><div class="stat-bar-fill ${colors[i] || ''}" style="width: ${a.percentage}%;${!colors[i] ? ' background: var(--color-blue);' : ''}"></div></div>
            <div class="stat-bar-value">${a.percentage}%</div>
          </div>
        `).join('');
      }

      // Donut chart
      const donutEl = document.getElementById('allocation-donut');
      if (donutEl && d.allocation && typeof Charts !== 'undefined') {
        const colorMap = { cyan: '#00e5ff', gold: '#00e5ff', purple: '#cc00ff', green: '#2ecc71', blue: '#cc00ff' };
        const colorKeys = ['cyan', 'gold', 'purple', 'green', 'blue'];
        Charts.donutChart(donutEl, d.allocation.slice(0, 5).map((a, i) => ({
          value: a.percentage,
          color: colorMap[colorKeys[i]] || '#3b82f6'
        })), { width: 200, height: 200 });
      }

      // Risk profile
      const riskLevelEl = document.getElementById('risk-level');
      if (riskLevelEl) riskLevelEl.textContent = d.riskLevel || 'Moderate';
      const riskIndicator = document.getElementById('risk-indicator');
      if (riskIndicator) riskIndicator.style.left = (d.riskScore || 50) + '%';

      // Risk metrics
      const metricsEl = document.getElementById('risk-metrics');
      if (metricsEl && d.riskMetrics) {
        const rm = d.riskMetrics;
        const rows = [
          { label: 'Sharpe Ratio', value: rm.sharpeRatio, cls: '' },
          { label: 'Sortino Ratio', value: rm.sortinoRatio, cls: '' },
          { label: 'Max Drawdown', value: rm.maxDrawdown + '%', cls: 'text-red' },
          { label: 'Volatility (30d)', value: rm.volatility + '%', cls: '' },
          { label: 'Beta vs S&P', value: rm.beta, cls: '' },
          { label: 'Correlation BTC', value: rm.correlationBTC, cls: '' }
        ];
        metricsEl.innerHTML = rows.map(r =>
          `<div class="metric-row"><span class="text-muted">${r.label}</span><span class="font-mono font-semibold ${r.cls}">${r.value}</span></div>`
        ).join('');
      }

      // Chart from real data
      const chartEl = document.getElementById('performance-chart');
      if (chartEl && typeof Charts !== 'undefined') {
        const chartRes = await API.get('/kpis/chart').catch(() => null);
        if (chartRes?.data?.chartData?.length > 1) {
          Charts.lineChart(chartEl, chartRes.data.chartData, { color: Charts.colors.green, height: 400 });
        } else {
          chartEl.innerHTML = '<div class="flex items-center justify-center" style="height:200px;color:var(--text-muted);font-size:0.875rem;">No transaction history yet</div>';
        }
      }
    } catch (error) {
      this.handleError(error, 'Portfolio initialization failed');
    }
  },

  // =========================================================
  // AI INSIGHTS
  // =========================================================
  async initAIInsights() {
    this.currentPage = 'ai-insights';
    try {
      const response = await API.unified.getAIInsights().catch(() => null);
      if (!response?.data) return;
      const d = response.data;

      // Status info
      const statusEl = document.getElementById('ai-status-info');
      if (statusEl) statusEl.textContent = `Last updated ${new Date(d.lastUpdated).toLocaleTimeString()} \u2022 Analyzing ${d.dataSources} data sources`;

      // Insights list
      const listEl = document.getElementById('insights-list');
      if (listEl && d.insights) {
        const typeIcons = { recommendation: '💡', alert: '⚠️', opportunity: '✨', risk: '🚨' };
        const typeColors = { recommendation: 'cyan', alert: 'orange', opportunity: 'green', risk: 'red' };
        listEl.innerHTML = d.insights.map(ins => `
          <div class="insight-card ${ins.type}">
            <div class="insight-type ${ins.type}">${typeIcons[ins.type] || '💡'} ${Utils.escapeHtml(ins.type.charAt(0).toUpperCase() + ins.type.slice(1))}</div>
            <div class="font-semibold text-lg mb-2">${Utils.escapeHtml(ins.title)}</div>
            <p class="text-muted mb-4">${Utils.escapeHtml(ins.description)}</p>
            <div class="flex items-center justify-between">
              <div>
                <div class="text-xs text-muted mb-1">Confidence Level</div>
                <div class="flex items-center gap-2">
                  <div class="confidence-bar" style="width: 100px;">
                    <div class="confidence-fill" style="width: ${ins.confidence}%; background: var(--color-${typeColors[ins.type] || 'cyan'});"></div>
                  </div>
                  <span class="text-sm font-mono">${ins.confidence}%</span>
                </div>
              </div>
              <div class="flex gap-2">
                ${(ins.actions || []).map((a, i) =>
                  `<button class="btn ${i === 0 ? 'btn-ghost' : 'btn-primary'} btn-sm">${Utils.escapeHtml(a)}</button>`
                ).join('')}
              </div>
            </div>
          </div>
        `).join('');
      }

      // Stats
      const statsEl = document.getElementById('ai-stats');
      if (statsEl && d.stats) {
        const s = d.stats;
        statsEl.innerHTML = `
          <div class="flex justify-between items-center py-2 border-b"><span class="text-muted">Insights Generated</span><span class="font-mono font-semibold">${s.insightsGenerated.toLocaleString()}</span></div>
          <div class="flex justify-between items-center py-2 border-b"><span class="text-muted">Accuracy Rate</span><span class="font-mono font-semibold text-green">${s.accuracyRate}%</span></div>
          <div class="flex justify-between items-center py-2 border-b"><span class="text-muted">Actions Taken</span><span class="font-mono font-semibold">${s.actionsTaken}</span></div>
          <div class="flex justify-between items-center py-2"><span class="text-muted">Est. Value Added</span><span class="font-mono font-semibold text-green">+$${(s.valueAdded / 1000000).toFixed(1)}M</span></div>
        `;
      }
    } catch (error) {
      this.handleError(error, 'AI Insights initialization failed');
    }
  },

  // =========================================================
  // COMPLIANCE
  // =========================================================
  async initCompliance() {
    this.currentPage = 'compliance';
    try {
      const response = await API.admin.getCompliance().catch(() => null);
      if (!response?.data) return;
      const d = response.data;

      // Score
      const scoreEl = document.getElementById('compliance-score');
      if (scoreEl) scoreEl.textContent = d.complianceScore + '%';
      const lastEl = document.getElementById('compliance-last-audit');
      if (lastEl) lastEl.textContent = 'Last audit: ' + d.lastAudit;
      const nextEl = document.getElementById('compliance-next-audit');
      if (nextEl) nextEl.textContent = 'Next scheduled audit: ' + d.nextAudit;

      // ISO Standards
      const isoEl = document.getElementById('iso-standards');
      if (isoEl && d.isoStandards) {
        isoEl.innerHTML = d.isoStandards.map(iso => `
          <div class="iso-card">
            <div class="flex justify-between items-start mb-4">
              <div>
                <div class="font-semibold">${Utils.escapeHtml(iso.code)}</div>
                <div class="text-xs text-muted">${Utils.escapeHtml(iso.name)}</div>
              </div>
              <span class="badge ${iso.status === 'compliant' ? 'badge-success' : 'badge-warning'}">${iso.status === 'compliant' ? 'Active' : 'Review'}</span>
            </div>
            <div class="iso-status ${iso.status} mb-2">
              <span>${iso.status === 'compliant' ? '✓' : '⚠'}</span>
              <span class="font-medium">${iso.status === 'compliant' ? 'Compliant' : 'Pending Renewal'}</span>
            </div>
            <div class="progress mb-2">
              <div class="progress-bar" style="width: ${iso.compliance}%;${iso.status !== 'compliant' ? ' background: linear-gradient(90deg, var(--color-gold), var(--color-orange));' : ''}"></div>
            </div>
            <div class="text-xs text-muted">${iso.compliance}% compliance</div>
          </div>
        `).join('');
      }

      // Flagged Transactions
      const flagEl = document.getElementById('flagged-rows');
      const badgeEl = document.getElementById('pending-badge');
      if (badgeEl) badgeEl.textContent = d.pendingReview + ' Pending';
      if (flagEl && d.flaggedTransactions) {
        const btnClass = { critical: 'btn-primary', high: 'btn-primary', medium: 'btn-secondary', low: 'btn-ghost' };
        flagEl.innerHTML = d.flaggedTransactions.filter(f => f.status === 'pending').map(f => `
          <div class="flagged-row">
            <div><span class="severity-badge ${f.severity}">${Utils.escapeHtml(f.severity.charAt(0).toUpperCase() + f.severity.slice(1))}</span></div>
            <div>
              <div class="font-mono text-sm">${Utils.escapeHtml(f.transactionId)}</div>
              <div class="text-xs text-muted">${Utils.escapeHtml(f.type)}</div>
            </div>
            <div class="font-mono">$${f.amount.toLocaleString()}</div>
            <div class="text-sm">${Utils.escapeHtml(f.reason)}</div>
            <div class="flex gap-1">
              <button class="btn btn-sm btn-success" onclick="App.reviewFlagged('${f._id}', 'clear')">Clear</button>
              <button class="btn btn-sm btn-danger" onclick="App.reviewFlagged('${f._id}', 'block')">Block</button>
            </div>
          </div>
        `).join('') || '<div class="p-4 text-center text-muted">No pending flagged transactions</div>';
      }

      // Stats
      const statsEl = document.getElementById('compliance-stats');
      if (statsEl && d.stats) {
        const s = d.stats;
        statsEl.innerHTML = `
          <div class="flex justify-between items-center py-3 border-b"><span class="text-muted">Transactions Screened</span><span class="font-mono font-semibold">${s.transactionsScreened.toLocaleString()}</span></div>
          <div class="flex justify-between items-center py-3 border-b"><span class="text-muted">Auto-Approved</span><span class="font-mono font-semibold text-green">${s.autoApproved.toLocaleString()}</span></div>
          <div class="flex justify-between items-center py-3 border-b"><span class="text-muted">Manual Review</span><span class="font-mono font-semibold text-gold">${s.manualReview}</span></div>
          <div class="flex justify-between items-center py-3 border-b"><span class="text-muted">Blocked</span><span class="font-mono font-semibold text-red">${s.blocked}</span></div>
          <div class="flex justify-between items-center py-3"><span class="text-muted">False Positive Rate</span><span class="font-mono font-semibold">${s.falsePositiveRate}%</span></div>
        `;
      }
    } catch (error) {
      this.handleError(error, 'Compliance initialization failed');
    }
  },

  // Review flagged transaction
  async reviewFlagged(id, action) {
    try {
      const res = await API.admin.reviewFlaggedTransaction(id, { action });
      if (res?.success) {
        Components.toast?.(res.message || 'Transaction reviewed', 'success');
        await this.initCompliance();
      }
    } catch (error) {
      this.handleError(error, 'Review failed');
    }
  },

  // =========================================================
  // KYC
  // =========================================================
  async initKYC() {
    this.currentPage = 'kyc';
    try {
      const response = await API.admin.getKYCQueue().catch(() => null);
      if (!response?.data) return;
      const d = response.data;

      // KPIs
      const kpiEl = document.getElementById('kyc-kpis');
      if (kpiEl && d.summary) {
        const s = d.summary;
        kpiEl.innerHTML = [
          { icon: '📋', label: 'Pending', value: s.pending, cls: 'gold' },
          { icon: '🔍', label: 'In Review', value: s.inReview, cls: 'cyan' },
          { icon: '✓', label: 'Approved', value: s.approved, cls: 'green' },
          { icon: '✗', label: 'Rejected', value: s.rejected, cls: 'red' },
          { icon: '⏱', label: 'Avg Time', value: s.avgProcessingTime + 'h', cls: 'purple' }
        ].map(k => `
          <div class="kpi-card">
            <div class="kpi-icon ${k.cls}">${k.icon}</div>
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value">${k.value}</div>
          </div>
        `).join('');
      }

      // Subtitle
      const subEl = document.getElementById('kyc-queue-subtitle');
      if (subEl) subEl.textContent = (d.summary?.pending || 0) + ' applications waiting';

      // Queue
      const queueEl = document.getElementById('kyc-queue');
      if (queueEl && d.applications) {
        const riskBg = { low: '', medium: 'style="background: rgba(204, 0, 255, 0.15);"', high: 'style="background: rgba(239, 68, 68, 0.15);"', critical: 'style="background: rgba(239, 68, 68, 0.15);"' };
        queueEl.innerHTML = d.applications.map(app => {
          const initials = app.applicantName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
          return `
            <div class="kyc-queue-item" data-id="${app._id}">
              <div class="applicant-avatar" ${riskBg[app.riskLevel] || ''}>${initials}</div>
              <div>
                <div class="font-semibold">${Utils.escapeHtml(app.applicantName)}</div>
                <div class="text-sm text-muted">${Utils.escapeHtml(app.applicantType.charAt(0).toUpperCase() + app.applicantType.slice(1))} Account \u2022 Applied ${Utils.timeAgo ? Utils.timeAgo(app.createdAt) : new Date(app.createdAt).toLocaleDateString()}</div>
              </div>
              <div><span class="risk-score ${app.riskLevel}">${Utils.escapeHtml(app.riskLevel.charAt(0).toUpperCase() + app.riskLevel.slice(1))} Risk</span></div>
              <div class="text-sm text-muted">Documents: ${app.documents.submitted}/${app.documents.required}</div>
              <div class="flex gap-2">
                <button class="btn btn-primary btn-sm" onclick="App.selectKYC('${app._id}')">Review</button>
              </div>
            </div>
          `;
        }).join('') || '<div class="text-center text-muted py-4">No applications in queue</div>';
      }

      // Auto-select first
      if (d.applications?.length > 0) {
        this.selectKYC(d.applications[0]._id);
      }
    } catch (error) {
      this.handleError(error, 'KYC initialization failed');
    }
  },

  // Select KYC application for detail view
  async selectKYC(id) {
    try {
      const response = await API.admin.getKYCApplication(id).catch(() => null);
      if (!response?.data?.application) return;
      const app = response.data.application;

      // Highlight selected row
      document.querySelectorAll('.kyc-queue-item').forEach(el => el.style.borderColor = '');
      const row = document.querySelector(`.kyc-queue-item[data-id="${id}"]`);
      if (row) row.style.borderColor = 'var(--color-cyan)';

      const detailEl = document.getElementById('kyc-detail');
      if (!detailEl) return;

      const docItems = (app.documents?.items || []).map(doc => {
        const statusCls = doc.status === 'verified' ? 'verified' : doc.status === 'rejected' ? 'failed' : 'pending';
        const icon = doc.status === 'verified' ? '✓' : doc.status === 'rejected' ? '✗' : '○';
        return `<div class="document-check ${statusCls}"><span>${icon}</span><span>${Utils.escapeHtml(doc.name)}</span></div>`;
      }).join('');

      detailEl.innerHTML = `
        <h3 class="text-lg font-semibold mb-4">Selected: ${Utils.escapeHtml(app.applicantName)}</h3>
        <div class="detail-section">
          <div class="text-sm text-muted mb-2">Personal Information</div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div><span class="text-muted">Full Name:</span></div><div>${Utils.escapeHtml(app.applicantName)}</div>
            <div><span class="text-muted">Type:</span></div><div>${Utils.escapeHtml(app.applicantType)}</div>
            <div><span class="text-muted">Email:</span></div><div>${Utils.escapeHtml(app.email || 'N/A')}</div>
            <div><span class="text-muted">Nationality:</span></div><div>${Utils.escapeHtml(app.nationality || 'N/A')}</div>
          </div>
        </div>
        <div class="detail-section">
          <div class="text-sm text-muted mb-2">Document Verification</div>
          <div class="flex flex-col gap-2">${docItems || '<div class="text-muted text-sm">No documents submitted</div>'}</div>
        </div>
        <div class="detail-section">
          <div class="text-sm text-muted mb-2">Risk Assessment</div>
          <div class="flex items-center gap-3 mb-3">
            <span class="risk-score ${app.riskLevel}">${Utils.escapeHtml(app.riskLevel.charAt(0).toUpperCase() + app.riskLevel.slice(1))} Risk</span>
            <span class="text-sm">Score: ${app.riskScore}/100</span>
          </div>
        </div>
        ${app.status === 'pending' || app.status === 'review' ? `
          <div class="flex gap-2 mt-4">
            <button class="btn btn-success flex-1" onclick="App.reviewKYCAction('${app._id}', 'approve')">Approve</button>
            <button class="btn btn-danger flex-1" onclick="App.reviewKYCAction('${app._id}', 'reject')">Reject</button>
          </div>
          <button class="btn btn-ghost w-full mt-2" onclick="App.reviewKYCAction('${app._id}', 'request-info')">Request More Info</button>
        ` : `<div class="text-center text-sm text-muted mt-4">Status: ${Utils.escapeHtml(app.status)}</div>`}
      `;
    } catch (error) {
      this.handleError(error, 'Failed to load application');
    }
  },

  // Review KYC action
  async reviewKYCAction(id, action) {
    try {
      const res = await API.admin.reviewKYC(id, { action });
      if (res?.success) {
        Components.toast?.(res.message || 'Application updated', 'success');
        await this.initKYC();
      }
    } catch (error) {
      this.handleError(error, 'Review failed');
    }
  },

  // =========================================================
  // SYSTEM HEALTH
  // =========================================================
  async initSystemHealth() {
    this.currentPage = 'system';
    try {
      const response = await API.admin.getSystemHealth().catch(() => null);
      if (!response?.data) return;
      const d = response.data;

      // Uptime hero
      const uptimeEl = document.getElementById('uptime-value');
      if (uptimeEl) uptimeEl.textContent = d.uptime.percentage + '%';
      const detailsEl = document.getElementById('uptime-details');
      if (detailsEl) detailsEl.textContent = `Last 30 days \u2022 ${d.uptime.downtimeMinutes} minutes downtime`;
      const incidentEl = document.getElementById('last-incident');
      if (incidentEl) incidentEl.textContent = 'Last incident: ' + d.uptime.lastIncident;

      // Services grid
      const servicesEl = document.getElementById('services-grid');
      if (servicesEl && d.services) {
        const svcIcons = { 'Banking API': '🏦', 'Crypto Service': '₿', 'Auth Service': '🔐', 'Analytics': '📊', 'Database': '💾', 'Redis Cache': '⚡' };
        servicesEl.innerHTML = d.services.map(svc => {
          const m1 = svc.latency !== undefined ? { value: svc.latency + 'ms', label: 'Latency', cls: svc.latency < 50 ? 'text-green' : '' } : null;
          const m2 = svc.requestsPerMin ? { value: svc.requestsPerMin >= 1000 ? (svc.requestsPerMin / 1000).toFixed(1) + 'K' : svc.requestsPerMin, label: 'Req/min', cls: '' }
                   : svc.queryPerMin ? { value: (svc.queryPerMin / 1000).toFixed(1) + 'K', label: 'Queries/min', cls: '' }
                   : svc.hitRate ? { value: svc.hitRate + '%', label: 'Hit Rate', cls: '' } : null;
          const m3 = svc.errorRate !== undefined ? { value: svc.errorRate + '%', label: 'Error', cls: svc.errorRate === 0 ? 'text-green' : '' }
                   : svc.connectionUsage ? { value: svc.connectionUsage + '%', label: 'Connections', cls: '' }
                   : svc.memoryUsed ? { value: svc.memoryUsed, label: 'Memory', cls: '' } : null;
          return `
            <div class="service-card">
              <div class="service-header">
                <div class="service-name">${svcIcons[svc.name] || '🔧'} ${Utils.escapeHtml(svc.name)}</div>
                <div class="service-status"><span class="status-dot ${svc.status === 'operational' ? 'online' : 'warning'}"></span><span class="text-${svc.status === 'operational' ? 'green' : 'orange'} text-sm">${svc.status === 'operational' ? 'Healthy' : svc.status}</span></div>
              </div>
              <div class="service-metrics">
                ${[m1, m2, m3].filter(Boolean).map(m => `<div class="service-metric"><div class="metric-value ${m.cls}">${m.value}</div><div class="metric-label">${m.label}</div></div>`).join('')}
              </div>
            </div>
          `;
        }).join('');
      }

      // Resource usage
      const resEl = document.getElementById('resource-usage');
      if (resEl && d.resources) {
        const r = d.resources;
        const bars = [
          { label: 'CPU Usage', value: r.cpu },
          { label: 'Memory', value: r.memory, gradient: r.memory > 60 },
          { label: 'Disk I/O', value: r.diskIO },
          { label: 'Network', value: r.network }
        ];
        resEl.innerHTML = bars.map(b => `
          <div>
            <div class="flex justify-between mb-2"><span>${b.label}</span><span class="font-mono">${b.value}%</span></div>
            <div class="progress"><div class="progress-bar" style="width: ${b.value}%;${b.gradient ? ' background: linear-gradient(90deg, var(--color-cyan), var(--color-gold));' : ''}"></div></div>
          </div>
        `).join('');
      }

      // System logs
      const logsEl = document.getElementById('system-logs');
      if (logsEl && d.systemLogs) {
        const levelCls = { info: 'info', warning: 'warn', error: 'error', critical: 'error' };
        const levelText = { info: 'INFO', warning: 'WARN', error: 'ERROR', critical: 'CRITICAL' };
        logsEl.innerHTML = d.systemLogs.map(log => `
          <div class="log-entry">
            <div class="log-time">${new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
            <div>${Utils.escapeHtml(log.message)}</div>
            <div><span class="log-level ${levelCls[log.level] || 'info'}">${levelText[log.level] || log.level.toUpperCase()}</span></div>
          </div>
        `).join('') || '<div class="p-4 text-center text-muted">No recent logs</div>';
      }

      // Server info
      const infoEl = document.getElementById('server-info');
      if (infoEl && d.serverInfo) {
        const si = d.serverInfo;
        const rows = [
          { label: 'Host', value: si.host },
          { label: 'OS', value: si.os },
          { label: 'Docker', value: si.docker },
          { label: 'Node.js', value: si.nodeVersion },
          { label: 'MongoDB', value: si.mongodb },
          { label: 'Redis', value: si.redis }
        ];
        infoEl.innerHTML = rows.map((r, i) =>
          `<div class="flex justify-between py-2 ${i < rows.length - 1 ? 'border-b' : ''} text-sm"><span class="text-muted">${r.label}</span><span class="font-mono">${Utils.escapeHtml(r.value)}</span></div>`
        ).join('');
      }
    } catch (error) {
      this.handleError(error, 'System Health initialization failed');
    }
  },

  // System action button handler
  async systemAction(action) {
    try {
      const res = await API.admin.systemAction({ action });
      if (res?.success) {
        Components.toast?.(res.message || 'Action completed', 'success');
      }
    } catch (error) {
      this.handleError(error, 'Action failed');
    }
  },

  // =========================================================
  // REPORTS
  // =========================================================
  async initReports() {
    this.currentPage = 'reports';
    try {
      const response = await API.reports.getExecutive().catch(() => null);
      if (!response?.data) return;
      const d = response.data;

      // KPI cards
      const kpiEl = document.getElementById('reports-kpis');
      if (kpiEl && d.kpis) {
        const k = d.kpis;
        kpiEl.innerHTML = [
          Components.kpiCard({ label: 'Reports Generated', value: k.reportsGenerated, icon: '\u{1F4CA}', color: 'cyan' }),
          Components.kpiCard({ label: 'Compliance Score', value: k.complianceScore + '%', change: k.complianceChange, icon: '\u2713', color: 'green' }),
          Components.kpiCard({ label: 'Portfolio Growth', value: (k.portfolioGrowth >= 0 ? '+' : '') + k.portfolioGrowth + '%', icon: '\u{1F4C8}', color: 'purple' }),
          Components.kpiCard({ label: 'Risk Rating', value: k.riskRating, icon: '\u{1F3C6}', color: 'gold' })
        ].join('');
      }

      // Templates
      const templEl = document.getElementById('report-templates');
      if (templEl && d.templates) {
        templEl.innerHTML = d.templates.map(t => `
          <div class="card text-center">
            <div class="text-3xl mb-3">${t.icon}</div>
            <div class="font-semibold mb-1">${Utils.escapeHtml(t.name)}</div>
            <div class="text-sm text-muted mb-4">${Utils.escapeHtml(t.description)}</div>
            <button class="btn btn-secondary btn-sm w-full" onclick="App.generateReport('${t.id}')">Generate</button>
          </div>
        `).join('');
      }

      // Recent reports table
      const reportsEl = document.getElementById('recent-reports-body');
      if (reportsEl && d.recentReports) {
        reportsEl.innerHTML = d.recentReports.map(r => `
          <tr>
            <td><div class="font-semibold">${Utils.escapeHtml(r.name)}</div><div class="text-xs text-muted">${Utils.escapeHtml(r.subtitle)}</div></td>
            <td><span class="badge ${r.badgeClass}">${Utils.escapeHtml(r.type)}</span></td>
            <td>${new Date(r.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
            <td>${Utils.escapeHtml(r.period)}</td>
            <td><span class="badge badge-success">${r.status === 'ready' ? 'Ready' : r.status}</span></td>
            <td><button class="btn btn-ghost btn-sm" onclick="Components.toast('Report download started', 'info')">📥 Download</button></td>
          </tr>
        `).join('');
      }

      // Scheduled reports
      const schedEl = document.getElementById('scheduled-reports');
      if (schedEl && d.scheduled) {
        schedEl.innerHTML = d.scheduled.map(s => `
          <div class="card">
            <div class="flex justify-between items-start mb-3">
              <div class="font-semibold">${Utils.escapeHtml(s.name)}</div>
              <span class="badge badge-success">${s.status === 'active' ? 'Active' : s.status}</span>
            </div>
            <div class="text-sm text-muted mb-3">${Utils.escapeHtml(s.schedule)}</div>
            <div class="text-sm"><span class="text-muted">Next run:</span> ${new Date(s.nextRun).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
        `).join('');
      }
    } catch (error) {
      this.handleError(error, 'Reports initialization failed');
    }
  },

  // Generate report action
  async generateReport(type) {
    try {
      const res = await API.reports.generate(type);
      if (res?.success) {
        Components.toast?.(res.message || 'Report generated', 'success');
        await this.initReports();
      }
    } catch (error) {
      this.handleError(error, 'Report generation failed');
    }
  },

  // Modal helpers
  showSendModal(symbol) {
    const container = document.getElementById('modal-container');
    if (!container) {
      Components.toast(`Send ${symbol || 'crypto'} - use the Wallet page`, 'info');
      return;
    }

    container.innerHTML = Components.modal({
      id: 'send-modal',
      title: `Send ${symbol || 'Crypto'}`,
      content: `
        <div class="form-group">
          <label class="form-label">Recipient Address</label>
          <input type="text" class="input" id="send-address" placeholder="Enter wallet address">
        </div>
        <div class="form-group">
          <label class="form-label">Amount</label>
          <input type="number" class="input" id="send-amount" placeholder="0.00" step="any">
        </div>
      `,
      footer: `<button class="btn btn-primary" id="submit-send-btn">Send ${Utils.escapeHtml(symbol || '')}</button>`
    });

    Components.openModal('send-modal');

    document.getElementById('submit-send-btn')?.addEventListener('click', async () => {
      const toAddress = document.getElementById('send-address')?.value?.trim();
      const amount = parseFloat(document.getElementById('send-amount')?.value);

      if (!toAddress) { Components.toast('Enter a recipient address', 'warning'); return; }
      if (!amount || amount <= 0) { Components.toast('Enter a valid amount', 'warning'); return; }

      try {
        const result = await API.wallet.send({ symbol: symbol || 'XRP', amount, toAddress });
        Components.closeModal('send-modal');
        Components.toast(result.message || 'Sent!', 'success');
        if (this.currentPage === 'wallet') await this.initWallet();
      } catch (error) {
        Components.toast(error.message || 'Send failed', 'danger');
      }
    });
  },

  async showReceiveModal(symbol) {
    const container = document.getElementById('modal-container');
    if (!container) {
      Components.toast(`Receive ${symbol || 'crypto'} - use the Wallet page`, 'info');
      return;
    }

    // We need the wallet ID for the receive endpoint - find it from current data
    try {
      const walletRes = await API.wallet.getWallets();
      const wallet = walletRes?.data?.wallets?.find(w => w.symbol === symbol);
      if (!wallet) {
        Components.toast(`No ${symbol} wallet found`, 'warning');
        return;
      }

      const receiveRes = await API.wallet.receive(wallet.id);
      const data = receiveRes?.data;

      container.innerHTML = Components.modal({
        id: 'receive-modal',
        title: `Receive ${Utils.escapeHtml(symbol)}`,
        content: `
          <div class="text-center">
            <div class="text-sm text-muted mb-2">Your ${Utils.escapeHtml(data?.chain || '')} Address</div>
            <div class="font-mono text-sm p-3 rounded" style="background: var(--color-surface); word-break: break-all;">${Utils.escapeHtml(data?.address || 'N/A')}</div>
            <div class="text-xs text-muted mt-3">Only send ${Utils.escapeHtml(symbol)} on the ${Utils.escapeHtml(data?.chain || '')} network</div>
          </div>
        `,
        footer: `<button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${Utils.escapeHtml(data?.address || '')}'); Components.toast('Address copied!', 'success');">Copy Address</button>`
      });

      Components.openModal('receive-modal');
    } catch (error) {
      Components.toast(error.message || 'Failed to get address', 'danger');
    }
  },

  // Reset all accounts to zero
  async resetAllAccounts() {
    if (!confirm('This will zero all account balances and clear transaction history. Continue?')) return;

    try {
      const result = await API.banking.resetAll();
      Components.toast(result.message || 'All accounts reset to zero', 'success');
      if (this.currentPage === 'dashboard') {
        await this.initDashboard();
      } else if (this.currentPage === 'accounts') {
        await this.initAccounts();
      }
    } catch (error) {
      Components.toast(error.message || 'Reset failed', 'danger');
    }
  },

  // =========================================================
  // INSTITUTIONAL TRADER (Admin Only - Tradelocker)
  // =========================================================
  async initInstitutionalTrader() {
    this.currentPage = 'institutional-trader';

    const container = document.getElementById('institutional-trader-content');
    if (!container) return;

    // Non-admin users are fully blocked
    if (!Auth.hasRole('admin') && !Auth.hasRole('super_admin')) {
      container.innerHTML = `
        <div class="access-denied">
          <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <h2>Access Restricted</h2>
          <p>The Institutional Trader terminal requires administrator authorization. Contact your system administrator to request access.</p>
          <a href="dashboard.html" class="btn btn-primary">Return to Dashboard</a>
        </div>`;
      return;
    }

    // Admin users must re-authenticate before accessing the terminal
    container.innerHTML = `
      <div class="access-denied">
        <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <h2>Admin Authorization Required</h2>
        <p>Re-enter your password to access the Institutional Trading Terminal.</p>
        <form id="trader-auth-form" style="width: 100%; max-width: 360px;" onsubmit="return false;">
          <div class="form-group" style="margin-bottom: 1rem;">
            <input type="password" class="input" id="trader-auth-password" placeholder="Enter your password" autocomplete="current-password" required style="text-align: center;">
          </div>
          <div id="trader-auth-error" style="color: var(--color-danger, #ef4444); font-size: 0.875rem; margin-bottom: 0.75rem; display: none;"></div>
          <button type="submit" class="btn btn-primary" id="trader-auth-btn" style="width: 100%;">Authorize &amp; Enter</button>
        </form>
      </div>`;

    const form = document.getElementById('trader-auth-form');
    const passwordInput = document.getElementById('trader-auth-password');
    const errorEl = document.getElementById('trader-auth-error');
    const btn = document.getElementById('trader-auth-btn');

    if (form) {
      form.addEventListener('submit', async () => {
        const password = passwordInput?.value?.trim();
        if (!password) { errorEl.textContent = 'Password is required'; errorEl.style.display = 'block'; return; }

        btn.disabled = true;
        btn.textContent = 'Verifying...';
        errorEl.style.display = 'none';

        try {
          const user = Auth.getUser();
          const res = await API.post('/auth/login', { email: user.email, password: password });

          if (res && (res.accessToken || res.token)) {
            // Re-auth successful — show CI-styled welcome page
            container.innerHTML = `
              <style>
                @keyframes gridMove { 0% { transform: translate(0,0); } 100% { transform: translate(50px,50px); } }
                @keyframes glow { from { filter: drop-shadow(0 0 20px rgba(0,247,255,0.5)); } to { filter: drop-shadow(0 0 40px rgba(138,43,226,0.8)); } }
                @keyframes fadeInUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
                .ci-welcome { position:relative; min-height:calc(100vh - 120px); background:#1e1e28; overflow:hidden; border-radius:8px; font-family:'Inter',-apple-system,sans-serif; }
                .ci-neural-bg { position:absolute; inset:0; background-image:radial-gradient(circle at 20% 50%,rgba(0,247,255,0.1) 0%,transparent 50%),radial-gradient(circle at 80% 80%,rgba(138,43,226,0.1) 0%,transparent 50%),radial-gradient(circle at 40% 20%,rgba(255,0,255,0.05) 0%,transparent 50%); z-index:0; }
                .ci-grid { position:absolute; inset:0; background-image:linear-gradient(rgba(0,247,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,247,255,0.03) 1px,transparent 1px); background-size:50px 50px; animation:gridMove 20s linear infinite; z-index:0; }
                .ci-content { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; padding:3rem 2rem 2rem; }
                .ci-logo { font-size:1.1rem; letter-spacing:6px; text-transform:uppercase; background:linear-gradient(135deg,#00f7ff,#8a2be2); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:1rem; font-weight:600; }
                .ci-title { font-size:2.86rem; font-weight:900; text-align:center; color:#fff; line-height:1.2; margin-bottom:0.5rem; animation:fadeInUp 0.6s ease; }
                .ci-title span { background:linear-gradient(135deg,#00f7ff,#8a2be2); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
                .ci-subtitle { color:#a0a0b0; text-align:center; max-width:500px; margin-bottom:2rem; font-size:1.24rem; animation:fadeInUp 0.6s ease 0.1s both; }
                .ci-cog-status { display:flex; align-items:center; gap:0.75rem; padding:0.6rem 1.5rem; background:rgba(0,247,255,0.05); border:1px solid rgba(0,247,255,0.15); border-radius:50px; cursor:pointer; margin-bottom:2rem; transition:border-color 0.3s; animation:fadeInUp 0.6s ease 0.2s both; }
                .ci-cog-status:hover { border-color:rgba(0,247,255,0.4); }
                .ci-cog-dot { width:10px; height:10px; border-radius:50%; background:#666; }
                .ci-cog-label { color:#fff; font-weight:500; font-size:1.17rem; }
                .ci-cog-text { color:#a0a0b0; font-size:1.1rem; }
                .ci-cog-agents { color:#a0a0b0; font-size:1.1rem; }
                .ci-warning { display:none; max-width:680px; width:100%; margin-bottom:1.5rem; padding:1rem 1.25rem; background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.3); border-radius:10px; animation:fadeInUp 0.6s ease 0.25s both; }
                .ci-warning-inner { display:flex; align-items:flex-start; gap:0.75rem; }
                .ci-warning-icon { flex-shrink:0; margin-top:2px; }
                .ci-warning-title { color:#ef4444; font-weight:600; font-size:1.1rem; margin-bottom:0.25rem; }
                .ci-warning-text { color:#d4a0a0; font-size:0.95rem; line-height:1.5; }
                .ci-warning-retry { display:inline-flex; align-items:center; gap:0.4rem; margin-top:0.5rem; padding:0.4rem 1rem; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); border-radius:6px; color:#ef4444; font-size:0.9rem; font-weight:500; cursor:pointer; transition:all 0.2s; }
                .ci-warning-retry:hover { background:rgba(239,68,68,0.25); }
                .ci-cards { display:grid; grid-template-columns:1fr 1fr; gap:1.25rem; max-width:680px; width:100%; animation:fadeInUp 0.6s ease 0.3s both; }
                .ci-card { background:rgba(255,255,255,0.06); border:1px solid rgba(0,247,255,0.1); border-radius:12px; padding:1.5rem; cursor:pointer; transition:all 0.3s; position:relative; overflow:hidden; }
                .ci-card:hover { border-color:rgba(0,247,255,0.4); transform:translateY(-3px); box-shadow:0 8px 30px rgba(0,247,255,0.1); }
                .ci-card::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:linear-gradient(90deg,#00f7ff,#8a2be2); opacity:0; transition:opacity 0.3s; }
                .ci-card:hover::before { opacity:1; }
                .ci-card-disabled { opacity:0.35; cursor:not-allowed; }
                .ci-card-disabled:hover { border-color:rgba(0,247,255,0.1); transform:none; box-shadow:none; }
                .ci-card-header { display:flex; align-items:center; gap:0.5rem; margin-bottom:0.75rem; }
                .ci-card-dot { width:8px; height:8px; border-radius:50%; }
                .ci-card-title { color:#fff; font-weight:600; font-size:1.24rem; }
                .ci-card-details { color:#666; font-size:1.04rem; line-height:1.7; }
                .ci-card-details .ci-live { color:#00f7ff; }
                .ci-card-details .ci-soon { color:#f59e0b; }
                .ci-footer { margin-top:2rem; animation:fadeInUp 0.6s ease 0.4s both; }
                .ci-btn { display:inline-flex; align-items:center; gap:0.5rem; padding:0.6rem 1.5rem; background:linear-gradient(135deg,#00f7ff,#8a2be2); color:#fff; border:none; border-radius:6px; font-size:1.1rem; font-weight:600; text-decoration:none; cursor:pointer; transition:opacity 0.2s; }
                .ci-btn:hover { opacity:0.85; }
                .ci-terminal-bar { display:flex; align-items:center; justify-content:space-between; padding:0.6rem 1rem; background:#1e1e28; border-bottom:1px solid rgba(0,247,255,0.1); border-radius:8px 8px 0 0; }
                .ci-terminal-bar-left { display:flex; align-items:center; gap:0.5rem; }
                .ci-terminal-bar-right { display:flex; gap:0.4rem; flex-wrap:wrap; }
                .ci-tbtn { padding:0.35rem 0.75rem; background:rgba(0,247,255,0.1); color:#00f7ff; border:1px solid rgba(0,247,255,0.2); border-radius:4px; font-size:1.04rem; cursor:pointer; transition:all 0.2s; text-decoration:none; font-weight:500; }
                .ci-tbtn:hover { background:rgba(0,247,255,0.2); }
                .ci-tbtn-active { background:rgba(0,247,255,0.25); border-color:#00f7ff; }
                .ci-tbtn-disabled { opacity:0.35; cursor:not-allowed; }
              </style>

              <div id="trader-welcome" class="ci-welcome">
                <div class="ci-neural-bg"></div>
                <div class="ci-grid"></div>
                <div class="ci-content">
                  <div class="ci-logo">COGNITIVE INTELLIGENCE</div>
                  <h2 class="ci-title">Welcome to <span>Institutional Trading</span></h2>
                  <p class="ci-subtitle">Select a trading account to launch the terminal. All accounts are powered by the BeeBot Cognitive Network for AI-driven analysis.</p>

                  <div class="ci-cog-status" onclick="window._checkCognitiveStatus()">
                    <div class="ci-cog-dot" id="cog-status-dot"></div>
                    <span class="ci-cog-label">Cognitive Network</span>
                    <span class="ci-cog-text" id="cog-status-text">Checking...</span>
                    <span class="ci-cog-agents" id="cog-agent-count"></span>
                  </div>

                  <div class="ci-warning" id="cog-warning">
                    <div class="ci-warning-inner">
                      <svg class="ci-warning-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <div>
                        <div class="ci-warning-title">Cognitive Network Disconnected</div>
                        <div class="ci-warning-text">The AI cognitive network is currently offline. Trading terminals will operate without AI-powered analysis, signals, and cognitive consensus data.</div>
                        <button class="ci-warning-retry" onclick="window._checkCognitiveStatus()">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                          Retry Connection
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="ci-cards">
                    <div class="ci-card" onclick="window._launchAccount('paper2-tl')">
                      <div class="ci-card-header">
                        <div class="ci-card-dot" style="background:#3b82f6;"></div>
                        <span class="ci-card-title">Demo GenFX TradeLocker</span>
                      </div>
                      <div class="ci-card-details">
                        <div>Account: <span class="ci-live">D#2340741</span> (Paper2)</div>
                        <div>Platform: TradeLocker &bull; GenFX</div>
                        <div>Server: GENFX &bull; Leverage: 1:500 &bull; USD</div>
                        <div style="margin-top:6px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.08);">
                          <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; font-size:0.8rem;">
                            <div>Balance: <b style="color:#22c55e;">$1,000.00</b></div>
                            <div>Credit: <b>$0.00</b></div>
                            <div>Equity: <b>$0.00</b></div>
                            <div>Open P&amp;L: <b>$0.00</b></div>
                            <div>Closed P&amp;L: <b>$0.00</b></div>
                          </div>
                        </div>
                        <div style="margin-top:4px;">Status: <span style="color:#22c55e;">Active</span> &bull; 07/16/2026</div>
                      </div>
                    </div>
                    <div class="ci-card" onclick="window._launchAccount('demo-tl')">
                      <div class="ci-card-header">
                        <div class="ci-card-dot" style="background:#3b82f6;"></div>
                        <span class="ci-card-title">Demo GenFX TradeLocker</span>
                      </div>
                      <div class="ci-card-details">
                        <div>Account: <span class="ci-live">D#2239952</span> (paper)</div>
                        <div>Server: GENFX</div>
                        <div>Leverage: 1:500 &bull; USD</div>
                      </div>
                    </div>
                    <div class="ci-card ci-card-disabled">
                      <div class="ci-card-header">
                        <div class="ci-card-dot" style="background:#666;"></div>
                        <span class="ci-card-title">Live MT5 - London Trade Index</span>
                      </div>
                      <div class="ci-card-details">
                        <div>Platform: MetaTrader 5</div>
                        <div>Server: London Trade Index</div>
                        <div class="ci-soon">Coming Soon</div>
                      </div>
                    </div>
                    <div class="ci-card ci-card-disabled">
                      <div class="ci-card-header">
                        <div class="ci-card-dot" style="background:#666;"></div>
                        <span class="ci-card-title">Demo MT5 - London Trade Index</span>
                      </div>
                      <div class="ci-card-details">
                        <div>Platform: MetaTrader 5</div>
                        <div>Server: London Trade Index</div>
                        <div class="ci-soon">Coming Soon</div>
                      </div>
                    </div>
                    <div class="ci-card" onclick="window._launchAccount('melvin')" style="grid-column: 1 / -1;">
                      <div class="ci-card-header">
                        <div class="ci-card-dot" style="background:#f0c040;"></div>
                        <span class="ci-card-title">House of Bucks — D#2263354</span>
                        <span style="background:linear-gradient(135deg,#f0c040,#e6a800); color:#000; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:10px; margin-left:auto;">NEW</span>
                      </div>
                      <div class="ci-card-details">
                        <div>Account: <span class="ci-live">D#2263354</span> &bull; GenFX TradeLocker &bull; GENFX Server</div>
                        <div>Currency: USD &bull; Leverage: 1:500 &bull; Status: Active</div>
                        <div>Strategy: House of Bucks &bull; Created: 06/18/2026</div>
                      </div>
                    </div>
                  </div>

                  <div class="ci-footer">
                    <a href="dashboard.html" class="ci-btn">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                      Return to Dashboard
                    </a>
                  </div>
                </div>
              </div>

              <!-- Trading Terminal (hidden until account selected) -->
              <div id="trader-terminal" style="display:none; flex-direction:column; height:calc(100vh - 120px);">
                <div class="ci-terminal-bar">
                  <div class="ci-terminal-bar-left">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00f7ff" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                    <span id="terminal-title" style="color:#fff; font-weight:600; font-size:1.17rem;">Institutional Trading Terminal</span>
                  </div>
                  <div class="ci-terminal-bar-right">
                    <button onclick="window._launchAccount('paper2-tl')" id="btn-paper2-tl" class="ci-tbtn">Paper2 TL</button>
                    <button onclick="window._launchAccount('demo-tl')" id="btn-demo-tl" class="ci-tbtn">Demo TL</button>
                    <button onclick="window._launchAccount('live-mt5')" id="btn-live-mt5" class="ci-tbtn">Live MT5</button>
                    <button onclick="window._launchAccount('demo-mt5')" id="btn-demo-mt5" class="ci-tbtn">Demo MT5</button>
                    <button onclick="window._launchAccount('melvin')" id="btn-melvin" class="ci-tbtn" style="border-color:rgba(240,192,64,0.4); color:#f0c040;">House of Bucks</button>
                    <button onclick="document.getElementById('trader-welcome').style.display='block'; document.getElementById('trader-terminal').style.display='none';" class="ci-tbtn">Accounts</button>
                    <a href="dashboard.html" class="ci-tbtn" style="text-decoration:none;">Exit</a>
                  </div>
                </div>
                <div class="tradelocker-container" style="flex:1; border-radius:0 0 8px 8px;">
                  <iframe id="trader-iframe" src="about:blank" allowfullscreen></iframe>
                </div>
              </div>
            `;

            // Cognitive network status checker
            window._checkCognitiveStatus = async () => {
              const dot = document.getElementById('cog-status-dot');
              const text = document.getElementById('cog-status-text');
              const agents = document.getElementById('cog-agent-count');
              try {
                const r = await fetch('/cognitive/health', { signal: AbortSignal.timeout(5000) });
                const d = await r.json();
                if (d.status === 'healthy') {
                  dot.style.background = '#00f7ff';
                  text.textContent = 'Online';
                  text.style.color = '#00f7ff';
                  agents.textContent = d.agents ? d.agents + ' Agents' : '';
                  agents.style.color = '#00f7ff';
                  const w1 = document.getElementById('cog-warning'); if (w1) w1.style.display = 'none';
                } else {
                  dot.style.background = '#f59e0b';
                  text.textContent = 'Degraded';
                  text.style.color = '#f59e0b';
                  agents.textContent = '';
                  const w2 = document.getElementById('cog-warning'); if (w2) { w2.style.display = 'block'; w2.querySelector('.ci-warning-title').textContent = 'Cognitive Network Degraded'; w2.querySelector('.ci-warning-text').textContent = 'The AI cognitive network is experiencing issues. Some trading signals and analysis may be unavailable.'; }
                }
              } catch(e) {
                dot.style.background = '#ef4444';
                text.textContent = 'Offline';
                text.style.color = '#ef4444';
                agents.textContent = '';
                const w3 = document.getElementById('cog-warning'); if (w3) { w3.style.display = 'block'; w3.querySelector('.ci-warning-title').textContent = 'Cognitive Network Disconnected'; w3.querySelector('.ci-warning-text').textContent = 'The AI cognitive network is currently offline. Trading terminals will operate without AI-powered analysis, signals, and cognitive consensus data.'; }
              }
            };
            window._checkCognitiveStatus();

            // Account launcher
            window._launchAccount = (acctId) => {
              const urls = {
                'paper2-tl': '/trader-dashboard/BeeBot_Sentient_Trader_tradelockerv3.10_VPS.html',
                'demo-tl': '/trader-dashboard/BeeBot_Sentient_Trader_tradelockerv3.10_DEMO.html',
                'demo-mt5': '/trader-dashboard/BeeBot_Sentient_Trader_v3.10_MT5Bridge.html',
                'live-mt5': '/trader-dashboard/BeeBot_Sentient_Trader_tradelockerv3.10_LOCAL.html',
                'melvin': '/trader-dashboard/BeeBot_Sentient_Trader_tradelockerv3.10_MELVIN.html'
              };
              const names = {
                'paper2-tl': 'Demo GenFX TradeLocker - D#2340741 (Paper2)',
                'demo-tl': 'Demo GenFX TradeLocker - D#2239952',
                'demo-mt5': 'Demo MT5 Bridge',
                'live-mt5': 'Live MT5',
                'melvin': 'House of Bucks — D#2263354 (GenFX)'
              };
              if (!urls[acctId]) return;
              document.getElementById('trader-welcome').style.display = 'none';
              document.getElementById('trader-terminal').style.display = 'flex';
              document.getElementById('trader-iframe').src = urls[acctId];
              document.getElementById('terminal-title').textContent = names[acctId];
              ['paper2-tl','demo-tl','demo-mt5','live-mt5','melvin'].forEach(id => {
                const btn = document.getElementById('btn-' + id);
                if (btn) { btn.style.background = id === acctId ? '#16a34a' : '#22c55e'; btn.style.color = '#fff'; btn.className = 'btn btn-sm'; }
              });
            };
          } else {
            errorEl.textContent = 'Invalid password. Access denied.';
            errorEl.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Authorize & Enter';
          }
        } catch (error) {
          errorEl.textContent = error.message || 'Authentication failed. Try again.';
          errorEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Authorize & Enter';
        }
      });
    }
  },

  // =========================================================
  // PROGRAMS HUB
  // =========================================================
  async initPrograms() {
    this.currentPage = 'programs';
  },

  // =========================================================
  // VIDEO2TEXT
  // =========================================================
  async initVideo2Text() {
    this.currentPage = 'video2text';

    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('file-input');
    const transcribeBtn = document.getElementById('transcribe-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const downloadBtn = document.getElementById('download-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const progressPercent = document.getElementById('progress-percent');
    const transcriptBody = document.getElementById('transcript-body');
    const transcriptText = document.getElementById('transcript-text');
    const transcriptPlaceholder = document.getElementById('transcript-placeholder');
    const transcriptStatus = document.getElementById('transcript-status');
    const mediaPreviewContainer = document.getElementById('media-preview-container');
    const mediaPreview = document.getElementById('media-preview');

    let currentFile = null;
    let currentTranscript = '';

    // Drag and drop
    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => {
      uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
      const validTypes = ['video/', 'audio/'];
      const validMimes = ['audio/amr', 'audio/ogg', 'application/ogg'];
      const validExtensions = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.mp3', '.wav', '.ogg', '.oog', '.flac', '.aac', '.amr'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const isValid = validTypes.some(t => file.type.startsWith(t)) || validMimes.includes(file.type) || validExtensions.includes(ext);

      if (!isValid) {
        Components.toast('Please upload a video or audio file.', 'error');
        return;
      }

      currentFile = file;
      const isVideo = file.type.startsWith('video/') || ['.mp4', '.webm', '.mkv', '.avi', '.mov'].includes(ext);
      const size = file.size < 1048576 ? (file.size / 1024).toFixed(1) + ' KB' : (file.size / 1048576).toFixed(1) + ' MB';

      uploadZone.classList.add('has-file');
      uploadZone.innerHTML = `
        <div class="file-info">
          <div class="file-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-blue)" stroke-width="2">
              ${isVideo
                ? '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M10 8l5 3-5 3V8z"/>'
                : '<path d="M12 1a3 3 0 00-3 3v4a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>'}
            </svg>
          </div>
          <div>
            <div class="file-name">${Utils.escapeHtml(file.name)}</div>
            <div class="file-meta">${size} &middot; ${isVideo ? 'Video' : 'Audio'}</div>
          </div>
          <button class="btn btn-ghost btn-sm file-remove" id="remove-file-btn">&times;</button>
        </div>
      `;

      // Re-attach remove handler
      document.getElementById('remove-file-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        resetUpload();
      });

      // Show media preview
      const url = URL.createObjectURL(file);
      mediaPreviewContainer.style.display = 'block';
      if (isVideo) {
        mediaPreview.innerHTML = `<video controls preload="metadata"><source src="${url}"></video>`;
      } else {
        mediaPreview.innerHTML = `<audio controls preload="metadata"><source src="${url}"></audio>`;
      }

      transcribeBtn.disabled = false;
      clearBtn.style.display = 'inline-flex';
    }

    function resetUpload() {
      currentFile = null;
      currentTranscript = '';
      uploadZone.classList.remove('has-file');
      uploadZone.innerHTML = `
        <svg class="upload-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <div class="upload-title">Drop video or audio file here</div>
        <div class="upload-hint">or click to browse</div>
        <div class="upload-formats">Supported: MP4, WebM, MKV, AVI, MOV, MP3, WAV, OGG, OOG, FLAC, AAC, AMR</div>
      `;
      mediaPreviewContainer.style.display = 'none';
      mediaPreview.innerHTML = '';
      transcribeBtn.disabled = true;
      clearBtn.style.display = 'none';
      progressContainer.style.display = 'none';
      transcriptText.style.display = 'none';
      transcriptText.textContent = '';
      transcriptPlaceholder.style.display = 'flex';
      copyBtn.disabled = true;
      downloadBtn.disabled = true;
      transcriptStatus.innerHTML = '<span class="status-dot pending"></span><span>Ready</span>';
      fileInput.value = '';
    }

    // Transcribe button
    transcribeBtn.addEventListener('click', async () => {
      if (!currentFile) return;

      transcribeBtn.disabled = true;
      progressContainer.style.display = 'block';
      transcriptPlaceholder.style.display = 'none';
      transcriptText.style.display = 'block';
      transcriptText.textContent = '';
      transcriptStatus.innerHTML = '<span class="status-dot online"></span><span>Transcribing...</span>';

      // Simulate transcription progress (replace with real API call when backend is ready)
      const steps = [
        { pct: 10, status: 'Extracting audio...' },
        { pct: 30, status: 'Processing audio stream...' },
        { pct: 50, status: 'Running speech recognition...' },
        { pct: 70, status: 'Generating transcript...' },
        { pct: 90, status: 'Formatting output...' },
        { pct: 100, status: 'Complete' }
      ];

      for (const step of steps) {
        await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
        progressBar.style.width = step.pct + '%';
        progressStatus.textContent = step.status;
        progressPercent.textContent = step.pct + '%';
      }

      // Demo transcript output
      const format = document.getElementById('v2t-format').value;
      const fileName = currentFile.name;
      currentTranscript = generateDemoTranscript(fileName, format);

      transcriptText.textContent = currentTranscript;
      transcriptStatus.innerHTML = '<span class="status-dot online"></span><span>Transcription complete</span>';
      copyBtn.disabled = false;
      downloadBtn.disabled = false;
      transcribeBtn.disabled = false;
    });

    // Clear button
    clearBtn.addEventListener('click', resetUpload);

    // Copy button
    copyBtn.addEventListener('click', () => {
      if (!currentTranscript) return;
      navigator.clipboard.writeText(currentTranscript).then(() => {
        Components.toast('Transcript copied to clipboard', 'success');
      }).catch(() => {
        Components.toast('Failed to copy', 'error');
      });
    });

    // Download button
    downloadBtn.addEventListener('click', () => {
      if (!currentTranscript) return;
      const format = document.getElementById('v2t-format').value;
      const ext = format === 'srt' ? '.srt' : format === 'vtt' ? '.vtt' : '.txt';
      const blob = new Blob([currentTranscript], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (currentFile ? currentFile.name.replace(/\.[^.]+$/, '') : 'transcript') + ext;
      a.click();
      URL.revokeObjectURL(url);
    });

    function generateDemoTranscript(fileName, format) {
      const lines = [
        { time: '00:00:01', text: 'Welcome to this presentation.' },
        { time: '00:00:05', text: 'Today we will be discussing the quarterly financial results and strategic outlook for the upcoming period.' },
        { time: '00:00:14', text: 'Our revenue grew by twelve percent year over year, driven primarily by expansion in digital banking services.' },
        { time: '00:00:23', text: 'Customer acquisition costs decreased while retention rates improved across all segments.' },
        { time: '00:00:31', text: 'The institutional trading division saw record volumes in the fourth quarter.' },
        { time: '00:00:38', text: 'We are also pleased to announce the launch of several new compliance and automation tools.' },
        { time: '00:00:46', text: 'Looking ahead, we plan to invest heavily in AI-driven analytics and real-time transaction monitoring.' },
        { time: '00:00:55', text: 'Thank you for your attention. We will now open the floor for questions.' }
      ];

      if (format === 'srt') {
        return lines.map((l, i) => {
          const end = lines[i + 1] ? lines[i + 1].time : '00:01:00';
          return `${i + 1}\n${l.time},000 --> ${end},000\n${l.text}`;
        }).join('\n\n');
      }

      if (format === 'vtt') {
        const body = lines.map((l, i) => {
          const end = lines[i + 1] ? lines[i + 1].time : '00:01:00';
          return `${l.time}.000 --> ${end}.000\n${l.text}`;
        }).join('\n\n');
        return `WEBVTT\n\n${body}`;
      }

      if (format === 'timestamps') {
        return lines.map(l => `[${l.time}] ${l.text}`).join('\n\n');
      }

      // Plain text
      return lines.map(l => l.text).join(' ');
    }
  },

  // Logout
  // =========================================================
  // LIBRARY
  // =========================================================
  libraryRecords: [
    { id: 1, title: 'Annual Financial Report 2025', author: 'Banc of El Trust International', category: 'annual-report', type: 'PDF', pages: 142, date: '2025-12-15', size: '8.4 MB' },
    { id: 2, title: 'Regulatory Compliance Framework', author: 'Compliance Division', category: 'regulatory', type: 'PDF', pages: 87, date: '2025-09-20', size: '3.2 MB' },
    { id: 3, title: 'Digital Asset Custody Standards', author: 'Crypto Treasury Dept.', category: 'whitepaper', type: 'PDF', pages: 34, date: '2025-11-02', size: '1.8 MB' },
    { id: 4, title: 'Anti-Money Laundering Policy Manual', author: 'Legal & Compliance', category: 'policy', type: 'PDF', pages: 63, date: '2025-06-10', size: '2.5 MB' },
    { id: 5, title: 'Blockchain Integration Research', author: 'R&D Division', category: 'research', type: 'PDF', pages: 48, date: '2025-10-18', size: '4.1 MB' },
    { id: 6, title: 'KYC/AML Best Practices Guide', author: 'Compliance Division', category: 'regulatory', type: 'PDF', pages: 55, date: '2025-08-05', size: '2.9 MB' },
    { id: 7, title: 'Institutional Investment Prospectus', author: 'Investment Banking', category: 'whitepaper', type: 'PDF', pages: 96, date: '2025-07-22', size: '5.6 MB' },
    { id: 8, title: 'Risk Management Framework Q4', author: 'Risk Management', category: 'policy', type: 'PDF', pages: 41, date: '2025-12-01', size: '2.1 MB' },
    { id: 9, title: 'DeFi Market Analysis 2025', author: 'Research & Analytics', category: 'research', type: 'PDF', pages: 72, date: '2025-11-28', size: '6.3 MB' },
    { id: 10, title: 'Annual Sustainability Report', author: 'Corporate Affairs', category: 'annual-report', type: 'PDF', pages: 58, date: '2025-12-20', size: '4.7 MB' },
    { id: 11, title: 'Cross-Border Payment Standards', author: 'International Operations', category: 'regulatory', type: 'PDF', pages: 39, date: '2025-05-14', size: '1.6 MB' },
    { id: 12, title: 'Private Placement Memorandum', author: 'Capital Markets', category: 'whitepaper', type: 'PDF', pages: 110, date: '2025-04-30', size: '7.2 MB' }
  ],

  libraryPartners: [
    { id: 1, name: 'ISO Standards Authority', initials: 'ISO', description: 'International standards body providing financial services certification and compliance frameworks.', tags: ['Standards', 'Certification', 'Compliance'] },
    { id: 2, name: 'Global Financial Press', initials: 'GFP', description: 'Leading publisher of financial industry research, market analysis reports, and regulatory commentary.', tags: ['Research', 'Publications', 'Analysis'] },
    { id: 3, name: 'Blockchain Research Institute', initials: 'BRI', description: 'Independent research organization focused on distributed ledger technology and digital asset policy.', tags: ['Blockchain', 'Research', 'DLT'] },
    { id: 4, name: 'Meridian Legal Publishing', initials: 'MLP', description: 'Provider of legal and regulatory documentation for international banking and finance.', tags: ['Legal', 'Regulatory', 'Banking'] },
    { id: 5, name: 'FinTech Analytics Group', initials: 'FAG', description: 'Data-driven analytics firm specializing in fintech trends, digital banking, and payment innovations.', tags: ['FinTech', 'Analytics', 'Payments'] },
    { id: 6, name: 'Central Banking Publications', initials: 'CBP', description: 'Publisher of central banking policy documents, monetary policy research, and economic forecasts.', tags: ['Central Banking', 'Policy', 'Economics'] },
    { id: 7, name: 'Digital Asset Compliance Corp', initials: 'DAC', description: 'Specialist publisher of cryptocurrency compliance guides, AML frameworks, and regulatory updates.', tags: ['Crypto', 'AML', 'Compliance'] },
    { id: 8, name: 'Sovereign Wealth Review', initials: 'SWR', description: 'Publishing arm covering sovereign wealth fund strategies, institutional investment, and asset management.', tags: ['Sovereign Wealth', 'Investment', 'Assets'] }
  ],

  async initLibrary() {
    this.currentPage = 'library';
    this.renderLibraryRecords(this.libraryRecords);
    this.renderLibraryPartners(this.libraryPartners);
  },

  switchLibraryTab(tab) {
    document.querySelectorAll('.library-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.library-panel').forEach(p => p.classList.remove('active'));
    document.querySelector(`.library-tab[data-tab="${tab}"]`).classList.add('active');
    document.getElementById(`panel-${tab}`).classList.add('active');
  },

  filterLibrary() {
    const search = (document.getElementById('library-search').value || '').toLowerCase();
    const category = document.getElementById('library-category').value;
    const filtered = this.libraryRecords.filter(r => {
      const matchSearch = !search || r.title.toLowerCase().includes(search) || r.author.toLowerCase().includes(search);
      const matchCat = !category || r.category === category;
      return matchSearch && matchCat;
    });
    this.renderLibraryRecords(filtered);
  },

  filterPartners() {
    const search = (document.getElementById('partner-search').value || '').toLowerCase();
    const filtered = this.libraryPartners.filter(p => {
      return !search || p.name.toLowerCase().includes(search) || p.description.toLowerCase().includes(search) || p.tags.some(t => t.toLowerCase().includes(search));
    });
    this.renderLibraryPartners(filtered);
  },

  renderLibraryRecords(records) {
    const grid = document.getElementById('library-records-grid');
    if (!grid) return;
    if (records.length === 0) {
      grid.innerHTML = '<div class="library-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><p>No publications found</p></div>';
      return;
    }
    grid.innerHTML = records.map(r => `
      <div class="library-card">
        <div class="library-card-cover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>
          <span class="library-card-type">${r.type}</span>
        </div>
        <div class="library-card-body">
          <div class="library-card-title">${r.title}</div>
          <div class="library-card-author">${r.author}</div>
          <div class="library-card-meta">
            <span>${r.pages} pages</span>
            <span>${r.size}</span>
            <span>${r.date}</span>
          </div>
          <div class="library-card-actions">
            <button class="btn btn-ghost btn-sm" onclick="Components.toast('Opening ${r.title.replace(/'/g, "\\'")}...', 'info')">View</button>
            <button class="btn btn-primary btn-sm" onclick="Components.toast('Downloading ${r.title.replace(/'/g, "\\'")}...', 'info')">Download</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  renderLibraryPartners(partners) {
    const grid = document.getElementById('library-partners-grid');
    if (!grid) return;
    if (partners.length === 0) {
      grid.innerHTML = '<div class="library-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg><p>No partners found</p></div>';
      return;
    }
    grid.innerHTML = partners.map(p => `
      <div class="partner-card">
        <div class="partner-logo">${p.initials}</div>
        <div class="partner-info">
          <h4>${p.name}</h4>
          <p>${p.description}</p>
          <div class="partner-tags">
            ${p.tags.map(t => `<span class="partner-tag">${t}</span>`).join('')}
          </div>
        </div>
      </div>
    `).join('');
  },

  logout() {
    Auth.logout();
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = App;
}
