# -*- coding: utf-8 -*-
"""企业微信群机器人推送：把当日爆品摘要以 markdown 推送到群。"""
import json
import os
import requests


def _fmt_entry(entry):
    lines = []
    lines.append(f"# 📊 俏妃甄选·每日爆品情报 ｜ {entry.get('date','')} ｜ {entry.get('season','')}")
    ws = entry.get("weeklySuggestion", {})
    lines.append(f"\n## 🌟 本周专区：{ws.get('theme','')}")
    if ws.get("reason"):
        lines.append(f"> {ws['reason']}")
    for z in ws.get("zones", []):
        lines.append(f"- **{z.get('zone','')}**：{ '、'.join(z.get('products', [])) }")
    lines.append("\n## 🔥 今日主推")
    for i, p in enumerate(ws.get("topPicks", []), 1):
        lines.append(f"{i}. **{p.get('name','')}** 〔{p.get('platform','')}〕 {p.get('price','')} "
                     f"| 品牌 {p.get('brand','')} | 发货 {p.get('shipping','')}\n   > {p.get('reason','')}")
    products = entry.get("products", [])
    match_n = sum(1 for p in products if p.get("match"))
    lines.append(f"\n## ✅ 匹配可上架 {match_n}/{len(products)} 款")
    # 按平台分组
    by_plat = {}
    for p in products:
        by_plat.setdefault(p.get("platform", "其他"), []).append(p)
    for plat, ps in by_plat.items():
        lines.append(f"\n### {plat}")
        for p in ps:
            badge = "✅匹配" if p.get("match") else "➖观望"
            lines.append(f"- {badge} **{p.get('name','')}** {p.get('price','')} | 发货 {p.get('shipping','')}")
            lines.append(f"  - 🔥 {p.get('hotReason','')}")
            if p.get("goodKeywords"):
                lines.append(f"  - 👍 好评：{'、'.join(p['goodKeywords'])}")
            if p.get("badKeywords"):
                lines.append(f"  - 👎 差评：{'、'.join(p['badKeywords'])}")
            lines.append(f"  - 💡 {p.get('matchReason','')}")
            lines.append(f"  - 🔗 {p.get('link','')}")
    lines.append(f"\n> ⚠️ 数据来源：{entry.get('dataSource','联网搜索聚合，上架前请人工复核')}")
    return "\n".join(lines)


def push(entry, config, base_dir=None):
    wecom = config.get("wecom", {})
    if not wecom.get("enabled") or not wecom.get("webhook_url"):
        print("[wecom] 未启用或 webhook 为空，跳过推送（不算失败）。")
        return False
    content = _fmt_entry(entry)
    payload = {"msgtype": "markdown", "markdown": {"content": content}}
    try:
        r = requests.post(wecom["webhook_url"], json=payload, timeout=15)
        r.raise_for_status()
        print("[wecom] 推送成功:", r.json())
        return True
    except Exception as e:
        print(f"[wecom] 推送失败: {e}")
        return False


if __name__ == "__main__":
    import sys
    here = os.path.dirname(os.path.abspath(__file__))
    # 自测：用现有 data.js 第一条
    from data_store import load_entries
    entries = load_entries(here, "web")
    if entries:
        print(_fmt_entry(entries[0])[:800])
