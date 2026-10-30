import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const window = {};
for (const file of ["HD2-Galatic_war-Map/js/forecast.js", "HD2-Galatic_war-Map/js/dss-donations.js", "HD2-Galatic_war-Map/js/ownership-changes.js", "HD2-Galatic_war-Map/js/planet-card-effects.js", "HD2-Galatic_war-Map/js/mo-equipment.js", "HD2-Galatic_war-Map/js/regions.js", "HD2-Report/report-model.js"]) new Function("window", fs.readFileSync(path.join(root, file), "utf8"))(window);
const M = window.HD2Report;
let checks = 0;
function test(name, fn) { fn(); checks++; console.log("PASS " + name); }
const site = file => JSON.parse(fs.readFileSync(path.join(root, "HD2-Galatic_war-Map", file), "utf8"));
const data = site("data.json");
const extras = { starmap: site("tables/starmap.json"), variables: site("tables/hd2_variables.json"), translations: site("data/translated/TransNews.json"), official: site("data/translated/official_texts.json"), fallback: site("data/translated/report_dispatches_zh.json"), players: site("data/history/player_distribution.json"), environment: site("data/planet_environment.json"), baseline: site("data/history/status_24h.json"), regions: site("tables/planet_regions.json"), regionsZh: site("tables/planet_regions_zh.json") };
const recent = { planetDiag: () => ({ ok: false, reason: "noframes" }), assignmentFrames: () => [], moWindows: () => null };
const model = M.build(data, { ...extras, recent });
const get = (model, key) => model.columns.flat().find(section => section.key === key);

test("站点快照直接生成战报，包含原有信息与超级地球态势", () => {
  for (const key of ["mo", "earth", "armed", "forces", "changes", "dss", "fronts", "news"]) assert.ok(get(model, key), key);
  const text = M.toText(model);
  assert.doesNotMatch(text, /NaN|undefined|Infinity/);
  assert.ok(get(model, "fronts").blocks.length <= 5);
  assert.ok(get(model, "news").blocks.filter(b => b.title).every(b => M.chinese(b.title)));
});
test("简中接口返回英文时不进入战报", () => {
  assert.deepEqual(M.news({}, { fallback: { language: "zh-Hans", dispatches: [{ id: 1, message: "SCAVENGER RAMPAGE UPDATE" }] } }), []);
});
test("主站汉化补齐官方简中缺项，且保留来源", () => {
  const rows = M.news({ news: [{ id: 1, translated: "食腐虫数量恢复正常。", mt: true }] }, { fallback: { language: "zh-Hans", dispatches: [{ id: 1, message: "English" }, { id: 2, message: "<span>主要指令</span>\n\n保卫超级地球。" }] } });
  assert.equal(rows.length, 2); assert.equal(rows[0].source, "官方简中");
  assert.equal(rows[1].text, "食腐虫数量恢复正常。"); assert.equal(rows[1].source, "站点汉化 · 机翻");
});
test("主站文本优先，同 ID 不重复；繁中语言来源不作为简中缓存", () => {
  assert.equal(M.news({ news: [{ id: 1, translated: "主站汉化" }] }, { fallback: { language: "zh-Hans", dispatches: [{ id: 1, message: "官方简中" }] } })[0].text, "主站汉化");
  assert.deepEqual(M.news({}, { fallback: { language: "zh-Hant", dispatches: [{ id: 1, message: "超級地球戰報" }] } }), []);
});
test("无汉化英文不回退，官方英文阵营词替换为站点中文", () => {
  assert.deepEqual(M.news({ news: [{ id: 1, original: "English only" }] }), []);
  assert.equal(M.news({ news: [{ id: 1, translated: "Illuminate前线和Automaton前线" }] })[0].text, "光能者前线和机器人前线");
});
test("已解放星球的满血不被误判成 0%", () => assert.equal(M.liberation({ currentOwner: "Humans", health: 100, maxHealth: 100 }), 100));
test("未知血量不编造成 0%", () => assert.equal(M.liberation({ currentOwner: "Terminids", health: null, maxHealth: 100 }), null));
test("有实测复用主站实测；满血顶格注明推演", () => {
  const p = { health: 100, maxHealth: 100, resistance: 4, players: 0 };
  const r = M.planetRate({ impactMultiplier: .01 }, p, { planetDiag: () => ({ ok: false, reason: "capped" }) });
  assert.equal(r.net, -4); assert.match(r.source, /满血顶格/);
  const measured = M.planetRate({}, p, { planetDiag: () => ({ ok: true, value: { net: 1.2, gross: 5.2, res: 4 } }) });
  assert.equal(measured.net, 1.2); assert.equal(measured.source, "近期实测");
});
test("缺影响力时不把未知速率当作零", () => assert.equal(M.planetRate({}, { maxHealth: 100, players: 10, resistance: 2 }, recent), null));
test("特殊部队只统计交战星球，排除友军和设施", () => {
  const planets = [
    { index: 1, name: "ONE", activeEffects: [1243, 1245], players: 20, currentOwner: "Terminids" },
    { index: 2, name: "TWO", activeEffects: [1243, 1245], players: 100, currentOwner: "Humans" },
    { index: 3, name: "THREE", activeEffects: [1400, 1401, 1239], players: 10, currentOwner: "Automaton" },
    { index: 4, name: "FOUR", activeEffects: [1248, 1249], players: 10, currentOwner: "Humans" }
  ];
  const m = M.build({ fetchedAt: data.fetchedAt, planets, campaigns: [{ planet: { index: 1 } }, { planet: { index: 3 } }], planet_events: [{ planetIndex: 4, eventType: 1 }] }, { ...extras, recent });
  const s = get(m, "armed");
  assert.equal(s.blocks.length, 2); assert.match(s.note, /3 颗交战星球中，有 2 颗/);
  assert.deepEqual(s.blocks.map(b => b.lines[0].text).sort(), ["掠食变种", "炽灼部队"].sort());
  assert.ok(s.blocks.every(b => /（1）/.test(b.title)), "game/pawn 成对效果须去重");
});
test("无特殊部队对照表时显示未知，不声称零部队", () => {
  const m = M.build({ fetchedAt: data.fetchedAt, planets: [{ index: 1, activeEffects: [1243] }], campaigns: [{ planet: { index: 1 } }] }, { recent });
  assert.match(get(m, "armed").blocks[0].lines[0].text, /对照表暂不可用/);
});

