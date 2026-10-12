import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const window = {};
for (const name of ["forecast", "rate-source"]) new Function("window", fs.readFileSync(path.join(root, `HD2-Galatic_war-Map/js/${name}.js`), "utf8"))(window);
const F = window.HD2Forecast, R = window.HD2Recent;
let checks = 0;
function check(name, fn) { fn(); checks++; console.log("PASS " + name); }
const tasks = [{ type: 3, values: [100], valueTypes: [3] }];
const a = { id: 42, tasks, deadline: "2026-10-13T00:00:00Z" };
const now = Date.parse("2026-10-12T00:00:00Z");
const data = { fetchedAt: new Date(now).toISOString(), assignments: a, dispatches: [] };
const frame = { timestampUtc: data.fetchedAt, warTime: 100000, assignments: [{ id32: 42, startTime: 13600, expiresIn: 86400, setting: { tasks } }] };
const w = F.orderWindow(data, [frame]);
check("war clock anchored to UTC, halfway through two-day order", () => assert.equal(w.expected, 50));
check("reject another order ID", () => assert.equal(F.orderWindow(data, [{ ...frame, assignments: [{ ...frame.assignments[0], id32: 41 }] }]), null));
check("reject changed task identity", () => assert.equal(F.orderWindow(data, [{ ...frame, assignments: [{ ...frame.assignments[0], setting: { tasks: [] } }] }]), null));
check("reject another deadline", () => assert.equal(F.orderWindow(data, [{ ...frame, assignments: [{ ...frame.assignments[0], expiresIn: 3600 }] }]), null));
check("victory dispatch is not opening dispatch", () => assert.equal(F.orderWindow({ ...data, dispatches: [{ published: "2026-10-11T00:00:00Z", message: "MAJOR ORDER WON" }] }), null));
check("opening dispatch fallback", () => assert.equal(F.orderWindow({ ...data, dispatches: [{ published: "2026-10-11T00:00:00Z", message: "<i=3>NEW MAJOR ORDER</i>\nTest" }] }).expected, 50));
check("whole-order mean, independent of short cache", () => {
  const f = F.task({ type: 3, current: 40, goal: 100, window: w, recentRate: 10 });
  assert.equal(f.projected, 80); assert.equal(f.win, false); assert.equal(f.etaH, 36); assert.equal(f.recentProjected, 100);
});
check("completed counter does not extrapolate capped frames", () => assert.equal(F.task({ type: 3, current: 100, goal: 100, window: w }).state, "complete"));
check("99.6 percent is not completed through display rounding", () => assert.equal(F.task({ type: 3, current: 99.6, goal: 100, window: w }).state, "active"));
check("hold is not permanent completion", () => assert.deepEqual(F.task({ type: 13, current: 1, goal: 1, window: w }), { state: "hold", satisfied: true, expired: false }));
check("unknown current is not zero", () => assert.equal(F.task({ type: 3, current: null, goal: 100, window: w }).state, "unknown"));
check("expired order cannot gain future progress", () => assert.equal(F.task({ type: 3, current: 40, goal: 100, window: { ...w, now: w.end + 3600000 } }).projected, 40));
const camp = { defendersProgress: 40, attackersProgress: 50, attackersRate: 5, remainingTime: 36000 };
check("defense average: needs 15h, only 10h left", () => {
  const f = F.defense(camp); assert.equal(f.rate, 4); assert.equal(f.expected, 50); assert.equal(f.projected, 80); assert.equal(f.win, false);
});
check("measured rate overrides historical average", () => assert.equal(F.defense({ ...camp, defendersRate: 8 }).win, true));
check("measured zero is stall", () => { const f = F.defense({ ...camp, defendersRate: 0 }); assert.equal(f.rate, 0); assert.equal(f.projected, 40); assert.equal(f.win, false); });
check("missing observation stays unknown", () => assert.equal(F.defense({ ...camp, remainingTime: null }).win, null));
check("missing elapsed time stays unknown", () => assert.equal(F.defense({ ...camp, attackersProgress: 0 }).win, null));
check("defense completed and expired boundaries", () => { assert.equal(F.defense({ ...camp, defendersProgress: 100, remainingTime: 0 }).win, true); assert.equal(F.defense({ ...camp, remainingTime: 0 }).win, false); });
check("fractional progress capped at 100", () => assert.equal(F.defense({ ...camp, defendersRate: 100 }).projected, 100));
const mf = (hoursAgo, id, progress, startTime = 13600) => ({ id, tasks, title: "MAJOR ORDER", timestampUtc: new Date(now - hoursAgo * 3600000).toISOString(), progress: [progress], startTime });
R._state.mo = [mf(2, 41, 1000), mf(1, 42, 20), mf(0, 42, 30), mf(-1, 42, 100)];
check("MO rates exclude old order and future frame", () => assert.equal(R.moWindows(a, now).h1.rates[0], 10));
check("stale cache does not explain fresh snapshot", () => assert.equal(R.moWindows(a, now + 10800000), null));
R._state.mo = [mf(1, 42, 90), mf(0, 42, 10)];
check("counter reset has unknown rate", () => assert.equal(R.moWindows(a, now).h1.rates[0], null));
R._state.mo = [mf(1, 42, 20, 10), mf(0, 42, 30, 20)];
check("same ID with changed start is not same rate window", () => assert.equal(R.moWindows(a, now), null));
check("raw assignment frame getter is exported", () => assert.deepEqual(R.assignmentFrames(), []));
check("discrete defense objective is not a linear counter", () => assert.equal(F.task({ type: 12, current: 0, goal: 1, window: w }).state, "stateful"));
check("absent defense progress has unknown result and ETA", () => { const f = F.defense({ ...camp, defendersProgress: null }); assert.equal(f.win, null); assert.equal(f.etaH, null); });
check("hold can lose its satisfied state", () => assert.equal(F.task({ type: 13, current: 0, goal: 1, window: w }).satisfied, false));
const realFetch = globalThis.fetch;
try {
  globalThis.fetch = async url => ({ ok: true, json: async () => url.endsWith("index.json") ? { planets: [], windowHours: 1 }
    : url.endsWith("planet_regions.json") ? { data: [{ timestampUtc: data.fetchedAt, planetRegions: [{ planetIndex: 228, regionIndex: 0, health: 1 }] }] }
    : { data: [frame] } });
  await R.load(); await R.load();
  check("reloading replaces region frames instead of duplicating them", () => assert.equal(R._state.regions["228:0"].length, 1));
  check("load exposes raw assignment frames", () => assert.deepEqual(R.assignmentFrames(), [frame]));
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ generatedAt: new Date(Date.now() - 4 * 3600000).toISOString(), planets: [] }) });
  const loadedStale = await R.load();
  check("three-hour upstream freshness guard is preserved", () => { assert.equal(loadedStale, false); assert.equal(R._state.index, null); assert.deepEqual(R.assignmentFrames(), []); });
  globalThis.fetch = async () => ({ ok: false });
  await R.load();
  check("failed reload clears stale order/region cache", () => { assert.equal(R._state.mo, null); assert.equal(Object.keys(R._state.regions).length, 0); });
} finally { globalThis.fetch = realFetch; }
check("type 11 liberation retains timeline and deadline forecast", () => {
  const f = F.task({ type: 11, current: 37, goal: 100, window: w });
  assert.equal(f.expected, 50); assert.equal(f.projected, 74); assert.equal(f.win, false);
});
check("type 15 net liberation retains timeline and deadline forecast", () => {
  const f = F.task({ type: 15, current: 3, goal: 10, window: w });
  assert.equal(f.expected, 50); assert.equal(f.projected, 60);
});
check("type 15 recent losses are not clamped to a false stall", () => {
  const f = F.task({ type: 15, current: 3, goal: 10, window: w, recentRate: -.05 });
  assert.equal(f.recentProjected, 18);
});
check("negative net count cannot produce a positive completion ETA", () => {
  const f = F.task({ type: 15, current: -3, goal: 10, window: w });
  assert.equal(f.projected, 0); assert.equal(f.etaH, null); assert.equal(f.win, false);
});
check("net task recent rate can be negative while kill counter resets stay unknown", () => {
  const netTasks = [{ type: 15, values: [10], valueTypes: [3] }];
  R._state.mo = [mf(1, 42, 5), mf(0, 42, 3)].map(f => ({ ...f, tasks: netTasks }));
  assert.equal(R.moWindows({ id: 42, tasks: netTasks }, now).h1.rates[0], -2);
});
check("type 11 raw ownership flags cannot masquerade as percent per hour", () => {
  const flags = [{ type: 11, values: [1, 228], valueTypes: [11, 12] }];
  R._state.mo = [mf(1, 42, 0), mf(0, 42, 1)].map(f => ({ ...f, tasks: flags }));
  assert.equal(R.moWindows({ id: 42, tasks: flags }, now).h1.rates[0], null);
});
check("missing forecast script does not throw from rate source", () => {
  delete window.HD2Forecast;
  assert.equal(R.moWindows(a, now), null);
  window.HD2Forecast = F;
});
// Parse the actual page scripts as part of the portable CI regression.
for (const page of ["index.html", "planet.html", "galaxy-map-v2.html"]) {
  check("inline scripts parse: " + page, () => {
    const html = fs.readFileSync(path.join(root, "HD2-Galatic_war-Map", page), "utf8");
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/src=|application\/ld\+json/i.test(match[1])) continue;
      new Function(match[2]);
    }
  });
}
console.log(`${checks} regression cases passed.`);
