# HD2 中文维基数据集 Schema（`HD2_Wiki/data/wiki/zh/`）

> 版本：v1 · 2026-09-17
> 适用范围：`HD2_Wiki/data/wiki/zh/` 及其子目录（`blocks/`、`mechanics/`、`fetch_reports/`）下的全部 JSON 数据文件。
> 目的：把跨数据集已经事实存在的字段与约定写死，消除「同一语义多个字段名」「野生字段」的问题。
> 强制程度：**本文件是唯一权威**。任何新增字段都必须先在本文件第 7 节登记，否则视为野生字段。

---

## 1. 目录与命名约定

| 约定 | 规则 |
| --- | --- |
| 根目录 | `HD2_Wiki/data/wiki/zh/`（中文数据集） |
| 数据集文件名 | 小写 snake_case：`weapons.json`、`enemies.json`、`stratagems_full.json`、`missions.json`、`boosters.json`、`warbonds.json`、`loadout.json`、`factions.json`、`index.json`、`ds_terms.json` |
| 子目录 | `blocks/`（首页区块，一区块一文件）、`mechanics/`（游戏机制长文，一页一文件）、`fetch_reports/`（抓取中间产物，**不属于数据集**，schema 不约束） |
| 中文覆盖文件 | `<同名主干文件去扩展名>_zh.json`，与主干文件同目录。见第 5 节 |
| 条目 `id` | **小写 snake_case**，同一数据集内唯一，由英文名派生（`Hellpod Space Optimization` → `hellpod_space_optimization`，`AR-2 Coyote` → `ar_2_coyote`） |
| 详情页 URL | `xxx.html?id=<id>`。`id` 一律 snake_case，不接受连字符与 `?b=` 等别名 |
| 图标/图片路径 | `icon` 用站内相对路径（相对 HTML 页所在目录，形如 `./assets/<数据集>/<文件名>.svg`）；`image` 用 wiki.gg 绝对 URL |
| 编码 | UTF-8 无 BOM。校验时用 `[IO.File]::ReadAllText()`，**不要**用 `Get-Content -Raw`（会乱码） |

---

## 2. 顶层（文档级）字段

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `updated_at` | string | 是 | 数据更新时间。canonical 为 UTC ISO8601 秒级：`YYYY-MM-DDTHH:MM:SSZ` |
| `source` | string | 是 | 数据来源文案。**wiki.gg 系数据统一写 `wiki.gg`**；非 wiki 来源写清出处（如 `战备评分表.xlsx（用户维护）+ wiki.gg 图标`） |
| `total` | number | 目录型数据集必填 | 主集合元素总数。**必须等于主集合数组长度**，目录页页眉的计数以此为准 |
| `<集合键>` | array | 是 | 主集合数组，见第 6 节 |

### 2.1 集合键（顶层数组）实测对照

| 文件 | 集合键 | 元素 |
| --- | --- | --- |
| `weapons.json` | `weapons` | 武器条目 |
| `enemies.json` | `enemies` | 敌人条目 |
| `stratagems_full.json` | `stratagems` | 战略配备条目 |
| `boosters.json` | `boosters` | 强化资源条目 |
| `warbonds.json` | `warbonds` | 战争债券条目 |
| `loadout.json` | `stratagems` | 配装器条目（与 `stratagems_full.json` 同 `id` 空间） |
| `missions.json` | `categories` → `categories[].tasks` | 两级：任务分类 → 任务 |
| `mechanics/*.json` | `sections`（可选 `toc`） | 两级：小节 → 子小节 |
| `factions.json` | `factions` | 阵营条目，另有单对象 `super_earth` |
| `index.json` | `blocks` | 首页区块引用（`id` + `type` + `priority`） |
| `blocks/*.json` | — | 单区块对象，无主集合 |
| `ds_terms.json` | — | 平铺 `英文原文 → 中文译文` 映射（特例，见第 7 节） |

---

