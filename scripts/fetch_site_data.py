# -*- coding: utf-8 -*-
"""网站数据抓取脚本 v2（GitHub Actions 定时运行）

数据源三级回退（与 HD2-Bot 插件逻辑一致）：
  1. 官方 API（api.live.prod.thehelldiversgame.com，X-Super-Client 头）
  2. 社区 companion（helldiverscompanion.com live 聚合）
  3. helldivers2.dev（浏览器可直连）

统一输出为网站兼容格式（owner=字符串阵营名、sector=字符串名、
published=ISO 时间、planet 含 name/currentOwner/maxHealth 等）：
  { "fetchedAt", "source", "war", "planets", "campaigns", "assignments", "dispatches" }
"""
import json
import os
import sys
import time
import urllib.request
import urllib.error

if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

OFFICIAL_API = "https://api.live.prod.thehelldiversgame.com"
COMPANION_LIVE = "https://helldiverscompanion.com/api/hell-divers-2-api/get-api-data-live"
HD2DEV = "https://api.helldivers2.dev/api/v1"
WAR_ID = 801

HEADERS_OFFICIAL = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AstrBot-HD2-Plugin/1.0",
    "Accept": "application/json",
    "X-Super-Client": "374200774",
    "X-Super-Contact": "374200774@qq.com",
    "Accept-Language": "en-US",
}
HEADERS_HD2DEV = {
    "User-Agent": "Mozilla/5.0 AstrBot-HD2-Plugin/1.0",
    "Accept": "application/json",
    "X-Super-Client": "hd2-site",
    "X-Super-Contact": "https://github.com/Jerry114514",
}

# 数字 owner -> 阵营名（官方/companion 通用）
OWNER_MAP = {0: "Humans", 1: "Humans", 2: "Terminids", 3: "Automaton", 4: "Illuminate"}
# 官方 sector 数字 -> 名称（fallback，实际用 hd2dev 覆盖）
SECTOR_ID = {
    0: "Sol", 1: "Barnard", 2: "Tau Ceti", 3: "Pictor", 4: "Titania", 5: "Canopus",
    6: "Kessel", 7: "Yezub", 8: "Angels Venture", 9: "Crux", 10: "Ursa Major",
    11: "Kronos", 12: "Draco", 13: "Rictus", 14: "Aurora", 15: "Jin Xi",
    16: "Fenrir", 17: "Meridian", 18: "Valdis", 19: "Farsight", 20: "Gacrux",
}


def fetch_json(url, headers=None, timeout=20):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def try_fetch(label, fn):
    try:
        data = fn()
        print(f"  [OK] {label}")
        return data
    except Exception as e:
        print(f"  [FAIL] {label}: {type(e).__name__}: {e}")
        return None


def norm_owner(v):
    """owner: 数字/字符串 -> 阵营字符串"""
    if isinstance(v, int):
        return OWNER_MAP.get(v, "Unknown")
    if isinstance(v, str):
        if v.isdigit():
            return OWNER_MAP.get(int(v), "Unknown")
        return v
    return "Unknown"


def norm_time(v):
    """published: epoch 秒/毫秒 或 ISO -> ISO 字符串"""
    if isinstance(v, (int, float)):
        try:
            n = int(v)
            # 毫秒（13 位）或秒（10 位）
            if n > 10_000_000_000:
                n = n // 1000
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(n))
        except Exception:
            return ""
    return v or ""


