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
# 用法：把工作流里的 `git push` 换成 `bash scripts/ci_push_retry.sh`
#   （调用前该 commit 的改动要先 `git commit` 好）
set -uo pipefail

BRANCH="${1:-main}"
TRIES="${2:-5}"

for i in $(seq 1 "$TRIES"); do
  if git push origin "$BRANCH"; then
    echo "推送成功（第 $i 轮）"
    exit 0
  fi
  echo "第 $i 轮推送被拒（远端 $BRANCH 上已有新提交），rebase 后重试…"
  # rebase 若因冲突中断，先 abort 回到干净状态，否则后续每轮都只是重复失败
  git pull --rebase --autostash origin "$BRANCH" || git rebase --abort || true
  sleep $((i * 3))
done

echo "::error::连续 $TRIES 轮推送失败 —— 请检查分支保护规则、是否需要 PR，或远端是否被锁"
exit 1
