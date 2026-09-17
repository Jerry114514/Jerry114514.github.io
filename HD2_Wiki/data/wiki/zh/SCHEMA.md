# HD2 中文维基数据集 Schema（`HD2_Wiki/data/wiki/zh/`）

> 版本：v1.4 · 2026-09-17（v1.4 修订 §8/§9：`galactic_war.json` 孤立 `</div>` 已修（正文 73 px → 880 px）、四个机制页主干表格图标尺寸已解决后的复核、`galactic_war_zh.json` / `status_effects_zh.json` 已改为逐节显式 `id`、`figures_zh` 首次投入实战；并新登记 §9 第 9/10/11 条）
> 版本：v1.3 · 2026-09-17（v1.3 在 §5.2.2 登记 `fully_translated` 字段：整节翻译完成后不再渲染「📄 英文原文」`<details>` 兜底块；并同步修订 §5.2.3 与 §9 第 5 条）
> 版本：v1.2 · 2026-09-17（v1.2 登记 §1 图片路径约定、§8 两行新不一致、§9 第 6/7 条：机制页主干图片本地化方案与表格模板图标尺寸问题）
> 版本：v1.1 · 2026-09-17（v1.1 修订 §5.2：`mechanics/` 从「整篇覆盖」改为「小节级合并」，并重写锚点 id 规则）
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
| 图标/图片路径 | `icon` 用站内相对路径（相对 HTML 页所在目录，形如 `./assets/<数据集>/<文件名>.svg`）；`image` 用 wiki.gg 绝对 URL。**`mechanics/*.json` 主干 `content` 内的 `<img>` 也一律用站内相对路径**（形如 `./assets/mechanics/<页 id>/<文件名>`，见第 9 节第 6 条） |
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

### 5.2 小节级合并（`mechanics/`）—— 2026-09 起的新模型

`mechanics/<id>.json` 为**英文主干**，`mechanics/<id>_zh.json` 为**中文覆盖文件**。二者在**小节级别**合并，而不是整篇二选一。

#### 5.2.1 两侧各提供什么

| 来源 | 提供 | 说明 |
| --- | --- | --- |
| 主干 `<id>.json` | 文档级 `id` / `title` / `title_en` / `description` / `source`；小节级 `level` / `id` / `title` / `content`（内嵌 HTML）/ `subsections[]` | **锚点 id 的唯一权威**；表格（`<table>`）与图片（`<figure>` / 含 `<img>` 的容器）也只在主干里 |
| 覆盖 `<id>_zh.json` | 文档级 `title_zh` / `description_zh`；小节级 `title_zh` / `paragraphs_zh[]` / `content_zh` / `tables_zh[]` / `figures_zh[]` / `subsections_zh[]` | 只提供中文；字段名一律带 `_zh` 后缀（`id` / `target_id` 例外，见 5.2.3） |

