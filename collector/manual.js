/* manual.js —— 手动录入页：引导用户把截图发到 WorkBuddy 对话（最稳通道）。 */
(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.className = "toast show";
    setTimeout(function () { t.className = "toast"; }, 1800);
  }
  document.addEventListener("DOMContentLoaded", function () {
    $("btnCopy").onclick = function () {
      var v = $("tpl").value;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(v).then(function () { toast("已复制，去对话里发我吧"); },
          function () { toast("复制失败，请手动选择复制"); });
      } else {
        $("tpl").select(); document.execCommand("copy"); toast("已复制");
      }
    };
  });
})();
