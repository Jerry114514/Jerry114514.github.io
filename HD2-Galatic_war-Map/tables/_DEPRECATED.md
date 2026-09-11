# 冻结与已删除文件说明（星图模块）

> 星图已转正：`../galaxy-map-v2.html`（MapLibre GL 3D）为**主站正式入口**，
> 已挂到 `../index.html` 顶栏与首屏按钮，页内不再标注"原型"。
> 旧版 `../map.html`（Canvas）与 `../galaxy-map.html`（SVG v1）均已删除。
> 旧 js/map 模块按"冻结=保留但不编辑"处理，保留其技术资产价值。
> 本文件是冻结/删除清单的单一事实来源；JSON 无法自注释，统一在此登记。

## 已删除

| 文件 | 删除时间 | 说明 |
|---|---|---|
| `../map.html` | 2026-09-11 | 旧 Canvas 星图入口；由 `../galaxy-map-v2.html` 取代 |
| `../galaxy-map.html` | 2026-09-12 | 星图 v1（纯 SVG + viewBox 变换）原型；功能已被 v2 完全覆盖。<br>其核心思路（坐标映射、Y 轴翻转、战术词条复用）已并入 v2，无独有价值故整体删除 |

## 冻结清单（保留但不编辑）

| 文件 | 说明 |
|---|---|
| `../js/map/main.js` `renderer.js` `dataLayer.js` `coordinateTransform.js` | 旧 Canvas 星图四件套（文件头有 @deprecated）。<br>**保留理由**：WGS84 式归一化坐标 → 屏幕映射、Y 轴翻转、星区包围盒计算等实现仍有参考价值 |
| `../css/map.css` | 旧星图专用样式（文件头有 @deprecated） |
| `planet_index.json` | 仅 `js/map/dataLayer.js` 引用（随四件套冻结） |
| `starmap.json.abd` | 星图旧版数据备份 |

## 曾冻结、现已有活跃消费方（移出冻结清单）

| 文件 | 现消费方 |
|---|---|
| `waypoints.json`（补给线有向邻接） | `../galaxy-map-v2.html`、`../index.html`（tactical.js 战术目标）、`../js/tactical.js` |
| `starmap.json` | `../galaxy-map-v2.html`（星球/星区中文名映射 + 别名桥接）、index.html（PLANET_xx 占位符 → 中文名桥接）|
| `../js/libs/chart.umd.min.js` | index.html 的 Chart.js CDN 兜底加载链最后一环 |
| `../assets/planet-icons/` | galaxy-map-v2 的星球图标（271 个，`fetch_planet_icons.py` 生成）|
| `../assets/effect-icons/` | galaxy-map-v2 的效果图标（势力变种 / DSS 战术行动，来源 helldivers.wiki.gg）|
| `../assets/faction-icons/` | galaxy-map-v2 星区卡的阵营图标（来源 helldivers.wiki.gg Faction Icons）|
| `../js/libs/maplibre/` | galaxy-map-v2 自托管 MapLibre GL JS + 拉丁字形 PBF |

## 同步产物（无法加头注，特别说明）

以下文件由 `.github/workflows/sync-tables.yml` 每天 08:00 UTC 自上游
`HD2-Bot-Release/tables` 拉取覆盖，在 Page 仓内加注会被冲掉，故在此登记：

- `星图对照表_修正版.md` —— 星图时代文档；译名参考价值仍有效（翻译侧星球/星区名沿用此表）
- `HD2行动变量对照表.md` / `群使用说明.txt` —— 机器人侧维护
- `dss_effects.json` —— 已于 2026-09 移出同步清单并删除（前端/脚本零消费；上游 HD2-Bot-Release 仍留存，需要时恢复同步即可）
- 注：`starmap.json` **不在**同步清单（已核实 workflow 的 for 循环只拉上述三个文件），
  故 HEZE BAY → 九州殊口增七 等译名可直接在本仓维护
