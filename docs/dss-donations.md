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

站点调度频率保持原状，不声称进度是实时刷新的。

行动卡片由接口 tacticalActions 生成，仅显示 status 为 1（募捐）、2（激活）、3（冷却）的行动。本地目录只提供说明，未启用的旧飞鹰／组合行动不占卡片。效果集合先匹配最具体的定义，再按 action_id32 补充匹配；新行动没有本地定义时仍显示其名称和真实进度，不因匹配失败隐藏或归零。

经典飞鹰（1209）与当前毒气飞鹰（1425）分开定义。毒气说明核对官方 SpaceStation 详情的 zh-Hans 返回：任务期间定期部署“飞鹰”毒气打击，并减缓敌人在保卫战役中的进展。主页显示“飞鹰毒气风暴”，复用飞鹰素材。

官方 detail 不带 station 级 activeEffectIds 时保留 Status 的值；Status 缺少 station ID 时跳过 detail 请求，保留官方其余数据。缺少 ID 的异常原本就在内层 try_fetch 作用域内，不会直接令整个官方源失败。

回归检查：`node scripts/tests/dss-donations-check.mjs`、`python -m unittest discover -s scripts/tests -p 'test_*.py'`。
