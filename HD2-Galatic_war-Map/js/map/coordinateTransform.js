/* ============================================================
   HD2 银河战争态势图 - 坐标变换工具
   替代旧 layoutEngine.js：归一化坐标 ↔ 像素坐标
   ============================================================ */
"use strict";

const COORDINATE_TRANSFORM = (() => {

  /**
   * 将归一化坐标 [-1, 1] 映射到 Canvas 像素坐标
   * @param {number} x - 归一化 X
   * @param {number} y - 归一化 Y
   * @param {number} canvasWidth  - 画布像素宽度
   * @param {number} canvasHeight - 画布像素高度
   * @param {number} [margin=60] - 边距
   * @returns {{ px: number, py: number }}
   */
  /**
   * 将 API 坐标映射到 Canvas 像素坐标（含 Y 轴翻转）
   * API position.y 使用游戏坐标系（Y 向上为正），
   * Canvas 坐标系 Y 向下为正，此处取反纠正
   * @param {number} x - API 原始 x 坐标（-1 ~ 1）
   * @param {number} y - API 原始 y 坐标（-1 ~ 1）
   * @param {number} canvasWidth  - 画布像素宽度
   * @param {number} canvasHeight - 画布像素高度
   * @param {number} [margin=60] - 边距
   * @returns {{ px: number, py: number }}
   */
  function mapCoordinates(x, y, canvasWidth, canvasHeight, margin) {
    margin = margin || 60;
    const w = canvasWidth - margin * 2;
    const h = canvasHeight - margin * 2;
    const px = margin + (x + 1) / 2 * w;
    const py = margin + (-y + 1) / 2 * h;  // ← Y 轴翻转
    return { px, py };
  }

  /**
   * 将归一化坐标 [-1, 1] 映射到 Canvas 像素坐标（无翻转，供旧兼容）
   */
  function normalizePosition(x, y, canvasWidth, canvasHeight, margin) {
    margin = margin || 60;
    const w = canvasWidth - margin * 2;
    const h = canvasHeight - margin * 2;
    return {
      px: margin + (x + 1) / 2 * w,
      py: margin + (y + 1) / 2 * h
    };
  }

  /**
   * 计算节点集合的边界框
   * @param {Array} nodes - 节点数组（每项含 x, y 归一化坐标）
   * @returns {{ minX, maxX, minY, maxY }}
   */
  function getBounds(nodes) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    (nodes || []).forEach(n => {
      if (n.x != null) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
      }
      if (n.y != null) {
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
    });
    return { minX, maxX, minY, maxY };
  }

  return { mapCoordinates, normalizePosition, getBounds };
})();