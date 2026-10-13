# 星图变化

首页的“星图变化”位于重要指令之后，默认展示过去 24 小时，可切换 1、6、24、48 小时。
每颗星球占一行，只显示星球名称与阵营变化；多次易主保留完整顺序，即使最终归属回到原阵营也会显示。
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

## 验证

```sh
node scripts/tests/ownership-changes-check.mjs
python -m unittest discover -s scripts/tests -p 'test_*.py'
```

覆盖窗口切换、往返易主、缺失/未知归属、新星球、重复/过期快照、时区、保留边界及种子数据结构。
