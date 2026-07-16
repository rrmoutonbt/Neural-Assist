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

  // ── Indicator math (shared) ──
  _calcEMA(src, period) {
    const k = 2 / (period + 1), out = new Array(src.length).fill(null);
    out[0] = src[0];
    for (let i = 1; i < src.length; i++) out[i] = src[i] * k + out[i - 1] * (1 - k);
    for (let i = 0; i < period; i++) out[i] = null;
    return out;
  },
  _calcSMA(src, period) {
    const out = new Array(src.length).fill(null);
    for (let i = period - 1; i < src.length; i++) {
      let s = 0; for (let j = i - period + 1; j <= i; j++) s += src[j];
      out[i] = s / period;
    }
    return out;
  },
  _calcRSI(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length < period + 1) return out;
    let gSum = 0, lSum = 0;
    for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; d > 0 ? gSum += d : lSum -= d; }
    let ag = gSum / period, al = lSum / period;
    out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      ag = (ag * (period - 1) + Math.max(d, 0)) / period;
      al = (al * (period - 1) + Math.max(-d, 0)) / period;
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
  },
  _calcVWAP(data) {
    const out = new Array(data.length).fill(null);
    let cumTPV = 0, cumV = 0;
    for (let i = 0; i < data.length; i++) {
      const tp = (data[i].high + data[i].low + data[i].close) / 3;
      cumTPV += tp * (data[i].volume || 0); cumV += data[i].volume || 0;
      out[i] = cumV > 0 ? cumTPV / cumV : null;
    }
    return out;
  },
  _calcBB(closes, period = 20, mult = 2) {
    const sma = this._calcSMA(closes, period);
    const upper = new Array(closes.length).fill(null), lower = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      let sq = 0; for (let j = i - period + 1; j <= i; j++) sq += (closes[j] - sma[i]) ** 2;
      const std = Math.sqrt(sq / period);
      upper[i] = sma[i] + mult * std; lower[i] = sma[i] - mult * std;
    }
    return { sma, upper, lower };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // Candlestick chart — Interactive institutional-grade renderer
  // Features: crosshair + OHLCV tooltip, EMA(9)/SMA/BB/VWAP/RSI overlays,
  // gradient bodies, glow, zoom (scroll), pan (drag), live tick animation.
  // Returns a controller { updateTick, addCandle, setData, destroy }.
  // ═══════════════════════════════════════════════════════════════════════
  candlestick(container, data, options = {}) {
    if (!container) return null;
    container.innerHTML = '';
    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.style.cursor = 'crosshair';

    const self = this;
    const {
      width: optW, height: optH,
      bullColor   = '#26a69a',  bearColor   = '#ef5350',
      bullWickCol = '#2ec4a6',  bearWickCol = '#f77c7c',
      gridCol     = 'rgba(42,157,92,0.08)',
      axisCol     = '#607068',
      showVolume  = true,
      showSMA     = true,
      showBB      = true,
      showEMA9    = true,
      showVWAP    = true,
      showRSI     = true,
    } = options;

    const W = optW || container.offsetWidth || 800;
    const H = optH || container.offsetHeight || 520;
    const dpr = window.devicePixelRatio || 1;

    // ── Layout zones ──
    const rsiZone = showRSI ? 80 : 0;
    const volZone = showVolume ? 50 : 0;
    const gapV = showVolume ? 8 : 0;
    const gapR = showRSI ? 8 : 0;
    const pad = { top: 28, right: 64, bottom: 24, left: 12 };
    const priceH = H - pad.top - pad.bottom - volZone - rsiZone - gapV - gapR;
    const chartW = W - pad.left - pad.right;
    const areas = {
      price: { top: pad.top, h: priceH },
      vol:   { top: pad.top + priceH + gapV, h: volZone },
      rsi:   { top: pad.top + priceH + gapV + volZone + gapR, h: rsiZone },
    };

    // ── State ──
    const st = {
      data: data.slice(),
      vStart: 0, vEnd: data.length,
      crosshair: { x: -1, y: -1, show: false, idx: -1 },
      drag: { on: false, sx: 0, vs: 0, ve: 0 },
      tickAnim: null,
    };

    // ── Create elements ──
    const spacer = document.createElement('div');
    spacer.style.cssText = `width:${W}px;height:${H}px;`;
    container.appendChild(spacer);

    function mkCanvas(z, pe) {
      const c = document.createElement('canvas');
      c.width = W * dpr; c.height = H * dpr;
      c.style.cssText = `width:${W}px;height:${H}px;display:block;position:absolute;top:0;left:0;z-index:${z};pointer-events:${pe};`;
      const cx = c.getContext('2d'); cx.scale(dpr, dpr);
      container.appendChild(c);
      return { c, cx };
    }
    const { c: mainC, cx: mc } = mkCanvas(1, 'none');
    const { c: ovC, cx: oc } = mkCanvas(2, 'none');

    // Info bar (OHLCV)
    const info = document.createElement('div');
    info.style.cssText = `position:absolute;top:4px;left:${pad.left + 4}px;font:11px 'JetBrains Mono',monospace;color:rgba(180,195,188,0.85);display:flex;gap:10px;z-index:3;pointer-events:none;white-space:nowrap;`;
    container.appendChild(info);

    // ── Scale helpers (recomputed per render) ──
    let visData, candleSlot, candleW, scaleX, scaleY;

    function updateScales() {
      visData = st.data.slice(st.vStart, st.vEnd);
      if (!visData.length) return false;
      candleSlot = chartW / visData.length;
      candleW = Math.max(2, Math.min(candleSlot * 0.7, 20));

      scaleX = {
        toX: (i) => pad.left + candleSlot * i + candleSlot / 2,
        toIdx: (px) => Math.round((px - pad.left - candleSlot / 2) / candleSlot),
      };

      const prices = visData.flatMap(d => [d.high, d.low]);
      let mn = Math.min(...prices), mx = Math.max(...prices);
      const p = (mx - mn) * 0.08 || mx * 0.02 || 1;
      mn -= p; mx += p;
      scaleY = {
        min: mn, max: mx, range: mx - mn,
        toY: (v) => areas.price.top + ((mx - v) / (mx - mn)) * priceH,
        toVal: (y) => mx - ((y - areas.price.top) / priceH) * (mx - mn),
      };
      return true;
    }

    // ── Render main chart ──
    function render() {
      mc.clearRect(0, 0, W, H);
      if (!st.data.length || !updateScales()) return;

      const allCloses = st.data.map(d => d.close);
      const radius = Math.min(2, candleW * 0.15);

      // Grid
      mc.save();
      mc.setLineDash([1, 3]); mc.strokeStyle = gridCol; mc.lineWidth = 0.5;
      for (let i = 0; i <= 6; i++) {
        const y = areas.price.top + (priceH / 6) * i;
        mc.beginPath(); mc.moveTo(pad.left, y); mc.lineTo(pad.left + chartW, y); mc.stroke();
      }
      for (let i = 0; i <= 8; i++) {
        const x = pad.left + (chartW / 8) * i;
        mc.beginPath(); mc.moveTo(x, areas.price.top); mc.lineTo(x, areas.price.top + priceH); mc.stroke();
      }
      mc.setLineDash([]); mc.restore();

      // ── Bollinger Bands ──
      if (showBB && allCloses.length > 20) {
        const bb = self._calcBB(allCloses, 20, 2);
        mc.beginPath();
        let started = false;
        for (let i = 0; i < visData.length; i++) {
          const di = st.vStart + i; if (bb.upper[di] === null) continue;
          const x = scaleX.toX(i), y = scaleY.toY(bb.upper[di]);
          !started ? (mc.moveTo(x, y), started = true) : mc.lineTo(x, y);
        }
        for (let i = visData.length - 1; i >= 0; i--) {
          const di = st.vStart + i; if (bb.lower[di] === null) continue;
          mc.lineTo(scaleX.toX(i), scaleY.toY(bb.lower[di]));
        }
        mc.closePath(); mc.fillStyle = 'rgba(100,100,200,0.06)'; mc.fill();
        mc.strokeStyle = 'rgba(100,100,200,0.25)'; mc.lineWidth = 0.8;
        [bb.upper, bb.lower].forEach(band => {
          mc.beginPath(); let s = false;
          for (let i = 0; i < visData.length; i++) {
            const di = st.vStart + i; if (band[di] === null) continue;
            const x = scaleX.toX(i), y = scaleY.toY(band[di]);
            !s ? (mc.moveTo(x, y), s = true) : mc.lineTo(x, y);
          }
          mc.stroke();
        });
      }

      // ── Candlesticks ──
      visData.forEach((d, i) => {
        const cx = scaleX.toX(i), x = cx - candleW / 2;
        const yH = scaleY.toY(d.high), yL = scaleY.toY(d.low);
        const yO = scaleY.toY(d.open), yC = scaleY.toY(d.close);
        const bull = d.close >= d.open;
        const bTop = Math.min(yO, yC), bH = Math.max(Math.abs(yC - yO), 1);

        // Glow
        mc.fillStyle = bull ? 'rgba(38,166,154,0.10)' : 'rgba(239,83,80,0.10)';
        mc.fillRect(x - 1, bTop - 1, candleW + 2, bH + 2);

        // Wicks
        mc.strokeStyle = bull ? bullWickCol : bearWickCol;
        mc.lineWidth = Math.max(1, candleW * 0.12);
        mc.beginPath(); mc.moveTo(cx, yH); mc.lineTo(cx, bTop); mc.stroke();
        mc.beginPath(); mc.moveTo(cx, bTop + bH); mc.lineTo(cx, yL); mc.stroke();

        // Body
        if (bull) {
          mc.strokeStyle = bullColor; mc.lineWidth = 1.5;
          mc.beginPath(); mc.roundRect(x + 0.5, bTop + 0.5, candleW - 1, bH - 1, radius); mc.stroke();
          const g = mc.createLinearGradient(x, bTop, x, bTop + bH);
          g.addColorStop(0, 'rgba(38,166,154,0.25)'); g.addColorStop(1, 'rgba(38,166,154,0.05)');
          mc.fillStyle = g; mc.fill();
        } else {
          const g = mc.createLinearGradient(x, bTop, x, bTop + bH);
          g.addColorStop(0, '#ef5350'); g.addColorStop(0.5, '#e53935'); g.addColorStop(1, '#c62828');
          mc.fillStyle = g;
          mc.beginPath(); mc.roundRect(x, bTop, candleW, bH, radius); mc.fill();
        }
      });

      // ── EMA(9) ──
      if (showEMA9 && allCloses.length > 9) {
        const ema9 = self._calcEMA(allCloses, 9);
        mc.strokeStyle = 'rgba(255,167,38,0.85)'; mc.lineWidth = 1.3;
        mc.shadowColor = 'rgba(255,167,38,0.2)'; mc.shadowBlur = 3;
        mc.beginPath(); let s = false;
        for (let i = 0; i < visData.length; i++) {
          const di = st.vStart + i; if (ema9[di] === null) continue;
          const x = scaleX.toX(i), y = scaleY.toY(ema9[di]);
          !s ? (mc.moveTo(x, y), s = true) : mc.lineTo(x, y);
        }
        mc.stroke(); mc.shadowBlur = 0;
      }

      // ── SMA(20) ──
      if (showSMA && allCloses.length > 20) {
        const sma20 = self._calcSMA(allCloses, 20);
        mc.strokeStyle = 'rgba(0,200,230,0.8)'; mc.lineWidth = 1.5;
        mc.shadowColor = 'rgba(0,200,230,0.25)'; mc.shadowBlur = 4;
        mc.beginPath(); let s = false;
        for (let i = 0; i < visData.length; i++) {
          const di = st.vStart + i; if (sma20[di] === null) continue;
          const x = scaleX.toX(i), y = scaleY.toY(sma20[di]);
          !s ? (mc.moveTo(x, y), s = true) : mc.lineTo(x, y);
        }
        mc.stroke(); mc.shadowBlur = 0;
      }

      // ── SMA(50) ──
      if (showSMA && allCloses.length > 50) {
        const sma50 = self._calcSMA(allCloses, 50);
        mc.strokeStyle = 'rgba(240,192,64,0.6)'; mc.lineWidth = 1.2;
        mc.setLineDash([4, 2]);
        mc.beginPath(); let s = false;
        for (let i = 0; i < visData.length; i++) {
          const di = st.vStart + i; if (sma50[di] === null) continue;
          const x = scaleX.toX(i), y = scaleY.toY(sma50[di]);
          !s ? (mc.moveTo(x, y), s = true) : mc.lineTo(x, y);
        }
        mc.stroke(); mc.setLineDash([]);
      }

      // ── VWAP ──
      if (showVWAP) {
        const vwap = self._calcVWAP(st.data);
        mc.strokeStyle = 'rgba(156,39,176,0.7)'; mc.lineWidth = 1.2;
        mc.setLineDash([6, 3]);
        mc.beginPath(); let s = false;
        for (let i = 0; i < visData.length; i++) {
          const di = st.vStart + i; if (vwap[di] === null) continue;
          const x = scaleX.toX(i), y = scaleY.toY(vwap[di]);
          if (y < areas.price.top || y > areas.price.top + priceH) continue;
          !s ? (mc.moveTo(x, y), s = true) : mc.lineTo(x, y);
        }
        mc.stroke(); mc.setLineDash([]);
      }

      // ── Volume bars ──
      if (showVolume) {
        const vTop = areas.vol.top, vH = areas.vol.h;
        mc.strokeStyle = gridCol; mc.lineWidth = 0.5;
        mc.beginPath(); mc.moveTo(pad.left, vTop); mc.lineTo(pad.left + chartW, vTop); mc.stroke();

        const vols = visData.map(d => d.volume || 0);
        const maxV = Math.max(...vols) || 1;
        visData.forEach((d, i) => {
          if (!d.volume) return;
          const x = scaleX.toX(i) - candleW / 2;
          const barH = (d.volume / maxV) * vH;
          const barTop = vTop + vH - barH;
          const bull = d.close >= d.open;
          const vg = mc.createLinearGradient(0, barTop, 0, vTop + vH);
          vg.addColorStop(0, bull ? 'rgba(38,166,154,0.50)' : 'rgba(239,83,80,0.50)');
          vg.addColorStop(1, bull ? 'rgba(38,166,154,0.08)' : 'rgba(239,83,80,0.08)');
          mc.fillStyle = vg;
          const vr = Math.min(1.5, candleW * 0.12);
          mc.beginPath(); mc.roundRect(x, barTop, candleW, barH, [vr, vr, 0, 0]); mc.fill();
        });
      }

      // ── RSI(14) subplot ──
      if (showRSI) {
        const rT = areas.rsi.top, rH = areas.rsi.h;
        const rsi = self._calcRSI(allCloses, 14);
        const rsiToY = (v) => rT + ((100 - v) / 100) * rH;

        // Separator
        mc.strokeStyle = gridCol; mc.lineWidth = 0.5;
        mc.beginPath(); mc.moveTo(pad.left, rT); mc.lineTo(pad.left + chartW, rT); mc.stroke();

        // Label
        mc.fillStyle = 'rgba(140,140,170,0.6)'; mc.font = '9px Inter,system-ui'; mc.textAlign = 'left';
        mc.fillText('RSI(14)', pad.left + 2, rT + 10);

        // Overbought / oversold zones
        mc.fillStyle = 'rgba(239,83,80,0.06)';
        mc.fillRect(pad.left, rsiToY(100), chartW, rsiToY(70) - rsiToY(100));
        mc.fillStyle = 'rgba(38,166,154,0.06)';
        mc.fillRect(pad.left, rsiToY(30), chartW, rsiToY(0) - rsiToY(30));

        // 70 / 50 / 30 lines
        mc.setLineDash([2, 2]); mc.lineWidth = 0.5;
        mc.strokeStyle = 'rgba(239,83,80,0.3)';
        mc.beginPath(); mc.moveTo(pad.left, rsiToY(70)); mc.lineTo(pad.left + chartW, rsiToY(70)); mc.stroke();
        mc.strokeStyle = 'rgba(150,150,150,0.2)';
        mc.beginPath(); mc.moveTo(pad.left, rsiToY(50)); mc.lineTo(pad.left + chartW, rsiToY(50)); mc.stroke();
        mc.strokeStyle = 'rgba(38,166,154,0.3)';
        mc.beginPath(); mc.moveTo(pad.left, rsiToY(30)); mc.lineTo(pad.left + chartW, rsiToY(30)); mc.stroke();
        mc.setLineDash([]);

        // RSI axis labels
        mc.fillStyle = axisCol; mc.font = '9px JetBrains Mono,monospace'; mc.textAlign = 'left';
        [70, 50, 30].forEach(v => mc.fillText(String(v), pad.left + chartW + 6, rsiToY(v) + 3));

        // RSI line
        mc.strokeStyle = 'rgba(156,39,176,0.8)'; mc.lineWidth = 1.5;
        mc.beginPath(); let s = false;
        for (let i = 0; i < visData.length; i++) {
          const di = st.vStart + i; if (rsi[di] === null) continue;
          const x = scaleX.toX(i), y = rsiToY(rsi[di]);
          !s ? (mc.moveTo(x, y), s = true) : mc.lineTo(x, y);
        }
        mc.stroke();
      }

      // ── Current price line + tag ──
      const last = visData[visData.length - 1];
      const lastY = scaleY.toY(last.close);
      const lastBull = last.close >= last.open;
      const priceCol = lastBull ? bullColor : bearColor;

      mc.setLineDash([4, 4]); mc.strokeStyle = priceCol; mc.lineWidth = 1;
      mc.beginPath(); mc.moveTo(pad.left, lastY); mc.lineTo(pad.left + chartW, lastY); mc.stroke();
      mc.setLineDash([]);

      const priceStr = last.close >= 1 ? last.close.toFixed(2) : last.close.toFixed(4);
      mc.fillStyle = priceCol;
      mc.beginPath(); mc.roundRect(pad.left + chartW + 2, lastY - 9, 55, 18, 3); mc.fill();
      mc.fillStyle = '#fff'; mc.font = 'bold 10px JetBrains Mono,monospace'; mc.textAlign = 'left';
      mc.fillText(priceStr, pad.left + chartW + 7, lastY + 3.5);

      // ── Right axis ──
      mc.fillStyle = axisCol; mc.font = '11px JetBrains Mono,monospace'; mc.textAlign = 'left';
      for (let i = 0; i <= 6; i++) {
        const y = areas.price.top + (priceH / 6) * i;
        const v = scaleY.max - (scaleY.range / 6) * i;
        mc.fillText(v >= 1 ? v.toFixed(2) : v.toFixed(4), pad.left + chartW + 6, y + 4);
      }

      // ── Time axis ──
      mc.textAlign = 'center';
      const ticks = Math.min(6, visData.length);
      const timeY = H - pad.bottom + 14;
      for (let i = 0; i < ticks; i++) {
        const di = Math.floor((visData.length - 1) * (i / (ticks - 1 || 1)));
        const d = visData[di];
        const label = self._fmtTime(d && d.timestamp);
        if (label) mc.fillText(label, scaleX.toX(di), timeY);
      }

      // ── Legend ──
      mc.font = '9px Inter,system-ui,sans-serif';
      let lx = pad.left + 4; const ly = H - 4;
      const leg = (col, txt, dash) => {
        mc.strokeStyle = col; mc.lineWidth = 2;
        if (dash) mc.setLineDash([3, 2]);
        mc.beginPath(); mc.moveTo(lx, ly - 4); mc.lineTo(lx + 14, ly - 4); mc.stroke();
        mc.setLineDash([]); mc.fillStyle = 'rgba(140,140,170,0.6)'; mc.textAlign = 'left';
        mc.fillText(txt, lx + 18, ly); lx += mc.measureText(txt).width + 32;
      };
      if (showEMA9) leg('rgba(255,167,38,0.85)', 'EMA(9)', false);
      if (showSMA) leg('rgba(0,200,230,0.8)', 'SMA(20)', false);
      if (showSMA) leg('rgba(240,192,64,0.6)', 'SMA(50)', true);
      if (showBB) leg('rgba(100,100,200,0.5)', 'BB(20,2)', false);
      if (showVWAP) leg('rgba(156,39,176,0.7)', 'VWAP', true);
    }

    // ── Overlay render (crosshair + tooltip) ──
    function renderOverlay() {
      oc.clearRect(0, 0, W, H);
      if (!st.crosshair.show || !visData || !visData.length) { info.innerHTML = ''; return; }

      const { y: my, idx } = st.crosshair;
      if (idx < 0 || idx >= visData.length) { info.innerHTML = ''; return; }

      const cx = scaleX.toX(idx);
      const d = visData[idx];
      const bull = d.close >= d.open;

      // Vertical line (full height)
      oc.setLineDash([2, 2]); oc.strokeStyle = 'rgba(180,195,188,0.4)'; oc.lineWidth = 0.8;
      oc.beginPath(); oc.moveTo(cx, areas.price.top); oc.lineTo(cx, H - pad.bottom); oc.stroke();

      // Horizontal line (price area)
      if (my >= areas.price.top && my <= areas.price.top + priceH) {
        oc.beginPath(); oc.moveTo(pad.left, my); oc.lineTo(pad.left + chartW, my); oc.stroke();
        oc.setLineDash([]);

        // Price label at right axis
        const val = scaleY.toVal(my);
        const vStr = val >= 1 ? val.toFixed(2) : val.toFixed(4);
        oc.fillStyle = 'rgba(50,60,55,0.92)';
        oc.beginPath(); oc.roundRect(pad.left + chartW + 1, my - 9, 56, 18, 3); oc.fill();
        oc.fillStyle = '#ddd'; oc.font = '10px JetBrains Mono,monospace'; oc.textAlign = 'left';
        oc.fillText(vStr, pad.left + chartW + 6, my + 3.5);
      }
      oc.setLineDash([]);

      // Time label at bottom
      const tStr = self._fmtTime(d.timestamp);
      if (tStr) {
        const tw = oc.measureText(tStr).width + 12;
        oc.fillStyle = 'rgba(50,60,55,0.92)';
        oc.beginPath(); oc.roundRect(cx - tw / 2, H - pad.bottom + 2, tw, 16, 3); oc.fill();
        oc.fillStyle = '#ddd'; oc.font = '10px JetBrains Mono,monospace'; oc.textAlign = 'center';
        oc.fillText(tStr, cx, H - pad.bottom + 13);
      }

      // Highlight hovered candle
      oc.fillStyle = 'rgba(255,255,255,0.04)';
      oc.fillRect(cx - candleSlot / 2, areas.price.top, candleSlot, priceH);

      // Info bar (OHLCV)
      const fmt = (v) => v >= 1 ? v.toFixed(2) : v.toFixed(4);
      const clr = bull ? bullColor : bearColor;
      const chg = ((d.close - d.open) / d.open * 100).toFixed(2);
      const chgSign = d.close >= d.open ? '+' : '';
      info.innerHTML =
        `<span style="color:${clr}">O <b>${fmt(d.open)}</b></span>` +
        `<span style="color:${clr}">H <b>${fmt(d.high)}</b></span>` +
        `<span style="color:${clr}">L <b>${fmt(d.low)}</b></span>` +
        `<span style="color:${clr}">C <b>${fmt(d.close)}</b></span>` +
        `<span style="color:${clr}">${chgSign}${chg}%</span>` +
        `<span>Vol <b>${d.volume ? (d.volume / 1e6).toFixed(1) + 'M' : '—'}</b></span>`;
    }

    // ── Event handling ──
    function getPos(e) {
      const r = container.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onMove(e) {
      if (st.drag.on) {
        const pos = getPos(e);
        const dx = pos.x - st.drag.sx;
        const shift = Math.round(-dx / (candleSlot || 10));
        let ns = st.drag.vs + shift, ne = st.drag.ve + shift;
        const len = ne - ns;
        if (ns < 0) { ns = 0; ne = len; }
        if (ne > st.data.length) { ne = st.data.length; ns = ne - len; }
        st.vStart = Math.max(0, ns);
        st.vEnd = Math.min(st.data.length, ne);
        render();
        return;
      }
      const pos = getPos(e);
      if (!visData || !visData.length) return;
      const idx = scaleX.toIdx(pos.x);
      st.crosshair = { x: pos.x, y: pos.y, show: idx >= 0 && idx < visData.length, idx };
      renderOverlay();
    }

    function onWheel(e) {
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      const len = st.vEnd - st.vStart;
      const step = Math.max(1, Math.round(len * 0.1));
      let ns = st.vStart, ne = st.vEnd;
      if (dir > 0) { ns = Math.max(0, ns - step); ne = Math.min(st.data.length, ne + step); }
      else if (len > 10) {
        ns += step; ne -= step;
        if (ne - ns < 10) { const mid = Math.round((ns + ne) / 2); ns = mid - 5; ne = mid + 5; }
      }
      st.vStart = Math.max(0, ns); st.vEnd = Math.min(st.data.length, ne);
      render();
      if (st.crosshair.show) renderOverlay();
    }

    function onDown(e) {
      if (e.button !== 0) return;
      const pos = getPos(e);
      st.drag = { on: true, sx: pos.x, vs: st.vStart, ve: st.vEnd };
      container.style.cursor = 'grabbing';
    }

    function onUp() { st.drag.on = false; container.style.cursor = 'crosshair'; }

    function onLeave() {
      st.crosshair.show = false; st.drag.on = false;
      container.style.cursor = 'crosshair';
      renderOverlay();
    }

    container.addEventListener('mousemove', onMove);
    container.addEventListener('wheel', onWheel, { passive: false });
    container.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    container.addEventListener('mouseleave', onLeave);

    // Initial render
    render();

    // ── Public controller ──
    return {
      canvas: mainC,

      updateTick(tick) {
        if (!st.data.length) return;
        const last = st.data[st.data.length - 1];
        const startClose = last.close;
        const targetClose = typeof tick === 'number' ? tick : (tick.price || tick.close);
        const startTime = performance.now();
        const dur = 300;
        if (st.tickAnim) cancelAnimationFrame(st.tickAnim);
        function anim(now) {
          const t = Math.min(1, (now - startTime) / dur);
          const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          const c = startClose + (targetClose - startClose) * ease;
          last.close = c;
          last.high = Math.max(last.high, c);
          last.low = Math.min(last.low, c);
          render();
          if (st.crosshair.show) renderOverlay();
          if (t < 1) st.tickAnim = requestAnimationFrame(anim);
        }
        st.tickAnim = requestAnimationFrame(anim);
      },

      addCandle(candle) {
        const wasFollow = st.vEnd >= st.data.length;
        st.data.push(candle);
        if (wasFollow) {
          const visLen = st.vEnd - st.vStart;
          st.vEnd = st.data.length;
          st.vStart = Math.max(0, st.vEnd - visLen);
        }
        render();
      },

      setData(newData) {
        st.data = newData.slice();
        st.vStart = 0; st.vEnd = st.data.length;
        render();
      },

      destroy() {
        container.removeEventListener('mousemove', onMove);
        container.removeEventListener('wheel', onWheel);
        container.removeEventListener('mousedown', onDown);
        window.removeEventListener('mouseup', onUp);
        container.removeEventListener('mouseleave', onLeave);
        if (st.tickAnim) cancelAnimationFrame(st.tickAnim);
        container.innerHTML = '';
      },
    };
  },

  _fmtTime(ts) {
    if (!ts) return '';
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return '';
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  },

  // Legacy alias
  _formatTime(ts) { return this._fmtTime(ts); }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Charts;
}
