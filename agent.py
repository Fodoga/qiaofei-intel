# -*- coding: utf-8 -*-
"""情报抽取智能体：检索各平台 -> LLM 抽取结构化爆品数据 -> 组装当日 entry。"""
import datetime

from web_search import search
from llm_client import LLMClient

SYSTEM_PROMPT = """你是一个电商选品情报分析师，服务于微信小程序「{mini_program}」。
目标用户：{audience}。

【硬性规则】
1. 只推荐与上述人群高度相关的「女性健康 / 私护养护（凝胶、益生菌、艾灸等非日用棉品）/ 养生食补（药食同源）/ 天然护肤个护」类产品。
2. 严禁推荐以下俏妃自研品类（避免内部竞争）：{avoid}。私护类只能选护理凝胶、益生菌、私密灸、护理液等非棉品方向。
3. 上架优先级：好评率高、知名度高、发货时效 ≤48 小时。避开高奢高客单。
4. 必须输出严格 JSON，不要任何解释性文字，不要 markdown 代码块包裹。

【输出 JSON 结构】
{{
  "date": "YYYY-MM-DD",
  "season": "当前季节描述，如 盛夏·祛湿温养季",
  "dataSource": "联网搜索聚合说明：非平台官方API逐条爬取，价格/链接/发货时效以平台最新页面为准，上架前需人工复核；已避开俏妃自研品类",
  "weeklySuggestion": {{
    "theme": "本周专区主题",
    "reason": "结合季节性的选品逻辑",
    "zones": [{{"zone": "专区名", "products": ["产品名1","产品名2"]}}],
    "topPicks": [
      {{"name":"","platform":"","price":"","brand":"","shipping":"","reason":""}}
    ]
  }},
  "products": [
    {{
      "platform": "平台名",
      "name": "产品名",
      "link": "平台站内搜索链接",
      "price": "价格区间或到手价",
      "brand": "品牌",
      "shipping": "发货时效，优先 48小时内/24小时内",
      "hotReason": "热销理由（含销量/榜单/品牌背书依据）",
      "goodKeywords": ["好评关键词1","好评关键词2"],
      "badKeywords": ["差评关键词1"],
      "match": true,
      "matchReason": "匹配/不主推理由（一句话）"
    }}
  ]
}}

要求：products 总数控制在 {max_products} 条左右；weeklySuggestion.zones 2-3 个且不得出现自研品类；topPicks 3-5 个。
链接使用平台站内搜索链接即可（淘宝 https://s.taobao.com/search?q=产品名 ；拼多多 https://mobile.yangkeduo.com/search_result.html?search_key=产品名 ；抖音 https://www.douyin.com/search/产品名 ；1688 https://www.1688.com/?keywords=产品名），不要编造商品详情页 URL。
价格/销量用「约/区间/榜单依据」表述，不编造确切数字。"""


def build_queries(business, date=None):
    """构造检索词（按平台分组，控制在 search_rounds 轮）。"""
    rounds = int(business.get("search_rounds", 3))
    base = "2026 女性 健康 养生 热销"
    pools = [
        f"{base} 淘宝 拼多多",
        f"抖音 1688 女性 私护 养生 源头工厂 爆款",
        f"细莫严选 饷店 女性 养生 当季 热销",
        f"{base} 药食同源 祛湿 护肤 好评",
        f"女性 健康 私护 凝胶 益生菌 夏季 推荐",
    ]
    return pools[:rounds]


def build_entry(config, use_mock=False):
    """生成当日 entry 字典。use_mock=True 时返回示例数据（无需联网/LLM）。"""
    business = config["business"]
    today = datetime.date.today()
    date_str = today.strftime("%Y-%m-%d")
    season = "盛夏·祛湿温养季"

    if use_mock:
        return _mock_entry(date_str, season)

    sys_p = SYSTEM_PROMPT.format(
        mini_program=business["mini_program"],
        audience=business["audience"],
        avoid="、".join(business["avoid_categories"]),
        max_products=business.get("max_products", 15),
    )

    # 1) 检索
    queries = build_queries(business)
    snippets = []
    for q in queries:
        print(f"[search] {q}")
        res = search(q, config["search"]["provider"], config["search"]["api_key"],
                     config["search"].get("max_results", 8))
        for r in res:
            snippets.append(f"- {r['title']}：{r['snippet']} ({r['link']})")
    corpus = "\n".join(snippets) if snippets else "（未检索到结果，请基于已知信息谨慎给出）"

    # 2) LLM 抽取
    user_p = f"""今天是 {date_str}，季节：{season}。
以下是联网检索到的各平台热销/爆款相关素材：

{corpus}

请基于以上素材（素材不足时用你的知识谨慎补充，并标注不确定性），产出符合 schema 的 JSON。"""
    client = LLMClient(**config["llm"])
    entry = client.chat_json(sys_p, user_p, max_tokens=4096)
    # 兜底字段
    entry.setdefault("date", date_str)
    entry.setdefault("season", season)
    entry.setdefault("dataSource", "联网搜索聚合说明：价格/链接/发货时效以平台最新页面为准，上架前需人工复核；已避开俏妃自研品类")
    entry.setdefault("products", [])
    entry.setdefault("weeklySuggestion", {"theme": season, "reason": "", "zones": [], "topPicks": []})
    return entry


def _mock_entry(date_str, season):
    return {
        "date": date_str,
        "season": season,
        "dataSource": "【自检测试数据】未调用真实检索/LLM，仅验证本地流水线（合并+推送+调度）。",
        "weeklySuggestion": {
            "theme": "盛夏·温养祛湿双专区（自测）",
            "reason": "夏季祛湿与温养需求旺盛，适合三四线女性健康养生。",
            "zones": [
                {"zone": "温养专区", "products": ["红糖姜茶", "阿胶枸杞茶"]},
                {"zone": "祛湿轻饮", "products": ["红豆薏米茶", "茯苓荷叶饮"]},
            ],
            "topPicks": [
                {"name": "细莫红糖坚果姜茶", "platform": "饷店/细莫严选", "price": "约 ¥39/盒",
                 "brand": "细莫", "shipping": "48小时内", "reason": "温养爆款，复购高"},
            ],
        },
        "products": [
            {"platform": "淘宝/天猫", "name": "红豆薏米茶", "link": "https://s.taobao.com/search?q=红豆薏米茶",
             "price": "约 ¥29", "brand": "艺福堂", "shipping": "24小时内",
             "hotReason": "夏季祛湿榜单常客", "goodKeywords": ["祛湿", "平价"], "badKeywords": ["味道淡"],
             "match": True, "matchReason": "价格敏感友好、养生主线"},
            {"platform": "拼多多", "name": "红糖姜茶", "link": "https://mobile.yangkeduo.com/search_result.html?search_key=红糖姜茶",
             "price": "约 ¥19", "brand": "白象", "shipping": "48小时内",
             "hotReason": "平价温养爆款", "goodKeywords": ["暖身", "便宜"], "badKeywords": ["偏甜"],
             "match": True, "matchReason": "低价高频、契合人群"},
        ],
    }


if __name__ == "__main__":
    import json
    print(json.dumps(build_entry({}, use_mock=True), ensure_ascii=False, indent=2))
