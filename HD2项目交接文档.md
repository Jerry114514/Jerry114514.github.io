# HD2 主站项目交接文档

> 生成时间：2026-09-13 ｜ **最近更新：2026-09-17**（本次会话：图鉴站三个新模块 · 机制页通用脚手架 · CI 配额治理 · 星图/主站若干修复）
> 适用范围：`E:\GitLoadWareHouse\Jerry114514.github.io`（下称"本仓库"）
> 本文档为**本地交接文档**，已在 `.gitignore` 中，不随仓库同步。
> 阅读顺序建议：第 1 节 → 第 3 节 → **第 11 节（铁律，最容易踩坑）** → 第 16 节（已知缺口）→ 第 17 节（下一步）

---

## 1. 项目概览

这是一个《绝地潜兵 2》战况数据站，部署在 GitHub Pages。仓库同时托管多个子站：

| 路径 | 内容 | 部署地址 |
|---|---|---|
| `HD2-Galatic_war-Map/index.html` | **主站**（战况数据面板，本轮改版重点） | `https://jerry114514.github.io/HD2-Galatic_war-Map/index.html` |
| `HD2-Galatic_war-Map/galaxy-map-v2.html` | **银河星图**（MapLibre GL 交互地图） | 同目录 `galaxy-map-v2.html` |
| `HD2_Wiki/*` | 图鉴站（敌人/武器/战备/强化资源/战争债券/机制页） | `https://jerry114514.github.io/HD2_Wiki/` |
| `HD2_Wiki/boosters.html` · `booster.html` | **强化资源**图鉴（20 项；总览 + 详情模板） | `…/HD2_Wiki/boosters.html` |
| `HD2_Wiki/warbonds.html` · `warbond.html` | **战争债券**（25 个；分组封面网格 + 每债券逐页奖励） | `…/HD2_Wiki/warbonds.html` |
| `HD2_Wiki/mechanics.html` · `mechanic.html` | **机制页**（4 个：`?id=damage｜difficulty｜status_effects｜galactic_war`） | `…/HD2_Wiki/mechanic.html?id=damage` |

图鉴站三个模块（强化资源 / 战争债券 / 机制页）都走同一套约定：**数据 JSON + 通用模板 + 运行时渲染**，图标一律本地化（零热链）。新增/修改内容前请先读 `HD2_Wiki/data/wiki/zh/SCHEMA.md`（**已跟踪**，是数据字段的唯一权威）。

**重要**：站点真正的根是**仓库根**，所以正确 URL 是
`https://jerry114514.github.io/HD2-Galatic_war-Map/...`
而**不是** `https://jerry114514.github.io/Jerry114514.github.io/...`（后者会命中自定义 404 首页）。
这个坑曾误导排查，务必记住。

---

## 2. 文档地图

仓库根目录（均为 `.gitignore` 的本地文档，不随仓库同步）：

| 文档 | 内容 |
|---|---|
| `HD2项目上下文.md` | 项目整体背景、模块划分 |
| `HD2项目设计方案.md` | 设计方案 |
| `HD2数据抓取技术文档.md` | 抓取管线细节 |
| `HD2重构检查计划表.md` | 重构检查项 |
| **`HD2主页改版计划.md`** | **本轮主页改版计划（本文档的姊妹篇，含组件清单进度）** |
| `HD2项目留档_2026-08-26.md` | 历史留档 |
| `README.md` | 仓库首页说明（**已跟踪**） |
| **`HD2_Wiki/data/wiki/zh/SCHEMA.md`** | **图鉴站数据 schema（已跟踪）——字段规范、`_zh` 回退、合并优先级、扩展字段登记。改图鉴站数据前必读** |

> 本次会话后，本文档（交接文档）是**部署方式与铁律的第一权威**；图鉴站数据字段以 `SCHEMA.md` 为准。

另有 `HD2-Galatic_war-Map/tables/_DEPRECATED.md`：记录已删除文件（`map.html`、`galaxy-map.html`）与保留清单。

---

## 3. 快速上手

```powershell
cd E:\GitLoadWareHouse\Jerry114514.github.io

# 1) 本地起静态服务（一定用 HTTP，不要用 file://，否则 fetch 与相对路径会出问题）
#    仓库没有 package.json，用一行 node 起服务即可；或任意静态服务器
#    历史脚本：%TEMP%\localsrv.mjs（监听 127.0.0.1:8791，根目录为本仓库）

# 2) 浏览器打开
#    http://127.0.0.1:8791/HD2-Galatic_war-Map/index.html
#    http://127.0.0.1:8791/HD2-Galatic_war-Map/galaxy-map-v2.html
```

**验证改动时务必强制刷新（Ctrl+F5）**：GitHub Pages 的 CDN 会给 `index.html` / CSS 加 `max-age=600`，
本地静态服务器也可能命中缓存。本轮多次出现"文件已更新但浏览器读到的仍是旧内容"。

---

## 4. 目录结构全景

```
Jerry114514.github.io/
├── favicon.ico                 # 站点图标（2026-09 补；此前全仓无 favicon，浏览器自动探测一直在 404）
├── .github/workflows/
│   ├── fetch-data.yml          # 每 5 分钟抓战况数据 → 自动提交 data.json + **末尾清理旧 Pages artifact**
│   ├── sync-tables.yml         # 每日从 HD2-Bot-Release 同步对照表
│   └── cleanup-artifacts.yml   # artifact 清理的"备用"定时（原生 schedule，实测常不被触发；主力已挂进 fetch-data）
├── scripts/
│   └── fetch_site_data.py      # 抓取管线主脚本（910 行）
├── HD2-Galatic_war-Map/
│   ├── index.html              # 主站（2567 行）
│   ├── galaxy-map-v2.html      # 星图（1866 行）
│   ├── data.json               # 战况数据（CI 自动生成，勿手改）
│   ├── css/
│   │   ├── tokens.css          # 设计令牌（64 行）★改主题先看这里
│   │   └── home.css            # 主站样式（1439 行）
│   ├── js/
│   │   ├── data-source.js      # 数据源统一入口（HD2Source.json/jsonSoft）
│   │   ├── tactical.js         # 战术计算
│   │   └── libs/maplibre/      # 自托管 MapLibre GL CSP 版 + 字体 PBF
│   ├── assets/
│   │   ├── planet-icons/       # 273 个星球小图标 + index.json
│   │   ├── effect-icons/       # 22 个效果/变种图标
│   │   ├── faction-icons/      # 4 个阵营图标（供主站卡片用）
│   │   ├── ui-icons/           # 4 个 UI 图标（增援/战役类型）
│   │   ├── biomes/             # 26 张环境图 + index.json
│   │   └── dss-hero/           # 3 张 DSS 行动大图
│   └── tables/
│       ├── starmap.json        # 星球/星区中英映射
│       ├── effect_id_cn.json   # 效果 ID → 中文
│       ├── hd2_variables.json  # 行动变量分类（15 类）
│       ├── planet_index.json   # index → 英文名（281 条）
│       └── waypoints.json      # 补给线拓扑（299 条边）
└── HD2_Wiki/                   # 图鉴站（独立；以下为本轮新增/关键部分）
    ├── boosters.html / booster.html      # 强化资源：总览 + 详情模板
    ├── warbonds.html / warbond.html      # 战争债券：分组封面网格 + 详情（逐页奖励表）
    ├── mechanics.html / mechanic.html    # 机制页：目录 + 详情（4 个机制共用模板）
    ├── assets/js/
    │   ├── wiki-router.js                # 详情页取参（?id=<snake_case>，全站唯一写法）
    │   ├── blocks.js                     # 首页区块与导航渲染（导航不是硬编码 HTML！）
    │   └── mechanic-merge.js             # ★机制页合并引擎（主干 + 中文覆盖按小节合并）
    ├── assets/
    │   ├── boosters/                     # 20 张强化资源图标（本地化）
    │   ├── warbonds/                     # 25 张债券封面（本地化）
    │   └── mechanics/<页id>/             # 机制页图标（damage 36 / difficulty 16 / status_effects 13 / galactic_war 64）
    └── data/wiki/zh/
        ├── SCHEMA.md                     # ★数据 schema（已跟踪，改数据前必读）
        ├── index.json / navigation.json / blocks/*.json   # 首页区块与导航（JS 注入）
        ├── weapons.json / enemies.json / stratagems_full.json / missions.json …
        ├── boosters.json / warbonds.json # 本轮新增两个模块的数据
        └── mechanics/<id>.json（英文主干，含表格/图片/锚点 id）
            mechanics/<id>_zh.json（中文覆盖，含标题与正文、fully_translated 标记）
```

---

## 5. 数据管线

### 5.1 数据源（`scripts/fetch_site_data.py`）

脚本按 `try_fetch` 逐个抓取，**任一源失败不会中断整体**（静默降级）：

