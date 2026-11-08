import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const source = fs.readFileSync(path.join(root, "HD2-Galatic_war-Map/js/rich-text.js"), "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const R = sandbox.window.HD2Rich;
assert.ok(R && typeof R.toHtml === "function" && typeof R.toPlain === "function", "HD2Rich 需暴露 toHtml/toPlain");

let checks = 0;
function check(name, actual, expected) {
  assert.equal(actual, expected, name);
  checks += 1;
}

/* Arrowhead 原文标记：1=黄，3=蓝，ci 为同义旧写法，裸 <i> 按 1 */
check("i=3 → 蓝色强调", R.toHtml("<i=3>侦测发现“阴霾”扩散</i>"), '<em class="rt-hl-b">侦测发现“阴霾”扩散</em>');
check("i=1 → 黄色强调", R.toHtml("守住<i=1>十字架一</i>。"), '守住<em class="rt-hl-y">十字架一</em>。');
check("ci=1 → 黄色强调", R.toHtml("<ci=1>关键地名</ci>"), '<em class="rt-hl-y">关键地名</em>');
check("裸 <i> → 黄色强调", R.toHtml("<i>裸标签</i>"), '<em class="rt-hl-y">裸标签</em>');
check("未收录编号只剥壳", R.toHtml("<i=2>普通</i>"), "普通");

/* 安全边界：先转义后受控替换，绝不还原原文 HTML */
check("尖括号与 & 转义", R.toHtml("a < b & c"), "a &lt; b &amp; c");
check("script 内容整体丢弃", R.toHtml("前<script>alert(1)</script>后"), "前后");
check("img 标签剥壳", R.toHtml('<img src=x onerror="alert(1)">文字'), "文字");
check("b/strong 保留加粗", R.toHtml("<b>粗</b>"), "<strong>粗</strong>");
check("换行转 <br>", R.toHtml("一\n二"), "一<br>二");

/* 纯文本导出：复制/长图副文本用 */
check("toPlain 去标签并反转义", R.toPlain(R.toHtml("<i=1>十字架一</i> & 边陲")), "十字架一 & 边陲");

/* 空值 */
check("null → 空串", R.toHtml(null), "");
check("undefined → 空串", R.toPlain(undefined), "");

console.log(`rich-text-check: ${checks} assertions passed`);
