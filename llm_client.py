# -*- coding: utf-8 -*-
"""OpenAI 兼容的 LLM 客户端（DeepSeek / Kimi / 通义千问 / OpenAI 等均可）。"""
import json
import requests


class LLMClient:
    def __init__(self, base_url, api_key, model, temperature=0.3, timeout=120):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.timeout = timeout

    def chat(self, system_prompt, user_prompt, max_tokens=4096):
        """普通对话，返回纯文本。"""
        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "temperature": self.temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
        }
        resp = requests.post(url, headers=headers, json=payload, timeout=self.timeout)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def chat_json(self, system_prompt, user_prompt, max_tokens=4096):
        """对话并解析返回的 JSON（兼容 ```json 代码块）。"""
        text = self.chat(system_prompt, user_prompt, max_tokens)
        return self._extract_json(text)

    @staticmethod
    def _extract_json(text):
        t = text.strip()
        if t.startswith("```"):
            # 去掉 ```json 或 ```
            first_newline = t.find("\n")
            if first_newline != -1:
                t = t[first_newline + 1:]
            if t.endswith("```"):
                t = t[:-3]
        start = -1
        for ch in ("{", "["):
            i = t.find(ch)
            if i != -1 and (start == -1 or i < start):
                start = i
        end = max(t.rfind("}"), t.rfind("]"))
        if start != -1 and end != -1:
            t = t[start:end + 1]
        return json.loads(t)
