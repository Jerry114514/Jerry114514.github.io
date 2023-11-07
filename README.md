Bideo.js库自述 (翻译)
======================

想要在容器或者`body`的背景中播放视频吗？该插件会帮你做到。我也建议你[阅读此文章](http://codetheory.in/html5-fullscreen-background-video/) .

Want to play a video in the background of a container or `body` itself ? This plugin will help you do exactly that. I'd suggest you to [read this article](http://codetheory.in/html5-fullscreen-background-video/) too.

[**Demo**](http://rishabhp.github.io/bideo.js/)

功能
--------

### 重设大小 || Resizing

`video`元素会根据容器的尺寸大小自适应。浏览器窗口大小同理.\
The `video` element in use will automatically adapt to the container's dimensions. It will also resize as the browser window resizes.

### 覆盖 || Overlay (本段翻译不准确)

插件不支持任何覆盖方式，因为这在[你的代码](http://codetheory.in/html5-fullscreen-background-video/#overlays)中很容易通过纯HTML/CSS的方式实现\
Plugin doesn't supports any overlay as it is easy to implement that with plain HTML/CSS in [your code](http://codetheory.in/html5-fullscreen-background-video/#overlays).

### 视频封面 || Video Cover

视频需要加载一会，这是因为源代码是通过`Javascript`添加的，而这个步骤是在加载完DOM之后；\
到这时你或许会想展示你的视频封面为视频的第一帧（或是其他图片）\
Video might take a few seconds to load, especially because the sources are added via JS which is something you'll load after the DOM's loading. Till then you may want to show a video cover which'll be same as the first frame or the video (or some other image).

插件不支持这点，因为只通过HTML/CSS实现这一点相当简单（就像覆盖一样）。详细请看Demo！\
The support for this is not in the plugin as it's fairly simple to achieve this via just HTML/CSS (just like overlays). Check the demo!

### 网络速度 || Network Speed

[阅读此文章](http://codetheory.in/html5-fullscreen-background-video/#network_speed)\
[Read this](http://codetheory.in/html5-fullscreen-background-video/#network_speed).

选项 || Options
-------

查看`main.js`。\
Check `main.js`.

More on HTML5 Video/Audio
-------------------------

- https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Media_events
- http://www.w3schools.com/tags/ref_av_dom.asp
