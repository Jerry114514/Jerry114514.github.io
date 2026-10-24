/**
 * HD2 ballistic physics (JS port of hd2_ballistics trajectory + aim modules)
 */
(function (global) {
  "use strict";

  // 仿真预算硬上限（2026-10-24 审查）：防止 stepHz=1e9、angleStepDeg=1e-9 这类
  // “数值合法但计算量爆炸”的输入把浏览器卡死。超过即抛错，不做静默截断。
  const MAX_TOTAL_STEPS = 250000;
  const MAX_ANGLE_SAMPLES = 3600;

  function validatePhysicsParams(opts) {
    // 公共入口统一拒绝会产生 NaN/Infinity 伪结果的参数（2026-10-24 审查 P1：
    // massG=0 时 K=Infinity，页面此前仍显示“完成”但整表都是 NaN）。
    const requirePositive = (value, label) => {
      if (!Number.isFinite(value) || value <= 0) throw new Error(label + " 必须是有限正数");
    };
    const requireNonNegative = (value, label) => {
      if (!Number.isFinite(value) || value < 0) throw new Error(label + " 必须是有限非负数");
    };
    requirePositive(opts.caliberMm, "caliberMm");
    requirePositive(opts.massG, "massG");
    requirePositive(opts.rho ?? 1.2, "rho");
    requireNonNegative(opts.dragCoeff, "dragCoeff");
    requirePositive(opts.vConfig, "vConfig");
    requireNonNegative(opts.g0 ?? 9.81, "g0");
    requireNonNegative(opts.gravityMultiplier, "gravityMultiplier");
    requireNonNegative(opts.normalDamage, "normalDamage");
    requireNonNegative(opts.durableDamage == null ? 0 : opts.durableDamage, "durableDamage");
  }

  function assertStepBudget(maxSteps) {
    if (!Number.isSafeInteger(maxSteps) || maxSteps > MAX_TOTAL_STEPS) {
      throw new Error("模拟步数过大（" + maxSteps + " > 上限 " + MAX_TOTAL_STEPS
        + "），请减小时间上限或更新频率");
    }
  }

  function calculateDragConstant(caliberMm, massG, dragCoeff, rho) {
    const massKg = massG / 1000.0;
    const area = Math.PI * Math.pow(caliberMm / 2000.0, 2);
    return (0.5 * rho * dragCoeff * area) / massKg;
  }

  function calculateDamage(speed, vConfig, normalDamage, durableDamage) {
    const damageRatio = vConfig > 0 ? 0.25 + 0.75 * Math.pow(speed / vConfig, 2) : 0.25;
    const configuredDurableDamage = durableDamage == null ? 0 : Number(durableDamage);
    return {
      normalDamage: normalDamage * damageRatio,
      durableDamage: configuredDurableDamage * damageRatio,
      damageRatio,
    };
  }

  function parseNumberList(text) {
    if (!text || !String(text).trim()) return [];
    return String(text)
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b);
  }

  function validateSimulationTime(stepHz, lifeTime = 0) {
    if (!Number.isFinite(stepHz) || stepHz <= 0) {
      throw new Error("step_hz（模拟更新频率）必须是有限正数");
    }
    if (!Number.isFinite(lifeTime) || lifeTime < 0) {
      throw new Error("life_time（射弹寿命）必须是有限非负数（0 表示无寿命上限）");
    }
  }

  function sinCosDeg(angle) {
    let degrees = angle % 360;
    if (degrees > 180) degrees -= 360;
    if (degrees < -180) degrees += 360;
    // Exact orthogonal directions must not leak residual side/up velocities.
    if (degrees === 0) return { sin: 0, cos: 1 };
    if (degrees === 90) return { sin: 1, cos: 0 };
    if (degrees === -90) return { sin: -1, cos: 0 };
    if (Math.abs(degrees) === 180) return { sin: 0, cos: -1 };
    const radians = degrees * Math.PI / 180;
    return { sin: Math.sin(radians), cos: Math.cos(radians) };
  }

  // Fixed world axes: X forward, Y up, Z right; independent of muzzle aim.
  function calculateShooterVelocity(opts) {
    const zero = { x: 0, y: 0, z: 0 };
    if (!opts.inheritVelocity) return zero;
    const {
      shooterSpeed: speed = 0,
      shooterAzimuthDeg: azimuth = 0,
      shooterElevationDeg: elevation = 0,
    } = opts;
    if (!Number.isFinite(speed) || speed < 0) {
      throw new Error("shooterSpeed 必须是有限非负速率");
    }
    if (!Number.isFinite(azimuth) || !Number.isFinite(elevation)) {
      throw new Error("shooterAzimuthDeg 和 shooterElevationDeg 必须是有限角度");
    }
    if (elevation < -90 || elevation > 90) {
      throw new Error("shooterElevationDeg 必须在 -90 到 90 度之间");
    }
    if (speed === 0) return zero;
    const vertical = sinCosDeg(elevation);
    const horizontal = speed * vertical.cos;
    const direction = sinCosDeg(azimuth);
    return {
      x: horizontal * direction.cos || 0,
      y: speed * vertical.sin || 0,
      z: horizontal * direction.sin || 0,
    };
  }

  // World axes: X forward, Y up, Z right. Zero muzzle azimuth faces +X.
  function calculateInitialVelocity(launchAngleDeg, opts, launchAzimuthDeg = 0) {
    const { vConfig } = opts;
    if (!Number.isFinite(vConfig) || vConfig <= 0) {
      throw new Error("vConfig 必须是有限正数");
    }
    if (!Number.isFinite(launchAngleDeg) || !Number.isFinite(launchAzimuthDeg)) {
      throw new Error("发射仰角和方位角必须是有限数");
    }
    const shooterVelocity = calculateShooterVelocity(opts);
    const elevation = sinCosDeg(launchAngleDeg);
    const azimuth = sinCosDeg(launchAzimuthDeg);
    const horizontal = vConfig * elevation.cos;
    const vx = horizontal * azimuth.cos + shooterVelocity.x;
    const vy = vConfig * elevation.sin + shooterVelocity.y;
    const vz = horizontal * azimuth.sin + shooterVelocity.z;
    return { vx, vy, vz, speed: Math.hypot(vx, vy, vz), shooterVelocity, launchAzimuthDeg };
  }

  function elevationDeg(x, y, z) {
    return Math.atan2(y, Math.hypot(x, z)) * 180 / Math.PI;
  }

  function azimuthDeg(x, z) {
    return Math.atan2(z, x) * 180 / Math.PI;
  }

  /**
   * Mode A: fixed launch angle trajectory.
   */
  function simulateTrajectory(opts) {
    const {
      caliberMm,
      massG,
      vConfig,
      launchAngleDeg,
      dragCoeff,
      gravityMultiplier,
      g0 = 9.81,
      stepHz,
      totalTime,
      lifeTime = 0,
      normalDamage,
      durableDamage = 0,
      targetDistances = [],
      rho = 1.2,
      ignoreTerminalVelocity = false,
      printEveryNSteps = 1,
    } = opts;

    validateSimulationTime(stepHz, lifeTime);
    validatePhysicsParams(opts);
    if (!Number.isFinite(totalTime) || totalTime <= 0) {
      throw new Error("total_time（模拟截断时间）必须是有限正数");
    }
    const gravity = g0 * gravityMultiplier;
    const dragConstant = calculateDragConstant(caliberMm, massG, dragCoeff, rho);
    const dt = 1.0 / stepHz;
    const pending = [...targetDistances].sort((a, b) => a - b);

    const initialVelocity = calculateInitialVelocity(launchAngleDeg, opts, opts.launchAzimuthDeg ?? 0);
    let { vx, vy, vz } = initialVelocity;
    let x = 0;
    let y = 0;
    let z = 0;
    let time = 0;
    let pathLength = 0;
    const initialDamage = calculateDamage(initialVelocity.speed, vConfig, normalDamage, durableDamage);

    const records = [
      {
        time: 0,
        speed: initialVelocity.speed,
        speedElevationDeg: elevationDeg(vx, vy, vz),
        speedAzimuthDeg: azimuthDeg(vx, vz),
        vx, vy, vz,
        acceleration: 0,
        accelerationElevationDeg: 0,
        accelerationAzimuthDeg: 0,
        x: 0,
        y: 0,
        z: 0,
        pathLength: 0,
        ...initialDamage,
      },
    ];
    const distanceHits = [];
    const timeCap = lifeTime > 0 ? Math.min(totalTime, lifeTime) : totalTime;
    const maxSteps = Math.ceil(timeCap / dt);
    assertStepBudget(maxSteps);
    const initiallyExpired = !ignoreTerminalVelocity && initialVelocity.speed <= 0.1 * vConfig;
    let endReason = initiallyExpired ? "initial_destroyed" : "time_cap";

    for (let step = 0; !initiallyExpired && step < maxSteps; step++) {
      const timeNext = Math.min(timeCap, (step + 1) * dt);
      const dtStep = timeNext - time;
      if (dtStep <= 0) break;
      const timePrevious = time;
      const vxPrevious = vx;
      const vyPrevious = vy;
      const vzPrevious = vz;
      const xPrevious = x;
      const yPrevious = y;
      const zPrevious = z;
      const pathLengthPrevious = pathLength;
      const speedMagnitude = Math.hypot(vx, vy, vz);
      const accelerationX = -dragConstant * speedMagnitude * vx;
      const accelerationY = -dragConstant * speedMagnitude * vy - gravity;
      const accelerationZ = -dragConstant * speedMagnitude * vz;

      const accelerationMagnitude = Math.hypot(accelerationX, accelerationY, accelerationZ);
      const accelerationElevationDeg = elevationDeg(accelerationX, accelerationY, accelerationZ);
      const accelerationAzimuthDeg = azimuthDeg(accelerationX, accelerationZ);
      const xNext = x + vx * dtStep + 0.5 * accelerationX * dtStep * dtStep;
      const yNext = y + vy * dtStep + 0.5 * accelerationY * dtStep * dtStep;
      const zNext = z + vz * dtStep + 0.5 * accelerationZ * dtStep * dtStep;
      const vxNext = vx + accelerationX * dtStep;
      const vyNext = vy + accelerationY * dtStep;
      const vzNext = vz + accelerationZ * dtStep;
      time = timeNext;
      const pathLengthNext = pathLength + Math.hypot(xNext - x, yNext - y, zNext - z);
      const speedNext = Math.hypot(vxNext, vyNext, vzNext);
      const speedElevationNext = elevationDeg(vxNext, vyNext, vzNext);
      const damageResult = calculateDamage(speedNext, vConfig, normalDamage, durableDamage);

      records.push({
        time,
        speed: speedNext,
        speedElevationDeg: speedElevationNext,
        speedAzimuthDeg: azimuthDeg(vxNext, vzNext),
        vx: vxNext,
        vy: vyNext,
        vz: vzNext,
        acceleration: accelerationMagnitude,
        accelerationElevationDeg,
        accelerationAzimuthDeg,
        x: xNext,
        y: yNext,
        z: zNext,
        pathLength: pathLengthNext,
        normalDamage: damageResult.normalDamage,
        durableDamage: damageResult.durableDamage,
        damageRatio: damageResult.damageRatio,
      });

      while (pending.length && pathLengthNext >= pending[0]) {
        const distance = pending.shift();
        const interpolationFraction =
          pathLengthNext > pathLengthPrevious
            ? (distance - pathLengthPrevious) / (pathLengthNext - pathLengthPrevious)
            : 0;
        const timeInterpolated = timePrevious + interpolationFraction * (time - timePrevious);
        const vxInterpolated = vxPrevious + interpolationFraction * (vxNext - vxPrevious);
        const vyInterpolated = vyPrevious + interpolationFraction * (vyNext - vyPrevious);
        const vzInterpolated = vzPrevious + interpolationFraction * (vzNext - vzPrevious);
        const xInterpolated = xPrevious + interpolationFraction * (xNext - xPrevious);
        const yInterpolated = yPrevious + interpolationFraction * (yNext - yPrevious);
        const zInterpolated = zPrevious + interpolationFraction * (zNext - zPrevious);
        const speedInterpolated = Math.hypot(vxInterpolated, vyInterpolated, vzInterpolated);
        const interpolatedDamage = calculateDamage(
          speedInterpolated, vConfig, normalDamage, durableDamage
        );
        distanceHits.push({
          distance,
          time: timeInterpolated,
          x: xInterpolated,
          y: yInterpolated,
          z: zInterpolated,
          vx: vxInterpolated,
          vy: vyInterpolated,
          vz: vzInterpolated,
          speed: speedInterpolated,
          speedElevationDeg: elevationDeg(vxInterpolated, vyInterpolated, vzInterpolated),
          speedAzimuthDeg: azimuthDeg(vxInterpolated, vzInterpolated),
          normalDamage: interpolatedDamage.normalDamage,
          durableDamage: interpolatedDamage.durableDamage,
          damageRatio: interpolatedDamage.damageRatio,
        });
      }

      x = xNext;
      y = yNext;
      z = zNext;
      vx = vxNext;
      vy = vyNext;
      vz = vzNext;
      pathLength = pathLengthNext;

      if (lifeTime > 0 && time >= lifeTime) {
        endReason = "life_expired";
        break;
      }
      if (!ignoreTerminalVelocity && speedNext <= 0.1 * vConfig) {
        endReason = "terminal_velocity";
        break;
      }
    }

    const tableRows = records.filter(
      (_, i) => i === 0 || i % printEveryNSteps === 0 || i === records.length - 1
    );

    return {
      records,
      tableRows,
      distanceHits,
      initialVelocity,
      endReason,
      dragConstant,
      gravity,
      normalDamage,
      lifeTime,
      totalTime,
    };
  }

  function hitTime(yp, vyp, ay, dt) {
    if (Math.abs(ay) < 1e-12) {
      if (Math.abs(vyp) < 1e-15) return null;
      const tau = -yp / vyp;
      return tau > 1e-15 && tau <= dt ? tau : null;
    }
    const a = 0.5 * ay,
      b = vyp,
      c = yp;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const cands = [(-b + s) / (2 * a), (-b - s) / (2 * a)].filter(
      (tau) => tau > 1e-15 && tau <= dt + 1e-15
    );
    return cands.length ? Math.min(...cands) : null;
  }

  /**
   * Integrate until first return to y=0.
   */
  function simulateImpact(launchAngleDeg, opts, includeTrack, launchAzimuthDeg = opts.launchAzimuthDeg ?? 0) {
    const {
      caliberMm, massG, vConfig, dragCoeff, gravityMultiplier,
      g0 = 9.81, stepHz, normalDamage, durableDamage = 0,
      rho = 1.2, lifeTime = 0, ignoreTerminalVelocity = false,
    } = opts;

    validateSimulationTime(stepHz, lifeTime);
    validatePhysicsParams(opts);
    const initialVelocity = calculateInitialVelocity(launchAngleDeg, opts, launchAzimuthDeg);
    const gravity = g0 * gravityMultiplier;
    const dragConstant = calculateDragConstant(caliberMm, massG, dragCoeff, rho);
    const dt = 1.0 / stepHz;
    let { vx, vy, vz } = initialVelocity;
    let x = 0, y = 0, z = 0, time = 0, pathLength = 0;
    const track = includeTrack ? [{ time: 0, x: 0, y: 0, z: 0 }] : null;
    const result = (reason) => ({
      landed: false, launchAngleDeg, launchAzimuthDeg, initialVelocity,
      landingX: x, landingZ: z, time, pathLength, reason, track,
    });

    if (!ignoreTerminalVelocity && initialVelocity.speed <= 0.1 * vConfig) {
      return result("initial_destroyed");
    }
    if (Math.abs(gravity) < 1e-15) return result("no_gravity");
    if (vy <= 0) return result("non_positive_angle");

    const estimatedTime = (2.5 * initialVelocity.speed) / Math.abs(gravity) + 5.0;
    const timeBudget = lifeTime > 0 ? lifeTime : estimatedTime;
    const maxSteps = Math.ceil(timeBudget / dt);
    assertStepBudget(maxSteps);

    function finishImpact(tau, ax, ay, az) {
      const impactX = x + vx * tau + 0.5 * ax * tau ** 2;
      const impactZ = z + vz * tau + 0.5 * az * tau ** 2;
      const impactVx = vx + ax * tau;
      const impactVy = vy + ay * tau;
      const impactVz = vz + az * tau;
      const impactTime = time + tau;
      const impactPathLength = pathLength + Math.hypot(impactX - x, -y, impactZ - z);
      const speedImpact = Math.hypot(impactVx, impactVy, impactVz);
      const impactDamage = calculateDamage(speedImpact, vConfig, normalDamage, durableDamage);
      if (track) track.push({ time: impactTime, x: impactX, y: 0, z: impactZ });
      return {
        landed: true, launchAngleDeg, launchAzimuthDeg, initialVelocity,
        landingX: impactX, landingZ: impactZ, time: impactTime,
        pathLength: impactPathLength, speedImpact,
        speedElevationDegImpact: elevationDeg(impactVx, impactVy, impactVz),
        speedAzimuthDegImpact: azimuthDeg(impactVx, impactVz),
        normalDamageImpact: impactDamage.normalDamage,
        durableDamageImpact: impactDamage.durableDamage,
        damageRatioImpact: impactDamage.damageRatio,
        reason: "landed", track,
      };
    }

    for (let step = 0; step < maxSteps; step++) {
      const timeNext = Math.min(timeBudget, (step + 1) * dt);
      const dtStep = timeNext - time;
      if (dtStep <= 0) break;
      const speed = Math.hypot(vx, vy, vz);
      const accelerationX = -dragConstant * speed * vx;
      const accelerationY = -dragConstant * speed * vy - gravity;
      const accelerationZ = -dragConstant * speed * vz;
      const xNext = x + vx * dtStep + 0.5 * accelerationX * dtStep ** 2;
      const yNext = y + vy * dtStep + 0.5 * accelerationY * dtStep ** 2;
      const zNext = z + vz * dtStep + 0.5 * accelerationZ * dtStep ** 2;
      const vxNext = vx + accelerationX * dtStep;
      const vyNext = vy + accelerationY * dtStep;
      const vzNext = vz + accelerationZ * dtStep;
      const timeIntoStep = hitTime(y, vy, accelerationY, dtStep);

      if (timeIntoStep !== null && yNext <= 1e-12) {
        return finishImpact(timeIntoStep, accelerationX, accelerationY, accelerationZ);
      }

      pathLength += Math.hypot(xNext - x, yNext - y, zNext - z);
      x = xNext;
      y = yNext;
      z = zNext;
      vx = vxNext;
      vy = vyNext;
      vz = vzNext;
      time = timeNext;
      if (track) track.push({ time, x, y, z });
      if (lifeTime > 0 && time >= lifeTime) return result("life_expired");
      if (!ignoreTerminalVelocity && Math.hypot(vx, vy, vz) <= 0.1 * vConfig) {
        return result("terminal_velocity");
      }
    }
    return result("timeout");
  }

  // A horizontal target is fixed at (R, 0, 0), so cancel inherited Z first.
  function aimedImpact(angle, opts, includeTrack = false) {
    const { shooterVelocity } = calculateInitialVelocity(angle, opts);
    const horizontal = opts.vConfig * Math.cos(angle * Math.PI / 180);
    const lateral = Math.abs(shooterVelocity.z);
    if (horizontal <= 0 || lateral > horizontal) return null;
    // Use the exact forward branch for validity: cos(90 degrees) has a tiny
    // positive floating-point residue and must not create a forward trajectory.
    const forward = Math.sqrt((horizontal - lateral) * (horizontal + lateral));
    if (forward + shooterVelocity.x <= 0) return null;
    const launchAzimuthDeg = Math.asin(-shooterVelocity.z / horizontal) * 180 / Math.PI;
    const initial = calculateInitialVelocity(angle, opts, launchAzimuthDeg);
    if (initial.vx <= 0 || initial.vy <= 0) return null;
    return simulateImpact(angle, opts, includeTrack, launchAzimuthDeg);
  }

  function rangeAt(angle, opts) {
    const r = aimedImpact(angle, opts);
    return r?.landed ? r.landingX : -1;
  }

  function sweep(opts, angleStep) {
    // 预算先于分配：angleStepDeg 极小（如 1e-9）时下面的循环会试图构建
    // 890 亿个采样点，先算清采样数再动手，超限直接报错（2026-10-24 审查 P1）。
    const inheritScan = opts.inheritVelocity && (opts.shooterSpeed ?? 0) > 0;
    const plannedSamples = 1 + 2 * Math.floor(89 / angleStep) + (inheritScan ? 2 + Math.floor(89 / angleStep) : 0);
    if (!Number.isSafeInteger(plannedSamples) || plannedSamples > MAX_ANGLE_SAMPLES) {
      throw new Error("仰角采样数过大（" + plannedSamples + " > 上限 " + MAX_ANGLE_SAMPLES
        + "），请增大仰角粗扫步长 angleStepDeg");
    }
    let angles = [0.01, 0.02, 0.03, 0.05, 0.1, 0.2, 0.3];
    for (let i = 1; i <= Math.floor(89 / angleStep); i++) {
      angles.push(i * angleStep);
    }
    if (inheritScan) {
      angles.push(-89, 0, 89);
      for (let i = 1; i <= Math.floor(89 / angleStep); i++) angles.push(-i * angleStep);
    }
    angles = [...new Set(angles.map((a) => Math.round(a * 1e6) / 1e6))].sort(
      (a, b) => a - b
    );
    if (angles.length > MAX_ANGLE_SAMPLES) {
      throw new Error("仰角采样数过大（" + angles.length + " > 上限 " + MAX_ANGLE_SAMPLES
        + "），请增大仰角粗扫步长 angleStepDeg");
    }
    const segments = [];
    let segment = [];
    let previousAngle = null;
    const refineBoundary = (validAngle, invalidAngle) => {
      let range = rangeAt(validAngle, opts);
      for (let i = 0; i < 35; i++) {
        const middle = (validAngle + invalidAngle) / 2;
        const candidateRange = rangeAt(middle, opts);
        if (candidateRange > 0) {
          validAngle = middle;
          range = candidateRange;
        } else invalidAngle = middle;
      }
      return [validAngle, range];
    };
    const refine = opts.inheritVelocity && (opts.shooterSpeed ?? 0) > 0;
    for (const a of angles) {
      const x = rangeAt(a, opts);
      if (x > 0) {
        if (refine && !segment.length && previousAngle !== null) {
          segment.push(refineBoundary(a, previousAngle));
        }
        segment.push([a, x]);
      } else if (segment.length) {
        if (refine) segment.push(refineBoundary(segment[segment.length - 1][0], a));
        segments.push(segment);
        segment = [];
      }
      previousAngle = a;
    }
    if (segment.length) segments.push(segment);
    return segments;
  }

  function brentq(f, a, b, xtol) {
    let fa = f(a),
      fb = f(b);
    if (fa * fb > 0) throw new Error("brentq: no sign change");
    let c = a,
      fc = fa,
      d = b - a,
      e = d;
    for (let iter = 0; iter < 80; iter++) {
      if (fb * fc > 0) {
        c = a;
        fc = fa;
        d = e = b - a;
      }
      if (Math.abs(fc) < Math.abs(fb)) {
        a = b;
        b = c;
        c = a;
        fa = fb;
        fb = fc;
        fc = fa;
      }
      const tol = 2 * Number.EPSILON * Math.abs(b) + 0.5 * xtol;
      const m = 0.5 * (c - b);
      if (Math.abs(m) <= tol || fb === 0) return b;
      if (Math.abs(e) >= tol && Math.abs(fa) > Math.abs(fb)) {
        const s = fb / fa;
        let p, q;
        if (a === c) {
          p = 2 * m * s;
          q = 1 - s;
        } else {
          q = fa / fc;
          const r = fb / fc;
          p = s * (2 * m * q * (q - r) - (b - a) * (r - 1));
          q = (q - 1) * (r - 1) * (s - 1);
        }
        if (p > 0) q = -q;
        p = Math.abs(p);
        if (2 * p < Math.min(3 * m * q - Math.abs(tol * q), Math.abs(e * q))) {
          e = d;
          d = p / q;
        } else {
          d = e = m;
        }
      } else {
        d = e = m;
      }
      a = b;
      fa = fb;
      b += Math.abs(d) > tol ? d : m > 0 ? tol : -tol;
      fb = f(b);
    }
    return b;
  }

  function maximizeRange(opts, landed) {
    let aBest = landed[0][0],
      xBest = landed[0][1];
    for (const [a, x] of landed) {
      if (x > xBest) {
        xBest = x;
        aBest = a;
      }
    }
    const aLo = landed[0][0],
      aHi = landed[landed.length - 1][0];
    let lo = Math.max(aLo, aBest - 2.0);
    let hi = Math.min(aHi, aBest + 2.0);
    if (hi <= lo + 1e-9) {
      return { maximumRange: xBest, optimumAngleDeg: aBest };
    }

    // golden-section maximize on [lo, hi]
    const gr = (Math.sqrt(5) - 1) / 2;
    let a = lo,
      b = hi;
    let c = b - gr * (b - a);
    let d = a + gr * (b - a);
    let fc = rangeAt(c, opts);
    let fd = rangeAt(d, opts);
    for (let i = 0; i < 40; i++) {
      // An invalid evaluation splits the search domain; never optimize through it.
      if (fc < 0 || fd < 0) {
        return { maximumRange: xBest, optimumAngleDeg: aBest };
      }
      if (fc > fd) {
        b = d;
        d = c;
        fd = fc;
        c = b - gr * (b - a);
        fc = rangeAt(c, opts);
      } else {
        a = c;
        c = d;
        fc = fd;
        d = a + gr * (b - a);
        fd = rangeAt(d, opts);
      }
    }
    const aMid = 0.5 * (a + b);
    const xMid = rangeAt(aMid, opts);
    if (xMid > xBest) {
      return { maximumRange: xMid, optimumAngleDeg: aMid };
    }
    return { maximumRange: xBest, optimumAngleDeg: aBest };
  }

  function solveAngles(targetHorizontalRange, opts, landedAngles, maximumRange) {
    if (targetHorizontalRange > maximumRange + 1e-3) return [];
    const angleIntervals = [];
    if (!(opts.inheritVelocity && (opts.shooterSpeed ?? 0) > 0)) {
      const minimumAngleDeg = 1e-3;
      angleIntervals.push([
        minimumAngleDeg, landedAngles[0][0],
        rangeAt(minimumAngleDeg, opts), landedAngles[0][1],
      ]);
    }
    for (let i = 0; i < landedAngles.length - 1; i++) {
      angleIntervals.push([
        landedAngles[i][0],
        landedAngles[i + 1][0],
        landedAngles[i][1],
        landedAngles[i + 1][1],
      ]);
    }

    const solutions = [];
    // Include sampled endpoints (including the final and maximum-range sample).
    for (const [angle, range] of landedAngles) {
      if (Math.abs(range - targetHorizontalRange) < 1e-3) {
        solutions.push(aimedImpact(angle, opts));
      }
    }
    for (const [angleStart, angleEnd, rangeStart, rangeEnd] of angleIntervals) {
      if (rangeStart < 0 || rangeEnd < 0) continue;
      const startError = rangeStart - targetHorizontalRange;
      const endError = rangeEnd - targetHorizontalRange;
      if (Math.abs(startError) < 1e-3) {
        solutions.push(aimedImpact(angleStart, opts));
      } else if (startError * endError < 0) {
        try {
          const launchAngleDeg = brentq(
            (angle) => {
              const range = rangeAt(angle, opts);
              if (range < 0) throw new Error("invalid aim interval");
              return range - targetHorizontalRange;
            },
            angleStart,
            angleEnd,
            1e-8
          );
          const solution = aimedImpact(launchAngleDeg, opts);
          if (solution?.landed && Math.abs(solution.landingX - targetHorizontalRange) < 1e-2
            && Math.abs(solution.landingZ) < 1e-6) solutions.push(solution);
        } catch (_) {
          /* skip */
        }
      }
    }

    const uniqueSolutions = [];
    solutions.sort((left, right) => left.launchAngleDeg - right.launchAngleDeg);
    for (const solution of solutions) {
      if (
        solution.landed &&
        (!uniqueSolutions.length || Math.abs(
          solution.launchAngleDeg - uniqueSolutions[uniqueSolutions.length - 1].launchAngleDeg
        ) > 0.05)
      ) {
        uniqueSolutions.push(solution);
      }
    }
    return uniqueSolutions;
  }

  function labelSol(i, n) {
    if (n === 1) return "unique";
    if (i === 0) return "low";
    if (i === n - 1) return "high";
    return "other";
  }

  function solveAim(opts) {
    validateSimulationTime(opts.stepHz, opts.lifeTime);
    const initialVelocity = calculateInitialVelocity(0, opts);
    const {
      targetHorizontalRanges,
      angleStepDeg = 0.5,
      gravityMultiplier,
      g0 = 9.81,
    } = opts;
    const dragConstant = calculateDragConstant(
      opts.caliberMm, opts.massG, opts.dragCoeff, opts.rho ?? 1.2
    );
    const gravity = g0 * gravityMultiplier;

    if (!opts.ignoreTerminalVelocity && initialVelocity.speed <= 0.1 * opts.vConfig) {
      return {
        ok: false,
        reason: "initial_destroyed",
        dragConstant,
        gravity,
        targets: targetHorizontalRanges.map((targetHorizontalRange) => ({
          range: targetHorizontalRange,
          reachable: false,
          solutions: [],
        })),
      };
    }

    if (Math.abs(gravityMultiplier * g0) < 1e-15) {
      return {
        ok: false,
        reason: "no_gravity",
        dragConstant,
        gravity,
        targets: targetHorizontalRanges.map((targetHorizontalRange) => ({
          range: targetHorizontalRange,
          reachable: false,
          solutions: [],
        })),
      };
    }

    if (!Number.isFinite(angleStepDeg) || angleStepDeg <= 0) {
      throw new Error("angleStepDeg 必须是有限正数");
    }
    const landedSegments = sweep(opts, angleStepDeg);
    const landedAngles = landedSegments.flat();
    if (!landedAngles.length) {
      return {
        ok: false,
        reason: "no_landed",
        dragConstant,
        gravity,
        ignoreTerminalVelocity: opts.ignoreTerminalVelocity,
        targets: [],
      };
    }

    const maxima = landedSegments.map((segment) => maximizeRange(opts, segment));
    const { maximumRange, optimumAngleDeg } = maxima.reduce(
      (best, candidate) => candidate.maximumRange > best.maximumRange ? candidate : best
    );
    const maximumLandingAngleDeg = landedAngles[landedAngles.length - 1][0];
    const targets = targetHorizontalRanges.map((targetHorizontalRange) => {
      const solutions = landedSegments.flatMap((segment, index) => {
        const maximum = maxima[index];
        const samples = [...segment, [maximum.optimumAngleDeg, maximum.maximumRange]]
          .sort((a, b) => a[0] - b[0]);
        return solveAngles(targetHorizontalRange, opts, samples, maximumRange);
      }).sort((a, b) => a.launchAngleDeg - b.launchAngleDeg);
      return {
        range: targetHorizontalRange,
        reachable: solutions.length > 0,
        solutions,
      };
    });

    let firstTrajectory = null;
    for (const target of targets) {
      if (!target.solutions.length) continue;
      firstTrajectory = {
        range: target.range,
        curves: target.solutions.map((solution, index) => ({
          solutionIndex: index,
          solutionCount: target.solutions.length,
          launchAngleDeg: solution.launchAngleDeg,
          launchAzimuthDeg: solution.launchAzimuthDeg,
          track: simulateImpact(solution.launchAngleDeg, opts, true, solution.launchAzimuthDeg).track || [],
        })),
      };
      break;
    }

    return {
      ok: true,
      dragConstant,
      gravity,
      maximumRange,
      optimumAngleDeg,
      maximumLandingAngleDeg,
      landedAngles,
      targets,
      firstTrajectory,
      ignoreTerminalVelocity: opts.ignoreTerminalVelocity,
    };
  }

  global.HD2Ballistics = {
    calculateDragConstant,
    calculateDamage,
    calculateShooterVelocity,
    calculateInitialVelocity,
    parseNumberList,
    simulateTrajectory,
    simulateImpact,
    solveAim,
    labelSol,
  };
})(typeof window !== "undefined" ? window : globalThis);
