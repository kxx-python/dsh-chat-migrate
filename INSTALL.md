# 安装与使用（另一台电脑）

这个包是 DSH 插件包（bundle），不需要 npm 依赖，拷过去就能用。

## 安装

1. 把 `dsh-chat-migrate` 文件夹解压到任意位置（例如 `D:\dsh-plugins\dsh-chat-migrate`）
2. 打开 DSH 桌面版 → **插件** → **添加插件** → **本地目录**
3. 选中 `dsh-chat-migrate` 这个文件夹（里面应当直接看到 `package.json`）
4. 装好后插件列表里会出现 `dsh-chat-migrate`，左侧栏底部多一个「网页会话迁移」图标

要求：DSH 桌面版（带插件管理页）；插件用到宿主自带的 `@deepseek-ai/dsh-session`、`sessionPersistence`、`workspaceRegistry` 等，不需要额外安装。

## 第一次用

1. 点左侧栏「网页会话迁移」
2. 点「**从浏览器抓取**」：复制弹窗里那一行代码，到已登录的 chat.deepseek.com 标签页按 F12 → Console 粘贴回车（Chrome 首次粘贴可能要手打 `allow pasting`）。面板会自动接住并登录；也可以直接把手里的 token 粘到输入框点「登录」
3. 「刷新列表」拉取会话（GET 优先，遇到 405 会自动改试 POST）
4. 用关键词 / 时间 / 条数 / 导入状态筛选，勾选要的会话
5. 二选一：
   - **导入为会话** → 写成真正的 DSH 会话，出现在该工作区的会话列表里，可继续追问
   - **导入为文件** → 每条会话一份 `.md` 全文 + 一份 `.json`，落到「导入位置」选的目录（默认 `<工作区>/chat-imports/<日期>/`）

## 两个必须知道的点

- **导入为会话后要重启一次 DSH**，侧栏会话列表才会刷新出新行（界面不订阅“新会话入库”事件，`Ctrl+R` 在本壳里也不一定生效）。建议一次把要导的都勾完、导完再重启一次。
- token 只放在宿主内存里，DSH 重启后要重新抓取/粘贴。

## 数据落在哪

| 内容 | 位置 |
|---|---|
| 配置（服务地址、下载目录） | `~/.dsh/chat-migrate/config.json` |
| 导入台账（哪些会话已建会话/已导文件） | `~/.dsh/chat-migrate/sessions.json`、`imports.json` |
| 运行日志 | `~/.dsh/chat-migrate/chat-migrate.log` |
| 导出归档 | `~/Downloads/dsh-chat-migrate/`（面板里可改） |
| 文件导入 | 工作区 `chat-imports/<日期>/`，或面板里选的自定义目录 |

卸载：插件页停用或移除即可，已导入的会话与文件不会被删除。
