#!/usr/bin/env python3
"""实测帧缓存：把社区 CDN 的 15 分钟帧落到 HD2-Galatic_war-Map/data/recent/。

为什么需要它
------------
站点 `HD2-Galatic_war-Map/js/rate-source.js` 用这份缓存算「实测速率」
（星球四件套 / 城市四项 / MO 预期进度都是「实测优先，拿不到才退回推演」）。
Pages 直接发布仓库内容，所以**缓存不在仓库里就永远拿不到实测** ——
每张卡都会写「推演 · 无实测帧」。

口径与本地部署（`update-hd2.ps1 -DataOnly`）一致：
  planetRegions/recent.json   5 帧 ≈ 最近 1 小时（区域）
  planets/<idx>/recent.json   5 帧 ≈ 最近 1 小时（星球）
  assignments/2days.json      192 帧 ≈ 最近 48 小时（MO）

三条设计约束
------------
1. **对 CDN 客气**：先拿一颗星球的 1 KB 帧当探针，末帧时间没变就直接退出
   （帧 15 分钟才更新一次，而本脚本每 5 分钟被调用一次），只有真出新帧才全量拉。
   与本地部署 serve-local.js 的做法一致。
2. **绝不拖垮既有流水线**：抓不到帧只发 warning，始终 exit 0 —— fetch-data.yml
   后面还有 data.json 的提交与推送，不能被这份"锦上添花"的缓存连坐。
3. **不产生噪音提交**：只在内容真变了才落盘（没新帧时工作区始终干净，连
   mtime 都不动），所以多数次跑完 `git diff --cached` 是空的。

⚠ 帧是滚动窗口，必须持续刷新；页面侧另有「帧太旧就退回推演」的护栏
  （见 js/rate-source.js 的 STALE_AFTER_H），所以这份缓存即便断更也不会
  拿"过去那个小时"的差分冒充实时实测。
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

CDN = os.environ.get("HD2_CDN_BASE", "https://cdn.helldiverscompanion.com/live")
MIN_PLAYERS = int(os.environ.get("HD2_RECENT_MIN_PLAYERS", "20"))
TIMEOUT = float(os.environ.get("HD2_RECENT_TIMEOUT", "40"))
WINDOW_HOURS = 1  # 与 update-hd2.ps1 / rate-source.js 一致的取窗口

# 仓库根：CI 里就是仓库根；本地/别处跑可以用 HD2_SITE_ROOT 指到站点目录
ROOT = Path(os.environ.get("HD2_SITE_ROOT") or Path(__file__).resolve().parents[1])
MAP = ROOT / "HD2-Galatic_war-Map"
OUT = MAP / "data" / "recent"
DATA_JSON = MAP / "data.json"
IN_ACTIONS = bool(os.environ.get("GITHUB_ACTIONS"))
PLANET_FILE_RE = re.compile(r"planet_\d+\.json")


def warn(msg: str) -> None:
    """CI 里发 GitHub 注释（黄条），本地跑就只打日志。"""
    print(f"::warning::{msg}" if IN_ACTIONS else f"[recent] {msg}", file=sys.stderr)


def log(msg: str) -> None:
    print(f"[recent] {msg}")


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "hd2-site-fetch-recent/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read()


def save(rel: Path, raw: bytes) -> bool:
    """只在内容变了才落盘（保持工作区干净，也不抖 mtime）。"""
    rel.parent.mkdir(parents=True, exist_ok=True)
    if rel.exists() and rel.read_bytes() == raw:
        return False
    rel.write_bytes(raw)
    return True


def last_stamp(frames_raw: bytes | None) -> str | None:
    """帧文件的最后一帧时间（{data:[{timestampUtc,…}]} 结构）。"""
    if frames_raw is None:
        return None
    try:
        frames = json.loads(frames_raw.decode("utf-8")).get("data") or []
    except (ValueError, UnicodeDecodeError):
        return None
    for f in reversed(frames):
        if f.get("timestampUtc"):
            return f["timestampUtc"]
    return None


def read_bytes(path: Path) -> bytes | None:
    try:
        return path.read_bytes()
    except OSError:
        return None


def main() -> int:
    if not DATA_JSON.exists():
        warn(f"找不到 {DATA_JSON}，跳过实测帧缓存")
        return 0
    try:
        planets = json.loads(DATA_JSON.read_text(encoding="utf-8")).get("planets") or []
    except (OSError, ValueError) as e:
        warn(f"data.json 解析失败（{e}），跳过实测帧缓存")
        return 0

    targets = sorted(int(p["index"]) for p in planets
                     if p.get("index") is not None and (p.get("players") or 0) >= MIN_PLAYERS)
    if not targets:
        warn(f"本次没有 ≥{MIN_PLAYERS} 人的星球，保留上一份缓存")
        return 0

    # ---- 探针：末帧没变就什么都不做（帧是 15 分钟粒度，本脚本 5 分钟被调一次）----
    probe_idx = targets[0]
    probe_path = OUT / f"planet_{probe_idx}.json"
    try:
        probe_raw = fetch(f"{CDN}/planets/{probe_idx}/recent.json")
    except (urllib.error.URLError, OSError) as e:
        warn(f"探针取不到 CDN 最新帧（{e}），保留上一份缓存")
        return 0

    new_stamp = last_stamp(probe_raw)
    old_stamp = last_stamp(read_bytes(probe_path))
    try:
        old_planets = json.loads((OUT / "index.json").read_text(encoding="utf-8")).get("planets") or []
        same_set = sorted(old_planets) == targets
    except (OSError, ValueError):
        same_set = False
    if new_stamp and new_stamp == old_stamp and same_set:
        log(f"无新帧（末帧仍是 {new_stamp}），跳过")
        return 0

    log(f"检测到新帧 {old_stamp or '（本地还没有缓存）'} → {new_stamp or '?'}，开始刷新")

    # ---- 1) 两份全量（区域 / MO）----
    ok = fail = 0
    for url, name in ((f"{CDN}/planetRegions/recent.json", "planet_regions.json"),
                      (f"{CDN}/assignments/2days.json", "assignments.json")):
        try:
            changed = save(OUT / name, fetch(url))
            log(f"{'已更新' if changed else '无变化'} {name}")
            ok += 1
        except (urllib.error.URLError, OSError) as e:
            warn(f"失败 {name} —— {e}")
            fail += 1
    if ok == 0:
        warn("区域与 MO 两份全量都拉不到，本次不写 index.json")
        return 0

    # ---- 2) 逐星球（只拉有人在线的；探针那颗直接复用）----
    p_ok = p_fail = 0
    for idx in targets:
        try:
            raw = probe_raw if idx == probe_idx else fetch(f"{CDN}/planets/{idx}/recent.json")
            if save(OUT / f"planet_{idx}.json", raw):
                p_ok += 1
        except (urllib.error.URLError, OSError):
            p_fail += 1
    log(f"逐星球：目标 {len(targets)} 颗，内容有更新 {p_ok}，失败 {p_fail}")
    if p_fail > max(3, len(targets) // 3):
        warn(f"逐星球失败 {p_fail}/{len(targets)}，本次缓存可能不完整")

    # ---- 3) 清掉不再需要的星球文件，再写清单（rate-source.js 读它决定窗口）----
    # ⚠ 只清「planet_<数字>.json」——update-hd2.ps1 里踩过这个坑：写成 planet_*.json
    #   会把 planet_regions.json（区域帧，不属于"某某星球"）一起删掉，城市速率整块失效。
    keep = {f"planet_{i}.json" for i in targets}
    for old in OUT.glob("planet_*.json"):
        if PLANET_FILE_RE.fullmatch(old.name) and old.name not in keep:
            old.unlink()
            log(f"删除 {old.name}")

    for name in ("planet_regions.json", "assignments.json"):
        if not (OUT / name).exists():
            warn(f"{name} 不在缓存里（区域 / MO 的实测会缺一块）")

    index = {
        "generatedAt": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "source": "cdn.helldiverscompanion.com/live",
        "windowHours": WINDOW_HOURS,
        "minPlayers": MIN_PLAYERS,
        "planets": targets,
    }
    save(OUT / "index.json", (json.dumps(index, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    log(f"已写 index.json（{len(targets)} 颗星球带历史）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
