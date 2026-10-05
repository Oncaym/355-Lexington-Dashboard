# 355 Lexington Avenue — Claude 会话交接文件 / Session Handoff

> 任何人在自己的 Claude / Cowork 会话里挂载这个文件夹，读到这里就能接上全部背景。
> Mount this folder in your own Claude session and this file is all the context you need.
> 改动前先读完本文件 + `README.md`。

## 项目是什么 / What this is

355 Lexington Avenue（Rudin / Hill West Architects）的**栏杆 + 设备屏**安装进度看板 ——
guardrail（露台外围护栏）+ terrace divider（露台之间的隔板）+ equipment screen
（26 / 27 层机房屋面的设备屏，2026-08-27 追加）。
静态 HTML，无需构建；目前 **LOCAL 模式**（Firebase 故意留空，见下面的红线规则）。

和 CP2 / AC3 是同一套 core 代码（2026-08-18 从 CP2 fork），core 文件可以三个项目之间
互相同步。**最大的区别**：这个项目跟踪的是"露台上一段栏杆的长度"，不是"单元个数" ——
而且每一段栏杆都按图纸真实形状画在平面图上，**在线上拖动**来录入已安装长度。

## 设备屏 / Equipment screen（2026-08-27 追加）

Leo 2026-08-27 把 26、27 层机房屋面的 **mechanical screen** 加进合同范围。三件事和护栏不同：

1. **长度来自加工板表，形状来自图纸 —— 两个来源，互相校验。**
   这份 `Equipment screen pages.pdf` 里只有 26 层那条 208'-1/2" 的护栏标注，屏体没人量过。
   所以 `lf` 用 Leo 2026-08-27 给的板表（26 层 226 / 376 / 182"，27 层 265 / 359 / 604 / 176"，
   高 90" / 168"）—— 那才是真正在买、在装的量；折线只负责"这面在平面图哪儿"，
   是从图纸矢量线描出来的，走屏体带的**内侧面**（Leo 原话："是里面那圈"）。
   `verify_screen()` 两头都卡：① 描出来的线必须落在真实线条上（≥90% 覆盖，横向容差 0.6 pt）；
   ② 描出来的洞口长度和板表宽度差不得超过 10"。**把哪两面写反了，第 ② 条当场就炸。**
   实测描线比板表长 2–5"，那是加工余量（板是按柱间净空做的），不是误差。
   注意覆盖率阈值是 90% 不是 99% —— 内圈会被角柱、门框打断（26 层东面只有 94.9%），
   外圈才是连续的。
2. **27 层只存在于这份 PDF 里** —— CD 那份 `…SE2T.pdf` 到 26 层就没了。所以 `markups.json`
   每个楼层多了一个 `src` 字段（`cd` / `screens`），`make_plans.py` 据此选源 PDF。
   26 层那张图两份 PDF 都有，提取器开头会断言两边的 Guardrail 顶点逐个相同，确认是同一张图、
   同一套坐标，才敢把屏体和护栏画进同一个 crop。
3. **行为上和护栏完全一样，只在报表上分开** —— 一样按英尺、一样拖动。`lf.js` 里所有
   *行为* 判断都问 `isRun()`（形状），只有 *分类* 判断问 `isGR()` / `isES()`（按 key 前缀
   `ES`）。KPI 卡、楼层表列、趋势图各自一条，颜色走 `--rail-es`。

尺寸和板数只写在 note / label 里，不参与计算：26 层 H 7'-6"、15 块；27 层 H 14'-0"（50% open）、
52 块。高度就是板表的 90" / 168"，也顺带把那份 PDF 的 lot-line 立面上 16'-0" 的疑问了结了。
每一面的板数写在 label 里（`South · 50'-4" · 10w×2h`）—— 哪天想改成按块计量，数字已经在里面了。

## 从 CP2 克隆过来时丢掉的东西（2026-08-27 补回）

这类 bug 有一个共同点：**HTML 里没有的区块，渲染出来就是"什么都没有"**，不报错、不留痕。
所以下面两条都是靠人眼发现的，现在各自补了测试。