#### 5.2.2 覆盖文件字段规范

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title_zh` | string | 否 | 覆盖该小节标题 |
| `paragraphs_zh` | string[] | 否 | 中文段落，逐段渲染为 `<p>`。**覆盖主干散文**，但不动主干表格/图片 |
| `content_zh` | string | 否 | 中文正文 HTML 片段。优先级高于 `paragraphs_zh`；内嵌 `<a>` 会被降级为纯文本（中文页无对应目标） |
| `tables_zh` | array | 否 | 覆盖该小节的表格。元素为第 6 节表格结构 `{ title, headers, rows, note }`，或 `{ html: "<table>…</table>" }` |
| `figures_zh` | array | 否 | 覆盖该小节的图片。元素为 `{ html }` 或 `{ src, alt, caption_zh }` |
| `id` / `target_id` | string | 否 | **显式声明本文对应主干的哪个小节**（值为主干 `id`）。强烈建议逐节书写，这是唯一无歧义的对齐方式 |
| `fully_translated` | boolean | 否 | **整节翻译完成标记**。`true` = 该小节主干的**英文散文**已被中文完整覆盖，前端**不再**渲染该小节的「📄 英文原文」`<details>` 兜底块；**缺省 / `false` = 行为不变**，仍按 §5.2.3 保留折叠块。语义边界见下 |
| `subsections_zh` | array | 否 | 子节，元素同本表，可递归 |

**`fully_translated` 语义边界（2026-09-17 登记）**：

1. 它声明的只是**散文**（`content` 里的 `<p>` / `<ul>` / `<ol>` / 模板 `msgbox` 文字等）已被中文覆盖，**不包括**表格与图片——这两类本来就由 §5.2.3 无条件保留，与是否 `fully_translated` 无关。
2. 它只是**前端渲染开关**，不改变任何合并优先级：`content_zh` / `paragraphs_zh` 仍然照常覆盖主干散文；未被覆盖（本节没有 `content_zh` / `paragraphs_zh`）时该字段**不产生任何效果**（本来也不会渲染 `trunkRefHtml`）。
3. **必须逐节书写于「覆盖文件」一侧**，且必须是 JSON 布尔 `true`（不是 `"true"`）。主干（`<id>.json`）里不出现该字段。
4. **只做减法、不做加法**：它为 `true` 时唯一的效果是不渲染折叠块；渲染折叠块与否则完全由它决定，不参与锚点 id、配对、表格/图片保留的任何逻辑。
5. 使用它的前提是**「主干该节英文散文的全部事实点都已在中文正文里有对应表述」**，写之前必须逐条核对；漏译的内容在标记后将不再出现在页面上。因此它是「译完之后的完工标记」，不是「正在翻译」的开关。
6. 判定为**不适合译入正文**的内容（英文外部引用、`msgbox` 模板维护提示、wiki 导航模板 Navbox 等）不构成「未覆盖」的反例：只要它们是**该节主干散文的全部残留**，仍可标记为 `true`，但必须在对应数据集的说明或提交说明里逐条写明被舍弃的是什么、为什么。若该节还残留**正文级事实**未译，则**不得**标记。
7. **`fully_translated` 管不到「图片块」**（2026-09-17 实测补记）：合并引擎把「含 `<img>` 的 `<p>` / `<div>`」整体归入**图片块**（§5.2.3「小节图片」行），图片块**永远渲染在正文里**，不进 `<details>`。因此当主干把**英文散文**放在带行内图标的 `<p>`（如 `Armor_AP4_Icon.png` 夹在句子里）或带图标的 `msgbox` 里时，这段英文既不进折叠块、也不受 `fully_translated` 约束，`fully_translated: true` 后仍会**留在正文**，与新的中文正文形成「同一件事说两遍」。实测 `damage.json` 有 4 处（`Explosion_Damage` / `Examples_of_Damage_to_a_Durable_Part` / `Squishy_Enemy_Parts` / `Status_Strength_.26_Thresholds`）。**处理办法（不改引擎，避免影响其它页）**：在覆盖小节写 `figures_zh: []`（= 该节确认无图片），丢弃这几个「实为散文的图片块」；前提是这些图标承载的语义（如「轻甲穿透 AP2」「无护甲 AV0」）已在中文正文里用文字写出。判定方法与 `fully_translated` 一样：图标的语义必须有中文对应表述。

#### 5.2.3 合并优先级与回退规则

| 内容 | 优先级（左高右低） | 回退行为 |
| --- | --- | --- |
| 文档标题 | `_zh.title_zh` → 主干 `title` → 主干 `title_en` | — |
| 文档简介 | `_zh.description_zh` → 主干 `description` | — |
| 小节标题 | 覆盖 `title_zh` → 主干 `title` | 未覆盖则显示英文标题 |
| 小节散文 | 覆盖 `content_zh` → 覆盖 `paragraphs_zh` → 主干 `content` 的散文块 | 覆盖生效时，主干英文散文**不丢弃**，折进该小节的「📄 英文原文」`<details>` 内；**但覆盖小节写了 `fully_translated: true` 时不再渲染该 `<details>`**（见 §5.2.2） |
| 小节表格 | 覆盖 `tables_zh` → 主干 `content` 内的 `<table>`（含被 `<div>` 包裹的） | **未覆盖必定保留主干表格**；宽表渲染在横向滚动容器内 |
| 小节图片 | 覆盖 `figures_zh` → 主干 `content` 内的 `<figure>` / 含图容器 | **未覆盖必定保留主干图片** |
| 小节结构 | 主干 `subsections` 为骨架；覆盖多出的 `subsections_zh` 追加为其父节末尾的子节 | 主干有、覆盖没有的小节 → 整节保持英文主干内容（含表格/图片） |

- 覆盖文件**缺失或 JSON 解析失败**时，整页回退为英文主干（不报错、不空白）。
- 覆盖文件里出现但主干没有的小节，**一律不丢弃**：作为 L2 小节追加到页面末尾，并在 console 给出 `zhOnly` 警告，提示下一步用 `id` 显式声明。
- 同一小节内的表格/图片按内容指纹去重（防止「容器 + 内层」重复渲染）；**不跨小节去重**（同类图标在不同小节重复出现是正常的）。

#### 5.2.4 小节配对规则（无 `id` 时）

1. 覆盖小节写了 `id` / `target_id` 且命中主干 `id` → 直接配对，忽略序号；
2. 其余按**序号一一对应**，直到某一侧先耗尽；
3. 多出的中文小节追加到父节末尾；主干多出的小节保持英文。

> **为什么不自动做「编辑距离/diff 对齐」**：实测 `damage_zh.json` 的 `Damage Calculation` 下主干 16 节、中文 18 节（中文多出「拆毁值与结构」「其他结构」且缺 ExDR 一节）。「整体平移 2 位」与「按下标对齐」在纯字符串距离下几乎等价，而只有后者与数据书写顺序一致。自动平移会让中文散文整体错位贴到相邻小节上（标题与内容对不上），比「多出的两节挂到父节末尾」有害得多。**要消除歧义只能写 `id`。**

#### 5.2.5 锚点（TOC）id 规则 —— 2026-09 修正

1. 小节 id 取**主干 `id`**；覆盖小节没有对应主干时取覆盖的 `id` / `target_id` / `title_zh`；
2. 经 `slugId()` 净化：保留 `[A-Za-z0-9._-]`，**中文与空白、标点一律替换为 `-`**（中文可正常作为锚点），折叠连续 `-`，去首尾 `-`，超长截断到 72 字符；
3. 净化后为空或只剩 `_` → 按出现顺序生成 `s-1`、`s-2`…；
4. 全页**去重**：重复的追加 `-2`、`-3`…；
5. **禁止**出现 `_` 这种退化 id、**禁止**重复 id；TOC 的 `href="#<id>"` 与正文 `id="<id>"` 一一对应（由同一个合并结果生成，不会脱钩）。

> **历史说明（变更原因，2026-09）**：旧规则用 `title_zh.replace(/[\s\u4e00-\u9fff]+/g, '_')` 生成 id，把**纯中文标题整体替换成 `_`**。实测 4 个机制页里 26 个小节中有 18 个 id 退化为 `_`，TOC 里所有纯中文项都指向 `#_`（点哪个都跳第一节），并产生重复 id。新规则按上面 1–5 执行。

