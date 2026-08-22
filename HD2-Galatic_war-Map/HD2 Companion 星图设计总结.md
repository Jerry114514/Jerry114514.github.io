# HD2 Companion 星图设计总结

> 参考对象：helldivers-2/companion (Next.js 16 + Leaflet + Tailwind CSS)
> 目标：将设计参数移植到当前 Canvas 星图版本

---

## 第一章：配色速查表

### 1.1 深色太空主题背景

| 用途 | 色值 | 说明 |
|------|------|------|
| 主背景色 | `#0a0e1a` | 深空底色，最底层 |
| 背景渐变中心 | `#141b33` | 径向渐变内圈 |
| 卡片/面板背景 | `rgba(15, 23, 42, 0.94)` | 半透明深色面板 |
| 星区背景框填充 | `rgba(255, 255, 255, 0.04)` | 极淡半透明白 |
| 星区背景框边框 | `rgba(255, 255, 255, 0.12)` | 浅色虚边框 |

### 1.2 阵营颜色

| 阵营 | 色值 | 对应节点主色 |
|------|------|------------|
| 超级地球 (Humans) | `#3b82f6` | 蓝色 |
| 机器人 (Automatons) | `#ef4444` | 红色 |
| 终结族 (Terminids) | `#f59e0b` | 金色/橙色 |
| 光能族 (Illuminate) | `#8b5cf6` | 紫色 |

### 1.3 状态颜色

| 状态 | 色值 | 用途 |
|------|------|------|
| WINNING (优势) | `#22c55e` | 进度环 > 50% |
| STALEMATE (僵持) | `#f59e0b` | 进度环 25%~50% |
| LOSING (劣势) | `#ef4444` | 进度环 < 25% |
| DEFENSE (防御战) | `#f97316` | 防御战标记 |
| RECON (侦察战) | `#a78bfa` | 侦察战标记 |
| LIBERATION (解放战) | `#22c55e` | 解放战标记 |

### 1.4 文字颜色

| 用途 | 色值 | 字体大小 |
|------|------|---------|
| 主标题/节点名 | `#e2e8f0` | 13px bold |
| 次要文字 | `#94a3b8` | 12px |
| 星区标签 | `rgba(255, 255, 255, 0.35)` | 13px |
| 状态数字 | `#f1f5f9` | 11px monospace |
| 进度百分比 | `#facc15` | 12px bold |

---

## 第二章：星球节点设计

### 2.1 Marker 尺寸

| 状态 | 半径 | 说明 |
|------|------|------|
| 正常 | 18px | 默认节点圆 |
| 悬停 (Hover) | 24px | 外圈发光 + 白色描边 |
| 进度环外径 | 23px | 节点半径 + 5px |
| 发光外圈 | 34px | 径向渐变，透明度 0.33 |

### 2.2 颜色映射规则

- 节点主色固定为所属阵营颜色（见 1.2）
- 不存在按战役状态改变节点颜色的情况
- 进展情况通过**进度环**颜色表达，而非节点本身颜色
- 节点颜色与阵营严格对应，即使处于防御战也不变色

### 2.3 战役状态指示器

| 战役类型 | 标记 | 样式 | 位置 |
|---------|------|------|------|
| 解放战 (Liberation) | 无显式标记 | 仅通过进度环隐式表达 | — |
| 防御战 (Defense) | "D" | 白色粗体 9px monospace | 节点圆心 |
| 侦察战 (Recon) | 无显式标记 | 进度环显示为紫色 | — |
| MO 目标 | 橙色光晕环 | 节点外围闪烁 | 节点外圈 |
| 已完成 | 绿色勾 | 可选，当前不实现 | — |

### 2.4 进度环绘制参数

| 参数 | 值 | 说明 |
|------|-----|------|
| 线宽 | 4px | 圆环粗细 |
| 起始角度 | `-π/2` | 12 点钟方向 |
| 线帽 (lineCap) | `round` | 圆头端点 |
| 颜色阈值 | >50%: `#22c55e`, 25~50%: `#f59e0b`, <25%: `#ef4444` | 三段式 |
| 背景环 | 不绘制 | 纯进度环，无灰色底环 |

