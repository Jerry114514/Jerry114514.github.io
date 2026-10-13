# 玩家统计同步

玩家分布、全服在线总量、影响系数与趋势应使用同一统计帧。
战况快照的 `fetchedAt` 是采集时间，不代表统计接口已生成同一时刻的新帧。

此前采集脚本先请求 extended API 读取人数，再次请求同一个接口读取趋势和影响系数。
第二次请求超时时，人数已更新但趋势保留旧值，影响系数被写成空值。

现在只请求一次 `extendedApiInformation/2days.json`，合并所有返回帧，
按实际时间排序、去重并保留最新 288 帧。`data.json.player_distribution` 与
`impactMultiplier` 均取合并后最新帧，与 `data/history/player_distribution.json` 的尾帧一致。
接口失败时记录原因并保留同一组旧统计；旧响应不回退本地较新的统计。

验证：

```sh
python -m unittest discover -s scripts/tests -p 'test_*.py'
```

新增回归包括：整个 `main()` 只请求一次统计接口且三组数据一致、补齐中间帧、
旧响应保留新记录、等价时区去重、接口失败保留原统计及按时间裁剪记录。
