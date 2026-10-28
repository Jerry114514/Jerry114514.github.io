# 公开检查与本地复核

当前 CI 针对实际部署的 assessment-v2 运行，不再用历史评分入口的检查代替新版验证：

```sh
node --test scripts/tests/loadout-v3-assessment-v2/*.test.mjs
node scripts/build-loadout-v3-assessment.mjs --check
node scripts/review-loadout-v3-assessment.mjs --check
```

公开 checkout 包含构建所需装备快照、补证、人工校准与模型，无需 `scripts/.loadout-inputs/` 或原机器路径。构建输入清单及逐文件哈希在 `shared/hd2-loadout/assessment-v2/equipment.json` 中；Wiki 装备快照保留来源与版本信息。

公式测试在内存中使用计算值，人工校准行为另外验证，不改用户保存的评分文件。抽取测试使用当前发布模型验证实际抽取、换装、机甲上限及 C4 双占位。

本地浏览器检查可使用已有 Playwright 和 Edge/Chromium：

```sh
node scripts/check-assessment-draw-ui.mjs <playwright-package> <browser-executable> http://127.0.0.1:8790 /HD2_Wiki/loadout.html
node scripts/check-assessment-draw-ui.mjs <playwright-package> <browser-executable> http://127.0.0.1:8790 /HD2-Galatic_war-Map/index.html
```

测试记录写入已忽略的 `scripts/.loadout-artifacts/pr-browser/`，不写人工评分。技术检查不代表游戏实测或全阵营认证；资料边界保留在 `coverage.json`。
