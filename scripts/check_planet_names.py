#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""星球译名校验 / 内置译名表生成（2026-10-03）。

为什么需要它
--------------------------------------------------------------------------
同一个星球名在站内有三个落点，任意两个不同步，用户看到的就是「同一颗星球两个名字」：

1. ``HD2-Galatic_war-Map/tables/starmap.json`` —— **权威源**。它自己还带两份镜像：
   ``planets{英文名: {cn, system, ID, position, sector_en}}``
   与 ``systems[].planets[].{en, cn}``。
2. ``HD2-Galatic_war-Map/index.html`` 的 ``BUILTIN_PLANET_CN`` —— 离线兜底表
   （starmap 加载失败时也能显示中文）。**坑在这**：``planetName()`` 里它**优先于**
   starmap（`index.html` 里 ① BUILTIN → ② ``sm.planets[name].cn`` → ③ 按 ID 兜底），
   所以只改 starmap 改不动页面，两处必须同改。
3. ``HD2_Wiki/planets.html`` 只认 ``systems[].planets[].cn``（星图认 ``planets{}.cn``）。

历史上就撞过两次：issue #25 的投稿人照 issue 模板去改 ``terms.json``，而星球页根本不读
``terms.json``（改了等于没改）；同时 ``HEZE BAY`` / ``SENGE 23`` 早已在 starmap 里有中文，
却一直漏在 ``BUILTIN_PLANET_CN`` 外面（少了离线兜底，且没人发现）。这个脚本就是把
「改了 starmap 忘了同步」变成 CI 能真的变红的一件事。

校验项
--------------------------------------------------------------------------
* ``PLANET.BUILTIN_SYNC``（**红**）``BUILTIN_PLANET_CN`` 必须**恰好等于** starmap 里
  ``cn`` 非空且 ``cn != 英文名`` 的集合（键集合与译名双向一致），并且**与 ``--write``
  的产物逐字节相同** —— 即 ``json.dumps(ordered, ensure_ascii=False)``：键升序、
  条目间 ``, ``、键值间 ``: ``。只比语义不比字节的话，换一种分隔符重排整张表
  也能过，下次 ``--write`` 就会吐出一个几百行的假 diff。
* ``PLANET.SYS_AGREE``（**红**）``systems[].planets[].cn`` 与 ``planets{}.cn`` 必须一致。
* ``PLANET.COVERAGE``（**黄／不阻塞**）``cn`` 为空串、或 ``cn == 英文名``（= 已收录未翻译）的清单。

用法
--------------------------------------------------------------------------
  python scripts/check_planet_names.py --check      # 校验（exit 1 = 有硬问题）。CI 用，也是默认动作。
  python scripts/check_planet_names.py --coverage   # 只打印未翻译清单（始终 exit 0）。
  python scripts/check_planet_names.py --write      # 按 starmap.json 重新生成 index.html 的 BUILTIN_PLANET_CN。

