# 发布到插件市场

这个包现在的形态已经可以直接发布：`npm pack --dry-run` 打出来 12 个文件、36.7 kB，
清单里有 `dsh.bundle`（installable bundle 的硬要求）和 `dsh.client`（Web UI 面板）。

市场那套（`dshmarket` / `awesome-dsh-plugin`）的规则是**精选目录 + 索引**，没有“上传按钮”：
插件先发布到 npm 或 GitHub，再往目录仓库提一个 PR，合并后站点与市场索引自动更新
（索引就是 `dsh-plugin-catalog` 这个 npm 包里的 `index.json`，dsh 0.2.1+ 可在 插件 → 发现 → 索引源 里添加）。

---

## 0. 先把 TODO 填掉

`package.json` 里现在有三处 `TODO`，按你的真实信息改：

```json
"author": "你的名字 <you@example.com>",
"homepage": "https://github.com/<owner>/dsh-chat-migrate#readme",
"repository": { "type": "git", "url": "git+https://github.com/<owner>/dsh-chat-migrate.git" },
"bugs": { "url": "https://github.com/<owner>/dsh-chat-migrate/issues" }
```

版本号现在是 `1.1.1`；以后每次发布都要 `npm version patch|minor` 再发。

## 1. 建仓库并推上去

```powershell
cd <这个目录>
git init
git add .
git commit -m "dsh-chat-migrate 1.1.1"
git remote add origin https://github.com/<owner>/dsh-chat-migrate.git
git push -u origin main
```

仓库上要做两件事（目录 PR 的自动检查会看）：

- 加 topic **`dsh-plugin`**（GitHub 仓库页 → About 右侧齿轮 → Topics）
- 仓库**至少存在 1 天**才能过审（新仓库会被挡，第二天再提）

## 2. 发布到 npm

包名 `dsh-chat-migrate` 目前**未被占用**（registry 查过是 404），可以直接用。

```powershell
npm login                       # 浏览器/OTP 登录
npm publish --access public
```

`publishConfig.access` 已经设成 `public`，`files` 白名单也已经验证过，只会发这 12 个文件：

```
package.json  index.js  client.js  cordis.patch.yml
locale/{zh,en}.json  docs/{DETAIL.md,DETAIL.zh.md,preview.svg}  icon.svg  README.md  INSTALL.md
```

发完确认：

```powershell
npm view dsh-chat-migrate version dist.tarball
```

## 3. 往精选目录提 PR

仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
**不要改 README**（它是生成的），只要新增一个文件：

```
data/plugins/<owner>__dsh-chat-migrate.yml
```

内容照 `market-submission.yml` 那个模板填（下面的 `category` 建议 `session`，因为它改的是会话历史）：

```yaml
url: https://github.com/<owner>/dsh-chat-migrate
name: <owner>/dsh-chat-migrate
category: session
description:
  en: Import chat.deepseek.com history into DSH as real sessions, or export it as Markdown and JSON.
  zh: 把 chat.deepseek.com 的历史会话导入成 DSH 真会话，或导出为 Markdown 与 JSON 文件。
```

`category` 必须是索引里已声明的 id，可选值：

```
agi ui usage theme model identity session memory tools wsl browser
vision voice docs skill workflow git notify dev security remote market fun
```

提 PR → 合并后 README 与 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json` 会自动重建（通常一天内生效）。

## 4. 用户怎么装到

三种都行，写进 README 或市场描述里更好：

- 市场 App：`dsh plugin --profile <p> add dshmarket`，然后在插件市场里一键装
- 命令行：`dsh plugin --profile <p> add dsh-chat-migrate`
- 索引源（dsh 0.2.1+）：插件 → 发现 → 索引源 → 添加
  `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`，再搜「网页会话迁移」

## 5. 可选：自己维护一份索引

如果你想在自己站点上挂一份索引（或做私有市场），格式是 format 1：

```json
{ "format": 1, "title": {...}, "description": {...}, "metadata": { "categories": {...}, "labels": {}, "sortKeys": {} }, "plugins": [ ... ] }
```

`market-entry.json` 已经按官方索引里真实条目的结构写好了本插件那一条，把 `repository.url`
换成你的仓库即可；`publishTimestamp` 用秒（不是毫秒），填 npm 上那次发布的 `time`。

## 关于 DSH 版本声明（engines.dsh）

市场会用 `engines.dsh`（或同版本线 `@deepseek-ai/dsh-*` 的 peer）来判断兼容性，
**没声明时显示为“未知”但照常上架**；而 `plugin_manager` 安装时会**拦截不满足的声明**。
这个插件依赖 `sessionPersistence` / `sessionProjectionCache` / `workspaceRegistry` 与
`session/title` 事件，实测在 `0.2.2-rc.5` 上工作，所以我故意没写 `engines.dsh`——
避免把预发布版本（`0.2.2-rc.5` 这类）误判为不兼容把用户挡在门外。
要写的话，建议留宽：`"engines": { "node": ">=20", "dsh": ">=0.2.1" }`。
