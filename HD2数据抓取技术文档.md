# HD2 数据抓取技术文档

> 数据抓取层——从各 API 拉取原始数据 → 清洗/合并 → 写入 data.json 或 wiki JSON 的过程。
> 本文档独立于系统设计，专注描述每条数据管线的数据来源、转换逻辑、合并策略与已知坑点。
> 最后更新：2026-09-11 · 本地留档（已 gitignore，不入库）

---

## 1 · 数据管线总览

```
┌─ 官方 API ─┐
├─ companion ─┤──→ fetch_site_data.py ──→ data.json ──→ GitHub Pages
├─ hd2dev ───┘         ↑
│                       └─ TransNews.json ← translator.py ← DeepSeek API + 术语表.txt
│                           ↑
│                       push_to_page.yml ← HD2Web-Trans 仓库
│
├─ wiki.gg ──→ fetch_*.py ──→ data/wiki/zh/*.json ──→ 维基页面
│
└─ companion ──→ wake_workflows.py ──→ 本地 cron（每 15 分钟 dispatch）
```

核心脚本：

| 脚本 | 位置 | 产出 | 频率 |
|---|---|---|---|
| `scripts/fetch_site_data.py` | 主仓库根目录 | `HD2-Galatic_war-Map/data.json` | 每 ~15 分钟 |
| `scripts/merge_push_page.py` | 翻译仓库 | 写入主站 data.json（翻译合并） | 翻译完成后 |
| `translator.py` | 翻译仓库 | `TransNews.json` + `translation_history.json` | `*/15` |
| `fetch_weapons.py` 等 | 主仓库根目录 | `HD2_Wiki/data/wiki/zh/*.json` | 手动运行 |
| `wake_workflows.py` | `C:\Users\37420\lobsterai\project\` | dispatch 3 个 Actions workflow | 每 900s（本地 cron） |

---

## 2 · fetch_site_data.py — 主站数据抓取

### 2.1 三源架构

```python
# 实际调用顺序
st = fetch_official()   # api.live.prod.thehelldiversgame.com
wi = fetch_companion()  # helldiverscompanion.com/api/hell-divers-2-api/get-api-data-live
hd = fetch_hd2dev()     # api.helldivers2.dev (DNS 常不通)
```

各源返回的数据结构不同，`main()` 函数中**按字段择优合并**，不是整包覆盖。

### 2.2 字段合并优先级

| data.json 字段 | 优先级规则 |
|---|---|
| `planets` / `campaigns` | companion → official → hd2dev |
| `assignments`（重要指令） | companion → official → hd2dev → 上次快照 |
| `dispatches`（资讯） | **companion 优先**（真实 warTime → ISO 时间换算）；hd2dev 兜底 |
| `dss`（空间站） | companion（含 tacticalActions 捐献数据）→ 官方回退分支 |
| `player_distribution` | 独立从 `extendedApiInformation` 抓取 |
| `war` / `impactMultiplier` | official（官方权威值） |
| `major_order` / `news` | **保留旧值不动**（由 HD2Web-Trans 翻译管线单一写入） |

关键设计决策：
- 翻译字段与原始数据字段**解耦**：fetch 写 `planets/campaigns/dispatches` 等，不改 `major_order/news`（保留上一次翻译管线写入的值）。
- **快照（snapshot）保护**：MO 切换间隙（所有源同时为空）时使用上次成功快照，避免页面闪烁。每次成功抓取保留 `assignments` + `dss` 到 `scripts/.data_snapshot.json`。

### 2.3 dispatches 时间换算（ companion 特有的坑）

companion 的 `news`（即 dispatches 来源）字段中，`published` 是**游戏内 warTime 秒**，不是 Unix 时间戳。换算公式：

```python
real_ms = clientTimeMs + (published - currentWarTime) * 1000
# 其中 clientTimeMs 是 HTTP 响应中的毫秒时间戳
# currentWarTime 是 warStatus.time（当前游戏秒数）
```

换算结果写入 `data.json` 的 `dispatches[].published`，格式为 `2026-08-31T09:34:38Z`。

注意点：
- **不能**直接对 `published` 调用 `norm_time()`（会把 warTime 秒想成 epoch 秒，得到 1972 年）。
- `fetch_companion()` 返回的 dispatches 应保留原始 warTime，由 `main()` 统一换算（否则 `norm_time` 预处理后 `isinstance(published, int/float)` 会失效）。
- companion 的 clientTime/warStatus.time 需从 `obj` 传到最终返回值（`_clientTimeMs` / `_currentWarTime` 字段）。

### 2.4 assignments（重要指令）解码逻辑

`data.json` 中 `assignments.tasks` 是数组，每项包含：
```json
{
  "type": 3,     // 任务类型
  "values": [3, 0, 100000000, 1371180916, 0, 0, 0, 0, 0, 0],
  "valueTypes": [1, 2, 3, 4, 6, 5, 8, 9, 11, 12]
}
```

**valueType 语义随任务类型变化**，取数时必须按 `type` 分支：

| type | 含义 | 有效 valueTypes |
|---|---|---|
| 3 | 消灭敌人（全服击杀计数） | `valueType 1` = 阵营（3=机器人 Automaton, 4=光能者 Illuminate）<br>`valueType 3` = 目标击杀数 |
| 11 | 解放星球（按解放度算进度） | `valueType 12` = 星球 index（100 级解放度，progress=解放百分比） |

历史数据结构对比：
- 旧 MO（type=11）用 `valueTypes=[3, 11, 12] values=[1, 1, 171]` — valueType 3 不是目标数（type=11 强制 goal=100）。
- 新 MO（type=3）用 `valueTypes=[1,2,3,4,6,5,8,9,11,12]` — valueType 1 是阵营，type 6 在位置 5 但值为 0。

注意点：
- **不要用 `get(6)` 取阵营**：曾在 type=3 时误用 get(6)（值恒 0），实际阵营在 get(1)。
- **valueType 12 的值 0 不算星球索引**：type=3 任务的 valueType 12 位置值为 0，不是星球 index 0（超级地球）。前端 `filter(Boolean)` 处理。
- type=11 任务的 goal 来自上游 `progress[i]`（解放百分比），不用 valueTypes 的 raw 值。

### 2.5 DSS 数据（spaceStations）

companion 返回的 `spaceStations[0]` 包含：

| 字段 | 类型 | 说明 |
|---|---|---|
| `location` | int | 当前所在星球 index |
| `currentWarTime` | int | 当前游戏时间（companion 的 warStatus.time，用于站内传送换算） |
| `tacticalActions` | array | 5+ 个战术行动（含捐献/状态/倒计时） |
| `electionEndWarTime` | int | 下次跃迁的游戏时间（用于跃迁倒计时） |

每个战术行动（tacticalAction）：
```json
{
  "id": "eagle_storm",
  "name": "Eagle Storm",
  "status": 2,          // 三阶段：1=募捐中, 2=已激活(倒计时), 3=冷却期
  "effectIds": [1209, 1212, 1216],
  "cost": [{"current": 0, "target": 1000000}],
  "expireAtWarTime": 80800000,     // 激活到期（warTime）；冷却期时表示「冷却结束时间」
  "strategicDescription": "..."
}
```

激活判断：**`status === 2`，不是 `current >= target`**（激活后 current 归零）。
`status` 三阶段：**1=募捐中 / 2=已激活 / 3=冷却期**。
⚠️ 冷却期的 `expireAtWarTime` 是「冷却结束时间」，同样落在未来，
**不可**用「expire 是否在未来」区分激活与冷却 —— 一律以 `status` 判别。
（上游原始字段名为 `cost[].currentValue/targetValue` 与 `statusExpireAtWarTimeSeconds`，
本仓 `fetch_site_data.py` 已归一化为 `cost[].current/target` 与 `expireAtWarTime`。）

倒计时换算（与 dispatches 同一套 warTime 基准）：
```js
const warBase = { realMs: clientTimeMs, warTime: currentWarTime };
// 激活剩余 = expireAtWarTime − currentWarTime → 真实毫秒
const remainMs = (ta.expireAtWarTime - warBase.warTime) * 1000;
```

跃迁倒计时：
```js
const jumpRemain = (electionEndWarTime - currentWarTime) * 1000;
```

前端每秒本地递减 + 云端每 60s 校对：`data-active-ms` 属性由 setInterval 每秒减 1000，整体刷新时重置。

DSS 图标源：`helldivers.wiki.gg` 的 Democracy Space Station 页面（6 个 SVG：DSS_Eagle_Icon、DSS_Orbital_Blockade_Icon、DSS_Heavy_Ordnance_Distribution_Icon、DSS_Planetary_Bombardment_Icon、DSS_Icon、DSS_Eagle_Icon[飞鹰封锁复用]）。

### 2.6 player_distribution 与影响度

- **玩家分布**：从 `extendedApiInformation` 端点抓取（最后一个有数据的条目），含 `total` / `perPlanet` / `factions`。
- 历史记录存到 `data/history/player_distribution.json`（追加模式，24h 趋势用）。
- **影响度**（impactMultiplier）：从官方 API 抓取，用于星球解放进程计算，前端显示 24h 趋势图（Chart.js）。

### 2.7 产出 data.json 结构

| 顶层键 | 来源 | 说明 |
|---|---|---|
| `fetchedAt` | 脚本运行时 | ISO 时间（+08:00 时区） |
| `source` | 枚举 | `official` / `companion` / `hd2dev` |
| `war` | official | 战争状态 |
| `planets` | 各源合并 | 273 个星球信息 |
| `campaigns` | companion | 当前战役（入侵/防御） |
| `assignments` | companion | 重要指令（含所有 sub-tasks） |
| `dispatches` | companion | 最新 30 条资讯（已换算真实时间） |
| `dss` | companion | 空间站状态与战术行动 |
| `news` | 保留旧值 | 翻译版资讯（HD2Web-Trans 写入） |
| `major_order` | 保留旧值 | MO 翻译（HD2Web-Trans 写入） |
| `impactMultiplier` | official | 影响度系数 |
| `player_distribution` | extendedApi | 在线玩家 |
| `recon_stats` | extendedApi | 侦察统计 |

重要约定：**`data.json` 由 Actions 自动生成并 commit，不适合手动编辑或手动提交。** 本地与远端冲突时用 `--theirs` 保留远端版本。

---

## 3 · 翻译管线数据细节

### 3.1 translator.py（DeepSeek 版）

数据流：

```
术语表.txt（386 条 EN|||ZH）→ 解析为 dict → 注入 system prompt
↓
fetch dispatches from hd2dev
↓ 去重（按 id 查 translation_history.json）
↓ 构建 batches（BATCH 条/批）
↓ 并发（WORKERS 个线程）
↓ 每批：DTO 到 DeepSeek API → 返回 {"translations": [...]}
↓ 校验数组长度 === 输入条数
↓ 写回 history（含 engine 字段）
↓
fetch companion/assignments → MO 简报 → 单条翻译
↓
合并 → TransNews.json { mo_brief, items(最新10条) }
```

环境变量：
- `DEEPSEEK_API_KEY`（必填）
- `RETRANSLATE_ALL`：=1 时全量重译 history 所有条目（不增量，遍历全部）
- `DEEPSEEK_MODEL`：默认 `deepseek-chat`（实际路由到 `deepseek-v4-flash`）
- `TRANSLATE_BATCH`：每批条数（默认 8）
- `TRANSLATE_WORKERS`：并发线程数（默认 4）

history 条目结构：
```json
{
  "id": 3919,
  "original": "原文（去标签后）",
  "translated": "译文",
  "published_at": "2026-08-31T09:34:38Z",
  "translated_at": "2026-09-09T17:11:34Z",
  "source": "dispatch",
  "engine": "deepseek-chat"
}
```

Term IDs 机制（百度翻译时代）：用 `BAIDU_TERM_IDS=41239` 传术语表 ID，由百度翻译服务端解析。DeepSeek 版替代为 system prompt 注入。

### 3.2 merge_push_page.py

```
读本地 TransNews.json
↓
下载主站 data.json（通过 GitHub API）
↓
合并：
  data.major_order ← TransNews.mo_brief
  data.news ← TransNews.items（用 translated 字段覆盖）
