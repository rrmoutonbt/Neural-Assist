/**
 * whiteLabel.js — JSON-driven white-label configuration system
 * Allows branding, color theming, feature toggling, and symbol customization.
 */

const STORAGE_KEY = 'tt_whitelabel_config';

export const DEFAULT_CONFIG = {
  brand: {
    name: 'GXT Trading Platform',
    shortName: 'GXT',
    logoUrl: '',
    tagline: 'Cognitive Learning & Data Mastery',
    copyrightHolder: 'Adam Earth Equities Trust',
  },
  colors: {
    primary: '#3949ab',
    accent: '#b8860b',
    bull: '#1a8a4a',
    bear: '#c62828',
    background: '#e0f0ff',
    cardBackground: '#ffffff',
    surface: '#f0f7ff',
    text: '#1a2332',
    textMuted: '#546e7a',
    border: '#c8dce8',
  },
  features: {
    showPaperTrading: true,
    showBacktesting: true,
    showAiFeatures: true,
    showScreener: true,
    showAlerts: true,
    showTradeReplay: true,
    showDrawingTools: true,
  },
  symbols: [
    'AAPL', 'TSLA', 'NVDA', 'SPY', 'MSFT', 'AMZN', 'GOOGL', 'META',
    'BTC/USD', 'ETH/USD', 'XRP/USD', 'XAU/USD', 'EUR/USD', 'GBP/USD',
  ],
  chart: {
    defaultTimeframe: '1D',
    defaultChartType: 'candlestick',
    defaultIndicators: ['VOL', 'BB', 'MACD'],
  },
};

/** Deep-merge source into target, returning a new object. */
function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load config from localStorage, falling back to DEFAULT_CONFIG.
 * Missing keys are filled in from defaults via deep merge.
 */
export function loadWhiteLabelConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const merged = deepMerge(DEFAULT_CONFIG, saved);
      window.__ttWhiteLabelConfig = merged;
      return merged;
    }
  } catch (e) {
    console.warn('[whiteLabel] Failed to parse saved config, using defaults:', e);
  }
  window.__ttWhiteLabelConfig = { ...DEFAULT_CONFIG };
  return { ...DEFAULT_CONFIG };
}

/**
 * Apply a config object to the running page.
 *  1. Set CSS custom properties on :root
 *  2. Update document title
 *  3. Update sidebar brand text (if present)
 *  4. Store globally for other modules
 */
export function applyWhiteLabelConfig(config) {
  const root = document.documentElement;

  // --- CSS custom properties ---
  const colorMap = {
    primary:        ['--color-blue'],
    accent:         ['--color-gold'],
    bull:           ['--color-buy', '--color-green'],
    bear:           ['--color-sell', '--color-red'],
    background:     ['--color-bg'],
    cardBackground: ['--color-bg-card'],
    surface:        ['--color-surface'],
    text:           ['--color-text'],
    textMuted:      ['--color-text-muted'],
    border:         ['--color-border'],
  };

  for (const [configKey, cssVars] of Object.entries(colorMap)) {
    const value = config.colors?.[configKey];
    if (value) {
      for (const v of cssVars) {
        root.style.setProperty(v, value);
      }
    }
  }

  // --- Document title ---
  if (config.brand?.name) {
    document.title = config.brand.name;
  }

  // --- Sidebar brand ---
  const brandEl = document.querySelector('.sidebar-brand-text h2');
  if (brandEl && config.brand?.shortName) {
    brandEl.textContent = config.brand.shortName;
  }

  // --- Global reference ---
  window.__ttWhiteLabelConfig = config;
}

/**
 * Persist config to localStorage.
 */
export function saveWhiteLabelConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.__ttWhiteLabelConfig = config;
  } catch (e) {
    console.error('[whiteLabel] Failed to save config:', e);
  }
}

/**
 * Return current config as a formatted JSON string (for file export).
 */
