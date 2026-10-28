/* 芯片工坊 · 页面与交互
 * 首页 + 10 个设计步骤，每一步都调用 lib.js / physical.js 里真实运行的算法
 */
(function (C) {
  'use strict';

  /* ---------- 小工具 ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (n, d = 0) => Number(n).toLocaleString('zh-CN', { maximumFractionDigits: d, minimumFractionDigits: d });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const um = (tracks, d = 1) => fmt(tracks * C.PITCH, d);
  const bin = (v, n) => v.toString(2).padStart(n, '0');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('chip.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('chip.' + k, JSON.stringify(v)); } catch (e) { /* 隐私模式下忽略 */ } },
  };

  const ICONS = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    down: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    redo: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  };
  const icon = (n, s = 16) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

  /* ---------- 流程定义 ---------- */
  const STAGES = [
    { key: 'home', title: '芯片有多强', en: 'Welcome', tool: '' },
    { key: 'spec', n: 1, title: '定义芯片', en: 'Specification', tool: '规格书', desc: '决定芯片要做什么、有哪些输入输出。' },
    { key: 'rtl', n: 2, title: '编写 RTL', en: 'RTL Design', tool: 'Verilog', desc: '用硬件描述语言写出电路的功能。' },
    { key: 'sim', n: 3, title: '功能仿真', en: 'Simulation', tool: 'Icarus', desc: '在电脑里运行电路，确认结果正确。' },
    { key: 'synth', n: 4, title: '逻辑综合', en: 'Synthesis', tool: 'Yosys', desc: '把代码翻译成由逻辑门组成的网表。' },
    { key: 'floorplan', n: 5, title: '布图规划', en: 'Floorplan', tool: 'ifp · pdn', desc: '确定芯片尺寸、引脚和电源网络。' },
    { key: 'place', n: 6, title: '布局', en: 'Placement', tool: 'gpl · dpl', desc: '把每个逻辑门摆到芯片上的合适位置。' },
    { key: 'cts', n: 7, title: '时钟树综合', en: 'Clock Tree', tool: 'cts', desc: '让时钟同时到达每一个触发器。' },
    { key: 'route', n: 8, title: '布线', en: 'Routing', tool: 'grt · drt', desc: '用金属导线把所有引脚连接起来。' },
    { key: 'signoff', n: 9, title: '签核验证', en: 'Signoff', tool: 'sta', desc: '检查速度、制造规则和功耗。' },
    { key: 'tapeout', n: 10, title: '流片', en: 'Tape-out', tool: 'GDSII', desc: '输出版图文件，交给晶圆厂制造。' },
  ];
  const ORDER = STAGES.map((s) => s.key);
  const ST = Object.fromEntries(STAGES.map((s) => [s.key, s]));
  const NAV_GROUPS = [
    { title: '开始', keys: ['home'] },
    { title: '前端设计 · 写出电路', keys: ['spec', 'rtl', 'sim', 'synth'] },
    { title: '后端设计 · OpenROAD', keys: ['floorplan', 'place', 'cts', 'route', 'signoff'] },
    { title: '制造', keys: ['tapeout'] },
  ];

  const INFO = {
    spec: {
      what: '每颗芯片都从一份“规格书”开始：它要做什么？有哪些输入输出？要跑多快？真实项目里工程师会花几个月写规格，这里你只需要点选。',
      like: '盖房子前先定下来：盖住宅还是商场？几层楼？开几扇门？',
      cmd: () => `# OpenROAD-flow-scripts 里每个设计有一份配置\nexport DESIGN_NAME   = ${S.nl.module}\nexport PLATFORM      = nangate45\nexport VERILOG_FILES = ${S.nl.module}.v`,
    },
    rtl: {
      what: 'RTL（寄存器传输级）代码用硬件描述语言 Verilog 写成。它看起来像程序，描述的却是“电路的结构和连接”——所有语句在硬件里同时、并行地工作。',
      like: '写建筑设计说明书：说清每个房间的用途，而不是每块砖怎么砌。',
      cmd: () => `# 用开源工具 Verilator 检查语法\nverilator --lint-only ${S.nl.module}.v`,
    },
    sim: {
      what: '芯片一旦造出来就无法修改，一次流片动辄花费上千万元。所以要先在电脑里“假装”运行它，把各种输入都试一遍。真实项目里，验证的工作量常常比设计本身还大。',
      like: '盖楼前先在电脑里模拟地震和大风，确认它不会倒。',
      cmd: () => `# 用开源仿真器 Icarus Verilog 跑测试\niverilog -o sim ${S.nl.module}.v tb.v\nvvp sim`,
    },
    synth: {
      what: '综合工具 Yosys 读懂你的 Verilog，把它翻译成由“标准单元”（与门、或门、触发器……）连接而成的网表。工厂只会造这些预先设计好的标准单元，就像乐高只有固定形状的积木。',
      like: '把设计说明书变成一张精确的“乐高零件清单 + 拼装图”。',
      cmd: () => `yosys -p "\n  read_verilog ${S.nl.module}.v\n  synth -top ${S.nl.module}\n  dfflibmap -liberty nangate45.lib\n  abc -liberty nangate45.lib\n  write_verilog netlist.v"`,
    },
    floorplan: {
      what: '从这一步开始进入“物理设计”，也就是 OpenROAD 的主场。先确定芯片的尺寸、放置标准单元的“行”、输入输出引脚的位置，再铺设给每个晶体管供电的电源网络 (PDN)。',
      like: '规划一座新城：划定城墙、修好城门、铺好主干电网，再把土地切成一排排整齐的地块。',
      cmd: () => `initialize_floorplan \\\n  -utilization ${Math.round(S.util * 100)} \\\n  -aspect_ratio ${S.aspect.toFixed(1)} \\\n  -core_space 2 \\\n  -site FreePDK45_38x28_10R_NP_162NW_34O\nplace_pins -hor_layers metal3 -ver_layers metal2\npdngen`,
    },
    place: {
      what: '把所有标准单元摆进芯片的行里。目标是：互相连接的单元尽量靠近（导线短 = 速度快、功耗低），同时不能重叠。OpenROAD 先做“全局布局”算出大致位置，再“合法化”对齐到行上，最后“详细布局”做微调。',
      like: '给新城分配地块：经常来往的邻居住得近一点，每块地只能盖一栋房。',
      cmd: () => 'global_placement -density 0.6\ndetailed_placement\ncheck_placement',
    },
    cts: {
      what: '时钟信号必须同时到达每一个触发器，否则有的先“拍照”有的后“拍照”，数据就乱了。时钟树综合会插入缓冲器，搭出一棵对称的树，让各处的时钟到达时间尽量一致，这个差值叫“时钟偏差 (skew)”。',
      like: '给全城装广播系统，保证每个街区同时听到整点报时。',
      cmd: () => 'clock_tree_synthesis \\\n  -root_buf BUF_X4 -buf_list BUF_X4 \\\n  -sink_clustering_enable\nrepair_clock_nets',
    },
    route: {
      what: '用金属导线把所有引脚按网表连接起来。这里用两层金属：一层只走横线、一层只走竖线，两层之间用“通孔 (via)”连接。不同的导线绝不能碰在一起，否则就短路了。真实芯片有十几层金属，最细的导线比头发丝细上千倍。',
      like: '修路：借助立交桥（通孔），让每户人家都有路通到要去的地方，而且路与路不能撞车。',
      cmd: () => 'global_route -guide_file route.guide\ndetailed_route -output_drc drc.rpt\n\n# 本网站使用 A* 迷宫布线 +\n# PathFinder 拆线重布算法',
    },
    signoff: {
      what: '交给工厂之前的最后“竣工验收”：静态时序分析 (STA) 检查最慢的路径能否在一个时钟周期内跑完；DRC 检查版图是否符合制造规则；LVS 检查版图和电路是否一致；再估算一下功耗。',
      like: '竣工验收：消防、结构、水电逐项检查，全部签字后才能交房。',
      cmd: () => 'report_checks -path_delay max\nreport_wns\nreport_power\n\n# DRC / LVS 常用 KLayout、\n# Magic、Netgen 等工具',
    },
    tapeout: {
      what: '“流片 (tape-out)”指把最终的 GDSII 版图文件交给晶圆厂。这个名字来自早年把设计数据写在磁带 (tape) 上寄给工厂。工厂据此制作光罩，再用光刻在硅晶圆上一层层“印”出你的电路。',
      like: '把最终施工图交给施工队，正式开工。',
      cmd: () => '# OpenROAD 输出 DEF，再用 KLayout 转成 GDSII\nwrite_def final.def\nklayout -zz -rd in_def=final.def \\\n  -rd out_file=final.gds \\\n  -r def2stream.py',
    },
  };

  /* ---------- 状态 ---------- */
  const S = {
    stage: 'home',
    design: store.get('design', 'adder'),
    width: store.get('width', 4),
    done: new Set(),
    nl: null, sim: null, P: null, route: null, sta: null,
    util: 0.5, aspect: 1, freq: 500, seed: 0,
    chipName: store.get('name', ''),
  };
  if (!C.DESIGNS[S.design]) S.design = 'adder';
  if (S.width !== 4 && S.width !== 8) S.width = 4;

  const sidebar = $('#sidebar'), main = $('#main');
  let epoch = 0, cleanups = [];
  const alive = (my) => my === epoch;
  const onLeave = (fn) => cleanups.push(fn);

  function ensureDesign() {
    if (!S.nl || S.nl.id !== S.design || S.nl.width !== S.width) { S.nl = C.makeDesign(S.design, S.width); S.sim = null; }
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' toast-' + kind : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 2400);
  }

  /* ---------- 导航 ---------- */
  function canEnter(key) { return ORDER.slice(1, ORDER.indexOf(key)).every((k) => S.done.has(k)); }

  function renderNav() {
    const def = C.DESIGNS[S.design], dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const doneN = ORDER.slice(1).filter((k) => S.done.has(k)).length;
    const item = (k) => {
      const st = ST[k], done = S.done.has(k), locked = !canEnter(k);
      const num = k === 'home' ? icon('home', 13) : done ? icon('check', 13) : st.n;
      const cls = [k === S.stage && 'active', done && 'done', locked && 'locked'].filter(Boolean).join(' ');
      return `<button class="nav-item ${cls}" data-go="${k}"><span class="num">${num}</span>${st.title}<span class="tool">${st.tool}</span></button>`;
    };
    sidebar.innerHTML = `
      <div class="brand" data-go="home"><div class="logo-mark">芯</div><div><div class="brand-name">芯片工坊</div><div class="brand-sub">Chip Studio · 参考 OpenROAD</div></div></div>
      <div class="design-pill">当前设计<b>${S.width} 位${def.name}</b><div class="progress"><i style="width:${doneN * 10}%"></i></div></div>
      <nav>${NAV_GROUPS.map((g) => `<div class="nav-group">${g.title}</div>${g.keys.map(item).join('')}`).join('')}</nav>
      <div class="sidebar-foot"><button class="btn btn-sm" id="resetAll">${icon('redo', 13)} 重新开始</button><button class="tb-round" id="themeBtn" title="切换深色模式">${icon(dark ? 'sun' : 'moon')}</button></div>`;
  }

  function go(key) {
    if (!canEnter(key)) { toast('先完成前面的步骤，才能进入「' + ST[key].title + '」', 'error'); return; }
    epoch++;
    cleanups.forEach((f) => f());
    cleanups = [];
    S.stage = key;
    ensureDesign();
    renderNav();
    MOUNT[key]();
    main.scrollTop = 0;
  }

  function complete(key, msg, quiet) {
    if (!S.done.has(key)) {
      S.done.add(key);
      if (!quiet) toast(msg || `第 ${ST[key].n} 步「${ST[key].title}」完成`, 'success');
    }
    renderNav();
    const nb = $('#nextBtn');
    if (nb && S.stage === key) nb.disabled = false;
  }

  function uncomplete(key) {
    ORDER.slice(ORDER.indexOf(key)).forEach((k) => S.done.delete(k));
    renderNav();
    const nb = $('#nextBtn');
    if (nb) nb.disabled = !S.done.has(S.stage);
  }

  // 修改了某一步，它和之后的步骤都要重做
  function invalidate(key) {
    const i = ORDER.indexOf(key);
    if (i <= ORDER.indexOf('floorplan')) S.P = null;
    if (i <= ORDER.indexOf('route')) { S.route = null; S.sta = null; }
    uncomplete(key);
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-go]');
    if (t) { go(t.dataset.go); return; }
    if (e.target.closest('#themeBtn')) {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      store.set('theme', next);
      renderNav();
      C.redrawAll();
      window.dispatchEvent(new Event('themechange'));
    }
    if (e.target.closest('#resetAll')) {
      S.done.clear();
      Object.assign(S, { P: null, route: null, sta: null, sim: null });
      toast('已清空进度，从头开始');
      go('home');
    }
  });

  /* ---------- 页面骨架 ---------- */
  function footer(st) {
    const i = ORDER.indexOf(st.key), prev = STAGES[i - 1], next = STAGES[i + 1];
    return `<div class="page-foot">
      ${prev ? `<button class="btn btn-lg" data-go="${prev.key}">${icon('left')} ${prev.n ? prev.title : '首页'}</button>` : '<span></span>'}
      ${next ? `<button class="btn btn-primary btn-lg" id="nextBtn" data-go="${next.key}" ${S.done.has(st.key) ? '' : 'disabled'}>下一步：${next.title} ${icon('right')}</button>` : ''}
    </div>`;
  }

  function shell(key, lead, body, sideTop) {
    const st = ST[key], info = INFO[key];
    main.innerHTML = `<div class="page">
      <header class="page-head"><div class="eyebrow">第 ${st.n} 步 · ${st.en.toUpperCase()}</div><h1>${st.title}</h1><p class="lead">${lead}</p></header>
      <div class="stage-grid">
        <div class="stage-main">${body}</div>
        <aside class="side">
          ${sideTop || ''}
          <div class="card info"><h3>这一步在做什么</h3><p>${info.what}</p></div>
          <div class="card info"><h3>打个比方</h3><p>${info.like}</p></div>
          <div class="card info"><h3>在 OpenROAD 里这样写</h3><pre class="code-snip">${esc(info.cmd())}</pre></div>
        </aside>
      </div>
      ${footer(st)}
    </div>`;
  }

  const stat = (label, value, note, cls) => `<div class="stat ${cls || ''}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${note ? `<div class="stat-note">${note}</div>` : ''}</div>`;

  function makeLayout(cv, opt) {
    const l = new C.Layout(cv, opt);
    onLeave(() => l.destroy());
    return l;
  }

  const zoomTools = () => `<div class="canvas-tools"><button class="tb-round" data-zoom="in" title="放大">${icon('plus', 15)}</button><button class="tb-round" data-zoom="out" title="缩小">${icon('minus', 15)}</button><button class="tb-round" data-zoom="fit" title="复位">${icon('fit', 15)}</button></div>`;
  function bindZoom(root, lay) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-zoom]');
      if (!b) return;
      if (b.dataset.zoom === 'fit') { lay.view = null; lay.draw(); } else lay.zoomBy(b.dataset.zoom === 'in' ? 1.5 : 1 / 1.5);
    });
  }

  async function typeLog(con, lines, delay, my) {
    for (const [cls, text] of lines) {
      if (!alive(my)) return false;
      const d = document.createElement('div');
      if (cls) d.className = cls;
      d.textContent = text;
      con.appendChild(d);
      con.scrollTop = con.scrollHeight;
      await sleep(cls === 'cmd' ? delay * 1.6 : delay);
    }
    return alive(my);
  }
  const fillLog = (con, lines) => { con.innerHTML = lines.map(([c, t]) => `<div class="${c}">${esc(t)}</div>`).join(''); con.scrollTop = con.scrollHeight; };

  /* =================================================================== */
  const MOUNT = {};

  /* ---------- 首页 ---------- */
  const CHIPS = [
    { name: 'Intel 4004', year: 1971, t: 2300, note: '世界上第一颗商用微处理器' },
    { name: 'Apple A17 Pro', year: 2023, t: 19e9, note: 'iPhone 15 Pro 的手机芯片' },
    { name: 'NVIDIA B200', year: 2024, t: 208e9, note: '训练 AI 大模型用的 GPU' },
  ];
  function bigNum(n) {
    if (n >= 1e8) return fmt(n / 1e8, n >= 1e10 ? 0 : 1) + ' 亿';
    if (n >= 1e4) return fmt(n / 1e4, 1) + ' 万';
    return fmt(n);
  }
  function countText(t) {
    const sec = t, years = sec / 31536000;
    const time = sec < 3600 ? `${fmt(sec / 60)} 分钟` : sec < 86400 * 2 ? `${fmt(sec / 3600, 1)} 小时` : years < 1 ? `${fmt(sec / 86400)} 天` : `${fmt(years)} 年`;
    const km = t / 1e6, eq = km / 40075;
    const len = km < 1 ? `${fmt(t / 1000, 1)} 米` : eq < 1 ? `${fmt(km)} 公里，差不多是地球赤道的 ${Math.round(eq * 10) / 10 >= 0.45 && eq < 0.55 ? '一半' : fmt(eq * 100) + '%'}` : `${fmt(km)} 公里，能绕地球赤道 ${fmt(eq, 1)} 圈`;
    return { time, len };
  }

  MOUNT.home = () => {
    const flow = STAGES.slice(1).map((s) => `<button class="card flow-card ${s.n >= 5 && s.n <= 9 ? 'back' : ''}" data-go="${s.key}"><div class="n">${s.n}</div><h4>${s.title}</h4><div class="en">${s.en} · ${s.tool}</div><p>${s.desc}</p></button>`).join('');
    main.innerHTML = `<div class="page home">
      <section class="hero">
        <div class="hero-text">
          <div class="eyebrow">芯片工坊 · CHIP STUDIO</div>
          <h1 class="hero-title">从一行代码，<br>到一颗<em>芯片</em>。</h1>
          <p class="lead">芯片是人类造过的最精密的东西。在这里，你会亲手走完真实芯片设计的全部 10 个步骤：写代码、仿真、综合、布局、布线、签核，最后得到一份可以交给晶圆厂的 GDSII 版图文件。流程参考开源芯片工具链 OpenROAD，不需要任何基础。</p>
          <div class="hero-actions"><button class="btn btn-primary btn-lg" data-go="spec">开始设计我的芯片 ${icon('right')}</button><button class="btn btn-ghost btn-lg" id="seeFlow">先看看要经历哪些步骤</button></div>
        </div>
        <div class="card hero-visual"><canvas id="heroCv"></canvas><div class="canvas-hint">实时生成：一颗 4 位 ALU 正在布线</div></div>
      </section>
      <section class="section">
        <div class="section-label">How powerful</div>
        <h2 class="section-title">芯片到底有多强？</h2>
        <div class="power-grid">
          <div class="card power"><div class="big">2,300</div><div class="cap">1971 · Intel 4004</div><p>世界上第一颗商用微处理器，只有 2300 个晶体管。</p></div>
          <div class="card power"><div class="big">190<small>亿</small></div><div class="cap">2023 · Apple A17 Pro</div><p>一颗手机芯片里的晶体管，是 4004 的 800 多万倍，却只有指甲盖大小。</p></div>
          <div class="card power"><div class="big">2080<small>亿</small></div><div class="cap">2024 · NVIDIA B200</div><p>AI 大模型就是在成千上万颗这样的芯片上训练出来的。</p></div>
          <div class="card power"><div class="big">30<small>亿次/秒</small></div><div class="cap">3 GHz 时钟</div><p>时钟每跳一下，光只能走 10 厘米。芯片就在这么短的时间里完成一步计算。</p></div>
        </div>
      </section>
      <section class="section card count-card">
        <div>
          <div class="section-label">Feel the scale</div>
          <h2 class="section-title" style="margin-bottom:12px">数一数晶体管</h2>
          <div class="seg" id="countSeg">${CHIPS.map((c, i) => `<button data-i="${i}" class="${i === 1 ? 'active' : ''}">${c.name}</button>`).join('')}</div>
          <p class="hint" id="countNote" style="margin-top:12px"></p>
        </div>
        <div id="countOut"></div>
      </section>
      <section class="section" id="flow">
        <div class="section-label">The flow</div>
        <h2 class="section-title">一颗芯片的诞生：10 步</h2>
        <div class="flow-split"><span><i></i>前端设计：写出“电路是什么”</span><span><i class="b"></i>后端设计：OpenROAD 把电路“画”成版图</span></div>
        <div class="flow-grid">${flow}</div>
      </section>
    </div>`;

    const showCount = (i) => {
      const c = CHIPS[i], r = countText(c.t);
      $('#countNote').textContent = `${c.year} 年 · ${c.note} · ${bigNum(c.t)} 个晶体管`;
      $('#countOut').innerHTML = `<div class="hint">如果每秒数 1 个，不吃不睡，要数</div><div class="count-big">${r.time}</div><div class="count-line">如果每个晶体管放大成 1 毫米的小方块排成一排，长度是 <b>${r.len}</b>。</div>`;
    };
    showCount(1);
    $('#countSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      $$('#countSeg button').forEach((x) => x.classList.toggle('active', x === b));
      showCount(+b.dataset.i);
    });
    $('#seeFlow').addEventListener('click', () => $('#flow').scrollIntoView({ behavior: 'smooth' }));

    // 首页右侧：用本站的引擎现场跑一遍完整流程，循环播放布线动画
    const my = epoch;
    setTimeout(() => {
      if (!alive(my)) return;
      const nl = C.makeDesign('alu', 4), P = C.createPhys(nl, C.floorplan(nl, 0.55, 0.8));
      C.gpInit(P, 3);
      for (let i = 0; i < 150; i++) C.gpStep(P, i / 149);
      C.legalize(P);
      C.dpSwap(P, 3000);
      C.cts(P);
      const R = C.route(P);
      const lay = makeLayout($('#heroCv'), { pdn: true, labels: false, pins: true });
      lay.route = R;
      lay.set(P, { routes: reduced ? Infinity : 0 });
      if (reduced) return;
      let k = 0, hold = 0, raf = 0;
      const loop = () => {
        if (!alive(my)) return;
        if (k < R.nets.length) { k += 0.5; lay.o.routes = Math.floor(k); lay.draw(); }
        else if (++hold > 180) { k = 0; hold = 0; }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      onLeave(() => cancelAnimationFrame(raf));
    }, 60);
  };

  /* ---------- 第 1 步 定义芯片 ---------- */
  const DESIGN_COLOR = { adder: '#0071e3', counter: '#248a3d', alu: '#c93400' };

  function blockDiagram(nl) {
    const ins = [...(nl.clock ? [{ name: 'clk', width: 1 }] : []), ...nl.inputs], outs = nl.outputs;
    const rows = Math.max(ins.length, outs.length), boxH = Math.max(120, rows * 44 + 24);
    const W = 560, bx = 190, bw = 180, top = 16, H = boxH + 32;
    const yOf = (i, n) => top + (boxH * (i + 1)) / (n + 1);
    const arrow = (x, y) => `<path class="bd-line" d="M${x - 7},${y - 4} L${x},${y} L${x - 7},${y + 4}"/>`;
    let s = `<rect class="bd-box" x="${bx}" y="${top}" width="${bw}" height="${boxH}" rx="16"/>
      <text class="bd-title" x="${bx + bw / 2}" y="${top + boxH / 2 - 4}" text-anchor="middle">${nl.module}</text>
      <text class="bd-sub" x="${bx + bw / 2}" y="${top + boxH / 2 + 16}" text-anchor="middle">${nl.width} 位${nl.def.name}</text>`;
    ins.forEach((p, i) => {
      const y = yOf(i, ins.length);
      s += `<path class="bd-line" d="M80,${y} H${bx}"/>${arrow(bx, y)}<text class="bd-text" x="72" y="${y + 4}" text-anchor="end">${p.name}</text><text class="bd-sub" x="${(80 + bx) / 2}" y="${y - 7}" text-anchor="middle">${p.width} 位</text>`;
      if (p.name === 'clk') s += `<path class="bd-line" d="M${bx},${y - 7} l9,7 l-9,7"/>`;
    });
    outs.forEach((p, i) => {
      const y = yOf(i, outs.length), x2 = W - 80;
      s += `<path class="bd-line" d="M${bx + bw},${y} H${x2}"/>${arrow(x2, y)}<text class="bd-text" x="${x2 + 8}" y="${y + 4}">${p.name}</text><text class="bd-sub" x="${(bx + bw + x2) / 2}" y="${y - 7}" text-anchor="middle">${p.width} 位</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}">${s}</svg>`;
  }

  MOUNT.spec = () => {
    const nl = S.nl;
    const cards = Object.values(C.DESIGNS).map((d) => `<button class="design-card ${d.id === S.design ? 'active' : ''}" data-design="${d.id}">
        <div class="app-ico" style="background:${DESIGN_COLOR[d.id]}">${d.glyph}</div>
        <h4>${d.name}</h4><div class="tag">${d.tagline}</div><p>${d.desc}</p>
        <div class="meta">难度：${d.level} · ${d.id === 'adder' ? '无时钟' : '有时钟'}</div></button>`).join('');
    const inBits = nl.inputs.reduce((s, p) => s + p.width, 0), outBits = nl.outputs.reduce((s, p) => s + p.width, 0);
    shell('spec', '选一颗你想设计的芯片，再决定它的“位宽”。别担心选错，随时可以回来换。',
      `<div class="card"><div class="card-head"><div><div class="card-title">选择要设计的芯片</div><div class="card-sub">三种芯片从易到难，越往后越接近真正的 CPU</div></div></div>
        <div class="card-body">
          <div class="design-grid" id="designs">${cards}</div>
          <div class="spec-row">
            <div><div class="field-label" style="margin-bottom:6px">位宽</div><div class="seg" id="widthSeg"><button data-w="4" class="${S.width === 4 ? 'active' : ''}">4 位</button><button data-w="8" class="${S.width === 8 ? 'active' : ''}">8 位</button></div></div>
            <div class="hint" style="flex:1;min-width:220px">位宽决定能处理多大的数：4 位最大 ${C.mask(4)}，8 位最大 ${C.mask(8)}。你的电脑是 64 位的，最大能表示约 1845 亿亿。</div>
          </div>
          <div class="block-diagram">${blockDiagram(nl)}</div>
          <div class="stats" style="margin-top:14px">
            ${stat('输入引脚', inBits + (nl.clock ? 1 : 0), nl.clock ? `含 1 根时钟 clk` : '没有时钟')}
            ${stat('输出引脚', outBits)}
            ${stat('数值范围', `0 ~ ${C.mask(S.width)}`)}
            ${stat('电路类型', nl.clock ? '时序电路' : '组合电路', nl.clock ? '有记忆' : '没有记忆')}
          </div>
          <div class="actions" style="margin-top:18px"><button class="btn btn-primary btn-lg" id="confirm">确认规格，开始写代码 ${icon('right')}</button></div>
        </div></div>`);
    const change = (fn) => {
      fn();
      store.set('design', S.design);
      store.set('width', S.width);
      invalidate('spec');
      ensureDesign();
      renderNav();
      MOUNT.spec();
    };
    $('#designs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-design]');
      if (b && b.dataset.design !== S.design) change(() => { S.design = b.dataset.design; });
    });
    $('#widthSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]');
      if (b && +b.dataset.w !== S.width) change(() => { S.width = +b.dataset.w; });
    });
    $('#confirm').addEventListener('click', () => { complete('spec', '规格确定！'); go('rtl'); });
  };

  /* ---------- 第 2 步 编写 RTL ---------- */
  function highlight(code) {
    const i = code.indexOf('//');
    const src = i >= 0 ? code.slice(0, i) : code, cm = i >= 0 ? code.slice(i) : '';
    return esc(src).replace(/\b(module|endmodule|input|output|reg|wire|assign|always|posedge|begin|end|if|else|case|endcase)\b/g, '<span class="kw">$1</span>') + (cm ? `<span class="cm">${esc(cm)}</span>` : '');
  }

  MOUNT.rtl = () => {
    const nl = S.nl, lines = nl.def.verilog(nl.width), file = nl.module + '.v';
    shell('rtl', '芯片设计的第一行“代码”。下面是工程师会写的真实 Verilog，点击任意一行，右边会用大白话解释它。',
      `<div class="card"><div class="card-head"><span class="file-tab">${file}</span><div class="actions"><span class="status idle" id="lintStatus">尚未检查</span><button class="btn btn-primary" id="lint">${icon('play', 13)} 检查语法</button></div></div>
        <div class="card-body">
          <div class="code" id="code">${lines.map((l, i) => `<div class="ln" data-i="${i}"><span class="no">${i + 1}</span><span>${highlight(l.code) || ' '}</span></div>`).join('')}</div>
          <div class="console" id="con"><div class="dim">点击“检查语法”运行 Verilator</div></div>
        </div></div>`,
      `<div class="card info accent"><h3 id="lineTitle">点一行代码看解释</h3><p id="lineNote">${nl.clock ? '注意 always @(posedge clk) 这一行：它是所有数字芯片跳动的“心跳”。' : '整个加法器真正干活的只有一行代码，你能找到它吗？'}</p></div>`);
    $('#code').addEventListener('click', (e) => {
      const ln = e.target.closest('.ln');
      if (!ln) return;
      const l = lines[+ln.dataset.i];
      if (!l.note) return;
      $$('.ln').forEach((x) => x.classList.toggle('active', x === ln));
      $('#lineTitle').textContent = `第 ${+ln.dataset.i + 1} 行在说什么`;
      $('#lineNote').textContent = l.note;
    });
    const ports = [...(nl.clock ? ['clk'] : []), ...nl.inputs.map((p) => p.width > 1 ? `${p.name}[${p.width - 1}:0]` : p.name), ...nl.outputs.map((p) => p.width > 1 ? `${p.name}[${p.width - 1}:0]` : p.name)].join(' ');
    const log = [
      ['cmd', `verilator --lint-only ${file}`],
      ['dim', `解析模块 ${nl.module} …`],
      ['dim', `检查端口：${ports}`],
      ['dim', '检查位宽是否匹配、每个信号是否都有驱动 …'],
      ['ok', '✓ 0 个错误，0 个警告。代码可以进入下一步。'],
    ];
    if (S.done.has('rtl')) { fillLog($('#con'), log); $('#lintStatus').className = 'status ok'; $('#lintStatus').textContent = '语法正确'; }
    $('#lint').addEventListener('click', async () => {
      const my = epoch, con = $('#con'), st = $('#lintStatus');
      $('#lint').disabled = true;
      con.innerHTML = '';
      st.className = 'status run';
      st.textContent = '检查中';
      if (!(await typeLog(con, log, 260, my))) return;
      st.className = 'status ok';
      st.textContent = '语法正确';
      $('#lint').disabled = false;
      complete('rtl', '语法检查通过！');
    });
  };

  /* ---------- 第 3 步 功能仿真 ---------- */
  const OPS = ['加 +', '与 &', '或 |', '异或 ^'], OPSYM = ['+', '&', '|', '^'];
  const PORT_HINT = { rst: '复位', en: '使能' };

  function initSim() {
    const nl = S.nl, big = S.width === 8, inp = {};
    nl.inputs.forEach((p) => { inp[p.name] = 0; });
    if (nl.id === 'adder') Object.assign(inp, big ? { a: 100, b: 55 } : { a: 5, b: 9 });
    if (nl.id === 'counter') inp.en = 1;
    if (nl.id === 'alu') Object.assign(inp, big ? { a: 120, b: 45 } : { a: 6, b: 3 });
    S.sim = { inp, state: {}, hist: [], v: null, cycle: 0 };
    simEval();
    pushHist();
  }
  function simEval() {
    const vals = {};
    S.nl.inputs.forEach((p) => C.setPort(vals, p, S.sim.inp[p.name]));
    S.sim.v = C.evaluate(S.nl, vals, S.sim.state);
  }
  const outVal = (name) => C.getPort(S.sim.v, S.nl.outputs.find((p) => p.name === name));
  function pushHist() {
    const h = {};
    S.nl.inputs.forEach((p) => { h[p.name] = S.sim.inp[p.name]; });
    S.nl.outputs.forEach((p) => { h[p.name] = outVal(p.name); });
    S.sim.hist.push(h);
    if (S.sim.hist.length > 80) S.sim.hist.shift();
  }
  function simTick() { S.sim.state = C.tick(S.nl, S.sim.v); S.sim.cycle++; simEval(); pushHist(); }

  function inputsHtml() {
    return S.nl.inputs.map((p) => {
      const val = S.sim.inp[p.name];
      if (p.name === 'op') return `<div class="port"><span class="port-name">op</span><div class="seg" data-op>${OPS.map((t, i) => `<button data-v="${i}" class="${val === i ? 'active' : ''}">${t}</button>`).join('')}</div></div>`;
      let bits = '';
      for (let i = p.width - 1; i >= 0; i--) bits += `<button class="bit ${(val >> i) & 1 ? 'on' : ''}" data-port="${p.name}" data-bit="${i}" title="${p.name} 第 ${i} 位">${(val >> i) & 1}</button>`;
      return `<div class="port"><span class="port-name">${p.name}</span><div class="bits">${bits}</div><span class="port-val">${p.width > 1 ? `<b>${val}</b>` : PORT_HINT[p.name] || ''}</span></div>`;
    }).join('');
  }
  function outputsHtml() {
    return S.nl.outputs.map((p) => {
      const v = outVal(p.name);
      let bits = '';
      for (let i = p.width - 1; i >= 0; i--) bits += `<span class="bit led ${(v >> i) & 1 ? 'on' : ''}" style="display:inline-flex;align-items:center;justify-content:center">${(v >> i) & 1}</span>`;
      return `<div class="port"><span class="port-name">${p.name}</span><div class="bits">${bits}</div><span class="port-val"><b>${v}</b></span></div>`;
    }).join('');
  }
  function bindInputs(root, onChange) {
    root.addEventListener('click', (e) => {
      const b = e.target.closest('.bit[data-port]');
      if (b) { S.sim.inp[b.dataset.port] ^= 1 << +b.dataset.bit; onChange(); return; }
      const o = e.target.closest('[data-op] button');
      if (o) { S.sim.inp.op = +o.dataset.v; onChange(); }
    });
  }

  function equationHtml() {
    const nl = S.nl, N = nl.width, I = S.sim.inp;
    if (nl.id === 'adder') {
      const s = outVal('s'), co = outVal('cout'), total = s + (co << N);
      return `<div class="equation">${I.a} + ${I.b} = <em>${total}</em></div><div class="eq-note">二进制：${bin(I.a, N)} + ${bin(I.b, N)} = ${co}${bin(s, N)}${co ? `<br>结果超过了 ${N} 位能表示的最大值 ${C.mask(N)}，最高位通过进位 cout 输出。` : ''}</div>`;
    }
    if (nl.id === 'counter') {
      const q = outVal('q'), next = C.DESIGNS.counter.step(I, { q }, N).q;
      const why = I.rst ? '复位中：下一拍会归零。' : !I.en ? '暂停中：使能为 0，数值保持不变。' : `下一个时钟上升沿，它会变成 ${next}。`;
      return `<div class="equation">q = <em>${q}</em></div><div class="eq-note">已经过了 ${S.sim.cycle} 个时钟周期。${why}</div>`;
    }
    const y = outVal('y'), want = C.DESIGNS.alu.step(I, {}, N).y;
    return `<div class="equation">${I.a} ${OPSYM[I.op]} ${I.b} = <em>${want}</em></div><div class="eq-note">寄存器里现在的 y = ${y}。${y === want ? '结果已经存进寄存器了。' : '结果要等下一个时钟上升沿才会存进寄存器，点“走一拍”试试。'}</div>`;
  }

  MOUNT.sim = () => {
    if (!S.sim) initSim();
    const nl = S.nl;
    shell('sim', nl.clock ? '点亮输入开关，再按“走一拍”给芯片一个时钟脉冲，看看它会怎么反应。确认没问题后，跑一遍自动测试。' : '点击输入的每一位，把它在 0 和 1 之间切换，输出会立刻算出来。确认没问题后，跑一遍自动测试。',
      `<div class="card"><div class="card-head"><div><div class="card-title">交互仿真</div><div class="card-sub">你看到的结果，是由综合后的门电路一个一个真实算出来的</div></div>
          ${nl.clock ? `<div class="actions"><button class="btn" id="tickBtn">${icon('play', 13)} 时钟 走一拍</button><button class="btn" id="autoBtn">自动运行</button></div>` : ''}</div>
        <div class="card-body">
          <div class="io-grid">
            <div class="io-panel"><h4>输入（点击切换）</h4><div id="ins">${inputsHtml()}</div></div>
            <div class="io-panel"><h4>输出</h4><div id="eq"></div><div id="outs" style="margin-top:12px"></div></div>
          </div>
          <div class="wave-wrap"><div class="section-label">波形图 · 工程师用它观察信号随时间的变化</div><canvas class="wave" id="wave"></canvas></div>
          <div class="tb-row"><div><div class="card-title" style="font-size:15px">自动测试 (testbench)</div><div class="hint">随机生成 500 组输入，和“标准答案”逐一比对</div></div>
            <div class="actions"><span class="status idle" id="tbStatus">尚未测试</span><button class="btn btn-primary" id="tbBtn">${icon('play', 13)} 运行测试</button></div></div>
        </div></div>`);
    const rows = [...(nl.clock ? [{ label: 'clk', clock: true }] : []), ...nl.inputs.map((p) => ({ label: p.name, key: p.name, bits: p.width })), ...nl.outputs.map((p) => ({ label: p.name, key: p.name, bits: p.width }))];
    const wave = $('#wave');
    wave.style.height = Math.min(30 * rows.length, 210) + 'px';
    const refresh = (fromInput) => {
      if (fromInput) { simEval(); if (!nl.clock) pushHist(); }
      $('#ins').innerHTML = inputsHtml();
      $('#outs').innerHTML = outputsHtml();
      $('#eq').innerHTML = equationHtml();
      C.drawWave(wave, rows, S.sim.hist);
    };
    refresh(false);
    bindInputs($('#ins'), () => refresh(true));
    const onResize = () => C.drawWave(wave, rows, S.sim.hist);
    window.addEventListener('resize', onResize);
    window.addEventListener('themechange', onResize);
    onLeave(() => { window.removeEventListener('resize', onResize); window.removeEventListener('themechange', onResize); });
    if (nl.clock) {
      $('#tickBtn').addEventListener('click', () => { simTick(); refresh(false); });
      let timer = null;
      const stop = () => { clearInterval(timer); timer = null; $('#autoBtn').textContent = '自动运行'; };
      $('#autoBtn').addEventListener('click', () => {
        if (timer) return stop();
        timer = setInterval(() => { simTick(); refresh(false); }, 650);
        $('#autoBtn').textContent = '停止';
      });
      onLeave(() => clearInterval(timer));
    }
    if (S.done.has('sim')) { $('#tbStatus').className = 'status ok'; $('#tbStatus').textContent = '500 / 500 通过'; }
    $('#tbBtn').addEventListener('click', async () => {
      const my = epoch, st = $('#tbStatus');
      $('#tbBtn').disabled = true;
      st.className = 'status run';
      const R = C.selfTest(nl, 500);
      for (let k = 0; k <= 25; k++) {
        st.textContent = `测试中 ${Math.round((R.total * k) / 25)} / ${R.total}`;
        await sleep(36);
        if (!alive(my)) return;
      }
      $('#tbBtn').disabled = false;
      if (R.pass === R.total) {
        st.className = 'status ok';
        st.textContent = `${R.pass} / ${R.total} 全部通过`;
        complete('sim', '仿真通过！电路功能完全正确');
      } else {
        st.className = 'status bad';
        st.textContent = `${R.total - R.pass} 组失败`;
      }
    });
  };

  /* ---------- 第 4 步 逻辑综合 ---------- */
  function yosysLog(nl) {
    const st = C.stats(nl.cells), f = nl.module + '.v';
    const expand = { adder: '把 “a + b” 展开成一串全加器', counter: '把 “q + 1” 和 if/else 展开成逻辑', alu: '把 case 展开成选择器，把 “+” 展开成加法器' }[nl.id];
    return [
      ['cmd', `yosys -p "synth -top ${nl.module}" ${f}`],
      ['', `1. 读取 ${f}，找到模块 ${nl.module}`],
      ['', `2. ${expand}`],
      ['', '3. 逻辑优化：合并重复的门，删除用不到的逻辑'],
      ['', nl.clock ? `4. 发现 ${nl.dffs.length} 个需要“记住”的比特 → 映射为触发器 DFF` : '4. 没有发现时钟和寄存器：这是一个纯组合电路'],
      ['cmd', 'abc -liberty edu45.lib'],
      ['', '5. 映射到标准单元库：' + Object.entries(st.by).map(([t, n]) => `${t}×${n}`).join('  ')],
      ['cmd', 'stat'],
      ['', `单元 ${st.cells} 个   晶体管 ${st.transistors} 个   面积 ${st.area.toFixed(1)} µm²`],
      ['ok', '✓ 综合完成，门级网表已写入 netlist.v'],
    ];
  }

  MOUNT.synth = () => {
    if (!S.sim) initSim();
    const nl = S.nl, st = C.stats(nl.cells);
    shell('synth', '你写的是“要做加法”这样的意图，工厂需要的却是“哪几个门、怎么连”。逻辑综合就是这道翻译题，由开源工具 Yosys 完成。',
      `<div class="card"><div class="card-head"><div><div class="card-title">Yosys 逻辑综合</div><div class="card-sub">Verilog 代码 → 门级网表</div></div><button class="btn btn-primary" id="runSyn">${icon('play', 13)} 运行综合</button></div>
        <div class="card-body"><div class="console" id="con"><div class="dim">点击“运行综合”，看 Verilog 怎样变成逻辑门</div></div><div id="synOut"></div></div></div>
       <div id="synReport"></div>`);
    const show = () => {
      $('#synOut').innerHTML = `
        <div class="controls" style="margin:16px 0 0;justify-content:space-between">
          <div class="mini-inputs" id="ins">${inputsHtml()}${nl.clock ? `<button class="btn btn-sm" id="tickBtn">${icon('play', 12)} 走一拍</button>` : ''}</div>
          <div class="seg" id="zoomSeg"><button data-z="1" class="active">实际大小</button><button data-z="fit">看全貌</button></div>
        </div>
        <div class="hint" style="margin-top:10px">切换输入试试：<span style="color:var(--primary);font-weight:500">蓝色导线</span>表示信号为 1，灰色表示 0。虚线是从触发器绕回来的反馈线。</div>
        <div class="sch-wrap" id="sch">${C.schematic(nl)}</div>`;
      const sch = $('#sch');
      const upd = () => { simEval(); $('#ins').innerHTML = inputsHtml() + (nl.clock ? `<button class="btn btn-sm" id="tickBtn">${icon('play', 12)} 走一拍</button>` : ''); C.updateSchematic(sch, S.sim.v); };
      C.updateSchematic(sch, S.sim.v);
      bindInputs($('#ins'), upd);
      $('#ins').addEventListener('click', (e) => { if (e.target.closest('#tickBtn')) { simTick(); upd(); } });
      $('#zoomSeg').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        $$('#zoomSeg button').forEach((x) => x.classList.toggle('active', x === b));
        sch.classList.toggle('fit', b.dataset.z === 'fit');
      });
      const types = Object.keys(st.by);
      $('#synReport').innerHTML = `<div class="card"><div class="card-head"><div><div class="card-title">综合报告</div><div class="card-sub">你的芯片由这些标准单元组成</div></div></div>
        <div class="card-body">
          <div class="stats">${stat('标准单元', st.cells, '个逻辑门')}${stat('晶体管', st.transistors, '个开关')}${stat('单元面积', st.area.toFixed(1) + '<small>µm²</small>', '约为头发丝截面的 ' + fmt((st.area / 3848) * 100, 2) + '%')}${stat('触发器', nl.dffs.length, nl.clock ? '个比特的记忆' : '纯组合电路')}</div>
          <div class="section-label" style="margin:18px 0 10px">标准单元库 · 工厂预先设计好的“积木”</div>
          <div class="lib-grid">${types.map((t) => `<div class="lib-card">${C.gateIcon(t)}<h5>${C.LIB[t].label} ${t}<span>×${st.by[t]}</span></h5><p>${C.LIB[t].desc}</p><div class="meta">每个由 ${C.LIB[t].t} 个晶体管组成</div></div>`).join('')}</div>
        </div></div>`;
    };
    if (S.done.has('synth')) { fillLog($('#con'), yosysLog(nl)); show(); $('#runSyn').innerHTML = icon('redo', 13) + ' 重新综合'; }
    $('#runSyn').addEventListener('click', async () => {
      const my = epoch;
      $('#runSyn').disabled = true;
      $('#con').innerHTML = '';
      $('#synOut').innerHTML = '';
      $('#synReport').innerHTML = '';
      if (!(await typeLog($('#con'), yosysLog(nl), 230, my))) return;
      show();
      $('#runSyn').disabled = false;
      $('#runSyn').innerHTML = icon('redo', 13) + ' 重新综合';
      complete('synth', `综合完成：${st.cells} 个逻辑门、${st.transistors} 个晶体管`);
    });
  };

  /* ---------- 第 5 步 布图规划 ---------- */
  function newFloorplan() { S.P = C.createPhys(S.nl, C.floorplan(S.nl, S.util, S.aspect)); S.route = null; }

  MOUNT.floorplan = () => {
    if (!S.P) newFloorplan();
    shell('floorplan', '从这里开始，我们把电路“画”到硅片上。先决定芯片多大、什么形状，把引脚排在四周，再铺好电源。',
      `<div class="card"><div class="card-head"><div><div class="card-title">芯片平面图</div><div class="card-sub">灰色条纹是放标准单元的“行”，四周的小方块是输入输出引脚</div></div><span class="status idle" id="fpStatus">等待确认</span></div>
        <div class="card-body">
          <div class="controls">
            <div class="field"><div class="field-label">利用率（单元占核心面积的比例）<b id="utilV"></b></div><input type="range" id="util" min="30" max="75" step="5" value="${Math.round(S.util * 100)}"></div>
            <div class="field"><div class="field-label">长宽比（高 ÷ 宽）<b id="aspV"></b></div><input type="range" id="asp" min="0.5" max="2" step="0.1" value="${S.aspect}"></div>
          </div>
          <div class="canvas-wrap"><canvas id="cv"></canvas><div class="canvas-tag" id="tags"><span>initialize_floorplan</span><span>place_pins</span><span>pdngen</span></div></div>
          <div class="hint" style="margin-top:10px">利用率越高，芯片越小越便宜，但留给导线的空间越少，后面布线可能“堵车”。新手建议 40%~60%。</div>
          <div class="stats" style="margin-top:14px" id="fpStats"></div>
          <div class="actions" style="margin-top:16px"><button class="btn btn-primary btn-lg" id="fpGo">${icon('play', 13)} 确认并生成电源网络</button></div>
        </div></div>`);
    const lay = makeLayout($('#cv'), { cells: false, pdn: S.done.has('floorplan') });
    const tags = $$('#tags span');
    const sync = () => {
      const fp = S.P.fp;
      $('#utilV').textContent = Math.round(S.util * 100) + '%';
      $('#aspV').textContent = S.aspect.toFixed(1);
      $('#fpStats').innerHTML = stat('芯片尺寸', `${um(fp.W)} × ${um(fp.H)}<small>µm</small>`, '1 µm = 千分之一毫米')
        + stat('核心面积', fmt(fp.core.w * fp.core.h * C.PITCH * C.PITCH, 1) + '<small>µm²</small>')
        + stat('标准单元行', fp.rows, `每行高 ${um(C.ROWH, 2)} µm`)
        + stat('IO 引脚', fp.pins.length, '排在芯片四周');
      lay.set(S.P);
      const done = S.done.has('floorplan');
      tags.forEach((t) => t.classList.toggle('on', done));
      $('#fpStatus').className = done ? 'status ok' : 'status idle';
      $('#fpStatus').textContent = done ? '布图完成' : '等待确认';
    };
    sync();
    const onInput = () => {
      S.util = +$('#util').value / 100;
      S.aspect = +$('#asp').value;
      invalidate('floorplan');
      newFloorplan();
      lay.o.pdn = false;
      sync();
    };
    $('#util').addEventListener('input', onInput);
    $('#asp').addEventListener('input', onInput);
    $('#fpGo').addEventListener('click', async () => {
      const my = epoch;
      $('#fpGo').disabled = true;
      lay.set(S.P, { pdn: false, pins: false });
      $('#fpStatus').className = 'status run';
      $('#fpStatus').textContent = '生成中';
      tags.forEach((t) => t.classList.remove('on'));
      for (let i = 0; i < 3; i++) {
        await sleep(500);
        if (!alive(my)) return;
        tags[i].classList.add('on');
        if (i === 1) lay.set(S.P, { pins: true });
        if (i === 2) lay.set(S.P, { pdn: true });
      }
      $('#fpGo').disabled = false;
      complete('floorplan', '布图规划完成，电源网络已铺好');
      sync();
    });
  };

  /* ---------- 第 6 步 布局 ---------- */
  MOUNT.place = () => {
    const P = S.P, n = P.cells.filter((c) => !c.clock).length;
    shell('place', `你的芯片有 ${n} 个标准单元。现在要给它们安排座位：连线越短越好，而且不能重叠。点击开始，看算法怎么一步步把它们摆好。`,
      `<div class="card"><div class="card-head"><div class="phases" id="phases"><span class="phase">① 全局布局</span><span class="phase">② 合法化</span><span class="phase">③ 详细布局</span></div>
          <div class="actions"><button class="btn" id="flyBtn">显示飞线</button><button class="btn btn-primary" id="runPl">${icon('play', 13)} 开始布局</button></div></div>
        <div class="card-body">
          <div class="canvas-wrap"><canvas id="cv"></canvas><div class="canvas-empty" id="empty">单元们还在“仓库”里<br>点击「开始布局」，把它们放进芯片</div></div>
          <div class="io-grid" style="margin-top:14px">
            <div class="spark-box"><div class="stat-label">总线长 HPWL（越小越好）</div><canvas class="spark" id="spark"></canvas></div>
            <div class="stats" id="plStats"></div>
          </div>
        </div></div>`);
    const lay = makeLayout($('#cv'), { pdn: true, cells: S.done.has('place'), fly: false });
    lay.set(P);
    const placed = S.done.has('place');
    $('#empty').style.display = placed ? 'none' : '';
    const phases = $$('#phases .phase');
    const setPhase = (k) => phases.forEach((p, i) => { p.classList.toggle('on', i === k); p.classList.toggle('done', i < k); });
    if (placed) setPhase(3);
    let hist = [];
    const stats = () => {
      const h = C.hpwl(P), ov = C.overlaps(P);
      $('#plStats').innerHTML = stat('总线长', um(h, 0) + '<small>µm</small>', '估算的导线总长度') + stat('重叠', ov, ov ? '个单元互相压着' : '没有任何重叠', ov ? '' : 'good');
    };
    if (placed) stats();
    let fly = false;
    $('#flyBtn').addEventListener('click', () => {
      fly = !fly;
      $('#flyBtn').textContent = fly ? '隐藏飞线' : '显示飞线';
      lay.o.fly = fly;
      lay.draw();
    });
    $('#runPl').addEventListener('click', async () => {
      const my = epoch;
      $('#runPl').disabled = true;
      invalidate('place');
      C.resetClock(P);
      C.gpInit(P, ++S.seed * 7 + 1);
      hist = [];
      $('#empty').style.display = 'none';
      lay.set(P, { cells: true, ghost: true });
      setPhase(0);
      const ITER = 150;
      for (let i = 0; i < ITER; i++) {
        C.gpStep(P, i / (ITER - 1));
        if (i % 3 === 0) { hist.push(C.hpwl(P)); C.drawSpark($('#spark'), hist); stats(); }
        lay.draw();
        await frame();
        if (!alive(my)) return;
      }
      setPhase(1);
      const from = P.cells.map((c) => [c.x, c.y]);
      C.legalize(P);
      const to = P.cells.map((c) => [c.x, c.y]);
      for (let k = 1; k <= 28; k++) {
        const t = ease(k / 28);
        P.cells.forEach((c, i) => { c.x = from[i][0] + (to[i][0] - from[i][0]) * t; c.y = from[i][1] + (to[i][1] - from[i][1]) * t; });
        lay.draw();
        await frame();
        if (!alive(my)) return;
      }
      lay.o.ghost = false;
      hist.push(C.hpwl(P));
      stats();
      setPhase(2);
      for (let k = 0; k < 50; k++) {
        C.dpSwap(P, 60);
        if (k % 2 === 0) { hist.push(C.hpwl(P)); C.drawSpark($('#spark'), hist); }
        lay.draw();
        await frame();
        if (!alive(my)) return;
      }
      stats();
      setPhase(3);
      $('#runPl').disabled = false;
      $('#runPl').innerHTML = icon('redo', 13) + ' 重新布局';
      if (P.overflow) toast('单元太挤，有的放到了核心区外。回到布图规划降低利用率试试', 'error');
      complete('place', '布局完成，所有单元都有了座位');
    });
    if (placed) $('#runPl').innerHTML = icon('redo', 13) + ' 重新布局';
    const redraw = () => C.drawSpark($('#spark'), hist);
    window.addEventListener('themechange', redraw);
    onLeave(() => window.removeEventListener('themechange', redraw));
  };

  /* ---------- 第 7 步 时钟树综合 ---------- */
  MOUNT.cts = () => {
    const P = S.P, nl = S.nl;
    if (!nl.clock) {
      shell('cts', '时钟树负责把“心跳”同时送到每一个触发器。',
        `<div class="card"><div class="card-head"><div><div class="card-title">这颗芯片不需要时钟树</div><div class="card-sub">加法器是纯组合电路：输入一变，输出立刻跟着变，不需要时钟，也没有触发器</div></div></div>
          <div class="card-body">
            <div class="canvas-wrap" style="height:360px"><canvas id="cv"></canvas></div>
            <p class="hint" style="margin:14px 0 0">在真实的处理器里，加法器前后都会接上寄存器，那时就需要时钟树了。想体验这一步，可以回到第 1 步换成“计数器”或“ALU”。</p>
            <div class="actions" style="margin-top:16px"><button class="btn btn-primary btn-lg" id="skip">跳过这一步 ${icon('right')}</button></div>
          </div></div>`);
      makeLayout($('#cv'), { pdn: true }).set(P);
      $('#skip').addEventListener('click', () => { C.resetClock(P); invalidate('cts'); complete('cts', '组合电路，无需时钟树'); go('route'); });
      return;
    }
    const nDff = P.cells.filter((c) => c.type === 'DFF').length;
    shell('cts', `芯片里有 ${nDff} 个触发器在等时钟信号。我们要从底部的 clk 引脚出发，搭一棵“树”，让时钟几乎同时到达它们每一个。`,
      `<div class="card"><div class="card-head"><div><div class="card-title">时钟树</div><div class="card-sub">黑色粗线是时钟走线，蓝色小格是新插入的时钟缓冲器</div></div><button class="btn btn-primary" id="runCts">${icon('play', 13)} 构建时钟树</button></div>
        <div class="card-body">
          <div class="canvas-wrap"><canvas id="cv"></canvas></div>
          <div class="stats" style="margin-top:14px" id="ctsStats"></div>
        </div></div>`);
    const lay = makeLayout($('#cv'), { pdn: true, clock: 0 });
    const done = S.done.has('cts') && P.ctsInfo;
    lay.set(P, { clock: done ? 99 : 0 });
    const stats = (info) => {
      $('#ctsStats').innerHTML = info
        ? stat('时钟终点', info.sinks, '个触发器') + stat('插入缓冲器', info.bufs.length, '个 CLKBUF') + stat('时钟偏差 skew', fmt(info.skew, 1) + '<small>ps</small>', '越接近 0 越好', info.skew < 20 ? 'good' : '') + stat('时钟延迟', fmt(info.latency, 1) + '<small>ps</small>', '从 clk 引脚到触发器')
        : stat('时钟终点', nDff, '个触发器') + stat('插入缓冲器', '—') + stat('时钟偏差 skew', '—') + stat('时钟延迟', '—');
    };
    stats(done ? P.ctsInfo : null);
    if (done) $('#runCts').innerHTML = icon('redo', 13) + ' 重新构建';
    $('#runCts').addEventListener('click', async () => {
      const my = epoch;
      $('#runCts').disabled = true;
      invalidate('cts');
      const info = C.cts(P);
      lay.set(P, { clock: 0 });
      for (let l = 1; l <= info.levels; l++) {
        await sleep(450);
        if (!alive(my)) return;
        lay.o.clock = l;
        lay.draw();
      }
      stats(info);
      $('#runCts').disabled = false;
      $('#runCts').innerHTML = icon('redo', 13) + ' 重新构建';
      complete('cts', `时钟树完成，偏差只有 ${fmt(info.skew, 1)} ps`);
    });
  };

  /* ---------- 第 8 步 布线 ---------- */
  MOUNT.route = () => {
    const P = S.P;
    shell('route', `现在有 ${P.nets.length} 条线网要连。蓝色是横向金属层，灰色是纵向金属层，导线拐弯处的小方块是连接两层的通孔。可以滚轮缩放、拖动查看细节。`,
      `<div class="card"><div class="card-head"><div class="chips" id="layers"><button class="chip active" data-l="h">横向金属 M2</button><button class="chip active" data-l="v">纵向金属 M3</button><button class="chip active" data-l="via">通孔 Via</button></div>
          <button class="btn btn-primary" id="runRt">${icon('play', 13)} 开始布线</button></div>
        <div class="card-body">
          <div class="canvas-wrap"><canvas id="cv"></canvas>${zoomTools()}<div class="canvas-hint">滚轮缩放 · 拖动平移 · 双击复位</div></div>
          <div class="console" id="con" style="margin-top:14px;height:130px"><div class="dim">点击“开始布线”运行迷宫布线器</div></div>
          <div class="stats" style="margin-top:14px" id="rtStats"></div>
          <div id="rtWarn"></div>
        </div></div>`);
    const lay = makeLayout($('#cv'), { pdn: true, interactive: true, labels: true });
    bindZoom($('.canvas-wrap'), lay);
    lay.route = S.route;
    lay.set(P, { routes: S.route ? Infinity : 0 });
    $('#layers').addEventListener('click', (e) => {
      const b = e.target.closest('[data-l]');
      if (!b) return;
      b.classList.toggle('active');
      lay.o.layers[b.dataset.l] = b.classList.contains('active');
      lay.draw();
    });
    const stats = (R) => {
      $('#rtStats').innerHTML = stat('线网', P.nets.length, '条需要连接') + stat('导线总长', R ? um(R.length, 0) + '<small>µm</small>' : '—')
        + stat('通孔', R ? R.vias : '—', '个层间连接') + stat('短路冲突', R ? R.conflicts + R.failed : '—', R ? (R.conflicts + R.failed ? '需要解决' : 'DRC 干净') : '', R ? (R.conflicts + R.failed ? 'bad' : 'good') : '');
      $('#rtWarn').innerHTML = R && R.conflicts + R.failed
        ? `<div class="check" style="margin-top:14px"><h5>布线拥塞</h5><button class="btn" data-go="floorplan">回到布图规划</button><p>空间太挤，有 ${R.conflicts} 处导线无法避开彼此。真实工程师也常遇到这种情况：回到第 5 步把利用率调低一点，再重新布局和布线。</p></div>`
        : '';
    };
    stats(S.route);
    if (S.route) { fillLog($('#con'), routeLog(S.route)); $('#runRt').innerHTML = icon('redo', 13) + ' 重新布线'; }
    $('#runRt').addEventListener('click', async () => {
      const my = epoch, con = $('#con');
      $('#runRt').disabled = true;
      invalidate('route');
      con.innerHTML = '';
      lay.set(P, { routes: 0 });
      stats(null);
      if (!(await typeLog(con, [['cmd', 'global_route'], ['cmd', 'detailed_route'], ['dim', `布线网格 ${P.fp.W} × ${P.fp.H} × 2 层，共 ${P.nets.length} 条线网`]], 200, my))) return;
      await frame();
      const R = C.route(P);
      S.route = R;
      lay.route = R;
      const log = routeLog(R).slice(3);
      if (!(await typeLog(con, log, 180, my))) return;
      const step = Math.max(1, Math.ceil(R.nets.length / 70));
      for (let k = 1; k <= R.nets.length; k += step) {
        lay.o.routes = k;
        lay.draw();
        await frame();
        if (!alive(my)) return;
      }
      lay.o.routes = Infinity;
      lay.draw();
      stats(R);
      $('#runRt').disabled = false;
      $('#runRt').innerHTML = icon('redo', 13) + ' 重新布线';
      if (!R.conflicts && !R.failed) complete('route', `布线完成：${R.nets.length} 条线网全部连通`);
      else toast('布线有冲突，试试降低利用率', 'error');
    });
  };
  function routeLog(R) {
    const lines = [['cmd', 'global_route'], ['cmd', 'detailed_route'], ['dim', '布线网格就绪']];
    R.log.forEach((l) => lines.push([l.conflicts ? 'warn' : '', `第 ${l.it} 轮：布线 ${l.rerouted} 条线网，冲突 ${l.conflicts} 处${l.conflicts ? ' → 拆掉冲突的线重新布' : ''}`]));
    lines.push(R.conflicts || R.failed ? ['warn', `✗ 仍有 ${R.conflicts} 处冲突、${R.failed} 条线未连通`] : ['ok', `✓ 布线完成：导线 ${um(R.length, 0)} µm，通孔 ${R.vias} 个，0 处短路`]);
    return lines;
  }

  /* ---------- 第 9 步 签核 ---------- */
  function power() {
    const st = C.stats(S.P.cells), wireUm = S.route.length * C.PITCH;
    const cap = st.transistors * 0.12 + wireUm * 0.18;             // fF
    const dyn = 0.15 * cap * 1e-15 * 1.1 * 1.1 * S.freq * 1e6;      // α·C·V²·f
    return (dyn + st.transistors * 5e-9) * 1e6;                    // µW
  }
  function signoffResult() {
    const T = S.sta, period = 1e6 / S.freq, slack = period - T.delay;
    return {
      sta: { pass: slack >= 0, period, slack, fmax: 1e6 / T.delay },
      drc: { pass: !S.route.conflicts },
      lvs: { pass: !S.route.failed },
      pwr: { pass: true, uw: power() },
    };
  }
  const CHECKS = [
    { key: 'sta', title: '静态时序分析 STA', desc: '检查最慢的那条信号路径，能不能在一个时钟周期内跑完。' },
    { key: 'drc', title: '设计规则检查 DRC', desc: '检查版图有没有违反工厂的制造规则，比如两根导线碰在一起短路。' },
    { key: 'lvs', title: '版图与原理图一致性 LVS', desc: '检查画出来的版图，和综合得到的电路网表是不是一模一样。' },
    { key: 'pwr', title: '功耗分析', desc: '估算芯片工作时要消耗多少电。' },
  ];

  MOUNT.signoff = () => {
    const P = S.P, nl = S.nl;
    shell('signoff', '最后的体检。设定一个你希望芯片达到的频率，看看它能不能跑得动——以及它有多省电。',
      `<div class="card"><div class="card-head"><div><div class="card-title">签核检查</div><div class="card-sub">四项全部通过，才能交给晶圆厂</div></div><button class="btn btn-primary" id="runSo">${icon('play', 13)} 运行签核</button></div>
        <div class="card-body">
          <div class="controls"><div class="field"><div class="field-label">目标时钟频率<b id="freqV"></b></div><input type="range" id="freq" min="100" max="3000" step="50" value="${S.freq}"></div></div>
          <div class="checks" id="checks">${CHECKS.map((c) => `<div class="check" data-c="${c.key}"><h5>${c.title}</h5><span class="status idle">待检查</span><p>${c.desc}</p></div>`).join('')}</div>
        </div></div>
       <div class="card" id="pathCard" style="display:none"><div class="card-head"><div><div class="card-title">关键路径</div><div class="card-sub">芯片里最慢的一条路，决定了它最快能跑多快（版图中橙色高亮）</div></div></div>
        <div class="card-body">
          <div class="canvas-wrap" style="height:400px"><canvas id="cv"></canvas>${zoomTools()}</div>
          <div class="table-wrap" style="margin-top:14px"><table class="path-table" id="pathTable"></table></div>
        </div></div>`);
    $('#freqV').textContent = S.freq + ' MHz';
    let lay = null;
    const render = (animate) => {
      const r = signoffResult();
      const set = (key, cls, text, p) => {
        const el = $(`.check[data-c="${key}"]`);
        el.querySelector('.status').className = 'status ' + cls;
        el.querySelector('.status').textContent = text;
        if (p) el.querySelector('p').innerHTML = p;
      };
      const ghz = r.sta.fmax >= 1000 ? fmt(r.sta.fmax / 1000, 2) + ' GHz' : fmt(r.sta.fmax) + ' MHz';
      const per = nl.id === 'adder' ? `每秒最多能做 ${bigNum(r.sta.fmax * 1e6)} 次加法` : `时钟每秒最多跳 ${bigNum(r.sta.fmax * 1e6)} 次`;
      set('sta', r.sta.pass ? 'ok' : 'bad', r.sta.pass ? '通过' : '时序违例',
        `最慢路径延迟 <b>${fmt(S.sta.delay, 1)} ps</b>，目标周期 ${fmt(r.sta.period, 1)} ps，余量 (slack) <b style="color:var(--${r.sta.pass ? 'success' : 'danger'})">${r.sta.slack >= 0 ? '+' : ''}${fmt(r.sta.slack, 1)} ps</b>。这颗芯片最高能跑到 <b>${ghz}</b>，${per}。${r.sta.pass ? '' : '<br>把目标频率调低一些再试——真实工程师则会去优化电路结构。'}`);
      set('drc', r.drc.pass ? 'ok' : 'bad', r.drc.pass ? '通过' : '违例', `检查了总长 ${um(S.route.length, 0)} µm 的导线和 ${S.route.vias} 个通孔：${r.drc.pass ? '没有短路，线宽和间距都符合规则。' : `发现 ${S.route.conflicts} 处短路。`}`);
      set('lvs', r.lvs.pass ? 'ok' : 'bad', r.lvs.pass ? '通过' : '不一致', `版图中 ${P.nets.length} 条线网、${P.cells.length} 个单元，与网表${r.lvs.pass ? '完全一致' : '不一致'}${P.ctsInfo ? `（含时钟树新增的 ${P.ctsInfo.bufs.length} 个缓冲器）` : ''}。`);
      const led = 20000 / r.pwr.uw;
      set('pwr', 'ok', fmt(r.pwr.uw, 2) + ' µW', `在 ${S.freq} MHz 下约 <b>${fmt(r.pwr.uw, 2)} 微瓦</b>。一颗普通的 LED 指示灯约 20 毫瓦，是它的 ${fmt(led)} 倍。`);
      const all = r.sta.pass && r.drc.pass && r.lvs.pass;
      if (all) complete('signoff', '签核全部通过！可以流片了', !animate);
      else uncomplete('signoff');
    };
    const showPath = () => {
      $('#pathCard').style.display = '';
      if (!lay) { lay = makeLayout($('#cv'), { pdn: false, interactive: true, labels: true }); bindZoom($('#pathCard .canvas-wrap'), lay); }
      const T = S.sta, hi = new Set(), hiNets = new Set();
      T.path.forEach((p) => { if (p.cell) hi.add(p.cell.id); hiNets.add(p.net); });
      if (T.worst.cell) hi.add(T.worst.cell.id);
      lay.route = S.route;
      lay.set(P, { routes: Infinity, hi, hiNets });
      let prev = 0;
      const rows = T.path.map((p) => {
        const name = !p.cell ? `输入引脚 ${p.net}` : p.cell.type === 'DFF' ? `触发器 ${p.cell.id}（时钟 → Q）` : `${p.cell.id}`;
        const type = p.cell ? `${C.LIB[p.cell.type].label} ${p.cell.type}` : '—';
        const inc = p.at - prev;
        prev = p.at;
        return [name, type, inc, p.at];
      });
      if (T.worst.kind === 'reg') rows.push([`触发器 ${T.worst.cell.id}（建立时间）`, '触发器 DFF', C.LIB.DFF.setup, T.delay]);
      else rows.push([`输出引脚 ${T.worst.net}`, '—', 0, T.delay]);
      $('#pathTable').innerHTML = `<tr><th>经过</th><th>单元类型</th><th>这一段</th><th></th><th>累计到达</th></tr>` + rows.map(([a, b, inc, at]) => `<tr><td class="mono">${esc(a)}</td><td>${b}</td><td>+${fmt(inc, 1)} ps</td><td><div class="bar"><i style="width:${Math.min(100, (inc / T.delay) * 100 * 3)}%"></i></div></td><td>${fmt(at, 1)} ps</td></tr>`).join('');
    };
    if (S.sta) { render(false); showPath(); }
    $('#freq').addEventListener('input', () => {
      S.freq = +$('#freq').value;
      $('#freqV').textContent = S.freq + ' MHz';
      if (S.sta) render(false);
    });
    $('#runSo').addEventListener('click', async () => {
      const my = epoch;
      $('#runSo').disabled = true;
      S.sta = C.sta(P, { wire: S.route.wire, clkArrival: P.ctsInfo ? P.ctsInfo.arrival : {} });
      $$('.check .status').forEach((s) => { s.className = 'status idle'; s.textContent = '待检查'; });
      const saved = S.sta;
      S.sta = null;
      for (const c of CHECKS) {
        const st = $(`.check[data-c="${c.key}"] .status`);
        st.className = 'status run';
        st.textContent = '检查中';
        await sleep(550);
        if (!alive(my)) return;
        st.className = 'status ok';
        st.textContent = '完成';
      }
      S.sta = saved;
      render(true);
      showPath();
      $('#runSo').disabled = false;
    });
  };

  /* ---------- 第 10 步 流片 ---------- */
  const gdsName = () => (S.chipName || 'MY_CHIP').replace(/[^A-Za-z0-9_]/g, '_').slice(0, 30) || 'MY_CHIP';
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  MOUNT.tapeout = () => {
    const P = S.P, st = C.stats(P.cells), r = signoffResult();
    const dieArea = P.fp.W * P.fp.H * C.PITCH * C.PITCH;
    const fmaxText = r.sta.fmax >= 1000 ? fmt(r.sta.fmax / 1000, 2) + '<small>GHz</small>' : fmt(r.sta.fmax) + '<small>MHz</small>';
    shell('tapeout', '这就是你的芯片最终的样子。放大到底，能看到每一个晶体管的栅极。它可以下载成真正的 GDSII 文件，用专业软件 KLayout 打开。',
      `<div class="card"><div class="card-head"><div class="seg" id="palSeg"><button data-p="min" class="active">简约配色</button><button data-p="classic">经典版图配色</button></div>
          <div class="actions"><button class="btn" id="dlGds">${icon('down', 14)} 下载 GDSII</button><button class="btn" id="dlPng">${icon('down', 14)} 下载图片</button></div></div>
        <div class="card-body">
          <div class="canvas-wrap" style="height:540px"><canvas id="cv"></canvas>${zoomTools()}<div class="canvas-hint">滚轮放大到单元内部，可以看到晶体管</div></div>
          <div class="legend" id="legend"></div>
          <div id="tapeBox" style="margin-top:18px"></div>
        </div></div>
       <div id="certBox"></div>
       <div class="card"><div class="card-head"><div><div class="card-title">你的芯片 vs 世界顶级芯片</div><div class="card-sub">按晶体管数量对比（对数刻度，每一格差 10 倍）</div></div></div>
        <div class="card-body"><div class="compare" id="compare"></div><p class="hint" style="margin:16px 0 0">你的芯片面积约 ${fmt(dieArea, 0)} µm²，一根头发丝的横截面（直径约 70 µm）上能并排放下大约 ${fmt(Math.floor(3848 / dieArea))} 颗。</p></div></div>
       <div class="card"><div class="card-head"><div><div class="card-title">流片之后，在晶圆厂里会发生什么</div><div class="card-sub">从 GDSII 文件到你手里的芯片，通常要 2~3 个月</div></div></div>
        <div class="card-body"><div class="fab-steps">
          <div class="fab"><b>1. 制作光罩</b><p>把版图的每一层做成一块“底片”。先进工艺需要几十块光罩。</p></div>
          <div class="fab"><b>2. 光刻</b><p>用紫外光把图形投影到涂了光刻胶的硅晶圆上。最先进的极紫外光 (EUV) 波长只有 13.5 纳米。</p></div>
          <div class="fab"><b>3. 刻蚀与沉积</b><p>刻掉不要的部分、沉积新的材料，一层层叠起来，前后要经过上千道工序。</p></div>
          <div class="fab"><b>4. 晶圆测试</b><p>一片 12 英寸 (300 mm) 晶圆上有成百上千颗芯片，逐一用探针测试。</p></div>
          <div class="fab"><b>5. 切割封装</b><p>把晶圆切成小片，装进带引脚的外壳，再做一次完整测试。</p></div>
          <div class="fab"><b>6. 走进生活</b><p>最终装进手机、电脑、汽车和数据中心，开始每秒数十亿次的工作。</p></div>
        </div>
        <div class="section-label" style="margin:20px 0 10px">想继续深入？</div>
        <div class="links">
          <a href="https://openroad.readthedocs.io/en/latest/main/README.html" target="_blank" rel="noopener">OpenROAD 官方文档：本网站参考的开源芯片后端工具</a>
          <a href="https://github.com/The-OpenROAD-Project/OpenROAD-flow-scripts" target="_blank" rel="noopener">OpenROAD-flow-scripts：一键跑通 RTL 到 GDSII 的完整流程</a>
          <a href="https://tinytapeout.com" target="_blank" rel="noopener">Tiny Tapeout：个人也能花不多的钱，把自己设计的电路真正造出来</a>
        </div></div></div>`);
    const lay = makeLayout($('#cv'), { pdn: true, interactive: true, labels: true, routes: Infinity, clock: 0 });
    bindZoom($('.canvas-wrap'), lay);
    lay.route = S.route;
    lay.set(P);
    const legend = (p) => {
      const L = p === 'classic'
        ? [['#d75fea', '纵向金属'], ['#468cff', '横向金属'], ['#f04646', '多晶硅栅极'], ['#3cc86e', '有源区'], ['#ffc83c', '电源网络']]
        : [['var(--primary)', '横向金属'], ['var(--text-2)', '纵向金属'], ['var(--line-strong)', '标准单元']];
      $('#legend').innerHTML = L.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
    };
    legend('min');
    $('#palSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      $$('#palSeg button').forEach((x) => x.classList.toggle('active', x === b));
      lay.o.palette = b.dataset.p;
      lay.draw();
      legend(b.dataset.p);
    });
    $('#dlGds').addEventListener('click', () => {
      download(new Blob([C.exportGDS(P, S.route, gdsName())], { type: 'application/octet-stream' }), gdsName().toLowerCase() + '.gds');
      toast('GDSII 已下载，可以用 KLayout 打开', 'success');
    });
    $('#dlPng').addEventListener('click', () => lay.exportPNG(2400).toBlob((b) => download(b, gdsName().toLowerCase() + '.png')));

    const T = st.transistors;
    const rows = [{ name: '你的芯片', note: `${S.width} 位${S.nl.def.name}`, t: T, me: true }, ...CHIPS.map((c) => ({ name: c.name, note: `${c.year} 年`, t: c.t }))];
    const maxLog = Math.log10(208e9);
    $('#compare').innerHTML = rows.map((x) => `<div class="cmp-row ${x.me ? 'me' : ''}"><div class="name">${x.name}<small>${x.note}</small></div><div class="track"><i style="width:0" data-w="${(Math.log10(x.t) / maxLog) * 100}"></i></div><div class="num">${bigNum(x.t)}</div></div>`).join('');
    requestAnimationFrame(() => $$('#compare .track i').forEach((i) => { i.style.width = i.dataset.w + '%'; }));

    const cert = () => {
      $('#certBox').innerHTML = `<div class="card cert">
        <div class="seal">${icon('check', 30)}</div>
        <div class="section-label">Tape-out complete</div>
        <h2>恭喜！你的芯片已经流片</h2>
        <div class="sub">${new Date().toLocaleDateString('zh-CN')} · 参考 OpenROAD 流程完成 RTL → GDSII 全部 10 个步骤</div>
        <input class="input" id="chipName" maxlength="30" placeholder="给你的芯片起个名字（英文）" value="${esc(S.chipName)}">
        <div class="stats" style="text-align:left">
          ${stat('晶体管', fmt(T), '个')}${stat('逻辑门', fmt(st.cells), '个标准单元')}${stat('芯片尺寸', `${um(P.fp.W)} × ${um(P.fp.H)}<small>µm</small>`)}${stat('最高频率', fmaxText)}${stat('功耗', fmt(r.pwr.uw, 2) + '<small>µW</small>', `@ ${S.freq} MHz`)}
        </div></div>`;
      $('#chipName').addEventListener('input', (e) => { S.chipName = e.target.value; store.set('name', S.chipName); });
    };
    const tapeSteps = ['打包 GDSII 版图文件', '最后一次 DRC / LVS 检查', '上传到晶圆厂', '晶圆厂确认接收'];
    if (S.done.has('tapeout')) {
      $('#tapeBox').innerHTML = `<div class="status ok">已流片：${gdsName().toLowerCase()}.gds</div>`;
      cert();
    } else {
      $('#tapeBox').innerHTML = `<div class="tape-steps" id="tapeSteps"></div><button class="btn btn-primary btn-lg" id="submit">提交流片 ${icon('right')}</button>`;
      $('#submit').addEventListener('click', async () => {
        const my = epoch;
        $('#submit').remove();
        const box = $('#tapeSteps');
        for (const t of tapeSteps) {
          const el = document.createElement('div');
          el.className = 'status run';
          el.textContent = t + ' …';
          box.appendChild(el);
          await sleep(700);
          if (!alive(my)) return;
          el.className = 'status ok';
          el.textContent = t;
        }
        complete('tapeout', '流片成功！你完成了一颗芯片的全部设计');
        cert();
        $('#certBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  };

  /* ---------- 启动 ---------- */
  ensureDesign();
  go('home');
})(window.Chip);
