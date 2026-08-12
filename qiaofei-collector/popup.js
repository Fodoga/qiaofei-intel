/* popup.js —— 弹窗主逻辑（简约高级风） */
(function () {
  "use strict";

  var PLATFORMS = ["拼多多", "淘宝", "天猫", "抖音"];
  var els = {};
  var current = null; // 当前识别到的商品（可编辑）
  var currentMeta = null; // 本次抽取的附加信息（是否详情页 / 是否触红线 / 抓到多少字）
  var SETTINGS = null; // 全局设置（repo/path/token）

  function $(id) { return document.getElementById(id); }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function toast(msg, type) {
    var t = els.toast;
    t.textContent = msg;
    t.className = "toast show" + (type ? " " + type : "");
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.className = "toast"; }, 2200);
  }

  function showStage(which) {
    els.stateEmpty.hidden = which !== "empty";
    els.stateLoading.hidden = which !== "loading";
    els.stateReady.hidden = which !== "ready";
    els.actions.hidden = which !== "ready";
  }

  /* ---------- 设置 ---------- */
  function loadSettings(cb) {
    chrome.storage.local.get("settings", function (r) {
      var s = r.settings || { token: "", repo: "Fodoga/qiaofei-intel", path: "web/collected/raw" };
      els.inpToken.value = s.token || "";
      els.inpRepo.value = s.repo || "Fodoga/qiaofei-intel";
      els.inpPath.value = s.path || "web/collected/raw";
      SETTINGS = s;
      cb(s);
    });
  }
  function saveSettings() {
    var s = { token: els.inpToken.value.trim(), repo: els.inpRepo.value.trim(), path: els.inpPath.value.trim() };
    chrome.storage.local.set({ settings: s }, function () { toast("设置已保存", "ok"); });
  }

  /* ---------- 历史 / 今日计数 ---------- */
  function loadHistory(cb) {
    chrome.storage.local.get("history", function (r) { cb(r.history || []); });
  }
  function addHistory(item) {
    loadHistory(function (h) {
      h.unshift(item);
      h = h.slice(0, 200);
      chrome.storage.local.set({ history: h }, renderHistory);
    });
  }
  function delHistory(idx) {
    loadHistory(function (h) { h.splice(idx, 1); chrome.storage.local.set({ history: h }, renderHistory); });
  }
  function renderHistory() {
    loadHistory(function (h) {
      var list = els.historyList;
      list.innerHTML = "";
      var today = todayStr();
      var cnt = h.filter(function (x) { return (x.collectedAt || "").slice(0, 10) === today; }).length;
      els.todayCount.textContent = "今日已采 " + cnt + " 件";
      if (!h.length) { els.historyEmpty.hidden = false; return; }
      els.historyEmpty.hidden = true;
      h.forEach(function (x, i) {
        var li = document.createElement("li");
        li.innerHTML = '<span>' + esc(x.name) + ' · <em style="color:var(--gold);font-style:normal">' + esc(x.platform) + "</em></span>";
        var b = document.createElement("button");
        b.className = "h-del"; b.textContent = "删除";
        b.onclick = function () { delHistory(i); };
        li.appendChild(b);
        list.appendChild(li);
      });
    });
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- 本周专题 ---------- */
  function loadTheme() {
    var repo = (SETTINGS && SETTINGS.repo) || "Fodoga/qiaofei-intel";
    chrome.runtime.sendMessage({ type: "getTheme", repo: repo }, function (resp) {
      if (resp && resp.theme) els.themeChip.textContent = "本周专题 · " + resp.theme;
    });
  }

  /* ---------- 识别 ---------- */
  var SITE_RE = /pinduoduo\.com|yangkeduo\.com|taobao\.com|tmall\.com|douyin\.com/;

  function scan() {
    showStage("loading");
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !SITE_RE.test(tab.url || "")) { showStage("empty"); return; }

      function ask(retry) {
        chrome.tabs.sendMessage(tab.id, { type: "extract" }, function (resp) {
          if (chrome.runtime.lastError || !resp || !resp.product) {
            // 兜底：插件安装/更新前就打开的页面没有注入 content.js，这里动态补注入一次
            if (retry) {
              chrome.scripting.executeScript(
                { target: { tabId: tab.id }, files: ["content.js"] },
                function () {
                  if (chrome.runtime.lastError) { showStage("empty"); return; }
                  ask(false);
                }
              );
              return;
            }
            showStage("empty"); return;
          }
          current = resp.product;
          currentMeta = resp.meta || {};
          currentMeta.rawName = current.name;  // 记下原始值，用于判断用户是否改过
          renderPreview(current);
          showStage("ready");
        });
      }
      ask(true);
    });
  }

  function renderPreview(p) {
    var img = p.image || "";
    var m = currentMeta || {};
    var showMore = (m.nameOk === false || m.isDetailPage === false);

    // 顶部提醒：列表页 / 红线 / 详情文案没抓到
    var banners = "";
    if (m.isDetailPage === false) {
      banners += '<div class="note warn">当前像是<b>搜索/列表页</b>，抓到的多半是标签文字。请点进商品详情页再采一次。</div>';
    } else if (!m.detailChars) {
      banners += '<div class="note">没读到详情页文案（多半是图片详情），卖点需要你手动补一句。</div>';
    }
    if (m.nameOk === false && m.isDetailPage !== false) {
      banners += '<div class="note warn">商品名可能<b>没抓准</b>（页面结构变了）。请在「展开更多」里改成正确的。</div>';
    }
    if (m.redFlag) {
      banners += '<div class="note danger">该商品<b>触碰选品红线</b>（棉品/艾灸/自有品牌/医械字号），建议直接丢弃。</div>';
    }

    var html = banners +
      '<div class="pv-head">' +
        '<img class="pv-img" src="' + esc(img) + '" onerror="this.style.visibility=\'hidden\'" />' +
        '<div class="pv-meta">' +
          '<div class="pv-name">' + esc(p.name || "（未识别商品名）") + "</div>" +
          '<span class="tag-gold">' + esc(p.platform || "—") + "</span>" +
          (p.price ? '<span class="tag-gold">' + esc(p.price) + "</span>" : "") +
          (p.salesText ? '<div class="pv-row"><span>销量：' + esc(p.salesText) + " · 参考</span></div>" : "") +
        "</div>" +
      "</div>" +
      pvExtra(p) +
      '<div class="pv-analysis">' +
        '<div class="an-title">卖点分析' +
          (m.detailChars ? '<span class="muted sm">已读详情 ' + m.detailChars + " 字</span>" : "") +
        "</div>" +
        chips(p.goodKeywords, "good", "未识别到卖点词") +
        chips(p.badKeywords, "bad", "未识别到风险点") +
        (p.sellPoints && p.sellPoints.length ? sellPointsBlock(p.sellPoints)
          : '<div class="sp-empty muted sm">未提取到具体卖点，可在下方「具体卖点」里手动补一句</div>') +
      "</div>" +
      '<div class="pv-edit">' +
        fld("爆点理由", "hotReason", p.hotReason || "", true) +
        fld("匹配理由", "matchReason", p.matchReason || "", true) +
        fld("卖点词（逗号分隔）", "goodKeywords", arr2s(p.goodKeywords), true) +
        fld("风险词（逗号分隔）", "badKeywords", arr2s(p.badKeywords), true) +
        fldArea("具体卖点（每行一条）", "sellPoints", (p.sellPoints || []).join("\n"), true) +
        fld("规格", "spec", p.spec || "", true) +
      "</div>" +
      '<div class="pv-more' + (showMore ? " open" : "") + '" id="pvMore">' +
        '<div class="more-toggle" id="toggleMore">' + (showMore ? "收起更多" : "展开更多") + "</div>" +
        '<div class="more-fields">' +
          fld("商品名", "name", p.name || "", true) +
          '<div class="two-col">' + sel("平台", "platform", p.platform || "", PLATFORMS) + fld("价格", "price", p.price || "") + "</div>" +
          fld("品牌", "brand", p.brand || "", true) +
          fld("发货时效", "shipping", p.shipping || "", true) +
          fld("品类", "category", p.category || "", true) +
          fld("评价/评分", "reviews", p.reviews || "", true) +
          fld("商品链接", "link", p.link || "", true) +
        "</div>" +
      "</div>";
    els.preview.innerHTML = html;

    // 更多/收起
    var moreEl = $("pvMore");
    var toggleEl = $("toggleMore");
    if (toggleEl) {
      toggleEl.onclick = function () {
        var open = moreEl.classList.toggle("open");
        toggleEl.textContent = open ? "收起更多" : "展开更多";
      };
    }

    // 绑定编辑（数组字段按逗号拆回数组，保持上传格式不变）
    var ARR_KEYS = { goodKeywords: 1, badKeywords: 1 };
    Array.prototype.forEach.call(els.preview.querySelectorAll("input,select,textarea"), function (inp) {
      function sync() {
        var k = inp.dataset.k;
        if (k === "sellPoints") {
          current[k] = inp.value.split("\n").map(function (x) { return x.trim(); })
            .filter(function (x) { return x; });
        } else {
          current[k] = ARR_KEYS[k] ? s2arr(inp.value) : inp.value;
        }
      }
      inp.addEventListener("input", sync);
      inp.addEventListener("change", sync);
    });
  }
  function arr2s(a) { return Array.isArray(a) ? a.join("，") : (a || ""); }
  function s2arr(s) {
    return String(s || "").split(/[,，、]/).map(function (x) { return x.trim(); })
      .filter(function (x) { return !!x; });
  }
  function chips(a, kind, empty) {
    if (!Array.isArray(a) || !a.length) return '<div class="chips"><span class="muted sm">' + empty + "</span></div>";
    return '<div class="chips">' + a.map(function (x) {
      return '<span class="chip ' + kind + '">' + esc(x) + "</span>";
    }).join("") + "</div>";
  }
  // 具体卖点：把关键词落成该商品可读的卖点句，逐条列出
  function sellPointsBlock(list) {
    return '<div class="sp-block"><div class="sp-title">具体卖点</div>' +
      '<ul class="sp-list">' + list.map(function (x) {
        return "<li>" + esc(x) + "</li>";
      }).join("") + "</ul></div>";
  }
  function fld(label, k, v, full) {
    return '<label' + (full ? ' class="full"' : '') + '>' + label + '<input data-k="' + k + '" value="' + esc(v) + '" placeholder="可留空" /></label>';
  }
  function fldArea(label, k, v, full) {
    return '<label' + (full ? ' class="full"' : '') + '>' + label + '<textarea data-k="' + k + '" rows="4" placeholder="每行一条具体卖点，可留空">' + esc(v) + "</textarea></label>";
  }
  function sel(label, k, v, opts) {
    var o = opts.map(function (x) { return '<option' + (x === v ? " selected" : "") + ">" + x + "</option>"; }).join("");
    return '<label>' + label + '<select data-k="' + k + '">' + o + "</select></label>";
  }
  // 品类 / 评价 / 详情图：新版抓取增强后展示
  function pvExtra(p) {
    var rows = "";
    if (p.category) rows += '<span class="tag-soft">品类 · ' + esc(p.category) + "</span>";
    if (p.reviews) rows += '<span class="tag-soft">评价 · ' + esc(p.reviews) + "</span>";
    if (!rows) rows = '<span class="muted sm">品类 / 评价未抓到（页面无面包屑或评价区）</span>';

    var imgs = Array.isArray(p.detailImages) ? p.detailImages : [];
    var strip = "";
    if (imgs.length) {
      strip = '<div class="img-strip">' + imgs.slice(0, 6).map(function (u) {
        return '<img src="' + esc(u) + '" onerror="this.style.visibility=\'hidden\'" alt="" />';
      }).join("") + "</div>";
    }
    return '<div class="pv-extra">' +
      '<div class="extra-tags">' + rows + "</div>" +
      (strip ? '<div class="an-title">详情图 <span class="muted sm">' + imgs.length + " 张（已一并上传）</span></div>" + strip : "") +
      "</div>";
  }

  /* ---------- 上传 ---------- */
  function doUpload() {
    if (!current || !current.name) { toast("没有可上传的商品", "err"); return; }
    // 红线商品拦一道：避免手滑把撞车品类推上情报站
    if (currentMeta && currentMeta.redFlag &&
        !confirm("该商品触碰选品红线（棉品/艾灸/自有品牌/医械字号），确定仍要上传吗？")) {
      toast("已取消", ""); return;
    }
    if (currentMeta && currentMeta.isDetailPage === false &&
        !confirm("当前不像商品详情页，采到的字段可能是列表标签。仍要上传吗？")) {
      toast("已取消", ""); return;
    }
    // 商品名没抓准时，用户改过就放行；一字未改还传上去只会污染数据
    if (currentMeta && currentMeta.nameOk === false && current.name === currentMeta.rawName &&
        !confirm("商品名「" + current.name + "」看着不像正经商品名，确定不改就上传吗？")) {
      toast("请先改商品名", ""); return;
    }
    chrome.storage.local.get("settings", function (r) {
      var s = r.settings || {};
      if (!s.token) { toast("请先到「设置」填 GitHub Token", "err"); switchTab("settings"); return; }
      els.btnUpload.disabled = true;
      chrome.runtime.sendMessage({
        type: "upload",
        product: current,
        repo: s.repo,
        path: s.path,
        token: s.token
      }, function (resp) {
        els.btnUpload.disabled = false;
        if (resp && resp.ok) {
          addHistory({ name: current.name, platform: current.platform, collectedAt: new Date().toISOString() });
          toast("已上传，今晚自动合并进情报站", "ok");
          current = null; currentMeta = null; showStage("empty");
        } else if (resp && resp.dup) {
          // 仍上传：二次确认（注意必须重新带上 repo/path/token，否则后台拿不到参数）
          if (confirm("该商品本周已采集过，仍要再次上传吗？")) {
            els.btnUpload.disabled = true;
            chrome.runtime.sendMessage({
              type: "upload",
              product: current,
              repo: s.repo,
              path: s.path,
              token: s.token,
              force: true
            }, function (r2) {
              els.btnUpload.disabled = false;
              if (r2 && r2.ok) {
                addHistory({ name: current.name, platform: current.platform, collectedAt: new Date().toISOString() });
                toast("已上传", "ok"); current = null; currentMeta = null; showStage("empty");
              } else {
                toast("上传失败：" + ((r2 && r2.error) || "未知错误"), "err");
              }
            });
          } else {
            toast("已取消", "");
          }
        } else {
          toast("上传失败：" + ((resp && resp.error) || "未知错误"), "err");
        }
      });
    });
  }

  /* ---------- 诊断：抓取异常时把页面结构发我定位 ---------- */
  function doDiagnose() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs[0];
      if (!tab || !SITE_RE.test(tab.url || "")) { toast("请先打开商品页", "err"); return; }
      els.diagPanel.hidden = false;
      els.diagBody.textContent = "诊断中…";
      function read() {
        chrome.tabs.sendMessage(tab.id, { type: "dump" }, function (resp) {
          if (chrome.runtime.lastError || !resp || !resp.success) {
            els.diagBody.textContent = "诊断失败：" + ((chrome.runtime.lastError && chrome.runtime.lastError.message) || "无返回");
            return;
          }
          els.diagBody.textContent = JSON.stringify(resp.info, null, 2);
        });
      }
      chrome.tabs.sendMessage(tab.id, { type: "dump" }, function (resp) {
        if (chrome.runtime.lastError || !resp || !resp.success) {
          // 兜底注入后重试
          chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] }, function () {
            if (chrome.runtime.lastError) { els.diagBody.textContent = "注入失败：" + chrome.runtime.lastError.message; return; }
            setTimeout(read, 350);
          });
          return;
        }
        els.diagBody.textContent = JSON.stringify(resp.info, null, 2);
      });
    });
  }
  function copyDiag() {
    var txt = els.diagBody.textContent || "";
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(function () { toast("诊断已复制，可直接发我", "ok"); })
      .catch(function () { toast("复制失败", "err"); });
  }

  /* ---------- 离线试用：不碰仓库、不需要 Token ---------- */
  // 产出的 JSON 与插件上传到 web/collected/raw/ 的格式完全一致，
  // 所以试用阶段攒下的文件，之后可以原样丢进仓库直接生效。
  function currentJson() {
    return JSON.stringify({ product: current }, null, 2);
  }

  function copyJson() {
    if (!current || !current.name) { toast("没有可复制的商品", "err"); return; }
    navigator.clipboard.writeText(currentJson()).then(function () {
      toast("JSON 已复制，可直接发我", "ok");
      addHistory({ name: current.name, platform: current.platform, collectedAt: new Date().toISOString() });
    }).catch(function () { toast("复制失败，请用「下载 JSON」", "err"); });
  }

  function saveJson() {
    if (!current || !current.name) { toast("没有可下载的商品", "err"); return; }
    var blob = new Blob([currentJson()], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var rnd = Math.random().toString(36).slice(2, 8);
    var fname = todayStr() + "-" + rnd + ".json";
    if (chrome.downloads && chrome.downloads.download) {
      chrome.downloads.download({ url: url, filename: fname });
    } else {
      // 没申请 downloads 权限时的兜底：a 标签必须挂进 DOM 才会真的触发下载
      var a = document.createElement("a");
      a.href = url; a.download = fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    toast("已下载到本机", "ok");
    addHistory({ name: current.name, platform: current.platform, collectedAt: new Date().toISOString() });
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  /* ---------- Tab ---------- */
  function switchTab(name) {
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) { t.classList.toggle("active", t.dataset.tab === name); });
    els.panelManual.hidden = name !== "manual";
    els.panelHistory.hidden = name !== "history";
    els.panelSettings.hidden = name !== "settings";
    if (name === "history") renderHistory();
    if (name === "collect") scan();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    ["themeChip", "todayCount", "stateEmpty", "stateLoading", "stateReady", "preview", "actions",
     "btnUpload", "btnRescan", "btnDiag", "btnDiscard", "panelManual", "panelHistory", "panelSettings",
     "btnOpenManual", "btnSaveSettings", "historyList", "historyEmpty", "toast", "diagPanel", "diagBody", "btnCopyDiag",
     "inpToken", "inpRepo", "inpPath", "btnCopyJson", "btnSaveJson", "verTag"].forEach(function (id) { els[id] = $(id); });

    // 版本号直接摆出来：刷新扩展后这里会变，一眼确认新版有没有生效
    try { els.verTag.textContent = "v" + chrome.runtime.getManifest().version; } catch (e) {}

    els.btnUpload.onclick = doUpload;
    els.btnCopyJson.onclick = copyJson;
    els.btnSaveJson.onclick = saveJson;
    els.btnRescan.onclick = scan;
    els.btnDiag.onclick = doDiagnose;
    els.btnCopyDiag.onclick = copyDiag;
    els.btnDiscard.onclick = function () { current = null; currentMeta = null; showStage("empty"); };
    els.btnOpenManual.onclick = function () { chrome.tabs.create({ url: chrome.runtime.getURL("manual.html") }); };
    els.btnSaveSettings.onclick = saveSettings;
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
      t.onclick = function () { switchTab(t.dataset.tab); };
    });

    loadSettings(function () { renderHistory(); loadTheme(); scan(); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
