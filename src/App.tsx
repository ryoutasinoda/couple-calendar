import { useEffect, useMemo, useState } from 'react'
import './App.css'

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
  }))
}

function App() {
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

  const currentEvent = editingEventId !== null ? events.find((event) => event.id === editingEventId) ?? null : null

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const todayString = new Date().toLocaleDateString('sv-SE')
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()

  const days = useMemo<(number | null)[]>(() => {
    const result: (number | null)[] = []
    for (let index = 0; index < firstDay; index += 1) result.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) result.push(day)
    return result
  }, [daysInMonth, firstDay])

  const getDateString = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const getEvents = (day: number) => events.filter((event) => event.date === getDateString(day))

  const resetForm = () => {
    setEventTitle('')
    setEventMember('me')
    setIsAllDay(true)
    setStartTime('')
    setEndTime('')
    setEventMemo('')
    setEventIcon('calendar')
  }

  const loadEventToForm = (event: Event) => {
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

  const saveEvent = () => {
    if (!eventTitle.trim() || !selectedDate) return
    if (!isAllDay && startTime && endTime && endTime < startTime) {
      window.alert('終了時間は開始時間以降にしてください。')
      return
    }

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

    if (editingEventId !== null) {
      setEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.id === editingEventId ? { ...event, ...eventData } : event,
        ),
      )
    } else {
      setEvents((currentEvents) => [...currentEvents, { id: Date.now(), ...eventData }])
    }

    closeModal()
  }

  const deleteEvent = () => {
    if (editingEventId === null) return
    if (!window.confirm('この予定を削除してもよろしいですか？')) return
    setEvents((currentEvents) => currentEvents.filter((event) => event.id !== editingEventId))
    closeModal()
  }

  const isEditing = modalMode === 'edit'

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">OUR LITTLE PLANNER</p>
          <h1>Couple Calendar</h1>
          <p>ふたりの予定を、ひとつのカレンダーに。</p>
        </div>
        <div className="header-badge">ふたりの予定帳</div>
      </header>

      <main className="calendar-container">
        <div className="calendar-header">
          <button aria-label="前の月" onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>‹</button>
          <div className="month-title">
            <h2>{year}年 {month + 1}月</h2>
            <button className="today-button" onClick={() => setCurrentDate(new Date())}>今日</button>
          </div>
          <button aria-label="次の月" onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>›</button>
        </div>

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
                  <span className={`day-number ${dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : ''}`}>{day}</span>
                  <div className="events">
                    {dayEvents.map((event) => {
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
                  </div>
                </div>
              )
            })}
          </div>
        </div>

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
                    <dd>{currentEvent.date}</dd>
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
                    <button type="button" className="add-button" onClick={saveEvent} disabled={!eventTitle.trim() || !selectedDate}>{isEditing ? '保存' : '追加'}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
