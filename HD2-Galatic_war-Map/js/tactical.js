"use strict";
/* ============================================================
   战术目标计算模块（Tactical Objectives）
   复刻 helldiverscompanion 的 optional objectives 拓扑逻辑：
   依据星球归属 + 补给线邻接（tables/waypoints.json，冻结文件只读复用）
   实时计算四类词条，由 index.html 以蓝色词条（.pd-chip-tac）渲染：
     · 天体包围圈 / 双重围攻 —— 解放本星将孤立 1~N 个仅剩本星补给线的星球
     · 被围攻 —— 本星全部补给线邻星均我方，敌方抵抗失效
     · 星域解放 —— 解放本星即全星区易主
     · 对弈点 —— 解放本星将立即终结我方防御星上的敌方战役
   与 companion 的简化差异（见《HD2重构检查计划表.md》记录）：
     · "被围攻"不再要求 impactPctEnemy<=0（拓扑即状态，与用户机制描述一致）
     · "对弈点"用邻接表推导敌军来源，不依赖 isDefenseOrigin
   ============================================================ */
window.Tactical = (function () {
  const FACTION_CN = {
    Humans: "超级地球", Terminids: "终结族", Automaton: "机器人", Illuminate: "光能族",
    Super_Earth: "超级地球", "Super Earth": "超级地球",
  };
  const OWN_CN = { Humans: "超级地球", Terminids: "终结族", Automaton: "机器人", Illuminate: "光能族" };

  function computeFor(index, ctx) {
    const { planets, campaigns, waypoints, nameOf, sectorCnOf } = ctx;
    // waypoints.json 顶层为包裹对象 {description, waypoints, ...}，邻接表在 .waypoints 子键
    const rawWp = waypoints || {};
    const wp = rawWp.waypoints || rawWp;
    const nbs = wp[String(index)] || [];
    if (!nbs.length) return [];              // 不可达星球不参与词条

    const planetBy = {};
    (planets || []).forEach(p => { planetBy[p.index] = p; });
    const self = planetBy[index];
    if (!self) return [];
    const isOurs = i => (planetBy[i] && planetBy[i].currentOwner) === "Humans";
    const defPlanets = new Set((campaigns || [])
      .filter(c => c.campaignType === "defense").map(c => c.planet.index));
    const libPlanets = new Set((campaigns || [])
      .filter(c => c.campaignType === "liberation").map(c => c.planet.index));
    if (!libPlanets.has(index)) return [];   // 仅"我方正在解放"的星球显示目标词条

    const ownerCn = OWN_CN[self.currentOwner] || self.currentOwner || "敌方";
    const selfName = nameOf(index);
    // 补给线为有向连接（A→B），邻接判定按 companion 的 allWays 双向视角（出向 ∪ 入向）
    const rev = {};
    Object.keys(wp).forEach(k => {
      const from = +k;
      (wp[k] || []).forEach(to => { (rev[to] = rev[to] || []).push(from); });
    });
    const outW = i => wp[String(i)] || [];
    const allWays = i => [...new Set([...outW(i), ...(rev[i] || [])])];
    const enemyNeighbors = i => allWays(i).filter(n => !isOurs(n) || defPlanets.has(n));
    const tags = [];

    // A) 被围攻：全部补给线邻星（双向）均为我方
    if (allWays(index).every(n => isOurs(n))) {
      tags.push({
        key: "besieged", title: "被围攻",
        text: `${ownerCn}的部队在${selfName}已被包围，无法再阻挡解放进度。`,
      });
    }

    // B) 天体包围圈 / 双重围攻：解放本星后将孤立的目标星球
    //    目标候选 = 本星出向补给线邻居（companion e.routes），条件 = 该目标非我方或正在防御战，
    //    且其全部（双向）敌方补给线仅剩本星一条
    const circTargets = outW(index).filter(n =>
      (!isOurs(n) || defPlanets.has(n)) &&
      enemyNeighbors(n).length === 1 && enemyNeighbors(n)[0] === index);
    if (circTargets.length) {
      const tNames = circTargets.map(n => nameOf(n)).join("、");
      const races = [...new Set(circTargets.map(n => OWN_CN[(planetBy[n] || {}).currentOwner] || ""))].filter(Boolean).join("/");
      const raceCn = races === "超级地球" ? "攻城敌军" : races;
      const title = circTargets.length === 2 ? "双重围攻"
        : (circTargets.length > 2 ? "多重围攻" : "天体包围圈");
      tags.push({
        key: "circumvallation", title,
        text: `解放${selfName}将对${tNames}的${raceCn}形成包围，切断其支援与增援。` +
              `固守该星可开启${circTargets.length}处围攻解放，降低当地敌方抵抗度。`,
      });
    }

    // C) 对弈点：解放本星将立即终结我方防御星上的敌方战役
    const gambits = allWays(index).filter(n =>
      isOurs(n) && defPlanets.has(n) &&
      enemyNeighbors(n).length === 1 && enemyNeighbors(n)[0] === index);
    if (gambits.length) {
      const gNames = gambits.map(n => nameOf(n)).join("、");
      tags.push({
        key: "gambit", title: "对弈点",
        text: `解放${selfName}将立即结束${gNames}上的敌方战役，守军无需再坚守防线。`,
      });
    }

    // D) 星域解放：同星区其余星球全部为我方
    const sector = self.sector || "";
    if (sector) {
      const sibs = (planets || []).filter(x => (x.sector || "") === sector && x.index !== index);
      if (sibs.length && sibs.every(x => x.currentOwner === "Humans")) {
        const secCn = sectorCnOf ? sectorCnOf(sector) : sector;
        tags.push({
          key: "libsector", title: "星域解放",
          text: `解放${selfName}将使超级地球完全掌控${secCn}星区，并在大片星图上清除${ownerCn}的视觉标识。`,
        });
      }
    }

    return tags;
  }

  return { computeFor };
})();
