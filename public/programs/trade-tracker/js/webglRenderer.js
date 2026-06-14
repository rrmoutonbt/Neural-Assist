/**
 * WebGL 2.0 Accelerated Chart Renderer with Canvas 2D Fallback
 * GXT Trading Platform — Trade Tracker
 */

// ── Shader Sources ──────────────────────────────────────────────────────────

const QUAD_VERTEX_SRC = `
attribute vec2 a_position;
attribute vec4 a_instance;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec4 v_color;
void main() {
  vec2 pos = a_position * a_instance.zw + a_instance.xy;
  vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = a_color;
}
`;

const LINE_VERTEX_SRC = `
attribute vec2 a_position;
uniform vec2 u_resolution;
uniform vec4 u_color;
varying vec4 v_color;
void main() {
  vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
  v_color = u_color;
}
`;

const FRAGMENT_SRC = `
precision mediump float;
varying vec4 v_color;
void main() {
  gl_FragColor = v_color;
}
`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseHexColor(hex) {
  if (!hex || hex[0] !== '#') return [1, 1, 1, 1];
  const h = hex.slice(1);
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  const a = h.length >= 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1.0;
  return [r, g, b, a];
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${info}`);
  }
  return shader;
}

function createProgram(gl, vsSrc, fsSrc, attribs) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  if (attribs) {
    attribs.forEach((name, i) => gl.bindAttribLocation(prog, i, name));
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error(`Program link error: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function isWebGLAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (_) {
    return false;
  }
}

export class WebGLChartRenderer {
  constructor(canvas) {
    this._canvas = canvas;
    this._gl = null;
    this._isWebGL2 = false;
    this._ext = null;           // ANGLE_instanced_arrays for WebGL1
    this._contextLost = false;
    this._programs = {};
    this._buffers = {};
    this._batchedQuads = [];    // batched instance data
    this._batchedLines = [];    // batched line draw calls

    this._initContext();
    if (this._gl) {
      this._initShaders();
      this._initBuffers();
      this._bindContextHandlers();
    }
  }

  // ── Context setup ───────────────────────────────────────────────────────

  _initContext() {
    const opts = {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    };
    this._gl = this._canvas.getContext('webgl2', opts);
    if (this._gl) {
      this._isWebGL2 = true;
      return;
    }
    this._gl = this._canvas.getContext('webgl', opts) ||
               this._canvas.getContext('experimental-webgl', opts);
    if (this._gl) {
      this._ext = this._gl.getExtension('ANGLE_instanced_arrays');
      if (!this._ext) {
        this._gl = null; // instancing required
      }
    }
  }

  _bindContextHandlers() {
    this._onLost = (e) => {
      e.preventDefault();
      this._contextLost = true;
    };
    this._onRestored = () => {
      this._contextLost = false;
      this._initShaders();
      this._initBuffers();
    };
    this._canvas.addEventListener('webglcontextlost', this._onLost);
    this._canvas.addEventListener('webglcontextrestored', this._onRestored);
  }

  // ── Shader / buffer init ────────────────────────────────────────────────

  _initShaders() {
    const gl = this._gl;
    this._programs.quad = createProgram(
      gl, QUAD_VERTEX_SRC, FRAGMENT_SRC,
      ['a_position', 'a_instance', 'a_color']
    );
    this._programs.line = createProgram(
      gl, LINE_VERTEX_SRC, FRAGMENT_SRC,
      ['a_position']
    );

    // cache uniform locations
    gl.useProgram(this._programs.quad);
    this._uniforms = this._uniforms || {};
    this._uniforms.quadRes = gl.getUniformLocation(this._programs.quad, 'u_resolution');

    gl.useProgram(this._programs.line);
    this._uniforms.lineRes = gl.getUniformLocation(this._programs.line, 'u_resolution');
    this._uniforms.lineColor = gl.getUniformLocation(this._programs.line, 'u_color');
  }

  _initBuffers() {
    const gl = this._gl;

    // Unit quad: two triangles covering (0,0)→(1,1)
    const quadVerts = new Float32Array([
      0, 0,  1, 0,  0, 1,
      0, 1,  1, 0,  1, 1,
    ]);
    this._buffers.quadVert = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.quadVert);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    // Dynamic instance buffer (will be re-uploaded each frame)
    this._buffers.instance = gl.createBuffer();

    // Dynamic color buffer
    this._buffers.color = gl.createBuffer();

