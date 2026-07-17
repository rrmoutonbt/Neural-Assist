import { registerRoute, initRouter } from './router.js';
import { renderSidebar } from './components/sidebar.js';
import { renderTopbar } from './components/topbar.js';
import { initStore } from './store.js';
import { loadWhiteLabelConfig, applyWhiteLabelConfig } from './whiteLabel.js';

import { render as renderDashboard } from './views/dashboard.js';
import { render as renderTradeLog } from './views/tradeLog.js';
import { render as renderPortfolio } from './views/portfolio.js';
import { render as renderAnalytics } from './views/analytics.js';
import { render as renderSettings } from './views/settings.js';
import { render as renderChartView } from './views/chartView.js?v=5';
import { render as renderRiskManagement } from './views/riskManagement.js';
import { render as renderPaperTrading } from './views/paperTrading.js';
import { render as renderBacktest } from './views/backtestView.js';
import { render as renderMarketData } from './views/marketData.js';

registerRoute('/dashboard', renderDashboard);
registerRoute('/trades', renderTradeLog);
registerRoute('/portfolio', renderPortfolio);
registerRoute('/analytics', renderAnalytics);
registerRoute('/chart', renderChartView);
registerRoute('/risk', renderRiskManagement);
registerRoute('/paper', renderPaperTrading);
registerRoute('/backtest', renderBacktest);
registerRoute('/market-data', renderMarketData);
registerRoute('/settings', renderSettings);

document.addEventListener('DOMContentLoaded', () => {
  initStore();

  const wlConfig = loadWhiteLabelConfig();
  applyWhiteLabelConfig(wlConfig);

  const sidebar = document.getElementById('sidebar');
  const topbar = document.getElementById('topbar');
  const mainContent = document.getElementById('main-content');

  if (sidebar) renderSidebar(sidebar);
  if (topbar) renderTopbar(topbar);
  if (mainContent) initRouter(mainContent);

  if (!window.location.hash || window.location.hash === '#') {
    window.location.hash = '#/dashboard';
  }
});
