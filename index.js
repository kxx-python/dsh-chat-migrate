/**
 * dsh-chat-migrate — 把网页端（chat.deepseek.com）的历史会话搬到桌面端。
 *
 * Host 半边负责：登录态、拉取会话列表 / 消息、导出归档文件、写盘、导入到本地目录。
 * Client 半边（client.js）负责：左侧栏入口 + 主面板（登录、筛选、勾选、导出、下载、导入）。
 *
 * HTTP API 挂在 DSH 自己的 webServer 上（同源，面板直接 fetch）：
 *   GET  /chat-migrate/api/state
 *   POST /chat-migrate/api/login        { token, baseUrl? }
 *   POST /chat-migrate/api/logout
 *   POST /chat-migrate/api/config       { baseUrl?, downloadDir? }
 *   POST /chat-migrate/api/refresh      { withMessages?, ids? }
 *   POST /chat-migrate/api/export       { ids?, withMessages? }
 *   GET  /chat-migrate/api/file?name=   → 下载归档文件
 *   GET  /chat-migrate/api/preview?id=  → 单个会话前几条消息
 *   POST /chat-migrate/api/import       { ids, dir? }
 *   POST /chat-migrate/api/build-archive { ids } → 生成官方导出 ZIP（base64），
 *        面板把它 POST 给 DSH 自带的 /api/deepseek-chat-import/archive?workspaceId=…，
 *        由官方导入器写成真正的 DSH 会话（侧栏会话列表里会出现）。
 *   POST /chat-migrate/api/sessions-recorded { ids, sessionIds, workspaceId }
 *   POST /chat-migrate/api/ingest-file  { name?, json } → 导入网页导出的 JSON
 *   POST /chat-migrate/api/demo         → 写入一组演示数据（明确标注）
 *   POST /chat-migrate/api/reveal       { path? }
 */

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const PKG = 'dsh-chat-migrate'
const API = '/chat-migrate/api'
const DEFAULT_BASE_URL = 'https://chat.deepseek.com'
const FETCH_TIMEOUT_MS = 20000
const MAX_BODY_BYTES = 32 * 1024 * 1024
const ARCHIVE_FORMAT = 'dsh-chat-migrate/archive@1'

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体太大（上限 32 MB）'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw.trim()) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function toMs(value) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n < 1e12 ? Math.round(n * 1000) : Math.round(n)
}

function safeName(text, fallback = 'session') {
  const base = String(text ?? '')
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const cut = base.slice(0, 60) || fallback
  return cut.replace(/[. ]+$/, '') || fallback
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
}

function dayStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}

/* ------------------------------------------------------------------ */
/* 归一化：把网页端返回的几种形状收成统一结构                          */
/* ------------------------------------------------------------------ */

function pickList(payload) {
  const candidates = [
    payload?.data?.biz_data?.chat_sessions,
    payload?.data?.chat_sessions,
    payload?.data?.biz_data?.sessions,
    payload?.data?.sessions,
    payload?.chat_sessions,
    payload?.sessions,
    Array.isArray(payload?.data) ? payload.data : null,
  ]
  for (const item of candidates) {
    if (Array.isArray(item)) return item
  }
  return []
}

export function normalizeSessions(payload) {
  const rows = pickList(payload)
  const out = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const id = String(row.id ?? row.session_id ?? row.chat_session_id ?? row.sessionId ?? '').trim()
    if (!id) continue
    out.push({
      id,
      title: String(row.title ?? row.name ?? '(无标题会话)').trim() || '(无标题会话)',
      createdAt: toMs(row.created_at ?? row.createdAt ?? row.inserted_at ?? row.insertedAt),
      updatedAt: toMs(row.updated_at ?? row.updatedAt ?? row.update_time ?? row.inserted_at),
      messageCount: Number(row.message_count ?? row.messageCount ?? row.messages_count ?? 0) || 0,
    })
  }
  return out
}

function textOf(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : textOf(part?.text ?? part?.content ?? '')))
      .filter(Boolean)
      .join('\n')
  }
  if (content && typeof content === 'object') {
    return textOf(content.text ?? content.content ?? content.value ?? '')
  }
  return ''
}

