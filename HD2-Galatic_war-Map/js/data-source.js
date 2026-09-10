"use strict";
/* HD2 主站数据源统一入口（2026-09 收拢原 8 处 fetch 调用点）
   - json(url):   统一 no-store 请求，非 2xx 抛 Error（含状态码与 URL）
   - jsonSoft(url): 静默降级版，任何失败返回 null（对照表类数据用）
   - 缓存语义保持原状：data.json / player_distribution 的 5 分钟缓存桶由
     URL 时间戳承担（CONFIG.dataUrlBust），此处不加 TTL，避免 60s 轮询
     退化为 5 分钟陈旧数据 */
window.HD2Source = {
  async json(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status + " on " + url);
    return r.json();
  },
  async jsonSoft(url) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    }
  },
};
