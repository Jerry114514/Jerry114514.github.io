"use strict";
/* wiki 路由小工具（2026-09 自 6 页重复实现抽取）
   统一 URL 参数解析：目录页 ?category=、详情页 ?id=
   用法: var id = WikiRouter.param("id");

   WikiRouter.seo(o)（2026-09-25 新增，SEO）：详情页是"一页多条目"——13 个 HTML 文件要覆盖
   sitemap 里 471 条 ?id= URL。因此：
     · <title> / description / og:* 在条目数据到位后按当前条目改写（Google 会执行 JS，
       搜索结果与分享卡片才能显示"具体是哪把武器"，而不是全都叫「武器详情」）；
     · canonical **只在这里按当前 URL 生成自指 canonical**。绝不能在 HTML 里写死一个不带 id 的
       静态 canonical —— 那等于告诉搜索引擎"471 个详情页都是同一个页面"，会把它们全部并掉。 */
var WikiRouter = {
  param: function (name) {
    return new URLSearchParams(window.location.search).get(name);
  },
  seo: function (o) {
    if (!o) return;
    try {
      var setMeta = function (sel, val) {
        if (!val) return;
        var el = document.querySelector(sel);
        if (!el) {
          // 详情页的静态头里没有 og:url（因为不写死 canonical），这里按需创建
          el = document.createElement("meta");
          var m = sel.match(/(property|name)="([^"]+)"/);
          if (m) el.setAttribute(m[1], m[2]);
          document.head.appendChild(el);
        }
        el.setAttribute("content", val);
      };
      if (o.title) {
        document.title = o.title;
        setMeta('meta[property="og:title"]', o.title);
        setMeta('meta[name="twitter:title"]', o.title);
      }
      if (o.description) {
        setMeta('meta[name="description"]', o.description);
        setMeta('meta[property="og:description"]', o.description);
        setMeta('meta[name="twitter:description"]', o.description);
      }
      var url = o.url || window.location.href;
      var link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", url);
      setMeta('meta[property="og:url"]', url);
    } catch (_) { /* SEO 失败绝不能影响页面渲染 */ }
  }
};
