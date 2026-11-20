window.__ModuleLoader__.load({
  id: 'dsh-chat-migrate',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useMemo, useRef, useState } = React

    const PKG = 'dsh-chat-migrate'
    const PANEL_ID = 'chat-migrate'
    const API = '/chat-migrate/api'

    /* ---------------- 文案（有 locale 服务时跟随，否则中文） ---------------- */

    const DICT = {
      zh: {
        title: '网页会话迁移',
        subtitle: '把 chat.deepseek.com 的历史会话搬到桌面端：登录 → 导出 → 下载 → 筛选 → 导入',
        login: '登录',
        capture: '从浏览器抓取',
        captureTitle: '从已登录的网页端抓取 token',
        captureStep1: '在已登录 chat.deepseek.com 的标签页按 F12，切到 Console。',
        captureStep2: '粘贴下面这一行并回车；面板会自动接住并按登录处理。',
        copy: '复制这一行',
        copied: '已复制',
        waiting: '正在等待浏览器投递 token…（页面别关，登录后几秒内自动完成）',
        captureFailed: '抓取失败',
        captureAgain: '再试一次',
        captureSecurity: '这段代码只读取本机浏览器里 chat.deepseek.com 的登录凭证，并只发到本机面板地址，不外发。',
        logout: '退出',
        token: '网页端 token',
        tokenHint: '在浏览器已登录 chat.deepseek.com 的页面里取出访问凭证，粘贴到上面。只保存在宿主内存里，重启即失效。',
        baseUrl: '服务地址',
        refresh: '刷新列表',
        export: '导出选中',
        download: '保存到本机',
        importToDesktop: '导入为文件',
        importAsSession: '导入为会话',
        sessionTag: '已建会话',
        reveal: '打开文件夹',
        demo: '载入演示数据',
        ingest: '从导出文件导入',
        search: '搜索标题 / 会话 id',
        range: '更新时间',
        rangeAll: '全部',
        range7: '近 7 天',
        range30: '近 30 天',
        rangeCustom: '自定义',
        minMsg: '最少条数',
        status: '状态',
        statusAll: '全部',
        statusNew: '未导入',
        statusDone: '已导入',
        colTitle: '会话',
        colUpdated: '最后更新',
        colCount: '条数',
        colStatus: '状态',
        colActions: '操作',
        preview: '预览',
        selectAll: '全选当前结果',
        selected: '已选',
        empty: '还没有会话：先登录并刷新列表，或载入演示数据看看界面。',
        notLoggedIn: '未登录',
        loggedIn: '已登录',
        importedTag: '已导入',
        newTag: '未导入',
        busy: '处理中…',
        noResult: '当前筛选没有匹配的会话。',
        saveConfig: '保存设置',
        downloadDir: '下载目录',
        log: '操作记录',
        clearLog: '清空',
        previewTitle: '会话预览',
        close: '关闭',
        result: '结果',
        messages: '条消息',
      },
      en: {
        title: 'Web chat migration',
        subtitle: 'Move chat.deepseek.com history to the desktop: sign in → export → download → filter → import',
        login: 'Sign in',
        capture: 'Capture from browser',
        captureTitle: 'Capture the token from a signed-in web tab',
        captureStep1: 'Open chat.deepseek.com where you are signed in, press F12 and switch to Console.',
        captureStep2: 'Paste the line below and press Enter; the panel picks the token up and signs in.',
        copy: 'Copy the line',
        copied: 'Copied',
        waiting: 'Waiting for the browser token… (keep the tab open; it finishes within seconds of signing in)',
        captureFailed: 'Capture failed',
        captureAgain: 'Try again',
        captureSecurity: 'The snippet only reads the chat.deepseek.com credential already in your own browser and posts it to the local panel address.',
        logout: 'Sign out',
        token: 'Web token',
        tokenHint: 'Copy the access credential from a signed-in chat.deepseek.com tab. It is kept in host memory only and is lost on restart.',
        baseUrl: 'Base URL',
        refresh: 'Refresh list',
        export: 'Export selected',
        download: 'Save to disk',
        importToDesktop: 'Import as files',
        importAsSession: 'Import as sessions',
        sessionTag: 'Session created',
        reveal: 'Open folder',
        demo: 'Load demo data',
        ingest: 'Import export file',
        search: 'Search title / id',
        range: 'Updated',
        rangeAll: 'All',
        range7: 'Last 7 days',
        range30: 'Last 30 days',
        rangeCustom: 'Custom',
        minMsg: 'Min messages',
        status: 'Status',
        statusAll: 'All',
        statusNew: 'Not imported',
        statusDone: 'Imported',
        colTitle: 'Conversation',
        colUpdated: 'Updated',
        colCount: 'Messages',
        colStatus: 'Status',
        colActions: 'Actions',
        preview: 'Preview',
        selectAll: 'Select all results',
        selected: 'selected',
        empty: 'No conversations yet: sign in and refresh, or load demo data to see the panel.',
        notLoggedIn: 'Signed out',
        loggedIn: 'Signed in',
        importedTag: 'Imported',
        newTag: 'New',
        busy: 'Working…',
        noResult: 'No conversation matches the current filters.',
        saveConfig: 'Save settings',
        downloadDir: 'Download folder',
        log: 'Activity',
        clearLog: 'Clear',
        previewTitle: 'Conversation preview',
        close: 'Close',
        result: 'Result',
        messages: 'messages',
      },
    }

    let localeId = 'zh'
    function currentLang() {
      return String(localeId || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
    }
    function t(key) {
      const lang = currentLang()
      return DICT[lang]?.[key] ?? DICT.zh[key] ?? key
    }

    /* ---------------- 样式 ---------------- */

    const C = {
      panel: 'var(--dsw-alias-bg-base)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      surface2: 'var(--dsw-alias-bg-layer-2)',
      border: 'var(--dsw-alias-border-l1)',
      border2: 'var(--dsw-alias-border-l2)',
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      brand: 'var(--dsw-alias-brand-primary)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      err: 'var(--dsw-alias-state-error-primary)',
    }
    // 对比策略：深浅两套主题里，只有「文字色 vs 底色」是设计上保证互相对比的一对。
    // 所以强调态一律用 文字色填充 + 底色文字；普通态用层背景 + 文字色，不赌品牌色深浅。
    const ON_ACCENT = C.panel

    const styles = {
      page: {
        height: '100%',
        boxSizing: 'border-box',
        overflowY: 'auto',
        padding: '20px 24px 64px',
        background: C.panel,
        color: C.text,
        fontSize: 13,
        lineHeight: 1.55,
      },
      wrap: { maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 },
      card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px' },
      h1: { fontSize: 18, fontWeight: 650, margin: 0 },
      sub: { color: C.dim, fontSize: 12, margin: '3px 0 0' },
      row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
      col: { display: 'flex', flexDirection: 'column', gap: 8 },
      // 主按钮：不填品牌色（这个主题 brand 是浅色，白底白字就是这么来的）。
      // 用「层背景 + 文字色边框 + 加粗」表达强调，两种主题都不会撞色。
      btnPrimary: { background: C.surface2, borderColor: C.text, color: C.text, fontWeight: 600 },
      label: { color: C.dim, fontSize: 12 },
      chip: (tone) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        padding: '1px 8px',
        fontSize: 11.5,
        border: `1px solid ${C.border2}`,
        color: tone === 'err' ? C.err : tone === 'ok' ? C.ok : tone === 'warn' ? C.warn : C.dim,
        whiteSpace: 'nowrap',
      }),
      th: {
        textAlign: 'left',
        padding: '6px 8px',
        color: C.dim,
        fontWeight: 600,
        borderBottom: `1px solid ${C.border}`,
        whiteSpace: 'nowrap',
        background: C.surface,
        position: 'sticky',
        top: 0,
      },
      td: { padding: '6px 8px', borderBottom: `1px solid ${C.border}`, verticalAlign: 'middle' },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 },
      log: {
        margin: 0,
        padding: '8px 10px',
        background: C.surface2,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        maxHeight: 160,
        overflowY: 'auto',
        fontSize: 12,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      },
      overlay: {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 60,
      },
      modal: {
        background: C.surface,
        color: C.text,
        border: `1px solid ${C.border2}`,
        borderRadius: 12,
        padding: 18,
        width: 'min(760px, 100%)',
        maxHeight: '80vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      },
    }

    const baseBtn = {      appearance: 'none',
      border: `1px solid var(--dsw-alias-border-l2)`,
      background: 'var(--dsw-alias-bg-layer-2)',
      color: 'var(--dsw-alias-label-primary)',
      borderRadius: 8,
      padding: '6px 12px',
      fontSize: 12.5,
      cursor: 'pointer',
      fontFamily: 'inherit',
    }
    const btn = (extra) => ({ ...baseBtn, ...(extra ?? {}) })

    // 组件内样式：随面板卸载一起移除；只修原生控件的可读性，不碰宿主其它区域。
    const DCM_CSS = `
.dcm-panel input::placeholder, .dcm-panel textarea::placeholder {
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
  opacity: 0.75;
}
.dcm-panel input[type="date"]::-webkit-calendar-picker-indicator,
.dcm-panel input[type="number"]::-webkit-inner-spin-button {
  filter: invert(0.5);
}
.dcm-panel input[type="date"] { color-scheme: light dark; }
`

    function fmtTime(ms) {
      if (!ms) return '—'
      const d = new Date(ms)
      if (Number.isNaN(d.getTime())) return '—'
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    function fmtBytes(n) {
      if (!n) return '0 B'
      if (n < 1024) return `${n} B`
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
      return `${(n / 1024 / 1024).toFixed(2)} MB`
    }

    /* ---------------- 接口 ---------------- */

    async function call(route, options = {}) {
      const res = await fetch(API + route, {
        method: options.method ?? 'GET',
        headers: options.body ? { 'content-type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
        cache: 'no-store',
      })
      let payload = null
      try {
        payload = await res.json()
      } catch {
        payload = null
      }
      if (!payload) throw new Error(`接口 ${route} 无响应（HTTP ${res.status}）`)
      if (payload.ok === false || !res.ok) throw new Error(payload.error || `接口 ${route} 失败（HTTP ${res.status}）`)
      return payload
    }

    /* ---------------- 图标 ---------------- */

    function PanelGlyph({ size = 16 } = {}) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true', style: { flex: 'none' } },
        h('path', { d: 'M4 6h16M4 12h10M4 18h7', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' }),
        h('path', { d: 'M16.5 14.2v5.3m0 0 2-2m-2 2-2-2', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      )
    }

    /* ---------------- 分段选择（不用原生 select：深色主题下原生控件会白底白字） ---------------- */

    function Segments({ value, options, onChange, disabled }) {
      return h(
        'div',
        {
          style: {
            display: 'inline-flex',
            alignItems: 'stretch',
            border: `1px solid ${C.border2}`,
            borderRadius: 8,
            overflow: 'hidden',
            background: 'transparent',
          },
        },
        options.map((opt) =>
          h(
            'button',
            {
              key: opt.value,
              type: 'button',
              onClick: () => onChange(opt.value),
              disabled,
              style: {
                appearance: 'none',
                border: 'none',
                borderLeft: `1px solid ${C.border}`,
                cursor: disabled ? 'default' : 'pointer',
                fontFamily: 'inherit',
                padding: '5px 10px',
                fontSize: 12,
                background: opt.value === value ? C.text : 'transparent',
                color: opt.value === value ? ON_ACCENT : C.text,
                fontWeight: opt.value === value ? 600 : 500,
              },
            },
            opt.label,
          ),
        ),
      )
    }

    function apiOrigin() {
      try {
        const origin = window.location.origin
        if (/^https?:/i.test(origin)) return origin
      } catch {
        /* 非浏览器环境 */
      }
      return ''
    }

    /**
     * 生成给网页端 Console 的一行代码。
     * base 必须是绝对地址：桌面端页面在 dsh-app:// 协议下，相对路径会被解析到 chat.deepseek.com 上，
     * 拿回来的就是一张 HTML 页面（"Unexpected token '<'" 的由来）。
     */
    /**
     * 生成给网页端 Console 的一行代码。
     * base 必须是绝对地址：桌面端页面在 dsh-app:// 协议下，相对路径会被解析到 chat.deepseek.com 上，
     * 拿回来的就是一张 HTML 页面（"Unexpected token '<'" 的由来）。
     * 取值顺序：常见 token 键 → JSON 里的 value/token → 扫一遍包含 token/auth 的键里像 JWT 的值。
     */
    function buildSnippet(base) {
      const apiBase = String(base || '').replace(/\/+$/, '') || `${apiOrigin()}/chat-migrate/api`
      const endpoint = `${apiBase}/token`
      const pick =
        'const read=k=>{try{const raw=localStorage.getItem(k);if(!raw)return"";try{const j=JSON.parse(raw);return (j&&(j.value||j.token||j.accessToken))||raw}catch(e){return raw}}catch(e){return""}};' +
        'let t="";for(const k of ["userToken","user_token","token","access_token"]){t=read(k);if(t)break}' +
        'if(!t){for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i)||"";if(!/token|auth|jwt/i.test(k))continue;const v=read(k);if(v&&v.length>20){t=v;break}}}'
      return (
        '(async()=>{' +
        pick +
        `const res=await fetch(${JSON.stringify(endpoint)},{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token:t})});` +
        'const txt=await res.text();let out;try{out=JSON.parse(txt)}catch(e){out={ok:false,error:"HTTP "+res.status+" 返回的不是 JSON: "+txt.slice(0,160)}}' +
        'console.log("chat-migrate",res.status,out,t?"":"（没在 localStorage 里找到 token）")' +
        '})()'
      )
    }

    /* ---------------- 主面板 ---------------- */

    function Panel() {
      const [state, setState] = useState(normalize({}))
      const [busy, setBusy] = useState('')
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [logs, setLogs] = useState([])
      const [token, setToken] = useState('')
      const [baseUrl, setBaseUrl] = useState('')
      const [downloadDir, setDownloadDir] = useState('')
      const [preview, setPreview] = useState(null)
      const [capture, setCapture] = useState(null)
      const [captureArmed, setCaptureArmed] = useState(false)
      const [captureBase, setCaptureBase] = useState('')
      const [copied, setCopied] = useState(false)
      const captureOpen = Boolean(capture?.open)
      const fileInput = useRef(null)

      /* 筛选 */
      const [keyword, setKeyword] = useState('')
      const [range, setRange] = useState('all')
      const [from, setFrom] = useState('')
      const [to, setTo] = useState('')
      const [minMsg, setMinMsg] = useState('')
      const [statusFilter, setStatusFilter] = useState('all')

      const [selected, setSelected] = useState([])
      const [importMode, setImportMode] = useState('workspace')
      const [importDir, setImportDir] = useState('')
      const [lastImportDir, setLastImportDir] = useState('')

      const pushLog = useCallback((line) => {
        setLogs((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 120))
      }, [])

      const apply = useCallback((payload) => {
        const next = normalize(payload)
        setState(next)
        setBaseUrl((prev) => prev || next.baseUrl)
        setDownloadDir((prev) => prev || next.downloadDir)
        return next
      }, [])

      useEffect(() => {
        let alive = true
        call('/state')
          .then((payload) => {
            if (alive) apply(payload)
          })
          .catch((err) => alive && setError(err.message))
        return () => {
          alive = false
        }
      }, [apply])

      const run = useCallback(
        async (label, fn) => {
          setBusy(label)
          setError('')
          setNotice('')
          try {
            const result = await fn()
            return result
          } catch (err) {
            setError(err.message)
            pushLog(`✗ ${label}：${err.message}`)
            return null
          } finally {
            setBusy('')
          }
        },
        [pushLog],
      )

      const conversations = state.conversations

      const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase()
        const now = Date.now()
        const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : 0
        const toMs = to ? new Date(`${to}T23:59:59`).getTime() : 0
        const min = Number(minMsg) || 0
        return conversations.filter((item) => {
          if (kw && !(`${item.title}`.toLowerCase().includes(kw) || item.id.toLowerCase().includes(kw))) return false
          if (range === '7' && item.updatedAt && now - item.updatedAt > 7 * 86400000) return false
          if (range === '30' && item.updatedAt && now - item.updatedAt > 30 * 86400000) return false
          if (range === 'custom') {
            if (fromMs && item.updatedAt && item.updatedAt < fromMs) return false
            if (toMs && item.updatedAt && item.updatedAt > toMs) return false
          }
          if (min && (item.messageCount || 0) < min) return false
          if (statusFilter === 'new' && item.importedAt) return false
          if (statusFilter === 'done' && !item.importedAt) return false
          return true
        })
      }, [conversations, keyword, range, from, to, minMsg, statusFilter])

      useEffect(() => {
        const alive = new Set(filtered.map((item) => item.id))
        setSelected((prev) => prev.filter((id) => alive.has(id)))
      }, [filtered])

      const selectedSet = useMemo(() => new Set(selected), [selected])
      const allSelected = filtered.length > 0 && filtered.every((item) => selectedSet.has(item.id))

      const toggle = (id) => {
        setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
      }
      const toggleAll = () => {
        setSelected(allSelected ? [] : filtered.map((item) => item.id))
      }

      const idsToUse = () => (selected.length ? selected : filtered.map((item) => item.id))

      /* ---- 动作 ---- */

      const doLogin = () =>
        run(t('login'), async () => {
          const payload = await call('/login', { method: 'POST', body: { token, baseUrl: baseUrl || undefined } })
          apply(payload)
          setToken('')
          setNotice(`登录成功：${payload.account?.name ?? '网页端账号'}`)
          pushLog(`✓ 登录成功（${payload.baseUrl}）`)
        })

      const openCapture = () => {
        setError('')
        setNotice('')
        setCopied(false)
        setCapture({ open: true, status: '' })
        setCaptureArmed(true)
        setCaptureBase((prev) => prev || state.apiBase || apiOrigin())
        pushLog('· 打开浏览器抓取指引，等待 token 投递')
      }

      // 抓取期间轮询：浏览器里的那行代码一投递，这里就完成登录。
      // 即使关掉指引弹窗也继续等（用户可能复制完就去网页端粘贴了）。
      useEffect(() => {
        if (!captureArmed) return undefined
        let stopped = false
        const timer = setInterval(async () => {
          if (stopped) return
          try {
            const payload = await call('/capture/poll')
            if (stopped || !payload.found) return
            clearInterval(timer)
            if (payload.error) {
              setCaptureArmed(false)
              setCapture((prev) => ({ ...(prev ?? {}), open: true, status: payload.error }))
              pushLog(`✗ ${payload.error}`)
              return
            }
            apply(payload)
            setToken('')
            setCapture(null)
            setCaptureArmed(false)
            setNotice(`已从浏览器抓到 token 并登录：${payload.account?.name ?? '网页端账号'}`)
            pushLog('✓ 浏览器抓取 token 成功')
          } catch {
            /* 轮询失败下一跳再试 */
          }
        }, 1500)
        return () => {
          stopped = true
          clearInterval(timer)
        }
      }, [captureArmed, apply, pushLog])

      const copySnippet = async () => {
        const snippet = buildSnippet(captureBase || state.apiBase)
        try {
          await navigator.clipboard.writeText(snippet)
          setCopied(true)
          pushLog('· 已复制抓取代码')
        } catch {
          setCopied(false)
          setError('浏览器不让写剪贴板：可以手动选中代码框里的内容复制')
        }
      }

      const doLogout = () =>
        run(t('logout'), async () => {
          const payload = await call('/logout', { method: 'POST' })
          apply(payload)
          setSelected([])
          pushLog('✓ 已退出')
        })

      const doSaveConfig = () =>
        run(t('saveConfig'), async () => {
          const payload = await call('/config', { method: 'POST', body: { baseUrl, downloadDir } })
          apply(payload)
          pushLog(`✓ 保存设置：下载目录 ${payload.downloadDir}`)
        })

      const doDiagnose = () =>
        run('检测连通', async () => {
          const payload = await call('/diagnose', { method: 'POST' })
          apply(payload)
          const one = (p) => (p?.ok ? `ok/${p.apiCode}` : `${p?.status ?? 'ERR'}${p?.apiCode ? `/${p.apiCode}` : ''}`)
          const summary =
            `账号接口 GET ${one(payload.probe?.getUsers)} · POST ${one(payload.probe?.postUsers)}` +
            ` ｜ 列表接口 GET ${one(payload.probe?.getList)} · POST ${one(payload.probe?.postList)}`
          const module = payload.sessionModule?.ok
            ? `会话模块 ok（format v${payload.sessionModule.version ?? '?'}）`
            : `会话模块不可用：${payload.sessionModule?.error ?? '未知'}`
          setNotice(`连通自检：${summary} ｜ ${module}`)
          pushLog(`· 连通自检 ${summary} ｜ ${module}`)
        })

      const doCopyDiagnostics = () =>
        run('复制诊断', async () => {
          const payload = await call('/diagnose', { method: 'POST' })
          apply(payload)
          const brief = {
            baseUrl: payload.baseUrl,
            workspace: payload.workspace,
            workspaceDir: payload.workspaceDir,
            services: payload.services,
            sessionModule: payload.sessionModule,
            formatVersion: payload.formatVersion,
            probe: payload.probe,
            conversations: payload.conversations?.length ?? 0,
            imported: Object.keys(payload.imported ?? {}).length,
            sessions: Object.keys(payload.sessions ?? {}).length,
          }
          const text = JSON.stringify(brief, null, 2)
          try {
            await navigator.clipboard.writeText(text)
            setNotice('诊断信息已复制到剪贴板，直接贴给我就行')
          } catch {
            setError(`剪切板不可用，手动复制这段：\n${text}`)
          }
          pushLog('· 复制诊断信息')
        })

      const doRefresh = () =>
        run(t('refresh'), async () => {
          const payload = await call('/refresh', { method: 'POST', body: {} })
          const next = apply(payload)
          setNotice(`列表已刷新：${next.conversations.length} 个会话`)
          pushLog(`✓ 刷新列表：${next.conversations.length} 个会话`)
        })

      const doExport = () =>
        run(t('export'), async () => {
          const ids = idsToUse()
          if (!ids.length) throw new Error('没有可导出的会话')
          const payload = await call('/export', { method: 'POST', body: { ids } })
          apply(payload)
          setNotice(`已导出 ${payload.count} 个会话 → ${payload.file}（${fmtBytes(payload.bytes)}）`)
          pushLog(`✓ 导出 ${payload.count} 个会话 → ${payload.name}`)
        })

      const doDownload = () =>
        run(t('download'), async () => {
          let name = state.lastExport?.name
          if (!name) {
            const payload = await call('/export', { method: 'POST', body: { ids: idsToUse() } })
            apply(payload)
            name = payload.name
          }
          const res = await fetch(`${API}/file?name=${encodeURIComponent(name)}`, { cache: 'no-store' })
          if (!res.ok) throw new Error(`下载失败（HTTP ${res.status}）`)
          const blob = await res.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = name
          document.body.appendChild(a)
          a.click()
          a.remove()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
          setNotice(`已下载 ${name}（${fmtBytes(blob.size)}）`)
          pushLog(`✓ 浏览器下载 ${name}`)
        })

      const doImport = () =>
        run(t('importToDesktop'), async () => {
          const ids = idsToUse()
          if (!ids.length) throw new Error('没有可导入的会话')
          const payload = await call('/import', {
            method: 'POST',
            body: { ids, mode: importMode, dir: importMode === 'custom' ? importDir : undefined },
          })
          apply(payload)
          setSelected([])
          setLastImportDir(payload.dir ?? '')
          setNotice(`已导入 ${payload.items.length} 个会话 → ${payload.dir}（Markdown + JSON；不会新增侧栏会话条目）`)
          pushLog(`✓ 导入 ${payload.items.length} 个会话 → ${payload.dir}`)
        })

      /**
       * 把选中的网页会话写成真正的 DSH 会话：
       * 1) host 生成官方导出格式的 ZIP（base64）
       * 2) 面板把 ZIP POST 给 DSH 自带的 /api/deepseek-chat-import/archive?workspaceId=…
       * 3) 官方导入器负责校验并写会话日志，所以侧栏会话列表里会出现这些会话
       */
      const doImportAsSessions = () =>
        run(t('importAsSession'), async () => {
          const ids = idsToUse()
          if (!ids.length) throw new Error('没有可导入的会话')
          const result = await call('/import-sessions', { method: 'POST', body: { ids } })
          const sessionIds = result.sessionIds ?? []
          const skipped = result.skipped ?? []
          apply(result)
          setSelected([])
          const title = result.workspacePath ?? ''
          const firstReason = skipped[0] ? `；首个失败原因：${skipped[0].reason}` : ''
          setNotice(
            `已创建 ${sessionIds.length} 个会话（工作区 ${title}）` +
              `${skipped.length ? `，${skipped.length} 个跳过` : ''}${firstReason}；` +
              '侧栏列表要重新载入界面才会出现新行：点上面的「重新载入界面」，不行再重启 DSH。',
          )
          pushLog(`✓ 会话导入：写入 ${sessionIds.length} 个，跳过 ${skipped.length} 个；点「重新载入界面」后到侧栏看`)
          for (const item of skipped.slice(0, 10)) pushLog(`  · 跳过 ${item.title ?? item.conversationId}：${item.reason}`)
        })

      const doPickDir = () =>
        run('选择目录', async () => {
          const payload = await call('/pick-dir', { method: 'POST' })
          if (!payload.ok || !payload.path) throw new Error(payload.error || '没有选目录')
          setImportDir(payload.path)
          setImportMode('custom')
          pushLog(`· 导入目录改为 ${payload.path}`)
        })

      const doReveal = () =>
        run(t('reveal'), async () => {
          const target = lastImportDir || state.lastExport?.file || state.downloadDir
          const payload = await call('/reveal', { method: 'POST', body: { path: target } })
          setNotice(payload.opened ? `已在系统里打开：${payload.path}` : `目录：${payload.path}`)
          pushLog(`· 打开文件夹 ${payload.path}`)
        })

      const doDemo = () =>
        run(t('demo'), async () => {
          const payload = await call('/demo', { method: 'POST' })
          apply(payload)
          setNotice('已载入演示数据（仅用于看界面，不会真的联网）')
          pushLog('· 载入演示数据')
        })

      const onPickFile = async (event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        await run(t('ingest'), async () => {
          const text = await file.text()
          const payload = await call('/ingest-file', { method: 'POST', body: { name: file.name, json: text } })
          const count = payload.ingested ?? 0
          apply(payload)
          setNotice(`已从 ${file.name} 读入 ${count} 个会话`)
          pushLog(`✓ 读入文件 ${file.name}：${count} 个会话`)
        })
      }

      const doPreview = (id) =>
        run(t('preview'), async () => {
          const payload = await call(`/preview?id=${encodeURIComponent(id)}`)
          setPreview(payload.conversation)
        })

      const busyLabel = busy ? `${busy} · ${t('busy')}` : ''
      const anyBusy = Boolean(busy)

      /* ---- 渲染 ---- */

      return h(
        'div',
        { style: styles.page, className: 'dcm-panel' },
        h('style', null, DCM_CSS),
        h(
          'div',
          { style: styles.wrap },
          // 标题
          h(
            'div',
            { style: { ...styles.row, justifyContent: 'space-between' } },
            h(
              'div',
              null,
              h('h1', { style: styles.h1 }, t('title')),
              h('p', { style: styles.sub }, t('subtitle')),
            ),
            h(
              'div',
              { style: styles.row },
              h('span', { style: styles.chip(state.loggedIn ? 'ok' : 'warn') }, state.loggedIn ? t('loggedIn') : t('notLoggedIn')),
              state.account?.name ? h('span', { style: styles.chip() }, state.account.name) : null,
              h('span', { style: styles.chip() }, `${conversations.length} 个会话`),
              busyLabel ? h('span', { style: styles.chip('warn') }, busyLabel) : null,
            ),
          ),

          // 登录 / 设置
          h(
            'div',
            { style: styles.card },
            h(
              'div',
              { style: { ...styles.row, marginBottom: 10 } },
              h('strong', null, state.loggedIn ? '账号已连接' : '连接网页端账号'),
              state.loggedIn
                ? h('span', { style: styles.chip('ok') }, `已登录 · ${state.baseUrl}`)
                : h('span', { style: styles.chip('warn') }, t('notLoggedIn')),
            ),
            h(
              'div',
              { style: styles.row },
              h('button', { style: btn({ ...styles.btnPrimary }), onClick: openCapture }, t('capture')),
              h('input', {
                style: { ...inputBox, minWidth: 260, flex: '1 1 260px' },
                type: 'password',
                placeholder: t('token'),
                value: token,
                onChange: (e) => setToken(e.target.value),
                autoComplete: 'off',
              }),
              h('button', { style: btn(), onClick: doLogin, disabled: anyBusy || !token.trim() }, t('login')),
              h('button', { style: btn(), onClick: doLogout, disabled: anyBusy || !state.loggedIn }, t('logout')),
            ),
            h(
              'div',
              { style: { ...styles.row, marginTop: 10 } },
              h('span', { style: styles.label }, t('baseUrl')),
              h('input', {
                style: { ...inputBox, minWidth: 240, flex: '0 1 300px' },
                value: baseUrl,
                placeholder: 'https://chat.deepseek.com',
                onChange: (e) => setBaseUrl(e.target.value),
              }),
              h('span', { style: styles.label }, t('downloadDir')),
              h('input', {
                style: { ...inputBox, minWidth: 240, flex: '1 1 320px' },
                value: downloadDir,
                onChange: (e) => setDownloadDir(e.target.value),
              }),
              h('button', { style: btn(), onClick: doSaveConfig, disabled: anyBusy }, t('saveConfig')),
            ),
            h('p', { style: styles.sub }, t('tokenHint')),
          ),

          // 操作
          h(
            'div',
            { style: styles.card },
            h(
              'div',
              { style: styles.row },
              h('button', { style: btn({ ...styles.btnPrimary }), onClick: doRefresh, disabled: anyBusy || !state.loggedIn }, t('refresh')),
              h('button', { style: btn(), onClick: doDiagnose, disabled: anyBusy }, '检测连通'),
              h('button', { style: btn(), onClick: doCopyDiagnostics, disabled: anyBusy }, '复制诊断'),
              h('button', { style: btn(), onClick: doExport, disabled: anyBusy || !conversations.length }, t('export')),
              h('button', { style: btn(), onClick: doDownload, disabled: anyBusy || !conversations.length }, t('download')),
              h('button', { style: btn({ fontWeight: 600 }), onClick: doImportAsSessions, disabled: anyBusy || !conversations.length }, t('importAsSession')),
              h('button', { style: btn(), onClick: doImport, disabled: anyBusy || !conversations.length }, t('importToDesktop')),
              h('button', { style: btn(), onClick: doReveal, disabled: anyBusy }, t('reveal')),
              h('button', { style: btn(), onClick: () => fileInput.current?.click(), disabled: anyBusy }, t('ingest')),
              h('button', { style: btn(), onClick: doDemo, disabled: anyBusy }, t('demo')),
              h('input', { ref: fileInput, type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: onPickFile }),
              h(
                'button',
                {
                  style: btn(),
                  onClick: () => {
                    try {
                      window.location.reload()
                    } catch {
                      setError('这个版本不允许从面板重载，请手动重启 DSH')
                    }
                  },
                },
                '重新载入界面',
              ),
              h('span', { style: { flex: 1 } }),
              h('span', { style: styles.chip() }, `${t('selected')} ${selected.length}`),
            ),
            state.lastExport
              ? h(
                  'p',
                  { style: { ...styles.sub, marginTop: 8 } },
                  `最近导出：${state.lastExport.name ?? state.lastExport.file} · ${fmtBytes(state.lastExport.bytes)} · ${state.lastExport.count} 个会话`,
                )
              : null,
            // 导入落点
            h(
              'div',
              { style: { ...styles.row, marginTop: 10, gap: 8 } },
              h('span', { style: styles.label }, '导入位置'),
              h(Segments, {
                value: importMode,
                onChange: (next) => setImportMode(next),
                options: [
                  { value: 'workspace', label: '工作区' },
                  { value: 'download', label: '下载目录' },
                  { value: 'custom', label: '自定义' },
                ],
              }),
              h('input', {
                style: { ...inputBox, minWidth: 300, flex: '1 1 300px' },
                value:
                  importMode === 'custom'
                    ? importDir
                    : importMode === 'workspace'
                      ? state.workspaceImportDir || state.workspaceDir
                      : `${state.downloadDir}/imports`,
                placeholder: 'F:\\path\\to\\folder',
                onChange: (e) => {
                  setImportDir(e.target.value)
                  setImportMode('custom')
                },
              }),
              h('button', { style: btn(), onClick: doPickDir, disabled: anyBusy }, '选择目录'),
            ),
            h(
              'p',
              { style: { ...styles.sub, marginTop: 6 } },
              '两个导入按钮不一样：' +
                '「导入为会话」把选中会话转成官方导出包，交给 DSH 自带的导入器写成**真会话**（侧栏会话列表里会出现，可继续追问）；' +
                '「导入为文件」只把 .md 全文 + .json 写到上面这个目录（工作区文件面板里翻得到），不会新增会话条目。' +
                '文件面板不会自动刷新，切一下会话或重开就能看到，不用重启 DSH。',
            ),
            lastImportDir
              ? h(
                  'div',
                  { style: { ...styles.row, marginTop: 8, gap: 8 } },
                  h('span', { style: styles.chip('ok') }, `最近导入：${lastImportDir}`),
                  h('button', { style: { ...baseBtn, padding: '3px 9px' }, onClick: doReveal }, '打开这个文件夹'),
                  h(
                    'button',
                    {
                      style: { ...baseBtn, padding: '3px 9px' },
                      onClick: async () => {
                        try {
                          await navigator.clipboard.writeText(lastImportDir)
                          pushLog('· 已复制导入目录')
                        } catch {
                          setError('浏览器不让写剪贴板：手动选中地址复制')
                        }
                      },
                    },
                    '复制路径',
                  ),
                )
              : null,
          ),

          // 筛选
          h(
            'div',
            { style: styles.card },
            h(
              'div',
              { style: { ...styles.row, gap: 10 } },
              h('input', {
                style: { ...inputBox, minWidth: 200, flex: '1 1 200px' },
                placeholder: t('search'),
                value: keyword,
                onChange: (e) => setKeyword(e.target.value),
              }),
              h(Segments, {
                value: range,
                onChange: setRange,
                options: [
                  { value: 'all', label: t('rangeAll') },
                  { value: '7', label: t('range7') },
                  { value: '30', label: t('range30') },
                  { value: 'custom', label: t('rangeCustom') },
                ],
              }),
              range === 'custom'
                ? h('input', { style: inputBox, type: 'date', value: from, onChange: (e) => setFrom(e.target.value) })
                : null,
              range === 'custom'
                ? h('input', { style: inputBox, type: 'date', value: to, onChange: (e) => setTo(e.target.value) })
                : null,
              h('input', {
                style: { ...inputBox, width: 90 },
                type: 'number',
                min: 0,
                placeholder: t('minMsg'),
                value: minMsg,
                onChange: (e) => setMinMsg(e.target.value),
              }),
              h(Segments, {
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { value: 'all', label: t('statusAll') },
                  { value: 'new', label: t('statusNew') },
                  { value: 'done', label: t('statusDone') },
                ],
              }),
              h('button', { style: btn(), onClick: toggleAll, disabled: !filtered.length }, t('selectAll')),
              h('span', { style: styles.chip() }, `${filtered.length} / ${conversations.length}`),
            ),
          ),

          // 提示 / 错误
          error ? h('div', { style: { ...styles.card, borderColor: C.err, color: C.err, whiteSpace: 'pre-wrap' } }, error) : null,
          notice ? h('div', { style: { ...styles.card, borderColor: C.ok, color: C.ok, whiteSpace: 'pre-wrap' } }, notice) : null,

          // 列表
          h(
            'div',
            { style: { ...styles.card, padding: 0, overflow: 'hidden' } },
            h(
              'div',
              { style: { maxHeight: 460, overflowY: 'auto' } },
              h(
                'table',
                { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 } },
                h(
                  'thead',
                  null,
                  h(
                    'tr',
                    null,
                    h('th', { style: { ...styles.th, width: 34 } },
                      h('input', { type: 'checkbox', checked: allSelected, onChange: toggleAll, 'aria-label': t('selectAll') }),
                    ),
                    h('th', { style: styles.th }, t('colTitle')),
                    h('th', { style: { ...styles.th, width: 150 } }, t('colUpdated')),
                    h('th', { style: { ...styles.th, width: 70 } }, t('colCount')),
                    h('th', { style: { ...styles.th, width: 90 } }, t('colStatus')),
                    h('th', { style: { ...styles.th, width: 120 } }, t('colActions')),
                  ),
                ),
                h(
                  'tbody',
                  null,
                  !filtered.length
                    ? h(
                        'tr',
                        null,
                        h('td', { style: { ...styles.td, color: C.dim, padding: '22px 10px' }, colSpan: 6 }, conversations.length ? t('noResult') : t('empty')),
                      )
                    : filtered.map((item) =>
                        h(
                          'tr',
                          { key: item.id, style: { background: selectedSet.has(item.id) ? C.surface2 : 'transparent' } },
                          h('td', { style: styles.td }, h('input', { type: 'checkbox', checked: selectedSet.has(item.id), onChange: () => toggle(item.id) })),
                          h(
                            'td',
                            { style: styles.td },
                            h('div', { style: { fontWeight: 550 } }, item.title),
                            h('div', { style: { ...styles.mono, color: C.dim } }, item.id),
                          ),
                          h('td', { style: styles.td }, fmtTime(item.updatedAt)),
                          h('td', { style: styles.td }, String(item.messageCount || 0)),
                          h(
                            'td',
                            { style: styles.td },
                            item.sessionAt
                              ? h('span', { style: styles.chip('ok') }, t('sessionTag'))
                              : item.importedAt
                                ? h('span', { style: styles.chip('ok') }, t('importedTag'))
                                : h('span', { style: styles.chip('warn') }, t('newTag')),
                          ),
                          h(
                            'td',
                            { style: styles.td },
                            h('button', { style: { ...baseBtn, padding: '3px 9px' }, onClick: () => doPreview(item.id), disabled: anyBusy }, t('preview')),
                          ),
                        ),
                      ),
                ),
              ),
            ),
          ),

          // 日志
          h(
            'div',
            { style: styles.card },
            h(
              'div',
              { style: { ...styles.row, marginBottom: 8 } },
              h('strong', null, t('log')),
              h('span', { style: { flex: 1 } }),
              h('button', { style: { ...baseBtn, padding: '3px 9px' }, onClick: () => setLogs([]) }, t('clearLog')),
            ),
            h('pre', { style: styles.log }, logs.length ? logs.join('\n') : '—'),
          ),
        ),

        // 预览弹窗
        preview
          ? h(
              'div',
              { style: styles.overlay, onClick: () => setPreview(null) },
              h(
                'div',
                { style: styles.modal, onClick: (e) => e.stopPropagation(), role: 'dialog', 'aria-modal': 'true' },
                h(
                  'div',
                  { style: { ...styles.row, justifyContent: 'space-between' } },
                  h('strong', null, `${t('previewTitle')} · ${preview.title}`),
                  h('button', { style: { ...baseBtn, padding: '3px 9px' }, onClick: () => setPreview(null) }, t('close')),
                ),
                h('div', { style: { ...styles.sub } }, `${preview.total} ${t('messages')} · ${preview.id}`),
                ...(preview.messages ?? []).map((m, i) =>
                  h(
                    'div',
                    { key: `${m.id}-${i}`, style: { borderTop: `1px solid ${C.border}`, paddingTop: 8 } },
                    h('div', { style: { ...styles.label, marginBottom: 4 } }, `${m.role === 'user' ? '我' : 'DeepSeek'} · ${fmtTime(m.sentAt)}`),
                    h('div', { style: { whiteSpace: 'pre-wrap' } }, m.text),
                  ),
                ),
              ),
            )
          : null,

        // 浏览器抓取指引
        captureOpen
          ? h(
              'div',
              { style: styles.overlay, onClick: () => setCapture(null) },
              h(
                'div',
                { style: styles.modal, onClick: (e) => e.stopPropagation(), role: 'dialog', 'aria-modal': 'true' },
                h(
                  'div',
                  { style: { ...styles.row, justifyContent: 'space-between' } },
                  h('strong', null, t('captureTitle')),
                  h('button', { style: { ...baseBtn, padding: '3px 9px' }, onClick: () => setCapture(null) }, t('close')),
                ),
                h('div', { style: styles.label }, `1. ${t('captureStep1')}`),
                h('div', { style: styles.label }, `2. ${t('captureStep2')}`),
                h(
                  'pre',
                  {
                    style: {
                      ...styles.log,
                      maxHeight: 200,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                      fontSize: 11.5,
                      whiteSpace: 'pre-wrap',
                    },
                  },
                  buildSnippet(captureBase || state.apiBase),
                ),
                h(
                  'div',
                  { style: styles.row },
                  h('span', { style: styles.label }, '面板地址'),
                  h('input', {
                    style: { ...inputBox, minWidth: 260, flex: '1 1 260px' },
                    value: captureBase,
                    placeholder: 'http://127.0.0.1:62933/chat-migrate/api',
                    onChange: (e) => setCaptureBase(e.target.value),
                  }),
                ),
                h(
                  'div',
                  { style: styles.row },
                  h('button', { style: btn({ ...styles.btnPrimary }), onClick: copySnippet }, copied ? t('copied') : t('copy')),
                  h('span', { style: styles.chip(captureBase ? 'ok' : 'warn') }, captureBase ? `投递到 ${captureBase}/token` : '缺少面板地址'),
                  h('span', { style: styles.chip('warn') }, t('waiting')),
                ),
                capture?.status
                  ? h(
                      'div',
                      { style: styles.row },
                      h('span', { style: { ...styles.chip('err'), whiteSpace: 'pre-wrap' } }, `${t('captureFailed')}：${capture.status}`),
                      h('button', { style: btn(), onClick: openCapture }, t('captureAgain')),
                    )
                  : null,
                h('p', { style: styles.sub }, t('captureSecurity')),
              ),
            )
          : null,
      )
    }

    const inputBox = {
      border: '1px solid var(--dsw-alias-border-l2)',
      background: 'transparent',
      color: 'var(--dsw-alias-label-primary)',
      borderRadius: 8,
      padding: '6px 9px',
      fontSize: 12.5,
      fontFamily: 'inherit',
    }

    function normalize(payload) {
      const conversations = Array.isArray(payload?.conversations) ? payload.conversations : []
      return {
        loggedIn: Boolean(payload?.loggedIn),
        baseUrl: String(payload?.baseUrl ?? ''),
        apiBase: String(payload?.apiBase ?? ''),
      account: payload?.account ?? null,
        fetchedAt: Number(payload?.fetchedAt ?? 0),
        downloadDir: String(payload?.downloadDir ?? ''),
        workspaceDir: String(payload?.workspaceDir ?? ''),
        workspaceImportDir: String(payload?.workspaceImportDir ?? ''),
        lastExport: payload?.lastExport ?? null,
        conversations: conversations.map((item) => ({
          id: String(item?.id ?? ''),
          title: String(item?.title ?? '(无标题会话)'),
          createdAt: Number(item?.createdAt ?? 0),
          updatedAt: Number(item?.updatedAt ?? 0),
          messageCount: Number(item?.messageCount ?? 0),
          hasMessages: Boolean(item?.hasMessages),
          source: item?.source ?? 'deepseek-web',
          importedAt: item?.importedAt ?? null,
          sessionAt: item?.sessionAt ?? null,
        })),
      }
    }

    /* ---------------- 注册 ---------------- */

    const inject = ['slots']

    function applySlot(ctx) {
      const slots = ctx?.slots
      if (!slots) return
      try {
        const localeSvc = ctx.get?.('locale')
        try {
          const snap = localeSvc?.getLocale?.()
          if (snap && typeof snap.id === 'string') localeId = snap.id
          localeSvc?.subscribe?.(() => {
            const next = localeSvc?.getLocale?.()
            if (next && typeof next.id === 'string') localeId = next.id
          })
        } catch {
          /* locale 不是必须的 */
        }

        slots.inject('main', () => slots.register({ name: 'main', key: PANEL_ID, locale: PKG }, Panel))
        slots.inject('sidebar.panellist', () =>
          slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 40, label: () => t('title'), locale: PKG }, PanelGlyph),
        )
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) console.error('[chat-migrate] 注册面板失败：', error)
      }
    }

    return { name: PKG, inject, apply: applySlot }
  },
})