---

## 5.3 旧规则（作废，仅留档）

> 以下为 2026-09 之前 `SCHEMA.md` §5.2 的原文，**已作废，不要照此实现**：
>
> - 存在 `sections_zh` 时**整篇以覆盖文件为准，不回退混排**；不存在时整篇用英文主干。
> - 覆盖文件的字段名一律带 `_zh` 后缀，不带后缀的字段在覆盖文件中无意义。
> - 覆盖文件的 `title_zh` 会按 `replace(/[\s\u4e00-\u9fff]+/g, '_')` 生成锚点 `id`，故 `sections_zh` 的顺序即页面目录顺序。
>
> **作废原因（2026-09）**：「整篇以覆盖文件为准」导致 `mechanics/damage.json`（91 KB，含 6 张表）被 `damage_zh.json`（9 KB，只有散文）整段顶掉——伤害页实测**表格 0 张、图片 0 张、正文 2,605 字符**，而主干本有 6 张表。同时 `_` 锚点 id 使 TOC 全部失效（见 5.2.5 历史说明）。新模型改为**按小节合并 + 表格/图片优先保留**，并把锚点 id 改为稳定且唯一。

---

## 6. 数组元素结构

| 结构名 | 形状 | 使用位置 |
| --- | --- | --- |
| 表格 | `{ headers: string[], rows: string[][] }`，可加 `title` / `title_en` / `note` | `boosters.json` 的 `tables`；`mechanics/*_zh.json` 的 `tables_zh` |
| 分节正文 | `{ title: string, items: string[] }` | `boosters.json` 的 `sections`；`blocks/beginners.json` 的 `sections` |
| 长文小节（主干） | `{ level: 2\|3\|4, id: string, title: string, content: string, subsections: [] }` | `mechanics/*.json` |
| 长文小节（中文覆盖） | `{ id?, target_id?, title_zh?, paragraphs_zh?, content_zh?, tables_zh?, figures_zh?, subsections_zh? }` | `mechanics/*_zh.json`，见第 5.2 节 |
| 图片块（覆盖） | `{ html: string }` 或 `{ src, alt, caption_zh }` | `mechanics/*_zh.json` 的 `figures_zh` |
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

