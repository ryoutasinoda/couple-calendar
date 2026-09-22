import { useEffect, useMemo, useState } from 'react'
import './App.css'
import AuthPanel from './AuthPanel'
import { createEvent as createApiEvent, deleteEvent as deleteApiEvent, getCurrentUser, getEvents as getApiEvents, logout, regenerateInviteCode, updateEvent as updateApiEvent, type ApiEvent, type ApiUser } from './api'

type Member = 'me' | 'wife' | 'both'
type EventIcon =
  | 'calendar'
  | 'hospital'
  | 'heart'
  | 'work'
  | 'shopping'
  | 'other'
  | 'period'
  | 'ovulation'
  | 'injection'
  | 'checkup'
  | 'test'
  | 'pregnancy'

type Event = {
  id: number
  title: string
  date: string
  member: Member
  isAllDay: boolean
  startTime: string
  endTime: string
  memo: string
  icon: EventIcon
  source?: 'local' | 'api'
}

const STORAGE_KEY = 'couple-calendar-events'

const memberOptions: { value: Member; label: string }[] = [
  { value: 'me', label: '自分' },
  { value: 'wife', label: '妻' },
  { value: 'both', label: 'ふたり' },
]

const getMemberLabel = (member: Member) => memberOptions.find((option) => option.value === member)?.label ?? '自分'

const iconOptions: { value: EventIcon; label: string; symbol: string }[] = [
  { value: 'calendar', label: '予定', symbol: '▦' },
  { value: 'hospital', label: '病院', symbol: '✚' },
  { value: 'heart', label: 'デート', symbol: '♡' },
  { value: 'work', label: '仕事', symbol: '▤' },
  { value: 'shopping', label: '買い物', symbol: '🛍' },
  { value: 'other', label: 'その他', symbol: '✦' },
  { value: 'period', label: '生理', symbol: '◌' },
  { value: 'ovulation', label: '排卵', symbol: '◎' },
  { value: 'injection', label: '注射', symbol: '✦' },
  { value: 'checkup', label: '検査', symbol: '✓' },
  { value: 'test', label: 'テスト', symbol: '○' },
  { value: 'pregnancy', label: '妊娠確認', symbol: '❤' },
]

const fertilityIcons: EventIcon[] = ['hospital', 'period', 'ovulation', 'injection', 'checkup', 'test', 'pregnancy']

const initialEvents: Event[] = [
  {
    id: 1,
    title: 'デート',
    date: '2026-09-14',
    member: 'me',
    isAllDay: true,
    startTime: '',
    endTime: '',
    memo: '',
    icon: 'heart',
  },
  {
    id: 2,
    title: '病院',
    date: '2026-09-17',
    member: 'wife',
    isAllDay: true,
    startTime: '',
    endTime: '',
    memo: '',
    icon: 'hospital',
  },
]

const formatDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const getNthMondayOfMonth = (year: number, monthIndex: number, nth: number) => {
  const firstDay = new Date(year, monthIndex, 1)
  const firstDayOfWeek = firstDay.getDay()
  const offset = (8 - firstDayOfWeek) % 7
  return new Date(year, monthIndex, offset + (nth - 1) * 7 + 1)
}

