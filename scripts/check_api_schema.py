# -*- coding: utf-8 -*-
"""API 信息源 schema 变更侦测（只读 + 自动更新基线）

监控官方 API 与社区聚合接口的**结构**（字段名 + 类型），不关心数值。
每天 CI 跑一次，与仓库内的基线比对；有差异 → 输出 markdown 报告 + 更新基线。

用法：
  python scripts/check_api_schema.py                    # 比对并打印报告
  python scripts/check_api_schema.py --report r.md      # 报告另存 markdown
  python scripts/check_api_schema.py --init             # 首次生成基线（覆盖）
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.request

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_FILE = os.path.join(BASE_DIR, "data", "api_schema_baseline.json")

WAR_ID = 801
OFFICIAL = "https://api.live.prod.thehelldiversgame.com"
COMPANION = "https://helldiverscompanion.com/api/hell-divers-2-api/get-api-data-live"
CDN = "https://cdn.helldiverscompanion.com/live"

HEADERS_OFFICIAL = {
    "User-Agent": "HD2-DataSync/1.0 (schema-watch)",
    "Accept": "application/json",
    "X-Super-Client": "HD2-DataSync",
    "X-Super-Contact": "https://jerry114514.github.io/",
    "Accept-Language": "en-US",
}
HEADERS_GENERIC = {"User-Agent": "HD2-DataSync/1.0 (schema-watch)", "Accept": "application/json"}

# 监控的信息源（站点实际消费的端点）
SOURCES = [
    ("official_status", f"{OFFICIAL}/api/WarSeason/{WAR_ID}/Status", HEADERS_OFFICIAL),
    ("official_warinfo", f"{OFFICIAL}/api/WarSeason/{WAR_ID}/WarInfo", HEADERS_OFFICIAL),
    ("official_assignment", f"{OFFICIAL}/api/v2/Assignment/War/{WAR_ID}", HEADERS_OFFICIAL),
    ("official_newsfeed", f"{OFFICIAL}/api/NewsFeed/{WAR_ID}?fromTimestamp=0&maxEntries=5", HEADERS_OFFICIAL),
    ("official_warid", f"{OFFICIAL}/api/WarSeason/current/WarID", HEADERS_OFFICIAL),
    ("companion_live", COMPANION, HEADERS_GENERIC),
    ("cdn_assignments", f"{CDN}/assignments/recent.json", HEADERS_GENERIC),
    ("cdn_extended", f"{CDN}/extendedApiInformation/2days.json", HEADERS_GENERIC),
]


def fetch_json(url, headers, timeout=45):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def type_name(v):
    if v is None: return "null"
    if isinstance(v, bool): return "bool"
    if isinstance(v, int): return "int"
    if isinstance(v, float): return "float"
    if isinstance(v, str): return "str"
    if isinstance(v, list): return "list"
    if isinstance(v, dict): return "dict"
    return type(v).__name__


def extract_schema(obj, path="", max_depth=8):
    """递归提取 JSON 结构 → {路径: 类型} 映射（数组取首元素）"""
    out = {}
    if max_depth <= 0:
        return out
    if isinstance(obj, dict):
        for k, v in obj.items():
            p = f"{path}.{k}" if path else k
            out[p] = type_name(v)
            if isinstance(v, dict):
                out.update(extract_schema(v, p, max_depth - 1))
            elif isinstance(v, list) and v:
                # 数组：记录元素结构（取首元素代表）
                ep = f"{p}[]"
                out[ep] = type_name(v[0])
                if isinstance(v[0], (dict, list)):
                    out.update(extract_schema(v[0], ep, max_depth - 1))
    elif isinstance(obj, list) and obj:
        ep = f"{path}[]" if path else "[]"
        out[ep] = type_name(obj[0])
        if isinstance(obj[0], (dict, list)):
            out.update(extract_schema(obj[0], ep, max_depth - 1))
    return out


def diff_schema(old, new):
    """→ (added, removed, type_changed) 各为 [(path, detail)]"""
    added = [(k, new[k]) for k in sorted(new) if k not in old]
    removed = [(k, old[k]) for k in sorted(old) if k not in new]
    changed = [(k, f"{old[k]} → {new[k]}") for k in sorted(new)
               if k in old and old[k] != new[k] and not _float_int(old[k], new[k])]
    return added, removed, changed


def _float_int(a, b):
    """float ↔ int 在 JSON 里等价（Python json 区分但 JSON 规范不区分）"""
    return {a, b} <= {"float", "int"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", default="", help="报告另存 markdown")
    parser.add_argument("--init", action="store_true", help="首次生成基线（覆盖）")
    args = parser.parse_args()

    if args.init:
        baseline = {}
    elif os.path.exists(BASELINE_FILE):
        baseline = json.load(io.open(BASELINE_FILE, encoding="utf-8"))
    else:
        print("[schema-watch] 基线不存在，首次生成")
        baseline = {}

    report_lines = []
    has_changes = False
    new_baseline = {}
    errors = []

    for name, url, headers in SOURCES:
        try:
            data = fetch_json(url, headers)
        except Exception as e:
            errors.append(f"{name}: {type(e).__name__}: {e}")
            # 保留旧基线（拿不到不代表结构变了）
            if name in baseline:
                new_baseline[name] = baseline[name]
            continue

        schema = extract_schema(data)
        new_baseline[name] = {"_meta": {
            "url": url,
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "field_count": len(schema),
        }, "fields": schema}

        if name in baseline and not args.init:
            old_fields = baseline[name].get("fields") or {}
            added, removed, changed = diff_schema(old_fields, schema)
            if added or removed or changed:
                has_changes = True
                report_lines.append(f"\n## {name}\n")
                report_lines.append(f"URL: `{url}`\n")
                if added:
                    report_lines.append(f"### ✅ 新增字段（{len(added)}）\n")
                    for p, t in added[:30]:
                        report_lines.append(f"- `{p}` : `{t}`")
                    if len(added) > 30:
                        report_lines.append(f"- …另有 {len(added) - 30} 个")
                if removed:
                    report_lines.append(f"\n### ⚠️ 移除字段（{len(removed)}）\n")
                    for p, t in removed[:20]:
                        report_lines.append(f"- `{p}` : 原为 `{t}`")
                    if len(removed) > 20:
                        report_lines.append(f"- …另有 {len(removed) - 20} 个")
                if changed:
                    report_lines.append(f"\n### 🔄 类型变更（{len(changed)}）\n")
                    for p, t in changed[:20]:
                        report_lines.append(f"- `{p}` : `{t}`")
        elif args.init or name not in baseline:
            if not args.init:
                report_lines.append(f"\n## {name}（首次收录）\n{len(schema)} 个字段")

    if errors:
        report_lines.append("\n## ⚠️ 部分来源不可达\n")
        for e in errors:
            report_lines.append(f"- {e}")

    # 写入新基线
    os.makedirs(os.path.dirname(BASELINE_FILE), exist_ok=True)
    tmp = BASELINE_FILE + ".tmp"
    with io.open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(new_baseline, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, BASELINE_FILE)

    if args.report:
        with io.open(args.report, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(report_lines))

    if has_changes:
        print("[schema-watch] !! 检测到结构变更")
        print("\n".join(report_lines))
        sys.exit(2)   # 非零退出让 CI 知道有变更
    else:
        summary = ", ".join(f"{k}:{v['_meta']['field_count']}" for k, v in new_baseline.items())
        print(f"[schema-watch] 无变更（{summary}）")
        if errors:
            print(f"[schema-watch] {len(errors)} 个来源不可达（保留旧基线）")
        sys.exit(0)


if __name__ == "__main__":
    main()