### 2.5 节点高光

| 效果 | 参数 |
|------|------|
| 顶部高光点 | 从 (x-5, y-6) 开始的径向渐变，白色 0.35 → 透明 |
| 底部发光 | 节点外圈径向渐变，阵营色 0.33 → 透明，半径 1.9x 节点半径 |
| 阴影发光 | `shadowBlur: 18px`，shadowColor 为阵营色 |

---

## 第三章：攻击路径设计

### 3.1 线路颜色

| 进攻方 | 线色 | 说明 |
|--------|------|------|
| 终结族 (Terminids) | `#f59e0b` | 橙色 |
| 机器人 (Automaton) | `#ef4444` | 红色 |
| 光能族 (Illuminate) | `#8b5cf6` | 紫色 |
| 超级地球 (Humans) | `#3b82f6` | 蓝色（解放战） |

### 3.2 线宽规则

| 攻击速率 | 线宽 | 说明 |
|---------|------|------|
| 默认 | 2px | 最低宽度 |
| 每增加 1% / h | +2px | 按 `rate` 参数递增 |
| 最大 | 8px | 上限 |

### 3.3 箭头样式

| 参数 | 值 |
|------|-----|
| 形状 | 三角形箭头 |
| 尺寸 | 前端 9px，两侧 5px |
| 位置 | 曲线 70% 处 |
| 颜色 | 与线色一致 |
| 角度 | 由曲线切线方向决定 |

### 3.4 流动动画

| 参数 | 值 |
|------|-----|
| 光点颜色 | 纯白 `#ffffff` |
| 光点尺寸 | 线宽 × 0.7 |
| 发光 | `shadowBlur: 14px`，shadowColor 为线色 |
| 速度 | 每帧偏移 0.5%，100 帧循环 |
| 位置 | 沿贝塞尔曲线（二次贝塞尔，控制点偏移 dy * 0.18） |

---

## 第四章：星区标识设计

### 4.1 星区背景框

| 参数 | 值 | 说明 |
|------|-----|------|
| 填充透明度 | `rgba(主色, 0.08)` | 半透明，几乎不可见，仅提供轻微色感 |
| 边框 | `rgba(主色, 0.30)` | 30% 透明度，虚线 |
| 边框粗细 | 1px | 极细 |
| 虚线样式 | `[4, 4]` | 短虚线，4px 实 + 4px 空 |
| 圆角 | 12px | 圆角矩形 |
| 内边距 | 36px | 节点边界框四周扩展 36px |

### 4.2 星区名称标签

| 参数 | 值 |
|------|-----|
| 字体 | `13px Microsoft YaHei, sans-serif` |
| 颜色 | `rgba(255, 255, 255, 0.40)` |
| 对齐 | `textAlign: center` |
| 位置 | 区域框上方 8px |

### 4.3 星区颜色区分

使用 `SECTOR_COLORS` 映射表为每个已知星区分配一个主色。色相分布原则：相邻星区用不同色相，避免视觉混淆。未知星区统一用 `#64748b`（石板灰）。

---

## 第五章：交互设计

### 5.1 悬停 (Hover)

| 视觉反馈 | 参数 |
|---------|------|
| 外圈发光 | 白色描边圆，半径 27px，`shadowBlur: 26px` |
| 线宽 | 2px 白色 |
| 光标 | 切换为 `pointer` |
| 激活方式 | `mousemove` 事件，30px 半径命中检测 |

### 5.2 Tooltip / Popup

| 参数 | 值 |
|------|-----|
| 触发 | 悬停自动显示 |
| 停留 | 跟随鼠标移动 |
| 背景 | `rgba(10, 14, 26, 0.94)` |
| 边框 | `#334155`，1px |
| 圆角 | 8px |
| 内边距 | 12px 上下 + 12px 左右 |
| 行高 | 20px |
| 宽度 | 190px |
| 定位 | 节点右侧 34px 偏移；右侧溢出时翻转到左侧 |
| 内容 | 节点名、阵营、星区、战况类型、健康度、玩家人数 |
| 字体 | 第一行: 13px bold; 其余: 12px |

### 5.3 点击行为