**主干 `<id>.json`（英文）**：`id`、`title`、`title_en`、`description`、`sections[]`、`toc[]`（`{ level, id, title }`）、`updated_at`、`source`。

`sections[]` 元素（**锚点 id 与表格/图片的唯一来源**）：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `level` | 2 \| 3 \| 4 | 是 | 渲染为 `<h2>` / `<h3>` / `<h4>` |
| `id` | string | 是 | 锚点 id 权威值。允许 `[A-Za-z0-9._-]`（wiki 派生的 `Percent_.28.25.29_to_Main` 这类含 `.` 的也算合法） |
| `title` | string | 是 | 英文标题 |
| `content` | string | 是 | 小节自有正文（内嵌 HTML，含 `<table>` / `<figure>`）；子节正文在 `subsections` 里，不重复 |
| `subsections` | array | 否 | 子节，元素同本表 |

**覆盖 `<id>_zh.json`（中文）**：`title_zh`、`description_zh`、`sections_zh[]`。
`sections_zh[]` 元素字段（`title_zh` / `paragraphs_zh` / `content_zh` / `tables_zh` / `figures_zh` / `subsections_zh` / `id` / `target_id`）与合并规则见 **第 5.2 节**。

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
| `mechanics/*_zh.json`（2026-09 实测，v1.4 已部分迁移） | **小节层级与主干不一致，且没有 `id` 声明**，只能按序号配对：`damage` 主干 `Damage Calculation` 下 16 节 / 中文 18 节（中文多「拆毁值与结构」「其他结构」、缺 ExDR）；`status_effects` 主干 11 节 / 中文 10 节（缺 `Change History`）；`galactic_war` 主干 5 节 / 中文 6 节且结构完全不同 | 每个覆盖小节写 `id`（= 主干 `id`），层级与主干对齐 | **`status_effects_zh.json` / `galactic_war_zh.json` 已于 2026-09-17 逐节补写 `id` / `target_id`**（`galactic_war` 的 24 个月度子节亦全部显式列名，防止「只译其中几个月」时序号回退错位）；`damage_zh.json` / `difficulty_zh.json` 未迁移。`galactic_war` 另有**主题错配**：主干是该 wiki 的《Galactic War》剧情/时间线页，中文覆盖来自《Second Galactic War Mechanics》机制页，二者内容不同源，仅靠序号对齐仍会让「机制速览」等标题挂上剧情正文（见 §9 第 10 条） |
| `mechanics/*_zh.json`（2026-09 实测；v1.4 更新） | `tables_zh` / `paragraphs_zh` **尚未被任何覆盖文件使用**（4 个文件只有 `title_zh` / `content_zh` / `subsections_zh`） | 表格与图片默认沿用主干 | 已支持（第 5.2.2 节）。**2026-09-17 起 `figures_zh` 已投入实战**：`status_effects_zh.json`（`Fire` 节丢弃 1 个「实为散文的图片块」）与 `galactic_war_zh.json`（`Overview` 外的 7 个已译节共丢弃 16 个）。丢弃真图片以外的散文块后，若该节还有**真图片**要保留，做法是把它以简化 `<img>` 写回 `content_zh`（不再依赖主干 `figures_zh` 透传），见 §9 第 11 条。`tables_zh` / `paragraphs_zh` 仍未使用 |
| `mechanics/*.json`（主干，2026-09 实测） | `content` 内的 `<img src="/images/…">` 是**站点根相对路径**，本地静态站没有这些文件 | 站内相对路径 `./assets/mechanics/<页 id>/<文件名>`（第 9 节第 6 条） | **4 个主干文件已全部迁移**（2026-09-17）：`damage.json` 45 处 / 36 文件、`difficulty.json` 33 处 / 16 文件、`status_effects.json` 48 处 / 13 文件、`galactic_war.json` 276 处 / 64 文件（其中 39 处是 `/images/thumb/…` 缩略图，见第 9 节第 6 条）。4 个文件的 `/images/` 残留均为 **0** |
| `mechanics/damage.json` 的 `Other Structures` 表（2026-09-17 补抓） | 官方渲染页该表在 Structure / AV 两列带 `/wiki/…` 内链与 188×221 的模板图标（`<span class="Templateicons">`） | 站内不存在 `/wiki/…` 路由，且 `mechanic.html` 没有 wiki 的 `Templateicons` 缩放规则，图标会按 188×221 原始尺寸撑高表格行 | 该表只保留**文本数据**（表头 + 20 行 × 5 列），不写内链与图标；其余 6 张表沿用主干既有写法（含内链与图标），其尺寸问题已由第 9 节第 7 条的 CSS 规则解决 |
| `mechanics/galactic_war.json` 的 `References` 小节（2026-09-17 实测） | `content` 的 `<div>` 与 `</div>` 数量为 182 : 183 —— 结尾在 MediaWiki 注释之后多一个**孤立 `</div>`**（抓取时丢掉了对应的开标签） | `content` 内的 HTML 片段必须标签配平 | **已修（2026-09-17）**：删掉那一个孤立 `</div>`，现为 365 : 365 平衡。附带效果：该节原本还会因「注释残文 + 孤立 `</div>`」合成一段 12 字符的假散文，从而多渲染一个正文 21 字符的**垃圾「英文原文」折叠块**；配平后垃圾折叠块一并消失（该页 `details.mg-ref` 4 → 3，减掉的正是这一个垃圾块）。后果见第 9 节第 8 条 |
| 全数据集 | 部分文件 `source` 为 `Helldivers Wiki.gg` / `https://helldivers.wiki.gg` | `wiki.gg` | 新数据与本次修订后的 `boosters.json` 统一写 `wiki.gg` |

