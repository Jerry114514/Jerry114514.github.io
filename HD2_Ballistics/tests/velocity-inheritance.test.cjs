'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../ballistics.js');
const { calculateShooterVelocity, calculateInitialVelocity, simulateTrajectory, simulateImpact, solveAim } = globalThis.HD2Ballistics;

const base = {
  caliberMm: 9, massG: 8, vConfig: 100, launchAngleDeg: 30,
  dragCoeff: 0, gravityMultiplier: 1, g0: 10, stepHz: 40,
  totalTime: 2, normalDamage: 100, durableDamage: 20,
  ignoreTerminalVelocity: true,
};
const close = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} should equal ${expected} within ${tolerance}`);
const moving = (extra = {}) => ({
  ...base, inheritVelocity: true, shooterSpeed: 26,
  shooterAzimuthDeg: Math.atan2(12, 3) * 180 / Math.PI,
  shooterElevationDeg: Math.asin(4 / 13) * 180 / Math.PI, ...extra,
});

test('movement angles resolve fixed-world XYZ independently of muzzle elevation and azimuth', () => {
  const velocity = calculateShooterVelocity(moving());
  for (const [key, expected] of Object.entries({ x: 6, y: 8, z: 24 })) close(velocity[key], expected);
  for (const [elevation, azimuth] of [[30, 60], [-20, -45], [90, 270], [0, 180]]) {
    const initial = calculateInitialVelocity(elevation, moving(), azimuth);
    close(initial.vx, 100 * Math.cos(elevation * Math.PI / 180) * Math.cos(azimuth * Math.PI / 180) + 6);
    close(initial.vy, 100 * Math.sin(elevation * Math.PI / 180) + 8);
    close(initial.vz, 100 * Math.cos(elevation * Math.PI / 180) * Math.sin(azimuth * Math.PI / 180) + 24);
    close(initial.speed, Math.hypot(initial.vx, initial.vy, initial.vz));
    assert.deepEqual(initial.shooterVelocity, velocity);
    assert.equal(initial.launchAzimuthDeg, azimuth);
  }
});

test('movement azimuth is periodic and total speed is conserved for diagonal and vertical angles', () => {
  for (const shooterAzimuthDeg of [-180, -135, -90, -45, 0, 33.5, 45, 90, 135, 180, Number.MAX_VALUE]) {
    for (const shooterElevationDeg of [-90, -60, 0, 30, 90]) {
      const opts = moving({ shooterAzimuthDeg, shooterElevationDeg });
      const velocity = calculateShooterVelocity(opts);
      close(Math.hypot(velocity.x, velocity.y, velocity.z), 26);
      if (Math.abs(shooterElevationDeg) === 90) {
        assert.deepEqual(velocity, { x: 0, y: shooterElevationDeg > 0 ? 26 : -26, z: 0 });
      }
      if (Math.abs(shooterAzimuthDeg) > 360) continue;
      for (const turns of [-100, -1, 1, 100]) {
        const periodic = calculateShooterVelocity({ ...opts, shooterAzimuthDeg: shooterAzimuthDeg + 360 * turns });
        for (const key of ['x', 'y', 'z']) close(periodic[key], velocity[key]);
      }
    }
  }
  for (const [shooterAzimuthDeg, expected] of [
    [0, { x: 26, y: 0, z: 0 }], [90, { x: 0, y: 0, z: 26 }],
    [180, { x: -26, y: 0, z: 0 }], [-90, { x: 0, y: 0, z: -26 }],
  ]) assert.deepEqual(calculateShooterVelocity(moving({ shooterAzimuthDeg, shooterElevationDeg: 0 })), expected);
  const diagonal = calculateShooterVelocity(moving({ shooterSpeed: 5, shooterAzimuthDeg: 45, shooterElevationDeg: 0 }));
  close(diagonal.x, 5 / Math.sqrt(2));
  close(diagonal.z, 5 / Math.sqrt(2));
  for (const shooterSpeed of [Number.MIN_VALUE, 1e-300, 1e300, Number.MAX_VALUE]) {
    const velocity = calculateShooterVelocity(moving({ shooterSpeed }));
    assert.ok(Object.values(velocity).every(Number.isFinite));
    close(Math.hypot(velocity.x, velocity.y, velocity.z) / shooterSpeed, 1, shooterSpeed === Number.MIN_VALUE ? 1 : 1e-14);
  }
});

test('disabled inheritance does not read or validate any movement inputs in either mode', () => {
  const opts = { ...base, inheritVelocity: false, angleStepDeg: 5, targetHorizontalRanges: [100] };
  for (const key of ['shooterSpeed', 'shooterAzimuthDeg', 'shooterElevationDeg']) {
    Object.defineProperty(opts, key, { get() { throw new Error(`must not read ${key}`); } });
  }
  assert.deepEqual(calculateShooterVelocity(opts), { x: 0, y: 0, z: 0 });
  assert.deepEqual(calculateInitialVelocity(30, opts), calculateInitialVelocity(30, base));
  assert.deepEqual(simulateTrajectory(opts), simulateTrajectory(base));
  assert.deepEqual(simulateImpact(30, opts, true), simulateImpact(30, base, true));
  assert.deepEqual(solveAim(opts), solveAim({ ...base, angleStepDeg: 5, targetHorizontalRanges: [100] }));
});

test('velocity validation rejects invalid configured speeds, total rates and movement angles', () => {
  for (const vConfig of [0, -1, NaN, Infinity, '100']) {
    for (const run of [
      (opts) => calculateInitialVelocity(30, opts), simulateTrajectory,
      (opts) => simulateImpact(30, opts, false),
      (opts) => solveAim({ ...opts, targetHorizontalRanges: [100] }),
    ]) assert.throws(() => run({ ...base, vConfig }), /vConfig/);
  }
  for (const shooterSpeed of [-1, NaN, Infinity, -Infinity, '10', '', null]) {
    assert.throws(() => calculateShooterVelocity(moving({ shooterSpeed })), /shooterSpeed/);
  }
  for (const field of ['shooterAzimuthDeg', 'shooterElevationDeg']) {
    for (const invalid of [Infinity, -Infinity, NaN, '1', '', null]) {
      for (const shooterSpeed of [0, 5]) {
        assert.throws(() => calculateInitialVelocity(0, moving({ shooterSpeed, [field]: invalid })), /shooter.*Deg/);
      }
    }
  }
  for (const shooterElevationDeg of [-90.001, 90.001]) {
    assert.throws(() => calculateShooterVelocity(moving({ shooterElevationDeg })), /-90.*90/);
  }
  const stationary = calculateInitialVelocity(0, moving({ shooterSpeed: 0 }));
  assert.equal(stationary.speed, 100);
  assert.deepEqual(stationary.shooterVelocity, { x: 0, y: 0, z: 0 });
  assert.deepEqual(calculateInitialVelocity(0, { ...base, inheritVelocity: true }).shooterVelocity,
    { x: 0, y: 0, z: 0 });
  close(calculateInitialVelocity(0, { ...base, inheritVelocity: true, shooterSpeed: 5 }).vx, 105);
});

test('no-drag XYZ trajectory agrees with analytic motion at every record', () => {
  const opts = moving({ launchAzimuthDeg: 25, totalTime: 2.013 });
  const result = simulateTrajectory(opts);
  const initial = calculateInitialVelocity(opts.launchAngleDeg, opts, 25);
  assert.deepEqual(result.initialVelocity, initial);
  for (const r of result.records) {
    close(r.x, initial.vx * r.time);
    close(r.y, initial.vy * r.time - 5 * r.time ** 2);
    close(r.z, initial.vz * r.time);
    close(r.vx, initial.vx);
    close(r.vy, initial.vy - 10 * r.time);
    close(r.vz, initial.vz);
    close(r.speed, Math.hypot(r.vx, r.vy, r.vz));
    close(r.speedElevationDeg, Math.atan2(r.vy, Math.hypot(r.vx, r.vz)) * 180 / Math.PI);
    close(r.speedAzimuthDeg, Math.atan2(r.vz, r.vx) * 180 / Math.PI);
    if (r.time > 0) {
      close(r.acceleration, 10);
      close(r.accelerationElevationDeg, -90);
    }
  }
  close(result.records.at(-1).time, 2.013);
});

test('reverse and canceled initial velocities remain valid; low speed expires immediately', () => {
  const opts = moving({ launchAngleDeg: 0, shooterSpeed: 150,
    shooterAzimuthDeg: 180, shooterElevationDeg: 0 });
  const reverse = simulateTrajectory(opts);
  close(reverse.initialVelocity.vx, -50);
  assert.ok(reverse.records.at(-1).x < 0);
  close(reverse.records[0].speedElevationDeg, 0);
  close(Math.abs(reverse.records[0].speedAzimuthDeg), 180);
  for (const shooterSpeed of [90, 100, 110]) {
    const expiredOpts = { ...opts, shooterSpeed, ignoreTerminalVelocity: false };
    const expired = simulateTrajectory(expiredOpts);
    assert.equal(expired.endReason, 'initial_destroyed');
    assert.equal(expired.records.length, 1);
    assert.deepEqual(expired.distanceHits, []);
    const hit = simulateImpact(0, expiredOpts, true);
    assert.equal(hit.reason, 'initial_destroyed');
    assert.equal(hit.track.length, 1);
    close(hit.landingZ, 0);
  }
  const canceled = simulateTrajectory({ ...opts, shooterSpeed: 100 });
  assert.equal(canceled.initialVelocity.speed, 0);
  close(canceled.records.at(-1).y, -20);
  close(canceled.records.at(-1).vy, -20);
  close(canceled.records.at(-1).x, 0);
  close(canceled.records[0].damageRatio, 0.25);
});

test('damage uses composite total speed with the configured muzzle speed as denominator', () => {
  const opts = moving({ launchAngleDeg: 0, gravityMultiplier: 0, shooterSpeed: 100,
    shooterAzimuthDeg: 90, shooterElevationDeg: 0,
    targetDistances: [50] });
  const result = simulateTrajectory(opts);
  for (const r of [...result.records, ...result.distanceHits]) {
    close(r.damageRatio, 1.75);
    close(r.normalDamage, 175);
    close(r.durableDamage, 35);
  }
  const landed = simulateImpact(30, moving());
  close(landed.damageRatioImpact, 0.25 + 0.75 * (landed.speedImpact / 100) ** 2);
});

test('3D path and distance-hit interpolation retain the piecewise chord method', () => {
  const opts = moving({ gravityMultiplier: 0, targetDistances: [1, 17, 100], stepHz: 3 });
  const result = simulateTrajectory(opts);
  for (const r of result.records) close(r.pathLength, result.initialVelocity.speed * r.time);
  for (const r of result.distanceHits) {
    close(r.time, r.distance / result.initialVelocity.speed);
    close(Math.hypot(r.x, r.y, r.z), r.distance);
    for (const key of ['vx', 'vy', 'vz']) close(r[key], result.initialVelocity[key]);
    close(r.speedAzimuthDeg, result.records[0].speedAzimuthDeg);
  }
  const curved = simulateTrajectory(moving({ dragCoeff: 0.3, stepHz: 2, targetDistances: [20] }));
  let length = 0;
  for (let i = 1; i < curved.records.length; i++) {
    const a = curved.records[i - 1], b = curved.records[i];
    length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    close(b.pathLength, length);
  }
  const hit = curved.distanceHits[0], a = curved.records[0], b = curved.records[1];
  const fraction = 20 / b.pathLength;
  for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'time']) {
    close(hit[key], a[key] + fraction * (b[key] - a[key]));
  }
  close(hit.speed, Math.hypot(hit.vx, hit.vy, hit.vz));
});

test('isotropic 3D drag preserves the vertical plane of the initial horizontal velocity', () => {
  const result = simulateTrajectory(moving({ dragCoeff: 0.3, launchAzimuthDeg: 40 }));
  const initial = result.initialVelocity;
  for (let i = 0; i < result.records.length; i++) {
    const r = result.records[i];
    close(r.x * initial.vz - r.z * initial.vx, 0, 1e-8);
    close(r.vx * initial.vz - r.vz * initial.vx, 0, 1e-8);
    if (!i) continue;
    const previous = result.records[i - 1];
    const ax = -result.dragConstant * previous.speed * previous.vx;
    const ay = -result.dragConstant * previous.speed * previous.vy - result.gravity;
    const az = -result.dragConstant * previous.speed * previous.vz;
    close(r.acceleration, Math.hypot(ax, ay, az));
    close(r.accelerationElevationDeg, Math.atan2(ay, Math.hypot(ax, az)) * 180 / Math.PI);
  }
});

test('simulateImpact solves no-drag XYZ return analytically and supports a landing within the first step', () => {
  for (const stepHz of [40, 0.05]) {
    const opts = moving({ stepHz, launchAzimuthDeg: -20 });
    const initial = calculateInitialVelocity(30, opts, -20);
    const result = simulateImpact(30, opts, true);
    const time = 2 * initial.vy / 10;
    assert.equal(result.landed, true);
    assert.equal(result.launchAzimuthDeg, -20);
    assert.deepEqual(result.initialVelocity, initial);
    close(result.time, time);
    close(result.landingX, initial.vx * time);
    close(result.landingZ, initial.vz * time);
    close(result.speedImpact, initial.speed);
    close(result.track.at(-1).y, 0);
    close(result.track.at(-1).z, result.landingZ);
  }
});

test('simulateImpact checks actual upward velocity, permitting negative muzzle elevation', () => {
  const upward = moving({ shooterSpeed: 50, shooterAzimuthDeg: 0, shooterElevationDeg: 90 });
  assert.equal(simulateImpact(-10, upward, true).landed, true);
  for (const shooterSpeed of [50, 60]) {
    const downward = { ...upward, shooterSpeed, shooterElevationDeg: -90 };
    const result = simulateImpact(30, downward, true);
    assert.equal(result.landed, false);
    assert.equal(result.reason, 'non_positive_angle');
    assert.equal(result.track.length, 1);
  }
  assert.equal(simulateImpact(0, base, true).landed, false);
});

for (const dragCoeff of [0, 0.3]) {
  test(`fixed trajectory and simulateImpact agree through a shortened lifetime step, drag=${dragCoeff}`, () => {
    const opts = moving({ dragCoeff, lifeTime: 0.213, launchAzimuthDeg: 17 });
    const trajectory = simulateTrajectory(opts);
    const result = simulateImpact(30, opts, true);
    assert.equal(result.reason, 'life_expired');
    assert.equal(trajectory.endReason, 'life_expired');
    assert.deepEqual(result.track, trajectory.records.map(({ time, x, y, z }) => ({ time, x, y, z })));
    close(result.time, 0.213);
    close(result.pathLength, trajectory.records.at(-1).pathLength);
  });

  test(`fixed trajectory and simulateImpact agree at the interpolated landing, drag=${dragCoeff}`, () => {
    const opts = moving({ dragCoeff, launchAzimuthDeg: -13 });
    const result = simulateImpact(30, opts, true);
    assert.equal(result.landed, true);
    const trajectory = simulateTrajectory({ ...opts, totalTime: result.time });
    const last = trajectory.records.at(-1);
    close(last.y, 0, 1e-8);
    close(last.x, result.landingX);
    close(last.z, result.landingZ);
    close(last.pathLength, result.pathLength);
    close(last.speed, result.speedImpact);
    close(last.damageRatio, result.damageRatioImpact);
    close(last.speedElevationDeg, result.speedElevationDegImpact);
  });
}

test('simulateImpact lifetime is inclusive at landing and never advances beyond the lifetime', () => {
  const result = simulateImpact(30, base, true);
  assert.equal(simulateImpact(30, { ...base, lifeTime: result.time }, true).landed, true);
  const short = simulateImpact(30, { ...base, lifeTime: result.time - 0.001 }, true);
  assert.equal(short.reason, 'life_expired');
  close(short.track.at(-1).time, result.time - 0.001);
  assert.ok(short.track.at(-1).y > 0);
});

for (const dragCoeff of [0, 0.3]) {
  test(`horizontal aim cancels lateral movement and reaches fixed (R,0,0), drag=${dragCoeff}`, () => {
    const opts = moving({ dragCoeff, angleStepDeg: 2, targetHorizontalRanges: [100, 150, 300] });
    const result = solveAim(opts);
    assert.equal(result.ok, true);
    for (const target of result.targets) {
      assert.equal(target.reachable, true);
      // Forward inheritance keeps the high-angle branch above ~129 m without drag.
      assert.ok(target.solutions.length >= (dragCoeff === 0 && target.range === 100 ? 1 : 2));
      for (const solution of target.solutions) {
        const horizontal = 100 * Math.cos(solution.launchAngleDeg * Math.PI / 180);
        close(solution.launchAzimuthDeg, Math.asin(-24 / horizontal) * 180 / Math.PI);
        close(solution.initialVelocity.vz, 0);
        assert.ok(solution.initialVelocity.vx > 0 && solution.initialVelocity.vy > 0);
        close(solution.landingX, target.range, 0.01);
        close(solution.landingZ, 0, 1e-7);
        const direct = simulateImpact(solution.launchAngleDeg, opts, true, solution.launchAzimuthDeg);
        close(direct.landingX, solution.landingX);
      }
    }
    for (const curve of result.firstTrajectory.curves) {
      const solution = result.targets[0].solutions[curve.solutionIndex];
      assert.equal(curve.launchAzimuthDeg, solution.launchAzimuthDeg);
      assert.deepEqual(curve.track,
        simulateImpact(solution.launchAngleDeg, opts, true, solution.launchAzimuthDeg).track);
      for (const point of curve.track) close(point.z, 0, 1e-7);
      close(curve.track.at(-1).x, 100, 0.01);
    }
  });
}

test('upward movement exposes a valid negative-elevation horizontal aim solution', () => {
  const result = solveAim(moving({ shooterSpeed: 60, shooterAzimuthDeg: 0,
    shooterElevationDeg: 90, angleStepDeg: 1, targetHorizontalRanges: [100] }));
  assert.equal(result.ok, true);
  const target = result.targets[0];
  assert.equal(target.reachable, true);
  assert.ok(target.solutions.some((solution) => solution.launchAngleDeg < 0));
  for (const solution of target.solutions) {
    assert.ok(solution.initialVelocity.vy > 0);
    close(solution.landingX, 100, 0.01);
    close(solution.landingZ, 0);
  }
});

test('uncompensable lateral or backward motion reports no_landed without false offset hits', () => {
  for (const [shooterSpeed, shooterAzimuthDeg] of [[100, 90], [120, 90], [100, -90], [100, 450], [120, 180]]) {
    const result = solveAim(moving({ shooterSpeed, shooterAzimuthDeg,
      shooterElevationDeg: 0, angleStepDeg: 2, targetHorizontalRanges: [100] }));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'no_landed');
  }
});

test('lifetime and low-speed invalid intervals do not become spurious aim roots', () => {
  const opts = moving({ shooterSpeed: 95, shooterAzimuthDeg: 180,
    shooterElevationDeg: 0, ignoreTerminalVelocity: false,
    lifeTime: 0.5, angleStepDeg: 1, targetHorizontalRanges: [0.001, 1, 100] });
  const result = solveAim(opts);
  for (const target of result.targets) {
    for (const solution of target.solutions) {
      assert.equal(solution.landed, true);
      assert.ok(solution.initialVelocity.speed > 10);
      assert.ok(solution.initialVelocity.vx > 0 && solution.initialVelocity.vy > 0);
      assert.ok(solution.time <= 0.5);
      close(solution.landingX, target.range, 0.01);
      close(solution.landingZ, 0, 1e-7);
    }
  }
  assert.ok(!result.ok || !result.targets.at(-1).reachable);
});

test('aim reports initial_destroyed when inherited launch speed is below the threshold', () => {
  const opts = {
    ...base, inheritVelocity: true, shooterSpeed: 100,
    shooterAzimuthDeg: 180, shooterElevationDeg: 0,
    ignoreTerminalVelocity: false, targetHorizontalRanges: [100],
  };
  const result = solveAim(opts);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'initial_destroyed');
});

test('no-inheritance trajectory, landing and aim retain established numerical results', () => {
  const opts = { ...base, g0: 9.81, stepHz: 60, dragCoeff: 0.3 };
  const last = simulateTrajectory(opts).records.at(-1);
  close(last.x, 152.8179878905984);
  close(last.y, 70.07481040487046);
  close(last.pathLength, 168.4381194100801);
  close(last.speed, 71.38708941331826);
  const hit = simulateImpact(30, opts, false);
  close(hit.landingX, 495.3991468397678);
  close(hit.time, 8.56418904800908);
  close(hit.pathLength, 537.6393642532811);
  close(hit.landingZ, 0);
  const aim = solveAim({ ...opts, angleStepDeg: 2, targetHorizontalRanges: [100] });
  close(aim.maximumRange, 519.5010790534312, 1e-6);
  close(aim.optimumAngleDeg, 39.84224029821016, 1e-5);
  assert.equal(aim.targets[0].solutions.length, 2);
  close(aim.targets[0].solutions[0].launchAngleDeg, 3.109421255471376, 1e-4);
  close(aim.targets[0].solutions[1].launchAngleDeg, 84.31637998367567, 1e-4);
  for (const solution of aim.targets[0].solutions) close(solution.launchAzimuthDeg, 0);
});

test('close targets below the first coarse sweep angle still get low-arc solutions', () => {
  const opts = {
    ...base, g0: 9.81, stepHz: 60, dragCoeff: 0.3,
    angleStepDeg: 0.5, targetHorizontalRanges: [10, 25, 50],
  };
  const aim = solveAim(opts);
  for (const target of aim.targets) {
    assert.equal(target.reachable, true);
    assert.ok(target.solutions.length >= 1);
    for (const solution of target.solutions) close(solution.landingX, target.range, 1e-2);
  }
});

// ---- 2026-10-24 审查回归：物理参数校验与仿真预算（PR#36 内联意见）----
test('physics entry rejects non-finite or non-positive caliber/mass/rho/drag/damage', () => {
  const cases = [
    ['caliberMm', 0], ['caliberMm', -5], ['caliberMm', NaN], ['caliberMm', Infinity],
    ['massG', 0], ['massG', NaN], ['massG', Infinity],
    ['dragCoeff', -0.1], ['dragCoeff', NaN],
    ['normalDamage', NaN], ['normalDamage', Infinity], ['normalDamage', -1],
    ['durableDamage', NaN], ['durableDamage', -1],
    ['vConfig', 0], ['vConfig', -1], ['vConfig', NaN],
    ['gravityMultiplier', NaN], ['gravityMultiplier', -1],
  ];
  for (const [field, value] of cases) {
    assert.throws(() => simulateTrajectory({ ...base, [field]: value }),
      (error) => error.message.includes('必须是有限'),
      `simulateTrajectory 应拒绝 ${field}=${value}`);
    assert.throws(() => simulateImpact(base.launchAngleDeg, { ...base, [field]: value }),
      (error) => error.message.includes('必须是有限'),
      `simulateImpact 应拒绝 ${field}=${value}`);
  }
  // rho 缺省 1.2：显式 0 / 负数也要被拒
  for (const run of [(opts) => simulateTrajectory(opts),
                     (opts) => simulateImpact(base.launchAngleDeg, opts)]) {
    assert.throws(() => run({ ...base, rho: 0 }), (error) => error.message.includes('rho'));
  }
});

test('physics entry rejects empty-string and null-ish damage instead of coercing silently', () => {
  // 空串会被 Number() 折算，但 NaN 类输入必须被拒；null 耐久伤害按 0 处理属既有语义
  const ok = simulateTrajectory(base);
  assert.ok(ok.records.length > 0, '合法参数仍应正常出结果');
  assert.throws(() => simulateTrajectory({ ...base, normalDamage: 'abc' }),
    (error) => error.message.includes('normalDamage'));
});

test('integration and sweep budgets are hard-capped instead of freezing the browser', () => {
  // stepHz=1e9 且 totalTime=1：maxSteps 是安全整数但会尝试分配十亿条记录
  assert.throws(() => simulateTrajectory({ ...base, stepHz: 1e9, totalTime: 1 }),
    (error) => error.message.includes('模拟步数过大'));
  // aim 路径同样受步数上限约束
  assert.throws(() => simulateImpact(base.launchAngleDeg, { ...base, stepHz: 1e9, totalTime: 1 }),
    (error) => error.message.includes('模拟步数过大'));
  // angleStepDeg 极小正数：采样数超上限直接报错，不进入扫描
  assert.throws(() => solveAim({ ...base, targetHorizontalRanges: [50], angleStepDeg: 1e-9 }),
    (error) => error.message.includes('仰角采样数过大'));
  // 正常步长不受影响
  const aim = solveAim({ ...base, targetHorizontalRanges: [30], angleStepDeg: 0.5 });
  assert.ok(aim, '常规步长的瞄准求解仍可用');
});

test('non-positive caliber/mass produce the parameter error instead of NaN pseudo results', () => {
  for (const extra of [{ massG: 0 }, { caliberMm: 0 }]) {
    assert.throws(() => simulateTrajectory({ ...base, ...extra }),
      (error) => error.message.includes('必须是有限正数'));
    assert.throws(() => simulateImpact(base.launchAngleDeg, { ...base, ...extra }),
      (error) => error.message.includes('必须是有限正数'));
  }
});
