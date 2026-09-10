# HD2 重构检查计划表（修订版 · map.html 冻结）

> 依据：用户修订版清单（2026-09-10）+ 同日只读实测核查。
> 实测工具：全仓 html/css/js 扫描（引用矩阵、行数统计、字体/hex 分布、git 跟踪状态）。
> 最后更新：2026-09-10 · 维护：随阶段推进更新进度表

---

## 0 · 实测核查对清单的修正（重要，先读）

| # | 清单原判 | 实测结果 | 修正后判定 |
|---|---|---|---|
| 1 | 冻结 `tables/starmap.json` | **index.html 仍活跃读取它**（`fetch(CONFIG.STAR_MAP_URL)`，用于 PLANET_xx 占位符 → 中文星球名桥接） | **不冻结**，保持活跃维护面。真冻结的是 `waypoints.json`、`planet_index.json`、`starmap.json.abd` |
| 2 | 冻结 `js/libs/chart.umd.min.js`（推测仅 map.html 引用） | 被 **index.html** 引用——Chart.js 的 CDN 兜底加载链第 4 位（`cdnjs/bootcdn/jsdmirror 失败 → /js/libs/chart.umd.min.js`） | **不冻结**，保留为 CDN 被墙/离线时的本地兜底 |
| 3 | index.html 内嵌 3000+ 行 CSS | 实测 **1078 行** CSS（全文 3188 行） | 仍值得拆，量级修正 |
| 4 | wiki 7 页重复 200+ 行 CSS | 12 页各有 1 个 style 块，30–115 行，合计约 876 行；公共重复基座估 60–80 行 × 12 页 | 仍值得抽，量级修正，受益页为 12 页而非 7 页 |
| 5 | map#4 核查项（tables 哪些被读） | 已有答案：活跃 = starmap / stratagems / hd2_variables / galactic_effects / effect_id_cn；冻结 = waypoints / planet_index / starmap.json.abd；**dss_effects.json 无任何代码引用（疑似死文件，待查是否由 sync-tables.yml 生成）**；`tables/` 下另有 3 个中文 MD + 群使用说明.txt + strat_icons.json（无引用） | 核查项关闭，遗留 dss_effects.json 查证（阶段 4 内完成） |
| 6 | wiki#2 layout 字段死配置（待证） | 证实：前端没有任何页面读取 index.json 的 `layout` 字段（仅 CSS 类名 .layout 同名巧合） | 可执行：删字段 + 抓取侧停输出 |
| 7 | 跨项目#3 --yellow 同名不同值 | `#f5c518`：主站 9 处 + 维基 12 页全用；`#facc15`：**仅存在于已冻结的 css/map.css** | 自动解决：活跃真相 = #f5c518，map.css 冻结不动 |
| 8 | map#2「抽 5 分钟刷新」 | index.html 现状已是统一 CONFIG + 60s 轮询 + 5 分钟粒度缓存穿透（8 个 fetch 点） | data-source.js 的任务是**收拢 8 个调用点与缓存**，不是引入新刷新策略；保留现有语义 |
| 9 | wiki#3 fetch_reports 进生产仓 | 证实：`HD2_Wiki/data/wiki/zh/fetch_reports/` 共 13 个文件且**均已被 git 跟踪**（不止 missions_trans 9 个，还有 enemies/parts/icons/missions 4 个 report） | 只加 .gitignore 无效，需 `git rm -r --cached` 配合；操作批不做 rebase（避 §8.3#28 坑） |
| 10 | wiki#4 路由重复 | 6 个页面有 ?id= 解析（enemy / mechanic / mission / missions / stratagem / weapon） | router 覆盖 6 页 |
| 11 | — | index.html 全部 JS 内联（无 `<script src>`）；map.html 在 index.html 中 0 次提及（入口已移除，冻结不影响导航） | 记录 |

## 1 · 总原则（安全阀）

