'use strict';

// Run from any directory: node --test /absolute/path/to/this/file.cjs
// Only public DOM events enter app.js; its IIFE and private functions stay intact.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const web = path.resolve(__dirname, '..');
const root = path.resolve(web, '..');
const sources = Object.fromEntries(['index.html', 'ballistics.js', 'trajectory3d.js', 'app.js'].map((name) =>
  [name, fs.readFileSync(path.join(web, name), 'utf8')]));
const equipmentCatalogText = fs.readFileSync(path.join(web, 'data', 'equipment_catalog.json'), 'utf8');
// 游戏数据文件（data/generated_*.json）只存在于本地工作区，不随站点部署。
// 缺失时依赖真实数据的用例整组 skip，纯 DOM/物理用例照常在 CI 运行（2026-10-24 审查 P2）。
const dataDir = path.join(root, 'data');
const gameDataFiles = ['generated_projectile_settings.json', 'generated_damage_settings.json'];
const hasGameData = gameDataFiles.every((name) => fs.existsSync(path.join(dataDir, name)));
const rawProjectile = hasGameData ? fs.readFileSync(path.join(dataDir, 'generated_projectile_settings.json'), 'utf8') : '[]';
const rawDamage = hasGameData ? fs.readFileSync(path.join(dataDir, 'generated_damage_settings.json'), 'utf8') : '[]';
const projectileData = JSON.parse(rawProjectile);
const damageData = JSON.parse(rawDamage);
const projectileItems = projectileData.flatMap((item) => item.ProjectileSettings?.items ?? []);
const damageItems = damageData.flatMap((item) => item.DamageSettings?.items ?? []);
const idOf = (record) => Number(record.type.split(' <=> ')[0]);
const projectile = (id) => projectileItems.find((record) => idOf(record) === id);
const damage = (id) => damageItems.find((record) => idOf(record) === id);
const copy = (value) => JSON.parse(JSON.stringify(value));
const projectileJSON = (...items) => [{ ProjectileSettings: { items, _metadata: {} } }];
const damageJSON = (...items) => [{ DamageSettings: { items } }];
const file = (name, text) => ({ name, async text() { return text; } });
const jsonFile = (name, data) => file(name, JSON.stringify(data));
const realProjectile = () => file('generated_projectile_settings.json', rawProjectile);
const realDamage = () => file('generated_damage_settings.json', rawDamage);
const SKIP_NO_GAME_DATA = '本地缺少 data/generated_projectile_settings.json / generated_damage_settings.json（游戏数据不随站点部署）';
const dataTest = (name, fn) => test(name, { skip: hasGameData ? false : SKIP_NO_GAME_DATA }, fn);

class DOMEvent {
  constructor(type, properties = {}) {
    this.type = type;
    Object.assign(this, properties);
  }
}