export function exportConfig() {
  const config = window.__ttWhiteLabelConfig || loadWhiteLabelConfig();
  return JSON.stringify(config, null, 2);
}

/**
 * Parse a JSON string, validate minimally, apply and save.
 */
export function importConfig(jsonString) {
  const parsed = JSON.parse(jsonString); // let caller handle parse errors
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Config must be a JSON object');
  }
  const merged = deepMerge(DEFAULT_CONFIG, parsed);
  applyWhiteLabelConfig(merged);
  saveWhiteLabelConfig(merged);
  return merged;
}

/**
 * Reset to factory defaults — clears localStorage and re-applies.
 */
export function resetConfig() {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  applyWhiteLabelConfig(fresh);
  window.__ttWhiteLabelConfig = fresh;
  return fresh;
}

// ─── Settings Panel HTML ─────────────────────────────────────────────────────

/**
 * Return an HTML string containing the white-label settings form.
 * Reads current config for pre-filled values.
 */
export function getWhiteLabelSettingsHTML() {
  const cfg = window.__ttWhiteLabelConfig || loadWhiteLabelConfig();

  const inputStyle = 'width:100%;padding:6px 10px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-surface);color:var(--color-text);font-size:var(--text-sm);box-sizing:border-box;';
  const labelStyle = 'display:block;font-size:var(--text-sm);font-weight:600;margin-bottom:4px;color:var(--color-text);';
  const sectionTitle = 'font-size:var(--text-lg);font-weight:700;margin:0 0 var(--space-4) 0;color:var(--color-gold);';
  const fieldWrap = 'margin-bottom:var(--space-3);';

  // --- Color pickers ---
  const colorLabels = {
    primary: 'Primary (blue)',
    accent: 'Accent (gold)',
    bull: 'Bull / Buy (green)',
    bear: 'Bear / Sell (red)',
    background: 'Background',
    cardBackground: 'Card Background',
    surface: 'Surface',
    text: 'Text',
    textMuted: 'Muted Text',
    border: 'Border',
  };

  const colorInputs = Object.entries(colorLabels)
    .map(([key, label]) => `
      <div style="display:flex;align-items:center;gap:var(--space-2);${fieldWrap}">
        <input type="color" id="wl-color-${key}" value="${cfg.colors[key]}" style="width:36px;height:30px;border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;padding:0;background:none;">
        <label for="wl-color-${key}" style="font-size:var(--text-sm);color:var(--color-text);">${label}</label>
      </div>`)
    .join('');

  // --- Feature toggles ---
  const featureLabels = {
    showPaperTrading: 'Paper Trading',
    showBacktesting: 'Backtesting',
    showAiFeatures: 'AI Features',
    showScreener: 'Screener',
    showAlerts: 'Alerts',
    showTradeReplay: 'Trade Replay',
    showDrawingTools: 'Drawing Tools',
  };

  const featureInputs = Object.entries(featureLabels)
    .map(([key, label]) => `
      <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--text-sm);color:var(--color-text);cursor:pointer;margin-bottom:var(--space-2);">
        <input type="checkbox" id="wl-feat-${key}" ${cfg.features[key] ? 'checked' : ''}>
        ${label}
      </label>`)
    .join('');

  return `
    <div id="wl-settings-panel" style="display:flex;flex-direction:column;gap:var(--space-6);">

      <!-- Brand -->
      <div>
        <h4 style="${sectionTitle}">Brand</h4>
        <div style="${fieldWrap}">
          <label for="wl-brand-name" style="${labelStyle}">Platform Name</label>
          <input type="text" id="wl-brand-name" value="${escAttr(cfg.brand.name)}" style="${inputStyle}">
        </div>
        <div style="${fieldWrap}">
          <label for="wl-brand-short" style="${labelStyle}">Short Name</label>
          <input type="text" id="wl-brand-short" value="${escAttr(cfg.brand.shortName)}" style="${inputStyle}">
        </div>
        <div style="${fieldWrap}">
          <label for="wl-brand-tagline" style="${labelStyle}">Tagline</label>
          <input type="text" id="wl-brand-tagline" value="${escAttr(cfg.brand.tagline)}" style="${inputStyle}">
        </div>
        <div style="${fieldWrap}">
          <label for="wl-brand-logo" style="${labelStyle}">Logo URL</label>
          <input type="text" id="wl-brand-logo" value="${escAttr(cfg.brand.logoUrl)}" placeholder="https://..." style="${inputStyle}">
        </div>
        <div style="${fieldWrap}">
          <label for="wl-brand-copyright" style="${labelStyle}">Copyright Holder</label>
          <input type="text" id="wl-brand-copyright" value="${escAttr(cfg.brand.copyrightHolder)}" style="${inputStyle}">
        </div>
      </div>

      <!-- Colors -->
      <div>
        <h4 style="${sectionTitle}">Colors</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-2);">
          ${colorInputs}
        </div>
      </div>

      <!-- Features -->
      <div>
        <h4 style="${sectionTitle}">Feature Toggles</h4>
        ${featureInputs}
      </div>

      <!-- Symbols -->
      <div>
        <h4 style="${sectionTitle}">Symbols</h4>
        <label for="wl-symbols" style="${labelStyle}">Comma-separated ticker list</label>
        <textarea id="wl-symbols" rows="3" style="${inputStyle}resize:vertical;">${cfg.symbols.join(', ')}</textarea>
      </div>

      <!-- Actions -->
      <div style="display:flex;flex-wrap:wrap;gap:var(--space-3);padding-top:var(--space-2);">
        <button class="btn btn-primary" id="wl-apply-btn">Apply</button>
        <button class="btn btn-secondary" id="wl-reset-btn">Reset Defaults</button>
        <button class="btn btn-secondary" id="wl-export-btn">Export JSON</button>
        <label class="btn btn-secondary" style="cursor:pointer;margin:0;" for="wl-import-file">Import JSON</label>
        <input type="file" id="wl-import-file" accept=".json" style="display:none;">
      </div>
    </div>
  `;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Escape a string for safe use inside an HTML attribute. */
function escAttr(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Read the settings panel DOM and return a config object.
 * Useful for the Apply button handler.
 */
export function readConfigFromPanel() {
  const val = (id) => document.getElementById(id)?.value?.trim() ?? '';
  const checked = (id) => document.getElementById(id)?.checked ?? false;

  return {
    brand: {
      name: val('wl-brand-name') || DEFAULT_CONFIG.brand.name,
      shortName: val('wl-brand-short') || DEFAULT_CONFIG.brand.shortName,
      logoUrl: val('wl-brand-logo'),
      tagline: val('wl-brand-tagline'),
      copyrightHolder: val('wl-brand-copyright'),
    },
    colors: {
      primary: val('wl-color-primary'),
      accent: val('wl-color-accent'),
      bull: val('wl-color-bull'),
      bear: val('wl-color-bear'),
      background: val('wl-color-background'),
      cardBackground: val('wl-color-cardBackground'),
      surface: val('wl-color-surface'),
      text: val('wl-color-text'),
      textMuted: val('wl-color-textMuted'),
      border: val('wl-color-border'),
    },
    features: {
      showPaperTrading: checked('wl-feat-showPaperTrading'),
      showBacktesting: checked('wl-feat-showBacktesting'),
      showAiFeatures: checked('wl-feat-showAiFeatures'),
      showScreener: checked('wl-feat-showScreener'),
      showAlerts: checked('wl-feat-showAlerts'),
      showTradeReplay: checked('wl-feat-showTradeReplay'),
      showDrawingTools: checked('wl-feat-showDrawingTools'),
    },
    symbols: val('wl-symbols')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    chart: {
      ...(window.__ttWhiteLabelConfig?.chart || DEFAULT_CONFIG.chart),
    },
  };
}