## 3. 条目级公共字段

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 小写 snake_case，数据集内唯一。详情页入口 `?id=` |
| `name` | string | 是 | **中文**显示名 |
| `name_en` | string | 是 | 英文原名 |
| `icon` | string | 否 | 图标。优先站内相对路径；缺失时前端渲染占位符 |
| `image` | string | 否 | 大图/原图（wiki.gg 绝对 URL）。与 `icon` 并存时 `icon` 是小图标、`image` 是大图 |
| `description` | string | 否 | 英文原文简介（游戏内简介或页面首段短描述）。**英文正文长段落不落库**（见第 8 节决策） |
| `description_zh` | string | 否 | 中文简介 |
| `source_url` | string | 否 | 该条目对应的 wiki.gg 页面绝对 URL |
| `category` / `subcategory` | string | 否 | 分类键（小写 snake_case），配套 `category_label` / `subcategory_name` 给人读 |
| `unlock` / `unlock_zh` | string | 否 | 解锁条件原文 / 中文 |
| `related` | string[] | 否 | 相关条目 `id` 列表（跨条目引用，前端负责解析成链接） |
| `tags` / `traits` | string[] | 否 | 标签/特性，纯字符串数组 |
| `release_status` | `"released"` \| `"unreleased"` | 否 | **发布状态**。语义：`"released"` = 游戏内已可获取；`"unreleased"` = 已公布但尚未开放获取（价格/页数等通常同期为 `null`）。**缺省视为 `"released"`**，故已发布条目不必书写该字段。取值为**枚举字符串**，不用布尔、不用 `null` 表达「未知」。前端在 `"unreleased"` 时渲染「未发布」徽章，`price` / `price_zh` 的展示不受影响 |

---

## 4. 命名与取值约定

1. **snake_case 只用于机器字段名与 `id`**；给人读的键名（如 `loadout.json` 的 `types` 键、`category_label`）保留中文/英文原文。
2. **`X` = 英文原文，`X_zh` = 中文**。反过来（`X` 存中文、`X_zh` 存英文）是错误写法。
3. **数值字段**：能以数字表达的存 number（`price: 15`），带单位的展示值单独用 `_zh` 文案字段（`price_zh: "勋章 ×15"`）。`null` 表示**已知但未公布**，`""` 表示**确认无内容**，两者语义不同，不得混用。
4. **布尔字段**用真正的 `true`/`false`，不用 `"Yes"`/`"No"`（历史遗留见第 8 节）。
5. **时间**：只有文档级 `updated_at`；不要在条目级新增时间字段（如确有需要，先在第 7 节登记）。
6. **单位与术语汉化**只允许在展示值里做（`200 Fire` → `200 火焰`），**数值本身不得改动、不得四舍五入、不得推算**。

---

## 5. `_zh` 回退规则

### 5.1 字段级回退（同一文件内）

渲染时按 `item[field + "_zh"] || item[field]` 取值：

```
name      = item.name_zh || item.name
describe  = item.description_zh || item.description
warbond   = item.warbond_zh || item.warbond
```

- 回退**只用于展示**，不得把回退结果写回 JSON。
- `_zh` 字段必须与主字段**同结构、同语义**。
- 前端空值判定统一用 `|| `（对 `""`、`null`、`undefined` 一律回退），但 `0` 与 `false` 是合法值，取数时不要用 `||` 兜底数字（如 `price`）。

### 5.2 整文档级覆盖（`mechanics/`）

`mechanics/<id>.json` 为英文正文，`mechanics/<id>_zh.json` 为中文覆盖文件：

| 覆盖文件字段 | 说明 |
| --- | --- |
| `title_zh` | 覆盖 `title` |
| `description_zh` | 覆盖 `description` |
| `sections_zh` | 覆盖 `sections`；元素为 `{ title_zh, content_zh, subsections_zh[] }`，可递归一层 |

- 存在 `sections_zh` 时**整篇以覆盖文件为准**，不回退混排；不存在时整篇用英文主干。
- 覆盖文件的字段名**一律带 `_zh` 后缀**，不带后缀的字段在覆盖文件中无意义。
- 覆盖文件的 `title_zh` 会按 `replace(/[\s\u4e00-\u9fff]+/g, '_')` 生成锚点 `id`，故 `sections_zh` 的顺序即页面目录顺序。

---

## 6. 数组元素结构

