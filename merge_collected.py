#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
merge_collected.py —— 把 web/collected/raw/*.json（插件/手动采集上传的原始商品）
合并去重进 web/collected.json，并生成 web/collected.js（供 index.html 直接读取）。

设计要点（与方案 V2.2 一致）：
- 真实数据独立存放 collected.json，绝不写 data.js（data.js 每天被 AI 整篇覆盖）。
- 上传是「每人一个独立文件」的追加写，本脚本统一合并，避免并发冲突。
- 按 collectedAt 查 theme_calendar.json 自动给每条打 theme（日历单一事实源）。
- 一周内（7 天）已采过的同款(name|platform)跳过（去重），并更新 picked.json。
- 处理完的原始文件会被删除，避免重复累计。
"""
import json
import os
import glob
import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
RAW_DIR = os.path.join(WEB, "collected", "raw")
COLLECTED_JSON = os.path.join(WEB, "collected.json")
COLLECTED_JS = os.path.join(WEB, "collected.js")
PICKED_JSON = os.path.join(WEB, "picked.json")
CALENDAR_JSON = os.path.join(WEB, "theme_calendar.json")

# 平台归一（与 index.html 的 norm 兼容）
PLATFORM_ALIAS = {
    "pdd": "拼多多", "拼夕夕": "拼多多", "pinduoduo": "拼多多",
    "taobao": "淘宝", "tmall": "天猫", "tianmao": "天猫", "淘宝网": "淘宝",
    "douyin": "抖音", "字节": "抖音", "抖音电商": "抖音",
}


def norm_platform(p):
    if not p:
        return "其他"
    p = str(p).strip()
    return PLATFORM_ALIAS.get(p.lower(), p)


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return default


def theme_for(date_str, calendar):
    """返回该日期所属专题；落在任何区间则返回区间主题，否则返回最近过去的主题。"""
    if not isinstance(calendar, list):
        return "常规选品"
    for e in calendar:
        if e.get("start") and e.get("end") and e["start"] <= date_str <= e["end"]:
            return e.get("theme", "常规选品")
    past = [e for e in calendar if e.get("end") and e["end"] < date_str]
    if past:
        return sorted(past, key=lambda e: e["end"])[-1].get("theme", "常规选品")
    return calendar[0].get("theme", "常规选品") if calendar else "常规选品"


def days_between(a, b):
    try:
        return (datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days
    except Exception:
        return 999


def main():
    calendar = load_json(CALENDAR_JSON, [])
    collected = load_json(COLLECTED_JSON, [])
    if not isinstance(collected, list):
        collected = []
    picked = load_json(PICKED_JSON, {})
    if not isinstance(picked, dict):
        picked = {}

    raw_files = sorted(glob.glob(os.path.join(RAW_DIR, "*.json")))
    # 排除 .gitkeep
    raw_files = [f for f in raw_files if os.path.basename(f) != ".gitkeep"]

    added = 0
    processed = []

    for rf in raw_files:
        try:
            with open(rf, encoding="utf-8") as f:
                item = json.load(f)
        except Exception:
            continue  # 解析失败，保留原文件，等下次

        # 需要 OCR 的原始图（未配视觉密钥时不应出现）：本次跳过，保留待 Phase 3
        if item.get("needsOcr"):
            continue

        prod = item.get("product", item)  # 兼容 {product:{...}} 与直接 {name:...}
        name = (prod.get("name") or "").strip()
        platform = norm_platform(prod.get("platform"))
        if not name:
            processed.append(rf)  # 无商品名，丢弃
            continue

        collected_at = prod.get("collectedAt") or datetime.datetime.utcnow().isoformat()
        date_str = collected_at[:10]
        key = "{}|{}".format(name, platform)

        # 一周内去重
        last = picked.get(key)
        if last and 0 <= days_between(date_str, last) < 7:
            processed.append(rf)  # 已采过，消费掉
            continue

        rec = {
            "name": name,
            "platform": platform,
            "price": prod.get("price", ""),
            "brand": prod.get("brand", ""),
            "shipping": prod.get("shipping", ""),
            "reason": prod.get("reason", ""),
            "image": prod.get("image", ""),
            "link": prod.get("link", ""),
            "hotReason": prod.get("hotReason", ""),
            "matchReason": prod.get("matchReason", ""),
            "goodKeywords": prod.get("goodKeywords", []),
            "badKeywords": prod.get("badKeywords", []),
            "spec": prod.get("spec", ""),
            "salesText": prod.get("salesText", ""),
            "source": prod.get("source", "plugin"),
            "collectedAt": collected_at,
            "salesConfidence": prod.get("salesConfidence", "reported"),
            "theme": theme_for(date_str, calendar),
        }

        day = next((d for d in collected if d.get("date") == date_str), None)
        if day is None:
            day = {
                "date": date_str,
                "season": "",
                "dataSource": "真实采集（插件/手动）",
                "weeklySuggestion": {"theme": rec["theme"], "reason": "", "zones": [], "topPicks": []},
                "products": [],
            }
            collected.append(day)
        day["products"].append(rec)
        picked[key] = date_str
        added += 1
        processed.append(rf)

    collected.sort(key=lambda d: d.get("date", ""), reverse=True)

    with open(COLLECTED_JSON, "w", encoding="utf-8") as f:
        json.dump(collected, f, ensure_ascii=False, indent=2)
    with open(COLLECTED_JS, "w", encoding="utf-8") as f:
        f.write("window.COLLECTED_DATA = ")
        json.dump(collected, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    with open(PICKED_JSON, "w", encoding="utf-8") as f:
        json.dump(picked, f, ensure_ascii=False, indent=2)

    for rf in processed:
        try:
            os.remove(rf)
        except Exception:
            pass

    print("merge_collected: added={} days={} removed_raw={}".format(added, len(collected), len(processed)))


if __name__ == "__main__":
    main()
