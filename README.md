# 俏妃爆品情报站 · Qiaofei Intelligence Station

面向三四线县城女性健康消费的「每日爆品情报站」+「浏览器采集插件」一体化仓库。
目标：合规展示平台真实在售爆品、零成本、小白可维护、数据自动 + 手动双通道采集。

## 仓库分区

本仓库刻意分为两个清晰独立的分区，互不干扰：

| 分区 | 路径 | 是什么 | 部署/使用 |
| --- | --- | --- | --- |
| 情报站前端 | `web/` | 每日爆品情报站网页（GitHub Pages 静态站） | 推到 `main` 后由 `update.yml` 自动部署到 Pages |
| 采集插件 | `collector/` | Chrome MV3 浏览器插件，采集竞品在售商品 | 在 `chrome://extensions` 加载已解压的 `collector/` 目录 |

> 注意：`web/data.js` 与 `web/collected.js` 由 CI / 插件自动写入，**请勿手动编辑**，避免覆盖自动采集数据。

## web/ 情报站

- `index.html`：站点主页面（含今日热销、热销趋势、日程专区建议、每日热销归档四大板块）。
- 交互特性：每个大板块可展开/收起、左侧目录跳转、专区「结束归档」把真实采集商品永久留存。
- 数据来源：
  - `data.js`（`window.DASHBOARD_DATA`）：AI pipeline 每日生成的平台爆品情报。
  - `collected.js`（`window.COLLECTED_DATA`）：浏览器插件采集的真实在售商品。
- 线上地址：`https://fodoga.github.io/qiaofei-intel/`

## collector/ 采集插件

Chrome 扩展（MV3），用于在电商商品页一键采集在售信息并上传到仓库 `web/collected.js`。

- `manifest.json`：扩展清单（MV3）。
- `popup.html / popup.js / popup.css`：弹窗界面，采集前可选择「归属专区」或「日常采集」。
- `background.js`：后台上传逻辑（通过 GitHub Contents API 写入 `collected.js`）。
- `content.js`：商品页内容抓取。
- `manual.html / manual.js / manual.css`：使用说明。

安装：打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择本仓库的 `collector/` 目录。

## 数据管道（规划中）

- Phase 1（已上线）：情报站前端 + 插件手动采集。
- Phase 2：接入 `schedule.json` 与 AI pipeline，让专区建议真正持久化、自动生成。
- Phase 3：插件完整日程支持，采集时自动对齐对应专区与时间窗。

## 目录约定

```
qiaofei-intel/
├── web/            # 情报站（Pages 部署）
│   ├── index.html
│   ├── data.js      # 自动生成，勿手改
│   └── collected.js # 插件写入，勿手改
└── collector/      # 浏览器采集插件（独立分区）
    ├── manifest.json
    ├── background.js
    ├── content.js
    ├── popup.html / popup.js / popup.css
    └── manual.html / manual.js / manual.css
```
