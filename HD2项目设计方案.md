# HD2 真理部项目 · 设计方案文档

> 版本：v2.0（2026-09-10） · 上一版：HD2项目总结_2026-08-28（.cowork-temp）
> 本文档为**本地设计留档，不进入仓库同步**（已加入 `.gitignore`）
> 项目根目录：`E:\GitLoadWareHouse\Jerry114514.github.io`

---

## 一、项目总览

《绝地潜兵2》（Helldivers 2）中文社区项目「HD2 真理部」，由**三个子系统 + 一条翻译管线**组成：

| 子系统 | 位置 | 说明 |
|---|---|---|
| 主站（战况面板） | `HD2-Galatic_war-Map/` | 实时银河战况、重要指令、DSS、战术搭配器、最新资讯；GitHub Pages 部署 |
| 中文维基 | `HD2_Wiki/` | 武器 / 战备 / 敌人 / 任务 / 游戏机制 / 社区别称 六大板块 |
| QQ 机器人 | `D:\AstrBot` + `C:\Users\37420\.astrbot` | AstrBot + NapCat；`/` 指令模式；战报 / 查询 / 推送 |
| 翻译管线 | `HD2Web-Trans` 仓库 | DeepSeek AI 翻译（新闻 / MO 简报 / 术语表），产出推送主站 |

线上地址：主站 `https://jerry114514.github.io/HD2-Galatic_war-Map/` · 维基 `https://jerry114514.github.io/HD2_Wiki/`

设计原则：
1. 零成本托管（GitHub Pages + Actions 免费额度）
2. 数据全自动更新（多层兜底，任一数据源故障不影响展示）
3. 中文优先（社区术语表驱动 + AI 翻译，专有名词不音译）
4. 本地留档不入库（设计文档 / 临时脚本与公开站点隔离）

---

## 二、系统架构

```
┌──────────────────────────────────────────────────────────────────┐
│ 数据源层                                                          │
│  · 官方 API  api.live.prod.thehelldiversgame.com（权威战况）        │
│  · companion helldiverscompanion.com（社区镜像，DSS/MO 最全）      │
│  · hd2dev    api.helldivers2.dev（dispatch 存档）                  │
│  · wiki.gg   helldivers.wiki.gg（图鉴数据源，严格禁 Fandom）        │
└───────────────┬────────────────────────────────┬─────────────────┘
                │ 抓取（Python）                  │
     ┌──────────▼───────────┐        ┌───────────▼────────────┐
     │ fetch_site_data.py   │        │ fetch_*.py（维基图鉴）    │
     │  → data.json         │        │  → data/wiki/zh/*.json │
     └──────────┬───────────┘        └───────────┬────────────┘
                │                                │
     ┌──────────▼────────────────────────────────▼────────────┐
     │ 展示层（GitHub Pages 纯静态）                             │
     │  主站 index.html ＋ 维基 11 个 HTML                       │
     └──────────────▲──────────────────────────────────────────┘
                    │ TransNews.json 合并进 data.json
     ┌──────────────┴───────────────┐
     │ 翻译管线 HD2Web-Trans          │
     │ translator.py（DeepSeek）      │
     │ translate_news.yml → push_to_page.yml
     └──────────────────────────────┘

调度层：GitHub Actions 原生 schedule（兜底）＋ 本地 OpenClaw cron（主力，每 15 分钟 dispatch）
```

---

## 三、仓库与目录

### 3.1 主仓库 `Jerry114514.github.io`（公开）

```
Jerry114514.github.io/
├── HD2-Galatic_war-Map/              # 主站
│   ├── index.html                    # 主面板（MO/DSS/战情/星球卡/Roll/趋势图/资讯）
│   ├── data.json                     # 战况数据（Actions 自动生成，禁止手动提交）
│   ├── data/history/player_distribution.json   # 玩家分布历史
│   ├── data/translated/TransNews.json          # 翻译产物（翻译管线写入）
│   ├── tables/                       # starmap.json / stratagems.json(含icon) / hd2_variables.json
│   │                                 # dss_effects.json / effect_id_cn.json / waypoints.json
│   │                                 # 星图对照表_修正版.md（用户译名，前端动态加载）
│   └── 字体（ZZZ-thick.ttf / SourceHanSansCN-Medium.otf）
├── HD2_Wiki/                         # 中文维基
│   ├── wiki/weapons/weapon/stratagems/stratagem/enemies/enemy/
│   │   missions/mission/mechanics/mechanic .html   # 11 页
│   ├── data/wiki/zh/                 # 数据 JSON + 术语表 md + ds_terms.json
│   └── assets/                       # 字体、箭头 SVG、公式图
├── scripts/fetch_site_data.py        # 主站数据抓取（三源回退）
├── fetch_*.py                        # 维基抓取脚本（仓库根目录，12 个）
├── .github/workflows/
│   ├── fetch-data.yml                # 主站数据自动更新
│   └── sync-tables.yml               # 每日同步对照表
└── .gitignore                        # 忽略：__pycache__ 等 + 本文档
```