1. **Warehouse 页面**：`_build/rebrand.py` 在克隆时删掉了 header 里的
   `<a href="warehouse.html">`（注释写的是 "drop CP2-only header pages"）。所以就算后来把
   `warehouse.html` 拷进文件夹，页面上也没有入口。链接已补回，页面标题也改成本项目。
   这页是 **PROJECT 文件**（不是 core），且**依赖 Firebase**（它无条件 `initializeApp`）。
2. **Submittal Log**：背后所有函数（`renderSubmittals`、逐审核方 ball-in-court 矩阵、拖拽排序）
   一直都在 `app.js` 里 —— 和 AC3 **字节相同**。缺的只有 HTML：AC3 加的
   F-031 / F-032 / F-053 / F-054 那一块，CP2 的 `index.html` 从来没同步过，这个 tracker
   就继承了这个洞。现在**逐字**从 AC3 复制过来（section + modal + CSS），以后 core 同步不打架。
   审核方名单是项目数据 `PROJECT.submittalReviewers`，本项目**还是空的** —— core 空就不预填，
   这是对的；名单定了填进 `_build/write_config.py` 重跑即可。

**教训**：`index.html` 是 hybrid 文件，core 的部分不会自动跟着 `app.js` 走。
`app.js` 里出现的新函数，要回头确认这个 tracker 的 `index.html` 有没有对应的挂载点。

## 隔板：一块一条 row（Leo 2026-08-27）

Leo 原话："点一下变颜色有什么用 —— 我要记录 installation date, field verify and rfi"。
以前隔板是**一层一条**、每块一个布尔，点一下只翻个颜色，什么都没记下来。

而现场真正要写的东西 —— 日期、Field Verify 实测、RFI、Issue、照片、每日日志 ——
在 core `app.js` 里**全部挂在一条 row 上**。所以每块隔板现在就是一条 row，
上面那些一行新 UI 都不用写就全有了。平面图上点哪块就开哪块自己那条；
**row 的 status 才是真相**，`panelsDone` 只是跟着走（`baselineSync` 里派生），
让平面图颜色和 KPI 只读一个数。

护栏段和屏体面**故意不拆** —— 那是拖尺数的长度，没人要求拆。

线上数据靠 `split-divider-panels-2026-08` 迁移搬家。注意它跑在 **seed 合并之前**
（`mergeSeedUnits` 第一行就调 `runStateMigrations`），所以新 row 还不存在，
迁移必须自己从 `PROJECT.seedUnits` 造出来 —— 它也必须排在 `purge-foreign-state` **前面**，
否则老的 `TD\d\d` 行会被当成外来数据连同已录的进度一起清掉。

## 底图 / plan sheet（Leo 2026-08-27）

底图是**背景**，不是内容：每个楼层 tab 一眼应该只看到我们的活。
`.plan-img` 用 `opacity: var(--plan-dim)` —— 夜间 0.35、日间 0.4（黑线白底掉得更快），
`lf.js` 的描边同步加粗到 9px。overlay 是独立 SVG，不受影响，永远满强度。要读图就放大。
调淡/调亮改 `index.html` 里 `:root` / `body.day-mode` 的 `--plan-dim`，主题也可以覆盖它。

## 红线规则（踩过的坑，别再踩）

1. **`firebase-config.js` 只能填这栋楼自己的 Firebase 项目。**
   本文件夹最初误把 **CP2 的生产配置**整份拷了进来，结果打开页面就直接读写了
   Cooper Park 2 的线上数据库：CP2 的单元出现在这里，我们的 14 条 GR/TD 被推进了 CP2
   （Leo 已清理）。现在该文件**故意留空** → LOCAL 模式。
   一栋楼一个 Firebase 项目，永远。`_tests/test-lf.cjs` 会断言这个文件里没有任何配置值。
   **而且清空 config 并不够**：那段时间打开过页面的浏览器，已经把 CP2 的**整份 state**
   缓存进了自己的 localStorage。清空 config 只停了同步，页面照旧从本地缓存里恢复 CP2 的
   快照、再把栏杆条目合并进去 —— 于是在 "local-only mode" 横幅下仍然显示 CP2 数据。
   现在由一次性 migration `purge-foreign-state-2026-08` 清理：凡 key 不在 seed 里的 unit
   全部丢弃，连同 CP2 的日志 / Things-to-Solve / submittals / drawings / elevations /
   marker 坐标。**已录入的尺数和隔板保留。** 只在真的发现外来数据时才动手，干净的浏览器
   完全不碰；跑完记在 `state.migrations[]` 里，不会跑第二次。