---

## 9. 落地决策（记录在案，不得擅自更改）

1. **英文正文长段落不落库**：只保留 `description`（游戏内短简介/英文首句）与 `description_zh`，不抓取 wiki 英文条目的整段正文。
2. **数值以渲染页为准**：抓取必须基于**渲染后的页面 DOM**（`browser_open` + `browser_execute` 遍历），不得使用 `action=parse&prop=wikitext`——模板/Lua 生成的表格在 wikitext 里只剩占位符，会整表丢失。
   - **例外（2026-09-17 登记，仅限 `warbonds.json`）**：`action=parse&prop=text` 返回的**渲染后 HTML** 与浏览器 DOM 等价，允许使用；但**禁止**用 `action=parse&prop=wikitext`。实测各债券页的 `{{Acquisitions Page}}` 网格在 wikitext 里只剩 `|N_cost =`（该值是**视觉排布序号**，不是勋章价格），照抄会写入错误数据；同一文件的 4 个手工 wikitable 债券（如 `Ironclad_Democracy_Premium_Warbond`）其 wikitable 行文完整，因此**同一数据集内两种来源并存，必须以渲染页为准**。
3. **`tables` 的一行一列都必须能回溯到渲染页**：不补算、不插值。
   - **唯一例外（2026-09-17 登记）**：wiki 模板渲染出的**完全相同的重复行**（已确认为模板 bug，非数据）允许删除，删除后 `tables[].note` 中不留「原页面此行重复」一类说明。已按此修订 `boosters.json` 的 `stun_pods`、`firebomb_hellpods` 各 1 行 `Status`。