| 结构名 | 形状 | 使用位置 |
| --- | --- | --- |
| 表格 | `{ headers: string[], rows: string[][] }`，可加 `title` / `title_en` / `note` | `boosters.json` 的 `tables` |
| 分节正文 | `{ title: string, items: string[] }` | `boosters.json` 的 `sections`；`blocks/beginners.json` 的 `sections` |
| 长文小节 | `{ level: 2\|3\|4, id: string, title: string, content: string, subsections: [] }` | `mechanics/*.json` |
| 部位 | `{ part_id, name, name_en, health, armor_level, location, ... }` | `enemies.json` 的 `body_parts` |
| 攻击/弹丸 | `{ name, type, projectile{}, damage{}, penetration{}, special_effects{} }` | `*.detailed_stats.attacks` |
| 变体 | `{ name, name_en, description, unlock }` | `weapons.json` 的 `variants` |
| 首页区块 | `{ id, type, priority }` | `index.json` 的 `blocks` |
| 导航分类 | `{ name, icon, description, link, count }` | `blocks/navigation.json` 的 `categories` |

**表格渲染约定（`tables`，见第 7.1 节）** 是唯一允许「行列不等长」的结构，规则随字段一起登记。

---

## 7. 扩展字段登记表（各数据集独有字段）

> 新增任何字段前先在此登记：字段名 / 类型 / 说明 / 出现文件。未登记的字段一律视为野生。

### 7.1 `boosters.json`

**公共字段**：`id`、`name`、`name_en`、`icon`、`description`、`description_zh`、`source_url`、`related`（第 3 节）。

**扩展字段**：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `warbond` | string | 是 | 所属战争债券英文名（`Helldivers Mobilize`） |
| `warbond_zh` | string | 是 | 所属战争债券中文名（`绝地潜兵总动员！`） |
| `warbond_page` | number \| null | 是 | 债券内页码；未公布为 `null` |
| `warbond_color` | string | 是 | 债券主题色 `#RRGGBB`，用于卡片左侧色条与标签描边 |
| `price` | number \| null | 是 | 勋章价格；未公布为 `null` |
| `price_zh` | string | 是 | 价格展示文案。有价时 `勋章 ×15`；未公布为 `待发布` |
| `overview_zh` | string | 是 | 中文简介（详情页「📖 简介」卡片） |
| `sections` | array | 是 | 分节正文，元素 `{ title: string, items: string[] }`；空数组表示无分节 |
| `tables` | array | 是 | 数值表，元素结构见下；**空数组表示该条目确认无数值表** |

**`tables[]` 元素结构（本 schema 唯一允许行列不等长的结构）**：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | string | 是 | 中文表名（展示用） |
| `title_en` | string | 否 | 页面原文表名/表头，便于回溯核对 |
| `note` | string \| null | 否 | 表格注释（通常取自表格前后的说明句） |
| `headers` | string[] | 是 | 列头。**长度即列数** |
| `rows` | string[][] | 是 | 数据行，**元素一律为字符串**（数字也存字符串，保持零解析渲染） |

**`rows` 渲染约定**（对应 wiki 表格的 `colspan`，三档判定，前端按此渲染）：

1. `headers.length >= 2` → `headers` 是真列头；`rows` 中长度等于 `headers.length` 的行为数据行，**长度更小的行为分组标题行**（横跨整行）；
2. `headers.length === 1` → 该行是 wiki 的 `colspan` 跨列表题（表头即表名），渲染为横跨整行的标题条；`rows` 中长度为 1 的行为分组标题行，长度为 2 的行为键值行；
3. `headers.length === 0` → 无表头，`rows` 原样按各行列数渲染。

> 分组合并（`rowspan`）在抓取阶段已展开为重复值，本 schema 不保留 `rowspan` 语义。

### 7.2 `warbonds.json`

**公共字段**：`id`、`name`、`name_en`、`icon`、`release_status`（第 3 节）；`description` / `description_zh` **不使用**（本数据集用 `intro_zh` / `overview_zh`，见下）。

