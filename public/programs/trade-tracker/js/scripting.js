// ============================================
// Custom Scripting Engine — Pine Script-like DSL
// Lightweight AST interpreter for custom indicators
// No eval — safe tokenizer → parser → executor
// ============================================

const STORAGE_KEY = 'tt_custom_scripts';

// ─── Token Types ───
const T = {
  NUM: 'NUM', STR: 'STR', COLOR: 'COLOR', IDENT: 'IDENT',
  OP: 'OP', LPAREN: 'LPAREN', RPAREN: 'RPAREN', COMMA: 'COMMA',
  EQ: 'EQ', QUESTION: 'QUESTION', COLON: 'COLON', EOF: 'EOF',
  NEWLINE: 'NEWLINE',
};

// ─── Tokenizer ───
function tokenize(source) {
  const tokens = [];
  let i = 0;
  const len = source.length;

  while (i < len) {
    // Skip spaces/tabs
    if (source[i] === ' ' || source[i] === '\t') { i++; continue; }

    // Newlines
    if (source[i] === '\n' || source[i] === '\r') {
      if (source[i] === '\r' && source[i + 1] === '\n') i++;
      tokens.push({ type: T.NEWLINE, value: '\n' });
      i++; continue;
    }

    // Comments
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < len && source[i] !== '\n') i++;
      continue;
    }

    // Strings
    if (source[i] === '"' || source[i] === "'") {
      const q = source[i]; let s = ''; i++;
      while (i < len && source[i] !== q) { s += source[i]; i++; }
      if (i < len) i++; // closing quote
      tokens.push({ type: T.STR, value: s });
      continue;
    }

    // Colors: #rrggbb or #rrggbbaa
    if (source[i] === '#') {
      let c = '#'; i++;
      while (i < len && /[0-9a-fA-F]/.test(source[i])) { c += source[i]; i++; }
      tokens.push({ type: T.COLOR, value: c });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(source[i]) || (source[i] === '.' && i + 1 < len && /[0-9]/.test(source[i + 1]))) {
      let n = '';
      while (i < len && /[0-9.]/.test(source[i])) { n += source[i]; i++; }
      tokens.push({ type: T.NUM, value: parseFloat(n) });
      continue;
    }

    // Two-char operators
    const two = source[i] + (source[i + 1] || '');
    if (['>=', '<=', '==', '!='].includes(two)) {
      tokens.push({ type: T.OP, value: two }); i += 2; continue;
    }

    // Single-char tokens
    if (source[i] === '(') { tokens.push({ type: T.LPAREN }); i++; continue; }
    if (source[i] === ')') { tokens.push({ type: T.RPAREN }); i++; continue; }
    if (source[i] === ',') { tokens.push({ type: T.COMMA }); i++; continue; }
    if (source[i] === '?') { tokens.push({ type: T.QUESTION }); i++; continue; }
    if (source[i] === ':') { tokens.push({ type: T.COLON }); i++; continue; }
    if (source[i] === '=') { tokens.push({ type: T.EQ }); i++; continue; }
    if (['+', '-', '*', '/', '>', '<'].includes(source[i])) {
      tokens.push({ type: T.OP, value: source[i] }); i++; continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(source[i])) {
      let id = '';
      while (i < len && /[a-zA-Z0-9_]/.test(source[i])) { id += source[i]; i++; }
      if (id === 'and' || id === 'or' || id === 'not') {
        tokens.push({ type: T.OP, value: id });
      } else if (id === 'true') {
        tokens.push({ type: T.NUM, value: 1 });
      } else if (id === 'false') {
        tokens.push({ type: T.NUM, value: 0 });
      } else if (id === 'transparent') {
        tokens.push({ type: T.COLOR, value: 'transparent' });
      } else {
        tokens.push({ type: T.IDENT, value: id });
      }
      continue;
    }

    // Unknown character — skip
    i++;
  }

  tokens.push({ type: T.EOF });
  return tokens;
}

