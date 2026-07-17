import { navigate } from '../router.js';
import { state, subscribe } from '../state.js';

const NAV_ITEMS = [
  {
    section: 'Main',
    items: [
      { route: '/dashboard', label: 'Dashboard', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
      { route: '/trades', label: 'Trade Log', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>' },
      { route: '/portfolio', label: 'Portfolio', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 00-8 0v2"/></svg>' },
    ]
  },
  {
    section: 'Insights',
    items: [
      { route: '/analytics', label: 'Analytics', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>' },
      { route: '/chart', label: 'Chart', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v3"/><path d="M9 15v5"/><path d="M15 4v5"/><path d="M15 17v3"/><rect x="7" y="7" width="4" height="8" rx="1" fill="currentColor" opacity="0.15"/><rect x="13" y="9" width="4" height="8" rx="1"/><rect x="7" y="7" width="4" height="8" rx="1"/></svg>' },
      { route: '/risk', label: 'Risk Mgmt', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
      { route: '/market-data', label: 'Market Data', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>' },
    ]
  },
  {
    section: 'Compete',
    items: [
      { route: '/paper', label: 'Paper Trading', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>' },
      { route: '/backtest', label: 'Backtesting', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-6 4 4 5-8"/><circle cx="7" cy="14" r="1.5" fill="currentColor" opacity="0.2"/><circle cx="19" cy="4" r="1.5" fill="currentColor" opacity="0.2"/></svg>' },
    ]
  },
  {
    section: 'System',
    items: [
      { route: '/settings', label: 'Settings', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' },
    ]
  }
];

export function renderSidebar(container) {
  const hash = window.location.hash.slice(1) || '/dashboard';

  container.innerHTML = `
    <div class="sidebar-brand">
      <div class="sidebar-brand-icon">TT</div>
      <div class="sidebar-brand-text">
        <h2>Trade Tracker</h2>
        <span>Banc of El</span>
      </div>
    </div>
    ${NAV_ITEMS.map(section => `
      <div class="nav-section">
        <div class="nav-section-title">${section.section}</div>
        ${section.items.map(item => `
          <div class="nav-item ${hash.startsWith(item.route) ? 'active' : ''}" data-route="${item.route}">
            ${item.icon}
            <span class="nav-label">${item.label}</span>
          </div>
        `).join('')}
      </div>
    `).join('')}
    <div class="sidebar-footer">
      <button class="sidebar-toggle" id="sidebar-collapse-btn" title="Toggle sidebar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 19l-7-7 7-7M18 19l-7-7 7-7"/></svg>
      </button>
      <a href="/programs.html" class="nav-item mt-2" style="font-size:0.75rem;color:var(--color-text-dim)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        <span class="nav-label">Back to Programs</span>
      </a>
    </div>
  `;

  // Nav click handlers
  container.querySelectorAll('.nav-item[data-route]').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.route);
      // Close mobile sidebar
      container.classList.remove('open');
      document.querySelector('.sidebar-overlay')?.classList.remove('active');
    });
  });

  // Collapse toggle
  document.getElementById('sidebar-collapse-btn')?.addEventListener('click', () => {
    container.classList.toggle('collapsed');
    state.sidebarCollapsed = container.classList.contains('collapsed');
  });

  // Restore collapsed state
  if (state.sidebarCollapsed) {
    container.classList.add('collapsed');
  }
}
