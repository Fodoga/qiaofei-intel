/* background.js —— 后台：读取去重记录、算本周专题、上传原始商品到仓库。 */
(function () {
  "use strict";

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    bytes.forEach(function (b) { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function daysBetween(a, b) {
    try { return Math.round((new Date(a) - new Date(b)) / 86400000); } catch (e) { return 999; }
  }

  // 读取公开文件（无需 token）：raw.githubusercontent.com
  function getRaw(repo, filepath) {
    var url = "https://raw.githubusercontent.com/" + repo + "/main/" + filepath;
    return fetch(url).then(function (r) {
      if (!r.ok) return null;
      return r.text();
    }).catch(function () { return null; });
  }

  // 本周专题：读 theme_calendar.json，按今天挑
  function getTheme(repo) {
    return getRaw(repo, "web/theme_calendar.json").then(function (txt) {
      if (!txt) return { theme: "" };
      try {
        var cal = JSON.parse(txt);
        var today = todayStr();
        for (var i = 0; i < cal.length; i++) {
          if (cal[i].start <= today && today <= cal[i].end) return { theme: cal[i].theme };
        }
        var past = cal.filter(function (e) { return e.end < today; });
        if (past.length) return { theme: past.sort(function (a, b) { return a.end < b.end ? 1 : -1; })[0].theme };
        return { theme: cal.length ? cal[0].theme : "" };
      } catch (e) { return { theme: "" }; }
    });
  }

  // 去重：读 picked.json（公开），7 天内同款则返回 true
  function isDup(repo, key) {
    return getRaw(repo, "web/picked.json").then(function (txt) {
      if (!txt) return false;
      try {
        var picked = JSON.parse(txt) || {};
        var last = picked[key];
        if (last && 0 <= daysBetween(todayStr(), last) && daysBetween(todayStr(), last) < 7) return true;
      } catch (e) {}
      return false;
    });
  }

  // 上传：追加一个独立文件到 web/collected/raw/
  function upload(repo, path, product, token, force) {
    var key = product.name + "|" + product.platform;
    return isDup(repo, key).then(function (dup) {
      if (dup && !force) return { dup: true };

      var date = todayStr();
      var rnd = Math.random().toString(36).slice(2, 8);
      var filename = date + "-" + rnd + ".json";
      var fullPath = path.replace(/\/+$/, "") + "/" + filename;
      var content = b64encode(JSON.stringify(product, null, 2));

      var api = "https://api.github.com/repos/" + repo + "/contents/" + fullPath;
      return fetch(api, {
        method: "PUT",
        headers: {
          "Authorization": "Bearer " + token,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: "collect: " + product.name,
          content: content,
          branch: "main"
        })
      }).then(function (r) {
        if (r.status === 201 || r.status === 200) return { ok: true };
        return r.json().then(function (j) { return { ok: false, error: (j && j.message) || ("HTTP " + r.status) }; })
          .catch(function () { return { ok: false, error: "HTTP " + r.status }; });
      }).catch(function (e) { return { ok: false, error: String(e) }; });
    });
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === "getTheme") {
      getTheme(msg.repo).then(sendResponse); return true;
    }
    if (msg.type === "upload") {
      var s = msg.product || {};
      upload(msg.repo, msg.path, s, msg.token, msg.force).then(sendResponse); return true;
    }
    if (msg.type === "store-last") {
      try {
        chrome.storage.local.set({ lastExtract: msg.data });
      } catch (e) {}
      sendResponse({ ok: true }); return true;
    }
    if (msg.type === "dump") {
      captureActiveTab(true).then(function (info) { sendResponse(info); }); return true;
    }
    return false;
  });

  // 采集当前标签页：先 ping 内容脚本，失败则注入兜底，再 extract
  // withDump=true 时返回页面诊断结构（用于「诊断」功能）
  function captureActiveTab(withDump) {
    return new Promise(function (resolve) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        if (!tab || !tab.id) return resolve(null);
        var target = { tabId: tab.id };

        function doExtract() {
          chrome.tabs.sendMessage(tab.id, { type: withDump ? "dump" : "extract" }, function (resp) {
            if (chrome.runtime.lastError) return resolve(null);
            if (withDump) return resolve(resp);
            resolve(resp && resp.product ? resp : null);
          });
        }
        function injectThenExtract() {
          chrome.scripting.executeScript({ target: target, files: ["content.js"] }, function () {
            if (chrome.runtime.lastError) return resolve(null);
            setTimeout(doExtract, 350);
          });
        }
        if (withDump) return doExtract();
        // 先 ping 是否已注入
        chrome.tabs.sendMessage(tab.id, { type: "ping" }, function (p) {
          if (chrome.runtime.lastError || !p || !p.ready) return injectThenExtract();
          doExtract();
        });
      });
    });
  }

  // 快捷键：Ctrl+Shift+S 采集当前商品页
  if (chrome.commands && chrome.commands.onCommand) {
    chrome.commands.onCommand.addListener(function (command) {
      if (command !== "capture-current") return;
      captureActiveTab(false).then(function (product) {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          var tab = tabs && tabs[0];
          var tabId = tab && tab.id;
          if (!product) {
            if (tabId) chrome.tabs.sendMessage(tabId, { type: "toast", message: "没抓到商品，确认在商品详情页？", toastType: "warn" });
            return;
          }
          // 存最近一次采集，供弹窗直接展示
          try {
            chrome.storage.local.set({ lastExtract: { product: product, meta: product.meta || {}, ts: Date.now() } });
          } catch (e) {}
          if (tabId) {
            var note = product.name ? ("已采集：" + product.name) : "已采集";
            chrome.tabs.sendMessage(tabId, { type: "toast", message: note, toastType: "ok" });
          }
        });
      });
    });
  }
})();
