/* 芯片工坊 · 逻辑层
 * 标准单元库、三个可选设计（生成 Verilog 与门级网表）、逻辑仿真、静态时序分析
 */
window.Chip = (function () {
  'use strict';

  const ROWH = 8;        // 标准单元行高 = 8 条布线轨道
  const PITCH = 0.19;    // 一条轨道 0.19 µm（参考 Nangate45 工艺）
  const WIRE_PS = 0.4;   // 每条轨道导线带来的延迟 (ps)
  const FANOUT_PS = 4;   // 每多驱动一个负载增加的延迟 (ps)

  // 教学用标准单元库：w = 宽度（轨道数），t = 晶体管数，d = 延迟 (ps)
  const LIB = {
    INV:  { label: '反相器', ins: ['A'], w: 3, t: 2, d: 12, fn: (a) => a ^ 1, desc: '把 0 变成 1，把 1 变成 0。最简单的门，只要 2 个晶体管。' },
    BUF:  { label: '缓冲器', ins: ['A'], w: 3, t: 4, d: 16, fn: (a) => a, desc: '输出等于输入，用来“放大”信号，让它传得更远、驱动更多负载。' },
    AND2: { label: '与门', ins: ['A', 'B'], w: 4, t: 6, d: 22, fn: (a, b) => a & b, desc: '两个输入都是 1，输出才是 1。' },
    OR2:  { label: '或门', ins: ['A', 'B'], w: 4, t: 6, d: 24, fn: (a, b) => a | b, desc: '只要有一个输入是 1，输出就是 1。' },
    XOR2: { label: '异或门', ins: ['A', 'B'], w: 6, t: 12, d: 36, fn: (a, b) => a ^ b, desc: '两个输入不同时输出 1。它恰好就是一位二进制加法的“和”。' },
    MUX2: { label: '选择器', ins: ['A', 'B', 'S'], w: 7, t: 12, d: 38, fn: (a, b, s) => (s ? b : a), desc: 'S=0 时输出 A，S=1 时输出 B，就像铁路上的道岔。' },
    DFF:  { label: '触发器', ins: ['D', 'CK'], w: 12, t: 24, d: 55, setup: 25, seq: true, desc: '在时钟上升沿“拍照”记住 D 的值。芯片的记忆就靠它。' },
  };

  const mask = (N) => (1 << N) - 1;
  const bitName = (name, width, i) => (width === 1 ? name : `${name}[${i}]`);
  const portBits = (p) => Array.from({ length: p.width }, (_, i) => bitName(p.name, p.width, i));

  function Netlist() { this.cells = []; this.n = 0; this.k = 0; }
  Netlist.prototype.add = function (type, ins, out) {
    const id = 'U' + ++this.k;
    out = out || 'n' + ++this.n;
    this.cells.push({ id, type, ins, out });
    return out;
  };

  /* ---------- 三个设计 ---------- */

  function buildAdder(N) {
    const nl = new Netlist();
    let c = null;
    for (let i = 0; i < N; i++) {
      const a = `a[${i}]`, b = `b[${i}]`;
      if (i === 0) {
        nl.add('XOR2', [a, b], 's[0]');
        c = nl.add('AND2', [a, b]);
      } else {
        const x = nl.add('XOR2', [a, b]);
        nl.add('XOR2', [x, c], `s[${i}]`);
        const g = nl.add('AND2', [a, b]);
        const p = nl.add('AND2', [x, c]);
        c = nl.add('OR2', [g, p], i === N - 1 ? 'cout' : null);
      }
    }
    return {
      inputs: [{ name: 'a', width: N }, { name: 'b', width: N }],
      outputs: [{ name: 's', width: N }, { name: 'cout', width: 1 }],
      clock: null, cells: nl.cells,
    };
  }

  function buildCounter(N) {
    const nl = new Netlist();
    const nrst = nl.add('INV', ['rst']);
    let c = 'en';
    for (let i = 0; i < N; i++) {
      const q = `q[${i}]`;
      const nx = nl.add('XOR2', [q, c]);
      if (i < N - 1) c = nl.add('AND2', [c, q]);
      const d = nl.add('AND2', [nx, nrst]);
      nl.add('DFF', [d, 'clk'], q);
    }
    return {
      inputs: [{ name: 'rst', width: 1 }, { name: 'en', width: 1 }],
      outputs: [{ name: 'q', width: N }],
      clock: 'clk', cells: nl.cells,
    };
  }

  function buildAlu(N) {
    const nl = new Netlist();
    let c = null;
    for (let i = 0; i < N; i++) {
      const a = `a[${i}]`, b = `b[${i}]`;
      const x = nl.add('XOR2', [a, b]);
      const g = nl.add('AND2', [a, b]);
      const sum = i === 0 ? x : nl.add('XOR2', [x, c]);
      if (i < N - 1) c = i === 0 ? g : nl.add('OR2', [g, nl.add('AND2', [x, c])]);
      const o = nl.add('OR2', [a, b]);
      const m0 = nl.add('MUX2', [sum, g, 'op[0]']);
      const m1 = nl.add('MUX2', [o, x, 'op[0]']);
      const r = nl.add('MUX2', [m0, m1, 'op[1]']);
      nl.add('DFF', [r, 'clk'], `y[${i}]`);
    }
    return {
      inputs: [{ name: 'a', width: N }, { name: 'b', width: N }, { name: 'op', width: 2 }],
      outputs: [{ name: 'y', width: N }],
      clock: 'clk', cells: nl.cells,
    };
  }

  const L = (rows) => rows.map(([code, note]) => ({ code, note }));

  function vAdder(N) {
    const r = `[${N - 1}:0]`, pad = ' '.repeat(r.length);
    return L([
      [`// ${N} 位加法器：s = a + b`, '以 // 开头的是注释，是写给人看的，不会变成电路。'],
      ['module adder (', '“module” 声明一个电路模块，就像给零件起名字。这个零件叫 adder。'],
      [`  input  ${r} a,     // 加数 a`, `input 表示输入引脚。${r} 表示有 ${N} 根线（第 ${N - 1} 位到第 0 位），能表示 0 ~ ${mask(N)}。`],
      [`  input  ${r} b,     // 加数 b`, `第二个加数，同样是 ${N} 位。`],
      [`  output ${r} s,     // 和`, 'output 表示输出引脚，这里输出相加的结果。'],
      [`  output ${pad} cout   // 进位`, `两个 ${N} 位数相加，结果可能需要 ${N + 1} 位。多出来的最高位叫“进位”，比如 ${mask(N)} + 1 就会产生进位。`],
      [');', '引脚列表到此结束。'],
      ['', ''],
      ['  assign {cout, s} = a + b;', '整颗芯片的功能只有这一行！assign 的意思是“永远等于”，{cout, s} 把进位和结果拼在一起。注意：你只描述了“要做加法”，并没有说用哪些门——这件事会在第 4 步“逻辑综合”里由工具自动完成。'],
      ['', ''],
      ['endmodule', '模块结束。'],
    ]);
  }

  function vCounter(N) {
    const r = `[${N - 1}:0]`, pad = ' '.repeat(r.length);
    return L([
      [`// ${N} 位计数器：每个时钟节拍加 1`, '以 // 开头的是注释，是写给人看的，不会变成电路。'],
      ['module counter (', '声明一个名叫 counter 的电路模块。'],
      [`  input      ${pad} clk,   // 时钟`, '时钟是芯片的“心跳”：一个不停在 0 和 1 之间翻转的信号。手机芯片的时钟每秒跳动约 30 亿次 (3 GHz)。'],
      [`  input      ${pad} rst,   // 复位`, '复位信号。为 1 时计数值清零，就像秒表的“归零”按钮。'],
      [`  input      ${pad} en,    // 使能`, '使能信号。为 1 时才计数，为 0 时保持不动，就像秒表的“暂停”。'],
      [`  output reg ${r} q      // 计数值`, `reg 表示这个输出要“记住”自己的值，综合后会变成 ${N} 个触发器 (DFF)。`],
      [');', '引脚列表到此结束。'],
      ['', ''],
      ['  always @(posedge clk) begin', '“每当时钟从 0 跳到 1 的那一瞬间（上升沿），就执行下面的事。”这是数字芯片最核心的节奏。'],
      ['    if (rst)', '如果复位信号为 1……'],
      ['      q <= 0;', '……计数值清零。“<=” 叫非阻塞赋值，表示在时钟沿那一刻统一更新。'],
      ['    else if (en)', '否则，如果使能为 1……'],
      ['      q <= q + 1;', `……计数值加 1。计到 ${mask(N)} 再加 1 会回到 0，就像里程表转满一圈。`],
      ['  end', 'always 块结束。'],
      ['endmodule', '模块结束。'],
    ]);
  }

  function vAlu(N) {
    const r = `[${N - 1}:0]`, pad = ' '.repeat(r.length);
    return L([
      [`// ${N} 位运算单元 ALU：CPU 做计算的地方`, 'ALU 是 Arithmetic Logic Unit（算术逻辑单元）的缩写，是 CPU 里真正动手计算的部件。'],
      ['module alu (', '声明一个名叫 alu 的电路模块。'],
      [`  input      ${pad} clk,`, '时钟，芯片的“心跳”。每跳一次，ALU 完成一次运算。'],
      [`  input      ${r} a, b,   // 操作数`, `两个 ${N} 位的操作数，也就是参与运算的两个数。`],
      [`  input      [1:0]${' '.repeat(r.length - 5)} op,     // 操作码`, '2 位的操作码，可以表示 4 种操作。CPU 执行的每一条指令，最终都会变成这样的操作码。'],
      [`  output reg ${r} y       // 结果`, '运算结果。reg 表示它会被存进触发器，在下一个时钟沿出现。'],
      [');', '引脚列表到此结束。'],
      ['', ''],
      ['  always @(posedge clk) begin', '每当时钟上升沿到来，就执行一次运算。'],
      ['    case (op)', 'case 根据操作码选择做哪一种运算，综合后会变成“选择器”电路。'],
      ["      2'b00: y <= a + b;   // 加", "2'b00 表示 2 位二进制数 00。op 为 00 时做加法。"],
      ["      2'b01: y <= a & b;   // 与", '按位与：每一位都做“与”运算，两位都是 1 结果才是 1。'],
      ["      2'b10: y <= a | b;   // 或", '按位或：任意一位是 1 结果就是 1。'],
      ["      2'b11: y <= a ^ b;   // 异或", '按位异或：两位不同时结果为 1。'],
      ['    endcase', 'case 结束。'],
      ['  end', 'always 块结束。'],
      ['endmodule', '模块结束。'],
    ]);
  }

  const DESIGNS = {
    adder: {
      id: 'adder', module: 'adder', name: '加法器', en: 'Adder', glyph: '+', tagline: '计算器的心脏', level: '入门',
      desc: '把两个二进制数相加。手机里的每一次计算，最底层都离不开它。',
      build: buildAdder, verilog: vAdder,
      check(inp, N) { const t = inp.a + inp.b; return { s: t & mask(N), cout: (t >> N) & 1 }; },
    },
    counter: {
      id: 'counter', module: 'counter', name: '计数器', en: 'Counter', glyph: '123', tagline: '时钟与秒表的心脏', level: '进阶',
      desc: '每个时钟节拍加 1。你会第一次接触“时钟”和“记忆”——触发器。',
      build: buildCounter, verilog: vCounter,
      step(inp, st, N) { return { q: inp.rst ? 0 : inp.en ? (st.q + 1) & mask(N) : st.q }; },
    },
    alu: {
      id: 'alu', module: 'alu', name: '运算单元 ALU', en: 'ALU', glyph: 'ALU', tagline: 'CPU 的心脏', level: '挑战',
      desc: '能做加、与、或、异或四种运算。CPU 执行的每条指令，最后都交给它来算。',
      build: buildAlu, verilog: vAlu,
      step(inp, st, N) { return { y: [(inp.a + inp.b) & mask(N), inp.a & inp.b, inp.a | inp.b, inp.a ^ inp.b][inp.op] }; },
    },
  };

  function makeDesign(id, width) {
    const def = DESIGNS[id];
    const nl = def.build(width);
    Object.assign(nl, { id, width, def, module: def.module });
    prepare(nl);
    return nl;
  }

  /* ---------- 网表分析与仿真 ---------- */

  // 计算驱动关系、负载和组合逻辑的拓扑顺序；逻辑网表和物理网表都可用
  function prepare(nl) {
    const driver = {}, sinks = {}, users = {};
    nl.cells.forEach((c) => { driver[c.out] = c; });
    nl.cells.forEach((c) => c.ins.forEach((n, k) => (sinks[n] = sinks[n] || []).push({ cell: c, k })));
    const comb = nl.cells.filter((c) => !LIB[c.type].seq);
    const indeg = new Map();
    comb.forEach((c) => {
      let d = 0;
      c.ins.forEach((n) => {
        const dr = driver[n];
        if (dr && !LIB[dr.type].seq) { d++; (users[n] = users[n] || []).push(c); }
      });
      indeg.set(c, d);
    });
    const queue = comb.filter((c) => indeg.get(c) === 0), order = [];
    while (queue.length) {
      const c = queue.shift();
      order.push(c);
      (users[c.out] || []).forEach((u) => { indeg.set(u, indeg.get(u) - 1); if (!indeg.get(u)) queue.push(u); });
    }
    Object.assign(nl, { driver, sinks, order, dffs: nl.cells.filter((c) => LIB[c.type].seq) });
    return nl;
  }

  function setPort(vals, port, n) { portBits(port).forEach((b, i) => { vals[b] = (n >> i) & 1; }); }
  function getPort(vals, port) { return portBits(port).reduce((s, b, i) => s | ((vals[b] || 0) << i), 0); }

  function evaluate(nl, inVals, state) {
    const v = Object.assign({}, inVals);
    nl.dffs.forEach((f) => { v[f.out] = state[f.out] || 0; });
    nl.order.forEach((c) => { v[c.out] = LIB[c.type].fn(...c.ins.map((n) => v[n] || 0)); });
    return v;
  }

  // 时钟上升沿：每个触发器记住自己 D 端的值
  function tick(nl, values) {
    const st = {};
    nl.dffs.forEach((f) => { st[f.out] = values[f.ins[0]] || 0; });
    return st;
  }

  // 自动测试：随机输入，把门级网表的结果和“标准答案”逐一比对
  function selfTest(nl, rounds) {
    const def = nl.def, N = nl.width;
    let state = {}, model = {}, pass = 0;
    const fails = [];
    nl.outputs.forEach((p) => { model[p.name] = 0; });
    for (let k = 0; k < rounds; k++) {
      const inp = {};
      nl.inputs.forEach((p) => { inp[p.name] = Math.floor(Math.random() * (1 << p.width)); });
      if (def.id === 'counter') { inp.rst = Math.random() < 0.08 ? 1 : 0; inp.en = Math.random() < 0.8 ? 1 : 0; }
      const vals = {};
      nl.inputs.forEach((p) => setPort(vals, p, inp[p.name]));
      let v = evaluate(nl, vals, state), expect;
      if (nl.clock) {
        state = tick(nl, v);
        v = evaluate(nl, vals, state);
        expect = model = def.step(inp, model, N);
      } else expect = def.check(inp, N);
      const got = {};
      nl.outputs.forEach((p) => { got[p.name] = getPort(v, p); });
      if (nl.outputs.every((p) => got[p.name] === expect[p.name])) pass++;
      else if (fails.length < 5) fails.push({ inp, got, expect });
    }
    return { pass, total: rounds, fails };
  }

  function stats(cells) {
    const by = {};
    let t = 0, w = 0;
    cells.forEach((c) => { by[c.type] = (by[c.type] || 0) + 1; t += LIB[c.type].t; w += LIB[c.type].w; });
    return { by, cells: cells.length, transistors: t, area: w * ROWH * PITCH * PITCH };
  }

  /* ---------- 静态时序分析 (STA) ---------- */

  // wire: 线网 → 导线长度（轨道数）；clkArrival: 触发器 → 时钟到达时间 (ps)
  function sta(nl, opt) {
    opt = opt || {};
    const wire = opt.wire || {}, clk = opt.clkArrival || {};
    const at = {}, via = {}, from = {};
    const load = (n) => FANOUT_PS * (nl.sinks[n] || []).length + (wire[n] || 0) * WIRE_PS;
    nl.inputs.forEach((p) => portBits(p).forEach((b) => { at[b] = load(b); }));
    nl.dffs.forEach((f) => { at[f.out] = (clk[f.id] || 0) + LIB.DFF.d + load(f.out); from[f.out] = f; });
    nl.order.forEach((c) => {
      if (c.clock) return;
      let m = 0, src = null;
      c.ins.forEach((n) => { if (at[n] !== undefined && at[n] >= m) { m = at[n]; src = n; } });
      at[c.out] = m + LIB[c.type].d + load(c.out);
      from[c.out] = c;
      via[c.out] = src;
    });
    const ends = [];
    nl.outputs.forEach((p) => portBits(p).forEach((b) => { if (at[b] !== undefined) ends.push({ net: b, t: at[b], kind: 'out' }); }));
    nl.dffs.forEach((f) => {
      const d = f.ins[0];
      ends.push({ net: d, t: (at[d] || 0) + LIB.DFF.setup - (clk[f.id] || 0), kind: 'reg', cell: f });
    });
    ends.sort((a, b) => b.t - a.t);
    const worst = ends[0], path = [];
    let n = worst.net;
    while (n) {
      const c = from[n];
      path.unshift({ net: n, cell: c || null, at: at[n] });
      if (!c || c.type === 'DFF') break;
      n = via[n];
    }
    return { delay: worst.t, worst, path, ends };
  }

  return {
    ROWH, PITCH, WIRE_PS, FANOUT_PS, LIB, DESIGNS, mask, portBits,
    makeDesign, prepare, setPort, getPort, evaluate, tick, selfTest, stats, sta,
  };
})();
