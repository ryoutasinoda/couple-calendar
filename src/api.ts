const API_BASE_URL = 'https://couple-calendar-api.couple-calendar-81806.workers.dev'

type ApiErrorBody = {
  error?: string
}

export type ApiUser = {
  id: number
  login_id: string
  display_name: string
  role: 'husband' | 'wife' | null
  couple_id: number | null
}

export type ApiEvent = {
  id: number
  couple_id: number
  created_by: number
  title: string
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  is_all_day: number
  target: 'husband' | 'wife' | 'both'
  icon: string
  location: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const body = await response.json() as T | ApiErrorBody
  if (!response.ok) {
    const errorBody = body as ApiErrorBody
    const message = errorBody.error || `API request failed: ${response.status}`
    throw new Error(message)
  }

  return body as T
}

export const register = (loginId: string, displayName: string, password: string) =>
  request<{ ok: true; user: ApiUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ login_id: loginId, display_name: displayName, password }),
  })

export const login = (loginId: string, password: string) =>
  request<{ ok: true; user: ApiUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login_id: loginId, password }),
  })

export const getCurrentUser = () =>
  request<{ ok: true; user: ApiUser }>('/api/auth/me')

export const logout = () =>
  request<{ ok: true }>('/api/auth/logout', { method: 'POST' })

export const createCouple = (role: 'husband' | 'wife') =>
  request<{ ok: true; couple_id: number; role: string; invite_code: string }>('/api/couple/create', {
    method: 'POST',
    body: JSON.stringify({ role }),
  })

export const joinCouple = (inviteCode: string, role: 'husband' | 'wife') =>
  request<{ ok: true; couple_id: number; role: string }>('/api/couple/join', {
    method: 'POST',
    body: JSON.stringify({ invite_code: inviteCode, role }),
  })

export const regenerateInviteCode = () =>
  request<{ ok: true; invite_code: string }>('/api/couple/invite-code/regenerate', {
    method: 'POST',
  })

export const getEvents = (from: string, to: string) =>
  request<{ ok: true; events: ApiEvent[] }>(`/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)

export const createEvent = (event: Record<string, unknown>) =>
  request<{ ok: true; event: ApiEvent }>('/api/events', {
    method: 'POST',
    body: JSON.stringify(event),
  })

export const updateEvent = (id: number, event: Record<string, unknown>) =>
  request<{ ok: true; event: ApiEvent }>(`/api/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(event),
  })

export const deleteEvent = (id: number) =>
  request<{ ok: true; deleted_id: number }>(`/api/events/${id}`, {
    method: 'DELETE',
  })