| 源 | 常量 | 用途 | 备注 |
|---|---|---|---|
| 官方 API | `OFFICIAL_API` | 基础星球/战役/新闻 | `planetBiomeId32` 是**数字 ID**，取不到人读名 |
| companion | `COMPANION_LIVE` | 玩家数/行动变量最全 | |
| hd2dev | `HD2DEV` | 星球名/sector/maxHealth/**biome** | 社区中转，**会整段失败** |
| 玩家分布 | `fetch_player_distribution` | 历史曲线 | |

### 5.2 合并逻辑要点（`main()`）

1. `base = official or companion or hd2dev`（按优先级取第一个成功的）
2. companion 覆盖玩家数 / activeEffects / position
3. hd2dev 覆盖：星球名（仅当仍是 `PLANET_n`）、sector、maxHealth、**biome**
4. 本地 `tables/planet_index.json` 兜底星球名
5. 统一计算 resistance = `regenPerSecond * 3600 / maxHealth * 100`

### 5.3 两个已加固的兜底（血的教训）

**① 星球名兜底**（`name_of_index` + `NAME_BY_INDEX`）
事故背景：星球名此前**只**从 hd2dev 回填，hd2dev 失败后 273 颗星球全部退化成 `PLANET_<index>`，
而 `planet-icons/index.json` 按真实名索引 → **全部星球图标消失**。
现在无条件用本地 `planet_index.json` 兜底。

**② biome 字段**（`biome_name_of` → `biome_of`）
星球卡片要按环境显示地标图，但 `data.json` 原本没有 biome。
- 官方源只有 `planetBiomeId32`（数字），**实测恒为 0，取不到名字**
- hd2dev 直接给 `biome: {name: "Desert Cliffs", ...}` → **优先以 hd2dev 为准**
- 提取逻辑兼容 `dict{name}` 与纯字符串，缺失返回空串；取不到也 `setdefault("biome","")` 保证字段恒存在
- **③ 本地 biome 对照表兜底（2026-09-15 新增）**：`tables/planet_biomes.json`（星球英文名 → biome 名，随仓库提交）。
  事故：hd2dev 偶发失败（限流）→ `biome_n = 0` → **线上 273 颗星球的 biome 全部变成空串**，
  前端所有环境图一起显示 "NO LANDMARK"（用户报「biome 图片经常加载失败」）。现在 `biome_of()`
  在 hd2dev 取不到时按星球名查该表兜底；前端 `pcBiomeOf()`（主页）/ `biomeNameOf()`（星图）也各留
  一份同名兜底 —— 上游再抖也不会让环境图全灭。
- 前端据此查 `assets/biomes/index.json`（26 条 biome→图 映射，**图本身全部在仓库**）选图，无 biome 走斜纹回退块

CI 日志可核对：`[OK] biome 字段补全 273 颗星球`；若出现 `其中 N 颗来自本地对照表兜底`，说明 hd2dev 又抖了。

### 5.4 数据新鲜度

- CI 每 **5 分钟**跑一次 `fetch-data.yml`（**2026-09-17 从 15 分钟提到 5 分钟**），只在数据变化时提交
- 也会自动提交 `data/history/player_distribution.json`、`data/translated/TransNews.json`
- 前端每 **60 秒**轮询一次 `data.json?t=<ts>`（时间戳承担缓存桶语义）
- 因此**本地 `data.json` 常常是旧的**，排查线上问题要看线上那份

**为什么提到 5 分钟、以及它牵出的两个配额问题（都已在 §11.4 解决）**：
每次数据提交都会触发一次 Pages 重建，而每次重建都会产出一个 `github-pages` artifact（≈整站体积）。频率翻三倍后必须同时治理配额，
否则会撞上 GitHub Free 的两条上限：**Actions 存储 500 MB**（artifact 堆积）与**私密仓库 2000 分钟/月**（翻译仓库）。详见 §11.4。

**触发方式（三路，重复触发无害）**：① GitHub 原生 `schedule: */5`（**实测最可靠**，近 10 次全部按点触发、延迟约 4 分钟）；
② Cloudflare Worker `helldivers2-gitpage-dispatch` 的 `*/5` cron 从外部 `workflow_dispatch`（冗余；部署细节见 §11.4）；
③ **本机 cron 已废弃**——需要一直开着电脑，接手时若发现本机还有旧定时任务，请自行删掉。

---

## 6. 前端架构

### 6.1 主站（`index.html`）

**区块结构**（11 个 `section.block`）：

| id | 标题 | 渲染函数 | 状态 |
|---|---|---|---|
| `block-mo` | 重要指令 + 目标星球 | `renderMO` | 旧样式 |
| `block-players` | 在线士兵 | `renderPlayers` | 旧样式 |
| `block-impact` | 影响力 | `renderImpact` | 旧样式 |
| `block-dss` | 民主空间站 / DSS | `renderDss` | **已改版（HUD 风格）** |
| `block-stratagem` | 战术搭配器 | `renderStratagem` | 旧样式 |
| `block-pevents` | 活动事件 | `renderPlanetEvents` | **已停用（注释）** |
| `block-urgent` | 紧急战情 | `renderDefenseRecon` | 旧样式 |
| `block-attackable` | 当前可攻打星球 | `renderAttackable` | **卡片已改版** |
| `block-prospect` | 民主前瞻 | `renderProspect` | **卡片已改版** |
| `block-sectors` | 星区目录 | `renderSectors` | **卡片已改版** |

**刷新主循环**：`refresh()`（约 L2376）
```
fetchAll() → preloadPlanetIcons() → buildDssEffectMap()
  → renderTopbar / renderMO / renderPlayers / renderImpact / renderDss
  → renderDefenseRecon → updateAttackWarning → renderAttackable
  → renderProspect → renderSectors → renderStratagem → renderNews
```
`catch` 里 `console.error("[refresh]", e)` 并给 `#pulse` 加 `stale` 类 —— **排查渲染中断时先看 `#pulse` 是否有 `stale`**。

**关键数据映射**（三个别混）：

| 变量 | 含义 | 结构 |
|---|---|---|
| `currentEffectMap` | 效果 ID → 中文 | `effect_id_cn.json` |
| `currentEffectDetailMap` | 效果 ID → 英文名+描述 | 词条详情 |
| `effectCnDescMap` | 效果 ID → `{cn, desc, cat}` | 由 `buildDssEffectMap()` 从 `hd2_variables.json` 生成 |

> ⚠ **主页没有星图那套 `EFFECT_ICON`**。星图的 `galaxy-map-v2.html` 里定义了自己的 `EFFECT_ICON`
> （含 `icon`/`cn`/`tier`），主页**不存在**。跨页复用代码时极易踩到（本轮踩过）。

### 6.2 星图（`galaxy-map-v2.html`）

- **MapLibre GL JS v4.7.1 CSP 版**：`maplibre-gl-csp.js` + 显式 `maplibre-gl-csp-worker.js`（需 `setWorkerUrl()`）
- **CJK 文字**：`localIdeographFontFamily` 走 canvas 2D，**不需要 CJK glyph PBF**；拉丁字母用 3 段本地 PBF
- **图层骨架**：starfield → `sector-fill/line` → `faction-fill/line` → heat → `supply-base` + 6× `supply-grad-*`
  → `attack-line` / `attack-arrow` → `planet-*`（shadow/glow/glow-in/core/hot/def/evatac/icon/label）
  → `flabel` → `gloom-wide/main/core` → `tcs-fog` / `tcs-ring` → `stars-raster`
- **效果图标用 HTML 浮层**（`#fx-layer` + `map.project()`），**不是 symbol 图层**——
  因为一个星球常有多个效果，而 symbol 每要素只支持一个 `icon-image`
- **图标名去重**：按 icon 文件名去重；左侧放己方增益（DSS 本体/SEAF），右侧放敌军相关（变种/子类）

**坐标系**：实测 **1 坐标单位 = 182px @ z7，每级缩放翻倍**（z9=728 / z10=1456 / z13=11651）。
可用 Node + `MercatorCoordinate` 复算。

### 6.3 图鉴站（`HD2_Wiki/`）架构

图鉴站不是"一项一个 HTML"，而是 **通用模板 + JSON 数据 + 运行时渲染**：

| 模式 | 例子 | 取参 | 数据 |
|---|---|---|---|
| 目录页 + 详情页 | `weapons.html` / `weapon.html` | `?id=<snake_case>`（`wiki-router.js`） | `data/wiki/zh/weapons.json` |
| 同上 | `enemies.html` / `enemy.html` | 同上 | `enemies.json` |
| 同上 | `stratagems.html` / `stratagem.html` | 同上 | `stratagems_full.json` |
| 同上 | `boosters.html` / `booster.html` | 同上 | `boosters.json` |
| 同上 | `warbonds.html` / `warbond.html` | 同上 | `warbonds.json` |
| 机制页 | `mechanics.html` / `mechanic.html` | `?id=damage｜difficulty｜status_effects｜galactic_war` | `mechanics/<id>.json` + `<id>_zh.json` |

三条**必须知道**的约定：

1. **参数写法全站统一 `?id=<snake_case>`**（小写 + 下划线，如 `hellpod_space_optimization`）。
   2026-09 曾同时兼容 `?b=` 与连字符写法，**已收紧为唯一写法**；新增页面照此办。
2. **导航不是硬编码 HTML**：`blocks.js` 读 `data/wiki/zh/navigation.json` 渲染首页 `.nav-grid` →
   **加一个模块只需改这一个 JSON**，不要去改每个 `*.html`。同理首页区块在 `blocks/` 下。