2. **`key` 不可改**（`GR12` / `TD12`…）。云端 state 和几何都按 key join。改名只改 `id`。
3. **平面图必须成对，而且是透明底**：`xxx.png`（黑线，日间/打印）+ `xxx-white.png`
   （白线，深色 UI），在 `PROJECT.floors` 里同时填 `img` + `imgDark`。
   不透明白底 = 深色模式下一块黑板。`_build/make_plans.py` 里有自检断言。
4. 配好云之后**云端是唯一真相**；重置 = Firebase Console 删 `/state`，会用
   project-config 的 SEED 重播种。冲突策略 last-save-wins，Edit History 可查。
5. **改了 `lf.js` 或 `project-config.js` 就必须同时改 `index.html` 里的 `?v=` 版本号**
   （现在是 `20260819a-signals`，和 `lf.js` 顶部的 `BUILD` 保持一致）。
   v2 曾经沿用 v1 的 `?v=`，结果磁盘上是新文件、浏览器跑的还是旧脚本 ——
   页面看起来正常，只是完全没反应，也没有任何报错。
   平面图标题右侧现在会显示当前 build 号；几何该画没画出来时会弹红条提示硬刷新。
6. **老版本的 localStorage 会先于同步到达绘图代码。** core 的 `render()` 是先
   `renderPlan()` 后 `renderKPIs()`，所以升级后的第一帧拿到的还是浏览器里存的旧数据。
   v1 把 `runs` 存成**标签字符串数组**，v2 期望的是带 `pts` 的对象 —— 于是 overlay 直接
   在 `run.pts` 上炸掉，页面看着正常、其实全无反应，只有 console 里一条 TypeError。
   现在：`renderOverlay()` 自己先跑 `baselineSync()`；`isGR/isTD` 用 `hasGeom()` 判断
   **形状**而不是键名；单个 piece 画失败不会带走整层。
   `_tests/` 两边都有这条升级路径的回归测试（浏览器那条会真的往 localStorage 塞 v1 数据）。
7. **`project-config.js` 是生成文件，不要手改**（顶部注释也写了）。改数据要改
   `_build/` 里的提取脚本或源 PDF，然后重跑流水线。
8. **`make_plans.py` 跑全量要几分钟**（9 张大图 @150dpi）。改了某一层的几何就只重跑那一层：
   `python3 _build/make_plans.py L26 L27`，其余楼层的图和记录的尺寸原样不动。
   注意它跑完会把 `markups.json` 里的 `size` 改写成实际出图尺寸 —— 所以顺序永远是
   extract → write_config → make_plans，反了会让 `planSize` 混着两种口径。
9. **平面图上任何要响应手指的东西，必须自己吞掉 `pointerdown`。**
   `app.js` 的平面图平移在 `#planViewport` 的 pointerdown 里无条件 `setPointerCapture()`，
   指针捕获会把后续所有事件（含 `mouseup`）重定向到 viewport，浏览器再按
   "mousedown 与 mouseup 的共同祖先"算 `click` 目标 —— 于是**落在图元上的 `click` 永远不会发生**。
   隔板（divider）就是这么"点不动"的：按下有反应，抬起跑到别处，什么都没发生。
   护栏拖动一直没事，因为 `startDrag()` 在 pointerdown 里 `stopPropagation()` 了。
   所以图元一律照 `startDrag()` 的写法：`stopPropagation` + 自己 `setPointerCapture`，
   在 pointerup 里判定（顺便拿到位移阈值：手机上按在隔板上滑动平移，不能算装了一块）。
