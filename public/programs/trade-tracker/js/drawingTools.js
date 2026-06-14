// ============================================
// Drawing Tools Module — definitions, rendering, hit-testing
// Self-contained ES module for chart drawing overlays
// ============================================

// --- SVG icon helper (matches chartView.js convention) ---
const I = (d, s = 16) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

// ============================================
//  TOOL DEFINITIONS
// ============================================

const lineDefs = [
  { key: 'trendline',        label: 'Trend Line',        points: 2, icon: I('<path d="M4 20L20 4"/><circle cx="4" cy="20" r="2" opacity=".25" fill="currentColor"/><circle cx="20" cy="4" r="2" opacity=".25" fill="currentColor"/>') },
  { key: 'horizontal',       label: 'Horizontal Line',   points: 1, icon: I('<path d="M2 12h20" stroke-dasharray="5 3"/>') },
  { key: 'vertical',         label: 'Vertical Line',     points: 1, icon: I('<path d="M12 2v20" stroke-dasharray="5 3"/>') },
  { key: 'ray',              label: 'Ray',               points: 2, icon: I('<path d="M4 18L20 6"/><circle cx="4" cy="18" r="2" opacity=".25" fill="currentColor"/><path d="M18 7l2-1" opacity=".4"/>') },
  { key: 'extended',         label: 'Extended Line',     points: 2, icon: I('<path d="M1 21L23 3" opacity=".5"/><circle cx="8" cy="16" r="1.5" fill="currentColor" opacity=".3"/><circle cx="16" cy="8" r="1.5" fill="currentColor" opacity=".3"/>') },
  { key: 'parallel_channel', label: 'Parallel Channel',  points: 3, icon: I('<path d="M3 18l18-10"/><path d="M3 12l18-10" opacity=".5"/><path d="M3 15l18-10" stroke-dasharray="2 2" opacity=".3"/>') },
  { key: 'trend_channel',    label: 'Trend Channel',     points: 3, icon: I('<path d="M2 20L22 6"/><path d="M2 14L22 0" opacity=".5"/>') },
  { key: 'arrow',            label: 'Arrow',             points: 2, icon: I('<path d="M5 19L19 5"/><polyline points="12 5 19 5 19 12"/>') },
];

const fibDefs = [
  { key: 'fibonacci',     label: 'Fib Retracement',  points: 2, icon: I('<path d="M4 4v16"/><path d="M4 4h16" opacity=".7"/><path d="M4 10h16" opacity=".4" stroke-dasharray="3 2"/><path d="M4 16h16" opacity=".5"/><path d="M4 20h16" opacity=".7"/>') },
  { key: 'fib_extension', label: 'Fib Extension',    points: 3, icon: I('<path d="M4 20h16"/><path d="M4 14h16" opacity=".5"/><path d="M4 8h16" opacity=".4" stroke-dasharray="3 2"/><path d="M4 2h16" opacity=".3"/>') },
  { key: 'fib_fan',       label: 'Fib Fan',          points: 2, icon: I('<path d="M4 20L20 4"/><path d="M4 20L20 9" opacity=".5"/><path d="M4 20L20 14" opacity=".3"/>') },
  { key: 'fib_arc',       label: 'Fib Arc',          points: 2, icon: I('<path d="M4 20L20 4"/><path d="M12 12a8 8 0 00-8 8" opacity=".4"/><path d="M16 8a12 12 0 00-12 12" opacity=".3"/>') },
  { key: 'fib_timezone',  label: 'Fib Time Zone',    points: 2, icon: I('<path d="M4 2v20"/><path d="M8 2v20" opacity=".6"/><path d="M13 2v20" opacity=".4"/><path d="M20 2v20" opacity=".2"/>') },
  { key: 'pitchfork',     label: 'Pitchfork',        points: 3, icon: I('<path d="M12 4v16"/><path d="M4 8l16 8" opacity=".5"/><path d="M4 20L12 4L20 20"/>') },
];

const harmonicDefs = [
  { key: 'gartley',        label: 'Gartley',          points: 5, ratios: { AB_XA: 0.618, BC_AB: 0.382, CD_BC: 1.272, AD_XA: 0.786 }, icon: I('<path d="M3 16L7 6l4 7 3-5 4 10"/>') },
  { key: 'butterfly',      label: 'Butterfly',        points: 5, ratios: { AB_XA: 0.786, BC_AB: 0.382, CD_BC: 1.618, AD_XA: 1.27  }, icon: I('<path d="M3 14L7 6l4 8 3-6 4 12"/>') },
  { key: 'bat',            label: 'Bat',              points: 5, ratios: { AB_XA: 0.382, BC_AB: 0.382, CD_BC: 1.618, AD_XA: 0.886 }, icon: I('<path d="M3 15L7 8l4 6 3-4 4 9"/>') },
  { key: 'crab',           label: 'Crab',             points: 5, ratios: { AB_XA: 0.382, BC_AB: 0.382, CD_BC: 2.618, AD_XA: 1.618 }, icon: I('<path d="M3 12L7 6l4 8 3-7 4 15"/>') },
  { key: 'head_shoulders', label: 'Head & Shoulders', points: 5, icon: I('<path d="M2 16l4-4 3 2 3-8 3 8 3-2 4 4"/>') },
  { key: 'elliott_wave',   label: 'Elliott Wave',     points: 8, icon: I('<path d="M2 18l3-8 2 4 4-12 3 10 2-4 3 6 2-3 2 7"/>') },
];

const geometricDefs = [
  { key: 'rectangle',  label: 'Rectangle',   points: 2, icon: I('<rect x="4" y="6" width="16" height="12" rx="1.5" stroke-dasharray="5 3"/><rect x="4" y="6" width="16" height="12" rx="1.5" fill="currentColor" opacity=".05"/>') },
  { key: 'ellipse',    label: 'Ellipse',      points: 2, icon: I('<ellipse cx="12" cy="12" rx="9" ry="6" stroke-dasharray="5 3"/><ellipse cx="12" cy="12" rx="9" ry="6" fill="currentColor" opacity=".05"/>') },
  { key: 'triangle',   label: 'Triangle',     points: 3, icon: I('<polygon points="12,4 3,20 21,20" fill="currentColor" opacity=".05"/><polygon points="12,4 3,20 21,20" fill="none"/>') },
  { key: 'polyline',   label: 'Polyline',     points: -1, icon: I('<polyline points="3,18 8,8 14,14 20,6"/>') },
  { key: 'path',       label: 'Path / Curve', points: 4, icon: I('<path d="M4 18 C8 6, 16 6, 20 18"/>') },
  { key: 'flag',       label: 'Flag',         points: 1, icon: I('<path d="M5 21V4"/><path d="M5 4l10 4-10 4" fill="currentColor" opacity=".15"/><path d="M5 4l10 4-10 4"/>') },
  { key: 'cross_mark', label: 'Cross Mark',   points: 1, icon: I('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>') },
  { key: 'check_mark', label: 'Check Mark',   points: 1, icon: I('<polyline points="4,13 9,18 20,6"/>') },
];

const annotationDefs = [
  { key: 'text',        label: 'Text',        points: 1, icon: I('<path d="M5 7V4h14v3"/><path d="M9 20h6"/><path d="M12 4v16"/>') },
  { key: 'callout',     label: 'Callout',     points: 2, icon: I('<rect x="10" y="3" width="12" height="10" rx="2"/><path d="M10 10L4 18"/>') },
  { key: 'text_box',    label: 'Text Box',    points: 1, icon: I('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10"/><path d="M7 14h6"/>') },
  { key: 'note',        label: 'Note',        points: 1, icon: I('<path d="M16 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8z"/><polyline points="14,3 14,9 21,9" fill="currentColor" opacity=".1"/>') },
  { key: 'price_label', label: 'Price Label', points: 1, icon: I('<path d="M2 12h16" stroke-dasharray="4 3"/><rect x="18" y="8" width="4" height="8" rx="1" fill="currentColor" opacity=".2"/>') },
  { key: 'brush',       label: 'Brush',       points: -1, icon: I('<path d="M3 18c2-4 5-2 7-6s2-6 5-8 5 0 6 2"/>') },
];

