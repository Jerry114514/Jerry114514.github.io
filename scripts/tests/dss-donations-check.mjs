import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const window = {};
new Function('window', fs.readFileSync(path.join(root, 'HD2-Galatic_war-Map/js/dss-donations.js'), 'utf8'))(window);
const D = window.HD2DssDonations;
const action = {cost: [{itemMixId: 3992382197, current: 38824.844, target: 86400,
  maxDonation: 75, maxDonationPeriodSec: 86400}]};
assert.equal(D.progress(action).toFixed(1), '44.9');
assert.equal(D.resourceLines(action)[0], '每人每 24 小时最多捐赠 75 普通样本');
assert.equal(D.progress({cost: [{current: 0, target: 86400}]}), 0);
assert.equal(D.progress({cost: [{current: null, target: 86400}]}), null);
assert.equal(D.progress({cost: [{current: 1, target: 0}]}), null);
assert.equal(D.progress({cost: [{current: 1, target: Infinity}]}), null);
assert.equal(D.progress({cost: [{current: 99999, target: 86400}]}), 100);
assert.equal(D.progress({cost: [{current: -2, target: 86400}]}), 0);
assert.deepEqual(D.resourceLines({cost: [{itemMixId: 123}]}), ['捐赠资源待确认']);
assert.deepEqual(D.resourceLines({cost: [{itemMixId: 2985106497}]}), ['捐赠资源：稀有样本']);
assert.equal(D.resourceLines({cost: [{itemMixId: 3608481516, maxDonation: 50000, maxDonationPeriodSec: 86400}]})[0],
  '每人每 24 小时最多捐赠 50,000 申购点');
assert.equal(D.snapshotLabel({donationUpdatedAtMs: null, clientTimeMs: Date.now()}), '捐赠数据时间未知');
assert.match(D.snapshotLabel({donationUpdatedAtMs: 1791939379657, clientTimeMs: Date.now(), donationSource: 'snapshot'}), /上次成功快照/);
assert.equal(D.snapshotLabel({}), '捐赠数据时间未知');
const variables = JSON.parse(fs.readFileSync(path.join(root, 'HD2-Galatic_war-Map/tables/hd2_variables.json'), 'utf8'));
const entries = variables.categories.find(cat => cat.key === 'tactical_action').entries;
const gas = { ...action, id32: 4091660627, name: 'EAGLE STORM', status: 1, effectIds: [1425, 1212, 1216] };
const runtime = D.actionEntries([gas,
  {id32:3248573007, status:2, effectIds:[1210,1213,1215]},
  {id32:3578080409, status:3, effectIds:[1237,1214]},
  {status:0, effectIds:[1209,1212,1216]}], entries);
assert.equal(runtime.length, 3);
assert.equal(runtime[0].entry.cn, '✈ 飞鹰毒气风暴');
assert.ok(runtime[0].entry.desc.includes('毒气打击'));
assert.equal(D.progress(runtime[0].action).toFixed(1), '44.9');
assert.equal(D.actionEntries([{...gas, cost:[{current:30240,target:86400}]}], entries)[0].action.cost[0].current / 86400 * 100, 35);
assert.ok(!runtime.some(row => /飞鹰封锁|星球轰炸/.test(row.entry.cn)));
assert.equal(D.actionEntries([{...gas, effectIds:[1216,1425,1212]}], entries)[0].entry.cn, '✈ 飞鹰毒气风暴');
assert.equal(D.actionEntries([{...gas, effectIds:[]}], entries)[0].entry.cn, '✈ 飞鹰毒气风暴');
assert.equal(D.actionEntries([{status:1, effectIds:[1209,1212,1216]}], entries)[0].entry.cn, '✈ 飞鹰风暴');
assert.equal(D.actionEntries([{status:1, name:'NEW ACTION', effectIds:[9999]}], entries)[0].entry.cn, 'NEW ACTION');
assert.deepEqual(D.actionEntries([], entries), []);
const main = fs.readFileSync(path.join(root, 'HD2-Galatic_war-Map/index.html'), 'utf8');
const map = fs.readFileSync(path.join(root, 'HD2-Galatic_war-Map/galaxy-map-v2.html'), 'utf8');
for (const html of [main, map]) {
  assert.ok(html.includes('js/dss-donations.js'));
  assert.ok(html.includes('HD2DssDonations.resourceLines'));
  assert.ok(html.includes('HD2DssDonations.snapshotLabel'));
  assert.ok(!html.includes('已捐献 ${'));
}
console.log('DSS progress, resource, quota, old-snapshot and page integration regressions passed.');