# ---------------- 官方源 ----------------
def fetch_official():
    st = fetch_json(f"{OFFICIAL_API}/api/WarSeason/{WAR_ID}/Status", HEADERS_OFFICIAL, 20)
    wi = fetch_json(f"{OFFICIAL_API}/api/WarSeason/{WAR_ID}/WarInfo", HEADERS_OFFICIAL, 20)
    ass = fetch_json(f"{OFFICIAL_API}/api/v2/Assignment/War/{WAR_ID}", HEADERS_OFFICIAL, 20)
    stats = fetch_json(f"{OFFICIAL_API}/api/Stats/War/{WAR_ID}/Summary", HEADERS_OFFICIAL, 20)
    news = fetch_json(f"{OFFICIAL_API}/api/NewsFeed/{WAR_ID}?maxEntries=30", HEADERS_OFFICIAL, 20)

    info_by_idx = {p.get("index"): p for p in (wi.get("planetInfos") or [])}
    ps_by_idx = {p.get("index"): p for p in (st.get("planetStatus") or [])}

    planets = []
    for idx in sorted(set(info_by_idx) | set(ps_by_idx)):
        info = info_by_idx.get(idx, {})
        ps = ps_by_idx.get(idx, {})
        planets.append({
            "index": idx,
            "name": info.get("name") or f"PLANET_{idx}",
            "sector": info.get("sector") if isinstance(info.get("sector"), str) else SECTOR_ID.get(info.get("sector"), ""),
            "currentOwner": norm_owner(ps.get("owner")),
            "health": ps.get("health", 0),
            "maxHealth": ps.get("maxHealth", 0),
            "players": ps.get("players", 0),
            "attacking": bool(ps.get("attacking")),
        })

    campaigns = []
    for c in (st.get("campaigns") or []):
        pi = c.get("planetIndex")
        info = info_by_idx.get(pi, {})
        ps = ps_by_idx.get(pi, {})
        campaigns.append({
            "id": c.get("id"),
            "faction": norm_owner(c.get("faction") if c.get("faction") else ps.get("owner")),
            "type": c.get("type", 0),
            "count": c.get("campaignId"),
            "planet": {
                "index": pi,
                "name": info.get("name") or f"PLANET_{pi}",
                "sector": info.get("sector") if isinstance(info.get("sector"), str) else SECTOR_ID.get(info.get("sector"), ""),
                "currentOwner": norm_owner(ps.get("owner")),
            },
        })
    for ev in (st.get("planetEvents") or []):
        pi = ev.get("planetIndex")
        info = info_by_idx.get(pi, {})
        campaigns.append({
            "id": ev.get("eventId"),
            "faction": norm_owner(ev.get("faction")),
            "type": "defense",
            "count": 0,
            "planet": {
                "index": pi,
                "name": info.get("name") or f"PLANET_{pi}",
                "sector": info.get("sector") if isinstance(info.get("sector"), str) else SECTOR_ID.get(info.get("sector"), ""),
                "currentOwner": norm_owner((ps_by_idx.get(pi) or {}).get("owner")),
            },
        })

    assignment = None
    if ass:
        a0 = ass[0] if isinstance(ass, list) else ass
        setting = a0.get("setting") or {}
        assignment = {
            "id": a0.get("id32") or a0.get("id"),
            "briefing": setting.get("overrideBrief") or a0.get("briefing") or "",
            "title": setting.get("overrideTitle") or "MAJOR ORDER",
            "tasks": setting.get("tasks") or a0.get("tasks") or [],
            "progress": a0.get("progress") or [],
            "expiration": norm_time(a0.get("expiration")),
        }

    war = {}
    if stats:
        war["statistics"] = {"playerCount": (stats.get("statistics") or {}).get("playerCount", 0),
                             "missionsWon": 0, "missionsLost": 0}
        war["started"] = stats.get("started")
        war["ended"] = stats.get("ended")

    dispatches = [{"id": n.get("id"), "published": norm_time(n.get("published")),
                   "type": n.get("type"), "message": n.get("message")} for n in (news or [])]

    return {"war": war, "planets": planets, "campaigns": campaigns,
            "assignments": assignment, "dispatches": dispatches}


# ---------------- companion 源 ----------------
def fetch_companion():
    obj = fetch_json(COMPANION_LIVE, HEADERS_HD2DEV, 25)
    ws = obj.get("warStatus") or {}
    ps_list = ws.get("planetStatus") or []

    planets = []
    for ps in ps_list:
        planets.append({
            "index": ps.get("index"),
            "name": f"PLANET_{ps.get('index')}",
            "sector": "",
            "currentOwner": norm_owner(ps.get("owner")),
            "health": ps.get("health", 0),
            "maxHealth": ps.get("maxHealth", 0),
            "players": ps.get("players", 0),
            "attacking": bool(ps.get("attacking")),
        })

    campaigns = []
    for c in (ws.get("campaigns") or []):
        pi = c.get("planetIndex")
        ps = next((p for p in ps_list if p.get("index") == pi), {})
        campaigns.append({
            "id": c.get("id"),
            "faction": norm_owner(c.get("race") or ps.get("owner")),
            "type": c.get("type", 0),
            "count": c.get("count"),
            "planet": {"index": pi, "name": f"PLANET_{pi}", "sector": "",
                       "currentOwner": norm_owner(ps.get("owner"))},
        })
    for ev in (ws.get("planetEvents") or []):
        pi = ev.get("planetIndex")
        campaigns.append({
            "id": ev.get("eventId"),
            "faction": norm_owner(ev.get("race")),
            "type": "defense",
            "count": 0,
            "planet": {"index": pi, "name": f"PLANET_{pi}", "sector": "", "currentOwner": "Humans"},
        })

    mos = obj.get("majorOrders") or []
    assignment = None
    if mos:
        m0 = mos[0]
        setting = m0.get("setting") or {}
        assignment = {
            "id": m0.get("id32"),
            "briefing": setting.get("overrideBrief") or "",
            "title": setting.get("overrideTitle") or "MAJOR ORDER",
            "tasks": setting.get("tasks") or [],
            "progress": m0.get("progress") or [],
            "expiration": "",
        }

    war = {"statistics": {"playerCount": (ws.get("statistics") or {}).get("playerCount", 0),
                          "missionsWon": 0, "missionsLost": 0}}

    dispatches = []
    for n in sorted((obj.get("news") or []), key=lambda x: x.get("id", 0), reverse=True)[:30]:
        dispatches.append({"id": n.get("id"), "published": norm_time(n.get("published")),
                           "type": n.get("type"), "message": n.get("message")})

    return {"war": war, "planets": planets, "campaigns": campaigns,
            "assignments": assignment, "dispatches": dispatches}