10. **测试不许用 `el.dispatchEvent(new MouseEvent('click'))` 代替真点击。**
   合成事件同时跳过命中测试和指针捕获 —— 上面那个 bug 存在了很久，而"点击隔板"那条测试
   一直是绿的，就是因为它是合成派发的。平面图上的交互一律走 `page.mouse.*`。
11. **Firebase 已上线（2026-08-27，项目 `lexington-avenue-93a52`）**，云端从此是唯一真相源。
   **测试永远不许碰它** —— `smoke-browser.cjs` 的本地服务器拦掉 `/firebase-config.js` 喂一份
   空 config，逼页面跑 LOCAL 模式，免得测试的假进度写进生产库；真文件由 `test-lf.cjs`
   在磁盘上校验，里面只要出现别的楼的项目名就当场失败（这条规则的由来见下面 CP2 事故）。

## 架构 / File map

- **core 文件**（与 CP2 / AC3 逐字节一致，可跨项目同步）：`app.js`、`app-log.js`、
  `cloud-sync.js`、`chat.html`、`api/parse.js`
- **项目件（永不跨项目覆盖）**：
  - `project-config.js` —— **生成**。SEED（15 条，含全部几何）、8 个楼层、marker 类型、
    i18n 覆盖、storageKey `lex355_install_v1`
  - `lf.js` —— **本项目独有**：平面图交互层 + 进度模型。用"包装 core 函数"的方式叠加，
    所以 app.js 保持未修改，将来同步 core 不会打架。必须排在 app.js **之后**。
  - `themes.js` —— **本项目独有**：主题注册表（见下）
  - `index.html`（混合件）、`plan-l*.png`
- `_build/` —— 从图纸生成一切的流水线，全部带断言，可重跑
- `_tests/` —— `test-lf.cjs`（109 断言，jsdom）、`smoke-browser.cjs`（85 项真浏览器检查，
  会真的拖动一段栏杆、点一块隔板、保存、看图表）

## 数据模型 / Data model

每条 unit：护栏和设备屏 = **一层 × 一个类别**（GR08…GR26 八条、ES26 / ES27 两条），
隔板 = **一块一条**（`TD12P07` = 12 层第 7 块，显示 `TD-12.7`），共 43 条。
护栏 1201.52 LF + 隔板 270.01 LF + 设备屏 182.33 LF = 1653.86 LF。

```js
// 护栏（按英尺）
{ key:'GR12', id:'GR-12', type:'Guardrail', level:'L12', sheet:'A-112.00',
  status:'pending', date:'',
  lf: 264.19,                        // 基线总尺数（图纸数据，每次加载强制同步）
  runs: [ { label:"196'-4\"", lf:196.33, pts:[[x,y],…] }, … ],   // 每段的长度 + 折线
  runsDone: [0, 0, 0],               // 每段已完成尺数 ← 唯一需要录入的字段
  lfDone: 0 }                        // = sum(runsDone)，所有报表用它

// 露台隔板（按块，不算百分比尺数）
{ key:'TD12', id:'TD-12', type:'Terrace Divider', level:'L12', sheet:'A-112.00',
  status:'pending', date:'', lf: 67.01,
  panels: [ { label:"6'-4\"", lf:6.33, pts:[[x,y],…] }, … ],
  panelsDone: [false, …] }           // 一块一个布尔 ← 唯一需要录入的字段
```

```js
// 设备屏（按英尺，和护栏同一套字段、同一套代码路径）
{ key:'ES27', id:'ES-27', type:'Equipment Screen', level:'L27', sheet:'A-127.00',
  lf: 117,
  runs: [ { label:"South · 50'-4\" · 10w×2h", lf:50.33, pts:[…] }, … ],  // 一面一段
  runsDone: [0,0,0,0], lfDone: 0 }
```

`pts` 是**该楼层平面图内的 0..1 归一化坐标**，所以图片怎么缩放/缩放都对得上。

推导规则（除了 `runsDone` / `panelsDone`，其它都是算出来的）：

1. **状态跟着进度走**：0 → Pending，部分 → Ready，满 → Installed。
   **`issue` 永不被自动覆盖**（人的判断，不是算术）。
   实现：`lf.js` 在 core `saveUnit()` 读取之前写好 Calendar tab 的 Frame 行，于是
   marker 颜色 / 图表 / 日志 / Firebase 同步全都照原样工作。
