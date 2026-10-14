(function (root) {
  "use strict";
  // ItemMix identity: CrosswaveOmega/hd2api.py constants + helldivers-2/json item_names.
  // https://github.com/helldivers-2/json/blob/master/items/item_names.json
  const RESOURCES = {
    3992382197: "普通样本",
    2985106497: "稀有样本",
    3608481516: "申购点",
  };

  function progress(action) {
    const cost = action?.cost?.[0];
    if (!cost || typeof cost.current !== "number" || typeof cost.target !== "number" ||
        !Number.isFinite(cost.current) || !Number.isFinite(cost.target) || cost.target <= 0) return null;
    return Math.min(100, Math.max(0, cost.current / cost.target * 100));
  }

  // Runtime actions own the cards; the catalog only supplies names and descriptions.
  function actionEntries(actions, entries) {
    return actions.filter(action => [1, 2, 3].includes(action.status)).map(action => {
      const effects = action.effectIds || [];
      const candidates = entries.filter(entry => entry.effect_ids?.length &&
        entry.effect_ids.every(id => effects.includes(id)));
      candidates.sort((a, b) => b.effect_ids.length - a.effect_ids.length);
      const entry = candidates[0] || entries.find(entry =>
        entry.action_id32 != null && entry.action_id32 === action.id32) || {
          cn: action.name || "未知战术行动", desc: "暂无本地中文说明。", effect_ids: effects,
        };
      return { entry, action };
    });
  }

  function resourceLines(action) {
    return (action?.cost || []).map(cost => {
      const resource = RESOURCES[cost.itemMixId];
      if (!resource) return "捐赠资源待确认";
      const amount = cost.maxDonation, period = cost.maxDonationPeriodSec;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 ||
          typeof period !== "number" || !Number.isFinite(period) || period <= 0) return `捐赠资源：${resource}`;
      const hours = period / 3600;
      const cycle = Number.isInteger(hours) ? `${hours} 小时` : `${period} 秒`;
      return `每人每 ${cycle}最多捐赠 ${amount.toLocaleString("zh-CN")} ${resource}`;
    });
  }

  function snapshotLabel(dss) {
    const timestamp = dss && Object.hasOwn(dss, "donationUpdatedAtMs") ? dss.donationUpdatedAtMs : dss?.clientTimeMs;
    if (typeof timestamp !== "number" || timestamp <= 0 || !Number.isFinite(timestamp)) return "捐赠数据时间未知";
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return "捐赠数据时间未知";
    const label = date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
    return `捐赠数据截至 ${label}${dss?.donationSource === "snapshot" ? "（上次成功快照）" : ""}`;
  }

  root.HD2DssDonations = { progress, actionEntries, resourceLines, snapshotLabel };
})(typeof window !== "undefined" ? window : globalThis);