// ─── Parser ───
// Produces AST: { name, overlay, statements[] }

function parse(tokens) {
  let pos = 0;
  const ast = { name: 'Custom Indicator', overlay: false, statements: [] };

  function peek() { return tokens[pos] || { type: T.EOF }; }
  function advance() { return tokens[pos++] || { type: T.EOF }; }
  function expect(type) {
    const t = advance();
    if (t.type !== type) throw new Error(`Expected ${type}, got ${t.type} (${t.value})`);
    return t;
  }
  function match(type, value) {
    const t = peek();
    if (t.type === type && (value === undefined || t.value === value)) { advance(); return true; }
    return false;
  }

  function skipNewlines() {
    while (peek().type === T.NEWLINE) advance();
  }

  // ── Expression parsing (precedence climbing) ──

  function parseExpr() { return parseTernary(); }

  function parseTernary() {
    let expr = parseOr();
    if (match(T.QUESTION)) {
      const trueExpr = parseExpr();
      expect(T.COLON);
      const falseExpr = parseExpr();
      return { type: 'ternary', condition: expr, trueExpr, falseExpr };
    }
    return expr;
  }

  function parseOr() {
    let left = parseAnd();
    while (peek().type === T.OP && peek().value === 'or') {
      advance(); left = { type: 'binary', op: 'or', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd() {
    let left = parseComparison();
    while (peek().type === T.OP && peek().value === 'and') {
      advance(); left = { type: 'binary', op: 'and', left, right: parseComparison() };
    }
    return left;
  }

  function parseComparison() {
    let left = parseAddSub();
    while (peek().type === T.OP && ['>', '<', '>=', '<=', '==', '!='].includes(peek().value)) {
      const op = advance().value;
      left = { type: 'binary', op, left, right: parseAddSub() };
    }
    return left;
  }

  function parseAddSub() {
    let left = parseMulDiv();
    while (peek().type === T.OP && (peek().value === '+' || peek().value === '-')) {
      const op = advance().value;
      left = { type: 'binary', op, left, right: parseMulDiv() };
    }
    return left;
  }

  function parseMulDiv() {
    let left = parseUnary();
    while (peek().type === T.OP && (peek().value === '*' || peek().value === '/')) {
      const op = advance().value;
      left = { type: 'binary', op, left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary() {
    if (peek().type === T.OP && peek().value === '-') {
      advance();
      return { type: 'unary', op: '-', expr: parseUnary() };
    }
    if (peek().type === T.OP && peek().value === 'not') {
      advance();
      return { type: 'unary', op: 'not', expr: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();

    // Number
    if (t.type === T.NUM) { advance(); return { type: 'number', value: t.value }; }

    // String
    if (t.type === T.STR) { advance(); return { type: 'string', value: t.value }; }

    // Color
    if (t.type === T.COLOR) { advance(); return { type: 'color', value: t.value }; }

    // Parenthesized expression
    if (t.type === T.LPAREN) {
      advance();
      const expr = parseExpr();
      expect(T.RPAREN);
      return expr;
    }

    // Identifier or function call
    if (t.type === T.IDENT) {
      advance();
      const name = t.value;
      if (peek().type === T.LPAREN) {
        advance(); // consume '('
        const args = [];
        const kwargs = {};
        if (peek().type !== T.RPAREN) {
          // Check for keyword argument: ident=expr
          const parseArg = () => {
            // Look ahead for `ident =`
            if (peek().type === T.IDENT && tokens[pos + 1] && tokens[pos + 1].type === T.EQ) {
              const key = advance().value;
              advance(); // consume '='
              kwargs[key] = parseExpr();
            } else {
              args.push(parseExpr());
            }
          };
          parseArg();
          while (match(T.COMMA)) parseArg();
        }
        expect(T.RPAREN);
        return { type: 'call', name, args, kwargs };
      }
      return { type: 'ident', name };
    }

    throw new Error(`Unexpected token: ${t.type} (${t.value})`);
  }

  // ── Statement parsing ──

  function parseStatement() {
    const t = peek();

    // indicator("name", overlay=true/false)
    if (t.type === T.IDENT && t.value === 'indicator') {
      advance();
      expect(T.LPAREN);
      const nameToken = advance();
      if (nameToken.type === T.STR) ast.name = nameToken.value;
      while (match(T.COMMA)) {
        if (peek().type === T.IDENT && peek().value === 'overlay') {
          advance(); expect(T.EQ);
          const val = advance();
          ast.overlay = val.value === 'true' || val.value === 1;
        } else {
          parseExpr(); // skip unknown kwargs
        }
      }
      expect(T.RPAREN);
      return { type: 'indicator' };
    }

    // plot(series, "label", color=..., linewidth=...)
    if (t.type === T.IDENT && t.value === 'plot') {
      advance(); expect(T.LPAREN);
      const series = parseExpr();
      let label = null, color = '#58a6ff', linewidth = 1.5;
      while (match(T.COMMA)) {
        if (peek().type === T.STR) {
          label = advance().value;
        } else if (peek().type === T.IDENT && peek().value === 'color') {
          advance(); expect(T.EQ); color = parseExpr();
        } else if (peek().type === T.IDENT && peek().value === 'linewidth') {
          advance(); expect(T.EQ); linewidth = parseExpr();
        } else if (peek().type === T.COLOR) {
          color = parseExpr();
        } else {
          parseExpr();
        }
      }
      expect(T.RPAREN);
      return { type: 'plot', series, label, color, linewidth };
    }

    // hline(value, "label", color=...)
    if (t.type === T.IDENT && t.value === 'hline') {
      advance(); expect(T.LPAREN);
      const value = parseExpr();
      let label = null, color = 'rgba(139,148,158,0.4)';
      while (match(T.COMMA)) {
        if (peek().type === T.STR) {
          label = advance().value;
        } else if (peek().type === T.IDENT && peek().value === 'color') {
          advance(); expect(T.EQ); color = parseExpr();
        } else {
          parseExpr();
        }
      }
      expect(T.RPAREN);
      return { type: 'hline', value, label, color };
    }

    // bgcolor(colorExpr)
    if (t.type === T.IDENT && t.value === 'bgcolor') {
      advance(); expect(T.LPAREN);
      const colorExpr = parseExpr();
      expect(T.RPAREN);
      return { type: 'bgcolor', color: colorExpr };
    }

    // Assignment: varName = expr
    if (t.type === T.IDENT && tokens[pos + 1] && tokens[pos + 1].type === T.EQ) {
      const name = advance().value;
      advance(); // consume '='
      const expr = parseExpr();
      return { type: 'assign', name, expr };
    }

    // Bare expression (function call as statement)
    const expr = parseExpr();
    return { type: 'expr', expr };
  }

  // Main parse loop
  skipNewlines();
  while (peek().type !== T.EOF) {
    try {
      const stmt = parseStatement();
      if (stmt.type !== 'indicator') ast.statements.push(stmt);
    } catch (e) {
      throw new Error(`Parse error at token ${pos}: ${e.message}`);
    }
    skipNewlines();
  }

  return ast;
}

// ─── Built-in indicator math ───

function _sma(values, period) {
  const n = values.length;
  const result = new Array(n).fill(null);
  for (let i = period - 1; i < n; i++) {
    let sum = 0, valid = true;
    for (let j = i - period + 1; j <= i; j++) {
      if (values[j] === null || values[j] === undefined) { valid = false; break; }
      sum += values[j];
    }
    if (valid) result[i] = sum / period;
  }
  return result;
}

function _ema(values, period) {
  const n = values.length;
  const result = new Array(n).fill(null);
  const k = 2 / (period + 1);
  let sum = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (values[i] === null || values[i] === undefined) continue;
    if (count < period) {
      sum += values[i]; count++;
      if (count === period) result[i] = sum / period;
    } else {
      result[i] = values[i] * k + result[i - 1] * (1 - k);
    }
  }
  return result;
}

function _wma(values, period) {
  const n = values.length;
  const result = new Array(n).fill(null);
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - period + 1 + j] * (j + 1);
    result[i] = sum / denom;
  }
  return result;
}

function _rsi(values, period) {
  const n = values.length;
  const result = new Array(n).fill(null);
  if (n < period + 1) return result;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gainSum += delta; else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < n; i++) {
    const delta = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function _macd(values, fast = 12, slow = 26, signal = 9) {
  const emaFast = _ema(values, fast);
  const emaSlow = _ema(values, slow);
  const n = values.length;
  const macdLine = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) macdLine[i] = emaFast[i] - emaSlow[i];
  }
  const signalLine = _ema(macdLine, signal);
  const histogram = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (macdLine[i] !== null && signalLine[i] !== null) histogram[i] = macdLine[i] - signalLine[i];
  }
  return { macd: macdLine, signal: signalLine, histogram };
}

function _bb(values, length = 20, mult = 2) {
  const mid = _sma(values, length);
  const n = values.length;
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);
  for (let i = length - 1; i < n; i++) {
    if (mid[i] === null) continue;
    let sumSq = 0;
    for (let j = i - length + 1; j <= i; j++) sumSq += (values[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sumSq / length);
    upper[i] = mid[i] + mult * sd;
    lower[i] = mid[i] - mult * sd;
  }
  return { upper, middle: mid, lower };
}

function _atr(data, length = 14) {
  const n = data.length;
  const tr = new Array(n).fill(0);
  tr[0] = data[0].high - data[0].low;
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      data[i].high - data[i].low,
      Math.abs(data[i].high - data[i - 1].close),
      Math.abs(data[i].low - data[i - 1].close)
    );
  }
  // Wilder smoothing
  const result = new Array(n).fill(null);
  if (n < length) return result;
  let sum = 0;
  for (let i = 0; i < length; i++) sum += tr[i];
  result[length - 1] = sum / length;
  for (let i = length; i < n; i++) {
    result[i] = (result[i - 1] * (length - 1) + tr[i]) / length;
  }
  return result;
}

function _stoch(data, length = 14, smoothK = 3, smoothD = 3) {
  const n = data.length;
  const rawK = new Array(n).fill(null);
  for (let i = length - 1; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      hi = Math.max(hi, data[j].high);
      lo = Math.min(lo, data[j].low);
    }
    rawK[i] = hi === lo ? 50 : ((data[i].close - lo) / (hi - lo)) * 100;
  }
  const k = _sma(rawK, smoothK);
  const d = _sma(k, smoothD);
  return { k, d };
}