const buildHolidayMapForYear = (year: number): Record<string, string> => {
  const map: Record<string, string> = {}
  const addHoliday = (month: number, day: number, name: string) => {
    const date = new Date(year, month - 1, day)
    map[formatDateKey(date)] = name
  }

  addHoliday(1, 1, '元日')
  addHoliday(2, 11, '建国記念の日')
  addHoliday(3, Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)), '春分の日')
  addHoliday(4, 29, '昭和の日')
  addHoliday(5, 3, '憲法記念日')
  addHoliday(5, 4, 'みどりの日')
  addHoliday(5, 5, 'こどもの日')
  addHoliday(7, 20, '海の日')
  addHoliday(8, 11, '山の日')
  addHoliday(9, 15, '敬老の日')
  addHoliday(9, Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4)), '秋分の日')
  addHoliday(10, 10, 'スポーツの日')
  addHoliday(11, 3, '文化の日')
  addHoliday(11, 23, '勤労感謝の日')
  addHoliday(12, 23, '天皇誕生日')

  if (year >= 2000) {
    const comingOfAgeDay = getNthMondayOfMonth(year, 0, 2)
    map[formatDateKey(comingOfAgeDay)] = '成人の日'

    const marineDay = getNthMondayOfMonth(year, 6, 3)
    map[formatDateKey(marineDay)] = '海の日'

    const respectForTheAgedDay = getNthMondayOfMonth(year, 8, 3)
    map[formatDateKey(respectForTheAgedDay)] = '敬老の日'

    const healthAndSportsDay = getNthMondayOfMonth(year, 9, 2)
    map[formatDateKey(healthAndSportsDay)] = 'スポーツの日'
  }

  if (year >= 2016) {
    addHoliday(8, 11, '山の日')
  }

  if (year < 2000) {
    delete map[`${year}-07-20`]
    delete map[`${year}-09-15`]
    delete map[`${year}-10-10`]
  }

  return map
}

function normalizeEvents(value: unknown): Event[] {
  if (!Array.isArray(value)) return initialEvents

  const normalizeMember = (member: unknown): Member => {
    if (member === 'wife') return 'wife'
    if (member === 'both') return 'both'
    return 'me'
  }

  return value.map((event, index) => ({
    id: typeof event.id === 'number' ? event.id : Date.now() + index,
    title: typeof event.title === 'string' ? event.title : '予定',
    date: typeof event.date === 'string' ? event.date : '',
    member: normalizeMember(event.member),
    isAllDay: typeof event.isAllDay === 'boolean' ? event.isAllDay : true,
    startTime: typeof event.startTime === 'string' ? event.startTime : '',
    endTime: typeof event.endTime === 'string' ? event.endTime : '',
    memo: typeof event.memo === 'string' ? event.memo : '',
    icon: iconOptions.some((option) => option.value === event.icon) ? event.icon : 'calendar',
    source: 'local',
  }))
}

const apiEventToLocalEvent = (event: ApiEvent): Event => ({
  id: event.id,
  title: event.title,
  date: event.start_date,
  member: event.target === 'wife' ? 'wife' : event.target === 'both' ? 'both' : 'me',
  isAllDay: Boolean(event.is_all_day),
  startTime: event.start_time ?? '',
  endTime: event.end_time ?? '',
  memo: event.memo ?? '',
  icon: iconOptions.some((option) => option.value === event.icon) ? event.icon as EventIcon : 'calendar',
  source: 'api',
})

const localEventToApiPayload = (event: Omit<Event, 'id' | 'source'>) => ({
  title: event.title,
  start_date: event.date,
  is_all_day: event.isAllDay,
  start_time: event.isAllDay ? '' : event.startTime,
  end_time: event.isAllDay ? '' : event.endTime,
  target: event.member === 'wife' ? 'wife' : event.member === 'both' ? 'both' : 'husband',
  icon: event.icon,
  memo: event.memo,
})