3. **图标一律本地化**（`assets/<模块>/`），不热链 out-of-site。抓 wiki.gg 图标要**串行 + 间隔几秒**
   （会 429）、带 `User-Agent`、**不要带 `Referer`**（会 403）；下载后校验 >200 B 且是真实图片（PNG 魔数或含 `<svg>`），
   否则会把 HTML 错误体当图片存进去。

**数据 schema**：`data/wiki/zh/SCHEMA.md`（已跟踪）。要点：`id` 小写 snake_case；`X`=英文 / `X_zh`=中文，
渲染时 `X_zh || X` 回退；顶层 `{updated_at, source, total, <复数键>: []}`；**各数据集独有的字段必须在 SCHEMA 登记**（不许野生字段）。

### 6.4 机制页通用脚手架（`assets/js/mechanic-merge.js`）

**背景（重要教训）**：机制页原来用「英文主干 + 中文覆盖」两份数据，规则是"**覆盖文件含 `sections_zh` 就整篇以覆盖为准**"。
后果是中文那份 9 KB 的散文摘要把英文主干 91 KB 的内容（**含 6 张表**）整个顶掉 —— 伤害页实测**表格 0 张、正文只有官方的 1/10**。
另有锚点 bug：中文标题全被替换成下划线 → 26 个小节里 18 个 `id` 都是 `_`，目录点哪个都跳第一节。

**现在的规则（2026-09-17 重写，SCHEMA §5.2）**：**按小节合并**，主干给"硬资产"、覆盖只给中文。

| 内容 | 来源与优先级 |
|---|---|
| 小节结构、**锚点 id（唯一权威）**、**全部表格**、图片块 | 英文主干 `mechanics/<id>.json` |
| 标题 | `title_zh` → 主干 |
| 正文 | `content_zh` / `paragraphs_zh` → 主干 |
| 表格 / 图片 | `tables_zh` / `figures_zh` → **未提供则原样保留主干**（这就是"不再丢表"的关键） |

三个可用的开关：

- **`"fully_translated": true`**（小节级）：声明"中文已完整覆盖英文散文" → 引擎**不再渲染**该节底部那个
  「📄 英文原文」`<details>` 折叠块。未打标记的小节仍保留折叠块（兜底）。
- **`"figures_zh": []`**：覆盖为空数组 = 本小节无图片。用于丢弃主干里**被误判为"图片块"而直接渲染在正文的英文散文**
  （主干把英文写在含行内图标的 `<p>` 里时就会这样）。用之前必须确认那些图标的语义已用中文写出。
- **锚点 id 规则**：主干 `id` → 覆盖 `id`/`target_id` → 净化（中文/空白/标点→`-`）→ 净化后为空则 `s-1/s-2…` → 全页去重。

**踩坑提醒**：中文覆盖的小节**尽量写显式 `id`**（= 主干 id）。否则只能按序号 1:1 配对，
一旦两边小节数不等（少一节/多一节）就会**整体错位**——历史上出现过"点 ExVM 锚点却显示 ExDR 内容"。
`galactic_war_zh.json` 已改为逐节显式 `id` 并把 24 个月度子节 id 列全。

---

## 7. 资产清单

| 目录 | 内容 | 数量/大小 | 用途 | 何时需要 |
|---|---|---|---|---|
| `assets/planet-icons/` | 星球小图标 + `index.json` | 271 PNG | 星图星球图标 | 星图 |
| `assets/effect-icons/` | 效果/变种/DSS 图标 | 22 文件 | 星图效果浮层 | 星图 |
| `assets/faction-icons/` | `automatons/terminids/illuminate/humans.svg` | 4 | 主站卡片阵营徽标 | 主站卡片 |
| `assets/ui-icons/` | `reinforce` / `defense_campaign` / `liberation_campaign` / `super_earth_flag` | 4 | 主站卡片 UI 图标 | 主站卡片 |
| `assets/biomes/` | 26 张环境图 + `index.json` | 1.93 MB | 主站卡片地标图 | 主站卡片 |
| `assets/dss-hero/` | 3 张 DSS 行动大图 | 621 KB | DSS 模块大图 | 主站 DSS |

### 资产来源与许可