const measureDefs = [
  { key: 'measure',     label: 'Measure',      points: 2, icon: I('<path d="M3 12h18"/><path d="M3 12l3.5-3.5"/><path d="M3 12l3.5 3.5"/><path d="M21 12l-3.5-3.5"/><path d="M21 12l-3.5 3.5"/>') },
  { key: 'price_range', label: 'Price Range',   points: 2, icon: I('<rect x="2" y="7" width="20" height="10" fill="currentColor" opacity=".06"/><path d="M2 7h20"/><path d="M2 17h20"/>') },
  { key: 'date_range',  label: 'Date Range',    points: 2, icon: I('<rect x="7" y="2" width="10" height="20" fill="currentColor" opacity=".06"/><path d="M7 2v20"/><path d="M17 2v20"/>') },
  { key: 'supply_zone', label: 'Supply Zone',   points: 2, icon: I('<rect x="2" y="4" width="20" height="8" rx="1" fill="#f85149" opacity=".12"/><rect x="2" y="4" width="20" height="8" rx="1"/>') },
  { key: 'demand_zone', label: 'Demand Zone',   points: 2, icon: I('<rect x="2" y="12" width="20" height="8" rx="1" fill="#56d364" opacity=".12"/><rect x="2" y="12" width="20" height="8" rx="1"/>') },
  { key: 'gann_fan',    label: 'Gann Fan',      points: 2, icon: I('<path d="M4 20L20 4"/><path d="M4 20L20 10" opacity=".5"/><path d="M4 20L20 16" opacity=".3"/><path d="M4 20L10 4" opacity=".5"/>') },
  { key: 'time_cycle',  label: 'Time Cycle',    points: 1, icon: I('<path d="M6 2v20" opacity=".6"/><path d="M12 2v20" opacity=".4"/><path d="M18 2v20" opacity=".2"/>') },
  { key: 'sine_line',   label: 'Sine Line',     points: 1, icon: I('<path d="M2 12c2-6 5-6 7 0s5 6 7 0 5-6 7 0"/>') },
];

const patternDefs = [
  { key: 'triple_top',    label: 'Triple Top',     points: 4, icon: I('<path d="M2 16l4-10 4 10 4-10 4 10 4-10"/>') },
  { key: 'cup_handle',    label: 'Cup & Handle',   points: 4, icon: I('<path d="M3 6c0 10 16 10 16 0"/><path d="M19 6c1 3 3 3 3 1"/>') },
  { key: 'projection',    label: 'Projection',     points: 4, icon: I('<path d="M2 16l5-8 5 6 5-4"/><path d="M17 10l5-4" stroke-dasharray="3 2" opacity=".5"/>') },
  { key: 'ghost_feed',    label: 'Ghost Feed',     points: 1, icon: I('<rect x="4" y="8" width="3" height="8" rx=".5" opacity=".3"/><rect x="9" y="6" width="3" height="10" rx=".5" opacity=".2"/><rect x="14" y="9" width="3" height="7" rx=".5" opacity=".15"/><rect x="19" y="7" width="3" height="9" rx=".5" opacity=".1"/>') },
  { key: 'rising_wedge',  label: 'Rising Wedge',   points: 4, icon: I('<path d="M3 20L21 8"/><path d="M3 16L21 10" opacity=".6"/>') },
  { key: 'falling_wedge', label: 'Falling Wedge',  points: 4, icon: I('<path d="M3 4L21 16"/><path d="M3 8L21 14" opacity=".6"/>') },
];

// ============================================
//  EXPORTED CATEGORY LIST
// ============================================

export const TOOL_CATEGORIES = [
  { id: 'lines',      name: 'Lines',               icon: I('<path d="M4 20L20 4"/>'),                                         tools: lineDefs },
  { id: 'fibonacci',  name: 'Fibonacci',            icon: I('<path d="M4 4v16"/><path d="M4 12h16" stroke-dasharray="3 2"/>'), tools: fibDefs },
  { id: 'harmonic',   name: 'Harmonic Patterns',    icon: I('<path d="M3 16L7 6l4 7 3-5 4 10"/>'),                             tools: harmonicDefs },
  { id: 'geometric',  name: 'Geometric',            icon: I('<rect x="4" y="6" width="16" height="12" rx="1.5"/>'),            tools: geometricDefs },
  { id: 'annotation', name: 'Annotation',           icon: I('<path d="M5 7V4h14v3"/><path d="M12 4v16"/>'),                    tools: annotationDefs },
  { id: 'measure',    name: 'Measurement & Zones',  icon: I('<path d="M3 12h18"/><path d="M3 12l3-3"/><path d="M21 12l-3-3"/>'), tools: measureDefs },
  { id: 'pattern',    name: 'Pattern Recognition',  icon: I('<path d="M2 16l5-8 5 6 5-4 5 2"/>'),                              tools: patternDefs },
];

// Flat lookup: key -> tool definition
export const ALL_TOOLS = {};
TOOL_CATEGORIES.forEach(cat => cat.tools.forEach(t => { ALL_TOOLS[t.key] = { ...t, category: cat.id }; }));

// ============================================
//  CONSTANTS
// ============================================

const FIB_LEVELS   = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_COLORS   = ['#f85149','#ffa657','#d2a8ff','#58a6ff','#79c0ff','#56d364','#f85149'];
const GANN_ANGLES  = [1, 2, 3, 4, 8, 1/2, 1/3, 1/4, 1/8];
const HARMONIC_LABELS = ['X','A','B','C','D'];
const HIT_RADIUS   = 10;

// ============================================
//  RENDER HELPERS
// ============================================

function setDash(ctx, style) {
  if (style === 'solid') ctx.setLineDash([]);
  else if (style === 'dotted') ctx.setLineDash([2, 2]);
  else ctx.setLineDash([5, 4]);
}

function drawAnchor(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawLabel(ctx, text, x, y, color) {
  ctx.fillStyle = color;
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y - 8);
}

function colorWithAlpha(color, alphaHex) {
  // Accepts 6-char hex and appends alpha hex, or falls back
  if (color && color.length === 7 && color[0] === '#') return color + alphaHex;
  if (color && color.length === 4 && color[0] === '#') {
    const r = color[1], g = color[2], b = color[3];
    return `#${r}${r}${g}${g}${b}${b}${alphaHex}`;
  }
  return color;
}

/** Extend a line from p1 through p2 to the canvas edges; returns [x, y] of the far intersection. */
function extendToEdge(x1, y1, x2, y2, chartW, chartH) {
  const dx = x2 - x1, dy = y2 - y1;
  if (dx === 0 && dy === 0) return [x2, y2];
  let t = Infinity;
  // find max t such that (x1+dx*t, y1+dy*t) is still on canvas
  if (dx > 0) t = Math.min(t, (chartW - x1) / dx);
  else if (dx < 0) t = Math.min(t, -x1 / dx);
  if (dy > 0) t = Math.min(t, (chartH - y1) / dy);
  else if (dy < 0) t = Math.min(t, -y1 / dy);
  if (!isFinite(t)) t = 1;
  return [x1 + dx * t, y1 + dy * t];
}

/** Extend line infinitely in both directions to canvas edges. */
function extendBothDirections(x1, y1, x2, y2, chartW, chartH) {
  const a = extendToEdge(x2, y2, x1, y1, chartW, chartH);
  const b = extendToEdge(x1, y1, x2, y2, chartW, chartH);
  return { ax: a[0], ay: a[1], bx: b[0], by: b[1] };
}