4. **数据缺失用 `null`/空数组表达**，不用「暂无」「待补充」等文案占位（`price_zh` 的 `待发布` 是展示文案字段，不是数据字段）。
5. **中文化不得减少信息量（2026-09-17 登记）**：`_zh` 覆盖只允许替换**散文**；主干的表格与图片一律保留（覆盖未提供 `tables_zh` / `figures_zh` 时）。覆盖生效的英文散文不删除，由前端折进该小节的「📄 英文原文」`<details>`。校验时对主干每个 `content` 抽 20 字符滑窗，必须 100% 出现在合并结果里。
   - **例外（2026-09-17 登记，v1.3）**：覆盖小节显式写了 `fully_translated: true`（= 该节英文散文已逐条核对并完整译入中文正文）时，前端**不再渲染**该节的 `<details>` 兜底块（见 §5.2.2）。此时上面那条「20 字符滑窗必须 100% 命中」的校验**改为**：主干该节散文的**事实点**必须逐条能在中文正文中找到对应表述（不再要求英文字面出现）。判定为不适合译入正文的残留（英文外部引用、`msgbox` 维护提示、Navbox 导航模板）应在提交说明里逐条列出。
   - 实测存档（2026-09-17，仅 `damage` 页）：`damage_zh.json` 27 个小节中 26 个标记 `fully_translated: true`，`References` 节刻意不标记（英文引用 + Navbox 保留兜底），页面 `<details class="mg-ref">` 由 27 个降为 1 个；表格仍 7 张、锚点 27/27 唯一、console error 0、375 px 无横向溢出。
    - 实测存档（2026-09-17，`status_effects` 页）：`status_effects_zh.json` 10 个顶级节全部标记 `fully_translated: true`，并为 `Stagger_and_Ragdoll` / `Gas` / `Gas_Confusion` / `Stun` 补写 `subsections_zh`（`Enemies`、`Gas Mk1`、`Gas Confusion Mk1`、`Stun 1–4` 共 7 个 L4 子节，英文 12,093 字符全部译入），页面 `<details class="mg-ref">` **10 → 0**；小节 23、TOC 23、表格 15 张、锚点唯一性均不变；`.mg-media` 2 → 1（`Fire` 节用 `figures_zh: []` 丢弃 1 个「实为散文的图片块」，语义已在中文正文里写出；`Change History` 的图片块保留，因该节未译）。**刻意不标记的小节**：`Change History`（15,274 字符英文更新日志 + 1 个图片块，本次未译，保持英文主干原状）。
    - 实测存档（2026-09-17，`galactic_war` 页）：`galactic_war_zh.json` 由「6 节无 `id`」改写为「6 节全部显式 `id`，并列出 `The_Second_Galactic_War` 全部 24 个月度子节 `id`」；本次译入 8 节（`Overview`、`The_First_Galactic_War`、`The_Great_Democratization`、`The_Second_Galactic_War`、`Summary_of_Notable_Events`、`February_2184`、`March_2184`、`April_2184`），全部标记 `fully_translated: true`；页面 `<details class="mg-ref">` **3 → 0**，`.mg-media` **132 → 116**（丢弃 16 个伪图片块、6 张真图片改写为 `content_zh` 内 `<img>` 保留）；小节 37、TOC 37、表格 1、锚点唯一性均不变。**未译小节**（保持英文主干原状，不标记）：`May_2184` … `December_2185` 共 20 个月度小节，以及 `References`（英文引用列表 + Navbox）。
