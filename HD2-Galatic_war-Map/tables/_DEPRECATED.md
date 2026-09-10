# 冻结文件说明（星图模块）

> 星图页（map.html）于 2026-09 冻结：功能暂废，受限于技术，待限制解除后可能复活。
> 冻结 = 保留但不再编辑，不挪动位置（相对路径引用不变，降低复活成本）。
> 本文件是冻结清单的单一事实来源；JSON 无法自注释，统一在此登记。

## 冻结清单

| 文件 | 说明 |
|---|---|
| `../map.html` | 星图页入口（顶部已有 @deprecated 注释） |
| `../js/map/main.js` `renderer.js` `dataLayer.js` `coordinateTransform.js` | 星图四件套（文件头有 @deprecated） |
| `../css/map.css` | 星图专用样式（文件头有 @deprecated） |
| `waypoints.json` | 仅服务星图攻击线 |
| `planet_index.json` | 仅 `js/map/dataLayer.js` 引用 |
| `starmap.json.abd` | 星图旧版数据备份 |

## 明确不冻结（易误判，2026-09-10 核查）

| 文件 | 原因 |
|---|---|
| `starmap.json` | **index.html 活跃引用**（PLANET_xx 占位符 → 中文星球名桥接） |
| `../js/libs/chart.umd.min.js` | index.html 的 Chart.js CDN 兜底加载链最后一环 |

## 同步产物（无法加头注，特别说明）

以下文件由 `.github/workflows/sync-tables.yml` 每天 08:00 UTC 自上游
`HD2-Bot-Release/tables` 拉取覆盖，在 Page 仓内加注会被冲掉，故在此登记：

- `星图对照表_修正版.md` —— 星图时代文档；译名参考价值仍有效（翻译侧星球/星区名沿用此表）
- `HD2行动变量对照表.md` / `群使用说明.txt` —— 机器人侧维护
- `dss_effects.json` —— 前端无引用（2026-09 核查），处置结论见仓库根《HD2重构检查计划表.md》