↓
API PUT 写回主站仓库
↓
dispatch fetch-now（触发主站立即拉新版 data.json → Pages 部署）
```

- 需要环境变量 `GH_TOKEN`（有主站仓库写权限的 PAT）。
- 字段映射：`mo_brief.original → major_order.brief`、`mo_brief.translated → major_order.translated_brief`、`mo_brief.translated_at → major_order.translated_at`。

### 3.3 术语表

路径：`HD2Web-Trans/术语表.txt`（386 条），格式 `英文原文|||中文` 每行。

```
Terminids|||终结族
Automatons|||机器人
Major Order|||重要指令
...
```

加载方式：`translator.py` 的 `load_glossary()` 逐行解析，转成 dict。system prompt 中渲染为：

```
【强制术语表】（出现即必须按此翻译）
Terminids => 终结族
Automatons => 机器人
...
```

注意：wiki 的术语表分布在 `HD2_Wiki/data/wiki/zh/` 下的多个 md 文件（送审版/敌人版/部位版），格式不一致，与翻译管线的术语表相互独立。

---

## 4 · wiki 抓取脚本

### 4.1 脚本清单与数据源

| 脚本 | 数据文件 | 抓取策略 |
|---|---|---|
| `fetch_weapons.py` | weapons.json (89) | druid-infobox → stat 表 → 攻击表 |
| `fetch_stratagems.py` | stratagems_full.json (108→109) | 遍历 Cargo 分类或 druid-infobox |
| `fetch_detailed_stats.py` | 嵌入 stratagems_full / weapons | 渲染页面的 Detailed Weapon Statistics → flextable → 字段映射 |
| `fetch_enemies.py` | enemies.json (95) | 自动判定 druid-container-enemy；按官方 Factions 页面结构组织 |
| `fetch_enemy_parts.py` | 嵌入 enemies.json | 渲染页面 body part table → 表头动态映射列 |
| `fetch_missions.py` | missions.json (105) | 按分类遍历任务页 |
| `fetch_mechanics.py` | mechanics/*.json (4 页) | h2/h3/h4 章节树提取 + TOC |
| `fetch_icons.py` | embed into JSON | wiki.gg 图片列表 → 240px thumb URL |
| `normalize_icons.py` | 清洗路径 | 统一缩略图格式 |
| `add_enemy_thumbs.py` | embed into enemies.json | 240px 缩略图 |

### 4.2 通用抓取模式

所有维基抓取脚本共用同一套流程：

1. 通过 wiki.gg API (`https://helldivers.wiki.gg/api.php`) 抓取页面 HTML wikitext 或渲染文本
2. 用正则或 HTML 解析器提取结构化字段
3. 清洗 → 写入 `data/wiki/zh/*.json`
4. 翻译字段追加 `*_zh` 后缀，不覆盖原文