1. **不删任何冻结文件，不挪动位置**——JSON/JS 的引用是相对路径，挪动会抬高「技术限制解除后复活」的成本。冻结只加注释/说明。
2. `data.json`、`TransNews.json` 等自动生成文件**永不手改**；每批 push 前先 `git pull --rebase origin main`。
3. 每阶段 1–2 个独立 commit，线上出问题 `git revert` 单个 commit 即可回滚，不跨阶段混提交。
4. 推送前本地 `python -m http.server 8088` 全页验收；推送后线上复查同清单。
5. 冻结标记批与重构批**分开提交**（纯注释 commit 零行为变化，出问题可秒定位）。

## 2 · 阶段计划

### 阶段 1 · 零风险批（冻结标记 + 仓库卫生）→ 1 个 commit
| 动作 | 细节 |
|---|---|
| map.html | 顶部加 `<!-- @deprecated: 星图页暂废，技术限制解除后复活，勿编辑 -->` |
| js/map/ 4 个 js | 文件头 `// @deprecated since 2026-09: 星图冻结，勿编辑` |
| css/map.css | 文件头 `/* @deprecated since 2026-09 */` |
| JSON 类冻结文件 | JSON 无法注释 → 新建 `tables/_DEPRECATED.md` 统一说明（列出 waypoints.json / planet_index.json / starmap.json.abd 冻结，**starmap.json 为活跃文件不冻结**，复活条件），文件本身不动 |
| 两份 MD 文档 | `HD2 Companion 星图设计总结.md`、`tables/星图对照表_修正版.md` 顶部加弃用说明（星图对照表如仍被翻译管线引用需先核实再标） |
| wiki#3 | .gitignore 加 `HD2_Wiki/data/wiki/zh/fetch_reports/` + 同 commit `git rm -r --cached` 13 个文件；本批不做 rebase |
| strat_icons.json | 已证实无引用；.gitignore 加条目，文件留本地（未跟踪，删了找不回，最终处置等拍板 D1） |
| 验收 | git diff 仅为注释/.gitignore/rm --cached；12+1 页全开无异常；线上 map.html 仍可访问（冻结≠下线） |

### 阶段 2 · wiki 样式单点化（wiki#1 🔴，搭车跨项目#2 字体）→ 1 个 commit
1. 两两 diff 12 页 style 块 → 提取公共基座 `HD2_Wiki/assets/css/wiki-base.css`；
2. @font-face 一并收进 base 并把字体统一到 `assets/fonts/`（ZZZ-thick.ttf 从 wiki 根挪入 + 各页引用同步改）；
3. 各页保留页内独有样式，头部 `<link>` 引入 base。
- 验收：12 页逐页 console 零报错；字体、`richText()` 彩色、卡片网格与改前截图一致；weapons/stratagems/enemies 卡片数量不变。

### 阶段 3 · wiki 数据/路由整理（wiki#2 → #4 → #5，先机械后行为）
1. **#2**：删 `index.json` 的 layout 字段 + 找到生成它的 fetch 脚本停输出（前提已证实）；
2. **#4**：抽 `wiki-router.js`（?id= 解析、缺参/非法 id 回退、跳转），6 页接入；
3. **#5**：抽 `blocks.js`，wiki.html 行为不变，分类页声明式接入（行为改动最大，放最后）。
- 验收：目录页卡片渲染数、详情页正常/异常 id 路由、首页 blocks 渲染逐页过。

### 阶段 4 · 主站拆分（map#3 → #1 → #2，先静态后行为；前置查证 dss_effects.json）
1. **#3**：`css/tokens.css`（26 个既有变量迁入，--yellow=#f5c518 单点真相）；
2. **#1**：`css/home.css`（1078 行迁出，index.html 引 2 个 `<link>`）；
3. **#2**：`js/data-source.js` 收拢 8 个 fetch 点（data.json / banner / starmap / hd2_variables / galactic_effects / effect_id_cn / stratagems / player_distribution 历史），**保留 60s 轮询 + 5 分钟粒度缓存穿透语义**；
4. **#4 尾项**：查证 dss_effects.json 是否由 sync-tables.yml 生成 → 决定停生成或保留（决策点 D2）。
- 验收（主站专项）：六模块逐个过（MO 全信息 / DSS 图标与倒计时含 status 1/2 判断 / 战情 / 星球 / Roll / 资讯+banner 轮播）；倒计时数值与改前一致；push 前 pull --rebase。
- 注意：index.html 编辑期间避开 push 时点，防止与 Actions 数据提交撞车。

