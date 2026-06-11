import { state, subscribe } from '../state.js';
import { setPageTitle } from '../components/topbar.js';
import { renderDataTable } from '../components/dataTable.js';
import { openTradeForm, openCloseTradeModal } from '../components/tradeForm.js';
import { showModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { onViewCleanup } from '../router.js';
import { deleteTrade, getTradeById } from '../store.js';
import { formatPrice, formatDate, formatPnL, formatQuantity } from '../utils/formatters.js';
import { PAIRS } from '../utils/constants.js';

export async function render(container) {
  setPageTitle('Trade Log');

  container.innerHTML = `
    <div class="page-header">
      <h2>Trade Log</h2>
      <button class="btn btn-primary" id="add-trade-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        Add Trade
      </button>
    </div>
    <div class="filter-bar" id="filter-bar">
      <select class="form-select" id="filter-pair">
        <option value="">All Pairs</option>
        ${PAIRS.map(p => `<option value="${p}">${p}</option>`).join('')}
      </select>
      <select class="form-select" id="filter-side">
        <option value="">All Sides</option>
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
      </select>
      <select class="form-select" id="filter-status">
        <option value="">All Status</option>
        <option value="open">Open</option>
        <option value="closed">Closed</option>
      </select>
      <input type="date" class="form-input" id="filter-date-from" placeholder="From">
      <input type="date" class="form-input" id="filter-date-to" placeholder="To">
    </div>
    <div id="trade-table"></div>
  `;

  const columns = [
    { key: 'entryDate', label: 'Date', render: (t) => formatDate(t.entryDate) },
    { key: 'pair', label: 'Pair', render: (t) => `<strong>${t.pair}</strong>` },
    { key: 'side', label: 'Side', render: (t) => `<span class="badge ${t.side === 'buy' ? 'badge-green' : 'badge-red'}">${t.side}</span>` },
    { key: 'type', label: 'Type', render: (t) => t.type },
    { key: 'entryPrice', label: 'Entry', render: (t) => `<span class="font-mono">${formatPrice(t.entryPrice, t.pair)}</span>` },
    { key: 'exitPrice', label: 'Exit', render: (t) => t.exitPrice ? `<span class="font-mono">${formatPrice(t.exitPrice, t.pair)}</span>` : '-' },
    { key: 'quantity', label: 'Qty', render: (t) => `<span class="font-mono">${formatQuantity(t.quantity)}</span>` },
    { key: 'realizedPnL', label: 'P&L', align: 'right', render: (t) => {
      if (t.status !== 'closed') return '<span class="text-muted">-</span>';
      const pnl = formatPnL(t.realizedPnL);
      return `<span class="font-mono ${pnl.class}">${pnl.text}</span>`;
    }},
    { key: 'status', label: 'Status', render: (t) => `<span class="badge ${t.status === 'open' ? 'badge-blue' : 'badge-gray'}">${t.status}</span>` },
    { label: 'Actions', width: '120px', render: (t) => `
      <div class="table-actions">
        <button class="btn btn-ghost btn-icon btn-sm" data-action="edit" data-id="${t.id}" title="Edit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        ${t.status === 'open' ? `
          <button class="btn btn-ghost btn-icon btn-sm" data-action="close" data-id="${t.id}" title="Close trade">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-green)" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
          </button>
        ` : ''}
        <button class="btn btn-ghost btn-icon btn-sm" data-action="delete" data-id="${t.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-red)" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      </div>
    ` }
  ];

  function getFilteredTrades() {
    let trades = [...state.trades];
    const f = state.filters;

    if (f.pair) trades = trades.filter(t => t.pair === f.pair);
    if (f.side) trades = trades.filter(t => t.side === f.side);
    if (f.status) trades = trades.filter(t => t.status === f.status);
    if (f.dateFrom) trades = trades.filter(t => t.entryDate >= f.dateFrom);
    if (f.dateTo) trades = trades.filter(t => t.entryDate <= f.dateTo + 'T23:59:59');
    if (f.search) {
      const q = f.search.toLowerCase();
      trades = trades.filter(t =>
        t.pair.toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q) ||
        (t.tags || []).some(tag => tag.toLowerCase().includes(q))
      );
    }

    // Sort
    trades.sort((a, b) => {
      let va = a[state.sortKey], vb = b[state.sortKey];
      if (state.sortKey === 'entryDate' || state.sortKey === 'exitDate') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      }
      if (typeof va === 'string') return state.sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return state.sortDir === 'asc' ? (va || 0) - (vb || 0) : (vb || 0) - (va || 0);
    });

    return trades;
  }

  function renderTable() {
    const filtered = getFilteredTrades();
    const page = state.currentPage;
    const pageSize = state.pageSize;
    const start = (page - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);

    const tableContainer = document.getElementById('trade-table');
    if (!tableContainer) return;

    renderDataTable(tableContainer, {
      columns,
      data: pageData,
      page,
      pageSize,
      totalItems: filtered.length,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      onPageChange: (p) => { state.currentPage = p; renderTable(); },
      onSort: (key) => {
        if (state.sortKey === key) {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sortKey = key;
          state.sortDir = 'desc';
        }
        state.currentPage = 1;
        renderTable();
      }
    });

    // Action handlers
    tableContainer.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        const trade = getTradeById(id);
        if (!trade) return;

        if (action === 'edit') {
          openTradeForm(trade, renderTable);
        } else if (action === 'close') {
          openCloseTradeModal(trade, renderTable);
        } else if (action === 'delete') {
          showModal({
            title: 'Delete Trade',
            body: `<p>Are you sure you want to delete this <strong>${trade.pair}</strong> ${trade.side} trade?</p><p style="margin-top:var(--space-2);color:var(--color-text-muted);font-size:var(--text-sm);">This action cannot be undone.</p>`,
            width: '400px',
            actions: [
              { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
              { label: 'Delete', class: 'btn btn-danger', onClick: () => {
                deleteTrade(id);
                showToast('Trade deleted', 'success');
                closeModal();
                renderTable();
              }}
            ]
          });
        }
      });
    });
  }

  // Filter handlers
  const updateFilter = (key, value) => {
    state.filters = { ...state.filters, [key]: value };
    state.currentPage = 1;
    renderTable();
  };

  document.getElementById('filter-pair')?.addEventListener('change', (e) => updateFilter('pair', e.target.value));
  document.getElementById('filter-side')?.addEventListener('change', (e) => updateFilter('side', e.target.value));
  document.getElementById('filter-status')?.addEventListener('change', (e) => updateFilter('status', e.target.value));
  document.getElementById('filter-date-from')?.addEventListener('change', (e) => updateFilter('dateFrom', e.target.value));
  document.getElementById('filter-date-to')?.addEventListener('change', (e) => updateFilter('dateTo', e.target.value));

  document.getElementById('add-trade-btn')?.addEventListener('click', () => {
    openTradeForm(null, renderTable);
  });

  renderTable();

  const unsub = subscribe('filters', () => { state.currentPage = 1; renderTable(); });
  onViewCleanup(unsub);
}
