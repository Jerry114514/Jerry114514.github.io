# 七槽战术搭配器

图鉴 `HD2_Wiki/loadout.html` 和主站 `HD2-Galatic_war-Map/index.html` 共用同一入口。抽取主手、副手、手雷及四个战备，200件装备及人工校准随仓库提供。

平衡抽取每次产生完整七件候选，内部评价未通过就继续抽，首次通过即输出；不按最高分排序，也不排除强配装。界面不显示评分或场景。纯随机跳过能力评价，但保留初始占位限制。输出后随机和人工换装不再评价能力、也不检查普通装备互斥；最多一台机甲始终有效。

C4同时占用支援武器与背包位。次抛支援和便携地狱火背包不占普通互斥名额，子弹风暴例外，仍算普通支援。近战续航为0且不占续航汇总位置；补包或补车直接将最终续航提升到至少100，物理资源检查独立保留。

## 运行与维护

部署只需要静态文件服务器，浏览器通过模块Worker完成抽取，无大模型或在线Wiki依赖。本地运行：

```sh
node scripts/serve-loadout-v3.mjs
```

打开 `http://127.0.0.1:8790/HD2_Wiki/loadout.html`。`HD2_LOADOUT_PORT`可指定端口。

本地人工校准页为 `/docs/loadout-v3-six-dimensions-20261028.html`。写入接口仅由本地服务器提供；静态站不提供保存接口。校准写入 `assessment-v2/manual-scores.json` 并重建发布模型，保留修改历史。

```sh
node scripts/build-loadout-v3-assessment.mjs
node scripts/review-loadout-v3-assessment.mjs
node --test scripts/tests/loadout-v3-assessment-v2/*.test.mjs
```

构建和报告脚本都支持 `--check`，核对已提交产物而不写入。输入文件及其哈希记录在发布模型中。装备来源快照位于 `assessment-v2/sources/equipment-expanded.json`；保留Wiki来源、版本与许可信息，另有明确标记的用户规则和工程参数。共享伤害、弹池与爆炸函数复用既有目录，历史评分入口不用于当前页面。

模型仍有未覆盖机制和工程假设；内部测试样本主要来自虫族，通用入口不等于全阵营实战认证。未知能力不会被当作通过，当前边界见 `assessment-v2/coverage.json`。后续以实际抽出配装的反馈校准。

选取规则见 [抽取说明](../../docs/loadout-v3-draw-acceptance.md)，续航公式见 [续航说明](../../docs/loadout-v3-endurance-algorithm.md)。