改了 ``tables/starmap.json`` 就顺手跑一次 ``--write``，再 ``--check`` 确认全绿。
"""
import argparse
import io
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STARMAP = os.path.join(BASE, "HD2-Galatic_war-Map", "tables", "starmap.json")
INDEX_HTML = os.path.join(BASE, "HD2-Galatic_war-Map", "index.html")

# index.html 里那张内置表的声明前缀（后面紧跟一个扁平的 JSON 对象）
MARK = "const BUILTIN_PLANET_CN = "


# ---------------------------------------------------------------------------
# 读写（一律 utf-8 + newline=''，绝不做换行符转换：本仓 starmap/terms 是 LF、
#       index.html 是 CRLF，混着来）
# ---------------------------------------------------------------------------
def read_text(path):
    with io.open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def write_text(path, text):
    with io.open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def load_json(path):
    return json.loads(read_text(path))


def find_object(text, anchor):
    """anchor 之后第一个 ``{`` 到与它配对的 ``}`` 的下标（含两端）。

    自己扫而不正则，是因为 ``{.*?}`` 一旦值里出现 ``}`` 就会静默截断 —— 校验脚本可以
    报错退出，但 ``--write`` 截断了就会把页面写坏。
    """
    at = text.find(anchor)
    if at < 0:
        raise ValueError("找不到 %r" % anchor)
    start = text.find("{", at)
    if start < 0:
        raise ValueError("%r 之后没有 '{'" % anchor)
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return start, i
    raise ValueError("%r 的花括号没有配对" % anchor)


def builtin_span(text):
    start, end = find_object(text, MARK)
    return start, end, json.loads(text[start:end + 1])


# ---------------------------------------------------------------------------
# 数据整形
# ---------------------------------------------------------------------------
def translated(planets):
    """starmap.planets → {英文名: 中文名}，只留「真的有中文」的（cn 非空且 != 英文名）。"""
    out = {}
    for en, v in (planets or {}).items():
        cn = v.get("cn") if isinstance(v, dict) else None
        if not isinstance(cn, str):
            continue
        cn = cn.strip()
        if cn and cn != en:
            out[en] = cn
    return out


def untranslated(planets):
    """返回 (cn 为空的, cn 与英文名相同的)，各自保持英文名升序。"""
    blank, same = [], []
    for en in sorted((planets or {}).keys()):
        v = planets[en]
        cn = v.get("cn") if isinstance(v, dict) else None
        if not isinstance(cn, str) or not cn.strip():
            blank.append(en)
        elif cn.strip() == en:
            same.append(en)
    return blank, same


def builtin_payload(want):
    """BUILTIN_PLANET_CN 该有的字节形态：键升序 + ``json.dumps(..., ensure_ascii=False)``。

    ``--check`` 拿它当期望值、``--write`` 拿它当产物 —— 两边同一份逻辑，才不会出现
    「校验说通过、write 又改了东西」。
    """
    ordered = {}
    for en in sorted(want):
        ordered[en] = want[en]
    return ordered, json.dumps(ordered, ensure_ascii=False)


def systems_names(sm):
    """systems[].planets[] → ({英文名: cn}, 重复键清单)。"""
    out, dup = {}, []
    for s in (sm.get("systems") or []):
        for p in (s.get("planets") or []):
            en = p.get("en") if isinstance(p, dict) else None
            if not isinstance(en, str):
                continue
            if en in out:
                dup.append(en)
            out[en] = p.get("cn")
    return out, dup


def fmt_planet(sm, en):
    """把一颗星球渲染成一行可读信息，用于报错/报告。"""
    v = (sm.get("planets") or {}).get(en) or {}
    bits = [en]
    if v.get("ID") is not None:
        bits.append("ID=%s" % v["ID"])
    sysname = v.get("system")
    if sysname:
        bits.append("星区=%s" % sysname)
    return "  · " + "  ".join(str(b) for b in bits)


# ---------------------------------------------------------------------------
# 三个动作
# ---------------------------------------------------------------------------
def cmd_check(args):
    sm = load_json(STARMAP)
    html = read_text(INDEX_HTML)
    planets = sm.get("planets") or {}
    want = translated(planets)
    sname, dup = systems_names(sm)
    start, end, builtin = builtin_span(html)
    raw = html[start:end + 1]
    blank, same = untranslated(planets)

    errors = []

    # BUILTIN 该长什么样：与 --write 的产物一字不差
    ordered, payload = builtin_payload(want)
    byte_ok = raw == payload

    # ---- PLANET.BUILTIN_SYNC ----
    missing = [en for en in sorted(want) if en not in builtin]
    extra = [en for en in sorted(builtin) if en not in want]
    mismatch = [(en, builtin[en], want[en])
                for en in sorted(want) if en in builtin and builtin[en] != want[en]]
    # 键在 starmap 里根本没有的幽灵条目（比 extra 更严重：拼错了）
    ghost = [en for en in extra if en not in planets]
    for en in missing:
        errors.append("PLANET.BUILTIN_SYNC：starmap 已有中文（%s），但 index.html 的 "
                      "BUILTIN_PLANET_CN 里没有 %s —— 少一条离线兜底" % (want[en], en))
    for en in extra:
        if en in ghost:
            errors.append("PLANET.BUILTIN_SYNC：BUILTIN_PLANET_CN 里的 %s 在 starmap.planets 里"
                          "根本不存在（拼写？已废弃？）" % en)
        else:
            errors.append("PLANET.BUILTIN_SYNC：BUILTIN_PLANET_CN 里有 %s，但 starmap 里它还没中文"
                          "（cn=%r）" % (en, (planets.get(en) or {}).get("cn")))
    for en, got, exp in mismatch:
        errors.append("PLANET.BUILTIN_SYNC：%s 的译名不一致 —— index.html 是 %r，starmap 是 %r"
                      "（BUILTIN 优先级更高，页面显示的是前者）" % (en, got, exp))
    # 条目全对、字节不对 = 纯粹的键序/分隔符漂移。单列一条，不然下次 --write 会吐出假 diff。
    if not byte_ok and not (missing or extra or mismatch):
        errors.append("PLANET.BUILTIN_SYNC：BUILTIN_PLANET_CN 的条目与 starmap 完全一致，但**字节不同**"
                      "（键序或 JSON 分隔符被改过）—— 期望 json.dumps(...,ensure_ascii=False) 的格式："
                      "键升序、条目间 ', '、键值间 ': '。跑 --write 统一。")

    # ---- PLANET.SYS_AGREE ----
    disagree = []
    for en in sorted(planets.keys()):
        if en not in sname:
            continue
        a = (planets[en] or {}).get("cn")
        b = sname[en]
        if (a or "") != (b or ""):
            disagree.append((en, a, b))
    for en, a, b in disagree:
        errors.append("PLANET.SYS_AGREE：%s 在 planets{}.cn = %r，在 systems[].planets[].cn = %r"
                      "（星图读前者、HD2_Wiki/planets.html 读后者 → 两个页面会显示不同名字）"
                      % (en, a, b))
    if dup:
        errors.append("PLANET.SYS_AGREE：systems[].planets[] 里同一个英文名出现了多次：%s"
                      % ", ".join(sorted(set(dup))))

    # ---- 报告 ----
    print("星球译名校验  scripts/check_planet_names.py --check")
    print("  tables/starmap.json            : %d 颗，已译 %d，未译 %d"
          % (len(planets), len(want), len(blank) + len(same)))
    print("  systems[].planets[]            : %d 条" % len(sname))
    print("  index.html BUILTIN_PLANET_CN   : %d 条" % len(builtin))
    print("  BUILTIN 与 --write 产物逐字节一致: %s"
          % ("是" if byte_ok else "否（跑 --write 同步；%d 字节 vs 期望 %d 字节）" % (len(raw), len(payload))))
    only_sys = sorted(en for en in sname if en not in planets)
    if only_sys:
        print("  只在 systems[] 里、不在 planets{} 里 : %s" % ", ".join(only_sys))

    if errors:
        print("")
        print("【必须修的问题】%d 条（跑 `python scripts/check_planet_names.py --write` 可自动同步 BUILTIN）" % len(errors))
        for e in errors:
            print("  ✗ " + e)
        # 让 GitHub Actions 的注解里也能看到（一条就够，避免刷屏）
        print("::error title=星球译名不一致::%s" % errors[0].replace("\n", " "))
    else:
        print("  ✅ 硬校验全部通过（BUILTIN 与 starmap 同步、systems 与 planets 一致）")

    # 覆盖报告永远打印，方便顺手看还剩几颗没译
    print_covers(sm, blank, same)
    return 1 if errors else 0


def print_covers(sm, blank, same):
    total = len(blank) + len(same)
    print("")
    print("【覆盖报告 · 不阻塞】未翻译星球 %d 颗（%d 颗 cn 为空、%d 颗 cn 与英文名相同）"
          % (total, len(blank), len(same)))
    if not total:
        print("  （全站星球都有中文名了）")
        return
    for en in blank:
        print(fmt_planet(sm, en) + "   cn 为空")
    for en in same:
        print(fmt_planet(sm, en) + "   cn == 英文名")


def cmd_coverage(args):
    sm = load_json(STARMAP)
    blank, same = untranslated(sm.get("planets") or {})
    print_covers(sm, blank, same)
    return 0


def cmd_write(args):
    sm = load_json(STARMAP)
    want = translated(sm.get("planets") or {})
    ordered, payload = builtin_payload(want)
    html = read_text(INDEX_HTML)
    start, end, old = builtin_span(html)
    if html[start:end + 1] == payload:
        print("BUILTIN_PLANET_CN 已与 starmap.json 一致（%d 条，逐字节相同），未写盘。" % len(ordered))
        return 0
    added = [en for en in ordered if en not in old]
    removed = [en for en in old if en not in ordered]
    changed = [en for en in ordered if en in old and old[en] != ordered[en]]
    text = html[:start] + payload + html[end + 1:]
    write_text(INDEX_HTML, text)
    print("已重写 index.html 的 BUILTIN_PLANET_CN：%d 条 → %d 条" % (len(old), len(ordered)))
    if added:
        print("  新增: " + ", ".join(added))
    if removed:
        print("  删除: " + ", ".join(removed))
    for en in changed:
        print("  改译名: %s  %r → %r" % (en, old[en], ordered[en]))
    return 0


def main():
    ap = argparse.ArgumentParser(description="星球译名一致性校验 / 内置译名表生成")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--check", action="store_true", help="校验（默认动作；exit 1 = 有硬问题）")
    g.add_argument("--coverage", action="store_true", help="只打印未翻译星球清单（始终 exit 0）")
    g.add_argument("--write", action="store_true", help="按 starmap.json 重新生成 index.html 的 BUILTIN_PLANET_CN")
    args = ap.parse_args()
    if args.write:
        return cmd_write(args)
    if args.coverage:
        return cmd_coverage(args)
    return cmd_check(args)


if __name__ == "__main__":
    sys.exit(main())