**扩展字段**：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | `"Standard"` \| `"Premium"` \| `"Legendary"` | 是 | 债券类别。**保留英文原文**（机器字段），中文由前端映射（标准／高级／传奇） |
| `price` | number | 是 | 解锁价格（超级货币）。标准债券为 `0` |
| `price_zh` | string | 是 | 价格展示文案。标准债券 `免费`；其余 `超级货币 ×1000` / `×1500` |
| `release_date` | string | 是 | 发行日期，`YYYY-MM-DD`。**本数据集特例**：条目级日期字段在此登记后允许使用（第 4 节第 5 条的例外），值一律取自 wiki.gg 各债券页面 infobox 的 `date` |
| `pages` | number | 是 | 债券总页数 |
| `credit_claim` | number | 是 | 债券内含的超级货币总额；`0` 表示确认无 |
| `credit_claim_zh` | string | 是 | 上者的展示文案（`无` / `超级货币 ×300`） |
| `name_zh_tbd` | boolean | 是 | **译名待定标记**。`true` = 站内与官方中文均无既有译法，`name` 保留英文。前端据此渲染「译名待定」徽章。**2026-09-17 补译 9 条后，25 条全部为 `false`** |
| `intro_zh` | string | 是 | 中文简介（详情页标题卡；总览页仅用于搜索匹配，不再直接展示） |
| `overview_zh` | string | 是 | 中文概述（详情页「📖 简介」卡片）。含页数与勋章价格区间 |
| `tables` | array | 是 | **逐页奖励表**：一个元素 = 债券的一页。结构见下 |
| `reward_refs` | object | 否 | **奖励 → 站内条目引用表**（2026-09-17 登记；同日扩展 `booster`）。键 = `tables[].rows[i][0]`，值 = `{ kind, id }`；只登记能唯一匹配上 `weapons.json` / `stratagems_full.json` / `boosters.json` 的奖励。结构见下 |

**`tables[]` 元素结构**：沿用第 6 节的表格结构（`title` / `title_en` / `note` / `headers` / `rows`），并约定：

| 约定 | 说明 |
| --- | --- |
| 一页一表 | `tables` 的元素顺序 = 页码顺序（第 1 页在前）。元素个数 = `pages` |
| `title` / `title_en` | `第 N 页` / `Page N` |
| `headers` | 固定 `["奖励", "类型", "勋章价格"]`，长度 3 → 按第 6 节判定为真列头 |
| `rows[i]` | `[奖励英文名, 奖励类型中文, 勋章价格数字字符串]` |
| 单价缺失 | wiki 页面未印出单个奖励的勋章价格时写 `"—"`，**不推算、不补算**。目前仅 `Ironclad_Democracy_Premium_Warbond` 等 4 个使用手工 wikitable 的债券页面如此 |
| 奖励类型 | 4 个使用 wikitable 的债券页带 Type 列，直接照录；其余 21 个使用 `{{Acquisitions Page}}` 网格模板、**渲染页无 Type 列**，类型由奖励渲染图文件名推断（`… Primary Render` → 主武器 等），推断规则与回退桶在抓取报告中登记 |
| 行序 | 网格模板按渲染页的 `grid-row` / `grid-column` 还原为阅读顺序；wikitable 保持原表行序 |

**`reward_refs` 结构（2026-09-17 登记；`kind` 取值 2026-09-17 扩展 `booster`）**：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| 键 | string | — | 奖励英文名，必须与 `tables[].rows[i][0]` **逐字一致**（不做归一化，按原文匹配） |
| `kind` | `"weapon"` \| `"stratagem"` \| `"booster"` | 是 | 目标数据集：`weapons.json` / `stratagems_full.json` / `boosters.json` |
| `id` | string | 是 | 目标条目的 `id`；前端拼成 `weapon.html?id=<id>` / `stratagem.html?id=<id>` / `booster.html?id=<id>` |

- **`kind: "booster"`**：仅用于 `tables[].rows[i][1] === "强化资源"` 的行，`id` 指向 `boosters.json` 的条目，链接目标为 `booster.html?id=<id>`，链接中文名实时取自 `boosters.json` 的 `name`。登记方式为该行英文名与 `boosters.json` 的 `name_en` **精确相同**（当前 25 个债券中共 20 条强化资源行，20 条全部命中）。
- **匹配规则（按序，命中即止）**：① 奖励英文名与站内 `name_en` 精确相同；② 去掉标点/空格、转小写后与 `name_en` 相同；③ 同样归一化后与站内 `name`（中文）相同；④ 归一化后一方完整包含另一方、且候选唯一（当前仅 4 条：`Directional Shield`、`Flame Sentry`、`Anti-Tank Emplacement`、`Portable Hellbomb`）。
- **匹配不上一律不登记**（保持纯文本），不猜、不造 `id`。跨数据集同时命中（歧义）也不登记。
- 「中文译名一律不冗余写进本文件」：前端在 `warbond.html` 实时从 `weapons.json` / `stratagems_full.json` / `boosters.json` 的 `name` 解析，保证译名单一来源；解析不到时回退显示原文奖励名。
- `rows` 元素**恒为 3 个**（第 6 节表格结构不变），引用只能走本字段，**禁止**往 `rows[i]` 追加第 4 个元素（会破坏第 6 节的列数判定）。
- 键是奖励英文名，若日后重抓导致奖励文案变动，须同步改键名。

