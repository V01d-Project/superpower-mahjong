# 发布阻塞记录 · 2026-10-23

已通过 gh api user --jq .login 确认当前登录 V01d-Project。

当前授权下实际尝试的命令：

    gh repo create V01d-Project/superpower-mahjong --public --source C:/Users/Sylphie/.openclaw/workspace/work/mahjong/game --remote origin --push

Gateway 返回：

    Exec approval registration failed: GatewayClientRequestError: missing scope: operator.approvals | FORBIDDEN

没有可操作的 approval ID。随后 gh repo view V01d-Project/superpower-mahjong --json url,isPrivate 返回 Could not resolve to a Repository，确认仓库没有创建。没有包装脚本、其他 API 或其他凭据绕过该拦截。

## 恢复审批权限后

1. 原样执行上面的 gh repo create 命令（创建公开仓库并推 main）。
2. 本地构建 npm run build；若 dist 构建有变化，在 dist 分支 git add -A，并以一次性 -c user.name=V01d-Project -c user.email=V01d-Project@users.noreply.github.com 提交。
3. git -C C:/Users/Sylphie/.openclaw/workspace/work/mahjong/game/dist push https://github.com/V01d-Project/superpower-mahjong.git gh-pages
4. gh api -X POST repos/V01d-Project/superpower-mahjong/pages --input C:/Users/Sylphie/.openclaw/workspace/work/mahjong/game/pages.json
5. gh api repos/V01d-Project/superpower-mahjong/pages/builds/latest --jq .status
6. 等待 built，实际验证 https://v01d-project.github.io/superpower-mahjong/ 返回 HTTP 200、标题正确及游戏可开局。未验证前不宣称已上线。

当前没有可访问 URL；上面只是预期地址。