class Element {
  constructor(tagName, attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.id = attributes.id ?? '';
    this.dataset = Object.fromEntries(Object.entries(attributes)
      .filter(([key]) => key.startsWith('data-'))
      .map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
    this.value = attributes.value ?? '';
    this.checked = 'checked' in attributes;
    this.disabled = 'disabled' in attributes;
    this.files = [];
    this.style = {};
    this.validity = { badInput: false };
    // hidden/open 遵循真实 DOM 语义：由 attributes 决定初始值（details/preset 面板依赖）
    this.hidden = 'hidden' in attributes;
    this.open = 'open' in attributes;
    this.className = attributes.class ?? '';
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this._text = '';
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      toggle: (name, force) => {
        const classes = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name); else classes.delete(name);
        this.className = [...classes].join(' ');
        return enabled;
      },
      add: (name) => this.classList.toggle(name, true),
      remove: (name) => this.classList.toggle(name, false),
    };
  }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  set innerHTML(value) { this._html = String(value); this._text = ''; this.children = []; }
  get innerHTML() { return this._html ?? ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  prepend(child) { child.parentElement = this; this.children.unshift(child); }
  replaceChildren(...children) {
    this._text = ''; this._html = '';
    this.children.forEach((child) => { child.parentElement = null; });
    this.children = [];
    this.append(...children);
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  querySelectorAll(selector) {
    const tags = selector.split(',').map((tag) => tag.toUpperCase());
    return this.children.flatMap((child) => [
      ...(tags.includes(child.tagName) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener));
  }
  focus() {}
  dispatchEvent(event) {
    assert.ok(event instanceof DOMEvent, 'dispatchEvent must receive a DOM Event, not a plain object');
    event.target = this;
    for (const listener of this.listeners.get(event.type) ?? []) {
      // Deliberately do not await event listeners, just as in the browser.
      const result = listener.call(this, event);
      if (result?.then) result.catch((error) => this.errors.push(error));
    }
    return true;
  }
  click() { if (!this.disabled) this.dispatchEvent(new DOMEvent('click')); }
}

const inheritanceFields = ['shooterSpeed', 'shooterAzimuthDeg', 'shooterElevationDeg'];
const directionIds = ['shooter-forward', 'shooter-forward-right', 'shooter-right', 'shooter-backward-right',
  'shooter-backward', 'shooter-backward-left', 'shooter-left', 'shooter-forward-left'];

function harness({ viewer = true, catalogText = null } = {}) {
  const catalogFetch = (url) => Promise.resolve({
    ok: catalogText != null, status: catalogText != null ? 200 : 404,
    text: async () => (catalogText != null ? catalogText : ''),
  });
  const nodes = [];
  const errors = [];
  // Read IDs, input defaults, mode buttons, and translated labels from the real HTML.
  for (const match of sources['index.html'].matchAll(/<([a-z][\w-]*)\b([^<>]*)>/gi)) {
    const attributes = {};
    for (const attr of match[2].matchAll(/([\w-]+)(?:\s*=\s*"([^"]*)")?/g)) {
      attributes[attr[1]] = attr[2] ?? '';
    }
    const node = new Element(match[1], attributes);
    node.errors = errors;
    nodes.push(node);
  }
  const byId = new Map(nodes.filter((node) => node.id).map((node) => [node.id, node]));
  const get = (id) => {
    assert.ok(byId.has(id), `Unknown element #${id}; keep the DOM stub aligned with index.html`);
    return byId.get(id);
  };
  const document = {
    documentElement: nodes.find((node) => node.tagName === 'HTML'),
    getElementById: get,
    createElement: (tag) => new Element(tag),
    querySelectorAll(selector) {
      assert.ok(['[data-i18n]', '[data-mode]', '[data-shooter-azimuth]'].includes(selector), `Unsupported selector ${selector}`);
      return nodes.filter((node) => selector.slice(1, -1) in node.attributes);
    },
    querySelector(selector) {
      assert.equal(selector, '[role="tablist"]');
      return nodes.find((node) => node.getAttribute('role') === 'tablist');
    },
  };
  const charts = [];
  class Chart {
    constructor(canvas, config) { this.canvas = canvas; this.config = config; this.destroyed = false; this.destroyCalls = 0; charts.push(this); }
    destroy() { this.destroyed = true; this.destroyCalls++; }
  }
  const viewers = [];
  // Capture the public integration contract without loading Three.js or WebGL.
  class HD2Trajectory3D {
    constructor(host, config) {
      this.host = host;
      this.config = config;
      this.destroyed = false;
      this.destroyCalls = 0;
      host.append(new Element('canvas'));
      viewers.push(this);
    }
    destroy() { this.destroyed = true; this.destroyCalls++; }
  }
  const timers = [];
  const storage = new Map();
  const context = vm.createContext({
    document, Chart, Event: DOMEvent,
    console: { error: (...args) => errors.push(...args), warn: () => {} },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    fetch: catalogFetch,
  });
  context.window = context;
  if (viewer) context.HD2Trajectory3D = HD2Trajectory3D;
  for (const name of ['ballistics.js', 'app.js']) {
    vm.runInContext(sources[name], context, { filename: path.join(web, name) });
  }
  return {
    get, charts, viewers, storage,
    message: (family) => get(`${family}-status`).textContent,
    check(id, checked) {
      get(id).checked = checked;
      get(id).dispatchEvent(new DOMEvent('change'));
    },
    setMovement(speed, azimuth, elevation) {
      for (const [index, value] of [speed, azimuth, elevation].entries()) this.input(inheritanceFields[index], value);
    },
    input(id, value, badInput = false) {
      const node = get(id);
      node.value = String(value);
      node.validity = { badInput };
      node.dispatchEvent(new DOMEvent('input'));
    },
    damages: () => ['normalDamage', 'durableDamage'].map((id) => Number(get(id).value)),
    setDamage(normal = 777, durable = 88) {
      get('normalDamage').value = String(normal);
      get('durableDamage').value = String(durable);
    },
    choose(family, selectedFile) {
      const input = get(`${family}-file`);
      input.files = selectedFile ? [selectedFile] : [];
      input.dispatchEvent(new DOMEvent('change'));
    },
    async load(family, selectedFile) { this.choose(family, selectedFile); await this.flush(); },
    import(id, enter = false) {
      get('projectile-type').value = String(id);
      if (enter) get('projectile-type').dispatchEvent(new DOMEvent('keydown', { key: 'Enter' }));
      else get('import-projectile').click();
    },
    toggleLocale() { get('locale-toggle').click(); },
    run(mode = 'traj', { error = false } = {}) {
      assert.deepEqual(errors, []);
      if (get(`tab-${mode}`).getAttribute('aria-selected') !== 'true') get(`tab-${mode}`).click();
      get('run').click();
      assert.equal(get('run').disabled, true);
      while (timers.length) timers.shift()();
      assert.equal(get('run').disabled, false);
      assert.equal(get('status').dataset.state, error ? 'error' : 'done', get('status').textContent);
      if (error) {
        assert.equal(errors.length, 1, 'An invalid run must log exactly its calculation error');
        assert.equal(typeof errors[0]?.message, 'string');
        errors.length = 0;
      } else assert.deepEqual(errors, []);
    },
    async flush() { await new Promise(setImmediate); assert.deepEqual(errors, []); },
  };
}

async function loaded() {
  const h = harness();
  await h.load('projectile', realProjectile());
  await h.load('damage', realDamage());
  return h;
}

function assertBallistics(h, record) {
  const fields = { caliberMm: 'calibre', massG: 'mass', vConfig: 'speed', dragCoeff: 'drag', gravityMultiplier: 'gravity_multiplier', lifeTime: 'life_time' };
  for (const [field, key] of Object.entries(fields)) assert.equal(Number(h.get(field).value), record[key], field);
  assert.equal(h.get('ignoreTerminalVelocity').checked, record.projectile_flags_1_detail.ignore_terminal_velocity === 1);
  const inherit = record.projectile_flags_1_detail.inherit_velocity === 1;
  assert.equal(h.get('inheritVelocity').checked, inherit);
  for (const id of [...inheritanceFields, ...directionIds]) assert.equal(h.get(id).disabled, !inherit, id);
}

function snapshot(h) {
  return Object.fromEntries(['caliberMm', 'massG', 'vConfig', 'dragCoeff', 'gravityMultiplier', 'lifeTime', 'normalDamage', 'durableDamage', 'stepHz', 'totalTime', ...inheritanceFields]
    .map((id) => [id, h.get(id).value]).concat([
      ['ignoreTerminalVelocity', h.get('ignoreTerminalVelocity').checked],
      ['inheritVelocity', h.get('inheritVelocity').checked],
      ...[...inheritanceFields, ...directionIds].map((id) => [`${id}.disabled`, h.get(id).disabled]),
    ]));
}

function deferredFile(name) {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { file: { name, text: () => promise }, resolve, reject };
}

// 2026-10-24 审查 P1 回归（纯 DOM，不依赖游戏 JSON）：非法物理参数（如 massG=0）
// 必须以计算错误呈现，而不是静默产出 NaN/Infinity 伪结果（旧表现：状态“完成”、表格满屏 —）。
test('invalid physics parameters surface a calculation error instead of NaN pseudo results', () => {
  const h = harness();
  h.setDamage(90, 0);
  h.input('massG', 0);
  h.run('traj', { error: true });
  assert.match(h.get('status').textContent, /massG/);
  h.input('massG', 8);
  h.run('traj');
  assert.ok(h.get('status').dataset.state === 'done', '修正参数后同一会话应正常完成');
});

// 2026-10-24 复审 P2：英文 locale 下参数错误必须是英文（结构化 {code, field} 按 locale 渲染）
test('physics parameter errors are localized in the English locale', () => {
  const h = harness();
  h.toggleLocale();
  h.setDamage(90, 0);
  h.input('massG', 0);
  h.run('traj', { error: true });
  assert.match(h.get('status').textContent, /massG must be a finite positive number/);
  // 同一英文会话下的扫描预算错误
  h.input('massG', 8);
  h.input('angleStepDeg', 1e-9);
  h.run('aim', { error: true });
  assert.match(h.get('status').textContent, /Elevation sweep sample count too large/);
  // 切回中文：同一 lastError 重新渲染为中文
  h.toggleLocale();
  assert.match(h.get('status').textContent, /仰角采样数过大/);
});

// These assertions also pin the real dataset assumptions used by the regressions.
dataTest('real fixtures: record counts, target mappings, and six missing type-0 references', () => {
  assert.equal(projectileItems.length, 355);
  assert.equal(damageItems.length, 661);
  assert.equal(projectile(291).damage_info_type, '244 <=> DamageInfoType_Unknown_244');
  assert.equal(projectile(131).damage_info_type, '70 <=> DamageInfoType_Unknown_70');
  assert.deepEqual(damage(244).damage, [1500, 1500]);
  assert.deepEqual(damage(70).damage, [200, 100]);
  assert.equal(damage(0), undefined);
  assert.deepEqual(projectileItems.filter((p) => p.damage_info_type === '0 <=> DamageInfoType_Unknown_0').map(idOf).sort((a, b) => a - b), [18, 56, 170, 226, 323, 329]);
});

for (const order of ['projectile-first', 'damage-first']) {
  dataTest(`real files, ${order}: 291 -> 244, 131 -> 70, metadata, button and Enter`, async () => {
    const h = harness();
    h.setDamage();
    if (order === 'projectile-first') {
      await h.load('projectile', realProjectile());
      assert.match(h.message('import'), /355/);
      h.import(291);
      assert.deepEqual(h.damages(), [777, 88]);
      assert.match(h.message('damage'), /未加载伤害 JSON/);
      await h.load('damage', realDamage()); // Auto-link the already imported projectile.
    } else {
      await h.load('damage', realDamage());
      assert.match(h.message('damage'), /661/);
      await h.load('projectile', realProjectile());
      h.import(291);
    }
    assertBallistics(h, projectile(291));
    assert.deepEqual(h.damages(), [1500, 1500]);
    assert.match(h.message('damage'), /type 244.*1500.*1500/);
    assert.match(h.message('import'), /已导入 type 291/);
    assert.match(h.message('import'), /1\.007\.200.*2026-10-20/);
    assert.match(h.message('import'), /simulation_steps 未导入/);
    assert.equal(h.get('stepHz').value, '60');
    assert.equal(h.get('totalTime').value, '5');
    h.import(131, true);
    assertBallistics(h, projectile(131));
    assert.deepEqual(h.damages(), [200, 100]);
    assert.match(h.message('damage'), /type 70.*200.*100/);
  });
}

for (const [id, expected] of [[91, [0, 0]], [163, [5, 0]]]) {
  dataTest(`real projectile ${id}: zero damage components import successfully`, async () => {
    const h = await loaded();
    h.setDamage();
    h.import(id);
    assert.deepEqual(h.damages(), expected);
    assert.equal(h.get('damage-status').classList.contains('ok'), true);
  });
}

dataTest('all six real projectile references to absent damage type 0 preserve current damage and report it', async () => {
  const h = await loaded();
  const references = projectileItems.filter((p) => p.damage_info_type === '0 <=> DamageInfoType_Unknown_0');
  assert.equal(references.length, 6);
  for (const [index, record] of references.entries()) {
    h.setDamage(700 + index, 80 + index);
    h.import(idOf(record));
    assertBallistics(h, record);
    assert.deepEqual(h.damages(), [700 + index, 80 + index]);
    assert.match(h.message('import'), new RegExp(`已导入 type ${idOf(record)}`));
    assert.match(h.message('damage'), /找不到 type 0.*保留当前普通／耐久伤害/);
    assert.equal(h.get('damage-status').classList.contains('error'), true);
  }
});

for (const family of ['projectile', 'damage']) {
  dataTest(`${family}: duplicate type across separate roots is rejected without changing inputs`, async () => {
    const h = await loaded();
    h.import(131);
    const before = snapshot(h);
    const record = copy(family === 'projectile' ? projectile(291) : damage(244));
    const make = family === 'projectile' ? projectileJSON : damageJSON;
    await h.load(family, jsonFile('duplicates.json', [...make(record), ...make(copy(record))]));
    h.import(291);
    assert.match(h.message(family === 'projectile' ? 'import' : 'damage'), /多条 type (291|244)/);
    if (family === 'projectile') assert.deepEqual(snapshot(h), before);
    else assert.deepEqual(h.damages(), [200, 100]);
  });
}

const invalidDamage = [
  ['missing', undefined], ['null', null], ['object', {}], ['string', '1500,1500'],
  ['empty', []], ['one component', [1500]], ['negative normal', [-1, 2]],
  ['negative durable', [20, -1]], ['string normal', ['20', 2]], ['string durable', [20, '2']],
  ['null normal', [null, 2]], ['null durable', [20, null]],
  ['boolean normal', [false, 2]], ['boolean durable', [20, true]],
  ['nested array', [[20], 2]], ['object component', [20, {}]],
];
for (const [label, values] of invalidDamage) {
  dataTest(`invalid damage array (${label}) preserves both current damage fields`, async () => {
    const h = await loaded();
    h.import(291);
    h.setDamage();
    const record = { ...damage(244), damage: values };
    await h.load('damage', jsonFile('invalid-damage.json', damageJSON(record)));
    assert.deepEqual(h.damages(), [777, 88]);
    assert.match(h.message('damage'), /type 244 的 damage 数组无效.*保留当前伤害/);
  });
}
for (const values of ['[1e400,2]', '[20,1e400]']) {
  dataTest(`non-finite JSON damage ${values} is rejected`, async () => {
    const h = await loaded();
    h.import(291);
    h.setDamage();
    const raw = JSON.stringify(damageJSON({ ...damage(244), damage: '__VALUES__' })).replace('"__VALUES__"', values);
    await h.load('damage', file('non-finite.json', raw));
    assert.deepEqual(h.damages(), [777, 88]);
    assert.match(h.message('damage'), /damage 数组无效/);
  });
}

const badStructures = [null, {}, [], [null], [{ OtherSettings: { items: [] } }]];
for (const family of ['projectile', 'damage']) {
  const section = family === 'projectile' ? 'ProjectileSettings' : 'DamageSettings';
  const structures = [...badStructures,
    [{ [section]: {} }], [{ [section]: { items: {} } }], [{ [section]: { items: [] } }],
    [{ [section]: { items: [null, {}, { type: 'wrong' }] } }],
    [{ [section]: { items: [{ type: `244 <=> ${family === 'projectile' ? 'ProjectileType' : 'DamageInfoType'}_Unknown_235` }] } }],
  ];
  for (const [index, structure] of structures.entries()) {
    dataTest(`${family}: invalid structure #${index + 1} reports error and invalidates old file`, async () => {
      const h = await loaded();
      h.import(291);
      const before = snapshot(h);
      await h.load(family, jsonFile('bad-structure.json', structure));
      assert.match(h.message(family === 'projectile' ? 'import' : 'damage'), /文件结构不符合预期/);
      assert.deepEqual(snapshot(h), before);
      h.import(131);
      if (family === 'projectile') {
        assert.match(h.message('import'), /请先选择/);
        assert.deepEqual(snapshot(h), before);
      } else {
        assert.match(h.message('damage'), /未加载伤害 JSON/);
        assert.deepEqual(h.damages(), [1500, 1500]);
      }
    });
  }
  for (const [label, selectedFile] of [
    ['malformed JSON', file('broken.json', '{ broken')],
    ['file read rejection', { name: 'unreadable.json', text: () => Promise.reject(new Error('read failed')) }],
  ]) {
    dataTest(`${family}: ${label} reports error, preserves values, and recovers on valid file`, async () => {
      const h = await loaded();
      h.import(291);
      const before = snapshot(h);
      await h.load(family, selectedFile);
      assert.match(h.message(family === 'projectile' ? 'import' : 'damage'), /无法解析.*JSON/);
      assert.deepEqual(snapshot(h), before);
      assert.equal(h.get('import-projectile').disabled, false);
      await h.load(family, family === 'projectile' ? realProjectile() : realDamage());
      h.import(131);
      assert.deepEqual(h.damages(), [200, 100]);
    });
  }
}

for (const id of ['', '-1', '1.5', '1e2', 'NaN', '9007199254740992', '999999']) {
  dataTest(`invalid or absent projectile type ${JSON.stringify(id)} preserves all inputs`, async () => {
    const h = await loaded();
    h.import(291);
    const before = snapshot(h);
    h.import(id, true);
    assert.match(h.message('import'), id === '999999' ? /找不到 type 999999/ : /非负整数/);
    assert.deepEqual(snapshot(h), before);
  });
}

dataTest('invalid projectile ballistic record and damage reference preserve the appropriate fields', async () => {
  const h = await loaded();
  h.import(131);
  const before = snapshot(h);
  await h.load('projectile', jsonFile('bad-record.json', projectileJSON({ ...projectile(291), speed: 0 })));
  h.import(291);
  assert.match(h.message('import'), /缺少有效的弹道参数/);
  assert.deepEqual(snapshot(h), before);
  for (const reference of [null, 244, '244 <=> DamageInfoType_Unknown_235', 'wrong']) {
    await h.load('projectile', jsonFile('bad-reference.json', projectileJSON({ ...projectile(291), damage_info_type: reference })));
    h.import(291);
    assertBallistics(h, projectile(291));
    assert.deepEqual(h.damages(), [200, 100]);
    assert.match(h.message('damage'), /damage_info_type 无效.*保留当前伤害/);
  }
});

for (const family of ['projectile', 'damage']) {
  for (const staleOutcome of ['valid', 'invalid-json', 'rejected']) {
    dataTest(`${family}: stale ${staleOutcome} completion cannot overwrite newer success`, async () => {
      const h = await loaded();
      h.import(291);
      const old = deferredFile('old.json');
      h.choose(family, old.file);
      assert.match(h.message(family === 'projectile' ? 'import' : 'damage'), /正在读取/);
      if (family === 'projectile') assert.equal(h.get('import-projectile').disabled, true);
      const newerData = family === 'projectile'
        ? projectileJSON({ ...projectile(291), speed: 123 })
        : damageJSON({ ...damage(244), damage: [321, 45] });
      await h.load(family, jsonFile('new.json', newerData));
      h.import(291);
      const before = snapshot(h);
      const messages = [h.message('import'), h.message('damage')];
      if (staleOutcome === 'rejected') old.reject(new Error('late read failure'));
      else old.resolve(staleOutcome === 'invalid-json' ? '{' : family === 'projectile' ? rawProjectile : rawDamage);
      await h.flush();
      assert.deepEqual(snapshot(h), before);
      assert.deepEqual([h.message('import'), h.message('damage')], messages);
      h.import(291);
      if (family === 'projectile') assert.equal(Number(h.get('vConfig').value), 123);
      else assert.deepEqual(h.damages(), [321, 45]);
    });
  }
  dataTest(`${family}: stale completion while newer read is pending cannot change reading state or enable import`, async () => {
    const h = await loaded();
    h.import(291);
    const old = deferredFile('old.json');
    const newer = deferredFile('new.json');
    const before = snapshot(h);
    h.choose(family, old.file);
    h.choose(family, newer.file);
    old.resolve(family === 'projectile' ? rawProjectile : rawDamage);
    await h.flush();
    assert.match(h.message(family === 'projectile' ? 'import' : 'damage'), /正在读取/);
    assert.deepEqual(snapshot(h), before);
    if (family === 'projectile') assert.equal(h.get('import-projectile').disabled, true);
    newer.resolve(family === 'projectile' ? rawProjectile : rawDamage);
    await h.flush();
    h.import(131);
    assert.deepEqual(h.damages(), [200, 100]);
  });
  dataTest(`${family}: newer failed read cannot be replaced by an older successful result`, async () => {
    const h = await loaded();
    h.import(291);
    const old = deferredFile('old-valid.json');
    h.choose(family, old.file);
    await h.load(family, file('new-invalid.json', '{'));
    const before = snapshot(h);
    const statusFamily = family === 'projectile' ? 'import' : 'damage';
    const error = h.message(statusFamily);
    assert.match(error, /无法解析.*JSON/);
    old.resolve(family === 'projectile' ? rawProjectile : rawDamage);
    await h.flush();
    assert.equal(h.message(statusFamily), error);
    assert.deepEqual(snapshot(h), before);
    h.import(131);
    assert.match(h.message(statusFamily), family === 'projectile' ? /请先选择/ : /未加载伤害 JSON/);
    assert.deepEqual(h.damages(), [1500, 1500]);
  });
  dataTest(`${family}: clearing file selection invalidates a pending async read`, async () => {
    const h = await loaded();
    h.import(291);
    const old = deferredFile('old.json');
    h.choose(family, old.file);
    await h.load(family, null);
    const messages = [h.message('import'), h.message('damage')];
    old.resolve(family === 'projectile' ? rawProjectile : rawDamage);
    await h.flush();
    assert.deepEqual([h.message('import'), h.message('damage')], messages);
    h.import(131);
    assert.match(h.message(family === 'projectile' ? 'import' : 'damage'), family === 'projectile' ? /请先选择/ : /未加载伤害 JSON/);
    assert.deepEqual(h.damages(), [1500, 1500]);
  });
}

dataTest('switching projectile file clears previous selection so later damage reload cannot overwrite manual values', async () => {
  const h = await loaded();
  h.import(291);
  h.setDamage();
  await h.load('projectile', realProjectile());
  await h.load('damage', realDamage());
  assert.deepEqual(h.damages(), [777, 88]);
  assert.match(h.message('damage'), /661/);
  h.import(131);
  assert.deepEqual(h.damages(), [200, 100]);
});

dataTest('language toggle translates ready, success, metadata, missing, duplicate, invalid and JSON error messages', async () => {
  const h = harness();
  await h.load('projectile', realProjectile());
  await h.load('damage', realDamage());
  h.toggleLocale();
  assert.match(h.message('import'), /Loaded 355 projectile records/);
  assert.match(h.message('damage'), /Loaded 661 damage records/);
  assert.equal(h.storage.get('hd2-locale'), 'en');
  h.import(291);
  assert.match(h.message('import'), /Imported type 291.*Game version 1\.007\.200.*data date 2026-10-20/);
  assert.match(h.message('import'), /simulation_steps was not imported/);
  assert.match(h.message('damage'), /Linked damage type 244: normal damage 1500, durable damage 1500/);
  h.toggleLocale();
  assert.match(h.message('import'), /已导入 type 291.*游戏版本/);
  assert.match(h.message('damage'), /已关联伤害 type 244/);
  const checks = [
    [async () => h.import(18), /找不到 type 0/, /Damage type 0 was not found/],
    [async () => { await h.load('damage', jsonFile('duplicate.json', damageJSON(damage(244), damage(244)))); h.import(291); }, /多条 type 244/, /Multiple damage records match type 244/],
    [async () => h.load('damage', jsonFile('invalid.json', damageJSON({ ...damage(244), damage: [] }))), /damage 数组无效/, /invalid damage array/],
    [async () => h.load('damage', file('broken.json', '{')), /无法解析伤害 JSON/, /Could not parse the damage JSON/],
    [async () => h.load('damage', jsonFile('structure.json', {})), /文件结构不符合预期/, /Unexpected file structure/],
  ];
  for (const [action, zh, en] of checks) {
    await action();
    assert.match(h.message('damage'), zh);
    const before = snapshot(h);
    h.toggleLocale();
    assert.match(h.message('damage'), en);
    assert.deepEqual(snapshot(h), before);
    h.toggleLocale();
    assert.match(h.message('damage'), zh);
  }
  await h.load('projectile', file('broken.json', '{'));
  h.toggleLocale();
  assert.match(h.message('import'), /Could not parse the JSON file/);
  h.toggleLocale();
  assert.match(h.message('import'), /无法解析 JSON 文件/);
});

dataTest('language toggle during both async reads keeps loading messages translated through completion', async () => {
  const h = harness();
  const p = deferredFile('projectile.json');
  const d = deferredFile('damage.json');
  h.choose('projectile', p.file);
  h.choose('damage', d.file);
  h.toggleLocale();
  assert.match(h.message('import'), /Reading JSON file/);
  assert.match(h.message('damage'), /Reading damage JSON/);
  p.resolve(rawProjectile);
  d.resolve(rawDamage);
  await h.flush();
  assert.match(h.message('import'), /Loaded 355/);
  assert.match(h.message('damage'), /Loaded 661/);
  h.import(131);
  assert.match(h.message('damage'), /Linked damage type 70: normal damage 200, durable damage 100/);
});

test('inheritance controls start disabled and preserve movement values through toggles and locale changes', () => {
  const h = harness();
  assert.equal(h.get('inheritVelocity').checked, false);
  assert.equal(h.get('shooterSpeed').getAttribute('min'), '0');
  assert.deepEqual(inheritanceFields.map((id) => h.get(id).value), ['0', '0', '0']);
  assert.equal(h.get('shooterElevationDeg').getAttribute('min'), '-90');
  assert.equal(h.get('shooterElevationDeg').getAttribute('max'), '90');
  for (const id of [...inheritanceFields, ...directionIds]) assert.equal(h.get(id).disabled, true);
  assert.match(h.get('shooter-velocity-output').textContent, /已关闭/);
  h.check('inheritVelocity', true);
  h.setMovement(12.5, -135, 40);
  for (const id of [...inheritanceFields, ...directionIds]) assert.equal(h.get(id).disabled, false);
  h.check('inheritVelocity', false);
  const before = snapshot(h);
  h.toggleLocale();
  assert.deepEqual(snapshot(h), before);
  assert.match(h.get('shooter-velocity-output').textContent, /inheritance is off/);
  for (const id of [...inheritanceFields, ...directionIds]) assert.equal(h.get(id).disabled, true);
  h.check('inheritVelocity', true);
  assert.deepEqual(inheritanceFields.map((id) => h.get(id).value), ['12.5', '-135', '40']);
  assert.match(h.get('shooter-velocity-output').textContent, /XYZ velocity.*total speed check.*12\.500.*entered total speed 12\.500/);
  for (const id of [...inheritanceFields, ...directionIds]) assert.equal(h.get(id).disabled, false);
});

test('direction arrows have bilingual accessible labels and preserve movement elevation and muzzle aim', () => {
  const h = harness();
  assert.equal((sources['index.html'].match(/data-shooter-azimuth="/g) ?? []).length, 8);
  h.setMovement(20, 17, 30);
  const muzzleAngle = h.get('launchAngleDeg').value;
  h.get('shooter-right').click();
  assert.equal(h.get('shooterAzimuthDeg').value, '17', 'Disabled arrows must not alter stored movement');
  h.check('inheritVelocity', true);
  for (const [index, angle] of [0, 45, 90, 135, 180, -135, -90, -45].entries()) {
    const id = directionIds[index];
    const button = h.get(id);
    assert.match(button.getAttribute('title'), /[前后左右].*\/.*[A-Za-z]/);
    assert.equal(button.getAttribute('aria-label'), button.getAttribute('title'));
    assert.match(sources['index.html'], new RegExp(`id="${id}"[^>]*>[↑↗→↘↓↙←↖]</button>`));
    button.click();
    assert.equal(h.get('shooterAzimuthDeg').value, String(angle));
    assert.equal(h.get('shooterElevationDeg').value, '30');
    assert.equal(h.get('launchAngleDeg').value, muzzleAngle);
    for (const other of directionIds) assert.equal(h.get(other).getAttribute('aria-pressed'), String(other === id));
    assert.match(h.get('shooter-velocity-output').textContent, /总速率核对.*20\.000.*输入总速率 20\.000/);
  }
  h.input('shooterAzimuthDeg', 450);
  assert.equal(h.get('shooter-right').getAttribute('aria-pressed'), 'true');
  assert.match(h.get('shooter-velocity-output').textContent, /\(0\.000, 10\.000, 17\.321\)/);
  h.input('shooterElevationDeg', 90);
  assert.match(h.get('shooter-velocity-output').textContent, /\(0\.000, 20\.000, 0\.000\)/);
  h.input('shooterElevationDeg', -90);
  assert.match(h.get('shooter-velocity-output').textContent, /\(0\.000, -20\.000, 0\.000\)/);
  h.input('shooterAzimuthDeg', 17);
  assert.ok(directionIds.every((id) => h.get(id).getAttribute('aria-pressed') === 'false'));
  assert.equal(h.get('shooter-velocity-output').tagName, 'OUTPUT');
  h.toggleLocale();
  assert.match(h.get('shooter-velocity-output').textContent, /XYZ velocity.*total speed check.*20\.000/);
  h.check('inheritVelocity', false);
  assert.equal(h.get('shooter-velocity-output').classList.contains('error'), false);
  assert.ok(directionIds.every((id) => h.get(id).getAttribute('aria-pressed') === 'false'));
});

dataTest('real inherit_velocity flags import as booleans and retain manually entered movement', async () => {
  const h = await loaded();
  h.setMovement(25, -135, 40);
  for (const flag of [1, 0, 1]) {
    const record = projectileItems.find((entry) => entry.projectile_flags_1_detail?.inherit_velocity === flag
      && entry.calibre > 0 && entry.mass > 0 && entry.speed > 0);
    assert.ok(record, `Real fixture must include inherit_velocity=${flag}`);
    h.import(idOf(record));
    assertBallistics(h, record);
    assert.deepEqual(inheritanceFields.map((id) => h.get(id).value), ['25', '-135', '40']);
  }
});

for (const [label, flag] of [
  ['missing', undefined], ['null', null], ['true', true], ['false', false],
  ['string zero', '0'], ['string one', '1'], ['negative', -1], ['two', 2], ['object', {}],
]) {
  dataTest(`invalid imported inherit_velocity (${label}) preserves every input and linked damage`, async () => {
    const h = await loaded();
    h.import(131);
    h.check('inheritVelocity', true);
    h.setMovement(11, -135, 40);
    const before = snapshot(h);
    const entry = copy(projectile(291));
    entry.projectile_flags_1_detail.inherit_velocity = flag;
    await h.load('projectile', jsonFile('invalid-inheritance.json', projectileJSON(entry)));
    h.import(291);
    assert.match(h.message('import'), /缺少有效的弹道参数/);
    assert.deepEqual(snapshot(h), before);
    h.toggleLocale();
    assert.match(h.message('import'), /missing valid ballistic parameters/);
    assert.deepEqual(snapshot(h), before);
  });
}

const invalidMovement = [
  ['negative speed', [-1, 1, 0]],
  ['non-finite speed', ['1e400', 1, 0]],
  ['NaN speed', ['NaN', 1, 0]],
  ['empty total speed', ['', 1, 0]],
  ['bad total speed input', ['', 1, 0, true]],
  ['non-finite azimuth', [5, '1e400', 0]],
  ['NaN azimuth', [5, 'NaN', 0]],
  ['empty azimuth', [5, '', 0]],
  ['bad azimuth input', [5, '', 0, true]],
  ['non-finite elevation', [5, 1, '-1e400']],
  ['NaN elevation', [5, 1, 'NaN']],
  ['empty elevation', [5, 1, '']],
  ['bad elevation input', [5, 1, '', true]],
  ['elevation too high', [5, 1, 90.001]],
  ['elevation too low', [5, 1, -90.001]],
];
for (const mode of ['traj', 'aim']) {
  for (const [label, values] of invalidMovement) {
    test(`${mode}: ${label} shows localized inheritance error and clears stale output`, () => {
      const h = harness();
      h.get('totalTime').value = '0.1';
      h.run();
      assert.equal(h.viewers.length, 1);
      h.check('inheritVelocity', true);
    for (const [index, value] of values.slice(0, 3).entries()) h.input(inheritanceFields[index], value, values[3] === true && index === 0);
    h.run(mode, { error: true });
      assert.equal(h.get('status').classList.contains('error'), true);
      assert.match(h.get('status').textContent, /速度继承参数无效.*总速率.*有限数.*上下倾角.*-90.*90|速度继承参数无效.*总速率.*水平方向角.*上下倾角/);
      assert.ok([...h.charts, ...h.viewers].every((display) => display.destroyed));
      assert.equal(h.get('initial-state').textContent, '');
      assert.equal(h.get('result-meta').textContent, '');
      assert.equal(h.get('result-tables').innerHTML, '');
      assert.equal(h.get('trajectory3d-wrap').style.display, 'none');
      h.toggleLocale();
      assert.match(h.get('status').textContent, /Invalid velocity inheritance.*total speed.*finite and non-negative.*azimuth.*elevation.*-90°.*90°/);
      h.setMovement(0, 0, 0); // Zero total speed accepts every finite direction, and a valid retry recovers.
      h.run();
      assert.equal(h.get('status').textContent, 'Complete');
      assert.equal(h.viewers.at(-1).destroyed, false);
    });
  }
}

test('disabled inheritance ignores invalid stored movement without calculation errors or viewer parameters', () => {
  const h = harness();
  h.setMovement(-10, 'NaN', '1e400');
  h.get('totalTime').value = '0.1';
  const before = snapshot(h);
  assert.doesNotThrow(() => h.check('inheritVelocity', false));
  assert.match(h.get('shooter-velocity-output').textContent, /已关闭/);
  assert.ok([...inheritanceFields, ...directionIds].every((id) => h.get(id).disabled));
  h.run();
  const { opts, initialVelocity } = h.viewers[0].config;
  assert.equal(opts.inheritVelocity, false);
  for (const key of inheritanceFields) assert.equal(Object.hasOwn(opts, key), false);
  assert.ok(Math.abs(initialVelocity.speed - opts.vConfig) < 1e-9);
  assert.equal(initialVelocity.vz, 0);
  assert.deepEqual(snapshot(h), before);
});

function cameraHarness() {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    copy(v) { return this.set(v.x, v.y, v.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    lengthSq() { return this.x ** 2 + this.y ** 2 + this.z ** 2; }
    normalize() { const length = Math.sqrt(this.lengthSq()); return length ? this.multiplyScalar(1 / length) : this; }
    setFromMatrixColumn(_matrix, index) { return this.set(index === 0 ? 1 : 0, index === 1 ? 1 : 0, index === 2 ? 1 : 0); }
  }
  const window = new Element('window');
  window.devicePixelRatio = 1;
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  const document = new Element('document');
  document.hidden = false;
  const context = vm.createContext({ window, document, console });
  vm.runInContext(sources['trajectory3d.js'], context);
  const viewer = Object.create(window.HD2Trajectory3D.prototype);
  viewer.listeners = [];
  viewer.moveKeys = new Set();
  viewer.navigationFrame = null;
  viewer.boost = false;
  viewer.destroyed = false;
  viewer.playing = false;
  viewer.drag = null;
  viewer.pointer = null;
  viewer.labels = [];
  viewer.viewButtons = { orbit: new Element('button'), side: new Element('button'), top: new Element('button') };
  viewer.tooltip = new Element('div');
  viewer.help = new Element('p');
  viewer.canvas = new Element('canvas');
  viewer.slider = new Element('input');
  viewer.mode = 'orbit';
  viewer.t = { orbitHelp: 'orbit' };
  viewer.center = new Vector3();
  viewer.target = new Vector3();
  viewer.scratch = new Vector3();
  viewer.right = new Vector3();
  viewer.delta = new Vector3();
  viewer.camera = {
    fov: 48, matrixWorld: {},
    getWorldDirection(target) { return target.set(1, 0, 0); },
  };
  viewer.unit = 1;
  viewer.distance = 2;
  viewer.height = 600;
  viewer.renderer = {};
  viewer._cameraChanged = () => {};
  viewer._frameDistance = () => {};
  viewer._invalidate = () => {};
  viewer._bind();
  return { viewer, window };
}

test('3D keyboard navigation stops on keyup and blur', () => {
  const { viewer, window } = cameraHarness();
  viewer._setView('orbit');
  const start = viewer.target.x;
  viewer.canvas.dispatchEvent(new DOMEvent('keydown', { key: 'w', shiftKey: false, preventDefault() {} }));
  viewer._navigate(0.1);
  const normalTravel = viewer.target.x - start;
  assert.ok(normalTravel > 0, 'W movement should advance the free camera target');
  assert.deepEqual(Array.from(viewer.moveKeys), ['w']);
  viewer.canvas.dispatchEvent(new DOMEvent('keydown', { key: 'Shift', shiftKey: true, preventDefault() {} }));
  viewer._navigate(0.1);
  const boostedTravel = viewer.target.x - start - normalTravel;
  assert.ok(boostedTravel > normalTravel * 3.9, 'Shift should multiply navigation speed by four');
  assert.equal(viewer.boost, true);
  const beforeShiftRelease = viewer.target.x;
  window.dispatchEvent(new DOMEvent('keyup', { key: 'Shift' }));
  assert.equal(viewer.boost, false);
  viewer._navigate(0.1);
  assert.ok(Math.abs(viewer.target.x - beforeShiftRelease - normalTravel) < 1e-9, 'Releasing Shift restores normal speed');
  const beforeKeyup = viewer.target.x;
  window.dispatchEvent(new DOMEvent('keyup', { key: 'w' }));
  assert.equal(viewer.moveKeys.size, 0);
  assert.equal(viewer.navigationFrame, null);
  viewer._navigate(0.1);
  assert.equal(viewer.target.x, beforeKeyup, 'Navigation must stop after keyup');
  viewer.canvas.dispatchEvent(new DOMEvent('keydown', { key: 'w', shiftKey: false, preventDefault() {} }));
  viewer._navigate(0.1);
  const beforeBlur = viewer.target.x;
  window.dispatchEvent(new DOMEvent('blur'));
  assert.equal(viewer.moveKeys.size, 0);
  assert.equal(viewer.navigationFrame, null);
  viewer._navigate(0.1);
  assert.equal(viewer.target.x, beforeBlur, 'Blur must cancel held movement');
  viewer._setView('side');
  assert.equal(viewer.mode, 'side');
  viewer._setView('top');
  assert.equal(viewer.mode, 'top');
  for (const remove of viewer.listeners) remove();
  assert.equal(window.listeners.get('keyup').length, 0);
});

function assertChart(chart) {
  const { options, data } = chart.config;
  assert.equal(options.interaction.mode, 'nearest');
  assert.equal(options.interaction.axis, 'xy');
  assert.equal(options.interaction.intersect, false);
  assert.equal(options.parsing, false);
  assert.ok(options.elements.point.hitRadius > 0);
  const callbacks = options.plugins.tooltip.callbacks;
  assert.equal(callbacks.title([]), '');
  assert.equal(callbacks.title([{ dataset: data.datasets[0] }]), data.datasets[0].label);
  const labels = Array.from(callbacks.label({ parsed: { x: 12.3456, y: -7.8901 }, dataset: data.datasets[0] }));
  assert.deepEqual(labels, [
    `${options.scales.x.title.text}: 12.346`,
    `${options.scales.y.title.text}: -7.890`,
  ]);
  assert.notEqual(options.scales.x.title.text, options.scales.y.title.text);
  assert.ok(data.datasets.length > 0);
  for (const dataset of data.datasets) {
    assert.ok(dataset.data.length > 0);
    for (const point of dataset.data) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
}

for (const mode of ['traj', 'aim']) {
  dataTest(`${mode} charts from real simulation: nearest/intersect:false, X/Y tooltip, translated redraw and visibility`, async () => {
    const h = await loaded();
    h.import(131);
    h.get('totalTime').value = '0.5';
    h.get('targetHorizontalRanges').value = '10';
    h.get('angleStepDeg').value = '5';
    h.run(mode);
    const chartCount = mode === 'traj' ? 1 : 2;
    const viewerCount = mode === 'traj' ? 1 : 0;
    assert.equal(h.charts.length, chartCount);
    assert.equal(h.viewers.length, viewerCount);
    h.charts.forEach(assertChart);
    assert.equal(h.get('charts').classList.contains('trajectory-layout'), mode === 'traj');
    assert.equal(h.get('trajectory3d-wrap').style.display, mode === 'traj' ? 'block' : 'none');
    assert.equal(h.get('chart1-wrap').style.display, mode === 'traj' ? 'none' : 'block');
    assert.equal(h.get('chart2-wrap').style.display, 'block');
    if (mode === 'aim') {
      assert.ok(h.charts[1].config.data.datasets.length >= 2, 'Actual solver must produce a reachable trajectory and target line');
      assert.equal(h.get('initial-state').textContent, '');
    } else {
      assert.equal(h.charts[0].canvas, h.get('chart2'));
      assert.equal(h.viewers[0].config.locale, 'zh');
      assert.match(h.get('initial-state').textContent, /实际初速.*初始速度.*初始伤害比例/);
    }
    const initialDisplays = [...h.charts, ...h.viewers];
    h.toggleLocale();
    assert.equal(h.charts.length, chartCount * 2);
    assert.equal(h.viewers.length, viewerCount * 2);
    assert.ok(initialDisplays.every((display) => display.destroyed && display.destroyCalls === 1));
    const englishCharts = h.charts.slice(-chartCount);
    const englishDisplays = [...englishCharts, ...h.viewers.slice(viewerCount)];
    englishCharts.forEach(assertChart);
    assert.equal(englishCharts.at(-1).config.options.scales.x.title.text, mode === 'traj' ? 'Cumulative path (m)' : 'Horizontal distance X (m)');
    if (mode === 'traj') {
      assert.equal(h.viewers.at(-1).config.locale, 'en');
      assert.equal(h.viewers.at(-1).config.records, h.viewers[0].config.records);
      assert.match(h.get('initial-state').textContent, /Actual launch speed.*initial velocity.*initial damage ratio/);
    }
    assert.equal(h.get('status').textContent, 'Complete');
    h.check('showPlot', false);
    assert.ok(englishDisplays.every((display) => display.destroyed && display.destroyCalls === 1));
    assert.equal(h.charts.length, chartCount * 2);
    assert.equal(h.viewers.length, viewerCount * 2);
    assert.equal(h.get('chart1-wrap').style.display, 'none');
    assert.equal(h.get('chart2-wrap').style.display, 'none');
    assert.equal(h.get('trajectory3d-wrap').style.display, 'none');
    assert.equal(h.get('trajectory3d-wrap').children.length, 0);
    assert.equal(h.get('charts').classList.contains('trajectory-layout'), false);
    h.toggleLocale(); // Hidden plots must stay hidden when translating the result.
    assert.equal(h.charts.length, chartCount * 2);
    assert.equal(h.viewers.length, viewerCount * 2);
    h.check('showPlot', true);
    assert.equal(h.charts.length, chartCount * 3);
    assert.equal(h.viewers.length, viewerCount * 3);
    h.charts.slice(-chartCount).forEach(assertChart);
    if (mode === 'traj') assert.equal(h.viewers.at(-1).config.locale, 'zh');
    h.import(291);
    assert.ok([...h.charts, ...h.viewers].every((display) => display.destroyed && display.destroyCalls === 1));
    assert.equal(h.get('trajectory3d-wrap').children.length, 0);
    assert.equal(h.get('trajectory3d-wrap').style.display, 'none');
    assert.equal(h.get('initial-state').textContent, '');
    assert.equal(h.get('status').textContent, '');
    assert.equal(h.get('results').classList.contains('visible'), false);
    assert.equal(h.get('result-tables').innerHTML, '');
  });
}

test('trajectory viewer receives real XYZ records, launch velocity and all simulation options', () => {
  const h = harness();
  const inputs = {
    vConfig: 100, launchAngleDeg: 0, dragCoeff: 0, gravityMultiplier: 0,
    normalDamage: 80, durableDamage: 20, totalTime: 0.2, stepHz: 10,
    targetDistances: '5, 10', printEveryNSteps: 2,
  };
  for (const [id, value] of Object.entries(inputs)) h.get(id).value = String(value);
  h.check('inheritVelocity', true);
  h.setMovement(30, 180, 0);
  h.run();
  assert.equal(h.viewers.length, 1);
  assert.equal(h.charts.length, 1);
  const { host, config } = h.viewers[0];
  assert.equal(host, h.get('trajectory3d-wrap'));
  assert.equal(host.children.length, 1);
  assert.equal(config.locale, 'zh');
  assert.deepEqual(Object.keys(config).sort(), ['initialVelocity', 'locale', 'opts', 'records']);
  for (const [id, value] of Object.entries(inputs)) {
    if (id !== 'targetDistances') assert.equal(config.opts[id], value, id);
  }
  assert.deepEqual(Array.from(config.opts.targetDistances), [5, 10]);
  for (const id of ['caliberMm', 'massG', 'g0', 'lifeTime', 'rho', ...inheritanceFields]) {
    assert.equal(config.opts[id], Number(h.get(id).value), id);
  }
  assert.equal(config.opts.inheritVelocity, true);
  assert.equal(config.opts.ignoreTerminalVelocity, false);
  const initial = config.initialVelocity;
  assert.equal(initial.vx, 70);
  assert.equal(initial.vy, 0);
  assert.equal(initial.vz, 0);
  assert.ok(Math.abs(initial.speed - 70) < 1e-9);
  assert.equal(config.records.length, 3);
  for (const record of config.records) {
    for (const key of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'time', 'pathLength', 'normalDamage', 'damageRatio']) {
      assert.ok(Number.isFinite(record[key]), key);
    }
    assert.ok(Math.abs(record.x - 70 * record.time) < 1e-9);
    assert.equal(record.y, 0);
    assert.equal(record.z, 0);
  }
  assert.ok(Math.abs(config.records[0].damageRatio - (0.25 + 0.75 * 0.7 ** 2)) < 1e-9,
    'Backward movement must reduce launch speed and initial damage');
  const damageChart = h.charts[0];
  assert.equal(damageChart.canvas, h.get('chart2'));
  assertChart(damageChart);
  assert.deepEqual(Array.from(damageChart.config.data.datasets[0].data, (point) => [point.x, point.y]),
    Array.from(config.records, (record) => [record.pathLength, record.normalDamage]));
  assert.match(h.get('initial-state').textContent, /70\.000, 0\.000, 0\.000/);
  assert.match(h.get('result-tables').innerHTML, /侧向位置 Z.*速度方位角/);
  const previousViewer = h.viewers[0];
  h.run();
  assert.equal(previousViewer.destroyCalls, 1);
  assert.equal(damageChart.destroyCalls, 1);
  assert.equal(h.viewers.length, 2);
  assert.equal(host.children.length, 1, 'Rerun must replace the viewer host contents');
  assert.equal(h.viewers[1].destroyed, false);
});

test('missing 3D viewer shows translated fallback and still renders damage chart and numeric output', () => {
  const h = harness({ viewer: false });
  h.get('totalTime').value = '0.1';
  h.run();
  assert.equal(h.viewers.length, 0);
  assert.equal(h.charts.length, 1);
  assert.equal(h.charts[0].canvas, h.get('chart2'));
  assertChart(h.charts[0]);
  assert.match(h.get('trajectory3d-wrap').textContent, /3D 查看器未加载.*数值结果仍可查看/);
  assert.equal(h.get('trajectory3d-wrap').style.display, 'block');
  assert.equal(h.get('chart1-wrap').style.display, 'none');
  assert.equal(h.get('chart2-wrap').style.display, 'block');
  assert.match(h.get('initial-state').textContent, /实际初速/);
  assert.match(h.get('result-tables').innerHTML, /<table>/);
  h.toggleLocale();
  assert.match(h.get('trajectory3d-wrap').textContent, /3D viewer did not load.*numerical results remain available/);
  assert.equal(h.charts[0].destroyCalls, 1);
  assertChart(h.charts[1]);
  h.check('showPlot', false);
  assert.equal(h.get('trajectory3d-wrap').textContent, '');
  assert.equal(h.get('trajectory3d-wrap').style.display, 'none');
  assert.equal(h.charts[1].destroyCalls, 1);
  assert.match(h.get('result-tables').innerHTML, /<table>/);
  h.check('showPlot', true);
  assert.equal(h.charts.length, 3);
  assert.match(h.get('trajectory3d-wrap').textContent, /3D viewer did not load/);
  assert.equal(h.get('status').textContent, 'Complete');
});

dataTest('trajectory to aim rerun destroys the viewer and restores two-chart layout', async () => {
  const h = await loaded();
  h.import(131);
  h.get('totalTime').value = '0.1';
  h.get('targetHorizontalRanges').value = '10';
  h.get('angleStepDeg').value = '5';
  h.run();
  const viewer = h.viewers[0];
  h.run('aim');
  assert.ok(h.viewers.every((item) => item.destroyed && item.destroyCalls === 1));
  assert.equal(viewer.host.children.length, 0);
  assert.equal(h.get('trajectory3d-wrap').style.display, 'none');
  assert.equal(h.get('charts').classList.contains('trajectory-layout'), false);
  assert.equal(h.get('chart1-wrap').style.display, 'block');
  assert.equal(h.get('chart2-wrap').style.display, 'block');
  assert.equal(h.get('initial-state').textContent, '');
  h.charts.slice(-2).forEach(assertChart);
  assert.ok(h.charts.slice(0, -2).every((chart) => chart.destroyed));
});

dataTest('late successful damage link clears stale simulation output', async () => {
  const h = harness();
  await h.load('projectile', realProjectile());
  h.import(131);
  h.run();
  assert.equal(h.get('results').classList.contains('visible'), true);
  await h.load('damage', realDamage());
  assert.deepEqual(h.damages(), [200, 100]);
  assert.ok([...h.charts, ...h.viewers].every((display) => display.destroyed && display.destroyCalls === 1));
  assert.equal(h.get('trajectory3d-wrap').style.display, 'none');
  assert.equal(h.get('trajectory3d-wrap').children.length, 0);
  assert.equal(h.get('initial-state').textContent, '');
  assert.equal(h.get('results').classList.contains('visible'), false);
  assert.equal(h.get('result-meta').textContent, '');
  assert.equal(h.get('status').textContent, '');
});

// ---- 2026-10-24：武器预设（HD2_Ballistics/data/equipment_catalog.json）DOM 回归 ----
const presetCatalog = () => JSON.stringify({
  schema_version: 1,
  upstream: { repo: 'Darctor/Helldivers2_RawData', commit: 'd7bb0b02', game_version: '1.007.100',
              patch_date: '2026-09-22', fetched_at: '2026-10-24T00:00:00Z', files: {} },
  wiki: { weapons_updated_at: '2026-09-23T00:00:00Z', stratagems_updated_at: '2026-09-23T00:00:00Z' },
  categories: {
    primary: [
      { id: 'ar_23_liberator', name: 'AR-23 解放者', name_en: 'AR-23 Liberator', category: 'primary', status: 'ready',
        attacks: [{ id: 'ar_23_liberator:attack', name: '5.5x50mm FULL METAL JACKET P', kind: 'projectile',
                    status: 'ready', projectile_type: 276,
                    params: { calibreMm: 5.5, massG: 4.5, vConfig: 900, dragCoeff: 0.3, gravityMultiplier: 1,
                              lifeTime: 0, ignoreTerminalVelocity: false, inheritVelocity: true, numProjectiles: 1 },
                    damage: { normal: 90, durable: 22, damage_info_type: 108, source: 'rawdata' },
                    wiki_check: { mismatches: [] }, sources: ['wiki', 'rawdata'] }] },
      { id: 'sg_20_halt', name: 'SG-20 止息', name_en: 'SG-20 Halt', category: 'primary', status: 'ready',
        attacks: [
          { id: 'sg_20_halt:flechette', name: '10g FLECHETTES P', kind: 'projectile', status: 'ready',
            projectile_type: 183,
            params: { calibreMm: 10, massG: 6, vConfig: 385, dragCoeff: 0.3, gravityMultiplier: 1,
                      lifeTime: 0, ignoreTerminalVelocity: false, inheritVelocity: true, numProjectiles: 11 },
            damage: { normal: 35, durable: 10, damage_info_type: 166, source: 'rawdata' },
            wiki_check: { mismatches: [] }, sources: ['wiki', 'rawdata'] },
          { id: 'sg_20_halt:stun', name: '10g STUN ROUNDS P', kind: 'projectile', status: 'ready',
            projectile_type: 191,
            params: { calibreMm: 10, massG: 4.5, vConfig: 800, dragCoeff: 0.3, gravityMultiplier: 1,
                      lifeTime: 0, ignoreTerminalVelocity: false, inheritVelocity: true, numProjectiles: 20 },
            damage: { normal: 6, durable: 2, damage_info_type: 175, source: 'rawdata' },
            wiki_check: { mismatches: [] }, sources: ['wiki', 'rawdata'] }],
      },
      { id: 'spray_rifle_x', name: '喷射步枪 X', name_en: 'Spray Rifle X', category: 'primary', status: 'unsupported',
        reason: '该装备没有射弹类攻击（火焰/光束/电弧/爆炸/近战等），当前弹道模型不支持',
        attacks: [{ id: 'spray_rifle_x:jet', name: 'SPRAY JET S', kind: 'spray', status: 'unsupported',
                    reason: '当前弹道模型不支持 spray 类攻击' }] },
    ],
    secondary: [], support: [], throwable: [],
  },
  unresolved: [],
  stats: { ready: 3, unsupported: 1, unresolved: 0 },
});

test('AR-2 Coyote preset applies every Wiki/RawData parameter', async () => {
  const h = harness({ catalogText: equipmentCatalogText });
  await h.flush();
  h.get('preset-weapon').value = 'ar_2_coyote';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  assert.equal(h.get('preset-attack-field').hidden, true);
  assert.equal(h.get('caliberMm').value, '7');
  assert.equal(h.get('massG').value, '8');
  assert.equal(h.get('vConfig').value, '650');
  assert.equal(h.get('dragCoeff').value, '0.3');
  assert.equal(h.get('gravityMultiplier').value, '1');
  assert.equal(h.get('lifeTime').value, '0');
  assert.equal(h.get('normalDamage').value, '75');
  assert.equal(h.get('durableDamage').value, '10');
  assert.equal(h.get('inheritVelocity').checked, true);
  assert.equal(h.get('ignoreTerminalVelocity').checked, false);
  assert.match(h.get('preset-badges').textContent, /projectile type 138/);
  assert.match(h.get('preset-status').textContent, /已按预设填充参数/);
  assert.doesNotMatch(h.get('preset-notes').textContent, /^preset\.notes$/);
  assert.match(h.get('preset-notes').textContent, /预设来自站点武器目录/);
  h.run('traj');
});

test('new Wiki-only weapon presets fill all five entries and label their source', async () => {
  const h = harness({ catalogText: equipmentCatalogText });
  await h.flush();

  h.get('preset-weapon').value = 'r_40_sightliner';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  assert.deepEqual([
    h.get('caliberMm').value, h.get('massG').value, h.get('vConfig').value,
    h.get('dragCoeff').value, h.get('gravityMultiplier').value,
    h.get('normalDamage').value, h.get('durableDamage').value,
  ], ['8', '11', '950', '0.2', '1', '350', '205']);
  assert.match(h.get('preset-badges').textContent, /Wiki v1\.007\.200 · revid 14845/);
  assert.doesNotMatch(h.get('preset-badges').textContent, /RawData/);

  h.get('preset-category').value = 'secondary';
  h.get('preset-category').dispatchEvent(new DOMEvent('change'));
  h.get('preset-weapon').value = 'p_44_mist';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  assert.deepEqual([
    h.get('caliberMm').value, h.get('massG').value, h.get('vConfig').value,
    h.get('dragCoeff').value, h.get('normalDamage').value, h.get('durableDamage').value,
  ], ['9', '7', '375', '1.2', '110', '18']);

  h.get('preset-category').value = 'support';
  h.get('preset-category').dispatchEvent(new DOMEvent('change'));
  for (const [id, expected] of [
    ['amw_20_apex', ['60', '70', '1500', '0.1', '0.35', '1550', '930']],
    ['las_44_nova', ['10', '8', '1500', '0', '0', '880', '880']],
  ]) {
    h.get('preset-weapon').value = id;
    h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
    assert.deepEqual([
      h.get('caliberMm').value, h.get('massG').value, h.get('vConfig').value,
      h.get('dragCoeff').value, h.get('gravityMultiplier').value,
      h.get('normalDamage').value, h.get('durableDamage').value,
    ], expected);
  }
  assert.equal(h.get('lifeTime').value, '6');

  h.get('preset-category').value = 'throwable';
  h.get('preset-category').dispatchEvent(new DOMEvent('change'));
  assert.ok(h.get('preset-weapon').children.some((option) => option.value === 'g_11_caltrops'));
  h.get('preset-weapon').value = 'g_11_caltrops';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  assert.equal(h.get('run').disabled, true);
  assert.match(h.get('preset-error').textContent, /不属于当前单射弹弹道模型/);
});

test('weapon presets load, autofill AR-23 and render source badges', async () => {
  const h = harness({ catalogText: presetCatalog() });
  await h.flush();
  assert.equal(h.get('panel-preset').hidden, false, '目录加载成功后面板应显示');
  // 一级类别默认 primary；武器选择应包含 AR-23 与 SG-20，不含 unsupported 之外禁用项？——包含但选中后禁用
  h.get('preset-weapon').value = 'ar_23_liberator';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  // 单攻击：攻击选择行隐藏
  assert.equal(h.get('preset-attack-field').hidden, true);
  assert.equal(h.get('caliberMm').value, '5.5');
  assert.equal(h.get('massG').value, '4.5');
  assert.equal(h.get('vConfig').value, '900');
  assert.equal(h.get('dragCoeff').value, '0.3');
  assert.equal(h.get('gravityMultiplier').value, '1');
  assert.equal(h.get('lifeTime').value, '0');
  assert.equal(h.get('normalDamage').value, '90');
  assert.equal(h.get('durableDamage').value, '22');
  assert.equal(h.get('inheritVelocity').checked, true);
  assert.equal(h.get('ignoreTerminalVelocity').checked, false);
  const badgeText = h.get('preset-badges').textContent;
  assert.match(badgeText, /RawData v1\.007\.100/);
  assert.match(badgeText, /projectile type 276/);
  // 预设参数可直接仿真
  h.run('traj');
});

test('SG-20 Halt shows two attack variants and switches parameters between them', async () => {
  const h = harness({ catalogText: presetCatalog() });
  await h.flush();
  h.get('preset-weapon').value = 'sg_20_halt';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  assert.equal(h.get('preset-attack-field').hidden, false, '多攻击武器必须显示二级选择');
  const options = h.get('preset-attack').children.map((o) => o.textContent).join('|');
  assert.match(options, /FLECHETTES/);
  assert.match(options, /STUN ROUNDS/);
  h.get('preset-attack').value = 'sg_20_halt:flechette';
  h.get('preset-attack').dispatchEvent(new DOMEvent('change'));
  assert.equal(h.get('vConfig').value, '385');
  assert.equal(h.get('massG').value, '6');
  assert.equal(h.get('normalDamage').value, '35');
  assert.match(h.get('preset-badges').textContent, /弹丸数 ×11/);
  assert.match(h.get('preset-status').textContent, /单弹丸/);
  h.get('preset-attack').value = 'sg_20_halt:stun';
  h.get('preset-attack').dispatchEvent(new DOMEvent('change'));
  assert.equal(h.get('vConfig').value, '800');
  assert.equal(h.get('normalDamage').value, '6');
  assert.match(h.get('preset-badges').textContent, /弹丸数 ×20/);
});

test('unsupported weapons disable run, clear old results and fall back to manual import', async () => {
  const h = harness({ catalogText: presetCatalog() });
  await h.flush();
  // 先产生一次结果
  h.run('traj');
  assert.equal(h.get('results').classList.contains('visible'), true);
  // 选择 unsupported 武器：错误提示、清结果、禁止运行、展开手动导入
  h.get('preset-weapon').value = 'spray_rifle_x';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  assert.equal(h.get('results').classList.contains('visible'), false, '切换预设后必须清空旧结果');
  assert.equal(h.get('run').disabled, true, 'unsupported 武器必须禁止运行');
  assert.match(h.get('preset-error').textContent, /不支持/);
  assert.equal(h.get('panel-advanced').open, true, '应自动展开高级手动导入');
  // 换回 ready 武器恢复可用
  h.get('preset-weapon').value = 'ar_23_liberator';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  assert.equal(h.get('run').disabled, false);
});

test('catalog load failure keeps presets hidden and manual mode intact', async () => {
  const h = harness({});                       // 无 catalogText：fetch 404
  await h.flush();
  assert.equal(h.get('panel-preset').hidden, true, '加载失败时预设面板必须保持隐藏');
  // 手动导入流程不受影响（复用既有合成 JSON 导入路径）
  h.choose('projectile', jsonFile('synthetic.json', projectileJSON(
    { type: '777 <=> ProjectileType_Unknown_777', ProjectileSettings: { items: [{
        calibre: 5.5, mass: 4.5, speed: 900, drag: 0.3, gravity_multiplier: 1, life_time: 0,
        damage_info_type: '108 <=> DamageInfoType_Unknown_108',
        projectile_flags_1_detail: { inherit_velocity: 1, ignore_terminal_velocity: 0 } }] } })));
  await h.flush();
  h.import(777);
  assert.equal(h.get('caliberMm').value, '5.5', '手动导入必须照常工作');
});

test('weapon preset labels follow the active locale', async () => {
  const h = harness({ catalogText: presetCatalog() });
  await h.flush();
  h.get('preset-weapon').value = 'ar_23_liberator';
  h.get('preset-weapon').dispatchEvent(new DOMEvent('change'));
  const zhLabel = h.get('preset-weapon').children.map((o) => o.textContent).join('|');
  assert.match(zhLabel, /AR-23 解放者/);
  h.toggleLocale();
  const enLabel = h.get('preset-weapon').children.map((o) => o.textContent).join('|');
  assert.match(enLabel, /AR-23 Liberator/);
  assert.doesNotMatch(enLabel, /解放者/);
});