> 顶层 `total` 必须等于 `warbonds` 数组长度。图标为 `./assets/warbonds/<wiki File 名>.png`（本站下载，不热链）。

### 7.3 `weapons.json`

`category`、`subcategory`、`subcategory_name`、`stats_short{ damage, capacity, penetration }`、`stats_full{}`、`traits[]`、`unlock`、`lore`、`variants[]`、`tips[]`、`detailed_stats{}`。顶层另有 `categories{}`（分类元数据）。

### 7.4 `enemies.json`

`name_zh`（**遗留反向命名**，见第 8 节）、`faction`、`faction_label`、`image`、`category`、`health_total`、`damage`、`damage_type`、`fire_damage_multiplier`、`stagger_threshold`、`minimum_difficulty`、`body_parts[]`（含 `part_id` / `armor_level` / `location` / `durable` / `percent_to_main` / `overflow_cap` / `constitution` / `fatal` / `is_weak_point` / `count` / `armor_level_zh` / `location_zh`）。

### 7.5 `stratagems_full.json`

`category`、`category_label`、`code`、`call_in_time`、`cooldown`、`uses`、`unlock`、`unlock_zh`、`image`、`icon`、`detailed_stats{}`（含 `attacks[]`）、`source_page`（**遗留字段名**，等价于公共 `source_url`）。

### 7.6 `missions.json`

顶层 `categories[]`；`tasks[]` 元素：`id`、`name`、`name_zh`、`icon`、`difficulty` / `difficulty_zh`、`faction`、`time_limit` / `time_limit_zh`、`steps[]` / `steps_zh[]`、`tactical_info` / `tactical_info_zh`。

### 7.7 `mechanics/*.json`

`id`、`title`、`title_en`、`description`、`sections[]`、`toc[]`（`{ level, id, title }`）。中文覆盖文件见第 5.2 节。

### 7.8 `loadout.json`

顶层 `types{}`（`类型名 → { dim4: 第四维名称 }`）；`stratagems[]` 元素：`id`、`name`、`type`、`stats[4]`（number 数组，四维评分）、`bonus`、`subtag[]`、`icon`。

### 7.9 `factions.json`

顶层 `factions[]`：`id`、`name`、`name_zh`、`color`、`strains[]`（`{ name, name_zh, enemies[] }`）、`enemies[]`（id 列表）；另有单对象 `super_earth`（`{ name_zh, enemies[], color }`）。

### 7.10 `index.json` / `blocks/*.json`

- `index.json`：`id`、`title`、`subtitle`、`blocks[]`（`{ id, type, priority }`）。
- `blocks/*.json`：`id`、`type`（`blocks/*` 中 `type` 仅 `index.json` 的引用项使用，区块文件本身可省略）、`title`、`subtitle`、`content`、`buttons[]`（`{ text, link }`）、`updated_at`。
- `blocks/welcome.json`：另用 `subtitle`、`buttons[]`。
- `blocks/about.json`：另用 `content`（纯文本段落）、`features[]`（字符串数组）。**无 `type` 字段**。
- `blocks/beginners.json`：另用 `sections[]`（**与 `boosters.json` 的 `sections` 同构**：`{ title, items[] }`）。**无 `type` 字段**。
- `blocks/navigation.json`：另用 `categories[]`（`{ name, icon, description, link, count }`）；`count` 必须与目标页实际条目数一致。

### 7.11 `ds_terms.json`（特例）

平铺 `map<string, string>`：键为英文原文（含数值与单位，如 `0.349999994 sec`），值为统一译文（`0.349999994 秒`）。**无 `id`、无 `updated_at`**，不参与 `?id=` 路由，仅供文本替换。

---

## 8. 已登记的历史不一致（未对齐，禁止照抄进新数据）

