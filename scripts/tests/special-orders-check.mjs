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
  "SPECIAL_ORDER_RETENTION_MS",
  "specialOrderExpired",
  "specialOrderModels",
  "specialOrderDispatchIds",
  "OFFICIAL_TEXTS_URL",
  "officialItem.raw_message",
  "strategic:   data.strategic",
  "js/rich-text.js?v=",
  "window.HD2Rich.toHtml",
  "renderSpecialOrders(data)",
  "assignments_all: Array.isArray",
  'class="special-target-list"'
]) assert.ok(html.includes(marker), `缺少独立指令实现标记：${marker}`);
assert.match(html, /const SPECIAL_ORDER_RETENTION_MS = 7 \* 24 \* 60 \* 60 \* 1000;/,
  "战略通道记录必须在发布后 7 天退场");
assert.ok(html.includes("指令发布 7 天后自动解除"),
  "过期通道应显示统一空态并说明 7 天规则");
assert.ok(!html.includes('class="pd-chip pd-chip-tac"'),
  "战术目标不应继续渲染在首页星球卡片");

// 旧函数已移除：不能让战略机遇继续塞回重要指令正文。
assert.ok(!html.includes("function renderStrategicOpportunities"), "旧内嵌战略机遇渲染器仍存在");
assert.ok(!html.includes("${renderStrategicOpportunities(data)}"), "重要指令仍引用旧战略机遇渲染器");
assert.ok(html.includes(".filter(d => !specialIds.has(String(d && d.id)))"), "普通资讯应排除独立通道项");

const css = fs.readFileSync(path.join(site, "css/home.css"), "utf8");
assert.match(css, /\.special-orders-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3/);
for (const kind of ["directive", "opportunity", "minor"]) {
  assert.ok(css.includes(`.special-order-card.channel-${kind}`), `缺少 ${kind} 通道样式`);
}

// 富文本强调统一走 js/rich-text.js：主站、播报层、战报同一套规则。
const richText = fs.readFileSync(path.join(site, "js/rich-text.js"), "utf8");
for (const marker of ["<(i|ci)", "rt-hl-y", "rt-hl-b", "toHtml", "toPlain"]) {
  assert.ok(richText.includes(marker), `富文本模块缺少标记：${marker}`);
}
const tokens = fs.readFileSync(path.join(site, "css/tokens.css"), "utf8");
assert.match(tokens, /\.rt-hl-y[^{]*\{[^}]*var\(--mo-yellow\)/, "黄色强调需复用 --mo-yellow");
assert.match(tokens, /\.rt-hl-b[^{]*\{[^}]*var\(--mo-place\)/, "蓝色强调需复用 --mo-place");
const announce = fs.readFileSync(path.join(site, "js/mo-announce.js"), "utf8");
assert.ok(announce.includes("global.HD2Rich"), "播报层应优先调用 HD2Rich");
const reportModel = fs.readFileSync(path.join(root, "HD2-Report/report-model.js"), "utf8");
assert.ok(reportModel.includes("item.official_message || item.translated"), "战报应优先取带标签原文");
assert.ok(reportModel.includes("splitRich"), "战报需把富文本拆成标题/正文");
const reportHtml = fs.readFileSync(path.join(root, "HD2-Report/index.html"), "utf8");
assert.ok(reportHtml.includes("js/rich-text.js?v="), "战报页需引入富文本模块");

const fetchSource = fs.readFileSync(path.join(root, "scripts/fetch_site_data.py"), "utf8");
assert.ok(fetchSource.includes("def normalize_assignment"));
assert.ok(fetchSource.includes('base["assignments_all"]'));
assert.ok(fetchSource.includes('"assignments_all": assignments_all'));

console.log("special-orders-check: all assertions passed");