| 动作 | 结果 |
|------|------|
| 点击星球节点 | 跳转到 `index.html?planet={id}` |
| 鼠标离开画布 | 清除悬停状态 |

### 5.4 刷新

| 参数 | 值 |
|------|-----|
| 自动刷新间隔 | 5 分钟 (300s) |
| 手动刷新按钮 | 工具栏右侧「🔄 刷新」 |
| 加载状态 | 加载中显示 spinner + 文字提示 |

---

## 第六章：图例与控件

### 6.1 图例

| 位置 | 底部，水平居中 |
|------|--------------|
| 内容 | 阵营色点（4 个）+ 攻击线示意 + 进度环示意 + 防御战标记 |
| 样式 | 小圆点 + 文字标签，水平排列 |
| 点直径 | 10px |
| 间距 | 每项之间 16px 间距 |

### 6.2 控件

| 控件 | 位置 | 样式 |
|------|------|------|
| 节点统计 | 工具栏右侧 | `span`，文字 `节点 N` |
| 连线统计 | 工具栏右侧 | `span`，文字 `连线 N` |
| 最后更新时间 | 工具栏右侧 | `span`，ISO 时间格式化 |
| 刷新按钮 | 工具栏最右侧 | `button`，蓝色背景 |
| 返回按钮 | 工具栏左侧 | `a` 链接，`◀ 返回战况面板` |

---

## 第七章：Canvas 实现建议

### 7.1 坐标映射（Y 轴翻转）

```javascript
// renderer.js _mapCoords()
const margin = 60;
const w = canvasWidth - margin * 2;
const h = canvasHeight - margin * 2;
node.px = margin + (node.x + 1) / 2 * w;
node.py = margin + (-node.y + 1) / 2 * h;  // Y 轴翻转
```

### 7.2 绘制星区背景

```javascript
// 星区边框
ctx.fillStyle = "rgba(59, 130, 246, 0.08)";  // 主色 8% 填充
ctx.strokeStyle = "rgba(59, 130, 246, 0.30)"; // 主色 30% 虚线边框
ctx.lineWidth = 1;
ctx.setLineDash([4, 4]);
roundRect(ctx, x, y, w, h, 12);
ctx.fill();
ctx.stroke();
ctx.setLineDash([]);

// 星区名标签
ctx.fillStyle = "rgba(255, 255, 255, 0.40)";
ctx.font = "13px 'Microsoft YaHei', sans-serif";
ctx.textAlign = "center";
ctx.fillText(secName, x + w / 2, y - 8);
```

### 7.3 绘制节点

```javascript
// 发光外圈
const glow = ctx.createRadialGradient(px, py, r * 0.4, px, py, r * 1.9);
glow.addColorStop(0, "#3b82f6" + "55");  // 阵营色 + 33% 透明度
glow.addColorStop(1, "transparent");
ctx.fillStyle = glow;
ctx.arc(px, py, r * 1.9, 0, 2 * Math.PI);
ctx.fill();

// 主圆
ctx.shadowColor = "#3b82f6";
ctx.shadowBlur = 18;
ctx.arc(px, py, r, 0, 2 * Math.PI);
ctx.fillStyle = "#3b82f6";  // 阵营色
ctx.fill();
ctx.shadowBlur = 0;

// 高光
const hl = ctx.createRadialGradient(px - 5, py - 6, 2, px, py, r);
hl.addColorStop(0, "rgba(255,255,255,0.35)");
hl.addColorStop(1, "transparent");
ctx.fillStyle = hl;
ctx.arc(px, py, r, 0, 2 * Math.PI);
ctx.fill();

// 进度环
const start = -Math.PI / 2;
const end = start + (progress / 100) * Math.PI * 2;
ctx.strokeStyle = progress > 50 ? "#22c55e" : progress > 25 ? "#f59e0b" : "#ef4444";
ctx.lineWidth = 4;
ctx.lineCap = "round";
ctx.arc(px, py, r + 5, start, end);
ctx.stroke();
ctx.lineCap = "butt";
```

### 7.4 绘制攻击路径

