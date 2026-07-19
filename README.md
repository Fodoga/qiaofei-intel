# 每日爆品情报站（独立版）

脱离 WorkBuddy、可独立运行在任意 Windows 电脑上的「电商爆品情报采集 + 网页看板」程序。
每天自动联网采集淘宝/拼多多/抖音/1688/饷店/细莫严选等平台热销品，生成网页看板（保留历史、按日期归档），并可推送企业微信。

---

## 一、原理说明（务必先看）

- **采集方式**：淘宝/拼多多/抖音/1688 没有公开的「热销 Top10」官方接口，真人抓取也常被反爬拦截。本程序用 **联网搜索聚合各平台榜单/舆情**，再由 **大模型（LLM）抽取结构化数据**——与「人工调研整理」等价，不是逐条实时爬取订单级数据。
- **数据性质**：价格/链接/发货时效以平台最新页面为准，**上架前请人工复核**。程序已内置「避开自研品类」（卫生巾、洗脸巾、纸巾等）。
- **每天自动跑**：通过 **Windows 任务计划**（不是 WorkBuddy 自动化），在本机 09:00（工作日）自动执行。

---

## 二、本机首次使用（3 步）

1. **装 Python**：到 https://www.python.org 下载安装，安装时勾选「Add Python to PATH」。
2. **填配置**：用记事本打开 `config.json`，把下面两项换成你自己的（程序不带任何密钥）：
   - `llm.api_key`：大模型密钥。默认用 DeepSeek（`base_url` 已填 `https://api.deepseek.com/v1`，`model` 为 `deepseek-chat`）。
     也可改成 Kimi / 通义千问 / OpenAI，只需改 `base_url`、`api_key`、`model`。
   - `search.api_key`：搜索服务密钥。默认用 **SerpAPI**（免费额度够用，注册 https://serpapi.com 获取）。
     若不填，会自动回退到 DuckDuckGo（可能被限流，仅作兜底）。
   - （可选）`wecom.webhook_url` 填企业微信群机器人地址，并把 `enabled` 改为 `true`，即可每天推送摘要到群。
3. **一键安装**：双击 `install.bat`（或命令行执行 `python main.py --install`），完成依赖安装 + 注册每日任务计划。

完成后，每天 09:00 自动更新。**直接双击 `web\index.html`** 即可在浏览器查看看板（历史按日期归档）。

---

## 三、手动运行命令

```
python main.py                 # 跑一次真实采集（默认）
python main.py --run           # 同上，显式
python main.py --self-test     # 用示例数据跑通本地流水线（无需任何 API，验证打包用）
python main.py --install       # 注册 Windows 任务计划
python main.py --remove        # 取消注册
python main.py --status        # 查看任务计划状态
```

---

## 四、打包发送到其他电脑（两种方式）

### 方式 A：源码压缩包（对方需装 Python，最简单）
1. 把整个 `product-intel-standalone` 文件夹压缩成 zip。
2. 发给同事，对方解压。
3. 对方按「二、本机首次使用」填 `config.json` + 双击 `install.bat` 即可。

### 方式 B：单文件 exe（对方无需装 Python，最省事）
1. 在本机双击 `build_exe.bat`，生成 `dist\QiaoFeiIntel.exe`。
2. 把 `QiaoFeiIntel.exe` + `config.json` + `web\` 文件夹放在一起，打成 zip 发送。
3. 对方解压后：
   - 填好 `config.json`（llm.api_key / search.api_key / wecom）；
   - 命令行进入该目录执行 `QiaoFeiIntel.exe --install` 注册任务计划；
   - 双击 `web\index.html` 看板。

> 提示：exe 不含密钥，每台电脑各自填自己的 `config.json` 即可。

---

## 五、文件结构

```
product-intel-standalone/
├── config.json          # 所有配置（API 密钥、平台、调度时间、企微 webhook）
├── main.py              # 入口
├── agent.py             # 检索 + LLM 抽取结构化数据
├── web_search.py        # 联网检索（SerpAPI / DuckDuckGo）
├── llm_client.py        # OpenAI 兼容 LLM 客户端
├── data_store.py        # 合并写入 web/data.js（保留历史）
├── push_wecom.py        # 企业微信推送
├── scheduler.py         # Windows 任务计划注册
├── requirements.txt     # Python 依赖
├── install.bat          # 一键安装（依赖 + 注册计划）
├── build_exe.bat        # 打包成 exe
├── run.log              # 运行日志（自动生成）
└── web/
    ├── index.html       # 看板网页（双击查看）
    └── data.js          # 数据（程序自动更新）
