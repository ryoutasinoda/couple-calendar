type SessionUser = {
  id: number
  loginId: string
  displayName: string
  role: 'husband' | 'wife' | null
  coupleId: number | null
}

import webPush from 'web-push'

type Env = {
  DB: any
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
}

const SESSION_COOKIE = 'session_id'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7
const VALID_TARGETS = new Set(['husband', 'wife', 'both'])
const VALID_ROLES = new Set(['husband', 'wife'])
const VALID_ICONS = new Set([
  'calendar',
  'hospital',
  'heart',
  'work',
  'shopping',
  'other',
  'period',
  'ovulation',
  'injection',
  'checkup',
  'test',
  'pregnancy',
])
const VALID_SELF_TEST_TYPES = new Set(['ovulation', 'pregnancy'])
const VALID_SELF_TEST_RESULTS = new Set(['negative', 'positive', 'pending'])
// 周期が自動終了せず放置されるのを防ぐための補助ルール（次の生理が来ないまま経過したら周期を区切る目安日数）
const CYCLE_AUTO_CLOSE_DAYS = 60

const ALLOWED_ORIGINS = new Set([
  'https://couple-calendar-atu.pages.dev',
])

const PUSH_SUBSCRIPTIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    couple_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(endpoint)
  )
`

const isAllowedOrigin = (origin: string | null) => {
  if (!origin) return false
  if (ALLOWED_ORIGINS.has(origin)) return true
  return /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)(?::\d+)?$/.test(origin)
}

let currentRequest: Request | null = null

const getCorsHeaders = (request: Request | null = currentRequest) => {
  const origin = request?.headers.get('Origin')
  const allowedOrigin = origin && isAllowedOrigin(origin) ? origin : 'https://couple-calendar-atu.pages.dev'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Vary': 'Origin',
  }
}

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    ...getCorsHeaders(),
    ...(headers ?? {}),
  },
})

const readJsonBody = async (request: Request) => {
  try {
    return await request.json()
  } catch {
    return {}
  }
}

const isValidDateString = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
const isValidTimeString = (value: string) => /^\d{2}:\d{2}$/.test(value)

const hashValue = async (value: string) => {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const createSessionId = () => {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

const getCookieValue = (cookieHeader: string | null, name: string) => {
  if (!cookieHeader) return null
  const match = cookieHeader.split(';').find((part) => part.trim().startsWith(`${name}=`))
  return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : null
}

const isLocalRequest = (request: Request) => {
  const origin = request.headers.get('Origin') ?? ''
  const host = request.headers.get('Host') ?? ''
  return /localhost|127\.0\.0\.1/.test(origin) || /localhost|127\.0\.0\.1/.test(host)
}

const buildSessionCookie = (request: Request, sessionId: string, isClear = false) => {
  const value = isClear ? '' : encodeURIComponent(sessionId)
  const maxAge = isClear ? 0 : Math.floor(SESSION_TTL_MS / 1000)
  const localRequest = isLocalRequest(request)
  const securePart = localRequest ? '' : '; Secure'
  return `session_id=${value}; Path=/; HttpOnly; SameSite=${localRequest ? 'Lax' : 'None'}${securePart}; Max-Age=${maxAge}`
}

const setSessionCookie = (response: Response, request: Request, sessionId: string) => {
  response.headers.append('Set-Cookie', buildSessionCookie(request, sessionId))
  return response
}

const clearSessionCookie = (response: Response, request: Request) => {
  response.headers.append('Set-Cookie', buildSessionCookie(request, '', true))
  return response
}

const isPushEnabled = (env: Env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)

const sendPushToCouple = async (env: Env, coupleId: number, title: string, body: string) => {
  if (!isPushEnabled(env)) return
  const rows = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE couple_id = ?').bind(coupleId).all()
  const payload = JSON.stringify({ title, body, tag: 'couple-calendar', data: { couple_id: coupleId } })
  const sends = (rows.results ?? []).map(async (row: any) => {
    try {
      await webPush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        payload,
        {
          vapidDetails: {
            subject: 'mailto:hello@couple-calendar.app',
            publicKey: env.VAPID_PUBLIC_KEY!,
            privateKey: env.VAPID_PRIVATE_KEY!,
          },
        },
      )
    } catch {
      // Subscriptions may become invalid; they are silently removed on the next cleanup pass.
    }
  })
  await Promise.allSettled(sends)
}

const ensureSchema = async (db: any) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS couples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invite_code_hash TEXT,
      invite_code_expires_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS couple_members (
      couple_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('husband', 'wife')),
      created_at TEXT NOT NULL,
      UNIQUE(couple_id, user_id),
      UNIQUE(couple_id, role)
    )`,
    `CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      couple_id INTEGER NOT NULL,
      created_by INTEGER NOT NULL,
      title TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      start_time TEXT,
      end_time TEXT,
      is_all_day INTEGER NOT NULL DEFAULT 1,
      target TEXT NOT NULL CHECK(target IN ('husband', 'wife', 'both')),
      icon TEXT NOT NULL,
      location TEXT,
      memo TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      couple_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS period_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      couple_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      couple_id INTEGER NOT NULL,
      period_record_id INTEGER,
      start_date TEXT NOT NULL,
      end_date TEXT,
      treatment_type TEXT,
      result TEXT,
      is_manual_override INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS self_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      couple_id INTEGER NOT NULL,
      cycle_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('ovulation', 'pregnancy')),
      result TEXT NOT NULL CHECK(result IN ('negative', 'positive', 'pending')),
      tested_at TEXT NOT NULL,
      memo TEXT,
      created_by INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    PUSH_SUBSCRIPTIONS_TABLE,
  ]

  for (const statement of statements) {
    await db.prepare(statement).run()
  }

  // 既存DBへのカラム追加（D1はIF NOT EXISTSに未対応なので、二重追加エラーは無視する）
  const alterStatements = [
    'ALTER TABLE events ADD COLUMN category_id INTEGER',
    'ALTER TABLE events ADD COLUMN cycle_id INTEGER',
    'ALTER TABLE events ADD COLUMN amount INTEGER',
    'ALTER TABLE events ADD COLUMN shared INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE events ADD COLUMN notify_before_day INTEGER NOT NULL DEFAULT 0',
  ]
  for (const statement of alterStatements) {
    try {
      await db.prepare(statement).run()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('duplicate column')) throw error
    }
  }
}

const getCurrentUser = async (request: Request, db: any): Promise<SessionUser | null> => {
  const sessionId = getCookieValue(request.headers.get('Cookie'), SESSION_COOKIE)
  if (!sessionId) return null

  const sessionRow = await db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').bind(sessionId, new Date().toISOString()).first()
  if (!sessionRow) return null

  const userRow = await db.prepare('SELECT id, login_id, display_name FROM users WHERE id = ?').bind(sessionRow.user_id).first()
  if (!userRow) return null

  const membershipRow = await db.prepare('SELECT couple_id, role FROM couple_members WHERE user_id = ?').bind(userRow.id).first()
  if (!membershipRow) {
    return {
      id: userRow.id,
      loginId: userRow.login_id,
      displayName: userRow.display_name,
      role: null,
      coupleId: null,
    }
  }

  return {
    id: userRow.id,
    loginId: userRow.login_id,
    displayName: userRow.display_name,
    role: membershipRow.role,
    coupleId: membershipRow.couple_id,
  }
}

const requireAuth = async (request: Request, db: any) => {
  const user = await getCurrentUser(request, db)
  if (!user) {
    return { response: jsonResponse({ error: '認証が必要です。' }, 401), user: null }
  }
  return { response: null, user }
}

const requireCoupleMembership = async (request: Request, db: any, coupleId: number) => {
  const auth = await requireAuth(request, db)
  if (!auth.user) return { response: auth.response, ok: false }
  if (auth.user.coupleId !== coupleId) {
    return { response: jsonResponse({ error: 'この夫婦の予定にはアクセスできません。' }, 403), ok: false }
  }
  return { response: null, ok: true, user: auth.user }
}

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let index = 0; index < 8; index += 1) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

const DEFAULT_CATEGORIES = [
  { name: '予定', icon: 'calendar', color: '#8a8a99' },
  { name: 'デート', icon: 'heart', color: '#e29aa8' },
  { name: '仕事', icon: 'work', color: '#7c93c2' },
  { name: '買い物', icon: 'shopping', color: '#c2a37c' },
  { name: '診察', icon: 'hospital', color: '#6fb1a0' },
  { name: '注射(通院)', icon: 'injection', color: '#9a8fd1' },
  { name: '自己注射', icon: 'injection', color: '#b58fd1' },
  { name: '服薬', icon: 'checkup', color: '#8fb0d1' },
  { name: '移植', icon: 'checkup', color: '#d18f9f' },
  { name: '生理', icon: 'period', color: '#c98fa8' },
  { name: 'その他', icon: 'other', color: '#a3a3ad' },
]

const createDefaultCategories = async (db: any, coupleId: number) => {
  const now = new Date().toISOString()
  for (const category of DEFAULT_CATEGORIES) {
    await db.prepare('INSERT INTO categories (couple_id, name, icon, color, is_default, created_at) VALUES (?, ?, ?, ?, 1, ?)')
      .bind(coupleId, category.name, category.icon, category.color, now)
      .run()
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    currentRequest = request
    try {
      await ensureSchema(env.DB)

      const url = new URL(request.url)
      const path = url.pathname

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: getCorsHeaders(request) })
      }

      if (path === '/api/health') {
        return jsonResponse({ ok: true, name: 'couple-calendar-api', time: new Date().toISOString() })
      }

      if (path === '/api/auth/register') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'POST を指定してください。' }, 405)
      }

      const payload = await readJsonBody(request)
      const loginId = typeof payload.login_id === 'string' ? payload.login_id.trim() : ''
      const displayName = typeof payload.display_name === 'string' ? payload.display_name.trim() : ''
      const password = typeof payload.password === 'string' ? payload.password : ''

      if (!loginId || !displayName || !password) {
        return jsonResponse({ error: 'login_id / display_name / password を入力してください。' }, 400)
      }

      const existingUser = await env.DB.prepare('SELECT id FROM users WHERE login_id = ?').bind(loginId).first()
      if (existingUser) {
        return jsonResponse({ error: 'このログインIDは既に使われています。' }, 409)
      }

      const passwordHash = await hashValue(password)
      const result = await env.DB.prepare('INSERT INTO users (login_id, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)')
        .bind(loginId, displayName, passwordHash, new Date().toISOString())
        .run()

      const user = await env.DB.prepare('SELECT id, login_id, display_name FROM users WHERE id = ?').bind(result.meta.last_row_id).first()
      const sessionId = createSessionId()
      await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .bind(sessionId, user.id, new Date(Date.now() + SESSION_TTL_MS).toISOString(), new Date().toISOString())
        .run()

      const response = jsonResponse({ ok: true, user: { id: user.id, login_id: user.login_id, display_name: user.display_name } }, 201)
      return setSessionCookie(response, request, sessionId)
    }

    if (path === '/api/auth/login') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'POST を指定してください。' }, 405)
      }

      const payload = await readJsonBody(request)
      const loginId = typeof payload.login_id === 'string' ? payload.login_id.trim() : ''
      const password = typeof payload.password === 'string' ? payload.password : ''

      if (!loginId || !password) {
        return jsonResponse({ error: 'login_id と password を入力してください。' }, 400)
      }

      const user = await env.DB.prepare('SELECT * FROM users WHERE login_id = ?').bind(loginId).first()
      if (!user) {
        return jsonResponse({ error: 'ログイン情報が一致しません。' }, 401)
      }

      const passwordHash = await hashValue(password)
      if (user.password_hash !== passwordHash) {
        return jsonResponse({ error: 'ログイン情報が一致しません。' }, 401)
      }

      const sessionId = createSessionId()
      await env.DB.prepare('INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
        .bind(sessionId, user.id, new Date(Date.now() + SESSION_TTL_MS).toISOString(), new Date().toISOString())
        .run()

      const response = jsonResponse({ ok: true, user: { id: user.id, login_id: user.login_id, display_name: user.display_name } })
      return setSessionCookie(response, request, sessionId)
    }

    if (path === '/api/auth/logout') {
      const response = jsonResponse({ ok: true })
      return clearSessionCookie(response, request)
    }

    if (path === '/api/push/public-key') {
      return jsonResponse({ ok: true, publicKey: env.VAPID_PUBLIC_KEY || null })
    }

    if (path === '/api/push/subscribe') {
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response
      if (!auth.user.coupleId) return jsonResponse({ error: '夫婦登録が必要です。' }, 400)

      const payload = await readJsonBody(request)
      const endpoint = typeof payload.endpoint === 'string' ? payload.endpoint : ''
      const p256dh = typeof payload.p256dh === 'string' ? payload.p256dh : ''
      const authKey = typeof payload.auth === 'string' ? payload.auth : ''

      if (!endpoint || !p256dh || !authKey) {
        return jsonResponse({ error: 'push subscription が不正です。' }, 400)
      }

      const now = new Date().toISOString()
      await env.DB.prepare(`
        INSERT INTO push_subscriptions (couple_id, user_id, endpoint, p256dh, auth, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, user_id = excluded.user_id, couple_id = excluded.couple_id, updated_at = excluded.updated_at
      `).bind(auth.user.coupleId, auth.user.id, endpoint, p256dh, authKey, now, now).run()

      return jsonResponse({ ok: true })
    }

    if (path === '/api/auth/me') {
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) {
        return auth.response as Response
      }

      return jsonResponse({
        ok: true,
        user: {
          id: auth.user.id,
          login_id: auth.user.loginId,
          display_name: auth.user.displayName,
          role: auth.user.role,
          couple_id: auth.user.coupleId,
        },
      })
    }

    if (path === '/api/couple/create') {
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response

      const payload = await readJsonBody(request)
      const role = typeof payload.role === 'string' ? payload.role : ''
      if (!VALID_ROLES.has(role)) {
        return jsonResponse({ error: 'role は husband または wife を指定してください。' }, 400)
      }

      const existingMembership = await env.DB.prepare('SELECT couple_id FROM couple_members WHERE user_id = ?').bind(auth.user.id).first()
      if (existingMembership) {
        return jsonResponse({ error: '既に夫婦情報に参加済みです。' }, 409)
      }

      const inviteCode = generateInviteCode()
      const inviteCodeHash = await hashValue(inviteCode)
      const coupleResult = await env.DB.prepare('INSERT INTO couples (invite_code_hash, invite_code_expires_at, created_at) VALUES (?, ?, ?)')
        .bind(inviteCodeHash, new Date(Date.now() + SESSION_TTL_MS).toISOString(), new Date().toISOString())
        .run()

      await env.DB.prepare('INSERT INTO couple_members (couple_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
        .bind(coupleResult.meta.last_row_id, auth.user.id, role, new Date().toISOString())
        .run()

      await createDefaultCategories(env.DB, coupleResult.meta.last_row_id as number)

      return jsonResponse({
        ok: true,
        couple_id: coupleResult.meta.last_row_id,
        role,
        invite_code: inviteCode,
      })
    }

    if (path === '/api/couple/join') {
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response

      const payload = await readJsonBody(request)
      const inviteCode = typeof payload.invite_code === 'string' ? payload.invite_code.trim() : ''
      const role = typeof payload.role === 'string' ? payload.role : ''
      if (!inviteCode || !VALID_ROLES.has(role)) {
        return jsonResponse({ error: 'invite_code と role を指定してください。' }, 400)
      }

      const existingMembership = await env.DB.prepare('SELECT couple_id FROM couple_members WHERE user_id = ?').bind(auth.user.id).first()
      if (existingMembership) {
        return jsonResponse({ error: '既に夫婦情報に参加済みです。' }, 409)
      }

      const candidateCouple = await env.DB.prepare('SELECT * FROM couples WHERE invite_code_hash IS NOT NULL').all()
      let matchedCouple: any = null

      for (const row of candidateCouple.results ?? []) {
        const hash = await hashValue(inviteCode)
        if (row.invite_code_hash === hash) {
          matchedCouple = row
          break
        }
      }

      if (!matchedCouple) {
        return jsonResponse({ error: '招待コードが見つかりません。' }, 404)
      }

      if (!matchedCouple.invite_code_expires_at || matchedCouple.invite_code_expires_at <= new Date().toISOString()) {
        return jsonResponse({ error: '招待コードの有効期限が切れています。新しいコードを発行してください。' }, 410)
      }

      const roleExists = await env.DB.prepare('SELECT couple_id FROM couple_members WHERE couple_id = ? AND role = ?').bind(matchedCouple.id, role).first()
      if (roleExists) {
        return jsonResponse({ error: '指定した役割は既に登録済みです。' }, 409)
      }

      await env.DB.prepare('INSERT INTO couple_members (couple_id, user_id, role, created_at) VALUES (?, ?, ?, ?)')
        .bind(matchedCouple.id, auth.user.id, role, new Date().toISOString())
        .run()

      return jsonResponse({ ok: true, couple_id: matchedCouple.id, role })
    }

    if (path === '/api/couple/invite-code/regenerate') {
      if (request.method !== 'POST') {
        return jsonResponse({ error: 'POST を指定してください。' }, 405)
      }

      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response
      if (auth.user.coupleId === null) {
        return jsonResponse({ error: '夫婦カレンダーに参加していません。' }, 400)
      }

      const inviteCode = generateInviteCode()
      const inviteCodeHash = await hashValue(inviteCode)
      await env.DB.prepare('UPDATE couples SET invite_code_hash = ?, invite_code_expires_at = ? WHERE id = ?')
        .bind(inviteCodeHash, new Date(Date.now() + SESSION_TTL_MS).toISOString(), auth.user.coupleId)
        .run()

      return jsonResponse({ ok: true, invite_code: inviteCode })
    }

    if (path === '/api/couple') {
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response

      const coupleRow = await env.DB.prepare('SELECT * FROM couples WHERE id = ?').bind(auth.user.coupleId).first()
      const members = await env.DB.prepare('SELECT user_id, role FROM couple_members WHERE couple_id = ?').bind(auth.user.coupleId).all()
      const userRows = await Promise.all((members.results ?? []).map(async (memberRow: any) => {
        const userRow = await env.DB.prepare('SELECT id, login_id, display_name FROM users WHERE id = ?').bind(memberRow.user_id).first()
        return {
          id: userRow.id,
          login_id: userRow.login_id,
          display_name: userRow.display_name,
          role: memberRow.role,
        }
      }))

      return jsonResponse({
        ok: true,
        couple: {
          id: coupleRow?.id,
          invite_code_hash_set: Boolean(coupleRow?.invite_code_hash),
          members: userRows,
        },
      })
    }

    const eventMatch = path.match(/^\/api\/events(?:\/([0-9]+))?$/)
    if (eventMatch) {
      const eventId = eventMatch[1] ? Number(eventMatch[1]) : null

      if (request.method === 'GET' && !eventId) {
        const auth = await requireAuth(request, env.DB)
        if (!auth.user) return auth.response as Response

        const from = url.searchParams.get('from') ?? ''
        const to = url.searchParams.get('to') ?? ''
        const filters: string[] = ['(shared = 1 OR created_by = ?)']
        const params: any[] = [auth.user.coupleId, auth.user.id]

        if (from && isValidDateString(from)) {
          filters.push('start_date >= ?')
          params.push(from)
        }
        if (to && isValidDateString(to)) {
          filters.push('start_date <= ?')
          params.push(to)
        }

        const whereClause = `WHERE couple_id = ? AND ${filters.join(' AND ')}`
        const rows = await env.DB.prepare(`SELECT * FROM events ${whereClause} ORDER BY start_date ASC, start_time ASC, id ASC`).bind(...params).all()
        return jsonResponse({ ok: true, events: rows.results ?? [] })
      }

      if (request.method === 'POST' && !eventId) {
        const auth = await requireAuth(request, env.DB)
        if (!auth.user) return auth.response as Response

        const payload = await readJsonBody(request)
        const title = typeof payload.title === 'string' ? payload.title.trim() : ''
        const startDate = typeof payload.start_date === 'string' ? payload.start_date : ''
        const endDate = typeof payload.end_date === 'string' ? payload.end_date : ''
        const startTime = typeof payload.start_time === 'string' ? payload.start_time : ''
        const endTime = typeof payload.end_time === 'string' ? payload.end_time : ''
        const isAllDay = Boolean(payload.is_all_day)
        const target = typeof payload.target === 'string' ? payload.target : ''
        const icon = typeof payload.icon === 'string' ? payload.icon : ''
        const location = typeof payload.location === 'string' ? payload.location : ''
        const memo = typeof payload.memo === 'string' ? payload.memo : ''
        const categoryId = typeof payload.category_id === 'number' ? payload.category_id : null
        const cycleId = typeof payload.cycle_id === 'number' ? payload.cycle_id : null
        const amount = typeof payload.amount === 'number' ? payload.amount : null
        const shared = typeof payload.shared === 'boolean' ? payload.shared : true
        const notifyBeforeDay = Boolean(payload.notify_before_day)

        if (!title) return jsonResponse({ error: 'title は必須です。' }, 400)
        if (!isValidDateString(startDate)) return jsonResponse({ error: 'start_date の形式が不正です。' }, 400)
        if (endDate && !isValidDateString(endDate)) return jsonResponse({ error: 'end_date の形式が不正です。' }, 400)
        if (!VALID_TARGETS.has(target)) return jsonResponse({ error: 'target の値が不正です。' }, 400)
        if (!VALID_ICONS.has(icon)) return jsonResponse({ error: 'icon の値が不正です。' }, 400)
        if (!isAllDay && startTime && !isValidTimeString(startTime)) return jsonResponse({ error: 'start_time の形式が不正です。' }, 400)
        if (!isAllDay && endTime && !isValidTimeString(endTime)) return jsonResponse({ error: 'end_time の形式が不正です。' }, 400)
        if (!isAllDay && startTime && endTime && endTime < startTime) return jsonResponse({ error: '終了時刻は開始時刻以降にしてください。' }, 400)

        const normalizedStartTime = isAllDay ? null : startTime || null
        const normalizedEndTime = isAllDay ? null : endTime || null
        const now = new Date().toISOString()

        const result = await env.DB.prepare(`
          INSERT INTO events (
            couple_id, created_by, title, start_date, end_date, start_time, end_time,
            is_all_day, target, icon, location, memo, category_id, cycle_id, amount,
            shared, notify_before_day, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          auth.user.coupleId,
          auth.user.id,
          title,
          startDate,
          endDate || null,
          normalizedStartTime,
          normalizedEndTime,
          isAllDay ? 1 : 0,
          target,
          icon,
          location || null,
          memo || null,
          categoryId,
          cycleId,
          amount,
          shared ? 1 : 0,
          notifyBeforeDay ? 1 : 0,
          now,
          now,
        ).run()

        const created = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(result.meta.last_row_id).first()
        return jsonResponse({ ok: true, event: created }, 201)
      }

      if (request.method === 'GET' && eventId !== null) {
        const auth = await requireAuth(request, env.DB)
        if (!auth.user) return auth.response as Response

        const eventRow = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first()
        if (!eventRow) return jsonResponse({ error: '予定が見つかりません。' }, 404)
        if (eventRow.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'この夫婦の予定ではありません。' }, 403)
        if (!eventRow.shared && eventRow.created_by !== auth.user.id) return jsonResponse({ error: 'この予定は共有されていません。' }, 403)

        return jsonResponse({ ok: true, event: eventRow })
      }

      if (request.method === 'PUT' && eventId !== null) {
        const auth = await requireAuth(request, env.DB)
        if (!auth.user) return auth.response as Response

        const existing = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first()
        if (!existing) return jsonResponse({ error: '予定が見つかりません。' }, 404)
        if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'この夫婦の予定ではありません。' }, 403)
        if (!existing.shared && existing.created_by !== auth.user.id) return jsonResponse({ error: 'この予定は共有されていません。' }, 403)

        const payload = await readJsonBody(request)
        const title = typeof payload.title === 'string' ? payload.title.trim() : existing.title
        const startDate = typeof payload.start_date === 'string' ? payload.start_date : existing.start_date
        const endDate = typeof payload.end_date === 'string' ? payload.end_date : existing.end_date
        const startTime = typeof payload.start_time === 'string' ? payload.start_time : existing.start_time
        const endTime = typeof payload.end_time === 'string' ? payload.end_time : existing.end_time
        const target = typeof payload.target === 'string' ? payload.target : existing.target
        const icon = typeof payload.icon === 'string' ? payload.icon : existing.icon
        const location = typeof payload.location === 'string' ? payload.location : existing.location
        const memo = typeof payload.memo === 'string' ? payload.memo : existing.memo
        const isAllDay = typeof payload.is_all_day === 'boolean' ? payload.is_all_day : Boolean(existing.is_all_day)
        const categoryId = typeof payload.category_id === 'number' ? payload.category_id : existing.category_id
        const cycleId = typeof payload.cycle_id === 'number' ? payload.cycle_id : existing.cycle_id
        const amount = typeof payload.amount === 'number' ? payload.amount : existing.amount
        const shared = typeof payload.shared === 'boolean' ? payload.shared : Boolean(existing.shared)
        const notifyBeforeDay = typeof payload.notify_before_day === 'boolean' ? payload.notify_before_day : Boolean(existing.notify_before_day)

        if (!title) return jsonResponse({ error: 'title は必須です。' }, 400)
        if (!isValidDateString(startDate)) return jsonResponse({ error: 'start_date の形式が不正です。' }, 400)
        if (endDate && !isValidDateString(endDate)) return jsonResponse({ error: 'end_date の形式が不正です。' }, 400)
        if (!VALID_TARGETS.has(target)) return jsonResponse({ error: 'target の値が不正です。' }, 400)
        if (!VALID_ICONS.has(icon)) return jsonResponse({ error: 'icon の値が不正です。' }, 400)

        const normalizedStartTime = isAllDay ? null : (startTime || null)
        const normalizedEndTime = isAllDay ? null : (endTime || null)
        if (!isAllDay && normalizedStartTime && normalizedEndTime && normalizedEndTime < normalizedStartTime) {
          return jsonResponse({ error: '終了時刻は開始時刻以降にしてください。' }, 400)
        }

        await env.DB.prepare(`
          UPDATE events SET
            title = ?, start_date = ?, end_date = ?, start_time = ?, end_time = ?,
            is_all_day = ?, target = ?, icon = ?, location = ?, memo = ?, category_id = ?,
            cycle_id = ?, amount = ?, shared = ?, notify_before_day = ?, updated_at = ?
          WHERE id = ?
        `).bind(
          title,
          startDate,
          endDate || null,
          normalizedStartTime,
          normalizedEndTime,
          isAllDay ? 1 : 0,
          target,
          icon,
          location || null,
          memo || null,
          categoryId,
          cycleId,
          amount,
          shared ? 1 : 0,
          notifyBeforeDay ? 1 : 0,
          new Date().toISOString(),
          eventId,
        ).run()

        const updated = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first()
        return jsonResponse({ ok: true, event: updated })
      }

      if (request.method === 'DELETE' && eventId !== null) {
        const auth = await requireAuth(request, env.DB)
        if (!auth.user) return auth.response as Response

        const existing = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first()
        if (!existing) return jsonResponse({ error: '予定が見つかりません。' }, 404)
        if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'この夫婦の予定ではありません。' }, 403)
        if (!existing.shared && existing.created_by !== auth.user.id) return jsonResponse({ error: 'この予定は共有されていません。' }, 403)

        await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(eventId).run()
        return jsonResponse({ ok: true, deleted_id: eventId })
      }
    }

    // ---- カテゴリ ----
    const categoryMatch = path.match(/^\/api\/categories(?:\/([0-9]+))?$/)
    if (categoryMatch) {
      const categoryId = categoryMatch[1] ? Number(categoryMatch[1]) : null
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response

      if (request.method === 'GET' && !categoryId) {
        const rows = await env.DB.prepare('SELECT * FROM categories WHERE couple_id = ? ORDER BY is_default DESC, id ASC').bind(auth.user.coupleId).all()
        return jsonResponse({ ok: true, categories: rows.results ?? [] })
      }

      if (request.method === 'POST' && !categoryId) {
        const payload = await readJsonBody(request)
        const name = typeof payload.name === 'string' ? payload.name.trim() : ''
        const icon = typeof payload.icon === 'string' ? payload.icon.trim() : ''
        const color = typeof payload.color === 'string' ? payload.color.trim() : ''
        if (!name || !icon || !color) return jsonResponse({ error: 'name / icon / color は必須です。' }, 400)

        const now = new Date().toISOString()
        const result = await env.DB.prepare('INSERT INTO categories (couple_id, name, icon, color, is_default, created_at) VALUES (?, ?, ?, ?, 0, ?)')
          .bind(auth.user.coupleId, name, icon, color, now)
          .run()
        const created = await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(result.meta.last_row_id).first()
        return jsonResponse({ ok: true, category: created }, 201)
      }

      if (request.method === 'PUT' && categoryId !== null) {
        const existing = await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(categoryId).first()
        if (!existing) return jsonResponse({ error: 'カテゴリが見つかりません。' }, 404)
        if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'このカテゴリは編集できません。' }, 403)

        const payload = await readJsonBody(request)
        const name = typeof payload.name === 'string' ? payload.name.trim() : existing.name
        const icon = typeof payload.icon === 'string' ? payload.icon.trim() : existing.icon
        const color = typeof payload.color === 'string' ? payload.color.trim() : existing.color
        if (!name || !icon || !color) return jsonResponse({ error: 'name / icon / color は必須です。' }, 400)

        await env.DB.prepare('UPDATE categories SET name = ?, icon = ?, color = ? WHERE id = ?').bind(name, icon, color, categoryId).run()
        const updated = await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(categoryId).first()
        return jsonResponse({ ok: true, category: updated })
      }

      if (request.method === 'DELETE' && categoryId !== null) {
        const existing = await env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(categoryId).first()
        if (!existing) return jsonResponse({ error: 'カテゴリが見つかりません。' }, 404)
        if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'このカテゴリは削除できません。' }, 403)
        if (existing.is_default) return jsonResponse({ error: '初期カテゴリは削除できません。' }, 400)

        await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(categoryId).run()
        return jsonResponse({ ok: true, deleted_id: categoryId })
      }
    }

    // ---- 生理期間 ----
    const periodMatch = path.match(/^\/api\/periods(?:\/([0-9]+))?$/)
    if (periodMatch) {
      const periodId = periodMatch[1] ? Number(periodMatch[1]) : null
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response

      if (request.method === 'GET' && !periodId) {
        const rows = await env.DB.prepare('SELECT * FROM period_records WHERE couple_id = ? ORDER BY start_date DESC').bind(auth.user.coupleId).all()
        return jsonResponse({ ok: true, periods: rows.results ?? [] })
      }

      if (request.method === 'POST' && !periodId) {
        const payload = await readJsonBody(request)
        const startDate = typeof payload.start_date === 'string' ? payload.start_date : ''
        if (!isValidDateString(startDate)) return jsonResponse({ error: 'start_date の形式が不正です。' }, 400)

        const openPeriod = await env.DB.prepare('SELECT * FROM period_records WHERE couple_id = ? AND end_date IS NULL ORDER BY start_date DESC LIMIT 1')
          .bind(auth.user.coupleId).first()
        if (openPeriod) {
          return jsonResponse({ error: '既に進行中の生理期間があります。' }, 409)
        }

        const now = new Date().toISOString()

        // 前回の未終了の周期があれば、今回の生理開始日の前日で自動的に区切る
        const openCycle = await env.DB.prepare('SELECT * FROM cycles WHERE couple_id = ? AND end_date IS NULL ORDER BY start_date DESC LIMIT 1')
          .bind(auth.user.coupleId).first()
        if (openCycle) {
          const previousDay = new Date(new Date(startDate).getTime() - 86400000).toISOString().slice(0, 10)
          await env.DB.prepare('UPDATE cycles SET end_date = ?, updated_at = ? WHERE id = ?').bind(previousDay, now, openCycle.id).run()
        }

        const periodResult = await env.DB.prepare('INSERT INTO period_records (couple_id, start_date, end_date, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)')
          .bind(auth.user.coupleId, startDate, now, now)
          .run()

        // 生理開始日を起点に新しい周期を自動生成
        await env.DB.prepare('INSERT INTO cycles (couple_id, period_record_id, start_date, end_date, treatment_type, result, is_manual_override, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, NULL, 0, ?, ?)')
          .bind(auth.user.coupleId, periodResult.meta.last_row_id, startDate, now, now)
          .run()

        const created = await env.DB.prepare('SELECT * FROM period_records WHERE id = ?').bind(periodResult.meta.last_row_id).first()
        return jsonResponse({ ok: true, period: created }, 201)
      }

      if (request.method === 'PUT' && periodId !== null) {
        const existing = await env.DB.prepare('SELECT * FROM period_records WHERE id = ?').bind(periodId).first()
        if (!existing) return jsonResponse({ error: '記録が見つかりません。' }, 404)
        if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'この記録は編集できません。' }, 403)

        const payload = await readJsonBody(request)
        const startDate = typeof payload.start_date === 'string' ? payload.start_date : existing.start_date
        const endDate = typeof payload.end_date === 'string' ? payload.end_date : existing.end_date
        if (!isValidDateString(startDate)) return jsonResponse({ error: 'start_date の形式が不正です。' }, 400)
        if (endDate && !isValidDateString(endDate)) return jsonResponse({ error: 'end_date の形式が不正です。' }, 400)

        const now = new Date().toISOString()
        await env.DB.prepare('UPDATE period_records SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?')
          .bind(startDate, endDate || null, now, periodId)
          .run()

        const relatedCycle = await env.DB.prepare('SELECT * FROM cycles WHERE couple_id = ? AND period_record_id = ? ORDER BY start_date DESC LIMIT 1')
          .bind(auth.user.coupleId, periodId)
          .first()
        if (relatedCycle) {
          const nextEndDate = endDate || relatedCycle.end_date
          await env.DB.prepare('UPDATE cycles SET start_date = ?, end_date = ?, updated_at = ? WHERE id = ?')
            .bind(startDate, nextEndDate || null, now, relatedCycle.id)
            .run()
        }

        const updated = await env.DB.prepare('SELECT * FROM period_records WHERE id = ?').bind(periodId).first()
        return jsonResponse({ ok: true, period: updated })
      }
    }

    // ---- 治療周期 ----
    const cycleMatch = path.match(/^\/api\/cycles(?:\/([0-9]+))?$/)
    if (cycleMatch) {
      const cycleId = cycleMatch[1] ? Number(cycleMatch[1]) : null
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response

      if (request.method === 'GET' && !cycleId) {
        // 妊娠判定待ちなどで生理が来ず放置された周期は、経過日数で自動終了させる（補助ルール）
        const staleThreshold = new Date(Date.now() - CYCLE_AUTO_CLOSE_DAYS * 86400000).toISOString().slice(0, 10)
        await env.DB.prepare('UPDATE cycles SET end_date = start_date, updated_at = ? WHERE couple_id = ? AND end_date IS NULL AND start_date <= ?')
          .bind(new Date().toISOString(), auth.user.coupleId, staleThreshold)
          .run()

        const rows = await env.DB.prepare('SELECT * FROM cycles WHERE couple_id = ? ORDER BY start_date DESC').bind(auth.user.coupleId).all()
        const cycles = await Promise.all((rows.results ?? []).map(async (cycle: any) => {
          const eventCount = await env.DB.prepare('SELECT COUNT(*) as count FROM events WHERE cycle_id = ?').bind(cycle.id).first()
          const testCount = await env.DB.prepare('SELECT COUNT(*) as count FROM self_tests WHERE cycle_id = ?').bind(cycle.id).first()
          return { ...cycle, event_count: eventCount?.count ?? 0, self_test_count: testCount?.count ?? 0 }
        }))
        return jsonResponse({ ok: true, cycles })
      }

      if (request.method === 'PUT' && cycleId !== null) {
        const existing = await env.DB.prepare('SELECT * FROM cycles WHERE id = ?').bind(cycleId).first()
        if (!existing) return jsonResponse({ error: '周期が見つかりません。' }, 404)
        if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'この周期は編集できません。' }, 403)

        const payload = await readJsonBody(request)
        const startDate = typeof payload.start_date === 'string' ? payload.start_date : existing.start_date
        const endDate = typeof payload.end_date === 'string' ? payload.end_date : existing.end_date
        const treatmentType = typeof payload.treatment_type === 'string' ? payload.treatment_type : existing.treatment_type
        const result = typeof payload.result === 'string' ? payload.result : existing.result
        // 境界の手動編集（分割・統合の補正）が行われたことを記録する
        const manualOverride = (typeof payload.start_date === 'string' || typeof payload.end_date === 'string')
          ? 1
          : (existing.is_manual_override ? 1 : 0)

        if (!isValidDateString(startDate)) return jsonResponse({ error: 'start_date の形式が不正です。' }, 400)
        if (endDate && !isValidDateString(endDate)) return jsonResponse({ error: 'end_date の形式が不正です。' }, 400)

        await env.DB.prepare('UPDATE cycles SET start_date = ?, end_date = ?, treatment_type = ?, result = ?, is_manual_override = ?, updated_at = ? WHERE id = ?')
          .bind(startDate, endDate || null, treatmentType || null, result || null, manualOverride, new Date().toISOString(), cycleId)
          .run()

        const updated = await env.DB.prepare('SELECT * FROM cycles WHERE id = ?').bind(cycleId).first()
        return jsonResponse({ ok: true, cycle: updated })
      }
    }

    // ---- 自己検査 ----
    const selfTestMatch = path.match(/^\/api\/self-tests(?:\/([0-9]+))?$/)
    if (selfTestMatch) {
      const selfTestId = selfTestMatch[1] ? Number(selfTestMatch[1]) : null
      const auth = await requireAuth(request, env.DB)
      if (!auth.user) return auth.response as Response

      if (request.method === 'GET' && !selfTestId) {
        const rows = await env.DB.prepare('SELECT * FROM self_tests WHERE couple_id = ? ORDER BY tested_at DESC').bind(auth.user.coupleId).all()
        return jsonResponse({ ok: true, self_tests: rows.results ?? [] })
      }

      if (request.method === 'POST' && !selfTestId) {
        const payload = await readJsonBody(request)
        const type = typeof payload.type === 'string' ? payload.type : ''
        const result = typeof payload.result === 'string' ? payload.result : ''
        const testedAt = typeof payload.tested_at === 'string' ? payload.tested_at : ''
        const memo = typeof payload.memo === 'string' ? payload.memo : ''
        const cycleId = typeof payload.cycle_id === 'number' ? payload.cycle_id : null

        if (!VALID_SELF_TEST_TYPES.has(type)) return jsonResponse({ error: 'type は ovulation または pregnancy を指定してください。' }, 400)
        if (!VALID_SELF_TEST_RESULTS.has(result)) return jsonResponse({ error: 'result は negative / positive / pending を指定してください。' }, 400)
        if (!testedAt) return jsonResponse({ error: 'tested_at は必須です。' }, 400)

        const now = new Date().toISOString()
        const insertResult = await env.DB.prepare('INSERT INTO self_tests (couple_id, cycle_id, type, result, tested_at, memo, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(auth.user.coupleId, cycleId, type, result, testedAt, memo || null, auth.user.id, now, now)
          .run()

        const created = await env.DB.prepare('SELECT * FROM self_tests WHERE id = ?').bind(insertResult.meta.last_row_id).first()
        return jsonResponse({ ok: true, self_test: created }, 201)
      }

      if (request.method === 'PUT' && selfTestId !== null) {
        const existing = await env.DB.prepare('SELECT * FROM self_tests WHERE id = ?').bind(selfTestId).first()
        if (!existing) return jsonResponse({ error: '記録が見つかりません。' }, 404)
        if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'この記録は編集できません。' }, 403)

        const payload = await readJsonBody(request)
        const type = typeof payload.type === 'string' ? payload.type : existing.type
        const result = typeof payload.result === 'string' ? payload.result : existing.result
        const testedAt = typeof payload.tested_at === 'string' ? payload.tested_at : existing.tested_at
        const memo = typeof payload.memo === 'string' ? payload.memo : existing.memo

        if (!VALID_SELF_TEST_TYPES.has(type)) return jsonResponse({ error: 'type は ovulation または pregnancy を指定してください。' }, 400)
        if (!VALID_SELF_TEST_RESULTS.has(result)) return jsonResponse({ error: 'result は negative / positive / pending を指定してください。' }, 400)

        await env.DB.prepare('UPDATE self_tests SET type = ?, result = ?, tested_at = ?, memo = ?, updated_at = ? WHERE id = ?')
          .bind(type, result, testedAt, memo || null, new Date().toISOString(), selfTestId)
          .run()

        const updated = await env.DB.prepare('SELECT * FROM self_tests WHERE id = ?').bind(selfTestId).first()
        return jsonResponse({ ok: true, self_test: updated })
      }

        if (request.method === 'DELETE' && selfTestId !== null) {
          const existing = await env.DB.prepare('SELECT * FROM self_tests WHERE id = ?').bind(selfTestId).first()
          if (!existing) return jsonResponse({ error: '記録が見つかりません。' }, 404)
          if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'この記録は削除できません。' }, 403)

          await env.DB.prepare('DELETE FROM self_tests WHERE id = ?').bind(selfTestId).run()
          return jsonResponse({ ok: true, deleted_id: selfTestId })
        }
      }

      return jsonResponse({ error: 'Not found' }, 404)
    } finally {
      currentRequest = null
    }
  },
} as const
