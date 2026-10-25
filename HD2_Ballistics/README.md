# 网页版使用指南

用浏览器打开 [`HD2_Ballistics/index.html`](./index.html)（线上地址 <https://jerry114514.github.io/HD2_Ballistics/>），无需安装 Python，所有数据只在本机读取。

## 交互流程

1. 选择模拟模式：**轨迹模式**查看给定仰角下的轨迹与逐步数据；**水平瞄准**为同高目标求命中仰角。网页版只提供这两类模式；`decay`（无重力衰减与解析解表）只在 Python 端提供。
2. 可选择本地 `data/generated_projectile_settings.json` 文件，输入 `type` 数字导入一条射弹配置；同时选择 `data/generated_damage_settings.json` 后，网页会按射弹的 `damage_info_type` 匹配伤害记录，并将 `damage[0]`、`damage[1]` 分别填入普通伤害与耐久伤害。两个文件都只在浏览器本机读取，不上传数据；先导入射弹、后选择伤害文件也会自动关联。
3. 射弹 JSON 字段映射：`calibre`→口径、`mass`→质量、`speed`→配置速度、`drag`→阻力系数、`gravity_multiplier`→重力倍率、`life_time`→射弹寿命、`projectile_flags_1_detail.ignore_terminal_velocity`→低速销毁开关、`projectile_flags_1_detail.inherit_velocity`→速度继承开关。发射者速率和方向保留用户输入，不来自射弹模板。
4. 未选择伤害文件、找不到对应伤害 type、存在重复匹配或伤害数组无效时，网页会提示并保留当前普通／耐久伤害，可手动填写。网页的更新频率是 `step_hz`（输入框 `stepHz`），不是游戏 JSON 的 `simulation_steps`；`simulation_steps` 不会映射，网页也不模拟 `life_time_randomness`。
5. 点击运行后在下方查看图像与表格；页眉按钮可切换中英文，切换不会重新计算已有结果。轨迹模式使用交互式 3D 视图，伤害曲线和水平瞄准图仍使用二维图表。曲线悬停显示最近离散记录；提示不是连续解析结果。

3D 视图使用本地 Three.js 0.160.1，二维图表使用本地 Chart.js，均无需联网。3D 需要浏览器支持 WebGL；不可用时会提示，数值表和伤害图仍可使用。第三方许可证见 [`vendor/three.LICENSE.txt`](./vendor/three.LICENSE.txt)。

上游 RawData 尚未导出的新装备，会从 [`data/equipment_supplements.json`](./data/equipment_supplements.json) 合并人工复核的中文 Wiki 详细武器数据。此类条目只显示 `Wiki v… · revid …` 来源徽标，不会冒充 RawData；仍无完整射弹数据的装备会明确标为不支持，而不是用默认值猜参数。

## 网页的任意方向速度继承

勾选 `inherit_velocity`，输入有限非负的发射者总速率 `shooterSpeed`（m/s）、移动水平方向角 `shooterAzimuthDeg` 和移动上下倾角 `shooterElevationDeg`（均为度，默认 0）。世界坐标固定为 **X 前方、Y 上方、Z 右侧**。水平方向角 **0° 前、90° 右、180° 后、-90° 左**，任意有限角度可按 360° 周期输入；上下倾角必须在 **-90° 到 90°** 之间，0° 水平、90° 向上、-90° 向下。例如总速率 `5`、水平方向角 `45°`、上下倾角 `0°` 代表水平右前方移动，合成总速率仍是 5 m/s。八个箭头快捷按钮仅修改水平方向角，保留当前上下倾角和枪口仰角。

网页实时只读显示 XYZ 分速度、合成总速率核对和输入总速率。空输入、非有限速率或角度、负速率和超范围上下倾角会提示错误，不会把空输入当作零。关闭继承后禁用移动输入和快捷按钮，保留原值且完全不读取、不校验这些移动参数。

先把移动角度换算为固定世界 XYZ 速度，再与独立的枪口方向相加（以下三角函数的角度按度计算）：

```text
shooter_vx = shooterSpeed × cos(shooterElevationDeg) × cos(shooterAzimuthDeg)
shooter_vy = shooterSpeed × sin(shooterElevationDeg)
shooter_vz = shooterSpeed × cos(shooterElevationDeg) × sin(shooterAzimuthDeg)
v_initial = v_config × muzzle_direction + (shooter_vx, shooter_vy, shooter_vz)
```

主网页的共享函数 `HD2Ballistics.calculateShooterVelocity(opts)` 返回 `{x, y, z}`。

阻力、路程和伤害使用三分量合成速度；伤害比例和低速销毁线的参考值仍是 `v_config`。继承可能使初速度反向或恰好抵消为零；触发低速销毁时出膛即结束，忽略该规则时仍可受重力加速。各向同性二次阻力与恒定重力下，轨迹仍处于合成初速度与重力确定的平面内，3D 视图展示此平面在世界坐标中的方向。

水平瞄准的同高目标固定在 `(目标距离, 0, 0)`。求解器除扫描枪口仰角外，还自动计算方位补偿以抵消继承的 Z 速度，结果表显示补偿方位角与落点 Z；正方位角朝 +Z。若侧向速度无法抵消、无法向前飞行或寿命内无法回落，就不报告命中。发射者方向使用固定世界坐标，不随求解中的枪口仰角旋转。

## 共享物理 API 命名

- 轨迹：`HD2Ballistics.simulateTrajectory`
- 命中：`HD2Ballistics.simulateImpact`
- 瞄准：`HD2Ballistics.solveAim`
- 更新频率：`stepHz`，单位 Hz；不是游戏 JSON 的 `simulation_steps`。
- 结束原因：`endReason`，取值为 `initial_destroyed`、`terminal_velocity`、`life_expired`、`time_cap`。
- 3D 速度方向：`speedElevationDeg` + `speedAzimuthDeg`；加速度方向：`accelerationElevationDeg` + `accelerationAzimuthDeg`。Python 2D 端的 `speed_angle_deg` 是平面角，不是这里的仰角。

## 3D 轨迹查看操作

- **自由轨道**：W/A/S/D 移动观察位置，Q/E 下降与上升，Shift 加速；拖拽旋转，滚轮缩放，右键拖拽平移。侧视、俯视和全景重置提供快捷观察角度。
- **播放与时间滑块**：查看飞行过程与该时刻的位置、速度、普通和耐久伤害。播放位置在离散记录间按时间插值，不改变物理积分。
- **参考标记**：虚线为枪口瞄准方向，箭头为合成初速方向。Y=0 网格只是发射高度参考面，不会截断负高度轨迹；三轴始终等比显示。
- **鼠标悬停与保存**：靠近轨迹查看最近记录的 X/Y/Z、时间、速度和伤害；"保存 3D 画面"导出 WebGL 场景 PNG（不含界面 HUD 与文字标签）。

## 开发者：测试

网页版测试使用 Node.js 内置 `node:test`，无需安装依赖：

```bash
node --test HD2_Ballistics/tests/velocity-inheritance.test.cjs
node --test HD2_Ballistics/tests/import-and-charts.test.cjs
```

`import-and-charts` 会按「本仓/工作区根目录」解析 `data/generated_projectile_settings.json` 与 `data/generated_damage_settings.json`（本地游戏数据，不随站点部署）；数据版本更新后，需要同步测试里的记录数、type 样例和 metadata 断言。
