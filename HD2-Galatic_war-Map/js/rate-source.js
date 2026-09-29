"use strict";
/* ==============================================================
   实测速率数据源（2026-09-29 新增）
   --------------------------------------------------------------
   数据来自社区 CDN 的 15 分钟一帧快照，由采集脚本落到 ./data/recent/ 下
   （同源，浏览器直接读，没有 CORS 问题；仓库里没有这份缓存就整块跳过）：
     index.json           清单：有哪些星球的帧、窗口时长、生成时间
     planet_<idx>.json    单颗星球：{data:[{health,maxHealth,regenPerSecond,players,owner}]}
     planet_regions.json  所有区域：{data:[{planetRegions:[{planetIndex,regionIndex,owner,health,regerPerSecond,players,isAvailable}]}]}
     assignments.json     MO 任务进度帧：{data:[{assignments:[{progress:[...],expiresIn,startTime,setting}]}]}

   口径（与社区站点的实测差分一致）：
     实测净推进 %/h = −(末帧血量 − 首帧血量) ÷ 满血 × 100 ÷ 帧间隔小时
     施加 / 纯产出   = 实测净推进 + 抵抗度（抵抗度 = regenPerSecond × 3600 ÷ 满血 × 100）
     「等效抵抗度」  = regenPerSecond × 3600 ÷ 1,000,000 × 100（按 100 万血基准）

   ⚠ 拿不到帧（没有这份缓存、或上游 CDN 挂了）时一律返回 null，
     调用方要回退到站内推演公式，**不要当成 0**。
   ============================================================== */

