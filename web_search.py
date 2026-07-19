# -*- coding: utf-8 -*-
"""联网检索模块：优先 SerpAPI，失败/未配置时回退到 DuckDuckGo HTML。"""
import re
import urllib.parse
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


def placeholder_image(label, color_hex="#e85b8a"):
    """生成本地图文占位图（SVG data URI），无需联网。"""
    safe = (str(label).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">'
        f'<rect width="100%" height="100%" fill="{color_hex}" opacity="0.12"/>'
        f'<rect x="6" y="6" width="288" height="188" rx="12" fill="none" '
        f'stroke="{color_hex}" stroke-width="2" opacity="0.5"/>'
        f'<text x="50%" y="50%" font-family="PingFang SC,Microsoft YaHei,sans-serif" '
        f'font-size="17" font-weight="700" fill="{color_hex}" text-anchor="middle" '
        f'dominant-baseline="middle">{safe}</text></svg>'
    )
    return "data:image/svg+xml," + urllib.parse.quote(svg)


def search_image(query, api_key="", timeout=20):
    """返回真实商品图直链（SerpAPI google_images）；无 key / 失败返回空字符串。"""
    if api_key and api_key != "YOUR_SERPAPI_KEY":
        try:
            params = {
                "q": query,
                "api_key": api_key,
                "engine": "google_images",
                "hl": "zh-cn",
                "num": 1,
            }
            r = requests.get("https://serpapi.com/search", params=params, timeout=timeout)
            r.raise_for_status()
            imgs = r.json().get("images_results", [])
            if imgs:
                url = imgs[0].get("original") or imgs[0].get("thumbnail")
                if url and url.startswith("http"):
                    return url
        except Exception as e:
            print(f"[warn] 图片搜索失败: {e}")
    return ""


if __name__ == "__main__":
    for r in search("女性 养生 热销 淘宝", provider="serpapi", api_key="", max_results=3):
        print(r["title"], "->", r["link"])
