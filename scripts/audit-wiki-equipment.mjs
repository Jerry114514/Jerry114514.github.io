// 审计 shared/hd2-loadout 的装备目录与 helldivers.wiki.gg 的差异。
// 分类成员按标题前缀区分子分类；Stratagems 递归一层子分类（舰船模块 =
// 可携带，Mission = 任务道具不进配装池），去重后与仓库比对；
// 同时抓每页当前头图（pageimages）与最后修订号，比对图标与快照新鲜度。
// 用法：node scripts/audit-wiki-equipment.mjs [--out <输出目录>]
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const catalog = read('shared/hd2-loadout/data/catalog.json');
const snapshot = read('shared/hd2-loadout/assessment-v2/sources/equipment-expanded.json');

const API = 'https://helldivers.wiki.gg/api.php';
const WEAPON_CATS = ['Primary Weapons', 'Secondary Weapons', 'Throwables'];
const STRATAGEM_SUBCATS = ['Eagle Stratagems', 'Orbital Stratagems', 'Support Weapon Stratagems',
  'Backpack Stratagems', 'Vehicle Stratagems', 'Sentry Stratagems', 'Emplacement Stratagems'];
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(params, attempt = 0) {
  const url = API + '?' + new URLSearchParams({...params, format: 'json', formatversion: '2'});
  const res = await fetch(url, {headers: {'user-agent': 'hd2-wiki-sync-audit/1.0 (static site maintainer)'}});
  if (!res.ok) throw Error('HTTP_' + res.status + ':' + url);
  const json = await res.json();
  if (json.error?.code === 'ratelimited' && attempt < 4) { await sleep(2000 * (attempt + 1)); return api(params, attempt + 1); }
  if (json.error) throw Error('API_ERROR:' + json.error.code);
  return json;
}

// 一层分类成员：页面与子分类按标题前缀区分（formatversion=2 的 member 不带可靠 type）
async function members(title) {
  const pages = [], subcats = [];
  let cont = '';
  do {
    const json = await api({action: 'query', list: 'categorymembers', cmtitle: 'Category:' + title, cmlimit: '500', cmtype: 'page|subcat', ...(cont ? {cmcontinue: cont} : {})});
    for (const m of json.query?.categorymembers || []) {
      if (m.title.startsWith('Category:')) subcats.push(m.title.slice('Category:'.length));
      else pages.push(m.title);
    }
    cont = json.continue?.cmcontinue || '';
  } while (cont);
  return {pages, subcats};
}

async function pageProps(titles) {
  const out = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const json = await api({action: 'query', titles: batch.join('|'), prop: 'pageimages|info', piprop: 'original|thumbnail', pithumbsize: '240'});
    for (const p of json.query?.pages || []) {
      out[p.title] = {
        pageid: p.pageid, missing: !!p.missing, lastrevid: p.lastrevid,
        original: p.original?.source || null,
        original_file: p.original ? decodeURIComponent(p.original.source.split('/').pop()) : null,
      };
    }
    await sleep(200);
  }
  return out;
}

