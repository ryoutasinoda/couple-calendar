type SessionUser = {
  id: number
  loginId: string
  displayName: string
  role: 'husband' | 'wife' | null
  coupleId: number | null
}

type Env = {
  DB: any
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'http://localhost:5173',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
}

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    ...CORS_HEADERS,
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

const setSessionCookie = (response: Response, sessionId: string) => {
  const cookie = `session_id=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  response.headers.append('Set-Cookie', cookie)
  return response
}

const clearSessionCookie = (response: Response) => {
  const cookie = 'session_id=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
  response.headers.append('Set-Cookie', cookie)
  return response
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
  ]

  for (const statement of statements) {
    await db.prepare(statement).run()
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    await ensureSchema(env.DB)

    const url = new URL(request.url)
    const path = url.pathname

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
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
      return setSessionCookie(response, sessionId)
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
      return setSessionCookie(response, sessionId)
    }

    if (path === '/api/auth/logout') {
      const response = jsonResponse({ ok: true })
      return clearSessionCookie(response)
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
        const filters: string[] = []
        const params: any[] = [auth.user.coupleId]

        if (from && isValidDateString(from)) {
          filters.push('start_date >= ?')
          params.push(from)
        }
        if (to && isValidDateString(to)) {
          filters.push('start_date <= ?')
          params.push(to)
        }

        const whereClause = filters.length ? `WHERE couple_id = ? AND ${filters.join(' AND ')}` : 'WHERE couple_id = ?'
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
            is_all_day, target, icon, location, memo, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

        return jsonResponse({ ok: true, event: eventRow })
      }

      if (request.method === 'PUT' && eventId !== null) {
        const auth = await requireAuth(request, env.DB)
        if (!auth.user) return auth.response as Response

        const existing = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(eventId).first()
        if (!existing) return jsonResponse({ error: '予定が見つかりません。' }, 404)
        if (existing.couple_id !== auth.user.coupleId) return jsonResponse({ error: 'この夫婦の予定ではありません。' }, 403)

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
            is_all_day = ?, target = ?, icon = ?, location = ?, memo = ?, updated_at = ?
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

        await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(eventId).run()
        return jsonResponse({ ok: true, deleted_id: eventId })
      }
    }

    return jsonResponse({ error: 'Not found' }, 404)
  },
} as const
