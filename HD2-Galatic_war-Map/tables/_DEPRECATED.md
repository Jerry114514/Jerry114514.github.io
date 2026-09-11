# 冻结与已删除文件说明（星图模块）

> 旧星图页（map.html）已于 2026-09-11 删除，由 **`../galaxy-map-v2.html`**（MapLibre GL 3D）取代；
> 其源码演进版 `../galaxy-map.html`（SVG v1）仍保留。旧 js/map 模块按"冻结=保留但不编辑"处理。
> 本文件是冻结/删除清单的单一事实来源；JSON 无法自注释，统一在此登记。

## 已删除

| 文件 | 删除时间 | 说明 |
|---|---|---|
| `../map.html` | 2026-09-11 | 旧星图入口；由 `../galaxy-map-v2.html` 取代（phase 4 清理） |

## 冻结清单（保留但不编辑）

| 文件 | 说明 |
|---|---|
| `../js/map/main.js` `renderer.js` `dataLayer.js` `coordinateTransform.js` | 旧星图四件套（文件头有 @deprecated，已被 galaxy-map-v2.html 取代） |
| `../css/map.css` | 旧星图专用样式（文件头有 @deprecated，已被 galaxy-map-v2.html 取代） |
| `planet_index.json` | 仅 `js/map/dataLayer.js` 引用（随四件套冻结） |
| `starmap.json.abd` | 星图旧版数据备份 |

## 曾冻结、现已有活跃消费方（移出冻结清单）

| 文件 | 现消费方 |
|---|---|
| `waypoints.json`（补给线有向邻接） | `../galaxy-map-v2.html`、`../galaxy-map.html`、`../index.html`（tactical.js 战术目标）、`../js/tactical.js` |
| `starmap.json` | index.html（PLANET_xx 占位符 → 中文星球名桥接）；galaxy-map-v2 经 data.json 间接使用坐标 |
| `../js/libs/chart.umd.min.js` | index.html 的 Chart.js CDN 兜底加载链最后一环 |

## 同步产物（无法加头注，特别说明）

以下文件由 `.github/workflows/sync-tables.yml` 每天 08:00 UTC 自上游
`HD2-Bot-Release/tables` 拉取覆盖，在 Page 仓内加注会被冲掉，故在此登记：

- `星图对照表_修正版.md` —— 星图时代文档；译名参考价值仍有效（翻译侧星球/星区名沿用此表）
- `HD2行动变量对照表.md` / `群使用说明.txt` —— 机器人侧维护
- `dss_effects.json` —— 已于 2026-09 移出同步清单并删除（前端/脚本零消费；上游 HD2-Bot-Release 仍留存，需要时恢复同步即可）
