import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const window = {};
new Function('window', fs.readFileSync(path.join(root, 'HD2-Galatic_war-Map/js/mo-equipment.js'), 'utf8'))(window);
const E = window.HD2MoEquipment;

// fixture：当前重要指令 568917260（2026-10-24 官方实测，HD2Web-Trans 解析产物）
const tasks = {
  id32: 568917260,
  source: 'arrowhead_official',
  items: [
    { index: 0, action: '击杀', faction_name: '终结族', goal: 300000000,
      requirement: { type: 'equipment', id: 3827587060, en: 'HMG EMPLACEMENT',
                     name: '重机枪部署支架', name_source: 'site_terms(short_form)' } },
    { index: 1, action: '击杀', faction_name: '光能者', goal: 65000000,
      requirement: { type: 'equipment', id: 376960160, en: 'Anti-Materiel Rifle',
                     name: '反器材步枪', name_source: 'site_terms(prefix_stripped)' } },
    { index: 2, action: '击杀', faction_name: '机器人', goal: 50000000,
      requirement: { type: 'equipment', id: 2197477188, en: 'ORBITAL RAILCANNON STRIKE',
                     name: '轨道炮攻击', name_source: 'site_terms' } },
  ],
};

const names = E.nameById(tasks, tasks.id32);
assert.equal(names['3827587060'].name, '重机枪部署支架');
assert.equal(names['376960160'].name, '反器材步枪');
assert.equal(names['2197477188'].name, '轨道炮攻击');
assert.deepEqual(E.nameById(tasks, 999), {}, '跨指令 tasks 不得参与装备名查找');
assert.equal(E.nameById({ items: tasks.items }, tasks.id32)['3827587060'].name,
  '重机枪部署支架', '缺少 tasks.id32 时保留旧数据兼容');

// 端到端行渲染：三条「使用：……」与游戏一致
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
assert.ok(E.line(3827587060, names, esc).includes('使用：<b>重机枪部署支架</b>'));
assert.ok(E.line(376960160, names, esc).includes('使用：<b>反器材步枪</b>'));
assert.ok(E.line(2197477188, names, esc).includes('使用：<b>轨道炮攻击</b>'));

// 与任务顺序无关：乱序/缺号也能按 ID 命中
assert.ok(E.line(376960160, E.nameById({ items: [...tasks.items].reverse() }), esc)
  .includes('使用：<b>反器材步枪</b>'));

// 无限定装备的任务：不输出该行
assert.equal(E.line(null, names, esc), '');
assert.equal(E.line(undefined, names, esc), '');

// en_fallback：官方中文名暂缺 -> 显示官方英文名并带标注
const enOnly = E.nameById({ items: [{ index: 0, requirement: { type: 'equipment', id: 12345,
  en: 'ORBITAL LASER', name: 'ORBITAL LASER', name_source: 'en_fallback' } }] });
const enLine = E.line(12345, enOnly, esc);
assert.ok(enLine.includes('>ORBITAL LASER</b>'));
assert.ok(enLine.includes('en_fallback'));

// unresolved / 旧数据（没有 tasks）：只显示 raw ID，绝不猜名
const unknown = E.line(999999999, names, esc);
assert.ok(unknown.includes('装备 #999999999'));
assert.ok(unknown.includes('官方名称暂缺'));
assert.ok(!unknown.includes('使用：<b>'));
assert.ok(E.line(3827587060, {}, esc).includes('装备 #3827587060'));
assert.ok(E.line(3827587060, null, esc).includes('装备 #3827587060'));
assert.ok(E.line(3827587060, E.nameById(undefined), esc).includes('装备 #3827587060'));

// HTML 转义：name 中出现敏感字符时被转义
const evil = E.nameById({ items: [{ index: 0, requirement: { id: 1, name: '<script>x</script>',
  name_source: 'site_terms' } }] });
assert.ok(!E.line(1, evil, esc).includes('<script>'));

// index.html 已接线（script 引入 + 调用点）
const html = fs.readFileSync(path.join(root, 'HD2-Galatic_war-Map/index.html'), 'utf8');
assert.ok(html.includes('js/mo-equipment.js'), 'index.html 应引入 mo-equipment.js');
assert.ok(html.includes('HD2MoEquipment.nameById(mo.tasks, mo.id32)'),
  'index.html 应带 MO id 构建装备名查找表');
assert.ok(html.includes('HD2MoEquipment.line(decoded.itemID'), '任务行应输出「使用：」');

// merge_translations.py 已支持 tasks（旧 TransNews 兼容在 python 单测覆盖）
const mergeSrc = fs.readFileSync(path.join(root, 'scripts/merge_translations.py'), 'utf8');
assert.ok(mergeSrc.includes('trans.get("tasks")'), 'merge_translations.py 应合并 tasks');

console.log('mo-equipment-check: all assertions passed');
