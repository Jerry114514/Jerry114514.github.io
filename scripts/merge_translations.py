# -*- coding: utf-8 -*-
"""合并翻译数据到 data.json（HD2-Galatic_war-Map Page 仓库）

读取：
- HD2-Galatic_war-Map/data.json（现有战况数据）
- HD2-Galatic_war-Map/data/translated/TransNews.json（HD2Web-Trans 推送的翻译，不存在则跳过）

写入：
- data.major_order = { title, brief, translated_brief, translated_at, id32, text_source, tasks }
  （translated_brief 来自 TransNews.json.mo_brief.translated；brief 原文；无则空。
    tasks 为 2026-10-24 新增的结构化 MO 任务：阵营/数量/限定装备官中名，
    来自 TransNews.json.tasks；旧 TransNews 没有该键时原样不带，前端自动降级）
- data.news = TransNews.json.items（翻译新闻列表，最新5条由前端控制；无则 []）

降级：TransNews.json 不存在/格式错误时，data.major_order 与 data.news 保持空，不破坏现有数据
"""
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(BASE_DIR, "HD2-Galatic_war-Map", "data.json")
TRANS_FILE = os.path.join(BASE_DIR, "HD2-Galatic_war-Map", "data", "translated", "TransNews.json")


def load_json(path):
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[merge] 读取失败 {path}: {e}")
        return None


def merge_mo(trans, prev_mo=None):
    """MO 翻译层 + 结构化任务。跨指令保护：tasks.id32 与 mo.id32 不一致时沿用 prev 的 tasks。"""
    mb = trans.get("mo_brief") or {}
    mo = {
        "title": mb.get("title", ""),
        "brief": mb.get("original", ""),
        "translated_brief": mb.get("translated", ""),
        "translated_at": mb.get("translated_at", ""),
    }
    if mb.get("id32") is not None:
        mo["id32"] = mb.get("id32")
    if mb.get("text_source"):
        mo["text_source"] = mb.get("text_source")
    tasks = trans.get("tasks")
    if isinstance(tasks, dict) and isinstance(tasks.get("items"), list):
        if not tasks.get("id32") or not mo.get("id32") or \
                str(mo.get("id32")) == str(tasks.get("id32")):
            mo["tasks"] = tasks
        else:
            prev_tasks = (prev_mo or {}).get("tasks")
            if prev_tasks is not None:
                mo["tasks"] = prev_tasks
            print(f"[merge] tasks.id32={tasks.get('id32')} 与 mo.id32={mo.get('id32')} 不一致，"
                  f"{'沿用旧 tasks' if prev_tasks is not None else '丢弃不合并'}")
    return mo


def main():
    data = load_json(DATA_FILE)
    if data is None:
        print("[merge] data.json 不存在，跳过")
        return
    if not isinstance(data, dict):
        print("[merge] data.json 格式错误，跳过")
        return

    prev_mo = data.get("major_order") if isinstance(data.get("major_order"), dict) else None
    # 降级默认值
    data["major_order"] = {"title": "", "brief": "", "translated_brief": "", "translated_at": ""}
    data["news"] = []

    trans = load_json(TRANS_FILE)
    if trans is None:
        print("[merge] TransNews.json 不存在，降级为空")
    else:
        try:
            # MO 简报翻译 + 结构化任务
            data["major_order"] = merge_mo(trans, prev_mo)
            # 新闻列表（全部翻译条目；前端自行取最新5条）
            items = trans.get("items") or []
            if isinstance(items, list):
                data["news"] = [it for it in items if isinstance(it, dict)]
            mo = data["major_order"]
            tasks_n = len((mo.get("tasks") or {}).get("items") or [])
            print(f"[merge] 合并完成: mo_brief={'有' if mo['translated_brief'] else '无'}, "
                  f"news={len(data['news'])}, tasks={tasks_n}")
        except Exception as e:
            print(f"[merge] 合并失败（保留降级）: {e}")

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("[merge] data.json 已更新")


if __name__ == "__main__":
    main()
