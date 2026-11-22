/**
 * DSH 自定义主题 — Host half.
 *
 * The Host is deliberately a thin, version-tolerant document store:
 *
 *  1. it persists the browser half's theme document at
 *     `<DSH_HOME>/theme-studio/theme.json` through a same-origin route, and
 *  2. it paints the saved boot hint (background colors + wallpaper) into the
 *     page before the client bundle runs.
 *
 * All theme semantics — themes, palettes, tokens, copy lists, wallpaper
 * effects — live in `client/client.js`. That keeps future theme features a
 * client-only change: this file only needs a restart when the transport itself
 * changes.
 *
 * It imports Node built-ins only: a profile-installed bundle resolves its own
 * dependencies, and the `@deepseek-ai/*` packages are provided by the
 * application.
 */
import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-custom-theme'

/** Route prefix owned by this plugin. */
export const ROUTE_PREFIX = '/dsh-theme-studio'

/** Largest accepted document write (wallpaper/hero data URLs). */
const BODY_LIMIT = 8 * 1024 * 1024

/** Boot hint used before the browser half has ever saved a document. */
export const DEFAULT_BOOT = Object.freeze({
  light: '#fdf6e3',
  dark: '#2d353b',
  wallpaper: null,
})


/* ------------------------------------------------------------------ *
 * Alert hub — approvals, structured questions (plan review included) and
 * long workflow runs are Host events. The browser half cannot see them, so
 * the Host buffers the last few and streams them over SSE; the client decides
 * whether the viewer should be alerted and draws the card.
 * ------------------------------------------------------------------ */

const ALERT_BUFFER_LIMIT = 40
const ALERT_RETENTION_MS = 10 * 60 * 1000
const alertClients = new Set()
const ALERT_ID_BASE = Date.now() * 1000
let alertSeq = 0
let alertLog = []

/** Recent alerts, dropping entries older than the retention window. */
export function recentAlerts() {
  const cutoff = Date.now() - ALERT_RETENTION_MS
  alertLog = alertLog.filter((alert) => alert.at >= cutoff)
  return alertLog.slice()
}

/** Test-only: forget every buffered alert and restart the sequence. */
export function resetAlerts() {
  alertLog = []
  alertSeq = 0
}

function alertTitle(value) {
  return typeof value === 'string' ? value.slice(0, 200) : ''
}

function writeAlertFrame(response, alert) {
  response.write(`id: ${alert.id}\ndata: ${JSON.stringify(alert)}\n\n`)
}

