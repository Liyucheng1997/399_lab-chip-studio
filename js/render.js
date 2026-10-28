/* 芯片工坊 · 绘图
 * 版图画布（可缩放平移）、门级原理图 (SVG)、波形图、折线小图
 */
(function (C) {
  'use strict';
  const { LIB, ROWH } = C;
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
  const instances = new Set();
  C.redrawAll = () => instances.forEach((l) => l.draw());

  function palette(kind) {
    if (kind === 'classic') {
      return {
        bg: '#08080c', die: '#101016', core: '#14141c', row: 'rgba(255,255,255,0.025)', rail: 'rgba(255,255,255,0.05)',
        cell: 'rgba(150,150,170,0.14)', cellSeq: 'rgba(150,150,170,0.22)', cellClk: 'rgba(48,209,88,0.25)', cellStroke: 'rgba(170,170,190,0.45)',
        text: 'rgba(235,235,245,0.7)', nwell: 'rgba(210,180,40,0.12)', diff: 'rgba(60,200,110,0.5)', poly: 'rgba(240,70,70,0.85)',
        h: 'rgba(70,140,255,0.85)', v: 'rgba(215,95,235,0.8)', via: '#ffffff', pdn: 'rgba(255,200,60,0.45)',
        pin: '#ffd60a', fly: 'rgba(255,255,255,0.22)', clock: '#30d158', hi: '#ff9f0a', hiFill: 'rgba(255,159,10,0.4)',
      };
    }
    const d = isDark(), primary = cssVar('--primary');
    return {
      bg: cssVar('--canvas'), die: cssVar('--panel'), core: d ? '#202023' : '#fafafc',
      row: d ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.022)', rail: d ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      cell: d ? '#3a3a3d' : '#e6e6eb', cellSeq: d ? '#48484c' : '#d8d8de', cellClk: d ? 'rgba(10,132,255,0.35)' : '#cfe3fb', cellStroke: d ? '#5c5c61' : '#c4c4ca',
      text: cssVar('--text-2'), nwell: d ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)', diff: d ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.09)',
      poly: d ? 'rgba(10,132,255,0.55)' : 'rgba(0,113,227,0.45)',
      h: primary, v: d ? 'rgba(200,200,210,0.6)' : 'rgba(60,60,67,0.5)', via: cssVar('--text'), pdn: d ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)',
      pin: cssVar('--text'), fly: d ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.16)', clock: cssVar('--text'),
      hi: cssVar('--warning'), hiFill: d ? 'rgba(255,159,10,0.4)' : 'rgba(201,52,0,0.22)',
    };
  }

  /* ---------- 版图画布 ---------- */

  class Layout {
    constructor(canvas, opt) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.P = null;
      this.route = null;
      this.o = Object.assign({
        rows: true, pdn: false, pins: true, cells: true, labels: true, fly: false, routes: 0,
        layers: { h: true, v: true, via: true }, clock: 0, hi: null, hiNets: null, detail: 'auto', palette: 'min', interactive: false,
      }, opt || {});
      this.view = null;
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(canvas);
      instances.add(this);
      if (this.o.interactive) this.bind();
    }
    destroy() { this.ro.disconnect(); instances.delete(this); }
    set(P, o) {
      if (P !== this.P || (P && this.fpRef !== P.fp)) this.view = null;
      this.P = P;
      this.fpRef = P && P.fp;
      if (o) Object.assign(this.o, o);
      this.draw();
    }
    resize() {
      const r = this.cv.getBoundingClientRect();
      if (!r.width) return;
      this.dpr = window.devicePixelRatio || 1;
      this.cv.width = Math.round(r.width * this.dpr);
      this.cv.height = Math.round(r.height * this.dpr);
      this.cw = r.width;
      this.ch = r.height;
      this.view = null;
      this.draw();
    }
    fit() {
      const { W, H } = this.P.fp, pad = this.cw < 420 ? 34 : 50;
      const s = Math.max(0.5, Math.min((this.cw - pad * 2) / W, (this.ch - pad * 2) / H));
      return { s, ox: (this.cw - W * s) / 2, oy: (this.ch - H * s) / 2 };
    }
    bind() {
      const cv = this.cv;
      cv.style.cursor = 'grab';
      cv.addEventListener('wheel', (e) => {
        if (!this.P) return;
        e.preventDefault();
        const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const v = this.view || this.fit(), base = this.fit().s;
        const f = Math.min(Math.max(Math.exp(-e.deltaY * 0.0016), (base * 0.6) / v.s), (base * 40) / v.s);
        this.view = { s: v.s * f, ox: mx - (mx - v.ox) * f, oy: my - (my - v.oy) * f };
        this.draw();
      }, { passive: false });
      let drag = null;
      cv.addEventListener('pointerdown', (e) => { if (!this.P) return; drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
      cv.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const v = this.view || this.fit();
        this.view = { s: v.s, ox: v.ox + e.clientX - drag.x, oy: v.oy + e.clientY - drag.y };
        drag = { x: e.clientX, y: e.clientY };
        this.draw();
      });
      const end = () => { drag = null; cv.style.cursor = 'grab'; };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', end);
      cv.addEventListener('dblclick', () => { this.view = null; this.draw(); });
    }
    zoomBy(f) {
      if (!this.P) return;
      const v = this.view || this.fit(), mx = this.cw / 2, my = this.ch / 2;
      this.view = { s: v.s * f, ox: mx - (mx - v.ox) * f, oy: my - (my - v.oy) * f };
      this.draw();
    }
    exportPNG(size) {
      const keep = [this.cv, this.ctx, this.cw, this.ch, this.dpr, this.view];
      const cv = document.createElement('canvas'), W = this.P.fp.W, H = this.P.fp.H;
      const k = size / Math.max(W, H);
      cv.width = Math.round(W * k + 120);
      cv.height = Math.round(H * k + 120);
      Object.assign(this, { cv, ctx: cv.getContext('2d'), cw: cv.width, ch: cv.height, dpr: 1, view: null });
      const inter = this.o.interactive;
      this.o.interactive = false;
      this.draw();
      this.o.interactive = inter;
      [this.cv, this.ctx, this.cw, this.ch, this.dpr, this.view] = keep;
      return cv;
    }

    draw() {
      const ctx = this.ctx, P = this.P, o = this.o;
      if (!this.cw) return;
      const pal = palette(o.palette);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, this.cw, this.ch);
      if (!P) return;
      if (!this.view || !o.interactive) this.view = this.fit();
      const { s, ox, oy } = this.view;
      const X = (x) => ox + x * s, Y = (y) => oy + y * s;
      const { W, H, core, rows } = P.fp;

      ctx.fillStyle = pal.die;
      ctx.fillRect(X(0), Y(0), W * s, H * s);
      ctx.strokeStyle = pal.cellStroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(X(0) + 0.5, Y(0) + 0.5, W * s - 1, H * s - 1);
      ctx.fillStyle = pal.core;
      ctx.fillRect(X(core.x), Y(core.y), core.w * s, core.h * s);

      if (o.rows) {
        for (let r = 0; r < rows; r++) {
          if (r % 2) { ctx.fillStyle = pal.row; ctx.fillRect(X(core.x), Y(core.y + r * ROWH), core.w * s, ROWH * s); }
        }
        ctx.fillStyle = pal.rail;
        for (let r = 0; r <= rows; r++) ctx.fillRect(X(core.x), Y(core.y + r * ROWH) - Math.max(0.5, s * 0.2), core.w * s, Math.max(1, s * 0.4));
      }

      if (o.pdn) {
        ctx.strokeStyle = pal.pdn;
        ctx.lineWidth = Math.max(1.5, s * 0.8);
        for (const off of [2, 4]) ctx.strokeRect(X(core.x - off), Y(core.y - off), (core.w + off * 2) * s, (core.h + off * 2) * s);
        ctx.lineWidth = Math.max(1, s * 0.6);
        ctx.beginPath();
        for (let x = core.x + 8; x < core.x + core.w - 3; x += 16) { ctx.moveTo(X(x), Y(core.y - 4)); ctx.lineTo(X(x), Y(core.y + core.h + 4)); }
        for (let r = 0; r <= rows; r++) { ctx.moveTo(X(core.x - 4), Y(core.y + r * ROWH)); ctx.lineTo(X(core.x + core.w + 4), Y(core.y + r * ROWH)); }
        ctx.stroke();
      }

      const detail = o.detail === true || (o.detail === 'auto' && s >= 7);
      if (o.cells) {
        const hi = o.hi;
        ctx.globalAlpha = o.ghost ? 0.85 : 1;
        P.cells.forEach((c) => {
          const x = X(c.x), y = Y(c.y), w = c.w * s, h = ROWH * s, isHi = hi && hi.has(c.id);
          const g = Math.min(1, s * 0.15);
          ctx.fillStyle = isHi ? pal.hiFill : c.clock ? pal.cellClk : c.type === 'DFF' ? pal.cellSeq : pal.cell;
          ctx.fillRect(x + g, y + g, w - 2 * g, h - 2 * g);
          if (detail) this.drawCellDetail(c, X, Y, s, pal);
          ctx.strokeStyle = isHi ? pal.hi : pal.cellStroke;
          ctx.lineWidth = isHi ? 1.5 : 1;
          ctx.strokeRect(x + g + 0.5, y + g + 0.5, w - 2 * g - 1, h - 2 * g - 1);
          if (o.labels && w > 22 && h > 14) {
            ctx.fillStyle = isHi ? pal.hi : pal.text;
            ctx.font = `500 ${Math.max(8, Math.min(12, s * 1.5))}px ${cssVar('--font')}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(c.clock ? 'CLKBUF' : c.type, x + w / 2, y + h / 2 + (detail ? h * 0.36 : 0));
          }
        });
        ctx.globalAlpha = 1;
      }

      const C5 = (v) => v + 0.5;
      if (o.fly) {
        ctx.strokeStyle = pal.fly;
        ctx.lineWidth = 1;
        ctx.beginPath();
        P.nets.forEach((n) => {
          if (n.clock) return;
          const a = C.pinXY(n.pins[0]);
          n.pins.slice(1).forEach((p) => { const b = C.pinXY(p); ctx.moveTo(X(C5(a.x)), Y(C5(a.y))); ctx.lineTo(X(C5(b.x)), Y(C5(b.y))); });
        });
        ctx.stroke();
      }

      if (o.clock && P.ctsInfo) {
        ctx.strokeStyle = pal.clock;
        ctx.lineWidth = Math.max(1.5, s * 0.35);
        ctx.lineJoin = 'round';
        ctx.beginPath();
        P.ctsInfo.edges.forEach((e) => {
          if (e.level >= o.clock) return;
          ctx.moveTo(X(C5(e.x1)), Y(C5(e.y1)));
          ctx.lineTo(X(C5(e.x2)), Y(C5(e.y1)));
          ctx.lineTo(X(C5(e.x2)), Y(C5(e.y2)));
        });
        ctx.stroke();
      }

      const R = this.route;
      if (R && o.routes) {
        const k = Math.min(o.routes, R.nets.length), L = o.layers, hn = o.hiNets;
        const lw = Math.max(1, s * 0.42);
        ctx.lineCap = 'square';
        const stroke = (list, color, width) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          list.forEach((g) => { ctx.moveTo(X(C5(g.x1)), Y(C5(g.y1))); ctx.lineTo(X(C5(g.x2)), Y(C5(g.y2))); });
          ctx.stroke();
        };
        const vs = [], hs = [], vias = [];
        for (let i = 0; i < k; i++) {
          const n = R.nets[i];
          if (hn && hn.has(n.name)) continue;
          if (L.v) vs.push(...n.v);
          if (L.h) hs.push(...n.h);
          if (L.via) vias.push(...n.vias);
        }
        stroke(vs, pal.v, lw);
        stroke(hs, pal.h, lw);
        ctx.fillStyle = pal.via;
        const vz = Math.max(2, s * 0.6);
        vias.forEach((v) => ctx.fillRect(X(C5(v.x)) - vz / 2, Y(C5(v.y)) - vz / 2, vz, vz));
        if (hn) {
          R.nets.forEach((n, i) => {
            if (i >= k || !hn.has(n.name)) return;
            stroke(n.v.concat(n.h), pal.hi, lw * 1.8);
            ctx.fillStyle = pal.hi;
            n.vias.forEach((v) => ctx.fillRect(X(C5(v.x)) - vz / 2, Y(C5(v.y)) - vz / 2, vz, vz));
          });
        }
        ctx.lineCap = 'butt';
      }

      if (o.pins) {
        const z = Math.max(5, s * 1.1);
        const sideCount = {};
        P.fp.pins.forEach((p) => { sideCount[p.side] = (sideCount[p.side] || 0) + 1; });
        ctx.font = `500 11px ${cssVar('--font')}`;
        ctx.textBaseline = 'middle';
        P.fp.pins.forEach((p) => {
          const x = X(C5(p.x)), y = Y(C5(p.y));
          ctx.fillStyle = pal.pin;
          ctx.fillRect(x - z / 2, y - z / 2, z, z);
          const spacing = (core.h / sideCount[p.side]) * s;
          if (p.side !== 'bottom' && spacing < 12) return;
          ctx.fillStyle = pal.text;
          if (p.side === 'left') { ctx.textAlign = 'right'; ctx.fillText(p.net, X(0) - 6, y); }
          else if (p.side === 'right') { ctx.textAlign = 'left'; ctx.fillText(p.net, X(W) + 6, y); }
          else { ctx.textAlign = 'center'; ctx.fillText(p.net, x, Y(H) + 12); }
        });
      }
    }

    // 放大后显示单元内部：N 阱、有源区、多晶硅栅极——也就是晶体管
    drawCellDetail(c, X, Y, s, pal) {
      const ctx = this.ctx;
      const R = (x0, y0, x1, y1, color) => { ctx.fillStyle = color; ctx.fillRect(X(x0), Y(y0), (x1 - x0) * s, (y1 - y0) * s); };
      R(c.x, c.y, c.x + c.w, c.y + ROWH / 2, pal.nwell);
      R(c.x + 0.6, c.y + 1.2, c.x + c.w - 0.6, c.y + 3.2, pal.diff);
      R(c.x + 0.6, c.y + 4.8, c.x + c.w - 0.6, c.y + 6.8, pal.diff);
      const n = Math.max(1, Math.min(c.w - 1, LIB[c.type].t / 2));
      for (let k = 0; k < n; k++) {
        const px = c.x + 0.5 + ((k + 0.5) * (c.w - 1)) / n;
        R(px - 0.17, c.y + 0.8, px + 0.17, c.y + 7.2, pal.poly);
      }
    }
  }

  /* ---------- 门级原理图 ---------- */

  const GATE_H = { MUX2: 40, DFF: 40 };

  // 返回门的 SVG 图形，(x, y) 为左上角；同时给出输入/输出引脚的相对位置
  function gateShape(type, x, y) {
    const h = GATE_H[type] || 28, n = LIB[type].ins.length;
    const ins = LIB[type].ins.map((_, k) => ({ x, y: y + ((k + 1) * h) / (n + 1) }));
    let d, outX = x + 40, extra = '';
    switch (type) {
      case 'AND2': d = `M${x},${y} h20 a${h / 2},${h / 2} 0 0 1 0,${h} h-20 z`; outX = x + 20 + h / 2; break;
      case 'OR2': d = `M${x},${y} q12,${h / 2} 0,${h} q26,0 40,${-h / 2} q-14,${-h / 2} -40,${-h / 2} z`; break;
      case 'XOR2':
        d = `M${x + 6},${y} q12,${h / 2} 0,${h} q24,0 34,${-h / 2} q-10,${-h / 2} -34,${-h / 2} z`;
        extra = `<path class="g-line" d="M${x},${y} q12,${h / 2} 0,${h}"/>`; break;
      case 'INV': d = `M${x},${y} L${x + 28},${y + h / 2} L${x},${y + h} z`; extra = `<circle class="g-body" cx="${x + 32}" cy="${y + h / 2}" r="4"/>`; outX = x + 36; break;
      case 'BUF': d = `M${x},${y} L${x + 34},${y + h / 2} L${x},${y + h} z`; outX = x + 34; break;
      case 'MUX2': {
        d = `M${x},${y - 3} L${x + 32},${y + 7} L${x + 32},${y + h - 7} L${x},${y + h + 3} z`; outX = x + 32;
        extra = `<text class="g-pin" x="${x + 4}" y="${ins[0].y + 3}">0</text><text class="g-pin" x="${x + 4}" y="${ins[1].y + 3}">1</text><text class="g-pin" x="${x + 4}" y="${ins[2].y + 3}">S</text>`;
        break;
      }
      case 'DFF':
        d = `M${x},${y} h40 v${h} h-40 z`;
        extra = `<path class="g-line" d="M${x},${ins[1].y - 5} l7,5 l-7,5"/><text class="g-pin" x="${x + 4}" y="${ins[0].y + 3}">D</text><text class="g-pin" x="${x + 29}" y="${y + h / 2 + 3}">Q</text>`;
        break;
    }
    return { svg: `<path class="g-body" d="${d}"/>${extra}`, ins, out: { x: outX, y: y + h / 2 }, h };
  }

  function schematic(nl) {
    const COLW = 116, ROWGAP = 54, TOP = 28, PIX = 64;
    const lvl = {}, cellL = {};
    const inBits = [].concat(...nl.inputs.map(C.portBits));
    inBits.forEach((b) => { lvl[b] = 0; });
    nl.dffs.forEach((f) => { lvl[f.out] = 0; });
    let maxL = 0;
    nl.order.forEach((c) => {
      const l = 1 + Math.max(0, ...c.ins.map((n) => lvl[n] || 0));
      lvl[c.out] = l; cellL[c.id] = l;
      maxL = Math.max(maxL, l);
    });
    nl.dffs.forEach((f) => { cellL[f.id] = maxL + 1; });
    const nCols = maxL + (nl.dffs.length ? 1 : 0);
    const cols = Array.from({ length: nCols + 1 }, () => []);
    nl.cells.forEach((c) => cols[cellL[c.id]].push(c));
    const maxRows = Math.max(...cols.map((c) => c.length), Math.ceil((inBits.length * 30) / ROWGAP));
    const height = TOP * 2 + maxRows * ROWGAP;
    const pos = {}, src = {};
    const piGap = Math.min(30, (height - TOP * 2) / inBits.length);
    const piTop = (height - piGap * (inBits.length - 1)) / 2;
    inBits.forEach((b, i) => { src[b] = { x: PIX, y: piTop + i * piGap }; });
    const place = () => {
      for (let l = 1; l <= nCols; l++) {
        const col = cols[l];
        const bary = (c) => {
          const ys = c.ins.map((n) => src[n] && src[n].y).filter((v) => v !== undefined);
          return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
        };
        col.sort((a, b) => bary(a) - bary(b));
        const off = TOP + ((maxRows - col.length) * ROWGAP) / 2;
        col.forEach((c, i) => {
          const g = gateShape(c.type, PIX + 50 + (l - 1) * COLW, off + i * ROWGAP + (ROWGAP - (GATE_H[c.type] || 28)) / 2 - 8);
          pos[c.id] = g;
          src[c.out] = g.out;
        });
      }
    };
    place();
    place();
    const width = PIX + 50 + nCols * COLW + 60;
    let wires = '', gates = '', labels = '';
    const curve = (a, b) => {
      if (b.x > a.x + 4) { const dx = Math.max(16, (b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; }
      return `M${a.x},${a.y} C${a.x + 70},${a.y} ${b.x - 70},${b.y} ${b.x},${b.y}`;
    };
    nl.cells.forEach((c) => {
      const g = pos[c.id];
      c.ins.forEach((n, k) => {
        const a = src[n];
        if (!a) return;
        wires += `<path class="sch-wire${a.x > g.ins[k].x ? ' fb' : ''}" data-net="${n}" d="${curve(a, g.ins[k])}"/>`;
      });
      gates += `<g class="sch-gate" style="--d:${cellL[c.id] * 40}ms">${g.svg}<text class="g-type" x="${g.out.x - 20}" y="${g.out.y + g.h / 2 + 13}">${c.type}</text></g>`;
    });
    inBits.forEach((b) => {
      const p = src[b];
      labels += `<text class="sch-io" x="${p.x - 8}" y="${p.y + 4}" text-anchor="end">${b}</text><circle class="sch-dot" data-net="${b}" cx="${p.x}" cy="${p.y}" r="3.5"/>`;
    });
    [].concat(...nl.outputs.map(C.portBits)).forEach((b) => {
      const p = src[b];
      if (!p) return;
      const x2 = width - 46;
      wires += `<path class="sch-wire" data-net="${b}" d="M${p.x},${p.y} H${x2}"/>`;
      labels += `<circle class="sch-dot" data-net="${b}" cx="${x2}" cy="${p.y}" r="3.5"/><text class="sch-io" x="${x2 + 8}" y="${p.y + 4}">${b}</text>`;
    });
    return `<svg class="schematic" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-w="${width}">${wires}${gates}${labels}</svg>`;
  }

  function updateSchematic(root, values) {
    root.querySelectorAll('[data-net]').forEach((el) => el.classList.toggle('on', values[el.dataset.net] === 1));
  }

  function gateIcon(type) {
    const g = gateShape(type, 14, 10);
    const h = g.h + 20;
    const stubs = g.ins.map((p) => `<path class="g-line" d="M2,${p.y} H${p.x}"/>`).join('') + `<path class="g-line" d="M${g.out.x},${g.out.y} H${g.out.x + 12}"/>`;
    return `<svg class="gate-icon" viewBox="0 0 ${g.out.x + 16} ${h}">${stubs}${g.svg}</svg>`;
  }

  /* ---------- 波形图 ---------- */

  function sizeCanvas(cv) {
    const r = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * d);
    cv.height = Math.round(r.height * d);
    const ctx = cv.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  // rows: [{ label, key, bits, clock }]，hist: [{ key: value }]
  function drawWave(cv, rows, hist) {
    const { ctx, w, h } = sizeCanvas(cv);
    if (!w) return;
    const LABEL = 64, rh = Math.min(30, h / rows.length), step = 44;
    const n = Math.max(1, Math.floor((w - LABEL - 8) / step));
    const data = hist.slice(-n);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `500 12px ${cssVar('--font')}`;
    ctx.textBaseline = 'middle';
    const line = cssVar('--line'), primary = cssVar('--primary'), text2 = cssVar('--text-2'), text3 = cssVar('--text-3');
    rows.forEach((r, i) => {
      const y0 = i * rh + 5, y1 = (i + 1) * rh - 5, ym = (y0 + y1) / 2;
      ctx.fillStyle = text2;
      ctx.textAlign = 'left';
      ctx.fillText(r.label, 4, ym);
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(LABEL, (i + 1) * rh); ctx.lineTo(w, (i + 1) * rh); ctx.stroke();
      ctx.strokeStyle = r.clock ? text3 : primary;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      data.forEach((d, k) => {
        const x = LABEL + k * step;
        if (r.clock) {
          ctx.moveTo(x, y1); ctx.lineTo(x + step / 2, y1); ctx.lineTo(x + step / 2, y0); ctx.lineTo(x + step, y0); ctx.lineTo(x + step, y1);
        } else if (r.bits === 1) {
          const y = d[r.key] ? y0 : y1, prevV = k ? data[k - 1][r.key] : d[r.key];
          if (k && prevV !== d[r.key]) { ctx.moveTo(x, prevV ? y0 : y1); ctx.lineTo(x, y); } else ctx.moveTo(x, y);
          ctx.lineTo(x + step, y);
        } else {
          const c = k && data[k - 1][r.key] !== d[r.key] ? 4 : 0;
          ctx.moveTo(x, ym); ctx.lineTo(x + c, y0); ctx.lineTo(x + step, y0);
          ctx.moveTo(x, ym); ctx.lineTo(x + c, y1); ctx.lineTo(x + step, y1);
        }
      });
      ctx.stroke();
      if (!r.clock && r.bits > 1) {
        ctx.fillStyle = cssVar('--text');
        ctx.textAlign = 'center';
        data.forEach((d, k) => { if (!k || data[k - 1][r.key] !== d[r.key]) ctx.fillText(String(d[r.key]), LABEL + k * step + step / 2, ym); });
      }
    });
  }

  function drawSpark(cv, data) {
    const { ctx, w, h } = sizeCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    if (data.length < 2) return;
    const max = Math.max(...data), min = Math.min(...data) * 0.9;
    ctx.strokeStyle = cssVar('--primary');
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = 2 + (i / (data.length - 1)) * (w - 4), y = 4 + (1 - (v - min) / (max - min || 1)) * (h - 8);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  Object.assign(C, { Layout, schematic, updateSchematic, gateIcon, drawWave, drawSpark });
})(window.Chip);
