#!/usr/bin/env bash
# 带重试的 git push —— 给「会自动提交」的工作流统一使用。
#
# 为什么需要（2026-09-24 实测）：
#   每 5 分钟一次的 fetch-data 工作流，在 check out 之后、push 之前，main 上完全可能
#   已经有别的提交落下来（人工 API 推送、fetch-patchnotes、sync-tables、
#   sync-release-status、build-search-index 都会提交）→ 直接 `git push` 被拒
#   （non-fast-forward）→ job 变红，但数据本身没有问题。
#   用户收到的「Fetch HD2 Data Run failed」邮件全是这一类：
#   日志 `error: failed to push some refs`，失败步是 Commit and push。
#
# 工作流里的 concurrency（如 fetch-data 的 group: fetch-data）只能防止自己叠自己，
# 防不了外部提交，所以推送这一步必须自带重试。
#
# 2026-09-25 追加：**rebase 冲突也要能收场**。当天实测到一次 5 轮全废的失败：
#   私密仓 `Push TransNews to Page` 在同一分钟把 data.json 改写并推上来（译文字段是
#   它"单一写入"的），而本站 fetch-data 刚好也生成了自己的 data.json →
#   `git pull --rebase` 报 `CONFLICT (content): Merge conflict in HD2-Galatic_war-Map/data.json`
#   → 旧实现直接 `git rebase --abort` → 本地 commit 还在 → 下一轮 push 依旧非快进 → 循环失败。
#   修法：冲突时**一律取远端版本**再继续 rebase。本仓库会"自动提交"的文件
#   （data.json / data/history/player_distribution.json / assets/campaign/*）都是
#   **每轮重新生成的派生物**：译文与战役横幅由私密仓单一写入，绝不能拿本地旧快照覆盖；
#   丢的只是本轮这一份快照，5 分钟后下一轮就补回来。若取远端后本地 commit 变空，
#   用 `git rebase --skip` 跳过它（等价于"这轮没东西可提交"）。
#
# 用法：把工作流里的 `git push` 换成 `bash scripts/ci_push_retry.sh`
#   （调用前该 commit 的改动要先 `git commit` 好）
set -uo pipefail

BRANCH="${1:-main}"
TRIES="${2:-5}"

resolve_conflicts_take_remote() {
  local f
  for f in $(git diff --name-only --diff-filter=U); do
    echo "  冲突文件 $f → 取远端版本（本轮快照作废，下一轮会重新生成）"
    # ⚠ rebase 里 ours/theirs 与 merge 相反：HEAD 是"新基底"（= 远端），
    #   所以要远端版本是 `--ours`；写成 `--theirs` 会把本地旧快照盖回远端，
    #   正好冲掉私密仓刚推上来的译文。
    git checkout --ours -- "$f" 2>/dev/null || git checkout --theirs -- "$f" 2>/dev/null || true
    git add -- "$f"
  done
}

for i in $(seq 1 "$TRIES"); do
  if git push origin "$BRANCH"; then
    echo "推送成功（第 $i 轮）"
    exit 0
  fi
  echo "第 $i 轮推送被拒（远端 $BRANCH 上已有新提交），rebase 后重试…"
  if git pull --rebase --autostash origin "$BRANCH"; then
    :
  else
    resolve_conflicts_take_remote
    GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 \
      || git rebase --skip >/dev/null 2>&1 \
      || git rebase --abort >/dev/null 2>&1 || true
  fi
  sleep $((i * 3))
done

echo "::error::连续 $TRIES 轮推送失败 —— 请检查分支保护规则、是否需要 PR，或远端是否被锁"
exit 1
