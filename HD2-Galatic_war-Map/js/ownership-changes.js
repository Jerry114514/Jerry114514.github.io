"use strict";

window.HD2Changes = (() => {
  const FACTIONS = {
    Humans: ["超级地球", "humans"], Terminids: ["终结族", "terminids"],
    Automaton: ["机器人", "automaton"], Illuminate: ["光能者", "illuminate"],
  };
  const HOUR = 3600000;
  const esc = value => String(value).replace(/[&<>"']/g,
    ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

  function select(history, hours, now = Date.now()) {
    if (!history) return null;
    const cutoff = now - hours * HOUR;
    const events = history.events.filter(event => {
      const time = Date.parse(event.detectedAt);
      return time >= cutoff && time <= now && Number.isInteger(event.planetIndex)
        && FACTIONS[event.fromOwner] && FACTIONS[event.toOwner] && event.fromOwner !== event.toOwner;
    }).sort((a, b) => Date.parse(a.detectedAt) - Date.parse(b.detectedAt));
    const planets = new Map();
    for (const event of events) {
      let row = planets.get(event.planetIndex);
      if (!row) {
        row = { planetIndex: event.planetIndex, paths: [], changes: 0, uncertain: false };
        planets.set(event.planetIndex, row);
      }
      const last = row.paths.at(-1);
      if (last?.at(-1) === event.fromOwner) last.push(event.toOwner);
      else row.paths.push([event.fromOwner, event.toOwner]);
      row.changes++;
      row.uncertain ||= Date.parse(event.previousSeenAt) < cutoff;
      row.latest = event.detectedAt;
    }
    return {
      rows: [...planets.values()].sort((a, b) => Date.parse(b.latest) - Date.parse(a.latest)),
      changes: events.length,
      coverageHours: Math.max(0, Math.min(hours, 48,
        (Math.min(now, Date.parse(history.updatedAt)) - Math.max(cutoff, Date.parse(history.startedAt))) / HOUR)),
      stale: now - Date.parse(history.updatedAt) > 20 * 60000,
    };
  }

  function mount(section, nameOf) {
    let hours = 24;
    let data = null;
    const content = section.querySelector(".changes-content");
    const meta = section.querySelector(".changes-meta");
    const note = section.querySelector(".changes-note");
    const buttons = [...section.querySelectorAll("[data-hours]")];
    function render(snapshot) {
      data = snapshot;
      const view = select(data?.ownership_history, hours);
      buttons.forEach(button => button.setAttribute("aria-pressed", String(+button.dataset.hours === hours)));
      if (!view) {
        meta.textContent = "";
        content.innerHTML = '<div class="empty">星图变化记录暂不可用</div>';
        note.textContent = "";
        return;
      }
      meta.textContent = `${view.rows.length} 颗星球 · ${view.changes} 次变化`;
      const coverage = view.coverageHours < hours - .1
        ? `记录覆盖约 ${view.coverageHours.toFixed(1)} 小时` : "";
      note.textContent = [coverage, view.stale ? "数据更新延迟" : ""].filter(Boolean).join(" · ");
      if (!view.rows.length) {
        content.innerHTML = '<div class="empty">已记录时段内无阵营变化</div>';
        return;
      }
      const planets = new Map((data.planets || []).map(planet => [planet.index, planet]));
      const faction = owner => `<span class="changes-faction changes-${FACTIONS[owner][1]}">${FACTIONS[owner][0]}</span>`;
      content.innerHTML = view.rows.map(row => {
        const planet = planets.get(row.planetIndex) || { index: row.planetIndex, name: `#${row.planetIndex}` };
        const paths = row.paths.map(path => path.map(faction).join('<span class="changes-arrow" aria-label="变为">→</span>')).join('<span class="changes-break">；</span>');
        return `<div class="changes-row"><a class="changes-planet" href="./planet.html?idx=${row.planetIndex}">${esc(nameOf(planet, data))}</a><div class="changes-path">${paths}${row.uncertain ? '<span class="changes-uncertain">范围待确认</span>' : ""}</div></div>`;
      }).join("");
    }
    buttons.forEach(button => button.addEventListener("click", () => {
      hours = +button.dataset.hours;
      render(data);
    }));
    return render;
  }
  return { select, mount };
})();
