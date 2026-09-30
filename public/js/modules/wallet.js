/* ========================================
   WALLET MODULE
   Multi-currency wallet functionality
   ======================================== */

const Wallet = (function() {
  'use strict';

  // State
  let state = {
    assets: [],
    selectedAsset: null,
    transactions: [],
    addresses: {},
    staking: {
      active: [],
      pending: [],
      rewards: 0
    }
  };

  // DOM cache
  let elements = {};

  // Initialize
  function init() {
    cacheElements();
    bindEvents();
    loadWalletData();
  }

  function cacheElements() {
    elements = {
      assetsList: document.getElementById('assets-list'),
      assetDetail: document.getElementById('asset-detail'),
      sendForm: document.getElementById('send-form'),
      receiveModal: document.getElementById('receive-modal'),
      swapForm: document.getElementById('swap-form'),
      stakeForm: document.getElementById('stake-form'),
      transactionHistory: document.getElementById('transaction-history'),
      totalBalance: document.getElementById('total-balance')
    };
  }

  function bindEvents() {
    // Asset selection
    elements.assetsList?.addEventListener('click', handleAssetClick);

    // Send form
    elements.sendForm?.addEventListener('submit', handleSend);

    // Swap form
    elements.swapForm?.addEventListener('submit', handleSwap);

    // Stake form
    elements.stakeForm?.addEventListener('submit', handleStake);

    // Quick action buttons
    document.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
    });

    // Address copy
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy));
    });
  }

  function handleAssetClick(e) {
    const row = e.target.closest('[data-asset]');
    if (row) {
      selectAsset(row.dataset.asset);
    }
  }

  function selectAsset(symbol) {
    state.selectedAsset = state.assets.find(a => a.symbol === symbol);
    
    // Update UI
    document.querySelectorAll('[data-asset]').forEach(el => {
      el.classList.toggle('active', el.dataset.asset === symbol);
    });
    
    renderAssetDetail();
    loadAssetTransactions(symbol);
  }

  function handleQuickAction(action) {
    switch (action) {
      case 'send':
        openSendModal();
        break;
      case 'receive':
        openReceiveModal();
        break;
      case 'swap':
        openSwapModal();
        break;
      case 'stake':
        openStakeModal();
        break;
    }
  }

  async function handleSend(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      asset: formData.get('asset') || state.selectedAsset?.symbol,
      address: formData.get('address'),
      amount: parseFloat(formData.get('amount')),
      memo: formData.get('memo')
    };

    if (!data.address || !data.amount) {
      Components.toast('Please fill in all required fields', 'error');
      return;
    }

    if (!validateAddress(data.address, data.asset)) {
      Components.toast('Invalid address format', 'error');
      return;
    }

    const asset = state.assets.find(a => a.symbol === data.asset);
    if (data.amount > asset?.balance) {
      Components.toast('Insufficient balance', 'error');
      return;
    }

    try {
      await simulateTransaction('send', data);
      Components.toast(`Sent ${data.amount} ${data.asset} successfully`, 'success');
      closeModals();
      loadWalletData();
    } catch (error) {
      Components.toast('Transaction failed: ' + error.message, 'error');
    }
  }

  async function handleSwap(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      fromAsset: formData.get('fromAsset'),
      toAsset: formData.get('toAsset'),
      amount: parseFloat(formData.get('amount'))
    };

    if (data.fromAsset === data.toAsset) {
      Components.toast('Cannot swap same asset', 'error');
      return;
    }

    const fromAsset = state.assets.find(a => a.symbol === data.fromAsset);
    if (data.amount > fromAsset?.balance) {
      Components.toast('Insufficient balance', 'error');
      return;
    }

    try {
      await simulateTransaction('swap', data);
      Components.toast('Swap completed successfully', 'success');
      closeModals();
      loadWalletData();
    } catch (error) {
      Components.toast('Swap failed: ' + error.message, 'error');
    }
  }

  async function handleStake(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      asset: formData.get('asset') || 'XRP',
      amount: parseFloat(formData.get('amount')),
      duration: formData.get('duration')
    };

    const asset = state.assets.find(a => a.symbol === data.asset);
    if (data.amount > asset?.balance) {
      Components.toast('Insufficient balance', 'error');
      return;
    }

    try {
      await simulateTransaction('stake', data);
      Components.toast(`Staked ${data.amount} ${data.asset} successfully`, 'success');
      closeModals();
      loadWalletData();
    } catch (error) {
      Components.toast('Staking failed: ' + error.message, 'error');
    }
  }

  function simulateTransaction(type, data) {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.05) {
          resolve({ txId: 'TX-' + Date.now() });
        } else {
          reject(new Error('Network error'));
        }
      }, 1000);
    });
  }

  function validateAddress(address, asset) {
    const patterns = {
      XRP: /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/,
      BTC: /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/,
      ETH: /^0x[a-fA-F0-9]{40}$/,
      USDT: /^0x[a-fA-F0-9]{40}$/
    };
    return patterns[asset]?.test(address) ?? true;
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      Components.toast('Address copied to clipboard', 'success');
    });
  }

  function loadWalletData() {
    // Load assets
    state.assets = MockData.generateCryptoHoldings();
    renderAssets();

    // Calculate total balance
    const total = state.assets.reduce((sum, asset) => sum + asset.value, 0);
    if (elements.totalBalance) {
      elements.totalBalance.textContent = Utils.formatCurrency(total);
    }

    // Generate addresses
    state.assets.forEach(asset => {
      state.addresses[asset.symbol] = generateAddress(asset.symbol);
    });

    // Load staking data
    loadStakingData();
  }

  function generateAddress(asset) {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let address = '';
    
    switch (asset) {
      case 'XRP':
        address = 'r' + Array.from({ length: 33 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        break;
      case 'BTC':
        address = 'bc1' + Array.from({ length: 39 }, () => chars.toLowerCase()[Math.floor(Math.random() * chars.length)]).join('');
        break;
      case 'ETH':
      case 'USDT':
        address = '0x' + Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');
        break;
      default:
        address = Array.from({ length: 42 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }
    
    return address;
  }

  function renderAssets() {
    if (!elements.assetsList) return;

    const esc = typeof Utils !== 'undefined' && Utils.escapeHtml ? Utils.escapeHtml : (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    elements.assetsList.innerHTML = state.assets.map(asset => `
      <div class="asset-row ${asset.symbol === state.selectedAsset?.symbol ? 'active' : ''}" data-asset="${esc(asset.symbol)}">
        <div class="asset-info">
          <span class="asset-icon">${esc(asset.icon || '🪙')}</span>
          <div>
            <div class="asset-symbol">${esc(asset.symbol)}</div>
            <div class="asset-name text-muted">${esc(asset.name)}</div>
          </div>
        </div>
        <div class="asset-balance">
          <div class="balance-value font-mono">${asset.balance.toLocaleString()}</div>
          <div class="balance-usd text-muted">${Utils.formatCurrency(asset.value)}</div>
        </div>
        <div class="asset-change ${asset.change24h >= 0 ? 'text-green' : 'text-red'}">
          ${asset.change24h >= 0 ? '↑' : '↓'} ${Math.abs(asset.change24h).toFixed(2)}%
        </div>
      </div>
    `).join('');

    // Select first asset by default
    if (!state.selectedAsset && state.assets.length) {
      selectAsset(state.assets[0].symbol);
    }
  }

  function renderAssetDetail() {
    if (!elements.assetDetail || !state.selectedAsset) return;

    const asset = state.selectedAsset;
    const address = state.addresses[asset.symbol];

    const esc2 = typeof Utils !== 'undefined' && Utils.escapeHtml ? Utils.escapeHtml : (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    elements.assetDetail.innerHTML = `
      <div class="asset-detail-header">
        <div class="asset-icon-lg">${esc2(asset.icon || '🪙')}</div>
        <div>
          <h2>${esc2(asset.symbol)}</h2>
          <p class="text-muted">${esc2(asset.name)}</p>
        </div>
      </div>
      <div class="asset-detail-balance">
        <div class="balance-large font-mono">${asset.balance.toLocaleString()} ${esc2(asset.symbol)}</div>
        <div class="balance-usd-large">${Utils.formatCurrency(asset.value)}</div>
      </div>
      <div class="asset-detail-address">
        <div class="address-label">Your ${esc2(asset.symbol)} Address</div>
        <div class="address-value">
          <code>${esc2(address)}</code>
          <button class="btn btn-ghost btn-sm" data-copy="${esc2(address)}">Copy</button>
        </div>
      </div>
      <div class="asset-detail-actions">
        <button class="btn btn-primary" data-action="send">Send</button>
        <button class="btn btn-secondary" data-action="receive">Receive</button>
        <button class="btn btn-secondary" data-action="swap">Swap</button>
      </div>
    `;

    // Rebind copy buttons
    elements.assetDetail.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => copyToClipboard(btn.dataset.copy));
    });

    // Rebind action buttons
    elements.assetDetail.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleQuickAction(btn.dataset.action));
    });
  }

  function loadAssetTransactions(symbol) {
    const transactions = MockData.generateTransactions(10).map(tx => ({
      ...tx,
      asset: symbol
    }));
    state.transactions = transactions;
    renderTransactions();
  }

  function renderTransactions() {
    if (!elements.transactionHistory) return;

    elements.transactionHistory.innerHTML = state.transactions.map(tx => `
      <div class="transaction-row">
        <div class="tx-icon ${tx.type}">
          ${tx.type === 'send' ? '↑' : tx.type === 'receive' ? '↓' : '↔'}
        </div>
        <div class="tx-info">
          <div class="tx-type">${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}</div>
          <div class="tx-date text-muted">${Utils.formatDate(tx.date)}</div>
        </div>
        <div class="tx-amount ${tx.type === 'receive' ? 'text-green' : ''}">
          ${tx.type === 'receive' ? '+' : '-'}${Math.abs(tx.amount).toLocaleString()} ${tx.asset || 'XRP'}
        </div>
        <div class="tx-status">
          ${Components.badge(tx.status, tx.status === 'completed' ? 'success' : 'warning')}
        </div>
      </div>
    `).join('');
  }

  function loadStakingData() {
    state.staking = {
      active: [
        { asset: 'XRP', amount: 500000, apy: 4.5, endDate: '2026-03-15', rewards: 1875 },
        { asset: 'ETH', amount: 32, apy: 5.2, endDate: '2026-06-01', rewards: 0.42 }
      ],
      pending: [],
      rewards: 42850
    };
  }

  function openSendModal() {
    // Modal logic would go here
  }

  function openReceiveModal() {
    // Modal logic would go here
  }

  function openSwapModal() {
    // Modal logic would go here
  }

  function openStakeModal() {
    // Modal logic would go here
  }

  function closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('active');
    });
  }

  // Public API
  return {
    init,
    selectAsset,
    getState: () => ({ ...state }),
    getAddress: (symbol) => state.addresses[symbol]
  };
})();

// Auto-initialize if on wallet page
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('wallet-container') || window.location.pathname.includes('wallet')) {
    Wallet.init();
  }
});
