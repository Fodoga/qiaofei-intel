#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Phase 2 一次性补丁脚本：升级 web/index.html，让仪表盘支持真实采集数据。

改动共 6 处：
  1. 新增 CSS：来源徽章 .tag.src-* 与专题横幅 .theme-banner
  2. 引入 <script src="collected.js">（真实采集数据）
  3. DATA 合并 DASHBOARD_DATA + COLLECTED_DATA，并给 AI 条目补 source='ai'
  4. 新增 sourceBadge() 函数
  5. 商品卡标签区插入来源徽章
  6. 最新一期顶部渲染「本周专题」横幅

特性：
  - 幂等。已打过补丁再跑一次不会重复插入，直接报告 no-change 并以 0 退出。
  - 严格。每个锚点必须在文件中恰好出现 1 次，否则报错退出（避免打歪）。
  - 只改 web/index.html，不碰任何其他文件。

用法：在仓库根目录执行  python tools/apply_phase2.py
"""

import os
import sys

TARGET = os.path.join("web", "index.html")

# 每一项：(步骤名, 幂等标记, 锚点, 替换文本)
# 若"幂等标记"已存在于文件中，则跳过该步骤。
STEPS = [
    (
        "1/6 注入来源徽章与专题横幅样式",
        ".tag.src-plugin",
        "  .tag.sc{background:#eaf0fb;color:var(--blue);border:1px solid #d3e0f7}\n",
        "  .tag.sc{background:#eaf0fb;color:var(--blue);border:1px solid #d3e0f7}\n"
        "  .tag.src-plugin{background:#232A36;color:#fff}\n"
        "  .tag.src-manual{background:#fff;color:#B08D57;border:1px solid #B08D57}\n"
        "  .tag.src-ai{background:#fff;color:#767B85;border:1px solid #d9dce1}\n"
        '  .theme-banner{background:#FAFAFA;border-left:3px solid #B08D57;color:#232A36;'
        'font-family:"Noto Serif SC",serif;font-weight:500;letter-spacing:.06em;font-size:13px;'
        "padding:9px 14px;margin-bottom:12px;border-radius:0 8px 8px 0}\n",
    ),
    (
        "2/6 引入 collected.js",
        'src="collected.js"',
        '<script src="data.js"></script>\n',
        '<script src="data.js"></script>\n<script src="collected.js"></script>\n',
    ),
    (
        "3/6 合并真实采集数据到 DATA",
        "COLLECTED_DATA",
        "  var DATA = (window.DASHBOARD_DATA || []);\n",
        "  var DATA = (window.DASHBOARD_DATA || []).concat(window.COLLECTED_DATA || []);\n"
        "  // 给 AI 生成的条目补 source 标记（collected 真实采集条目本身已带 source）\n"
        "  DATA.forEach(function(d){ if(!d.dataSource || d.dataSource.indexOf('真实采集')===-1)"
        "{ (d.products||[]).forEach(function(p){ if(!p.source) p.source='ai'; }); } });\n",
    ),
    (
        "4/6 新增 sourceBadge() 函数",
        "function sourceBadge",
        "  // ============ 产品卡 ============\n",
        "  // ============ 来源徽章 ============\n"
        "  function sourceBadge(p){\n"
        "    var s=p.source||'';\n"
        "    if(s==='plugin') return '<span class=\"tag src-plugin\">插件采集</span>';\n"
        "    if(s==='manual') return '<span class=\"tag src-manual\">手动</span>';\n"
        "    if(s==='ai') return '<span class=\"tag src-ai\">AI生成</span>';\n"
        "    return '';\n"
        "  }\n"
        "\n"
        "  // ============ 产品卡 ============\n",
    ),
    (
        "5/6 商品卡标签区插入来源徽章",
        "+dupTag+sourceBadge(p)+",
        "+dupTag+'<span class=\"tag sc\">上架分 '",
        "+dupTag+sourceBadge(p)+'<span class=\"tag sc\">上架分 '",
    ),
    (
        "6/6 最新一期顶部渲染本周专题横幅",
        'theme-banner">本周专题',
        "    el.innerHTML='<div class=\"week\">'+\n",
        "    var curTheme = (DATA[0] && DATA[0].weeklySuggestion && DATA[0].weeklySuggestion.theme) || '';\n"
        "    for(var _i=0;_i<DATA.length;_i++){ var _ps=DATA[_i].products||[]; "
        "for(var _j=0;_j<_ps.length;_j++){ if(_ps[_j].theme){ curTheme=_ps[_j].theme; "
        "_i=DATA.length; break; } } }\n"
        "    el.innerHTML='<div class=\"theme-banner\">本周专题 · '+esc(curTheme)+"
        "'</div><div class=\"week\">'+\n",
    ),
]


def main():
    if not os.path.isfile(TARGET):
        print("ERROR: 找不到 %s，请在仓库根目录执行本脚本" % TARGET)
        return 2

    with open(TARGET, "r", encoding="utf-8", newline="") as f:
        text = f.read()

    if "\r\n" in text:
        print("ERROR: %s 含 CRLF 换行，与补丁锚点不匹配，已中止" % TARGET)
        return 2

    original = text
    applied, skipped = [], []

    for name, marker, anchor, replacement in STEPS:
        if marker in text:
            skipped.append(name)
            continue
        count = text.count(anchor)
        if count != 1:
            print("ERROR: [%s] 锚点出现 %d 次（期望 1 次），已中止，未写入任何改动" % (name, count))
            print("       锚点片段：%r" % anchor[:80])
            return 3
        text = text.replace(anchor, replacement, 1)
        applied.append(name)

    for name in skipped:
        print("skip    %s（已存在）" % name)
    for name in applied:
        print("applied %s" % name)

    if text == original:
        print("RESULT: no-change（补丁此前已全部应用）")
        return 0

    with open(TARGET, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    print("RESULT: changed  %d -> %d bytes" % (
        len(original.encode("utf-8")), len(text.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