6. **机制页主干图片一律本地化（2026-09-17 登记，方案 1）**：`mechanics/<id>.json` 主干 `content` 内的 `<img src="/images/<文件名>?<hash>">` 一律下载到 `HD2_Wiki/assets/mechanics/<id>/<文件名>`（丢掉 `?hash`），并把 `src` 改写为**相对 HTML 页所在目录**的 `./assets/mechanics/<id>/<文件名>`。
   - **不采用**「统一改写为 `https://helldivers.wiki.gg/images/…` 外链」的方案：本站其它图标（`boosters` / `warbonds` / `armor` 等）都是站内文件（第 1 节），外链会让机制页离线不可看、依赖第三方可用性与限流，并与全站约定不一致。
   - 下载必须**串行 + 间隔**（wiki.gg 会 429），并逐个校验：文件 >200 B 且魔数/内容为真实图片（PNG `89504e47…`、SVG 含 `<svg`），不是 HTML 错误体。
   - **两种 URL 形态的落地规则**（2026-09-17 补记，`galactic_war.json` 首次遇到）：
     - `/images/<文件名>?<hash>` → 本地 `HD2_Wiki/assets/mechanics/<页 id>/<文件名>`
     - `/images/thumb/<文件名>/<宽>px-<文件名>?<hash>`（缩略图）→ 下载**缩略图本身**，本地文件名为末段 `<宽>px-<文件名>`（与 `<文件名>` 不冲突，且保留 wiki 指定的显示宽度），即 `./assets/mechanics/<页 id>/<宽>px-<文件名>`
     - 文件名含 `%27` 等百分号转义时：**磁盘上存解码后的真实文件名，`src` 里保留原百分号写法**（`320px-Angel%27s_Venture_Fracturing.gif` → 文件 `320px-Angel's_Venture_Fracturing.gif`），静态服务器与 GitHub Pages 都会先解码再找文件。
   - 已迁移（2026-09-17）：`damage.json`（45 处引用 / 36 文件）、`difficulty.json`（33 / 16）、`status_effects.json`（48 / 13）、`galactic_war.json`（276 / 64，含 39 个 thumb）。4 个文件改写后 `/images/` 残留均为 0，`assets/mechanics/` 下共 129 个文件，逐个校验通过（无 HTML 错误体、无 <200 B）。
7. **机制页表格里的 wiki 模板图标尺寸（2026-09-17 登记并已解决）**：主干表格里 `<img width="188" height="221">` 是 wiki 模板图标的**原始文件尺寸**（status_effects 还有 512×512 的阵营图标），wiki 侧靠模板容器的 CSS 缩放。实测 wiki.gg 的规则是：
   - `.Templateicons img { width: 1.27em; height: 1.5em; }` → 188×221 的图标渲染为 18×21（字体 14px）
   - `.faction-icon img { width: auto; height: 1.5em; }` → 512×512 的阵营图标
   - **难度图的图标例外**：`Difficulty` 页上的 `34×16` 图标是**普通 `<img>`，没有任何缩放规则**，wiki 上就按 34×16 显示（该页 `.Templateicons` 数量为 0）；status_effects 的 `20×20` 同理。
   合并引擎会把原 class 统一改写为 `mg-raw`，class 已丢失，无法用 `.Templateicons img` 选择器；因此 2026-09-17 在 `mechanic.html` 按「原始文件尺寸」这一特征还原（**不能**用 `width: 1.5em` 一刀切：那会把难度图本来正确的 34×16 又缩成 17×8）：
   ```css
   .section .mg-table-wrap img { max-width: 3em; max-height: 3em; }
   .section .mg-table-wrap img[width="188"] { width: 1.27em; height: 1.5em; }
   .section .mg-table-wrap img[width="512"] { width: auto; height: 1.5em; }
   ```
   作用域限定 `.mg-table-wrap`，正文配图与 `.mg-media` / `<figure>` 里的图片不受影响（实测 damage 的 `.mg-media` 仍为 188×221、galactic_war 的 276 张正文图仍为 25–320 px）。实测改前 → 改后：damage 行高 258 → 186 px、status_effects 行高 239 → 38 px、难度图保持 34×16、galactic_war 表内无图标（不变）；4 个页面破图 0、console error 0。
