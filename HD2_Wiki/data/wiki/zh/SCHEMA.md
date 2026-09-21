# HD2 中文维基数据集 Schema（`HD2_Wiki/data/wiki/zh/`）

> 版本：v1.6 · 2026-09-21（v1.6 在 §7.4 登记 `enemies.json` 的 `guides[]` 一图流攻略图字段（含 `src` / `title` / `author` / `source_url` / `note`），配套新增 §9 第 19 条（图片一律站内 WebP、`source_url` 只做出处不做出图、无署名必须写进 `note`）与 §10 第 14 条自检；校验器新增 `GUIDES.FIELDS` 检查项）
> 版本：v1.5 · 2026-09-18（v1.5 新增 §7.12 术语表 `terms.json`（1,671 条）并登记其字段与来源优先级；新增 §9 第 15–17 条：A 项译名口径 `Gloom = 阴霾` / `Automaton = 机器人`、全站异写统一、「galactic_war_history」`References` 节 Navbox 中文化与 13 个图标本站化）
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
| 数据集文件名 | 小写 snake_case：`weapons.json`、`enemies.json`、`stratagems_full.json`、`missions.json`、`boosters.json`、`warbonds.json`、`loadout.json`、`factions.json`、`index.json`、`ds_terms.json`、`terms.json` |
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
| `terms.json` | `terms` | **术语表**：`{ en, zh, source, note, ambiguous?, rejected? }`，见第 7.12 节。不参与 `?id=` 路由，是「翻译前先查」的查阅型数据 |

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

> 顶层 `total` 必须等于 `warbonds` 数组长度。图标为 `./assets/warbonds/<wiki File 名>.webp`（本站下载，不热链；原 PNG 母版保留在同目录，仅为备份）。

### 7.3 `weapons.json`

`category`、`subcategory`、`subcategory_name`、`stats_short{ damage, capacity, penetration }`、`stats_full{}`、`traits[]`、`unlock`、`lore`、`variants[]`、`tips[]`、`detailed_stats{}`。顶层另有 `categories{}`（分类元数据）。

### 7.4 `enemies.json`

`name_zh`（**遗留反向命名**，见第 8 节）、`faction`、`faction_label`、`image`、`category`、`health_total`、`damage`、`damage_type`、`fire_damage_multiplier`、`stagger_threshold`、`minimum_difficulty`、`body_parts[]`（含 `part_id` / `armor_level` / `location` / `durable` / `percent_to_main` / `overflow_cap` / `constitution` / `fatal` / `is_weak_point` / `count` / `armor_level_zh` / `location_zh`）。

#### 7.4.1 `guides[]` —— 一图流攻略图（v1.6 · 2026-09-21 登记）

**可选字段**（缺失 = 该敌人没有一图流，前端整块不渲染）。语义：**社区作者制作的、已获授权转载的**单张「一图流」攻略图（大图 + 文字表格，非官方素材）。元素按数组顺序纵向堆叠。

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `src` | string | 是 | **站内相对路径**，固定形如 `./assets/enemy-guides/<敌人 id>_<序号>.webp`。文件名 = 敌人 `id` + 序号（`spore_burst_bile_titan_1.webp`）。**禁止外站 URL**（校验项 `IMG.EXISTS` 会报缺失，`GUIDES.FIELDS` 会报非法前缀） |
| `title` | string | 是 | 图的中文标题。写法「<站内 canonical 敌人名> 一图流」，如 `孢裂泰坦 一图流`。**以站内 `name_zh` 为准**，作者图上的写法与站内不一致时按站内写，差异在提交说明里记录 |
| `author` | string | 是 | 图的作者 / UP 主名（**优先照抄图上署名**）。图上没有署名、用户也没提供时写 **空串 `""`**，**不得编造**；前端空串即不渲染署名行。此时 `note` 必须写明署名待补 |
| `author_url` | string | 否 | `author` 的作者主页（B 站空间等**外站绝对 URL**）。**有则前端把 `author` 渲染成可点链接（新窗口打开），无则退化为纯文本**；不参与站内图片存在性校验 |
| `source_url` | string | 是 | **原件出处**（B 站视频页、原图 CDN 等**外站绝对 URL**）。本字段是 `enemies.json` 里唯一允许写外站图片 URL 的字段，校验器**不**对它套 `icon` 的站内规则；前端渲染为署名行里的「来源」链接 |
| `source_title` | string | 否 | `source_url` 的出处标题（如 B 站视频标题 `潜兵虫九门：孢裂变种`）。**有则前端按「来源：《标题》」渲染，无则退回 `source_url` 原文**；`source_url` 为空时整项省略 |
| `note` | string | 否 | 授权与署名说明，如 `已获作者授权转载（作者署名待补）` |

示例：

```json
"guides": [
  {
    "src": "./assets/enemy-guides/spore_burst_bile_titan_1.webp",
    "title": "孢裂泰坦 一图流",
    "author": "Nemo龙井",
    "author_url": "https://space.bilibili.com/23458920",
    "source_url": "https://www.bilibili.com/video/BV1EFeb6vESh",
    "source_title": "潜兵虫九门：孢裂变种",
    "note": "已获作者授权转载"
  }
]
```

约定：

1. **只有 `src` 参与渲染**：`source_url` 是**出处**（可回溯、可核对），**不得**直接当图片地址渲染 —— 外站有防盗链/限流，且与第 1 节「图片一律站内」冲突。
2. 图片入库前一律转 WebP（第 9 节第 19 条），目录 `HD2_Wiki/assets/enemy-guides/`，**原图 PNG 不入库**。
3. 一图流是**文字密集图**：有损压缩会把小字压糊，`quality` 从 **0.9** 起试；优先「降分辨率上限」而不是继续降质量。
4. 署名不可省：`author` 非空时前端必须显示；`author` 为空串时 `note` 必须写明「署名待补」。

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

**已登记的数据集（2026-09-18）**

