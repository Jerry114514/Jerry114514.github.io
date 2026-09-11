# -*- coding: utf-8 -*-
"""
fetch_planet_icons.py — 星球图标落库（galaxy-map-v2 用）
============================================================
来源：helldivers.wiki.gg 的 Planet Icon 缩略图（64px，~10.8 KB/张）
URL 规则：https://helldivers.wiki.gg/images/thumb/<File>/64px-<File>
         <File> = "<星球名 空格换下划线>_Planet_Icon.png"

wiki（MediaWiki）文件名首字符大小写不敏感、其余敏感，实际命名是 Title Case
（如 Acamar_IV_Planet_Icon.png、Widow's_Harbor_Planet_Icon.png，罗马数字保持大写）。
data.json 里星球名是全大写，故按多变体回退尝试（Title Case 罗马保留 → 全大写 → 首字母大写）。

输出：
  HD2-Galatic_war-Map/assets/planet-icons/<NAME>.png   （NAME=大写原名，空格换下划线）
  HD2-Galatic_war-Map/assets/planet-icons/index.json   { "ACAMAR IV": "ACAMAR_IV.png", ... }
  未命中名单记入 assets/planet-icons/README.md

注意（已知坑）：
  - 请求头带 User-Agent；不要带 Referer（wiki.gg 校验 Referer，带了 403）
  - 缩略图必须用 64px（原图 1720×1720 单张 3.4MB，全量不可接受）
"""
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import concurrent.futures

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(ROOT, "HD2-Galatic_war-Map", "assets", "planet-icons")
DATA_JSON = os.path.join(ROOT, "HD2-Galatic_war-Map", "data.json")
THUMB_PX = 64
RETRY = 3
WORKERS = 6
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HD2-PlanetIcons/1.0"

_ROMAN = re.compile(r"^[IVXLC]+$")


def _word_cap(w: str) -> str:
    """单词转 Title Case：罗马数字保持全大写；否则首字母大写其余小写。"""
    if _ROMAN.match(w):
        return w
    return w[:1].upper() + w[1:].lower()


def title_variants(name: str):
    """生成候选 wiki 文件名（含扩展名前的主体部分），按命中概率排序。"""
    n = name.strip()
    # 变体 1：词级 Title Case（罗马数字保留，撇号后不大写：Widow's Harbor -> Widow's_Harbor）
    v1 = " ".join(_word_cap(w) for w in n.split(" ")).replace(" ", "_")
    # 变体 2：原始大写
    v2 = n.upper().replace(" ", "_")
    # 变体 3：撇号/连字符后也大写（Angel's -> Angel'S 形态；个别文件可能如此命名）
    v3 = "-".join(
        "'".join(seg[:1].upper() + seg[1:].lower() for seg in w.split("'"))
        for w in n.split("-")
    ).replace(" ", "_")
    seen, out = set(), []
    for v in (v1, v2, v3):
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out


def fetch_one(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})  # 刻意不带 Referer
    last_err = None
    for attempt in range(1, RETRY + 1):
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise FileNotFoundError(url)
            last_err = e
            time.sleep(0.8 * attempt)
        except Exception as e:
            last_err = e
            time.sleep(0.8 * attempt)
    raise last_err


def fetch_wiki_icon_catalog() -> dict:
    """枚举 wiki 全部 *_Planet_Icon.png 文件的规范名。
    MediaWiki 文件名首字符外大小写敏感且无规律（Charbal-VII / Cerberus_IIIc），
    猜大小写不可靠，改用 allimages 按 A-Z 前缀枚举，键=规范名大写。"""
    catalog = {}   # 大写文件名 -> 规范文件名
    letters = [chr(c) for c in range(ord("A"), ord("Z") + 1)] + ["0", "1", "2", "3"]
    for prefix in letters:
        aicontinue = None
        while True:
            params = {"action": "query", "format": "json", "list": "allimages",
                      "aiprefix": prefix, "ailimit": 500}
            if aicontinue:
                params["aicontinue"] = aicontinue
            url = "https://helldivers.wiki.gg/api.php?" + urllib.parse.urlencode(params)
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA})
                d = json.loads(urllib.request.urlopen(req, timeout=25).read())
            except Exception as e:
                print(f"  [WARN] 枚举 {prefix} 失败: {e}")
                break
            for img in (d.get("query") or {}).get("allimages", []):
                nm = img.get("name", "")
                if nm.upper().endswith("_PLANET_ICON.PNG"):
                    catalog[nm.upper()] = nm
            aicontinue = (d.get("continue") or {}).get("aicontinue")
            if not aicontinue:
                break
    return catalog


