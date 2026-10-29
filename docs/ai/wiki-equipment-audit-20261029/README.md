# wiki.gg 装备全量审计与增量导入（2026-10-29）

对照 helldivers.wiki.gg 当前装备页面与仓库 `shared/hd2-loadout` 的目录/快照（快照基线 2026-10-23），结论如下。

## 工具

- `scripts/audit-wiki-equipment.mjs` — 拉取四类装备页清单（武器三类 + 战备七个舰船模块子分类），比对仓库 200 件，抓当前头图与修订号，输出 `report.json`。
- `scripts/import-wiki-equipment.mjs` — 按页导入 Infobox Weapon 页面到快照与 catalog（DRUID infobox + attack-data-table 解析，保留 provenance/revid/html_sha256）。

## 审计结论

| 项 | wiki.gg 当前 | 仓库（导入前） | 差异 |
|---|---|---|---|
| Primary Weapons | 57 | 56 | +1 |
| Secondary Weapons | 26 | 26 | 0 |
| Throwables | 24 | 24 | 0 |
| 战备（Eagle/Orbital/Support/Backpack/Vehicle/Sentry/Emplacement 子分类去重） | 102 | 94 | +8 |

新增候选 9 个，其中 5 个非装备页（3 个消歧义页、April Fools/Budget Helldiver、Template 页）。真正的新装备：

1. **AR-23L Liberator Legacy**（主手，1.007.201，自由日 2186 赠送）— 已按决策导入（见下）。
2. **M-104 Incinerator FRV**（载具）— 上次审计（2026-10-23）用户已明确排除（catalog `exclusions.user_excluded_id`），维持排除。
3. **Eagle Rearm**（舰船类战备，冷却 0s，Eagle 空弹才可用）— 需要新的槽位建模规则，未导入。
4. **Orbital Confetti / Eagle Fly By**（自由日 2026 限时活动战备，wiki 使用 Fallback 占位图标）— 未导入。

存量 200 件的图标与 wiki 当前头图一致（pageimages 比对中的差异均为其抓到 infobox 内护甲图标造成的噪声）；全部 200 页在 10-23 后有修订，抽样核对修订说明为全站格式统一/中文测试类编辑，非数值变化，快照数据无需重抓。

⚠ wiki 侧 2026-10-25 起武器统计表把 `Recoil/Horizontal/Vertical` 改为 `Drift Recoil / Climb Recoil`（↔/↕ 双分量）。旧键无法自洽映射新键；下次全量重抓时需要先做格式映射决策，本次导入不猜测数值。

## 已执行

- 导入 AR-23L（id `ar_23l_liberator_legacy`，zh 名取自 zh wiki：AR-23L “解放者”传承，revid 140750）。
- 重建评价模型与 coverage；`review-loadout-v3-assessment.mjs` 产物同步更新。新条目续航分 55.38；缺口如实标注：HANDLING_RECOIL_HORIZONTAL、HANDLING_RECOIL_VERTICAL、RELOAD_TIME（wiki 页面未提供，等人工校准）。
- 测试断言 200→201（draw-worker / pool-integration），全量 279 项通过。
- 图标沿用 wiki.gg 热链（与存量一致）；`icons/` 存档本次抓取的 5 个新页面图标作为证据。

## 报告

- `report.json` — 审计原始数据（页面清单、pageprops、差异数组）。