### 3.2 翻译仓库 `HD2Web-Trans`（公开）

```
HD2Web-Trans/
├── scripts/translator.py             # ★ DeepSeek 翻译主脚本（v3）
├── scripts/merge_push_page.py        # 合并翻译 → 主站 data.json
├── 术语表.txt                        # 386 条 EN|||ZH（翻译管线术语源）
├── translation_history.json          # 翻译历史（1045 条，含 engine 字段）
├── TransNews.json                    # 翻译产物（最新 10 条 + MO 简报）
└── .github/workflows/
    ├── translate_news.yml            # 定时翻译（*/15）+ 手动全量重译
    └── push_to_page.yml              # 推送主站（*/15）
```

### 3.3 本地辅助（不入库）

| 路径 | 用途 |
|---|---|
| `C:\Users\37420\lobsterai\project\wake_workflows.py` | 本地调度脚本（dispatch 3 个 workflow） |
| `C:\Users\37420\Desktop\HD2定时唤醒.bat` | 手动触发快捷方式 |
| `C:\Users\37420\lobsterai\project\.cowork-temp\` | 临时脚本 / 留档（本文档同源） |
| `D:\AstrBot` | 机器人服务端 |
| `C:\Users\37420\.astrbot\data\plugins\` | 机器人插件 |

---

## 四、主站实现

### 4.1 数据链路（scripts/fetch_site_data.py）

- **三源抓取**：官方 API → companion → hd2dev；按字段择优合并（不是整包覆盖）
- **字段优先级示例**：
  - `assignments`（重要指令）：companion → official → hd2dev → 上次快照
  - `dispatches`（资讯）：**companion 优先**（数据最新），hd2dev 兜底
  - `dss`：companion（含 tacticalActions 捐献）→ 官方回退分支
- **快照保护**：MO 切换间隙（全部源为空）用上次成功快照，避免闪烁
- **输出**：`data.json`（war / planets / campaigns / assignments / dispatches / dss / news / major_order / impactMultiplier / player_distribution / recon_stats）
- 由 `fetch-data.yml` 每 15 分钟运行并 commit，触发 Pages 部署

### 4.2 重要指令（MO）解码 ★关键难点

MO 任务数据结构：`tasks[].values[] + valueTypes[]`，**valueType 语义随任务类型而变**：

| 任务类型 | 含义 | 取值规则 |
|---|---|---|
| type=3 | 消灭敌人 | `valueType 1`=阵营（3=机器人 4=光能者）、`valueType 3`=目标数 |
| type=11 | 解放星球 | `valueType 12`=星球索引，goal 固定 100（按星球解放度算进度） |

关键修复（2026-09）：
1. **阵营提取**：type=3 用 `get(1)`（此前误用 `get(6)` 恒为 0）
2. **星球误匹配**：`planet=0` 不算索引（否则匹配到 index=0 的超级地球）；全局任务隐藏「目标星球」区块
3. **任务标题**：`消灭机器人敌人 / 消灭光能族敌人`（带阵营），非全局任务显示「目标：X」
4. **战略机遇**：从 dispatches 匹配最近的 `STRATEGIC IMPERATIVE` 描述（优先 news 中文翻译），副任务标题同样带阵营

### 4.3 DSS（民主空间站）模块

- 数据源：companion `spaceStations[0].tacticalActions`
- **激活判断（三阶段）**：`status===1`=募捐中 / `status===2`=已激活（倒计时中）/ `status===3`=冷却期 —— 禁用 `current>=target`（激活后 current 归零）。
  ⚠️ 冷却期的 `expireAtWarTime`（冷却结束时间）同样在未来，**不能用 expire 判别**，一律看 `status`；仅 `status===2` 才计「生效」并显示 DSS 图标
- **倒计时基准**：`warBase = { clientTimeMs（抓取时刻真实毫秒）, currentWarTime（当前游戏时间） }`；前端每秒本地递减 + 60s 云端校对
- **跃迁倒计时**：`electionEndWarTime - currentWarTime` 差值换算
- **战术行动卡片**：5 个（飞鹰风暴 / 轨道封锁 / 重型军械分发 / 飞鹰封锁 / 星球轰炸）
  - 图标：wiki.gg Democracy Space Station 页 6 个 SVG（`DSS_Eagle_Icon` / `DSS_Orbital_Blockade_Icon` / `DSS_Heavy_Ordnance_Distribution_Icon` / `DSS_Planetary_Bombardment_Icon` / `DSS_Icon` / `DSS_Action_Fallback_Icon`）
  - 加载失败回退原 emoji（`onerror` → `.dss-emoji-fallback`）
  - emoji 剥离须用 `\p{Extended_Pictographic}`（`\u2600-\u27BF` 不含 🚫💣🌏）
- **effectIds 完全包含匹配**，避免变种误匹配；顶部计数只算 `status===2`

### 4.4 战术搭配器（Roll）

- 数据：`tables/stratagems.json`（89 个，含 icon 字段与四维评分 stats[对单/对群/穿甲/专项] + bonus 加权）
- 评分源：用户维护的 `战备评分表.xlsx`（7 类目，与站内数据 100% 同步；2026-09-10 新增战备飞鹰毒气攻击 [2,8,4,3]+1）
- 图标：从 wiki stratagems_full.json 按 id 注入（240px，`no-referrer`）
- 卡片布局：手机端两列（>640px）、评分两列、压缩内边距

### 4.5 星球 / 星区中文名映射

- 星球名链：`p.name`（可能 PLANET_xx 占位符）→ `BUILTIN_PLANET_CN`（内置表）→ `starmap.json`（按英文名 / 按 ID 桥接）
- 星区名：`sectorCn()`（starmap `systems[].name_en → name` → 内置 SECTOR_CN 兜底 → 官方拼写别名表）
- sector 为空时用 starmap `sector_en || system` 补全
- **翻译红线**：星球 / 星区译名严格遵循用户对照表，未收录保持英文，**禁止自编音译**

### 4.6 最新资讯

- 数据源：companion `news`（id 体系与 dispatch 一致），**warTime 秒 → 真实时间**换算：`clientTimeMs + (published - currentWarTime) × 1000`
- 翻译：`news`（含 `translated` 字段）由 HD2Web-Trans 写入，前端中文优先 / 英文兜底

### 4.7 其他模块

- **战情速览**：当前可攻打星球 / 入侵战役 / 防御战进度条（防御战进攻方取 `camp.faction`）
- **玩家分布**：`player_distribution` + 24h 历史趋势（Chart.js 多源兜底：cdnjs → bootcdn）
- **银河影响力**：`impactMultiplier` + 趋势图 + 计算器（阵亡惩罚 min 20%、撤离惩罚 max 30%、目标数、难度系数、动态系数）

---

## 五、中文维基

### 5.1 板块与数据文件

| 板块 | 数据文件 | 条目数 | 抓取脚本 |
|---|---|---|---|
| 武器 | weapons.json | 89 | fetch_weapons.py + fetch_detailed_stats.py |
| 战备 | stratagems_full.json | 109 | fetch_stratagems.py + fetch_detailed_stats.py |
| 战术搭配器 | loadout.json | 89 | 评分表 xlsx（用户维护）+ wiki.gg 图标 |
| 敌人 | enemies.json | 95 | fetch_enemies.py + fetch_enemy_parts.py |
| 任务 | missions.json | 105 | fetch_missions.py |
| 机制 | mechanics/{damage,difficulty,galactic_war,status_effects}.json | 4 页 | fetch_mechanics.py |
| 社区别称 | （规划中） | — | 手工收集 |

附加数据：`ds_terms.json`（526 条 detailed_stats 技术术语，AI 生成）、术语表 md（送审 / 部位 / 敌人）、fetch_reports/（抓取报告与翻译中间产物）

### 5.2 关键技术点

1. **敌人部位解析**（fetch_enemy_parts.py）：表头动态映射列；`Legs (4)` → part_id + count；难度缩放解析 `130 [Default] 160 at Challenging → 基础130，难度4以上为160`；术语表保留用户已填译名
2. **任务解析**：嵌套列表深度计数（extract_list_block）；tactical 分类第三列是阵营（FACTION_ALIAS）；难度范围 `difficulty_zh`
3. **机制页**：h2/h3/h4 章节树 + TOC 侧栏（IntersectionObserver 滚动高亮）；`_zh.json` 中文优先加载
4. **渲染规范**：所有 wiki.gg 图片 `referrerpolicy="no-referrer"`（绕过本地 403 + 302 拦截；用 `/images/thumb/<file>/240px-<file>` 直链）
5. **字体**：标题 / 导航 / 标签 = ZZZ-thick；正文 / 按钮 = 思源黑体（SourceHanSansCN-Medium）

### 5.3 翻译体系（2026-09 全量升级）

- **引擎**：DeepSeek（原百度翻译已弃用）
- **流程**：术语表注入 system prompt → 批量翻译（8 条/批 × 4 并发）→ 校验 JSON 数组长度 → 失败降级逐条
- **字段策略**：翻译写入 `*_zh` 字段，前端 `xx_zh || xx` 优先中文、英文兜底（不破坏原始数据）
- **本次覆盖**：
  - enemies：description_zh 85、category_zh（小/中/大/巨型）、damage_type_zh 80、fire_damage_multiplier_zh 73、stagger_threshold_zh 68、minimum_difficulty_zh 85、部位装甲 617 / 位置 522、攻击名 72
  - weapons：description_zh 41、unlock_zh 2
  - stratagems：unlock_zh 87（`4000 Requisition Slips` → `4000 申购点`）
  - missions：time_limit_zh 79（`40 Minutes` → `40 分钟`）
  - ds_terms.json 526 条（detailed_stats 深层技术串，前端 dsTranslate 命中）

### 5.4 维基战术搭配器（loadout.html，2026-09-10 新增）

- 独立工具页：随机抽取 4 战备 + 换一个弹窗 + 评分明细（T×5 + T² − M²×0.5 + ΣBonus，评级 S≥44/A≥32/B≥20/C≥10）+ 配装能力轮廓图
- 数据自包含 `data/wiki/zh/loadout.json`（89 战备，评分与主站同源）；入口：wiki 首页导航 + stratagems.html 页头按钮

---

## 六、翻译管线（HD2Web-Trans · DeepSeek）

### 6.1 流程

```
translate_news.yml（*/15）
  └─ translator.py
       ├─ 抓 dispatches → 去标签 → 按 id 去重 → 翻译新条目 → 写 translation_history.json
       ├─ 翻译 MO 简报（companion majorOrders 优先，hd2dev 兜底）
       └─ 生成 TransNews.json { mo_brief, items[10] }