| `id` | 主干来源（wiki.gg） | 覆盖文件 | 说明 |
| --- | --- | --- | --- |
| `damage` | 《Damage》 | `damage_zh.json` | — |
| `difficulty` | 《Difficulty》 | `difficulty_zh.json` | — |
| `galactic_war` | 《[Second Galactic War Mechanics](https://helldivers.wiki.gg/wiki/Second_Galactic_War_Mechanics)》 | `galactic_war_zh.json` | **只放机制**。中文正文（机制速览 / 机制详解 5 子节 / 影响度补充 / FAQ / 参考资料）全部在覆盖文件里，主干**不含英文散文**（`content: ""`），只保留小节骨架 + 锚点 id 权威 + `toc`；该 wiki 页的英文原文本次未抓取落库，见 §9 第 13 条 |
| `galactic_war_history` | 《[Galactic War](https://helldivers.wiki.gg/wiki/Galactic_War)》 | `galactic_war_history_zh.json` | 剧情 / 时间线页，由 `galactic_war` 拆分而来（§9 第 13 条）。主干保留全部英文剧情（Overview / 第一次银河战争 / 大民主化时代 / 第二次银河战争 24 个月度子节 / References，346 KB）；覆盖文件只有已译的 4 节 + 25 个子节 |
| `status_effects` | 《Status Effects》 | `status_effects_zh.json` | — |

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

### 7.12 `terms.json`（术语表 · 2026-09-18 登记）

**用途（强制）**：**以后翻译新页面 / 新增或修订任何数据集的 `name` / `title` / 正文专名之前，先查这张表**。表中已有的，一律照用其 `zh`，不得另起译法；表中没有的才新拟，并在 `note` 里记下依据，随后回填本表。

**顶层字段**：`updated_at`（第 2 节）、`source`（合并来源说明）、`total`（**必须等于 `terms` 数组长度**）、`terms`（主集合）。

**`terms[]` 元素结构**：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `en` | string | 是 | 英文原文。**大小写敏感**；仅大小写不同但译名相同的写法已合并进同一 entry，并在 `note` 的「大小写变体」里列出 |
| `zh` | string | 是 | 中文译名（= 裁定结果） |
| `source` | string | 是 | **获胜来源**，取值见下方优先级表 |
| `note` | string | 否 | 角色说明 / 裁定依据 / 被淘汰写法 / 语境歧义 / 同形异义 |
| `ambiguous` | boolean | 否 | **语境歧义条目**：`zh` 只是该词的首选写法，另一种写法取决于语境（如 `light` 作护甲等级是「轻甲」、作重量级是「轻型」），**不得机械套用**；歧义说明在 `note` |
| `rejected` | array | 否 | **被淘汰写法**，元素 `{ zh, source, tier }`。存在该字段即表示「同一英文曾有多于一种写法且已裁定」 |

**来源与优先级（`zh` 取值口径，高者胜）**：

| 级别 | 来源 | 说明 |
| --- | --- | --- |
| 0 | `口径（…）` | 本项目已确认的口径：用户给定口径（A 项）、星图 canonical 的推论、站内既有已确认译法 |
| 1 | `starmap.json`、`index.html#BUILTIN_PLANET_CN` | 星区名 / 行星名 canonical |
| 2 | `hd2_variables.json`、`HD2行动变量对照表.md` | 行动变量（游戏数据侧）名称 |
| 3 | `weapons.json` / `enemies.json` / `stratagems_full.json` / `boosters.json` / `warbonds.json` / `missions.json` / `factions.json` / `ds_terms.json` | 站内数据集条目名 |
| 4 | `术语对照表_送审.md` / `术语对照表_敌人_送审.md` / `术语对照表_部位.md` | 早期送审术语表 |

冲突处理：**A 项口径 > starmap / 官方数据 > 其它**；胜出者写入 `zh` 与 `source`，被淘汰写法进 `rejected`（或在该词属「语境歧义」时并入 `note` + `ambiguous: true`）。

**边界（2026-09-18 登记）**：

1. 本表**只统一译名口径，不改变各数据集 `name` / `name_zh` 的权威性**：同一英文在两个数据集里各自是条目名（如 `SEAF Artillery` 在 `stratagems_full.json` 作「超级地球武装部队大炮」、在 `missions.json` 作「SEAF 火炮」）时，标 `ambiguous: true` 并同时记录两种口径，**不强行改名**。
2. `ds_terms.json` 的键含大量数值 + 单位字符串（`0.349999994 sec`），属「文本替换表」而非术语，仍按第 3 级来源并入（便于统一「100 Ballistic → 100 弹道」这类展示值）。
3. 本表是**查阅型数据**，前端不加载、不渲染；读取方式与其它数据集一致（`[IO.File]::ReadAllText()` + `ConvertFrom-Json`）。

### 7.13 `HD2-Galatic_war-Map/data/campaign_zh.json`（进行中的战役中文化层 · 2026-09-20 登记）

> 本文件**不在 `HD2_Wiki/data/wiki/zh/` 目录下**，而是主站 `HD2-Galatic_war-Map/data/` 的数据文件。因第 7 节是「扩展字段登记表」的统一入口，故在此登记，避免出现未登记的数据文件。

**用途（强制）**：主站「进行中的战役」模块（`HD2-Galatic_war-Map/index.html` → `#block-campaign`）的**中文化层**。英文原文由 `scripts/fetch_site_data.py::build_active_campaign()` 从 `https://helldiverscompanion.com/api/hell-divers-2-api/get-api-data-live` 的 `episodes` / `episodesStatus` 抓取；本文件按上游 **id32** 覆盖中文，**缺失的 id32 一律回退英文原文，绝不阻断渲染**。

**顶层字段**：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `_meta` | object | 是 | `desc` / `source` / `terminology` / `note` / `updated_at`（说明性元数据，前端不读） |
| `status` | object | 是 | 阶段状态口径：键为上游 status 码（`"0"` 进行中 / `"2"` 成功 / `"3"` 失败），值 `{ key, cn }`；`key` 同时用作前端 CSS 类后缀（`.camp-phase.is-{key}`） |
| `reward_types` | object | 是 | 奖励口径：键为上游 `mixId` 字符串，值 `{ en, cn, icon }`；`icon` 取 `medal`（战争债券勋章）或 `cape`（披风），决定前端内联 SVG 图形 |
| `episodes` | object | 是 | 主集合：键为**战役 id32 字符串**，值 `{ title, description?, phases? }` |
| `factions` | object | 是 | 阵营口径：键为上游 `race` 码字符串（`"1"` 人类 / `"2"` 终结族 / `"3"` 机器人 / `"4"` 光能者），值 `{ en, cn, cls }`，`cls` 用作横幅渐变类名 `.camp-banner.is-{cls}` |

**`episodes.<id32>` 结构**：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | string | 是 | 战役名中文 |
| `description` | string | 否 | 情报简介中文（多段用 `\n\n` 分隔） |
| `phases` | object | 否 | 键为**阶段 id32 字符串**，值 `{ title?, briefing? }`；`title` 为阶段名中文，`briefing` 为简报中文（多段 `\n\n`） |

**取值与回退约定**：

1. 译名前**先查 `terms.json`**（第 7.12 节）照用其 `zh`；本文件已采用 `Cyborgs→生化人`、`Automaton→机器人`、`Helldivers→绝地潜兵`、`Super Earth→超级地球`、`Stratagem→战略配备`、`Quarter-term elections→季度选举`（与 `data/translated/TransNews.json` 既有译法一致）。
2. 中英并陈由前端负责（中文为主、英文折叠/小字对照），本文件**只存中文**，不重复存英文原文。
3. 上游新增战役/阶段后，本文件未同步不会报错——对应字段为空串，前端直接显示英文原文。
4. 读取方式：`fetch_site_data.py::_load_campaign_zh()`（`json.load` + 异常吞掉）；前端**不直接加载本文件**，只读 `data.json → active_campaign`（已合并中英）。

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
| `mechanics/*_zh.json`（2026-09 实测，v1.4 已部分迁移） | **小节层级与主干不一致，且没有 `id` 声明**，只能按序号配对：`damage` 主干 `Damage Calculation` 下 16 节 / 中文 18 节（中文多「拆毁值与结构」「其他结构」、缺 ExDR）；`status_effects` 主干 11 节 / 中文 10 节（缺 `Change History`）；`galactic_war` 主干 5 节 / 中文 6 节且结构完全不同 | 每个覆盖小节写 `id`（= 主干 `id`），层级与主干对齐 | **`status_effects_zh.json` / `galactic_war_zh.json` 已于 2026-09-17 逐节补写 `id` / `target_id`**（`galactic_war` 的 24 个月度子节亦全部显式列名，防止「只译其中几个月」时序号回退错位）；`damage_zh.json` / `difficulty_zh.json` 未迁移。`galactic_war` 另有**主题错配**：主干是该 wiki 的《Galactic War》剧情/时间线页，中文覆盖来自《Second Galactic War Mechanics》机制页，二者内容不同源，仅靠序号对齐仍会让「机制速览」等标题挂上剧情正文（见 §9 第 10 条）。**2026-09-18 已解决**：`galactic_war` 拆成「机制」（`galactic_war`）+「剧情」（`galactic_war_history`）两页，两侧覆盖小节全部显式写 `id`，序号配对规则在这两个数据集上已无实际作用（见 §9 第 13 条） |
| `mechanics/*_zh.json`（2026-09 实测；v1.4 更新） | `tables_zh` / `paragraphs_zh` **尚未被任何覆盖文件使用**（4 个文件只有 `title_zh` / `content_zh` / `subsections_zh`） | 表格与图片默认沿用主干 | 已支持（第 5.2.2 节）。**2026-09-17 起 `figures_zh` 已投入实战**：`status_effects_zh.json`（`Fire` 节丢弃 1 个「实为散文的图片块」）与 `galactic_war_zh.json`（`Overview` 外的 7 个已译节共丢弃 16 个）。丢弃真图片以外的散文块后，若该节还有**真图片**要保留，做法是把它以简化 `<img>` 写回 `content_zh`（不再依赖主干 `figures_zh` 透传），见 §9 第 11 条。`tables_zh` / `paragraphs_zh` 仍未使用 |
| `mechanics/*.json`（主干，2026-09 实测） | `content` 内的 `<img src="/images/…">` 是**站点根相对路径**，本地静态站没有这些文件 | 站内相对路径 `./assets/mechanics/<页 id>/<文件名>`（第 9 节第 6 条） | **4 个主干文件已全部迁移**（2026-09-17）：`damage.json` 45 处 / 36 文件、`difficulty.json` 33 处 / 16 文件、`status_effects.json` 48 处 / 13 文件、`galactic_war.json` 276 处 / 64 文件（其中 39 处是 `/images/thumb/…` 缩略图，见第 9 节第 6 条）。4 个文件的 `/images/` 残留均为 **0** |
| `mechanics/damage.json` 的 `Other Structures` 表（2026-09-17 补抓） | 官方渲染页该表在 Structure / AV 两列带 `/wiki/…` 内链与 188×221 的模板图标（`<span class="Templateicons">`） | 站内不存在 `/wiki/…` 路由，且 `mechanic.html` 没有 wiki 的 `Templateicons` 缩放规则，图标会按 188×221 原始尺寸撑高表格行 | 该表只保留**文本数据**（表头 + 20 行 × 5 列），不写内链与图标；其余 6 张表沿用主干既有写法（含内链与图标），其尺寸问题已由第 9 节第 7 条的 CSS 规则解决 |
| `mechanics/galactic_war.json` 的 `References` 小节（2026-09-17 实测） | `content` 的 `<div>` 与 `</div>` 数量为 182 : 183 —— 结尾在 MediaWiki 注释之后多一个**孤立 `</div>`**（抓取时丢掉了对应的开标签） | `content` 内的 HTML 片段必须标签配平 | **已修（2026-09-17）**：删掉那一个孤立 `</div>`，现为 365 : 365 平衡。附带效果：该节原本还会因「注释残文 + 孤立 `</div>`」合成一段 12 字符的假散文，从而多渲染一个正文 21 字符的**垃圾「英文原文」折叠块**；配平后垃圾折叠块一并消失（该页 `details.mg-ref` 4 → 3，减掉的正是这一个垃圾块）。后果见第 9 节第 8 条 |
| `mechanics/status_effects.json` 的 `Change_History` 小节（2026-09-18 实测） | `content` 的 `<div>` / `</div>` 为 156 : 157，末尾同样是「MediaWiki 注释 + 孤立 `</div>`」；后果不是垃圾折叠块（该节未译、不产生 `trunkRefHtml`），而是**该节最后 2 个 `Armor_AP2/AP4_Icon.png`（188×221）被挤出 `.section`**，落到 `.main-content` 下，于是既躲开表格图标规则、也躲开正文图标规则，按原始 188×221 渲染（见第 9 节第 12 条） | 标签配平 | **已修（2026-09-18）**：删掉末尾孤立 `</div>`（`api-parse\n -->\n</div>` → `api-parse\n -->\n`），现为 156 : 156；两图回到 `.section` 内，渲染 16–18 × 21 px。`damage.json` 的 `References`（119:120）与 `difficulty.json` 的 `Mission_Difficulty_Changes`（119:120）**同样不平衡但本次未改**：实测两者渲染后没有任何节点逃出 `.section`（`details.mg-ref` 仍在节内、`.main-content` 无逃逸子节点），浏览器错误恢复已兜住，属「已知待清理」而非缺陷 |
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
11. **保留真图片、丢弃伪图片块的做法（2026-09-17 登记）**：`figures_zh` 是**整节名单**，给 `[]` 会把该节所有图片块（含真图片）一起丢掉。当一节既有「实为散文的图片块」又有真图片时，做法是：① 把散文译入 `content_zh`；② 用 `figures_zh: []` 丢弃整节图片块；③ 把要保留的**真图片**以简化 `<img>` 直接写进 `content_zh`（`sanitize` 允许 `div`/`img`/`style`/`width`/`height`/`alt`，`class` 会被改写成 `mg-raw`）。本次 `galactic_war` 的 `The_First_Galactic_War`、`The_Great_Democratization`、`2184 年 2 月/3 月/4 月` 共 6 处按此处理；被丢掉的 wiki `/wiki/File:…` 外链本来在静态站上就不存在，不构成信息损失。**2026-09-18 拆分后这 6 处随节迁到 `galactic_war_history_zh.json`，`figures_zh: []` 与 `fully_translated: true` 原样保留**（判定跟着节走，见第 13 条）。

12. **图片尺寸通用规则（2026-09-18 登记并实施）**：修的是「同一页里图片忽大忽小」。审计口径 = `mechanic.html` 的 4 个机制页 + `boosters` / `booster` / `warbonds` / `warbond` / `weapons` / `weapon` / `stratagems` / `stratagem` / `enemies` / `enemy` / `wiki` / `loadout` / `missions`，逐页实测渲染后的 `getBoundingClientRect()`（1280 与 375 两档）。
    - **失衡清单（改前）**：`id=difficulty` 15 张 —— `Medal.svg` / `Requisition_Slip.svg` / `XP.svg`（原始 `width`/`height` = 512×716 / 512×571 / 512×282）按**原始文件尺寸**杵在正文里（正文 `.section img` 当时只有 `max-width:100%`，512 < 容器宽 880 所以完全不缩），另有 6 张 512×512 阵营图标；`id=galactic_war` 151 张 —— 135 张阵营/部委图标（`width="512"`，自然尺寸仅 150×150）渲染成 512×512、16 张 `Super_Earth_Icon.svg`（`width="1024"`）渲染成 880×880；`id=status_effects` 2 张 —— `Armor_AP2/AP4_Icon.png` 188×221（成因是 §8 那条 `</div>` 配平，图被挤出 `.section`）。其余页面 0 失衡。
    - **规则（唯一入口 `assets/css/hud-skin.css` 第⑮节，不逐图写死尺寸）**：
      ```css
      /* ① 正文配图：不撑破容器 + 高度上限 28em（≈392px @14px）+ 保长宽比 */
      .section img { max-width: 100%; max-height: 28em; height: auto; }
      /* ② wiki 模板图标：按「原始 width 属性」分档还原为 1.5em 行内尺寸（同 §9 第 7 条表格规则） */
      .section img[width="188"], .section img[width="512"], .section img[width="1024"] {
        width: auto; height: 1.5em; max-height: 1.5em; max-width: 3em;
      }
      ```
      `width="34"`（难度图）、`width="320"`（内容缩略图）等**不在分档内**，保持原尺寸；表格内的同名图标仍由 `mechanic.html` 的 `.mg-table-wrap` 规则接管（选择器更具体，实测不变）。③ 卡片 / 缩略图各页早已是「固定容器 + `object-fit: contain`」（`.weapon-icon img` / `.enemy-card-image img` / `.strat-ic` / `.booster-icon img` / `.detail-icon img` / `.wb-cover img` / `.part-img img`），实测 0 失衡，**不重复定义**，避免两套规则互相压。
    - **为什么写在 `hud-skin.css`**：它最后加载（能压住页面级写法），一次覆盖全部 12 页；同时把 16 个页面的 `hud-skin.css?v=20260913e` 统一改成 `?v=20260918a` 做缓存击穿（页面内联样式不受影响，`mechanic.html` 的表格图标规则仍在页内）。
    - **实测改前 → 改后**：difficulty 512×716 → 15×21、512×571 → 18×21、512×282 → 37×21、512×512 → 21×21；galactic_war（现为 `galactic_war_history`）512×512 → 21×21、1024×1024 → 21×21，而 320×320 的边疆图、256×360 的阵营图、250×305 的兵种图**尺寸不变**；status_effects 188×221 → 18×21。全部页面失衡 0、破图 0、console error 0、375 px 横向溢出 0、表格图标仍在 16–34 px。
    - **刻意不做**：不给卡片家族另写尺寸（各自已正确）；不把 320 px 级正文配图压小（`enemy` 详情页封面 1440×1080 仍随容器渲染 400×300、375 px 下 291×218，属「大图」设计意图）；不给 `damage.json` / `difficulty.json` 的两处孤立 `</div>` 做数据手术（实测无节点逃出 `.section`，见 §8）。

13. **`galactic_war` 拆分为「机制」+「剧情」两页（2026-09-18 登记并实施）**：落地第 10 条遗留的「把机制内容拆成独立页」。
    - **做法**：`galactic_war_history.json` = 改名前 `galactic_war.json` 的**字节级副本**（`copy` 后只用 `edit` 改了 `id` / `title` / `title_en` / `description` / `updated_at`，`sections` / `toc` / `source` 一个字节没动）；`galactic_war_history_zh.json` = `galactic_war_zh.json` 的副本，删掉机制内容后只留剧情节；机制侧两个文件重写（`galactic_war.json` 为新骨架，`galactic_war_zh.json` 只留机制）。
    - **迁到 `galactic_war_history` 的（主干 id 原样保留）**：`Overview`（概述·「关于银河战争这一叙事框架」部分）/ `The_First_Galactic_War`（第一次银河战争·背景）+ `Fate_of_the_Illuminate`（光能者的结局）/ `The_Great_Democratization`（大民主化时代）/ `The_Second_Galactic_War`（时间线与开战经过）+ `Summary_of_Notable_Events`（重大事件摘要）/ `February_2184` … `December_2185` 共 23 个月度子节 / `References`（英文参考来源与 Navbox，61 KB）。
    - **留在 `galactic_war` 的（锚点 id 重新命名，旧 id 属于剧情页且在本仓库无任何站内链接指向）**：`Overview` / `Mechanics_Overview`（机制速览）/ `Mechanics_Detail`（机制详解）+ `Galaxy_Map` / `Campaign` / `Planet_Health` / `Decay_Rate` / `Player_Impact` / `Impact_Supplement`（任务影响度补充）/ `FAQ`（常见误解）/ `Sources`（参考资料）。
    - **机制页主干只留骨架**：`galactic_war.json` 的 `content` 全为 `""`（《Second Galactic War Mechanics》页的英文原文本次未抓取落库），中文正文全部来自覆盖文件，故该页 `details.mg-ref` = 0 —— 这是「本来就没有英文可折」，不是折叠块误留。**该写法只对本数据集成立**，其余 `mechanics/*.json` 仍以主干英文为权威。
    - **信息不丢的核对方法（可复现）**：① 对拆分前记录的 10 个 `content_zh` 长度（361 / 1167 / 782 / 1760 / 1750 / 777 / 1521 / 2552 / 392 / 243，合计 11305）逐节核对「机制侧 + 剧情侧 == 原值」，10/10 相等、总计 11305 == 11305；② 历史主干与原主干除 5 个文档级字段外字节相同（副本 + `edit` 精确替换，未触碰 `sections`）；③ 渲染级：9 条剧情锚点短语在历史页命中、机制页命中数全为 0，机制页 7 条机制标记（机制速览 / 影响度计算公式 / 常见误解 FAQ / 消耗战役 / 围魏救赵 …）在历史页命中数全为 0。
    - **实测**：机制页 11 小节 / TOC 11 / 唯一 id 11 / 表格 1 / 图 1 / `details` 0 / console 0；历史页 31 小节 / TOC 31 / 唯一 id 31 / `details` 0 / 图 251 / 破图 0 / console 0；两页 `zhOnly` 警告均为 0。
    - **入口**：`data/wiki/zh/mechanics/index.json` 加 `galactic_war_history` 卡片（并把 `galactic_war` 的 `title_en`/`description` 改成强调机制），`data/wiki/zh/blocks/navigation.json` 的「游戏机制」`count` 4 → 5 并补描述（§7.10 要求 `count` 与目标页条目数一致）。
    - **未随之处理**：历史页 20 个未译月份与 `References` 仍显示英文标题与英文正文（`title_zh` 缺失时的既有回退行为，见 §5.2.3）。补中文标题等于新增翻译，超出「拆分」范围，故本次不动。

14. **`galactic_war_history` 全额汉化 + `galactic_war` 旧锚点别名（2026-09-18 登记并实施）**：
    - **任务面**：把第 13 条遗留的「历史页 20 个月度小节 + `References` 仍为英文」补完，使该页 **31 个主干小节全部为中文**（`title_zh` 31/31）。
    - **`fully_translated` 数量**：**28**。主干 31 节中有 3 节 `content` 为空字符串（`Fate_of_the_Illuminate`、`Battle_for_Super_Earth`、`December_2185`，英文 0 字符），没有散文可覆盖，**刻意不打标**（该标记的作用是「不再渲染英文折叠块」，空节本来就不渲染，打标是空操作，打了反而像「假装完成」）；这 3 节只补了 `title_zh`（`光能者的结局` / `超级地球之战` / `2185 年 12 月`），其中 `Battle_for_Super_Earth` 作为 `subsections_zh` 挂在 `May_2185` 下（主干里它是 `May_2185` 的 L4 子节）。
    - **文件规模**：`galactic_war_history_zh.json` **21,348 → 139,631 字节**；`content_zh` 合计 65,945 字符；覆盖主干英文 347 KB 中的散文部分。
    - **`figures_zh: []` 逐节沿用**：中文正文用简化 `<div style="width:Wpx;margin:12px 0;"><img …><div style="font-size:0.85em…">图注</div></div>` 内联保留**真缩略图**（各月度卷首「银河边疆」图等），行内阵营/POI 小图标（`faction-icon` / `POIicons`）随语义已由文字承载而丢弃。实测该页 `.mg-media` **251 → 0**、`img` **40 张全部 200、破图 0**（40 = 主干 `<div class="thumb">` 的真图总数，与 `check` 脚本的图片检查项数一致）。这是第 11 条做法的规模化沿用，不是图片丢失。
    - **`References` 节的处理（专项）**：① `<ol class="references">` 的 **71 条 `<li>`** 全部译入（含 `cite&#95;note-N` / `cite_ref-N` 回链结构、`8.0/8.1` 双角标），引文与「发布于 / 访问于」信息译中文；② **58 个外部 URL 一字未改地以纯文本写进正文**（`中文可见文字（https://…）`）——因为 §5.2.3 的合并会把 `<a>` 降级为纯文本、href 会丢，URL 必须落在文本里才留得住；③ 补丁号 `1.001.100` 原样保留；④ **Navbox（`div.ranger-navbox`，28 KB，含 13 个部委图标）与末尾两块 HTML 注释整块丢弃**，依据是 §5.2.2 第 6 条「wiki 导航模板属不适合译入正文的残留」（**2026-09-18 已撤销：Navbox 改为中文化后写进 `content_zh`，见第 17 条；`figures_zh: []` 仍保留，用于丢弃主干那份英文 Navbox**）；⑤ 因此整节通用核对会显示 19 个「链接实体缺失 / 7 个数字缺失」，全部落在被丢弃的 Navbox 区间内——**只对 `<ol>` 区间核对时是 36/36 数字、58/58 URL、5/5 术语表实体全中**。
    - **信息不丢核对（可复现）**：对每节主干散文抽**数字 token**（`\d[\d,\.]*`）与**可见链接文字中有术语表对应项者**，逐条在中文 `content_zh` 里查：31 个主干小节（`References` 计入）合计 **数字 189 项 / 术语表链接实体 710 项 / 图片 40 项**。分项结果：**链接实体缺失 19、图片缺失 0、数字「缺失」35**。逐条复核后：链接实体 19 项与数字 7 项**全部落在 `References` 被刻意丢弃的 Navbox 区间**（该节 `<ol>` 区间单独核对为 数字 36/36、外部 URL 58/58、术语表实体 5/5，全中）；其余 28 项数字「缺失」是**单位换算或中文数词**（`2 billion → 20 亿`、`100 million → 1 亿`、`1.5 billion → 15 亿`、`20 million → 2000 万`、`all 3 factions → 三个阵营`、`For 100 years → 一个世纪`），量值一致。**实缺 0**。数字核对脚本对 `N million → XX 万 / 亿` 这类换算不做自动放行，故这些换算一律以「缺失」报出、再由人工逐条判定（这正是 35 这个数字的由来）。（检查脚本同时做「连续 4 个以上纯 ASCII 单词」的未译串启发式，仅命中刻意保留的英文片名/机构名。）
    - **术语口径（2026-09-18 修订，见第 15/16 条）**：`Gloom / The Gloom → 阴霾`（**用户给定口径**；地图变量表另有写法，本页统一「阴霾」）；`Automaton / Automatons → 机器人`（用户给定口径；旧稿的三种异写一律作废，**字面见 `terms.json` 的 `rejected` 字段**）；`Deep Mantle Forge Complex → 深地幔锻造综合体`（`ds_terms` 既有）；星区名一律取 `HD2-Galatic_war-Map/tables/starmap.json` 的 `name_en → name`：`Jin Xi → 锦栖星区`、`Falstaff → 法尔斯塔夫星区`、`Mirin → 米琳星区`、`Farsight → 法尔赛特星区`、`Talus / Talos → 塔洛斯星区`（**不要**保留英文 `Talus 星区`，也不要用「金羲/福斯塔夫/米林/远见」）；`Gambit → 围魏救赵（Gambit）`（与机制页一致）。术语表查询用 `HD2-Galatic_war-Map/tables/starmap.json` + `hd2_variables.json` + `HD2行动变量对照表.md` + 站内 `weapons/enemies/stratagems_full/missions/ds_terms.json` 合成（1,375 条），本次为一次性过程产物、未落库。**（2026-09-18：该过程产物已重建并落库为 `terms.json`，1,671 条，见第 16 条）**
    - **旧锚点别名（用户要求「留」）**：拆页后 `mechanic.html?id=galactic_war#The_First_Galactic_War` 这类旧书签失效。做法选了**引擎侧数据驱动跳转**而不是「在数据里加 31 个隐藏别名小节」，理由：① 覆盖文件里主干没有的小节会被 §5.2.3 当作 `zhOnly` 追加到页尾并产生 console 警告（自检要求 0）；② 主干小节必然生成 TOC 条目与带内边距的 `.section` 外壳，做不到「0 高度、不影响排版」，TOC 会从 11 项涨到 42 项。实现：`mechanic.html` 新增 `legacyAnchorRedirect(pageId)` —— 仅当 `id === "galactic_war"` 且 `location.hash` **不是本页已有小节 id** 时，取一次历史页主干的 `toc`，命中即 `location.replace("./mechanic.html?id=galactic_war_history#<hash>")`；另加 `hashchange` 监听，并补 `scrollToHash()`（正文是 JS 渲染的，浏览器自带的 hash 滚动发生在渲染之前，深链此前只能落到页首）。失败（404/离线）静默 no-op。**未改任何 JSON 数据**。
    - **实测（1280 档 + 375 px 档）**：历史页 小节 31 / TOC 31 / 唯一 id 31 / 重复 0 / `_` 占位 0 / `<details class="mg-ref">` **0** / 表格 0 / `img` 40 破图 0 / `documentElement.scrollWidth == clientWidth`（1376=1376；375 档 iframe 实测 367=367、溢出元素 0）/ **console error 0、warning 0、`zhOnly` 0**（在页内二次调用 `load()` 并钩住 `console.error/warn/onerror` 采集）。TOC 标题与正文小节标题 **31/31 一一对应**。
    - **旧链接实测**：`?id=galactic_war#The_First_Galactic_War` → `?id=galactic_war_history#The_First_Galactic_War`（h1=银河战争历史，31 节）；`#May_2184`、`#References`、`#March_2185` 同样跳转并**已滚到目标节**（`scrollY≈18271`、目标节 `rect.top≈107`）；**本页合法锚点 `#FAQ` 不跳转**（仍为机制页 11 节）；不存在的 `#NoSuchAnchor_zzz` 也不跳转（留在机制页）；页内改 hash（不刷新）经 `hashchange` 同样生效。
    - **回归**：`?id=galactic_war` 11 节 / TOC 11 / 表格 1 / 图 1 / details 0 / 计算器在位；`?id=damage` 27 节 / TOC 27 / 表格 7 / details 1 / 图 35 破图 0；`mechanics.html` 5 张卡片（含 `galactic_war_history`）破图 0。三页 `scrollWidth == clientWidth`。
    - **仓库内无任何站内链接指向这 31 个旧锚点**（全仓 grep 仅命中本条注释），别名只为站外/浏览器书签服务。

15. **A 项译名口径（2026-09-18 登记并全站执行）**：
    - **`Gloom` / `The Gloom` → 阴霾**（同一事物）：`galactic_war_history_zh.json` 的 **47 处**旧译法全部改为「阴霾」；`SCHEMA.md` 自身第 14 条的旧口径记录 **2 处**同步改写。派生口径：`Dense Gloom → 浓阴霾`、`Gloom Border → 阴霾边界`。
    - **`Automaton` / `Automatons` → 机器人**：`galactic_war_history_zh.json` 里 **141 处**旧译法（同一阵营名的三种异写，129 + 11 + 1）全部改为「机器人」。注意 `Cyborgs → 生化人` 是**另一阵营**（第一次银河战争的生化人）；`机械种族` / `半机械人` 等描述性说法不属阵营名，均保留。
    - **被淘汰的写法一律只记在 `terms.json` 的 `rejected` / `note` 字段**（见第 7.12 节与第 16 条），本文件**不复述其字面**——这样「全站 grep 旧写法 = 0 处」这条自检才能机械执行。淘汰来源分三类：本站旧稿（`galactic_war_history_zh.json` 的 A 项实施前版本）、`HD2-Galatic_war-Map/tables/hd2_variables.json`（该目录本次不改，仅登记）、`HD2-Galatic_war-Map/tables/effect_id_cn.json`。
    - **全站复验（2026-09-18）**：`HD2_Wiki/` 内除 `terms.json` 的 `rejected` 审计字段外，A 项涉及的全部旧写法均为 **0 处**；渲染页面 grep 同样为 0。

16. **术语表落库 `terms.json`（2026-09-18 登记并执行）**：字段与来源优先级见第 7.12 节。
    - **条目数**：1,671。**来源分布（按获胜来源计）**：`ds_terms.json` 526、`starmap.json` 320、`术语对照表_部位.md` 192、`stratagems_full.json` 108、`missions.json` 96、`weapons.json` 89、`enemies.json` 84、`术语对照表_送审.md` 82、`hd2_variables.json` 78、`术语对照表_敌人_送审.md` 28、`warbonds.json` 25、`boosters.json` 20、`HD2行动变量对照表.md` 7、`factions.json` 3、口径类 13（`口径（A 项）` 5 / `口径（星图 canonical）` 4 / `口径（A 项派生）` 2 / `口径（站内已确认）` 2）。
    - **合并口径**：先按 5 级来源收集候选，再逐 `en` 取最高级为 `zh`，其余写入 `rejected`；纯语境差异（伤害类型名、`Projectile`、`Tail`、`SEAF Artillery` 等）标 `ambiguous: true` 并把两种写法都写进 `note`，不记为淘汰。
    - **裁定为冲突并把被淘汰写法写进 `rejected` 的条目（7 条）**：`Gloom` / `The Gloom` / `Dense Gloom` / `Gloom Border`（A 项口径，淘汰本站旧稿的写法与 `hd2_variables.json` 的写法）、`Automaton` / `Automatons`（A 项口径，淘汰本站旧稿的三种异写）、`Status → 状态`（淘汰「状态效果（独立区块）」）。**被淘汰的字面写法不在本文件复述**，需要回溯时 `grep` `terms.json` 的 `rejected` 字段即可。
    - **裁定为语境歧义、不淘汰的条目（16 条）**：`light` / `medium` / `heavy` / `Very Light`（护甲等级 vs 重量级）、`Acid` / `Arc` / `Ballistic` / `Fire` / `Gas` / `Standard` / `Projectile`（伤害类型名独立出现 vs 表格内「X伤害」；`Standard` 另需与 damage 页的「标准伤害」区分）、`Tail`（尾巴 / 尾部）、`SEAF Artillery`（战略配备名 vs 任务目标名）等，均标 `ambiguous: true` 并把两种写法都写进 `note`。
    - **用法**：翻译新页面 / 新数据前**先查本表**（第 7.12 节）。

17. **「`galactic_war_history`」`References` 节 Navbox 中文化与图标本站化（2026-09-18 登记并执行）**：撤销第 14 条第 ④ 项「Navbox 整块丢弃」的处理。
    - **落地方式**：Navbox 的中文版**写进 `galactic_war_history_zh.json` → `References.content_zh` 的 `<ol class="references">` 之后**（合并引擎对 `content_zh` 只做 `sanitize` + 内链降级，整块 HTML 原样保留），`figures_zh: []` 与 `fully_translated: true` **保持不变**（主干那份英文 Navbox 仍作为「图片块」被丢弃，避免英文版重复渲染）。
    - **为什么不用 `figures_zh` 透传**：主干把整个 `div.ranger-navbox` 归入图片块（含 `<img>`），透传会连同英文分组标题一起渲染；改成中文正文片段最直接，且不影响其它页。
    - **翻译范围**：原模板 **151 个 `<a>` / 132 个不同可见链接文字 / 13 个分组行**；除「View or edit this template」（纯外站模板维护链接，按站点惯例保留原文）外，**131 个链接文字全部译中文**，另译 4 个纯文字分组标题（`The Wars` / `Enemy Specific Lore` / `Misc` / `Implied Ministries`）。原模板的 `<a href="/wiki/…">` 在站内没有对应路由（第 5.2.2 节会把 `<a>` 降级为纯文本），因此中文版**只保留文字、不保留跳转**，并在末尾加一行说明。
    - **图标**：模板内的 13 个 `<img>`（11 个唯一文件：7 个部委 + `Automaton` / `Illuminate` / `Terminid` / `Super_Earth`）下载到 **`HD2_Wiki/assets/mechanics/galactic_war_history/`**（新目录，与主干原来用的 `assets/mechanics/galactic_war/` 分开），站内相对路径引用；下载**串行 + 1.2 s 间隔 + 最多 3 次重试**（wiki.gg 会 429），逐个校验为真实 SVG（> 200 B 且含 `<svg`）。实测 11/11 一次成功、失败 0、破图 0。
    - **HTML 写法约束（供后续复用）**：`sanitize()` 会把所有 `class` 改写成 `mg-raw`、丢掉原有 ranger 布局类，因此中文 Navbox **只用行内 `style` 排版**，并**全部使用单引号属性**（避免在 JSON 字符串里转义 `"`）；图标统一 `width='18' height='18' style='vertical-align:-0.25em;'`，正好躲开 `.section img[width="512"|"1024"]` 的 1.5em 分档规则，按 18×18 显示。

18. **C 项全站异写统一（2026-09-18 登记并执行）**：以 `terms.json` 为准，对 `HD2_Wiki/` 做「同一英文多个中文写法」全量扫描。
    - **扫描口径**：① 对 `terms.json` 里每个带 `rejected` 的条目，把被淘汰写法在全站文本中定位计数；② 对已点名的四组与高风险同实体异写做定向 grep。
    - **实际改动（全部落在 `galactic_war_history_zh.json`，合计 29 处）**：`Meridia` 的行文异写统一为星图 canonical「默里迪亚」**3 处**；`Talus 星区` → `塔洛斯星区` **2 处**；`OUTPOST ALPHA` 的站内行文统一为官方行动变量定名「阿尔法前哨」**9 处**；`HIVE WORLD` 同理统一为「巢穴世界」**9 处**；`Element-710` → `E-710` **3 处**；`Termicide` 的「终结杀虫剂」→「终结剂」**3 处**。
    - **扫描到、但裁定不改的**：`Remembrance`（超级地球「超级城市」名；星图与站内数据集均无中文，按 C 项规则**保留英文**，共 3 处）；`Enuliale`（行星名，`starmap.json` 与 `BUILTIN_PLANET_CN` 的 `cn` 均为空串，**保留英文**）；`肉瘤体 / 肉团群`（「肉团群」全站 0 处，canonical = `enemies.json` 的「肉瘤体」）；`孢裂武斗虫 / 孢裂战士`（「孢裂战士」全站 0 处，canonical = `enemies.json` 的「孢裂武斗虫」）；`地狱舱 / 绝地喷射仓`（前者只出现在 `fetch_reports/` 中间产物里，不是页面内容，且该目录 schema 不约束，本次不改，canonical 取 `boosters.json` 的「绝地喷射仓」）。
    - **复验（2026-09-18）**：上述被改写掉的旧写法，在 `HD2_Wiki/` 的**数据与页面**（`SCHEMA.md` 与 `terms.json` 的审计字段除外）中均为 **0 处**。

19. **一图流攻略图落库口径（2026-09-21 登记并实施；字段规范见第 7.4.1 节）**：`enemies.json` 新增**可选**字段 `guides[]`，承载社区作者制作的「一图流」攻略图（大图 + 文字表格，**非官方素材**）。四条口径不得擅自更改：
    - **图片一律站内 WebP**（与第 1 节「图片一律站内」一致）：原图先从 B 站 CDN 下载到 `%TEMP%` 作母版，用浏览器 `canvas` 的 `toDataURL("image/webp", q)` 转码，**只把 WebP 放进** `HD2_Wiki/assets/enemy-guides/<敌人 id>_<序号>.webp`；**原图 PNG 不入库**（仓库里不出现 3 MB 级 PNG 母版）。
    - **`source_url` 只做出处、不做出图**：它是原图的**外站绝对 URL**（B 站 CDN），前端只渲染成「原图来源 ↗」链接。**不得**把它直接当 `<img src>` —— 外站有防盗链/限流，会渲染成破图，且违反第 1 节。
    - **署名不可省**：`author` 优先照抄图上署名；图上确实没有署名时写**空串 `""`（严禁编造）**，并**必须**在 `note` 写明「已获作者授权转载（作者署名待补）」。前端 `author` 为空串即不渲染署名行。
    - **转码质量取舍（2026-09-21 实测）**：4 张母版均为 2560×1440 PNG（3.3–3.6 MB）。以 `spore_burst_bile_titan` 母版做的 `canvas` WebP 质量分档实测：q=0.8 → 502 336 B（全图 PSNR 36.51 dB）、q=0.85 → 585 516 B（37.17 dB）、**q=0.9 → 718 808 B（37.71 dB）**、q=0.92 → 796 698 B（37.89 dB）、q=0.95 → 957 558 B（38.20 dB）、q=1.0 → 2 371 376 B（视觉无损）。**取 q=0.9**（即第 7.4.1 节约定 3 的起点），且实测「文字密集区 2 倍最近邻放大」主观无糊化；**不降分辨率** —— 一图流的小字只有原分辨率才看得清。
    - **文字密集图的验收方式**：不能只看体积，必须**目视比对同一处小字区域**（部位表表头 + 表体正文，2–3 倍最近邻放大，图上下并排）；以「字可辨、笔画不粘连」为准，而不是以 PSNR 数值为准。


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
10. **`mechanics/` 页面拆分自检（2026-09-18 新增，`galactic_war` 拆分后共 5 个机制页）**：`mechanic.html?id=galactic_war` 与 `?id=galactic_war_history` 两页都要过：① console 无 error、无 `zhOnly` 警告；② 小节数 == TOC 项数 == 唯一 id 数，且 **TOC 标题与正文小节一一对应**（不再出现「机制速览」挂剧情正文）；③ 拆分后两页 `content_zh` 之和 == 拆分前该节的 `content_zh`（逐节核对长度，并用首尾边界串确认切点位置）；④ 剧情节的 `figures_zh: []` / `fully_translated: true` 原样保留（「丢弃伪图片块」的判定跟着节走）；⑤ 机制页不出现任何剧情标记短语、历史页不出现任何机制标记短语。
11. **图片尺寸自检（2026-09-18 新增）**：对上述各页在 1280 与 375 两档实测 `offsetWidth/offsetHeight` 与 `naturalWidth/naturalHeight`：① 页内 `img` 无 `h > 400px`；② 无「渲染宽 > 自然宽 × 1.25 且 > 80px」的放大（§9 第 12 条的 1.5em 模板图标分档除外）；③ 长宽比与 `naturalWidth/naturalHeight` 偏差 < 3%（`object-fit: contain` 的卡片图按容器盒计，不算变形；**判长宽比必须用未取整的 `getBoundingClientRect()`** —— 18.484×20.625 取整成 18×21 会产生 4% 的假偏差）；④ 表格内图标仍在 16–34 px；⑤ 破图 0、`documentElement.scrollWidth == clientWidth`（375 px 无横向溢出）；⑥ 正文配图尺寸与改前一致（除被修正的失衡项）。
12. **术语表自检（2026-09-18 新增）**：① `terms.json` 能被 `ConvertFrom-Json` 解析、UTF-8 无 BOM、LF 换行；② `total` == `terms` 长度；③ 每个元素的 `en` / `zh` / `source` 非空；④ `rejected` 元素的 `zh` 不得与同元素 `zh` 相同；⑤ 抽查 `Gloom` / `Automaton` 确为「阴霾 / 机器人」；⑥ 全站 grep A 项旧写法（`terms.json` 的 `rejected` 字段除外）**均为 0 处**。
13. **Navbox 自检（2026-09-18 新增，`mechanic.html?id=galactic_war_history`）**：① `References` 节出现中文 Navbox（`.section` 内 `img[width="18"]` 计 13 个）；② 图标 13/13 全部 200、破图 0；③ console error / warning / `zhOnly` 均为 0；④ 375 px 无横向溢出；⑤ `details.mg-ref` 仍为 0（`fully_translated` 未被破坏）。
14. **一图流自检（2026-09-21 新增，`enemy.html?id=<有 guides 的敌人>`）**：① 有 `guides` 的敌人页正常渲染一图流区块（标题「📊 一图流」+ 图 + 标题行 + 署名行 `图表作者：<author>（B站） · 来源：《<source_title>》 · <note>`，作者/来源有对应 URL 时为可点外链），`img` 全部 200、**破图 0**；② **没有 `guides` 的敌人页整块不渲染**（抽查 `?id=bile_spewer`、`?id=hunter` 等：DOM 里既无 `#sec-guides`，右栏「本页导航」也没有「一图流」项），且这些页本身正常；③ 点击图片**新开**原图（`target="_blank"` + `rel="noopener"`），链接指向**站内** `./assets/enemy-guides/*.webp` 而不是外站；④ **懒加载生效**：滚动到该区块**之前** `img.complete === false`（`loading="lazy"` + `decoding="async"`），滚到后变 `true`；⑤ console error 0、375 px 无横向溢出（`documentElement.scrollWidth == clientWidth`）；⑥ `scripts/validate_wiki_data.py` 退出码 0 —— `GUIDES.FIELDS` 无新增报错，`IMG.EXISTS` 覆盖 `guides[].src` 的**站内存在性**，而 **`source_url` / `author_url` 不当死链报**（它们是允许写外站 URL 的字段，键名不在 `PATH_FIELDS` / `ICON_MUST_BE_LOCAL` 里，见第 7.4.1 节）。**校验器有效性靠坏样本断言**：把 `enemies.json` 复制到临时目录后逐例改坏（`src` 指向不存在的文件 / `src` 写成外站 URL / 删 `title` / 删 `author` 且清空 `note` / `source_url` 写成相对路径），必须逐个得到**非零退出码**且报错文案命中 `IMG.EXISTS` / `GUIDES.FIELDS`；纯跑真数据全绿**不能**证明该检查项有效。