function publishAlert(alert) {
  alertSeq += 1
  const entry = { id: ALERT_ID_BASE + alertSeq, at: Date.now(), ...alert }
  alertLog.push(entry)
  if (alertLog.length > ALERT_BUFFER_LIMIT) alertLog.shift()
  for (const response of [...alertClients]) {
    try {
      writeAlertFrame(response, entry)
    } catch {
      alertClients.delete(response)
    }
  }
  return entry
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Resolve the Harness home the way `@deepseek-ai/dsh-home-paths` does. */
export function resolveHarnessHome(env = process.env) {
  const configured = env.DSH_HOME?.trim()
  if (configured !== undefined && configured.length > 0) {
    if (configured === '~') return homedir()
    if (configured.startsWith('~/') || configured.startsWith('~\\')) return join(homedir(), configured.slice(2))
    return configured
  }
  return join(homedir(), '.dsh')
}

/** Absolute path of the durable theme document. */
export function documentFile(env = process.env) {
  return join(resolveHarnessHome(env), 'theme-studio', 'theme.json')
}

/* ------------------------------------------------------------------ *
 * Boot hint
 * ------------------------------------------------------------------ */

function readWallpaper(value) {
  if (value === null || typeof value !== 'object') return null
  const image = typeof value.image === 'string' ? value.image.trim() : ''
  if (image === '') return null
  const safe = /^(?:https?:|data:image\/|\/dsh-theme-studio\/asset\/)/u.test(image) ? image : ''
  if (safe === '') return null
  const num = (input, fallback, min, max) => {
    const parsed = Number(input)
    return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback
  }
  const scrimSource = value.scrim !== null && typeof value.scrim === 'object' ? value.scrim : null
  const scrimColor = (input) => (typeof input === 'string' && /^rgba?\(\d{1,3}, \d{1,3}, \d{1,3}(?:, [\d.]+)?\)$/u.test(input) ? input : null)
  const scrimLight = scrimSource === null ? null : scrimColor(scrimSource.light)
  const scrimDark = scrimSource === null ? null : scrimColor(scrimSource.dark)
  return {
    image: safe.slice(0, 3_000_000),
    blur: num(value.blur, 0, 0, 40),
    brightness: num(value.brightness, 100, 30, 200),
    position: value.position === 'contain' ? 'contain' : 'cover',
    scrim: scrimLight !== null && scrimDark !== null ? { light: scrimLight, dark: scrimDark } : null,
  }
}

/**
 * Normalize one document envelope: `{ version, boot, state }`.
 * `state` is opaque to the Host — the browser half owns its schema.
 */
export function normalizeDocument(input) {
  const source = input !== null && typeof input === 'object' ? input : {}
  const boot = source.boot !== null && typeof source.boot === 'object' ? source.boot : {}
  const state = source.state !== null && typeof source.state === 'object' ? source.state : null
  if (state === null) return null
  return {
    version: 1,
    boot: {
      light: HEX.test(boot.light) ? boot.light : DEFAULT_BOOT.light,
      dark: HEX.test(boot.dark) ? boot.dark : DEFAULT_BOOT.dark,
      wallpaper: readWallpaper(boot.wallpaper),
    },
    state,
  }
}

/** Index injections that paint the saved backdrop before first paint. */
export function bootInjections(document) {
  const boot = document?.boot ?? DEFAULT_BOOT
  const rows = [
    `html:not([data-ts-ready]) body{background-color:${boot.light}}`,
    `html:not([data-ts-ready]) body[data-ds-dark-theme]{background-color:${boot.dark}}`,
  ]
  if (boot.wallpaper !== null) {
    const wall = boot.wallpaper
    const extra = wall.blur > 0 ? 'transform:scale(1.04);' : ''
    const base = 'content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;'
      + `background-size:${wall.position};background-position:center;background-repeat:no-repeat;`
      + `filter:blur(${wall.blur}px) brightness(${wall.brightness}%);${extra}`
    const url = JSON.stringify(wall.image)
    if (wall.scrim === null) {
      rows.push(`body::before{${base}background-image:url(${url});}`)
    } else {
      // The scrim keeps paragraph text readable over a bright wallpaper.
      rows.push(`body::before{${base}background-image:linear-gradient(${wall.scrim.light},${wall.scrim.light}),url(${url});}`)
      rows.push(`body[data-ds-dark-theme]::before{background-image:linear-gradient(${wall.scrim.dark},${wall.scrim.dark}),url(${url});}`)
    }
  }
  return [{ kind: 'style', text: rows.join('\n') }]
}

/* ------------------------------------------------------------------ *
 * Document storage
 * ------------------------------------------------------------------ */

function parseDocument(text) {
  try {
    return normalizeDocument(JSON.parse(text))
  } catch {
    return null
  }
}

/** Read the durable document synchronously (boot injection runs per index render). */
export function readDocumentSync(env = process.env) {
  try {
    return parseDocument(readFileSync(documentFile(env), 'utf8'))
  } catch {
    return null
  }
}

/** Read the durable document, or null when none was saved yet. */
export async function readDocument(env = process.env) {
  try {
    return parseDocument(await readFile(documentFile(env), 'utf8'))
  } catch {
    return null
  }
}

/** Persist one document envelope; returns the normalized envelope or null. */
export async function writeDocument(input, env = process.env) {
  const document = normalizeDocument(input)
  if (document === null) return null
  const file = documentFile(env)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  return document
}

/* ------------------------------------------------------------------ *
 * Asset storage (wallpapers, hero art, background music)
 * ------------------------------------------------------------------ */

/** Largest accepted asset upload (a full lossless track still fits). */
const ASSET_LIMIT = 40 * 1024 * 1024

/** Accepted asset file names (written by this Host only). */
const ASSET_NAME = /^[a-z0-9][a-z0-9-]{4,80}\.(?:png|jpg|jpeg|webp|gif|svg|mp3|wav|ogg|m4a|flac)$/

const MIME = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
})