```javascript
// 贝塞尔曲线
const dx = tgt.px - src.px, dy = tgt.py - src.py;
const cx = (src.px + tgt.px) / 2 - dy * 0.18;
const cy = (src.py + tgt.py) / 2 + dx * 0.18;
ctx.strokeStyle = "#ef4444";  // 进攻方阵营色
ctx.lineWidth = Math.min(2 + rate * 2, 8);
ctx.globalAlpha = 0.65;
ctx.beginPath();
ctx.moveTo(src.px, src.py);
ctx.quadraticCurveTo(cx, cy, tgt.px, tgt.py);
ctx.stroke();

// 流动光点
ctx.arc(pt.x, pt.y, lw * 0.7, 0, 2 * Math.PI);
ctx.fillStyle = "#ffffff";
ctx.shadowColor = "#ef4444";
ctx.shadowBlur = 14;
ctx.fill();

// 箭头
ctx.translate(ap.x, ap.y);
ctx.rotate(angle);
ctx.beginPath();
ctx.moveTo(9, 0);
ctx.lineTo(-5, -5);
ctx.lineTo(-5, 5);
ctx.closePath();
ctx.fillStyle = "#ef4444";
ctx.fill();
```

### 7.5 Tooltip 绘制

```javascript
ctx.fillStyle = "rgba(10, 14, 26, 0.94)";
ctx.strokeStyle = "#334155";
ctx.lineWidth = 1;
// 圆角矩形
roundRect(ctx, x, y, 190, h, 8);
ctx.fill();
ctx.stroke();

// 第一行（标题）
ctx.fillStyle = "#e2e8f0";
ctx.font = "bold 13px 'Microsoft YaHei', sans-serif";
ctx.textAlign = "left";
ctx.fillText("📍 星球名", x + 12, y + 26);

// 其余行
ctx.fillStyle = "#94a3b8";
ctx.font = "12px 'Microsoft YaHei', sans-serif";
ctx.fillText("阵营: 超级地球", x + 12, y + 46);
```

### 7.6 悬停反馈

```javascript
ctx.strokeStyle = "#ffffff";
ctx.lineWidth = 2;
ctx.shadowColor = "#ffffff";
ctx.shadowBlur = 26;
ctx.beginPath();
ctx.arc(px, py, 27, 0, 2 * Math.PI);
ctx.stroke();
```

### 7.7 命中检测

```javascript
function getNodeAt(mx, my) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const dx = mx - n.px, dy = my - n.py;
    if (dx * dx + dy * dy < 30 * 30) return n;
  }
  return null;
}
```

---

## 当前实现状态对照

| 功能 | HD2 Companion 参考 | 当前 Canvas 版本 |
|------|-------------------|-----------------|
| 背景 | 深空渐变 | ✅ 已实现 |
| 阵营颜色 | `#3b82f6/#ef4444/#f59e0b/#8b5cf6` | ✅ 已实现 |
| 节点半径 | 18px 正常/24px 悬停 | ✅ 21px/27px |
| 节点高光 | 顶部高光 + 底部发光 | ✅ 已实现 |
| 进度环 | 三段式颜色，4px，round cap | ✅ 已实现 |
| 防御战 D 标记 | 白色粗体 9px | ✅ 已实现 |
| 星区背景框 | 半透明虚线边框 + 标签 | ✅ 已实现 |
| 攻击线 | 贝塞尔曲线 + 流动光点 + 箭头 | ✅ 已实现 |
| 流动动画 | 每帧 0.5% 偏移，100 帧循环 | ✅ 已实现 |
| Y 轴翻转 | 游戏坐标系 → Canvas 坐标系 | ✅ 已实现 |
| 悬停反馈 | 白色发光描边 | ✅ 已实现 |
| Tooltip | 深色圆角面板，190px 宽 | ✅ 已实现 |
| 点击跳转 | 到主站详情页 | ✅ 已实现 |
| 自动刷新 | 5 分钟 | ✅ 已实现 |
| 图例 | 底部居中 | ✅ 已实现 |
| 统计 | 节点/连线/最后更新 | ✅ 已实现 |
| 星区颜色 | 多色相区分 | ✅ 已实现（SECTOR_COLORS 表） |