"use strict";
/* ==============================================================
   全站载入遮罩（boot-splash）· 2026-10-26
   --------------------------------------------------------------
   功能：
     1. 全屏载入遮罩：旗帜徽标脉冲 + 分段进度条 + 轮换信息行
     2. 信息轮换：在真实加载消息之间穿插 lore / 军情速报 / 提示，
        每 2.8s 切换一条（带淡入），让等待不再只是干等
     3. 各页面真实进度消息通过 HD2Boot.setMsg() 推入，
        轮换池按时间片均匀分配真实与穿插内容
   用法（页面底部，DOMContentLoaded 之前引入即可）：
     <link rel="stylesheet" href="./css/boot-splash.css">
     <script src="./js/boot-splash.js"></script>
     <script>
       HD2Boot.mount();                // 挂载遮罩（body 末尾插入节点）
       HD2Boot.setMsg("正在加载星图数据…"); // 推入真实进度
       HD2Boot.done();                 // 数据就绪 → 淡出移除
     </script>
   星图页（galaxy-map-v2）保留原有内联版本以避免双遮罩；
   其余页面通过本模块统一。
   ============================================================== */
(function (global) {
  "use strict";

  var PREFIX = "./";  // 相对当前页面的资源基址（emblem 图标）

  // 穿插信息池（lore / 军情 / 提示），与真实进度消息交替显示
  var LORE = [
    "🪖 超级地球武装力量正在为您准备战况简报…",
    "📡 真理部广播：民主的火种需要每一个公民的守护。",
    "🛰️ SEAF 侦察卫星正在校准轨道参数…",
    "⚡ E-710 提炼效率已提升至战时标准。",
    "🦅 「自由是一顿需要天天享用的盛宴。」——超级地球宣传部",
    "🛡️ 管理式民主的安全建立在信息透明之上。",
    "⚖️ 民主不会自己保卫自己——但真理部会。",
    "🔬 民主检测中心：当前页面安全性评级为「绝对安全」。",
    "🎖️ 在您等待的这几秒里，已有 3,741 名绝地潜兵完成了任务。",
    "🚀 超级驱逐舰编队已完成第 1,042 次轨道部署。",
  ];

  var state = {
    mounted: false,
    node: null,
    msgEl: null,
    realMsg: "",
    loreIdx: 0,
    timer: null,
    gone: false,
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function build() {
    var seg = "";
    for (var i = 1; i <= 10; i++) seg += "<i></i>";
    var el = document.createElement("div");
    el.id = "hd2-boot";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-label", "正在加载");
    el.innerHTML =
      '<img class="emblem" src="' + PREFIX + 'assets/ui-icons/super_earth_flag.svg" alt="" decoding="async">'
      + '<div class="segments" aria-hidden="true">' + seg + "</div>"
      + '<div class="msg"><span class="line"></span><small class="sub"></small></div>';
    document.body.appendChild(el);
    state.node = el;
    state.msgEl = el.querySelector(".msg .line");
    state.subEl = el.querySelector(".msg .sub");
    return el;
  }

  function tick() {
    if (state.gone) return;
    // 交替显示：真实消息 → lore → 真实消息 → lore…
    var useReal = (state.loreIdx % 2 === 0) && state.realMsg;
    var text = useReal ? state.realMsg : LORE[state.loreIdx % LORE.length];
    if (!text) text = LORE[state.loreIdx % LORE.length];
    state.loreIdx++;
    if (state.msgEl) {
      state.msgEl.style.opacity = "0";
      setTimeout(function () {
        if (state.msgEl) {
          state.msgEl.textContent = text;
          state.msgEl.style.opacity = "1";
        }
      }, 150);
    }
  }

  var HD2Boot = {
    mount: function (opts) {
      if (state.mounted) return;
      state.mounted = true;
      if (opts && opts.assetPrefix) PREFIX = opts.assetPrefix;
      var el = build();
      // 请求下一帧再添加 visible 类，让 transition 生效
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { el.classList.add("visible"); });
      });
      tick();
      state.timer = setInterval(tick, 2800);
      return HD2Boot;
    },
    setMsg: function (msg) {
      state.realMsg = String(msg || "");
      if (state.msgEl && !state.gone) {
        state.msgEl.style.opacity = "0";
        setTimeout(function () {
          if (state.msgEl) {
            state.msgEl.textContent = state.realMsg;
            state.msgEl.style.opacity = "1";
          }
        }, 150);
      }
      return HD2Boot;
    },
    done: function () {
      if (state.gone) return;
      state.gone = true;
      if (state.timer) clearInterval(state.timer);
      if (state.node) {
        state.node.classList.add("gone");
        var n = state.node;
        setTimeout(function () { if (n && n.parentNode) n.parentNode.removeChild(n); }, 600);
      }
      return HD2Boot;
    },
  };

  HD2Boot._lorePool = LORE;   // 供内联遮罩页（如星图）复用穿插文案
  global.HD2Boot = HD2Boot;
})(typeof window !== "undefined" ? window : globalThis);