**全部取自 `helldivers.wiki.gg`**（CC BY-NC-SA 4.0），页脚已挂署名。
- 环境图来自 [Biomes](https://helldivers.wiki.gg/wiki/Biomes) 页，文件名形如 `<Archetype>_<variant>_Landscape.png`
- UI 图标来自战略配备图标（`*_Stratagem_Icon_Background.svg`）与战役图标（`*_Campaign_Icon.svg`）
- 抓取时**必须带 User-Agent；不要带 Referer**（wiki.gg 校验 Referer，带了返回 403）

### 环境图 × biome 映射

`assets/biomes/index.json` 是 `biome 名 → 文件名` 映射，覆盖 API 返回的全部 **26 种 biome**：

| API biome | 本地文件 |
|---|---|
| Acidic Badlands | Sandy_acid_Landscape.png |
| Basic Swamp | Swamp_base_Landscape.png |
| Boneyard | Arctic_glacier_coldrocky_Landscape.png |
| Cyberstan Megafactory | Cyberstan_landscape.png |
| Deadlands | Primordial_dead_Landscape.png |
| Deciduous Autumn Forest | Autumn_Forest_Biome_Header.png |
| Deciduous Forest | Deciduous_Grove_Biome_Header.png |
| Desert Cliffs | Sandy_spiky_Landscape.png |
| Desert Dunes | Sandy_base_Landscape.png |
| Desert Oasis | Tropical_Oasis_Biome_Header.png |
| Ethereal Jungle | Primordial_purple_Landscape.png |
| Haunted Swamp | Swamp_haunted_Landscape.png |
| Hive World | Bug_hiveworld_Landscape.png |
| Icy Glaciers | Arctic_glacier_base_Landscape.png |
| Ionic Crimson | Moor_red_Landscape.png |
| Ionic Jungle | Primordial_blue_Landscape.png |
| Magma | Magma_Base_Landscape.png |
| Moon | Sandy_moon_Landscape.png |
| Plains | Moor_baseplanet_Landscape.png |
| Rocky Canyons | Sandy_mineral_Landscape.png |
| Scorched Moor | Moor_arid_Landscape.png |
| Super Earth | Super_Earth_landscape.png |
| Supercolony | Supercolony_Landscape.png |
| Tundra | Moor_tundra_Landscape.png |
| Volcanic Jungle | Primordial_base_Landscape.png |
| Void Source Forest | Rift_active_landscape.png |

> ⚠ `ACCESS DENIED` 是游戏的占位 biome，**没有对应图** → 走 `pc-nobiome` 斜纹回退块。

---

## 8. 设计令牌（`css/tokens.css`）

**这是主题单点杠杆**：223 处 `var(--*)` 引用都由它驱动。

### 现有令牌

```css
--bg-deep: #0B0E14;  --bg-deep-2/3;      /* 底色阶梯 */
--yellow: #F5C518;   --yellow-2/3;       /* 强调黄 */
--blue:  #3B82F6;
--text/#E2E8F0  --text-dim/#94A3B8  --text-mute/#64748B
--border/--border-h  --card-bg/--card-h  --blur
--radius: 12px;  --radius-s: 8px;
--sp-1..6（4/8/12/16/24/32px）  --z-float/nav/overlay/modal
--c-humans #5BA3D0  --c-terminids #F5C518  --c-automaton #D6806D  --c-illuminate #CF64F8
```

### 本轮新增

```css
/* 星球卡片阵营色（卡内局部变量 --fc/--fcd 由 .f-auto/.f-term/.f-illu/.f-hum 切换） */
--c-faction-auto #E74C3C  --c-faction-auto-d #7A1F0E
--c-faction-term #F5C518  --c-faction-term-d #5C4A0A
--c-faction-illu #CF64F8  --c-faction-illu-d #4A1F5C
--c-faction-hum  #5BA3D0  --c-faction-hum-d  #1F3A52

/* 抵抗强度四档（用户给定阈值，实测四档均有分布：213/20/6/16） */
--c-res-low  #3B82F6   /* 低   ≤1.99%  蓝 */
--c-res-mid  #1FA84A   /* 中   2–2.99% 绿 */
--c-res-high #F59E0B   /* 高   3–3.99% 橙 */
--c-res-max  #FF4D2E   /* 极高 ≥4%     红 */
```

---

## 9. 关键组件规范

### 9.1 DSS 模块（`block-dss`）—— 已改版

- **顶部**：仅三段式标签卡（总结1/行动2/地点3），**无内层标题**（外层区块标题已有，避免重复）
- **停靠位置**显示在**区块标题右侧** `#dss-meta`（如「敏托瑞亚 · 盖勒特」）
- **左栏**：行动卡片（可点击，键盘 Enter/Space 亦可）
  - 选中项 2px 黄框；激活项底部红橙实心条；募捐中 3px 黄进度条；冷却中右上角 `[ 冷却中 ]` 角标
- **右栏**：行动大图（`assets/dss-hero/`，995×357 webp）+ 详情
  - 未激活 → 顶部数据条**黑底黄字**，底部**红橙斜纹**（募捐进度）
  - 已激活 → 顶部**黄底黑字**，底部**绿色实心**（就位倒计时）
- **DSS 行动图标**：只有 `status === 2`（已激活）才显示募捐中 / 冷却期都不加
- **大图复用**：飞鹰封锁复用飞鹰风暴、星球轰炸复用重型军械
- **已移除**：活动事件模块（`block-pevents` + `renderPlanetEvents` 调用均已注释，函数保留可恢复）

### 9.2 星球卡片 —— 本轮新建

**结构（自上而下）**：
1. 顶部状态条 38px：阵营 SVG 徽标(18px) + 阵营名(阵营色) ｜ 右侧 增援图标 + 玩家数
2. 环境图 148px：`biome` → `assets/biomes/*.png`（原生 460×148，`object-fit:cover`）
3. 战役类型 + 星球名：战役图标 32px + 类型(12px) + 星球名（解放=黄 19px；防御=白色等宽 22px）
4. 描述 11.5px / 行高 1.65
5. 进度条 9px 直角：阵营色填充 + 阵营深色 45° 斜纹空槽 + 左端 4×10 三角游标；下方「已解放 x%」/「抵抗强度 …」
6. 入侵等级行（仅防御战）：钝角盾牌徽章（上格黑底+阵营色数字，下格实色；张角 98.2°）+「保卫 D:HH:MM:SS」
7. 词条列表：上方 2px 阵营暗色条；每条阵营色标题 + 灰字描述

**栅格**：`repeat(auto-fit, minmax(340px, 380px))` + `justify-content:center`
> 下限必须 **340px** 而非 320px：`main.container` 有 `max-width:1200px`，栅格容器实测仅约 1152px，
> 用 320px 会被挤出 4 列、卡片压到 278px。

**改动落点**：`renderPlanetCard()`（单一函数，6 处调用点共用）——
`renderMO` / `renderDefenseRecon` / `renderAttackable` / `renderProspect` / `renderSectors` 都走它。

**DOM 钩子（勿删）**：`data-planet-index`、`.planet-detail-wrap`（详情面板懒展开）、点击委托。

### 9.3 星图要点

- **DSS 本体图标**：`dss.svg` = wiki 的 `DSS_Icon.svg`；DSS 停靠星球**无条件**显示本体图标
  （此前只接"战术行动"，导致 DSS 停靠本身毫无标记）
- **补给线**：299 条边全画。跨阵营线叠加「我方蓝 → 阵营代表色」渐变。
  ⚠ `line-gradient` **不支持数据驱动**，颜色必须写死 → 遂生成 6 个字面量图层 `supply-grad-*`
- **入侵箭头**：`planet_attacks` 的 `source` 是**人类星球（被入侵方）**、`target` 是敌方（入侵方），
  坐标需反转才能指向"入侵方 → 被入侵"
- **效果图标定位**：图标放在星球**半径之外**（`sideOffset = 半径 + 7px 净距 + 半个簇宽`），
  否则会压住 `planet-core` 吃掉 hover。半径来自 `planetRadiusPx(zoom, t)`，与 `PLANET_RADIUS_EXPR` 同源

---

## 10. 本轮修复记录（按根因分类，供复盘）

### 10.1 星图

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 1 | 补给线几乎全丢 | 过滤逻辑只保留 57 条跨阵营边，丢弃了 215+67 条 | 全画 299 条 |
| 2 | 渐变层非法 | `line-gradient` 的 stops 用了 `["case"]`（不支持数据驱动） | 生成 6 个字面量图层 |
| 3 | 箭头方向反了 | 误把 `target` 当被入侵方 | 坐标反转 |
| 4 | 生化人图标不可见 | `cyborgs.svg` 缺 `viewBox`（wiki 上游缺陷）；且浏览器缓存了坏文件 | 补 viewBox + `FX_ASSET_VER` 版本号破缓存 |
| 5 | 多个 SVG 图标不显示 | SVG 内联 `fill:#fff` **压过 CSS** | 全部剥离内联 `fill` |
| 6 | DSS 图标全不可见 | 图标自带 480×256 红色背景方块盖住图形；且门控 `status===2` 永不成立 | 删背景方块；活跃=2 / 冷却=3 都显示 |
| 7 | 效果图标压住星球吃掉 hover | 固定间距 `gap*n/2`，图标簇内缘离星球中心仅 3–4px（净距 −8~−12px） | 改用「半径 + 7px 净距」外侧定位 |
| 8 | DSS 停靠无任何标记 | 只接了"战术行动"图标，没接本体 | 新增 `dssStationsAt()` 无条件显示本体 |
| 9 | `arrow-head` 报 `could not be loaded` | 静态 `icon-image` 在样式校验阶段解析，而图片只在 `load` 后异步注册且无兜底 | 提前注册 + canvas 兜底 |
| 10 | 移动端收起侧栏后整屏被挡住 | `#aside-rail{width:100%;height:100%}` 变成整屏半透明玻璃；且抽屉 `transform` 被更高特异度规则压过 | rail 移动端 `display:none`；改用 `body:not(.aside-collapsed) aside` 同特异度 |

### 10.2 主站

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 11 | 卡片区块整块渲染中断 | `renderPlanetCard` 引用了主页**不存在**的 `EFFECT_ICON`（那是星图的） | 改用主页自己的 `effectCnDescMap` |
| 12 | 卡片图标撑爆布局 | `pcIcon()` 只返回 SVG 原文、没注入 class → 按自带 `width="1024"` 渲染 | `pcIcon(file, cls)` 注入 class 并剥掉自带宽高 |
| 13 | 环境图 308 张只解码 3 张 | `loading="lazy"` 在这个规模下触发不可靠（刷新后仅 1 个请求） | 去掉 lazy |
| 14 | 卡片被压到 278px | `main.container` `max-width:1200px` → 栅格容器仅 1152px，320px 下限被挤出 4 列 | 下限提到 340px |
| 15 | 倒计时永不递减 | 计时器读 `#dss-jump-countdown` 的 `data-jump-ms`，但属性挂在**父级** | 属性改挂 span 自身 + 每帧重查 DOM |
| 16 | 已激活倒计时条不更新 | 用了当前结构里**不存在**的 `.dss-buff[data-active-ms]` / `.dss-bar-label` | 改用 `data-act` + `.strip` |
| 17 | 过期目标显示无意义的 `00:00` | `warRemainMs` 返回 0 时仍写入 | 只认正数 |

### 10.3 数据管线

| # | 现象 | 根因 | 修法 |
|---|---|---|---|
| 18 | **273 颗星球图标全消失** | 星球名只从 hd2dev 回填，hd2dev 失败 → 全变 `PLANET_n` → 按真实名索引的 `index.json` 全查不到 | 本地 `planet_index.json` 无条件兜底 |
| 19 | 卡片无地标图 | `data.json` 没有 biome 字段，抓取脚本也未取 | 新增 `biome_name_of()` + 合并写入 |

---

## 11. 已知坑与纪律（**最重要的一节**）

### 11.1 必须遵守

1. **SVG 一律剥离行内 `fill`**
   wiki.gg 的描摹件把颜色写在 `<path style="fill:#fff">`，**行内样式优先级高于 CSS**。
   不剥离则 CSS 着色永远无效。本轮为此踩坑 3 次（DSS 图标 / 阵营图标 / 水晶徽章）。
   → 剥离命令：删除 `style` 里的 `fill:` 声明，保留其它属性。

2. **改图标必须改版本号**
   `FX_ASSET_VER`（星图）/ 主站图标同理。曾出现"HTML 已更新，但浏览器缓存把坏 SVG 钉死"。
   改 `assets/` 下任何图标后，把版本号 +1。

3. **推送必须用 GitHub API，不能用 `git push`**
   本机 `git` 的 schannel 凭证已损坏（`SEC_E_NO_CREDENTIALS`），`git fetch/push` 全部失败。
   推送方式见第 12 节。**副作用**：本地 `origin/main` 引用是**过期的**，
   `git log origin/main..HEAD` 会显示一堆"未推送"提交 —— **那是假象**，别据此判断部署状态。

4. **验证以"像素"为准，不信 `getComputedStyle`**
   本轮多次出现 `getComputedStyle` 返回与 CSS 文件内容、渲染像素都矛盾的值
   （如 `548px 548px 0px`、`repeat(4,…)` 明明文件里没有）。
   遇到矛盾时：**截图看像素** + `fetch` 读实际返回的 CSS 内容。

5. **判断"是否已部署"要用 raw 而非本地 git**
   ```
   https://raw.githubusercontent.com/Jerry114514/Jerry114514.github.io/main/<path>
   ```
   与本地做 SHA/字节比对。Pages 有 CDN 缓存，**必须加 `?cb=<时间戳>`**。

6. **正确站点 URL 是仓库根形态**
   `https://jerry114514.github.io/HD2-Galatic_war-Map/...`
   带 `/Jerry114514.github.io/` 前缀会命中 404 首页（曾误导排查）。

7. **【P0 · 反复踩】入侵（防御战）星球卡片：只改卡片阵营色，不要动卡内血条与行序**
   防御战双进度条的**顺序固定为「上 = 超级地球、下 = 入侵方」**，且**超级地球那条的色条保持蓝色**。
   2026-09-15 把入侵卡整体改成入侵方阵营色时，顺手把血条顺序与配色也改了 → 被要求回退并「记入 P0」。
   原因：卡片的**外框/顶部色**表达"谁在打这颗星球"（威胁感，用入侵方），而**条内颜色**表达
   "哪一条是谁的进度"（超级地球恒蓝）。两者语义不同，**不能同源**。
   → 判定依据：`pcDefenseRace()` 里超级地球那行必须**显式**传 `PC_FACTION_VARS.Humans`。
   特别注意：`pcRaceRow(label, pct, null)` 的第三参传 `null` **不是"默认色"**，而是「不写行内 `--fc`」，
   会继承卡片的 `--fc` —— 入侵卡已把 `--fc` 切成入侵方色，于是超级地球的条被连带染色（本轮实际踩到）。
   顺序与配色都写在这个函数的返回串里，改动前先确认这两点。

8. **API 推送不经过 git 换行归一化**（2026-09-16 发现）
   推送走 GitHub Git Data API（见第 12 节），上传的是**本地工作树的原始字节**；
   而 git 原生提交会按 `core.autocrlf` 把 CRLF 归一化成 LF。两者混用后有两个后果：
   - 远端 blob 里是 **CRLF**，而 `git hash-object --path=<路径>` 算出的是 **LF** →
     本地与远端会"看起来不一致"，其实内容逐字节相同（实测：主站 15 个文件属于此类）；
   - 以后任何 git 原生 `add`/commit 都会产生**整文件 diff 噪音**，交接时极易被误判成"文件被人改过"。
   **判定方法**：下载远端 blob 直接覆盖本地，若比对结果仍报差异，那必然是换行差异而非内容差异。
   **避免方法**：文本文件（HTML/CSS/JS/PY/MD）优先用编辑器做定点修改，或推送前统一为 LF；
   **不要用本地 git 状态判断"是否已同步"** —— 本地引用是影子历史，不可信。

9. **【P0 · 静默空推】`ConvertTo-Json` 会把「只有一个元素的数组」序列化成对象**（2026-09-17 发现）
   推 tree 时如果条目数组只有一个元素，`ConvertTo-Json` 可能输出**对象而非数组** → GitHub **静默忽略 `tree` 字段**，
   提交照样创建成功、返回新 commit sha，但**树等于 base_tree = 什么都没改**。多元素时正常，
   所以**只有单文件推送会中招**（本轮害我"推成功"了两次其实没推上去，又据此误判了别的原因）。
   → **所有推送一律手工拼 JSON 字符串**，并且**每一步回读校验**：
   ```
   建 blob → 建 tree → GET /git/trees/<tree>?recursive=1  比对 blob sha 与字节数 → 建 commit → PATCH
   推送完成 → GET /git/trees/main?recursive=1             再复核一次
   ```

10. **PATCH 的路径必须写全 `/git/refs/heads/main`**
    少写 `/heads` 会返回 **422（不是 404）** —— 我据此一度误判成"令牌缺 `Workflows` 权限"，白查一轮。

11. **推送要带重试，且每轮重读 head**
    `fetch-data.yml` 现在每 5 分钟提交一次，你读到的 head 很可能在提交前又被推进 → `PATCH` 因非快进被拒。
    → 用循环重试（建议 5 轮、间隔 4 秒、**每轮重新 `GET /git/ref/heads/main`**），通常第一轮就过。

12. **读 UTF-8 中文文件一律用 `[IO.File]::ReadAllText()`，不要用 `Get-Content -Raw`**
    PS 5.1 的 `Get-Content -Raw` 按 ANSI 解码 → 中文乱码 → `ConvertFrom-Json` 必然失败。
    本轮因此两次误判"JSON 坏了"（其实文件是好的）。同理：**不要用 PowerShell 做批量文本替换**
    （历史上出过把整文件字符写坏的事故），定点修改用编辑器/`edit` 工具。

13. **写盘顺序：改动 → 解析/语法校验 → 通过才写盘 → 再推送**
    本轮踩过反面案例：先写盘再解析，解析失败时**坏文件已经落盘并被推上线**（`warbonds.json` 被插坏、
    债券页当场挂掉，随后回滚重做才恢复）。校验不通过就**不要写盘**。

14. **文本文件保持 UTF-8 无 BOM**；改完自检三件事：字节数变化是否合理、关键字符串出现次数是否符合预期、
   有无字符被**批量替换**的痕迹（历史事故：PowerShell 读写后整份文件的字母 `u` 被写成了 `r`，
   CSS 里的 `url(` 全部变成另一种拼写，整页样式失效）。JSON 一律用 `ConvertFrom-Json` 过一遍。
   > 自检脚本建议统计那两种拼写的出现次数；本文档为避免自我误报，不在正文里写出它们。

### 11.2 环境限制

- **本机 hosts 屏蔽了大量域名**（`C:\Windows\System32\drivers\etc\hosts`，`#S302` 标记），
  其中包括 `api.github.com` 与 `github.com`。推送前需临时移除这几行。
  **还原是硬性纪律**——本轮就因为连续多轮推送，把这两行弄丢过两次（491 → 489 行），
  最后是从完整备份整体恢复才对齐。两条铁律：
  1. **写入用 `[System.IO.File]::WriteAllLines($h, $lines, [Text.Encoding]::ASCII)`**，
     `Set-Content` 曾把整个 hosts 清空（报 `Stream was not readable`）。
  2. **每轮推完立刻用 `Compare-Object` 与完整备份比对**，确认 491 行、三条 `127.0.0.1 github*` 都在：
     ```
     github.com / www.github.com / api.github.com  → 127.0.0.1 #S302
     ```
     完整备份建议常备一份在 `%TEMP%\hosts.bF`。
- **无头 Chrome 被沙箱阻断**（`OpenProcess: 拒绝访问` / named-pipe EPERM），
  无法用于截图验证；**本机也没有 ffmpeg**，无法转码/压缩图片。
- **`pip install` 被拒**（site-packages 不可写），Python 只能用标准库。
- **PowerShell 读取 UTF-8 中文文件**：`Get-Content` 不加 `-Encoding UTF8` 会乱码；
  数括号/正则统计用 **Node 脚本**更可靠（PowerShell 的 `$()` 转义极易出错）。
- **共享浏览器窗口是隐藏的** → 页面 `document.visibilityState === "hidden"`：
  rAF/定时器被节流，`loading="lazy"` 的图片**不会自动触发加载**（验证图片是否真能显示时，
  要么临时改成 eager 重新加载，要么滚动到底触发；否则会误判成"破图"）。
  另外 `browser_click` 若传 x/y，走的是**文档坐标**而非视口坐标（按视口坐标点会打空）。
- **临时静态服务**：`%TEMP%\hd2serve.js`（参数：根目录、端口，默认 8791）。仅本地验证用，
  **验证完必须 kill**（本轮多次因为忘记关，导致端口占用与"服务已死/未死"的误判）；临时文件也不要留在仓库里。
- **本地仓库与远端不同步时的同步办法**（本机 git 的远端操作不可用，见 §11.3）：
  ```
  GET https://api.github.com/repos/Jerry114514/Jerry114514.github.io/tarball/main  → 下载整仓快照
  tar -xzf <快照> -C <仓库根> --strip-components=1                                 → 覆盖
  ```
  只新增/覆盖，**不会删除**本地 gitignore 的文件（它们不在快照里），也不会动未跟踪文件。
  注意：覆盖后本地 `.git` 索引与文件会不一致（`git status` 一堆 modified），**这是预期现象**，别据此判断同步状态。
- **沙箱网络**：`api.github.com`、`api.cloudflare.com` 可达；但 **`*.workers.dev` 被屏蔽**
  （DNS 解析到非 Cloudflare 的 IP、TCP 443 不通）→ 无法自测 Worker 的 HTTP 入口，只能靠用户打开或看 GitHub 运行记录。
- **令牌纪律**：PAT / Cloudflare token **不写进任何文件或仓库**，只在命令行里用；用户应定期轮换（本轮已建议轮换两次）。

### 11.3 部署纪律

- **不要逐文件推送**：每个 API PUT 都是一次提交，会触发一次 Pages 构建。
  密集推送时构建容易 `Page build failed`（本轮 26 张环境图逐个推，连炸 5 次构建）。
  → 一次推送尽量合并；若已炸，用 `POST /repos/{repo}/pages/builds` 手动重建。
- **推送后必须轮询构建状态**：`GET /repos/{repo}/pages/builds/latest`，直到 `built`。
  失败就手动重建，不要干等。

### 11.4 CI 与配额（2026-09-17 治理，两条独立配额都曾被撞满）

**⚠ 先记住一个反直觉事实**：**公开仓库的 Actions 分钟数免费无限**。用户最初报"免费 actions 额度耗尽"，
真正的原因是下面两条**彼此独立**的配额，都不是"算力不够"。

**① Actions 存储 500 MB —— 被 Pages artifact 堆满**
每次推送到 main 都会触发 Pages 重建，每次重建产出 **1 个 `github-pages` artifact ≈ 整站体积**（当时 50.5 MB）。
实测撞满时：**30 个 artifact / 1,514 MB**（上限 500 MB，**超 3 倍**）。artifact 不是我们的工作流上传的，
是 Pages 自己产的 —— 所以"从没上传过 artifact"也会超。
- 治理：**(a)** 一次性删除全部存量 artifact（`DELETE /repos/{r}/actions/artifacts/{id}`）；**(b)** 把 artifact 保留期改 **1 天**；
  **(c)** 把清理逻辑**挂进 `fetch-data.yml` 末尾**（`if: always()` + `permissions: actions: write`，只删 10 分钟以前的）。
- 为什么不用"每 3 小时清一次"：稳态峰值 ≈ **`(清理间隔 ÷ 提交间隔) × 单次体积`**。
  5 分钟提交 + 50 MB/个 → 3 小时清一次峰值 **1.8 GB（必爆）**，20 分钟才安全。
- 另一个关键教训：**新加一个定时工作流不可靠**。`cleanup-artifacts.yml` 用的原生 schedule 部署后 **20+ 分钟一次都没触发**；
  而 `fetch-data.yml` 的 schedule 稳定按点跑 → 所以清理挂到"已被证明能跑"的那个工作流里。

**② 私密仓库 2000 分钟/月 —— 被翻译流水线跑满**
私密仓库（`HD2Web-Trans`）不是无限：两个工作流 `translate_news.yml`（Translate News）+ `push_to_page.yml`（Push TransNews to Page）
各 `*/15` ≈ **5,760 次/月** → 额度耗尽、Actions 被停。
- 治理：**降到每 2 小时**（翻译 `0 */2 * * *`、推送 `30 */2 * * *` 错开，确保先产出译文再合并）。
  实测单次 25.8s / 11.8s → 合计 **≈226 分钟/月**（占 11%），随后把 Actions 重新启用。
- 顺带：`push_to_page.yml` 最后会 `repository_dispatch: fetch-now` 触发站点抓数据 → 降频也一并减少了站点侧运行。

**③ Cloudflare Worker（冗余触发，可选）**
- Worker 名 `helldivers2-gitpage-dispatch`，`*/5` cron 从外部调 GitHub `workflow_dispatch`；
  脚本源码在 `scripts/cloudflare_dispatcher.js`（含完整部署步骤）。
- **令牌权限坑（重要）**：**账号级 `cfat_` 令牌传脚本、写 secret 都可以，但管不了 cron**
  （`POST …/schedules` → `405 Method not allowed for this authentication scheme`；`PUT` 给误导性的 `10026`）。
  **必须用用户级 `cfut_` 令牌**（`https://dash.cloudflare.com/profile/api-tokens` → Create Custom Token →
  `Account | Workers Scripts | Edit`）。
- 即使成功，**该端点仍会返回 `10026` 假报错** —— 以 `GET /accounts/{id}/workers/scripts/{name}/schedules` 读回为准。
- Worker 的 `GH_PAT` secret 里放的是 GitHub 令牌 → **用户轮换 GitHub 令牌后必须重新上传脚本更新该 secret**，否则 Worker 静默失效。

**④ 本机 cron 已废弃**：三路触发里最不可靠的一路（需要一直开着电脑）。接手时若发现本机还有旧定时任务，**删掉**。

---

## 12. 部署流程（可直接照抄）

### 12.1 推送

```powershell
# 0) 备份并临时解除 GitHub 屏蔽
$h="$env:SystemRoot\System32\drivers\etc\hosts"
Copy-Item $h "$env:TEMP\hosts.bak" -Force
$keep = Get-Content $h | Where-Object { $_ -notmatch '^\s*(127\.0\.0\.1|0\.0\.0\.0)\s+(api\.github\.com|github\.com)\b' }
[System.IO.File]::WriteAllLines($h, $keep, [System.Text.Encoding]::ASCII)
Clear-DnsClientCache
```

**为什么不是 `git push`**：本机 git 的**远端操作全部不可用**——`git push`/`fetch` 报
`schannel: AcquireCredentialsHandle failed: SEC_E_NO_CREDENTIALS`（凭据子系统问题，与本仓库配置无关）。
所以**一切推送都走 GitHub Git Data API**（下面这段是本次会话反复验证过的配方）。

```powershell
# 主配方：Git Data API（多文件 / 单文件都适用）
# 铁律见 §11.1 第 9~14 条：手工拼 JSON、每步回读、带重试、UTF-8 无 BOM、别用 Get-Content -Raw
$pat   = '<PAT>'                      # 不写进任何文件
$repo  = 'Jerry114514/Jerry114514.github.io'
$files = @('路径/文件1','路径/文件2')  # 仓库相对路径，正斜杠
$orig  = [IO.File]::ReadAllLines($hosts)   # hosts 基线（491 行）
try {
  [IO.File]::WriteAllLines($hosts, ($orig | Where-Object { $_ -notmatch 'api\.github\.com' }), [Text.Encoding]::ASCII)
  ipconfig /flushdns | Out-Null
  $hj = @{ Authorization = ('Bearer ' + $pat); 'User-Agent' = 'dsh-push'; Accept = 'application/vnd.github+json' }
  $api = 'https://api.github.com/repos/' + $repo

  # 1) 上传所有 blob（内容寻址，可先建好再进重试循环）
  $blobs = @{}
  foreach ($f in $files) {
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $root ($f -replace '/','\'))))
    $blobs[$f] = (Invoke-RestMethod -Method Post -Uri ($api + '/git/blobs') -Headers $hj `
      -ContentType 'application/json; charset=utf-8' `
      -Body ([Text.Encoding]::UTF8.GetBytes('{"content":"' + $b64 + '","encoding":"base64"}'))).sha
  }

  # 2) 建 tree + commit + 更新 ref；每轮重读 head（fetch 工作流每 5 分钟提交一次，会抢跑）
  $done = $false
  for ($try = 1; $try -le 5 -and -not $done; $try++) {
    try {
      $head = (Invoke-RestMethod -Uri ($api + '/git/ref/heads/main') -Headers $hj).object.sha
      $base = (Invoke-RestMethod -Uri ($api + '/git/commits/' + $head) -Headers $hj).tree.sha
      $items = @(); foreach ($f in $files) { $items += '{"path":"' + $f + '","mode":"100644","type":"blob","sha":"' + $blobs[$f] + '"}' }
      $nt = (Invoke-RestMethod -Method Post -Uri ($api + '/git/trees') -Headers $hj `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([Text.Encoding]::UTF8.GetBytes('{"base_tree":"' + $base + '","tree":[' + ($items -join ',') + ']}'))).sha

      # ★ 回读校验：确认 tree 真的含新内容（不做这步就可能"空推"，见 §11.1 第 9 条）
      $tr = (Invoke-RestMethod -Uri ($api + '/git/trees/' + $nt + '?recursive=1') -Headers $hj).tree
      $ok = 0; foreach ($f in $files) { $e = $tr | Where-Object { $_.path -eq $f }; if ($e -and $e.sha -eq $blobs[$f]) { $ok++ } }
      if ($ok -ne $files.Count) { throw "tree 校验失败 $ok/$($files.Count)" }

      $cm = (Invoke-RestMethod -Method Post -Uri ($api + '/git/commits') -Headers $hj `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([Text.Encoding]::UTF8.GetBytes('{"message":"<提交信息>","tree":"' + $nt + '","parents":["' + $head + '"]}'))).sha
      Invoke-RestMethod -Method Patch -Uri ($api + '/git/refs/heads/main') -Headers $hj `   # ← 必须 /heads/main
        -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes('{"sha":"' + $cm + '"}')) | Out-Null
      Write-Host ("推送成功 commit=" + $cm.Substring(0,9)); $done = $true
    } catch { Write-Host ("第 $try 轮失败: " + $_.Exception.Message); Start-Sleep -Seconds 4 }
  }

  # 3) 复核 main（比对 blob sha）
  $t2 = (Invoke-RestMethod -Uri ($api + '/git/trees/main?recursive=1') -Headers $hj).tree
  foreach ($f in $files) { $e = $t2 | Where-Object { $_.path -eq $f }; Write-Host ("$f  生效=" + ($e -and $e.sha -eq $blobs[$f])) }
} finally {
  [IO.File]::WriteAllLines($hosts, $orig, [Text.Encoding]::ASCII); ipconfig /flushdns | Out-Null
}
```

> **更简单的单文件替代**：GitHub **Contents API**（`PUT /repos/{r}/contents/{path}`，body 带 `content`(base64)+`sha`）
> 也能用，但**每个文件一次提交 = 一次 Pages 构建**，多文件时请用上面的 Data API（见 §11.3）。
> 另外：内容 API 的 `GET` 响应可能被 CDN 缓存几十秒，**判断"是否已同步"要用 Trees API 的 blob sha**（不受内容缓存影响）。

```powershell
# 1) 还原 hosts（务必）
$bak = Get-Content "$env:TEMP\hosts.bak" -Raw
[System.IO.File]::WriteAllText($h, $bak, [System.Text.Encoding]::ASCII)
Clear-DnsClientCache
```

### 12.2 验证部署

```javascript
// 轮询构建 + 抽查线上是否已是新内容（都要加 cache-buster）
for (let i = 0; i < 20; i++) {
  const b = await (await fetch(`https://api.github.com/repos/${repo}/pages/builds/latest`, {headers: H})).json();
  const live = await (await fetch(url + "?cb=" + Date.now(), {cache: "no-store"})).text();
  if (live.includes(标志字符串)) break;
  if (b.status === "errored") await fetch(`https://api.github.com/repos/${repo}/pages/builds`, {method: "POST", headers: H});
  await new Promise(s => setTimeout(s, 12000));
}
```

> **PAT 不在本文档里**（历史上曾把令牌写进文档并推上去，已清理；请勿再写入仓库/文档）。
> 令牌由用户提供，**不落盘**，只在命令行里用；用完请提醒用户轮换。
> **两次实测教训**：
> 1. 令牌格式为 `github_pat_` + 22 + `_` + 59 = **93 字符**。会话中一度出现 **94 字符**的版本（多一个字符），
>    表现是清一色 `401 Bad credentials` —— 看起来像"被撤销"，其实只是复制串了。
>    → **推送前先做一次预检**：`GET https://api.github.com/user` 返回 `login` 才算令牌可用，不通就停下找用户。
> 2. 401/403 与"权限不足"要分清：本文档 §11.1 第 10 条的 **422** 是路径写错，不是权限问题。

