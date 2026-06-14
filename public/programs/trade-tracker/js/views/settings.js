import { setPageTitle } from '../components/topbar.js';
import { showModal, closeModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { exportTrades, importTrades, clearAllData, resetToSeed } from '../store.js';
import { state } from '../state.js';
import { loadWhiteLabelConfig, applyWhiteLabelConfig, saveWhiteLabelConfig, resetConfig, exportConfig, importConfig, getWhiteLabelSettingsHTML, readConfigFromPanel } from '../whiteLabel.js';

export async function render(container) {
  setPageTitle('Settings');

  container.innerHTML = `
    <div class="page-header"><h2>Settings</h2></div>

    <div class="card card--elevated mb-6">
      <div class="card-header"><h3>Data Management</h3></div>
      <div style="display:flex;flex-direction:column;gap:var(--space-4);">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <strong>Export Trades</strong>
            <p class="text-sm text-muted">Download all trade data as a JSON file</p>
          </div>
          <button class="btn btn-secondary" id="export-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
            Export JSON
          </button>
        </div>

        <div class="divider"></div>

        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <strong>Import Trades</strong>
            <p class="text-sm text-muted">Load trade data from a JSON file (replaces current data)</p>
          </div>
          <div>
            <input type="file" id="import-file" accept=".json" style="display:none">
            <button class="btn btn-secondary" id="import-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></svg>
              Import JSON
            </button>
          </div>
        </div>

        <div class="divider"></div>

        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <strong>Reset to Sample Data</strong>
            <p class="text-sm text-muted">Replace all data with generated sample trades</p>
          </div>
          <button class="btn btn-secondary" id="reset-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
            Reset Data
          </button>
        </div>

        <div class="divider"></div>

        <div style="display:flex;align-items:center;justify-content:space-between;">
          <div>
            <strong style="color:var(--color-red);">Clear All Data</strong>
            <p class="text-sm text-muted">Permanently delete all trade data</p>
          </div>
          <button class="btn btn-danger" id="clear-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Clear All
          </button>
        </div>
      </div>
    </div>

    <div class="card card--elevated mb-6">
      <div class="card-header"><h3>Branding &amp; White-Label</h3></div>
      ${getWhiteLabelSettingsHTML()}
      <div style="display:flex;gap:var(--space-3);margin-top:var(--space-4);">
        <button class="btn btn-primary" id="wl-apply-btn">Apply</button>
        <button class="btn btn-secondary" id="wl-reset-btn">Reset</button>
        <button class="btn btn-secondary" id="wl-export-btn">Export Config</button>
        <button class="btn btn-secondary" id="wl-import-btn">Import Config</button>
        <input type="file" id="wl-import-file" accept=".json" style="display:none">
      </div>
    </div>

    <div class="card card--elevated">
      <div class="card-header"><h3>About</h3></div>
      <div style="display:flex;flex-direction:column;gap:var(--space-2);font-size:var(--text-sm);color:var(--color-text-muted);">
        <p><strong>Trade Tracker</strong> v1.0</p>
        <p>Part of the Banc of El Trust International platform.</p>
        <p>Data is stored locally in your browser using localStorage.</p>
        <p>Current trades: <strong class="text-gold">${state.trades.length}</strong></p>
      </div>
    </div>
  `;

  // Export
  document.getElementById('export-btn')?.addEventListener('click', () => {
    const json = exportTrades();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-tracker-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Trades exported successfully', 'success');
  });

  // Import
  document.getElementById('import-btn')?.addEventListener('click', () => {
    document.getElementById('import-file')?.click();
  });

  document.getElementById('import-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importTrades(reader.result);
        showToast(`Imported ${state.trades.length} trades`, 'success');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showToast('Invalid JSON file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });

  // Reset
  document.getElementById('reset-btn')?.addEventListener('click', () => {
    showModal({
      title: 'Reset to Sample Data',
      body: '<p>This will replace all your trade data with generated sample data. Continue?</p>',
      width: '400px',
      actions: [
        { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
        { label: 'Reset', class: 'btn btn-primary', onClick: () => {
          resetToSeed();
          showToast('Data reset to sample trades', 'success');
          closeModal();
          setTimeout(() => window.location.reload(), 500);
        }}
      ]
    });
  });

  // Clear
  document.getElementById('clear-btn')?.addEventListener('click', () => {
    showModal({
      title: 'Clear All Data',
      body: '<p style="color:var(--color-red);">This will permanently delete all trade data. This cannot be undone.</p>',
      width: '400px',
      actions: [
        { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
        { label: 'Delete Everything', class: 'btn btn-danger', onClick: () => {
          clearAllData();
          showToast('All data cleared', 'warning');
          closeModal();
          setTimeout(() => window.location.reload(), 500);
        }}
      ]
    });
  });

  // White-Label: Apply
  document.getElementById('wl-apply-btn')?.addEventListener('click', () => {
    const config = readConfigFromPanel();
    saveWhiteLabelConfig(config);
    applyWhiteLabelConfig(config);
    showToast('Branding applied', 'success');
  });

  // White-Label: Reset
  document.getElementById('wl-reset-btn')?.addEventListener('click', () => {
    showModal({
      title: 'Reset Branding',
      body: '<p>Reset all branding settings to defaults?</p>',
      width: '400px',
      actions: [
        { label: 'Cancel', class: 'btn btn-secondary', onClick: closeModal },
        { label: 'Reset', class: 'btn btn-primary', onClick: () => {
          const config = resetConfig();
          applyWhiteLabelConfig(config);
          showToast('Branding reset to defaults', 'success');
          closeModal();
          setTimeout(() => window.location.reload(), 500);
        }}
      ]
    });
  });

  // White-Label: Export
  document.getElementById('wl-export-btn')?.addEventListener('click', () => {
    const json = exportConfig();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `white-label-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Config exported', 'success');
  });

  // White-Label: Import
  document.getElementById('wl-import-btn')?.addEventListener('click', () => {
    document.getElementById('wl-import-file')?.click();
  });

  document.getElementById('wl-import-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const config = importConfig(reader.result);
        applyWhiteLabelConfig(config);
        showToast('Config imported and applied', 'success');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showToast('Invalid config file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  });
}
