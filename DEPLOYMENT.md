# GitHub Pages 实际发布记录 · 2026-10-25

已发布：https://v01d-project.github.io/superpower-mahjong/

构建时间：2026-10-25 06:50 Europe/Paris（UTC+01:00）。9 个测试文件、90 项测试通过；TypeScript / Vite 构建通过，65 modules，Vite 阶段 738ms。

## 实际执行命令（项目根目录，PowerShell）

```powershell
npm.cmd test
npm.cmd run build
Get-Content -Encoding utf8 dist/index.html
gh api repos/V01d-Project/superpower-mahjong/pages
$deployDir=Join-Path ([System.IO.Path]::GetTempPath()) ('mahjong-pages-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $deployDir | Out-Null
Copy-Item -Path dist/* -Destination $deployDir -Recurse -Force
New-Item -ItemType File -Path (Join-Path $deployDir '.nojekyll') -Force | Out-Null
git -C $deployDir init
git -C $deployDir checkout -b gh-pages
git -C $deployDir add -A
git -C $deployDir -c user.name=V01d-Project -c user.email=V01d-Project@users.noreply.github.com commit -m 'Deploy current verified production build'
git -C $deployDir push --force https://github.com/V01d-Project/superpower-mahjong.git gh-pages
gh api repos/V01d-Project/superpower-mahjong/pages
curl.exe -sS -D - https://v01d-project.github.io/superpower-mahjong/
node C:\Users\Sylphie\AppData\Local\Temp\mahjong-live-check.cjs
```

本次临时目录：`C:\Users\Sylphie\AppData\Local\Temp\mahjong-pages-2664993b177d417ba0d4755c51a2f9c4`。dist 原有 .git 也被复制，因此 init 显示 Reinitialized，checkout 返回 `fatal: a branch named 'gh-pages' already exists`；后续提交与推送成功，提交 `53007d4` 位于 gh-pages。保留 .nojekyll。未修改 Pages 设置或提交、推送 main。

## 线上真实证据

轮询先看到 building 和旧 HTML，随后在推送后一分钟内看到 built 和新 HTML。2026-10-25 05:51:34 UTC 验收：HTML 200，全文与 dist/index.html 相同。原始片段：

```html
<title>超能力三麻 · 单机与联机牌桌</title>
<script type="module" crossorigin src="/superpower-mahjong/assets/index-DwucFNky.js"></script>
<link rel="stylesheet" crossorigin href="/superpower-mahjong/assets/index-CMt6aEQK.css">
```

从 HTML 解析资源后逐一抓取：

| 资源 | HTTP | Content-Type | 与 dist 一致 |
| --- | --- | --- | --- |
| assets/index-DwucFNky.js | 200 | application/javascript; charset=utf-8 | 是 |
| assets/index-CMt6aEQK.css | 200 | text/css; charset=utf-8 | 是 |

原始资源开头（完整抓取结果见 pages-live-results.json）：

```javascript
var jg=Object.defineProperty;var Ug=r=>{throw TypeError(r)};
```

```css
:root{font-family:Noto Sans SC,system-ui,sans-serif;color:#e9eee6;background:#101c20;
```

Playwright 使用本机 Chrome，显式 headless:true。打开线上地址，点击「入座开局 →」，等待手牌，选牌并点击「打出」。截图时手牌 13 张、自己的牌河为「北」，pageerror 与 console error 数组为空。截图：项目根目录 pages-live.png；完整记录：pages-live-results.json。

剩余：未验收线上多人 P2P、自建 WebSocket、完整一局、移动端及全部规则边界。本次仅确认单机实际开局和弃牌可用。文档改动保存在工作区，未推送 main。
