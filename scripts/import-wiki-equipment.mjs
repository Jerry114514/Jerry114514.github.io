// 从 helldivers.wiki.gg 导入一件 Infobox Weapon 页面（主手/副手/手雷）到
// assessment-v2/sources/equipment-expanded.json 与 data/catalog.json。
// 只做忠实转写：wiki 上没有的字段留空，不推测数值；新条目未经人工校准，
// 评价器会按既有规则记为"资料不足"，不会影响认证抽取的判定语义。
// 用法：
//   node scripts/import-wiki-equipment.mjs --page "AR-23L Liberator Legacy" \
//     --id ar_23l_liberator_legacy --name-zh "AR-23L “解放者”传承" [--force]
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const API = 'https://helldivers.wiki.gg/api.php';

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : fallback;
};
const page = arg('page'), id = arg('id'), nameZh = arg('name-zh'), force = args.includes('--force');
if (!page || !id) { console.error('需要 --page 与 --id'); process.exit(1); }

const SLOT_BY_CATEGORY = {'Primary Weapons': 'primary', 'Secondary Weapons': 'secondary', 'Throwables': 'grenade'};
const SUBCATEGORY_BY_TYPE = {
  'Assault Rifles': 'assault_rifles', 'Submachine Guns': 'submachine_guns', 'Shotguns': 'shotguns',
  'Sniper Rifles': 'sniper_rifles', 'Marksman Rifles': 'marksman_rifles', 'Energy-Based': 'energy_based',
  'Explosive': 'explosives', 'Explosives': 'explosives', 'Melee': 'melee', 'Special': 'special',
  'Special Primaries': 'special', 'Special Secondaries': 'special', 'Standard Throwables': 'throwables',
  'Special Throwables': 'special',
};
// weapon_stats 行的 label → key（沿用快照既有键名）
const WEAPON_STATS_KEYS = {
  'fire rate': 'fire_rate', 'drift recoil': 'drift_recoil', 'climb recoil': 'climb_recoil',
  'recoil': 'recoil', 'horizontal recoil': 'recoil_horizontal', 'vertical recoil': 'recoil_vertical',
  'spread': 'spread', 'base sway': 'sway', 'sway': 'sway', 'base ergonomics': 'ergonomics',
  'ergonomics': 'ergonomics', 'noise when firing': 'noise', 'capacity': 'capacity',
  'spare magazines': 'spare_magazines', 'starting magazines': 'starting_magazines',
  'mags from supply': 'mags_from_supply', 'mags from ammo box': 'mags_from_ammo_box',
};
const PROJECTILE_KEYS = {
  'size': 'size', 'mass': 'mass', 'initial velocity': 'initial_velocity', 'drag factor': 'drag_factor',
  'gravity factor': 'gravity_factor', 'penetration slowdown': 'penetration_slowdown',
  'standard': 'damage_standard', 'vs. durable': 'damage_durable', 'direct': 'pen_direct',
  'slight angle': 'pen_slight_angle', 'large angle': 'pen_large_angle', 'extreme angle': 'pen_extreme_angle',
  'demolition force': 'demolition_force', 'stagger force': 'stagger_force', 'push force': 'push_force',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(params, attempt = 0) {
  const url = API + '?' + new URLSearchParams({...params, format: 'json', formatversion: '2'});
  const res = await fetch(url, {headers: {'user-agent': 'hd2-wiki-import/1.0 (static site maintainer)'}});
  if (!res.ok) throw Error('HTTP_' + res.status);
  const json = await res.json();
  if (json.error?.code === 'ratelimited' && attempt < 4) { await sleep(2000 * (attempt + 1)); return api(params, attempt + 1); }
  if (json.error) throw Error('API_ERROR:' + json.error.code);
  return json;
}

const decode = s => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'");
const stripTags = s => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// 从 from 开始走一个平衡的 <div>…</div> 块，返回 {html, end}
function balancedDiv(html, from) {
  let depth = 0, i = from;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = from;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === '<div') depth++;
    else { depth--; if (depth === 0) { i = re.lastIndex; return {html: html.slice(from, i), end: i}; } }
  }
  return {html: html.slice(from), end: html.length};
}
const number = raw => { const m = /-?[\d,]+(?:\.\d+)?/.exec(String(raw ?? '').replace(/,/g, '')); return m ? Number(m[0]) : null; };
const unitOf = raw => { const m = /(?:^|\s)([A-Za-zμ°%][\w/μ°%.]*)\s*$/.exec(String(raw ?? '')); return m && !/^[\d.,]+$/.test(m[1]) ? m[1] : null; };
const parsedOf = raw => ({raw, number: number(raw), unit: /^[\d.,]+\s*\S/.test(raw) ? unitOf(raw) : null});

