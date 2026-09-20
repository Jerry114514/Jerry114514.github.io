# 贡献指南（HD2 中文维基 / 星图数据）

> **先说最重要的一句：投稿不需要会写代码。**
> 只要你能指出「哪个条目的哪个地方不对」，就可以直接开一个
> [Issue](https://github.com/Jerry114514/Jerry114514.github.io/issues/new/choose)，
> 用表单描述清楚，维护者会接手 —— **这条路完全不用碰数据文件**。
>
> 如果你想自己动手改数据，那确实要懂**一点点** JSON：数据类型的基础知识是必要的。
> 最典型的一条就是「**文字必须用半角双引号包住**」—— 写成中文引号 `「绝地潜兵」`、`“绝地潜兵”`
> 会让整个文件直接坏掉，页面上的数据全都加载不出来。
> 好消息是规则只有 6 条、都很简单，见下面的 **§3「📝 极简 JSON 科普」**，
> 里面还附了 4 个可以直接复制粘贴的填空模板；CI 会自动帮你检查语法与字段。

本文面向**非技术的社区投稿者**。技术性的 schema 细节请看
[`HD2_Wiki/data/wiki/zh/SCHEMA.md`](HD2_Wiki/data/wiki/zh/SCHEMA.md)（权威源）。

---

## 1. 数据在哪

所有数据都是**纯文本 JSON**（2026-09 起已统一为 2 空格缩进的多行可读格式），
可以直接在 GitHub 网页上阅读和编辑。

### 图鉴站数据 —— `HD2_Wiki/data/wiki/zh/`

| 文件 | 内容 | 大致条目数 |
|---|---|---|
| `weapons.json` | **武器**（主武器 / 副武器 / 投掷物）及其数值、特性、tips | 89 |
| `stratagems_full.json` | **战略配备**（完整条目：呼叫代码、冷却、数值、详细面板） | 109 |
| `loadout.json` | **配装视图**的战略配备精简列表（四维评分，给「配装」页用） | 89 |
| `enemies.json` | **敌人**（阵营、血量、部位/弱点、攻击方式、出现难度） | 95 |
| `missions.json` | **任务**（主目标 / 各阵营目标 / 战术目标，含步骤与战术信息） | 5 类 / 105 项 |
| `boosters.json` | **强化资源**（Boosters：效果说明、所属债券、价格） | 20 |
| `warbonds.json` | **战争债券**（Warbonds：逐页奖励表、价格、发布时间） | 25 |
| `factions.json` | **阵营**（超级地球 + 三大敌对阵营的色彩与敌人清单） | 3 |
| `terms.json` | **术语表** —— 全站译名的**唯一真相源**（见 §4） | 1677 |
| `mechanics/*.json` | **机制页英文主干**（damage / difficulty / galactic_war / galactic_war_history / status_effects） | 5 页 |
| `mechanics/*_zh.json` | 机制页的**中文覆盖**（按小节覆盖中文标题与正文） | 5 页 |
| `mechanics/index.json` | 机制页的目录卡片 | 5 |
| `index.json` + `blocks/*.json` | 图鉴首页的区块与文案（欢迎语、导航分类、关于） | 4 |
| `ds_terms.json` | 特例术语数据（历史遗留，另有专门说明） | — |

### 星图站数据 —— `HD2-Galatic_war-Map/`

| 文件 | 内容 | 备注 |
|---|---|---|
| `tables/*.json` | 星图对照表（星球索引、星图连线、行星生态、战略配备镜像表、变量对照表…） | 机器同步，**一般不需要人工改** |
| `data/campaign_zh.json` | **「进行中的战役」中文化层**（战役名、阶段名、奖励类型、状态） | 人工维护 ✓ |
| `banner.json` | 星图首页顶部横幅文案 | 人工维护 ✓ |

> ### ⛔ 不要动 CI 自动生成的文件
>
> 下面这些文件**由 GitHub Actions 每 5 分钟 / 每天自动抓取并覆盖**，
> 你手动改的内容会在下一次自动运行后被冲掉：
>
> - `HD2-Galatic_war-Map/data.json`
> - `HD2-Galatic_war-Map/data/history/*`（如 `player_distribution.json`）
> - `HD2-Galatic_war-Map/data/translated/TransNews.json`
>
> 想改这些内容，请改**上游数据源**或对应的中文化层文件（如 `campaign_zh.json`）。

---

## 2. 怎么改

### 方式 A：在 GitHub 网页上直接改（推荐，最快）

1. 在仓库里找到要改的 JSON 文件（例如
   [`HD2_Wiki/data/wiki/zh/terms.json`](HD2_Wiki/data/wiki/zh/terms.json)）。
2. 点右上角的**铅笔图标**（Edit this file）。
3. 修改内容。因为文件已经是多行可读格式，你会看到类似这样的结构
   （下面是 [`terms.json`](HD2_Wiki/data/wiki/zh/terms.json) 里**真实存在**的一条）：
   ```json
   {
     "en": "AC-8 Autocannon",
     "zh": "AC-8 机炮",
     "source": "stratagems_full.json",
     "note": "战略配备"
   }
   ```
4. 拉到页面底部，在 **Commit changes** 里：
   - 填一句说明（例如 `terms: 修正 AC-8 Autocannon 译名`）；
   - 选 **“Create a new branch for this commit and start a pull request”**；
   - 点 **Propose changes**。
5. 然后按提示 **Create pull request**。CI 会自动跑数据校验，结果出现在 PR 页面底部。

> 提交 PR 后请在描述里写清**依据**（出处链接 / 游戏内截图 / 社区讨论帖），
> 纯凭印象的改动维护者可能会先搁置。

### 方式 B：开 Issue 用表单（不想碰 JSON 就走这条）

打开 [新建 Issue](https://github.com/Jerry114514/Jerry114514.github.io/issues/new/choose)，
按类型选表单：

- **译名纠错** —— 某个词的中文翻译不对
- **缺失条目** —— 少了一把武器 / 一个敌人 / 一个任务……
- **数值修正** —— 某个数值写错了
- **图片补充** —— 有更好的图标 / 截图

表单会逐项问你「英文原名」「当前中文」「建议改成」「出处证据」，
照着填就行，维护者会代为修改数据。**不想碰 JSON 也可以走这条路，直接填表单即可。**

---

## 3. 📝 极简 JSON 科普（没有编程经验也能看懂）

> **一句话定位**：JSON 只是「**用固定格式记笔记**」—— 一个 `{ }` 就是一张卡片，
> 里面写上「字段名：值」。你不需要成为程序员，但**下面这几条基础规则必须知道**。
>
> 尤其是第一条「**文字必须用半角双引号包住**」：写成中文引号 `「绝地潜兵」`、`“绝地潜兵”`，
> 会让**整个文件直接坏掉**，那一页的数据全都加载不出来。
> 好消息是整张规则表只有 6 条，记住它们就能改数据了。

### 3.1 六条核心规则（每条都给出 ✅ / ❌ 对照）

**规则 1 · 文字（字符串）必须用半角双引号 `"` 包住**

- ✅ `"name": "绝地潜兵"`
- ❌ `"name": 「绝地潜兵」`（中文书名号）、`"name": “绝地潜兵”`（中文弯引号）、`"name": '绝地潜兵'`（半角单引号）
- 👉 **全角／中文引号是最常见的坏文件原因。** 判据很简单：合法的 `"` 很窄、竖直，
  把输入法切到**英文半角**再打就对了。中文标点 `「」『』“”‘’（）【】` 一个都不能当引号用。

**规则 2 · 数字不加引号**

- ✅ `"capacity": 45`
- ❌ `"capacity": "45"`、`"capacity": '45'`
- 👉 加了引号就变成**文本**：排序会按字符比大小（`"9"` 会排在 `"45"` 后面），
  需要计算的地方也会按字符串处理，容易出现说不清的怪现象。
- ⚠️ **唯一例外**：表格 `tables[].rows` 里的单元格**规定一律存字符串**，那里写 `"15"` 才是对的
  （`SCHEMA.md` §7.1 明文规定，见 §3.6.2）。遇到表格时**不要**套用本条。

**规则 3 · 真假值只写 `true` / `false`（小写、不加引号）**

- ✅ `"name_zh_tbd": false`
- ❌ `"name_zh_tbd": "false"`（加了引号 = 文本）、`"name_zh_tbd": False`、`"name_zh_tbd": TRUE`（大小写不对）
- ❌ `"name_zh_tbd": 否`、`"name_zh_tbd": 0`（用别的词表达真假）

**规则 4 · 空值写 `null`（小写、不加引号）**

- ✅ `"price": null`
- ❌ `"price": "null"`、`"price": NULL`、`"price": "无"`、`"price": "待定"`
- 👉 `null` = **已知但未公布**；`""` = **确认无内容**。两者语义不同、不得混用
  （`SCHEMA.md` 第 4 节第 3 条）。确实没有内容时才写空字符串 `""`。

**规则 5 · 每项之间用半角逗号 `,`，最后一项后面绝对不能有逗号**

- ✅

  ```json
  {
    "en": "AC-8 Autocannon",
    "zh": "AC-8 机炮",
    "source": "stratagems_full.json"
  }
  ```

- ❌

  ```json
  {
    "en": "AC-8 Autocannon",
    "zh": "AC-8 机炮",
    "source": "stratagems_full.json",
  }
  ```

- 👉 **这是第二常见的错误**，而且专挑「新增一条」的时候发生：要把新条目贴进去，
  就得给**前一条的最后一行补一个逗号**，同时新条目的最后一行**不能**有逗号 —— 两个方向都要看。

**规则 6 · 括号必须成对，而且只用半角**

- `{ }` 是**对象**（一张卡片），`[ ]` 是**数组**（一串卡片）。
- ✅ `"traits": ["燃烧弹", "中甲穿透"]`
- ✅ `{ "id": "ar_2_coyote", "name": "AR-2 野狼" }`
- ❌ `"traits": 【"燃烧弹", "中甲穿透"】`（中文方括号）、`"traits": （"燃烧弹"）`（中文圆括号）
- ❌ 少一个 `}` 或多一个 `]` —— 复制条目时删多了 / 漏删一个括号是最常见的形态
- 👉 一条经验：改完**数一数开括号和闭括号的数量是否一样**，比肉眼找错快得多。

### 3.2 中文直接写就行，不要转义

- ✅ `"zh": "终结族"`
- ✅ `"zh": "\u7ec8\u7ed3\u65cf"` —— 语法上合法，但**没必要**，人眼也看不懂。**别这么写。**
- 文件本身是 **UTF-8 无 BOM + LF 换行**；GitHub 网页编辑器默认就是对的。

### 3.3 最安全的改法：复制相邻的同类条目，只改里面的值

1. 在文件里找到**一条同类型、已经很正常的条目**（例如要给 `boosters.json` 加一条，
   就先找同债券的另一条强化资源）。
2. **整段复制**从 `{` 到 `}`（连结尾的逗号一起），粘到你要放的位置。
3. **只改「值」** —— 也就是冒号右边、双引号里面的文字，或者那些数字。
   **字段名、括号、逗号、字段顺序，一个字都别动。**
4. 同一条目里**原有字段一个都不要删**：删了页面上就显示不出这一项，CI 也会报「必填字段缺失」。

> **为什么这样最安全**：JSON 的语法错误（引号 / 逗号 / 括号）占了新手投稿失败原因的绝大多数。
> 复制一条本来就合法的条目，语法结构天然是对的，你只需要把值换掉。
> **反过来，从零手写一个大括号，是最容易出错的路径。**

### 3.4 改完自查三步

1. **在 GitHub 的改动预览（diff）里逐行看**
   你只改了几行，diff 就只显示这几行：中文引号 `「」` `“”`、多出来的逗号、少了的 `}`
   **一眼就能看见**。这一步花 10 秒，能省掉一次 CI 变红。
2. **提交后 CI 会自动跑 `validate-data`**
   它同时检查语法、必填字段与取值。变红了就点 PR 底部的 **Checks → Validate Data → Summary**，
   报告里 `文件:行号` + `[哪个字段]` + `→ 建议` 三样都给全了（读法见 §6）。
3. **看不懂报错就贴出来问**
   在 PR 或 Issue 里把 CI 的报错原文**原样贴出来**，加一句「这里我看不懂」，维护者会接手。
   **千万不要**为了让 CI 变绿而删数据、或者把 `total` 改成别的数字去将就 —— 那比报错更糟。

### 3.5 数据类型的常识表（投稿最常遇到的那几种）

| 字段（举例） | 该长什么样 | 例子 |
|---|---|---|
| `id` | 字符串，**小写 snake_case**（只允许小写字母、数字、下划线） | `"ar_2_coyote"`（❌ `"AR-2 Coyote"`、❌ `"ar-2-coyote"`） |
| `name` / `name_en` / `en` / `zh` | 字符串，半角双引号包住 | `"name": "AR-2 野狼"` |
| `price` / `capacity` / `warbond_page` / `fire_rate` | **数字**（不加引号），或 `null`（未公布） | `"price": 15` ／ `"price": null` |
| `release_status` | 枚举字符串，**只有两个合法值** | `"released"` ／ `"unreleased"`；缺省 = `"released"`，已发布的条目**不用写**这个字段 |
| `name_zh_tbd` | 布尔：`true` / `false` | `"name_zh_tbd": false` |
| `traits` / `steps` / `enemies` | 数组 `[ ]`，元素是字符串，各自加双引号 | `"traits": ["燃烧弹", "中甲穿透"]` |
| `warbond_color` | 字符串，6 位十六进制颜色（`#RRGGBB`） | `"warbond_color": "#FFB000"` |
| `sections` / `tables` / `variants` | 数组 `[ ]`，元素是**对象 `{ }`**；没有就写 `[]` | `"sections": [{ "title": "⚙️ 具体效果", "items": ["…"] }]` |
| `rows`（表格的数据行） | **数组的数组**，而且**每个格子都是字符串** | `"rows": [["奖励名", "强化资源", "15"]]` ← 这里的 `"15"` 才是对的 |
| `null` | 空值（已知但未公布），不加引号 | `"price": null` |

> 字段的完整清单、含义与必填性，以 [`SCHEMA.md`](HD2_Wiki/data/wiki/zh/SCHEMA.md) 为唯一权威。
> 上面这张表只是「投稿时最常遇到的那几种」；遇到表里没有的字段，先查 `SCHEMA.md`，或直接问维护者。
>
> ⚠️ **同一个字段名在不同数据集里可能是不同类型**：例如 `damage` 在 `weapons.json` 的 `stats_short` 里
> 是数字，在 `enemies.json` 里却是一长串文本（把该敌人的各种攻击伤害写在了一起）。
> 所以判断「这里该写数字还是该写文字」时，**以你正在改的这个文件里的同类条目为准**。

### 3.6 四个可复制的填空模板

> **用法**：复制整段 → 替换掉里面的值 → 粘回文件。
> 模板里 `__这样用下划线包起来的__` 都是**占位值**，必须换成你自己的内容；
> 没有下划线的部分（字段名、括号、逗号、字段顺序）**原样照抄，不要改**。
> JSON **不支持注释**（`//` 和 `/* */` 都会让文件坏掉），所以说明只能写在模板外面 —— 就像现在这样。

#### 3.6.1 改一条译名 —— `HD2_Wiki/data/wiki/zh/terms.json`

- **改已有的条目**：只改 `zh` 的值。`en` 是索引键，一动就等于新建一条。**不用改 `total`。**
- **加新条目**：贴在 `terms` 数组里任意位置（建议放在字母顺序相近的位置），
  然后把顶层的 `"total"` **加 1**（当前 1677 → 1678）。
- **必填**：`en`、`zh`、`source` —— 三个都不能是空字符串。
- **`en` 在文件里必须唯一，而且大小写敏感**：`Autocannon` 与 `autocannon` 会被当成两条。
- **`source` 不是随便写的**：取 `SCHEMA.md` §7.12 来源优先级表里的那一列，例如
  `口径（A 项）`（本项目已确认的口径）、`starmap.json`、`index.html#BUILTIN_PLANET_CN`、
  `hd2_variables.json`、`weapons.json`（站内数据集条目名）、`术语对照表_送审.md`。
  不确定就写 `口径（A 项）`，并在 `note` 里把依据讲清楚。
- **`note` 建议写**：记下「为什么这么译 / 谁给定的口径 / 旧稿曾作什么」。
- **`rejected` 只在「这个英文以前有过别的写法、现在被裁定淘汰」时才加**，
  并且里面的 `zh` **不能等于** `zh`（CI 的 `REF.TERMS` 会查这一条）。
- **容易错**：`zh` 里夹了中文引号 `「」` / `“”`（整个文件坏掉）；`en` 大小写抄错（搜不到，还可能和已有条目重复）；加了新条目却忘了改 `total`。

**模板 A · 最简一条（必填字段）**

```json
{
  "en": "__英文原名：逐字照抄，大小写敏感__",
  "zh": "__你建议的中文译名__",
  "source": "__来源，取值见上面的说明__",
  "note": "__为什么这么译 / 依据，可留空但建议写__"
}
```

**模板 B · 带「被淘汰写法」的一条**（不用 `rejected` 就整个别写，此时用模板 A）

```json
{
  "en": "__英文原名__",
  "zh": "__裁定后的中文译名__",
  "source": "__来源__",
  "note": "__裁定依据__",
  "ambiguous": false,
  "rejected": [
    {
      "zh": "__被淘汰的旧译法__",
      "source": "__它来自哪里，例如：本站旧稿（xxx.json）__",
      "tier": "__旧术语表__"
    }
  ]
}
```

> - `ambiguous` 也是选填：`true` 表示「这个词的译法取决于语境、不能机械套用」，
>   此时把说明写进 `note`（`SCHEMA.md` §7.12）。
> - 要删掉 `rejected` 时，记得把**它上一行末尾的逗号一起删掉**。

#### 3.6.2 加一个强化资源 —— `HD2_Wiki/data/wiki/zh/boosters.json`

> 字段名与顺序**逐个核对过**：来自 `SCHEMA.md` §7.1 与文件里真实的 20 条（2026-09 实测）。
> 真实顺序是
> `id → name → name_en → icon → warbond → warbond_zh → warbond_page → warbond_color → price → price_zh →（release_status）→ description → description_zh → overview_zh → sections → tables → related → source_url`。

- **必填**：上面列出的**全部**字段（`release_status` 除外）—— CI 会逐项检查，一个都不能少。
- **`id`**：小写 snake_case，由英文名派生（`Hellpod Space Optimization` → `hellpod_space_optimization`），
  **只允许小写字母、数字、下划线**。
- **`icon`**：**必须是站内相对路径** `./assets/boosters/<文件名>.svg`，
  图片要随 PR 一起放进 `HD2_Wiki/assets/boosters/`。
  ⚠️ 贴 wiki.gg 链接 CI 直接变红 —— `boosters.json` 里**没有**热链的历史例外额度
  （其它几个文件有，见 §3.6.3 / §3.6.4）。
- **`warbond` / `warbond_zh` / `warbond_color`**：所属债券的英文名 / 中文名 / 主题色，**照抄同债券的其它条目**。
- **`warbond_page`**：债券内页码（数字）；未公布写 `null`。
- **`price`**：勋章价格（数字）；未公布写 `null`。
  **`price_zh`** 是展示文案：有价写 `勋章 ×15`，未公布写 `待发布`。
- **`description`**：英文原文简介；确实没有就写 `""`。`description_zh` / `overview_zh` 写中文。
- **`sections`**：分节正文，元素形如 `{ "title": "⚙️ 具体效果", "items": ["…"] }`；没有就写 `[]`。
- **`tables`**：数值表；**没有就写 `[]`，不能整个删掉这个字段**。
  ⚠️ 表里 `rows` 的**每个格子都必须是字符串**，数字也写成 `"15"` —— 这是 `SCHEMA.md` §7.1 的明文规定，
  **不适用** §3.1 规则 2「数字不加引号」（见 §3.5 的 `rows` 一行）。
- **`related`**：相关条目 `id` 数组，没有就写 `[]`。
- **`source_url`**：该条目的 wiki.gg 页面绝对 URL。
- **别忘了**：顶层 `"total"` 要 **+1**（当前 20 → 21）。
- **容易错**：`icon` 写了外站链接；`warbond_page` / `price` 该写 `null` 却写成了 `""` 或 `"待定"`；
  忘了改 `total`；把 `tables` 或 `sections` 整个删掉。

**模板**

```json
{
  "id": "__new_booster_id__",
  "name": "__中文名__",
  "name_en": "__English Name__",
  "icon": "./assets/boosters/__文件名.svg__",
  "warbond": "__所属债券英文名，照抄同债券条目__",
  "warbond_zh": "__所属债券中文名，照抄同债券条目__",
  "warbond_page": 0,
  "warbond_color": "__照抄同债券条目的 #RRGGBB__",
  "price": 0,
  "price_zh": "__勋章 ×0__",
  "description": "__英文原文简介（确实没有就写空字符串）__",
  "description_zh": "__中文简介__",
  "overview_zh": "__中文概述__",
  "sections": [],
  "tables": [],
  "related": [],
  "source_url": "https://helldivers.wiki.gg/wiki/__Page_Name__"
}
```

> - 模板里的 `0` 是**占位数字**，必须换成真实的页码 / 价格（未公布写 `null`）。
> - **「已公布但还不能获取」的条目怎么写**：在 `price_zh` 之后加一行 `"release_status": "unreleased",`，
>   并把 `warbond_page`、`price` 都写成 `null`，`price_zh` 写 `待发布`
>   （实测条目 `integrated_extinguishers` 就是这个写法）。
>   其它情况**不要写** `release_status` —— 缺省就等于 `"released"`。

#### 3.6.3 加一件武器 —— `HD2_Wiki/data/wiki/zh/weapons.json`

> 字段名与顺序**逐个核对过**：来自 `SCHEMA.md` §3 / §7.3 与文件里真实的 89 条（2026-09 实测）。
> 真实顺序是
> `id → name → name_en → category → subcategory → subcategory_name → stats_short → stats_full → traits → unlock → description → lore → variants → tips → related → source_url → detailed_stats → icon`
> （`icon` 在**末尾**，照抄现状即可，别自己去挪位置）。

- **必填**：上面这一串**全部**字段。
- **`category` / `subcategory` / `subcategory_name`**：照抄同小类别的武器。实测取值只有这些：

  | `category` | `subcategory` | `subcategory_name` |
  |---|---|---|
  | `primary` | `assault_rifles` | 突击步枪 |
  | `primary` | `energy_based` | 能量武器 |
  | `primary` | `explosives` | 爆炸武器 |
  | `primary` | `shotguns` | 霰弹枪 |
  | `primary` | `special` | 特殊武器 |
  | `primary` | `submachine_guns` | 冲锋枪 |
  | `primary` | `marksman_rifles` | 精确射手步枪 |
  | `secondary` | `melee` | 近战武器 |
  | `secondary` | `special` | 特殊武器 |
  | `secondary` | `pistols` | 手枪 |
  | `throwables` | `throwables` | 投掷物 |

  （文件顶层的 `categories` 里还登记了一个 `support`，但它的 `count` 是 `0`，实测**没有任何武器**用它。）
- **`stats_short`**：固定三项 —— `damage`（数字）、`capacity`（数字）、
  `penetration`（字符串，实测只有 `light` / `medium` / `heavy`）。
- **`stats_full`**：固定 11 项 —— `damage`、`damage_type`、`capacity`、`fire_rate`、`recoil`、
  `penetration`、`reserve_ammo`、`fire_modes`（字符串数组）、`ergonomics`、`reload_time`、`dps`。
  没有数据的项写 `null`；**`reload_time` 是例外** —— 实测该文件里 54 条写空字符串 `""`、35 条写 `"3s"` 这种。
  `damage_type` 的实测取值：`Ballistic` / `Arc` / `Explosion` / `Melee` / `Fire` / `Gas` / `DPS` / `Laser` / `Projectile`。
- **`traits`**：中文标签数组（如 `["燃烧弹", "中甲穿透"]`），没有就 `[]`。
- **`unlock`**：解锁条件（字符串）。实测这个文件里**中英文都有**，照抄同债券其它条目的风格即可。
- **`description` / `lore` / `variants` / `tips`**：都是必填字段。
  实测 `description` 是英文简介（89 条里 88 条有内容）；`lore` 89 条**全是空字符串 `""`**；
  `variants` 与 `tips` 89 条**全是空数组 `[]`**。照这个现状写即可，**不能删字段**。
- **`related`**：⚠️ 实测 89 条**全部是空对象 `{}`**（不是数组！）。
  这是 `SCHEMA.md` §8 登记在案的历史不一致（canonical 是字符串数组，本文件未迁移）。
  **照抄 `{}` 即可，不要自作主张改成 `[]`** —— 否则你会变成全文件唯一一个异类。
- **`detailed_stats`**：详细面板，形态很杂。实测有 12 条是空对象 `{}`，其余至少含 `"attacks"`。
  攻击元素形如 `{ "name": "…", "type": "…", "projectile": {…}, "damage": {…}, "penetration": {…}, "special_effects": {…} }`，
  `type` 实测有 `projectile` / `explosion` / `status`。
  **最省事的做法：整段照抄一把同类武器的 `detailed_stats`，只改里面的数值。**
- **`icon`**：⚠️ **必须用站内相对路径** `./assets/weapons/<文件名>.png`，图片随 PR 放进 `HD2_Wiki/assets/weapons/`。
  **不要贴 wiki.gg 链接**：本文件现有 89 条**全部**是热链，那是登记在案的历史例外、**额度正好用满 89** ——
  你**新增**一条热链，`IMG.HOTLINK` 就会超过基线上限，CI 直接变红。
- **别忘了**：顶层 `"total"` 要 **+1**（当前 89 → 90）。
- **容易错**：`id` 里用了连字符或大写（❌ `AR-2 Coyote` / ✅ `ar_2_coyote`）；
  `stats_short` / `stats_full` 漏项；`related` 被改成了 `[]`；`icon` 贴了外站链接；忘了改 `total`。

**模板**

```json
{
  "id": "__new_weapon_id__",
  "name": "__中文名__",
  "name_en": "__English Name__",
  "category": "__primary / secondary / throwables__",
  "subcategory": "__照抄同小类别武器的 subcategory__",
  "subcategory_name": "__对应的中文名__",
  "stats_short": {
    "damage": 0,
    "capacity": 0,
    "penetration": "__light / medium / heavy__"
  },
  "stats_full": {
    "damage": 0,
    "damage_type": "__Ballistic / Explosion / Fire 等__",
    "capacity": 0,
    "fire_rate": 0,
    "recoil": 0,
    "penetration": "__light / medium / heavy__",
    "reserve_ammo": 0,
    "fire_modes": [],
    "ergonomics": 0,
    "reload_time": "__3s，或空字符串__",
    "dps": 0
  },
  "traits": [],
  "unlock": "__解锁条件__",
  "description": "__英文原文简介__",
  "lore": "",
  "variants": [],
  "tips": [],
  "related": {},
  "source_url": "https://helldivers.wiki.gg/wiki/__Page_Name__",
  "detailed_stats": {
    "attacks": []
  },
  "icon": "./assets/weapons/__文件名.png__"
}
```

> - 上面那些 `0` 是**占位数字**，必须换成真实值；确实没有该项就写 `null`（`reload_time` 写 `""`）。
> - `detailed_stats` 最少写成 `{ "attacks": [] }` 就合法（实测有 12 条是更空的 `{}`）；
>   有详细数据时，**照抄一把同类武器的整块 `detailed_stats`** 再改数，比从零拼安全得多。

#### 3.6.4 加一个任务 —— `HD2_Wiki/data/wiki/zh/missions.json`

> 字段名与顺序**逐个核对过**：来自 `SCHEMA.md` §7.6、校验器登记的必填项、以及文件里真实的 105 个任务（2026-09 实测）。

- **这个文件是两层的**：顶层 `categories[]` → 每个分类里的 `tasks[]`。
  任务条目要贴进**对应分类**的 `tasks` 数组里。分类自己的字段是 `id` / `name` / `name_zh` / `tasks`。
- **分类（实测 5 个）**：`main`（主要目标）、`terminid`（终结族特殊任务）、
  `automaton`（机器人特殊任务）、`illuminate`（光能者特殊任务）、`tactical`（战术目标）。
- ⚠️ **注意命名方向**：**分类 `id` 用单数**（`terminid`），而**任务里的 `faction` 用复数**（`terminids`）。
- ⚠️ **本文件是反向命名**：任务的 `name` 存**英文**、`name_zh` 存中文
  （`SCHEMA.md` §8 登记在案的历史不一致）。**别改成 `name` 放中文** —— 前端按 `name_zh || name` 取值。
- **必填（CI 逐项检查）**：`id`、`name`、`name_zh`、`icon`、`difficulty`、`difficulty_zh`、`faction`、
  `time_limit`、`steps`、`steps_zh`、`tactical_info`、`tactical_info_zh`。
- **`id`**：小写 snake_case，**在所属分类内唯一**（跨分类允许重复，那是登记在案的历史例外，别去动它）。
- **`icon`**：站内相对路径 `./assets/missions/<文件名>.svg`（图片随 PR 放进 `HD2_Wiki/assets/missions/`），
  **或者没有图就写 `null`**（实测 `secondary_extraction_zone` 用的就是 `null`）。
  ⚠️ 两件事都要注意：① **不要写空字符串 `""`**，那是错误写法；
  ② 现有 105 个任务里 104 个是 wiki.gg 热链、**额度正好用满** —— **你新增一条热链，CI 直接变红。**
- **`faction`**：实测取值 `any` / `terminids` / `automatons` / `illuminate` / `super_earth`。
- **`difficulty` / `difficulty_zh`**：英文与中文的难度区间，
  例如 `"Trivial to Super Helldive"` / `"易如反掌 至 超级绝地俯冲"`。
- **`time_limit` / `time_limit_zh`**：时间限制文案；**没有就写 `""`**（实测战术目标大量为空）。
  `time_limit_zh` 是选填，可以不写。
- **`steps[]` / `steps_zh[]`**：**字符串数组**，英文与中文**一一对应、条数必须相同**。
- **`tactical_info` / `tactical_info_zh`**：⚠️ 是**一整段字符串**，不是数组！没有就写 `""`。
- **选填的 `faction_label`**：实测 `tactical` 分类的 34 个任务**全部**都有（如 `"Automaton Legion"`），
  其余 4 个分类**一个都没有** —— 加 `tactical` 分类的任务时照抄同分类条目即可。
- **这个文件顶层没有 `total`**，不用改。
- **容易错**：`name` / `name_zh` 写反；`steps` 与 `steps_zh` 条数不一致；
  把 `tactical_info` 写成了数组；`icon` 写了 `""`（应该写 `null`）或贴了外站链接；
  `faction` 抄成了单数 `terminid`。

**模板**

```json
{
  "name": "__English Mission Name__",
  "icon": null,
  "difficulty": "__Trivial to Super Helldive__",
  "id": "__new_mission_id__",
  "name_zh": "__中文任务名__",
  "faction": "__any / terminids / automatons / illuminate / super_earth__",
  "time_limit": "__40 Minutes，或空字符串__",
  "steps": [
    "__英文步骤一__",
    "__英文步骤二（只有一步就删掉这一行，以及上一行末尾的逗号）__"
  ],
  "tactical_info": "__英文战术信息（一整段），没有就写空字符串__",
  "steps_zh": [
    "__中文步骤一__",
    "__中文步骤二__"
  ],
  "tactical_info_zh": "__中文战术信息（一整段），没有就写空字符串__",
  "difficulty_zh": "__易如反掌 至 超级绝地俯冲__",
  "time_limit_zh": "__40 分钟（选填）__"
}
```

> - 任务字段的**真实顺序**（实测）是：
>   `name → icon → difficulty → id → name_zh → faction → time_limit → steps → tactical_info → steps_zh → tactical_info_zh → difficulty_zh → time_limit_zh`，
>   模板已按这个顺序排好。顺序不影响解析，但照抄现状能让 diff 更干净。
>   （`tactical` 分类的任务在 `icon` 之后还多一个选填的 `faction_label`。）
> - `icon` 有图时把 `null` 换成 `"./assets/missions/__文件名.svg__"`。
> - 只写一个步骤也可以，只要 `steps` 与 `steps_zh` 的条数保持一致。

---

## 4. 必须遵守的规则

### 4.1 术语以 `terms.json` 为唯一真相源

[`HD2_Wiki/data/wiki/zh/terms.json`](HD2_Wiki/data/wiki/zh/terms.json) 是**全站译名的唯一权威**。

- **引入新译名之前，先在里面搜一遍**英文原名，看是否已有约定译法；
- 如果确实要新增或修改，**就改 `terms.json` 本身**，不要在别的数据文件里另造一个译法；
- 每条术语的 `en`（英文原名）在文件内必须唯一；
- `rejected` 数组里放的是**被淘汰的译法**，不要和 `zh` 写成同一个值。

### 4.2 机制页的中文小节必须写显式 `id`

`mechanics/*_zh.json` 里的每个小节都要写明它对应英文主干的哪一节：

```json
{
  "id": "Damage_Calculation",
  "title_zh": "伤害计算",
  "content_zh": "<p>……</p>"
}
```

`id` 的值必须**逐字等于** `mechanics/<同名>.json`（主干）里那个小节的 `id`。

> **为什么必须写**：不写 `id` 时，合并引擎只能靠**数组序号**把中文节对齐到英文节。
> 只要上游主干多一节、少一节，或者你漏译了一节，**后面所有中文正文就会整体错位**——
> 标题和内容对不上，而且不报错、页面看起来还很正常。这是本项目踩过的最大的坑之一。

### 4.3 图标用站内相对路径，不要热链

- ✓ 正确：`"icon": "./assets/boosters/Hellpod_Space_Optimization_Booster_Icon.svg"`
- ✗ 错误：`"icon": "https://helldivers.wiki.gg/images/xxx.svg"`（热链外站）

图片请放进 `HD2_Wiki/assets/<数据集>/` 下，随 PR 一起提交，然后用 `./assets/...` 引用。
热链会让页面依赖第三方可用性，断网或对方改路径就全变破图。
图标字段不能留空字符串（`""`）——确实没有图片就删掉该字段。

### 4.4 不要动 CI 生成的文件

见 §1 末尾的提示框。

---

## 5. 常见错误清单（都是本项目真实踩过的坑）

| # | 错误 | 后果 / 怎么避免 |
|---|---|---|
| 1 | **JSON 末尾多了一个逗号** | 文件直接解析失败，整页数据加载不出来。最后一个元素后面**不能**有逗号。 |
| 2 | **`_zh` 只靠序号配对，不写 `id`** | 中文节整体错位（见 §4.2）。**每条都写 `id`。** |
| 3 | **`id` 里用了连字符 `-`** | `id` 只允许小写字母、数字、下划线（`ar_2_coyote`，不是 `ar-2-coyote`，也不是 `AR_2_Coyote`）。 |
| 4 | **改了 `data.json`** | 那是 CI 每 5 分钟抓取覆盖的文件，你的改动会被冲掉（见 §1）。 |
| 5 | **`enemies.json` 里 `name_zh` 留空** | 页面上会回退显示英文名。要么填中文，要么确认这是刻意保留。 |
| 6 | 用了中文引号 `“”` / 单引号 `''` | JSON 只认英文双引号 `"`。中文引号会解析失败。 |
| 7 | 在 JSON 里写注释 | JSON 不支持注释（`//` 和 `/* */` 都不行），会解析失败。 |
| 8 | 手改了 `total` 却没改数组 | `total` 必须等于对应数组的实际长度，否则 CI 报 `JSON.TOTAL`。 |
| 9 | 引用了一个不存在的 `id` | 例如 `warbonds.json` 的 `reward_refs` 指向武器 id，或 `factions.json` 的 `enemies` 指向敌人 id——目标数据集里必须真实存在。 |
| 10 | 文件存成了 GBK / 带 BOM / CRLF 换行 | 必须 **UTF-8 无 BOM + LF 换行**。GitHub 网页编辑器默认就是对的；用本地编辑器时注意设置。 |

---

## 6. CI 红了怎么办

数据改动会触发 **Validate Data** 工作流（`.github/workflows/validate-data.yml`）。

### 怎么看到报错

1. 打开你的 PR 页面，拉到最下方 **Checks** 区域，点 **Validate Data** → **validate**。
2. 左侧点 **Summary** —— 维护者专门把错误摘要写在了这里（`$GITHUB_STEP_SUMMARY`），
   不用翻几百行日志。
3. 报告一段一段列出来，每条长这样：

   ```
   ✗ HD2_Wiki/data/wiki/zh/weapons.json:293 [$.weapons[3].id] weapons 的 id 'AR-2 Coyote' 不是小写 snake_case
         → 建议：只允许小写字母、数字、下划线：把连字符改成下划线、去掉大写与空格
   ```

   读法：
   - `文件:行号` —— 去哪一行改（`HD2_Wiki/.../weapons.json` 第 293 行）
   - `[$.weapons[3].id]` —— 具体是哪个字段（`weapons` 数组第 4 项的 `id`）
   - 前半句 —— 哪里错了
   - `→ 建议` —— **照着改就行**
4. 直接在 PR 里再改一次并提交，CI 会自动重跑（同一 PR 的旧运行会被自动取消）。

### 报告里的三类条目

- **【必须修的问题】** —— 就是它们让 CI 变红，必须改。
- **【已登记的历史例外（基线）】** —— 项目里历史遗留、已经登记在案的已知问题，
  **不影响通过**；但如果你**新增**了同类问题，就会变成错误。
- **【信息项】** —— 只是提示，不影响结果。

### 改不动 / 看不懂怎么办

**在 PR 或 Issue 里直接说一句就行**，附上正确的值，维护者会接手。
不要为了「让 CI 变绿」而删数据或改 `total` 去将就——那比报错更糟。

---

## 7. 给维护者的备注（新数据字段 / 新数据集）

**加了新字段或新数据集时，要同步更新校验器**，否则新字段处于「没人检查」的状态：

- 校验器：`scripts/validate_wiki_data.py`
  （`REQUIRED_TOP` / `REQUIRED_ITEMS` / `NESTED_REQUIRED` / `ID_SETS` /
  `MECH_COVERAGE` / `KNOWN` 等登记表）
- Schema 文档：`HD2_Wiki/data/wiki/zh/SCHEMA.md`
- CI 触发路径：`.github/workflows/validate-data.yml` 的 `paths:`

只改数据不改校验器 → 新字段无人检查（**绿着但坏了**）；
只改校验器不改 SCHEMA → 投稿者不知道要写什么。

本地自查：

```bash
python scripts/validate_wiki_data.py              # 校验，失败则非零退出
python scripts/validate_wiki_data.py --list-checks  # 打印全部检查项与基线表
python scripts/validate_wiki_data.py --strict     # 忽略基线，把历史例外也当错误
```

> 改动校验器本身时，**务必故意造坏样本验证它真的会失败**——
> 「绿着但坏了」是这个项目最大的教训。校验器只在出错路径上跑，
> 光跑一遍真数据全绿**不能**证明它有效。