function _cross(a, b) {
  const n = Math.min(a.length, b.length);
  const result = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (a[i] === null || b[i] === null || a[i - 1] === null || b[i - 1] === null) { result[i] = 0; continue; }
    result[i] = (a[i - 1] <= b[i - 1] && a[i] > b[i]) || (a[i - 1] >= b[i - 1] && a[i] < b[i]) ? 1 : 0;
  }
  return result;
}

function _crossover(a, b) {
  const n = Math.min(a.length, b.length);
  const result = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (a[i] === null || b[i] === null || a[i - 1] === null || b[i - 1] === null) { result[i] = 0; continue; }
    result[i] = (a[i - 1] <= b[i - 1] && a[i] > b[i]) ? 1 : 0;
  }
  return result;
}

function _crossunder(a, b) {
  const n = Math.min(a.length, b.length);
  const result = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (a[i] === null || b[i] === null || a[i - 1] === null || b[i - 1] === null) { result[i] = 0; continue; }
    result[i] = (a[i - 1] >= b[i - 1] && a[i] < b[i]) ? 1 : 0;
  }
  return result;
}

function _highest(values, length) {
  const n = values.length;
  const result = new Array(n).fill(null);
  for (let i = length - 1; i < n; i++) {
    let mx = -Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      if (values[j] !== null) mx = Math.max(mx, values[j]);
    }
    result[i] = mx === -Infinity ? null : mx;
  }
  return result;
}

