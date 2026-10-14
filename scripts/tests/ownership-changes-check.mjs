import assert from "node:assert/strict";
import fs from "node:fs";
const window = {};
new Function("window", fs.readFileSync(new URL("../../HD2-Galatic_war-Map/js/ownership-changes.js", import.meta.url), "utf8"))(window);
const { select } = window.HD2Changes;
const now = Date.parse("2026-10-13T12:00:00Z");
const stamp = hours => new Date(now - hours * 3600000).toISOString();
const event = (planetIndex, fromOwner, toOwner, hours, previousHours = hours + .1) =>
  ({ planetIndex, fromOwner, toOwner, detectedAt: stamp(hours), previousSeenAt: stamp(previousHours) });
const history = { startedAt: stamp(60), updatedAt: stamp(0), events: [
  event(1, "Humans", "Automaton", 25),
  event(2, "Terminids", "Humans", 4),
  event(1, "Automaton", "Humans", 2),
  event(2, "Humans", "Terminids", .5),
  event(3, "Unknown", "Humans", .2),
] };
let count = 0;
function test(name, body) { body(); console.log(`PASS ${name}`); count++; }
test("missing history stays unavailable", () => assert.equal(select(null, 24, now), null));
test("24h filters old events and keeps round trips", () => {
  const view = select(history, 24, now);
  assert.equal(view.changes, 3);
  assert.deepEqual(view.rows.map(row => row.planetIndex), [2, 1]);
  assert.deepEqual(view.rows[0].paths, [["Terminids", "Humans", "Terminids"]]);
});
test("1h shows only transitions inside that window", () => {
  const view = select(history, 1, now);
  assert.deepEqual(view.rows[0].paths, [["Humans", "Terminids"]]);
  assert.equal(view.changes, 1);
});
test("48h includes earlier ownership", () => assert.deepEqual(select(history, 48, now).rows[1].paths, [["Humans", "Automaton", "Humans"]]));
test("empty history reports no changes", () => assert.equal(select({ ...history, events: [] }, 24, now).changes, 0));
test("partial coverage is visible", () => assert.equal(select({ ...history, startedAt: stamp(3) }, 24, now).coverageHours, 3));
test("stale history does not claim complete coverage", () => {
  const view = select({ ...history, updatedAt: stamp(2) }, 24, now);
  assert.equal(view.coverageHours, 22);
  assert.equal(view.stale, true);
});
test("window boundary is inclusive and crossing interval stays uncertain", () => {
  const view = select({ ...history, events: [event(0, "Humans", "Automaton", 1, 2)] }, 1, now);
  assert.equal(view.changes, 1);
  assert.equal(view.rows[0].uncertain, true);
});
test("future observations are excluded", () => assert.equal(select({ ...history, events: [event(0, "Humans", "Automaton", -1)] }, 24, now).changes, 0));
test("gaps do not invent a continuous ownership path", () => {
  const view = select({ ...history, events: [event(0, "Humans", "Automaton", 3), event(0, "Terminids", "Humans", 2)] }, 24, now);
  assert.deepEqual(view.rows[0].paths, [["Humans", "Automaton"], ["Terminids", "Humans"]]);
});
const defense = (planetIndex, hours, attacker = 'Automaton') =>
  ({planetIndex, attacker, eventId: 5717, detectedAt:stamp(hours), previousSeenAt:stamp(hours + .1)});
test('same-owner defense victory still creates a planet row', () => {
  const view = select({...history, events:[], defenseEvents:[defense(246,.5)]},24,now);
  assert.equal(view.changes,0);
  assert.equal(view.defenses,1);
  assert.equal(view.rows[0].planetIndex,246);
  assert.deepEqual(view.rows[0].paths,[]);
  assert.equal(view.rows[0].victories.length,1);
});
test('ownership and successful defenses share one row without a fake owner arrow', () => {
  const view = select({...history, events:[event(246,'Terminids','Humans',3)],
    defenseEvents:[defense(246,2),defense(246,1,'Illuminate')]},24,now);
  assert.equal(view.rows.length,1);
  assert.deepEqual(view.rows[0].paths,[['Terminids','Humans']]);
  assert.equal(view.defenses,2);
});
test('defense victories obey the selected time window and reject future observations', () => {
  const view = select({...history,events:[],defenseEvents:[defense(246,25),defense(170,.5),defense(171,-1)]},1,now);
  assert.deepEqual(view.rows.map(row=>row.planetIndex),[170]);
});
test('legacy history cannot claim full defense coverage', () => {
  assert.equal(select(history,24,now).defenseCoverageHours,0);
  assert.equal(select(history,24,now).defenseStale,true);
});
test('defense observation coverage and freshness are independent of ownership', () => {
  const view=select({...history,defenseStartedAt:stamp(4),defenseUpdatedAt:stamp(2)},24,now);
  assert.equal(view.defenseCoverageHours,2);
  assert.equal(view.defenseStale,true);
  assert.equal(view.stale,false);
});
console.log(`${count} ownership-change regressions passed`);