---

## 13. 当前完成度

### 已完成
- ✅ 星图（`galaxy-map-v2.html`）：补给线、入侵箭头、效果图标定位、DSS 本体图标、移动端抽屉
- ✅ 主站 DSS 模块：HUD 风格、行动卡片可点击切换、行动大图、双态配色、倒计时修复
- ✅ 主站星球卡片：全新战役卡片风格（`renderPlanetCard` 重写，5 个区块共用）
- ✅ 数据管线：星球名兜底、biome 字段
- ✅ 设计令牌：阵营色 + 抵抗强度四档
- ✅ 资产：biomes（26）、ui-icons（4）、faction-icons（4）、dss-hero（3）

**本次会话（2026-09-17）新增完成**
- ✅ 图鉴站三个模块：**强化资源**（`boosters.html`，20 项）、**战争债券**（`warbonds.html`，25 个 + 逐页奖励）、
  **机制页通用脚手架**（`mechanic-merge.js`，4 个机制页共用）—— 详见 §16
- ✅ 机制页内容：`damage` 页完成事实纠错 + 内容补全 + 英文译入（表格 0→7、英文折叠块 27→1）；
  `status_effects` 英文译入（折叠块 10→0，并纠正多处编造内容）；`galactic_war` 修掉破坏布局的多余 `</div>`（正文 73px→880px）、处理前 8 节