function _lowest(values, length) {
  const n = values.length;
  const result = new Array(n).fill(null);
  for (let i = length - 1; i < n; i++) {
    let mn = Infinity;
    for (let j = i - length + 1; j <= i; j++) {
      if (values[j] !== null) mn = Math.min(mn, values[j]);
    }
    result[i] = mn === Infinity ? null : mn;
  }
  return result;
}

// ─── Executor ───

export function executeScript(ast, data) {
  const n = data.length;
  if (n === 0) return { type: 'panel', lines: [], zones: [], fills: [] };

  // Pre-compute built-in series
  const builtinSeries = {
    open:   data.map(d => d.open),
    high:   data.map(d => d.high),
    low:    data.map(d => d.low),
    close:  data.map(d => d.close),
    volume: data.map(d => d.volume),
    hl2:    data.map(d => (d.high + d.low) / 2),
    hlc3:   data.map(d => (d.high + d.low + d.close) / 3),
    ohlc4:  data.map(d => (d.open + d.high + d.low + d.close) / 4),
  };

  const vars = {};
  const result = {
    type: ast.overlay ? 'overlay' : 'panel',
    lines: [],
    zones: [],
    fills: [],
  };

  // Helpers: convert scalar to series, series-aware ops
  function toSeries(v) {
    if (Array.isArray(v)) return v;
    return new Array(n).fill(v);
  }

  function isSeries(v) { return Array.isArray(v); }

  function resolveScalar(v) {
    if (Array.isArray(v)) return v[v.length - 1]; // last value
    return v;
  }

  function resolveSeriesArg(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'number') return new Array(n).fill(v);
    return new Array(n).fill(null);
  }

  function binaryOp(op, a, b) {
    const aIsArr = isSeries(a), bIsArr = isSeries(b);
    if (!aIsArr && !bIsArr) return scalarBinaryOp(op, a, b);
    const as = toSeries(a), bs = toSeries(b);
    const out = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const av = as[i], bv = bs[i];
      if (av === null || av === undefined || bv === null || bv === undefined) continue;
      out[i] = scalarBinaryOp(op, av, bv);
    }
    return out;
  }

  function scalarBinaryOp(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b === 0 ? null : a / b;
      case '>': return a > b ? 1 : 0;
      case '<': return a < b ? 1 : 0;
      case '>=': return a >= b ? 1 : 0;
      case '<=': return a <= b ? 1 : 0;
      case '==': return a === b ? 1 : 0;
      case '!=': return a !== b ? 1 : 0;
      case 'and': return (a && b) ? 1 : 0;
      case 'or': return (a || b) ? 1 : 0;
      default: return null;
    }
  }

  function ternaryOp(cond, trueVal, falseVal) {
    const cIsArr = isSeries(cond), tIsArr = isSeries(trueVal), fIsArr = isSeries(falseVal);
    if (!cIsArr && !tIsArr && !fIsArr) return cond ? trueVal : falseVal;
    const cs = toSeries(cond), ts = toSeries(trueVal), fs = toSeries(falseVal);
    const out = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      out[i] = cs[i] ? ts[i] : fs[i];
    }
    return out;
  }

  // Built-in function dispatch
  function callBuiltin(name, args, kwargs) {
    switch (name) {
      case 'sma': return _sma(resolveSeriesArg(args[0]), resolveScalar(args[1]) || 20);
      case 'ema': return _ema(resolveSeriesArg(args[0]), resolveScalar(args[1]) || 12);
      case 'wma': return _wma(resolveSeriesArg(args[0]), resolveScalar(args[1]) || 20);
      case 'rsi': return _rsi(resolveSeriesArg(args[0]), resolveScalar(args[1]) || 14);
      case 'macd': {
        const src = resolveSeriesArg(args[0]);
        const fast = resolveScalar(args[1]) || 12;
        const slow = resolveScalar(args[2]) || 26;
        const sig = resolveScalar(args[3]) || 9;
        return _macd(src, fast, slow, sig);
      }
      case 'bb': {
        const src = resolveSeriesArg(args[0]);
        const len = resolveScalar(args[1]) || 20;
        const mult = resolveScalar(args[2]) || 2;
        return _bb(src, len, mult);
      }
      case 'atr': return _atr(data, resolveScalar(args[0]) || 14);
      case 'stoch': {
        const len = resolveScalar(args[0]) || 14;
        const sk = resolveScalar(args[1]) || 3;
        const sd = resolveScalar(args[2]) || 3;
        return _stoch(data, len, sk, sd);
      }
      case 'cross': return _cross(resolveSeriesArg(args[0]), resolveSeriesArg(args[1]));
      case 'crossover': return _crossover(resolveSeriesArg(args[0]), resolveSeriesArg(args[1]));
      case 'crossunder': return _crossunder(resolveSeriesArg(args[0]), resolveSeriesArg(args[1]));
      case 'highest': return _highest(resolveSeriesArg(args[0]), resolveScalar(args[1]) || 14);
      case 'lowest': return _lowest(resolveSeriesArg(args[0]), resolveScalar(args[1]) || 14);
      case 'abs': {
        const v = args[0];
        if (isSeries(v)) return v.map(x => x === null ? null : Math.abs(x));
        return typeof v === 'number' ? Math.abs(v) : null;
      }
      case 'max': {
        const a = args[0], b = args[1];
        if (isSeries(a) || isSeries(b)) {
          const as = toSeries(a), bs = toSeries(b);
          return as.map((v, i) => v === null || bs[i] === null ? null : Math.max(v, bs[i]));
        }
        return Math.max(a, b);
      }
      case 'min': {
        const a = args[0], b = args[1];
        if (isSeries(a) || isSeries(b)) {
          const as = toSeries(a), bs = toSeries(b);
          return as.map((v, i) => v === null || bs[i] === null ? null : Math.min(v, bs[i]));
        }
        return Math.min(a, b);
      }
      case 'sqrt': {
        const v = args[0];
        if (isSeries(v)) return v.map(x => x === null || x < 0 ? null : Math.sqrt(x));
        return typeof v === 'number' && v >= 0 ? Math.sqrt(v) : null;
      }
      case 'log': {
        const v = args[0];
        if (isSeries(v)) return v.map(x => x === null || x <= 0 ? null : Math.log(x));
        return typeof v === 'number' && v > 0 ? Math.log(v) : null;
      }
      case 'na': {
        const v = args[0];
        if (isSeries(v)) return v.map(x => x === null || x === undefined ? 1 : 0);
        return (v === null || v === undefined) ? 1 : 0;
      }
      case 'nz': {
        const v = args[0], rep = args[1] !== undefined ? args[1] : 0;
        if (isSeries(v)) {
          const rs = isSeries(rep) ? rep : new Array(n).fill(rep);
          return v.map((x, i) => (x === null || x === undefined) ? rs[i] : x);
        }
        return (v === null || v === undefined) ? resolveScalar(rep) : v;
      }
      default:
        throw new Error(`Unknown function: ${name}`);
    }
  }

  // Evaluate an AST expression node
  function evaluate(node) {
    switch (node.type) {
      case 'number': return node.value;
      case 'string': return node.value;
      case 'color':  return node.value;

      case 'ident': {
        const name = node.name;
        if (name in vars) return vars[name];
        if (name in builtinSeries) return builtinSeries[name];
        throw new Error(`Undefined variable: ${name}`);
      }

      case 'call': {
        const args = node.args.map(a => evaluate(a));
        const kwargs = {};
        for (const k in node.kwargs) kwargs[k] = evaluate(node.kwargs[k]);
        return callBuiltin(node.name, args, kwargs);
      }

      case 'binary': return binaryOp(node.op, evaluate(node.left), evaluate(node.right));

      case 'unary': {
        const val = evaluate(node.expr);
        if (node.op === '-') {
          if (isSeries(val)) return val.map(x => x === null ? null : -x);
          return typeof val === 'number' ? -val : null;
        }
        if (node.op === 'not') {
          if (isSeries(val)) return val.map(x => x === null ? null : (x ? 0 : 1));
          return val ? 0 : 1;
        }
        return val;
      }

      case 'ternary': {
        const cond = evaluate(node.condition);
        const trueVal = evaluate(node.trueExpr);
        const falseVal = evaluate(node.falseExpr);
        return ternaryOp(cond, trueVal, falseVal);
      }

      default:
        throw new Error(`Unknown expression type: ${node.type}`);
    }
  }

  // Resolve a color expression: can be a string, color literal, or series of colors
  function resolveColor(node, defaultColor) {
    if (!node) return defaultColor;
    const val = evaluate(node);
    if (typeof val === 'string') return val;
    if (isSeries(val)) return val; // series of color strings
    return defaultColor;
  }

  // Execute statements
  for (const stmt of ast.statements) {
    try {
      switch (stmt.type) {
        case 'assign':
          vars[stmt.name] = evaluate(stmt.expr);
          break;

        case 'plot': {
          const series = evaluate(stmt.series);
          const values = resolveSeriesArg(series);
          const color = resolveColor(stmt.color, '#58a6ff');
          const linewidth = typeof stmt.linewidth === 'object' ? resolveScalar(evaluate(stmt.linewidth)) : stmt.linewidth;
          const label = stmt.label || `Plot ${result.lines.length + 1}`;
          result.lines.push({ values, color, label, width: linewidth });
          break;
        }

        case 'hline': {
          const val = resolveScalar(evaluate(stmt.value));
          const color = resolveColor(stmt.color, 'rgba(139,148,158,0.4)');
          const label = stmt.label;
          result.zones.push({ y: val, color, dash: [4, 4], label });
          break;
        }

        case 'bgcolor': {
          const colorVal = evaluate(stmt.color);
          if (typeof colorVal === 'string' && colorVal !== 'transparent') {
            result.fills.push({ color: colorVal });
          } else if (isSeries(colorVal)) {
            result.fills.push({ colorSeries: colorVal });
          }
          break;
        }

        case 'expr':
          evaluate(stmt.expr);
          break;
      }
    } catch (e) {
      return { error: `Runtime error in "${stmt.type}" statement: ${e.message}` };
    }
  }

  // Auto-set panel params for non-overlay indicators
  if (result.type === 'panel' && result.lines.length > 0) {
    result.panelHeight = 0.15;
    // Compute min/max across all line values
    let allMin = Infinity, allMax = -Infinity;
    for (const line of result.lines) {
      for (const v of line.values) {
        if (v !== null && v !== undefined) {
          allMin = Math.min(allMin, v);
          allMax = Math.max(allMax, v);
        }
      }
    }
    if (allMin !== Infinity) {
      result.min = allMin;
      result.max = allMax;
    }
  }

  return result;
}

// ─── Public API ───

export function parseScript(source) {
  try {
    const tokens = tokenize(source);
    return parse(tokens);
  } catch (e) {
    return { error: `Parse error: ${e.message}` };
  }
}

export function compileAndRun(source, data) {
  try {
    const ast = parseScript(source);
    if (ast.error) return ast;
    return executeScript(ast, data);
  } catch (e) {
    return { error: e.message };
  }
}

export function getScriptLibrary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveScript(name, source) {
  const scripts = getScriptLibrary();
  const now = new Date().toISOString();
  const existing = scripts.find(s => s.name === name);
  if (existing) {
    existing.source = source;
    existing.updatedAt = now;
  } else {
    scripts.push({ name, source, createdAt: now, updatedAt: now });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

export function deleteScript(name) {
  const scripts = getScriptLibrary().filter(s => s.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}
