import { useEffect, useState } from 'react'
import './App.css'

type Member = 'me' | 'wife'

type Event = {
  id: number
  title: string
  date: string
  member: Member
}

function App() {
  const [currentDate, setCurrentDate] = useState(new Date())

const STORAGE_KEY = 'couple-calendar-events'

const [events, setEvents] = useState<Event[]>(() => {
  const savedEvents = localStorage.getItem(STORAGE_KEY)

  if (savedEvents) {
    try {
      return JSON.parse(savedEvents) as Event[]
    } catch {
      console.error('予定データの読み込みに失敗しました')
    }
  }

  return [
    {
      id: 1,
      title: 'デート',
      date: '2026-09-14',
      member: 'me' as Member,
    },
    {
      id: 2,
      title: '病院',
      date: '2026-09-17',
      member: 'wife' as Member,
    },
  ]
})
useEffect(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events))
}, [events])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState<number | null>(null)

  const [selectedDate, setSelectedDate] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventMember, setEventMember] = useState<Member>('me')

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days: (number | null)[] = []

  for (let i = 0; i < firstDay; i++) {
    days.push(null)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    days.push(day)
  }

  const previousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToday = () => {
    setCurrentDate(new Date())
  }

  const getDateString = (day: number) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const getEvents = (day: number) => {
    const date = getDateString(day)
    return events.filter((event) => event.date === date)
  }

  // 新しい予定を追加する
  const openAddModal = (day: number) => {
    setEditingEventId(null)
    setSelectedDate(getDateString(day))
    setEventTitle('')
    setEventMember('me')
    setIsModalOpen(true)
  }

  // 既存の予定を編集する
  const openEditModal = (event: Event) => {
    setEditingEventId(event.id)
    setSelectedDate(event.date)
    setEventTitle(event.title)
    setEventMember(event.member)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingEventId(null)
  }

  // 予定を追加または更新する
  const saveEvent = () => {
    if (!eventTitle.trim()) {
      return
    }

    if (editingEventId !== null) {
      // 編集の場合
      setEvents((currentEvents) =>
        currentEvents.map((event) =>
          event.id === editingEventId
            ? {
                ...event,
                title: eventTitle.trim(),
                date: selectedDate,
                member: eventMember,
              }
            : event,
        ),
      )
    } else {
      // 新規追加の場合
      const newEvent: Event = {
        id: Date.now(),
        title: eventTitle.trim(),
        date: selectedDate,
        member: eventMember,
      }

      setEvents((currentEvents) => [...currentEvents, newEvent])
    }

    closeModal()
  }

  // 予定を削除する
  const deleteEvent = () => {
    if (editingEventId === null) {
      return
    }

    const confirmed = window.confirm(
      'この予定を削除してもよろしいですか？',
    )

    if (!confirmed) {
      return
    }

    setEvents((currentEvents) =>
      currentEvents.filter((event) => event.id !== editingEventId),
    )

    closeModal()
  }

  const isEditing = editingEventId !== null

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Couple Calendar</h1>
          <p>ふたりの予定を、ひとつのカレンダーに。</p>
        </div>

        <button className="ai-button">
          ✨ AIに相談
        </button>
      </header>

      <main className="calendar-container">
        <div className="calendar-header">
          <button onClick={previousMonth}>‹</button>

          <div className="month-title">
            <h2>
              {year}年 {month + 1}月
            </h2>

            <button onClick={goToday} className="today-button">
              今日
            </button>
          </div>

          <button onClick={nextMonth}>›</button>
        </div>

        <div className="weekdays">
          <div>日</div>
          <div>月</div>
          <div>火</div>
          <div>水</div>
          <div>木</div>
          <div>金</div>
          <div>土</div>
        </div>

        <div className="calendar-grid">
          {days.map((day, index) => {
            if (day === null) {
              return <div className="day empty" key={index} />
            }

            const dayEvents = getEvents(day)

            return (
              <div
                className="day"
                key={day}
                onDoubleClick={() => openAddModal(day)}
              >
                <span className="day-number">{day}</span>

                <div className="events">
                  {dayEvents.map((event) => (
                    <div
                      className={`event ${event.member}`}
                      key={event.id}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation()
                        openEditModal(event)
                      }}
                      onDoubleClick={(doubleClickEvent) => {
                        doubleClickEvent.stopPropagation()
                        openEditModal(event)
                      }}
                    >
                      {event.title}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="legend">
          <div>
            <span className="legend-dot me" />
            自分
          </div>

          <div>
            <span className="legend-dot wife" />
            妻
          </div>
        </div>

        <p className="help-text">
          日付をダブルクリックすると予定を追加できます。
          予定をクリックすると編集できます。
        </p>
      </main>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>{isEditing ? '予定を編集' : '予定を追加'}</h2>

            <div className="form-group">
              <label htmlFor="event-title">予定</label>

              <input
                id="event-title"
                type="text"
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                placeholder="例：映画、買い物、病院..."
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>誰の予定？</label>

              <div className="member-select">
                <button
                  type="button"
                  className={eventMember === 'me' ? 'selected me' : ''}
                  onClick={() => setEventMember('me')}
                >
                  自分
                </button>

                <button
                  type="button"
                  className={eventMember === 'wife' ? 'selected wife' : ''}
                  onClick={() => setEventMember('wife')}
                >
                  妻
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="event-date">日付</label>

              <input
                id="event-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </div>

            <div className="modal-actions">
              {isEditing && (
                <button
                  type="button"
                  className="delete-button"
                  onClick={deleteEvent}
                >
                  削除
                </button>
              )}

              <div className="modal-actions-right">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={closeModal}
                >
                  キャンセル
                </button>

                <button
                  type="button"
                  className="add-button"
                  onClick={saveEvent}
                  disabled={!eventTitle.trim() || !selectedDate}
                >
                  {isEditing ? '保存' : '追加'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App