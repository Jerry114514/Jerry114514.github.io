#!/usr/bin/env python3
"""从主站同一份 data.json 的 Git 历史提取约 24 小时前的对照快照。"""
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = "HD2-Galatic_war-Map/data.json"
OUT = ROOT / "HD2-Galatic_war-Map/data/history/status_24h.json"


def baseline_payload(current, previous):
    now = datetime.fromisoformat(current["fetchedAt"].replace("Z", "+00:00"))
    then = datetime.fromisoformat(previous["fetchedAt"].replace("Z", "+00:00"))
    hours = (now - then).total_seconds() / 3600
    if not 23 <= hours <= 27 or not isinstance(previous.get("planets"), list):
        raise ValueError("历史快照不在约 24 小时的对照窗口内")
    fields = ("index", "name", "currentOwner", "health", "maxHealth", "players", "disabled")
    return {"fetchedAt": previous["fetchedAt"], "source": "main:data.json Git history",
            "planets": [{key: planet[key] for key in fields if key in planet} for planet in previous["planets"]],
            "player_distribution": previous.get("player_distribution")}


def github_json(url):
    headers = {"User-Agent": "Jerry-HD2-Site-Report/1.0", "Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as response:
        return json.load(response)


def main():
    try:
        current = json.loads((ROOT / SOURCE_PATH).read_text(encoding="utf-8-sig"))
        target = datetime.fromisoformat(current["fetchedAt"].replace("Z", "+00:00")) - timedelta(hours=24)
        revision = subprocess.check_output(["git", "log", "-1", f"--before={target.isoformat()}", "--format=%H", "--", SOURCE_PATH], cwd=ROOT, text=True).strip()
        if revision:
            previous = json.loads(subprocess.check_output(["git", "show", f"{revision}:{SOURCE_PATH}"], cwd=ROOT, text=True, encoding="utf-8"))
        else:
            # Actions 的浅克隆无昨日历史，用同仓库 API 取 1 个提交及其文件。
            repository = os.environ.get("GITHUB_REPOSITORY", "Jerry114514/Jerry114514.github.io")
            query = urllib.parse.urlencode({"sha": "main", "path": SOURCE_PATH, "until": target.isoformat(), "per_page": 1})
            commits = github_json(f"https://api.github.com/repos/{repository}/commits?{query}")
            if not commits:
                raise ValueError("未找到 24 小时前的主站快照")
            revision = commits[0]["sha"]
            import base64
            file = github_json(f"https://api.github.com/repos/{repository}/contents/{SOURCE_PATH}?ref={revision}")
            previous = json.loads(base64.b64decode(file["content"]))
        payload = baseline_payload(current, previous)
        payload["revision"] = revision
        # 同目录临时文件原子替换，浏览器不会读到写了一半的快照。
        from fetch_site_data import write_json_atomic
        write_json_atomic(str(OUT), payload)
        print(f"24 小时对照快照：{payload['fetchedAt']}")
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        print(f"::warning::24 小时对照未更新，保留已有缓存：{error}", file=sys.stderr)


if __name__ == "__main__":
    main()
