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
| 数据集文件名 | 小写 snake_case：`weapons.json`、`enemies.json`、`stratagems_full.json`、`missions.json`、`boosters.json`、`loadout.json`、`factions.json`、`index.json`、`ds_terms.json` |
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

### 7.2 `weapons.json`

`category`、`subcategory`、`subcategory_name`、`stats_short{ damage, capacity, penetration }`、`stats_full{}`、`traits[]`、`unlock`、`lore`、`variants[]`、`tips[]`、`detailed_stats{}`。顶层另有 `categories{}`（分类元数据）。

### 7.3 `enemies.json`

`name_zh`（**遗留反向命名**，见第 8 节）、`faction`、`faction_label`、`image`、`category`、`health_total`、`damage`、`damage_type`、`fire_damage_multiplier`、`stagger_threshold`、`minimum_difficulty`、`body_parts[]`（含 `part_id` / `armor_level` / `location` / `durable` / `percent_to_main` / `overflow_cap` / `constitution` / `fatal` / `is_weak_point` / `count` / `armor_level_zh` / `location_zh`）。

### 7.4 `stratagems_full.json`

`category`、`category_label`、`code`、`call_in_time`、`cooldown`、`uses`、`unlock`、`unlock_zh`、`image`、`icon`、`detailed_stats{}`（含 `attacks[]`）、`source_page`（**遗留字段名**，等价于公共 `source_url`）。

### 7.5 `missions.json`

顶层 `categories[]`；`tasks[]` 元素：`id`、`name`、`name_zh`、`icon`、`difficulty` / `difficulty_zh`、`faction`、`time_limit` / `time_limit_zh`、`steps[]` / `steps_zh[]`、`tactical_info` / `tactical_info_zh`。

### 7.6 `mechanics/*.json`

`id`、`title`、`title_en`、`description`、`sections[]`、`toc[]`（`{ level, id, title }`）。中文覆盖文件见第 5.2 节。

### 7.7 `loadout.json`

顶层 `types{}`（`类型名 → { dim4: 第四维名称 }`）；`stratagems[]` 元素：`id`、`name`、`type`、`stats[4]`（number 数组，四维评分）、`bonus`、`subtag[]`、`icon`。

### 7.8 `factions.json`

顶层 `factions[]`：`id`、`name`、`name_zh`、`color`、`strains[]`（`{ name, name_zh, enemies[] }`）、`enemies[]`（id 列表）；另有单对象 `super_earth`（`{ name_zh, enemies[], color }`）。

### 7.9 `index.json` / `blocks/*.json`

- `index.json`：`id`、`title`、`subtitle`、`blocks[]`（`{ id, type, priority }`）。
- `blocks/*.json`：`id`、`type`（`blocks/*` 中 `type` 仅 `index.json` 的引用项使用，区块文件本身可省略）、`title`、`subtitle`、`content`、`buttons[]`（`{ text, link }`）、`updated_at`。
- `blocks/welcome.json`：另用 `subtitle`、`buttons[]`。
- `blocks/about.json`：另用 `content`（纯文本段落）、`features[]`（字符串数组）。**无 `type` 字段**。
- `blocks/beginners.json`：另用 `sections[]`（**与 `boosters.json` 的 `sections` 同构**：`{ title, items[] }`）。**无 `type` 字段**。
- `blocks/navigation.json`：另用 `categories[]`（`{ name, icon, description, link, count }`）；`count` 必须与目标页实际条目数一致。

### 7.10 `ds_terms.json`（特例）

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
3. **`tables` 的一行一列都必须能回溯到渲染页**：不补算、不插值、不删除页面里真实存在的重复行。
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
8. 目录页 20/89/95… 等卡片数、内链数与 `total` 一致，无外站引用。
