import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const site = path.join(root, "HD2-Galatic_war-Map");
const campaignZh = JSON.parse(fs.readFileSync(path.join(site, "data/campaign_zh.json"), "utf8"));
const episode = campaignZh.episodes["3145394140"];
const phase = episode.phases["699333331"];

assert.equal(episode.title, "宁静守护者");
assert.equal(episode.description, "TCS+设施附近发生的轻微且例行的终结族入侵在平民分区引起了不必要的焦虑，导致民间消费下降，还阻碍了商业投资。虽然终结族的“威胁”完全是想象出来的，因为TCS+坚不可摧，但经济放缓的威胁却是非常真实的。绝地潜兵必须向公民保证，联邦拥有绝对的控制权。");
assert.equal(phase.title, "保证");
assert.match(phase.briefing, /^关于TCS\+发生故障的煽动性虚假谣言/);
assert.match(phase.briefing, /奉命消灭700,000,000只终结族/);
assert.match(phase.briefing, /INCINERATOR FRV战略配备。$/);

const tcsImage = path.join(site, "assets/campaign/banner_tcsplus6.webp");
const eagleImage = path.join(site, "assets/campaign/banner_eagle3.webp");
assert.ok(fs.statSync(tcsImage).size > 1000, "当前阶段插画应已本地化");
assert.ok(fs.statSync(eagleImage).size > 1000, "重要指令通知横幅应存在");

const storage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};
const window = { localStorage: storage, sessionStorage: storage };
const document = { readyState: "loading", addEventListener() {}, hidden: false };
vm.runInNewContext(fs.readFileSync(path.join(site, "js/mo-announce.js"), "utf8"), {
  window, document, setTimeout, clearTimeout, console, BroadcastChannel: undefined
});

const brief = "消灭规定数量的终结族，恢复公众的信心，平息有关TCS+故障的非法谣言，保障联邦的繁荣。";
const official = "新重要指令\n\n有关TCS+出现故障的煽动性虚假谣言正在平民通信频道中蔓延，导致了毫无根据的经济恐慌。SEAF情报部门确切表示：公民只要全额购买保险，就完全不会遇到危险。\n\n为了恢复公众信心，绝地潜兵奉命<i=1>消灭700,000,000只终结族</i>。为了协助我方迅速展开行动，捍卫联邦的繁荣，最高指挥部已授权并拨款资助，为整支舰队提供<i=1>INCINERATOR FRV战略配备</i>。";
const data = {
  assignments: {
    id: 1636665659,
    startedAt: "2026-11-03T13:03:20Z",
    briefing: "Eliminate the mandated number of Terminids..."
  },
  major_order: { id32: 1636665659, translated_brief: brief },
  dispatches: [{
    id: 3986,
    published: "2026-11-03T13:00:23Z",
    message: "<i=3>NEW MAJOR ORDER</i>"
  }],
  news: [{ id: 3986, official_message: official, translated: "简版摘要" }],
  active_campaign: {
    title: "SERENE GUARDIAN",
    title_cn: episode.title,
    banner_image_local: "./assets/campaign/banner_tcsplus6.webp",
    phases: [{ briefing_cn: phase.briefing, intro_image_local: "./assets/campaign/banner_tcsplus6.webp" }]
  }
};

const announcement = window.HD2MoAnnounce._test.buildMajorOrderAnnouncement(data, "1636665659");
assert.match(announcement.bodyHtml, /mo-hl-y.*700,000,000只终结族/);
assert.match(announcement.bodyHtml, /INCINERATOR FRV战略配备/);
assert.doesNotMatch(announcement.bodyHtml, /简版摘要/);
assert.equal(announcement.bannerSrc, "./assets/campaign/banner_eagle3.webp",
  "MO 通知不能借用活动战役的阶段插画");

const html = fs.readFileSync(path.join(site, "index.html"), "utf8");
assert.match(html, /phase\.intro_image_local/);
assert.match(html, /_campaignBannerSwap\(p\)/);

console.log("major-order-content-check: all assertions passed");
