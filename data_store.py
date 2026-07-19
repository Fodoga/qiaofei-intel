# -*- coding: utf-8 -*-
"""数据落盘：读取/合并 web/data.js（window.DASHBOARD_DATA = [...]），保留历史、按日期置顶。"""
import json
import re
import os


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
    """合并当日 entry：同日则覆盖，否则置顶。返回合并后的列表。"""
    entries = load_entries(base_dir, output_dir)
    date = new_entry.get("date")
    filtered = [e for e in entries if e.get("date") != date]
    filtered.insert(0, new_entry)
    # 按日期倒序兜底
    filtered.sort(key=lambda e: e.get("date", ""), reverse=True)
    save_entries(base_dir, output_dir, filtered)
    return filtered


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    print("当前条目数:", len(load_entries(here, "web")))
