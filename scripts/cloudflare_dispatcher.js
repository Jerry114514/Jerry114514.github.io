/**
 * HD2 数据更新 —— 外部定时触发器（Cloudflare Worker）
 * ============================================================================
 * 作用：每 5 分钟调用 GitHub API 的 workflow_dispatch，触发 fetch-data.yml。
 *       替代原来「本机 cron 每 15 分钟 dispatch」的方案 —— 那个必须一直开着电脑，
 *       这正是需要解决的痛点。部署在 Cloudflare 后就是 7×24 无人值守。
 *
 * 成本：Cloudflare Workers 免费计划 = 10 万请求/天；每 5 分钟一次 = 288 次/天，
 *       连零头都用不到。Cron Triggers 在免费计划即可使用。
 *
 * ---------------------------------------------------------------------------
 * 部署步骤（全程 5 分钟）
 * ---------------------------------------------------------------------------
 * 1) 建一个「专用、最小权限」的 GitHub 令牌 —— 不要复用你现有的全权令牌
 *    GitHub → 右上头像 → Settings → Developer settings → Personal access tokens
 *    → Fine-grained tokens → Generate new token
 *      Repository access : Only select repositories → 选 Jerry114514.github.io
 *      Permissions       : 只勾 Actions → Read and write
 *      Expiration        : 90 天（到期前记得换，Worker 里改一个变量即可）
 *    生成后复制 github_pat_xxx（只显示一次）
 *
 * 2) 建 Worker
 *    Cloudflare Dashboard → Workers & Pages → Create → Workers → Create Worker
 *    名字随意（如 hd2-dispatcher）→ Deploy
 *    → Edit code → 把本文件内容整体粘贴进去 → Deploy
 *
 * 3) 把令牌塞进 Worker 的密钥（不要写在代码里）
 *    Worker → Settings → Variables and Secrets → Add
 *      Type = Secret, Name = GH_PAT, Value = 第 1 步的 github_pat_xxx
 *    → Deploy
 *
 * 4) 配 Cron 触发器（每 5 分钟）
 *    Worker → Settings → Triggers → Cron Triggers → Add Cron Trigger
 *      输入：*​/5 * * * *        （注意：去掉这里的零宽字符，直接写星号斜杠5）
 *    → Add
 *
 * 5) 验证
 *    浏览器打开 Worker 的网址（形如 https://hd2-dispatcher.xxx.workers.dev）
 *    返回 {"dispatched":true,...} 说明令牌与权限都对；
 *    再打开 GitHub 仓库 → Actions → Fetch HD2 Data，应能看到一条新的 workflow_dispatch 运行。
 *
 * ---------------------------------------------------------------------------
 * 常见返回码
 * ---------------------------------------------------------------------------
 *   204 = 触发成功（正常）
 *   401 = GH_PAT 没配、写错、或已过期
 *   403 = 令牌权限不足（漏勾 Actions: Read and write），或该工作流未启用
 *   404 = 仓库名/工作流文件名写错（注意是 fetch-data.yml，不是 workflow 的 name）
 *
 * ---------------------------------------------------------------------------
 * 不想用 Cloudflare？等价的零代码方案
 * ---------------------------------------------------------------------------
 * 用 cron-job.org 之类的免费外部定时服务，每 5 分钟发一次：
 *   Method : POST
 *   URL    : https://api.github.com/repos/Jerry114514/Jerry114514.github.io/actions/workflows/fetch-data.yml/dispatches
 *   Header : Authorization: Bearer github_pat_xxx
 *            Accept: application/vnd.github+json
 *   Body   : {"ref":"main"}
 * 代价是令牌要交给第三方服务保管，所以优先推荐自建 Worker。
 * ============================================================================
 */

const OWNER = 'Jerry114514';
const REPO = 'Jerry114514.github.io';
const WORKFLOW = 'fetch-data.yml';   // 注意：是文件名，不是 name: Fetch HD2 Data
const REF = 'main';

async function dispatch(env) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_PAT}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'hd2-dispatcher',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: REF }),
  });
  const detail = res.status === 204 ? '' : await res.text();
  return { status: res.status, detail };
}

export default {
  // Cron Triggers 入口：每 5 分钟
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      dispatch(env).then(r => console.log(`dispatch -> ${r.status} ${r.detail}`))
    );
  },
  // HTTP 入口：手动触发一次，便于验证配置
  async fetch(request, env) {
    if (!env.GH_PAT) {
      return new Response(
        JSON.stringify({ dispatched: false, error: '未配置 GH_PAT 密钥' }, null, 2),
        { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } }
      );
    }
    const r = await dispatch(env);
    return new Response(
      JSON.stringify(
        {
          dispatched: r.status === 204,
          status: r.status,
          detail: r.detail,
          hint:
            r.status === 204 ? '已触发，去 Actions 页面看新运行'
            : r.status === 401 ? 'GH_PAT 缺失/错误/过期'
            : r.status === 403 ? '令牌权限不足：需要 Actions: Read and write'
            : r.status === 404 ? '仓库或工作流文件名写错'
            : '见 detail',
        },
        null, 2
      ),
      { headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  },
};
