/**
 * dsh-view-manager, node half.
 *
 * Provides the update-check / update-run APIs for the browser half:
 *   GET  /view-manager-api/version       — local version + install source
 *   GET  /view-manager-api/check-update  — compare npm latest vs local
 *   POST /view-manager-api/update        — run `dsh plugin update` and verify
 *
 * Every route is loopback-trusted (same rules as dsh-plugins-market: loopback
 * Host, no cross-site sec-fetch-site, Origin must equal Host when present),
 * so a remote website cannot CSRF the local update endpoint.
 */

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const inject = ['webServer']

const PACKAGE_NAME = 'dsh-view-manager'
const NPM_LATEST_URL = 'https://registry.npmjs.org/' + PACKAGE_NAME + '/latest'
const UPDATE_TIMEOUT_MS = 120000

/**
 * Local version + install source resolution.
 *
 * Version: read our own package.json via import.meta.url (works for both
 * linked dev installs and real npm installs).
 * Source: best-effort read of the profile manifest dependencies spec
 * (link: / github: / semver). Falls back to 'unknown'.
 */
function resolveLocalInfo() {
  let version = null
  try {
    const here = fileURLToPath(import.meta.url)
    const pkgPath = join(dirname(here), '..', 'package.json')
    version = JSON.parse(readFileSync(pkgPath, 'utf8')).version || null
  } catch (err) {
    console.log('[view-manager] local version read failed: ' + String(err && err.message || err))
  }

  let source = 'unknown'
  let profile = 'web'
  try {
    const home = process.env.DSH_HOME
    const profileName = /^[a-z0-9-]{1,32}$/.test(String(process.env.DSH_PROFILE || '')) ? process.env.DSH_PROFILE : 'web'
    if (home) {
      profile = profileName
      const manifestPath = join(home, 'profiles', profileName, 'package.json')
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const spec = manifest?.dependencies?.[PACKAGE_NAME]
      if (typeof spec === 'string') {
        if (spec.startsWith('link:') || spec.startsWith('file:')) source = 'local'
        else if (spec.startsWith('github:')) source = 'github'
        else source = 'npm'
      }
    }
  } catch (err) {
    /* profile manifest unreadable — keep 'unknown' */
  }

  return { version, source, profile }
}

/** Simple semver compare (numeric dotted triplets; ignores prerelease/build). */
function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''))
    if (!m) return null
    return [Number(m[1]), Number(m[2]), Number(m[3])]
  }
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? 1 : -1
  }
  return 0
}

/** Fetch npm latest with a short timeout; resolves null on any failure. */
async function fetchNpmLatest() {
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 15000)
    const res = await fetch(NPM_LATEST_URL, {
      signal: controller.signal,
      headers: { 'User-Agent': 'dsh-view-manager', 'Accept': 'application/vnd.npm.install-v1+json' },
    })
    clearTimeout(t)
    if (res.status !== 200) return null
    const data = await res.json()
    return (data && data.version) || null
  } catch (err) {
    return null
  }
}

function header(headers, name) {
  const value = headers[name]
  return Array.isArray(value) ? value[0] : value
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '::1') return true
  if (hostname.startsWith('127.')) return true
  return false
}

function isTrustedApiRequest(req) {
  const host = header(req.headers, 'host')
  if (host === undefined) return false
  let hostUrl
  try { hostUrl = new URL('http://' + host) } catch (err) { return false }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (header(req.headers, 'sec-fetch-site') === 'cross-site') return false
  const origin = header(req.headers, 'origin')
  if (origin === undefined) return true
  try { return new URL(origin).host === hostUrl.host } catch (err) { return false }
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/** Run one dsh plugin command, capturing tails, with a hard timeout. */
function runDsh(args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn('dsh', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const t = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs || UPDATE_TIMEOUT_MS)
    child.stdout.on('data', (c) => { stdout += c.toString('utf8') })
    child.stderr.on('data', (c) => { stderr += c.toString('utf8') })
    child.on('error', (err) => { clearTimeout(t); resolve({ spawnError: err, stdout, stderr, timedOut }) })
    child.on('close', (code, signal) => { clearTimeout(t); resolve({ code, signal, stdout, stderr, timedOut }) })
  })
}

async function handle(req, res) {
  if (!isTrustedApiRequest(req)) {
    res.writeHead(403)
    res.end('forbidden')
    return
  }
  let url
  try { url = new URL(req.url, 'http://localhost') } catch (err) {
    res.writeHead(400)
    res.end('bad request')
    return
  }
  const pathname = url.pathname

  if (pathname === '/view-manager-api/version' && req.method === 'GET') {
    const info = resolveLocalInfo()
    sendJson(res, 200, { ok: true, ...info })
    return
  }

  if (pathname === '/view-manager-api/check-update' && req.method === 'GET') {
    const info = resolveLocalInfo()
    const latest = await fetchNpmLatest()
    let hasUpdate = false
    let current = info.version
    if (latest !== null && current !== null) {
      const cmp = compareVersions(latest, current)
      hasUpdate = cmp !== null && cmp > 0
    }
    sendJson(res, 200, {
      ok: true,
      current,
      latest,
      hasUpdate,
      source: info.source,
      profile: info.profile,
      published: latest !== null,
    })
    return
  }

  if (pathname === '/view-manager-api/update' && req.method === 'POST') {
    let body
    try {
      body = await readBody(req, 4096)
    } catch (err) {
      sendJson(res, 400, { ok: false, error: String(err && err.message || err) })
      return
    }
    let args = {}
    try {
      args = JSON.parse(body || '{}')
    } catch (err) {
      sendJson(res, 400, { ok: false, error: 'JSON 解析失败' })
      return
    }
    const profile = /^[a-z0-9-]{1,32}$/.test(String(args.profile || '')) ? String(args.profile) : 'web'
    const info = resolveLocalInfo()
    if (info.source === 'local') {
      sendJson(res, 200, { ok: false, error: '当前为本地开发模式（link/file 源），无法通过 npm 更新；请直接更新源码。' })
      return
    }
    const command = 'dsh plugin --profile ' + profile + ' update ' + PACKAGE_NAME
    console.log('[view-manager] update: ' + command)
    const out = await runDsh(['plugin', '--profile', profile, 'update', PACKAGE_NAME])
    if (out.spawnError) {
      sendJson(res, 200, { ok: false, error: '执行失败: ' + String(out.spawnError.message || out.spawnError) })
      return
    }
    // Verify: re-read local version after the update completed.
    const after = resolveLocalInfo()
    const latest = await fetchNpmLatest()
    const verified = latest !== null && after.version === latest
    sendJson(res, 200, {
      ok: out.code === 0,
      exit_code: out.code === null ? null : out.code,
      timed_out: out.timedOut,
      stdout_tail: out.stdout.slice(-4000),
      stderr_tail: out.stderr.slice(-2000),
      command,
      verified,
      version_after: after.version,
      latest,
      need_restart: true,
    })
    return
  }

  res.writeHead(404)
  res.end('not found')
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/view-manager-api',
    handler: handle,
  }))
  console.log('[view-manager] /view-manager-api routes registered')
}