/** Distance from point to line segment. */
function ptSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Distance from point to infinite line through two points. */
function ptLineDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  return Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / Math.sqrt(lenSq);
}

function ptDist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Draw an arrowhead at (x2,y2) pointing from (x1,y1). */
function drawArrowhead(ctx, x1, y1, x2, y2, size) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - 0.4), y2 - size * Math.sin(angle - 0.4));
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle + 0.4), y2 - size * Math.sin(angle + 0.4));
  ctx.stroke();
}

// ============================================
//  RENDER DRAWING
// ============================================

/**
 * Render a single drawing onto a canvas 2D context.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object}   drawing  — the stored drawing object
 * @param {number}   chartW   — chart pixel width
 * @param {number}   mainH    — main panel pixel height
 * @param {number}   min      — visible price min
 * @param {number}   range    — visible price range (max - min)
 * @param {Array}    data     — candle data array
 * @param {Function} toX      — (barIndex) => pixelX
 * @param {Function} toY      — (price)    => pixelY
 */
export function renderDrawing(ctx, drawing, chartW, mainH, min, range, data, toX, toY) {
  const d = drawing;
  const color = d.color || '#58a6ff';
  const lw = d.lineWidth || 1.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lw;
  ctx.font = '11px Inter, sans-serif';
  ctx.setLineDash([]);

  switch (d.type) {

    // ===================  LINES  ===================

    case 'trendline': {
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      break;
    }

    case 'horizontal': {
      const y = toY(d.price);
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = 'right';
      ctx.fillText(d.price.toFixed(2), chartW - 4, y - 4);
      break;
    }

    case 'vertical': {
      const x = (d.barIndex != null) ? toX(d.barIndex) : d.x;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mainH);
      ctx.stroke();
      ctx.setLineDash([]);
      drawAnchor(ctx, x, d.y || mainH / 2, color);
      break;
    }

    case 'ray': {
      const [ex, ey] = extendToEdge(d.x1, d.y1, d.x2, d.y2, chartW, mainH);
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      break;
    }

    case 'extended': {
      const ext = extendBothDirections(d.x1, d.y1, d.x2, d.y2, chartW, mainH);
      ctx.beginPath();
      ctx.moveTo(ext.ax, ext.ay);
      ctx.lineTo(ext.bx, ext.by);
      ctx.stroke();
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      break;
    }

    case 'parallel_channel': {
      // P1-P2 = first line, P3 defines offset for parallel
      const dx = (d.x3 || d.x1) - d.x1, dy = (d.y3 || d.y1) - d.y1;
      // Channel fill
      ctx.fillStyle = colorWithAlpha(color, '15');
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.lineTo(d.x2 + dx, d.y2 + dy);
      ctx.lineTo(d.x1 + dx, d.y1 + dy);
      ctx.closePath();
      ctx.fill();
      // Outer lines
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(d.x1 + dx, d.y1 + dy);
      ctx.lineTo(d.x2 + dx, d.y2 + dy);
      ctx.stroke();
      // Middle dashed
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(d.x1 + dx / 2, d.y1 + dy / 2);
      ctx.lineTo(d.x2 + dx / 2, d.y2 + dy / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      drawAnchor(ctx, d.x3 || d.x1, d.y3 || d.y1, color);
      break;
    }

    case 'trend_channel': {
      const dx = (d.x3 || d.x1) - d.x1, dy = (d.y3 || d.y1) - d.y1;
      // Extend both lines to edges
      const e1 = extendBothDirections(d.x1, d.y1, d.x2, d.y2, chartW, mainH);
      const e2 = extendBothDirections(d.x1 + dx, d.y1 + dy, d.x2 + dx, d.y2 + dy, chartW, mainH);
      ctx.fillStyle = colorWithAlpha(color, '10');
      ctx.beginPath();
      ctx.moveTo(e1.ax, e1.ay);
      ctx.lineTo(e1.bx, e1.by);
      ctx.lineTo(e2.bx, e2.by);
      ctx.lineTo(e2.ax, e2.ay);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(e1.ax, e1.ay); ctx.lineTo(e1.bx, e1.by); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(e2.ax, e2.ay); ctx.lineTo(e2.bx, e2.by); ctx.stroke();
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      drawAnchor(ctx, d.x3 || d.x1, d.y3 || d.y1, color);
      break;
    }

    case 'arrow': {
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.stroke();
      drawArrowhead(ctx, d.x1, d.y1, d.x2, d.y2, 12);
      drawAnchor(ctx, d.x1, d.y1, color);
      break;
    }

    // ===================  FIBONACCI  ===================

    case 'fibonacci': {
      const props = d.props || {};
      const pBegin = d.price1, pEnd = d.price2;
      const pRange = pEnd - pBegin;
      const xMin = Math.min(d.x1, d.x2), xMax = Math.max(d.x1, d.x2);
      const xStart = (props.leftExtension === 'On') ? 0 : xMin;
      const xEnd   = (props.rightExtension === 'On') ? chartW : xMax;
      // Fill bands
      for (let i = 0; i < FIB_LEVELS.length - 1; i++) {
        const y1 = toY(pBegin + pRange * FIB_LEVELS[i]);
        const y2 = toY(pBegin + pRange * FIB_LEVELS[i + 1]);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(88,166,255,0.03)' : 'rgba(88,166,255,0.06)';
        ctx.fillRect(xStart, Math.min(y1, y2), xEnd - xStart, Math.abs(y2 - y1));
      }
      // Trendline
      ctx.strokeStyle = props.trendlineColor || '#30363d';
      ctx.lineWidth = props.trendlineWidth || 1;
      setDash(ctx, props.trendlineStyle || 'dashed');
      ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
      ctx.setLineDash([]);
      // Level lines
      FIB_LEVELS.forEach((level, i) => {
        const price = pBegin + pRange * level;
        const y = toY(price);
        ctx.strokeStyle = FIB_COLORS[i] || color;
        ctx.lineWidth = 1;
        setDash(ctx, 'dashed');
        ctx.beginPath(); ctx.moveTo(xStart, y); ctx.lineTo(xEnd, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = FIB_COLORS[i] || color;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${(level * 100).toFixed(1)}%`, xEnd - 4, y - 3);
        ctx.fillText(price.toFixed(2), xEnd - 52, y - 3);
      });
      break;
    }

    case 'fib_extension': {
      // 3 points: swing low (P1), swing high (P2), retracement (P3)
      const p1y = d.price1 != null ? toY(d.price1) : d.y1;
      const p2y = d.price2 != null ? toY(d.price2) : d.y2;
      const p3y = d.price3 != null ? toY(d.price3) : (d.y3 || d.y2);
      const baseRange = p1y - p2y; // pixel range of initial swing
      const extLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.0, 2.618];
      const xStart = 0, xEnd = chartW;
      extLevels.forEach((level, i) => {
        const y = p3y - baseRange * level;
        ctx.strokeStyle = FIB_COLORS[i % FIB_COLORS.length];
        ctx.lineWidth = 1;
        setDash(ctx, 'dashed');
        ctx.beginPath(); ctx.moveTo(xStart, y); ctx.lineTo(xEnd, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = FIB_COLORS[i % FIB_COLORS.length];
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${(level * 100).toFixed(1)}%`, xEnd - 4, y - 3);
      });
      drawAnchor(ctx, d.x1, p1y, color);
      drawAnchor(ctx, d.x2, p2y, color);
      if (d.x3 != null) drawAnchor(ctx, d.x3, p3y, color);
      break;
    }

    case 'fib_fan': {
      ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
      const fanLevels = [0.236, 0.382, 0.5, 0.618, 0.786];
      fanLevels.forEach((level, i) => {
        const fy = d.y1 + (d.y2 - d.y1) * level;
        const [ex, ey] = extendToEdge(d.x1, d.y1, d.x2, fy, chartW, mainH);
        ctx.strokeStyle = FIB_COLORS[i % FIB_COLORS.length];
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.globalAlpha = 1;
        drawLabel(ctx, `${(level * 100).toFixed(1)}%`, ex - 30, ey, FIB_COLORS[i % FIB_COLORS.length]);
      });
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      break;
    }

    case 'fib_arc': {
      const dist = ptDist(d.x1, d.y1, d.x2, d.y2);
      const arcLevels = [0.236, 0.382, 0.5, 0.618, 0.786, 1];
      ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
      arcLevels.forEach((level, i) => {
        const r = dist * level;
        ctx.strokeStyle = FIB_COLORS[i % FIB_COLORS.length];
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(d.x1, d.y1, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      break;
    }

    case 'fib_timezone': {
      const startX = (d.barIndex1 != null) ? toX(d.barIndex1) : d.x1;
      const spacing = (d.barIndex2 != null && d.barIndex1 != null)
        ? Math.abs(toX(d.barIndex2) - toX(d.barIndex1))
        : (d.x2 != null ? Math.abs(d.x2 - d.x1) : 40);
      const fibSeq = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
      let cumulative = 0;
      fibSeq.forEach((n, i) => {
        cumulative += n;
        const x = startX + cumulative * (spacing || 1);
        if (x > chartW) return;
        ctx.strokeStyle = FIB_COLORS[i % FIB_COLORS.length];
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = FIB_COLORS[i % FIB_COLORS.length];
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(cumulative), x, 12);
      });
      drawAnchor(ctx, startX, mainH / 2, color);
      break;
    }

    case 'pitchfork': {
      // P1 = median start, P2 = left tine base, P3 = right tine base
      const mx = (d.x2 + (d.x3 || d.x2)) / 2;
      const my = (d.y2 + (d.y3 || d.y2)) / 2;
      // Median line: P1 -> midpoint of P2-P3, extended
      const [mex, mey] = extendToEdge(d.x1, d.y1, mx, my, chartW, mainH);
      ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(mex, mey); ctx.stroke();
      // Parallel lines through P2 and P3
      const pdx = mex - d.x1, pdy = mey - d.y1;
      const offX2 = d.x2 - mx, offY2 = d.y2 - my;
      const offX3 = (d.x3 || d.x2) - mx, offY3 = (d.y3 || d.y2) - my;
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.moveTo(d.x2, d.y2); ctx.lineTo(d.x2 + pdx, d.y2 + pdy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(d.x3 || d.x2, d.y3 || d.y2); ctx.lineTo((d.x3 || d.x2) + pdx, (d.y3 || d.y2) + pdy); ctx.stroke();
      ctx.globalAlpha = 1;
      // Fill between parallel lines
      ctx.fillStyle = colorWithAlpha(color, '0a');
      ctx.beginPath();
      ctx.moveTo(d.x2, d.y2);
      ctx.lineTo(d.x2 + pdx, d.y2 + pdy);
      ctx.lineTo((d.x3 || d.x2) + pdx, (d.y3 || d.y2) + pdy);
      ctx.lineTo(d.x3 || d.x2, d.y3 || d.y2);
      ctx.closePath();
      ctx.fill();
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      if (d.x3 != null) drawAnchor(ctx, d.x3, d.y3, color);
      break;
    }

    // ===================  HARMONIC PATTERNS  ===================

    case 'gartley':
    case 'butterfly':
    case 'bat':
    case 'crab': {
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        { x: d.x3, y: d.y3 }, { x: d.x4, y: d.y4 },
        { x: d.x5, y: d.y5 },
      ];
      const validPts = pts.filter(p => p && p.x != null && p.y != null);
      if (validPts.length < 2) break;
      // Filled polygon
      ctx.fillStyle = colorWithAlpha(color, '12');
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      for (let i = 1; i < validPts.length; i++) ctx.lineTo(validPts[i].x, validPts[i].y);
      ctx.closePath();
      ctx.fill();
      // Solid lines connecting consecutive points
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      for (let i = 1; i < validPts.length; i++) ctx.lineTo(validPts[i].x, validPts[i].y);
      ctx.stroke();
      // Dashed retracement connections: X-B (0-2), A-C (1-3), X-D (0-4)
      const dashPairs = [[0, 2], [1, 3], [0, 4]];
      ctx.setLineDash([4, 4]);
      ctx.globalAlpha = 0.5;
      dashPairs.forEach(([a, b]) => {
        if (validPts[a] && validPts[b]) {
          ctx.beginPath();
          ctx.moveTo(validPts[a].x, validPts[a].y);
          ctx.lineTo(validPts[b].x, validPts[b].y);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      // Point markers and labels
      const ratios = ALL_TOOLS[d.type]?.ratios || {};
      validPts.forEach((p, i) => {
        drawAnchor(ctx, p.x, p.y, color);
        drawLabel(ctx, HARMONIC_LABELS[i] || String(i), p.x, p.y, color);
      });
      // Ratio text between segments
      const ratioEntries = Object.entries(ratios);
      if (ratioEntries.length > 0 && validPts.length >= 4) {
        ctx.font = '9px Inter, sans-serif';
        ctx.fillStyle = colorWithAlpha(color, 'aa');
        const segPairs = [[1, 2], [2, 3], [3, 4], [0, 4]]; // AB, BC, CD, AD midpoints
        ratioEntries.forEach((entry, idx) => {
          const pair = segPairs[idx];
          if (!pair || !validPts[pair[0]] || !validPts[pair[1]]) return;
          const mx = (validPts[pair[0]].x + validPts[pair[1]].x) / 2;
          const my = (validPts[pair[0]].y + validPts[pair[1]].y) / 2;
          ctx.textAlign = 'center';
          ctx.fillText(entry[1].toFixed(3), mx, my - 5);
        });
      }
      break;
    }

    case 'head_shoulders': {
      // 5 points: LS, Head, RS, Neckline1, Neckline2
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        { x: d.x3, y: d.y3 }, { x: d.x4, y: d.y4 },
        { x: d.x5, y: d.y5 },
      ];
      const validPts = pts.filter(p => p && p.x != null && p.y != null);
      if (validPts.length < 3) break;
      // Connect shoulder line
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      for (let i = 1; i < Math.min(validPts.length, 3); i++) ctx.lineTo(validPts[i].x, validPts[i].y);
      ctx.stroke();
      // Neckline (dashed)
      if (validPts.length >= 5) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = '#ffa657';
        ctx.beginPath();
        ctx.moveTo(validPts[3].x, validPts[3].y);
        ctx.lineTo(validPts[4].x, validPts[4].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Fill
      if (validPts.length >= 3) {
        ctx.fillStyle = colorWithAlpha(color, '10');
        ctx.beginPath();
        ctx.moveTo(validPts[0].x, validPts[0].y);
        for (let i = 1; i < validPts.length; i++) ctx.lineTo(validPts[i].x, validPts[i].y);
        ctx.closePath();
        ctx.fill();
      }
      const hsLabels = ['LS', 'Head', 'RS', 'NL1', 'NL2'];
      validPts.forEach((p, i) => {
        drawAnchor(ctx, p.x, p.y, color);
        drawLabel(ctx, hsLabels[i] || '', p.x, p.y, color);
      });
      break;
    }

    case 'elliott_wave': {
      const pts = d.points || [];
      const validPts = pts.filter(p => p && p.x != null && p.y != null);
      if (validPts.length < 2) break;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      for (let i = 1; i < validPts.length; i++) ctx.lineTo(validPts[i].x, validPts[i].y);
      ctx.stroke();
      const waveLabels = ['1','2','3','4','5','A','B','C'];
      validPts.forEach((p, i) => {
        drawAnchor(ctx, p.x, p.y, color);
        drawLabel(ctx, waveLabels[i] || String(i + 1), p.x, p.y, color);
      });
      break;
    }

    // ===================  GEOMETRIC  ===================

    case 'rectangle': {
      const rx = Math.min(d.x1, d.x2), ry = Math.min(d.y1, d.y2);
      const rw = Math.abs(d.x2 - d.x1), rh = Math.abs(d.y2 - d.y1);
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = colorWithAlpha(color, '0f');
      ctx.fillRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
      break;
    }

    case 'ellipse': {
      const cx = (d.x1 + d.x2) / 2, cy = (d.y1 + d.y2) / 2;
      const rx = Math.abs(d.x2 - d.x1) / 2, ry = Math.abs(d.y2 - d.y1) / 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = colorWithAlpha(color, '0f');
      ctx.fill();
      ctx.setLineDash([]);
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      break;
    }

    case 'triangle': {
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(d.x2, d.y2);
      ctx.lineTo(d.x3 || d.x1, d.y3 || d.y1);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = colorWithAlpha(color, '12');
      ctx.fill();
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      if (d.x3 != null) drawAnchor(ctx, d.x3, d.y3, color);
      break;
    }

    case 'polyline': {
      const pts = d.points || [];
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      pts.forEach(p => drawAnchor(ctx, p.x, p.y, color));
      break;
    }

    case 'path': {
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        d.x3 != null ? { x: d.x3, y: d.y3 } : null,
        d.x4 != null ? { x: d.x4, y: d.y4 } : null,
      ].filter(Boolean);
      if (pts.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 2) {
        ctx.lineTo(pts[1].x, pts[1].y);
      } else if (pts.length === 3) {
        ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
      } else {
        ctx.bezierCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y);
      }
      ctx.stroke();
      pts.forEach(p => drawAnchor(ctx, p.x, p.y, color));
      break;
    }

    case 'flag': {
      const x = d.x || d.x1, y = d.y || d.y1;
      const poleH = d.poleHeight || 60;
      const flagW = d.flagWidth || 30;
      const flagH = d.flagHeight || 18;
      // Pole
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - poleH);
      ctx.stroke();
      // Flag triangle
      ctx.fillStyle = colorWithAlpha(color, '30');
      ctx.beginPath();
      ctx.moveTo(x, y - poleH);
      ctx.lineTo(x + flagW, y - poleH + flagH / 2);
      ctx.lineTo(x, y - poleH + flagH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawAnchor(ctx, x, y, color);
      break;
    }

    case 'cross_mark': {
      const x = d.x || d.x1, y = d.y || d.y1;
      const s = d.size || 10;
      ctx.lineWidth = Math.max(lw, 2);
      ctx.beginPath();
      ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
      ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
      ctx.stroke();
      break;
    }

    case 'check_mark': {
      const x = d.x || d.x1, y = d.y || d.y1;
      const s = d.size || 12;
      ctx.lineWidth = Math.max(lw, 2);
      ctx.strokeStyle = d.color || '#56d364';
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.lineTo(x - s * 0.3, y + s * 0.7);
      ctx.lineTo(x + s, y - s * 0.6);
      ctx.stroke();
      break;
    }

    // ===================  ANNOTATION  ===================

    case 'text': {
      ctx.fillStyle = d.color || '#e6edf3';
      ctx.font = `${d.fontSize || 13}px Inter, sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(d.text || '', d.x || d.x1, d.y || d.y1);
      break;
    }

    case 'callout': {
      // Arrow tip at P1, text box at P2
      const tx = d.x2, ty = d.y2;
      const text = d.text || 'Note';
      ctx.font = '11px Inter, sans-serif';
      const tw = ctx.measureText(text).width + 12;
      const th = 22;
      // Arrow line
      ctx.beginPath();
      ctx.moveTo(d.x1, d.y1);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      drawArrowhead(ctx, tx, ty, d.x1, d.y1, 8);
      // Text box
      ctx.fillStyle = 'rgba(22,27,34,0.92)';
      ctx.fillRect(tx - 2, ty - th + 2, tw, th);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx - 2, ty - th + 2, tw, th);
      ctx.fillStyle = d.textColor || '#e6edf3';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(text, tx + 4, ty - 4);
      drawAnchor(ctx, d.x1, d.y1, color);
      break;
    }

    case 'text_box': {
      const x = d.x || d.x1, y = d.y || d.y1;
      const text = d.text || 'Text';
      const lines = text.split('\n');
      const lineH = 16;
      ctx.font = `${d.fontSize || 12}px Inter, sans-serif`;
      const maxW = Math.max(80, ...lines.map(l => ctx.measureText(l).width + 16));
      const boxH = lines.length * lineH + 12;
      // Box
      ctx.fillStyle = 'rgba(22,27,34,0.9)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      const bx = x - 2, by = y - boxH + 4;
      ctx.fillRect(bx, by, maxW, boxH);
      ctx.strokeRect(bx, by, maxW, boxH);
      // Text
      ctx.fillStyle = d.textColor || '#e6edf3';
      ctx.textAlign = 'left';
      lines.forEach((line, i) => {
        ctx.fillText(line, x + 4, y - boxH + 18 + i * lineH);
      });
      break;
    }

    case 'note': {
      const x = d.x || d.x1, y = d.y || d.y1;
      const text = d.text || 'Note';
      const w = d.width || 100, h = d.height || 60;
      const fold = 14;
      // Body
      ctx.fillStyle = colorWithAlpha(d.color || '#ffa657', '25');
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x + w - fold, y);
      ctx.lineTo(x + w, y + fold); ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h); ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = d.color || '#ffa657';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Fold corner
      ctx.beginPath();
      ctx.moveTo(x + w - fold, y);
      ctx.lineTo(x + w - fold, y + fold);
      ctx.lineTo(x + w, y + fold);
      ctx.stroke();
      // Text
      ctx.fillStyle = d.textColor || '#e6edf3';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'left';
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        if (y + 16 + i * 14 < y + h - 4) {
          ctx.fillText(line, x + 6, y + 16 + i * 14);
        }
      });
      break;
    }

    case 'price_label': {
      const price = d.price || 0;
      const y = toY(price);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW - 56, y); ctx.stroke();
      ctx.setLineDash([]);
      // Price box at right edge
      ctx.fillStyle = colorWithAlpha(color, 'dd');
      ctx.fillRect(chartW - 56, y - 10, 56, 20);
      ctx.fillStyle = '#0d1117';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(price.toFixed(2), chartW - 28, y + 4);
      break;
    }

    case 'brush': {
      const pts = d.points || [];
      if (pts.length < 2) break;
      ctx.strokeStyle = color;
      ctx.lineWidth = d.brushWidth || 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      break;
    }

    // ===================  MEASUREMENT & ZONES  ===================

    case 'measure': {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#ffa657';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
      ctx.setLineDash([]);
      [{ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }].forEach(pt => {
        ctx.fillStyle = '#ffa657';
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2); ctx.fill();
      });
      const midX = (d.x1 + d.x2) / 2, midY = (d.y1 + d.y2) / 2;
      ctx.fillStyle = 'rgba(22,27,34,0.9)';
      ctx.fillRect(midX - 2, midY - 32, 130, 28);
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(midX - 2, midY - 32, 130, 28);
      ctx.fillStyle = '#e6edf3';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(d.label || '', midX + 4, midY - 14);
      break;
    }

    case 'price_range': {
      const y1 = d.price1 != null ? toY(d.price1) : d.y1;
      const y2 = d.price2 != null ? toY(d.price2) : d.y2;
      const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
      ctx.fillStyle = colorWithAlpha(color, '15');
      ctx.fillRect(0, yMin, chartW, yMax - yMin);
      ctx.strokeStyle = color;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(chartW, y1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(chartW, y2); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }

    case 'date_range': {
      const x1 = d.barIndex1 != null ? toX(d.barIndex1) : d.x1;
      const x2 = d.barIndex2 != null ? toX(d.barIndex2) : d.x2;
      const xMin = Math.min(x1, x2), xMax = Math.max(x1, x2);
      ctx.fillStyle = colorWithAlpha(color, '15');
      ctx.fillRect(xMin, 0, xMax - xMin, mainH);
      ctx.strokeStyle = color;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, mainH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, mainH); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }

    case 'supply_zone': {
      const zoneColor = d.color || '#f85149';
      const y1 = d.price1 != null ? toY(d.price1) : d.y1;
      const y2 = d.price2 != null ? toY(d.price2) : d.y2;
      const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
      const x1 = d.x1 || 0, x2 = d.x2 || chartW;
      const xMin = Math.min(x1, x2), w = Math.abs(x2 - x1) || chartW;
      ctx.fillStyle = colorWithAlpha(zoneColor, '18');
      ctx.fillRect(xMin, yMin, w, yMax - yMin);
      ctx.strokeStyle = zoneColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(xMin, yMin, w, yMax - yMin);
      // Label
      ctx.fillStyle = zoneColor;
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('SUPPLY', xMin + 6, yMin + 14);
      break;
    }

    case 'demand_zone': {
      const zoneColor = d.color || '#56d364';
      const y1 = d.price1 != null ? toY(d.price1) : d.y1;
      const y2 = d.price2 != null ? toY(d.price2) : d.y2;
      const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
      const x1 = d.x1 || 0, x2 = d.x2 || chartW;
      const xMin = Math.min(x1, x2), w = Math.abs(x2 - x1) || chartW;
      ctx.fillStyle = colorWithAlpha(zoneColor, '18');
      ctx.fillRect(xMin, yMin, w, yMax - yMin);
      ctx.strokeStyle = zoneColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(xMin, yMin, w, yMax - yMin);
      ctx.fillStyle = zoneColor;
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('DEMAND', xMin + 6, yMin + 14);
      break;
    }

    case 'gann_fan': {
      ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(d.x2, d.y2); ctx.stroke();
      const baseDx = d.x2 - d.x1, baseDy = d.y2 - d.y1;
      const baseLen = Math.hypot(baseDx, baseDy);
      if (baseLen === 0) break;
      const gannRatios = [1/8, 1/4, 1/3, 1/2, 1, 2, 3, 4, 8];
      const gannLabels = ['1x8','1x4','1x3','1x2','1x1','2x1','3x1','4x1','8x1'];
      gannRatios.forEach((ratio, i) => {
        const angle = Math.atan2(baseDy * ratio, baseDx);
        const ex = d.x1 + Math.cos(angle) * chartW;
        const ey = d.y1 + Math.sin(angle) * chartW;
        ctx.strokeStyle = FIB_COLORS[i % FIB_COLORS.length];
        ctx.globalAlpha = ratio === 1 ? 1 : 0.45;
        ctx.lineWidth = ratio === 1 ? lw : 1;
        ctx.beginPath(); ctx.moveTo(d.x1, d.y1); ctx.lineTo(ex, ey); ctx.stroke();
        // Label
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = FIB_COLORS[i % FIB_COLORS.length];
        ctx.font = '9px Inter, sans-serif';
        ctx.textAlign = 'left';
        const labelDist = Math.min(baseLen * 0.8, 100);
        const lx = d.x1 + Math.cos(angle) * labelDist;
        const ly = d.y1 + Math.sin(angle) * labelDist;
        ctx.fillText(gannLabels[i], lx + 4, ly - 2);
      });
      ctx.globalAlpha = 1;
      drawAnchor(ctx, d.x1, d.y1, color);
      drawAnchor(ctx, d.x2, d.y2, color);
      break;
    }

    case 'time_cycle': {
      const startX = (d.barIndex != null) ? toX(d.barIndex) : (d.x || d.x1);
      const interval = d.interval || 40;
      ctx.setLineDash([5, 4]);
      for (let x = startX; x <= chartW; x += interval) {
        ctx.strokeStyle = colorWithAlpha(color, '60');
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, mainH); ctx.stroke();
      }
      ctx.setLineDash([]);
      drawAnchor(ctx, startX, mainH / 2, color);
      break;
    }

    case 'sine_line': {
      const startX = (d.barIndex != null) ? toX(d.barIndex) : (d.x || d.x1);
      const amplitude = d.amplitude || mainH * 0.15;
      const wavelength = d.wavelength || 120;
      const centerY = d.centerY || mainH / 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      for (let px = startX; px <= chartW; px += 1) {
        const sy = centerY + amplitude * Math.sin(((px - startX) / wavelength) * Math.PI * 2);
        if (px === startX) ctx.moveTo(px, sy);
        else ctx.lineTo(px, sy);
      }
      ctx.stroke();
      drawAnchor(ctx, startX, centerY, color);
      break;
    }

    // ===================  PATTERN RECOGNITION  ===================

    case 'triple_top': {
      // 4 points: 3 peaks + 1 neckline y-reference
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        { x: d.x3, y: d.y3 }, { x: d.x4, y: d.y4 },
      ];
      const validPts = pts.filter(p => p && p.x != null && p.y != null);
      if (validPts.length < 3) break;
      // Connect peaks
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      for (let i = 1; i < validPts.length; i++) ctx.lineTo(validPts[i].x, validPts[i].y);
      ctx.stroke();
      // Neckline
      if (validPts.length >= 4) {
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = '#ffa657';
        ctx.beginPath();
        ctx.moveTo(validPts[0].x, validPts[3].y);
        ctx.lineTo(validPts[2].x, validPts[3].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      validPts.forEach((p, i) => drawAnchor(ctx, p.x, p.y, color));
      break;
    }

    case 'cup_handle': {
      // 4 points: left rim, cup bottom, right rim, handle low
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        { x: d.x3, y: d.y3 }, { x: d.x4, y: d.y4 },
      ];
      const validPts = pts.filter(p => p && p.x != null && p.y != null);
      if (validPts.length < 3) break;
      // Cup curve
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      ctx.quadraticCurveTo(validPts[1].x, validPts[1].y, validPts[2].x, validPts[2].y);
      ctx.stroke();
      // Handle
      if (validPts.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(validPts[2].x, validPts[2].y);
        ctx.quadraticCurveTo(validPts[3].x, validPts[3].y, validPts[3].x + (validPts[3].x - validPts[2].x) * 0.5, validPts[2].y);
        ctx.stroke();
      }
      // Fill
      ctx.fillStyle = colorWithAlpha(color, '0c');
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      ctx.quadraticCurveTo(validPts[1].x, validPts[1].y, validPts[2].x, validPts[2].y);
      ctx.lineTo(validPts[0].x, validPts[0].y);
      ctx.fill();
      validPts.forEach(p => drawAnchor(ctx, p.x, p.y, color));
      break;
    }

    case 'projection': {
      // 4 points: source pattern (P1-P3), projection start (P4)
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        { x: d.x3, y: d.y3 }, { x: d.x4, y: d.y4 },
      ];
      const validPts = pts.filter(p => p && p.x != null && p.y != null);
      if (validPts.length < 3) break;
      // Source pattern (solid)
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      for (let i = 1; i < Math.min(3, validPts.length); i++) ctx.lineTo(validPts[i].x, validPts[i].y);
      ctx.stroke();
      // Projected forward (dashed)
      if (validPts.length >= 4) {
        const offsetX = validPts[3].x - validPts[0].x;
        const offsetY = validPts[3].y - validPts[0].y;
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(validPts[0].x + offsetX, validPts[0].y + offsetY);
        for (let i = 1; i < 3; i++) {
          ctx.lineTo(validPts[i].x + offsetX, validPts[i].y + offsetY);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      validPts.forEach(p => drawAnchor(ctx, p.x, p.y, color));
      break;
    }

    case 'ghost_feed': {
      // Semi-transparent projected candles from a start point
      const startIdx = d.barIndex || 0;
      const numBars = d.numBars || 20;
      if (!data || data.length === 0) break;
      // Repeat last N bars as ghost
      const srcStart = Math.max(0, data.length - numBars);
      ctx.globalAlpha = 0.18;
      for (let i = 0; i < numBars && srcStart + i < data.length; i++) {
        const bar = data[srcStart + i];
        if (!bar) continue;
        const gx = toX(data.length + i);
        if (gx > chartW) break;
        const bull = bar.close >= bar.open;
        ctx.fillStyle = bull ? '#56d364' : '#f85149';
        ctx.strokeStyle = bull ? '#56d364' : '#f85149';
        ctx.lineWidth = 1;
        const oY = toY(bar.open), cY = toY(bar.close), hY = toY(bar.high), lY = toY(bar.low);
        // Wick
        ctx.beginPath(); ctx.moveTo(gx, hY); ctx.lineTo(gx, lY); ctx.stroke();
        // Body
        const bodyTop = Math.min(oY, cY), bodyH = Math.max(1, Math.abs(cY - oY));
        ctx.fillRect(gx - 3, bodyTop, 6, bodyH);
      }
      ctx.globalAlpha = 1;
      break;
    }

    case 'rising_wedge': {
      // 4 points: upper line (P1, P2), lower line (P3, P4)
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        { x: d.x3, y: d.y3 }, { x: d.x4, y: d.y4 },
      ];
      const validPts = pts.filter(p => p && p.x != null && p.y != null);
      if (validPts.length < 4) break;
      // Upper trend line
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(validPts[0].x, validPts[0].y); ctx.lineTo(validPts[1].x, validPts[1].y); ctx.stroke();
      // Lower trend line
      ctx.beginPath(); ctx.moveTo(validPts[2].x, validPts[2].y); ctx.lineTo(validPts[3].x, validPts[3].y); ctx.stroke();
      // Fill between
      ctx.fillStyle = colorWithAlpha(color, '10');
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      ctx.lineTo(validPts[1].x, validPts[1].y);
      ctx.lineTo(validPts[3].x, validPts[3].y);
      ctx.lineTo(validPts[2].x, validPts[2].y);
      ctx.closePath();
      ctx.fill();
      // Convergence point
      const ix = _lineIntersect(validPts[0], validPts[1], validPts[2], validPts[3]);
      if (ix) {
        ctx.setLineDash([2, 2]);
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.moveTo(validPts[1].x, validPts[1].y); ctx.lineTo(ix.x, ix.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(validPts[3].x, validPts[3].y); ctx.lineTo(ix.x, ix.y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      validPts.forEach(p => drawAnchor(ctx, p.x, p.y, color));
      drawLabel(ctx, 'Rising Wedge', (validPts[0].x + validPts[1].x) / 2, Math.min(validPts[0].y, validPts[1].y), color);
      break;
    }

    case 'falling_wedge': {
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        { x: d.x3, y: d.y3 }, { x: d.x4, y: d.y4 },
      ];
      const validPts = pts.filter(p => p && p.x != null && p.y != null);
      if (validPts.length < 4) break;
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(validPts[0].x, validPts[0].y); ctx.lineTo(validPts[1].x, validPts[1].y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(validPts[2].x, validPts[2].y); ctx.lineTo(validPts[3].x, validPts[3].y); ctx.stroke();
      ctx.fillStyle = colorWithAlpha(color, '10');
      ctx.beginPath();
      ctx.moveTo(validPts[0].x, validPts[0].y);
      ctx.lineTo(validPts[1].x, validPts[1].y);
      ctx.lineTo(validPts[3].x, validPts[3].y);
      ctx.lineTo(validPts[2].x, validPts[2].y);
      ctx.closePath();
      ctx.fill();
      const ix = _lineIntersect(validPts[0], validPts[1], validPts[2], validPts[3]);
      if (ix) {
        ctx.setLineDash([2, 2]);
        ctx.globalAlpha = 0.4;
        ctx.beginPath(); ctx.moveTo(validPts[1].x, validPts[1].y); ctx.lineTo(ix.x, ix.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(validPts[3].x, validPts[3].y); ctx.lineTo(ix.x, ix.y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }
      validPts.forEach(p => drawAnchor(ctx, p.x, p.y, color));
      drawLabel(ctx, 'Falling Wedge', (validPts[0].x + validPts[1].x) / 2, Math.min(validPts[0].y, validPts[1].y), color);
      break;
    }

    default:
      break;
  }

  ctx.restore();
}

/** Line-line intersection of segments (p1->p2) and (p3->p4). Returns {x,y} or null. */
function _lineIntersect(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

// ============================================
//  HIT-TEST DRAWING
// ============================================

/**
 * Test if a mouse position (mx, my) is within interaction range of a drawing.
 *
 * @returns {boolean}
 */
export function hitTestDrawing(drawing, mx, my, chartW, mainH, min, range, data, toX, toY) {
  const d = drawing;
  const R = HIT_RADIUS;

  switch (d.type) {

    // --- Lines ---

    case 'trendline':
      return ptSegDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R;

    case 'horizontal': {
      const y = toY(d.price);
      return Math.abs(my - y) < R && mx >= 0 && mx <= chartW;
    }

    case 'vertical': {
      const x = (d.barIndex != null) ? toX(d.barIndex) : d.x;
      return Math.abs(mx - x) < R && my >= 0 && my <= mainH;
    }

    case 'ray': {
      const [ex, ey] = extendToEdge(d.x1, d.y1, d.x2, d.y2, chartW, mainH);
      return ptSegDist(mx, my, d.x1, d.y1, ex, ey) < R;
    }

    case 'extended':
      return ptLineDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R;

    case 'parallel_channel': {
      const dx = (d.x3 || d.x1) - d.x1, dy = (d.y3 || d.y1) - d.y1;
      if (ptSegDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R) return true;
      if (ptSegDist(mx, my, d.x1 + dx, d.y1 + dy, d.x2 + dx, d.y2 + dy) < R) return true;
      // Check inside
      return _pointInQuad(mx, my, d.x1, d.y1, d.x2, d.y2, d.x2 + dx, d.y2 + dy, d.x1 + dx, d.y1 + dy);
    }

    case 'trend_channel': {
      const dx = (d.x3 || d.x1) - d.x1, dy = (d.y3 || d.y1) - d.y1;
      if (ptLineDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R) return true;
      if (ptLineDist(mx, my, d.x1 + dx, d.y1 + dy, d.x2 + dx, d.y2 + dy) < R) return true;
      return false;
    }

    case 'arrow':
      return ptSegDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R;

    // --- Fibonacci ---

    case 'fibonacci': {
      const pBegin = d.price1, pEnd = d.price2;
      const pRange = pEnd - pBegin;
      const xMin = Math.min(d.x1, d.x2), xMax = Math.max(d.x1, d.x2);
      const props = d.props || {};
      const xStart = (props.leftExtension === 'On') ? 0 : xMin;
      const xEnd   = (props.rightExtension === 'On') ? chartW : xMax;
      if (mx < xStart - R || mx > xEnd + R) return false;
      const ys = FIB_LEVELS.map(l => toY(pBegin + pRange * l));
      const yMin = Math.min(...ys), yMax = Math.max(...ys);
      return my >= yMin - R && my <= yMax + R;
    }

    case 'fib_extension':
    case 'fib_fan':
    case 'fib_arc':
      if (ptDist(mx, my, d.x1, d.y1) < R || ptDist(mx, my, d.x2, d.y2) < R) return true;
      if (d.x3 != null && ptDist(mx, my, d.x3, d.y3) < R) return true;
      return ptSegDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R * 2;

    case 'fib_timezone': {
      const startX = (d.barIndex1 != null) ? toX(d.barIndex1) : d.x1;
      return ptDist(mx, my, startX, mainH / 2) < R * 2;
    }

    case 'pitchfork': {
      if (ptDist(mx, my, d.x1, d.y1) < R) return true;
      if (ptDist(mx, my, d.x2, d.y2) < R) return true;
      if (d.x3 != null && ptDist(mx, my, d.x3, d.y3) < R) return true;
      const mmx = (d.x2 + (d.x3 || d.x2)) / 2, mmy = (d.y2 + (d.y3 || d.y2)) / 2;
      return ptSegDist(mx, my, d.x1, d.y1, mmx, mmy) < R;
    }

    // --- Harmonic / patterns with points arrays ---

    case 'gartley':
    case 'butterfly':
    case 'bat':
    case 'crab':
    case 'head_shoulders':
    case 'elliott_wave':
    case 'triple_top':
    case 'cup_handle':
    case 'projection':
    case 'rising_wedge':
    case 'falling_wedge': {
      const pts = d.points || [
        d.x1 != null ? { x: d.x1, y: d.y1 } : null,
        d.x2 != null ? { x: d.x2, y: d.y2 } : null,
        d.x3 != null ? { x: d.x3, y: d.y3 } : null,
        d.x4 != null ? { x: d.x4, y: d.y4 } : null,
        d.x5 != null ? { x: d.x5, y: d.y5 } : null,
      ].filter(Boolean);
      // Anchor point proximity
      for (const p of pts) {
        if (ptDist(mx, my, p.x, p.y) < R) return true;
      }
      // Line segment proximity
      for (let i = 0; i < pts.length - 1; i++) {
        if (ptSegDist(mx, my, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < R) return true;
      }
      return false;
    }

    // --- Geometric ---

    case 'rectangle': {
      const rx = Math.min(d.x1, d.x2), ry = Math.min(d.y1, d.y2);
      const rw = Math.abs(d.x2 - d.x1), rh = Math.abs(d.y2 - d.y1);
      return mx >= rx - R && mx <= rx + rw + R && my >= ry - R && my <= ry + rh + R;
    }

    case 'ellipse': {
      const cx = (d.x1 + d.x2) / 2, cy = (d.y1 + d.y2) / 2;
      const rx = Math.abs(d.x2 - d.x1) / 2, ry = Math.abs(d.y2 - d.y1) / 2;
      if (rx === 0 || ry === 0) return false;
      const v = ((mx - cx) / rx) ** 2 + ((my - cy) / ry) ** 2;
      return v <= 1.3; // slightly larger for easier selection
    }

    case 'triangle': {
      const pts = [
        { x: d.x1, y: d.y1 },
        { x: d.x2, y: d.y2 },
        { x: d.x3 || d.x1, y: d.y3 || d.y1 },
      ];
      for (const p of pts) if (ptDist(mx, my, p.x, p.y) < R) return true;
      for (let i = 0; i < 3; i++) {
        const j = (i + 1) % 3;
        if (ptSegDist(mx, my, pts[i].x, pts[i].y, pts[j].x, pts[j].y) < R) return true;
      }
      return false;
    }

    case 'polyline': {
      const pts = d.points || [];
      for (const p of pts) if (ptDist(mx, my, p.x, p.y) < R) return true;
      for (let i = 0; i < pts.length - 1; i++) {
        if (ptSegDist(mx, my, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < R) return true;
      }
      return false;
    }

    case 'path': {
      // Approximate: check anchor points and line between first/last
      const pts = d.points || [
        { x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 },
        d.x3 != null ? { x: d.x3, y: d.y3 } : null,
        d.x4 != null ? { x: d.x4, y: d.y4 } : null,
      ].filter(Boolean);
      for (const p of pts) if (ptDist(mx, my, p.x, p.y) < R) return true;
      // Rough bounding box
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      return mx >= Math.min(...xs) - R && mx <= Math.max(...xs) + R &&
             my >= Math.min(...ys) - R && my <= Math.max(...ys) + R;
    }

    case 'flag': {
      const x = d.x || d.x1, y = d.y || d.y1;
      return ptDist(mx, my, x, y) < R * 2;
    }

    case 'cross_mark':
    case 'check_mark': {
      const x = d.x || d.x1, y = d.y || d.y1;
      return ptDist(mx, my, x, y) < R * 1.5;
    }

    // --- Annotation ---

    case 'text': {
      const x = d.x || d.x1, y = d.y || d.y1;
      const approxW = (d.text || '').length * 7;
      return mx >= x - 4 && mx <= x + approxW + 4 && my >= y - 16 && my <= y + 4;
    }

    case 'callout':
      if (ptDist(mx, my, d.x1, d.y1) < R) return true;
      return ptSegDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R;

    case 'text_box':
    case 'note': {
      const x = d.x || d.x1, y = d.y || d.y1;
      const w = d.width || 100, h = d.height || 60;
      return mx >= x - 4 && mx <= x + w + 4 && my >= y - 4 && my <= y + h + 4;
    }

    case 'price_label': {
      const y = toY(d.price || 0);
      return Math.abs(my - y) < R;
    }

    case 'brush': {
      const pts = d.points || [];
      for (const p of pts) if (ptDist(mx, my, p.x, p.y) < R) return true;
      return false;
    }

    // --- Measurement & Zones ---

    case 'measure':
      if (ptDist(mx, my, d.x1, d.y1) < R || ptDist(mx, my, d.x2, d.y2) < R) return true;
      return ptSegDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R;

    case 'price_range': {
      const y1 = d.price1 != null ? toY(d.price1) : d.y1;
      const y2 = d.price2 != null ? toY(d.price2) : d.y2;
      const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
      return my >= yMin - R && my <= yMax + R && mx >= 0 && mx <= chartW;
    }

    case 'date_range': {
      const x1 = d.barIndex1 != null ? toX(d.barIndex1) : d.x1;
      const x2 = d.barIndex2 != null ? toX(d.barIndex2) : d.x2;
      const xMin = Math.min(x1, x2), xMax = Math.max(x1, x2);
      return mx >= xMin - R && mx <= xMax + R && my >= 0 && my <= mainH;
    }

    case 'supply_zone':
    case 'demand_zone': {
      const y1 = d.price1 != null ? toY(d.price1) : d.y1;
      const y2 = d.price2 != null ? toY(d.price2) : d.y2;
      const yMin = Math.min(y1, y2), yMax = Math.max(y1, y2);
      const x1 = d.x1 || 0, x2 = d.x2 || chartW;
      return mx >= Math.min(x1, x2) - R && mx <= Math.max(x1, x2) + R &&
             my >= yMin - R && my <= yMax + R;
    }

    case 'gann_fan':
      if (ptDist(mx, my, d.x1, d.y1) < R || ptDist(mx, my, d.x2, d.y2) < R) return true;
      return ptSegDist(mx, my, d.x1, d.y1, d.x2, d.y2) < R * 2;

    case 'time_cycle': {
      const startX = (d.barIndex != null) ? toX(d.barIndex) : (d.x || d.x1);
      return ptDist(mx, my, startX, mainH / 2) < R * 2;
    }

    case 'sine_line': {
      const startX = (d.barIndex != null) ? toX(d.barIndex) : (d.x || d.x1);
      const centerY = d.centerY || mainH / 2;
      return ptDist(mx, my, startX, centerY) < R * 2;
    }

    case 'ghost_feed':
      return false; // non-interactive overlay

    default:
      return false;
  }
}

/** Rough point-in-quadrilateral test (convex assumed). */
function _pointInQuad(px, py, x1, y1, x2, y2, x3, y3, x4, y4) {
  function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
  const pts = [[x1, y1], [x2, y2], [x3, y3], [x4, y4]];
  let pos = 0, neg = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % 4];
    const c = cross(bx - ax, by - ay, px - ax, py - ay);
    if (c > 0) pos++;
    else if (c < 0) neg++;
  }
  return pos === 0 || neg === 0;
}
