/* ============================================================
   HD2 银河战争态势图 - 数据层
   读取 data.json + starmap.json + planet_index.json
   绘制全部星球，寂域做层级分离
   ============================================================ */
"use strict";

const DATA_LAYER = (() => {
  const CONFIG = {
    DATA_URL: "./data.json?t=" + Math.floor(Date.now() / 300_000),
    STARMAP_URL: "./tables/starmap.json?t=" + Math.floor(Date.now() / 300_000),
    INDEX_URL: "./tables/planet_index.json?t=" + Math.floor(Date.now() / 300_000),
    WAYPOINTS_URL: "./tables/waypoints.json?t=" + Math.floor(Date.now() / 300_000),
  };

  const OWNER_CN = {
    Humans: "超级地球",
    Automatons: "机器人",
    Terminids: "终结族",
    Illuminate: "光能族",
  };

  // 寂域星区名（英文/中文）
  const VOID_SECTOR_EN = "The Void";
  const VOID_SECTOR_CN = "寂域";

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
    return r.json();
  }

  async function loadStarMap() {
    const resp = await fetch(CONFIG.STARMAP_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  }

  function getPlanetInfo(enName, starmap) {
    if (!enName || !starmap) return null;
    if (starmap.planets && typeof starmap.planets === "object") {
      const entry = starmap.planets[enName];
      if (entry) {
        return {
          id: entry.ID,
          cn: entry.cn || enName,
          system: entry.system || "",
          systemEn: entry.sector_en || "",
          position: entry.position || null,
        };
      }
    }
    if (Array.isArray(starmap.systems)) {
      for (const sys of starmap.systems) {
        for (const p of (sys.planets || [])) {
          if (p.en === enName) {
            return {
              id: p.id,
              cn: p.cn || enName,
              system: sys.name || sys.name_en || "",
              systemEn: sys.name_en || "",
              position: p.position || null,
            };
          }
        }
      }
    }
    return null;
  }

  function buildStarmapIndex(starmap) {
    const idx = {};
    if (!starmap) return idx;
    if (Array.isArray(starmap.systems)) {
      starmap.systems.forEach(sys => {
        (sys.planets || []).forEach(p => {
          if (p && p.en) {
            idx[p.en.toUpperCase()] = {
              en: p.en, cn: p.cn || p.en,
              sector: sys.name || sys.name_en || "",
              sector_en: sys.name_en || "",
            };
          }
        });
      });
    }
    if (starmap.planets && typeof starmap.planets === "object") {
      Object.entries(starmap.planets).forEach(([key, val]) => {
        const k = key.toUpperCase();
        if (!idx[k] && val && typeof val === "object") {
          idx[k] = {
            en: key, cn: val.cn || key,
            sector: val.system || val.sector || "",
            sector_en: val.sector_en || "",
          };
        }
      });
    }
    return idx;
  }

  /**
   * 判断星区是否为寂域
   */
  function isVoidSector(sectorEn, sectorCn) {
    return (sectorEn || "").toUpperCase() === VOID_SECTOR_EN.toUpperCase()
        || (sectorCn || "").trim() === VOID_SECTOR_CN;
  }

  /**
   * 主入口：加载全部星球，按层分离
   */
  async function loadAll() {
    const [data, starmap, indexMap, waypointsData] = await Promise.all([
      fetchJson(CONFIG.DATA_URL),
      fetchJson(CONFIG.STARMAP_URL).catch(() => null),
      fetchJson(CONFIG.INDEX_URL).catch(() => null),
      fetchJson(CONFIG.WAYPOINTS_URL).catch(() => null),
    ]);

    const starIdx = buildStarmapIndex(starmap);
    const planetById = {};
    (data.planets || []).forEach(p => { planetById[p.index] = p; });

    // 解析星球名
    function resolveName(enName) {
      if (!enName) return { name: "未知", nameEn: "", sector: "", sectorEn: "" };
      const info = starIdx[enName.toUpperCase()];
      if (info) return { name: info.cn, nameEn: info.en, sector: info.sector, sectorEn: info.sector_en };
      return { name: enName, nameEn: enName, sector: "", sectorEn: "" };
    }

    // 找到 data.planets 中对应星球（按名称匹配）
    function findPlanetStatus(enName) {
      if (!enName) return null;
      const up = enName.toUpperCase();
      for (const p of (data.planets || [])) {
        if ((p.name || "").toUpperCase() === up) return p;
      }
      return null;
    }

    const mainNodes = [];
    const voidNodes = [];
    const campaignSet = new Set();
    (data.campaigns || []).forEach(c => {
      if (c.planet && c.planet.index != null) campaignSet.add(c.planet.index);
    });

    // 遍历 starmap 顶层 planets（278 个）
    if (starmap && starmap.planets && typeof starmap.planets === "object") {
      Object.entries(starmap.planets).forEach(([en, entry]) => {
        const rn = resolveName(en);
        const status = findPlanetStatus(en) || {};
        const isCampaign = status.index != null && campaignSet.has(status.index);
        const campaignType = isCampaign ? ((data.campaigns || []).find(c => c.planet && c.planet.index === status.index) || {}).campaignType || "liberation" : null;
        const faction = isCampaign ? ((data.campaigns || []).find(c => c.planet && c.planet.index === status.index) || {}).faction || "" : "";

        const pos = entry.position || null;
        const node = {
          id: entry.ID,
          name: rn.name,
          nameEn: en,
          sector: rn.sector || entry.system || "",
          sectorEn: rn.sectorEn || entry.sector_en || "",
          x: pos ? pos.x : null,
          y: pos ? pos.y : null,
          owner: status.currentOwner || "None",
          health: status.health || 0,
          maxHealth: status.maxHealth || 1,
          players: status.players || 0,
          resistance: status.resistance || 0,
          campaignType: campaignType,
          faction: faction,
          isCampaign: isCampaign,  // 是否活跃战区
        };

        // 降级：无坐标时随机
        if (node.x === null) {
          console.warn("未找到星球坐标:", en, "使用随机位置");
          node.x = (Math.random() - 0.5) * 0.8;
          node.y = (Math.random() - 0.5) * 0.8;
        }

        // 按层分离
        if (isVoidSector(node.sectorEn, node.sector)) {
          voidNodes.push(node);
        } else {
          mainNodes.push(node);
        }
      });
    }

    // 补漏：遍历 systems 中未在顶层 planets 的星球（如 VOID SOURCE PLANET）
    if (starmap && Array.isArray(starmap.systems)) {
      const processed = new Set(Object.keys(starmap.planets || {}).map(k => k.toUpperCase()));
      starmap.systems.forEach(sys => {
        (sys.planets || []).forEach(p => {
          const en = p.en;
          if (!en || processed.has(en.toUpperCase())) return;
          processed.add(en.toUpperCase());

          const rn = resolveName(en);
          const status = findPlanetStatus(en) || {};
          const isCampaign = status.index != null && campaignSet.has(status.index);
          const campaignType = isCampaign ? ((data.campaigns || []).find(c => c.planet && c.planet.index === status.index) || {}).campaignType || "liberation" : null;
          const faction = isCampaign ? ((data.campaigns || []).find(c => c.planet && c.planet.index === status.index) || {}).faction || "" : "";

          const node = {
            id: status.index != null ? status.index : -1,
            name: rn.name,
            nameEn: en,
            sector: rn.sector || sys.name || "",
            sectorEn: rn.sectorEn || sys.name_en || "",
            x: null,
            y: null,
            owner: status.currentOwner || "None",
            health: status.health || 0,
            maxHealth: status.maxHealth || 1,
            players: status.players || 0,
            resistance: status.resistance || 0,
            campaignType: campaignType,
            faction: faction,
            isCampaign: isCampaign,
          };

          // 从 starmap.planets 或直接取 position
          const entry = starmap.planets ? starmap.planets[en] : null;
          const pos = (entry && entry.position) || null;
          if (pos) {
            node.x = pos.x;
            node.y = pos.y;
          }
          if (node.x === null) {
            console.warn("未找到星球坐标:", en, "使用随机位置");
            node.x = (Math.random() - 0.5) * 0.8;
            node.y = (Math.random() - 0.5) * 0.8;
          }

          if (isVoidSector(node.sectorEn, node.sector)) {
            voidNodes.push(node);
          } else {
            mainNodes.push(node);
          }
        });
      });
    }

    // 构建供应线（waypoints）
    const waypoints = (waypointsData && waypointsData.waypoints) || {};
    const nodeById = {};
    [...mainNodes, ...voidNodes].forEach(n => { if (n.id != null) nodeById[n.id] = n; });

    function buildSupplyLines(nodes) {
      const lines = [];
      const processed = new Set();
      const nodeSet = new Set(nodes.map(n => n.id));
      nodes.forEach(n => {
        const targets = waypoints[String(n.id)] || [];
        targets.forEach(tid => {
          if (!nodeSet.has(tid)) return;
          const key = [n.id, tid].sort().join("-");
          if (processed.has(key)) return;
          processed.add(key);
          const tgt = nodeById[tid];
          if (!tgt) return;
          lines.push({ source: n, target: tgt });
        });
      });
      return lines;
    }

    const mainSupplyLines = buildSupplyLines(mainNodes);
    const voidSupplyLines = buildSupplyLines(voidNodes);

    // 连线：仅活跃战区有自环
    function makeLinks(nodes) {
      return nodes.filter(n => n.isCampaign).map(n => ({
        source: n, target: n,
        faction: n.faction,
        campaignType: n.campaignType,
        rate: 1.0,
      }));
    }

    return {
      mainNodes,
      voidNodes,
      mainLinks: makeLinks(mainNodes),
      voidLinks: makeLinks(voidNodes),
      mainSupplyLines,
      voidSupplyLines,
      rawData: data,
      meta: { fetchedAt: data.fetchedAt },
    };
  }

  return { loadAll, OWNER_CN, loadStarMap, getPlanetInfo };
})();