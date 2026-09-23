const API_BASE_URL = ''

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
  category_id: number | null
  cycle_id: number | null
  amount: number | null
  shared: number
  notify_before_day: number
  created_at: string
  updated_at: string
}

export type ApiCategory = {
  id: number
  couple_id: number
  name: string
  icon: string
  color: string
  is_default: number
  created_at: string
}

export type ApiPeriodRecord = {
  id: number
  couple_id: number
  start_date: string
  end_date: string | null
  created_at: string
  updated_at: string
}

export type ApiCycle = {
  id: number
  couple_id: number
  period_record_id: number | null
  start_date: string
  end_date: string | null
  treatment_type: string | null
  result: '陽性' | '陰性' | null
  is_manual_override: number
  event_count: number
  self_test_count: number
  created_at: string
  updated_at: string
}

export type SelfTestType = 'ovulation' | 'pregnancy'
export type SelfTestResult = 'negative' | 'positive' | 'pending'

export type ApiSelfTest = {
  id: number
  couple_id: number
  cycle_id: number | null
  type: SelfTestType
  result: SelfTestResult
  tested_at: string
  memo: string | null
  created_by: number
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

// ---- カテゴリ ----

export const getCategories = () =>
  request<{ ok: true; categories: ApiCategory[] }>('/api/categories')

export const createCategory = (category: { name: string; icon: string; color: string }) =>
  request<{ ok: true; category: ApiCategory }>('/api/categories', {
    method: 'POST',
    body: JSON.stringify(category),
  })

export const updateCategory = (id: number, category: Partial<{ name: string; icon: string; color: string }>) =>
  request<{ ok: true; category: ApiCategory }>(`/api/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(category),
  })

export const deleteCategory = (id: number) =>
  request<{ ok: true; deleted_id: number }>(`/api/categories/${id}`, {
    method: 'DELETE',
  })

// ---- 生理期間 ----

export const getPeriods = () =>
  request<{ ok: true; periods: ApiPeriodRecord[] }>('/api/periods')

export const startPeriod = (startDate: string) =>
  request<{ ok: true; period: ApiPeriodRecord }>('/api/periods', {
    method: 'POST',
    body: JSON.stringify({ start_date: startDate }),
  })

export const updatePeriod = (id: number, period: Partial<{ start_date: string; end_date: string }>) =>
  request<{ ok: true; period: ApiPeriodRecord }>(`/api/periods/${id}`, {
    method: 'PUT',
    body: JSON.stringify(period),
  })

export const endPeriod = (id: number, endDate: string) => updatePeriod(id, { end_date: endDate })

// ---- 治療周期 ----

export const getCycles = () =>
  request<{ ok: true; cycles: ApiCycle[] }>('/api/cycles')

export const updateCycle = (id: number, cycle: Partial<{ start_date: string; end_date: string; treatment_type: string; result: string }>) =>
  request<{ ok: true; cycle: ApiCycle }>(`/api/cycles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(cycle),
  })

// ---- 自己検査 ----

export const getSelfTests = () =>
  request<{ ok: true; self_tests: ApiSelfTest[] }>('/api/self-tests')

export const createSelfTest = (selfTest: { type: SelfTestType; result: SelfTestResult; tested_at: string; memo?: string; cycle_id?: number }) =>
  request<{ ok: true; self_test: ApiSelfTest }>('/api/self-tests', {
    method: 'POST',
    body: JSON.stringify(selfTest),
  })

export const updateSelfTest = (id: number, selfTest: Partial<{ type: SelfTestType; result: SelfTestResult; tested_at: string; memo: string; cycle_id: number | null }>) =>
  request<{ ok: true; self_test: ApiSelfTest }>(`/api/self-tests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(selfTest),
  })

export const deleteSelfTest = (id: number) =>
  request<{ ok: true; deleted_id: number }>(`/api/self-tests/${id}`, {
    method: 'DELETE',
  })
