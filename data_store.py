# -*- coding: utf-8 -*-
"""数据落盘：读取/合并 web/data.js（window.DASHBOARD_DATA = [...]），保留历史、按日期置顶，并跨天去重。"""
import json
import re
import os
import datetime


def _resolve(base_dir, output_dir):
    return os.path.join(base_dir, output_dir, "data.js")


def load_entries(base_dir, output_dir):
    path = _resolve(base_dir, output_dir)
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    m = re.search(r"window\.DASHBOARD_DATA\s*=\s*(\[.*\])\s*;?", content, re.S)
    if not m:
        return []
    return json.loads(m.group(1))


def save_entries(base_dir, output_dir, entries):
    path = _resolve(base_dir, output_dir)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write("window.DASHBOARD_DATA = ")
        json.dump(entries, f, ensure_ascii=False, indent=2)
        f.write(";\n")


def merge_entry(base_dir, output_dir, new_entry):
    """合并当日 entry：同日则覆盖，否则置顶；并对 products/topPicks 做跨天去重（每天不重样）。返回合并后的列表。"""
    entries = load_entries(base_dir, output_dir)
    date = new_entry.get("date")

    # 跨天去重：新 entry 的 products / topPicks 若近 14 天已推过，则剔除
    recent = set()
    cutoff = datetime.date.today() - datetime.timedelta(days=14)
    for e in entries:
        ed = e.get("date", "")
        try:
            edt = datetime.date.fromisoformat(ed)
        except Exception:
            edt = None
        if edt and edt < cutoff:
            continue
        for p in e.get("products", []):
            nm = (p.get("name", "") or "").strip()
            pf = (p.get("platform", "") or "").strip()
            if nm:
                recent.add(f"{nm}||{pf}")
        for tp in e.get("weeklySuggestion", {}).get("topPicks", []):
            nm = (tp.get("name", "") or "").strip()
            pf = (tp.get("platform", "") or "").strip()
            if nm:
                recent.add(f"{nm}||{pf}")

    def _seen(p):
        nm = (p.get("name", "") or "").strip()
        pf = (p.get("platform", "") or "").strip()
        return bool(nm) and f"{nm}||{pf}" in recent

    before = len(new_entry.get("products", []))
    new_entry["products"] = [p for p in new_entry.get("products", []) if not _seen(p)]
    after = len(new_entry["products"])
    ws = new_entry.get("weeklySuggestion", {})
    ws["topPicks"] = [p for p in ws.get("topPicks", []) if not _seen(p)]

    # 同日内部去重（避免 LLM 同批重复）
    _seen_names = set()
    new_entry["products"] = [p for p in new_entry["products"]
                             if (p.get("name", "") + "||" + p.get("platform", "")) not in _seen_names
                             and not _seen_names.add(p.get("name", "") + "||" + p.get("platform", ""))]
    _trend_seen = set()
    new_entry["trending"] = [t for t in new_entry.get("trending", [])
                             if (t.get("name", "") + "||" + t.get("platform", "")) not in _trend_seen
                             and not _trend_seen.add(t.get("name", "") + "||" + t.get("platform", ""))]

    if before != after:
        print(f"[dedup] 跨天去重剔除 {before - after} 款重复推荐（每天不重样）")

    filtered = [e for e in entries if e.get("date") != date]
    filtered.insert(0, new_entry)
    # 按日期倒序兜底
    filtered.sort(key=lambda e: e.get("date", ""), reverse=True)
    save_entries(base_dir, output_dir, filtered)
    return filtered


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    print("当前条目数:", len(load_entries(here, "web")))
