# -*- coding: utf-8 -*-
"""俏妃甄选每日爆品情报站（独立版入口）。

用法：
  python main.py --run          真实采集一次（需先配置 config.json 的 LLM/搜索 API）
  python main.py --self-test    用示例数据跑通本地流水线（无需任何 API，用于验证打包）
  python main.py --install      注册 Windows 任务计划，每日自动运行
  python main.py --remove       取消注册任务计划
  python main.py --status       查看任务计划状态
  python main.py                不带参数 = 跑一次真实采集
"""
import argparse
import json
import os
import sys
import datetime
import traceback

from data_store import merge_entry
from push_wecom import push
from agent import build_entry
from web_search import search_image, placeholder_image

# 平台色（与网页一致），用于生成占位图
PLAT_COLOR = {
    "淘宝/天猫": "#ff6a00", "拼多多": "#e02e24", "抖音": "#111418",
    "1688（源头工厂）": "#ff7a1a", "饷店/细莫严选": "#c9418f",
}


def base_dir():
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def load_config(bd):
    with open(os.path.join(bd, "config.json"), encoding="utf-8") as f:
        cfg = json.load(f)
    # 环境变量覆盖（用于 GitHub Actions / 容器部署，避免把密钥写进 config.json 并提交到仓库）
    env_map = {
        "LLM_API_KEY": ("llm", "api_key"),
        "LLM_BASE_URL": ("llm", "base_url"),
        "LLM_MODEL": ("llm", "model"),
        "SEARCH_API_KEY": ("search", "api_key"),
        "WECOM_WEBHOOK_URL": ("wecom", "webhook_url"),
    }
    for env_key, (section, key) in env_map.items():
        val = os.environ.get(env_key)
        if val:
            cfg.setdefault(section, {})[key] = val
    # 若配置了企微 webhook，则视为启用推送
    if os.environ.get("WECOM_WEBHOOK_URL"):
        cfg.setdefault("wecom", {})["enabled"] = True
    return cfg


def log(bd, msg):
    try:
        with open(os.path.join(bd, "run.log"), "a", encoding="utf-8") as f:
            f.write(f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n")
    except Exception:
        pass


def fill_images(entry, search_key):
    """给没有图片的条目补全：优先真实图搜索（限次控额度），否则用占位图。"""
    cap = 18  # 每天最多搜图次数，避免超额（20 产品 + 5 主推，余下回退占位图）
    cnt = [0]

    def _fill(p):
        if p.get("image"):
            return
        if cnt[0] < cap and search_key:
            p["image"] = search_image(p.get("name", ""), search_key)
            if p["image"]:
                cnt[0] += 1
        if not p.get("image"):
            p["image"] = placeholder_image(p.get("name", ""),
                                           PLAT_COLOR.get(p.get("platform"), "#e85b8a"))

    for p in entry.get("products", []):
        _fill(p)
    for tp in entry.get("weeklySuggestion", {}).get("topPicks", []):
        _fill(tp)
    print(f"[image] 图片补全完成，真实图搜索 {cnt[0]} 次")


def run_pipeline(config, bd, use_mock=False):
    entry = build_entry(config, use_mock=use_mock)
    search_key = config.get("search", {}).get("api_key", "")
    fill_images(entry, search_key)
    entries = merge_entry(bd, config.get("output_dir", "web"), entry)
    n = len(entry.get("products", []))
    m = sum(1 for p in entry.get("products", []) if p.get("match"))
    ws = entry.get("weeklySuggestion", {})
    print(f"[ok] 已写入数据，历史条目数: {len(entries)}；今日产品 {n} 款（匹配 {m}）；本周专区：{ws.get('theme','')}")
    push(entry, config, bd)
    return entry


def main():
    bd = base_dir()
    parser = argparse.ArgumentParser(description="俏妃甄选每日爆品情报站（独立版）")
    parser.add_argument("--run", action="store_true", help="真实采集一次（需配置 API）")
    parser.add_argument("--self-test", action="store_true", help="示例数据跑通流水线（无需 API）")
    parser.add_argument("--install", action="store_true", help="注册 Windows 任务计划")
    parser.add_argument("--remove", action="store_true", help="取消注册任务计划")
    parser.add_argument("--status", action="store_true", help="查看任务计划状态")
    args = parser.parse_args()

    config = load_config(bd)

    if args.install:
        from scheduler import install, remove, status
        remove()
        install(bd, config)
        status()
        return
    if args.remove:
        from scheduler import remove, status
        remove()
        status()
        return
    if args.status:
        from scheduler import status
        status()
        return

    # 采集类（self-test / run / 默认）
    try:
        if args.self_test:
            log(bd, "self-test 开始")
            run_pipeline(config, bd, use_mock=True)
            log(bd, "self-test 完成")
        else:
            log(bd, "run 开始")
            run_pipeline(config, bd, use_mock=False)
            log(bd, "run 完成")
    except Exception as e:
        log(bd, f"失败: {e}\n{traceback.format_exc()}")
        print(f"[error] 运行失败并已记录到 run.log: {e}")
        raise


if __name__ == "__main__":
    main()
