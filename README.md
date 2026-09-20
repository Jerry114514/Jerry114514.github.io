# Jerry114514.github.io

> 个人 GitHub Pages 站点合仓：个人主页 +《绝地潜兵 2》（Helldivers 2）玩家社区站 + 战地1 工具集
>
> **站点根**：[https://jerry114514.github.io/](https://jerry114514.github.io/)
> **状态**：活跃维护中（HD2 板块2026-09 改版）

---

## 🗺️ 站点结构

本仓是**多站点合仓**——多个独立子站共享一个 GitHub Pages 根，按子目录分发：

| 子目录 | 类型 | 入口 | 访问地址 |
|---|---|---|---|
| **`HD2-Galatic_war-Map/`** | HD2 主站 | `index.html` | [主站 · 实时战况数据面板](https://jerry114514.github.io/HD2-Galatic_war-Map/) |
|  |  | `galaxy-map-v2.html` | [银河战争态势图](https://jerry114514.github.io/HD2-Galatic_war-Map/galaxy-map-v2.html) |
| **`HD2_Wiki/`** | HD2 图鉴站 | `wiki.html` | [图鉴首页](https://jerry114514.github.io/HD2_Wiki/wiki.html) |
| `bf1-webtool/` | 战地 1 工具 | `index.html` | [bf1-webtool](https://jerry114514.github.io/bf1-webtool/) |
| `bf1-web-wiki/` | 战地 1 Wiki | `index.html` | [bf1-web-wiki](https://jerry114514.github.io/bf1-web-wiki/) |
| 根目录 | 个人主页 | `index.html` | [Jerry's HomePage](https://jerry114514.github.io/) |

> **HD2 板块**是本仓的主战场，下文重点展开。

---

## 🛠️ 维护与投稿

**数据在哪**：社区可编辑的数据全是**纯文本 JSON**，集中在
[`HD2_Wiki/data/wiki/zh/*.json`](HD2_Wiki/data/wiki/zh/)（星图侧另有
`HD2-Galatic_war-Map/data/campaign_zh.json`、`banner.json`）。
2026-09 起所有 JSON 已统一为 2 空格缩进的多行格式，**可以直接在 GitHub 网页上阅读和编辑**。

### 怎么投稿

| 方式 | 适合谁 | 怎么做 |
|---|---|---|
| **① 改 JSON 提 PR** | 愿意自己动手的投稿者 | 在 GitHub 网页打开目标 JSON → 点**铅笔图标** → 选「Create a new branch … and start a pull request」 |
| **② 开 Issue 用表单** | 完全不想碰 JSON 的玩家 | [新建 Issue](https://github.com/Jerry114514/Jerry114514.github.io/issues/new/choose) 选表单：**译名纠错 / 缺失条目 / 数值修正 / 图片补充** |

流程细节、报错怎么读，见 **[CONTRIBUTING.md](CONTRIBUTING.md)**。

### 自动校验：不通过合不进去

任何改动数据文件的 PR 都会自动跑 **`validate-data`**（`scripts/validate_wiki_data.py`，**19 项检查**：
id 规范、必填字段、`_zh` 显式 `id` 配对、图标死链、引用完整性……）。
失败时 PR 变红，错误摘要直接写进 Job Summary（`文件 → 字段 → 原因 → 建议修法`）——**校验不过就合不进去**。

### 四条硬规则

1. **术语以 [`terms.json`](HD2_Wiki/data/wiki/zh/terms.json) 为唯一真相源** —— 新增译名前先搜一遍，要改就改它本身。
2. **`mechanics/*_zh.json` 的每个小节必须写显式 `id`** —— 只靠数组序号配对会让中文正文整体错位。
3. **图标用站内相对路径**（`./assets/...`）—— 不要热链外站图片。
4. **不要动 CI 自动生成的文件** —— `data.json`、`data/history/*`、`data/translated/TransNews.json`，手改会被下一次自动运行冲掉。

### 自动化一览

| Workflow | 触发 | 职责 |
|---|---|---|
| `fetch-data.yml` | 每 5 分钟 | 抓取实时战况 → 自动 commit `data.json` 等，并清理旧 Pages artifact |
| `validate-data.yml` | PR（改动数据文件时） | 跑 19 项数据校验，失败让 PR 变红 |
| `cleanup-artifacts.yml` | 原生 schedule | artifact 清理的备用定时（主力已挂在 fetch-data 里） |
| 私密仓的新闻翻译流水线 | 每 15 分钟 | 翻译上游新闻，把译好的 `TransNews.json` 推回本仓 |

> **数据更新频率：每 5 分钟**（GitHub Actions 自动抓取）。页面上的「更新于 HH:MM:SS」即最近一次抓取时间。

---

## 🎯 HD2 板块速览

### 主站 · 实时战况数据面板（"真理部"）

- **MO 重要指令**、**可攻打星球**、**星区目录**、**最新资讯**
- **DSS 民主空间站**当前停靠位置、跃迁倒计时、战术行动状态
- **阵营进度**（超级地球 / 机器人 / 终结族 / 光能者）实时数据
- **玩家分布**、**战况历史**、**环境图像**（biome 兜底表）
- 数据由 `.github/workflows/fetch-data.yml` 每 5 分钟自动抓取并 commit

### 银河战争态势图（Canvas / MapLibre 双版）

- 节点-连线形式可视化 270+ 星球
- 阵营色、星区背景、攻击路径、流动动画
- 缩放 / 平移 / 悬停 / 点击跳转
- **附带 25 个本地图标**（19 个 SVG + 6 个 PNG，另有 1 个 `.psd` 母版，位于 `assets/effect-icons/`）；星图两版实际引用其中 20 个（18 SVG + 2 PNG）。全部本地同源缓存，无外部依赖

### 图鉴站

按板块分（共 8 类，与图鉴站首页导航一致）：
- **武器图鉴**：主武器 / 副武器 / 投掷物
- **战略配备图鉴**：轨道 / 飞鹰 / 支援武器 / 背包 / 可部署物 / 载具 / 任务
- **敌人图鉴**：终结族 / 机器人 / 光能者（含变种）
- **任务图鉴**：主要目标 / 阵营特殊任务 / 战术目标
- **机制页**：伤害 / 难度 / 状态效果 / 银河战争机制 / 银河战争历史（5 个子机制页）
- **强化资源**：20 项
- **战争债券**：25 个，含逐债券奖励详情
- **战术搭配器**：随机配装 / 四维评分 / 加权评级

数据 schema 详见 `HD2_Wiki/data/wiki/zh/SCHEMA.md`（**改图鉴站数据前必读**）。

---

## 🛠️ 本地开发

> 仓库没有 `package.json`。本地预览只需任意 HTTP 静态服务器。

```powershell
# 任意一行即可；不要用 file://，否则 fetch 与相对路径会出问题
cd E:\GitLoadWareHouse\Jerry114514.github.io
python -m http.server 8791            # 任选
# npx http-server -p 8791             # 或这条
# node -e "require('http').createServer(...)..."   # 或 node 单行
```

浏览器打开：

```
http://127.0.0.1:8791/HD2-Galatic_war-Map/index.html   # 主站
http://127.0.0.1:8791/HD2_Wiki/wiki.html              # 图鉴
http://127.0.0.1:8791/HD2-Galatic_war-Map/galaxy-map-v2.html  # 星图
```

**强烈建议 Ctrl+F5 强刷**——GitHub Pages CDN 与本地浏览器都会缓存 HTML/CSS，验证改动时经常被旧版本骗到。

---

## 🤖 CI / 自动化

`.github/workflows/` 下四个 workflow：

| Workflow | 触发 | 职责 |
|---|---|---|
| `fetch-data.yml` | 每 5 分钟 | 抓取 HD2 实时战况 → 自动 commit `data.json` + 末尾清理旧 Pages artifact |
| `validate-data.yml` | PR / push（改动数据文件时） | 数据校验闸门（19 项），失败变红、摘要写 Job Summary |
| `sync-tables.yml` | 每日 | 从上游同步对照表（星图、机制页） |
| `cleanup-artifacts.yml` | 原生 schedule | artifact 清理的"备用"定时（常不被触发；主力已在 fetch-data 里挂） |

`scripts/` 下四个辅助脚本：

| 脚本 | 用途 |
|---|---|
| `fetch_site_data.py` | 主站数据抓取（被 fetch-data.yml 调用） |
| `validate_wiki_data.py` | 数据校验器（被 validate-data.yml 调用，PR 守门人） |
| `merge_translations.py` | 翻译条目合并（`name_zh` 回退机制） |
| `cloudflare_dispatcher.js` | Cloudflare Worker 边缘调度（若启用） |

> `scripts/archive/` 下另有 22 个历史脚本（早期抓取/整理工具，已归档、不再被 CI 调用；其相对路径假设「在仓库根目录执行」，仅供查阅）。

---

## 📦 数据来源与免责声明

- **HD2 内容均为社区整理**，数据来自 Arrowhead Game Studios 公开接口与社区翻译贡献，**非官方资料**
- 游戏版本、机制、数值随时可能因官方更新而变化；本仓尽力跟随，但**不保证实时准确**
- 战况数据有 5 分钟缓存延迟（CI 抓取周期）
- **部分翻译 / 抓取可能含少量误差**；如发现错误欢迎在文档站评论区或 issue 反馈

---

## 🤝 贡献与反馈

- **B 站**：欢迎在 [哔哩哔哩个人主页](https://space.bilibili.com/57439297) 反馈
- **GitHub Issue**：本仓允许通过 Issue 提交更新或作为讨论区，也可直接用[投稿表单](https://github.com/Jerry114514/Jerry114514.github.io/issues/new/choose)（译名纠错 / 缺失条目 / 数值修正 / 图片补充）
- **GitHub PR**：**现在欢迎 PR** —— 只要 `validate-data` 校验通过即可合并，流程见 [CONTRIBUTING.md](CONTRIBUTING.md)；改动较大时建议先开 Issue 对齐
- **数据上游**：图鉴站数据 schema 与翻译以 `HD2_Wiki/data/wiki/zh/SCHEMA.md` 为权威源

---

## 🙏 致谢

- **Arrowhead Game Studios** —— 《绝地潜兵 2》开发与发行方
- **索尼互动娱乐 Sony Interactive Entertainment** —— 游戏发行商
- **Helldivers Wiki.gg** —— 英文 wiki 的事实参考源
- **HelldiversData**（[shalzuth](https://github.com/shalzuth/HelldiversData)）—— 前置项目，元数据本体批量导出范式
- **filediver**（[xypwn](https://github.com/xypwn/filediver)）—— 运行时数据提取工具
- 所有为图鉴站提供翻译、校对的玩家

---

## 📜 License

本仓**非游戏代码本身**——只整理游戏公开数据与社区翻译。

- 数据 / 翻译 / 图片说明：CC BY-NC-SA 4.0（社区共享，需署名、非商用、相同方式共享）
- 站点代码（HTML / CSS / JS）：MIT
- 游戏本身版权归 Arrowhead Game Studios 所有
