/* 战报只组装呈现数据；预测、实测、变种与易主判定复用主站模块。 */
(function (root) {
  "use strict";
  const HOUR = 3600000;
  const factions = { Humans: ["超级地球", "humans"], Terminids: ["终结族", "terminids"], Automaton: ["机器人", "automaton"], Illuminate: ["光能者", "illuminate"] };
  const number = v => v == null || v === "" || typeof v === "boolean" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  const clamp = n => Math.max(0, Math.min(100, n));
  const count = n => number(n) == null ? "未知" : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
  const percent = n => number(n) == null ? "未知" : `${n.toFixed(2)}%`;
  const rate = n => number(n) == null ? "未知" : `${n >= 0 ? "+" : ""}${n.toFixed(2)}%/小时`;
  const big = n => number(n) == null ? "未知" : n >= 1e8 ? `${(n / 1e8).toFixed(1)} 亿` : count(n);
  const plain = value => String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
  // 请求 zh-CN 的接口仍可能返回英文。只有实际含中文的条目才能进入战报。
  const chinese = value => /[\u3400-\u9fff]/.test(plain(value));
  const localized = value => chinese(value) ? plain(value).replace(/\bIlluminates?\b/gi, "光能者").replace(/\bAutomatons?\b/gi, "机器人").replace(/\bTerminids?\b/gi, "终结族") : "";
  // 复用原战报生态译名；缺少中文的环境名不回退英文。
  const BIOME_CN = { Plains: "平原", "Ionic Crimson": "离子赤原", "Icy Glaciers": "冰川", "Desert Dunes": "沙漠沙丘", "Rocky Canyons": "岩石峡谷", "Basic Swamp": "沼泽", Tundra: "苔原", Boneyard: "骸骨之地", "Ethereal Jungle": "幽光丛林", "Volcanic Jungle": "火山丛林", "Acidic Badlands": "酸性荒原", "Haunted Swamp": "幽魂沼泽", "Scorched Moor": "焦土荒原", "Ionic Jungle": "离子丛林", Deadlands: "死寂之地", Moon: "卫星地表", "Desert Cliffs": "沙漠断崖", Magma: "熔岩", "Hive World": "虫巢世界", "Desert Oasis": "沙漠绿洲", "Deciduous Autumn Forest": "秋色落叶林", "Deciduous Forest": "落叶林", "Super Earth": "超级地球", Supercolony: "超级虫巢", "Cyberstan Megafactory": "生化斯坦巨型工厂", "ACCESS DENIED": "权限不足" };
  const HAZARD_CN = { "Ion Storms": "离子风暴", Tremors: "地震", Blizzards: "暴风雪", Sandstorms: "沙暴", "Volcanic Activity": "火山活动", "Acid Storms": "酸雨风暴", "Fire Tornadoes": "火焰龙卷", "Meteor Storms": "陨石风暴", "Extreme Cold": "极寒", "Intense Heat": "酷热", "Thick Fog": "浓雾", Rainstorms: "暴雨", "Torrential Rain": "暴雨", "Firestorms": "火焰风暴", "Acid Rain": "酸雨", None: "无" };
  function environment(p, extras) {
    const profile = extras.environment?.planets?.[p.index];
    const rawBiome = (typeof p.biome === "object" ? p.biome?.name : p.biome) || profile?.biome;
    const biome = localized(rawBiome) || BIOME_CN[rawBiome] || "未同步";
    const hazards = Array.isArray(p.hazards) ? p.hazards : profile?.hazards;
    const names = Array.isArray(hazards) ? hazards.map(h => typeof h === "string" ? h : h?.name).filter(Boolean) : null;
    const labels = names?.map(name => localized(name) || HAZARD_CN[name] || "名称待汉化");
    return `生态：${biome}　|　环境：${labels ? labels.length ? [...new Set(labels)].join("、").replace(/^无$/, "无额外事件") : "无额外事件" : "未同步"}`;
  }
  const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "时间未知";
  const liberation = p => p?.currentOwner === "Humans" ? 100 : number(p?.health) != null && p?.maxHealth > 0 ? clamp((1 - p.health / p.maxHealth) * 100) : null;
  const line = (text, tone = "", small = false) => ({ text, tone, small });
  const block = (title, lines = [], extra = {}) => ({ title, lines, ...extra });
  const section = (key, title, blocks, note = "") => ({ key, title, blocks, note });

  function news(data, extras = {}) {
    const rows = new Map();
    function add(items, fallback = false) {
      for (const item of items || []) {
        const id = String(item.id ?? "");
        if (!id || rows.has(id)) continue;
        const text = localized(item.translated || (fallback ? item.message : ""));
        if (!text) continue;
        const official = fallback || item.official_zh === true || item.text_source === "official_zh";
        rows.set(id, { id, text, published: item.published_at || item.published,
          source: official ? "官方简中" : item.mt ? "站点汉化 · 机翻" : "站点汉化" });
      }
    }
    add(data.news);
    add(extras.translations?.items);
    add((extras.official?.dispatches || []).filter(x => x.official_zh === true));
    if (/^zh-(?:Hans|CN)$/i.test(extras.fallback?.language || "")) add(extras.fallback.dispatches, true);
    return [...rows.values()].sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0) || Number(b.id) - Number(a.id));
  }

  function makeNames(starmap = {}) {
    const byName = {};
    for (const system of starmap.systems || []) for (const p of system.planets || []) if (p.en && p.cn) byName[p.en.toUpperCase()] = p.cn;
    for (const p of Object.values(starmap.planets || {})) if (p.en && p.cn) byName[p.en.toUpperCase()] = p.cn;
    return p => p ? localized(p.name_zh || p.cn || byName[String(p.name || "").toUpperCase()]) || `星球 ${p.index}` : "位置未知";
  }

  function planetRate(data, p, recent) {
    if (!(p.maxHealth > 0)) return null;
    const diag = recent?.planetDiag(p);
    if (diag?.ok) return { ...diag.value, source: "近期实测" };
    const resistance = number(p.resistance), impact = number(data.impactMultiplier), players = number(p.players);
    if (resistance == null || impact == null || players == null) return null;
    const gross = players * impact * 90 / p.maxHealth * 100;
    const why = { capped: "满血顶格", owner: "窗口内易主", noframes: "无有效实测帧", bad: "实测数据不足" };
    return { gross, res: resistance, net: gross - resistance, source: `推演 · ${why[diag?.reason] || "无有效实测帧"}` };
  }

  function battleHealth(data, planet, campaign) {
    const defense = root.HD2Forecast.isDefense(campaign);
    const pool = defense ? (data.planet_events || []).find(event => event.planetIndex === planet.index && event.eventType === 1) : planet;
    const maximum = number(pool?.maxHealth), maxHealth = maximum > 0 ? maximum : null;
    const health = number(pool?.health), multiple = maxHealth == null ? null : maxHealth / 1e6;
    const resistance = number(defense ? campaign.attackersRate : planet.resistance);
    const equivalent = multiple == null || resistance == null ? null : resistance * multiple;
    const wan = value => value == null ? "未知" : `${(value / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 万`;
    const healthText = `${defense ? "战役血量" : "血量"} ${wan(health)} / ${wan(maxHealth)} · 血条 ${multiple == null ? "倍数未知" : "×" + multiple.toFixed(2)}`;
    const resistanceText = `${defense ? "等效入侵压力" : "等效抵抗度"} ${equivalent == null ? "未知" : percent(equivalent) + "/小时"}（百万血基准）`;
    return { health, maxHealth, multiple, equivalent, defense, healthText, resistanceText };
  }

  function planetRegions(data, planet, extras, recent) {
    const catalog = extras.regions?.planets?.[planet.index]?.regions || [];
    const translations = extras.regionsZh?.planets?.[planet.index] || {};
    const indices = new Set(catalog.map((_, index) => index));
    for (const [index, region] of (planet.regions || []).entries()) {
      const id = number(region.regionIndex) ?? index;
      if (Number.isInteger(id) && id >= 0) indices.add(id);
    }
    return [...indices].sort((a, b) => a - b).map(index => {
      const meta = catalog[index] || {}, live = root.HD2Regions.live(planet, index);
      const recentMeta = live && recent?.regionMeta?.(planet.index, live, Date.parse(data.fetchedAt));
      const info = root.HD2Regions.model(planet, live, meta, data, recentMeta);
      const factory = String(meta.region_type || "").toLowerCase() === "megafactory" || ((number(live?.flags) || 0) & 1) !== 0;
      const type = factory ? "超大型工厂" : { Settlement: "定居点", Town: "城镇", City: "城市", MegaCity: "大城市" }[meta.size]
        || ["定居点", "城镇", "城市", "大城市"][live?.regionSize] || "区域";
      const name = localized(translations[meta.name] || meta.name_zh || meta.cn || meta.name) || `${type} ${index + 1}（名称待汉化）`;
      const ours = live && (live.owner === 1 || String(live.owner).toLowerCase() === "humans");
      const inactive = !live && planet.currentOwner === "Humans" && !info.defense;
      const progress = ours || inactive ? 100 : number(live?.health) != null && live.maxHealth > 0 ? clamp((1 - live.health / live.maxHealth) * 100) : null;
      let r = null;
      if (info.available === true && !ours && live?.maxHealth > 0) {
        const diag = recent?.regionDiag?.(planet.index, live);
        if (diag?.ok) r = { ...diag.value, source: "近期实测" };
        else if (number(recentMeta?.res) != null && number(live.players) != null && number(data.impactMultiplier) != null) {
          const gross = live.players * data.impactMultiplier * 90 / live.maxHealth * 100;
          const why = { capped: "满血顶格", owner: "窗口内易主", noframes: "无有效实测帧", bad: "实测数据不足" };
          r = { gross, res: recentMeta.res, net: gross - recentMeta.res, source: `推演 · ${why[diag?.reason] || "无有效实测帧"}` };
        }
      }
      let forecast = "";
      if (r && progress != null) forecast = r.net > 0 ? `预计解放还需 ${root.HD2Forecast.duration((100 - progress) / r.net)}`
        : r.net < 0 ? progress === 0 ? "解放进度已归零" : `预计归零 ${root.HD2Forecast.duration(progress / -r.net)}` : "当前节奏：僵持";
      const contribution = number(info.contribution);
      const contributionText = `一次性回馈：${info.target} ${contribution == null ? "未知" : "+" + contribution.toFixed(2) + " 个百分点"}${contribution != null && info.estimated ? "（估算）" : ""}`;
      const detail = [info.condition, contributionText, r ? `净推进 ${rate(r.net)} · 抵抗 ${percent(r.res)}/小时 · ${forecast} · ${r.source}` : ""].filter(Boolean).join(" · ");
      const tone = r?.net < 0 ? "bad" : ours || inactive ? "good" : info.available === true ? "blue" : "muted";
      const bar = { label: `解放进度 · ${info.status}`, value: progress, tone, direction: r ? r.net > 0 ? "right" : r.net < 0 ? "left" : "still" : "none" };
      return { index, name, type, available: info.available, status: info.status, progress, players: number(live?.players), contribution, contributionEstimated: info.estimated, contributionText, detail, bar };
    });
  }

  function compareBaseline(current, previous) {
    if (!Array.isArray(previous?.planets)) return null;
    const hours = (Date.parse(current.fetchedAt) - Date.parse(previous.fetchedAt)) / HOUR;
    if (!(hours >= 23 && hours <= 27)) return null;
    const before = new Map(previous.planets.map(p => [p.index, p])), owners = [], moves = [];
    for (const p of current.planets) {
      const old = before.get(p.index);
      if (!old || p.disabled || old.disabled || !factions[old.currentOwner] || !factions[p.currentOwner]) continue;
      if (old.currentOwner !== p.currentOwner) { owners.push({ planet: p, from: old.currentOwner, to: p.currentOwner }); continue; }
      const a = liberation(old), b = liberation(p);
      if (a == null || b == null || number(old.maxHealth) !== number(p.maxHealth)) continue;
      if (Math.abs(b - a) >= 3) moves.push({ planet: p, before: a, after: b, delta: b - a });
    }
    moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return { hours, owners, moves, fetchedAt: previous.fetchedAt };
  }

  function build(data, extras = {}) {
    if (!Array.isArray(data?.planets) || !data.planets.length || !Number.isFinite(Date.parse(data.fetchedAt))) throw new Error("主站战况快照不完整");
    const F = root.HD2Forecast, R = extras.recent || root.HD2Recent;
    const now = Date.parse(data.fetchedAt), nameOf = makeNames(extras.starmap);
    const byIndex = new Map(data.planets.map(p => [p.index, p]));
    const variables = {};
    for (const cat of extras.variables?.categories || []) for (const item of cat.entries || []) for (const id of item.effect_ids || []) variables[id] = { ...item, cat: cat.name };
    // 原战报只列交战星球上的敌方变种/特殊部队。图标的 tier 是呈现优先级，
    // 不能用作分类：其中还包含喷气旅工厂、友军 SEAF 等非敌方部队。
    const enemyCategories = new Set(["terminid_brood", "exotic_lifeform", "automaton_assemblage", "special_unit", "auxiliary_assemblage", "illuminate_sect"]);
    const enemyIds = new Set((extras.variables?.categories || []).filter(cat => enemyCategories.has(cat.key)).flatMap(cat => (cat.entries || []).flatMap(item => item.effect_ids || [])));
    const badges = p => {
      const result = root.HD2PlanetCardEffects?.effectBadges((p.activeEffects || []).filter(id => enemyIds.has(id)), { vars: variables });
      return [...(result?.shown || []), ...(result?.more || [])].filter(b => chinese(b.cn));
    };
    const duration = h => F.duration(h);
    const snapshotAt = data.fetchedAt;

    const stats = data.war_stats?.galaxy_stats || {};
    const warDays = number(data.war?.time) == null ? null : Math.floor(data.war.time / 86400) + 1;
    const earth = section("earth", "超级地球态势", [block(warDays == null ? "银河战争" : `银河战争计时第 ${warDays} 天`, [
      line(`消灭终结族 ${big(stats.bugKills)}`, "terminids"), line(`摧毁机器人 ${big(stats.automatonKills)}`, "automaton"), line(`消灭光能者 ${big(stats.illuminateKills)}`, "illuminate"),
      line(`任务成功 ${big(stats.missionsWon)} · 阵亡 ${big(stats.deaths)}`),
      line(`在线潜兵 ${count(data.player_distribution?.total ?? data.war?.statistics?.playerCount)}`, "good")])]);

    const a = data.assignments;
    const moBlocks = [];
    if (a?.tasks?.length) {
      const brief = [data.major_order?.translated_brief, extras.translations?.mo_brief?.translated, a.briefing].map(localized).find(Boolean);
      moBlocks.push(block(localized(data.major_order?.title || a.title) || "主要指令", [line(brief || "简中简报尚未同步，任务进度如下。")], { meta: `截止 ${date(a.deadline)} · 快照时剩余 ${duration(Math.max(0, (Date.parse(a.deadline) - now) / HOUR))}` }));
      const w = F.orderWindow(data, R?.assignmentFrames() || []);
      const recent = R?.moWindows(a, now);
      const equipNames = root.HD2MoEquipment?.nameById(data.major_order?.tasks, data.major_order?.id32) || {};
      for (const [i, t] of a.tasks.entries()) {
        const get = type => { const index = (t.valueTypes || []).indexOf(type); return index < 0 ? null : t.values?.[index]; };
        const location = get(11), target = get(12);
        const p = (location === 1 || location == null) && target ? byIndex.get(target) : null;
        const type = Number(t.type);
        const goal = type === 11 ? 100 : number(get(3));
        const current = type === 11 ? liberation(p) : number(a.progress?.[i]);
        const labels = { 2: "采集样本", 3: "消灭敌人", 4: "完成目标", 7: "成功撤离", 8: "奖励", 9: "完成行动", 11: "解放星球", 12: "防守星球", 13: "守住星球直到截止", 15: "净解放星球数" };
        const f = F.task({ type, goal, current, window: w, recentRate: recent?.h1?.rates[i] });
        const lines = [], bars = [];
        if (type === 13) lines.push(line(f.state !== "hold" ? "守持状态未知" : f.satisfied ? "当前持有，需保持至截止时结算" : "尚未持有，需夺回并守住", f.satisfied ? "good" : ""));
        else {
          bars.push({ label: "任务进度", value: goal > 0 && current != null ? clamp(current / goal * 100) : null, marker: f.expected, tone: "blue" });
          lines.push(line(`${count(current)} / ${count(goal)}`));
          if (f.state === "complete") lines.push(line("任务进度已达成", "good"));
          else if (f.projected != null) lines.push(line(`按下达以来均速：截止时约 ${percent(f.projected)} · ${f.etaH == null ? "暂无法估算完成时间" : `还需 ${duration(f.etaH)}`}`, f.win ? "good" : "bad", true));
          if (f.recentProjected != null) lines.push(line(`近 1 小时节奏对照：截止时约 ${percent(f.recentProjected)}`, "", true));
        }
        const equipment = get(5);
        if (equipment) lines.push(line(`限定装备：${localized(equipNames[equipment]?.name) || `装备编号 ${equipment}`}`, "", true));
        moBlocks.push(block(`任务 ${i + 1} · ${labels[type] || "任务目标"}${p ? ` ${nameOf(p)}` : ""}`, lines, { bars }));
      }
    } else moBlocks.push(block("", [line("当前没有进行中的主要指令", "", true)]));
    const mo = section("mo", "主要指令", moBlocks);

    const fronts = [];
    const activeIndices = new Set();
    for (const c of data.campaigns || []) {
      const p = byIndex.get(c.planet?.index);
      if (!p || p.disabled || activeIndices.has(p.index)) continue;
      activeIndices.add(p.index);
      const defense = F.isDefense(c), lines = [], bars = [], summary = [];
      let source = "", resultText = "", resultTone = "";
      if (defense) {
        const f = F.defense(c);
        bars.push({ label: "守方保卫进度", value: f.def, tone: "blue", direction: "right", side: `保卫 ${rate(f.rate)}` },
          { label: `攻方入侵进度 · ${factions[c.faction]?.[0] || "敌方"}`, value: f.atk, tone: "bad", direction: "right", side: `入侵 ${rate(number(c.attackersRate))}` });
        resultText = f.win == null ? "预测：数据不足" : f.win ? "预计守住" : "预计失守";
        resultTone = f.win == null ? "" : f.win ? "good" : "bad";
        summary.push(line(resultText, resultTone), line(`剩余 ${duration(f.remainingH)}`));
        if (f.projected != null) summary.push(line(`截止时 ${percent(f.projected)}`, "blue"));
        source = f.source;
        lines.push(line(`保卫 ${rate(f.rate)} · 入侵 ${rate(number(c.attackersRate))}`, "", true),
          line(f.win == null ? "数据不足，暂无法预测" : f.win ? `预计守住 · 还需 ${duration(f.etaH)}` : `预计失守 · 截止时保卫 ${percent(f.projected)}`, resultTone));
      } else {
        const progress = liberation(p), r = planetRate(data, p, R);
        const direction = r == null ? "unknown" : r.net > 0 ? "right" : r.net < 0 ? "left" : "still";
        bars.push({ label: "已解放", value: progress, tone: r == null ? "muted" : r.net < 0 ? "bad" : r.net === 0 ? "yellow" : "blue", direction, side: `净推进 ${rate(r?.net)}` });
        lines.push(line(`净推进 ${rate(r?.net)}`, r == null ? "" : r.net > 0 ? "good" : r.net < 0 ? "bad" : ""));
        if (r) {
          lines.push(line(`潜兵 +${r.gross.toFixed(2)}%/小时 · 敌方 -${r.res.toFixed(2)}%/小时`, "", true));
          const zeroEstimate = progress == null || r.net >= 0 ? "归零时间未知" : progress === 0 ? "解放进度已归零" : `预计归零 ${duration(progress / -r.net)}`;
          lines.push(line(r.net > 0 && progress != null ? `预计解放还需 ${duration((100 - progress) / r.net)}` : r.net === 0 ? "当前节奏：僵持" : r.net < 0 ? zeroEstimate : "完成时间未知", r.net > 0 ? "good" : r.net < 0 ? "bad" : ""));
          resultText = r.net > 0 && progress != null ? `预计 ${duration((100 - progress) / r.net)}` : r.net === 0 ? "预测 僵持" : r.net < 0 ? zeroEstimate : "完成时间未知";
          resultTone = r.net > 0 ? "good" : r.net < 0 ? "bad" : "yellow";
          summary.push(line(resultText, resultTone), line(`敌方 -${r.res.toFixed(2)}%`, "bad"), line(`潜兵 +${r.gross.toFixed(2)}%`, "blue"));
          source = r.source;
        }
      }
      const variants = badges(p).map(b => b.cn).join("、");
      const health = battleHealth(data, p, c);
      const regions = planetRegions(data, p, extras, R);
      lines.unshift(line(health.healthText, "", true), line(health.resistanceText, "", true));
      const environmentText = environment(p, extras);
      lines.push(line(environmentText, "", true));
      if (source) lines.push(line(source, "", true));
      if (variants) lines.push(line(variants, factions[p.currentOwner]?.[1] || "", true));
      for (const region of regions) {
        lines.push(line(`${region.name} · ${region.type} · ${region.status} · 已解放 ${percent(region.progress)} · 潜兵 ${count(region.players)}`, "", true));
        if (region.detail) lines.push(line(region.detail, "", true));
      }
      fronts.push({ index: p.index, players: number(p.players) ?? 0, ...block(nameOf(p), lines, { meta: `${factions[p.currentOwner]?.[0] || "归属未知"} · 潜兵 ${count(p.players)}`, bars, defense, href: `../HD2-Galatic_war-Map/planet.html?idx=${p.index}`,
        front: { mode: defense ? "保卫" : "解放", faction: factions[p.currentOwner]?.[0] || "归属未知", tone: factions[p.currentOwner]?.[1] || "", players: count(p.players), variants, summary, source, environment: environmentText, health, regions } }) });
    }
    fronts.sort((a, b) => b.players - a.players || a.index - b.index);
    const frontSection = section("fronts", "热门战线", fronts.slice(0, 5), `共 ${fronts.length} 条战线，按参战潜兵数列出前 5 颗。预测以保持当前节奏为条件。`);
    if (!fronts.length) frontSection.blocks.push(block("", [line("当前无可用战役数据。", "", true)]));

    const contested = new Set([...activeIndices, ...(data.planet_events || []).map(event => event.planetIndex)]);
    const armed = data.planets.filter(p => !p.disabled && contested.has(p.index) && badges(p).length)
      .map(p => ({ p, labels: badges(p).map(b => b.cn).sort((a, b) => a.localeCompare(b, "zh")) }))
      .sort((a, b) => b.labels.length - a.labels.length || nameOf(a.p).localeCompare(nameOf(b.p), "zh"));
    const armedBlocks = armed.map(({ p, labels }) => block(`${nameOf(p)}（${labels.length}）`, [line(labels.join("、"))], { href: `../HD2-Galatic_war-Map/planet.html?idx=${p.index}` }));
    if (!armed.length) armedBlocks.push(block("", [line(extras.variables ? "交战星球上暂无已确认的敌方变种或特殊部队。" : "敌方部队对照表暂不可用。", "", true)]));
    const armedSection = section("armed", "敌方变种／特殊部队", armedBlocks, extras.variables
      ? `当前 ${contested.size} 颗交战星球中，有 ${armed.length} 颗出现敌方变种或特殊部队。仅统计交战星球，不含设施、环境和友军火力。` : "");

    const distribution = data.player_distribution;
    const forces = section("forces", "阵营兵力", !distribution?.total ? [block("", [line("暂无在线兵力分布数据。", "", true)])] : [block("", [], { bars: Object.entries(factions).map(([key, [label, tone]]) => {
      const field = { Humans: "humans", Terminids: "terminids", Automaton: "automatons", Illuminate: "illuminate" }[key];
      const players = number(distribution[field]);
      return { label: `${label} · ${count(players)} 人`, value: players == null ? null : players / distribution.total * 100, tone };
    }) })]);

    const dss = data.dss, dssBlocks = [];
    if (dss) {
      dssBlocks.push(block(`停泊 · ${nameOf(byIndex.get(dss.planetIndex))}`, [line(`下次行动投票截止：${number(dss.electionEndWarTime) == null || number(data.war?.time) == null ? "未知" : date(new Date(now + (dss.electionEndWarTime - data.war.time) * 1000).toISOString())}`, "", true)]));
      const catalog = (extras.variables?.categories || []).filter(c => c.key === "tactical_action" || /战术行动/.test(c.name)).flatMap(c => c.entries || []);
      for (const { action, entry } of root.HD2DssDonations.actionEntries(dss.tacticalActions || [], catalog)) {
        const label = localized(entry.cn) || "战术行动";
        const status = { 1: "捐赠中", 2: "行动中", 3: "冷却中" }[action.status];
        const lines = [], bars = [];
        if (action.status === 1) {
          const pct = root.HD2DssDonations.progress(action), cost = action.cost?.[0];
          bars.push({ label: "捐赠进度", value: pct, tone: "yellow" });
          if (pct != null && number(cost?.deltaPerSec) > 0) lines.push(line(`按当前捐赠节奏约需 ${duration(Math.max(0, cost.target - cost.current) / cost.deltaPerSec / 3600)}`, "", true));
        } else if (number(action.expireAtWarTime) != null && number(data.war?.time) != null) lines.push(line(`剩余 ${duration(Math.max(0, action.expireAtWarTime - data.war.time) / 3600)}`, "", true));
        dssBlocks.push(block(`${label} · ${status}`, lines, { bars }));
      }
    } else dssBlocks.push(block("", [line("民主空间站状态暂不可用。", "", true)]));
    const dssSection = section("dss", "DSS 民主空间站", dssBlocks);

    const updates = news(data, extras);
    const newsSection = section("news", "战争报告", updates.slice(0, 8).map(item => {
      const [title, ...body] = item.text.split("\n");
      return block(title, [line(body.join("\n").trim())], { meta: `${date(item.published)} · ${item.source}` });
    }));
    if (!updates.length) newsSection.blocks.push(block("", [line("简中战争报告尚未同步。", "", true)]));

    const changes = root.HD2Changes.select(data.ownership_history, 24, now);
    const changeLines = changes?.rows.filter(row => row.paths.length).map(row => {
      const paths = row.paths.map(path => path.map(owner => factions[owner]?.[0] || "未知").join(" → ")).join("；");
      return line(`${nameOf(byIndex.get(row.planetIndex))}：${paths}${row.uncertain ? "（发生时间跨越窗口边界）" : ""}`, "", true);
    }) || [line("归属变化记录暂不可用。", "", true)];
    if (changes && !changeLines.length) changeLines.push(line("记录窗口内未检测到星球归属变化。", "", true));
    if (changes && changes.coverageHours < 23.9) changeLines.push(line(`易主记录仅覆盖约 ${changes.coverageHours.toFixed(1)} 小时。`, "", true));
    const history = (extras.players?.history || []).filter(p => Number.isFinite(Date.parse(p.timestamp)) && number(p.totalPlayers) != null);
    const baseline = history.filter(p => Date.parse(p.timestamp) <= now - 24 * HOUR).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
    if (baseline && now - 24 * HOUR - Date.parse(baseline.timestamp) <= HOUR && number(distribution?.total) != null) {
      const delta = distribution.total - baseline.totalPlayers;
      changeLines.push(line(`在线人数较 ${date(baseline.timestamp)}：${delta >= 0 ? "+" : ""}${count(delta)} 人`, "", true));
    }
    const comparison = compareBaseline(data, extras.baseline);
    let changeSection;
    if (comparison) {
      const diffLines = comparison.owners.map(row => line(`${nameOf(row.planet)}：${factions[row.from][0]} → ${factions[row.to][0]}`, row.to === "Humans" ? "good" : "bad", true));
      if (!diffLines.length) diffLines.push(line("对照两份快照，星球归属没有变化。", "", true));
      for (const row of comparison.moves.slice(0, 6)) diffLines.push(line(`${nameOf(row.planet)}：${percent(row.before)} → ${percent(row.after)}（${row.delta > 0 ? "+" : ""}${row.delta.toFixed(2)} 个百分点）`, row.delta > 0 ? "good" : "bad", true));
      const oldTotal = number(extras.baseline.player_distribution?.total), total = number(distribution?.total);
      if (oldTotal != null && total != null) diffLines.push(line(`在线潜兵 ${count(oldTotal)} → ${count(total)}（${total >= oldTotal ? "+" : ""}${count(total - oldTotal)}）`, "", true));
      changeSection = section("changes", "与 24 小时前对比", [block("", diffLines)], `基准 ${date(comparison.fetchedAt)} · 间隔 ${comparison.hours.toFixed(1)} 小时。列解放度变化至少 3 个百分点、幅度最大的 6 颗；易主另列，总血量变化不比较解放度。`);
    } else changeSection = section("changes", "与 24 小时前对比", [block("", [line("24 小时前的对照快照暂不可用，以下为主站已记录到的变化。", "", true), ...changeLines])], "以实际记录窗口为准，未记录到不等于从未发生。");
    const victoryLines = (changes?.rows || []).filter(row => row.victories.length).map(row => {
      const attackers = [...new Set(row.victories.map(event => factions[event.attacker]?.[0]).filter(Boolean))];
      const latest = row.victories.map(event => event.detectedAt).sort((a, b) => Date.parse(b) - Date.parse(a))[0];
      const uncertain = row.victories.some(event => Date.parse(event.previousSeenAt) < now - 24 * HOUR);
      return line(`${nameOf(byIndex.get(row.planetIndex))} · 防守成功 ${row.victories.length} 次${attackers.length ? ` · 击退${attackers.join("、")}` : ""} · 记录于 ${date(latest)}${uncertain ? "（发生时间可能跨越窗口边界）" : ""}`, "good", true);
    });
    if (!victoryLines.length) victoryLines.push(line(changes ? "可用记录内未发现防守成功战役。" : "防守成功记录暂不可用。", "", true));
    const defenseHours = number(changes?.defenseCoverageHours);
    const coverage = changes ? `主站近 24 小时记录 · 实际覆盖${defenseHours == null ? "未知" : "约 " + defenseHours.toFixed(1) + " 小时"}${changes.defenseStale ? " · 防守记录更新滞后" : ""}` : "";
    changeSection.blocks.push(block("防守成功", victoryLines, { meta: coverage }));

    const campaign = data.active_campaign;
    const campaignBlocks = [];
    if (campaign) {
      const title = localized(campaign.title_cn), brief = localized(campaign.description_cn);
      if (title || brief) campaignBlocks.push(block(title || "当前战役", brief ? [line(brief)] : []));
      for (const phase of campaign.phases || []) if (localized(phase.title_cn) || localized(phase.briefing_cn)) campaignBlocks.push(block(localized(phase.title_cn) || "战役阶段", [line(localized(phase.briefing_cn))], { meta: localized(phase.status_cn) }));
    }
    const right = [newsSection];
    if (campaignBlocks.length) right.push(section("campaign", "战役简报", campaignBlocks));
    return { snapshotAt, columns: [[mo, earth, armedSection, forces, changeSection], [dssSection, frontSection], right] };
  }

  function toText(model) {
    const out = [`超级地球 · 站点战报`, `战况快照 ${date(model.snapshotAt)}（北京时间）`];
    for (const col of model.columns) for (const s of col) {
      out.push("", `【${s.title}】`);
      if (s.note) out.push(s.note);
      for (const b of s.blocks) {
        if (b.title) out.push(`${b.front ? b.front.mode + " · " : ""}${b.title}`);
        if (b.meta) out.push(b.meta);
        for (const bar of b.bars || []) out.push(`${bar.label}：${percent(bar.value)}${number(bar.marker) == null ? "" : `（时间基准 ${percent(bar.marker)}）`}`);
        for (const l of b.lines) if (l.text) out.push(l.text);
      }
    }
    out.push("", "数据来源：真理部主站；缺失公告补充 Helldivers 2 API 简中缓存。预测以保持快照时节奏为条件。", "为了超级地球！");
    return out.join("\n");
  }
  root.HD2Report = { build, news, planetRate, liberation, compareBaseline, toText, plain, chinese, date, percent, number };
})(typeof window !== "undefined" ? window : globalThis);
