import { useState } from 'react'
import './App.css'

type Event = {
  id: number
  title: string
  date: string
  member: 'me' | 'wife'
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

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = []

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

  const addEvent = (day: number) => {
    const title = window.prompt('予定を入力してください')

    if (!title) return

    const newEvent: Event = {
      id: Date.now(),
      title,
      date: getDateString(day),
      member: 'me',
    }

    setEvents([...events, newEvent])
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
                onDoubleClick={() => addEvent(day)}
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
    </div>
  )
}

export default App