export function normalizeMessages(payload) {
  const rows =
    payload?.data?.biz_data?.chat_messages ??
    payload?.data?.chat_messages ??
    payload?.data?.biz_data?.messages ??
    payload?.data?.messages ??
    payload?.chat_messages ??
    payload?.messages ??
    (Array.isArray(payload?.data) ? payload.data : []) ??
    []

  const out = []
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue
    const fragments = Array.isArray(row.fragments) ? row.fragments : []
    const fragmentText = fragments
      .map((frag) => textOf(frag?.content ?? frag?.text ?? ''))
      .filter(Boolean)
      .join('\n')
    const text = (fragmentText || textOf(row.content ?? row.text ?? '')).trim()
    if (!text) continue
    const rawRole = String(row.role ?? row.author ?? '').toLowerCase()
    const fragmentHint = String(fragments[0]?.type ?? '').toLowerCase()
    const isUser = rawRole.includes('user') || rawRole === 'request' || (!rawRole && fragmentHint === 'request')
    out.push({
      id: String(row.message_id ?? row.id ?? `${out.length}`),
      role: isUser ? 'user' : 'assistant',
      text,
      sentAt: toMs(row.sent_at ?? row.inserted_at ?? row.created_at ?? row.time),
    })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 归档 / Markdown                                                     */
/* ------------------------------------------------------------------ */

export function buildArchive(conversations, { source = 'deepseek-web' } = {}) {
  return {
    format: ARCHIVE_FORMAT,
    source,
    exportedAt: new Date().toISOString(),
    count: conversations.length,
    conversations: conversations.map((item) => ({
      id: item.id,
      title: item.title,
      createdAt: item.createdAt ?? 0,
      updatedAt: item.updatedAt ?? 0,
      messages: (item.messages ?? []).map((m) => ({
        role: m.role,
        text: m.text,
        sentAt: m.sentAt ?? 0,
      })),
    })),
  }
}

function fmtTime(ms) {
  if (!ms) return '未知时间'
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function renderMarkdown(item) {
  const lines = [`# ${item.title || '(无标题会话)'}`, '']
  lines.push(`- 会话 id：\`${item.id}\``)
  lines.push(`- 最后更新：${fmtTime(item.updatedAt)}`)
  lines.push(`- 消息条数：${(item.messages ?? []).length}`)
  lines.push('')
  for (const msg of item.messages ?? []) {
    lines.push(`## ${msg.role === 'user' ? '我' : 'DeepSeek'} · ${fmtTime(msg.sentAt)}`)
    lines.push('')
    lines.push(msg.text)
    lines.push('')
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 官方导出格式（export_format_version 3）与最小 ZIP 写入               */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** 只写 STORE（不压缩）条目：官方解压器对 stored 条目只要求声明大小与实际一致。 */
export function buildZip(files) {
  const encoder = new TextEncoder()
  const locals = []
  const centrals = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = file.data instanceof Uint8Array ? file.data : encoder.encode(String(file.data))
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length + data.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 名字
    lv.setUint16(8, 0, true) // STORE
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, data.length, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    locals.push(local)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true)
    cv.setUint16(32, 0, true)
    cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)
    centrals.push(central)
    offset += local.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, centrals.length, true)
  ev.setUint16(10, centrals.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

/**
 * 把一条网页会话转成官方导出里的一份 chat_sessions/{id}.json：
 * 线性消息链（id 递增、parent_id 指上一个），USER→REQUEST、ASSISTANT→RESPONSE。
 * 官方转换器会按 USER+ASSISTANT 成对建 turn，所以开头的 ASSISTANT 与孤立 ASSISTANT 丢掉。
 */
export function toExportSession(conversation) {
  const messages = []
  let nextId = 0
  let parentId = null
  let awaitingReply = false
  const push = (role, text, at) => {
    const time = Number.isFinite(at) && at > 0 ? at : Date.now()
    messages.push({
      id: nextId,
      parent_id: parentId,
      role,
      status: 'FINISHED',
      inserted_at: new Date(time).toISOString(),
      fragments: [{ type: role === 'USER' ? 'REQUEST' : 'RESPONSE', content: String(text ?? '') }],
    })
    parentId = nextId
    nextId += 1
  }
  for (const message of conversation.messages ?? []) {
    const text = String(message?.text ?? '')
    if (!text.trim()) continue
    if (message.role === 'user') {
      push('USER', text, message.sentAt)
      awaitingReply = true
    } else if (awaitingReply) {
      push('ASSISTANT', text, message.sentAt)
      awaitingReply = false
    }
  }
  const createdAt = conversation.createdAt || conversation.updatedAt || Date.now()
  return {
    id: String(conversation.id),
    title: conversation.title ?? null,
    current_message_id: messages.length ? messages[messages.length - 1].id : null,
    inserted_at: new Date(createdAt).toISOString(),
    messages,
    __updatedAt: conversation.updatedAt || createdAt,
  }
}

/** 组装官方导入器认的整包 ZIP（manifest + index + 每会话一个文件）。 */
export function buildExportArchive(conversations) {
  const files = conversations.map(toExportSession).filter((file) => file.messages.length > 0)
  if (!files.length) throw new Error('选中的会话都没有可导入的消息')
  files.sort((a, b) => (b.__updatedAt || 0) - (a.__updatedAt || 0))
  const index = files.map((file) => ({
    id: file.id,
    inserted_at: file.inserted_at,
    updated_at: new Date(file.__updatedAt || Date.now()).toISOString(),
  }))
  const entries = [
    { name: 'manifest.json', data: JSON.stringify({ export_format_version: 3 }) },
    { name: 'chat_session_index.json', data: JSON.stringify(index) },
    ...files.map((file) => {
      const { __updatedAt, ...payload } = file
      return { name: `chat_sessions/${file.id}.json`, data: JSON.stringify(payload) }
    }),
  ]
  return { bytes: buildZip(entries), count: files.length }
}

/* ------------------------------------------------------------------ */
/* 写成真正的 DSH 会话                                                  */
/* ------------------------------------------------------------------ */

let dshSessionModule = null

/** 从 DSH 安装目录解析 @deepseek-ai/dsh-session（与宿主同一份模块实例）。 */
async function loadDshSession() {
  if (!dshSessionModule) {
    dshSessionModule = (async () => {
      const { createRequire } = await import('node:module')
      const { pathToFileURL } = await import('node:url')
      const exeDir = path.dirname(process.execPath || '')
      const anchors = [
        process.env.DSH_INSTALL_DIR,
        process.env.DSH_HOME ? path.join(process.env.DSH_HOME, '..') : '',
        process.resourcesPath ? path.join(process.resourcesPath, 'app.asar') : '',
        process.resourcesPath || '',
        path.join(exeDir, 'resources', 'app.asar'),
        path.join(exeDir, '..', 'resources', 'app.asar'),
        exeDir,
        '',
      ].filter(Boolean)

      const errors = []
      for (const anchor of anchors) {
        try {
          const requireFrom = anchor ? createRequire(path.join(anchor, 'package.json')) : createRequire(import.meta.url)
          const resolved = requireFrom.resolve('@deepseek-ai/dsh-session')
          return await import(pathToFileURL(resolved).href)
        } catch (error) {
          errors.push(`${anchor || '(自身)'}: ${error?.message ?? error}`)
        }
      }
      const err = new Error(`找不到 @deepseek-ai/dsh-session：${errors.slice(0, 4).join(' ／ ')}`)
      err.code = 'session-module-missing'
      dshSessionModule = null
      throw err
    })()
  }
  return dshSessionModule
}

/** 探测会话模块是否可用（诊断用，不抛错）。 */
async function probeSessionModule() {
  try {
    const mod = await loadDshSession()
    return { ok: true, version: mod.SESSION_FORMAT_VERSION ?? null, hasSession: typeof mod.Session?.create === 'function' }
  } catch (error) {
    dshSessionModule = null
    return { ok: false, error: String(error?.message ?? error) }
  }
}

/** 会话格式版本：优先问会话模块，其次看库里已有会话的 header；都没有就返回 null（不瞎猜）。 */
async function detectFormatVersion(rt, mod) {
  if (mod && mod.SESSION_FORMAT_VERSION) return mod.SESSION_FORMAT_VERSION
  try {
    const persistence = rt.ctx?.get?.('sessionPersistence')
    const list = await persistence.list({ signal: AbortSignal.timeout(5000) })
    const hit = (list ?? []).find((snap) => snap?.header?.version)
    if (hit) return hit.header.version
  } catch {
    /* 读不到就返回 null */
  }
  return null
}

/**
 * 按官方导入器的构造方式生成一条会话的种子事件：
 * turn/start → step/start →（第一轮补一个空 system 头）user/message → assistant/message → step/end → turn/end，
 * 第一轮结束后补一个 session/title。seq 连续、time 单调不减。
 */
export function buildSeedEvents(conversation) {
  const events = []
  let time = 0
  const add = (input) => {
    events.push({ ...input, seq: events.length, time })
  }
  const at = (value) => {
    const ms = Number(value)
    if (Number.isFinite(ms) && ms > 0) time = Math.max(time, ms)
  }
  const pairs = []
  let pending = null
  for (const message of conversation.messages ?? []) {
    const text = String(message?.text ?? '')
    if (!text.trim()) continue
    if (message.role === 'user') pending = { text, sentAt: message.sentAt }
    else if (pending) {
      pairs.push([pending, { text, sentAt: message.sentAt }])
      pending = null
    }
  }
  if (!pairs.length) throw new Error('没有可导入的问答对')

  let turn = 0
  for (const [user, reply] of pairs) {
    turn += 1
    const step = 1
    at(user.sentAt)
    add({ type: 'turn/start', data: { turn } })
    add({ type: 'step/start', data: { turn, step } })
    if (turn === 1) {
      // 空的 system 头占住 surface 第 0 个节点，之后真正跑起来时会被替换，而不是追加一条 system 消息。
      add({
        type: 'system/message',
        data: { turn, step, message: { id: randomUUID(), role: 'system', content: [], source: { kind: 'system-prompt' } } },
        surfaceOp: 'append',
      })
    }
    add({
      type: 'user/message',
      // user/message 的 data 就是消息本身（不像 assistant/message 那样包一层 { turn, step, message }）
      data: { id: randomUUID(), role: 'user', content: [{ type: 'text', text: user.text }], source: { kind: 'user' } },
      surfaceOp: 'append',
    })
    at(reply.sentAt)
    add({
      type: 'assistant/message',
      data: {
        turn,
        step,
        message: {
          id: randomUUID(),
          role: 'assistant',
          content: [{ type: 'text', text: reply.text }],
          source: { kind: 'model', provider: 'deepseek-chat-export', model: 'deepseek-chat-export' },
        },
        stream: [],
      },
      surfaceOp: 'append',
    })
    add({ type: 'step/end', data: { turn, step } })
    add({ type: 'turn/end', data: { turn, reason: { kind: 'completed' } } })
    if (turn === 1 && conversation.title) {
      add({ type: 'session/title', data: { title: String(conversation.title), messageSeqs: [], source: { kind: 'user' } } })
    }
  }
  return events
}

/** 写一条会话并挂到工作区；先跑 Session.create 的种子校验，校验不过就不落盘。 */
async function writeConversationAsSession(rt, conversation, workspace) {
  const persistence = rt.ctx?.get?.('sessionPersistence')
  const registry = rt.ctx?.get?.('workspaceRegistry')
  if (!persistence || !registry) throw new Error('宿主缺少 sessionPersistence / workspaceRegistry')

  // 会话模块只用来做官方同款种子校验；拿不到时退回「按库里已有 header 的版本写 + 读回验证」，
  // 这样在别的安装形态（非 Electron、源码启动）下也能导入。
  let mod = null
  try {
    mod = await loadDshSession()
  } catch (error) {
    rt.log(`会话模块不可用，改用兜底写入：${error?.message ?? error}`)
  }

  const events = buildSeedEvents(conversation)
  const version = await detectFormatVersion(rt, mod)
  if (!version) {
    throw new Error(
      '无法确定会话格式版本：没加载到 @deepseek-ai/dsh-session，库里也还没有任何会话可参考。' +
        '先在这个 DSH 里随便新建或打开一个会话，再回来导一次。',
    )
  }
  const rawId = randomUUID()
  const id = mod && typeof mod.SessionId === 'function' ? mod.SessionId(rawId) : rawId
  const header = { version, id, createdAt: events[0]?.time || Date.now(), cwd: workspace.path, isSeeded: false }
  if (mod?.Session && typeof mod.Session.create === 'function') mod.Session.create(id, events, header)

  const signal = AbortSignal.timeout(30000)
  const handle = await persistence.create(header, { signal })
  try {
    await handle.append(events)
    await handle.flush()
  } finally {
    await handle.close()
  }

  // 读回来一次：存储层解析不了就等于坏会话，宁可不挂到工作区。
  const verify = await persistence.open(id, 'read', { signal: AbortSignal.timeout(15000) })
  try {
    const back = await verify.read(0, events.length + 16)
    if (!back?.events || back.events.length < events.length) {
      throw new Error(`写入校验失败：读回 ${back?.events?.length ?? 0} 个事件，应为 ${events.length}`)
    }
  } finally {
    await verify.close()
  }

  const ws = typeof registry.get === 'function' ? registry.get(workspace.id) : undefined
  if (!ws) throw new Error(`工作区 ${workspace.id} 不存在`)
  await ws.attachSession(id)

  // 官方导入器在写完会话后还会刷一次投影缓存（标题等摘要），侧栏列表要用它；漏了这步
  // 会话虽然存在，但列表拿不到摘要，看起来就像“没导进来”。
  const projectionCache = rt.ctx?.get?.('sessionProjectionCache')
  if (projectionCache && typeof projectionCache.coldSnapshot === 'function') {
    try {
      projectionCache.coldSnapshot(header, 0, events)
    } catch (error) {
      rt.log(`投影缓存写入失败（不影响会话本身）：${error?.message ?? error}`)
    }
  }
  return String(id)
}

/* ------------------------------------------------------------------ */
/* 运行时                                                              */
/* ------------------------------------------------------------------ */

function createRuntime(config, ctx) {
  const root = path.join(dshHome(), 'chat-migrate')
  const saved = readJson(path.join(root, 'config.json'), {})
  const downloadDir = String(saved.downloadDir || config?.downloadDir || path.join(os.homedir(), 'Downloads', 'dsh-chat-migrate'))
  const ledger = readJson(path.join(root, 'imports.json'), {})
  const sessionLedger = readJson(path.join(root, 'sessions.json'), {})
  const log = (message) => {
    try {
      const line = `[${new Date().toISOString()}] ${message}\n`
      fs.mkdirSync(root, { recursive: true })
      fs.appendFileSync(path.join(root, 'chat-migrate.log'), line, 'utf8')
    } catch {
      /* 日志失败不影响主流程 */
    }
    ctx?.logger?.info?.(`[chat-migrate] ${message}`)
  }

  return {
    ctx,
    root,
    downloadDir,
    ledger: ledger && typeof ledger === 'object' ? ledger : {},
    sessionLedger: sessionLedger && typeof sessionLedger === 'object' ? sessionLedger : {},
    config: {
      baseUrl: String(saved.baseUrl || config?.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''),
      headers: saved.headers && typeof saved.headers === 'object' ? saved.headers : config?.headers ?? {},
    },
    token: '',
    cookie: '',
    pending: null,
    workspaceDir: '',
    workspaceInfo: null,
    account: null,
    conversations: [],
    fetchedAt: 0,
    lastExport: null,
    log,
  }
}

function saveRuntimeConfig(rt, patch) {
  const next = { baseUrl: rt.config.baseUrl, downloadDir: rt.downloadDir }
  if (patch && typeof patch === 'object') {
    if (patch.baseUrl) next.baseUrl = String(patch.baseUrl).replace(/\/+$/, '')
    if (patch.downloadDir) next.downloadDir = String(patch.downloadDir)
  }
  rt.config.baseUrl = next.baseUrl
  rt.downloadDir = next.downloadDir
  writeJson(path.join(rt.root, 'config.json'), next)
}

function saveLedger(rt) {
  writeJson(path.join(rt.root, 'imports.json'), rt.ledger)
}

function saveSessionLedger(rt) {
  writeJson(path.join(rt.root, 'sessions.json'), rt.sessionLedger)
}

/** 单次请求；非 2xx 时把状态码挂在 error.status 上，供上层决定要不要换个 method 重试。 */
async function requestWeb(rt, pathname, { method = 'GET', body, token } = {}) {
  const url = `${rt.config.baseUrl}${pathname}`
  const headers = {
    accept: 'application/json',
    ...(body ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(rt.cookie ? { cookie: rt.cookie } : {}),
    ...rt.config.headers,
  }
  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    const err = new Error(`连不上 ${url}（${method}）：${error?.message ?? error}`)
    err.code = 'network'
    throw err
  }
  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }
  if (res.status === 401 || res.status === 403) {
    const err = new Error(`登录已失效（${res.status}）：请重新抓取或粘贴网页端 token`)
    err.code = 'auth'
    err.status = res.status
    throw err
  }
  if (!res.ok) {
    const err = new Error(
      `网页端返回 HTTP ${res.status}（${method} ${pathname.split('?')[0]}）：${(payload && (payload.msg || payload.message)) || text.slice(0, 200)}`,
    )
    err.status = res.status
    throw err
  }
  if (payload && typeof payload === 'object' && payload.code !== undefined && payload.code !== 0) {
    const err = new Error(`网页端接口报错 code=${payload.code}：${payload.msg ?? payload.message ?? '未知原因'}`)
    err.apiCode = payload.code
    throw err
  }
  return payload
}

/**
 * 带 method 兜底：有的环境（宿主里的出站代理）只放行 GET，POST 会回 405。
 * 主用 method 失败且状态是 405/404/501 时，换一种 method（并把 body 挪到/挪出 query）再试一次。
 */
async function callWeb(rt, pathname, { method = 'GET', body, token, allowMethodFallback = true } = {}) {
  const first = { method, body: method === 'POST' ? body : undefined }
  const attempts = [first]
  if (allowMethodFallback) {
    attempts.push(method === 'POST' ? { method: 'GET' } : { method: 'POST', body: body ?? undefined })
  }
  let lastError
  for (const attempt of attempts) {
    try {
      return await requestWeb(rt, pathname, { ...attempt, token })
    } catch (error) {
      lastError = error
      const retriable = error?.status === 405 || error?.status === 404 || error?.status === 501
      if (!retriable || attempt === attempts[attempts.length - 1]) throw error
      rt.log(`  ${attempt.method} 被拒（${error.status}），改试另一种 method`)
    }
  }
  throw lastError
}

async function fetchAllSessions(rt) {
  const all = []
  const seen = new Set()
  const pageSize = 50
  for (let page = 0; page < 50; page += 1) {
    const offset = page * pageSize
    // GET 优先（宿主环境的出站代理对 POST 会回 405），POST 作为兜底。
    const payload = await callWeb(rt, `/api/v0/chat_session/fetch_page?count=${pageSize}&offset=${offset}`, {
      method: 'GET',
      body: { count: pageSize, offset },
      token: rt.token,
    })
    const rows = normalizeSessions(payload)
    if (page === 0 && rows.length === 0) {
      // 形状兜不住时把原始返回记进日志，方便按真实字段补归一化。
      rt.log(`列表返回 0 条，payload 前 600 字：${JSON.stringify(payload).slice(0, 600)}`)
    }
    const fresh = rows.filter((row) => !seen.has(row.id))
    for (const row of fresh) {
      seen.add(row.id)
      all.push(row)
    }
    if (fresh.length < pageSize) break
  }
  return all
}

async function fetchMessages(rt, id) {
  const payload = await callWeb(rt, `/api/v0/chat/history_messages?chat_session_id=${encodeURIComponent(id)}`, {
    method: 'GET',
    token: rt.token,
  })
  return normalizeMessages(payload)
}

function requireLogin(rt) {
  if (!rt.token) {
    const err = new Error('还没登录：先抓取或粘贴网页端 token')
    err.code = 'auth'
    throw err
  }
}

/** 用一枚 token 校验并登录；失败时保持原有登录态。 */
async function attemptLogin(rt, token, baseUrl) {
  const previous = { token: rt.token, account: rt.account }
  if (baseUrl) saveRuntimeConfig(rt, { baseUrl })
  rt.token = token
  try {
    const payload = await callWeb(rt, '/api/v0/users/current', { token })
    const user = payload?.data?.biz_data?.user ?? payload?.data?.user ?? payload?.data ?? null
    rt.account = {
      name: String(user?.name ?? user?.nickname ?? user?.email ?? '网页端账号'),
      verifiedAt: new Date().toISOString(),
    }
    rt.log('登录成功')
    return rt.account
  } catch (error) {
    rt.token = previous.token
    rt.account = previous.account
    throw error
  }
}

function findConversation(rt, id) {
  return rt.conversations.find((item) => item.id === id)
}

async function ensureMessages(rt, ids) {
  const wanted = ids && ids.length ? ids : rt.conversations.map((item) => item.id)
  const out = []
  const need = []
  for (const id of wanted) {
    const found = findConversation(rt, id)
    if (!found) continue
    if (!Array.isArray(found.messages) || !found.messages.length) need.push(found)
    out.push(found)
  }
  if (need.length && !rt.token) {
    const err = new Error(`有 ${need.length} 个会话的消息还没下载：先登录网页端，再刷新或导出`)
    err.code = 'auth'
    throw err
  }
  for (const found of need) {
    try {
      found.messages = await fetchMessages(rt, found.id)
    } catch (error) {
      found.messages = found.messages ?? []
      found.error = String(error?.message ?? error)
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 导入（写进桌面端目录）                                              */
/* ------------------------------------------------------------------ */

function uniquePath(dir, base, ext) {
  let candidate = path.join(dir, `${base}${ext}`)
  let n = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${n}${ext}`)
    n += 1
  }
  return candidate
}

async function latestWorkspaceDir(rt) {
  try {
    const sc = rt.ctx?.get?.('sessionController')
    if (sc && typeof sc.list === 'function') {
      const value = await sc.list({}, AbortSignal.timeout(5000))
      const items = Array.isArray(value?.items) ? value.items : []
      const hit = items.find((item) => item && item.cwd)
      if (hit?.cwd) return String(hit.cwd)
    }
  } catch (error) {
    rt.log(`取工作区目录失败（sessionController）：${error?.message ?? error}`)
  }
  try {
    const reg = rt.ctx?.get?.('workspaceRegistry')
    if (reg && typeof reg.list === 'function') {
      const list = await reg.list()
      const hit = (Array.isArray(list) ? list : []).find((item) => item && item.path)
      if (hit?.path) return String(hit.path)
    }
  } catch (error) {
    rt.log(`取工作区目录失败（workspaceRegistry）：${error?.message ?? error}`)
  }
  try {
    const wd = rt.ctx?.get?.('workingDirectory')
    if (wd?.defaultDirectory) return String(wd.defaultDirectory)
  } catch {
    /* 没有这个服务 */
  }
  return ''
}

/** 导入落点：显式目录 > 下载目录 > 当前工作区（默认）。 */
async function resolveImportDir(rt, mode, dir) {
  const explicit = String(dir ?? '').trim()
  if (explicit) return path.resolve(explicit)
  if (mode === 'download') return path.join(rt.downloadDir, 'imports', dayStamp())
  const base = (await latestWorkspaceDir(rt)) || rt.downloadDir
  rt.workspaceDir = base
  return path.join(base, 'chat-imports', dayStamp())
}

/** 解析目标工作区（官方导入器要 { id, path }，并要它已经在注册表里）。 */
async function resolveWorkspace(rt) {
  try {
    const reg = rt.ctx?.get?.('workspaceRegistry')
    const raw = reg && typeof reg.list === 'function' ? await reg.list() : []
    const workspaces = (Array.isArray(raw) ? raw : []).filter((item) => item && item.id && item.path)
    if (!workspaces.length) return null
    const dir = rt.workspaceDir || (await latestWorkspaceDir(rt))
    let hit = workspaces.find((item) => path.resolve(String(item.path)) === path.resolve(String(dir)))
    if (!hit) hit = workspaces[0]
    return { id: String(hit.id), path: String(hit.path), title: String(hit.title ?? '') }
  } catch (error) {
    rt.log(`解析工作区失败：${error?.message ?? error}`)
    return null
  }
}

async function importConversations(rt, ids, dirOverride) {
  const items = await ensureMessages(rt, ids)
  if (!items.length) throw new Error('没有可导入的会话：先刷新列表并勾选')
  const dir = dirOverride
    ? path.resolve(String(dirOverride))
    : path.join(rt.downloadDir, 'imports', dayStamp())
  await fsp.mkdir(dir, { recursive: true })

  const results = []
  for (const item of items) {
    const base = `${safeName(item.title)}__${String(item.id).slice(0, 8)}`
    const mdPath = uniquePath(dir, base, '.md')
    const jsonPath = uniquePath(dir, base, '.json')
    await fsp.writeFile(mdPath, renderMarkdown(item), 'utf8')
    await fsp.writeFile(jsonPath, JSON.stringify(item, null, 2), 'utf8')
    rt.ledger[item.id] = {
      title: item.title,
      at: new Date().toISOString(),
      messages: (item.messages ?? []).length,
      mdPath,
      jsonPath,
    }
    results.push({ id: item.id, title: item.title, messages: (item.messages ?? []).length, mdPath, jsonPath })
  }
  saveLedger(rt)
  rt.log(`导入 ${results.length} 个会话 → ${dir}`)
  return { dir, items: results }
}

/* ------------------------------------------------------------------ */
/* HTTP 处理                                                           */
/* ------------------------------------------------------------------ */

async function handleApi(req, res, rt, url) {
  const route = url.pathname.slice(API.length) || '/'

  if (req.method === 'GET' && route === '/state') {
    if (!rt.workspaceDir) rt.workspaceDir = await latestWorkspaceDir(rt)
    if (!rt.workspaceInfo) rt.workspaceInfo = await resolveWorkspace(rt)
    return json(res, 200, stateView(rt))
  }

  // 供「网页端 Console 抓取」直接投递 token：跨域开放（投递方在 chat.deepseek.com）。
  if (route === '/token') {
    res.setHeader('access-control-allow-origin', '*')
    res.setHeader('access-control-allow-methods', 'POST, OPTIONS')
    res.setHeader('access-control-allow-headers', 'content-type')
    res.setHeader('access-control-allow-private-network', 'true')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return undefined
    }
  }

  if (req.method === 'POST' && route === '/token') {
    const payload = await readBody(req)
    const token = String(payload.token ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim()
    if (!token) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' })
      return res.end(JSON.stringify({ ok: false, error: '抓到的 token 是空的：确认网页端已登录' }))
    }
    rt.pending = { token, cookie: String(payload.cookie ?? '').trim(), at: Date.now() }
    rt.log('收到浏览器投递的 token')
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' })
    return res.end(JSON.stringify({ ok: true, received: true }))
  }

  if (req.method === 'GET' && route === '/capture/poll') {
    if (!rt.pending) return json(res, 200, { ok: true, found: false })
    const pending = rt.pending
    rt.pending = null
    try {
      if (pending.cookie) rt.cookie = pending.cookie
      const account = await attemptLogin(rt, pending.token)
      return json(res, 200, { ok: true, found: true, account, ...stateView(rt) })
    } catch (error) {
      rt.cookie = ''
      return json(res, 200, { ok: true, found: true, error: `抓到的 token 校验失败：${error?.message ?? error}` })
    }
  }

  if (req.method === 'GET' && route === '/file') {
    const name = url.searchParams.get('name') || ''
    const target = path.resolve(rt.downloadDir, name)
    if (!target.startsWith(path.resolve(rt.downloadDir) + path.sep) || !fs.existsSync(target)) {
      return json(res, 404, { ok: false, error: '文件不存在' })
    }
    const stat = fs.statSync(target)
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': stat.size,
      'content-disposition': `attachment; filename="${path.basename(target).replace(/"/g, '')}"`,
    })
    fs.createReadStream(target).pipe(res)
    return undefined
  }

  if (req.method === 'GET' && route === '/preview') {    const id = url.searchParams.get('id') || ''
    const found = findConversation(rt, id)
    if (!found) return json(res, 404, { ok: false, error: '没有这个会话，先刷新列表' })
    if (!found.messages?.length) {
      if (!rt.token) return json(res, 400, { ok: false, error: '这个会话的消息还没下载：先登录网页端再预览' })
      try {
        found.messages = await fetchMessages(rt, id)
      } catch (error) {
        return json(res, 502, { ok: false, error: String(error?.message ?? error) })
      }
    }
    return json(res, 200, {
      ok: true,
      conversation: {
        id: found.id,
        title: found.title,
        updatedAt: found.updatedAt,
        messages: (found.messages ?? []).slice(0, 8),
        total: (found.messages ?? []).length,
      },
    })
  }

  const body = req.method === 'POST' ? await readBody(req) : {}

  if (req.method === 'POST' && route === '/diagnose') {
    // 连通性自检：只报状态码/接口码，不回传 token。
    const targets = [
      ['getUsers', 'GET', '/api/v0/users/current'],
      ['postUsers', 'POST', '/api/v0/users/current'],
      ['getList', 'GET', '/api/v0/chat_session/fetch_page?count=1'],
      ['postList', 'POST', '/api/v0/chat_session/fetch_page?count=1'],
    ]
    const probe = {}
    for (const [key, method, pathname] of targets) {
      try {
        const payload = await requestWeb(rt, pathname, {
          method,
          body: method === 'POST' ? {} : undefined,
          token: rt.token,
        })
        probe[key] = { method, path: pathname.split('?')[0], ok: true, apiCode: payload?.code ?? 0 }
      } catch (error) {
        probe[key] = {
          method,
          path: pathname.split('?')[0],
          ok: false,
          status: error?.status ?? null,
          apiCode: error?.apiCode ?? null,
          error: String(error?.message ?? error).slice(0, 200),
        }
      }
    }
    rt.log(
      `连通自检 GETusers=${probe.getUsers?.status ?? probe.getUsers?.apiCode} POSTusers=${probe.postUsers?.status ?? probe.postUsers?.apiCode} ` +
        `GETlist=${probe.getList?.status ?? probe.getList?.apiCode} POSTlist=${probe.postList?.status ?? probe.postList?.apiCode}`,
    )
    const services = {}
    for (const name of [
      'webServer',
      'sessionController',
      'workspaceRegistry',
      'workingDirectory',
      'directoryPickerController',
      'sessionPersistence',
      'sessionProjectionCache',
    ]) {
      try {
        services[name] = Boolean(rt.ctx?.get?.(name))
      } catch {
        services[name] = false
      }
    }
    const sessionModule = await probeSessionModule()
    const formatVersion = await detectFormatVersion(rt, null).catch(() => null)
    return json(res, 200, {
      ok: true,
      baseUrl: rt.config.baseUrl,
      probe,
      services,
      sessionModule,
      formatVersion,
      workspace: rt.workspaceInfo ?? null,
      ...stateView(rt),
    })
  }

  if (req.method === 'POST' && route === '/login') {
    const token = String(body.token ?? '').trim()
    if (!token) return json(res, 400, { ok: false, error: 'token 不能为空' })
    try {
      await attemptLogin(rt, token, body.baseUrl)
      return json(res, 200, { ok: true, ...stateView(rt) })
    } catch (error) {
      return json(res, 502, { ok: false, error: `登录校验失败：${error?.message ?? error}` })
    }
  }

  if (req.method === 'POST' && route === '/logout') {
    rt.token = ''
    rt.cookie = ''
    rt.pending = null
    rt.account = null
    rt.conversations = []
    rt.fetchedAt = 0
    return json(res, 200, { ok: true, ...stateView(rt) })
  }

  if (req.method === 'POST' && route === '/config') {
    saveRuntimeConfig(rt, { baseUrl: body.baseUrl, downloadDir: body.downloadDir })
    return json(res, 200, { ok: true, ...stateView(rt) })
  }

  if (req.method === 'POST' && route === '/refresh') {
    try {
      requireLogin(rt)
      const rows = await fetchAllSessions(rt)
      const kept = new Map(rt.conversations.map((item) => [item.id, item]))
      rt.conversations = rows.map((row) => ({ ...kept.get(row.id), ...row }))
      rt.fetchedAt = Date.now()
      rt.log(`拉取会话列表：${rt.conversations.length} 条`)
      if (body.withMessages) await ensureMessages(rt, body.ids)
      return json(res, 200, { ok: true, ...stateView(rt) })
    } catch (error) {
      return json(res, error?.code === 'auth' ? 401 : 502, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/export') {
    try {
      const ids = Array.isArray(body.ids) && body.ids.length ? body.ids : rt.conversations.map((item) => item.id)
      if (!ids.length) throw new Error('列表为空：先点「刷新列表」')
      const conversations = body.withMessages === false
        ? ids.map((id) => findConversation(rt, id)).filter(Boolean)
        : await ensureMessages(rt, ids)
      const archive = buildArchive(conversations)
      const file = path.join(rt.downloadDir, `dsh-chat-migrate-${stamp()}.json`)
      await fsp.mkdir(rt.downloadDir, { recursive: true })
      await fsp.writeFile(file, JSON.stringify(archive, null, 2), 'utf8')
      const stat = await fsp.stat(file)
      rt.lastExport = { file, bytes: stat.size, count: conversations.length, at: new Date().toISOString() }
      rt.log(`导出 ${conversations.length} 个会话 → ${file}`)
      return json(res, 200, {
        ok: true,
        file,
        name: path.basename(file),
        bytes: stat.size,
        count: conversations.length,
        withMessages: body.withMessages !== false,
        ...stateView(rt),
      })
    } catch (error) {
      return json(res, error?.code === 'auth' ? 401 : 502, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/import-sessions') {
    try {
      const ids = Array.isArray(body.ids) ? body.ids : []
      if (!ids.length) throw new Error('没有勾选会话')
      const conversations = await ensureMessages(rt, ids)
      const workspace = await resolveWorkspace(rt)
      if (!workspace) throw new Error('找不到可写入的工作区：先在左侧建一个工作区')

      const sessionIds = []
      const skipped = []
      for (const conversation of conversations) {
        try {
          const sessionId = await writeConversationAsSession(rt, conversation, workspace)
          sessionIds.push(sessionId)
          rt.sessionLedger[conversation.id] = {
            at: new Date().toISOString(),
            workspaceId: workspace.id,
            sessionId,
          }
        } catch (error) {
          skipped.push({
            conversationId: conversation.id,
            title: conversation.title ?? null,
            reason: String(error?.message ?? error),
          })
          rt.log(`会话导入跳过 ${conversation.id}：${error?.message ?? error}`)
        }
      }
      saveSessionLedger(rt)
      rt.log(`会话导入完成：写入 ${sessionIds.length} 个会话，跳过 ${skipped.length} 个（工作区 ${workspace.title || workspace.path}）`)
      // 新会话是直接写存储 + 挂工作区产生的，不经过 session 服务的 live 通道；
      // 面板侧提示用户刷新一次窗口即可看到（宿主这里顺便把服务端可见性探一下，便于排查）。
      let visible = null
      try {
        const sc = rt.ctx?.get?.('sessionController')
        if (sc && typeof sc.list === 'function') {
          const value = await sc.list({}, AbortSignal.timeout(8000))
          const ids = new Set((value?.items ?? []).map((item) => String(item.sessionId)))
          visible = sessionIds.map((id) => ids.has(String(id)))
          rt.log(`  sessionController.list 可见性：${visible.filter(Boolean).length}/${sessionIds.length}`)
        }
      } catch (error) {
        rt.log(`  可见性检查失败：${error?.message ?? error}`)
      }
      return json(res, 200, {
        ok: true,
        workspaceId: workspace.id,
        workspacePath: workspace.path,
        sessionIds,
        skipped,
        conversationCount: conversations.length,
        omittedByLimit: 0,
        visibleAfterWrite: visible,
        sessionModule: await probeSessionModule(),
        ...stateView(rt),
      })
    } catch (error) {
      return json(res, 502, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/build-archive') {
    try {
      const ids = Array.isArray(body.ids) ? body.ids : []
      if (!ids.length) throw new Error('没有勾选会话')
      const conversations = await ensureMessages(rt, ids)
      const workspace = await resolveWorkspace(rt)
      if (!workspace) throw new Error('找不到可写入的工作区：先在左侧建一个工作区')
      const { bytes, count } = buildExportArchive(conversations)
      rt.log(`生成导出包：${count} 个会话，${bytes.length} 字节，目标工作区 ${workspace.title || workspace.id}`)
      return json(res, 200, {
        ok: true,
        archive: Buffer.from(bytes).toString('base64'),
        bytes: bytes.length,
        count,
        workspace,
        uploadPath: '/api/deepseek-chat-import/archive',
      })
    } catch (error) {
      return json(res, 502, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/backfill-projections') {
    // 给已经导入但漏了投影缓存的会话补一次 coldSnapshot（侧栏列表要摘要才显示）。
    try {
      const ids = Array.isArray(body.ids) && body.ids.length
        ? body.ids
        : Object.values(rt.sessionLedger ?? {}).map((entry) => entry?.sessionId).filter(Boolean)
      const persistence = rt.ctx?.get?.('sessionPersistence')
      const projectionCache = rt.ctx?.get?.('sessionProjectionCache')
      if (!persistence || !projectionCache) throw new Error('缺少 sessionPersistence / sessionProjectionCache')
      const done = []
      const failed = []
      for (const id of ids) {
        try {
          const handle = await persistence.open(id, 'read', { signal: AbortSignal.timeout(15000) })
          try {
            const result = await handle.read(0, 200000)
            projectionCache.coldSnapshot(handle.header, 0, result.events)
            done.push(id)
          } finally {
            await handle.close()
          }
        } catch (error) {
          failed.push({ id, error: String(error?.message ?? error) })
        }
      }
      rt.log(`补投影缓存：成功 ${done.length} 个，失败 ${failed.length} 个`)
      return json(res, 200, { ok: true, done, failed })
    } catch (error) {
      return json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'GET' && route === '/session-list-check') {
    // 诊断：这些会话在宿主看来是否“存在且可见”，以及 UI 依赖的摘要字段长什么样。
    try {
      const ids = String(url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      const out = { ok: true, items: [] }
      const sc = rt.ctx?.get?.('sessionController')
      if (sc && typeof sc.list === 'function') {
        const value = await sc.list({}, AbortSignal.timeout(8000))
        const byId = new Map((value?.items ?? []).map((item) => [String(item.sessionId), item]))
        out.listedInController = ids.map((id) => Boolean(byId.get(id)))
        out.summaries = ids.map((id) => byId.get(id) ?? null)
        out.total = value?.items?.length ?? 0
      }
      const query = rt.ctx?.get?.('sessionQuery')
      if (query && typeof query.filterSessions === 'function') {
        const rows = await query.filterSessions([{ kind: 'id', values: ids }], AbortSignal.timeout(8000))
        out.records = (rows ?? []).map((row) => ({ id: String(row.header?.id), live: row.live, persisted: row.persisted, formatStatus: row.formatStatus }))
      }
      const registry = rt.ctx?.get?.('workspaceRegistry')
      if (registry && typeof registry.get === 'function') {
        const info = rt.workspaceInfo ?? { id: '' }
        const ws = registry.get(info.id)
        out.workspaceSessionCount = ws ? ws.sessionIds?.length ?? 0 : null
        out.workspaceHasIds = ws ? ids.map((id) => (ws.sessionIds ?? []).includes(id)) : null
      }
      return json(res, 200, out)
    } catch (error) {
      return json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'GET' && route === '/session-info') {
    // 读回刚写好的会话，确认事件能被存储层正常解析（不解析就算坏会话）。
    const id = url.searchParams.get('id') || ''
    try {
      const persistence = rt.ctx?.get?.('sessionPersistence')
      if (!persistence || typeof persistence.open !== 'function') throw new Error('没有 sessionPersistence')
      const handle = await persistence.open(id, 'read', { signal: AbortSignal.timeout(8000) })
      try {
        const result = await handle.read(0, 500)
        return json(res, 200, {
          ok: true,
          id,
          events: result.events.length,
          types: [...new Set(result.events.map((event) => event.type))],
          header: handle.header,
        })
      } finally {
        await handle.close()
      }
    } catch (error) {
      return json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/session-archive') {
    try {
      const id = String(body.id ?? '')
      if (!id) throw new Error('缺少 id')
      const registry = rt.ctx?.get?.('workspaceRegistry')
      await registry.archiveSession(id)
      return json(res, 200, { ok: true, id, archived: true })
    } catch (error) {
      return json(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/sessions-recorded') {
    const ids = Array.isArray(body.ids) ? body.ids : []
    const at = new Date().toISOString()
    for (const id of ids) {
      rt.sessionLedger[id] = {
        at,
        workspaceId: String(body.workspaceId ?? ''),
        sessionId: sessionIds.length === ids.length ? String(sessionIds[ids.indexOf(id)] ?? '') : '',
      }
    }
    saveSessionLedger(rt)
    return json(res, 200, { ok: true, ...stateView(rt) })
  }

  if (req.method === 'POST' && route === '/import') {
    try {
      const ids = Array.isArray(body.ids) ? body.ids : []
      if (!ids.length) throw new Error('没有勾选会话')
      const dir = await resolveImportDir(rt, body.mode, body.dir)
      const result = await importConversations(rt, ids, dir)
      return json(res, 200, { ok: true, mode: body.mode ?? 'workspace', ...result, ...stateView(rt) })
    } catch (error) {
      return json(res, 502, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/pick-dir') {
    try {
      const picker = rt.ctx?.get?.('directoryPickerController')
      if (!picker || typeof picker.pick !== 'function') {
        return json(res, 200, { ok: false, error: '这个版本没有目录选择器，直接手填路径就行' })
      }
      const picked = await picker.pick(AbortSignal.timeout(120000))
      return json(res, 200, { ok: true, path: picked ?? '' })
    } catch (error) {
      return json(res, 200, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/ingest-file') {
    try {
      const parsed = typeof body.json === 'string' ? JSON.parse(body.json) : body.json
      const rows = Array.isArray(parsed?.conversations) ? parsed.conversations : []
      if (!rows.length) throw new Error('这个文件里没有 conversations 数组')
      const merged = new Map(rt.conversations.map((item) => [item.id, item]))
      for (const row of rows) {
        const id = String(row?.id ?? '').trim()
        if (!id) continue
        merged.set(id, {
          id,
          title: String(row.title ?? '(无标题会话)'),
          createdAt: toMs(row.createdAt),
          updatedAt: toMs(row.updatedAt),
          messageCount: Array.isArray(row.messages) ? row.messages.length : 0,
          messages: (row.messages ?? []).map((m) => ({
            id: String(m?.id ?? ''),
            role: String(m?.role ?? 'user') === 'user' ? 'user' : 'assistant',
            text: String(m?.text ?? ''),
            sentAt: toMs(m?.sentAt),
          })),
          source: `file:${String(body.name ?? 'upload.json')}`,
        })
      }
      rt.conversations = [...merged.values()]
      rt.fetchedAt = Date.now()
      rt.log(`从文件导入列表：${rows.length} 条`)
      return json(res, 200, { ok: true, ...stateView(rt), ingested: rows.length })
    } catch (error) {
      return json(res, 400, { ok: false, error: String(error?.message ?? error) })
    }
  }

  if (req.method === 'POST' && route === '/demo') {
    rt.conversations = demoConversations()
    rt.fetchedAt = Date.now()
    rt.log('载入演示数据')
    return json(res, 200, { ok: true, demo: true, ...stateView(rt) })
  }

  if (req.method === 'POST' && route === '/reveal') {
    const target = body.path ? path.resolve(String(body.path)) : path.resolve(rt.downloadDir)
    const svc = rt.ctx?.get?.('sessionController')
    if (svc && typeof svc.openWorkspacePath === 'function') {
      try {
        await svc.openWorkspacePath({ path: target })
        return json(res, 200, { ok: true, path: target, opened: true })
      } catch (error) {
        return json(res, 200, { ok: true, path: target, opened: false, error: String(error?.message ?? error) })
      }
    }
    return json(res, 200, { ok: true, path: target, opened: false, error: '这个版本不支持从宿主打开文件夹' })
  }

  return json(res, 404, { ok: false, error: `未知接口 ${route}` })
}

/** 本机面板接口的绝对地址：桌面端页面跑在 dsh-app:// 协议下，
 *  location.origin 拿不到 http 地址，只能由宿主从 webServer 取真实监听地址。 */
function apiBaseOf(rt) {
  try {
    const webServer = rt.ctx?.get?.('webServer')
    const origin = webServer?.getOrigin?.()
    if (origin) return `${origin}${API}`
  } catch {
    /* 还没 listen */
  }
  return ''
}

function stateView(rt) {
  return {
    loggedIn: Boolean(rt.token),
    baseUrl: rt.config.baseUrl,
    apiBase: apiBaseOf(rt),
    account: rt.account,
    fetchedAt: rt.fetchedAt,
    downloadDir: rt.downloadDir,
    workspaceDir: rt.workspaceDir || '',
    workspace: rt.workspaceInfo || null,
    workspaceImportDir: rt.workspaceDir ? path.join(rt.workspaceDir, 'chat-imports', dayStamp()) : '',
    lastExport: rt.lastExport,
    imported: rt.ledger,
    sessions: rt.sessionLedger,
    conversations: rt.conversations.map((item) => ({
      id: item.id,
      title: item.title,
      createdAt: item.createdAt ?? 0,
      updatedAt: item.updatedAt ?? 0,
      messageCount: item.messageCount || (item.messages?.length ?? 0),
      hasMessages: Boolean(item.messages?.length),
      source: item.source ?? 'deepseek-web',
      importedAt: rt.ledger[item.id]?.at ?? null,
      sessionAt: rt.sessionLedger[item.id]?.at ?? null,
    })),
  }
}

function demoConversations() {
  const now = Date.now()
  const mk = (id, title, daysAgo, messages) => ({
    id,
    title,
    createdAt: now - daysAgo * 86400000 - 3600000,
    updatedAt: now - daysAgo * 86400000,
    messageCount: messages.length,
    messages: messages.map((m, index) => ({
      id: `${id}-${index}`,
      role: m.role,
      text: m.text,
      sentAt: now - daysAgo * 86400000 + index * 60000,
    })),
    source: 'demo',
  })
  return [
    mk('demo-1', '【演示】用 Python 读取 Excel 表头', 1, [
      { role: 'user', text: '用 pandas 读一个 xlsx，只取前两行做表头检查。' },
      { role: 'assistant', text: '可以这样：`pd.read_excel(path, nrows=2)`，注意 `header=None` 时列名不会丢。' },
    ]),
    mk('demo-2', '【演示】装修半包报价对比', 6, [
      { role: 'user', text: '半包报价里「墙面找平」按平米还是按项算比较合理？' },
      { role: 'assistant', text: '常见是按平米，写清基层处理与腻子遍数，避免只写「找平一项」。' },
    ]),
    mk('demo-3', '【演示】给日报写一段开场', 30, [
      { role: 'user', text: '写两句日报开场，别太正式。' },
      { role: 'assistant', text: '今天进度按计划走，两处细节需要明天确认。' },
    ]),
  ]
}

/* ------------------------------------------------------------------ */
/* apply                                                               */
/* ------------------------------------------------------------------ */

export function apply(ctx, config) {
  const rt = createRuntime(config, ctx)

  const mountApi = (webServer) => {
    if (!webServer || typeof webServer.register !== 'function') return false
    try {
      const disposer = webServer.register({
        kind: 'prefix',
        path: API,
        handler: (req, res) => {
          const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`)
          Promise.resolve()
            .then(() => handleApi(req, res, rt, url))
            .catch((error) => {
              try {
                json(res, 500, { ok: false, error: String(error?.message ?? error) })
              } catch {
                /* 响应已发出 */
              }
            })
        },
      })
      if (typeof ctx.effect === 'function') ctx.effect(() => disposer)
      rt.log(`HTTP API 已挂在 ${API}`)
      return true
    } catch (error) {
      rt.log(`挂 HTTP 路由失败：${error?.message ?? error}`)
      return false
    }
  }

  if (!mountApi(ctx.get?.('webServer')) && typeof ctx.inject === 'function') {
    try {
      ctx.inject(['webServer'], (ready) => {
        mountApi(ready?.webServer ?? ctx.get?.('webServer'))
      })
    } catch (error) {
      rt.log(`等待 webServer 失败：${error?.message ?? error}`)
    }
  }

  rt.log(`数据目录 ${rt.root}；下载目录 ${rt.downloadDir}`)
  return rt
}
