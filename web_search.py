# -*- coding: utf-8 -*-
"""联网检索模块：优先 SerpAPI，失败/未配置时回退到 DuckDuckGo HTML。"""
import re
import requests


def search_serpapi(query, api_key, max_results=8, timeout=30):
    params = {
        "q": query,
        "api_key": api_key,
        "num": max_results,
        "engine": "google",
        "hl": "zh-cn",
    }
    r = requests.get("https://serpapi.com/search", params=params, timeout=timeout)
    r.raise_for_status()
    data = r.json()
    out = []
    for item in data.get("organic_results", [])[:max_results]:
        out.append({
            "title": item.get("title", ""),
            "snippet": item.get("snippet", ""),
            "link": item.get("link", ""),
        })
    return out


def search_ddg(query, max_results=8, timeout=30):
    """DuckDuckGo HTML 结果（尽力而为，可能被限流）。"""
    url = "https://html.duckduckgo.com/html/"
    try:
        r = requests.post(url, data={"q": query}, timeout=timeout,
                          headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        html = r.text
    except Exception:
        return []
    results = []
    # 每条结果在 class="result__a" 标题 + class="result__snippet" 摘要
    titles = re.findall(r'class="result__a"[^>]*>(.*?)</a>', html, re.S)
    links = re.findall(r'class="result__a"[^>]*href="(.*?)"', html, re.S)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', html, re.S)
    clean = lambda s: re.sub(r"<[^>]+>", "", s).strip()
    for i in range(min(max_results, len(titles))):
        results.append({
            "title": clean(titles[i]),
            "snippet": clean(snippets[i]) if i < len(snippets) else "",
            "link": links[i] if i < len(links) else "",
        })
    return results


def search(query, provider="serpapi", api_key="", max_results=8):
    """统一检索入口，返回 [{title, snippet, link}]。"""
    provider = (provider or "serpapi").lower()
    if provider == "serpapi" and api_key and api_key != "YOUR_SERPAPI_KEY":
        try:
            return search_serpapi(query, api_key, max_results)
        except Exception as e:
            print(f"[warn] SerpAPI 失败，回退 DuckDuckGo: {e}")
    return search_ddg(query, max_results)


if __name__ == "__main__":
    for r in search("女性 养生 热销 淘宝", provider="serpapi", api_key="", max_results=3):
        print(r["title"], "->", r["link"])
