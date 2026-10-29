# -*- coding: utf-8 -*-
"""Detect semantic HD2 API changes in a stateless CI job.

The upstream "Galactic Wide Web" bot compares its in-memory current snapshot
against the previous refresh. GitHub Actions starts a fresh process each time,
so this script persists only the fields needed for the same comparison:

* official GalacticWarEffects definitions, keyed by effect id;
* each planet's active effect-id set.

The baseline advances only after a complete v2 snapshot and the live effect
endpoint have both been read successfully. A first run creates the baseline
without emitting a burst of false "new" notices.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_BASELINE = os.path.join(BASE_DIR, "data", "api_changes_baseline.json")
DEFAULT_DATA = os.path.join(BASE_DIR, "HD2-Galatic_war-Map", "data.json")
DEFAULT_LATEST_REPORT = os.path.join(BASE_DIR, "data", "api_changes_latest.md")
EFFECT_META_FILE = os.path.join(
    BASE_DIR, "HD2-Galatic_war-Map", "tables", "galactic_effects.json"
)
EFFECT_CN_FILE = os.path.join(
    BASE_DIR, "HD2-Galatic_war-Map", "tables", "effect_id_cn.json"
)
STARMAP_FILE = os.path.join(BASE_DIR, "HD2-Galatic_war-Map", "tables", "starmap.json")

WAR_ID = 801
OFFICIAL_API = "https://api.live.prod.thehelldiversgame.com"
EFFECTS_URL = f"{OFFICIAL_API}/api/WarSeason/GalacticWarEffects"
HEADERS = {
    "User-Agent": "HD2-DataSync/1.0 (api-content-watch)",
    "Accept": "application/json",
    "X-Super-Client": "Jerry114514",
    "X-Super-Contact": "https://jerry114514.github.io/",
    "Accept-Language": "en-US",
}

# GWW's effect_types.json exposes these two human-readable defaults. Keep only
# the fallback labels needed when our translation table has not caught up yet;
# the full localized name is always preferred when present locally.
EFFECT_TYPE_LABELS = {
    40: "增加作战兵力",
    71: "增加星图标记",
}


@dataclass
class ChangeSet:
    new_effects: list[str] = field(default_factory=list)
    removed_effects: list[str] = field(default_factory=list)
    removed_effect_defs: dict[str, dict[str, Any]] = field(default_factory=dict)
    changed_effects: list[tuple[str, dict[str, Any], dict[str, Any]]] = field(
        default_factory=list
    )
    planet_effects_added: dict[str, list[int]] = field(default_factory=dict)
    planet_effects_removed: dict[str, list[int]] = field(default_factory=dict)

    @property
    def count(self) -> int:
        return (
            len(self.new_effects)
            + len(self.removed_effects)
            + len(self.changed_effects)
            + sum(len(v) for v in self.planet_effects_added.values())
            + sum(len(v) for v in self.planet_effects_removed.values())
        )

    @property
    def has_changes(self) -> bool:
        return self.count > 0


def _load_json(path: str, default: Any = None) -> Any:
    try:
        with io.open(path, encoding="utf-8") as stream:
            return json.load(stream)
    except FileNotFoundError:
        return default


def _write_json_atomic(path: str, value: Any) -> None:
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp = path + ".tmp"
    with io.open(tmp, "w", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=1, sort_keys=True)
        stream.write("\n")
    os.replace(tmp, path)


def _write_text(path: str, value: str) -> None:
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as stream:
        stream.write(value)


def fetch_json(url: str, headers: dict[str, str], timeout: int = 30) -> Any:
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def _effect_id(value: Any) -> str:
    if isinstance(value, bool):
        raise ValueError("boolean is not a valid effect id")
    try:
        return str(int(value))
    except (TypeError, ValueError):
        text = str(value or "").strip()
        if not text:
            raise ValueError("effect id is missing")
        return text


def normalize_effects(payload: Any) -> dict[str, dict[str, Any]]:
    """Return stable effect definitions keyed by id."""
    if isinstance(payload, dict):
        rows = payload.get("effects")
        if isinstance(rows, dict):
            rows = list(rows.values())
    else:
        rows = payload
    if not isinstance(rows, list):
        raise ValueError("GalacticWarEffects response is not a list")

    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        effect_id = _effect_id(row.get("id", row.get("galacticEffectId")))
        if effect_id in out and out[effect_id] != row:
            raise ValueError(f"conflicting duplicate GalacticWarEffect id {effect_id}")
        out[effect_id] = {str(k): v for k, v in sorted(row.items())}
    if not out:
        raise ValueError("GalacticWarEffects response is empty")
    return out


def normalize_planet_effects(
    data: Any,
) -> tuple[dict[str, list[int]], dict[str, str]]:
    """Return planet effect-id sets and display names from the site snapshot."""
    if not isinstance(data, dict) or not isinstance(data.get("planets"), list):
        raise ValueError("data.json has no planets list")

    effects_by_planet: dict[str, list[int]] = {}
    names: dict[str, str] = {}
    for planet in data["planets"]:
        if not isinstance(planet, dict) or planet.get("index") is None:
            continue
        if not isinstance(planet.get("activeEffects"), list):
            continue
        try:
            planet_id = str(int(planet["index"]))
        except (TypeError, ValueError):
            continue
        values = set()
        for value in planet["activeEffects"]:
            try:
                values.add(int(value))
            except (TypeError, ValueError):
                continue
        effects_by_planet[planet_id] = sorted(values)
        names[planet_id] = str(planet.get("name") or f"PLANET_{planet_id}")

    if not effects_by_planet:
        raise ValueError("data.json has no usable planet activeEffects fields")
    return effects_by_planet, names


def _sort_ids(ids: set[str] | list[str]) -> list[str]:
    def key(value: str) -> tuple[int, Any]:
        try:
            return (0, int(value))
        except ValueError:
            return (1, value)

    return sorted((str(value) for value in ids), key=key)


def diff_snapshots(
    baseline: dict[str, Any],
    effects: dict[str, dict[str, Any]],
    planet_effects: dict[str, list[int]],
) -> ChangeSet:
    """Compare normalized snapshots. This function performs no I/O."""
    previous_effects = baseline.get("effects") or {}
    previous_planets = baseline.get("planet_effects") or {}

    old_ids = set(previous_effects)
    new_ids = set(effects)
    common_ids = old_ids & new_ids
    changes = ChangeSet(
        new_effects=_sort_ids(new_ids - old_ids),
        removed_effects=_sort_ids(old_ids - new_ids),
        removed_effect_defs={
            effect_id: previous_effects[effect_id]
            for effect_id in old_ids - new_ids
        },
    )
    for effect_id in _sort_ids(common_ids):
        before = previous_effects[effect_id]
        after = effects[effect_id]
        if before != after:
            changes.changed_effects.append((effect_id, before, after))

    # Only compare planets seen in both snapshots. Otherwise the first run after
    # adding a baseline category looks like every effect on every planet is new.
    for planet_id in sorted(set(previous_planets) & set(planet_effects), key=int):
        old = {int(value) for value in previous_planets[planet_id]}
        new = set(planet_effects[planet_id])
        added = sorted(new - old)
        removed = sorted(old - new)
        if added:
            changes.planet_effects_added[planet_id] = added
        if removed:
            changes.planet_effects_removed[planet_id] = removed
    return changes


def _load_effect_meta() -> dict[str, Any]:
    value = _load_json(EFFECT_META_FILE, {})
    return value if isinstance(value, dict) else {}


def _load_effect_cn() -> dict[str, str]:
    """effect_id → 中文短名（tables/effect_id_cn.json，站内对照表）。"""
    value = _load_json(EFFECT_CN_FILE, {})
    if not isinstance(value, dict):
        return {}
    return {str(key): str(text) for key, text in value.items() if text}


def _load_planet_cn() -> dict[str, str]:
    """英文星球名（大写）→ 中文名（tables/starmap.json 的 cn 字段）。"""
    starmap = _load_json(STARMAP_FILE, {})
    planets = starmap.get("planets") if isinstance(starmap, dict) else None
    if not isinstance(planets, dict):
        return {}
    out: dict[str, str] = {}
    for name, info in planets.items():
        if isinstance(info, dict) and info.get("cn"):
            out[str(name).upper()] = str(info["cn"])
    return out


def _clean_inline(value: Any, limit: int = 180) -> str:
    text = " ".join(str(value or "").replace("`", "'").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def effect_label(
    effect_id: str,
    effect: dict[str, Any] | None,
    meta: dict[str, Any],
    effect_cn: dict[str, str] | None = None,
) -> str:
    cn = (effect_cn or {}).get(str(effect_id))
    if cn:
        return cn
    item = meta.get(effect_id)
    if isinstance(item, dict):
        for key in ("name_cn", "description_cn", "name", "description"):
            text = _clean_inline(item.get(key))
            if text:
                return text
    effect = effect or {}
    try:
        effect_type = int(effect.get("effectType"))
    except (TypeError, ValueError):
        effect_type = None
    if effect_type in EFFECT_TYPE_LABELS:
        return EFFECT_TYPE_LABELS[effect_type]
    if effect_type is not None:
        return f"银河效果类型 {effect_type}"
    return "未知银河效果"


def planet_display(
    planet_id: str, planet_names: dict[str, str], planet_cn: dict[str, str]
) -> str:
    """星球显示名：优先 starmap 中文名，缺表时保留英文名。"""
    raw = planet_names.get(planet_id)
    if not raw:
        return f"未知星球（{planet_id}）"
    return planet_cn.get(str(raw).upper(), raw)


def _effect_line(
    effect_id: str,
    effects: dict[str, dict[str, Any]],
    meta: dict[str, Any],
    effect_cn: dict[str, str] | None = None,
) -> str:
    return (
        f"- `{effect_id}` — "
        f"{effect_label(effect_id, effects.get(effect_id), meta, effect_cn)}"
    )


def render_report(
    changes: ChangeSet,
    effects: dict[str, dict[str, Any]],
    planet_names: dict[str, str],
    meta: dict[str, Any],
    checked_at: str,
    warnings: list[str],
    initial: bool = False,
    effect_cn: dict[str, str] | None = None,
    planet_cn: dict[str, str] | None = None,
) -> str:
    effect_cn = effect_cn or {}
    planet_cn = planet_cn or {}
    lines = [
        "# HD2 API 内容变更",
        "",
        f"- 检测时间（UTC）：{checked_at}",
        f"- 当前银河效果定义：{len(effects)} 条",
        "",
    ]
    if initial:
        lines.extend(
            [
                "首次建立基线，未生成变更通知；下一次运行开始做增量比较。",
                "",
            ]
        )
    elif not changes.has_changes:
        lines.extend(["本次未检测到新增、移除或定义变更。", ""])

    if changes.new_effects:
        lines.extend(["## 新增的银河效果 ✅", ""])
        lines.extend(
            _effect_line(effect_id, effects, meta, effect_cn)
            for effect_id in changes.new_effects
        )
        lines.append("")

    if changes.removed_effects:
        lines.extend(["## 移除的银河效果 ❌", ""])
        lines.extend(
            _effect_line(effect_id, changes.removed_effect_defs, meta, effect_cn)
            for effect_id in changes.removed_effects
        )
        lines.append("")

    if changes.changed_effects:
        lines.extend(["## 定义变更的银河效果 🔄", ""])
        for effect_id, before, after in changes.changed_effects:
            fields = sorted(
                key
                for key in set(before) | set(after)
                if before.get(key) != after.get(key)
            )
            lines.append(
                f"- `{effect_id}` — "
                f"{effect_label(effect_id, after, meta, effect_cn)}"
            )
            for name in fields:
                left = _clean_inline(json.dumps(before.get(name), ensure_ascii=False))
                right = _clean_inline(json.dumps(after.get(name), ensure_ascii=False))
                lines.append(f"  - `{name}`: `{left}` → `{right}`")
        lines.append("")

    planet_ids = sorted(
        set(changes.planet_effects_added) | set(changes.planet_effects_removed),
        key=int,
    )
    for planet_id in planet_ids:
        lines.extend(
            [
                f"## 变更：{planet_display(planet_id, planet_names, planet_cn)}",
                "",
            ]
        )
        if planet_id in changes.planet_effects_added:
            lines.extend(["### 新增的星球效果 ✅", ""])
            lines.extend(
                _effect_line(effect_id, effects, meta, effect_cn)
                for effect_id in map(str, changes.planet_effects_added[planet_id])
            )
            lines.append("")
        if planet_id in changes.planet_effects_removed:
            lines.extend(["### 移除的星球效果 ❌", ""])
            lines.extend(
                _effect_line(effect_id, effects, meta, effect_cn)
                for effect_id in map(str, changes.planet_effects_removed[planet_id])
            )
            lines.append("")

    if warnings:
        lines.extend(["## ⚠️ 侦测告警", ""])
        lines.extend(f"- {warning}" for warning in warnings)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def _write_github_output(path: str | None, values: dict[str, Any]) -> None:
    if not path:
        return
    with io.open(path, "a", encoding="utf-8", newline="\n") as stream:
        for key, value in values.items():
            text = str(value).lower() if isinstance(value, bool) else str(value)
            stream.write(f"{key}={text}\n")


def _data_is_fresh(data: dict[str, Any], max_age_hours: float) -> bool:
    raw = data.get("fetchedAt")
    if not isinstance(raw, str):
        return False
    try:
        stamp = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            return False
        age = (datetime.now(timezone.utc) - stamp.astimezone(timezone.utc)).total_seconds()
        return -600 <= age <= max_age_hours * 3600
    except (TypeError, ValueError, OverflowError):
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", default=DEFAULT_BASELINE)
    parser.add_argument("--data", default=DEFAULT_DATA)
    parser.add_argument("--report", default="")
    parser.add_argument(
        "--latest-report",
        default=DEFAULT_LATEST_REPORT,
        help="仅在有变化时写出的仓库内报告",
    )
    parser.add_argument("--github-output", default="")
    parser.add_argument("--max-data-age-hours", type=float, default=2.0)
    parser.add_argument(
        "--init",
        action="store_true",
        help="强制把当前完整快照写成新基线，不发送变更",
    )
    parser.add_argument(
        "--force-latest-report",
        action="store_true",
        help="即使本次没有变化，也写出 --latest-report（用于手动 CI 取证）",
    )
    args = parser.parse_args()

    warnings: list[str] = []
    checked_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    effect_cn = _load_effect_cn()
    planet_cn = _load_planet_cn()

    effects: dict[str, dict[str, Any]] | None = None
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            effects = normalize_effects(fetch_json(EFFECTS_URL, HEADERS))
            break
        except Exception as exc:  # Network and malformed payloads share the fallback.
            last_error = exc
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
    if effects is None:
        warnings.append(
            f"GalacticWarEffects 获取失败，效果定义基线保持不变："
            f"{type(last_error).__name__}: {last_error}"
        )

    data = _load_json(args.data, {})
    if not isinstance(data, dict):
        data = {}
        warnings.append("data.json 无法解析为对象，本轮跳过星球效果比较")
    if data and not _data_is_fresh(data, args.max_data_age_hours):
        warnings.append(
            f"data.json 的 fetchedAt 缺失、过旧或晚于当前时间，"
            f"本轮跳过星球效果比较（阈值 {args.max_data_age_hours:g} 小时）"
        )
        data = {}

    planet_effects: dict[str, list[int]] | None = None
    planet_names: dict[str, str] = {}
    if data:
        try:
            planet_effects, planet_names = normalize_planet_effects(data)
        except Exception as exc:
            warnings.append(f"data.json 星球效果无法比较：{type(exc).__name__}: {exc}")

    baseline_value = _load_json(args.baseline, {})
    if not isinstance(baseline_value, dict):
        warnings.append("已有基线不是对象，将重新建立基线")
        baseline_value = {}
    baseline = baseline_value or {}
    baseline_ready = bool(
        baseline.get("effects") and baseline.get("planet_effects")
    )

    effects_ok = effects is not None
    planets_ok = planet_effects is not None
    initial = args.init or not baseline_ready
    if initial and not (effects_ok and planets_ok):
        warnings.append("首次基线需要效果定义和星球快照同时可用；本轮未写基线")
        changes = ChangeSet()
        report = render_report(
            changes,
            effects or {},
            planet_names,
            _load_effect_meta(),
            checked_at,
            warnings,
            initial=True,
            effect_cn=effect_cn,
            planet_cn=planet_cn,
        )
        if args.report:
            _write_text(args.report, report)
        if args.force_latest_report:
            _write_text(args.latest_report, report)
        _write_github_output(
            args.github_output,
            {
                "has_changes": False,
                "change_count": 0,
                "status": "degraded",
            },
        )
        print(report, end="")
        return 0

    if initial:
        changes = ChangeSet()
        new_baseline = {
            "_meta": {
                "version": 1,
                "war_id": WAR_ID,
                "updated_at": checked_at,
                "source": EFFECTS_URL,
            },
            "effects": effects,
            "planet_effects": planet_effects,
        }
        _write_json_atomic(args.baseline, new_baseline)
    else:
        comparable_effects = effects if effects_ok else baseline.get("effects") or {}
        comparable_planets = (
            planet_effects
            if planets_ok
            else baseline.get("planet_effects") or {}
        )
        changes = diff_snapshots(
            baseline,
            comparable_effects,
            comparable_planets,
        )
        # Do not let a failed source advance its half of the baseline.
        if effects_ok:
            baseline["effects"] = effects
        if planets_ok:
            baseline["planet_effects"] = planet_effects
        if changes.has_changes:
            baseline.setdefault("_meta", {})
            baseline["_meta"].update(
                {
                    "version": 1,
                    "war_id": WAR_ID,
                    "updated_at": checked_at,
                    "source": EFFECTS_URL,
                }
            )
            _write_json_atomic(args.baseline, baseline)

    report_effects = effects or baseline.get("effects") or {}
    report = render_report(
        changes,
        report_effects,
        planet_names,
        _load_effect_meta(),
        checked_at,
        warnings,
        initial=initial,
        effect_cn=effect_cn,
        planet_cn=planet_cn,
    )
    if args.report:
        _write_text(args.report, report)
    if changes.has_changes or args.force_latest_report:
        _write_text(args.latest_report, report)

    status = "ok" if effects_ok and planets_ok else "degraded"
    _write_github_output(
        args.github_output,
        {
            "has_changes": changes.has_changes,
            "change_count": changes.count,
            "status": status,
        },
    )
    print(report, end="")
    print(
        f"SUMMARY has_changes={str(changes.has_changes).lower()} "
        f"count={changes.count} status={status}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
