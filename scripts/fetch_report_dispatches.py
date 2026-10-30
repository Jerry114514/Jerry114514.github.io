#!/usr/bin/env python3
"""仅在站点缺简中公告时补取 HD2 API 简中，供静态战报同源读取。"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "HD2-Galatic_war-Map"
OUT = SITE / "data/translated/report_dispatches_zh.json"
URL = "https://api.helldivers2.dev/api/v2/dispatches"


def chinese(value):
    return bool(re.search(r"[\u3400-\u9fff]", re.sub(r"<[^>]*>", "", str(value or ""))))


def read(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def missing_ids(data, translated, official):
    covered = {str(row.get("id")) for row in (data.get("news") or []) + (translated.get("items") or [])
               if chinese(row.get("translated"))}
    covered |= {str(row.get("id")) for row in official.get("dispatches", [])
                if row.get("official_zh") is True and chinese(row.get("translated"))}
    return {str(row["id"]) for row in data.get("dispatches", []) if "id" in row} - covered


def extract(rows):
    if not isinstance(rows, list):
        raise ValueError("dispatches 响应必须为列表")
    return [{"id": row["id"], "published": row.get("published"), "message": row["message"]}
            for row in rows if isinstance(row, dict) and isinstance(row.get("id"), int)
            and isinstance(row.get("message"), str) and chinese(row["message"])]


def main():
    try:
        missing = missing_ids(read(SITE / "data.json"), read(SITE / "data/translated/TransNews.json"),
                              read(SITE / "data/translated/official_texts.json"))
        if not missing:
            print("站点已有全部公告的简中文本，无需补取。")
            return
        request = urllib.request.Request(URL, headers={"Accept-Language": "zh-CN",
            "User-Agent": "Mozilla/5.0", "Accept": "application/json", "X-Super-Client": "Jerry-site-report",
            "X-Super-Contact": "https://github.com/Jerry114514/Jerry114514.github.io"})
        with urllib.request.urlopen(request, timeout=20) as response:
            language = response.headers.get("Content-Language", "").lower()
            if language not in ("zh-hans", "zh-cn"):
                raise ValueError(f"接口未确认简中响应：{language or '无语言标记'}")
            rows = [row for row in extract(json.load(response)) if str(row["id"]) in missing]
        previous = read(OUT)
        merged = {str(row["id"]): row for row in previous.get("dispatches", []) if str(row.get("id")) in missing}
        merged.update({str(row["id"]): row for row in rows})
        rows = sorted(merged.values(), key=lambda row: row["id"], reverse=True)
        if rows == previous.get("dispatches", []):
            print(f"简中补充缓存无变化；仍缺 {len(missing - set(merged))} 条。")
            return
        payload = {"language": "zh-Hans", "source": URL,
                   "fetchedAt": datetime.now(timezone.utc).isoformat(), "dispatches": rows}
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"已补充 {len(rows)} 条简中公告；仍缺 {len(missing - set(merged))} 条，等待站点汉化。")
    except (OSError, ValueError, TypeError) as error:
        # 补充来源失败不能阻断主站战况更新，也不能覆盖已有成果。
        print(f"::warning::简中公告补取失败，保留现有缓存：{error}", file=sys.stderr)


if __name__ == "__main__":
    main()
