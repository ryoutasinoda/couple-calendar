import { useState } from 'react'
import { createCouple, getCurrentUser, joinCouple, login, register, type ApiUser } from './api'

type AuthPanelProps = {
  onAuthenticated: (user: ApiUser) => void
}

function AuthPanel({ onAuthenticated }: AuthPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loginId, setLoginId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'husband' | 'wife'>('husband')
  const [coupleMode, setCoupleMode] = useState<'create' | 'join'>('create')
  const [inviteCode, setInviteCode] = useState('')
  const [user, setUser] = useState<ApiUser | null>(null)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const refreshUser = async () => {
    const result = await getCurrentUser()
    setUser(result.user)
    if (result.user.couple_id !== null) onAuthenticated(result.user)
  }

  const submitAuth = async () => {
    setError('')
    setIsSubmitting(true)
    try {
      if (mode === 'login') {
        await login(loginId, password)
      } else {
        await register(loginId, displayName, password)
      }
      await refreshUser()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '認証に失敗しました。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitCouple = async () => {
    setError('')
    setIsSubmitting(true)
    try {
      if (coupleMode === 'create') {
        await createCouple(role)
      } else {
        await joinCouple(inviteCode.trim(), role)
      }
      await refreshUser()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '共有カレンダーへの接続に失敗しました。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-container">
      <section className="auth-panel">
        <p className="eyebrow">COUPLE CALENDAR</p>
        <h1>{user ? coupleMode === 'create' ? '夫婦カレンダーを作成' : '共有カレンダーに参加' : mode === 'login' ? 'ログイン' : 'アカウント作成'}</h1>
        <p className="auth-description">
          {user ? 'あなたの役割を選び、共有カレンダーへ接続してください。' : 'Worker APIのCookieセッションで安全に接続します。'}
        </p>

        {!user ? (
          <>
            {mode === 'register' && (
              <div className="auth-field">
                <label htmlFor="display-name">表示名</label>
                <input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
              </div>
            )}
            <div className="auth-field">
              <label htmlFor="login-id">ログインID</label>
              <input id="login-id" value={loginId} onChange={(event) => setLoginId(event.target.value)} autoComplete="username" />
            </div>
            <div className="auth-field">
              <label htmlFor="password">パスワード</label>
              <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            </div>
            <button type="button" className="add-button auth-submit" onClick={submitAuth} disabled={isSubmitting}>
              {isSubmitting ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する'}
            </button>
            <button type="button" className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
              {mode === 'login' ? '新しくアカウントを作成' : 'ログインに戻る'}
            </button>
          </>
        ) : (
          <>
            <div className="auth-choice">
              <button type="button" className={coupleMode === 'create' ? 'selected' : ''} onClick={() => { setCoupleMode('create'); setError('') }}>新しく作成</button>
              <button type="button" className={coupleMode === 'join' ? 'selected' : ''} onClick={() => { setCoupleMode('join'); setError('') }}>招待コードで参加</button>
            </div>
            {coupleMode === 'join' && (
              <div className="auth-field">
                <label htmlFor="invite-code">招待コード</label>
                <input id="invite-code" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} autoComplete="off" />
              </div>
            )}
            <div className="auth-field">
              <label htmlFor="role">あなたの役割</label>
              <select id="role" value={role} onChange={(event) => setRole(event.target.value as 'husband' | 'wife')}>
                <option value="husband">夫</option>
                <option value="wife">妻</option>
              </select>
            </div>
            <button type="button" className="add-button auth-submit" onClick={submitCouple} disabled={isSubmitting}>
              {isSubmitting ? '処理中...' : coupleMode === 'create' ? '共有カレンダーを作成' : '共有カレンダーに参加'}
            </button>
          </>
        )}

        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </main>
  )
}

export default AuthPanel
