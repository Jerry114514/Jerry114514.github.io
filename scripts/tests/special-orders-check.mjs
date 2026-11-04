import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const site = path.join(root, "HD2-Galatic_war-Map");
const data = JSON.parse(fs.readFileSync(path.join(site, "data.json"), "utf8"));

assert.ok(Array.isArray(data.assignments_all), "data.json 必须保留全部 assignment");
const directive = data.assignments_all.find(a => /STRATEGIC\s+(?:DIRECTIVE|THREAT)/i.test(a.title));
if (directive) {
  assert.ok(Array.isArray(directive.tasks) && directive.tasks.length > 0);
  assert.ok(directive.deadline, "战略指令必须有截止时间");
}

const official = JSON.parse(fs.readFileSync(path.join(site, "data/translated/official_texts.json"), "utf8"));
const dispatch = (data.news.find(n => n.id === 3989) ||
  (official.dispatches || []).find(n => n.id === 3989));
if (dispatch) {
  const translated = dispatch.translated || dispatch.raw_message || "";
  assert.match(translated, /<i=3>新战略指令<\/i>|^新战略指令/);
  assert.match(translated, /守住边陲、克里姆西卡、大流士II和水委一次星/);
}

const html = fs.readFileSync(path.join(site, "index.html"), "utf8");
for (const marker of [
  'id="block-special-orders"',
  "SPECIAL_ORDER_META",
  "specialOrderModels",
  "specialOrderDispatchIds",
  "OFFICIAL_TEXTS_URL",
  "officialItem.raw_message",
  "strategic:   data.strategic",
  ".replace(/&lt;i=1&gt;/g",
  "renderSpecialOrders(data)",
  "assignments_all: Array.isArray",
  'class="special-target-list"'
]) assert.ok(html.includes(marker), `缺少独立指令实现标记：${marker}`);

// 旧函数已移除：不能让战略机遇继续塞回重要指令正文。
assert.ok(!html.includes("function renderStrategicOpportunities"), "旧内嵌战略机遇渲染器仍存在");
assert.ok(!html.includes("${renderStrategicOpportunities(data)}"), "重要指令仍引用旧战略机遇渲染器");
assert.ok(html.includes(".filter(d => !specialIds.has(String(d && d.id)))"), "普通资讯应排除独立通道项");

const css = fs.readFileSync(path.join(site, "css/home.css"), "utf8");
assert.match(css, /\.special-orders-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3/);
for (const kind of ["directive", "opportunity", "minor"]) {
  assert.ok(css.includes(`.special-order-card.channel-${kind}`), `缺少 ${kind} 通道样式`);
}

const fetchSource = fs.readFileSync(path.join(root, "scripts/fetch_site_data.py"), "utf8");
assert.ok(fetchSource.includes("def normalize_assignment"));
assert.ok(fetchSource.includes('base["assignments_all"]'));
assert.ok(fetchSource.includes('"assignments_all": assignments_all'));

console.log("special-orders-check: all assertions passed");
