import assert from "node:assert/strict";
import fs from "node:fs";
const window = {};
new Function("window", fs.readFileSync(new URL("../../HD2-Galatic_war-Map/js/forecast.js", import.meta.url), "utf8"))(window);
const F = window.HD2Forecast;
// 100 online * 1 impact * 90 K / 9000 HP = 1%/h per percentage point of online share.
const data = { player_distribution: { total: 100 }, impactMultiplier: 1,
  planet_events: [{ planetIndex: 1, eventType: 1, maxHealth: 9000 }] };
const planet = { index: 1, players: 10, currentOwner: "Terminids", maxHealth: 9000, health: 9000, resistance: 12 };
const camp = { type: "defense", defendersProgress: 40, remainingTime: 36000 };
let count = 0;
function test(name, body) { body(); count++; console.log(`PASS ${name}`); }
test("liberation threshold offsets resistance in share units", () => {
  const r = F.reinforcement(data, planet);
  assert.equal(r.currentShare, 10); assert.equal(r.requiredShare, 12);
  assert.equal(r.gap, 2); assert.equal(r.sufficient, false); assert.equal(r.strict, true);
});
test("equaling regeneration stalls rather than wins", () => assert.equal(F.reinforcement(data, { ...planet, players: 12 }).sufficient, false));
test("above regeneration can sustain liberation", () => assert.equal(F.reinforcement(data, { ...planet, players: 13 }).sufficient, true));
test("defense derives required rate from progress and time remaining", () => {
  const r = F.reinforcement(data, planet, camp);
  assert.equal(r.requiredShare, 6); assert.equal(r.sufficient, true); assert.equal(r.strict, false);
});
test("defense uses event health rather than planet health", () => assert.equal(F.reinforcement(data, { ...planet, maxHealth: 900000 }, camp).requiredShare, 6));
test("same allocation and impact budget stay invariant across online populations", () => {
  const scaled = { ...data, player_distribution: { total: 1000 }, impactMultiplier: .1 };
  assert.deepEqual(F.reinforcement(scaled, { ...planet, players: 100 }, camp), F.reinforcement(data, planet, camp));
});
test("zero local players can still receive a modeled threshold", () => {
  const r = F.reinforcement(data, { ...planet, players: 0 }, camp);
  assert.equal(r.currentShare, 0); assert.equal(r.requiredShare, 6); assert.equal(r.gap, 6);
});
test("missing online total or impact does not invent a threshold", () => {
  assert.equal(F.reinforcement({ ...data, player_distribution: null }, planet).state, "unknown");
  assert.equal(F.reinforcement({ ...data, impactMultiplier: null }, planet).state, "unknown");
});
test("missing defense pool never falls back to planet HP", () => assert.equal(F.reinforcement({ ...data, planet_events: [] }, planet, camp).state, "unknown"));
test("missing defense progress or deadline stays unknown", () => {
  assert.equal(F.reinforcement(data, planet, { ...camp, defendersProgress: null }).state, "unknown");
  assert.equal(F.reinforcement(data, planet, { ...camp, remainingTime: null }).state, "unknown");
});
test("requirements above all online players remain impossible rather than capped", () => {
  const r = F.reinforcement(data, planet, { ...camp, remainingTime: 1800 });
  assert.equal(r.state, "impossible"); assert.equal(r.requiredShare, 120);
});
test("100 percent liberation threshold is impossible when equality only stalls", () => assert.equal(F.reinforcement(data, { ...planet, resistance: 100 }).state, "impossible"));
test("completed and expired campaigns no longer ask for reinforcements", () => {
  assert.equal(F.reinforcementHtml(data, planet, { ...camp, defendersProgress: 100 }), "");
  assert.equal(F.reinforcementHtml(data, planet, { ...camp, remainingTime: 0 }), "");
  assert.equal(F.reinforcementHtml(data, { ...planet, currentOwner: "Humans" }), "");
});
test("displayed threshold rounds upward instead of promising too little", () => {
  const html = F.reinforcementHtml(data, { ...planet, resistance: 12.001 });
  assert(html.includes("&gt;12.01%")); assert(html.includes("还差约 2.01 个百分点"));
});
test("unknown estimate retains known current online share", () => assert(F.reinforcementHtml({ ...data, impactMultiplier: 0 }, planet).includes("数据不足 · 当前 10.00%")));
test("shared defense rendering includes allocation requirement", () => {
  const html = F.defenseHtml(camp, data, planet);
  assert(html.includes("守住需 <b>≥6.00%</b> 在线兵力"));
  assert(html.includes("当前 10.00%")); assert(html.includes("推演"));
});
test("recent measured defense efficiency is shared with the victory forecast", () => {
  const measured = { ...camp, defendersRate: 4 };
  const r = F.reinforcement(data, planet, measured);
  assert.equal(r.requiredShare, 15); assert.equal(r.source, "实测");
  assert.equal(r.sufficient, F.defense(measured).win);
});
test("measured stall or loss never falls back to a fictional positive efficiency", () => {
  for (const defendersRate of [0, -1])
    assert.equal(F.reinforcement(data, planet, { ...camp, defendersRate }).state, "unknown");
});
test("measured percent-rate needs no guessed event HP or impact multiplier", () => {
  const r = F.reinforcement({ ...data, impactMultiplier: null, planet_events: [] }, planet, { ...camp, defendersRate: 4 });
  assert.equal(r.requiredShare, 15); assert.equal(r.source, "实测");
});
console.log(`${count} reinforcement-share regressions passed`);