function App() {
  const [authUser, setAuthUser] = useState<ApiUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<Event[]>(() => {
    const savedEvents = localStorage.getItem(STORAGE_KEY)
    if (!savedEvents) return initialEvents

    try {
      return normalizeEvents(JSON.parse(savedEvents))
    } catch {
      return initialEvents
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
  }, [events])

  useEffect(() => {
    getCurrentUser()
      .then(({ user }) => {
        if (user.couple_id !== null) setAuthUser(user)
      })
      .catch(() => undefined)
      .finally(() => setAuthChecked(true))
  }, [])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<'create' | 'view' | 'edit'>('create')
  const [editingEventId, setEditingEventId] = useState<number | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventMember, setEventMember] = useState<Member>('me')
  const [isAllDay, setIsAllDay] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [eventMemo, setEventMemo] = useState('')
  const [eventIcon, setEventIcon] = useState<EventIcon>('calendar')
  const [formError, setFormError] = useState('')
  const [showFertilityOnly, setShowFertilityOnly] = useState(false)
  const [dataMessage, setDataMessage] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  const currentEvent = editingEventId !== null ? events.find((event) => event.id === editingEventId) ?? null : null

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const todayString = new Date().toLocaleDateString('sv-SE')
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const holidayMap = useMemo(() => buildHolidayMapForYear(year), [year])

  useEffect(() => {
    if (!authUser) return

    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    getApiEvents(from, to)
      .then(({ events: apiEvents }) => {
        if (apiEvents.length > 0) {
          const legacyEvents = localStorage.getItem(STORAGE_KEY)
          const backupKey = `${STORAGE_KEY}-legacy-backup`
          if (legacyEvents && !localStorage.getItem(backupKey)) localStorage.setItem(backupKey, legacyEvents)
          setEvents(apiEvents.map(apiEventToLocalEvent))
        }
      })
      .catch(() => setDataMessage('Worker APIから予定を取得できませんでした。'))
  }, [authUser, year, month, daysInMonth])

  const getHolidayName = (day: number) => holidayMap[getDateString(day)] ?? ''

  const days = useMemo<(number | null)[]>(() => {
    const result: (number | null)[] = []
    for (let index = 0; index < firstDay; index += 1) result.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) result.push(day)
    return result
  }, [daysInMonth, firstDay])

  const getDateString = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const formatDate = (date: string) => {
    const [dateYear, dateMonth, dateDay] = date.split('-').map(Number)
    if (!dateYear || !dateMonth || !dateDay) return date
    return `${dateYear}年${dateMonth}月${dateDay}日`
  }

  const sortEvents = (eventsToSort: Event[]) => eventsToSort.sort((left, right) => {
      if (left.isAllDay !== right.isAllDay) return left.isAllDay ? -1 : 1
      if (!left.startTime && !right.startTime) return left.id - right.id
      if (!left.startTime) return -1
      if (!right.startTime) return 1
      return left.startTime.localeCompare(right.startTime) || left.id - right.id
    })

  const getEvents = (day: number) => sortEvents(events.filter((event) => event.date === getDateString(day)))

  const isFertilityEvent = (event: Event) => fertilityIcons.includes(event.icon)

  const monthEvents = sortEvents(events.filter((event) => event.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`)))
    .filter((event) => !showFertilityOnly || isFertilityEvent(event))

  const getTimeLabel = (event: Event) => event.isAllDay
    ? '終日'
    : `${event.startTime || '--:--'}${event.endTime ? ` 〜 ${event.endTime}` : ''}`

  const resetForm = () => {
    setFormError('')
    setEventTitle('')
    setEventMember('me')
    setIsAllDay(true)
    setStartTime('')
    setEndTime('')
    setEventMemo('')
    setEventIcon('calendar')
  }

  const loadEventToForm = (event: Event) => {
    setFormError('')
    setEditingEventId(event.id)
    setSelectedDate(event.date)
    setEventTitle(event.title)
    setEventMember(event.member)
    setIsAllDay(event.isAllDay)
    setStartTime(event.startTime)
    setEndTime(event.endTime)
    setEventMemo(event.memo)
    setEventIcon(event.icon)
  }

  const openAddModal = (day: number) => {
    resetForm()
    setEditingEventId(null)
    setSelectedDate(getDateString(day))
    setModalMode('create')
    setIsModalOpen(true)
  }

  const openViewModal = (event: Event) => {
    loadEventToForm(event)
    setModalMode('view')
    setIsModalOpen(true)
  }

  const openEditForm = () => {
    if (!currentEvent) return
    loadEventToForm(currentEvent)
    setModalMode('edit')
  }

  const cancelEditOrClose = () => {
    if (modalMode === 'edit' && currentEvent) {
      loadEventToForm(currentEvent)
      setModalMode('view')
      return
    }

    closeModal()
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingEventId(null)
    setModalMode('create')
  }

  const saveEvent = async () => {
    if (!eventTitle.trim()) {
      setFormError('予定名を入力してください。')
      return
    }
    if (!selectedDate) {
      setFormError('予定日を選択してください。')
      return
    }
    if (!isAllDay && startTime && endTime && endTime < startTime) {
      setFormError('終了時間は開始時間以降にしてください。開始・終了時間を確認してください。')
      return
    }

    setFormError('')

    const eventData = {
      title: eventTitle.trim(),
      date: selectedDate,
      member: eventMember,
      isAllDay,
      startTime: isAllDay ? '' : startTime,
      endTime: isAllDay ? '' : endTime,
      memo: eventMemo.trim(),
      icon: eventIcon,
    }

    try {
      if (editingEventId !== null) {
        const existingEvent = events.find((event) => event.id === editingEventId)
        if (existingEvent?.source === 'api') {
          const result = await updateApiEvent(editingEventId, localEventToApiPayload(eventData))
          setEvents((currentEvents) => currentEvents.map((event) => event.id === editingEventId ? apiEventToLocalEvent(result.event) : event))
        } else {
          const result = await createApiEvent(localEventToApiPayload(eventData))
          setEvents((currentEvents) => currentEvents.map((event) => event.id === editingEventId ? apiEventToLocalEvent(result.event) : event))
        }
      } else {
        const result = await createApiEvent(localEventToApiPayload(eventData))
        setEvents((currentEvents) => [...currentEvents, apiEventToLocalEvent(result.event)])
      }
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : '予定の保存に失敗しました。')
      return
    }

    closeModal()
  }

  const deleteEvent = async () => {
    if (editingEventId === null) return
    if (!window.confirm('この予定を削除してもよろしいですか？')) return
    try {
      const existingEvent = events.find((event) => event.id === editingEventId)
      if (existingEvent?.source === 'api') await deleteApiEvent(editingEventId)
      setEvents((currentEvents) => currentEvents.filter((event) => event.id !== editingEventId))
      closeModal()
    } catch (caughtError) {
      setFormError(caughtError instanceof Error ? caughtError.message : '予定の削除に失敗しました。')
    }
  }

  const isEditing = modalMode === 'edit'

  const handleRegenerateInviteCode = async () => {
    try {
      const result = await regenerateInviteCode()
      setInviteCode(result.invite_code)
      setDataMessage('新しい招待コードを発行しました。古いコードは無効です。')
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : '招待コードの発行に失敗しました。')
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      setAuthUser(null)
    }
  }

  if (!authChecked) {
    return <main className="auth-container"><p className="auth-loading">接続を確認しています...</p></main>
  }

  if (!authUser) {
    return <AuthPanel onAuthenticated={setAuthUser} />
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">OUR LITTLE PLANNER</p>
          <h1>Couple Calendar</h1>
          <p>ふたりの予定を、ひとつのカレンダーに。</p>
        </div>
        <div className="header-actions">
          <div className="header-badge">{authUser.display_name}さん</div>
          <button type="button" className="invite-button" onClick={handleRegenerateInviteCode}>招待コード</button>
          <button type="button" className="logout-button" onClick={handleLogout}>ログアウト</button>
        </div>
      </header>

      <main className="calendar-container">
        <div className="calendar-header">
          <button aria-label="前の月" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>‹</button>
          <div className="month-title">
            <div className="month-selects">
              <select aria-label="年を選択" value={year} onChange={(event) => setCurrentDate(new Date(Number(event.target.value), month, 1))}>
                {Array.from({ length: 21 }, (_, index) => year - 10 + index).map((optionYear) => (
                  <option value={optionYear} key={optionYear}>{optionYear}年</option>
                ))}
              </select>
              <select aria-label="月を選択" value={month} onChange={(event) => setCurrentDate(new Date(year, Number(event.target.value), 1))}>
                {Array.from({ length: 12 }, (_, optionMonth) => (
                  <option value={optionMonth} key={optionMonth}>{optionMonth + 1}月</option>
                ))}
              </select>
            </div>
            <button className="today-button" onClick={() => setCurrentDate(new Date())}>今日</button>
          </div>
          <button aria-label="次の月" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>›</button>
        </div>

        {inviteCode && <p className="invite-code" role="status">招待コード: <strong>{inviteCode}</strong></p>}
        {dataMessage && <p className="data-message" role="status">{dataMessage}</p>}

        <div className="calendar-card">
          <div className="weekdays">
            {['日', '月', '火', '水', '木', '金', '土'].map((weekday, index) => (
              <div className={index === 0 ? 'sunday' : index === 6 ? 'saturday' : ''} key={weekday}>{weekday}</div>
            ))}
          </div>
          <div className="calendar-grid">
            {days.map((day, index) => {
              if (day === null) return <div className="day empty" key={`empty-${index}`} />
              const date = getDateString(day)
              const dayOfWeek = new Date(year, month, day).getDay()
              const dayEvents = getEvents(day)
              return (
                <div
                  className={`day ${date === todayString ? 'today' : ''}`}
                  key={date}
                  onClick={() => openAddModal(day)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openAddModal(day)
                    }
                  }}
                >
                  <div className="day-header">
                    <span className={`day-number ${dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : ''}`}>{day}</span>
                    {getHolidayName(day) && <span className="holiday-label">{getHolidayName(day)}</span>}
                  </div>
                  <div className="events">
                    {dayEvents.slice(0, 3).map((event) => {
                      const icon = iconOptions.find((option) => option.value === event.icon) ?? iconOptions[0]
                      return (
                        <button
                          type="button"
                          className={`event ${event.member}`}
                          key={event.id}
                          title={event.memo || event.title}
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            openViewModal(event)
                          }}
                        >
                          <span className="event-icon">{icon.symbol}</span>
                          <span className="event-title">{event.title}</span>
                        </button>
                      )
                    })}
                    {dayEvents.length > 3 && <span className="event-overflow">+ 他{dayEvents.length - 3}件</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <section className="event-list-panel" aria-labelledby="event-list-title">
          <div className="event-list-heading">
            <div>
              <p className="eyebrow">THIS MONTH</p>
              <h2 id="event-list-title">今月の予定一覧</h2>
            </div>
            <button
              type="button"
              className={showFertilityOnly ? 'filter-button active' : 'filter-button'}
              onClick={() => setShowFertilityOnly((current) => !current)}
              aria-pressed={showFertilityOnly}
            >
              {showFertilityOnly ? '妊活予定のみ' : 'すべての予定'}
            </button>
          </div>
          {monthEvents.length > 0 ? (
            <div className="event-list">
              {monthEvents.map((event) => {
                const icon = iconOptions.find((option) => option.value === event.icon) ?? iconOptions[0]
                return (
                  <button type="button" className={`event-list-item ${event.member}`} key={event.id} onClick={() => openViewModal(event)}>
                    <span className="event-list-icon">{icon.symbol}</span>
                    <span className="event-list-content">
                      <strong>{event.title}</strong>
                      <small>{formatDate(event.date)} ・ {getTimeLabel(event)} ・ {getMemberLabel(event.member)}</small>
                    </span>
                    <span className="event-list-kind">{icon.label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="event-list-empty">{showFertilityOnly ? '今月の妊活予定はありません。' : '今月の予定はありません。'}</p>
          )}
        </section>

        <div className="legend">
          <div><span className="legend-dot me" />自分</div>
          <div><span className="legend-dot wife" />妻</div>
          <div><span className="legend-dot both" />ふたり</div>
          <span className="legend-hint">日付をタップして予定を追加</span>
        </div>
      </main>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">
                  {modalMode === 'view' ? 'VIEW EVENT' : modalMode === 'edit' ? 'EDIT EVENT' : 'NEW EVENT'}
                </p>
                <h2>
                  {modalMode === 'view' ? '予定を確認' : modalMode === 'edit' ? '予定を編集' : '予定を追加'}
                </h2>
              </div>
              <button className="close-button" aria-label="閉じる" onClick={closeModal}>×</button>
            </div>

            {modalMode === 'view' && currentEvent ? (
              <div className="view-panel">
                <div className="view-summary">
                  <span className="view-icon">{iconOptions.find((option) => option.value === currentEvent.icon)?.symbol ?? '▦'}</span>
                  <div>
                    <h3>{currentEvent.title}</h3>
                    <p>{getMemberLabel(currentEvent.member)}の予定</p>
                  </div>
                </div>

                <dl className="detail-list">
                  <div>
                    <dt>日付</dt>
                    <dd>{formatDate(currentEvent.date)}</dd>
                  </div>
                  <div>
                    <dt>予定種類</dt>
                    <dd>{iconOptions.find((option) => option.value === currentEvent.icon)?.label ?? '予定'}</dd>
                  </div>
                  <div>
                    <dt>時間</dt>
                    <dd>{currentEvent.isAllDay ? '終日' : `${currentEvent.startTime || '--:--'} 〜 ${currentEvent.endTime || '--:--'}`}</dd>
                  </div>
                </dl>

                {currentEvent.memo && (
                  <div className="detail-memo">
                    <h4>メモ</h4>
                    <p>{currentEvent.memo}</p>
                  </div>
                )}

                <div className="modal-actions">
                  <button type="button" className="cancel-button" onClick={closeModal}>閉じる</button>
                  <div className="modal-actions-right">
                    <button type="button" className="add-button" onClick={openEditForm}>編集</button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label htmlFor="event-title">予定</label>
                  <input id="event-title" type="text" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="例：映画、買い物、病院..." autoFocus />
                </div>

                <div className="form-group">
                  <label>誰の予定？</label>
                  <div className="member-select">
                    {memberOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={eventMember === option.value ? `selected ${option.value}` : ''}
                        onClick={() => setEventMember(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="event-date">日付</label>
                  <input id="event-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                </div>

                <div className="form-group">
                  <label>アイコン</label>
                  <div className="icon-select">
                    {iconOptions.map((option) => (
                      <button type="button" key={option.value} className={eventIcon === option.value ? 'icon-option selected' : 'icon-option'} onClick={() => setEventIcon(option.value)}>
                        <span>{option.symbol}</span>
                        <small>{option.label}</small>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={isAllDay} onChange={(event) => setIsAllDay(event.target.checked)} />
                    <span>終日予定</span>
                  </label>
                </div>

                {!isAllDay && (
                  <div className="time-grid">
                    <div className="form-group">
                      <label htmlFor="start-time">開始時間</label>
                      <input id="start-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="end-time">終了時間</label>
                      <input id="end-time" type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="event-memo">メモ</label>
                  <textarea id="event-memo" value={eventMemo} onChange={(event) => setEventMemo(event.target.value)} placeholder="持ち物や詳細など..." rows={3} />
                </div>

                <div className="modal-actions">
                  {isEditing ? <button type="button" className="delete-button" onClick={deleteEvent}>削除</button> : <span />}
                  <div className="modal-actions-right">
                    <button type="button" className="cancel-button" onClick={cancelEditOrClose}>{isEditing ? '戻る' : 'キャンセル'}</button>
                    <button type="button" className="add-button" onClick={saveEvent}>{isEditing ? '保存' : '追加'}</button>
                  </div>
                </div>
                {formError && <p className="form-error" role="alert">{formError}</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