API 端点模式：
```python
# 取渲染文本（含表格）
d = fetch_api({"action": "parse", "page": "页面名", "prop": "text"})
# 取原始 wikitext
d = fetch_api({"action": "parse", "page": "页面名", "prop": "wikitext"})
# 搜索
d = fetch_api({"action": "query", "list": "search", "srsearch": "关键词"})
# 图片信息
d = fetch_api({"action": "query", "titles": "File:文件名", "prop": "imageinfo", "iiprop": "url"})
# 列出分类
d = fetch_api({"action": "query", "list": "categorymembers", "cmtitle": "Category:分类名"})
```

用户代理头统一使用 `"Mozilla/5.0 HD2-Wiki/1.0"` 或具体脚本标识。部分端点需 `"X-Super-Client"` / `"X-Super-Contact"` 头。

### 4.3 敌人部位解析（fetch_enemy_parts.py）

核心难点：wiki 的部位表格列名不固定（Part Name / Health / AV / Location / Durable / % To Main / Fatal? / ExDR …），需动态映射：

```python
COL_MAP = {"part_name": ["Part Name", "Name", "部位"], "health": ["Health", "HP", "生命值"],
           "armor": ["AV", "Armor Value", "Armor", "装甲"], ...}
```

特殊处理：
- **复数标记**：`Legs (4)` → part_id=`leg` + count=`4`（前端显示 `×4`）
- **生命值难度缩放**：`130 [Default] 160 at Challenging` → 解析为 `{"base": 130, "challenging+": 160}`
- **致命标记**：`Head` 列含 `💀` 或 `yes` → `fatal = true`
- **弱点标记**：`Weak Point` 列含 `y` / `yes` → `is_weak_point = true`
- **部位示意图**：优先取 `Location` 列的图片 URL（避免误取 `AV` 列的装甲标签图）