push_to_page.yml（*/15）
  └─ merge_push_page.py
       ├─ 读 TransNews.json
       ├─ 下载主站 data.json → 合并 major_order + news
       └─ 写回主站（GitHub API）+ 触发主站 fetch-now dispatch
```

### 6.2 术语注入

- 术语源：`术语表.txt`（386 条，`原文|||中文` 每行）
- system prompt 结构：角色设定（真理部译员）+ 强制术语表 + 翻译要求（军事宣传口吻 / 保留段落 / 禁注释）
- 输出格式：`{"translations": [...]}`，数组长度必须与输入一致（校验失败降级逐条）

### 6.3 全量重译模式

- 触发：workflow_dispatch 输入 `retranslate_all=true` → env `RETRANSLATE_ALL=1`
- 行为：遍历 history 全部条目重译，写回 `translated` / `translated_at` / `engine`
- 实测：1045 条 / 约 3 分钟（8 条/批 × 4 并发）
- 环境变量：`DEEPSEEK_MODEL`（默认 deepseek-chat）、`TRANSLATE_BATCH`（8）、`TRANSLATE_WORKERS`（4）

### 6.4 凭据

- `DEEPSEEK_API_KEY`：仓库 secret（GitHub API + PyNaCl sealed box 写入）
- `GH_TOKEN`：仓库 secret（推送主站用）

---

## 七、QQ 机器人（AstrBot + NapCat）

- **部署**：`D:\AstrBot`（WebUI 6185 / OneBot 6199）；NapCat v4.18.18（QQ 主号 Jerry114514）；QQ 9.9.33
- **插件**（`C:\Users\37420\.astrbot\data\plugins\`）：
  - `astrbot_plugin_hd2_war_report`（战报 + 定时推送）
  - `astrbot_plugin_hd2_planet_info`（星球信息查询）
  - `astrbot_plugin_hd2_roll`（随机战备）
  - `astrbot_plugin_hd2_variant_query`（变种查询）
  - `astrbot_plugin_hd2_guard`（聊天守卫，拦截非指令消息）
- **指令模式**：`/` 前缀触发（无需 @）；时间统一「仰齐浜时间」（UTC+8）
- **白名单**：机器人号只收群 1103276135；主号收群 134324143 + 1103276135
- **人格**：「真理部自助回复机器人-MTB-114514」（超级地球 CN 分部）
- **重启注意**：杀 `astrbot-desktop-tauri.exe` + python 后端后重启；NapCat 重启需重新扫码

---

## 八、调度与自动化

### 8.1 双层调度设计

| 层 | 触发 | 用途 | 状态 |
|---|---|---|---|
| 本地 OpenClaw cron | 每 15 分钟 `wake_workflows.py` → dispatch 3 个 workflow | **主力**（稳定） | 启用中（任务 dcd4820b） |
| GitHub Actions schedule | fetch-data `0,15,30,45`；翻译/推送 `*/15` | 兜底（防本地离线） | 启用中 |

理由：GitHub 免费账户对密集 cron 会**丢弃 / 合并触发**（实测 3 组 7 分钟 cron 出现 2h20m 空白），本地 dispatch 补足稳定性。

### 8.2 stuck run 事件（已解决）

- 2026-08-19：主仓库 `pages build and deployment` run **32217034312** 卡 queued，导致**账号级 schedule 抑制**
- 处置：标准 cancel / force-cancel 均 500 → GitHub Support 工单 → Support 将 check suite 标记 completed 清除
- 现状：schedule 已恢复；本次经验：**Pages 内部 run（event=dynamic）无法自行取消，需 Support**

### 8.3 本地调度脚本

- `wake_workflows.py`：读取凭据（git credential）→ dispatch fetch-data / translate_news / push_to_page → 日志写 `%TEMP%\hd2_wake.log`
- 桌面 `HD2定时唤醒.bat`：手动一键触发

---

## 九、数据源与术语

### 9.1 数据源清单

| 源 | 端点 | 用途 | 备注 |
|---|---|---|---|
| 官方 | `api.live.prod.thehelldiversgame.com` | 战况权威 | 需 X-Super-Client 头 |
| companion | `helldiverscompanion.com/api/hell-divers-2-api/get-api-data-live` | MO / DSS / news（最全） | warTime 为游戏内秒 |
| hd2dev | `api.helldivers2.dev` | dispatch 存档 | 可能滞后 |
| wiki.gg | `helldivers.wiki.gg` | 图鉴数据 | **禁 Fandom**；图片需 no-referrer |

### 9.2 核心术语（全站统一）

终结族 Terminids · 机器人 Automatons · 光能者 Illuminate · 生化人 Cyborgs · 重要指令 Major Order · 战略机遇 STRATEGIC IMPERATIVE · 战略配备 Stratagem · 寂域 The Void · 无票者 Voteless · 超级驱逐舰 destroyers · 超大型工厂 MegaFactory · 飞鹰风暴 Eagle Storm · 轨道封锁 Orbital Block · 重型军械分发 · 星球轰炸 Planetary Bombardment

> 完整术语：`HD2Web-Trans/术语表.txt`（386 条）+ `星图对照表_修正版.md`（星球/星区）+ wiki 术语表 md。

---

## 十、踩坑与经验（全量清单）

### 数据抓取
1. **变量复用覆盖数据**：循环变量 `d` 复用外层 dict → 写盘时把 API 响应写进 JSON；写盘前先 git commit 数据文件
2. **health 难度缩放**：`130 [Default] 160` 拼接 bug → parse_health 解析
3. **嵌套列表截断**：非贪婪正则截断 → 深度计数 extract_list_block
4. **id 切片残留标签**：`find('id="X"')` 从属性中间切 → 先 `rfind("<h")` 回退
5. **tactical 第三列**：是阵营非难度 → 单独映射
6. **PowerShell 中文乱码**：内联 python 中文乱码 → 写 .py 文件执行
7. **valueType 语境差异**：不同 MO 类型 valueType 语义不同（type=3 vs type=11）→ 按类型分支取值
8. **companion 时间戳**：news.published 是 warTime 秒 → `clientTimeMs + Δ×1000` 换算；**不要**直接当 epoch 转

### 前端
9. **NaN bug**：`'<div>' + + '<div>'` 双加号 → 字符串+一元正号；排查 `esc(...) + '</div>' +` 处
10. **PLANET_xx 占位符**：需 starmap 桥接
11. **星区空 sector**：用 starmap sector_en 补全
12. **DSS 激活误判**：`current>=target` 错（激活后归零）→ 以 `status` 判别（1=募捐中 / 2=已激活 / 3=冷却期）。**更隐蔽的坑**：冷却期的 `expireAtWarTime` 同样在未来，曾据此把冷却误判为已激活
13. **warBase TDZ**：`let` 声明顺序导致引用报错 → 声明提前
14. **防御战同色**：进攻方取 `camp.faction` 而非 currentOwner
15. **emoji 剥离不完整**：范围正则漏 🚫💣🌏 → `\p{Extended_Pictographic}`
16. **热链 403**：wiki.gg 对 127.0.0.1 拒载 → `referrerpolicy="no-referrer"`；Special:FilePath 302 也会被拦 → 用 `/images/thumb/` 直链
17. **图标占位错误**：部分战备 icon 指向 `Disambig.svg`（消歧义占位）→ 按 wiki 页面实名修正（FAF-14/S-11/40-K/SH-20/战术摄像机）
18. **裸 `•` 列表不渲染**：JSON 里 `•`+`\n` 纯文本不会折行 → 换 `<ul><li>`
19. **标签键顺序差异**：`radius_inner` vs `inner_radius` 两种键名并存 → DS_LABELS 双向补齐

### Git / GitHub
20. **data.json 冲突**：Actions 自动生成 vs 本地 fetch → 不手动提交；冲突保留远端（`--theirs`）
21. **GitHub 443 不稳（S302）**：重试 + `pull --rebase`；token 必须 `Bearer ` + 完整 `github_pat_`
22. **rebase 编辑器卡住**：`GIT_EDITOR=true` 非交互继续
23. **fine-grained PAT 授权范围**：未授权仓库返回 404 而非 403；新 token 需覆盖目标仓库
24. **`http.extraheader` Bearer 不被 git fetch 接受** → 用 `git credential approve` 或 API
25. **stuck Pages run**：cancel/force-cancel 均 500 → 只能 Support 处理；期间用本地 dispatch 兜底
26. **cron 密集被丢弃**：免费账户 schedule ≥15 分钟间隔更可靠

### 流程
27. **本地 cron 与 Actions 并发**：两者同时触发会造成 data.json 频繁冲突 → 以本地为主力、native schedule 降频为兜底
28. **翻译产物双通道**：`news`（翻译版，仅 10 条）与 `dispatches`（原始，含最新）id 对齐；翻译滞后时前端回退英文
29. **文档不入库**：设计留档 / 临时脚本放 `.cowork-temp`，或入库目录 + `.gitignore`

---

## 十一、当前状态与待办

### 已完成（里程碑）
- [x] 主站：MO 全信息解码（阵营/目标数/战略机遇描述）、DSS 图标 + 倒计时、资讯源修复（companion 优先 + warTime 换算）
- [x] 维基：六大板块数据 + 全量中文（DeepSeek 翻译 覆盖至 detailed_stats）
- [x] 翻译管线：百度 → DeepSeek；全量重译 1045 条；术语表 386 条注入
- [x] 调度：本地 cron + native schedule 双层；stuck run 已由 Support 清除
- [x] 机器人：5 插件 + `/` 指令 + 双白名单

### 待办
- [ ] 「社区别称」页面：黑话收集模板已建（`社区别称` 版块预留），待用户确认后建页
- [ ] 敌人术语表剩余 8 个待填译名（Agitator/Brawler/Gatekeeper/Marauder/Obtruder/Pouncer/Radical/Veracitor）— 注：AI 翻译已临时覆盖，待用户审定
- [ ] 部位术语表 `术语对照表_部位.md` 用户校对
- [ ] 星图拖拽彻底修复（主站入口已删，标记开发中）
- [ ] 影响度趋势图 Y 轴优化（0-2% 系数压缩问题）
- [ ] 翻译管线：`news` 翻译覆盖 dispatches 全量（当前仅最新 10 条）

### 关键路径速查
- 主站：`E:\GitLoadWareHouse\Jerry114514.github.io\HD2-Galatic_war-Map\index.html`
- 维基：`E:\GitLoadWareHouse\Jerry114514.github.io\HD2_Wiki\wiki.html`
- 主站抓取：`E:\GitLoadWareHouse\Jerry114514.github.io\scripts\fetch_site_data.py`
- 翻译脚本：`C:\Users\37420\lobsterai\project\HD2Web-Trans\scripts\translator.py`
- 本地调度：`C:\Users\37420\lobsterai\project\wake_workflows.py`
- Python 环境：`D:\AstrBot\backend\python\python.exe`

---

*文档结束 · 由 OpenClaw 维护 · 更新于 2026-09-10*
