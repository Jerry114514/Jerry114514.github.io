# assets/planet-icons — 星球图标缓存

galaxy-map-v2.html 的星球图标本地缓存（MapLibre symbol 层用作 WebGL 纹理）。

## 来源与许可

- **来源**：[helldivers.wiki.gg](https://helldivers.wiki.gg/) 的 `File:<星球名>_Planet_Icon.png`
  （以 64px 缩略图下载：`/images/thumb/<File>/64px-<File>`，原图 1720×1720 不落库）
- **许可**：wiki 内容采用 **CC BY-NC-SA 4.0**（署名-非商业性使用-相同方式共享）
- **游戏素材版权**：HELDIVERS® 2 图像素材版权归 **Arrowhead Game Studios / Sony Interactive Entertainment** 所有
- **用途**：本站为非商业社区项目（HD2 真理部），仅作信息展示用途

## 生成方式

由仓库根目录的 `fetch_planet_icons.py` 生成（幂等，可重跑补齐）：

```sh
python fetch_planet_icons.py
```

- 文件名规则：`<大写星球名 空格换下划线>.png`（如 `ACAMAR_IV.png`）
- `index.json`：`{ "ACAMAR IV": "ACAMAR_IV.png", ... }`（键为 data.json 中的大写原名）
- wiki 文件名大小写无规律（`Charbal-VII` / `Cerberus_IIIc`），脚本经
  `list=allimages` 枚举规范名后精确下载；请求带 User-Agent、**不带 Referer**（带了 403）

## 未命中名单（wiki 无对应 Planet_Icon，前端回退纯色圆点）

- `NEW INSIGHT`
- `WAYWARD`

统计：273 颗星球命中 271（99.3%），落库体积约 1.5 MB。