// 新页面的 infobox 类型行，用来给候选页自动归类
async function infoboxKind(titles) {
  const out = {};
  for (const title of titles) {
    try {
      const json = await api({action: 'parse', page: title, prop: 'wikitext', redirects: '1'});
      const wikitext = json.parse?.wikitext?.['*'] || '';
      const m = wikitext.match(/\|\s*(?:type|category)\s*=\s*([^\n|]+)/i);
      out[title] = m ? m[1].trim() : null;
    } catch { out[title] = null; }
    await sleep(200);
  }
  return out;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = process.argv.includes('--out') ? resolve(process.argv[process.argv.indexOf('--out') + 1]) : resolve(__dirname, '../tmp/wiki-equipment-audit');
mkdirSync(outDir, {recursive: true});

console.error('抓取武器/手雷分类…');
const wikiEquipable = new Map(); // norm(title) -> {title, bucket}
const sectionLog = {};
for (const cat of WEAPON_CATS) {
  const {pages} = await members(cat);
  sectionLog[cat] = pages.length;
  console.error(`  ${cat}: ${pages.length} 页`);
  for (const t of pages) if (!wikiEquipable.has(norm(t))) wikiEquipable.set(norm(t), {title: t, bucket: cat});
}

console.error('抓取战备子分类…');
const stratDetail = {};
for (const sub of STRATAGEM_SUBCATS) {
  const {pages} = await members(sub);
  stratDetail[sub] = pages;
  console.error(`  ${sub}: ${pages.length} 页`);
  for (const t of pages) if (!wikiEquipable.has(norm(t))) wikiEquipable.set(norm(t), {title: t, bucket: 'Stratagems/' + sub});
}
const stratPages = [...new Set(Object.values(stratDetail).flat())];
sectionLog['Stratagems(子分类去重)'] = stratPages.length;

console.error('抓取页面属性（头图/修订号）…');
const props = await pageProps([...wikiEquipable.values()].map(v => v.title));

// 仓库侧按归一化标题对齐
const repoItems = catalog.equipment.map(e => {
  const src = snapshot.items.find(s => s.id === e.id);
  return {id: e.id, name: e.name, name_en: e.name_en, selection_slot: e.selection_slot,
    page_title: src?.page_title || null, revid_at_snapshot: src?.provenance?.revid || null,
    icon: e.icon || null, snapshot_category: src?.category || null};
});
const repoByNorm = new Map();
for (const it of repoItems) for (const key of [it.page_title, it.name_en]) {
  const n = norm(key);
  if (n && !repoByNorm.has(n)) repoByNorm.set(n, it);
}

const newOnWiki = [...wikiEquipable.values()].filter(v => !repoByNorm.has(norm(v.title)) && !props[v.title]?.missing);
const missingOnWiki = repoItems.filter(it => ![it.page_title, it.name_en].map(norm).filter(Boolean).some(k => wikiEquipable.has(k)));
const iconDiff = [], revisedSince = [];
for (const it of repoItems) {
  const hit = [it.page_title, it.name_en].map(norm).filter(Boolean).map(k => wikiEquipable.get(k)).find(Boolean);
  if (!hit) continue;
  const p = props[hit.title];
  if (it.revid_at_snapshot && p?.lastrevid && p.lastrevid !== it.revid_at_snapshot) {
    revisedSince.push({id: it.id, name_en: it.name_en, snapshot_revid: it.revid_at_snapshot, wiki_revid: p.lastrevid});
  }
  const iconFile = it.icon ? decodeURIComponent(it.icon.split('/').pop()).replace(/^240px-/, '') : null;
  if (p?.original_file && iconFile && p.original_file !== iconFile) {
    iconDiff.push({id: it.id, name_en: it.name_en, catalog_icon_file: iconFile, wiki_current_file: p.original_file, wiki_url: p.original});
  }
}

console.error(`拉取 ${newOnWiki.length} 个新页面的 infobox 类型…`);
const kinds = await infoboxKind(newOnWiki.map(v => v.title));

const report = {
  generated_at: new Date().toISOString(),
  wiki_api: API,
  repo_counts: {catalog: repoItems.length, snapshot: snapshot.items.length},
  wiki_section_counts: sectionLog,
  wiki_equipable_total: wikiEquipable.size,
  new_on_wiki: newOnWiki.map(v => ({wiki_title: v.title, bucket: v.bucket, infobox_kind: kinds[v.title] ?? null, pageimage: props[v.title]?.original_file ?? null})),
  missing_on_wiki: missingOnWiki,
  icon_diff: iconDiff,
  revised_since_snapshot: revisedSince,
  pageprops: props,
};
const outFile = resolve(outDir, 'report.json');
writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(`wiki 可装备页面总数: ${wikiEquipable.size}（仓库 catalog ${repoItems.length}）`);
console.log(`\n=== wiki 新增 ${newOnWiki.length} ===`);
for (const n of newOnWiki) console.log(`  [${n.bucket}] ${n.title} — 类型:${kinds[n.title] ?? '?'} 头图:${props[n.title]?.original_file ?? '?'}`);
console.log(`\n=== 仓库独有（wiki 找不到）${missingOnWiki.length} ===`);
for (const m of missingOnWiki) console.log(`  ${m.id} (${m.name_en}, 页面:${m.page_title})`);
console.log(`\n=== 图标与 wiki 当前头图不一致 ${iconDiff.length} ===`);
for (const d of iconDiff) console.log(`  ${d.id}: ${d.catalog_icon_file} -> ${d.wiki_current_file}`);
console.log(`\n=== 快照(2026-10-23)后有修订 ${revisedSince.length} ===`);
for (const r of revisedSince) console.log(`  ${r.id}: revid ${r.snapshot_revid} -> ${r.wiki_revid}`);
console.log(`\n完整报告: ${outFile}`);