### 4.4 任务解析（fetch_missions.py）

分类结构（5 个）：
- `main`（主要目标，10 个）
- `terminid` / `automaton` / `illuminate`（阵营特殊任务）
- `tactical`（战术目标）

任务步骤（steps）提取：嵌套列表深度计数。wiki 页面结构：

```
<div class="mw-content-text">
<h3>Mission Walkthrough</h3>
<ol><li>...</li>...</ol>
<h3>其他标题</h3>
```

深度计数 `extract_list_block`：逐层检测 `<ol>` / `<ul>` 嵌套深度，**非贪婪正则遇到嵌套列表会提前截断**，必须用深度计数到正确闭合处。

tactical 分类的特殊性：第三列是**阵营归属**（faction）而非难度（difficulty），须用 `FACTION_ALIAS` 映射。

### 4.5 游戏机制解析（fetch_mechanics.py）

章节树提取：从渲染 HTML 中依次找到 `<h2>` → `<h3>` → `<h4>` 层级关系，分别为 sections → subsections → subsubsections，每个节点提取全部内容到 `content` 字段。

代价：每条内容可能包含大量的 `<ul><li>`、`<table>`、 `<div>` 结构——AI 翻译时用 `_zh.json` 覆盖 `content_zh`。

注意：纯文本中的 `•` 符号 + 换行在 HTML 中不会渲染为列表，必须在翻译阶段转为 `<ul><li>`（已对此类 bug 全量修复）。

