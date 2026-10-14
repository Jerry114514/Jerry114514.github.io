# 星图变化

首页的“星图变化”位于重要指令之后，默认展示过去 24 小时，可切换 1、6、24、48 小时。
每颗星球占一行，显示阵营变化及成功防守；多次易主保留完整顺序，即使最终归属回到原阵营也会显示。
点击名称进入星球资料页。数据随首页刷新，切换时段不需要再请求历史。

## 采集与存储

`scripts/fetch_site_data.py` 将相邻采集快照的 `planets[].currentOwner` 按星球 `index` 比对，
在 `data.json` 的 `ownership_history` 字段内保留最近 48 小时的变化。
现有 Fetch HD2 Data 流水线已经提交 `data.json`，无需增加定时任务或网络数据源。

该字段格式：

```json
{
  "startedAt": "2026-10-11T00:00:00Z",
  "updatedAt": "2026-10-13T00:00:00Z",
  "events": [
    {
      "planetIndex": 79,
      "fromOwner": "Terminids",
      "toOwner": "Humans",
      "previousSeenAt": "2026-10-12T23:55:00Z",
      "detectedAt": "2026-10-13T00:00:00Z"
    }
  ],
  "lastSnapshot": {
    "fetchedAt": "2026-10-13T00:00:00Z",
    "owners": { "79": "Humans" }
  }
}
```

- 阵营值沿用站点：`Humans`、`Terminids`、`Automaton`、`Illuminate`。
- 首次发现的星球只建立基线；未知归属、缺失星球不算易主。
- `previousSeenAt` 与 `detectedAt` 是观察边界，不是实际易主时间；页面不显示时间。
- 窗口按浏览器当前时间筛选发现记录。如果观察区间跨过窗口边界，标注“范围待确认”。
- 采集重复或时间倒退不追加记录。超过 48 小时的记录在下一次采集时删除。
- 历史不足与断更分别显示覆盖时长和“数据更新延迟”，不会伪装成完整记录。

`data/history/ownership_seed.json` 是从主分支已提交的战况快照还原的初始记录，
不含模拟战况。首次采集从这份种子接续；之后以 `data.json` 中的历史为准。
页面在部署后的首次采集前也可读种子，但会按真实覆盖情况显示延迟。

`lastSnapshot` 是采集侧的差分状态，前端只读取 `events`、`startedAt` 与 `updatedAt`。
它暂时随 `data.json` 一并存储和提交，以复用现有流水线；不作为页面展示数据。
旧 `data.json` 无法读取或不是 JSON 对象时，采集会明确记录错误并继续用种子或新快照建立基线，
不会因旧文件损坏而阻止抓取新战况。

## 成功防守记录

`ownership_history` 另存 `defenseEvents`、`defenseStartedAt`、`defenseUpdatedAt` 和 `defenseSnapshot`。
采集仅使用成功获取的官方 Status，按 `planetEvents[].id` 跟踪 eventType=1 的防守事件，
同时保存官方战争时间、截止时间及星球归属。没有新增请求或定时任务。

- 星球仍属 Humans，且防守事件 health 已归零：记录成功。
- 上次观测到防守，此次在原截止前事件消失，星球仍属 Humans：记录观测到的防守成功，包括通过解放攻击源结束入侵的情况。
- 超时才消失、归属变为敌军、归属未知、官方源失败或战争时间倒退：不凭事件消失宣告成功。
- 每场事件按 eventId 与 startTime 去重；连续两场不同防守分别保留，保存窗口仍为 48 小时。
- detectedAt 是观测时刻，不是精确胜利时刻。首次正常观测只建立基线，旧版历史不猜补防守；页面独立标明防守记录覆盖时长与延迟。

示例记录：

```json
{"eventId":5717,"startTime":83887620,"planetIndex":246,"attacker":"Automaton",
 "previousSeenAt":"2026-10-14T00:00:00Z","detectedAt":"2026-10-14T00:05:00Z","evidence":"ended_early"}
```

页面在同一星球行追加“防守成功 · 抵御某阵营”，即使没有易主也会生成行。
汇总分别计数易主与防守成功，1/6/24/48 小时筛选同时应用于两种记录。

## 验证

```sh
node scripts/tests/ownership-changes-check.mjs
python -m unittest discover -s scripts/tests -p 'test_*.py'
```

覆盖窗口切换、往返易主、缺失/未知归属、新星球、重复/过期快照、时区、保留边界及种子数据结构。