/** Absolute directory holding uploaded assets. */
export function assetsDir(env = process.env) {
  return join(resolveHarnessHome(env), 'theme-studio', 'assets')
}

/**
 * Sniff an uploaded asset from its magic bytes.
 *
 * @param buffer - the uploaded bytes.
 * @returns `{ ext, mime }` for a supported image/audio type, else null.
 */
export function sniffAsset(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null
  const head = buffer.subarray(0, 16)
  const ascii = buffer.subarray(0, 512).toString('utf8').replace(/^\uFEFF/u, '').trimStart()

  if (head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return { ext: 'png', mime: MIME.png }
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { ext: 'jpg', mime: MIME.jpg }
  if (head.subarray(0, 4).toString('latin1') === 'GIF8') return { ext: 'gif', mime: MIME.gif }
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: MIME.webp }
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WAVE') return { ext: 'wav', mime: MIME.wav }
  if (head.subarray(0, 4).toString('latin1') === 'OggS') return { ext: 'ogg', mime: MIME.ogg }
  if (head.subarray(0, 4).toString('latin1') === 'fLaC') return { ext: 'flac', mime: MIME.flac }
  if (head.subarray(0, 3).toString('latin1') === 'ID3') return { ext: 'mp3', mime: MIME.mp3 }
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return { ext: 'mp3', mime: MIME.mp3 }
  if (head.subarray(4, 8).toString('latin1') === 'ftyp') return { ext: 'm4a', mime: MIME.m4a }
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/iu.test(ascii)) return { ext: 'svg', mime: MIME.svg }
  return null
}

