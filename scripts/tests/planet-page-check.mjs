import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(root, 'HD2-Galatic_war-Map/planet.html'), 'utf8');

// ---- 1) 既有锚点全部保留（外部深链兼容） ----
for (const id of ['sec-war', 'sec-stats', 'sec-regions', 'sec-env', 'sec-links', 'sec-trend', 'sec-src']) {
  assert.ok(html.includes(`id="${id}"`), `锚点 #${id} 必须保留`);
}

// ---- 2) 数据口径常量与公式不许改 ----
assert.ok(html.includes('const LIB_RATE_K = 90;'), 'LIB_RATE_K 必须保持 90');
assert.ok(html.includes('const BASE_MAX_HEALTH = 1000000;'), 'BASE_MAX_HEALTH 必须保持 100 万');
assert.ok(html.includes('(1 - p.health / p.maxHealth) * 100'), '解放进度公式必须保持');
assert.ok(html.includes('* LIB_RATE_K / p.maxHealth * 100'), '推演速率公式必须保持');
assert.ok(html.includes('function etaOfNet'), 'ETA 计算必须保留');
assert.ok(html.includes('rateModel(p)'), '实测优先的 rateModel 必须保留');
assert.ok(html.includes('HD2Recent.load'), '实测帧加载必须保留');

// ---- 3) 依赖模块与 SEO 基建 ----
for (const src of ['./js/forecast.js', './js/regions.js', './js/rate-source.js', './css/forecast.css']) {
  assert.ok(html.includes(src), `依赖 ${src} 必须保留`);
}
assert.ok(html.includes('rel="canonical"'), 'canonical 必须保留');
assert.ok(html.includes('application/ld+json'), 'JSON-LD 生成必须保留');
assert.ok(html.includes('setMeta()'), '动态 meta 必须保留');
assert.ok(html.includes('meta name="robots"'), 'robots meta 必须保留');

// ---- 4) 响应式断点与硬性 UI 要求 ----
assert.ok(/min-width:\s*1280px/.test(html), '≥1280 三栏断点');
assert.ok(/min-width:\s*900px/.test(html), '≥900 两栏断点');
assert.ok(/min-width:\s*700px/.test(html), '≥700 断点');
assert.ok(/max-width:\s*600px/.test(html), '<600 断点');
assert.ok(html.includes('prefers-reduced-motion'), 'reduced-motion 支持');
assert.ok(html.includes('.table-wrap'), '横向滚动表格壳');
assert.ok(html.includes('scroll-margin-top'), '锚点跳转不被 sticky 顶栏遮住');
assert.ok(html.includes('role="img" aria-label='), '进度环 aria-label');
assert.ok(html.includes('loading="lazy"'), '图片 lazy loading');
assert.ok(html.includes('decoding="async"'), '图片 async 解码');
assert.ok(html.includes('role="img"'), '图表/进度环 role=img');

// ---- 5) 不引入新依赖 / 外部请求 ----
const external = html.match(/(?:src|href)="https?:\/\/(?!jerry114514\.github\.io)[^"]+"/g) || [];
assert.deepEqual(external, [], '不新增外站脚本/样式/图片');

// ---- 6) 内联脚本可编译（语法级，不执行） ----
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
assert.ok(blocks.length === 1, '恰好一个内联脚本块');
new vm.Script(blocks[0], { filename: 'planet-inline.js' }); // 语法错误会抛

// ---- 7) 数据真实性：未接入项如实标注，不造 Companion 语义 ----
assert.ok(html.includes('尚未接入'), 'POI/剧情/战术行动必须标注“尚未接入”而非伪造');
assert.ok(!/STAGING/i.test(html), '不引入 Companion 的 STAGING 语义');
assert.ok(html.includes('不是这颗星球的历史曲线') || html.includes('不是这颗星球的历史'), '全服趋势不得误写为单星球历史');
assert.ok(!/helldiverscompanion\.com/.test(html), '不引用社区站点运行时数据');

// ---- 8) 交互可访问性 ----
assert.ok(html.includes('aria-expanded'), '区域展开按钮 aria-expanded');
assert.ok(html.includes('aria-label="区块导航"'), '区块导航 aria-label');
assert.ok(html.includes('focus-visible'), '键盘焦点可见样式');

console.log('planet-page-check: all assertions passed');