const fixture = { fetchedAt: "2026-10-30T08:00:00Z", planets: [{ index: 10, currentOwner: "Humans", health: 100, maxHealth: 100, players: 1 }], campaigns: [], assignments: { id: 1, startedAt: "2026-10-30T04:00:00Z", deadline: "2026-10-30T12:00:00Z", tasks: [], progress: [] } };
// Runtime values are fixed; CI must also pass after the site's rolling snapshot changes.
const regionPlanets = [
  { index: 158, currentOwner: "Automaton", maxHealth: 3200000, health: 1835000, players: 100, regions: [
    { regionIndex: 0, owner: "Automaton", health: 200000, maxHealth: 200000, damageMultiplier: 1.5, isAvailable: false },
    { regionIndex: 1, owner: "Humans", health: 400000, maxHealth: 400000, damageMultiplier: 1.5, isAvailable: false },
    { regionIndex: 2, owner: "Humans", health: 600000, maxHealth: 600000, damageMultiplier: 1.5, isAvailable: false },
    { regionIndex: 3, owner: "Automaton", health: 948940, maxHealth: 1000000, damageMultiplier: 1.5, flags: 1, isAvailable: true }
  ] },
  { index: 244, currentOwner: "Humans", maxHealth: 1400000, health: 1400000, players: 200, regions: [
    { regionIndex: 0, owner: "Automaton", health: 120434, maxHealth: 400000, damageMultiplier: 1.5, isAvailable: true }
  ] }
];
const regionModel = M.build({ ...fixture, assignments: null, planets: regionPlanets,
  campaigns: [{ planet: { index: 158 } }, { type: "defense", planet: { index: 244 } }],
  planet_events: [{ planetIndex: 244, eventType: 1, maxHealth: 1900000 }]
}, { ...extras, recent });
function order(task, progress, extra = {}) {
  return M.build({ ...fixture, assignments: { ...fixture.assignments, tasks: [task], progress: [progress] }, ...extra }, { recent });
}
test("守持任务不绘制累计完成进度条", () => {
  const s = get(order({ type: 13, valueTypes: [3, 11, 12], values: [1, 1, 10] }, 1), "mo");
  assert.deepEqual(s.blocks[1].bars, []); assert.match(s.blocks[1].lines[0].text, /需保持至截止/);
});
test("解放任务从星球当前状态读取进度", () => {
  const s = get(order({ type: 11, valueTypes: [3, 11, 12], values: [1, 1, 10] }, 0), "mo");
  assert.equal(s.blocks[1].bars[0].value, 100);
});
test("星区任务不会误匹配同号星球", () => {
  const s = get(order({ type: 11, valueTypes: [3, 11, 12], values: [1, 2, 10] }, 0), "mo");
  assert.equal(s.blocks[1].bars[0].value, null);
});
test("MO 外推使用下达以来均速，进度条有时间基准", () => {
  const s = get(order({ type: 3, valueTypes: [3], values: [100] }, 25), "mo");
  assert.equal(s.blocks[1].bars[0].marker, 50);
  assert.match(s.blocks[1].lines[1].text, /截止时约 50.00%/);
});
test("实测防守零速率保持停滞，不用历史平均掩盖", () => {
  const m = M.build({ ...fixture, assignments: null, campaigns: [{ type: "defense", planet: { index: 10 }, defendersProgress: 20, attackersProgress: 50, defendersRate: 0, attackersRate: 5, remainingTime: 36000 }] }, { recent });
  const text = get(m, "fronts").blocks[0].lines.map(l => l.text).join("\n");
  assert.match(text, /预计失守/);
  assert.match(text, /20.00%/);
});
test("快照时间锚定易主窗口，不把未来记录混入战报", () => {
  const m = M.build({ ...fixture, assignments: null, ownership_history: { startedAt: "2026-10-01T00:00:00Z", updatedAt: fixture.fetchedAt, events: [{ planetIndex: 10, fromOwner: "Humans", toOwner: "Terminids", previousSeenAt: "2026-10-30T08:50:00Z", detectedAt: "2026-10-30T09:00:00Z" }] } }, { recent });
  assert.match(get(m, "changes").blocks[0].lines.map(l => l.text).join("\n"), /未检测到/);
});
test("攻守进度都向右，以蓝色与红色区分", () => {
  const m = M.build({ ...fixture, assignments: null, campaigns: [{ type: "defense", planet: { index: 10 }, defendersProgress: 20, attackersProgress: 50, defendersRate: 1, attackersRate: 2, remainingTime: 36000 }] }, { recent });
  assert.deepEqual(get(m, "fronts").blocks[0].bars.map(b => [b.direction, b.tone]), [["right", "blue"], ["right", "bad"]]);
});
test("解放趋势推进、倒退、僵持分别标识，不修改真实进度", () => {
  for (const [net, direction, tone] of [[1, "right", "blue"], [-1, "left", "bad"], [0, "still", "yellow"]]) {
    const p = { index: 11, currentOwner: "Terminids", health: 50, maxHealth: 100, players: 1, resistance: 1 };
    const r = { ...recent, planetDiag: () => ({ ok: true, value: { net, gross: net + 1, res: 1 } }) };
    const m = M.build({ ...fixture, planets: [p], assignments: null, campaigns: [{ planet: { index: 11 } }] }, { recent: r });
    const b = get(m, "fronts").blocks[0].bars[0];
    assert.deepEqual([b.value, b.direction, b.tone], [50, direction, tone]);
  }
});
function decliningFront(health, net) {
  const p = { index: 11, currentOwner: "Terminids", health, maxHealth: 100, players: 1, resistance: 2 };
  const r = { ...recent, planetDiag: () => ({ ok: true, value: { net, gross: net + 2, res: 2 } }) };
  return M.build({ ...fixture, planets: [p], assignments: null, campaigns: [{ planet: { index: 11 } }] }, { recent: r });
}
test("解放倒退按未取整净速率估算归零时间，网页与文字一致", () => {
  const m = decliningFront(60, -0.125);
  const b = get(m, "fronts").blocks[0];
  // 40% / 0.125 个百分点每小时 = 320 小时，而不是按显示的 0.13 推算。
  assert.equal(b.front.summary[0].text, "预计归零 13 天 8 小时");
  assert.ok(b.lines.some(l => l.text === b.front.summary[0].text));
  assert.match(M.toText(m), /预计归零 13 天 8 小时/);
});
test("解放已归零不再给未来归零倒计时", () => {
  const b = get(decliningFront(100, -1), "fronts").blocks[0];
  assert.equal(b.front.summary[0].text, "解放进度已归零");
  assert.ok(!b.lines.some(l => /预计归零/.test(l.text)));
});
test("僵持及未知解放度不生成虚假归零时长", () => {
  assert.equal(get(decliningFront(60, 0), "fronts").blocks[0].front.summary[0].text, "预测 僵持");
  const m = decliningFront(null, -1);
  assert.equal(get(m, "fronts").blocks[0].front.summary[0].text, "归零时间未知");
  assert.doesNotMatch(M.toText(m), /NaN|Infinity|预计归零/);
});
test("按总血量换算血条倍数与百万血基准等效抵抗度", () => {
  const p = { index: 11, currentOwner: "Terminids", health: 1200000, maxHealth: 2000000, players: 1, resistance: 1.25 };
  const m = M.build({ ...fixture, planets: [p], assignments: null, campaigns: [{ planet: { index: 11 } }] }, { recent });
  const h = get(m, "fronts").blocks[0].front.health;
  assert.equal(h.multiple, 2); assert.equal(h.equivalent, 2.5);
  assert.match(h.healthText, /120 万 \/ 200 万.*×2.00/);
  assert.match(h.resistanceText, /等效抵抗度 2.50%\/小时/);
  assert.match(M.toText(m), /等效抵抗度 2.50%\/小时/);
});
test("零抵抗度是已知的零，未知总血量不造倍数和等效抵抗", () => {
  for (const [maximum, multiple, equivalent] of [[1000000, 1, 0], [null, null, null]]) {
    const p = { index: 11, currentOwner: "Terminids", health: 100, maxHealth: maximum, resistance: 0 };
    const m = M.build({ ...fixture, planets: [p], assignments: null, campaigns: [{ planet: { index: 11 } }] }, { recent });
    const h = get(m, "fronts").blocks[0].front.health;
    assert.equal(h.multiple, multiple); assert.equal(h.equivalent, equivalent);
  }
});
test("防守战使用战役血池换算入侵压力，不误用星球本体血量", () => {
  const p = { index: 10, currentOwner: "Humans", health: 1400000, maxHealth: 1400000, resistance: 0 };
  const campaign = { type: "defense", planet: { index: 10 }, attackersRate: 2.083 };
  const m = M.build({ ...fixture, planets: [p], assignments: null, campaigns: [campaign], planet_events: [{ planetIndex: 10, eventType: 1, health: 1298201, maxHealth: 1900000 }] }, { recent });
  const h = get(m, "fronts").blocks[0].front.health;
  assert.equal(h.maxHealth, 1900000); assert.equal(h.multiple, 1.9);
  assert.ok(Math.abs(h.equivalent - 3.9577) < 1e-9);
  assert.match(h.healthText, /战役血量.*190 万.*×1.90/);
  assert.match(h.resistanceText, /等效入侵压力 3.96%\/小时/);
});
test("防守战血池缺失时保持未知", () => {
  const m = M.build({ ...fixture, assignments: null, campaigns: [{ type: "defense", planet: { index: 10 }, attackersRate: 2 }] }, { recent });
  const h = get(m, "fronts").blocks[0].front.health;
  assert.equal(h.maxHealth, null); assert.equal(h.multiple, null); assert.equal(h.equivalent, null);
  assert.match(h.resistanceText, /未知/);
});
test("战线使用同源生态与环境缓存，只显示中文", () => {
  const m = M.build({ ...fixture, assignments: null,
    planets: [{ index: 11, currentOwner: "Terminids", health: 50, maxHealth: 100, biome: "Plains" }],
    campaigns: [{ planet: { index: 11 } }]
  }, { recent, environment: { planets: { 11: { hazards: ["Tremors"] } } } });
  assert.equal(get(m, "fronts").blocks[0].front.environment, "生态：平原　|　环境：地震");
});
test("暂无战役或简中公告是合法状态，不依赖当天恰好存在战线", () => {
  const m = M.build({ ...fixture, assignments: null }, { recent });
  assert.match(get(m, "fronts").blocks[0].lines[0].text, /无可用战役/);
  assert.match(get(m, "news").blocks[0].lines[0].text, /简中战争报告尚未同步/);
  assert.doesNotMatch(M.toText(m), /NaN|undefined|Infinity/);
});
test("24 小时对照拒绝过期，解放度不跨易主或总血量变化比较", () => {
  const current = { fetchedAt: "2026-10-30T08:00:00Z", planets: [{ index: 1, currentOwner: "Terminids", health: 30, maxHealth: 100 }, { index: 2, currentOwner: "Humans", health: 100, maxHealth: 100 }, { index: 3, currentOwner: "Terminids", health: 10, maxHealth: 200 }] };
  const previous = { fetchedAt: "2026-10-29T08:00:00Z", planets: [{ index: 1, currentOwner: "Terminids", health: 50, maxHealth: 100 }, { index: 2, currentOwner: "Terminids", health: 100, maxHealth: 100 }, { index: 3, currentOwner: "Terminids", health: 50, maxHealth: 100 }] };
  const r = M.compareBaseline(current, previous);
  assert.equal(r.moves.length, 1); assert.equal(r.moves[0].delta, 20); assert.equal(r.owners.length, 1);
  assert.equal(M.compareBaseline(current, { ...previous, fetchedAt: "2026-10-28T08:00:00Z" }), null);
});
test("热门战线只列参战人数前五并保持人数排序", () => {
  const planets = [70, 10, 90, 30, 80, 20, 60].map((players, index) => ({ index, players, currentOwner: "Terminids", maxHealth: 100, health: 50, resistance: 1 }));
  const m = M.build({ ...fixture, planets, assignments: null, campaigns: planets.map(p => ({ planet: { index: p.index } })) }, { recent });
  const fronts = get(m, "fronts");
  assert.deepEqual(fronts.blocks.map(b => b.players), [90, 80, 70, 60, 30]);
  assert.match(fronts.note, /前 5 颗/);
});
test("复用主站城市和工厂中文名、开放状态与各自解放进度", () => {
  const regions = get(regionModel, "fronts").blocks.find(b => b.index === 158).front.regions;
  assert.equal(regions.length, 4);
  assert.equal(regions[0].name, "寂城"); assert.equal(regions[0].available, false);
  assert.equal(regions[1].name, "渔港"); assert.equal(regions[1].progress, 100);
  assert.equal(regions[3].name, "演化高地"); assert.equal(regions[3].type, "超大型工厂"); assert.equal(regions[3].available, true);
  assert.ok(Math.abs(regions[3].progress - 5.106) < 1e-9);
  assert.match(M.toText(regionModel), /演化高地 · 超大型工厂 · 已开放/);
});
function regionView(planet, extra = {}, r = recent) {
  const m = M.build({ ...fixture, planets: [planet], assignments: null, campaigns: [{ planet: { index: planet.index } }] }, { ...extra, recent: r });
  return get(m, "fronts").blocks[0].front.regions;
}
test("区域按 regionIndex 对齐，不以人数猜开放，未汉化名称不回退英文", () => {
  const regions = regionView({ index: 11, currentOwner: "Automaton", maxHealth: 1000, health: 1000, regions: [
    { regionIndex: 3, owner: "Automaton", flags: 1, players: 999, isAvailable: false, maxHealth: 1000, health: 500 },
    { regionIndex: 0, owner: "Automaton", players: 0, maxHealth: 200, health: 100 }
  ] });
  assert.deepEqual(regions.map(r => r.index), [0, 3]);
  assert.equal(regions[0].available, null); assert.match(regions[0].status, /未知/);
  assert.equal(regions[1].available, false); assert.equal(regions[1].type, "超大型工厂");
  assert.match(regions[1].name, /名称待汉化/);
});
test("城市只存在静态资料时区分已解放和未知运行状态", () => {
  const extra = { regions: { planets: { 11: { regions: [{ name: "CITY", size: "City" }] } } }, regionsZh: { planets: { 11: { CITY: "测试城" } } } };
  const enemy = regionView({ index: 11, currentOwner: "Automaton" }, extra)[0];
  assert.equal(enemy.progress, null); assert.equal(enemy.available, null); assert.match(enemy.status, /未知/);
  const human = regionView({ index: 11, currentOwner: "Humans" }, extra)[0];
  assert.equal(human.progress, 100); assert.equal(human.available, null); assert.match(human.status, /无区域战役/);
});
test("工厂缺满血值时不套用定居点血量制造进度", () => {
  const extra = { regions: { planets: { 11: { regions: [{ name: "FACTORY", size: "Settlement", region_type: "Megafactory" }] } } } };
  const region = regionView({ index: 11, currentOwner: "Automaton", regions: [{ regionIndex: 0, owner: "Automaton", health: 10000, isAvailable: true }] }, extra)[0];
  assert.equal(region.type, "超大型工厂"); assert.equal(region.progress, null);
});
test("已开放区域复用实测速率与完成时间，闭锁区域不外推", () => {
  const p = { index: 11, currentOwner: "Automaton", maxHealth: 1000, health: 1000, regions: [{ regionIndex: 0, owner: "Automaton", health: 60, maxHealth: 100, isAvailable: true }] };
  const r = { ...recent, regionDiag: () => ({ ok: true, value: { net: 2, res: .4, gross: 2.4 } }) };
  const region = regionView(p, {}, r)[0];
  assert.equal(region.bar.direction, "right"); assert.match(region.detail, /预计解放还需 1 天 6 小时/); assert.match(region.detail, /近期实测/);
  const closed = regionView({ ...p, regions: [{ ...p.regions[0], isAvailable: false }] }, {}, r)[0];
  assert.doesNotMatch(closed.detail, /预计解放|近期实测/);
});
test("城市和工厂的一次性回馈复用区域血量乘倍率的主站口径", () => {
  const regions = get(regionModel, "fronts").blocks.find(b => b.index === 158).front.regions;
  assert.deepEqual(regions.map(r => r.contribution), [9.375, 18.75, 28.125, 46.875]);
  assert.match(regions[3].contributionText, /一次性回馈：主星球解放度 \+46.88 个百分点/);
  assert.equal(regions[3].contributionEstimated, false);
  assert.match(M.toText(regionModel), /一次性回馈：主星球解放度 \+46.88 个百分点/);
});
test("防守城市回馈按入侵事件血池换算并标为防守进度", () => {
  const region = get(regionModel, "fronts").blocks.find(b => b.index === 244).front.regions[0];
  assert.ok(Math.abs(region.contribution - 400000 * 1.5 / 1900000 * 100) < 1e-9);
  assert.match(region.contributionText, /主星球防守进度 \+31.58 个百分点/);
});
test("缺少区域倍率时显示默认倍率估算，不冒充精确回馈", () => {
  const p = { index: 11, currentOwner: "Automaton", health: 1000000, maxHealth: 2000000, regions: [{ regionIndex: 0, owner: "Automaton", health: 400000, maxHealth: 400000, isAvailable: true }] };
  const region = regionView(p)[0];
  assert.equal(region.contribution, 30); assert.equal(region.contributionEstimated, true);
  assert.match(region.contributionText, /\+30.00 个百分点（估算）/);
});
test("已解放城市显示单次回馈规则但不再叠加当前星球进度", () => {
  const p = { index: 11, currentOwner: "Automaton", health: 1200000, maxHealth: 2000000, regions: [{ regionIndex: 0, owner: "Humans", health: 400000, maxHealth: 400000, damageMultiplier: 1.5, isAvailable: false }] };
  const m = M.build({ ...fixture, planets: [p], assignments: null, campaigns: [{ planet: { index: 11 } }] }, { recent });
  const b = get(m, "fronts").blocks[0];
  assert.equal(b.front.regions[0].contribution, 30); assert.equal(b.front.regions[0].progress, 100);
  assert.equal(b.bars[0].value, 40);
});
test("回馈所需血量未知时保留未知，明确的零倍率保留零", () => {
  const extra = { regions: { planets: { 11: { regions: [{ name: "FACTORY", region_type: "Megafactory" }] } } } };
  const missing = regionView({ index: 11, currentOwner: "Automaton", maxHealth: 2000000, regions: [{ regionIndex: 0, owner: "Automaton", health: 10000 }] }, extra)[0];
  assert.equal(missing.contribution, null); assert.match(missing.contributionText, /未知/);
  const zero = regionView({ index: 11, currentOwner: "Automaton", maxHealth: 2000000, regions: [{ regionIndex: 0, owner: "Automaton", health: 400000, maxHealth: 400000, damageMultiplier: 0 }] })[0];
  assert.equal(zero.contribution, 0); assert.match(zero.contributionText, /\+0.00 个百分点/);
});
const recordTime = hours => new Date(Date.parse(fixture.fetchedAt) - hours * 3600000).toISOString();
const victoryHistory = events => ({ startedAt: recordTime(72), updatedAt: fixture.fetchedAt, events: [], defenseStartedAt: recordTime(72), defenseUpdatedAt: fixture.fetchedAt, defenseEvents: events });
const victory = hours => ({ planetIndex: 10, attacker: "Automaton", eventId: 1, previousSeenAt: recordTime(hours + .1), detectedAt: recordTime(hours) });
test("正常 24 小时快照对照也列出同属主的防守成功", () => {
  const m = M.build({ ...fixture, assignments: null, ownership_history: victoryHistory([victory(1)]) }, { recent, baseline: { fetchedAt: recordTime(24), planets: fixture.planets } });
  const s = get(m, "changes"); assert.match(s.note, /基准/);
  const b = s.blocks.find(b => b.title === "防守成功");
  assert.match(b.lines[0].text, /防守成功 1 次.*击退机器人/); assert.match(b.meta, /覆盖约 24.0 小时/);
});
test("无基准时防守成功不重复，过期或未来的战果不混入", () => {
  const m = M.build({ ...fixture, assignments: null, ownership_history: victoryHistory([victory(1), victory(25), victory(-1)]) }, { recent });
  const text = M.toText(m);
  assert.equal([...text.matchAll(/防守成功 1 次/g)].length, 1);
  assert.doesNotMatch(text, /防守成功 [23] 次/);
});
test("防守记录缺失或覆盖不足时明确说明范围", () => {
  const missing = get(M.build({ ...fixture, assignments: null }, { recent }), "changes").blocks.find(b => b.title === "防守成功");
  assert.match(missing.lines[0].text, /暂不可用/);
  const history = { ...victoryHistory([]), defenseStartedAt: recordTime(3) };
  const partial = get(M.build({ ...fixture, assignments: null, ownership_history: history }, { recent }), "changes").blocks.find(b => b.title === "防守成功");
  assert.match(partial.meta, /覆盖约 3.0 小时/);
});
test("页面脚本与同源资源真实存在，不使用本地战报接口", () => {
  const html = fs.readFileSync(path.join(root, "HD2-Report/index.html"), "utf8");
  for (const [, src] of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))(?:\?[^"]*)?"/g)) assert.ok(fs.existsSync(path.resolve(root, "HD2-Report", src)), src);
  const app = fs.readFileSync(path.join(root, "HD2-Report/report.js"), "utf8");
  assert.doesNotMatch(html + app, /\/api\/report|127\.0\.0\.1|[A-Z]:\\/);
  new Function(app); new Function(fs.readFileSync(path.join(root, "HD2-Report/report-model.js"), "utf8"));
});
console.log(`站点战报：${checks} 项通过`);