---

## 5 · 数据文件细节

### 5.1 data.json（主站战况）

约 450K～550K（压缩前）。结构参见 2.7 节。

关键数值：
- `planets[].index`：星球索引（0-300+），与 starmap 关联的键
- `planets[].name`：来源可能是 `PLANET_xx` 占位符（需 starmap 桥接）或英文原名
- `planets[].sector`：常为空，需用 starmap `sector_en` 补全
- `planets[].currentOwner`：当前占有者（`Humans` / `Terminids` / `Automaton` / `Illuminate`）
- `planets[].health / maxHealth`：解放度 = `(1 - health/maxHealth) * 100`
- `planets[].players`：当前在线玩家数
- `planets[].resistance`：敌方抵抗值（影响解放速度）
- `planets[].activeEffects`：活跃效果 ID 列表

### 5.2 各 wiki JSON

略（见设计文档 5.1 板块表）。统一模式：目录页数据驱动 → 详情页 `?id=` 参数。

### 5.3 loadout.json（战术搭配器数据）

生成自 `战备评分表.xlsx`，与主站 `tables/stratagems.json` 100% 同步（手动保持）。

结构：
```json
{"stratagems": [
  {"id": "..." , "name": "...", "type": "轨道", "stats": [6,8,5,6], "bonus": 1, "subtag": [], "icon": "..."},
]}
```

- `stats` = [对单, 对群, 穿甲, 专项（按类型不同）]
- `bonus` = 加权值
- `subtag` = 多功能标记（影响评分公式中的 M 值）

---

## 6 · 调度与触发

### 6.1 GitHub Actions 配置

| workflow | cron | 触发方式 |
|---|---|---|
| `fetch-data.yml` | `0,15,30,45` | schedule + repository_dispatch (`fetch-now`) + workflow_dispatch |
| `translate_news.yml` | `*/15` | schedule + workflow_dispatch |
| `push_to_page.yml` | `*/15` | schedule + workflow_dispatch |
| `sync-tables.yml` | 每日 08:00 | schedule |

### 6.2 本地调度

- 工具：OpenClaw 内置 cron（任务 ID `dcd4820b`）
- 周期：每 900s（15 分钟）
- 动作：运行 `C:\Users\37420\lobsterai\project\wake_workflows.py`
- 脚本行为：读取本地 git credential → 依次 dispatch 3 个 workflow → 日志写 `%TEMP%\hd2_wake.log`
- 手动快捷：桌面 `HD2定时唤醒.bat`

### 6.3 stuck run 事件总结