### 阶段 5 · 跨项目收尾（依赖阶段 4 tokens；最侵入，放最后，需拍板 D3）
- **跨项目#1**：实测双边真正重叠的只有 stratagems（wiki `stratagems_full.json` vs 主站 `tables/stratagems.json`，schema 不同——主站多 stats 四维评分与 bonus）。方案：抽「原始数据层」入 hd2-shared-data 仓，两侧留各自 schema 适配层，submodule 引入。
- **跨项目#2**：若阶段 2 已完成则关闭。
- **跨项目#3**：已由 tokens.css + 「冻结文件不动」原则关闭，无额外工作。

## 3 · 通用回归清单（每阶段推送前后各跑一遍）

1. `python -m http.server 8088` → 12 wiki 页 + 主站逐页打开，console 零报错；
2. 关键抽查：`.strat-card` 数量、图标 `naturalWidth>0`、倒计时走动、banner 轮播；
3. wiki：目录卡片数、详情页 ?id=（正常/非法）、loadout 搭配器；
4. push 前 `git pull --rebase origin main`；失败先查 Steamcommunity 302 三进程；
5. push 后线上（jerry114514.github.io）重复 1–3。

## 4 · 决策点（需拍板）

| # | 事项 | 默认方案 |
|---|---|---|
| D1 | strat_icons.json（无引用，未跟踪） | 先 gitignore 保留本地；确认无用后删除 |
| D2 | dss_effects.json（无引用） | 阶段 4 查证 sync-tables.yml 后停生成或保留 |
| D3 | hd2-shared-data 抽仓 | 本期最后做或单独排期 |
| D4 | --yellow 定值 | #f5c518（活跃代码已全用它，#facc15 仅在冻结文件），无需动作 |
| D5 | index.json layout 字段 | 删字段 + 抓取脚本停输出（不接 CSS 变量） |
| D6 | 冻结 JSON 的标记方式 | tables/_DEPRECATED.md 统一说明，不改文件名不挪位置 |

## 5 · 进度跟踪

| 阶段 | 内容 | 状态 | commit |
|---|---|---|---|
| 0 | 前置核查（清单前提实测） | ✅ 完成 2026-09-10 | —（只读） |
| 1 | 冻结标记 + 仓库卫生 | ✅ 完成 2026-09-10 | ba37c8a97 |
| 2 | wiki-base.css + 字体统一 | ✅ 完成 2026-09-10 | c67fb707f |
| 3 | wiki layout/路由/blocks | ✅ 完成 2026-09-10 | af3656a0e + beda0decb |
| 4 | 主站 tokens/home/data-source + dss_effects 处置 | ✅ 完成 2026-09-10 | 812997940 + 71ad4803c + 895b6dbd4 |
| 5 | shared-data 抽仓 | ⬜ 待 D3（本轮未做） | |

> 2026-09-10 全部阶段（除 5）已完成并推送，线上终验通过。
> 3c 注：blocks.js 已抽取（wiki.html 零行为变化）；分类页未接入——blocks 系统是"页面区块渲染器"，
> 分类页是"卡片列表渲染器"（每页卡片模板唯一+筛选逻辑），强并属架构负收益，如需统一应另立 card-list 方案。
> 4b 注：data-source.js 未加 TTL 缓存——5 分钟桶由 dataUrlBust URL 承担，加缓存会把 60s 轮询退化为 5 分钟陈旧数据。
> 坑复现：§8.3#28 再次应验——阶段1 rebase 后 fetch_reports 被从工作区连带删除，靠事前备份恢复。