```

---

## 六、常见问题

- **企业微信推送没反应？** 检查 `wecom.enabled` 是否为 `true`、`webhook_url` 是否正确；未配置时会自动跳过，不算失败。
- **任务计划没触发？** 用 `python main.py --status` 查看；默认「用户登录后才运行」，若需关机/未登录也跑，需在任务计划里改触发条件并填密码。
- **搜索经常为空？** 申请 SerpAPI 密钥填入 `search.api_key`；DuckDuckGo 兜底不稳定。
- **想改采集时间/频率？** 改 `config.json` 的 `schedule`（hour/minute/days），再跑一次 `--install`。
- **数据要复核**：本程序为联网聚合情报，正式上架前请在平台核实价格与发货时效。

---

## 七、GitHub 自动站（推荐：发给别人最简单）

把项目推到 GitHub，开启 Pages 后，会得到一个**公网网址**。任何人（手机/电脑）浏览器打开就能看，**每天自动刷新**，接收方零安装、零配置。

### 你（发送方）只需做一次（约 5 分钟）

1. **建仓库**：登录 GitHub → New repository → 取名如 `qiaofei-intel` → 创建（空仓库即可）。
2. **填密钥到 Secrets**（仓库 Settings → Secrets and variables → Actions → New repository secret）：
   - `LLM_API_KEY`：你的大模型密钥（DeepSeek 等）
   - `SEARCH_API_KEY`：SerpAPI 密钥（留空会回退 DuckDuckGo 兜底）
   - `WECOM_WEBHOOK_URL`：（可选）企业微信机器人地址
3. **开启 Pages**：仓库 Settings → Pages → Source 选 **GitHub Actions**。
4. **推送代码**：在本机该文件夹执行（把 `你的用户名` 换成实际 GitHub 用户名）：
   ```
   git remote add origin https://github.com/你的用户名/qiaofei-intel.git
   git push -u origin main
   ```
5. **首次触发**：仓库 Actions 页 → 选「每日爆品情报更新」→ Run workflow。跑完即可在 `https://你的用户名.github.io/qiaofei-intel/` 看到看板。

### 之后怎么用

- **接收方**：把上面的网址发给他们，浏览器打开即看；内容每天 09:00（北京）自动更新，刷新即可。
- **你想立即更新**：仓库 Actions 页点一下「Run workflow」，几分钟后刷新网页即是最新。
- **想停更**：仓库 Settings → Actions → 禁用该 workflow 即可。

> 说明：密钥只存在 GitHub Secrets，**不会进代码**，可放心公开仓库。历史数据随每次运行自动提交回 `web/data.js`，按日期永久归档。

---

## 八、三种分发方式对比

| 方式 | 接收方操作 | 更新方式 | 适合场景 |
|---|---|---|---|
| **GitHub 自动站**（推荐） | 打开链接，零安装 | 自动每天刷新 + 你可手动触发 | 发给多人、长期共享 |
| 方式 A 源码 zip | 装 Python + 填 key + 装计划 | 各自电脑跑 | 对方也想本地自控 |
| 方式 B exe | 解压 + 填 key + 注册计划 | 各自电脑跑 | 对方完全不懂技术、无 Python |