2. **护栏和设备屏按英尺，隔板按块**，两种单位从不混在一个数字里（KPI 卡三张、趋势图两个
   Y 轴：护栏和屏体都是尺，共用左轴；隔板独占右轴）。护栏和屏体的尺数在楼层表里**分列**，
   只有"楼层完成度"那一列把两者的尺数合起来算。
3. **日报按天记当天产量**：core 只在 installed / issue 时写日志（对门窗对，对栏杆不对
   —— 264 尺的一层要装好几天），所以 `lf.js` 自己写 `lfEntry` 条目。同一条同一天只有
   一条（当天改数字是改写而不是新增，改回原值则删除）。这些条目**故意不做成 core 的
   auto 条目**（`auto:true` + `categories[]` 会被 `removeUnitFromUnitLogs()` 扫掉）。

## 平面图交互 / The plan overlay（`lf.js` 的核心）

- `#lfOverlay` 是盖在 `#planImg` 上的 SVG，`viewBox="0 0 1000 1000"` +
  `preserveAspectRatio="none"`，所以归一化几何正好铺满图片；
  `vector-effect:non-scaling-stroke` 让线宽不被拉伸变形。
- 进度用 `pathLength="1"` + `stroke-dasharray="<比例> 1"` 画，所以填充会**沿真实形状
  绕过每一个转角**。
- **命中测试在屏幕坐标里做**，不是在 user 坐标里：viewBox 故意非等比，若在 user 空间
  比距离，非正方形的平面图上会算歪。
- 拖动 = 设定该段已安装尺数；**不移动的单击** = 打开该条目（modal）。
- 隔板：单击切换安装/未安装，立即保存。
- core 的圆点 marker 在本项目**隐藏**（`PROJECT.hidePlanMarkers: true`），
  Place / Edit-position 工具也一并隐藏 —— 几何本身就是 marker，没有点可以摆。

## 重跑流水线 / Rebuilding from the drawings

图纸重发或标注更正后（**不要手改 project-config.js**）：

```
python3 _build/extract_markups.py    # PDF 标注 → _build/markups.json（断言每段长度）
python3 _build/write_config.py       # markups.json → project-config.js
python3 _build/make_plans.py         # 图纸 → plan-l*.png 明暗两版（+ _build/check-*.png）
node _tests/test-lf.cjs && node _tests/smoke-browser.cjs
```

- 源文件：`Pages from 20260605_100PCT CD ARCH SE2T.pdf`（**带活标注的那份**，
  不是 `1.pdf` —— 那是压平后的汇总，没有几何，而且**缺 26 层**）。
- 比例来自标注自己的 `/Measure`（3/16" = 1'-0"，0.07407407 ft/pt）。
- 坐标：`/Rotate 90` 的页面 PDF (x,y) → 显示 (y, x)；其余是 (x, top-y)。
  **注意 mediabox 原点不一定是 (0,0)**（本套横页是 [-1728,-1296,1728,1296]），
  只用 left/top 换算，别只用 width/height。
- `_build/check-<floor>.png` 是几何叠加在平面图上的验证图 —— 改过 transform 就看一眼。
- 重跑**不会动任何人的进度**：`lf.js` 只强制同步基线，`runsDone`/`panelsDone` 只做长度
  调整，不清零。

## 这个项目**刻意**关掉/删掉的 CP2 功能

栏杆活儿用不上，删掉是为了界面不误导人。要恢复的话 core 里都还在，只是没有入口：

- Louver / 玻璃 tab / 玻璃图表 / Glass Mode / Glass Triage / Warehouse 页面
- Caulking + Beauty Cap（`scopeKpis` / `ringScopes` = `[]`；Calendar tab 里这两行由
  `lf.js` 移除）
- Openings lens（"rough opening" 是门窗语言，栏杆没有洞口）—— 只剩 Progress + Issues
- Door 类型 / Interior storefront（`doorPatterns` / `interiorPatterns` = `[]`）
- 圆点 marker + Place / Edit-position 工具（见上）