console.error('抓取页面:', page);
const json = await api({action: 'parse', page, prop: 'text|revid|displaytitle', redirects: '1'});
const parse = json.parse;
const html = typeof parse.text === 'string' ? parse.text : parse.text['*'];
if (parse.displaytitle && stripTags(parse.displaytitle) !== page) console.error('注意: 重定向到', stripTags(parse.displaytitle));

// ── DRUID infobox ──
const infobox = [];
const rowRe = /<div class="druid-row druid-row-([a-z0-9_&#;]+)" data-druid-section-row="([A-Za-z]+)">/g;
let m;
while ((m = rowRe.exec(html))) {
  const key = decode(m[1]);
  const section = m[2];
  const block = balancedDiv(html, m.index).html;
  const label = stripTags((block.match(/<div class="druid-label[^"]*">([\s\S]*?)<\/div>/) || [])[1] ?? '');
  const dataHtml = (block.match(/<div class="druid-data[^"]*">([\s\S]*)/) || [])[1] ?? '';
  let raw = stripTags(dataHtml);
  // 伤害行：图标 alt/title 携带伤害类型（如 Ballistic），文本里已有，保持原样；
  // 若只有数字没有类型词，从 Damage_*_Icon 文件名补齐单位。
  if (!/[A-Za-z]/.test(raw.split(' ').slice(1).join(' ')) && /Damage_([A-Za-z]+)_Icon/.test(block)) {
    raw = raw + ' ' + /Damage_([A-Za-z]+)_Icon/.exec(block)[1];
  }
  if (!raw) continue;
  const values = raw.includes('•') ? raw.split('•').map(s => s.trim()).filter(Boolean) : [raw];
  infobox.push({section, label, key, raw, parsed: parsedOf(raw), values});
}
if (!infobox.length) throw Error('INFOBOX_NOT_PARSED');

const category = SLOT_BY_CATEGORY[infobox.find(r => r.key === 'weapon_category')?.raw];
const subcategory = SUBCATEGORY_BY_TYPE[infobox.find(r => r.key === 'weapon_type')?.raw] ?? null;
if (!category) throw Error('UNSUPPORTED_WEAPON_CATEGORY');

// ── 攻击数据表（wikitable.attack-data-table-*） ──
const tableRe = /<table[^>]*class="([^"]*wikitable[^"]*)"[^>]*>([\s\S]*?)<\/table>/g;
const tables = [];
let t;
while ((t = tableRe.exec(html))) {
  const classes = t[1], body = t[2];
  const kind = /attack-data-table-(\w+)/.exec(classes)?.[1];
  if (!kind || !['weapon', 'projectile', 'beam', 'arc', 'spray', 'explosion', 'status'].includes(kind)) continue;
  const trs = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r => [...r[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c => stripTags(c[1])));
  const table = {index: tables.length + 1, kind: 'weapon_stats', classes: classes.trim(), id: null,
    context_heading: 'Detailed_Weapon_Statistics', title: null, attack_type: null, type_label: null,
    column_header: null, rows: [], remote_targets: []};
  if (kind === 'weapon') {
    table.title = trs[0]?.[0] ?? null;
    let section = null;
    for (const cells of trs.slice(1)) {
      if (cells.length === 1) { section = cells[0]; continue; }            // “Attacks” 分隔行
      if (cells[0]?.startsWith('*')) {                                     // 指向弹道表的链接行
        const target = cells[0].replaceAll('*', '').trim();
        table.remote_targets.push(target.replaceAll(' ', '_'));
        table.rows.push({section: null, label: cells[0], key: target.toLowerCase().replace(/[\s-]+/g, '_'), raw: cells[1], parsed: parsedOf(cells[1]), values: [cells[1]]});
      } else if (cells.length === 2) {
        const key = WEAPON_STATS_KEYS[cells[0].toLowerCase()] ?? cells[0].toLowerCase().replaceAll(' ', '_');
        table.rows.push({section: null, label: cells[0], key, raw: cells[1], parsed: parsedOf(cells[1]), values: [cells[1]]});
      }
    }
  } else {
    table.kind = 'attack_' + kind;
    table.title = trs[0]?.[0] ?? null;
    table.id = (table.title ?? '').replaceAll(' ', '_') || null;
    table.attack_type = kind;
    table.type_label = /Projectile|Beam|Arc|Spray/.exec(classes)?.[0] ?? kind;
    let section = null;
    for (const cells of trs.slice(1)) {
      if (!cells.length) continue;
      if (cells.length === 1) { section = cells[0]; continue; }            // Damage / Penetration / Special Effects 分组行
      const [label, raw = null] = cells;
      if (raw === null) continue;
      const key = PROJECTILE_KEYS[label.toLowerCase()] ?? label.toLowerCase().replaceAll(' ', '_');
      table.rows.push({section, label, key, raw, parsed: parsedOf(raw), values: [raw]});
    }
  }
  tables.push(table);
}
if (!tables.some(x => x.kind === 'attack_projectile')) throw Error('ATTACK_TABLE_NOT_PARSED');

const revid = parse.revid;
// action=parse 不返回修订时间戳，单独按 revid 查一次
const revInfo = await api({action: 'query', revids: String(revid), prop: 'revisions', rvprop: 'timestamp'});
const revisionTimestamp = revInfo.query?.pages?.[0]?.revisions?.[0]?.timestamp ?? null;
const imageFile = decode((html.match(/druid-main-image[\s\S]*?<a href="\/wiki\/File:([^"]+)"/) || [])[1] ?? '')
  || (infobox.find(r => r.key === 'image')?.raw?.replaceAll(' ', '_') ?? null);
const provenance = {
  api: API,
  request: `${API}?action=parse&page=${encodeURIComponent(page).replaceAll('%20', '+')}&prop=text%7Crevid%7Cdisplaytitle&format=json&formatversion=2&redirects=1`,
  fetched_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  revid,
  revision_timestamp: revisionTimestamp,
  html_sha256: createHash('sha256').update(html).digest('hex'),
  locator: 'infobox / tables[index] / attack-data-table-<type>',
};

const nameEn = stripTags(parse.title);
const item = {
  id, kind: 'weapon', category, subcategory,
  name_en: nameEn,
  name_zh: nameZh || nameEn,
  source_url: `https://helldivers.wiki.gg/wiki/${nameEn.replaceAll(' ', '_')}`,
  page_title: nameEn,
  provenance, infobox, tables,
  mechanics_notes: [],
};

console.error(`解析完成: ${nameEn} (${category}/${subcategory}) revid=${revid}`);
console.error(`  infobox ${infobox.length} 行: ${infobox.map(r => r.key).join(',')}`);
console.error(`  tables: ${tables.map(x => x.kind + ':' + x.rows.length).join(', ')}`);

// ── 写入快照与目录 ──
const snapshotPath = 'shared/hd2-loadout/assessment-v2/sources/equipment-expanded.json';
const catalogPath = 'shared/hd2-loadout/data/catalog.json';
const snapshot = read(snapshotPath);
const catalog = read(catalogPath);
if (!force && (snapshot.items.some(i => i.id === id) || catalog.equipment.some(e => e.id === id))) {
  console.error('已存在同 id 条目（用 --force 覆盖）'); process.exit(1);
}
const prevTotal = snapshot.items.length;
snapshot.items = snapshot.items.filter(i => i.id !== id);
snapshot.items.push(item);
snapshot.summary = {...snapshot.summary, generated_at: provenance.fetched_at,
  covered: {...snapshot.summary.covered, total: snapshot.items.length,
    weapons: snapshot.items.filter(i => ['primary', 'secondary', 'throwables'].includes(i.category)).length}};
snapshot.incremental_summary = {generated_at: provenance.fetched_at, baseline: prevTotal,
  added: snapshot.items.length - prevTotal, total: snapshot.items.length, imported: [id]};
writeFileSync(resolve(root, snapshotPath), JSON.stringify(snapshot, null, 2) + '\n');

const template = catalog.equipment.find(e => e.selection_slot === category);
catalog.equipment = catalog.equipment.filter(e => e.id !== id);
catalog.equipment.push({
  active_slots: [], aliases: [nameEn], component_ids: [],
  evidence_refs: [`ev.item.${id}`],
  icon: imageFile ? `https://helldivers.wiki.gg/images/thumb/${imageFile}/240px-${imageFile}` : null,
  id, mode_ids: ['default'], name: nameZh || nameEn, name_en: nameEn,
  resource_model_id: `${id}.resource`,
  selection_rule_refs: [...(template?.selection_rule_refs ?? [])],
  selection_slot: category, unavoidable_effects: [],
});
writeFileSync(resolve(root, catalogPath), JSON.stringify(catalog));

console.error(`已写入 ${snapshotPath}（${snapshot.items.length} 件）与 ${catalogPath}（${catalog.equipment.length} 件）`);
console.error('下一步：node scripts/build-loadout-v3-assessment.mjs && node --test scripts/tests/loadout-v3-assessment-v2/');