def download_icon(name: str, catalog: dict):
    """返回 (本地文件名 | None, 状态)。状态: ok/cached/miss/fail"""
    local_name = name.replace(" ", "_")
    local_path = os.path.join(OUT_DIR, local_name + ".png")
    if os.path.exists(local_path) and os.path.getsize(local_path) > 500:
        return local_name + ".png", "cached"

    # 首选：规范目录精确解析（expected 的全部变体都查一遍，容忍连字符/下划线差异）
    bases = [name.replace(" ", "_")] + title_variants(name)
    wiki_file = None
    for b in bases:
        hit = catalog.get((b + "_Planet_Icon.png").upper())
        if hit:
            wiki_file = hit
            break
    if not wiki_file:
        # 目录枚举失败时的兜底：按变体猜测直连
        for b in bases:
            try:
                blob = fetch_one(f"https://helldivers.wiki.gg/images/thumb/{urllib.parse.quote(b + '_Planet_Icon.png')}/{THUMB_PX}px-{urllib.parse.quote(b + '_Planet_Icon.png')}")
                if blob.startswith(b"\x89PNG") and len(blob) > 500:
                    with open(local_path, "wb") as f:
                        f.write(blob)
                    return local_name + ".png", "ok"
            except FileNotFoundError:
                continue
            except Exception:
                return None, "fail"
        return None, "miss"

    enc = urllib.parse.quote(wiki_file)
    try:
        blob = fetch_one(f"https://helldivers.wiki.gg/images/thumb/{enc}/{THUMB_PX}px-{enc}")
    except Exception:
        return None, "fail"
    if blob.startswith(b"\x89PNG") and len(blob) > 500:
        with open(local_path, "wb") as f:
            f.write(blob)
        return local_name + ".png", "ok"
    return None, "miss"


def main() -> None:
    with open(DATA_JSON, encoding="utf-8") as f:
        data = json.load(f)
    planets = [p for p in (data.get("planets") or []) if p.get("name")]
    names = sorted({p["name"].strip().upper() for p in planets if p.get("name", "").strip()})
    print(f"星球总数（去重后）: {len(names)}")

    os.makedirs(OUT_DIR, exist_ok=True)

    print("枚举 wiki Planet_Icon 规范文件名（A-Z 前缀）…")
    catalog = fetch_wiki_icon_catalog()
    print(f"  目录中 Planet_Icon 文件: {len(catalog)} 个")

    mapping, misses, failed = {}, [], []

    def work(name: str):
        try:
            return (name,) + download_icon(name, catalog)
        except Exception:
            return name, None, "fail"

    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(work, n): n for n in names}
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            name, file, status = fut.result()
            done += 1
            if status in ("ok", "cached"):
                mapping[name] = file
            elif status == "miss":
                misses.append(name)
            else:
                failed.append(name)
            if done % 40 == 0 or done == len(names):
                print(f"  进度 {done}/{len(names)}  命中 {len(mapping)}  未收录 {len(misses)}  失败 {len(failed)}")

    index_path = os.path.join(OUT_DIR, "index.json")
    with open(index_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")

    print(f"\n完成：命中 {len(mapping)} / 未收录 {len(misses)} / 网络失败 {len(failed)}")
    if misses:
        print("未收录（wiki 无图标，前端回退纯色圆点）:", "、".join(sorted(misses)))
    if failed:
        print("网络失败（可重跑本脚本补齐）:", "、".join(sorted(failed)))
    total_kb = sum(
        os.path.getsize(os.path.join(OUT_DIR, fn)) for fn in os.listdir(OUT_DIR) if fn.endswith(".png")
    ) // 1024
    print(f"落库体积: {total_kb} KB → {os.path.relpath(OUT_DIR, ROOT)}")


if __name__ == "__main__":
    main()
