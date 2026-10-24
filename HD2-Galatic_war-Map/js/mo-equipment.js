"use strict";
/* ==============================================================
   MO 限定装备名（2026-10-24）
   --------------------------------------------------------------
   数据来自 data.json 的 major_order.tasks（HD2Web-Trans 每轮解析写入）：
     { id32, source, source_version, progress_semantics,
       items: [{ index, action, faction_id, faction_name, goal, progress,
                 requirement: { type:"equipment", id, en, name, name_source } }] }

   name_source 口径（与流水线 equipment_map.py 一致，可诊断、绝不猜名）：
     site_terms / site_terms(prefix_stripped) / site_terms(short_form)
       = 站点权威图鉴官方简中（stratagems_full.json，游戏内文本解包）
     en_fallback  = 官方中文名暂缺，显示官方英文名（明确标记）
     unresolved   = 只有 raw ID，不显示任何名字
   旧数据没有 tasks 时整块降级为「装备 #<rawID>」，页面其余部分不受影响。
   ============================================================== */
(function (root) {
  "use strict";

  /* major_order.tasks -> { id(str): {name, name_source, en} }（按 requirement.id 索引，
     与任务顺序无关，防止流水线与前端任务数组顺序漂移） */
  function nameById(moTasks) {
    const out = {};
    const items = moTasks && Array.isArray(moTasks.items) ? moTasks.items : [];
    for (const mt of items) {
      const req = mt && mt.requirement;
      if (req && req.id != null && req.name) out[String(req.id)] = req;
    }
    return out;
  }

  /* 单个任务的「使用：…」HTML 行；无限定装备（requirement 缺失）返回 ""。
     esc 必传：调用方的 HTML 转义函数。 */
  function line(itemID, names, esc) {
    if (itemID == null) return "";
    const req = (names || {})[String(itemID)];
    const e = esc || (s => String(s));
    if (req && req.name) {
      const title = req.name_source && String(req.name_source).includes("en_fallback")
        ? ` title="官方中文名暂缺，显示官方英文名（${e(req.name_source)}）"` : "";
      return `<div class="mo-task-equip">使用：<b${title}>${e(req.name)}</b></div>`;
    }
    return `<div class="mo-task-equip">使用：装备 #${e(String(itemID))}`
      + `<span class="dim">（官方名称暂缺）</span></div>`;
  }

  root.HD2MoEquipment = { nameById, line };
})(typeof window !== "undefined" ? window : globalThis);
