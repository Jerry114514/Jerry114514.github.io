/* ============================================================
   HD2 银河战争态势图 - Canvas 渲染器 v2
   缩放/平移 + 缩小节点 + 攻击线（基于 campaigns）
   ============================================================ */
"use strict";

const RACE_COLORS = {
  1: "#f59e0b", 2: "#ef4444", 3: "#8b5cf6", 4: "#3b82f6",
};

const SECTOR_COLORS = {
  "半藏": "rgba(59, 130, 246, 1)", "阿基拉": "rgba(239, 68, 68, 1)",
  "欧米茄": "rgba(139, 92, 246, 1)", "寂域": "rgba(16, 185, 129, 1)",
  "猎户座": "rgba(245, 158, 11, 1)", "法尔赛特": "rgba(14, 165, 233, 1)",
  "太阳系": "rgba(59, 130, 246, 1)", "巴纳德": "rgba(34, 197, 94, 1)",
  "康古利伊": "rgba(168, 85, 247, 1)", "坎托鲁斯": "rgba(249, 115, 22, 1)",
  "塞勒斯特": "rgba(14, 165, 233, 1)", "天龙": "rgba(239, 68, 68, 1)",
  "斯坦": "rgba(236, 72, 153, 1)", "仙女座": "rgba(236, 72, 153, 1)",
  "阿图里昂": "rgba(34, 197, 94, 1)", "阿尔斯特拉德": "rgba(249, 115, 22, 1)",
  "阿尔特斯": "rgba(14, 165, 233, 1)", "博格斯": "rgba(168, 85, 247, 1)",
  "坎克里": "rgba(16, 185, 129, 1)", "锦栖": "rgba(236, 72, 153, 1)",
  "默里迪亚": "rgba(139, 92, 246, 1)", "土卫十九": "rgba(34, 197, 94, 1)",
  "霍金": "rgba(245, 158, 11, 1)", "瓦尔迪斯": "rgba(236, 72, 153, 1)",
  "未知星区": "rgba(100, 116, 139, 1)",
};

class StarMapRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.nodes = [];
    this.links = [];
    this.supplyLines = [];
    this.hoveredNode = null;
    this.animationId = null;
    this.flowOffset = 0;
    this.stars = null;
    this.sectorBoundsCache = null;
    // 缩放/平移
    this.scale = 1.0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.onZoomChange = null;
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.sectorBoundsCache = null;
  }

  setData(nodes, links, supplyLines) {
    this.nodes = nodes;
    this.links = links;
    this.supplyLines = supplyLines || [];
    this.stars = null;
    this.sectorBoundsCache = null;
    // 缩放适应：使所有节点可见
    this.fitToView();
  }

  fitToView() {
    if (!this.nodes.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.nodes.forEach(n => { if (n.px < minX) minX = n.px; if (n.px > maxX) maxX = n.px; if (n.py < minY) minY = n.py; if (n.py > maxY) maxY = n.py; });
    const margin = 60;
    const availW = this.width - margin * 2;
    const availH = this.height - margin * 2;
    const contentW = maxX - minX || 1;
    const contentH = maxY - minY || 1;
    const fitScale = Math.min(availW / contentW, availH / contentH, 1.5);
    this.scale = Math.min(3.0, Math.max(0.3, fitScale));
    this.offsetX = (this.width - (minX + maxX) * this.scale) / 2;
    this.offsetY = (this.height - (minY + maxY) * this.scale) / 2;
  }

  _mapCoords() {
    const margin = 60;
    const w = this.width - margin * 2;
    const h = this.height - margin * 2;
    this.nodes.forEach(node => {
      node.px = margin + (node.x + 1) / 2 * w;
      node.py = margin + (-node.y + 1) / 2 * h;
    });
  }

  // ============ 坐标转换（缩放/平移适配） ============
  toScreen(worldX, worldY) {
    return { px: worldX * this.scale + this.offsetX, py: worldY * this.scale + this.offsetY };
  }
  toWorld(screenX, screenY) {
    return { x: (screenX - this.offsetX) / this.scale, y: (screenY - this.offsetY) / this.scale };
  }

  zoomAt(factor, mouseX, mouseY) {
    const world = this.toWorld(mouseX, mouseY);
    const newScale = Math.min(3.0, Math.max(0.3, this.scale * factor));
    this.offsetX = mouseX - world.x * newScale;
    this.offsetY = mouseY - world.y * newScale;
    this.scale = newScale;
    this.sectorBoundsCache = null;
    if (this.onZoomChange) this.onZoomChange(this.scale);
  }

  pan(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
    this.sectorBoundsCache = null;
  }

  resetView() {
    this.fitToView();
    this.sectorBoundsCache = null;
    if (this.onZoomChange) this.onZoomChange(this.scale);
  }

  // ============ 星区背景 ============
  _calcSectorBounds() {
    if (this.sectorBoundsCache) return this.sectorBoundsCache;
    const groups = {};
    this.nodes.forEach(node => {
      const sec = node.sector || "未知星区";
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(node);
    });
    const result = [];
    for (const [sec, gNodes] of Object.entries(groups)) {
      if (gNodes.length < 1) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      gNodes.forEach(n => { if (n.px < minX) minX = n.px; if (n.px > maxX) maxX = n.px; if (n.py < minY) minY = n.py; if (n.py > maxY) maxY = n.py; });
      const pad = 20;
      result.push({ sector: sec, x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2, nodes: gNodes });
    }
    this.sectorBoundsCache = result;
    return result;
  }

  drawSectorBackgrounds(ctx) {
    const sectors = this._calcSectorBounds();
    sectors.forEach(sec => {
      const color = SECTOR_COLORS[sec.sector] || "rgba(100, 116, 139, 1)";
      const base = color.replace("rgba(", "").replace(", 1)", "").replace(", 1)", "");
      ctx.save();
      ctx.fillStyle = `rgba(${base}, 0.06)`;
      ctx.strokeStyle = `rgba(${base}, 0.25)`;
      ctx.lineWidth = 1 / this.scale;
      ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      this.roundRect(ctx, sec.x, sec.y, sec.width, sec.height, 10 / this.scale);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255, 255, 255, 0.30)";
      ctx.font = `${Math.max(8, 12 / this.scale)}px 'Microsoft YaHei', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(sec.sector, sec.x + sec.width / 2, sec.y - 6 / this.scale);
      ctx.restore();
    });
  }

  // ============ 主循环 ============
  render() {
    this._mapCoords();
    this._drawFrame();
    this.animationId = requestAnimationFrame(() => this.render());
  }

  _drawFrame() {
    const ctx = this.ctx;
    this.drawBackground(ctx);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    this.drawSupplyLines(ctx);
    this.drawSectorBackgrounds(ctx);
    this.links.forEach(l => this.drawLink(ctx, l));
    this.nodes.forEach(n => this.drawNode(ctx, n));
    if (this.hoveredNode) {
      this.drawHover(ctx, this.hoveredNode);
      this.drawTooltip(ctx, this.hoveredNode);
    }

    ctx.restore();
    this.flowOffset = (this.flowOffset + 0.8) % 100;
  }

  stop() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.animationId = null;
  }

  // ============ 供应线绘制 ============
  drawSupplyLines(ctx) {
    if (!this.supplyLines || !this.supplyLines.length) return;
    ctx.save();
    this.supplyLines.forEach(conn => {
      const src = conn.source, tgt = conn.target;
      if (!src || !tgt) return;
      const sx = src.px, sy = src.py, tx = tgt.px, ty = tgt.py;
      if (sx == null || tx == null) return;
      // 视口裁剪：太远不画
      const dx = tx - sx, dy = ty - sy;
      if (Math.abs(dx) > 600 / this.scale || Math.abs(dy) > 600 / this.scale) return;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
      ctx.lineWidth = 0.6 / this.scale;
      ctx.setLineDash([3 / this.scale, 5 / this.scale]);
      ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ============ 命中检测 ============
  getNodeAt(mx, my) {
    const world = this.toWorld(mx, my);
    const hitR = 10 / this.scale;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = world.x - n.px, dy = world.y - n.py;
      if (dx * dx + dy * dy < hitR * hitR * 4) return n;
    }
    return null;
  }

  getHoveredNodeLinks(node) {
    if (!node) return [];
    return this.links.filter(l => {
      if (l.source === node || l.target === node) return true;
      if (l.source && l.target && l.source === l.target && l.source === node) return true;
      return false;
    });
  }

  // ============ 背景 ============
  drawBackground(ctx) {
    const w = this.width, h = this.height;
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, "#141b33");
    g.addColorStop(1, "#0a0e1a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (!this.stars) {
      this.stars = [];
      const n = Math.floor(w * h / 9000);
      for (let i = 0; i < Math.min(n, 160); i++) {
        this.stars.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5 + 0.5, a: Math.random() * 0.5 + 0.25 });
      }
    }
    this.stars.forEach(s => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      ctx.fill();
    });
  }

  // ============ 攻击线（基于 campaigns 阵营色自环） ============
  drawLink(ctx, link) {
    const src = link.source, tgt = link.target;
    if (!src || !tgt) return;
    const sx = src.px, sy = src.py;
    const tx = tgt.px, ty = tgt.py;
    if (sx == null || tx == null) return;

    if (src === tgt || (sx === tx && sy === ty)) {
      // 自环：阵营色虚线圆
      const color = this.getRaceColor(link.faction);
      const isHovered = this.hoveredNode === src;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = isHovered ? 1.0 : 0.6;
      ctx.lineWidth = isHovered ? 2.5 / this.scale : 1.5 / this.scale;
      ctx.setLineDash([4 / this.scale, 4 / this.scale]);
      ctx.beginPath();
      ctx.arc(sx, sy, 16 / this.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }

    // 两点间攻击线（有 source/target 时）
    const color = this.getRaceColor(link.faction);
    const dx = tx - sx, dy = ty - sy;
    const cx = (sx + tx) / 2 - dy * 0.15;
    const cy = (sy + ty) / 2 + dx * 0.15;
    const isHovered = this.hoveredNode && (this.hoveredNode === src || this.hoveredNode === tgt);
    const lw = Math.min(1.5 + (link.rate || 1) * 1.2, 4) / this.scale;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.globalAlpha = isHovered ? 1.0 : 0.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(cx, cy, tx, ty);
    ctx.stroke();

    // 流动光点
    const p = this.flowOffset / 100;
    const pt = this.getPointOnCurve({ x: sx, y: sy }, { x: cx, y: cy }, { x: tx, y: ty }, p);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3 / this.scale, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 / this.scale;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 箭头（70%）
    const ap = this.getPointOnCurve({ x: sx, y: sy }, { x: cx, y: cy }, { x: tx, y: ty }, 0.7);
    const ang = this.getCurveAngle({ x: sx, y: sy }, { x: cx, y: cy }, { x: tx, y: ty }, 0.7);
    ctx.translate(ap.x, ap.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(8 / this.scale, 0);
    ctx.lineTo(-4 / this.scale, -4 / this.scale);
    ctx.lineTo(-4 / this.scale, 4 / this.scale);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 1;
    ctx.fill();
    ctx.restore();
  }

  // ============ 星球节点 ============
  drawNode(ctx, node) {
    const r = 10 / this.scale;
    const color = this.getOwnerColor(node.owner);
    const px = node.px, py = node.py;
    if (px == null) return;

    // 发光外圈
    const glow = ctx.createRadialGradient(px, py, r * 0.3, px, py, r * 2.2);
    glow.addColorStop(0, color + "44");
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // 主圆
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 / this.scale;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.shadowBlur = 0;

    // 高光
    const hl = ctx.createRadialGradient(px - r * 0.3, py - r * 0.35, 1 / this.scale, px, py, r);
    hl.addColorStop(0, "rgba(255,255,255,0.3)");
    hl.addColorStop(1, "transparent");
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    // 进度环
    const progress = this.getProgress(node);
    if (progress > 0) {
      const start = -Math.PI / 2;
      const end = start + (Math.min(progress, 100) / 100) * Math.PI * 2;
      ctx.strokeStyle = progress > 50 ? "#22c55e" : progress > 25 ? "#f59e0b" : "#ef4444";
      ctx.lineWidth = 3 / this.scale;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(px, py, r + 3.5 / this.scale, start, end);
      ctx.stroke();
      ctx.lineCap = "butt";
    }

    // 防御战 D
    if (node.campaignType === "defense") {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${7 / this.scale}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("D", px, py);
    }

    // 名称（缩小字号）
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `${Math.max(6, 9 / this.scale)}px 'Microsoft YaHei', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(node.name || `#${node.id}`, px, py + r + 4 / this.scale);
  }

  getProgress(node) {
    if (!node.maxHealth) return 0;
    return Math.max(0, Math.min(100, (node.health / node.maxHealth) * 100));
  }

  // ============ 悬停 ============
  drawHover(ctx, node) {
    const r = 16 / this.scale;
    const px = node.px, py = node.py;
    if (px == null) return;
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5 / this.scale;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 20 / this.scale;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawTooltip(ctx, node) {
    const px = node.px, py = node.py;
    if (px == null) return;
    const lines = [
      `📍 ${node.name}`,
      `阵营: ${DATA_LAYER.OWNER_CN[node.owner] || node.owner}`,
      `星区: ${node.sector}`,
      `健康度: ${node.maxHealth ? (node.health / node.maxHealth * 100).toFixed(2) : "--"}%`,
      `玩家: ${node.players || 0}`,
    ];
    if (node.campaignType) {
      lines.splice(2, 0, `战况: ${node.campaignType === "defense" ? "防御战" : "解放战"}`);
    }
    const lh = 20 / this.scale, pad = 10 / this.scale;
    const w = 180 / this.scale, h = lines.length * lh + pad * 2;
    // 屏幕坐标（tooltip 在屏幕空间绘制，不受缩放影响）
    const sp = this.toScreen(px, py);
    let x = sp.px + 20, y = sp.py - h / 2;
    if (x + w > this.width - 10) x = sp.px - w - 20;
    if (y < 10) y = 10;
    if (y + h > this.height - 10) y = this.height - h - 10;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(10,14,26,0.94)";
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.fillStyle = i === 0 ? "#e2e8f0" : "#94a3b8";
      ctx.font = i === 0 ? "bold 13px 'Microsoft YaHei', sans-serif" : "12px 'Microsoft YaHei', sans-serif";
      ctx.fillText(line, x + pad, y + pad + i * lh);
    });
    ctx.restore();
  }

  // ============ 辅助 ============
  getOwnerColor(owner) {
    const map = { Humans: "#3b82f6", Automatons: "#ef4444", Terminids: "#f59e0b", Illuminate: "#8b5cf6" };
    return map[owner] || "#64748b";
  }
  getRaceColor(faction) {
    const map = { Terminids: "#f59e0b", Automaton: "#ef4444", Automatons: "#ef4444", Illuminate: "#8b5cf6", Humans: "#3b82f6" };
    return map[faction] || "#94a3b8";
  }
  getPointOnCurve(p1, cp, p2, t) {
    return { x: (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * cp.x + t * t * p2.x, y: (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * cp.y + t * t * p2.y };
  }
  getCurveAngle(p1, cp, p2, t) {
    const dt = 0.001;
    const a = this.getPointOnCurve(p1, cp, p2, t - dt);
    const b = this.getPointOnCurve(p1, cp, p2, t + dt);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}