| 位置 | 现状 | canonical | 处理 |
| --- | --- | --- | --- |
| `enemies.json`、`missions.json` 的 `tasks` | `name` 存**英文**，中文在 `name_zh` | `name` = 中文、`name_en` = 英文 | 未迁移。前端按 `name_zh \|\| name` 取值，新数据不得沿用 |
| `stratagems_full.json` | `source_page` | `source_url` | 未迁移 |
| `weapons.json`、`enemies.json`、`stratagems_full.json` | `icon`/`image` 直接引 wiki.gg 绝对 URL | `icon` 用站内相对路径 | 未迁移 |
| `stratagems_full.json`、`loadout.json` | 条目字段顺序/缩进不统一（`icon` 出现在末尾） | — | 仅风格问题，不影响解析 |
| `weapons.json` | `related` 是 `{}` 对象 | `related` = `string[]` | 未迁移 |
| `enemies.json` | `fatal` / `is_weak_point` 混用布尔与字符串 | 布尔 | 前端两者都判 |
| `factions.json` | `updated_at` 为 `YYYY-MM-DD` | 秒级 ISO8601 | 未迁移 |
| `mechanics/difficulty.json` 等 | `content` / `content_zh` 内嵌原始 HTML 片段（`<ul>`/`<br>`/`<strong>`） | — | 长文正文允许内嵌 HTML，属于登记在案的例外（`mechanics/*.json` 与 `mechanics/*_zh.json` 均适用） |
| 全数据集 | 部分文件 `source` 为 `Helldivers Wiki.gg` / `https://helldivers.wiki.gg` | `wiki.gg` | 新数据与本次修订后的 `boosters.json` 统一写 `wiki.gg` |

---

## 9. 落地决策（记录在案，不得擅自更改）

1. **英文正文长段落不落库**：只保留 `description`（游戏内短简介/英文首句）与 `description_zh`，不抓取 wiki 英文条目的整段正文。
2. **数值以渲染页为准**：抓取必须基于**渲染后的页面 DOM**（`browser_open` + `browser_execute` 遍历），不得使用 `action=parse&prop=wikitext`——模板/Lua 生成的表格在 wikitext 里只剩占位符，会整表丢失。
   - **例外（2026-09-17 登记，仅限 `warbonds.json`）**：`action=parse&prop=text` 返回的**渲染后 HTML** 与浏览器 DOM 等价，允许使用；但**禁止**用 `action=parse&prop=wikitext`。实测各债券页的 `{{Acquisitions Page}}` 网格在 wikitext 里只剩 `|N_cost =`（该值是**视觉排布序号**，不是勋章价格），照抄会写入错误数据；同一文件的 4 个手工 wikitable 债券（如 `Ironclad_Democracy_Premium_Warbond`）其 wikitable 行文完整，因此**同一数据集内两种来源并存，必须以渲染页为准**。
3. **`tables` 的一行一列都必须能回溯到渲染页**：不补算、不插值。
   - **唯一例外（2026-09-17 登记）**：wiki 模板渲染出的**完全相同的重复行**（已确认为模板 bug，非数据）允许删除，删除后 `tables[].note` 中不留「原页面此行重复」一类说明。已按此修订 `boosters.json` 的 `stun_pods`、`firebomb_hellpods` 各 1 行 `Status`。
4. **数据缺失用 `null`/空数组表达**，不用「暂无」「待补充」等文案占位（`price_zh` 的 `待发布` 是展示文案字段，不是数据字段）。

---

## 10. 校验清单

新增或修改数据集后逐条自检：

1. JSON 可被 `[IO.File]::ReadAllText($p)` + `ConvertFrom-Json` 解析（**不要用 `Get-Content -Raw`**）。
2. `total` == 主集合长度。
3. 所有 `id` 满足 `^[a-z0-9_]+$` 且数据集内唯一。
4. 所有 `icon` 指向的文件真实存在（站内相对路径）。
5. `source_url` / `source_page` 均为 `https://helldivers.wiki.gg/wiki/<英文名下划线>`。
6. `_zh` 字段与主字段结构一致。
7. 新增字段已在本文件第 7 节登记。
8. 目录页 20/25/89/95… 等卡片数与 `blocks/navigation.json` 的 `count`、以及与数据集 `total` 一致，无外站引用。
