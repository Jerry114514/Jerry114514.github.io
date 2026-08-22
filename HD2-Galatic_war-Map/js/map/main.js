/* ============================================================
   HD2 银河战争态势图 - 主入口
   缩放/平移 + 层级切换 + 交互
   ============================================================ */
"use strict";

(() => {
  const canvas = document.getElementById("star-map");
  const loadingEl = document.getElementById("map-loading");
  const statNodes = document.getElementById("stat-nodes");
  const statLinks = document.getElementById("stat-links");
  const lastUpdate = document.getElementById("last-update");
  const btnRefresh = document.getElementById("btn-refresh");
  const btnLayer = document.getElementById("btn-layer-toggle");
  const zoomInBtn = document.getElementById("btn-zoom-in");
  const zoomOutBtn = document.getElementById("btn-zoom-out");
  const zoomResetBtn = document.getElementById("btn-zoom-reset");
  const zoomIndicator = document.getElementById("zoom-indicator");

  const renderer = new StarMapRenderer(canvas);
  let currentLayer = "main";
  let mainNodes = [], mainLinks = [], mainSupplyLines = [];
  let voidNodes = [], voidLinks = [], voidSupplyLines = [];
  let metaData = {};

  // ============ 加载数据 ============
  async function loadAndRender() {
    loadingEl.classList.remove("hidden");
    try {
      const result = await DATA_LAYER.loadAll();
      mainNodes = result.mainNodes;
      mainLinks = result.mainLinks;
      mainSupplyLines = result.mainSupplyLines || [];
      voidNodes = result.voidNodes;
      voidLinks = result.voidLinks;
      voidSupplyLines = result.voidSupplyLines || [];
      metaData = result.meta;
      applyLayer(currentLayer);
      updateStats();
      if (btnLayer) btnLayer.textContent = currentLayer === "main" ? "🌌 寂域" : "🌌 银河";
    } catch (e) {
      console.error("加载星图数据失败:", e);
      lastUpdate.textContent = "⚠️ 数据加载失败";
      showError(`数据加载失败：${e.message}`);
    } finally {
      loadingEl.classList.add("hidden");
    }
  }

  function applyLayer(layer) {
    const nodes = layer === "void" ? voidNodes : mainNodes;
    const links = layer === "void" ? voidLinks : mainLinks;
    const supplyLines = layer === "void" ? voidSupplyLines : mainSupplyLines;
    renderer.stop();
    renderer.setData(nodes, links, supplyLines);
    renderer.render();
    updateZoomIndicator();
  }

  function updateStats() {
    const nodes = currentLayer === "void" ? voidNodes : mainNodes;
    const links = currentLayer === "void" ? voidLinks : mainLinks;
    statNodes.textContent = `节点 ${nodes.length}`;
    statLinks.textContent = `连线 ${links.length}`;
    lastUpdate.textContent = metaData.fetchedAt ? `最后更新: ${new Date(metaData.fetchedAt).toLocaleTimeString()}` : "";
  }

  function updateZoomIndicator() {
    if (zoomIndicator) zoomIndicator.textContent = `🔍 ${Math.round(renderer.scale * 100)}%`;
  }

  function showError(msg) {
    const div = document.createElement("div");
    div.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#ef4444;font-size:1rem;background:rgba(10,14,26,.9);padding:18px 24px;border:1px solid #ef4444;border-radius:10px;z-index:30;";
    div.textContent = msg;
    canvas.parentElement.appendChild(div);
    setTimeout(() => div.remove(), 6000);
  }

  // ============ 缩放控件 ============
  renderer.onZoomChange = (s) => { updateZoomIndicator(); };

  if (zoomInBtn) {
    zoomInBtn.addEventListener("click", () => {
      renderer.zoomAt(1.2, canvas.width / 2, canvas.height / 2);
    });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener("click", () => {
      renderer.zoomAt(1 / 1.2, canvas.width / 2, canvas.height / 2);
    });
  }
  if (zoomResetBtn) {
    zoomResetBtn.addEventListener("click", () => {
      renderer.resetView();
    });
  }

  // ============ 滚轮缩放 ============
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    renderer.zoomAt(factor, mx, my);
  }, { passive: false });

  // ============ 拖拽平移 ============
  let hasDragged = false;

  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0 || e.button === 1) {
      hasDragged = false;
      renderer.isDragging = true;
      renderer.dragStartX = e.clientX;
      renderer.dragStartY = e.clientY;
      renderer.dragOffsetX = renderer.offsetX;
      renderer.dragOffsetY = renderer.offsetY;
      canvas.style.cursor = "grabbing";
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (renderer.isDragging) {
      hasDragged = true;
      const dx = e.clientX - renderer.dragStartX;
      const dy = e.clientY - renderer.dragStartY;
      renderer.offsetX = renderer.dragOffsetX + dx;
      renderer.offsetY = renderer.dragOffsetY + dy;
      renderer.sectorBoundsCache = null;
    } else {
      // 悬停检测
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      renderer.hoveredNode = renderer.getNodeAt(mx, my);
      canvas.style.cursor = renderer.hoveredNode ? "pointer" : "default";
    }
  });

  window.addEventListener("mouseup", () => {
    renderer.isDragging = false;
  });

  canvas.addEventListener("mouseleave", () => {
    renderer.isDragging = false;
    renderer.hoveredNode = null;
    canvas.style.cursor = "default";
  });

  // ============ 点击（拖拽后不触发） ============
  canvas.addEventListener("click", (e) => {
    if (hasDragged) { hasDragged = false; return; }
    if (renderer.hoveredNode) {
      window.location.href = `./index.html?planet=${renderer.hoveredNode.id}`;
    }
  });

  // ============ 层级切换 ============
  if (btnLayer) {
    btnLayer.addEventListener("click", () => {
      currentLayer = currentLayer === "main" ? "void" : "main";
      applyLayer(currentLayer);
      updateStats();
      btnLayer.textContent = currentLayer === "main" ? "🌌 寂域" : "🌌 银河";
    });
  }

  // ============ 刷新 & 自适应 ============
  btnRefresh.addEventListener("click", () => {
    renderer.stop();
    loadAndRender();
  });

  window.addEventListener("resize", () => {
    renderer.resize();
    renderer.sectorBoundsCache = null;
  });

  // ============ 启动 ============
  loadAndRender();
  setInterval(() => {
    renderer.stop();
    loadAndRender();
  }, 300_000);
})();