8. **`galactic_war.json` 的孤立 `</div>` 会破坏页面布局（2026-09-17 登记，同日已修）**：`References` 小节 `content` 结尾曾多一个 `</div>`（见第 8 节）。`renderSection` 用字符串拼接 + `innerHTML` 注入，多余的一个 `</div>` 会提前闭合 `.main-content`，使**最后一个小节变成 `.layout`（flex）的第三个子项**，`.main-content` 被 `flex: 1 1 0%` 挤到 **73 px 宽**（该逃逸小节自身 787 px）。**修法采用「改数据」而非「改引擎」**（避免影响其它页）：删掉 `galactic_war.json` 里那个孤立 `</div>`。实测改前 → 改后：`.main-content` **73 px → 880 px**，`.layout` 子项 **3 个 → 2 个**（`toc-sidebar:260` + `main-content:880`），页面小节数 37、TOC 37、表格 1、图片块 132 均不变，`<details class="mg-ref">` 4 → 3（减掉的是上面 §8 所述那个 21 字符垃圾块）。
9. **「注释残文 + 孤立闭合标签」会伪造出一段散文（2026-09-17 登记）**：`splitContent`/`topNodes` 只把 `<!-- … -->` 当注释剥掉，标签配平失败时落在容器外的裸文本（如 `-->` 与 `</div>`）会被当成**顶级文本节点**收进 `prose`，于是「中文覆盖 + 空正文」的小节也会渲染出一个内容无意义的「📄 英文原文」折叠块。因此**修 HTML 配平时要顺带核对 `<details class="mg-ref">` 的数量变化**，数量减少不必然是信息丢失，需逐块确认内容是否为垃圾。
10. **`galactic_war` 主干与中文覆盖不同源（2026-09-17 登记）**：主干 `galactic_war.json` 抓自 wiki.gg 的《Galactic War》页（`source` 为 `…/wiki/Galactic_War`），内容是**剧情与逐月时间线**；`galactic_war_zh.json` 的中文散文则来自《Second Galactic War Mechanics》**机制页**（解放/防御战役、抵抗度、影响度等）。二者**没有一一对应的小节**，当前靠序号配对已使「机制速览」「机制详解」等机制类标题挂在剧情小节上。本次处理**只做「译入 + 去重 + `fully_translated`」，不重排标题与配对**（重排会改动 TOC 锚点与标题，超出「不加信息量、不减信息量」的范围）。后续若要彻底解决，需在覆盖文件里改中文标题使其与主干小节同名，或把机制内容拆成独立页。
11. **保留真图片、丢弃伪图片块的做法（2026-09-17 登记）**：`figures_zh` 是**整节名单**，给 `[]` 会把该节所有图片块（含真图片）一起丢掉。当一节既有「实为散文的图片块」又有真图片时，做法是：① 把散文译入 `content_zh`；② 用 `figures_zh: []` 丢弃整节图片块；③ 把要保留的**真图片**以简化 `<img>` 直接写进 `content_zh`（`sanitize` 允许 `div`/`img`/`style`/`width`/`height`/`alt`，`class` 会被改写成 `mg-raw`）。本次 `galactic_war` 的 `The_First_Galactic_War`、`The_Great_Democratization`、`2184 年 2 月/3 月/4 月` 共 6 处按此处理；被丢掉的 wiki `/wiki/File:…` 外链本来在静态站上就不存在，不构成信息损失。


---

## 10. 校验清单

新增或修改数据集后逐条自检：

1. JSON 可被 `[IO.File]::ReadAllText($p)` + `ConvertFrom-Json` 解析（**不要用 `Get-Content -Raw`**）。
2. `total` == 主集合长度。
3. 所有 `id` 满足 `^[a-z0-9_]+$` 且数据集内唯一（`mechanics/*.json` 的 `id` 是 wiki 派生锚点，允许 `.` 与 `-`，见第 7.7 节）。
4. 所有 `icon` 指向的文件真实存在（站内相对路径）。
5. `source_url` / `source_page` 均为 `https://helldivers.wiki.gg/wiki/<英文名下划线>`。
6. `_zh` 字段与主字段结构一致。
7. 新增字段已在本文件第 7 节登记。
8. 目录页 20/25/89/95… 等卡片数与 `blocks/navigation.json` 的 `count`、以及与数据集 `total` 一致，无外站引用。
9. **`mechanics/` 合并自检（2026-09-17 新增）**：打开 4 个机制页，确认 ① console 无 error；② 每页的小节数 == TOC 项数 == 唯一 `<div class="section">` id 数；③ 无重复 id、无 `_` 占位 id；④ 表格数 == 主干 `<table>` 数（除非覆盖提供了 `tables_zh`）；⑤ 覆盖文件里出现但主干没有的中文小节在 console 有 `zhOnly` 警告（有警告时应回到覆盖文件补 `id`）；⑥ 每个页面 `img` 全部返回 200、破图 0，且表格内图标渲染尺寸在 16–34 px 之间（规则见第 9 节第 7 条；`.mg-media` 正文图不受该规则影响，应保持原始显示尺寸）。

