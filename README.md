# dsh-chat-migrate

把网页端（chat.deepseek.com）的历史会话搬到桌面端。左侧栏多一个「网页会话迁移」入口，点开就是迁移面板。

## 面板里能做什么

0. **直接抓当前登录** — 点「从浏览器抓取」：面板给出一行代码，复制后到已登录的 chat.deepseek.com 标签页 Console 里回车，token 会自己投递回本机面板（`POST /chat-migrate/api/token`，跨域已放开），面板轮询到后自动校验并登录，不用手抄 token。想手贴也行，右边输入框还在。
1. **账号登录** — 粘贴网页端 token（可选填服务地址，默认 `https://chat.deepseek.com`），点「登录」会先访问 `/api/v0/users/current` 校验；token 只放在宿主内存，重启失效，不落盘。
2. **记录导出** — 「刷新列表」按页拉取会话标题与时间；「导出选中」逐个拉取消息并写成一份 JSON 归档到下载目录（默认 `~/Downloads/dsh-chat-migrate/dsh-chat-migrate-<时间戳>.json`）。
3. **记录下载** — 「保存到本机」用浏览器下载那份归档；「打开文件夹」把所在目录交给系统文件管理器。
4. **会话筛选** — 关键词（标题/会话 id）、更新时间（全部 / 近 7 天 / 近 30 天 / 自定义起止）、最少消息条数、导入状态（全部 / 未导入 / 已导入），配合「全选当前结果」。筛选条用分段按钮，不用原生下拉框（深色主题下原生下拉会白底白字）。
5. **导入为会话（真会话）** — 「导入为会话」把勾选的会话直接写成 DSH 会话：按 `@deepseek-ai/dsh-deepseek-chat-import` 的构造方式生成种子事件（`turn/start`、`step/start`、空 `system/message` 头、`user/message`、`assistant/message`、`step/end`、`turn/end`、`session/title`），先用 `Session.create()` 跑同一套种子校验，再经 `sessionPersistence` 写入、`sessionProjectionCache.coldSnapshot()` 刷一次标题等摘要，最后 `attachSession` 挂到工作区。缺了刷缓存这步，会话虽然存在但侧栏列表拿不到摘要，看着就像没导进来。
6. **导入为文件** — 「导入为文件」只落盘：每条会话一份 `<标题>__<id>.md`（全文 Markdown）和同名 `.json`，位置按「导入位置」选（`工作区` → `<工作区>/chat-imports/<日期>/`、`下载目录`、`自定义`）。这条不会新增会话条目。

> 两者区别：要「侧栏会话列表里多出来」就用「导入为会话」；只是想把聊天记录留成文件就用「导入为文件」。
>
> 提示：会话是直接写进会话库的（经过官方同款种子校验，并刷了投影缓存），但侧栏列表要在界面重新载入后才出现新行。面板上有「重新载入界面」按钮；`Ctrl+R` 在这个桌面壳里不一定生效，最稳的是一次导完再重启一次 DSH。

另外两条离线路径：`从导出文件导入` 可以直接吃本插件或官方导出格式的 `conversations` JSON；`载入演示数据` 写三条明确标注的演示会话，用来看界面，不联网。

## 边界

- 只写下载目录（可在面板里改），不碰 DSH 的会话日志，不会伪造 DSH 会话。
- 网页端接口路径按 `/api/v0/chat_session/fetch_page`、`/api/v0/chat/history_messages` 取；接口变动时面板会显示原始报错，不静默成功。
- 登录态与列表都在宿主内存，宿主重启后需要重新登录并刷新。

## 文件

- `index.js` — Host 半边：`/chat-migrate/api/*` 路由、归档与 Markdown 生成、写盘、导入台账。
- `client.js` — Client 半边：`sidebar.panellist` 图标 + `main` 面板。
- `locale/*.json`、`docs/`、`icon.svg` — 插件详情页与图标。
