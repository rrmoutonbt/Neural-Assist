import { PAIRS, ORDER_TYPES, STRATEGIES } from '../utils/constants.js';
import { validateTradeForm } from '../utils/validators.js';
import { showModal, closeModal, getModalContent } from './modal.js';
import { showToast } from './toast.js';
import { addTrade, updateTrade, closeTrade as closeTrade_fn } from '../store.js';

export function openTradeForm(existingTrade = null, onComplete = null) {
  const isEdit = !!existingTrade;
  const t = existingTrade || {};
  const today = new Date().toISOString().split('T')[0];

  const body = `
    <form id="trade-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Trading Pair *</label>
          <select class="form-select" name="pair">
            <option value="">Select pair...</option>
            ${PAIRS.map(p => `<option value="${p}" ${t.pair === p ? 'selected' : ''}>${p}</option>`).join('')}
          </select>
          <span class="form-error" data-error="pair"></span>
        </div>
        <div class="form-group">
          <label class="form-label">Order Type *</label>
          <select class="form-select" name="type">
            ${ORDER_TYPES.map(o => `<option value="${o}" ${t.type === o ? 'selected' : ''}>${o.charAt(0).toUpperCase() + o.slice(1)}</option>`).join('')}
          </select>
          <span class="form-error" data-error="type"></span>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Side *</label>
        <div class="radio-pills">
          <div class="radio-pill buy ${(!t.side || t.side === 'buy') ? 'active' : ''}" data-side="buy">Buy</div>
          <div class="radio-pill sell ${t.side === 'sell' ? 'active' : ''}" data-side="sell">Sell</div>
        </div>
        <input type="hidden" name="side" value="${t.side || 'buy'}">
        <span class="form-error" data-error="side"></span>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Entry Price *</label>
          <input type="number" class="form-input" name="entryPrice" step="any" placeholder="0.00" value="${t.entryPrice || ''}">
          <span class="form-error" data-error="entryPrice"></span>
        </div>
        <div class="form-group">
          <label class="form-label">Quantity *</label>
          <input type="number" class="form-input" name="quantity" step="any" placeholder="0" value="${t.quantity || ''}">
          <span class="form-error" data-error="quantity"></span>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Entry Date *</label>
          <input type="date" class="form-input" name="entryDate" value="${t.entryDate ? t.entryDate.split('T')[0] : today}">
          <span class="form-error" data-error="entryDate"></span>
        </div>
        <div class="form-group">
          <label class="form-label">Fees ($)</label>
          <input type="number" class="form-input" name="fees" step="any" placeholder="0.00" value="${t.fees || ''}">
          <span class="form-error" data-error="fees"></span>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Exit Price</label>
          <input type="number" class="form-input" name="exitPrice" step="any" placeholder="Leave blank for open trade" value="${t.exitPrice || ''}">
          <span class="form-error" data-error="exitPrice"></span>
        </div>
        <div class="form-group">
          <label class="form-label">Exit Date</label>
          <input type="date" class="form-input" name="exitDate" value="${t.exitDate ? t.exitDate.split('T')[0] : ''}">
          <span class="form-error" data-error="exitDate"></span>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Strategy</label>
          <select class="form-select" name="strategy">
            <option value="">No strategy</option>
            ${STRATEGIES.map(s => `<option value="${s}" ${t.strategy === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Risk/Reward</label>
          <div class="form-row" style="gap:var(--space-2)">
            <input type="number" class="form-input" name="stopLoss" step="any" placeholder="Stop Loss" value="${t.stopLoss || ''}" style="flex:1">
            <input type="number" class="form-input" name="takeProfit" step="any" placeholder="Take Profit" value="${t.takeProfit || ''}" style="flex:1">
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" name="notes" placeholder="Trade notes, strategy, observations...">${t.notes || ''}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Tags (comma-separated)</label>
        <input type="text" class="form-input" name="tags" placeholder="swing, breakout, momentum" value="${(t.tags || []).join(', ')}">
      </div>
    </form>
  `;

  showModal({
    title: isEdit ? 'Edit Trade' : 'Add New Trade',
    body,
    width: '560px',
    actions: [
      { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
      {
        label: isEdit ? 'Save Changes' : 'Add Trade',
        class: 'btn btn-primary',
        onClick: () => handleSubmit(isEdit, existingTrade, onComplete)
      }
    ]
  });

  // Radio pill handlers — use requestAnimationFrame for reliable DOM timing
  requestAnimationFrame(() => {
    const content = getModalContent();
    if (!content) return;

    content.querySelectorAll('.radio-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        content.querySelectorAll('.radio-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const sideInput = content.querySelector('input[name="side"]');
        if (sideInput) sideInput.value = pill.dataset.side;
      });
    });
  });
}

function handleSubmit(isEdit, existingTrade, onComplete) {
  const form = document.getElementById('trade-form');
  if (!form) return;

  const formData = new FormData(form);
  const data = {
    pair: formData.get('pair'),
    side: formData.get('side'),
    type: formData.get('type'),
    entryPrice: formData.get('entryPrice'),
    quantity: formData.get('quantity'),
    entryDate: formData.get('entryDate'),
    exitPrice: formData.get('exitPrice') || null,
    exitDate: formData.get('exitDate') || null,
    fees: formData.get('fees') || 0,
    notes: formData.get('notes') || '',
    tags: (formData.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
    strategy: formData.get('strategy') || '',
    stopLoss: formData.get('stopLoss') || null,
    takeProfit: formData.get('takeProfit') || null
  };

  const { isValid, errors } = validateTradeForm(data);

  // Clear previous errors
  form.querySelectorAll('.form-error').forEach(el => el.textContent = '');
  form.querySelectorAll('.form-group').forEach(el => el.classList.remove('has-error'));

  if (!isValid) {
    for (const [field, msg] of Object.entries(errors)) {
      const errorEl = form.querySelector(`[data-error="${field}"]`);
      if (errorEl) {
        errorEl.textContent = msg;
        errorEl.closest('.form-group')?.classList.add('has-error');
      }
    }
    return;
  }

  if (isEdit) {
    updateTrade(existingTrade.id, data);
    showToast('Trade updated successfully', 'success');
  } else {
    addTrade(data);
    showToast('Trade added successfully', 'success');
  }

  closeModal();
  if (onComplete) onComplete();
}

export function openCloseTradeModal(trade, onComplete) {
  const today = new Date().toISOString().split('T')[0];

  const body = `
    <p style="margin-bottom:var(--space-4);color:var(--color-text-muted);font-size:var(--text-sm);">
      Close <strong>${trade.pair}</strong> ${trade.side.toUpperCase()} position (${trade.quantity} @ ${trade.entryPrice})
    </p>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Exit Price *</label>
        <input type="number" class="form-input" id="close-exit-price" step="any" placeholder="0.00" required>
      </div>
      <div class="form-group">
        <label class="form-label">Exit Date</label>
        <input type="date" class="form-input" id="close-exit-date" value="${today}">
      </div>
    </div>
  `;

  showModal({
    title: 'Close Trade',
    body,
    width: '420px',
    actions: [
      { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
      {
        label: 'Close Trade',
        class: 'btn btn-primary',
        onClick: () => {
          const exitPrice = document.getElementById('close-exit-price')?.value;
          const exitDate = document.getElementById('close-exit-date')?.value;
          if (!exitPrice || isNaN(exitPrice) || Number(exitPrice) <= 0) {
            showToast('Enter a valid exit price', 'error');
            return;
          }
          closeTrade_fn(trade.id, exitPrice, exitDate);
          showToast('Trade closed successfully', 'success');
          closeModal();
          if (onComplete) onComplete();
        }
      }
    ]
  });
}

