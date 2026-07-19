# -*- coding: utf-8 -*-
"""OpenAI 兼容的 LLM 客户端（DeepSeek / Kimi / 通义千问 / OpenAI 等均可）。"""
import json
import re
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

    def chat_json(self, system_prompt, user_prompt, max_tokens=4096, retries=2):
        """对话并解析返回的 JSON（兼容 ```json 代码块、脏格式、重试）。"""
        last_err = None
        text = ""
        for attempt in range(1, retries + 2):
            text = self.chat(system_prompt, user_prompt, max_tokens)
            try:
                return self._extract_json(text)
            except Exception as e:
                last_err = e
                print(f"[llm] JSON 解析失败（第 {attempt} 次），尝试重试...")
        # 最终失败：打印原始文本并抛出
        print(f"[llm] 最终 JSON 解析失败: {last_err}")
        print(f"[llm] 原始文本前 800 字符:\\n{text[:800]}")
        print(f"[llm] 原始文本后 800 字符:\\n{text[-800:]}")
        raise last_err

    @staticmethod
    def _extract_json(text):
        """从文本中提取并解析 JSON，支持 markdown 代码块、前后废话、常见脏格式。"""
        t = text.strip()

        # 去掉 markdown 代码块标记
        if t.startswith("```"):
            first_newline = t.find("\n")
            if first_newline != -1:
                t = t[first_newline + 1:]
            if t.endswith("```"):
                t = t[:-3].strip()

        # 找到第一个 { 或 [
        start = -1
        for ch in ("{", "["):
            i = t.find(ch)
            if i != -1 and (start == -1 or i < start):
                start = i
        if start == -1:
            raise ValueError("未找到 JSON 起始标记 { 或 [")

        # 括号匹配：找到与第一个 {/[ 配对的 }/]
        stack = []
        in_string = False
        escape = False
        end = -1
        for i, ch in enumerate(t[start:], start):
            if in_string:
                if escape:
                    escape = False
                    continue
                if ch == "\\":
                    escape = True
                    continue
                if ch == '"':
                    in_string = False
                continue
            if ch == '"':
                in_string = True
                continue
            if ch in "{[":
                stack.append(ch)
            elif ch in "}]":
                if not stack:
                    raise ValueError("JSON 括号不匹配")
                stack.pop()
                if not stack:
                    end = i
                    break
        if end == -1:
            raise ValueError("未找到 JSON 结束标记")

        json_str = t[start:end + 1]

        # 尝试直接解析
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

        # 修复常见脏格式后重试
        cleaned = LLMClient._clean_json(json_str)
        return json.loads(cleaned)

    @staticmethod
    def _clean_json(s):
        """修复 LLM 可能犯的常见 JSON 语法错误。"""
        # 去掉 // 注释
        s = re.sub(r'\s*//[^\n]*', '', s)
        # 去掉 /* */ 注释
        s = re.sub(r'/\*.*?\*/', '', s, flags=re.DOTALL)
        # 去掉对象/数组中最后一个元素后的多余逗号
        s = re.sub(r',(\s*[}\]])', r'\1', s)
        # 去掉对象里的多余尾部逗号
        s = re.sub(r',(\s*})', r'\1', s)
        return s.strip()
