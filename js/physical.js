/* 芯片工坊 · 物理设计引擎
 * 布图规划、全局/详细布局、时钟树综合、迷宫布线（A* + 拆线重布）、GDSII 导出
 */
(function (C) {
  'use strict';
  const { LIB, ROWH, WIRE_PS, portBits } = C;
  const MARGIN = 6; // 芯片边缘到核心区的距离（轨道数），用于放 IO 引脚和电源环

  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 布图规划 ---------- */

  function floorplan(nl, util, aspect) {
    const cellArea = nl.cells.reduce((s, c) => s + LIB[c.type].w * ROWH, 0) * 1.06; // 预留时钟缓冲器
    const area = cellArea / util;
    const rows = Math.max(2, Math.round(Math.sqrt(area * aspect) / ROWH));
    const coreH = rows * ROWH;
    const coreW = Math.max(LIB.DFF.w + 6, Math.ceil(area / coreH));
    const W = coreW + 2 * MARGIN, H = coreH + 2 * MARGIN;
    const ins = [].concat(...nl.inputs.map(portBits)), outs = [].concat(...nl.outputs.map(portBits));
    const spread = (list, x, side) => list.map((net, i) => ({ net, x, y: MARGIN + Math.floor(((i + 0.5) * coreH) / list.length), side }));
    const pins = [...spread(ins, 1, 'left'), ...spread(outs, W - 2, 'right')];
    if (nl.clock) pins.push({ net: nl.clock, x: Math.floor(W / 2), y: H - 2, side: 'bottom' });
    return { W, H, rows, core: { x: MARGIN, y: MARGIN, w: coreW, h: coreH }, pins, util, aspect, cellArea };
  }

  function createPhys(nl, fp) {
    const cells = nl.cells.map((c) => ({ id: c.id, type: c.type, ins: c.ins.slice(), out: c.out, w: LIB[c.type].w, x: 0, y: 0 }));
    const P = { nl, fp, cells, inputs: nl.inputs, outputs: nl.outputs, clock: nl.clock, rand: rng(1) };
    indexNets(P);
    return P;
  }

  // 单元引脚位置：输入在第 3 条轨道，输出在第 5 条轨道
  function pinPos(c, k) {
    return k < 0 ? { x: c.x + c.w - 1, y: c.y + 5 } : { x: c.x + 1 + 2 * k, y: c.y + 3 };
  }
  const pinXY = (p) => (p.io ? { x: p.io.x, y: p.io.y } : pinPos(p.cell, p.k));

  function indexNets(P) {
    const nets = {};
    const get = (n) => nets[n] || (nets[n] = { name: n, pins: [], clock: false });
    P.cells.forEach((c) => {
      get(c.out).pins.unshift({ cell: c, k: -1 });
      c.ins.forEach((n, k) => get(n).pins.push({ cell: c, k }));
      if (c.clock) get(c.out).clock = true;
    });
    P.fp.pins.forEach((io) => {
      const n = get(io.net);
      if (io.side === 'right') n.pins.push({ io }); else n.pins.unshift({ io });
    });
    if (P.clock && nets[P.clock]) nets[P.clock].clock = true;
    P.nets = Object.values(nets).filter((n) => n.pins.length > 1);
    P.netsByCell = {};
    P.nets.forEach((n) => n.pins.forEach((p) => { if (p.cell) (P.netsByCell[p.cell.id] = P.netsByCell[p.cell.id] || []).push(n); }));
    C.prepare(P);
  }

  function netHpwl(n) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    n.pins.forEach((p) => {
      const q = pinXY(p);
      if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
    });
    return x1 - x0 + (y1 - y0);
  }
  const hpwl = (P) => P.nets.reduce((s, n) => s + (n.clock ? 0 : netHpwl(n)), 0);

  function overlaps(P) {
    const cs = P.cells;
    let k = 0;
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        if (a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + ROWH - 0.01 && b.y < a.y + ROWH - 0.01) k++;
      }
    return k;
  }

  /* ---------- 布局 ---------- */

  // 去掉之前插入的时钟缓冲器，恢复原始时钟连接
  function resetClock(P) {
    P.cells = P.cells.filter((c) => !c.clock);
    P.cells.forEach((c) => { if (c.type === 'DFF') c.ins[1] = P.clock; });
    P.ctsInfo = null;
    indexNets(P);
  }

  // 全局布局开始：单元随机撒在核心区里，导线又长又乱
  function gpInit(P, seed) {
    const r = (P.rand = rng(seed || 7));
    const { core } = P.fp;
    P.cells.forEach((c) => {
      c.x = core.x + r() * (core.w - c.w);
      c.y = core.y + r() * (core.h - ROWH);
    });
  }

  // 一次迭代：相连的单元互相吸引，重叠的单元互相推开；t 从 0 走到 1
  function gpStep(P, t) {
    const { core } = P.fp, cells = P.cells;
    const cx = (c) => c.x + c.w / 2, cy = (c) => c.y + ROWH / 2;
    const pull = 0.25 * (1 - 0.6 * t);
    cells.forEach((c) => {
      let sx = 0, sy = 0, sw = 0;
      (P.netsByCell[c.id] || []).forEach((n) => {
        if (n.clock) return;
        const wgt = 1 / (n.pins.length - 1);
        n.pins.forEach((p) => {
          if (p.cell === c) return;
          sx += (p.io ? p.io.x : cx(p.cell)) * wgt;
          sy += (p.io ? p.io.y : cy(p.cell)) * wgt;
          sw += wgt;
        });
      });
      c.tx = sw ? sx / sw : cx(c);
      c.ty = sw ? sy / sw : cy(c);
    });
    cells.forEach((c) => { c.x += (c.tx - cx(c)) * pull; c.y += (c.ty - cy(c)) * pull; });
    const push = 0.5 * (0.15 + 0.85 * t);
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < cells.length; i++)
        for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i], b = cells[j];
          const dx = cx(b) - cx(a), dy = cy(b) - cy(a);
          const ox = (a.w + b.w) / 2 + 0.5 - Math.abs(dx), oy = ROWH - Math.abs(dy);
          if (ox <= 0 || oy <= 0) continue;
          if (ox / ((a.w + b.w) / 2) < oy / ROWH) {
            const m = ox * push * (dx >= 0 ? 1 : -1);
            a.x -= m; b.x += m;
          } else {
            const m = oy * push * (dy >= 0 ? 1 : -1);
            a.y -= m; b.y += m;
          }
        }
    cells.forEach((c) => {
      c.x = Math.min(Math.max(c.x, core.x), core.x + core.w - c.w);
      c.y = Math.min(Math.max(c.y, core.y), core.y + core.h - ROWH);
    });
  }

  // 合法化：把每个单元对齐到最近的行和格点上，并且互不重叠
  // 放不下时把期望位置向左压缩一点再试，避免单元被挤出核心区
  function legalize(P) {
    const want = P.cells.map((c) => [c.x, c.y]);
    for (let f = 1; f >= 0.3; f -= 0.1) {
      P.cells.forEach((c, i) => { c.x = P.fp.core.x + (want[i][0] - P.fp.core.x) * f; c.y = want[i][1]; });
      legalizeOnce(P);
      if (!P.overflow) return;
    }
  }

  function legalizeOnce(P) {
    const { core, rows } = P.fp;
    const ends = new Array(rows).fill(core.x), right = core.x + core.w;
    P.overflow = false;
    [...P.cells].sort((a, b) => a.x - b.x).forEach((c) => {
      let best = null;
      for (let r = 0; r < rows; r++) {
        const ry = core.y + r * ROWH;
        let x = Math.max(ends[r], Math.round(c.x));
        if (x + c.w > right) x = ends[r];
        if (x + c.w > right) continue;
        const cost = Math.abs(x - c.x) + 2 * Math.abs(ry - c.y);
        if (!best || cost < best.cost) best = { r, x, cost };
      }
      if (!best) {
        let r = 0;
        ends.forEach((e, i) => { if (e < ends[r]) r = i; });
        best = { r, x: ends[r] };
        P.overflow = true;
      }
      c.x = best.x;
      c.y = core.y + best.r * ROWH;
      ends[best.r] = c.x + c.w;
    });
  }

  // 详细布局：随机交换两个同类单元，导线变短就保留
  function dpSwap(P, tries) {
    const groups = {};
    P.cells.forEach((c) => (groups[c.type] = groups[c.type] || []).push(c));
    const r = P.rand, cells = P.cells;
    let better = 0;
    for (let k = 0; k < tries; k++) {
      const a = cells[Math.floor(r() * cells.length)], g = groups[a.type];
      const b = g[Math.floor(r() * g.length)];
      if (a === b) continue;
      const nets = [...new Set([...(P.netsByCell[a.id] || []), ...(P.netsByCell[b.id] || [])])];
      const before = nets.reduce((s, n) => s + netHpwl(n), 0);
      [a.x, b.x] = [b.x, a.x];
      [a.y, b.y] = [b.y, a.y];
      if (nets.reduce((s, n) => s + netHpwl(n), 0) < before) better++;
      else { [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y]; }
    }
    return better;
  }

  // 在行里找一个离目标点最近的空位
  function findFreeSpot(P, tx, ty, w) {
    const { core, rows } = P.fp;
    let best = null;
    for (let r = 0; r < rows; r++) {
      const ry = core.y + r * ROWH;
      const occ = P.cells.filter((c) => c.y === ry).map((c) => [c.x, c.x + c.w]).sort((a, b) => a[0] - b[0]);
      const gaps = [];
      let start = core.x;
      occ.forEach(([s, e]) => { if (s - start >= w) gaps.push([start, s]); start = Math.max(start, e); });
      if (core.x + core.w - start >= w) gaps.push([start, core.x + core.w]);
      gaps.forEach(([s, e]) => {
        const x = Math.round(Math.min(Math.max(tx - w / 2, s), e - w));
        const cost = Math.abs(x + w / 2 - tx) + Math.abs(ry + ROWH / 2 - ty);
        if (!best || cost < best.cost) best = { x, y: ry, cost };
      });
    }
    return best || { x: core.x, y: core.y };
  }

  /* ---------- 时钟树综合 ---------- */

  function cts(P) {
    resetClock(P);
    const dffs = P.cells.filter((c) => c.type === 'DFF');
    if (!dffs.length) return null;
    const bufs = [];
    const ck = (f) => pinPos(f, 1);
    // 递归二分：把触发器按位置一分为二，每组配一个缓冲器，形成一棵对称的树
    function build(group) {
      let children, pts;
      if (group.length <= 2) {
        children = group.map((f) => ({ sink: f }));
        pts = group.map(ck);
      } else {
        const xs = group.map((f) => ck(f).x), ys = group.map((f) => ck(f).y);
        const key = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys) ? 'x' : 'y';
        const sorted = [...group].sort((a, b) => ck(a)[key] - ck(b)[key]);
        const mid = Math.ceil(sorted.length / 2);
        children = [build(sorted.slice(0, mid)), build(sorted.slice(mid))];
        pts = children.map((ch) => pinPos(ch.buf, 0));
      }
      const tx = pts.reduce((s, p) => s + p.x, 0) / pts.length, ty = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const n = bufs.length + 1;
      const buf = { id: 'CTS_' + n, type: 'BUF', w: LIB.BUF.w, clock: true, ins: [P.clock], out: 'clk_buf' + n, x: 0, y: 0 };
      Object.assign(buf, findFreeSpot(P, tx, ty, buf.w));
      delete buf.cost;
      P.cells.push(buf);
      bufs.push(buf);
      children.forEach((ch) => { if (ch.sink) ch.sink.ins[1] = buf.out; else ch.buf.ins[0] = buf.out; });
      return { buf, children };
    }
    const root = build(dffs);
    const src = P.fp.pins.find((p) => p.net === P.clock);
    const edges = [], arrival = {};
    const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    function walk(node, t, from, level) {
      const ip = pinPos(node.buf, 0), op = pinPos(node.buf, -1);
      edges.push({ x1: from.x, y1: from.y, x2: ip.x, y2: ip.y, level });
      t += dist(from, ip) * WIRE_PS + LIB.BUF.d;
      node.children.forEach((ch) => {
        if (ch.sink) {
          const p = ck(ch.sink);
          edges.push({ x1: op.x, y1: op.y, x2: p.x, y2: p.y, level: level + 1 });
          arrival[ch.sink.id] = t + dist(op, p) * WIRE_PS;
        } else walk(ch, t, op, level + 1);
      });
    }
    walk(root, 0, src, 0);
    const ts = Object.values(arrival);
    indexNets(P);
    P.ctsInfo = {
      bufs, edges, arrival, sinks: dffs.length,
      levels: Math.max(...edges.map((e) => e.level)) + 1,
      skew: Math.max(...ts) - Math.min(...ts), latency: Math.max(...ts),
    };
    return P.ctsInfo;
  }

  /* ---------- 布线：A* 迷宫布线 + PathFinder 拆线重布 ---------- */

  function Heap() { this.k = []; this.v = []; }
  Heap.prototype.push = function (key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v, top = v[0];
    const lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  };

  const VIA_COST = 3;

  // 两层金属：第 0 层只能走横线 (M2)，第 1 层只能走竖线 (M3)，层间靠通孔连接
  function route(P, maxIter) {
    maxIter = maxIter || 12;
    const { W, H } = P.fp, plane = W * H, N = plane * 2;
    const nets = P.nets.slice().sort((a, b) => (b.clock - a.clock) || netHpwl(a) - netHpwl(b));
    const pinOwner = new Int32Array(plane).fill(-1);
    const netPins = nets.map((n, i) => {
      const ids = [];
      n.pins.forEach((p) => {
        const q = pinXY(p), id = Math.round(q.y) * W + Math.round(q.x);
        if (!ids.includes(id)) ids.push(id);
        if (pinOwner[id] === -1) pinOwner[id] = i;
      });
      return ids;
    });
    const occ = new Int16Array(N), hist = new Float32Array(N);
    const dist = new Float64Array(N), prev = new Int32Array(N), seen = new Int32Array(N), closed = new Int32Array(N);
    const sol = new Array(nets.length).fill(null), log = [];
    let stamp = 0, pf = 1;

    function astar(i, tree, t) {
      stamp++;
      const tx = t % W, ty = (t / W) | 0, heap = new Heap();
      const h = (n) => { const xy = n >= plane ? n - plane : n; return Math.abs((xy % W) - tx) + Math.abs(((xy / W) | 0) - ty); };
      tree.forEach((s) => { dist[s] = 0; seen[s] = stamp; prev[s] = -1; heap.push(h(s), s); });
      let u;
      const relax = (v, base) => {
        const own = pinOwner[v >= plane ? v - plane : v];
        if (own !== -1 && own !== i) return;
        const c = dist[u] + base + hist[v] + (occ[v] ? pf * occ[v] : 0);
        if (seen[v] !== stamp || c < dist[v]) { seen[v] = stamp; dist[v] = c; prev[v] = u; heap.push(c + h(v), v); }
      };
      while (heap.k.length) {
        u = heap.pop();
        if (closed[u] === stamp) continue;
        closed[u] = stamp;
        const l = u >= plane ? 1 : 0, xy = u - l * plane, x = xy % W, y = (xy / W) | 0;
        if (xy === t) {
          const path = [];
          for (let n = u; n !== -1; n = prev[n]) path.push(n);
          return path.reverse();
        }
        if (l === 0) { if (x > 0) relax(u - 1, 1); if (x < W - 1) relax(u + 1, 1); }
        else { if (y > 0) relax(u - W, 1); if (y < H - 1) relax(u + W, 1); }
        relax(l ? u - plane : u + plane, VIA_COST);
      }
      return null;
    }

    function routeNet(i) {
      const pins = netPins[i], p0 = pins[0];
      const tree = new Set([p0, p0 + plane]), paths = [];
      const md = (a, b) => Math.abs((a % W) - (b % W)) + Math.abs(((a / W) | 0) - ((b / W) | 0));
      let failed = 0;
      pins.slice(1).sort((a, b) => md(a, p0) - md(b, p0)).forEach((t) => {
        if (tree.has(t) || tree.has(t + plane)) return;
        const path = astar(i, tree, t);
        if (!path) { failed++; return; }
        path.forEach((n) => tree.add(n));
        paths.push(path);
      });
      return { paths, nodes: [...tree], failed };
    }

    let over = 0;
    for (let it = 0; it < maxIter; it++) {
      const todo = it === 0
        ? nets.map((_, i) => i)
        : nets.map((_, i) => i).filter((i) => sol[i].failed || sol[i].nodes.some((n) => occ[n] > 1));
      todo.forEach((i) => {
        if (sol[i]) sol[i].nodes.forEach((n) => occ[n]--);
        sol[i] = routeNet(i);
        sol[i].nodes.forEach((n) => occ[n]++);
      });
      over = 0;
      for (let n = 0; n < N; n++) if (occ[n] > 1) { over++; hist[n] += 0.5; }
      log.push({ it: it + 1, rerouted: todo.length, conflicts: over });
      if (!over && !sol.some((s) => s.failed)) break;
      pf *= 2;
    }

    // 把路径整理成横线段、竖线段和通孔，方便绘制和导出
    const out = nets.map((n, i) => {
      const segs = { name: n.name, clock: n.clock, h: [], v: [], vias: [], len: 0 };
      sol[i].paths.forEach((path) => {
        let s = path[0];
        for (let k = 1; k <= path.length; k++) {
          const a = path[k - 1], b = path[k];
          const la = a >= plane ? 1 : 0, lb = b >= plane ? 1 : 0;
          const brk = k === path.length || la !== lb;
          if (brk) {
            if (a !== s) {
              const sa = s - la * plane, ea = a - la * plane;
              const seg = { x1: sa % W, y1: (sa / W) | 0, x2: ea % W, y2: (ea / W) | 0 };
              (la ? segs.v : segs.h).push(seg);
              segs.len += Math.abs(seg.x2 - seg.x1) + Math.abs(seg.y2 - seg.y1);
            }
            if (k < path.length) { const xy = a - la * plane; segs.vias.push({ x: xy % W, y: (xy / W) | 0 }); }
            s = b;
          }
        }
      });
      return segs;
    });
    const wire = {};
    out.forEach((s) => { wire[s.name] = s.len; });
    return {
      nets: out, log, wire, conflicts: over,
      failed: sol.reduce((s, x) => s + x.failed, 0),
      length: out.reduce((s, x) => s + x.len, 0),
      vias: out.reduce((s, x) => s + x.vias.length, 0),
    };
  }

  /* ---------- GDSII 导出 ---------- */

  function exportGDS(P, R, name) {
    const b = [];
    const rec = (type, dt, data) => { const len = 4 + data.length; b.push((len >> 8) & 255, len & 255, type, dt); for (const x of data) b.push(x); };
    const i2 = (...v) => v.flatMap((x) => [(x >> 8) & 255, x & 255]);
    const i4 = (...v) => v.flatMap((x) => [(x >>> 24) & 255, (x >>> 16) & 255, (x >>> 8) & 255, x & 255]);
    const str = (s) => { const a = [...s].map((ch) => ch.charCodeAt(0) & 127); if (a.length % 2) a.push(0); return a; };
    const r8 = (x) => {
      if (!x) return [0, 0, 0, 0, 0, 0, 0, 0];
      let e = 64;
      while (x >= 1) { x /= 16; e++; }
      while (x < 1 / 16) { x *= 16; e--; }
      const o = [e];
      for (let i = 0; i < 7; i++) { x *= 256; const d = Math.floor(x); o.push(d); x -= d; }
      return o;
    };
    const nm = (t) => Math.round(t * C.PITCH * 1000); // 轨道 → 纳米
    const Hh = P.fp.H;
    const box = (layer, x0, y0, x1, y1) => {
      const X0 = nm(Math.min(x0, x1)), X1 = nm(Math.max(x0, x1)), Y0 = nm(Hh - Math.max(y0, y1)), Y1 = nm(Hh - Math.min(y0, y1));
      rec(0x08, 0x00, []);
      rec(0x0d, 0x02, i2(layer));
      rec(0x0e, 0x02, i2(0));
      rec(0x10, 0x03, i4(X0, Y0, X1, Y0, X1, Y1, X0, Y1, X0, Y0));
      rec(0x11, 0x00, []);
    };
    const text = (layer, x, y, s) => {
      rec(0x0c, 0x00, []);
      rec(0x0d, 0x02, i2(layer));
      rec(0x16, 0x02, i2(0));
      rec(0x10, 0x03, i4(nm(x), nm(Hh - y)));
      rec(0x19, 0x06, str(s));
      rec(0x11, 0x00, []);
    };
    const d = new Date(), date = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()];
    rec(0x00, 0x02, i2(600));
    rec(0x01, 0x02, i2(...date, ...date));
    rec(0x02, 0x06, str('CHIPSTUDIO'));
    rec(0x03, 0x05, [...r8(1e-3), ...r8(1e-9)]);
    rec(0x05, 0x02, i2(...date, ...date));
    rec(0x06, 0x06, str(name));

    const { W, H, core } = P.fp;
    box(1, 0, 0, W, H);                                   // 芯片边界
    for (const off of [2, 4]) {                           // 电源环
      box(20, core.x - off - 0.4, core.y - off - 0.4, core.x + core.w + off + 0.4, core.y - off + 0.4);
      box(20, core.x - off - 0.4, core.y + core.h + off - 0.4, core.x + core.w + off + 0.4, core.y + core.h + off + 0.4);
      box(20, core.x - off - 0.4, core.y - off - 0.4, core.x - off + 0.4, core.y + core.h + off + 0.4);
      box(20, core.x + core.w + off - 0.4, core.y - off - 0.4, core.x + core.w + off + 0.4, core.y + core.h + off + 0.4);
    }
    P.cells.forEach((c) => {
      box(2, c.x, c.y, c.x + c.w, c.y + ROWH);                       // 单元外框
      box(3, c.x + 0.6, c.y + 1.2, c.x + c.w - 0.6, c.y + 3.2);      // P 型有源区
      box(3, c.x + 0.6, c.y + 4.8, c.x + c.w - 0.6, c.y + 6.8);      // N 型有源区
      const n = Math.max(1, Math.min(c.w - 1, LIB[c.type].t / 2));
      for (let k = 0; k < n; k++) { const px = c.x + 0.5 + ((k + 0.5) * (c.w - 1)) / n; box(4, px - 0.17, c.y + 0.8, px + 0.17, c.y + 7.2); } // 多晶硅栅
    });
    const hw = 0.18;
    R.nets.forEach((s) => {
      s.h.forEach((g) => box(10, Math.min(g.x1, g.x2) + 0.5 - hw, g.y1 + 0.5 - hw, Math.max(g.x1, g.x2) + 0.5 + hw, g.y1 + 0.5 + hw));
      s.v.forEach((g) => box(12, g.x1 + 0.5 - hw, Math.min(g.y1, g.y2) + 0.5 - hw, g.x1 + 0.5 + hw, Math.max(g.y1, g.y2) + 0.5 + hw));
      s.vias.forEach((v) => box(11, v.x + 0.5 - hw, v.y + 0.5 - hw, v.x + 0.5 + hw, v.y + 0.5 + hw));
    });
    P.fp.pins.forEach((p) => { box(30, p.x, p.y, p.x + 1, p.y + 1); text(30, p.x + 0.5, p.y + 0.5, p.net); });
    rec(0x07, 0x00, []);
    rec(0x04, 0x00, []);
    return new Uint8Array(b);
  }

  Object.assign(C, {
    MARGIN, rng, floorplan, createPhys, pinPos, pinXY, indexNets, hpwl, overlaps,
    resetClock, gpInit, gpStep, legalize, dpSwap, cts, route, exportGDS,
  });
})(window.Chip);
