/* content.js —— 在商品页抽取字段 + 做卖点分析，返回给弹窗。取不到的留空，绝不报错。 */
(function () {
  "use strict";

  /* ---------- 基础取值 ---------- */

  // 读 <meta property="xx"> 或 <meta name="xx"> 的 content
  function meta(prop) {
    var el = document.querySelector('meta[property="' + prop + '"]') ||
             document.querySelector('meta[name="' + prop + '"]');
    return el ? (el.getAttribute("content") || "").trim() : "";
  }

  // 判隐藏：只信 computed style，不用 offsetParent
  // （offsetParent 对 position:fixed 的元素及其子元素恒为 null，
  //   而电商页的价格浮动条常是 fixed —— 用它会把最该抓的字段过滤掉）
  function isHidden(el) {
    var node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      try {
        var cs = (el.ownerDocument.defaultView || window).getComputedStyle(node);
        if (cs && (cs.display === "none" || cs.visibility === "hidden")) return true;
      } catch (e) { /* 拿不到样式就当可见，宁可多抓不可漏抓 */ }
      node = node.parentElement;
      depth++;
    }
    return false;
  }

  // 读普通元素的可见文字（跳过空白 / 隐藏元素，避免抓到占位符）
  function txt(sel) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) continue;
      if (t.length > 200) continue; // 过长多半是整块容器，不是字段
      if (isHidden(el)) continue;
      return t;
    }
    return "";
  }

  /* ---------- 商品名：多候选 + 合理性校验 ---------- */
  // 电商前端年年改版，class 名全是 React 编译出来的乱码，写死选择器必然过期。
  // 所以不赌选择器，改成「多候选 + 校验」：抓到明显不是商品名的就换下一个。

  // 一眼假的商品名：模块标题、评价计数、按钮文字、纯数字
  var NOT_NAME = /^(用户评价|累计评价|宝贝评价|商品评价|全部评价|月销|已售|已拼|销量|收藏|分享|首页|店铺|客服|详情|商品详情|图文详情|规格参数|产品参数|加入购物车|立即购买|立即抢购|领券|优惠券|推荐|为你推荐|猜你喜欢|价格|到手价)/;

  function looksLikeName(t) {
    t = (t || "").trim();
    if (t.length < 4) return false;                       // 商品名基本不会短于 4 字
    if (t.length > 120) return false;
    if (NOT_NAME.test(t)) return false;
    if (/^[\d,.\s¥￥+·、%-]+$/.test(t)) return false;      // 纯数字 / 符号
    if (/评价[·(（]|\d+人(付款|收货|评价)|万\+?条/.test(t)) return false; // 「用户评价·900+」这类
    return true;
  }

  // document.title 兜底：淘宝/天猫的 title 基本就是商品名，去掉平台后缀即可
  function cleanTitle(t) {
    return String(t || "")
      .replace(/^[【\[](图片|价格|品牌|报价)[】\]]\s*/, "")
      .replace(/\s*[-_—|·]\s*(淘宝网?|天猫Tmall\.com|天猫精选|天猫|Tmall|拼多多|抖音商城|抖音|京东)\s*$/i, "")
      .trim();
  }

  // 逐个候选校验，返回 { v: 商品名, ok: 是否通过校验 }
  // ok=false 表示所有候选都可疑，只能拿第一个非空顶上 —— 这时要提醒用户手动改
  function nameFrom(cands) {
    for (var i = 0; i < cands.length; i++) {
      if (looksLikeName(cands[i])) return { v: cands[i].trim().slice(0, 120), ok: true };
    }
    for (var j = 0; j < cands.length; j++) {
      if (cands[j]) return { v: String(cands[j]).trim().slice(0, 120), ok: false };
    }
    return { v: "", ok: false };
  }

  // 图片：先试真实 <img> 的 src，再退回 og:image
  function firstImg(sels) {
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (!el) continue;
      var src = el.currentSrc || el.src || el.getAttribute("data-src") || el.getAttribute("data-ks-lazyload") || "";
      if (src && src.indexOf("data:") !== 0) return src;
    }
    var og = meta("og:image");
    return og || "";
  }

  // 价格清洗：从一段文字里提出第一个数字金额，避免抓到「价格」「到手价」等标签文字
  function cleanPrice(raw) {
    if (!raw) return "";
    var m = String(raw).replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return m ? "¥" + m[0] : "";
  }

  function priceFrom(sels) {
    for (var i = 0; i < sels.length; i++) {
      var p = cleanPrice(txt(sels[i]));
      if (p) return p;
    }
    return "";
  }

  // 收集多个匹配元素的文字（用于规格 / 服务承诺 / 评价标签这类成组信息）
  function txtAll(sel, limit) {
    var out = [], seen = {};
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length && out.length < (limit || 20); i++) {
      var el = list[i];
      var t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length > 40 || seen[t]) continue;
      if (isHidden(el)) continue;
      seen[t] = 1;
      out.push(t);
    }
    return out;
  }

  // 详情页正文文字：用于卖点分析。只取可见文本，去重截断，避免把整页塞进来。
  // 注意选择器里有 `*`，父元素的 textContent 天然包含子元素的文字，
  // 所以光靠精确去重不够，必须做「包含式去重」，否则同一句话会被数两遍。

  // 平台 UI / 促销 / 服务标签碎片：这些不是商品卖点。
  function isUiTrash(t) {
    if (!t) return true;
    var s = String(t).replace(/\s+/g, " ").trim();
    if (!s || s.length < 2) return true;
    // 常见交互按钮 / 视图切换 / 选择器
    if (/^(颜色分类|切换大图模式|切换小图模式|大图模式|小图模式|列表模式|网格模式|图文详情|商品详情|产品详情|宝贝详情|规格参数|产品参数|商品参数|包装清单|售后服务|买家必读|温馨提示|购买须知|注意事项|使用说明|查看详情|查看全部|查看大图|查看视频|播放视频|展开全部|收起全部|加入购物车|立即购买|立即抢购|马上抢|去购买|去看看|点击购买|马上买|领券|领取优惠券|更多|更少|返回顶部|回到顶部|顶部|首页|购物车|我的购物车|收藏|我的收藏|足迹|我的足迹|分享|收藏商品|关注店铺|进入店铺|店铺首页|客服|官方客服|商家客服|人工客服|联系客服|客服中心|消息中心|意见反馈|举报中心)$/.test(s)) return true;
    // 包含明显 UI 动作词
    if (/颜色分类|切换大图|切换小图|大图模式|小图模式|列表模式|网格模式/.test(s)) return true;
    if (/^(切换|选择|查看|展开|收起|点击|滑动|播放|暂停|加载|排序|筛选)/.test(s)) return true;
    // 连续出现 2 个及以上平台/促销/服务 token → 是促销/服务标签串
    var uiTokens = /(热销|爆款|大促|价保|退货宝|包邮|运费险|优惠券|领券|满减|折扣|特价|秒杀|限时购|券后|月销|已售|收藏|分享|客服|购物车|首页|店铺|进入店铺|关注店铺|七天无理由|退换货|正品保障|假一赔|极速退款|上门取件|售后无忧|质保|保修|全国联保)/g;
    if ((s.match(uiTokens) || []).length >= 2) return true;
    // 无意义符号串
    if (/^[\d\s·\-—_|，,、/（）()]+$/.test(s)) return true;
    return false;
  }

  // 通用噪声过滤：页脚导航 / 客服入口 / 法律声明 / 平台规则 / 通用按钮等，
  // 这些文本在任何位置都不该进入卖点分析。
  function isNoise(t) {
    if (!t) return true;
    var s = String(t).replace(/\s+/g, " ").trim();
    if (!s || s.length < 2) return true;
    if (isUiTrash(s)) return true;
    // 页脚、客服、规则、法律
    if (/帮助中心|官方客服|商家客服|人工客服|联系客服|客服中心|消息中心|意见反馈|举报中心|淘宝规则|天猫规则|消费者服务|隐私政策|用户协议|法律声明|免责声明|关于我们|联系我们|加入我们|人才招聘|诚征英才|营业执照|增值电信|经营许可证|备案号|ICP|©|阿里|淘宝|天猫|拼多多|抖音|京东|suning/.test(s)) return true;
    // 导航 / 全局按钮
    if (/^(首页|返回顶部|回到顶部|顶部|购物车|我的购物车|收藏|我的收藏|足迹|我的足迹|更多|全部商品|店铺首页|进入店铺|关注店铺|分享|收藏商品)$/.test(s)) return true;
    // 售后 / 保障 / 服务标签（不是卖点，是平台通用承诺）
    if (/七天无理由|运费险|退换货|正品保障|假一赔|极速退款|上门取件|售后无忧|质保|保修|全国联保/.test(s)) return true;
    // 购买行为 / 促销按钮
    if (/^\d+$|^[\d.]+(万|亿)?$|^[¥￥]|^\d+[人个件包]$|加入购物车|立即购买|立即抢购|马上抢|领券|优惠券|满减|下单|去购买|去看看|点击购买|马上买/.test(s)) return true;
    // 评价区标题（不是商品卖点）
    if (/^用户评价|累计评价|宝贝评价|商品评价|全部评价|追加评价|好评|中评|差评|评价标签|最新评价/.test(s)) return true;
    // 详情页通用标题
    if (/^(图文详情|商品详情|产品详情|宝贝详情|规格参数|产品参数|商品参数|包装清单|售后服务|买家必读|温馨提示|购买须知|注意事项|使用说明)$/.test(s)) return true;
    return false;
  }

  function detailText(sels) {
    var parts = [], total = 0;
    for (var s = 0; s < sels.length; s++) {
      var list = document.querySelectorAll(sels[s]);
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        if (isHidden(el)) continue;
        var t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!t || t.length < 2 || t.length > 300 || isNoise(t)) continue;

        var dup = false;
        for (var k = 0; k < parts.length; k++) {
          // 谁包含谁都算重复，只保留先到的那条
          if (parts[k].indexOf(t) > -1 || t.indexOf(parts[k]) > -1) { dup = true; break; }
        }
        if (dup) continue;

        parts.push(t);
        total += t.length;
        if (total > 4000 || parts.length >= 120) return parts;  // 双保险：字数 + 条数
      }
    }
    return parts;
  }

  // 详情页图片的 alt / title —— 电商详情页正文常常是图片，
  // 文字全在图里；alt 是唯一能白嫖到的文案线索。
  function imgAlts(limit) {
    var out = [], seen = {};
    var list = document.querySelectorAll("img[alt], img[title]");
    for (var i = 0; i < list.length && out.length < (limit || 15); i++) {
      var a = (list[i].getAttribute("alt") || list[i].getAttribute("title") || "").replace(/\s+/g, " ").trim();
      if (!a || a.length < 4 || a.length > 60 || seen[a] || isNoise(a)) continue;
      if (/^(图片|主图|详情|logo|banner|icon|产品展示|商品展示)$/i.test(a)) continue;
      seen[a] = 1;
      out.push(a);
    }
    return out;
  }

  // 优先从「图文详情」容器里抓图片 alt：详情图里的 alt 比普通页面 alt 更像卖点文案。
  function detailImgAlts(limit) {
    var out = [], seen = {};
    var containers = [];
    var marker = findDetailTextMarker();
    if (marker) {
      var panel = detailPanelOf(marker);
      if (panel) containers.push(panel);
    }
    ["#J_DivItemDesc", "#description", "#J_Detail", "[class*=\"desc-content\"]", "[class*=\"detail-content\"]", "[class*=\"goods-desc\"]", "[class*=\"goods-detail\"]"].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) containers.push(el);
    });
    for (var c = 0; c < containers.length && out.length < (limit || 20); c++) {
      var imgs = containers[c].querySelectorAll("img[alt], img[title]");
      for (var i = 0; i < imgs.length && out.length < (limit || 20); i++) {
        var a = (imgs[i].getAttribute("alt") || imgs[i].getAttribute("title") || "").replace(/\s+/g, " ").trim();
        if (!a || a.length < 4 || a.length > 60 || seen[a] || isNoise(a)) continue;
        if (/^(图片|主图|详情|logo|banner|icon|产品展示|商品展示)$/i.test(a)) continue;
        seen[a] = 1;
        out.push(a);
      }
    }
    return out;
  }

  function platformOf() {
    var h = location.hostname;
    // 拼多多网页版实际域名是 yangkeduo.com
    if (h.indexOf("yangkeduo") > -1 || h.indexOf("pinduoduo") > -1) return "拼多多";
    if (h.indexOf("tmall") > -1) return "天猫";
    if (h.indexOf("taobao") > -1) return "淘宝";
    if (h.indexOf("douyin") > -1) return "抖音";
    return "";
  }

  // 页面类型：URL 特征 + DOM 结构双重判定（参考电商采集器精简）。
  // 单看 URL 不稳（淘宝偶有详情页带 /item/ 但其实是活动页），加一层 DOM 兜底。
  // 返回 'detail' / 'list' / 'unknown'。
  function detectPageType(plat) {
    var u = location.href;
    var urlPatterns = {
      "拼多多": { list: [/\/search/, /\/list/, /\/mall\/search/], detail: [/goods\.html|goods_id=|\/goods\//] },
      "淘宝":   { list: [/\/search/, /\/list/, /\/category/, /s\.taobao/, /uland/, /coupon/], detail: [/item\.htm/, /\/item\//, /id=\d{6,}/] },
      "天猫":   { list: [/\/search/, /\/list/, /\/category/], detail: [/item\.htm/, /\/item\//, /id=\d{6,}/] },
      "抖音":   { list: [/\/search/, /\/mall\/search/], detail: [/\/product\//, /\/goods\//, /product_id=/] }
    };
    var p = urlPatterns[plat];
    if (p) {
      if (p.list.some(function (re) { return re.test(u); })) return "list";
      if (p.detail.some(function (re) { return re.test(u); })) return "detail";
    }
    if (plat === "淘宝" || plat === "天猫") {
      if (document.querySelector(".m-itemlist .item, [class*=\"Content--contentInner\"], .grid .item")) return "list";
      if (document.querySelector(".tb-detail-hd, #detail, [class*=\"Detail\"]") ||
          document.querySelector("[class*=\"Title--title\"], .tb-main-title")) return "detail";
      if (document.querySelectorAll("a[href*=\"item.htm\"]").length >= 5) return "list";
    } else if (plat === "拼多多") {
      if (document.querySelector("[class*=\"goods-list\"], [class*=\"search-list\"]")) return "list";
      if (document.querySelector("[class*=\"goods-detail\"], [class*=\"GoodsDetail\"]")) return "detail";
    } else if (plat === "抖音") {
      if (document.querySelector("[class*=\"search-result\"], [class*=\"product-list\"]")) return "list";
      if (document.querySelector("[class*=\"product-detail\"], [class*=\"ProductDetail\"]")) return "detail";
    }
    return "unknown";
  }
  function isDetailPage(plat) { return detectPageType(plat) === "detail"; }
  function isListPage(plat) { return detectPageType(plat) === "list"; }

  // ========== 移植自参考电商采集器（适配单文件 + 卖点引擎） ==========

  // JSON-LD 结构化数据：电商页常内联 <script type="application/ld+json"> 的 Product，
  // 这是最稳的来源（反爬友好、不随改版失效），优先于 DOM 选择器。
  function parseJsonLd() {
    var out = { title: "", price: "", brand: "", image: "", description: "" };
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < scripts.length; i++) {
      var data;
      try { data = JSON.parse(scripts[i].textContent); } catch (e) { continue; }
      var prod = null;
      if (data && data["@type"] === "Product") prod = data;
      else if (data && data["@graph"]) {
        for (var g = 0; g < data["@graph"].length; g++) {
          if (data["@graph"][g]["@type"] === "Product") { prod = data["@graph"][g]; break; }
        }
      }
      if (!prod) continue;
      if (!out.title && prod.name) out.title = prod.name;
      if (!out.description && prod.description) out.description = prod.description;
      if (!out.image) {
        var im = prod.image;
        if (typeof im === "string") out.image = im;
        else if (Array.isArray(im) && im.length) out.image = (typeof im[0] === "string") ? im[0] : im[0].url;
        else if (im && im.url) out.image = im.url;
      }
      if (!out.brand) {
        var b = prod.brand;
        out.brand = (typeof b === "string") ? b : (b && b.name ? b.name : "");
      }
      if (!out.price && prod.offers) {
        var of = Array.isArray(prod.offers) ? prod.offers[0] : prod.offers;
        var pr = of && (of.price || of.lowPrice);
        if (pr) out.price = "¥" + String(pr).replace(/[^\d.]/g, "");
      }
    }
    return out;
  }

  // 品牌清洗：去掉店铺评分/发货时效/客服满意度等噪声
  function cleanBrand(b) {
    if (!b) return "";
    return String(b)
      .replace(/[\d.]+VIP[^%]*%?/g, "")
      .replace(/好评率\d+%/g, "")
      .replace(/平均\d+小时[发退][货款]/g, "")
      .replace(/次日达超\d+%同行/g, "")
      .replace(/客服[满平][意均][度分].*$/g, "")
      .replace(/旺旺在线/g, "")
      .replace(/\d+年老店/g, "")
      // 去掉店名后缀黏着的店铺评分（如「中国黄金严选专卖店4.8」→「中国黄金严选专卖店」）
      .replace(/(旗舰店|专卖店|店|铺)[\s·•\-]*(\d{1,2}(?:\.\d{1,2})?)$/, "$1")
      .replace(/\s+/g, "")
      .trim();
  }

  // 标题前缀品牌：如「【蕉下】防晒衣」「[XX] 茶」
  function extractBrandFromTitle(title) {
    if (!title) return "";
    var m = title.match(/^【(.+?)】/);
    if (m) return m[1].trim();
    m = title.match(/^\[(.+?)\]/);
    if (m) return m[1].trim();
    m = title.match(/^([一-龥]{2,6}(?:[一-龥\w·]){0,4})(?:\s|·|\||[ 】\]])/);
    if (m && m[1].length <= 10) return m[1].trim();
    return "";
  }

  // 品牌提取 4 层：meta → 平台策略 → 标题前缀 → 店铺名去后缀
  function extractBrand(plat, currentName) {
    var metaBrand = meta("product:brand") || meta("brand");
    if (metaBrand) return cleanBrand(metaBrand);
    var b = "";
    if (plat === "淘宝" || plat === "天猫") {
      var attrs = document.querySelectorAll(".J_AttrUL li, [class*=\"attributes\"] li, [class*=\"attr\"] li");
      for (var i = 0; i < attrs.length; i++) {
        var m = (attrs[i].textContent || "").trim().match(/^品牌[：:\s]+(.+)/);
        if (m) { b = m[1].split(/[；;]/)[0].trim(); break; }
      }
    } else if (plat === "拼多多") {
      var bel = document.querySelector("[class*=\"brand\"], [class*=\"Brand\"], [class*=\"mall-name\"], [class*=\"mallName\"], [class*=\"shopName\"]");
      if (bel) b = bel.textContent.trim();
    }
    if (!b) b = cleanBrand(txt("[class*=\"ShopName\"]") || txt("[class*=\"mall-name\"]") || txt("[class*=\"shop-name\"]") || txt("[class*=\"shopName\"]") || "");
    if (!b && currentName) b = extractBrandFromTitle(currentName);
    return cleanBrand(b);
  }

  // 品类：面包屑导航（最常见），否则 meta
  function extractCategory() {
    var sels = [".mod-crumb a", ".breadcrumb a", "[class*=\"breadCrumb\"] a",
      "[class*=\"breadcrumb\"] a", "#J_breadcrumb a", ".crumb a",
      "[class*=\"Crumb\"] a", "[class*=\"crumbs\"] a", "[data-spm*=\"crumb\"]"];
    for (var i = 0; i < sels.length; i++) {
      var items = document.querySelectorAll(sels[i]);
      if (items.length) {
        return Array.prototype.map.call(items, function (el) {
          return (el.textContent || "").trim();
        }).filter(function (t) { return t && t !== "首页"; }).join(" > ");
      }
    }
    var mc = meta("product:category") || meta("category");
    return mc ? mc.trim() : "";
  }

  // 评价/评分
  function extractReviews(plat) {
    var sel;
    if (plat === "淘宝" || plat === "天猫") sel = "[class*=\"rating\"], [class*=\"rate\"], [class*=\"review-count\"]";
    else if (plat === "拼多多" || plat === "抖音") sel = "[class*=\"review\"], [class*=\"comment\"], [class*=\"evaluate\"]";
    if (sel) {
      // 遍历所有命中，挑第一个真正像评分/评价的（必含数字，且不是账号/导航噪声）
      var els = document.querySelectorAll(sel);
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || "").replace(/\s+/g, " ").trim();
        if (t && /\d/.test(t) &&
            !/账号|退出|登录|我的淘宝|我的天猫|购物车|收藏|帮助中心|官方客服/.test(t)) {
          return t.slice(0, 60);
        }
      }
    }
    return "";
  }

  // 链接标准化：提取 item id，去掉追踪参数
  function cleanProductUrl(url) {
    if (!url) return "";
    var tb = url.match(/[?&]id=(\d+)/);
    if (tb) {
      var host = url.indexOf("tmall") > -1 ? "detail.tmall.com" : "item.taobao.com";
      return "https://" + host + "/item.htm?id=" + tb[1];
    }
    var jd = url.match(/item\.jd\.com\/(\d+)\.html/);
    if (jd) return "https://item.jd.com/" + jd[1] + ".html";
    var al = url.match(/offerdetail\/(\d+\.html)/);
    if (al) return "https://detail.1688.com/" + al[1];
    return url.split("?")[0] || url;
  }

  // ---------- 详情图抓取（重点能力：卖点图 → 喂卖点分析 + 预览展示） ----------
  // 双重信号：DOM 文本标记("图文详情")定位容器 + 尺寸过滤(≥400px) 筛掉装饰/推荐位小图
  function findDetailTextMarker() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    var keywords = ["图文详情", "产品详情", "商品详情", "产品描述", "商品描述", "宝贝详情", "详情"];
    var candidates = [];
    while (walker.nextNode()) {
      var text = (walker.currentNode.textContent || "").trim();
      for (var i = 0; i < keywords.length; i++) {
        if (text === keywords[i] || (keywords[i].length >= 3 && text.indexOf(keywords[i]) === 0)) {
          candidates.push({ el: walker.currentNode.parentElement, kw: keywords[i] });
          break;
        }
      }
    }
    candidates.sort(function (a, b) { return b.kw.length - a.kw.length; });
    return candidates.length ? candidates[0].el : null;
  }
  function detailPanelOf(markerEl) {
    var cur = markerEl, i;
    for (i = 0; i < 5; i++) {
      if (!cur || cur === document.body) break;
      var pid = cur.getAttribute && cur.getAttribute("aria-controls");
      if (pid) {
        var panel = document.getElementById(pid);
        if (panel && panel.querySelectorAll("img").length >= 3) return panel;
      }
      cur = cur.parentElement;
    }
    cur = markerEl;
    for (i = 0; i < 5; i++) {
      if (!cur || cur === document.body) break;
      var parent = cur.parentElement;
      if (parent) {
        var kids = parent.children;
        for (var k = 0; k < kids.length; k++) {
          if (kids[k] === cur) continue;
          var id2 = (kids[k].id || "").toLowerCase();
          if (/desc|detail|description/.test(id2) && kids[k].querySelectorAll("img").length >= 3) return kids[k];
        }
      }
      cur = parent;
    }
    cur = markerEl;
    for (i = 0; i < 8; i++) {
      if (!cur || cur === document.body) break;
      if (cur.querySelectorAll("img").length >= 5) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  function resolveImgUrl(img) {
    var src = img.getAttribute("data-src") || img.getAttribute("data-ks-lazyload") ||
              img.getAttribute("data-lazyload") || img.src;
    if (!src || src.indexOf("data:") === 0) return null;
    if (/icon|logo|avatar|favicon|pixel/i.test(src)) return null;
    if (src.indexOf("//") === 0) src = "https:" + src;
    if (!/\.(jpe?g|png|webp|avif|gif)([?#]|$)/i.test(src)) return null; // 过滤截断占位URL
    return src;
  }
  function isDetailSize(url, img) {
    if (!url) return false;
    var sizeMatch = url.match(/[_-](\d{2,4})[xX_-](\d{2,4})/);
    if (sizeMatch) {
      var w = parseInt(sizeMatch[1], 10), h = parseInt(sizeMatch[2], 10);
      if (w > 0 && h > 0 && (w < 400 || h < 400)) return false;
    }
    var w2 = parseInt(img.getAttribute("width") || img.width || 0, 10);
    var h2 = parseInt(img.getAttribute("height") || img.height || 0, 10);
    if (w2 > 0 && h2 > 0 && (w2 < 400 || h2 < 400)) return false;
    if (img.naturalWidth > 0 && img.naturalHeight > 0 && (img.naturalWidth < 400 || img.naturalHeight < 400)) return false;
    return true;
  }
  // 返回 { imgs:[...最多30], alts:[...] }
  function extractDetailImages() {
    var urls = [], seen = {}, alts = [];
    function grab(container) {
      var imgs = container.querySelectorAll("img"), cnt = 0;
      for (var i = 0; i < imgs.length; i++) {
        var url = resolveImgUrl(imgs[i]);
        if (!url || !isDetailSize(url, imgs[i])) continue;
        if (seen[url]) continue;
        seen[url] = 1; urls.push(url); cnt++;
        var a = (imgs[i].getAttribute("alt") || imgs[i].getAttribute("title") || "").replace(/\s+/g, " ").trim();
        if (a && a.length >= 4 && a.length <= 60 && !isNoise(a)) alts.push(a);
      }
      return cnt;
    }
    var marker = findDetailTextMarker();
    if (marker) {
      var panel = detailPanelOf(marker);
      if (panel && grab(panel) >= 3) return { imgs: urls, alts: alts };
    }
    var known = ["#J_DivItemDesc", "#description", "#J_Detail"];
    for (var i = 0; i < known.length; i++) {
      var el = document.querySelector(known[i]);
      if (el && grab(el) >= 3) return { imgs: urls, alts: alts };
    }
    var imgextra = document.querySelectorAll('img[src*="imgextra"], img[data-src*="imgextra"]');
    for (var j = 0; j < imgextra.length; j++) {
      var u = resolveImgUrl(imgextra[j]);
      if (u && !seen[u]) { seen[u] = 1; urls.push(u); }
    }
    if (urls.length >= 3) return { imgs: urls, alts: alts };
    var fuzzy = ["[class*=\"desc-content\"]", "[class*=\"detail-content\"]", "[id*=\"desc\"]"];
    for (var f = 0; f < fuzzy.length; f++) {
      var els = document.querySelectorAll(fuzzy[f]);
      for (var e = 0; e < els.length; e++) {
        if (grab(els[e]) >= 3) return { imgs: urls, alts: alts };
      }
    }
    return { imgs: urls.slice(0, 30), alts: alts };
  }

  // 页面内 Toast（采集成功后闪一下，不打扰）
  function showToast(message, type) {
    type = type || "success";
    var bg = { success: "#10b981", error: "#ef4444", warning: "#f59e0b", info: "#3b82f6" }[type] || "#10b981";
    try {
      var toast = document.createElement("div");
      toast.textContent = message;
      toast.style.cssText = "position:fixed;top:20px;right:20px;z-index:2147483647;background:" + bg +
        ";color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;font-family:system-ui,sans-serif;" +
        "box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:360px;white-space:pre-wrap;opacity:0;transition:opacity .2s";
      document.body.appendChild(toast);
      if (window.requestAnimationFrame) window.requestAnimationFrame(function () { toast.style.opacity = "1"; });
      else toast.style.opacity = "1";
      setTimeout(function () { toast.style.opacity = "0"; setTimeout(function () { toast.remove(); }, 250); }, 2200);
    } catch (e) {}
  }

  // 诊断 dump：输出页面关键结构，定位选择器失效时让用户发我
  function dumpPageStructure() {
    var plat = platformOf();
    var ld = parseJsonLd();
    var info = {
      platform: plat, url: location.href, title: document.title,
      h1: (document.querySelector("h1") || {}).textContent || "",
      ogTitle: meta("og:title"), ogImage: meta("og:image"),
      pageType: detectPageType(plat),
      hasJsonLd: !!document.querySelector('script[type="application/ld+json"]'),
      detailContainers: document.querySelectorAll('[class*="detail"],[class*="Detail"]').length,
      priceEls: document.querySelectorAll('[class*="price"],[class*="Price"]').length,
      images: document.querySelectorAll("img[src]").length,
      detailImgs: extractDetailImages().imgs.length,
      category: extractCategory(),
      reviews: extractReviews(plat),
      jsonLdTitle: ld.title, jsonLdBrand: ld.brand, jsonLdPrice: ld.price
    };
    return info;
  }

  /* ---------- 卖点分析：规则词典 ---------- */
  // 词典来源：线上 data.js 18 天真实数据里 AI 反复产出的高频卖点/差评词，
  // 加上「三四线县城女性 + 避开爱善天使自研品类」这条选品红线。
  // 用户画像修正（2026-08-11）：核心决策者是女性，但采购范围覆盖「为家人购置」——
  // 七夕送礼、开学季学生用品、送父母长辈等都算，只是决策权在女性手里。
  // 因此品类词典需覆盖家庭多角色场景，而非只盯女性自用。

  // 红线：命中即不建议上站
  var RED_LINES = [
    { k: "棉品自研撞车", w: ["卫生巾", "棉柔巾", "护垫", "安睡裤", "卫生棉条", "纯棉巾"] },
    { k: "艾灸类自研撞车", w: ["艾灸", "艾草贴", "艾条", "暖宫贴", "艾绒"] },
    { k: "自有品牌撞车", w: ["俏妃", "爱善天使"] },
    { k: "医械/药准字合规风险", w: ["械字号", "药准字", "医疗器械", "国药准字", "消字号"] }
  ];

  // 卖点词典（good）—— 词根尽量拆短，命中更灵活。
  // 围绕用户画像：三四线县城女性决策 / 也为家人购置（七夕送礼·开学季·送长辈）
  // / 价格敏感 / 健康安全 / 48h 发货。
  var GOOD_RULES = [
    { k: "口感好", w: ["口感", "好喝", "香甜", "不苦", "香浓", "细腻", "顺滑", "无涩", "醇香", "回甘", "清香", "味道好", "鲜美", "酥脆", "软糯", "酸甜", "QQ弹", "嚼劲", "入口即化", "醇厚"] },
    { k: "性价比高", w: ["划算", "超值", "实惠", "买一送", "第二件", "囤货", "平价", "券后", "两件装", "三件装", "平替", "大促", "满减", "大牌平替", "白菜价", "源头工厂", "工厂直发", "批发价", "量大实惠", "加量不加价", "家庭实惠装"] },
    { k: "温和不刺激", w: ["温和", "不刺激", "敏感肌", "无香精", "无添加", "0添加", "植物萃取", "孕妇可用", "不寒", "暖胃", "养胃", "呵护肠胃", "无激素", "无荧光剂", "婴儿可用", "无泪配方", "弱酸性", "无酒精", "无色素", "无防腐剂"] },
    { k: "祛湿调理", w: ["祛湿", "去湿", "湿气", "薏米", "赤小豆", "红豆薏", "芡实", "茯苓", "薏苡仁", "红豆薏米", "养生茶", "调理", "滋补", "食补", "内调", "排湿"] },
    { k: "清爽不油腻", w: ["清爽", "不油腻", "透气", "干爽", "吸收快", "不闷", "不油", "凉感", "冰丝", "控油", "轻盈"] },
    { k: "暖宫补气血", w: ["气血", "暖宫", "红枣", "桂圆", "阿胶", "驱寒", "手脚冰凉", "补气血", "补血", "暖身", "暖腹", "温补"] },
    { k: "独立包装便携", w: ["独立包装", "便携", "随身", "小袋装", "一次性", "出差旅行", "小袋", "小包", "袋泡", "茶包", "三角包", "便携装", "可折叠", "可伸缩", "可调节", "迷你", "口袋", "单片装", "独立小袋", "随身包", "旅行装"] },
    { k: "分量足", w: ["大容量", "加量", "超大", "克装", "斤装", "量足", "大袋", "大罐", "超值装", "加量装", "家庭装", "整箱", "大号", "加大", "加深", "加宽", "大包装", "多片装", "够用一年", "囤一次用半年", "大卷", "加厚加大"] },
    { k: "操作省事", w: ["免煮", "免安装", "一键", "懒人", "省事", "开袋即食", "冲泡", "即冲即饮", "冲泡方便", "一泡", "泡着喝", "热水冲", "直接喝", "速溶", "免洗", "即食", "撕开即食", "免开火", "无需熬煮", "拆袋即用", "即冲"] },
    { k: "颜值送礼体面", w: ["礼盒", "送礼", "伴手礼", "高颜值", "ins风", "精致", "体面", "送长辈", "送妈妈", "送闺蜜", "高级感", "网红", "ins", "简约", "轻奢", "上档次", "拿得出手"] },
    { k: "保暖加厚", w: ["保暖", "加绒", "加厚", "发热", "锁温", "御寒", "绒", "蓄热", "升温", "防风", "抗寒", "双面绒", "羊羔绒", "摇粒绒"] },
    { k: "助眠安神", w: ["助眠", "睡眠", "安神", "解压", "放松", "好眠", "静音", "深睡", "舒缓", "减压"] },
    { k: "口碑销量高", w: ["回头客", "复购", "热销", "爆款", "万人推荐", "好评如潮", "爆卖", "热卖", "月销万", "已售万", "老顾客", "回购率高"] },
    { k: "材质亲肤安全", w: ["纯棉", "全棉", "棉质", "棉柔", "亚麻", "苎麻", "真丝", "丝绸", "莫代尔", "莱赛尔", "天丝", "竹纤维", "原木", "实木", "榉木", "橡木", "硅胶", "食品级", "婴儿级", "304", "316", "不锈钢", "陶瓷", "釉面", "玻璃", "PP", "PET", "TPE", "EVA", "乳胶", "记忆棉", "羽绒", "羊毛", "羊绒", "珊瑚绒", "法兰绒", "长绒棉", "婴儿棉", "A类", "原生木浆", "原生浆", "植物纤维", "环保材质", "可降解", "无荧光", "无漂白"] },
    { k: "结实耐用", w: ["加厚", "加宽", "加大", "加深", "加长", "加高", "加硬", "加固", "加粗", "耐用", "耐磨", "牢固", "稳固", "不易变形", "抗摔", "防爆", "承重力强", "厚实", "耐造", "结实", "抗用", "经久耐用", "不易坏", "高承重"] },
    { k: "功能实用", w: ["折叠", "可伸缩", "可调节", "多功能", "两用", "旋转", "可拆卸", "可水洗", "可机洗", "易清洗", "免打孔", "免安装", "可挂", "可叠", "可卷", "带盖", "密封", "防潮", "防霉", "防水", "防尘", "防滑", "防烫", "保温", "保冷", "速干", "吸水", "快干", "不沾", "不粘", "不褪色", "不掉色", "不掉毛", "不起球", "不勾丝", "不起褶", "防泼水", "防污", "防漏", "遮光", "防晒", "隔离", "沥水", "定量", "分格", "真空", "保鲜"] },
    { k: "舒适体验", w: ["亲肤", "柔软", "舒适", "透气", "吸汗", "清爽", "清凉", "静音", "轻便", "轻巧", "顺滑", "丝滑", "绵柔", "蓬松", "贴合", "不勒", "无异味", "抑菌", "抗菌", "除螨", "防螨", "可降解", "环保", "无味", "裸感", "云感", "零感", "不磨脚", "不卡裆"] },
    // 新增：围绕县城女性用户画像的品类
    { k: "健康轻食饮品", w: ["无糖", "低糖", "低脂", "低卡", "0卡", "0糖", "0脂", "高纤", "粗粮", "杂粮", "代餐", "饱腹", "益生菌", "酵素", "黑咖啡", "燕麦", "全麦", "豆浆", "芝麻糊", "藕粉", "谷物", "养发", "黑发", "红枣", "枸杞", "桂圆", "银耳", "燕窝", "胶原蛋白", "维生素", "补钙", "高钙", "核桃", "黑豆", "黑米", "藜麦", "荞麦", "玉米", "南瓜", "山药", "紫薯", "红薯"] },
    { k: "清洁家务", w: ["去污", "除油", "除垢", "去渍", "抑菌", "留香", "不伤手", "免手洗", "一次性", "加厚", "加大", "吸水", "不掉屑", "强力去污", "去油污", "去水垢", "去茶垢", "管道疏通", "除霉", "清洁力强", "一擦即净", "免洗剂", "懒人抹布", "厨房湿巾", "拖地", "扫把", "拖把", "垃圾桶", "垃圾袋", "保鲜袋", "保鲜膜", "密封袋"] },
    { k: "母婴女性护理", w: ["瞬吸", "防漏", "透气", "绵柔", "亲肤", "零添加", "医护级", "产褥期", "待产", "婴儿", "宝宝", "儿童", "产妇", "经期", "夜用", "日用", "加长", "护翼", "哺乳", "辅食", "奶嘴", "奶瓶", "纸尿裤", "拉拉裤", "隔尿垫", "湿巾", "棉柔巾", "云柔巾", "护臀", "红屁屁", "痱子", "奶瓶清洗剂", "宝宝辅食", "围嘴", "口水巾", "月子", "产后"] },
    { k: "厨房日用", w: ["耐高温", "可微波", "可冷冻", "沥水", "控盐", "定量", "防潮", "保鲜", "真空", "分格", "带盖", "可叠放", "好清洗", "易清洗", "不粘", "省油", "磁吸", "挂壁", "免打孔", "削皮", "切丝", "切片", "绞肉", "打蛋", "和面", "漏勺", "汤勺", "锅铲", "砧板", "菜板", "保鲜盒", "调料盒", "油壶", "米桶", "面桶", "筷子", "勺子", "碗碟", "盘子", "保温杯"] },
    { k: "48h发货/现货", w: ["现货", "48小时", "48h", "24h", "24小时", "速发", "当天发", "闪电发", "急发", "极速发货", "马上发", "次日达", "今日发", "拍下即发"] },
    // 县城女性极吃：本命年祈福 / 转运护身 / 银饰材质 / 送礼场景
    { k: "本命年祈福转运", w: ["本命年", "太岁", "化太岁", "生肖", "属相", "属马", "属牛", "属虎", "属兔", "属龙", "属蛇", "属羊", "属猴", "属鸡", "属狗", "属猪", "转运", "祈福", "护身", "开光", "寺庙", "福气", "平安", "辟邪", "招财", "旺运", "吉祥", "好运", "太岁符", "犯太岁", "守平安", "保平安", "平安符", "红绳", "手绳", "转运珠", "幸运绳", "祈福绳"] },
    { k: "银饰天然材质", w: ["纯银", "925银", "s925", "足银", "银饰", "银手链", "银项链", "朱砂", "玛瑙", "天然石", "真材实料", "原石", "和田玉", "玉石", "水晶", "黑曜石", "檀木", "桃木", "菩提", "手作", "手工编织", "匠心", "非遗", "古法金", "镀金", "黄金", "真金", "S925"] },
    { k: "送礼体面实用", w: ["新年礼物", "生日礼物", "圣诞礼物", "情人节礼物", "送男友", "送女友", "送老公", "送老婆", "送朋友", "送闺蜜", "送妈妈", "送长辈", "情侣", "男生", "女生", "闺蜜", "礼盒装", "可调节", "不掉色", "不过敏", "原创设计", "轻奢", "小众", "ins风", "国潮", "高级感", "拿得出手"] },
    // 用户画像修正：女性决策但也为家人购置 —— 七夕/开学/送长辈 都是高频场景
    { k: "七夕情侣送礼", w: ["七夕", "七夕礼物", "情人节", "情人节礼物", "表白", "告白", "约会", "示爱", "浪漫", "惊喜", "心动", "脱单", "恋爱", "纪念日", "情侣礼物", "送对象", "送男友", "送女友", "送老公", "送老婆", "告白礼物", "浪漫礼物", "对象的礼物"] },
    { k: "开学季学生用品", w: ["开学", "返校", "入学", "开学季", "开学必备", "开学礼", "学生", "学生党", "小学生", "初中生", "高中生", "大学生", "文具", "书包", "笔袋", "笔记本", "错题本", "草稿本", "护眼台灯", "台灯", "宿舍", "军训", "开学礼物", "开学大礼包", "文具套装", "开学装备"] },
    { k: "孝心送长辈父母", w: ["送爸爸", "送妈妈", "送父母", "送长辈", "孝心", "爸生日", "妈生日", "中老年", "父母礼", "重阳", "父亲节", "母亲节", "爷爷奶奶", "长辈礼", "寿礼", "祝寿"] }
  ];

  // 风险词典（bad）
  var BAD_RULES = [
    { k: "效果慢", w: ["需坚持", "长期食用", "循序渐进", "一个周期", "因人而异", "持续使用", "坚持喝", "内调", "慢慢", "长期饮用", "调理身体", "效果因人", "周期"] },
    { k: "偏甜", w: ["偏甜", "加糖", "蔗糖", "含糖", "白砂糖"] },
    { k: "有中药味", w: ["中药味", "药味", "气味重", "异味", "味道大"] },
    { k: "发货偏慢", w: ["预售", "定制", "7天内发货", "15天", "工作日发货", "现做现发", "15日内", "30天", "排单"] },
    { k: "易买错规格", w: ["色差", "尺码", "拍前咨询", "备注", "以实物为准", "手工测量", "误差"] },
    { k: "保质期偏短", w: ["临期", "保质期短", "开封后尽快", "3个月内", "尽快食用"] },
    { k: "不支持退换", w: ["不支持退换", "拆封不退", "定制不退", "不退不换", "不支持7天"] }
  ];

  // 县城女性场景词：命中说明人群匹配度高
  var SCENE_RULES = [
    { k: "家庭囤货", w: ["家庭装", "囤货", "全家", "实惠装", "整箱"] },
    { k: "带娃场景", w: ["宝宝", "儿童", "婴儿", "母婴", "学生"] },
    { k: "厨房日用", w: ["厨房", "餐厅", "收纳", "清洁", "家务"] },
    { k: "自用养生", w: ["养生", "调理", "滋补", "食补", "泡脚"] },
    { k: "熟人送礼", w: ["送长辈", "送妈妈", "送闺蜜", "过节", "年货"] },
    { k: "节日送礼", w: ["七夕", "情人节", "生日", "过节", "年货", "圣诞", "告白", "纪念日", "送男友", "送女友", "送老公", "送老婆"] },
    { k: "开学季", w: ["开学", "返校", "入学", "学生", "书包", "文具", "台灯", "宿舍", "军训"] },
    { k: "送长辈父母", w: ["送爸爸", "送妈妈", "送父母", "送长辈", "孝心", "重阳", "父亲节", "母亲节"] }
  ];

  // 商品名本身就是强信号：标题含品类关键词时，即使详情文字少也能给出卖点
  function goodFromName(name) {
    var n = String(name || "");
    var g = [];
    if (/薏米|赤小豆|红豆薏|芡实|茯苓|薏苡仁|红豆薏米|祛湿|去湿|湿气|养生茶|调理/.test(n)) g.push("祛湿调理");
    if (/茶包|袋泡茶|小袋|独立包装|便携|一次性|随身|小包|袋泡|三角包|便携装/.test(n)) g.push("独立包装便携");
    if (/防晒|冰丝|透气|薄款|清爽|不闷|不油|干爽|吸汗/.test(n)) g.push("清爽不油腻");
    if (/红枣|桂圆|阿胶|气血|暖宫|驱寒|手脚冰凉|补气血|补血/.test(n)) g.push("暖宫补气血");
    if (/免煮|冲泡|即冲|懒人|一键|开袋即食|泡着喝|热水冲|直接喝|速溶/.test(n)) g.push("操作省事");
    if (/口感|好喝|不苦|香甜|香浓|细腻|顺滑|醇香|回甘|清香|味道好/.test(n)) g.push("口感好");
    if (/划算|超值|实惠|买一|第二件|囤货|平价|券后|两件装|三件装|平替|大促|满减/.test(n)) g.push("性价比高");
    if (/温和|不刺激|敏感肌|无香精|无添加|0添加|植物萃取|孕妇可用|不寒|暖胃|养胃|呵护肠胃/.test(n)) g.push("温和不刺激");
    if (/礼盒|送礼|伴手礼|高颜值|体面|送长辈|送妈妈|送闺蜜/.test(n)) g.push("颜值送礼体面");
    if (/保暖|加绒|发热|锁温|御寒|蓄热|升温|防风|抗寒|双面绒|羊羔绒|摇粒绒/.test(n)) g.push("保暖加厚");
    if (/助眠|睡眠|安神|解压|放松|好眠/.test(n)) g.push("助眠安神");
    if (/回头客|复购|热销|爆款|万人推荐|好评如潮|爆卖|热卖/.test(n)) g.push("口碑销量高");
    if (/大容量|加量|超大|克装|斤装|量足|大袋|大罐|超值装|家庭装|整箱|加大|加深|加宽|大号/.test(n)) g.push("分量足");
    if (/纯棉|全棉|棉质|棉柔|亚麻|苎麻|真丝|莫代尔|莱赛尔|天丝|竹纤维|原木|实木|硅胶|食品级|婴儿级|304|316|不锈钢|陶瓷|玻璃|PP|PET|乳胶|记忆棉|羽绒|羊毛|羊绒|珊瑚绒|法兰绒|长绒棉|A类|原生木浆|原生浆|植物纤维|环保材质|可降解|无荧光|无漂白/.test(n)) g.push("材质亲肤安全");
    if (/加厚|加宽|加大|加深|加长|加高|加硬|加固|加粗|耐用|耐磨|牢固|稳固|不易变形|抗摔|防爆|承重力强|厚实|结实|抗用|经久耐用|不易坏|高承重/.test(n)) g.push("结实耐用");
    if (/折叠|可伸缩|可调节|多功能|两用|可拆卸|可水洗|可机洗|易清洗|免打孔|可挂|可叠|可卷|带盖|密封|防潮|防霉|防水|防尘|防滑|防烫|保温|保冷|速干|吸水|不沾|不粘|不褪色|不掉色|不掉毛|不起球|不勾丝|不起褶|防漏|遮光|防晒|隔离|沥水|定量|分格|真空|保鲜/.test(n)) g.push("功能实用");
    if (/亲肤|柔软|舒适|透气|吸汗|清凉|静音|轻便|轻巧|顺滑|丝滑|绵柔|蓬松|贴合|不勒|无异味|抑菌|抗菌|除螨|防螨|可降解|环保|无味|裸感|云感|零感|不磨脚|不卡裆/.test(n)) g.push("舒适体验");
    // 用户画像新品类：从标题直接识别
    if (/无糖|低糖|低脂|低卡|0卡|0糖|0脂|高纤|粗粮|杂粮|代餐|饱腹|益生菌|酵素|黑咖啡|燕麦|全麦|豆浆|芝麻糊|藕粉|谷物|养发|黑发|红枣|枸杞|桂圆|银耳|燕窝|胶原蛋白|维生素|补钙|高钙|核桃|黑豆|黑米|藜麦|荞麦|玉米|南瓜|山药|紫薯|红薯/.test(n)) g.push("健康轻食饮品");
    if (/去污|除油|除垢|去渍|抑菌.{0,2}留香|不伤手|免手洗|一次性.{0,2}抹布|厨房湿巾|管道疏通|除霉|清洁力强|一擦即净|懒人抹布|拖地|扫把|拖把|垃圾桶|垃圾袋|保鲜袋|保鲜膜|密封袋/.test(n)) g.push("清洁家务");
    if (/瞬吸|防漏|透气.{0,2}绵柔|医护级|产褥期|待产|婴儿|宝宝|儿童|产妇|经期|夜用|日用|加长|护翼|哺乳|辅食|奶嘴|奶瓶|纸尿裤|拉拉裤|隔尿垫|湿巾|棉柔巾|云柔巾|护臀|红屁屁|痱子|月子|产后/.test(n)) g.push("母婴女性护理");
    if (/耐高温|可微波|可冷冻|沥水|控盐|定量|防潮|保鲜|真空|分格|带盖|可叠放|不粘|省油|磁吸|挂壁|免打孔.{0,2}厨房|削皮|切丝|切片|绞肉|打蛋|和面|漏勺|汤勺|锅铲|砧板|菜板|保鲜盒|调料盒|油壶|米桶|面桶|筷子|勺子|碗碟|盘子|保温杯/.test(n)) g.push("厨房日用");
    if (/现货|48小时|48h|24h|24小时|速发|当天发|闪电发|急发|极速发货|马上发|次日达|今日发|拍下即发/.test(n)) g.push("48h发货/现货");
    // 县城女性极吃：本命年祈福 / 转运护身 / 银饰材质 / 送礼场景
    if (/本命年|太岁|化太岁|生肖|属相|转运|祈福|护身|开光|寺庙|平安|辟邪|招财|旺运|吉祥|好运|太岁符|犯太岁|红绳|手绳|转运珠|幸运绳|祈福绳/.test(n)) g.push("本命年祈福转运");
    if (/纯银|925银|s925|S925|足银|银饰|银手链|银项链|朱砂|玛瑙|天然石|真材实料|原石|和田玉|玉石|水晶|黑曜石|檀木|桃木|菩提|手作|手工编织|匠心|非遗|古法金|镀金|黄金|真金/.test(n)) g.push("银饰天然材质");
    if (/新年礼物|生日礼物|圣诞礼物|情人节礼物|送男友|送女友|送老公|送老婆|送朋友|送闺蜜|送妈妈|送长辈|情侣|男生|女生|礼盒装|可调节|不掉色|不过敏|原创设计|轻奢|小众|ins风|国潮|高级感|拿得出手/.test(n)) g.push("送礼体面实用");
    // 用户画像修正：女性决策但也为家人购置
    if (/七夕|七夕礼物|情人节|表白|告白|约会|示爱|浪漫|惊喜|心动|脱单|恋爱|纪念日|情侣礼物|送对象|送男友|送女友|送老公|送老婆|告白礼物|浪漫礼物|对象的礼物/.test(n)) g.push("七夕情侣送礼");
    if (/开学|返校|入学|开学季|开学必备|开学礼|学生|学生党|小学生|初中生|高中生|大学生|文具|书包|笔袋|笔记本|错题本|草稿本|护眼台灯|台灯|宿舍|军训|开学礼物|文具套装|开学装备/.test(n)) g.push("开学季学生用品");
    if (/送爸爸|送妈妈|送父母|送长辈|孝心|爸生日|妈生日|中老年|父母礼|重阳|父亲节|母亲节|爷爷奶奶|长辈礼|寿礼|祝寿/.test(n)) g.push("孝心送长辈父母");
    return unique(g);
  }

  function unique(arr) {
    var out = [], seen = {};
    for (var i = 0; i < arr.length; i++) { if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); } }
    return out;
  }

  // 否定语境识别：详情页最爱写「无添加蔗糖」「0香精」「不含防腐剂」，
  // 直接 indexOf 会把「蔗糖」读成风险点、把商品冤枉成「偏甜」。
  // 做法：只看命中词前面同一个小短句里的字（遇标点即断），出现否定字就不算命中。
  var NEG_CHARS = "无不零免未非0";
  function hasHit(corpus, w) {
    var idx = corpus.indexOf(w);
    while (idx > -1) {
      var win = corpus.slice(Math.max(0, idx - 4), idx);
      var near = win.split(/[，。；、！？,;.!?\s]/).pop(); // 只留最近一个短句片段
      var neg = false;
      for (var i = 0; i < near.length; i++) {
        if (NEG_CHARS.indexOf(near.charAt(i)) > -1) { neg = true; break; }
      }
      if (!neg) return true;       // 有一次是肯定语境就算命中
      idx = corpus.indexOf(w, idx + 1);
    }
    return false;
  }

  function hitRules(corpus, rules, max) {
    var out = [];
    for (var i = 0; i < rules.length && out.length < (max || 99); i++) {
      var r = rules[i];
      for (var j = 0; j < r.w.length; j++) {
        if (hasHit(corpus, r.w[j])) { out.push(r.k); break; }
      }
    }
    return out;
  }

  function priceNum(s) {
    var m = String(s || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }

  // 「2000+人付款」「月销5万+」都要能读成数字
  function salesNum(s) {
    var t = String(s || "").replace(/\s/g, "");
    var m = t.match(/(\d+(?:\.\d+)?)\s*万/);
    if (m) return Math.round(parseFloat(m[1]) * 10000);
    m = t.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
    return m ? Math.round(parseFloat(m[1])) : NaN;
  }

  /* ---------- 卖点分析：主函数 ---------- */
  // 价格带基准取自线上 18 天真实数据：p25=15.9 / 中位数=25 / p75=39.9
  function analyze(p, parts) {
    var corpus = [p.name, p.brand, p.shipping, p.salesText, p.spec, p.reviews, p.category]
      .concat(parts || []).join(" ");

    var red = hitRules(corpus, RED_LINES, 3);
    // 标题先给一波卖点，再拿详情文字补到 5 个；避免详情抓空时完全没卖点
    var titleGood = goodFromName(p.name);
    var corpusGood = hitRules(corpus, GOOD_RULES, 5);
    var good = unique(titleGood.concat(corpusGood)).slice(0, 5);
    var bad = hitRules(corpus, BAD_RULES, 4);
    var scene = hitRules(corpus, SCENE_RULES, 2);

    var pr = priceNum(p.price);
    var sn = salesNum(p.salesText);

    /* --- 爆点理由 --- */
    var hot = [];
    if (!isNaN(sn) && sn >= 10000) hot.push("销量口径 " + p.salesText + "，属平台跑量款");
    else if (!isNaN(sn) && sn >= 1000) hot.push("销量口径 " + p.salesText + "，有稳定出货");
    if (!isNaN(pr)) {
      if (pr <= 19.9) hot.push("¥" + pr + " 低价带，几乎无决策成本");
      else if (pr <= 39.9) hot.push("¥" + pr + " 主流价格带，易冲动下单");
    }
    // 没读到详情文案时，卖点其实是从标题猜的，措辞要如实说，别冒充读过详情
    if (good.length) hot.push((parts && parts.length ? "详情主打" : "标题主打") + good.slice(0, 3).join("、"));
    if (!hot.length) {
      // 一条卖点都没命中时，退回详情页里最像广告语的一句
      var slogan = pickSlogan(parts);
      if (slogan) hot.push("详情页主打：" + slogan);
    }

    /* --- 匹配理由（县城女性决策 · 也为家人购置） --- */
    var match = [];
    if (red.length) {
      match.push("⚠ 触碰红线（" + red.join("、") + "），不建议上站");
    } else {
      if (isNaN(pr)) {
        match.push("价格未识别，需人工确认是否落在 40 元以内");
      } else if (pr <= 15.9) {
        match.push("¥" + pr + " 低于站内 p25（15.9），县城女性零压力下单");
      } else if (pr <= 25) {
        match.push("¥" + pr + " 贴近站内中位数（25），接受度最高的甜蜜区");
      } else if (pr <= 39.9) {
        match.push("¥" + pr + " 在站内 p75（39.9）以内，仍属舒适区");
      } else if (pr <= 80) {
        match.push("¥" + pr + " 高于站内 p75，需要更硬的卖点撑住");
      } else {
        match.push("¥" + pr + " 超出县城女性日常冲动带，建议只做专题引流");
      }
      if (scene.length) match.push("契合" + scene.join("、") + "场景");
      if (good.indexOf("性价比高") > -1) match.push("有促销组合，适合做日报头位");
    }

    /* --- 风险补充 --- */
    if (!isNaN(pr) && pr > 80 && bad.indexOf("价格偏高") === -1) bad.unshift("价格偏高");
    if (red.length) bad = red.concat(bad).slice(0, 5);
    if (!parts || !parts.length) bad.push("详情文案未抓到，卖点待人工补");

    return {
      hotReason: hot.join("；").slice(0, 120),
      matchReason: match.join("；").slice(0, 120),
      goodKeywords: good,
      badKeywords: bad.slice(0, 5),
      sellPoints: buildSellPoints(p, parts, good),
      redFlag: red.length > 0
    };
  }

  // 从详情文字里挑一句最像卖点广告语的（10~30 字、含动词/形容词感）
  // 从详情文案里挑一句最像卖点广告语的：
  // 必须含卖点感词根，且不是噪声/规格/售后/法律文本。
  function pickSlogan(parts) {
    if (!parts) return "";
    var vibe = /(强|大|厚|暖|嫩|润|透|便携|防滑|加宽|加厚|升级|新版|新品|热销|爆款|推荐|必备|亲肤|透气|吸汗|速干|大容量|高颜值|显瘦|显白|不沾|不褪色|不掉色|不掉毛|可机洗|易清洗|可折叠|超值|划算|买\d|第\d代|巨能|一物两?用|舒适|柔软|静音|防水|防尘|耐磨|耐用|轻便|收纳|整齐|防潮|防霉|抗菌|无异味|纯天然|无糖|低脂|低卡|高蛋白|高钙|滋补|养生|暖胃|养胃|祛湿|补气血|安神|助眠|遮光|防晒|隔离|保湿|补水|控油|温和|不刺激|敏感肌|无添加|0添加|食品级|纯棉|全棉|加绒|加长|加大|加深|304|316|硅胶|实木|原木|乳胶|记忆棉|羊绒|珊瑚绒|瞬吸|防漏|绵柔|医护级|产褥期|待产|婴儿|宝宝|儿童|产妇|经期|夜用|日用|辅食|奶瓶|纸尿裤|耐高温|可微波|可冷冻|沥水|控盐|定量|真空|分格|带盖|可叠放|不粘|省油|磁吸|挂壁|免打孔|去污|除油|除垢|去渍|抑菌|留香|不伤手|免手洗|不掉屑|强力去污|去油污|去水垢|去茶垢|管道疏通|除霉|0糖|0脂|0卡|高纤|粗粮|杂粮|代餐|饱腹|益生菌|酵素|燕麦|全麦|豆浆|芝麻糊|藕粉|核桃|黑豆|黑米|藜麦|荞麦|现货|48小时|48h|24h|速发|当天发|次日达|本命年|太岁|生肖|转运|祈福|护身|开光|红绳|手绳|纯银|925银|足银|朱砂|玛瑙|水晶|玉石|平安|招财|旺运|新年礼物|生日礼物|送男友|送女友|送妈妈|送长辈|情侣|礼盒装|原创设计|轻奢|小众|国潮|手工编织|可调节|不掉色|不过敏|七夕|情人节|开学|学生|书包|文具|台灯|宿舍|军训|送爸爸|送妈妈|送父母|孝心)/;
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i];
      if (t.length < 8 || t.length > 34 || isNoise(t)) continue;
      if (/^\d|元|包邮|规格|型号|产地|厂名|地址|电话|执行标准|保质期|生产日期|净含量|配料表|营养成分/.test(t)) continue;
      if (vibe.test(t)) return t;
    }
    return "";
  }

  // 把「关键词」落成「该商品的具体卖点」：
  // 1) 把命中的好词（如「分量足」）映射回它的原始触发词（大容量/加量…），
  //    再去详情文案里捞包含该原始词的真实短语（不是光秃秃一个词）；
  // 2) 再补详情页自带的广告短句 / 详情图 alt；3) 标题主打兜底；
  // 4) 实在没命中好词，也从详情图/详情文案里挑含卖点感词根的句子。
  // 最终去重成 ≤5 条可读的具体卖点。
  // 把「关键词」落成「该商品的具体卖点」。
  // 真实电商详情页文字大量在图片里，DOM 文本经常为空，所以必须有强兜底：
  // 1) 标题拆片段（真实标题文本，最强兜底）；2) 命中词根去标题/详情捞真实短语；
  // 3) 属性表（材质:纯棉 → 纯棉）；4) 详情图 alt / 详情 vibe 句；5) 标题整体兜底。
  // 标题关键词切片词表：专用于「连写无分隔符标题」切出真实卖点。
  // 这些词根本身就能独立成卖点（材质/祈福/送礼/属性），命中即直接作为一条卖点，
  // 避免连写标题（如「纯银十二生肖属马红绳手链2026本命年太岁手绳新年礼物男生护身符」）
  // 因无法按分隔符拆分而退回整段标题。
  var TITLE_SELL_WORDS = [
    // 材质
    "纯银", "925银", "S925", "s925", "足银", "银饰", "朱砂", "玛瑙", "水晶", "玉石", "天然石", "桃木", "檀木", "菩提", "古法金", "黄金", "真金", "原石",
    // 本命年 / 祈福 / 转运
    "本命年", "太岁", "生肖", "转运", "祈福", "护身", "开光", "平安", "招财", "旺运", "吉祥", "好运", "红绳", "手绳", "转运珠", "太岁符", "幸运绳", "祈福绳",
    // 送礼场景
    "新年礼物", "生日礼物", "圣诞礼物", "情人节礼物", "送男友", "送女友", "送老公", "送老婆", "送妈妈", "送长辈", "情侣", "礼盒装", "原创设计", "轻奢", "小众", "国潮", "高级感", "拿得出手",
    // 为家人购置场景（七夕 / 开学 / 送长辈）
    "七夕", "七夕礼物", "告白", "表白", "纪念日", "开学", "开学季", "学生", "书包", "文具", "台灯", "宿舍", "军训", "送爸爸", "送父母", "孝心",
    // 饰品属性
    "手工编织", "可调节", "不掉色", "不过敏"
  ];

  function buildSellPoints(p, parts, good) {
    var out = [], seen = {};
    function add(s) {
      s = (s || "").replace(/\s+/g, " ").trim();
      if (!s || s.length < 2 || s.length > 40 || isNoise(s)) return;
      // 纯品类名（无卖点感）不要单独当卖点
      if (/^(毛巾|洗脸巾|纸巾|收纳箱|杯子|水杯|茶|茶叶|零食|坚果|果干|糕|饼|糖|地垫|地毯|抱枕|靠垫|玩偶|玩具|窗帘|垃圾袋|保鲜袋|保鲜膜)$/.test(s)) return;
      if (seen[s]) return;
      seen[s] = 1; out.push(s);
    }
    var title = p.name || "";

    // 1) 标题拆片段：按分隔符切成短片段，片段即最真实的卖点文本（强兜底）
    var segs = title.split(/[\s·\-—_|，,、/（）()]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    segs.forEach(function (seg) {
      if (seg.length < 2 || seg.length > 16) return;
      if (isNoise(seg) || /^\d/.test(seg)) return;
      add(seg);
    });

    // 1b) 标题关键词切片：连写无分隔符标题（红绳手链类）也能切出真实卖点，
    //     命中 TITLE_SELL_WORDS 的词根即作为一条干净卖点（不再退回整段标题）。
    //     按词根在标题中的出现先后排序，使靠前的卖点（如「红绳」）优先进入前 5 条。
    var titleHits = [];
    TITLE_SELL_WORDS.forEach(function (w) {
      var idx = title ? title.indexOf(w) : -1;
      if (idx > -1) titleHits.push([idx, w]);
    });
    titleHits.sort(function (a, b) { return a[0] - b[0]; });
    // 去除被更长词根包含的短词（如「开学」被「开学季」包含），优先保留更具体的卖点
    var filteredHits = [];
    for (var fi = 0; fi < titleHits.length; fi++) {
      var contained = false;
      for (var fj = 0; fj < titleHits.length; fj++) {
        if (fi !== fj && titleHits[fj][1].indexOf(titleHits[fi][1]) > -1 && titleHits[fj][1].length > titleHits[fi][1].length) { contained = true; break; }
      }
      if (!contained) filteredHits.push(titleHits[fi]);
    }
    filteredHits.forEach(function (h) { add(h[1]); });

    // 2) 命中好词 → 原始触发词，去标题（优先）/ 详情文案捞包含它的真实短语
    var raw = [];
    GOOD_RULES.forEach(function (r) {
      if ((good || []).indexOf(r.k) > -1) raw = raw.concat(r.w);
    });
    raw.forEach(function (w) {
      if (title && title.indexOf(w) > -1) {
        var idx = title.indexOf(w);
        var start = Math.max(0, idx - 4), end = Math.min(title.length, idx + w.length + 8);
        add(title.slice(start, end).replace(/^[\s·\-—_|，,、/]+|[\s·\-—_|，,、/]+$/g, ""));
      }
      if (!parts) return;
      for (var i = 0; i < parts.length; i++) {
        var t = parts[i];
        if (isNoise(t)) continue;
        if (t.indexOf(w) > -1 && t.length > w.length + 1) { add(t); break; }
      }
    });

    // 3) 属性表卖点：spec 形如 "材质:纯棉 / 容量:大容量" → 提取属性值
    var spec = p.spec || "";
    spec.split(/\s*\/\s*/).forEach(function (pair) {
      var m = pair.match(/[:：]\s*(.{2,12})$/);
      if (m) add(m[1].trim());
    });

    // 4) 详情文案 / 详情图 alt 里含卖点感词根的句子
    if (parts) {
      var vibe = /(强|大|厚|暖|嫩|润|透|便携|防滑|加宽|加厚|升级|新版|新品|热销|爆款|推荐|必备|亲肤|透气|吸汗|速干|大容量|高颜值|显瘦|显白|不沾|不褪色|不掉色|不掉毛|可机洗|易清洗|可折叠|超值|划算|买\d|第\d代|巨能|一物两?用|舒适|柔软|静音|防水|防尘|耐磨|耐用|轻便|收纳|整齐|防潮|防霉|抗菌|无异味|纯天然|无糖|低脂|低卡|高蛋白|高钙|滋补|养生|暖胃|养胃|祛湿|补气血|安神|助眠|遮光|防晒|隔离|保湿|补水|控油|温和|不刺激|敏感肌|无添加|0添加|食品级|纯棉|全棉|加绒|加长|加大|加深|304|316|硅胶|实木|原木|乳胶|记忆棉|羊绒|珊瑚绒|瞬吸|防漏|绵柔|医护级|产褥期|待产|婴儿|宝宝|儿童|产妇|经期|夜用|日用|辅食|奶瓶|纸尿裤|耐高温|可微波|可冷冻|沥水|控盐|定量|真空|分格|带盖|可叠放|不粘|省油|磁吸|挂壁|免打孔|去污|除油|除垢|去渍|抑菌|留香|不伤手|免手洗|不掉屑|强力去污|去油污|去水垢|去茶垢|管道疏通|除霉|0糖|0脂|0卡|高纤|粗粮|杂粮|代餐|饱腹|益生菌|酵素|燕麦|全麦|豆浆|芝麻糊|藕粉|核桃|黑豆|黑米|藜麦|荞麦|现货|48小时|48h|24h|速发|当天发|次日达|本命年|太岁|生肖|转运|祈福|护身|开光|红绳|手绳|纯银|925银|足银|朱砂|玛瑙|水晶|玉石|平安|招财|旺运|新年礼物|生日礼物|送男友|送女友|送妈妈|送长辈|情侣|礼盒装|原创设计|轻奢|小众|国潮|手工编织|可调节|不掉色|不过敏|七夕|情人节|开学|学生|书包|文具|台灯|宿舍|军训|送爸爸|送妈妈|送父母|孝心)/;
      for (var j = 0; j < parts.length && out.length < 6; j++) {
        var s = parts[j];
        if (isNoise(s) || s.length < 6 || s.length > 34) continue;
        if (/^[¥￥]|^\d+$|^\d+[.\d]+(万|亿)?$/.test(s)) continue;
        if (vibe.test(s)) add(s);
      }
    }

    // 5) 实在没捞到，退回标题整体（至少给一条具体卖点，不再空）
    if (!out.length && title) add(title.slice(0, 40));

    return out.slice(0, 5);
  }

  // 整页兜底：当详情区选择器没命中时，从 body 抓可见短文本（过滤导航/按钮/评价噪音）
  function bodyText(limit) {
    var out = [], total = 0;
    var list = document.querySelectorAll("body p, body span, body div, body li");
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (isHidden(el)) continue;
      var t = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!t || t.length < 6 || t.length > 80 || isNoise(t)) continue;
      out.push(t);
      total += t.length;
      if (total > 2000 || out.length >= (limit || 50)) break;
    }
    return out;
  }

  /* ---------- 平台选择器 ---------- */
  var DETAIL_SELS = {
    "拼多多": [
      '[class*="goods-detail"] *', '[class*="goods-desc"] *',
      '[class*="detail-content"] *', '[class*="desc-content"] *',
      '[class*="detail"] p', '[class*="desc"] p', '[class*="intro"] p',
      '#goods-detail *', '.goods-detail *'
    ],
    "淘宝": ['#description *', '.tb-detail-hd *', '[class*="detail"] p', '[class*="desc"] p', '[class*="Service"] span', '[class*="goods-detail"] *'],
    "天猫": ['#description *', '[class*="detail"] p', '[class*="desc"] p', '[class*="Service"] span', '.tm-tableAttrs td'],
    "抖音": ['[class*="detail"] p', '[class*="desc"] *', '[class*="service"] span']
  };
  var SPEC_SELS = {
    "拼多多": '[class*="spec"] span,[class*="sku"] span,[class*="goods-spec"] span',
    "淘宝": '#J_AttrUL li,[class*="attr"] li,[class*="Spec"] span',
    "天猫": '.tm-tableAttrs td,#J_AttrUL li,[class*="attr"] li',
    "抖音": '[class*="spec"] span,[class*="sku"] span'
  };
  var TAG_SELS = '[class*="tag"],[class*="Tag"],[class*="label"],[class*="promise"],[class*="service"]';

  /* ---------- 抽取 ---------- */

  function extract() {
    var plat = platformOf();
    var detail = isDetailPage(plat);
    var pt = detectPageType(plat);
    var price = "", image = "", sales = "", shipping = "", brand = "", category = "", reviews = "";
    var parts = [], spec = "", detailImages = [];
    var nm = { v: "", ok: false };

    // 结构化数据优先（JSON-LD）
    var ld = parseJsonLd();

    try {
      if (plat === "拼多多") {
        nm = nameFrom([
          ld.title || meta("og:title"), txt("#goods-name"), txt(".goods-title"),
          txt('[class*="goods-name"]'), txt("h1"), cleanTitle(document.title)
        ]);
        price = priceFrom(['[class*="price"]', "#price", '[class*="Price"]']);
        image = firstImg(["#goods-img img", ".goods-img img", '[class*="goods"] img', "img"]);
        sales = txt('[class*="sales"]') || txt('[class*="sold"]');
        shipping = txt('[class*="ship"]') || txt('[class*="delivery"]');
      } else if (plat === "淘宝" || plat === "天猫") {
        // 老版 id → 新版编译 class → meta → h1 → document.title，JSON-LD 优先
        nm = nameFrom([
          ld.title || txt("#J_Title .tb-main-title"), txt(".tb-main-title"),
          txt('h1[class*="mainTitle"]'), txt('[class*="ItemTitle--mainTitle"]'),
          txt('[class*="mainTitle"]'), txt('[class*="ItemTitle"]'),
          meta("og:title"), txt("h1"), txt("#J_Title"),
          cleanTitle(document.title)
        ]);
        price = priceFrom([".tm-price", "#J_PromoPriceNum", ".tb-rmb-num",
                           '[class*="Price--priceText"]', '[class*="rmb"]', '[class*="price"]']);
        image = firstImg(["#J_ImgBooth", ".tb-main-pic img", '[class*="mainPic"] img',
                          '[class*="PicGallery"] img', "img"]);
        sales = txt(".tm-count") || txt('[class*="sale"]') || txt('[class*="Sold"]');
        shipping = txt('[class*="ship"]') || txt('[class*="delivery"]') || txt('[class*="logistics"]');
      } else if (plat === "抖音") {
        nm = nameFrom([
          ld.title || meta("og:title"), txt('[class*="title"]'), txt("h1"), cleanTitle(document.title)
        ]);
        price = priceFrom(['[class*="price"]', '[class*="Price"]']);
        image = firstImg(['[class*="goods"] img', '[class*="product"] img', "img"]);
        sales = txt('[class*="sale"]') || txt('[class*="sold"]');
      }

      // JSON-LD 兜底：DOM 没抓到的关键字段用结构化数据补
      if (!price && ld.price) price = ld.price;
      if (!image && ld.image) image = ld.image;

      // 品牌 / 品类 / 评价（多策略提取）
      brand = extractBrand(plat, nm.v);
      category = detail ? extractCategory() : "";
      reviews = detail ? extractReviews(plat) : "";

      // 详情页文案 + 详情图
      if (detail) {
        var di = extractDetailImages();
        detailImages = di.imgs;
        var specList = txtAll(SPEC_SELS[plat] || '[class*="spec"] span', 12);
        spec = specList.slice(0, 6).join(" / ");
        parts = detailText(DETAIL_SELS[plat] || ['[class*="detail"] p', '[class*="desc"] p']);
        // 如果详情区常规选择器没抓到，再用 body 兜底，避免详情文字全在图片里时一点卖点都没有
        if (!parts.length) parts = bodyText(40);
        // 卖点素材：详情正文 + 标签 + 规格 + 详情图 alt（优先） + 全页 alt 兜底
        var detailAlts = detailImgAlts(20);
        var pageAlts = imgAlts(12).filter(function (a) { return detailAlts.indexOf(a) === -1; });
        parts = parts.concat(txtAll(TAG_SELS, 12)).concat(specList).concat(detailAlts).concat(pageAlts).concat(di.alts);
        // 去重：详情图 alt 与全页 alt 常有重叠
        var seenParts = {}, uniq = [];
        for (var pi = 0; pi < parts.length; pi++) {
          var key = String(parts[pi]).replace(/\s+/g, " ").trim();
          if (!key || seenParts[key]) continue;
          seenParts[key] = 1;
          uniq.push(key);
        }
        parts = uniq;
      }
    } catch (e) { /* 忽略，留空 */ }

    var name = nm.v;
    if (!brand && ld.brand) brand = cleanBrand(ld.brand);

    var a = analyze({
      name: name, price: price, brand: brand,
      shipping: shipping, salesText: sales, spec: spec,
      reviews: reviews, category: category
    }, parts);

    return {
      product: {
        name: (name || "").slice(0, 120),
        platform: plat,
        price: price,
        brand: brand,
        shipping: shipping,
        image: image,
        link: cleanProductUrl(location.href),
        salesText: sales,
        spec: spec,
        category: category,
        reviews: reviews,
        detailImages: detailImages,
        hotReason: a.hotReason,
        matchReason: a.matchReason,
        goodKeywords: a.goodKeywords,
        badKeywords: a.badKeywords,
        sellPoints: a.sellPoints,
        source: "plugin",
        // 带上版本号：以后收到 JSON 一眼就知道用的是不是最新插件，不用靠猜字段
        pluginVersion: ver(),
        collectedAt: new Date().toISOString()
      },
      meta: {
        isDetailPage: detail,
        pageType: pt,
        nameOk: nm.ok,
        redFlag: a.redFlag,
        detailChars: parts.join("").length,
        imageCount: detailImages.length,
        detailSample: parts.slice(0, 8)
      }
    };
  }

  function ver() {
    try { return chrome.runtime.getManifest().version; } catch (e) { return "?"; }
  }

  // 防止重复注入时重复注册监听（popup 会用 scripting 兜底注入）
  if (window.__qfCollectorReady) return;
  window.__qfCollectorReady = true;

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg && msg.type === "ping") {
      sendResponse({ ready: true });
    } else if (msg && msg.type === "extract") {
      try { sendResponse(extract()); } catch (e) { sendResponse({ product: null }); }
    } else if (msg && msg.type === "dump") {
      try { sendResponse({ success: true, info: dumpPageStructure() }); } catch (e) { sendResponse({ success: false }); }
    } else if (msg && msg.type === "toast") {
      try { showToast(msg.message, msg.toastType || "info"); } catch (e) {}
    }
    return true;
  });
})();
