/* ========================================
   COMPLIANCE MODULE
   Compliance and KYC functionality
   ======================================== */

const Compliance = (function() {
  'use strict';

  // State
  let state = {
    kycQueue: [],
    flaggedTransactions: [],
    complianceScore: 94.7,
    isoStandards: [],
    alerts: [],
    auditLog: []
  };

  // DOM cache
  let elements = {};

  // Initialize
  function init() {
    cacheElements();
    bindEvents();
    loadComplianceData();
  }

  function cacheElements() {
    elements = {
      kycQueue: document.getElementById('kyc-queue'),
      kycDetail: document.getElementById('kyc-detail'),
      flaggedList: document.getElementById('flagged-transactions'),
      alertsPanel: document.getElementById('alerts-panel'),
      auditLog: document.getElementById('audit-log'),
      scoreDisplay: document.getElementById('compliance-score'),
      isoCards: document.getElementById('iso-standards')
    };
  }

  function bindEvents() {
    // KYC queue item selection
    elements.kycQueue?.addEventListener('click', handleKycSelect);

    // KYC actions
    document.querySelectorAll('[data-kyc-action]').forEach(btn => {
      btn.addEventListener('click', handleKycAction);
    });

    // Transaction review
    elements.flaggedList?.addEventListener('click', handleTransactionReview);

    // Filters
    document.querySelectorAll('[data-filter]').forEach(select => {
      select.addEventListener('change', handleFilter);
    });
  }

  function handleKycSelect(e) {
    const item = e.target.closest('[data-kyc-id]');
    if (item) {
      selectKycApplication(item.dataset.kycId);
    }
  }

  function handleKycAction(e) {
    const action = e.target.dataset.kycAction;
    const kycId = e.target.dataset.kycId || state.selectedKyc?.id;
    
    if (!kycId) return;

    switch (action) {
      case 'approve':
        approveKyc(kycId);
        break;
      case 'reject':
        rejectKyc(kycId);
        break;
      case 'request-info':
        requestMoreInfo(kycId);
        break;
    }
  }

  function handleTransactionReview(e) {
    const reviewBtn = e.target.closest('[data-review-tx]');
    if (reviewBtn) {
      openTransactionReview(reviewBtn.dataset.reviewTx);
    }
  }

  function handleFilter(e) {
    const filterType = e.target.dataset.filter;
    const value = e.target.value;
    applyFilter(filterType, value);
  }

  function loadComplianceData() {
    // Load KYC queue
    state.kycQueue = MockData.generateKycQueue ? MockData.generateKycQueue() : generateMockKycQueue();
    renderKycQueue();

    // Load flagged transactions
    state.flaggedTransactions = generateMockFlaggedTransactions();
    renderFlaggedTransactions();

    // Load ISO standards
    state.isoStandards = generateMockIsoStandards();
    renderIsoStandards();

    // Load alerts
    state.alerts = generateMockAlerts();
    renderAlerts();

    // Update score
    if (elements.scoreDisplay) {
      elements.scoreDisplay.textContent = state.complianceScore.toFixed(1) + '%';
    }
  }

  function generateMockKycQueue() {
    return [
      {
        id: 'KYC-001',
        name: 'James Mitchell',
        type: 'Personal',
        riskLevel: 'low',
        submittedAt: new Date(Date.now() - 2 * 3600000),
        documents: { submitted: 3, required: 3 },
        status: 'pending'
      },
      {
        id: 'KYC-002',
        name: 'TechCorp Industries LLC',
        type: 'Business',
        riskLevel: 'medium',
        submittedAt: new Date(Date.now() - 4 * 3600000),
        documents: { submitted: 5, required: 6 },
        status: 'pending'
      },
      {
        id: 'KYC-003',
        name: 'Global Holdings SA',
        type: 'Institutional',
        riskLevel: 'high',
        submittedAt: new Date(Date.now() - 24 * 3600000),
        documents: { submitted: 8, required: 10 },
        status: 'review'
      }
    ];
  }

  function generateMockFlaggedTransactions() {
    return [
      {
        id: 'TXN-847291',
        type: 'Wire Transfer',
        amount: 2450000,
        severity: 'critical',
        reason: 'Large transaction, high-risk jurisdiction',
        flaggedAt: new Date(Date.now() - 3600000)
      },
      {
        id: 'TXN-847285',
        type: 'Crypto Transfer',
        amount: 890000,
        severity: 'high',
        reason: 'Unusual pattern detected',
        flaggedAt: new Date(Date.now() - 2 * 3600000)
      },
      {
        id: 'TXN-847278',
        type: 'ACH Transfer',
        amount: 125000,
        severity: 'medium',
        reason: 'Velocity threshold exceeded',
        flaggedAt: new Date(Date.now() - 4 * 3600000)
      }
    ];
  }

  function generateMockIsoStandards() {
    return [
      { code: 'ISO 20022', name: 'Financial Messaging', status: 'compliant', compliance: 100 },
      { code: 'ISO 17442', name: 'LEI Standards', status: 'compliant', compliance: 98 },
      { code: 'ISO 10383', name: 'Market Identifiers', status: 'compliant', compliance: 100 },
      { code: 'ISO 27001', name: 'Info Security', status: 'warning', compliance: 85 }
    ];
  }

  function generateMockAlerts() {
    return [
      { type: 'critical', message: 'High-value transaction requires review', time: new Date() },
      { type: 'warning', message: 'ISO 27001 renewal due in 6 weeks', time: new Date(Date.now() - 3600000) },
      { type: 'info', message: 'Daily compliance report generated', time: new Date(Date.now() - 2 * 3600000) }
    ];
  }

  function renderKycQueue() {
    if (!elements.kycQueue) return;

    const esc = typeof Utils !== 'undefined' && Utils.escapeHtml ? Utils.escapeHtml : (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    elements.kycQueue.innerHTML = state.kycQueue.map(kyc => `
      <div class="kyc-queue-item" data-kyc-id="${esc(kyc.id)}">
        <div class="applicant-avatar">${esc(kyc.name).split(' ').map(n => n[0]).join('')}</div>
        <div>
          <div class="font-semibold">${esc(kyc.name)}</div>
          <div class="text-sm text-muted">${esc(kyc.type)} Account • Applied ${Utils.formatRelativeTime(kyc.submittedAt)}</div>
        </div>
        <div><span class="risk-score ${esc(kyc.riskLevel)}">${esc(kyc.riskLevel).charAt(0).toUpperCase() + esc(kyc.riskLevel).slice(1)} Risk</span></div>
        <div class="text-sm text-muted">Documents: ${kyc.documents.submitted}/${kyc.documents.required}</div>
        <div class="flex gap-2">
          <button class="btn btn-primary btn-sm" data-kyc-action="review">Review</button>
        </div>
      </div>
    `).join('');
  }

  function renderFlaggedTransactions() {
    if (!elements.flaggedList) return;

    const esc2 = typeof Utils !== 'undefined' && Utils.escapeHtml ? Utils.escapeHtml : (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    elements.flaggedList.innerHTML = state.flaggedTransactions.map(tx => `
      <div class="flagged-row">
        <div><span class="severity-badge ${esc2(tx.severity)}">${esc2(tx.severity)}</span></div>
        <div>
          <div class="font-mono text-sm">${esc2(tx.id)}</div>
          <div class="text-xs text-muted">${esc2(tx.type)}</div>
        </div>
        <div class="font-mono">${Utils.formatCurrency(tx.amount)}</div>
        <div class="text-sm">${esc2(tx.reason)}</div>
        <div><button class="btn btn-primary btn-sm" data-review-tx="${esc2(tx.id)}">Review</button></div>
      </div>
    `).join('');
  }

  function renderIsoStandards() {
    if (!elements.isoCards) return;

    elements.isoCards.innerHTML = state.isoStandards.map(iso => `
      <div class="iso-card">
        <div class="flex justify-between items-start mb-4">
          <div>
            <div class="font-semibold">${iso.code}</div>
            <div class="text-xs text-muted">${iso.name}</div>
          </div>
          <span class="badge badge-${iso.status === 'compliant' ? 'success' : 'warning'}">${iso.status === 'compliant' ? 'Active' : 'Review'}</span>
        </div>
        <div class="iso-status ${iso.status === 'compliant' ? 'compliant' : 'warning'} mb-2">
          <span>${iso.status === 'compliant' ? '✓' : '⚠'}</span>
          <span class="font-medium">${iso.status === 'compliant' ? 'Compliant' : 'Pending Renewal'}</span>
        </div>
        <div class="progress mb-2">
          <div class="progress-bar" style="width: ${iso.compliance}%;"></div>
        </div>
        <div class="text-xs text-muted">${iso.compliance}% compliance</div>
      </div>
    `).join('');
  }

  function renderAlerts() {
    if (!elements.alertsPanel) return;

    elements.alertsPanel.innerHTML = state.alerts.map(alert => `
      <div class="admin-alert ${alert.type}">
        <div class="admin-alert-icon">${alert.type === 'critical' ? '🚨' : alert.type === 'warning' ? '⚠️' : 'ℹ️'}</div>
        <div class="admin-alert-content">
          <div class="admin-alert-message">${alert.message}</div>
          <div class="text-xs text-muted mt-1">${Utils.formatRelativeTime(alert.time)}</div>
        </div>
      </div>
    `).join('');
  }

  function selectKycApplication(kycId) {
    state.selectedKyc = state.kycQueue.find(k => k.id === kycId);
    
    document.querySelectorAll('[data-kyc-id]').forEach(el => {
      el.classList.toggle('active', el.dataset.kycId === kycId);
    });

    renderKycDetail();
  }

  function renderKycDetail() {
    if (!elements.kycDetail || !state.selectedKyc) return;

    const kyc = state.selectedKyc;
    const esc3 = typeof Utils !== 'undefined' && Utils.escapeHtml ? Utils.escapeHtml : (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    elements.kycDetail.innerHTML = `
      <h3 class="text-lg font-semibold mb-4">Selected: ${esc3(kyc.name)}</h3>
      <div class="detail-section">
        <div class="text-sm text-muted mb-2">Application Details</div>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div><span class="text-muted">Type:</span></div>
          <div>${kyc.type}</div>
          <div><span class="text-muted">Submitted:</span></div>
          <div>${Utils.formatDate(kyc.submittedAt)}</div>
          <div><span class="text-muted">Risk Level:</span></div>
          <div><span class="risk-score ${kyc.riskLevel}">${kyc.riskLevel}</span></div>
        </div>
      </div>
      <div class="flex gap-2 mt-4">
        <button class="btn btn-success flex-1" data-kyc-action="approve" data-kyc-id="${kyc.id}">Approve</button>
        <button class="btn btn-danger flex-1" data-kyc-action="reject" data-kyc-id="${kyc.id}">Reject</button>
      </div>
      <button class="btn btn-ghost w-full mt-2" data-kyc-action="request-info" data-kyc-id="${kyc.id}">Request More Info</button>
    `;

    // Rebind action buttons
    elements.kycDetail.querySelectorAll('[data-kyc-action]').forEach(btn => {
      btn.addEventListener('click', handleKycAction);
    });
  }

  async function approveKyc(kycId) {
    try {
      await simulateApiCall();
      state.kycQueue = state.kycQueue.filter(k => k.id !== kycId);
      renderKycQueue();
      logAuditEvent('KYC_APPROVE', kycId);
      Components.toast('Application approved successfully', 'success');
    } catch (error) {
      Components.toast('Failed to approve application', 'error');
    }
  }

  async function rejectKyc(kycId) {
    try {
      await simulateApiCall();
      state.kycQueue = state.kycQueue.filter(k => k.id !== kycId);
      renderKycQueue();
      logAuditEvent('KYC_REJECT', kycId);
      Components.toast('Application rejected', 'success');
    } catch (error) {
      Components.toast('Failed to reject application', 'error');
    }
  }

  async function requestMoreInfo(kycId) {
    try {
      await simulateApiCall();
      const kyc = state.kycQueue.find(k => k.id === kycId);
      if (kyc) kyc.status = 'info-requested';
      renderKycQueue();
      logAuditEvent('KYC_INFO_REQUEST', kycId);
      Components.toast('Information request sent', 'success');
    } catch (error) {
      Components.toast('Failed to send request', 'error');
    }
  }

  function openTransactionReview(txId) {
    const tx = state.flaggedTransactions.find(t => t.id === txId);
    if (tx) {
      // Modal logic would go here
    }
  }

  function applyFilter(filterType, value) {
    // Filter logic would go here
  }

  function simulateApiCall() {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() > 0.05) {
          resolve();
        } else {
          reject(new Error('Network error'));
        }
      }, 500);
    });
  }

  function logAuditEvent(action, entityId) {
    state.auditLog.unshift({
      action,
      entityId,
      timestamp: new Date(),
      user: 'Admin'
    });
  }

  // Public API
  return {
    init,
    getState: () => ({ ...state }),
    approveKyc,
    rejectKyc,
    refreshData: loadComplianceData
  };
})();

// Auto-initialize if on compliance/admin page
document.addEventListener('DOMContentLoaded', () => {
  if (window.location.pathname.includes('admin') || window.location.pathname.includes('compliance')) {
    Compliance.init();
  }
});
