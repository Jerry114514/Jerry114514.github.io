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
| **`HD2_Wiki/`** | HD2 图鉴站 | `wiki.html` | [图鉴首页](https://jerry114514.github.io/HD2_Wiki/) |
| `bf1-webtool/` | 战地 1 工具 | `index.html` | [bf1-webtool](https://jerry114514.github.io/bf1-webtool/) |
| `bf1-web-wiki/` | 战地 1 Wiki | `index.html` | [bf1-web-wiki](https://jerry114514.github.io/bf1-web-wiki/) |
| 根目录 | 个人主页 | `index.html` | [Jerry's HomePage](https://jerry114514.github.io/) |

> **HD2 板块**是本仓的主战场，下文重点展开。

---

## 🎯 HD2 板块速览

### 主站 · 实时战况数据面板（"真理部"）

- **MO 重要指令**、**可攻打星球**、**星区目录**、**最新资讯**
- **DSS 民主空间站**当前停靠位置、跃迁倒计时、战术行动状态
- **阵营进度**（超级地球 / 机器人 / 终结族 / 光能族）实时数据
- **玩家分布**、**战况历史**、**环境图像**（biome 兜底表）
- 数据由 `.github/workflows/fetch-data.yml` 每 5 分钟自动抓取并 commit

### 银河战争态势图（Canvas / MapLibre 双版）

- 节点-连线形式可视化 270+ 星球
- 阵营色、星区背景、攻击路径、流动动画
- 缩放 / 平移 / 悬停 / 点击跳转
- **附带 22 个本地 SVG 图标**（势力变种 + DSS 战术行动），无外部依赖

### 图鉴站

按板块分：
- **武器图鉴**：主武器 / 副武器 / 投掷物
- **战略配备图鉴**：轨道 / 飞鹰 / 支援武器 / 背包 / 可部署物 / 载具
- **敌人图鉴**：终结族 / 机器人 / 光能族（含变种）
- **任务图鉴**：主要目标 / 阵营特殊任务 / 战术目标
- **机制页**：伤害 / 难度 / 银河战争 / 状态效果（4 个子机制页）
- **强化资源**：20 项
- **战争债券**：25 个，含逐债券奖励详情

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

`.github/workflows/` 下三个 workflow：

| Workflow | 触发 | 职责 |
|---|---|---|
| `fetch-data.yml` | 每 5 分钟 | 抓取 HD2 实时战况 → 自动 commit `data.json` + 末尾清理旧 Pages artifact |
| `sync-tables.yml` | 每日 | 从上游同步对照表（星图、机制页） |
| `cleanup-artifacts.yml` | 原生 schedule | artifact 清理的"备用"定时（常不被触发；主力已在 fetch-data 里挂） |

`scripts/` 下三个辅助脚本：

| 脚本 | 用途 |
|---|---|
| `fetch_site_data.py` | 主站数据抓取（被 fetch-data.yml 调用） |
| `merge_translations.py` | 翻译条目合并（`name_zh` 回退机制） |
| `cloudflare_dispatcher.js` | Cloudflare Worker 边缘调度（若启用） |

---

## 📦 数据来源与免责声明

- **HD2 内容均为社区整理**，数据来自 Arrowhead Game Studios 公开接口与社区翻译贡献，**非官方资料**
- 游戏版本、机制、数值随时可能因官方更新而变化；本仓尽力跟随，但**不保证实时准确**
- 战况数据有 5 分钟缓存延迟（CI 抓取周期）
- **部分翻译 / 抓取可能含少量误差**；如发现错误欢迎在文档站评论区或 issue 反馈

---

## 🤝 贡献与反馈

- **B 站**：欢迎在 [哔哩哔哩个人主页](https://space.bilibili.com/57439297) 反馈
- **GitHub Issue**：本仓允许通过 Issue 提交更新或作为讨论区，但不接受未经沟通的 PR
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