## 主题系统 / Themes（`themes.js`）

三个主题，头部 🌙 ☀️ 📻 切换，选择按浏览器记住：**Night**（原本的深色）、**Day**（浅色，
也是打印用的）、**Signals Room 报房**（谍战报房：黑灯底、琥珀刻度光、旧铜细线、电报机
等宽字；护栏进度是"信号琥珀"，隔板是"铜绿"，故障是"信号红"，日报每行结尾盖一个 `· STOP`）。

**加新主题 = 往 `THEMES` 数组里加一条，不用改代码：**

```js
{ key:'blueprint', name:{en:'Blueprint',zh:'蓝图',ko:'청사진'}, icon:'📐',
  mode:'light',                    // 'light' 会加 body.day-mode → 平面图自动用黑线版
  vars:{ '--bg':'#1B3A5C', '--rail-gr':'#FFD166', … },
  css:'…只在该主题生效的额外 CSS…' }
```

切换时会自动重画：平面图 overlay、两张图表、平面图明暗双图。写主题时要知道两件事：

1. **`vars` 是以 inline 自定义属性写在 `<body>` 上的**，因为 index.html 已经在 `:root` 和
   `body.day-mode` 里声明了两套调色板，再加第三个样式块就要跟它们打优先级架。切换前会把
   所有主题声明过的属性统一清掉（`VAR_NAMES`），所以主题之间不会互相渗色。
2. **栏杆颜色在 `--rail-gr` / `--rail-td` / `--rail-track`，图表墨色在
   `--chart-tick` / `--chart-grid`。** 设了这几个，平面图线条、图例色块、进度条、趋势图
   会一起跟上，`lf.js` 一行都不用动。
   （core 的图例色块是 inline `--ut-color`，`lf.js` 用带 `!important` 的作者声明压过它 ——
   author !important 优先于 inline 非 important。）

**平面图故意不加滤镜去配主题色**：core 之所以给每层出明暗两张图，就是因为 CSS filter 会
让浏览器把平面图栅格化，iOS 上双指放大就糊（见 index.html 里 F-039 的注释）。想要自己
线条颜色的主题，应该多生成一套图，而不是加 filter。

**Chart.js 的坑**：不要读-写 `chart.options` 的整个分支（`lg.labels = lg.labels || {}`）——
options 是 resolver proxy，getter 会喂回自己的 setter，直接栈溢出。只赋叶子值。

## 待办 / TODO

- [ ] **淋浴门 109 个 polygon（8 张图，含 11 层）** —— 算不算我们的活？Leo 2026-08-18
      说先挂起。要做的话：`extract_markups.py` 里加 `/Polygon` + `Shower Door`，
      新增一个 unitTypes（`match:'^SH'`），注意单位是"扇"不是尺。
- [x] ~~Leo 复核设备屏尺数~~ —— 2026-08-27 已换成他的加工板表：26 层 65.33 LF、27 层 117 LF。
      （原先我按图纸外圈描的 73.08 / 123.56 作废。）
- [ ] **27 层的图号 A-127.00 是推的** —— 那份导出没有标题栏可读，写在提取器的
      `SHEET_OVERRIDE` 里。
- [x] ~~26 层的 208.04 LF 护栏是否在合同内~~ —— **在**，Leo 2026-08-27 确认。
- [ ] Firebase + Vercel（团队要多人实时编辑时再配，README 有步骤）。
- [ ] 还想要什么主题？（蓝图 / 电报纸 / 高对比现场版…）加一条数据就行。
- [ ] GC 是谁？`i18n.header_sub` 现在写的是 scope 而不是总包。
- [ ] 若要按**每一段**独立跟进度（而不是按楼层汇总）：改 `_build/write_config.py`
      让每段生成一条 unit 即可，不用改 `lf.js`。

## 一句话交接 / One-line handoff

进度只有两个入口：**在平面图上沿护栏 / 设备屏拖动**，或**点一下隔板**。
（想打字就单击某段打开 modal，里面每段一个滑块。）其它所有数字都是从这两个字段算出来的。