window.HD2Recent = (function () {
  const state = {
    base: null,
    index: null,
    planets: {},     // idx -> frames[]
    regions: {},     // "idx:regionIndex" -> frames[]
    mo: null,        // [{timestampUtc, progress[], expiresIn, startTime}]
    windowH: 1,
  };

  const toMs = (s) => {
    const t = Date.parse(s);
    return isFinite(t) ? t : null;
  };

  /* 缓存新鲜度护栏（2026-09-29）：这份帧缓存是「覆盖式刷新」的（CI 每 5 分钟跑一次，
     帧本身 15 分钟粒度）。一旦刷新断了 —— Actions 排队/挂掉、CDN 挂了、本机没开机 ——
     文件还躺在原地，页面会继续拿"过去那个小时"的首尾血量差算差分，照样标
     「实测 · 近 1 小时」。那比没有实测更误导，所以这里按 index.json 的生成时间判新鲜度：
     3 小时 = 连丢 12 轮以上才算断更 → 整块实测关闭，各调用点自动退回推演
     （界面上显示「推演 · 无实测帧」，与缓存缺失时完全同一条路径）。 */
  const FRESH_MAX_H = 3;

  /* 满血顶格（2026-09-29）：血量贴在 maxHealth 上时，玩家输出只要没超过回血，
     血量就**一点都不会动** —— 这时 Δ=0 并不代表"净速率 0"，而是"净速率 ≤ 0"。
     这种 0 不能当实测用（必须交给推演兜底），否则满血星球会被算成"推进 0"而不是负推进。
     判据：窗口首尾帧的血量都 ≥ 满血（留 0.05% 容差）。 */
  const CAP_TOL = 0.0005;
  function isCapped(frame) {
    const mh = Number(frame && frame.maxHealth);
    const hp = Number(frame && frame.health);
    return Number.isFinite(mh) && mh > 0 && Number.isFinite(hp) && hp >= mh * (1 - CAP_TOL);
  }

  /* 从一串带 timestampUtc 的帧里取「最近 windowH 小时」的首尾两帧。
     帧不够、或者跨度过短（<15 分钟）返回 null —— 宁可没有实测，也不要假实测。 */
  function spanOf(frames, windowH) {
    const list = (frames || [])
      .map((f) => ({ t: toMs(f.timestampUtc), f }))
      .filter((x) => x.t != null)
      .sort((a, b) => a.t - b.t);
    if (list.length < 2) return null;
    const last = list[list.length - 1];
    const earliest = last.t - windowH * 3600000;
    let first = list[0];
    for (const x of list) {
      if (x.t >= earliest) { first = x; break; }
    }
    const hours = (last.t - first.t) / 3600000;
    if (!(hours >= 0.24)) return null;      // ≈14 分钟
    return { first: first.f, last: last.f, hours };
  }

  /* 一条血量序列 → 净推进（%/h，正 = 在推进 = 血量在掉） */
  function netFrom(frames, maxHealth, windowH) {
    const sp = spanOf(frames, windowH);
    if (!sp || !(maxHealth > 0)) return null;
    const dh = (+sp.last.health || 0) - (+sp.first.health || 0);
    return {
      net: -dh / maxHealth * 100 / sp.hours,
      hours: sp.hours,
      dh,
      first: sp.first,
      last: sp.last,
      ownerChanged: sp.first.owner !== sp.last.owner,
      capped: isCapped(sp.first) && isCapped(sp.last),
    };
  }

  async function jsonOrNull(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  async function load(opts) {
    const base = (opts && opts.base) || "./data/recent";
    state.base = base;
    const idx = await jsonOrNull(base + "/index.json");
    state.index = idx;
    state.windowH = (idx && idx.windowHours) || 1;
    if (!idx) return false;
    const genMs = toMs(idx.generatedAt);
    if (genMs != null && (Date.now() - genMs) > FRESH_MAX_H * 3600000) {
      state.index = null;
      return false;
    }

    const want = (opts && opts.planets) || (idx.planets || []);
    const jobs = want.map(async (i) => {
      const j = await jsonOrNull(base + "/planet_" + i + ".json");
      if (j && Array.isArray(j.data)) state.planets[i] = j.data;
    });

    jobs.push((async () => {
      const j = await jsonOrNull(base + "/planet_regions.json");
      if (!j || !Array.isArray(j.data)) return;
      for (const frame of j.data) {
        for (const r of (frame.planetRegions || [])) {
          const key = r.planetIndex + ":" + r.regionIndex;
          (state.regions[key] = state.regions[key] || []).push(Object.assign({ timestampUtc: frame.timestampUtc }, r));
        }
      }
    })());

    jobs.push((async () => {
      const j = await jsonOrNull(base + "/assignments.json");
      if (!j || !Array.isArray(j.data)) return;
      state.mo = j.data.map((f) => {
        const a = (f.assignments || [])[0];
        return a ? { timestampUtc: f.timestampUtc, progress: a.progress || [], expiresIn: a.expiresIn, startTime: a.startTime } : null;
      }).filter(Boolean);
    })());

    await Promise.all(jobs);
    return true;
  }

  /* ---- 星球级实测（带诊断）----
     返回 { ok:true, value:{ net, gross, res, resEq, hours, from, to } }
       或 { ok:false, reason: "noframes" | "owner" | "capped" | "bad" }
     reason=capped 表示"满血顶格，实测观察不到变化"（此时 net 应为 ≤0，必须走推演兜底）。 */
  function planetDiag(p) {
    if (!p || !(p.maxHealth > 0)) return { ok: false, reason: "bad" };
    const n = netFrom(state.planets[p.index], p.maxHealth, state.windowH);
    if (!n) return { ok: false, reason: "noframes" };
    if (n.ownerChanged) return { ok: false, reason: "owner" };
    if (n.capped) return { ok: false, reason: "capped" };
    const res = Number(p.resistance) || 0;
    return {
      ok: true,
      value: {
        net: n.net, gross: n.net + res, res,
        resEq: res * (p.maxHealth || 0) / 1e6,
        hours: n.hours, measured: true,
        from: n.first.timestampUtc, to: n.last.timestampUtc,
      },
    };
  }
  const planet = (p) => { const d = planetDiag(p); return d.ok ? d.value : null; };

  /* ---- 区域级实测（带诊断）----
     region = data.json 里该星球的 regions[i]（满血顶格的判断同星球）。
     区域帧里的 owner 是数字（1=超级地球 2=终结族 3=机器人 4=光能者），跟 data.json
     的字符串 owner 对不上，所以只比「窗口内有没有易主」；易主就别信这段差分。 */
  function regionDiag(planetIndex, r) {
    if (!r || !(r.maxHealth > 0)) return { ok: false, reason: "bad" };
    const n = netFrom(state.regions[planetIndex + ":" + r.regionIndex], r.maxHealth, state.windowH);
    if (!n) return { ok: false, reason: "noframes" };
    if (n.ownerChanged) return { ok: false, reason: "owner" };
    if (n.capped) return { ok: false, reason: "capped" };
    const regen = Number(n.last.regerPerSecond) || 0;
    const maxH = r.maxHealth || 0;
    const res = maxH > 0 ? regen * 3600 / maxH * 100 : 0;     // 相对本区域血池
    return {
      ok: true,
      value: {
        net: n.net, gross: n.net + res, res,
        resEq: regen * 3600 / 1e6 * 100,                       // 按 100 万血基准
        hours: n.hours, measured: true,
        players: n.last.players, isAvailable: n.last.isAvailable,
        from: n.first.timestampUtc, to: n.last.timestampUtc,
      },
    };
  }
  const region = (planetIndex, r) => { const d = regionDiag(planetIndex, r); return d.ok ? d.value : null; };

  /* ---- MO 实测：每个任务最近 windowH 小时的完成速率（单位/小时） ---- */
  /* 区域「当前值」（不管能不能算差分）：末帧的抵抗度/玩家/是否开放。
     抵抗度 = regerPerSecond × 3600 ÷ 区域满血 × 100（相对本区域血池）
     等效抵抗度 = regerPerSecond × 3600 ÷ 1,000,000 × 100（100 万血基准） */
  function regionMeta(planetIndex, r) {
    const frames = state.regions[planetIndex + ":" + (r && r.regionIndex)];
    if (!frames || !frames.length || !(r && r.maxHealth > 0)) return null;
    const last = frames[frames.length - 1];
    const regen = Number(last.regerPerSecond) || 0;
    return {
      res: regen * 3600 / r.maxHealth * 100,
      resEq: regen * 3600 / 1e6 * 100,
      regenPerSecond: regen,
      players: last.players, isAvailable: last.isAvailable,
      frames: frames.length,
    };
  }

  /* MO 的多窗口速率（2026-09-29）：近 1 小时只反映"当下节奏"，而 MO 的击杀数是**一阵一阵**的，
     单看 1 小时会和整体观感差很多（实测：任务1 近 1 小时 14.2 万/时 vs 全程均速 23.9 万/时）。
     所以同时给出 近1h / 近6h / 近24h / 自指令下达以来 四种窗口，页面以「自指令下达以来」为准，
     并把「近 1 小时」作为对照一起标出来。 */
  function moWindows() {
    const list = state.mo;
    if (!list || list.length < 2) return null;
    const withT = list.map((f) => ({ t: toMs(f.timestampUtc), f })).filter((x) => x.t != null).sort((a, b) => a.t - b.t);
    if (withT.length < 2) return null;
    const last = withT[withT.length - 1];
    const startWar = Number(last.f.startTime);
    const mk = (base, label) => {
      if (!base) return null;
      const hours = (last.t - base.t) / 3600000;
      if (!(hours >= 0.24)) return null;
      const n = Math.min((last.f.progress || []).length, (base.f.progress || []).length);
      const rates = [];
      for (let i = 0; i < n; i++) rates.push(((last.f.progress[i] || 0) - (base.f.progress[i] || 0)) / hours);
      return { label, rates, hours, from: base.f.timestampUtc, to: last.f.timestampUtc };
    };
    const back = (hours) => {
      const cut = last.t - hours * 3600000;
      for (const x of withT) if (x.t >= cut) return x;
      return null;
    };
    let runBase = null;
    if (Number.isFinite(startWar)) {
      for (const x of withT) if (Number(x.f.startTime) === startWar) { runBase = x; break; }
    }
    if (!runBase) runBase = withT[0];
    return {
      h1: mk(back(1), "近 1 小时"),
      h6: mk(back(6), "近 6 小时"),
      h24: mk(back(24), "近 24 小时"),
      run: mk(runBase, "自指令下达以来"),
      expiresInSec: last.f.expiresIn,
    };
  }

  function mo() {
    const list = state.mo;
    if (!list || list.length < 2) return null;
    const withT = list.map((f) => ({ t: toMs(f.timestampUtc), f })).filter((x) => x.t != null).sort((a, b) => a.t - b.t);
    if (withT.length < 2) return null;
    const last = withT[withT.length - 1];
    const earliest = last.t - state.windowH * 3600000;
    let first = withT[0];
    for (const x of withT) { if (x.t >= earliest) { first = x; break; } }
    const hours = (last.t - first.t) / 3600000;
    if (!(hours >= 0.24)) return null;
    const n = Math.min((last.f.progress || []).length, (first.f.progress || []).length);
    const rates = [];
    for (let i = 0; i < n; i++) rates.push(((last.f.progress[i] || 0) - (first.f.progress[i] || 0)) / hours);
    return { rates, hours, expiresInSec: last.f.expiresIn, from: first.f.timestampUtc, to: last.f.timestampUtc };
  }

  function stats() {
    return {
      loaded: !!state.index,
      planets: Object.keys(state.planets).length,
      regions: Object.keys(state.regions).length,
      mo: !!(state.mo && state.mo.length),
      windowHours: state.windowH,
      generatedAt: state.index && state.index.generatedAt,
    };
  }

  return { load, planet, planetDiag, region, regionDiag, regionMeta, mo, moWindows, stats, _state: state };
})();
