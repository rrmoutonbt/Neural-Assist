/* charts.js - Canvas Chart Library */

const Charts = {
  // Color palette
  colors: {
    cyan: '#2a9d5c',
    green: '#1a8a4a',
    red: '#d93025',
    gold: '#2a9d5c',
    purple: '#8b2fc9',
    blue: '#4f52c4',
    gray: '#8a9e90',
    grid: 'rgba(42, 157, 92, 0.1)',
    text: '#607068',
    // Rainbow spectrum for bar/donut charts
    rainbow: ['#ff3333', '#ff8c33', '#ffd633', '#33ff57', '#00e5ff', '#6366f1', '#cc00ff']
  },

  // Create responsive canvas
  createCanvas(container, width, height) {
    const canvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    container.appendChild(canvas);
    return { canvas, ctx, width, height };
  },

  // Line chart
  lineChart(container, data, options = {}) {
    const { width = container.offsetWidth, height = 300, color = this.colors.cyan, showGrid = true, showArea = true } = options;
    const { canvas, ctx } = this.createCanvas(container, width, height);

    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = data.map(d => d.value);
    const min = Math.min(...values) * 0.95;
    const max = Math.max(...values) * 1.05;

    // Draw grid
    if (showGrid) {
      ctx.strokeStyle = this.colors.grid;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Y-axis labels
        const value = max - ((max - min) / 5) * i;
        ctx.fillStyle = this.colors.text;
        ctx.font = '11px Inter';
        ctx.textAlign = 'right';
        ctx.fillText(Utils.formatCurrency(value, 'USD', true), padding.left - 10, y + 4);
      }
    }

    // Calculate points
    const points = data.map((d, i) => ({
      x: padding.left + (chartWidth / (data.length - 1)) * i,
      y: padding.top + chartHeight - ((d.value - min) / (max - min)) * chartHeight
    }));

    // Draw area
    if (showArea) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, height - padding.bottom);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, height - padding.bottom);
      ctx.closePath();
      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
      gradient.addColorStop(0, `${color}40`);
      gradient.addColorStop(1, `${color}00`);
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Draw points
    points.forEach(p => {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // X-axis labels
    ctx.fillStyle = this.colors.text;
    ctx.font = '11px Inter';
    ctx.textAlign = 'center';
    const labelStep = Math.ceil(data.length / 6);
    data.forEach((d, i) => {
      if (i % labelStep === 0) {
        ctx.fillText(Utils.formatDate(d.time, 'short'), points[i].x, height - 15);
      }
    });

    return canvas;
  },

  // Bar chart
  barChart(container, data, options = {}) {
    const { width = container.offsetWidth, height = 300, color = this.colors.cyan } = options;
    const { canvas, ctx } = this.createCanvas(container, width, height);

    const padding = { top: 30, right: 20, bottom: 50, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = data.map(d => d.value);
    const max = Math.max(...values) * 1.1;
    const barWidth = (chartWidth / data.length) * 0.7;
    const barGap = (chartWidth / data.length) * 0.15;

    data.forEach((d, i) => {
      const barHeight = (d.value / max) * chartHeight;
      const x = padding.left + (chartWidth / data.length) * i + barGap;
      const y = height - padding.bottom - barHeight;

      // Draw bar with rainbow gradient
      const barColor = this.colors.rainbow[i % this.colors.rainbow.length];
      const gradient = ctx.createLinearGradient(x, y, x, height - padding.bottom);
      gradient.addColorStop(0, barColor);
      gradient.addColorStop(1, `${barColor}80`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth, barHeight);

      // Value label
      ctx.fillStyle = barColor;
      ctx.font = 'bold 12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(Utils.formatCurrency(d.value, 'USD', true), x + barWidth / 2, y - 8);

      // X-axis label
      ctx.fillStyle = this.colors.text;
      ctx.font = '11px Inter';
      ctx.fillText(d.label, x + barWidth / 2, height - 25);
    });

    return canvas;
  },

  // Donut chart
  donutChart(container, data, options = {}) {
    const { width = 250, height = 250, innerRadius = 0.6 } = options;
    const { canvas, ctx } = this.createCanvas(container, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(centerX, centerY) - 20;
    const inner = radius * innerRadius;

    const total = data.reduce((sum, d) => sum + d.value, 0);
    let currentAngle = -Math.PI / 2;

    data.forEach((d, i) => {
      const sliceAngle = (d.value / total) * Math.PI * 2;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.arc(centerX, centerY, inner, currentAngle + sliceAngle, currentAngle, true);
      ctx.closePath();
      ctx.fillStyle = d.color || this.colors.rainbow[i % this.colors.rainbow.length];
      ctx.fill();

      currentAngle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Utils.formatCurrency(total, 'USD', true), centerX, centerY - 8);
    ctx.font = '12px Inter';
    ctx.fillStyle = this.colors.text;
    ctx.fillText('Total Value', centerX, centerY + 16);

    return canvas;
  },

  // Mini sparkline
  sparkline(container, data, options = {}) {
    const { width = 100, height = 40, color = this.colors.cyan } = options;
    const { canvas, ctx } = this.createCanvas(container, width, height);

    const values = data.map(d => typeof d === 'number' ? d : d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => ({
      x: (i / (values.length - 1)) * width,
      y: height - ((v - min) / range) * height * 0.8 - height * 0.1
    }));

    // Area
    ctx.beginPath();
    ctx.moveTo(0, height);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(width, height);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `${color}30`);
    gradient.addColorStop(1, `${color}00`);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    return canvas;
  },

  // Candlestick chart — Institutional-grade renderer
  // Gradient bodies, rounded corners, glow, Bollinger Bands, SMA overlays,
  // gradient volume bars, current price line with tag.
  candlestick(container, data, options = {}) {
    if (!container) return null;
    container.innerHTML = '';

    const {
      width = container.offsetWidth || 800,
      height = 400,
      bullBody   = '#26a69a',
      bullWick   = '#2ec4a6',
      bearBody   = '#ef5350',
      bearWick   = '#f77c7c',
      gridColor  = 'rgba(42, 157, 92, 0.10)',
      axisColor  = '#607068',
      bgColor    = 'transparent',
      showVolume = true,
      showSMA    = true,
      showBB     = true,
    } = options;

    const { canvas, ctx } = this.createCanvas(container, width, height);

    const volumeZone = showVolume ? 55 : 0;
    const padding = { top: 16, right: 64, bottom: 28 + volumeZone, left: 12 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    // Background
    if (bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }

    if (!data || !data.length) return canvas;

    // Price range
    const prices = data.flatMap(d => [d.high, d.low]);
    let min = Math.min(...prices);
    let max = Math.max(...prices);
    const pad = (max - min) * 0.08 || max * 0.02 || 1;
    min -= pad; max += pad;
    const range = max - min || 1;

    const toX = (i) => padding.left + (chartW / data.length) * i + (chartW / data.length) / 2;
    const toY = (p) => padding.top + ((max - p) / range) * chartH;
    const slot = chartW / data.length;
    const candleW = Math.max(2, slot * 0.7);
    const radius = Math.min(2, candleW * 0.15);

    // ── Grid — soft dotted ──
    ctx.setLineDash([1, 3]);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 6; i++) {
      const y = padding.top + (chartH / 6) * i;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + chartW, y); ctx.stroke();
    }
    for (let i = 0; i <= 8; i++) {
      const x = padding.left + (chartW / 8) * i;
      ctx.beginPath(); ctx.moveTo(x, padding.top); ctx.lineTo(x, padding.top + chartH); ctx.stroke();
    }
    ctx.setLineDash([]);

    // ── Bollinger Bands (20, 2σ) ──
    if (showBB && data.length > 20) {
      const bbW = 20;
      const bbUpper = [], bbLower = [];
      for (let i = bbW; i < data.length; i++) {
        const slice = data.slice(i - bbW, i).map(d => d.close);
        const mean = slice.reduce((a, b) => a + b, 0) / bbW;
        const std = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / bbW);
        const x = toX(i);
        bbUpper.push({ x, y: toY(mean + 2 * std) });
        bbLower.push({ x, y: toY(mean - 2 * std) });
      }
      // Shaded band
      ctx.beginPath();
      bbUpper.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      for (let i = bbLower.length - 1; i >= 0; i--) ctx.lineTo(bbLower[i].x, bbLower[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(100, 100, 200, 0.06)';
      ctx.fill();
      // Band edges
      ctx.strokeStyle = 'rgba(100, 100, 200, 0.25)';
      ctx.lineWidth = 0.8;
      [bbUpper, bbLower].forEach(band => {
        ctx.beginPath();
        band.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
      });
    }

    // ── Candlesticks ──
    data.forEach((d, i) => {
      const cx = toX(i);
      const x = cx - candleW / 2;
      const yHigh = toY(d.high), yLow = toY(d.low);
      const yOpen = toY(d.open), yClose = toY(d.close);
      const bullish = d.close >= d.open;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(Math.abs(yClose - yOpen), 1);

      // Subtle glow behind body
      ctx.fillStyle = bullish ? 'rgba(38, 166, 154, 0.12)' : 'rgba(239, 83, 80, 0.12)';
      ctx.fillRect(x - 1.5, bodyTop - 1.5, candleW + 3, bodyH + 3);

      // Upper wick
      ctx.strokeStyle = bullish ? bullWick : bearWick;
      ctx.lineWidth = Math.max(1, candleW * 0.12);
      ctx.beginPath(); ctx.moveTo(cx, yHigh); ctx.lineTo(cx, bodyTop); ctx.stroke();

      // Lower wick
      ctx.beginPath(); ctx.moveTo(cx, bodyTop + bodyH); ctx.lineTo(cx, yLow); ctx.stroke();

      // Body
      if (bullish) {
        // Hollow green with subtle gradient fill
        ctx.strokeStyle = bullBody;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(x + 0.5, bodyTop + 0.5, candleW - 1, bodyH - 1, radius);
        ctx.stroke();
        const grd = ctx.createLinearGradient(x, bodyTop, x, bodyTop + bodyH);
        grd.addColorStop(0, 'rgba(38, 166, 154, 0.20)');
        grd.addColorStop(1, 'rgba(38, 166, 154, 0.05)');
        ctx.fillStyle = grd;
        ctx.fill();
      } else {
        // Solid red with gradient
        const grd = ctx.createLinearGradient(x, bodyTop, x, bodyTop + bodyH);
        grd.addColorStop(0, '#ef5350');
        grd.addColorStop(0.5, '#e53935');
        grd.addColorStop(1, '#c62828');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.roundRect(x, bodyTop, candleW, bodyH, radius);
        ctx.fill();
      }
    });

    // ── SMA(20) — smooth cyan with glow ──
    if (showSMA && data.length > 20) {
      ctx.strokeStyle = 'rgba(0, 200, 230, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.shadowColor = 'rgba(0, 200, 230, 0.25)';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      for (let i = 20; i < data.length; i++) {
        const ma = data.slice(i - 20, i).reduce((s, d) => s + d.close, 0) / 20;
        const x = toX(i);
        const y = toY(ma);
        i === 20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ── SMA(50) — dashed gold ──
    if (showSMA && data.length > 50) {
      ctx.strokeStyle = 'rgba(240, 192, 64, 0.6)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      for (let i = 50; i < data.length; i++) {
        const ma = data.slice(i - 50, i).reduce((s, d) => s + d.close, 0) / 50;
        const x = toX(i);
        const y = toY(ma);
        i === 50 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Volume bars with gradient ──
    if (showVolume) {
      const volTop = padding.top + chartH + 10;
      const volH = volumeZone - 15;

      // Separator
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(padding.left, volTop); ctx.lineTo(padding.left + chartW, volTop); ctx.stroke();

      const volumes = data.map(d => d.volume || 0);
      const maxVol = Math.max(...volumes) || 1;

      data.forEach((d, i) => {
        if (!d.volume) return;
        const x = toX(i) - candleW / 2;
        const barH = (d.volume / maxVol) * volH;
        const barTop = volTop + volH - barH;
        const bullish = d.close >= d.open;

        const vGrad = ctx.createLinearGradient(0, barTop, 0, volTop + volH);
        if (bullish) {
          vGrad.addColorStop(0, 'rgba(38, 166, 154, 0.50)');
          vGrad.addColorStop(1, 'rgba(38, 166, 154, 0.08)');
        } else {
          vGrad.addColorStop(0, 'rgba(239, 83, 80, 0.50)');
          vGrad.addColorStop(1, 'rgba(239, 83, 80, 0.08)');
        }
        ctx.fillStyle = vGrad;
        const vR = Math.min(1.5, candleW * 0.12);
        ctx.beginPath();
        ctx.roundRect(x, barTop, candleW, barH, [vR, vR, 0, 0]);
        ctx.fill();
      });
    }

    // ── Current price line + tag ──
    const last = data[data.length - 1];
    const lastY = toY(last.close);
    const lastBull = last.close >= last.open;
    const priceCol = lastBull ? bullBody : bearBody;

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = priceCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, lastY);
    ctx.lineTo(padding.left + chartW, lastY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Price tag
    const priceStr = last.close >= 1 ? last.close.toFixed(2) : last.close.toFixed(4);
    ctx.fillStyle = priceCol;
    const tagW = 55, tagH = 18;
    ctx.beginPath();
    ctx.roundRect(padding.left + chartW + 2, lastY - tagH / 2, tagW, tagH, 3);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(priceStr, padding.left + chartW + 7, lastY + 3.5);

    // ── Right-side price axis ──
    ctx.fillStyle = axisColor;
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 6; i++) {
      const y = padding.top + (chartH / 6) * i;
      const value = max - (range / 6) * i;
      const label = value >= 1 ? value.toFixed(2) : value.toFixed(4);
      ctx.fillText(label, padding.left + chartW + 6, y + 4);
    }

    // ── X-axis time labels ──
    const tickCount = Math.min(6, data.length);
    ctx.textAlign = 'center';
    for (let i = 0; i < tickCount; i++) {
      const di = Math.floor((data.length - 1) * (i / (tickCount - 1 || 1)));
      const d = data[di];
      const label = this._formatTime(d && d.timestamp);
      if (!label) continue;
      ctx.fillText(label, toX(di), padding.top + chartH + 18);
    }

    // ── Legend ──
    ctx.font = '9px Inter, system-ui, sans-serif';
    const legendY = height - 6;
    let legendX = padding.left + 4;

    const drawLegend = (color, text, dashed) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      if (dashed) ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(legendX, legendY - 4);
      ctx.lineTo(legendX + 14, legendY - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(140, 140, 170, 0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(text, legendX + 18, legendY);
      legendX += ctx.measureText(text).width + 32;
    };

    if (showSMA) drawLegend('rgba(0, 200, 230, 0.8)', 'SMA(20)', false);
    if (showSMA) drawLegend('rgba(240, 192, 64, 0.6)', 'SMA(50)', true);
    if (showBB) drawLegend('rgba(100, 100, 200, 0.5)', 'BB(20,2)', false);

    return canvas;
  },

  _formatTime(ts) {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    // If spans more than a day, show date; else show HH:MM
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Charts;
}