/** Persist one uploaded asset; returns its public name or null. */
export async function saveAsset(buffer, env = process.env) {
  const sniff = sniffAsset(buffer)
  if (sniff === null) return null
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${sniff.ext}`
  const directory = assetsDir(env)
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, name), buffer)
  return { name, mime: sniff.mime, url: `${ROUTE_PREFIX}/asset/${name}` }
}

/** Resolve one asset name to a readable path, or null when invalid. */
export function assetPath(name, env = process.env) {
  if (!ASSET_NAME.test(name)) return null
  return join(assetsDir(env), name)
}

/** Serve one asset, honoring a single-range request for audio seeking. */
async function serveAsset(name, request, response, env) {
  const file = assetPath(name, env)
  if (file === null) {
    sendJson(response, 404, { ok: false, error: 'unknown asset' })
    return
  }
  let bytes
  try {
    bytes = await readFile(file)
  } catch {
    sendJson(response, 404, { ok: false, error: 'asset not found' })
    return
  }
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  const mime = MIME[ext] ?? 'application/octet-stream'
  const total = bytes.length
  const range = request.headers.range
  if (typeof range === 'string') {
    const match = /^bytes=(\d*)-(\d*)$/u.exec(range.trim())
    if (match !== null) {
      const start = match[1] === '' ? Math.max(0, total - Number(match[2])) : Number(match[1])
      const end = match[1] !== '' && match[2] !== '' ? Math.min(total - 1, Number(match[2])) : total - 1
      if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < total) {
        response.writeHead(206, {
          'content-type': mime,
          'content-length': end - start + 1,
          'content-range': `bytes ${start}-${end}/${total}`,
          'accept-ranges': 'bytes',
          'cache-control': 'public, max-age=31536000, immutable',
        })
        response.end(bytes.subarray(start, end + 1))
        return
      }
    }
  }
  response.writeHead(200, {
    'content-type': mime,
    'content-length': total,
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
  })
  response.end(bytes)
}

/* ------------------------------------------------------------------ *
 * HTTP helpers
 * ------------------------------------------------------------------ */

function sendJson(response, status, body) {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

async function readJsonBody(request, limit = BODY_LIMIT) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Read a raw request body with a hard size bound. */
async function readBody(request, limit = ASSET_LIMIT) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function sameOrigin(request) {
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === request.headers.host
  } catch {
    return false
  }
}

/**
 * Register the theme document route and the boot injection.
 *
 * @param ctx - Host cordis context.
 */
export function apply(ctx) {
  // Human-attention Host events: approvals, structured questions (plan review
  // arrives as a question intent) and long workflow runs. Waterfall listeners
  // observe and then delegate; they must never change the decision.
  ctx.on('approval/request', (request, next) => {
    try {
      publishAlert({
        kind: 'approval',
        sessionId: typeof request?.agent?.id === 'string' ? request.agent.id : undefined,
        title: alertTitle(request?.toolName),
        detail: alertTitle(request?.displayReason?.zh ?? request?.displayReason?.en ?? request?.reason),
      })
    } catch {
      /* alerting must never disturb the approval chain */
    }
    return next()
  }, true)

  // The question tool (ask_user_question) and plan review (exit_plan_mode) are
  // ordinary tool dispatches: the structured `user-questions/request` event does
  // not always fire for them, so observe the dispatch as well and let the client
  // cooldown collapse a duplicate pair. The second argument `true` prepends this
  // listener so observation happens before any claimer resolves the tool.
  const ASKING_TOOLS = new Map([
    ['ask_user_question', 'question'],
    ['exit_plan_mode', 'plan'],
  ])

  ctx.on('tools/pre-execute', (exec, next) => {
    try {
      const kind = ASKING_TOOLS.get(exec?.name)
      if (kind !== undefined) {
        const agent = exec?.agent
        const sessionId = typeof agent?.session?.id === 'string' ? agent.session.id
          : typeof agent?.id === 'string' ? agent.id
            : typeof exec?.session?.id === 'string' ? exec.session.id
              : undefined
        publishAlert({ kind, sessionId })
      }
    } catch {
      /* alerting must never disturb tool dispatch */
    }
    return next()
  }, true)

  ctx.on('user-questions/request', (request, next) => {
    try {
      const questions = Array.isArray(request?.questions) ? request.questions : []
      const first = questions[0] !== undefined && questions[0] !== null ? questions[0] : {}
      const intent = first.intent
      const kind = intent?.kind === 'plan-review' ? 'plan' : intent?.kind === 'approval' ? 'approval' : 'question'
      const display = intent?.display
      publishAlert({
        kind,
        sessionId: typeof request?.agent?.id === 'string' ? request.agent.id : undefined,
        title: alertTitle(display?.question?.zh ?? display?.question?.en ?? first.header ?? first.question),
        detail: alertTitle(display?.detail?.zh ?? display?.detail?.en ?? first.question),
      })
    } catch {
      /* alerting must never disturb the question chain */
    }
    return next()
  }, true)

  ctx.on('workflow/end', (info, result) => {
    try {
      const name = typeof info?.meta?.name === 'string' && info.meta.name !== '' ? info.meta.name : 'workflow'
      const reason = typeof result?.stopReason === 'string' ? result.stopReason : 'completed'
      publishAlert({
        kind: 'workflow',
        title: alertTitle(name),
        detail: alertTitle(info?.meta?.description || reason),
      })
    } catch {
      /* alerting is best-effort */
    }
  })

  ctx.on('webserver/index-inject', (table) => {
    table.push(...bootInjections(readDocumentSync()))
  })

  ctx.inject(['webServer'], (scope) => {
    const webServer = scope.get('webServer')
    if (webServer === undefined) return

    const dispose = webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const route = url.pathname.slice(ROUTE_PREFIX.length) || '/'
        const method = request.method ?? 'GET'
        try {
          if (method === 'GET' && (route === '/document' || route === '/')) {
            sendJson(response, 200, { ok: true, document: await readDocument() })
            return
          }
          if (method === 'POST' && route === '/document') {
            if (!sameOrigin(request)) {
              sendJson(response, 403, { ok: false, error: 'cross-origin request refused' })
              return
            }
            const body = await readJsonBody(request)
            const document = await writeDocument(body?.document)
            if (document === null) {
              sendJson(response, 400, { ok: false, error: 'the document must carry a state object' })
              return
            }
            sendJson(response, 200, { ok: true, document })
            return
          }
          if (method === 'GET' && route === '/alerts') {
            response.writeHead(200, {
              'content-type': 'text/event-stream; charset=utf-8',
              'cache-control': 'no-store',
              connection: 'keep-alive',
              'x-accel-buffering': 'no',
            })
            response.write('retry: 3000\n\n')
            const lastEventId = Number(request.headers['last-event-id'])
            const wantsLatest = url.searchParams.get('since') === 'latest'
            const since = Number.isFinite(lastEventId)
              ? lastEventId
              : wantsLatest ? ALERT_ID_BASE + alertSeq : 0
            for (const alert of recentAlerts()) {
              if (alert.id > since) writeAlertFrame(response, alert)
            }
            alertClients.add(response)
            const heartbeat = setInterval(() => {
              try {
                response.write(': ping\n\n')
              } catch {
                /* the stream is gone; cleanup runs on close */
              }
            }, 25_000)
            if (typeof heartbeat === 'object' && heartbeat !== null && typeof heartbeat.unref === 'function') heartbeat.unref()
            const close = () => {
              clearInterval(heartbeat)
              alertClients.delete(response)
            }
            request.on?.('close', close)
            response.on?.('close', close)
            return
          }
          if (method === 'GET' && route === '/agent-presets') {
            const presets = ctx.get('agentPresets')
            if (presets === undefined || typeof presets.list !== 'function') {
              sendJson(response, 200, { ok: true, presets: [] })
              return
            }
            const roster = await presets.list()
            sendJson(response, 200, {
              ok: true,
              presets: (Array.isArray(roster) ? roster : []).map((row) => ({
                id: row.id,
                name: typeof row.name === 'string' && row.name !== '' ? row.name : row.id,
                description: typeof row.description === 'string' ? row.description : '',
                broken: row.broken !== undefined && row.broken !== null,
              })),
            })
            return
          }
          if (method === 'GET' && route.startsWith('/preset/')) {
            const name = route.slice('/preset/'.length)
            if (!/^[a-z0-9][a-z0-9-]{2,60}$/u.test(name)) {
              sendJson(response, 404, { ok: false, error: 'unknown preset' })
              return
            }
            try {
              const text = await readFile(new URL(`../presets/${name}.json`, import.meta.url), 'utf8')
              sendJson(response, 200, { ok: true, preset: JSON.parse(text) })
            } catch {
              sendJson(response, 404, { ok: false, error: 'unknown preset' })
            }
            return
          }
          if (method === 'POST' && route === '/asset') {
            if (!sameOrigin(request)) {
              sendJson(response, 403, { ok: false, error: 'cross-origin request refused' })
              return
            }
            const bytes = await readBody(request)
            if (bytes.length === 0) {
              sendJson(response, 400, { ok: false, error: 'empty upload' })
              return
            }
            const asset = await saveAsset(bytes)
            if (asset === null) {
              sendJson(response, 415, { ok: false, error: 'unsupported image/audio type' })
              return
            }
            sendJson(response, 200, { ok: true, ...asset })
            return
          }
          if (method === 'GET' && route.startsWith('/asset/')) {
            await serveAsset(route.slice('/asset/'.length), request, response)
            return
          }
          sendJson(response, 404, { ok: false, error: `unknown route ${method} ${route}` })
        } catch (error) {
          sendJson(response, 400, { ok: false, error: errorMessage(error) })
        }
      },
    })
    scope.effect(() => () => {
      for (const response of [...alertClients]) {
        try {
          response.end()
        } catch {
          /* already closed */
        }
      }
      alertClients.clear()
      dispose()
    }, 'dsh-custom-theme: theme document route')
  })
}