    // Dynamic line position buffer
    this._buffers.linePos = gl.createBuffer();
  }

  // ── Public methods ──────────────────────────────────────────────────────

  isAvailable() {
    return this._gl !== null && !this._contextLost;
  }

  resize(width, height) {
    if (!this._gl) return;
    this._canvas.width = width;
    this._canvas.height = height;
    this._gl.viewport(0, 0, width, height);
  }

  clear(bgColor) {
    if (!this.isAvailable()) return;
    const gl = this._gl;
    const [r, g, b, a] = parseHexColor(bgColor);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this._batchedQuads = [];
    this._batchedLines = [];
  }

  // ── Candlesticks ────────────────────────────────────────────────────────

  drawCandlesticks(data, chartW, mainH, min, range, bullColor, bearColor) {
    if (!this.isAvailable() || !data || data.length === 0) return;

    const bull = parseHexColor(bullColor);
    const bear = parseHexColor(bearColor);
    const barW = chartW / data.length;
    const bodyW = Math.max(1, barW * 0.7);
    const wickW = Math.max(1, Math.round(barW * 0.1));

    const instances = [];
    const colors = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (!d) continue;
      const { open, high, low, close } = d;

      const isBull = close >= open;
      const col = isBull ? bull : bear;
      const x = i * barW + barW / 2;

      // Wick
      const wickTop = ((high - min) / range) * mainH;
      const wickBot = ((low - min) / range) * mainH;
      // Convert to screen coords (0 = top)
      const wickY = mainH - wickTop;
      const wickH = wickTop - wickBot;

      instances.push(x - wickW / 2, wickY, wickW, Math.max(1, wickH));
      colors.push(...col);

      // Body
      const bodyTop = ((Math.max(open, close) - min) / range) * mainH;
      const bodyBot = ((Math.min(open, close) - min) / range) * mainH;
      const bodyY = mainH - bodyTop;
      const bodyH = Math.max(1, bodyTop - bodyBot);

      instances.push(x - bodyW / 2, bodyY, bodyW, bodyH);
      colors.push(...col);
    }

    if (instances.length > 0) {
      this._batchedQuads.push({
        instances: new Float32Array(instances),
        colors: new Float32Array(colors),
        count: instances.length / 4,
      });
    }
  }

  // ── Line (indicators) ──────────────────────────────────────────────────

  drawLine(values, chartW, mainH, min, range, color, lineWidth) {
    if (!this.isAvailable() || !values || values.length === 0) return;

    const barW = chartW / values.length;
    const positions = [];

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || isNaN(v)) continue;
      const x = i * barW + barW / 2;
      const y = mainH - ((v - min) / range) * mainH;
      positions.push(x, y);
    }

    if (positions.length >= 4) { // at least 2 points
      this._batchedLines.push({
        positions: new Float32Array(positions),
        color: parseHexColor(color),
        lineWidth: lineWidth || 1,
      });
    }
  }

  // ── Volume bars ─────────────────────────────────────────────────────────

  drawVolumeBars(data, chartW, mainH, maxVol, bullColor, bearColor) {
    if (!this.isAvailable() || !data || data.length === 0 || maxVol <= 0) return;

    const bull = parseHexColor(bullColor);
    const bear = parseHexColor(bearColor);
    const barW = chartW / data.length;
    const bodyW = Math.max(1, barW * 0.7);

    const instances = [];
    const colors = [];

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (!d) continue;
      const vol = d.volume || 0;
      if (vol <= 0) continue;

      const isBull = (d.close >= d.open);
      const col = isBull ? bull : bear;
      const x = i * barW + barW / 2;
      const h = (vol / maxVol) * mainH;
      const y = mainH - h; // anchor to bottom

      instances.push(x - bodyW / 2, y, bodyW, Math.max(1, h));
      colors.push(...col);
    }

    if (instances.length > 0) {
      this._batchedQuads.push({
        instances: new Float32Array(instances),
        colors: new Float32Array(colors),
        count: instances.length / 4,
      });
    }
  }

  // ── Grid ────────────────────────────────────────────────────────────────

  drawGrid(chartW, mainH, gridColor, rows, cols) {
    if (!this.isAvailable()) return;

    const col = parseHexColor(gridColor);
    const instances = [];
    const colors = [];

    // Horizontal lines
    for (let i = 0; i <= rows; i++) {
      const y = (i / rows) * mainH;
      instances.push(0, y, chartW, 1);
      colors.push(...col);
    }

    // Vertical lines
    for (let i = 0; i <= cols; i++) {
      const x = (i / cols) * chartW;
      instances.push(x, 0, 1, mainH);
      colors.push(...col);
    }

    if (instances.length > 0) {
      this._batchedQuads.push({
        instances: new Float32Array(instances),
        colors: new Float32Array(colors),
        count: instances.length / 4,
      });
    }
  }

  // ── Flush (submit all batched draw calls) ──────────────────────────────

  flush() {
    if (!this.isAvailable()) return;
    const gl = this._gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Draw all batched quads
    if (this._batchedQuads.length > 0) {
      this._flushQuads();
    }

    // Draw all batched lines
    if (this._batchedLines.length > 0) {
      this._flushLines();
    }

    this._batchedQuads = [];
    this._batchedLines = [];
  }

  _flushQuads() {
    const gl = this._gl;
    const prog = this._programs.quad;
    gl.useProgram(prog);
    gl.uniform2f(this._uniforms.quadRes, this._canvas.width, this._canvas.height);

    const aPos = gl.getAttribLocation(prog, 'a_position');
    const aInst = gl.getAttribLocation(prog, 'a_instance');
    const aCol = gl.getAttribLocation(prog, 'a_color');

    // Bind unit quad
    gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.quadVert);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    this._vertexAttribDivisor(aPos, 0);

    for (const batch of this._batchedQuads) {
      const { instances, colors, count } = batch;

      // Upload instance data
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.instance);
      gl.bufferData(gl.ARRAY_BUFFER, instances, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aInst);
      gl.vertexAttribPointer(aInst, 4, gl.FLOAT, false, 0, 0);
      this._vertexAttribDivisor(aInst, 1);

      // Upload color data
      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.color);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 4, gl.FLOAT, false, 0, 0);
      this._vertexAttribDivisor(aCol, 1);

      // Draw instanced
      this._drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
    }

    gl.disableVertexAttribArray(aInst);
    gl.disableVertexAttribArray(aCol);
    this._vertexAttribDivisor(aInst, 0);
    this._vertexAttribDivisor(aCol, 0);
  }

  _flushLines() {
    const gl = this._gl;
    const prog = this._programs.line;
    gl.useProgram(prog);
    gl.uniform2f(this._uniforms.lineRes, this._canvas.width, this._canvas.height);

    const aPos = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(aPos);
    this._vertexAttribDivisor(aPos, 0);

    for (const batch of this._batchedLines) {
      const { positions, color, lineWidth } = batch;

      gl.uniform4fv(this._uniforms.lineColor, color);

      // gl.lineWidth is capped to 1.0 on most GPUs
      gl.lineWidth(Math.max(1, lineWidth));

      gl.bindBuffer(gl.ARRAY_BUFFER, this._buffers.linePos);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.LINE_STRIP, 0, positions.length / 2);
    }
  }

  // ── Instancing abstraction (WebGL2 native vs WebGL1 extension) ─────────

  _vertexAttribDivisor(index, divisor) {
    if (this._isWebGL2) {
      this._gl.vertexAttribDivisor(index, divisor);
    } else if (this._ext) {
      this._ext.vertexAttribDivisorANGLE(index, divisor);
    }
  }

  _drawArraysInstanced(mode, first, count, instanceCount) {
    if (this._isWebGL2) {
      this._gl.drawArraysInstanced(mode, first, count, instanceCount);
    } else if (this._ext) {
      this._ext.drawArraysInstancedANGLE(mode, first, count, instanceCount);
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────────

  dispose() {
    const gl = this._gl;
    if (!gl) return;

    // Delete programs
    for (const key of Object.keys(this._programs)) {
      if (this._programs[key]) {
        gl.deleteProgram(this._programs[key]);
      }
    }
    this._programs = {};

    // Delete buffers
    for (const key of Object.keys(this._buffers)) {
      if (this._buffers[key]) {
        gl.deleteBuffer(this._buffers[key]);
      }
    }
    this._buffers = {};

    // Remove event listeners
    if (this._onLost) {
      this._canvas.removeEventListener('webglcontextlost', this._onLost);
    }
    if (this._onRestored) {
      this._canvas.removeEventListener('webglcontextrestored', this._onRestored);
    }

    this._batchedQuads = [];
    this._batchedLines = [];
    this._gl = null;
    this._ext = null;
  }
}