- ✅ CI/配额：抓取频率 15 → **5 分钟**；**artifact 自动清理**（挂进 fetch 工作流）；私密翻译仓库降频后重新启用；Cloudflare Worker 冗余触发 —— 详见 §11.4
- ✅ 主站趋势图：只渲染**最近 24 小时** + **双轴自适应**（此前把 20 天历史全铺在横轴上，最新数据被压成一条缝；
  影响力系数轴写死 `max:0.025` 而实际最高 3.257% → 顶出界被切；玩家数轴加 `grace` 后被拉到 **-10000** → 已显式 `min:0`）
- ✅ DSS 模块：图标改**本地文件 + 硬编金色 `#f5c518`**（`DSS_ICONS` 从 wiki.gg 外链切到本地 —— 这才是"图标过黑"的真正修复）、
  `PC_ICON_VER` 升版；右上角停靠位置改为「**当前停靠：星球·星区**」
- ✅ 站点 `favicon.ico`（此前全仓没有，浏览器自动探测一直 404）

### 未完成（见 `HD2主页改版计划.md` 第五节）
- ⬜ 令牌层之外的**整体质感**：去毛玻璃（28 处 `blur/backdrop-filter`）、清零 61 处 `border-radius`、10 处 `box-shadow`
- ⬜ 组件改版：`header` 导航 / `hero` 首屏 / `block-head` 区块标题 / `impact-stat` / `sector-group` 目录 / `strat-card` / 紧急战情 / 目标星球 / Chart.js 图表 / 浮动资讯面板 / `footer` / 响应式复核
- ⬜ `HD2_Wiki/*` 与星图的令牌对齐（本轮明确不做）

