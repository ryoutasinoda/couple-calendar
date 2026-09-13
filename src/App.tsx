import { useState } from 'react'
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

  const [events, setEvents] = useState<Event[]>([
    {
      id: 1,
      title: 'デート',
      date: '2026-09-14',
      member: 'me',
    },
    {
      id: 2,
      title: '病院',
      date: '2026-09-17',
      member: 'wife',
    },
  ])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newMember, setNewMember] = useState<Member>('me')

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

  const openAddModal = (day: number) => {
    setSelectedDate(getDateString(day))
    setNewTitle('')
    setNewMember('me')
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  const addEvent = () => {
    if (!newTitle.trim()) {
      return
    }

    const newEvent: Event = {
      id: Date.now(),
      title: newTitle.trim(),
      date: selectedDate,
      member: newMember,
    }

    setEvents((currentEvents) => [...currentEvents, newEvent])
    setIsModalOpen(false)
  }

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
          カレンダーの日付をダブルクリックすると予定を追加できます。
        </p>
      </main>

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>予定を追加</h2>

            <div className="form-group">
              <label htmlFor="event-title">予定</label>
              <input
                id="event-title"
                type="text"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                placeholder="例：映画、買い物、病院..."
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>誰の予定？</label>

              <div className="member-select">
                <button
                  type="button"
                  className={newMember === 'me' ? 'selected me' : ''}
                  onClick={() => setNewMember('me')}
                >
                  自分
                </button>

                <button
                  type="button"
                  className={newMember === 'wife' ? 'selected wife' : ''}
                  onClick={() => setNewMember('wife')}
                >
                  妻
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>日付</label>
              <div className="selected-date">
                {selectedDate.replace(/-/g, '/')}
              </div>
            </div>

            <div className="modal-actions">
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
                onClick={addEvent}
                disabled={!newTitle.trim()}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App