- 2026-08-19：主仓库 `pages build and deployment` run #32217034312 卡 queued
- 后果：账号级 `schedule` 全部抑制（所有仓库的 cron 不触发）
- 尝试：cancel API（500）/ force-cancel API（500）/ 网页 Cancel 按钮（均无效）
- 解决：GitHub Support 将相关 check suite 标记为 completed，清理后恢复
- 教训：Pages 内部 run（`event=dynamic`）不受常规 cancel 控制；**本地 dispatch 是唯一的 workaround**

### 6.4 cron 密度与丢弃

GitHub 免费账户对密集 schedule（≤15 分钟间隔）会丢弃/合并触发。验证数据：
- 3 组 cron（7 分钟间隔）在 22h 窗口内只触发约 20 次，存在 2h20m 空白
- 改为 1 组 15 分钟 + 本地 dispatch 后，更新稳定性恢复
- 结论：GitHub Actions schedule 仅适合低频（≥30min）兜底；**高频靠本地 dispatch**

---

## 7 · 数据抓取相关踩坑汇总

以下为纯数据侧的踩坑（前端/Git 层面的见 `HD2项目上下文.md`）：

1. **变量复用**：循环变量 `d` 与外层 dict 同名 → 写盘时把 API 响应写进去。处理：写盘前核对变量，重要改动前先 commit。
2. **health 难度缩放**：`130 [Default] 160 at Challenging` 拼成 `130160` → 用 `parse_health` 解析。
3. **嵌套列表截断**：非贪婪正则遇到第一个 `</ul>` 就停 → 用深度计数 `extract_list_block`。
4. **表格列名不固定**：部位表/战备表的列名因 wiki 编辑变化 → 动态映射（COL_MAP）。
5. **id 切片残留标签**：`html.find('id="X"')` 从标签属性中间截断 → 先 `rfind("<h")` 回退。
6. **tactical 第三列语义**：不是难度是阵营 → 单独映射。
7. **valueType 语境差异**：不同 MO 类型 valueType 含义不同 → 按 `type` 分支解码。
8. **companion warTime**：不是 epoch 时间 → `clientTimeMs + (warTime − baseWarTime) × 1000` 换算。
9. **hd2dev 滞后**：dispatches 同步速度慢 → companion 优先。
10. **DSS 激活归零**：激活后 `current` 归零 → 不能用 `>= target` 判断。
11. **快照失效**：MO 切换瞬间随机——三源都空 → 保留快照过渡。
12. **翻译字段隔离**：news/major_order 被 fetch 覆盖 → 必须保留旧值。
13. **data.json 手动冲突**：手动 commit data.json 与 Actions 版本冲突 → 只保留远端。
14. **协作文件同步**：新增条目需同时更新 wiki JSON + roll JSON + loadout JSON + 计数。

---

## 8 · 快速参考

| 想查什么 | 看哪里 |
|---|---|
| 主站数据条目结构 | `E:\GitLoadWareHouse\Jerry114514.github.io\HD2-Galatic_war-Map\data.json` |
| 抓取主逻辑 | `scripts/fetch_site_data.py` 的 `main()` 函数（约 L520） |
| MO 解码方法 | `decodeTask()`（前端 index.html L1615）与 backend `assignments` 字段 |
| DSS 数据格式 | companion 返回的 `spaceStations` → `dss` |
| 翻译管线入口 | `C:\Users\37420\lobsterai\project\HD2Web-Trans\scripts\translator.py`（`main()`） |
| 术语表 | `术语表.txt`（386 条 `EN\|\|\|ZH`） |
| 调度脚本 | `C:\Users\37420\lobsterai\project\wake_workflows.py` |
| 本地 cron 控制 | OpenClaw gateway cron list / update (id= dcd4820b) |
| 工作流配置 | `.github/workflows/fetch-data.yml` + `translate_news.yml` + `push_to_page.yml` |
| 评分表源 | 桌面 `战备评分表.xlsx`（7 类目） |
| 设计总纲 | `HD2项目设计方案.md`（本地，gitignore） |
| 跨语境知识 | `HD2项目上下文.md`（本地，gitignore） |

---

*本文档为本地留档（已 gitignore，不随仓库同步）。聚焦数据抓取层的技术细节，与设计文档 / 上下文文档分工互补。*