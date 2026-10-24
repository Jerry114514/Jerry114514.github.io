(function () {
  "use strict";

  const B = window.HD2Ballistics;
  const strings = {
    zh: {
      "brand.title": "绝地潜兵 2 · 弹道模拟器", "brand.subtitle": "基于射弹配置的本地弹道研究工具", "locale.label": "切换语言",
      "mode.eyebrow": "计算方式", "mode.title": "模拟模式", "mode.traj": "轨迹模式", "mode.aim": "水平瞄准",
      "hint.traj": "指定发射仰角，查看轨迹、逐步状态和普通伤害。total_time 控制计算窗口，life_time 是射弹寿命。",
      "hint.aim": "指定同高目标的水平距离，搜索可命中的发射仰角。life_time 限制寿命；为 0 时使用内部估算的计算预算。",
      "import.eyebrow": "本地数据", "import.reading": "正在读取 JSON 文件…", "import.duplicate": "文件中存在多条 type {type}，无法唯一匹配，未修改参数。", "import.title": "导入射弹配置", "import.file": "选择 generated_projectile_settings.json", "import.type": "射弹 type 编号", "import.action": "导入参数", "import.waiting": "请选择本地 JSON 文件。", "import.notes": "两个文件仅在本机读取。伤害按 damage_info_type 关联；simulation_steps 和寿命随机性不会由此工具应用。",
      "import.fileReady": "已读取 {count} 条射弹记录。输入 type 编号后导入。", "import.success": "已导入 type {type} · {name}", "import.meta": "游戏版本 {version} · 数据日期 {date}", "import.notFound": "找不到 type {type}。请检查编号或选择正确的数据文件。", "import.noFile": "请先选择 generated_projectile_settings.json。", "import.badJson": "无法解析 JSON 文件，请检查文件内容。", "import.badStructure": "文件结构不符合预期：未找到 ProjectileSettings.items 射弹列表。", "import.badType": "请输入非负整数形式的 type 编号。", "import.invalidRecord": "该射弹记录缺少有效的弹道参数，未更改当前输入。", "import.limitations": "simulation_steps 未导入；寿命随机性未模拟。",
      "damage.file": "选择 generated_damage_settings.json", "damage.waiting": "可选择伤害 JSON，按 damage_info_type 自动填入普通和耐久伤害。", "damage.reading": "正在读取伤害 JSON…", "damage.ready": "已读取 {count} 条伤害记录。导入射弹时将自动关联伤害。", "damage.success": "已关联伤害 type {type}：普通伤害 {normal}，耐久伤害 {durable}。", "damage.noFile": "未加载伤害 JSON，保留当前普通／耐久伤害，可手动填写。", "damage.notFound": "伤害表中找不到 type {type}，保留当前普通／耐久伤害，请手动填写。", "damage.duplicate": "伤害表中有多条 type {type}，无法唯一匹配，保留当前伤害。", "damage.invalidRecord": "伤害 type {type} 的 damage 数组无效，保留当前伤害。", "damage.badReference": "该射弹的 damage_info_type 无效，保留当前伤害。", "damage.badStructure": "文件结构不符合预期：未找到有效的 DamageSettings.items 伤害列表。", "damage.badJson": "无法解析伤害 JSON，请检查文件内容。",
      "common.eyebrow": "射弹与环境", "common.title": "共用参数", "field.caliber": "口径 calibre (mm)", "field.mass": "质量 mass (g)", "field.speed": "配置速度 v_config (m/s)", "field.drag": "阻力系数 drag", "field.gravityMultiplier": "重力倍率 gravity_multiplier", "field.gravity": "基准重力 g0 (m/s²)", "field.stepHz": "模拟更新频率 step_hz (Hz)", "field.lifeTime": "射弹寿命 life_time (s)，0=无上限", "field.totalTime": "模拟时长 total_time (s)", "field.normalDamage": "配置普通伤害 normal_damage", "field.durableDamage": "配置耐久伤害 durable_damage", "field.rho": "空气密度 ρ (kg/m³)", "field.ignoreTerminalVelocity": "忽略低速销毁线（配置速度的 10%）", "field.showPlot": "显示图表",
      "traj.eyebrow": "给定发射角", "traj.title": "轨迹计算参数", "traj.angle": "发射仰角 (°)，正上负下", "traj.distances": "累计飞行路程节点 (m)，逗号分隔", "traj.printEvery": "结果表每隔 N 步采样",
      "aim.eyebrow": "给定目标距离", "aim.title": "水平瞄准参数", "aim.hint": "目标固定在世界坐标 (水平距离, 0, 0)。扫描枪口仰角，并自动补偿侧向速度所需的方位角；正方位角朝 +Z。寿命和低速销毁仍会限制可达性。", "aim.ranges": "目标水平距离 (m)，逗号分隔", "aim.angleStep": "仰角粗扫步长 (°)",
      "action.run": "运行模拟", "action.running": "计算中…", "action.runningAim": "计算中（角度扫描可能需要一点时间）…", "action.done": "完成", "action.error": "计算失败",
      "results.eyebrow": "输出", "results.title": "模拟结果", "results.distanceNodes": "指定路程节点", "results.noNodes": "没有到达指定路程节点。", "results.stepStates": "逐步状态（采样）", "results.time": "时间 (s)", "results.x": "水平位置 X (m)", "results.y": "高度 Y (m)", "results.path": "累计路程 (m)", "results.speed": "速度 (m/s)", "results.speedElevation": "速度仰角 (°)", "results.acceleration": "加速度 (m/s²)", "results.accelerationElevation": "加速度仰角 (°)", "results.accelerationAzimuth": "加速度方位角 (°)", "results.normalDamage": "普通伤害", "results.durableDamage": "耐久伤害", "results.damageRatio": "伤害比例 (%)", "results.range": "水平射程 (m)", "results.angle": "仰角 (°)", "results.landingX": "落点 X (m)", "results.travelPath": "累计飞行路程 (m)", "results.impactSpeed": "命中速度 (m/s)", "results.solution": "解", "results.impactElevation": "命中速度仰角 (°)", "results.target": "目标水平距离 {range} m", "results.reachable": "可达", "results.unreachable": "不可达", "results.overRange": "超出最大水平射程", "results.noRoot": "未找到仰角解", "results.meta": "阻力常数 K = {k} m⁻¹ · 重力 g = {g} m/s² · 寿命：{life} · 记录 {count} 条（含初始状态）· 结束原因：{reason}", "results.metaAim": "阻力常数 K = {k} m⁻¹ · 重力 g = {g} m/s² · 寿命：{life} · 估算最大水平射程 {range} m @ {angle}°", "results.lifeUnlimited": "无寿命上限", "results.reason.time_cap": "达到模拟时长上限", "results.reason.terminal_velocity": "速度达到配置速度 10% 销毁线", "results.reason.initial_destroyed": "实际初速已达到配置速度 10% 的销毁阈值，射弹出膛即销毁。", "results.reason.life_expired": "射弹寿命到期", "results.reason.landed": "落地", "results.reason.timeout": "达到计算预算", "results.reason.no_gravity": "重力为零，无法回落", "results.reason.non_positive_angle": "发射角无效", "results.noGravity": "有效重力为零：射弹不会回落到同高平面，无法进行回落求角。", "results.noLanded": "当前参数下没有可落地的弹道。", "results.lifeCap": "寿命到期前未落地的弹道不计为命中。", "results.lowSpeed": "低速销毁规则可能使高抛弹道在落地前结束。", "results.noTargets": "请至少输入一个有效的目标水平距离。",
      "field.inheritVelocity": "继承发射者速度 inherit_velocity", "field.shooterSpeed": "发射者总速率 shooter_speed (m/s)", "field.shooterAzimuth": "移动水平方向角 (°)，0 前 / 90 右", "field.shooterElevation": "移动上下倾角 (°)，-90..90，正上负下",
      "inherit.hint": "世界坐标：X 前、Y 上、Z 右。移动水平方向角 0° 前、90° 右、180° 后、-90° 左，可按 360° 周期输入；上下倾角 0° 水平、±90° 竖直。移动方向独立于枪口仰角。快捷按钮只更改水平方向角。继承只改变出膛速度，配置速度仍用于伤害与低速销毁判定。",
      "inherit.directions": "移动方向快捷选择", "inherit.components": "XYZ 分速度 = ({x}, {y}, {z}) m/s · 总速率核对 √(X²+Y²+Z²) = {speed} m/s · 输入总速率 {input} m/s", "inherit.disabled": "速度继承已关闭；继承的 XYZ 分速度 = (0, 0, 0) m/s，总速率 = 0 m/s。保留的移动输入不参与计算。",
      "results.z": "侧向位置 Z (m)", "results.speedAzimuth": "速度方位角 (°)", "results.launchAzimuth": "枪口方位补偿 (°)", "results.landingZ": "落点 Z (m)", "results.initialState": "实际初速 {speed} m/s · 初始速度 (X, Y, Z) = ({vx}, {vy}, {vz}) m/s · 初始伤害比例 {ratio}%",
      "error.velocity": "速度继承参数无效：总速率须为有限非负数，水平方向角和上下倾角须为有限数，上下倾角须在 -90° 到 90° 之间；输入不能为空。", "chart.unavailable3d": "3D 查看器未加载，请刷新页面；数值结果仍可查看。",
      "solution.unique": "唯一解", "solution.low": "低抛", "solution.high": "高抛", "solution.other": "其他",
      "chart.trajectory": "弹道轨迹", "chart.flight": "飞行轨迹", "chart.horizontal": "水平距离 X (m)", "chart.height": "高度 Y (m)", "chart.damageTitle": "普通伤害与累计路程", "chart.damage": "普通伤害", "chart.floor": "公式下限 25%", "chart.path": "累计路程 (m)", "chart.rangeCurve": "水平射程", "chart.target": "目标 {range} m", "chart.solution": "求解点", "chart.angleRange": "仰角与水平射程", "chart.launchAngle": "发射仰角 (°)", "chart.landingX": "水平落点 X (m)", "chart.impactTrajectory": "命中轨迹（首个可达目标）", "chart.noTrajectory": "没有可显示的命中轨迹", "chart.aimTarget": "目标 X = {range} m", "chart.targetTrajectory": "{range} m · {solution} · {angle}°",
      "error.time": "时间参数无效：更新频率须为有限正数，寿命须为有限非负数；轨迹模式的模拟时长也须为有限正数。", "error.steps": "模拟步数过大，请降低模拟时长或更新频率。", "error.parameters": "输入参数无效，请检查数值和单位。", "error.generic": "发生未预期的计算错误。", "error.physics.positive": "{field} 必须是有限正数。", "error.physics.nonNegative": "{field} 必须是有限非负数。", "error.physics.sweepBudget": "仰角采样数过大（{count} > 上限 {cap}），请增大仰角粗扫步长 angleStepDeg。", "import.advanced": "高级：手动导入游戏 JSON",
      "preset.eyebrow": "武器目录", "preset.title": "武器预设", "preset.category": "武器类别", "preset.weapon": "武器", "preset.attack": "攻击 / 射击模式",
      "preset.cat.primary": "主手武器", "preset.cat.secondary": "副手武器", "preset.cat.support": "支援武器", "preset.cat.throwable": "投掷物",
      "preset.choose": "—— 请选择 ——", "preset.loading": "正在加载武器目录…",
      "preset.failed": "武器目录加载失败，预设已隐藏；下方手动导入仍可使用。", "preset.badSchema": "武器目录格式不符合预期，预设已隐藏；下方手动导入仍可使用。",
      "preset.badge.rawdata": "RawData v{version}（{date}）", "preset.badge.wiki": "Wiki {date}", "preset.badge.wikiItem": "Wiki v{version} · revid {revid}", "preset.badge.type": "projectile type {type}", "preset.badge.num": "弹丸数 ×{num}",
      "preset.numNote": "多弹丸武器：各弹丸弹道相同，伤害按单弹丸展示，不叠加。", "preset.ready": "已按预设填充参数。发射者移动、枪口仰角等场景参数仍由你输入。",
      "preset.notes": "预设来自站点武器目录（RawData 上游自动同步）。发射者移动、枪口仰角、目标距离等场景参数仍由你在下方按需输入。",
      "preset.unsupported.entry": "当前弹道模型不支持该武器：{reason}", "preset.unsupported.kind": "当前弹道模型不支持「{kind}」类攻击",
      "preset.unresolved": "该攻击的射弹参数无法唯一确认（候选：{candidates}）。已回退到手动模式。", "preset.mismatch": "⚠ Wiki 与 RawData 数值不一致：{fields}", "preset.manualFallback": "已展开下方手动导入，可自行填写参数。", "footer.text": "物理模型说明：", "footer.link": "HD2_PROJECTILE_PHYSICS.md"
    },
    en: {
      "brand.title": "Helldivers 2 · Ballistics Simulator", "brand.subtitle": "A local projectile-configuration and trajectory research tool", "locale.label": "Switch language",
      "mode.eyebrow": "Calculation mode", "mode.title": "Simulation mode", "mode.traj": "Trajectory", "mode.aim": "Horizontal aiming",
      "hint.traj": "Set a launch angle to inspect the trajectory, step states, and normal damage. total_time limits computation; life_time is the projectile's configured lifetime.",
      "hint.aim": "Enter the horizontal range to a target at the same height and search for launch angles that hit it. life_time limits projectile lifetime; zero uses an internal time budget estimate.",
      "import.eyebrow": "Local data", "import.reading": "Reading JSON file…", "import.duplicate": "Multiple records match type {type}. Parameters were not changed.", "import.title": "Import projectile settings", "import.file": "Choose generated_projectile_settings.json", "import.type": "Projectile type ID", "import.action": "Import parameters", "import.waiting": "Choose a local JSON file.", "import.notes": "Both files are read locally. Damage is linked by damage_info_type; simulation_steps and lifetime randomness are not applied by this tool.",
      "import.fileReady": "Loaded {count} projectile records. Enter a type ID and import it.", "import.success": "Imported type {type} · {name}", "import.meta": "Game version {version} · data date {date}", "import.notFound": "Type {type} was not found. Check the ID or choose the correct data file.", "import.noFile": "Choose generated_projectile_settings.json first.", "import.badJson": "Could not parse the JSON file. Check its contents.", "import.badStructure": "Unexpected file structure: ProjectileSettings.items was not found.", "import.badType": "Enter a non-negative integer type ID.", "import.invalidRecord": "This projectile record is missing valid ballistic parameters. Current inputs were not changed.", "import.limitations": "simulation_steps was not imported; lifetime randomness is not simulated.",
      "damage.file": "Choose generated_damage_settings.json", "damage.waiting": "Optionally load damage JSON to fill normal and durable damage using damage_info_type.", "damage.reading": "Reading damage JSON…", "damage.ready": "Loaded {count} damage records. Damage will be linked when importing a projectile.", "damage.success": "Linked damage type {type}: normal damage {normal}, durable damage {durable}.", "damage.noFile": "No damage JSON loaded. Current normal/durable damage was kept; enter values manually.", "damage.notFound": "Damage type {type} was not found. Current normal/durable damage was kept; enter values manually.", "damage.duplicate": "Multiple damage records match type {type}. Current damage values were kept.", "damage.invalidRecord": "Damage type {type} has an invalid damage array. Current damage values were kept.", "damage.badReference": "This projectile has an invalid damage_info_type. Current damage values were kept.", "damage.badStructure": "Unexpected file structure: no valid DamageSettings.items damage list was found.", "damage.badJson": "Could not parse the damage JSON. Check its contents.",
      "common.eyebrow": "Projectile and environment", "common.title": "Shared parameters", "field.caliber": "Caliber calibre (mm)", "field.mass": "Mass (g)", "field.speed": "Configured speed v_config (m/s)", "field.drag": "Drag coefficient drag", "field.gravityMultiplier": "Gravity multiplier", "field.gravity": "Reference gravity g0 (m/s²)", "field.stepHz": "Simulation update rate step_hz (Hz)", "field.lifeTime": "Projectile lifetime life_time (s), 0 = unlimited", "field.totalTime": "Simulation duration total_time (s)", "field.normalDamage": "Configured normal damage", "field.durableDamage": "Configured durable damage", "field.rho": "Air density ρ (kg/m³)", "field.ignoreTerminalVelocity": "Ignore low-speed despawn threshold (10% of configured speed)", "field.showPlot": "Show charts",
      "traj.eyebrow": "Fixed launch angle", "traj.title": "Trajectory parameters", "traj.angle": "Launch elevation (°), positive up", "traj.distances": "Cumulative path-length checkpoints (m), comma-separated", "traj.printEvery": "Sample the results table every N steps",
      "aim.eyebrow": "Fixed target range", "aim.title": "Horizontal aiming parameters", "aim.hint": "Targets are fixed at world coordinates (range, 0, 0). The solver scans muzzle elevation and compensates lateral velocity with a muzzle azimuth correction; positive azimuth points toward +Z. Lifetime and low-speed despawn still limit reachability.", "aim.ranges": "Target horizontal ranges (m), comma-separated", "aim.angleStep": "Coarse launch-angle step (°)",
      "action.run": "Run simulation", "action.running": "Calculating…", "action.runningAim": "Calculating (angle scan may take a moment)…", "action.done": "Complete", "action.error": "Calculation failed",
      "results.eyebrow": "Output", "results.title": "Simulation results", "results.distanceNodes": "Path-length checkpoints", "results.noNodes": "No requested path-length checkpoint was reached.", "results.stepStates": "Step states (sampled)", "results.time": "Time (s)", "results.x": "Horizontal position X (m)", "results.y": "Height Y (m)", "results.path": "Cumulative path (m)", "results.speed": "Speed (m/s)", "results.speedElevation": "Velocity elevation (°)", "results.acceleration": "Acceleration (m/s²)", "results.accelerationElevation": "Acceleration elevation (°)", "results.accelerationAzimuth": "Acceleration azimuth (°)", "results.normalDamage": "Normal damage", "results.durableDamage": "Durable damage", "results.damageRatio": "Damage ratio (%)", "results.range": "Horizontal range (m)", "results.angle": "Launch angle (°)", "results.landingX": "Landing X (m)", "results.travelPath": "Cumulative path length (m)", "results.impactSpeed": "Impact speed (m/s)", "results.solution": "Solution", "results.impactElevation": "Impact velocity elevation (°)", "results.target": "Target range {range} m", "results.reachable": "Reachable", "results.unreachable": "Unreachable", "results.overRange": "Beyond maximum horizontal range", "results.noRoot": "No launch-angle solution found", "results.meta": "Drag constant K = {k} m⁻¹ · gravity g = {g} m/s² · lifetime: {life} · {count} records (including initial state) · end reason: {reason}", "results.metaAim": "Drag constant K = {k} m⁻¹ · gravity g = {g} m/s² · lifetime: {life} · estimated maximum range {range} m @ {angle}°", "results.lifeUnlimited": "Unlimited", "results.reason.time_cap": "Simulation duration limit reached", "results.reason.terminal_velocity": "Speed reached the 10% configured-speed despawn threshold", "results.reason.initial_destroyed": "Actual launch speed is at or below the 10% despawn threshold; the projectile is destroyed at the muzzle.", "results.reason.life_expired": "Projectile lifetime expired", "results.reason.landed": "Landed", "results.reason.timeout": "Computation budget reached", "results.reason.no_gravity": "No gravity; projectile does not return", "results.reason.non_positive_angle": "Invalid launch angle", "results.noGravity": "Effective gravity is zero: the projectile will not return to the target plane, so same-height aiming is unavailable.", "results.noLanded": "No trajectory landed with the current parameters.", "results.lifeCap": "Trajectories that do not land before lifetime expiry do not count as hits.", "results.lowSpeed": "The low-speed despawn rule may end high-angle trajectories before landing.", "results.noTargets": "Enter at least one valid horizontal target range.",
      "field.inheritVelocity": "Inherit shooter velocity inherit_velocity", "field.shooterSpeed": "Shooter total speed shooter_speed (m/s)", "field.shooterAzimuth": "Movement azimuth (°), 0 forward / 90 right", "field.shooterElevation": "Movement elevation (°), -90..90, positive up",
      "inherit.hint": "World axes: X forward, Y up, Z right. Movement azimuth: 0° forward, 90° right, 180° backward, -90° left; angles repeat every 360°. Movement elevation: 0° horizontal, ±90° vertical. Movement is independent of muzzle elevation. Direction shortcuts change azimuth only. Inheritance changes launch velocity; configured speed remains the damage and despawn reference.",
      "inherit.directions": "Movement direction shortcuts", "inherit.components": "XYZ velocity = ({x}, {y}, {z}) m/s · total speed check √(X²+Y²+Z²) = {speed} m/s · entered total speed {input} m/s", "inherit.disabled": "Velocity inheritance is off; inherited XYZ velocity = (0, 0, 0) m/s, total speed = 0 m/s. Stored movement inputs are not used.",
      "results.z": "Lateral position Z (m)", "results.speedAzimuth": "Velocity azimuth (°)", "results.launchAzimuth": "Muzzle azimuth correction (°)", "results.landingZ": "Landing Z (m)", "results.initialState": "Actual launch speed {speed} m/s · initial velocity (X, Y, Z) = ({vx}, {vy}, {vz}) m/s · initial damage ratio {ratio}%",
      "error.velocity": "Invalid velocity inheritance: total speed must be finite and non-negative, azimuth and elevation must be finite, and elevation must be between -90° and 90°; inputs cannot be empty.", "chart.unavailable3d": "The 3D viewer did not load. Refresh the page; numerical results remain available.",
      "solution.unique": "Unique", "solution.low": "Low arc", "solution.high": "High arc", "solution.other": "Other",
      "chart.trajectory": "Projectile trajectory", "chart.flight": "Flight path", "chart.horizontal": "Horizontal distance X (m)", "chart.height": "Height Y (m)", "chart.damageTitle": "Normal damage vs. cumulative path", "chart.damage": "Normal damage", "chart.floor": "Formula floor 25%", "chart.path": "Cumulative path (m)", "chart.rangeCurve": "Horizontal range", "chart.target": "Target {range} m", "chart.solution": "Solutions", "chart.angleRange": "Launch angle vs. horizontal range", "chart.launchAngle": "Launch elevation (°)", "chart.landingX": "Landing X (m)", "chart.impactTrajectory": "Impact trajectories (first reachable target)", "chart.noTrajectory": "No reachable trajectory to display", "chart.aimTarget": "Target X = {range} m", "chart.targetTrajectory": "{range} m · {solution} · {angle}°",
      "error.time": "Invalid time settings: update rate must be finite and positive, lifetime must be finite and non-negative, and trajectory duration must be finite and positive.", "error.steps": "Too many simulation steps. Reduce the duration or update rate.", "error.parameters": "Invalid input. Check parameter values and units.", "error.generic": "An unexpected calculation error occurred.", "error.physics.positive": "{field} must be a finite positive number.", "error.physics.nonNegative": "{field} must be a finite non-negative number.", "error.physics.sweepBudget": "Elevation sweep sample count too large ({count} > cap {cap}). Increase the coarse angle step (angleStepDeg).", "import.advanced": "Advanced: manually import game JSON",
      "preset.eyebrow": "Weapon catalog", "preset.title": "Weapon presets", "preset.category": "Category", "preset.weapon": "Weapon", "preset.attack": "Attack / fire mode",
      "preset.cat.primary": "Primary weapons", "preset.cat.secondary": "Secondary weapons", "preset.cat.support": "Support weapons", "preset.cat.throwable": "Throwables",
      "preset.choose": "—— Choose ——", "preset.loading": "Loading weapon catalog…",
      "preset.failed": "Weapon catalog failed to load; presets are hidden. Manual import below still works.", "preset.badSchema": "Weapon catalog has an unexpected format; presets are hidden. Manual import below still works.",
      "preset.badge.rawdata": "RawData v{version} ({date})", "preset.badge.wiki": "Wiki {date}", "preset.badge.wikiItem": "Wiki v{version} · revid {revid}", "preset.badge.type": "projectile type {type}", "preset.badge.num": "projectiles ×{num}",
      "preset.numNote": "Multi-projectile weapon: trajectories are identical; damage is shown per single projectile, not summed.", "preset.ready": "Parameters filled from preset. Scenario inputs (shooter movement, muzzle angle, targets) remain yours to set.",
      "preset.notes": "Presets come from the site weapon catalog (automatically synced from RawData upstream). Scenario inputs such as shooter movement, muzzle angle, and target distance remain yours to set below.",
      "preset.unsupported.entry": "The current ballistic model does not support this weapon: {reason}", "preset.unsupported.kind": "The current ballistic model does not support {kind} attacks",
      "preset.unresolved": "Projectile parameters for this attack could not be uniquely resolved (candidates: {candidates}). Manual mode is available below.", "preset.mismatch": "⚠ Wiki/RawData value mismatch: {fields}", "preset.manualFallback": "Manual import below has been expanded; fill parameters by hand.", "footer.text": "Physics model: ", "footer.link": "HD2_PROJECTILE_PHYSICS.md"
    }
  };

  let locale = "zh";
  try { locale = localStorage.getItem("hd2-locale") === "en" ? "en" : "zh"; } catch (_) { /* 本地存储不可用时仍允许离线运行。 */ }
  let mode = "traj";
  let chart1 = null;
  let chart2 = null;
  let trajectoryViewer = null;
  let lastResult = null;
  let importedEntries = null;
  let importedMetadata = null;
  let lastImportMessage = null;
  let lastError = null;
  let fileReadSequence = 0;
  let loadedFile = null;
  let importedDamageEntries = null;
  let damageReadSequence = 0;
  let loadedDamageFile = null;
  let selectedProjectile = null;
  let lastDamageMessage = null;

  function $(id) { return document.getElementById(id); }
  function t(key, values = {}) {
    let text = strings[locale][key] ?? strings.zh[key] ?? key;
    for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }
  function fmt(value, digits = 2) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
  }
  function setLocale(next) {
    locale = next;
    try { localStorage.setItem("hd2-locale", locale); } catch (_) { /* 语言偏好保存失败不影响界面切换。 */ }
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    document.title = locale === "en" ? "HD2 Ballistics Simulator" : "HD2 弹道模拟器";
    document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
    $("locale-toggle").textContent = locale === "en" ? "中文" : "EN";
    $("locale-toggle").setAttribute("aria-label", t("locale.label"));
    $("tab-traj").setAttribute("aria-label", t("mode.traj"));
    $("tab-aim").setAttribute("aria-label", t("mode.aim"));
    document.querySelector('[role="tablist"]').setAttribute("aria-label", t("mode.title"));
    updateMovementOutput();
    if (lastImportMessage) renderImportStatus(lastImportMessage);
    if (lastDamageMessage) renderDamageStatus(lastDamageMessage);
    setMode(mode, false);
    if (lastResult) renderResult();
    if ($("status").dataset.state === "error") $("status").textContent = translateError(lastError);
    else if ($("status").dataset.state === "done") $("status").textContent = t("action.done");
  }
  function setMode(next, redraw = true) {
    mode = next;
    for (const name of ["traj", "aim"]) {
      const active = name === mode;
      $(`tab-${name}`).classList.toggle("active", active);
      $(`tab-${name}`).setAttribute("aria-selected", String(active));
      $(`panel-${name}`).classList.toggle("show", active);
    }
    $("mode-hint").textContent = t(`hint.${mode}`);
    $("label-totalTime").style.display = mode === "traj" ? "" : "none";
    if (redraw && lastResult) renderResult();
  }
  function commonOpts() {
    return {
      caliberMm: Number($("caliberMm").value), massG: Number($("massG").value), vConfig: Number($("vConfig").value),
      dragCoeff: Number($("dragCoeff").value), gravityMultiplier: Number($("gravityMultiplier").value), g0: Number($("g0").value),
      stepHz: Number($("stepHz").value), totalTime: Number($("totalTime").value), lifeTime: Number($("lifeTime").value),
      normalDamage: Number($("normalDamage").value), durableDamage: Number($("durableDamage").value), rho: Number($("rho").value),
      ignoreTerminalVelocity: $("ignoreTerminalVelocity").checked,
      inheritVelocity: $("inheritVelocity").checked,
      ...movementOpts(),
    };
  }
  function movementNumber(id) {
    const input = $(id);
    const text = input.value.trim();
    return text === "" || input.validity?.badInput ? NaN : Number(text);
  }
  function movementOpts() {
    // Disabled movement inputs may be empty or browser-invalid: never read them.
    if (!$("inheritVelocity").checked) return {};
    return {
      shooterSpeed: movementNumber("shooterSpeed"),
      shooterAzimuthDeg: movementNumber("shooterAzimuthDeg"),
      shooterElevationDeg: movementNumber("shooterElevationDeg"),
    };
  }
  function updateMovementOutput() {
    const enabled = $("inheritVelocity").checked;
    const buttons = document.querySelectorAll("[data-shooter-azimuth]");
    const azimuth = enabled ? movementNumber("shooterAzimuthDeg") : NaN;
    const normalized = ((azimuth % 360) + 360) % 360;
    buttons.forEach((button) => {
      const selected = enabled && normalized === ((Number(button.dataset.shooterAzimuth) % 360) + 360) % 360;
      button.setAttribute("aria-pressed", String(selected));
    });
    const output = $("shooter-velocity-output");
    output.classList.remove("error");
    if (!enabled) {
      output.textContent = t("inherit.disabled");
      return;
    }
    try {
      const opts = { inheritVelocity: true, ...movementOpts() };
      const velocity = B.calculateShooterVelocity(opts);
      output.textContent = t("inherit.components", {
        x: fmt(velocity.x, 3), y: fmt(velocity.y, 3), z: fmt(velocity.z, 3),
        speed: fmt(Math.hypot(velocity.x, velocity.y, velocity.z), 3), input: fmt(opts.shooterSpeed, 3),
      });
    } catch (_) {
      output.textContent = t("error.velocity");
      output.classList.add("error");
    }
  }
  function updateInheritanceInputs() {
    const disabled = !$("inheritVelocity").checked;
    for (const id of ["shooterSpeed", "shooterAzimuthDeg", "shooterElevationDeg"]) {
      $(id).disabled = disabled;
    }
    document.querySelectorAll("[data-shooter-azimuth]").forEach((button) => { button.disabled = disabled; });
    updateMovementOutput();
  }
  function destroyCharts() {
    if (trajectoryViewer) { trajectoryViewer.destroy(); trajectoryViewer = null; }
    $("trajectory3d-wrap").replaceChildren();
    $("trajectory3d-wrap").style.display = "none";
    $("charts").classList.remove("trajectory-layout");
    if (chart1) { chart1.destroy(); chart1 = null; }
    if (chart2) { chart2.destroy(); chart2 = null; }
    $("chart1-wrap").style.display = "none";
    $("chart2-wrap").style.display = "none";
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function tableHtml(headers, rows) {
    const head = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
    const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function block(title, table) { return `<section class="result-block"><h3>${escapeHtml(title)}</h3>${table}</section>`; }
  function destroyResult() { destroyCharts(); $("result-meta").textContent = ""; $("initial-state").textContent = ""; $("result-tables").replaceChildren(); }
  function endReason(reason) { return t(`results.reason.${reason}`); }
  function renderTrajectoryTables(result) {
    const res = result.data;
    let html = "";
    if (res.distanceHits.length) {
      html += block(t("results.distanceNodes"), tableHtml(
        [t("results.path"), t("results.time"), t("results.x"), t("results.y"), t("results.z"), t("results.speed"), t("results.speedElevation"), t("results.speedAzimuth"), t("results.normalDamage"), t("results.durableDamage"), t("results.damageRatio")],
        res.distanceHits.map((hit) => [fmt(hit.distance), fmt(hit.time, 4), fmt(hit.x), fmt(hit.y), fmt(hit.z), fmt(hit.speed), fmt(hit.speedElevationDeg), fmt(hit.speedAzimuthDeg), fmt(hit.normalDamage), fmt(hit.durableDamage), fmt(hit.damageRatio * 100)]),
      ));
    } else html += block(t("results.distanceNodes"), `<p class="hint">${escapeHtml(t("results.noNodes"))}</p>`);
    html += block(t("results.stepStates"), tableHtml(
      [t("results.time"), t("results.x"), t("results.y"), t("results.z"), t("results.path"), t("results.speed"), t("results.speedElevation"), t("results.speedAzimuth"), t("results.acceleration"), t("results.accelerationElevation"), t("results.accelerationAzimuth"), t("results.normalDamage"), t("results.durableDamage"), t("results.damageRatio")],
      res.tableRows.map((row) => [fmt(row.time, 3), fmt(row.x, 3), fmt(row.y, 3), fmt(row.z, 3), fmt(row.pathLength, 3), fmt(row.speed), fmt(row.speedElevationDeg), fmt(row.speedAzimuthDeg), fmt(row.acceleration), fmt(row.accelerationElevationDeg), fmt(row.accelerationAzimuthDeg), fmt(row.normalDamage), fmt(row.durableDamage), fmt(row.damageRatio * 100, 1)]),
    ));
    $("result-tables").innerHTML = html;
  }
  function chartOptions(title, xTitle, yTitle, y = {}) {
    return {
      responsive: true, maintainAspectRatio: false, parsing: false,
      interaction: { mode: "nearest", axis: "xy", intersect: false },
      elements: { point: { hitRadius: 10, hoverRadius: 4 } },
      plugins: {
        title: { display: true, text: title },
        legend: { labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: { callbacks: {
          title: (items) => items[0]?.dataset.label || "",
          label: (item) => [`${xTitle}: ${fmt(item.parsed.x, 3)}`, `${yTitle}: ${fmt(item.parsed.y, 3)}`],
        } },
      },
      scales: { x: { type: "linear", title: { display: true, text: xTitle }, grid: { color: "rgba(23,33,29,.07)" } }, y: { ...y, title: { display: true, text: yTitle }, grid: { color: "rgba(23,33,29,.07)" } } },
    };
  }
  function renderTrajectoryCharts(result) {
    if (!$("showPlot").checked) return;
    const res = result.data;
    const records = res.records;
    const pathLengths = records.map((record) => record.pathLength);
    const normalDamages = records.map((record) => record.normalDamage);
    $("charts").classList.add("trajectory-layout");
    $("trajectory3d-wrap").style.display = "block";
    if (typeof window.HD2Trajectory3D === "function") {
      trajectoryViewer = new window.HD2Trajectory3D($("trajectory3d-wrap"), {
        records, opts: result.opts, initialVelocity: res.initialVelocity, locale,
      });
    } else $("trajectory3d-wrap").textContent = t("chart.unavailable3d");
    if (typeof Chart === "undefined") return;
    $("chart2-wrap").style.display = "block";
    chart2 = new Chart($("chart2"), {
      type: "line",
      data: { datasets: [
        { label: t("chart.damage"), data: pathLengths.map((x, index) => ({ x, y: normalDamages[index] })), borderColor: "#c66a3d", pointRadius: 0, borderWidth: 2.2 },
        { label: t("chart.floor"), data: [{ x: pathLengths[0] || 0, y: res.normalDamage * 0.25 }, { x: pathLengths.at(-1) || 1, y: res.normalDamage * 0.25 }], borderColor: "#427b92", borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
      ] },
      options: chartOptions(t("chart.damageTitle"), t("chart.path"), t("chart.damage"), { min: 0, max: Math.max(res.normalDamage, ...normalDamages) * 1.05 }),
    });
  }
  function renderAimTables(result) {
    const res = result.data;
    if (!res.ok) {
      const messages = [res.reason === "no_gravity" ? t("results.noGravity")
        : res.reason === "initial_destroyed" ? t("results.reason.initial_destroyed")
        : t("results.noLanded")];
      if (!res.ignoreTerminalVelocity && res.reason !== "no_gravity" && res.reason !== "initial_destroyed") messages.push(t("results.lowSpeed"));
      if (result.opts.lifeTime > 0 && res.reason !== "no_gravity" && res.reason !== "initial_destroyed") messages.push(t("results.lifeCap"));
      $("result-meta").textContent = messages.join(" ");
      $("result-tables").replaceChildren();
      return;
    }
    const html = res.targets.map((target) => {
      const title = t("results.target", { range: fmt(target.range) }) + ` · ${target.reachable ? t("results.reachable") : t("results.unreachable")}`;
      if (!target.solutions.length) return block(title, `<p class="hint">${escapeHtml(target.range > res.maximumRange ? t("results.overRange") : t("results.noRoot"))}</p>`);
      return block(title, tableHtml(
        [t("results.solution"), t("results.angle"), t("results.launchAzimuth"), t("results.time"), t("results.landingX"), t("results.landingZ"), t("results.travelPath"), t("results.impactSpeed"), t("results.impactElevation"), t("results.normalDamage"), t("results.durableDamage"), t("results.damageRatio")],
        target.solutions.map((solution, index) => [t(`solution.${B.labelSol(index, target.solutions.length)}`), fmt(solution.launchAngleDeg, 3), fmt(solution.launchAzimuthDeg, 3), fmt(solution.time, 4), fmt(solution.landingX, 3), fmt(solution.landingZ, 3), fmt(solution.pathLength, 3), fmt(solution.speedImpact), fmt(solution.speedElevationDegImpact), fmt(solution.normalDamageImpact), fmt(solution.durableDamageImpact), fmt(solution.damageRatioImpact * 100)]),
      ));
    }).join("");
    $("result-tables").innerHTML = html;
  }
  function renderAimCharts(result) {
    const res = result.data;
    if (!res.ok || !$("showPlot").checked || typeof Chart === "undefined") return;
    $("chart1-wrap").style.display = "block";
    $("chart2-wrap").style.display = "block";
    const angles = res.landedAngles.map(([angle]) => angle);
    const ranges = res.landedAngles.map(([, range]) => range);
    const targetLines = res.targets.filter((target) => target.reachable).map((target) => ({
      label: t("chart.target", { range: fmt(target.range) }),
      data: [{ x: angles[0], y: target.range }, { x: angles.at(-1), y: target.range }],
      borderColor: "rgba(198,106,61,.5)", borderDash: [6, 4], pointRadius: 0, borderWidth: 1,
    }));
    const points = res.targets.flatMap((target) => target.solutions.map((solution) => ({ x: solution.launchAngleDeg, y: solution.landingX })));
    chart1 = new Chart($("chart1"), {
      type: "line",
      data: { datasets: [
        { label: t("chart.rangeCurve"), data: angles.map((x, index) => ({ x, y: ranges[index] })), borderColor: "#245c47", pointRadius: 0, borderWidth: 2.2 },
        ...targetLines,
        { type: "scatter", label: t("chart.solution"), data: points, backgroundColor: "#c66a3d", pointRadius: 4 },
      ] },
      options: chartOptions(t("chart.angleRange"), t("chart.launchAngle"), t("chart.landingX")),
    });
    const datasets = [];
    let minimumHeight = 0;
    let maximumHeight = 0;
    for (const curve of res.firstTrajectory?.curves ?? []) {
      for (const point of curve.track) {
        minimumHeight = Math.min(minimumHeight, point.y);
        maximumHeight = Math.max(maximumHeight, point.y);
      }
    }
    const heightPadding = (maximumHeight - minimumHeight || 1) * 0.05;
    const heightLimits = {
      min: minimumHeight < 0 ? minimumHeight - heightPadding : 0,
      max: maximumHeight + heightPadding,
    };
    if (res.firstTrajectory) {
      const colors = ["#245c47", "#c66a3d", "#427b92", "#b48a36"];
      res.firstTrajectory.curves.forEach((curve, index) => {
        datasets.push({ label: t("chart.targetTrajectory", { range: fmt(res.firstTrajectory.range, 0), solution: t(`solution.${B.labelSol(index, res.firstTrajectory.curves.length)}`), angle: fmt(curve.launchAngleDeg) }), data: curve.track.map((point) => ({ x: point.x, y: point.y })), borderColor: colors[index % colors.length], pointRadius: 0, borderWidth: 2 });
      });
      datasets.push({ label: t("chart.aimTarget", { range: fmt(res.firstTrajectory.range) }), data: [{ x: res.firstTrajectory.range, y: heightLimits.min }, { x: res.firstTrajectory.range, y: heightLimits.max }], borderColor: "rgba(198,106,61,.55)", borderDash: [4, 4], pointRadius: 0, borderWidth: 1 });
    }
    chart2 = new Chart($("chart2"), { type: "line", data: { datasets }, options: chartOptions(res.firstTrajectory ? t("chart.impactTrajectory") : t("chart.noTrajectory"), t("chart.horizontal"), t("chart.height"), heightLimits) });
  }
  function renderResult() {
    if (!lastResult) return;
    destroyCharts();
    $("initial-state").textContent = "";
    $("results").classList.add("visible");
    if (lastResult.mode === "traj") {
      const initial = lastResult.data.initialVelocity;
      if (initial) $("initial-state").textContent = t("results.initialState", {
        speed: fmt(initial.speed, 3), vx: fmt(initial.vx, 3), vy: fmt(initial.vy, 3), vz: fmt(initial.vz, 3),
        ratio: fmt(lastResult.data.records[0].damageRatio * 100, 2),
      });
      const res = lastResult.data;
      const life = res.lifeTime > 0 ? `${fmt(res.lifeTime, 4)} s` : t("results.lifeUnlimited");
      $("result-meta").textContent = t("results.meta", { k: fmt(res.dragConstant, 6), g: fmt(res.gravity, 4), life, count: res.records.length, reason: endReason(res.endReason) });
      renderTrajectoryTables(lastResult);
      renderTrajectoryCharts(lastResult);
    } else {
      const res = lastResult.data;
      if (res.ok) {
        const life = lastResult.opts.lifeTime > 0 ? `${fmt(lastResult.opts.lifeTime, 4)} s` : t("results.lifeUnlimited");
        $("result-meta").textContent = t("results.metaAim", { k: fmt(res.dragConstant, 6), g: fmt(res.gravity, 4), life, range: fmt(res.maximumRange, 3), angle: fmt(res.optimumAngleDeg) });
      }
      renderAimTables(lastResult);
      renderAimCharts(lastResult);
    }
  }
  function runTrajectory() {
    const opts = commonOpts();
    opts.launchAngleDeg = Number($("launchAngleDeg").value);
    opts.targetDistances = B.parseNumberList($("targetDistances").value);
    opts.printEveryNSteps = Math.max(1, Number($("printEveryNSteps").value) || 1);
    lastResult = { mode: "traj", opts, data: B.simulateTrajectory(opts) };
    renderResult();
  }
  function runAim() {
    const opts = commonOpts();
    opts.targetHorizontalRanges = B.parseNumberList($("targetHorizontalRanges").value);
    opts.angleStepDeg = Number($("angleStepDeg").value);
    if (!opts.targetHorizontalRanges.length) throw new Error("NO_TARGETS");
    lastResult = { mode: "aim", opts, data: B.solveAim(opts) };
    renderResult();
  }
  function translateError(error) {
    const message = error && error.message ? error.message : String(error);
    if (message === "NO_TARGETS") return t("results.noTargets");
    // 2026-10-24 审查：物理层抛结构化 {code, field/values} 错误，按 locale 渲染中英文。
    if (error && error.code === "physics_positive") return t("error.physics.positive", { field: error.field });
    if (error && error.code === "physics_non_negative") return t("error.physics.nonNegative", { field: error.field });
    if (error && error.code === "step_budget") return t("error.steps");
    if (error && error.code === "sweep_budget") return t("error.physics.sweepBudget", error.values || {});
    if (/shooter|direction|inherit|velocity|射手|方向|继承/i.test(message)) return t("error.velocity");
    if (message.includes("step_hz") || message.includes("life_time") || message.includes("total_time")) return t("error.time");
    if (message.includes("步数过大") || message.includes("Too many simulation steps")) return t("error.steps");
    if (/must be|finite number|invalid/i.test(message)) return t("error.parameters");
    return t("error.generic");
  }
  function setImportMessage(key, values = {}, kind = "") {
    lastImportMessage = { key, values, kind };
    renderImportStatus(lastImportMessage);
  }
  function renderImportStatus(message) {
    const status = $("import-status");
    status.replaceChildren();
    status.className = `import-meta${message.kind ? ` ${message.kind}` : ""}`;
    status.classList.toggle("ok", message.kind === "ok");
    status.classList.toggle("error", message.kind === "error");
    const first = document.createElement("span");
    first.textContent = t(message.key, message.values);
    status.append(first);
    if (message.metadata) {
      const second = document.createElement("span");
      second.textContent = t("import.meta", message.metadata);
      status.append(second);
    }
    if (message.limitations) {
      const notes = document.createElement("span");
      notes.textContent = t("import.limitations");
      status.append(notes);
    }
  }
  function findProjectileItems(data) {
    if (!Array.isArray(data)) throw new Error("bad_structure");
    const items = [];
    for (const root of data) {
      const list = root && root.ProjectileSettings && root.ProjectileSettings.items;
      if (Array.isArray(list)) items.push(...list);
    }
    if (!items.length) throw new Error("bad_structure");
    return { items, metadata: data[0]?.ProjectileSettings?._metadata ?? {} };
  }
  function parseTypeId(typeValue, family = "ProjectileType") {
    if (typeof typeValue !== "string") return null;
    const match = typeValue.match(new RegExp(`^\\s*(\\d+)\\s*<=>\\s*${family}_Unknown_(\\d+)\\s*$`));
    if (!match || match[1] !== match[2]) return null;
    const typeId = Number(match[1]);
    return Number.isSafeInteger(typeId) ? typeId : null;
  }
  function validNumber(value, min = -Infinity) {
    return typeof value === "number" && Number.isFinite(value) && value >= min;
  }
  function renderDamageStatus(message) {
    const status = $("damage-status");
    status.className = `import-meta${message.kind ? ` ${message.kind}` : ""}`;
    status.textContent = t(message.key, message.values);
  }
  function setDamageMessage(key, values = {}, kind = "") {
    lastDamageMessage = { key, values, kind };
    renderDamageStatus(lastDamageMessage);
  }
  function clearSimulationResult() {
    lastResult = null;
    destroyResult();
    $("status").textContent = "";
    $("status").dataset.state = "";
    $("results").classList.remove("visible");
  }
  function importSelectedDamage() {
    if (!selectedProjectile) return;
    if (!loadedDamageFile || loadedDamageFile !== $("damage-file").files[0] || !importedDamageEntries) {
      setDamageMessage("damage.noFile");
      return;
    }
    const typeId = parseTypeId(selectedProjectile.damage_info_type, "DamageInfoType");
    if (typeId === null) { setDamageMessage("damage.badReference", {}, "error"); return; }
    const matches = importedDamageEntries.filter((entry) => parseTypeId(entry.type, "DamageInfoType") === typeId);
    if (!matches.length) { setDamageMessage("damage.notFound", { type: typeId }, "error"); return; }
    if (matches.length > 1) { setDamageMessage("damage.duplicate", { type: typeId }, "error"); return; }
    const damage = matches[0].damage;
    if (!Array.isArray(damage) || damage.length < 2 || !validNumber(damage[0], 0) || !validNumber(damage[1], 0)) {
      setDamageMessage("damage.invalidRecord", { type: typeId }, "error");
      return;
    }
    $("normalDamage").value = String(damage[0]);
    $("durableDamage").value = String(damage[1]);
    clearSimulationResult();
    setDamageMessage("damage.success", { type: typeId, normal: damage[0], durable: damage[1] }, "ok");
  }
  async function readDamageFile(file) {
    const sequence = ++damageReadSequence;
    importedDamageEntries = null;
    loadedDamageFile = null;
    if (!file) { setDamageMessage(selectedProjectile ? "damage.noFile" : "damage.waiting"); return; }
    setDamageMessage("damage.reading");
    try {
      const data = JSON.parse(await file.text());
      if (sequence !== damageReadSequence) return;
      if (!Array.isArray(data)) throw new Error("bad_structure");
      const items = data.flatMap((root) => Array.isArray(root?.DamageSettings?.items) ? root.DamageSettings.items : []);
      const validTypes = items.filter((entry) => parseTypeId(entry?.type, "DamageInfoType") !== null);
      if (!validTypes.length) throw new Error("bad_structure");
      importedDamageEntries = validTypes;
      loadedDamageFile = file;
      setDamageMessage("damage.ready", { count: validTypes.length }, "ok");
      importSelectedDamage();
    } catch (error) {
      if (sequence !== damageReadSequence) return;
      setDamageMessage(error.message === "bad_structure" ? "damage.badStructure" : "damage.badJson", {}, "error");
    }
  }
  function importSelectedProjectile() {
    const file = $("projectile-file").files[0];
    if (!file || file !== loadedFile || !importedEntries) { setImportMessage("import.noFile", {}, "error"); return; }
    const typeText = $("projectile-type").value.trim();
    if (!/^\d+$/.test(typeText)) { setImportMessage("import.badType", {}, "error"); return; }
    const typeId = Number(typeText);
    if (!Number.isSafeInteger(typeId)) { setImportMessage("import.badType", {}, "error"); return; }
    const matches = importedEntries.filter((candidate) => parseTypeId(candidate.type) === typeId);
    if (!matches.length) { setImportMessage("import.notFound", { type: typeText }, "error"); return; }
    if (matches.length > 1) { setImportMessage("import.duplicate", { type: typeText }, "error"); return; }
    const entry = matches[0];
    const flags = entry.projectile_flags_1_detail;
    const valid = validNumber(entry.calibre, Number.MIN_VALUE) && validNumber(entry.mass, Number.MIN_VALUE)
      && validNumber(entry.speed, Number.MIN_VALUE) && validNumber(entry.drag, 0)
      && validNumber(entry.gravity_multiplier) && validNumber(entry.life_time, 0)
      && flags && (flags.ignore_terminal_velocity === 0 || flags.ignore_terminal_velocity === 1)
      && (flags.inherit_velocity === 0 || flags.inherit_velocity === 1);
    if (!valid) { setImportMessage("import.invalidRecord", {}, "error"); return; }
    const mapping = [
      ["caliberMm", entry.calibre], ["massG", entry.mass], ["vConfig", entry.speed],
      ["dragCoeff", entry.drag], ["gravityMultiplier", entry.gravity_multiplier], ["lifeTime", entry.life_time],
    ];
    mapping.forEach(([id, value]) => { $(id).value = String(value); });
    $("ignoreTerminalVelocity").checked = flags.ignore_terminal_velocity === 1;
    $("inheritVelocity").checked = flags.inherit_velocity === 1;
    updateInheritanceInputs();
    selectedProjectile = entry;
    clearSimulationResult();
    importSelectedDamage();
    const localizedName = entry.type.replace(/^\s*\d+\s*<=>\s*/, "");
    const metadata = {
      version: importedMetadata.game_version || "—",
      date: importedMetadata.patch_date || "—",
    };
    setImportMessage("import.success", { type: typeId, name: localizedName }, "ok");
    lastImportMessage.metadata = metadata;
    lastImportMessage.limitations = true;
    renderImportStatus(lastImportMessage);
  }
  async function readProjectileFile(file) {
    const sequence = ++fileReadSequence;
    importedEntries = null;
    importedMetadata = null;
    loadedFile = null;
    selectedProjectile = null;
    if (loadedDamageFile) setDamageMessage("damage.ready", { count: importedDamageEntries.length }, "ok");
    if (!file) { $("import-projectile").disabled = false; setImportMessage("import.waiting"); return; }
    $("import-projectile").disabled = true;
    setImportMessage("import.reading");
    try {
      const data = JSON.parse(await file.text());
      if (sequence !== fileReadSequence) return;
      const parsed = findProjectileItems(data);
      const validTypes = parsed.items.filter((entry) => parseTypeId(entry && entry.type) !== null);
      if (!validTypes.length) throw new Error("bad_structure");
      importedEntries = validTypes;
      importedMetadata = parsed.metadata;
      loadedFile = file;
      setImportMessage("import.fileReady", { count: validTypes.length }, "ok");
    } catch (error) {
      if (sequence !== fileReadSequence) return;
      setImportMessage(error.message === "bad_structure" ? "import.badStructure" : "import.badJson", {}, "error");
    } finally {
      if (sequence === fileReadSequence) $("import-projectile").disabled = false;
    }
  }

  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $("locale-toggle").addEventListener("click", () => setLocale(locale === "zh" ? "en" : "zh"));
  $("choose-projectile-file").addEventListener("click", () => $("projectile-file").click());
  $("projectile-file").addEventListener("change", (event) => readProjectileFile(event.target.files[0]));
  $("choose-damage-file").addEventListener("click", () => $("damage-file").click());
  $("damage-file").addEventListener("change", (event) => readDamageFile(event.target.files[0]));
  $("import-projectile").addEventListener("click", importSelectedProjectile);
  $("projectile-type").addEventListener("keydown", (event) => { if (event.key === "Enter") importSelectedProjectile(); });
  $("inheritVelocity").addEventListener("change", updateInheritanceInputs);
  for (const id of ["shooterSpeed", "shooterAzimuthDeg", "shooterElevationDeg"]) {
    $(id).addEventListener("input", updateMovementOutput);
    $(id).addEventListener("change", updateMovementOutput);
  }
  document.querySelectorAll("[data-shooter-azimuth]").forEach((button) => button.addEventListener("click", () => {
    if (!$("inheritVelocity").checked) return;
    $("shooterAzimuthDeg").value = button.dataset.shooterAzimuth;
    updateMovementOutput();
  }));
  $("showPlot").addEventListener("change", () => { if (lastResult) renderResult(); });
  $("run").addEventListener("click", () => {
    const button = $("run");
    const status = $("status");
    button.disabled = true;
    status.className = "status";
        status.dataset.state = "running";
        lastError = null;
    status.textContent = t(mode === "aim" ? "action.runningAim" : "action.running");
    destroyResult();
    $("results").classList.add("visible");
    lastResult = null;
    setTimeout(() => {
      try {
        if (mode === "traj") runTrajectory(); else runAim();
        status.className = "status ok";
        status.dataset.state = "done";
        status.textContent = t("action.done");
      } catch (error) {
        console.error(error);
        lastError = error;
        status.className = "status error";
        status.dataset.state = "error";
        status.textContent = translateError(error);
        $("result-meta").textContent = "";
        $("result-tables").replaceChildren();
      } finally { button.disabled = false; }
    }, 20);
  });

  // ---------------- 武器预设（HD2_Ballistics/data/equipment_catalog.json） ----------------
  const PRESET_CATEGORIES = ["primary", "secondary", "support", "throwable"];
  const presetState = { catalog: null };

  function validateCatalog(data) {
    if (!data || typeof data !== "object" || data.schema_version !== 1) return false;
    const cats = data.categories || {};
    for (const key of PRESET_CATEGORIES) {
      if (!Array.isArray(cats[key])) return false;
      for (const entry of cats[key]) {
        if (!entry || typeof entry.id !== "string" || !Array.isArray(entry.attacks)) return false;
        for (const attack of entry.attacks) {
          if (!attack || typeof attack.id !== "string" || typeof attack.kind !== "string") return false;
          if (attack.status === "ready") {
            const params = attack.params, damage = attack.damage;
            if (!params || !damage) return false;
            for (const field of ["calibreMm", "massG", "vConfig", "dragCoeff", "gravityMultiplier"]) {
              if (!Number.isFinite(Number(params[field]))) return false;
            }
            if (!Number.isFinite(Number(damage.normal))) return false;
          }
        }
      }
    }
    return true;
  }

  function presetOptionLabel(entry) {
    return locale === "en" ? (entry.name_en || entry.name || entry.id) : (entry.name || entry.name_en || entry.id);
  }

  function renderPresetSelects() {
    if (!presetState.catalog) return;
    const categorySelect = $("preset-category");
    if (!categorySelect.value) categorySelect.value = PRESET_CATEGORIES[0];
    for (const option of categorySelect.children) {
      if (option.value) option.textContent = t(`preset.cat.${option.value}`);
    }
    const firstOption = categorySelect.children[0];
    if (firstOption && !firstOption.value) firstOption.textContent = t("preset.choose");
    renderPresetWeapons();
  }

  function renderPresetWeapons() {
    const weaponSelect = $("preset-weapon");
    const previous = weaponSelect.value;
    weaponSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t("preset.choose");
    weaponSelect.append(placeholder);
    const category = $("preset-category").value;
    const rows = presetState.catalog ? (presetState.catalog.categories[category] || []) : [];
    const sorted = rows.slice().sort((a, b) => presetOptionLabel(a).localeCompare(presetOptionLabel(b)));
    for (const entry of sorted) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = presetOptionLabel(entry);
      weaponSelect.append(option);
    }
    weaponSelect.value = rows.some((entry) => entry.id === previous) ? previous : "";
    renderPresetAttacks();
  }

  function renderPresetAttacks() {
    const attackSelect = $("preset-attack");
    const previous = attackSelect.value;
    attackSelect.replaceChildren();
    const entry = findPresetEntry();
    const projectileAttacks = entry ? entry.attacks.filter((attack) => attack.kind === "projectile") : [];
    const show = projectileAttacks.length > 1;
    $("preset-attack-field").hidden = !show;   // 折叠整行 label（含 select）
    if (show) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = t("preset.choose");
      attackSelect.append(placeholder);
      for (const attack of projectileAttacks) {
        const option = document.createElement("option");
        option.value = attack.id;
        option.textContent = attack.name || attack.id;
        attackSelect.append(option);
      }
      attackSelect.value = projectileAttacks.some((attack) => attack.id === previous) ? previous : "";
    } else if (projectileAttacks.length === 1) {
      attackSelect.value = projectileAttacks[0].id;
    } else {
      attackSelect.value = "";
    }
    applyPresetSelection();
  }

  function findPresetEntry() {
    if (!presetState.catalog) return null;
    const category = $("preset-category").value;
    const weaponId = $("preset-weapon").value;
    return (presetState.catalog.categories[category] || []).find((entry) => entry.id === weaponId) || null;
  }

  function findPresetAttack(entry) {
    if (!entry) return null;
    const attackId = $("preset-attack").value;
    return entry.attacks.find((attack) => attack.id === attackId)
      || (entry.attacks.length === 1 ? entry.attacks[0] : null);
  }

  function presetInputValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    // RawData contains single-precision artefacts such as 0.30000001192092896.
    // Six significant digits preserve gameplay precision without surfacing them.
    return String(Number(number.toPrecision(6)));
  }

  function setPresetStatus(key, values = {}, kind = "") {
    const node = $("preset-status");
    node.className = `import-meta${kind ? ` ${kind}` : ""}`;
    node.textContent = t(key, values);
  }

  function setPresetError(message) {
    const node = $("preset-error");
    if (!message) { node.hidden = true; node.textContent = ""; return; }
    node.hidden = false;
    node.textContent = message;
  }

  function setPresetBadges(items) {
    const host = $("preset-badges");
    host.replaceChildren();
    for (const item of items) {
      const badge = document.createElement("span");
      badge.className = `preset-badge${item.warn ? " warn" : ""}`;
      badge.textContent = item.text;
      host.append(badge);
    }
    host.classList.toggle("show", items.length > 0);
  }

  function applyPresetSelection() {
    const entry = findPresetEntry();
    const attack = findPresetAttack(entry);
    clearSimulationResult();
    setPresetError("");
    $("run").disabled = false;
    if (!entry || !attack) {
      setPresetStatus("preset.choose", {}, "");
      setPresetBadges([]);
      return;
    }
    if (attack.status !== "ready") {
      // 不支持/未解析：清结果、禁止运行、展开高级手动导入兜底
      const kindLabel = t(`preset.kind.${attack.kind}`, { kind: attack.kind });
      const suppliedReason = locale === "en" ? attack.reason_en : attack.reason;
      const reason = attack.status === "unsupported"
        ? (suppliedReason || t("preset.unsupported.kind", { kind: kindLabel }))
        : t("preset.unresolved", { candidates: (attack.candidates || []).join(", ") || "—" });
      setPresetError(reason);
      setPresetStatus("preset.manualFallback", {}, "error");
      setPresetBadges([]);
      $("run").disabled = true;
      const advanced = $("panel-advanced");
      if (advanced && "open" in advanced) advanced.open = true;
      return;
    }
    const params = attack.params, damage = attack.damage;
    const values = { caliberMm: params.calibreMm, massG: params.massG, vConfig: params.vConfig,
                     dragCoeff: params.dragCoeff, gravityMultiplier: params.gravityMultiplier,
                     lifeTime: params.lifeTime };
    for (const [id, value] of Object.entries(values)) {
      const node = $(id);
      node.value = presetInputValue(value);
    }
    $("ignoreTerminalVelocity").checked = !!params.ignoreTerminalVelocity;
    const inherit = $("inheritVelocity");
    inherit.checked = !!params.inheritVelocity;
    updateInheritanceInputs();
    $("normalDamage").value = String(damage.normal);
    $("durableDamage").value = String(damage.durable);
    const badges = [];
    const attackSources = attack.sources || [];
    const upstream = (presetState.catalog.upstream || {});
    if (attackSources.includes("rawdata") && upstream.game_version) {
      badges.push({ text: t("preset.badge.rawdata", { version: upstream.game_version, date: upstream.patch_date || "" }) });
    }
    if (attackSources.includes("wiki")) {
      const wikiSource = attack.wiki_source || entry.wiki_source || {};
      if (wikiSource.game_version) {
        badges.push({ text: t("preset.badge.wikiItem", {
          version: wikiSource.game_version, revid: wikiSource.revid || "—",
        }) });
      } else {
        const wikiInfo = (presetState.catalog.wiki || {});
        const wikiStamp = wikiInfo.weapons_updated_at || wikiInfo.stratagems_updated_at;
        if (wikiStamp) badges.push({ text: t("preset.badge.wiki", { date: String(wikiStamp).slice(0, 10) }) });
      }
    }
    if (attack.projectile_type != null) badges.push({ text: t("preset.badge.type", { type: attack.projectile_type }) });
    const numProjectiles = Number(params.numProjectiles);
    if (Number.isFinite(numProjectiles) && numProjectiles > 1) {
      badges.push({ text: t("preset.badge.num", { num: numProjectiles }) });
      setPresetStatus("preset.numNote", {}, "");
    } else {
      setPresetStatus("preset.ready", {}, "ok");
    }
    const mismatches = (attack.wiki_check || {}).mismatches || [];
    if (mismatches.length) {
      badges.push({ text: t("preset.mismatch", { fields: mismatches.join(", ") }), warn: true });
    }
    setPresetBadges(badges);
  }

  async function loadPresetCatalog() {
    if (typeof fetch !== "function") return;   // 测试桩或极旧环境：保持面板隐藏
    let text;
    try {
      const response = await fetch("./data/equipment_catalog.json", { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      text = await response.text();
    } catch (error) {
      console.warn(`[ballistics] 武器目录加载失败（保持隐藏，手动模式可用）:`, error);
      return;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      console.warn(`[ballistics] 武器目录 JSON 解析失败:`, error);
      return;
    }
    if (!validateCatalog(data)) {
      console.warn("[ballistics] 武器目录 schema 校验失败，预设保持隐藏");
      return;
    }
    presetState.catalog = data;
    $("panel-preset").hidden = false;
    setPresetStatus("preset.loading", {}, "");
    renderPresetSelects();
  }

  $("preset-category").addEventListener("change", () => { renderPresetWeapons(); });
  $("preset-weapon").addEventListener("change", () => { renderPresetAttacks(); });
  $("preset-attack").addEventListener("change", () => { applyPresetSelection(); });
  $("locale-toggle").addEventListener("click", () => { renderPresetSelects(); });
  loadPresetCatalog();

  updateInheritanceInputs();
  setLocale(locale);
  setMode("traj", false);
})();
