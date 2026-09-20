# 贡献指南（HD2 中文维基 / 星图数据）

> **先说最重要的一句：你不必懂 JSON，也不必会写代码。**
> 只要你能指出「哪个条目的哪个地方不对」，就可以直接开一个
> [Issue](https://github.com/Jerry114514/Jerry114514.github.io/issues/new/choose)，
> 用表单描述清楚，维护者会接手。
>
> 如果你愿意自己动手改数据，走下面的「提 PR」流程即可，CI 会自动帮你检查。

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
| `terms.json` | **术语表** —— 全站译名的**唯一真相源**（见 §3） | 1677 |
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
3. 修改内容。因为文件已经是多行可读格式，你会看到类似这样的结构：
   ```json
   {
     "en": "Autocannon",
     "zh": "自动加农炮",
     "source": "wiki.gg"
   }
   ```
4. 拉到页面底部，在 **Commit changes** 里：
   - 填一句说明（例如 `terms: 修正 Autocannon 译名`）；
   - 选 **“Create a new branch for this commit and start a pull request”**；
   - 点 **Propose changes**。
5. 然后按提示 **Create pull request**。CI 会自动跑数据校验，结果出现在 PR 页面底部。

> 提交 PR 后请在描述里写清**依据**（出处链接 / 游戏内截图 / 社区讨论帖），
> 纯凭印象的改动维护者可能会先搁置。

### 方式 B：开 Issue（完全不用碰 JSON）

打开 [新建 Issue](https://github.com/Jerry114514/Jerry114514.github.io/issues/new/choose)，
按类型选表单：

- **译名纠错** —— 某个词的中文翻译不对
- **缺失条目** —— 少了一把武器 / 一个敌人 / 一个任务……
- **数值修正** —— 某个数值写错了
- **图片补充** —— 有更好的图标 / 截图

表单会逐项问你「英文原名」「当前中文」「建议改成」「出处证据」，
照着填就行，维护者会代为修改数据。**看不懂 JSON 完全没关系。**

---

## 3. 必须遵守的规则

### 3.1 术语以 `terms.json` 为唯一真相源

[`HD2_Wiki/data/wiki/zh/terms.json`](HD2_Wiki/data/wiki/zh/terms.json) 是**全站译名的唯一权威**。

- **引入新译名之前，先在里面搜一遍**英文原名，看是否已有约定译法；
- 如果确实要新增或修改，**就改 `terms.json` 本身**，不要在别的数据文件里另造一个译法；
- 每条术语的 `en`（英文原名）在文件内必须唯一；
- `rejected` 数组里放的是**被淘汰的译法**，不要和 `zh` 写成同一个值。

### 3.2 机制页的中文小节必须写显式 `id`

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

### 3.3 图标用站内相对路径，不要热链

- ✓ 正确：`"icon": "./assets/boosters/Hellpod_Space_Optimization_Booster_Icon.svg"`
- ✗ 错误：`"icon": "https://helldivers.wiki.gg/images/xxx.svg"`（热链外站）

图片请放进 `HD2_Wiki/assets/<数据集>/` 下，随 PR 一起提交，然后用 `./assets/...` 引用。
热链会让页面依赖第三方可用性，断网或对方改路径就全变破图。
图标字段不能留空字符串（`""`）——确实没有图片就删掉该字段。

### 3.4 不要动 CI 生成的文件

见 §1 末尾的提示框。

---

## 4. 常见错误清单（都是本项目真实踩过的坑）

| # | 错误 | 后果 / 怎么避免 |
|---|---|---|
| 1 | **JSON 末尾多了一个逗号** | 文件直接解析失败，整页数据加载不出来。最后一个元素后面**不能**有逗号。 |
| 2 | **`_zh` 只靠序号配对，不写 `id`** | 中文节整体错位（见 §3.2）。**每条都写 `id`。** |
| 3 | **`id` 里用了连字符 `-`** | `id` 只允许小写字母、数字、下划线（`ar_2_coyote`，不是 `ar-2-coyote`，也不是 `AR_2_Coyote`）。 |
| 4 | **改了 `data.json`** | 那是 CI 每 5 分钟抓取覆盖的文件，你的改动会被冲掉（见 §1）。 |
| 5 | **`enemies.json` 里 `name_zh` 留空** | 页面上会回退显示英文名。要么填中文，要么确认这是刻意保留。 |
| 6 | 用了中文引号 `“”` / 单引号 `''` | JSON 只认英文双引号 `"`。中文引号会解析失败。 |
| 7 | 在 JSON 里写注释 | JSON 不支持注释（`//` 和 `/* */` 都不行），会解析失败。 |
| 8 | 手改了 `total` 却没改数组 | `total` 必须等于对应数组的实际长度，否则 CI 报 `JSON.TOTAL`。 |
| 9 | 引用了一个不存在的 `id` | 例如 `warbonds.json` 的 `reward_refs` 指向武器 id，或 `factions.json` 的 `enemies` 指向敌人 id——目标数据集里必须真实存在。 |
| 10 | 文件存成了 GBK / 带 BOM / CRLF 换行 | 必须 **UTF-8 无 BOM + LF 换行**。GitHub 网页编辑器默认就是对的；用本地编辑器时注意设置。 |

---

## 5. CI 红了怎么办

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

## 6. 给维护者的备注（新数据字段 / 新数据集）

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
