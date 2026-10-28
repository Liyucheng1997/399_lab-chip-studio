# 芯片工坊 · Chip Studio

一个面向零基础的芯片设计体验网站，参考开源工具链 [OpenROAD](https://openroad.readthedocs.io/en/latest/main/README.html)，带你走完 RTL → GDSII 的全部 10 步。

## 打开方式

- 在线体验：https://liyucheng1997.github.io/399_lab-chip-studio/
- 直接双击 `index.html` 用浏览器打开即可，不需要安装任何东西。
- 或者在项目目录运行 `python -m http.server 8399`，再访问 http://localhost:8399 。

## 流程

| 步骤 | 做什么 | 对应真实工具 |
| --- | --- | --- |
| 1 定义芯片 | 选择加法器 / 计数器 / ALU，4 位或 8 位 | 规格书 |
| 2 编写 RTL | 逐行讲解 Verilog 代码 | Verilator |
| 3 功能仿真 | 拨动开关、看波形、跑 500 组自动测试 | Icarus Verilog |
| 4 逻辑综合 | 生成门级原理图，信号实时流动 | Yosys |
| 5 布图规划 | 调利用率和长宽比，生成电源网络 | ifp / ppl / pdn |
| 6 布局 | 全局布局 → 合法化 → 详细布局动画 | gpl / dpl |
| 7 时钟树综合 | 递归二分插入缓冲器，计算时钟偏差 | cts |
| 8 布线 | 两层金属 A* 迷宫布线 + 拆线重布 | grt / drt |
| 9 签核验证 | 静态时序分析、DRC、LVS、功耗 | OpenSTA |
| 10 流片 | 查看最终版图，下载真正的 GDSII 文件 | KLayout |

网站里的仿真、布局、布线、时序分析都是真实运行的（简化版）算法，不是预录动画。下载的 `.gds` 文件可以用 [KLayout](https://www.klayout.de) 打开。工艺参数参考 Nangate45，数值为教学示意。

## 代码结构

- `js/lib.js`：标准单元库、三个设计的网表与 Verilog、逻辑仿真、静态时序分析
- `js/physical.js`：布图规划、布局、时钟树、布线、GDSII 导出
- `js/render.js`：版图画布、门级原理图、波形图
- `js/app.js`：页面与交互
- `css/tokens.css`：设计变量；`css/app.css`：页面样式
