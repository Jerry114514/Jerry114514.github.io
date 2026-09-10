"use strict";
/* wiki 路由小工具（2026-09 自 6 页重复实现抽取）
   统一 URL 参数解析：目录页 ?category=、详情页 ?id=
   用法: var id = WikiRouter.param("id"); */
var WikiRouter = {
  param: function (name) {
    return new URLSearchParams(window.location.search).get(name);
  }
};