### 被有意搁置
- `block-pevents` 活动事件模块（与"紧急战情"内容重叠）
- 星图的"阴霾含混"视觉效果：`tcs` 环渲染层级曾出现异常，目前算法已在代码中，但需视觉复核
- 星图 `assets/effect-icons/dss_planetary_bombardment.svg` 目前无 `effectIds` 指向（机制已被"重型军械分发"取代）

---

## 14. 排查问题的最短路径

**主站某区块空白 / 不更新**
1. 刷新，看 `#pulse` 是否有 `stale` 类 → 有则 `refresh()` 抛错了
2. 逐块手动跑渲染函数定位（本轮就是这么找到 `EFFECT_ICON is not defined`）：
   ```javascript
   const data = await fetchAll();
   try { renderAttackable(data); } catch(e) { e.message }
   ```
3. 看线上 `data.json` 的数据形状是否与前端期望一致（本地那份常过期）

**星图不显示某图层**
1. `map.getLayer('xxx')` 是否存在；`map.getStyle().layers` 是否含它
2. **静态 `icon-image`** 的图片必须在样式校验前注册，否则整层不渲染（且只在控制台报一行）
3. 若报"页面卡在正在构建星图图层…"：图层样式里有未解析的表达式（历史上是 `["interp-players"]` 占位符）

**图标不显示**
1. 先确认 SVG 有没有被剥掉行内 `fill`
2. 再看 `viewBox` 是否真的框住了内容（wiki 描摹件经常不匹配）
3. 最后怀疑缓存 → 加/改版本号

**部署了但站点没变**
1. `raw.githubusercontent.com` 上有没有新内容？没有 → 推送本身失败
2. 有 → Pages 构建状态；`errored` 就手动重建
3. 构建 `built` 但页面仍旧 → **CDN 缓存**，加 `?cb=` 强制取

---

## 15. 术语表

| 术语 | 含义 |
|---|---|
| **MO** | Major Order，重要指令 |
| **DSS** | Democracy Space Station，民主空间站（"战备"里的空间站） |
| **biome** | 星球环境类型（决定地表地貌，共 26 种） |
| **campaignType** | `liberation`（解放战役）/ `defense`（防御战）/ `recon`（侦察战） |
| **invasionLevel** | 入侵等级（防御战专属，如 40/50） |
| **activeEffects** | 星球行动变量（effectId 数组，如 1360=生化人） |
| **resistance** | 抵抗强度（%，决定防御方恢复速度） |
| **status（DSS）** | 1=募捐中 / 2=已激活 / 3=冷却期 |
| **hd2dev** | 社区中转 API `api.helldivers2.dev`，会整段失败 |
| **companion** | `helldiverscompanion.com` 的社区 API |

### 15.1 术语 canon（2026-09-17 用户确认，改动请先核对这里）

| 英文 | 统一中文 | 备注 |
|---|---|---|
| Super Credits | **超级货币** | 曾写"超级点数"，已全站替换（144 处） |
| Hellpod | **绝地喷射仓** | 曾写"地狱舱"，`missions.json` 已统一 |
| Fortified | **固守** | **暂译**：站内/官方中文均找不到对应译名，正文保留英文括注 |
| Warbond / Medal | **战争债券 / 勋章** | |
| AV / AP | **护甲值（AV）/ 穿透（AP）** | 曾混用"护甲等级/护甲值/穿透等级" |
| （13 档护甲名） | 无受击框 / 无护甲 / **极轻甲** / 轻甲 / 中甲 / 重甲 / 坦克 I–VI / 反坦克 I–VI / 坚不可摧 | AV-1…AV11；穿透侧 AP5–AP10 = 反坦克 I–VI |
| Overpenetration / Cleave | **过穿** | 统一写作「过穿（Overpenetration / Cleave）」 |
| Demolition Force | **拆毁力** | 曾混用"拆毁值" |
| Constitution & Bleedout | **体质值 / 流血** | 曾误译为"生命值构成（流血）" |
| Durability / ExDR / ExVM | 耐久度 / 爆炸伤害抗性 / 爆炸验证模式 | ExVM 取值 **All / Outer Radius / None**（不是 0/1） |
| Stim / Sample / Extraction | 兴奋剂 / 样本 / 撤离 | |
| Booster | **强化资源** | 模块名；`boosters.html` |

### 15.2 数据字段术语（图鉴站）

| 字段 | 含义 |
|---|---|
| `id` | 小写 snake_case，详情页参数 `?id=<id>` |
| `X` / `X_zh` | 英文 / 中文；渲染时 `X_zh \|\| X` 回退 |
| `fully_translated` | 机制页小节级：中文已完整覆盖英文散文 → 不渲染「英文原文」折叠块 |
| `figures_zh: []` | 机制页小节级：丢弃主干被误判为"图片块"的英文散文 |
| `reward_refs` | 债券级：`{ "奖励英文名": {kind, id} }`，`kind = weapon\|stratagem\|booster` → 链到站内详情页 |
| `release_status` | 条目级：`released`（缺省）/ `unreleased` → 页面显示"待发布"+ 未发布徽章 |

---

## 16. 图鉴站模块与内容进度（2026-09-17 本次会话）

> 架构与字段规范见 §6.3 / §6.4 与 `HD2_Wiki/data/wiki/zh/SCHEMA.md`。本节只记"做到哪了、还缺什么"。