# ---------------- helldivers2.dev 源 ----------------
def fetch_hd2dev():
    war = fetch_json(f"{HD2DEV}/war", HEADERS_HD2DEV, 25)
    planets = fetch_json(f"{HD2DEV}/planets", HEADERS_HD2DEV, 25)
    campaigns = fetch_json(f"{HD2DEV}/campaigns", HEADERS_HD2DEV, 25)
    assignments = fetch_json(f"{HD2DEV}/assignments", HEADERS_HD2DEV, 25)
    dispatches = fetch_json(f"{HD2DEV}/dispatches", HEADERS_HD2DEV, 25)
    # 只保留最新 30 条（网站展示 20）
    dispatches = sorted(dispatches, key=lambda x: x.get("id", 0), reverse=True)[:30]

    assignment = None
    if assignments:
        a0 = assignments[0]
        assignment = {"id": a0.get("id"), "briefing": a0.get("briefing") or "",
                      "title": a0.get("title") or "MAJOR ORDER",
                      "tasks": a0.get("tasks") or [], "progress": a0.get("progress") or [],
                      "expiration": norm_time(a0.get("expiration"))}

    return {"war": war, "planets": planets, "campaigns": campaigns,
            "assignments": assignment, "dispatches": dispatches}


# ---------------- 合并 ----------------
def main():
    out_path = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "HD2-Galatic_war-Map", "data.json"))

    print("=== 抓取官方源 ===")
    official = try_fetch("官方 API", fetch_official)
    print("=== 抓取 companion ===")
    companion = try_fetch("companion", fetch_companion)
    print("=== 抓取 helldivers2.dev ===")
    hd2dev = try_fetch("helldivers2.dev", fetch_hd2dev)

    base = official or companion or hd2dev
    if base is None:
        print("[FATAL] 所有数据源失败")
        sys.exit(1)

    # 用 hd2dev 的星球名/sector/maxHealth 统一覆盖（hd2dev sector 为社区维护、与对照表一致）
    if hd2dev and hd2dev.get("planets"):
        hd2dev_map = {p.get("index"): p for p in hd2dev["planets"]}
        for p in base.get("planets") or []:
            h = hd2dev_map.get(p.get("index"))
            if h:
                if not p.get("name") or p["name"].startswith("PLANET_"):
                    p["name"] = h.get("name", p["name"])
                # sector 始终用 hd2dev（官方 sector 数字 id 不可靠）
                p["sector"] = h.get("sector", p.get("sector", ""))
                if not p.get("maxHealth"):
                    p["maxHealth"] = h.get("maxHealth", 0)
        for c in base.get("campaigns") or []:
            h = hd2dev_map.get(c.get("planet", {}).get("index"))
            if h:
                cp = c["planet"]
                if not cp.get("name") or cp["name"].startswith("PLANET_"):
                    cp["name"] = h.get("name", cp["name"])
                cp["sector"] = h.get("sector", cp.get("sector", ""))

    # 玩家数：companion 各星球求和（官方 Stats 无 playerCount）
    total_players = 0
    if companion:
        total_players = sum((p.get("players") or 0) for p in (companion.get("planets") or []))
    elif hd2dev:
        total_players = (hd2dev.get("war") or {}).get("statistics", {}).get("playerCount", 0) or 0
    if base.get("war"):
        base["war"].setdefault("statistics", {})
        base["war"]["statistics"]["playerCount"] = total_players

    # 重要指令：官方优先 -> companion -> hd2dev（字段级覆盖）
    if official and official.get("assignments"):
        base["assignments"] = official["assignments"]
    elif companion and companion.get("assignments"):
        base["assignments"] = companion["assignments"]

    # 资讯：hd2dev 优先（真实 ISO 时间）；companion 的 published 是游戏内时间戳不可用，仅兜底
    if hd2dev and hd2dev.get("dispatches"):
        base["dispatches"] = hd2dev["dispatches"]
    elif companion and companion.get("dispatches"):
        # companion 时间不可用，清空 published
        for dp in companion["dispatches"]:
            dp["published"] = ""
        base["dispatches"] = companion["dispatches"]

    result = {"fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S+08:00"),
              "source": "official" if official else ("companion" if companion else "helldivers2.dev"),
              **base}

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print(f"\n已写出: {out_path}")
    print(f"planets={len(result.get('planets') or [])} campaigns={len(result.get('campaigns') or [])} dispatches={len(result.get('dispatches') or [])}")


if __name__ == "__main__":
    main()
