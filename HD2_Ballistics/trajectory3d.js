/* Offline classic-script component. Load vendor/three.min.js first, trajectory3d.css separately. */
(function (global) {
  "use strict";

  const TEXT = {
    zh: {
      title: "三维弹道射击场", sub: "真实米制 · 三轴等比", orbit: "自由轨道", side: "侧视", top: "俯视", reset: "全景重置", play: "播放", pause: "暂停", time: "飞行时间", speed: "速度", normal: "普通伤害", durable: "耐久伤害", path: "累计路程", start: "起点", end: "终点", forward: "前", up: "上", right: "右", trajectory: "完整轨迹", traveled: "已飞行", muzzle: "枪口瞄准 · 虚线", velocity: "合成初速 · 箭头", grid: "Y = 0 仅为参考网格，并非碰撞地面；负高度仍可见。", orbitHelp: "WASD 移动 · Q / E 降升 · Shift 加速 · 拖拽旋转 · 右键拖拽平移 · 滚轮缩放", scale: "网格间距", nearest: "最近离散记录", canvas: "交互式三维弹道视图", empty: "没有有效的弹道记录 / No valid trajectory records.", fallback: "3D 视图不可用：未加载 Three.js，或浏览器不支持 WebGL / 图形上下文已丢失。数值结果与其他图表可继续使用。\n3D view unavailable: Three.js is missing, WebGL is unsupported, or the graphics context was lost. Numerical results and other charts remain available.", velocityNote: "箭头仅表示方向；初速", muzzleNote: "枪口仰角", screenshot: "保存 3D 画面", screenshotError: "画面导出不可用 / Image export unavailable", records: "条记录"
    },
    en: {
      title: "3D ballistic range", sub: "True metres · equal axis scale", orbit: "Orbit", side: "Side", top: "Top", reset: "Frame all", play: "Play", pause: "Pause", time: "Flight time", speed: "Speed", normal: "Normal damage", durable: "Durable damage", path: "Path length", start: "Start", end: "End", forward: "forward", up: "up", right: "right", trajectory: "Full trajectory", traveled: "Traveled", muzzle: "Muzzle aim · dashed", velocity: "Initial resultant · arrow", grid: "Y = 0 is a reference grid, not a collision surface; negative heights remain visible.", orbitHelp: "WASD move · Q / E down / up · Shift boost · drag to orbit · right-drag to pan · wheel to zoom", scale: "Grid spacing", nearest: "Nearest recorded sample", canvas: "Interactive three-dimensional trajectory", empty: "没有有效的弹道记录 / No valid trajectory records.", fallback: "3D view unavailable: Three.js is missing, WebGL is unsupported, or the graphics context was lost. Numerical results and other charts remain available.\n3D 视图不可用：未加载 Three.js，或浏览器不支持 WebGL / 图形上下文已丢失。数值结果与其他图表可继续使用。", velocityNote: "Arrow shows direction only; initial speed", muzzleNote: "Muzzle elevation", screenshot: "Save 3D image", screenshotError: "Image export unavailable / 画面导出不可用", records: "records"
    }
  };
  const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function niceStep(v) {
    const power = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1e-12))));
    const f = v / power;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
  }

  class HD2Trajectory3D {
    constructor(hostElement, { records = [], opts = {}, initialVelocity = {}, locale = "zh" } = {}) {
      this.host = hostElement;
      this.opts = opts || {};
      this.initialVelocity = initialVelocity || {};
      this.locale = locale === "en" ? "en" : "zh";
      this.t = TEXT[this.locale];
      this.listeners = [];
      this.labels = [];
      this.resources = new Set();
      this.raf = 0;
      this.destroyed = false;
      this.playing = false;
      this.mode = "orbit";
      this.drag = null;
      this.pointer = null;
      this.dirty = false;
      this.moveKeys = new Set();
      this.navigationFrame = null;
      this.boost = false;
      // Keep the caller's records untouched. Missing Z is compatible with planar results.
      this.records = Array.isArray(records) ? records.filter((r) => r && Number.isFinite(r.time) && Number.isFinite(r.x) && Number.isFinite(r.y) && (r.z == null || Number.isFinite(r.z))) : [];
      let ordered = true;
      for (let i = 1; i < this.records.length; i++) if (this.records[i].time < this.records[i - 1].time) { ordered = false; break; }
      if (!ordered) this.records.sort((a, b) => a.time - b.time);
      if (!hostElement || typeof hostElement.appendChild !== "function") return;
      this._buildUI();
      if (!this.records.length) { this._fallback(this.t.empty); return; }
      this.startTime = this.records[0].time;
      this.endTime = this.records[this.records.length - 1].time;
      this.time = this.endTime;
      this.slider.min = String(this.startTime);
      this.slider.max = String(this.endTime);
      this.slider.step = "any";
      this.slider.value = String(this.time);
      try {
        if (!global.THREE || !global.THREE.WebGLRenderer) throw new Error("Three.js unavailable");
        this.T = global.THREE;
        this._initScene();
        this._bind();
        this._setView("orbit");
        this._resize();
        this._setTime(this.endTime);
      } catch (_) {
        this._releaseGPU();
        this._fallback(this.t.fallback);
      }
    }

    _node(tag, className, text, parent) {
      const n = document.createElement(tag);
      if (className) n.className = className;
      if (text != null) n.textContent = text;
      if (parent) parent.appendChild(n);
      return n;
    }
    _listen(target, event, callback, options) {
      target.addEventListener(event, callback, options);
      this.listeners.push(() => target.removeEventListener(event, callback, options));
    }
    _button(parent, text, callback) {
      const b = this._node("button", "hd2-3d-button", text, parent);
      b.type = "button";
      this._listen(b, "click", callback);
      return b;
    }
    _buildUI() {
      this.root = this._node("section", "hd2-3d", null, this.host);
      this.root.lang = this.locale === "zh" ? "zh-CN" : "en";
      this.root.setAttribute("aria-label", this.t.title);
      const head = this._node("div", "hd2-3d-header", null, this.root);
      const title = this._node("div", "hd2-3d-heading", null, head);
      this._node("span", "hd2-3d-eyebrow", "BALLISTICS / 3D", title);
      this._node("h3", "hd2-3d-title", this.t.title, title);
      this._node("span", "hd2-3d-subtitle", this.t.sub, title);
      const actions = this._node("div", "hd2-3d-actions", null, head);
      this.resetButton = this._button(actions, this.t.reset, () => this._setView("orbit"));
      this.saveButton = this._button(actions, this.t.screenshot, () => this._saveImage());
      this.toolbar = this._node("div", "hd2-3d-toolbar", null, this.root);
      this.toolbar.setAttribute("role", "group");
      this.toolbar.setAttribute("aria-label", this.t.canvas);
      this.viewButtons = {};
      for (const mode of ["orbit", "side", "top"]) {
        const b = this._button(this.toolbar, this.t[mode], () => this._setView(mode));
        b.setAttribute("aria-pressed", "false");
        this.viewButtons[mode] = b;
      }
      this.stage = this._node("div", "hd2-3d-stage", null, this.root);
      this.overlay = this._node("div", "hd2-3d-labels", null, this.stage);
      this.badge = this._node("div", "hd2-3d-badge", this.t.sub, this.stage);
      this.tooltip = this._node("div", "hd2-3d-tooltip", null, this.stage);
      this.tooltip.hidden = true;
      this.hud = this._node("div", "hd2-3d-hud", null, this.root);
      this.hudValues = {};
      for (const [key, label] of [["time", this.t.time + " (s)"], ["position", "X / Y / Z (m)"], ["speed", this.t.speed + " (m/s)"], ["normalDamage", this.t.normal], ["durableDamage", this.t.durable], ["pathLength", this.t.path + " (m)"]]) {
        const cell = this._node("div", "hd2-3d-stat", null, this.hud);
        this._node("span", "hd2-3d-stat-label", label, cell);
        this.hudValues[key] = this._node("output", "hd2-3d-stat-value", "—", cell);
      }
      this.transport = this._node("div", "hd2-3d-transport", null, this.root);
      this.playButton = this._button(this.transport, this.t.play, () => this._togglePlay());
      this.playButton.setAttribute("aria-pressed", "false");
      this.slider = this._node("input", "hd2-3d-slider", null, this.transport);
      this.slider.type = "range";
      this.slider.setAttribute("aria-label", this.t.time);
      this.timeOutput = this._node("output", "hd2-3d-time", "—", this.transport);
      const footer = this._node("div", "hd2-3d-footer", null, this.root);
      const legend = this._node("div", "hd2-3d-legend", null, footer);
      for (const [key, style] of [["trajectory", "path"], ["traveled", "traveled"], ["muzzle", "aim"], ["velocity", "velocity"]]) this._node("span", "hd2-3d-key hd2-3d-key-" + style, this.t[key], legend);
      this.detail = this._node("p", "hd2-3d-detail", "", footer);
      this._node("p", "hd2-3d-note", this.t.grid, footer);
      this.help = this._node("p", "hd2-3d-help", this.t.orbitHelp, footer);
    }

    _track(resource) { this.resources.add(resource); return resource; }
    _initScene() {
      const T = this.T;
      let minX = 0, minY = 0, minZ = 0, maxX = 0, maxY = 0, maxZ = 0;
      for (const r of this.records) {
        minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x);
        minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y);
        minZ = Math.min(minZ, finite(r.z)); maxZ = Math.max(maxZ, finite(r.z));
      }
      // A uniform unit conversion avoids Float32 overflow on long paths. All axes use
      // the SAME scale; UI values remain original metres, with no height exaggeration.
      this.unit = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
      this.bounds = { minX, minY, minZ, maxX, maxY, maxZ };
      this.center = new T.Vector3((minX + maxX) / 2 / this.unit, (minY + maxY) / 2 / this.unit, (minZ + maxZ) / 2 / this.unit);
      this.radius = Math.max(0.5, Math.hypot((maxX - minX) / this.unit, (maxY - minY) / this.unit, (maxZ - minZ) / this.unit) / 2);
      this.target = this.center.clone();
      this.scene = new T.Scene();
      this.scene.background = new T.Color("#090f18");
      this.camera = new T.PerspectiveCamera(48, 1, 0.0001, 100);
      this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: false, logarithmicDepthBuffer: true });
      this.renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.canvas = this.renderer.domElement;
      this.canvas.className = "hd2-3d-canvas";
      this.canvas.tabIndex = 0;
      this.canvas.setAttribute("role", "img");
      this.canvas.setAttribute("aria-label", this.t.canvas);
      this.stage.prepend(this.canvas);
      this.scratch = new T.Vector3();
      this.right = new T.Vector3();
      this.up = new T.Vector3();
      this.delta = new T.Vector3();
      this.positions = new Float32Array(this.records.length * 3);
      for (let i = 0; i < this.records.length; i++) {
        const r = this.records[i];
        this.positions[i * 3] = r.x / this.unit;
        this.positions[i * 3 + 1] = r.y / this.unit;
        this.positions[i * 3 + 2] = finite(r.z) / this.unit;
      }
      this.pathGeometry = this._track(new T.BufferGeometry());
      this.pathGeometry.setAttribute("position", new T.BufferAttribute(this.positions, 3));
      this.pathLine = new T.Line(this.pathGeometry, this._track(new T.LineBasicMaterial({ color: "#ffad55" })));
      this.scene.add(this.pathLine);
      this.traveledGeometry = this._track(new T.BufferGeometry());
      this.traveledGeometry.setAttribute("position", this.pathGeometry.getAttribute("position"));
      this.traveledLine = new T.Line(this.traveledGeometry, this._track(new T.LineBasicMaterial({ color: "#58e3ed", transparent: true, opacity: 0.9, depthTest: false })));
      this.traveledLine.renderOrder = 2;
      this.scene.add(this.traveledLine);
      this.partialGeometry = this._track(new T.BufferGeometry());
      this.partialGeometry.setAttribute("position", new T.BufferAttribute(new Float32Array(6), 3));
      this.scene.add(new T.Line(this.partialGeometry, this.traveledLine.material));
      this.dotGeometry = this._track(new T.BufferGeometry());
      this.dotGeometry.setAttribute("position", new T.BufferAttribute(new Float32Array(3), 3));
      this.dot = new T.Points(this.dotGeometry, this._track(new T.PointsMaterial({ color: "#e5ffff", size: 11, sizeAttenuation: false, depthTest: false, map: this._pointTexture(), transparent: true })));
      this.dot.renderOrder = 5;
      this.scene.add(this.dot);
      this._endpoints();
      this._referenceGrid();
      this._directions();
      this.raycaster = new T.Raycaster();
      this.pointerNDC = new T.Vector2();
      this.intersections = [];
    }
    _pointTexture() {
      const c = document.createElement("canvas"); c.width = c.height = 32;
      const ctx = c.getContext("2d");
      if (!ctx) return null;
      const gradient = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
      gradient.addColorStop(0, "#fff"); gradient.addColorStop(0.3, "#fff"); gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
      return this._track(new this.T.CanvasTexture(c));
    }
    _label(text, position, kind) {
      const node = this._node("span", "hd2-3d-world-label " + (kind || ""), text, this.overlay);
      this.labels.push({ node, position });
    }
    _line(points, color, dashed) {
      const T = this.T;
      const g = this._track(new T.BufferGeometry());
      g.setAttribute("position", new T.Float32BufferAttribute(points, 3));
      const material = this._track(dashed ? new T.LineDashedMaterial({ color, dashSize: 0.018, gapSize: 0.012, transparent: true, opacity: 0.8 }) : new T.LineBasicMaterial({ color, transparent: true, opacity: 0.65 }));
      const line = dashed ? new T.Line(g, material) : new T.LineSegments(g, material);
      if (dashed) line.computeLineDistances();
      this.scene.add(line);
      return line;
    }
    _endpoints() {
      const T = this.T;
      for (const [i, text, color] of [[0, this.t.start, "#58e3ed"], [this.records.length - 1, this.t.end, "#ffad55"]]) {
        const r = this.records[i];
        const p = new T.Vector3(r.x / this.unit, r.y / this.unit, finite(r.z) / this.unit);
        const g = this._track(new T.BufferGeometry().setFromPoints([p]));
        this.scene.add(new T.Points(g, this._track(new T.PointsMaterial({ color, size: 8, sizeAttenuation: false, depthTest: false, map: this.dot.material.map, transparent: true }))));
        this._label(text, p, "hd2-3d-endpoint");
      }
    }
    _referenceGrid() {
      const T = this.T, b = this.bounds, u = this.unit;
      const step = niceStep(u / 12);
      this.gridStep = step;
      const x0 = Math.floor((b.minX - u * 0.12) / step), x1 = Math.ceil((b.maxX + u * 0.12) / step);
      const z0 = Math.floor((b.minZ - u * 0.2) / step), z1 = Math.ceil((b.maxZ + u * 0.2) / step);
      const vertices = [];
      for (let x = x0; x <= x1; x++) vertices.push(x * step / u, 0, z0 * step / u, x * step / u, 0, z1 * step / u);
      for (let z = z0; z <= z1; z++) vertices.push(x0 * step / u, 0, z * step / u, x1 * step / u, 0, z * step / u);
      this._line(vertices, "#2a3c50");
      const axisLength = 0.25;
      this._line([Math.min(b.minX / u, -0.08), 0, 0, Math.max(b.maxX / u, axisLength), 0, 0], "#e88c68");
      this._line([0, Math.min(b.minY / u, -0.12), 0, 0, Math.max(b.maxY / u, axisLength), 0], "#83c98c");
      this._line([0, 0, Math.min(b.minZ / u, -0.12), 0, 0, Math.max(b.maxZ / u, axisLength)], "#67b5ed");
      this._label("X · " + this.t.forward + " (m)", new T.Vector3(Math.max(b.maxX / u, axisLength), 0, 0), "hd2-3d-axis-x");
      this._label("Y · " + this.t.up + " (m)", new T.Vector3(0, Math.max(b.maxY / u, axisLength), 0), "hd2-3d-axis-y");
      this._label("Z · " + this.t.right + " (m)", new T.Vector3(0, 0, Math.max(b.maxZ / u, axisLength)), "hd2-3d-axis-z");
      const markerStep = niceStep(u / 6);
      const ticks = [];
      for (let i = Math.ceil(b.minX / markerStep); i <= Math.floor(b.maxX / markerStep); i++) {
        const x = i * markerStep / u;
        ticks.push(x, 0, -0.012, x, 0, 0.012);
        this._label(this._fmt(i * markerStep) + " m", new T.Vector3(x, 0, -0.025), "hd2-3d-range-label");
      }
      for (const axis of ["y", "z"]) {
        const lo = axis === "y" ? b.minY : b.minZ, hi = axis === "y" ? b.maxY : b.maxZ;
        for (let i = Math.ceil(lo / markerStep); i <= Math.floor(Math.max(hi, u * 0.25) / markerStep); i++) {
          if (i === 0) continue;
          const p = new T.Vector3(); p[axis] = i * markerStep / u;
          this._label(axis.toUpperCase() + " " + this._fmt(i * markerStep) + " m", p, "hd2-3d-range-label");
        }
      }
      this._line(ticks, "#6e8ba7");
    }
    _directions() {
      const T = this.T, o = this.opts;
      const angle = finite(o.launchAngleDeg) * Math.PI / 180;
      // Shooter movement angles are independent of the muzzle direction.
      this.muzzle = new T.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize();
      const supplied = this.initialVelocity;
      const first = this.records[0];
      let velocity;
      if ([supplied.vx, supplied.vy, supplied.vz].every(Number.isFinite)) velocity = new T.Vector3(supplied.vx, supplied.vy, supplied.vz);
      else if (Number.isFinite(first.vx) && Number.isFinite(first.vy)) velocity = new T.Vector3(first.vx, first.vy, finite(first.vz));
      else {
        velocity = this.muzzle.clone().multiplyScalar(finite(o.vConfig));
        const movement = global.HD2Ballistics.calculateShooterVelocity(o);
        velocity.add(new T.Vector3(movement.x, movement.y, movement.z));
      }
      this.initialSpeed = velocity.length();
      this._line([0, 0, 0, this.muzzle.x * 0.42, this.muzzle.y * 0.42, this.muzzle.z * 0.42], "#dfe9f2", true);
      if (this.initialSpeed > 0) {
        const arrow = new T.ArrowHelper(velocity.normalize(), new T.Vector3(), 0.24, "#58e3ed", 0.035, 0.018);
        arrow.traverse((node) => { if (node.geometry) this._track(node.geometry); if (node.material) this._track(node.material); });
        this.scene.add(arrow);
      }
      this.detail.textContent = this.t.muzzleNote + " " + this._fmt(finite(o.launchAngleDeg), 3) + "° · " + this.t.velocityNote + " " + this._fmt(this.initialSpeed) + " m/s · " + this.records.length + " " + this.t.records;
    }

    _bind() {
      const c = this.canvas;
      this._listen(c, "contextmenu", (e) => e.preventDefault());
      this._listen(c, "pointerdown", (e) => {
        if (this.drag || (e.button !== 0 && e.button !== 2)) return;
        e.preventDefault(); c.focus({ preventScroll: true });
        c.setPointerCapture(e.pointerId);
        this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
        this.pointer = null; this.tooltip.hidden = true;
      });
      this._listen(c, "pointermove", (e) => {
        if (this.drag && this.drag.id === e.pointerId) {
          const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
          this.drag.x = e.clientX; this.drag.y = e.clientY;
          this._move(dx, dy, this.drag.pan || e.shiftKey);
        } else if (!this.drag && e.pointerType !== "touch") {
          const rect = c.getBoundingClientRect();
          this.pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top };
          this._invalidate();
        }
      });
      const endDrag = (e) => {
        if (!this.drag || this.drag.id !== e.pointerId) return;
        this.drag = null;
        if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
        this._invalidate();
      };
      this._listen(c, "pointerup", endDrag);
      this._listen(c, "pointercancel", endDrag);
      this._listen(c, "lostpointercapture", () => { this.drag = null; });
      this._listen(c, "pointerleave", () => { this.pointer = null; this.tooltip.hidden = true; });
      this._listen(c, "wheel", (e) => {
        e.preventDefault();
        const amount = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.height : 1);
        this._zoom(clamp(amount, -500, 500));
      }, { passive: false });
      this._listen(c, "keydown", (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const key = e.key.toLowerCase();
        if (["w", "a", "s", "d", "q", "e", "shift"].includes(key)) {
          e.preventDefault();
          if (key === "shift") this.boost = true;
          else this.moveKeys.add(key);
          this.boost ||= e.shiftKey;
          this.pointer = null; this.tooltip.hidden = true;
          if (!this.navigationFrame) this.navigationFrame = -1;
          this._invalidate();
          return;
        }
        const directions = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
        if (directions[e.key]) { e.preventDefault(); this._move(...directions[e.key], e.shiftKey); }
        else if (["+", "=", "-", "_"].includes(e.key)) { e.preventDefault(); this._zoom(e.key === "-" || e.key === "_" ? 90 : -90); }
        else if (e.key === "Home") { e.preventDefault(); this._setView("orbit"); }
      });
      this._listen(global, "keyup", (e) => {
        const wasMoving = this.moveKeys.size > 0 || (e.key === "Shift" && this.boost);
        this.moveKeys.delete(e.key.toLowerCase());
        if (e.key === "Shift") this.boost = false;
        if (wasMoving && !this.moveKeys.size && !this.boost) {
          this.navigationFrame = null;
          this._cameraChanged();
        }
      });
      this._listen(c, "blur", () => this._stopMoving());
      this._listen(global, "blur", () => this._stopMoving());
      this._listen(this.slider, "input", () => { this._pause(); this._setTime(Number(this.slider.value)); this._invalidate(); });
      this._listen(document, "visibilitychange", () => {
        if (document.hidden) { this._pause(); this._stopMoving(); }
      });
      this._listen(c, "webglcontextlost", (e) => {
        e.preventDefault(); this._pause(); this._releaseGPU(); this._fallback(this.t.fallback);
      });
      if (global.ResizeObserver) {
        this.resizeObserver = new global.ResizeObserver(() => this._resize());
        this.resizeObserver.observe(this.stage);
      } else this._listen(global, "resize", () => this._resize());
    }
    _resize() {
      if (this.destroyed || !this.renderer) return;
      const rect = this.stage.getBoundingClientRect();
      this.width = Math.max(1, rect.width);
      this.height = Math.max(1, rect.height);
      this.renderer.setSize(this.width, this.height, false);
      this.camera.aspect = this.width / this.height;
      if (this.autoFrame) this._frameDistance();
      this._cameraChanged();
    }
    _frameDistance() {
      const half = this.camera.fov * Math.PI / 360;
      const limiting = Math.min(half, Math.atan(Math.tan(half) * this.camera.aspect));
      this.distance = this.radius * 1.45 / Math.sin(limiting);
    }
    _setView(mode) {
      if (!this.renderer || this.destroyed) return;
      this.mode = mode;
      this._stopMoving();
      this.pointer = null; this.tooltip.hidden = true;
      for (const [name, b] of Object.entries(this.viewButtons)) b.setAttribute("aria-pressed", String(name === mode));
      this.help.textContent = this.t.orbitHelp;
      this.target.copy(this.center);
      this.theta = mode === "side" ? Math.PI / 2 : mode === "top" ? 0 : 1.04;
      this.phi = mode === "top" ? 0.0001 : mode === "side" ? Math.PI / 2 : 1.05;
      this.autoFrame = true; this._frameDistance();
      this._cameraChanged();
      this.canvas.focus({ preventScroll: true });
    }
    _stopMoving() {
      const wasMoving = this.moveKeys.size > 0 || this.boost;
      this.moveKeys.clear();
      this.navigationFrame = null;
      this.boost = false;
      if (wasMoving) this._cameraChanged();
    }
    _navigate(seconds) {
      if (!this.moveKeys.size || seconds <= 0) return;
      const forward = Number(this.moveKeys.has("w")) - Number(this.moveKeys.has("s"));
      const lateral = Number(this.moveKeys.has("d")) - Number(this.moveKeys.has("a"));
      const vertical = Number(this.moveKeys.has("e")) - Number(this.moveKeys.has("q"));
      this.camera.getWorldDirection(this.scratch);
      this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
      this.delta.copy(this.scratch).multiplyScalar(forward).addScaledVector(this.right, lateral);
      this.delta.y += vertical;
      if (!this.delta.lengthSq()) return;
      const speed = Math.max(this.distance * 0.6, 1 / this.unit);
      this.delta.normalize().multiplyScalar(speed * seconds * (this.boost ? 4 : 1));
      this.target.add(this.delta);
      this.autoFrame = false;
      this._cameraChanged();
    }
    _move(dx, dy, pan) {
      if (!this.renderer) return;
      this.autoFrame = false;
      if (pan) {
        const scale = 2 * this.distance * Math.tan(this.camera.fov * Math.PI / 360) / Math.max(this.height, 1);
        this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
        this.up.setFromMatrixColumn(this.camera.matrixWorld, 1);
        this.target.addScaledVector(this.right, -dx * scale).addScaledVector(this.up, dy * scale);
      } else {
        this.theta -= dx * 0.006;
        this.phi = clamp(this.phi - dy * 0.006, 0.0001, Math.PI - 0.0001);
      }
      this.pointer = null; this.tooltip.hidden = true;
      this._cameraChanged();
    }
    _zoom(amount) {
      if (!this.renderer) return;
      this.autoFrame = false;
      this.distance = clamp(this.distance * Math.exp(amount * 0.0015), 0.00001, 10000);
      this._cameraChanged();
    }
    _cameraChanged() {
      if (!this.renderer) return;
      const c = this.camera;
      c.up.set(0, 1, 0);
      c.position.set(this.distance * Math.sin(this.phi) * Math.cos(this.theta), this.distance * Math.cos(this.phi), this.distance * Math.sin(this.phi) * Math.sin(this.theta)).add(this.target);
      c.lookAt(this.target);
      const fromCenter = c.position.distanceTo(this.center);
      c.near = Math.max(1e-8, Math.min(this.distance * 0.001, Math.max(1e-8, fromCenter - this.radius * 1.8)));
      c.far = Math.max(10, fromCenter + this.radius * 5);
      c.updateProjectionMatrix(); c.updateMatrixWorld();
      this.badge.textContent = this.t.scale + " " + this._fmt(this.gridStep) + " m · 1:1:1";
      this._invalidate();
    }

    _sample(time) {
      const records = this.records;
      let lo = 0, hi = records.length - 1;
      while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (records[mid].time <= time) lo = mid; else hi = mid - 1; }
      const a = records[lo], b = records[Math.min(lo + 1, records.length - 1)];
      const f = b.time > a.time ? clamp((time - a.time) / (b.time - a.time), 0, 1) : 0;
      const r = { time, index: lo };
      for (const key of ["x", "y", "z", "speed", "normalDamage", "durableDamage", "pathLength", "vx", "vy", "vz"]) {
        const av = key === "z" ? finite(a[key]) : a[key], bv = key === "z" ? finite(b[key]) : b[key];
        r[key] = Number.isFinite(av) && Number.isFinite(bv) ? av + (bv - av) * f : Number.isFinite(av) ? av : NaN;
      }
      if (!Number.isFinite(r.speed) && [r.vx, r.vy].every(Number.isFinite)) r.speed = Math.hypot(r.vx, r.vy, finite(r.vz));
      return r;
    }
    _setTime(time) {
      if (!this.renderer) return;
      this.time = clamp(time, this.startTime, this.endTime);
      const r = this._sample(this.time);
      this.slider.value = String(this.time);
      this.timeOutput.textContent = this._fmt(this.time, 3) + " / " + this._fmt(this.endTime, 3) + " s";
      this.slider.setAttribute("aria-valuetext", this._fmt(this.time, 3) + " s");
      for (const key of ["time", "speed", "normalDamage", "durableDamage", "pathLength"]) this.hudValues[key].textContent = this._fmt(r[key], key === "time" ? 3 : 2);
      this.hudValues.position.textContent = [r.x, r.y, r.z].map((v) => this._fmt(v, 2)).join(" / ");
      const p = this.dotGeometry.getAttribute("position");
      p.setXYZ(0, r.x / this.unit, r.y / this.unit, r.z / this.unit); p.needsUpdate = true;
      this.dotGeometry.boundingSphere = null;
      this.traveledGeometry.setDrawRange(0, r.index + 1);
      const segment = this.partialGeometry.getAttribute("position"), a = this.records[r.index];
      segment.setXYZ(0, a.x / this.unit, a.y / this.unit, finite(a.z) / this.unit);
      segment.setXYZ(1, r.x / this.unit, r.y / this.unit, r.z / this.unit); segment.needsUpdate = true;
      this.partialGeometry.boundingSphere = null;
    }
    _togglePlay() {
      if (!this.renderer || this.endTime <= this.startTime) return;
      if (this.playing) { this._pause(); return; }
      if (this.time >= this.endTime) this._setTime(this.startTime);
      this.playing = true; this.lastFrame = null;
      this.playButton.textContent = this.t.pause;
      this.playButton.setAttribute("aria-pressed", "true");
      this._invalidate();
    }
    _pause() {
      this.playing = false; this.lastFrame = null;
      if (this.playButton) { this.playButton.textContent = this.t.play; this.playButton.setAttribute("aria-pressed", "false"); }
    }
    _fmt(v, digits = 2) {
      if (!Number.isFinite(v)) return "—";
      if (Math.abs(v) >= 1e7 || (v !== 0 && Math.abs(v) < 0.001)) return v.toExponential(2);
      return v.toLocaleString(this.locale === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: digits });
    }
    _updateLabels() {
      for (const { node, position } of this.labels) {
        this.scratch.copy(position).project(this.camera);
        const visible = this.scratch.z >= -1 && this.scratch.z <= 1 && Math.abs(this.scratch.x) < 0.97 && Math.abs(this.scratch.y) < 0.95;
        node.hidden = !visible;
        if (visible) node.style.transform = "translate(" + ((this.scratch.x + 1) * this.width / 2) + "px," + ((1 - this.scratch.y) * this.height / 2) + "px) translate(6px,-16px)";
      }
    }
    _hover() {
      if (!this.pointer || this.drag) { this.tooltip.hidden = true; return; }
      const p = this.pointer;
      this.pointerNDC.set(p.x / this.width * 2 - 1, 1 - p.y / this.height * 2);
      this.raycaster.setFromCamera(this.pointerNDC, this.camera);
      const distance = this.distance;
      this.raycaster.params.Line.threshold = 12 / this.height * 2 * Math.max(distance, 0.001) * Math.tan(this.camera.fov * Math.PI / 360);
      this.intersections.length = 0;
      this.raycaster.intersectObject(this.pathLine, false, this.intersections);
      let best = 13 * 13, index = -1;
      // Measure distance to the projected SEGMENT, so sparse recordings remain
      // hoverable between endpoints. The tooltip still identifies a real record.
      for (const hit of this.intersections) {
        const a = hit.index, b = Math.min(a + 1, this.records.length - 1);
        this.scratch.fromArray(this.positions, a * 3).project(this.camera);
        this.delta.fromArray(this.positions, b * 3).project(this.camera);
        if ((this.scratch.z < -1 && this.delta.z < -1) || (this.scratch.z > 1 && this.delta.z > 1)) continue;
        const ax = (this.scratch.x + 1) * this.width / 2, ay = (1 - this.scratch.y) * this.height / 2;
        const bx = (this.delta.x + 1) * this.width / 2, by = (1 - this.delta.y) * this.height / 2;
        const dx = bx - ax, dy = by - ay, lengthSquared = dx * dx + dy * dy;
        const f = lengthSquared > 0 ? clamp(((p.x - ax) * dx + (p.y - ay) * dy) / lengthSquared, 0, 1) : 0;
        const d = Math.pow(ax + f * dx - p.x, 2) + Math.pow(ay + f * dy - p.y, 2);
        if (d < best) { best = d; index = f <= 0.5 ? a : b; }
      }
      if (index < 0) { this.tooltip.hidden = true; return; }
      const r = this.records[index];
      this.tooltip.textContent = this.t.nearest + " #" + index + "\n" + this.t.time + " " + this._fmt(r.time, 4) + " s\nX " + this._fmt(r.x, 3) + " · Y " + this._fmt(r.y, 3) + " · Z " + this._fmt(finite(r.z), 3) + " m\n" + this.t.speed + " " + this._fmt(r.speed) + " m/s\n" + this.t.normal + " " + this._fmt(r.normalDamage) + " · " + this.t.durable + " " + this._fmt(r.durableDamage);
      this.tooltip.hidden = false;
      this.tooltip.style.left = clamp(p.x + 16, 8, Math.max(8, this.width - this.tooltip.offsetWidth - 8)) + "px";
      this.tooltip.style.top = clamp(p.y + 16, 8, Math.max(8, this.height - this.tooltip.offsetHeight - 8)) + "px";
    }
    _invalidate() {
      if (this.destroyed || !this.renderer) return;
      this.dirty = true;
      if (!this.raf) this.raf = global.requestAnimationFrame((timestamp) => this._frame(timestamp));
    }
    _frame(timestamp) {
      this.raf = 0;
      if (this.destroyed || !this.renderer) return;
      try {
        if (this.moveKeys.size) {
          const seconds = this.navigationFrame == null ? 0 : clamp((timestamp - this.navigationFrame) / 1000, 0, 0.1);
          this.navigationFrame = timestamp;
          this._navigate(seconds);
        } else this.navigationFrame = null;
        if (this.playing) {
          const delta = this.lastFrame == null ? 0 : Math.max(0, (timestamp - this.lastFrame) / 1000);
          this.lastFrame = timestamp;
          this._setTime(this.time + delta);
          if (this.time >= this.endTime) this._pause();
        }
        this.renderer.render(this.scene, this.camera);
        this._updateLabels();
        this._hover();
        this.dirty = false;
        if (this.playing || this.moveKeys.size) this._invalidate();
      } catch (_) {
        this._pause(); this._releaseGPU(); this._fallback(this.t.fallback);
      }
    }
    _saveImage() {
      if (!this.renderer) return;
      try {
        // Render immediately before capture; no permanently preserved drawing buffer.
        this.renderer.render(this.scene, this.camera);
        const data = this.canvas.toDataURL("image/png");
        const a = this._node("a", "", null, this.root);
        a.download = "hd2-trajectory-3d.png"; a.href = data; a.click(); a.remove();
      } catch (_) { this.detail.textContent = this.t.screenshotError; }
    }
    _fallback(message) {
      if (!this.stage || this.destroyed) return;
      this._pause();
      if (this.raf) global.cancelAnimationFrame(this.raf);
      this.raf = 0;
      if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
      this.stage.replaceChildren();
      const n = this._node("p", "hd2-3d-fallback", message, this.stage);
      n.setAttribute("role", "status");
      this.root.classList.add("hd2-3d-unavailable");
      this.root.querySelectorAll("button,input").forEach((el) => { el.disabled = true; });
    }
    _releaseGPU() {
      this._stopMoving();
      if (this.raf) global.cancelAnimationFrame(this.raf);
      this.raf = 0;
      // A disposal failure in a lost context must never escape into the host run.
      for (const r of this.resources) { try { r.dispose(); } catch (_) { /* best effort */ } }
      this.resources.clear();
      if (this.scene) this.scene.clear();
      if (this.renderer) {
        const renderer = this.renderer; this.renderer = null;
        try { renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss(); } catch (_) { /* context may already be lost */ }
      }
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this._pause();
      if (this.resizeObserver) { this.resizeObserver.disconnect(); this.resizeObserver = null; }
      for (const remove of this.listeners) remove();
      this.listeners.length = 0;
      if (this.drag && this.canvas) {
        try { if (this.canvas.hasPointerCapture(this.drag.id)) this.canvas.releasePointerCapture(this.drag.id); } catch (_) { /* detached */ }
      }
      this._releaseGPU();
      if (this.root) this.root.remove();
      this.records = []; this.labels = []; this.intersections = [];
      this.positions = null; this.pointer = null; this.drag = null;
      this.scene = null; this.camera = null; this.canvas = null;
      this.pathLine = null; this.traveledLine = null; this.dot = null;
      this.pathGeometry = null; this.traveledGeometry = null; this.partialGeometry = null; this.dotGeometry = null;
      this.root = null; this.host = null; this.overlay = null; this.stage = null;
      this.hudValues = null; this.viewButtons = null; this.raycaster = null;
      this.resetButton = null; this.saveButton = null;
      this.playButton = null; this.slider = null; this.timeOutput = null;
      this.toolbar = null; this.hud = null; this.transport = null;
      this.badge = null; this.tooltip = null;
      this.detail = null; this.help = null;
      this.opts = null; this.initialVelocity = null;
    }
  }
  global.HD2Trajectory3D = HD2Trajectory3D;
})(window);
