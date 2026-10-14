# DSS 捐赠数据口径

`cost.currentValue / targetValue` 用于计算全体募捐进度。三种当前行动的 `targetValue` 都是 86400，但资源和个人上限不同；没有原始资源总数的单位证明，不将这些进度值写成“已捐献 N / 86400 样本”。主页和星图都只显示募捐百分比。

个人限额使用独立字段 `maxDonationAmount` 和 `maxDonationPeriodSeconds`，资源由 `itemMixId` 定位：

| itemMixId | 资源 |
| --- | --- |
| 3992382197 | 普通样本 |
| 2985106497 | 稀有样本 |
| 3608481516 | 申购点 |

映射来源为[API 库的资源常量](https://github.com/CrosswaveOmega/hd2api.py/blob/main/src/hd2api/constants/constants.py)及[社区 API 维护的物品目录](https://github.com/helldivers-2/json/blob/master/items/item_names.json)，两份记录一致。当前官方 DSS 接口 `/api/SpaceStation/801/749875195` 给出飞鹰 itemMixId 3992382197、个人上限 75、周期 86400 秒，因此显示“每人每 24 小时最多捐赠 75 普通样本”。上限和周期始终取自实时数据，不写死。未知资源不会按行动名称猜成样本；缺少限额时只显示已确认的资源名称。

采集优先使用官方 SpaceStation detail，其次 Companion，再使用既有快照。官方 Status 的 spaceStations 仅含位置／状态等摘要，不能用它证明捐赠数据已刷新。数据层保留 station/action id32、cost.itemMixId 以及完整进度精度。

`clientTimeMs/currentWarTime` 仍服务现有倒计时。另设 `donationUpdatedAtMs/donationSource` 表示捐赠读数的时间及来源。复用旧 tacticalActions 时，保留旧捐赠时间；不能把新位置或战争时钟的采集时间贴给旧进度。旧格式快照用自己的 clientTimeMs 作兼容时间；完全没有时间则显示“捐赠数据时间未知”。页面显示数据截至时间，快照回退另有标记，不按瞬时 deltaPerSecond 长时间外推进度。

这次修复不改变站点的调度频率，也不声称进度是实时刷新的。现有毒气版说明模板属于另一项内容维护，未混入这次捐赠数值修复。

回归检查：`node scripts/tests/dss-donations-check.mjs`、`python -m unittest discover -s scripts/tests -p 'test_*.py'`。