### 16.1 强化资源（`boosters.html` · `booster.html`）

- 数据 `data/wiki/zh/boosters.json`（**20 项**），图标 `assets/boosters/`（20，本地化）
- 逐页/条目含：中英名、本地图标、战争债券（中英）、勋章价格、官方描述（英+中）、中文概述、分节正文、数值表、来源 URL
- **已按用户要求去掉分类筛选**（"不需要分类"）与所有 HTML 注释（"不需要注释"）
- **`release_status: "unreleased"`** 用于两个未发布项（集成灭火器、额外一次性反坦克火箭筒强化资源）→ 价格显示「待发布」+ 未发布徽章
- 表内图标尺寸：188×221 的模板图按 `width="188"` 分档缩到 1.27em×1.5em（`512` 档 → `height:1.5em`），
  **不要一刀切 `width:1.5em`**（会把 difficulty 页本来正确的 34×16 图标误缩成 17×8）
- 附注：`vitality_enhancement` 条目里那 4 张「护甲伤害修正」表，正是 `damage` 机制页缺的官方表 —— 术语已对齐（固守/生命力强化/等效生命值）

### 16.2 战争债券（`warbonds.html` · `warbond.html`）

- 数据 `data/wiki/zh/warbonds.json`（**25 个**：标准 1 / 高级 21 / 传奇 3），封面 `assets/warbonds/`（25，约 **4.6 MB**）
- 总览页 = **wiki 式分组封面网格**（标题「全部 N 个战争债券，按发行时间排序」+ 标准/高级/传奇分组，卡片=封面大图+中文名+日期价格）
  ＋一条 `全部/标准/高级/传奇` 筛选键帽；分组标题兼作锚点（`#group-premium`），债券深链 `warbonds.html#<id>`
- 详情页 = 名称(中英)/封面/类型/价格/发行日期/总页数/概述 + **逐页奖励表**（含站内链接）+ 底部「◀ 返回」「来源：wiki.gg ↗」
- **`reward_refs` 是本站最需要维护的字段**：它把逐页奖励里的**武器 / 战略配备 / 强化资源**链到站内详情页，
  共 **122 条**（武器 76 + 战略 26 + 强化资源 20），**匹配不上的保持纯文本**（不许猜 id）。
  匹配规则与未匹配清单登记在 `SCHEMA.md` §7.2。
- **链接配色是两套（用户明确要求区分）**：
  - 武器 / 战略配备：`.rw-link` → **常态蓝字**（`var(--blue)`）+ hover 变黄
  - 强化资源：`.rw-link.rw-booster` → **常驻黄字**（`var(--yellow)`）+ hover 提亮
- 反向链接：`weapon.html` / `stratagem.html` / `booster.html` 详情节有「🎖️ 所属战争债券：<中文名> 第 N 页」
- 译名：14 个来自用户抄录的游戏内官方译名（**逐字照抄，勿自行重译**），另 9 个 2026-09-17 补（变量控制/尘卷风/蟒蛇突击兵/破围先锋/堑壕之师/外骨骼机甲专家/**民主光环驰援部队**/正义复仇者/卡斯特兰信条）

### 16.3 机制页（`mechanics.html` · `mechanic.html`，4 个）

| 页 `?id=` | 进度 | 英文折叠块 | 备注 |
|---|---|---|---|
| `damage` | ✅ 事实纠错（14 处 P0）+ 内容补全 + 英文译入去重 | 27 → **1** | 表格 **0 → 7**、45 张图标本地化；仅 `References` 保留英文 |
| `status_effects` | ✅ 英文译入 + 按主干纠正多处**编造内容** | 10 → **0** | `Change History`（英文更新日志）**未译** |
| `difficulty` | ⏳ 未处理 | **2** | 两个折叠块待译 |
| `galactic_war` | 🔶 部分完成（**8/28 节**） | 4 → **0** | 剩 20 个月度小节未译（约 11 万字符） |

`damage` 页 C1 纠错清单（**这些错误曾长期误导玩家，改动时别再退回去**）：穿透三档应为 **AP>AV 100% / AP=AV 65% / AP<AV 0（跳弹）**；
护甲 **13 档**（不是 10 级）；穿透按入射角 **4 档**（不是"角度越陡穿甲越强"）；「护甲伤害修正」讲的是**玩家护甲**（不是"不同伤害类型对护甲修正"）；
玩家受爆炸伤害**天生减半**（不是"爆炸对护甲加成"）；DoT **必须能穿透 AV**（不是"无视护甲"）；火焰是**重甲穿透**（不是"无视护甲"）；
ExVM 取值 **All/Outer Radius/None**（不是 0/1）；爆炸**无视耐久度**但需 AP ≥ 主体护甲；**ExDR 100% 时伤害转由主体承受**；
伤害类型 **9 类**（补 Impact / Continuous Laser，EMS 是状态效果不是伤害类型）；地狱火炸弹拆毁力 **60**（不是 50）；火焰倍率**无 200%**。

### 16.4 已知问题 / 缺口（接手先看这里）

1. **`galactic_war` 剩 20 个月度小节未译**（`May_2184` … `December_2185`，约 11 万字符 ≈ 2 万词）
2. **⚠ `galactic_war` 主干与中文覆盖「不同源」**：主干抓的是 wiki 的《Galactic War》**剧情/时间线**页
   （`source = …/wiki/Galactic_War`），而中文覆盖来自《Second Galactic War Mechanics》**机制**页 →
   序号配对把「机制速览 / 机制详解 / 任务影响度补充」这类**机制标题挂到了剧情小节**上。
   现状：两段用加粗小标题分隔并排。**彻底理清必须改中文标题或拆页 → 会动 TOC 锚点**，需用户拍板（已登记 SCHEMA §9）。
3. `status_effects` 的 `Change History`（15,274 字符英文更新日志）未译 —— 它是外部版本记录，译者判断"不宜并进正文"
4. `difficulty` 页还有 **2 个**英文折叠块
5. **化学债券译名可能仍不一致**：`warbonds.json` 用「**化学专家**」（PlayStation 官方简中），而 `boosters.json` 里 8 处仍是旧译「**化学代理人**」→ **待核对统一**
6. `HD2_Galatic_war-Map`（主站/星图）与 `HD2_Wiki`（图鉴站）之间仍有译名分歧的隐患：图鉴站已统一「绝地喷射仓」，
   但主站/星图侧若还有"地狱舱/绝地喷射仓"混用需一并核对
7. 主干表格里的 `/wiki/…` 内链在静态站是**死链**（未处理；本站无 `/wiki/` 路由）
8. 模板图标按原始尺寸显示的两处（**用户已决定不缩**）：`difficulty` 正文 23 张、`damage` `.mg-media` 4 张
9. `galactic_war` 主干里 **132 个**被误判为"图片块"的英文散文块（已处理 16 个；其余随月度小节一起等翻译）
10. 主干散文自身矛盾（写 `AV 0–10`，同节表格却是 13 档 AV-1…AV11）—— 已登记 SCHEMA §8，未改主干
11. `missions.json` 的「地狱舱」→「绝地喷射仓」已统一（7 处，2026-09-17）
12. 主站 `index.html` 曾被**另一个 agent** 并发编辑（2026-09-17 11:34 改写 `DSS_ICONS`/`PC_ICON_VER`）→
    **接手时先确认没有别的自动化在同时改这个文件**，否则会互相覆盖

---

## 17. 下一步建议清单（按优先级）

| 优先级 | 事项 | 为什么是这个顺序 |
|---|---|---|
| **P0** | 统一化学债券译名：`boosters.json` 8 处「化学代理人」→「**化学专家**」 | 已知错误且**成本极低**（一次替换 + 一次推送）；不修就会在两个模块间露出不一致 |
| **P1** | 补齐小规模未译：`difficulty`（2 节）+ `status_effects` 的 `Change History` | 规模可控、一次性收尾；做完 3 个机制页就整齐了 |
| **P1** | `galactic_war` 剩余 **20 个月度小节**分批翻译（建议 **5 个月/批，每批一次推送**） | 工作量最大（≈11 万字符）；分批可避免"一次改太多导致坏文件被推上线"，也便于逐批验收 |
| **P2** | 拍板 `galactic_war` 的「**主干与中文覆盖不同源**」问题（改中文标题 / 拆页 / 保持现状） | 只有用户能决定；且它会**动 TOC 锚点**，属于结构性改动，必须先定方向再动 |
| **P2** | 清理主干表格里的 `/wiki/…` 死链（改成站内链接或去掉） | 影响体验但不影响正确性；需要先定"映射到哪个站内页"的规则 |
| **P3** | `assets/warbonds/` 4.6 MB 封面转 **WebP**（可省约 70%） | 纯优化：能同时减小每个 Pages artifact（当前站约 60 MB，单 artifact 峰值 ~250 MB / 上限 500 MB） |

> 排序逻辑：**P0 = 已知错误 + 改动成本几乎为零**（先做，立刻消除不一致）；**P1 = 内容完整性且规模可控**（做一件少一件）；
> **P2 = 需要用户决策或会动锚点的结构性改动**（不能由执行者单方面定）；**P3 = 优化项**（不影响正确性，可随时做）。
