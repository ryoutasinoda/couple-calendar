import { useEffect, useMemo, useState } from 'react'
import './App.css'
import AuthPanel from './AuthPanel'
import {
  createCategory,
  createEvent as createApiEvent,
  createSelfTest,
  deleteCategory,
  deleteEvent as deleteApiEvent,
  deleteSelfTest,
  endPeriod,
  getCategories,
  getCurrentUser,
  getCycles,
  getEvents as getApiEvents,
  getPeriods,
  getSelfTests,
  logout,
  regenerateInviteCode,
  startPeriod,
  updateCycle,
  updateEvent as updateApiEvent,
  type ApiCategory,
  type ApiCycle,
  type ApiEvent,
  type ApiPeriodRecord,
  type ApiSelfTest,
  type ApiUser,
} from './api'

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
  categoryId?: number | null
  amount?: number | null
  shared?: boolean
  notifyBeforeDay?: boolean
  source?: 'local' | 'api'
}

type PeriodRecord = ApiPeriodRecord

type CycleRecord = ApiCycle & {
  event_count: number
  self_test_count: number
}

type SelfTestRecord = ApiSelfTest

type BeforeInstallPromptEvent = globalThis.Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

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
  categoryId: event.category_id,
  amount: event.amount,
  shared: Boolean(event.shared),
  notifyBeforeDay: Boolean(event.notify_before_day),
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
  category_id: event.categoryId ?? null,
  amount: event.amount ?? null,
  shared: event.shared === false ? 0 : 1,
  notify_before_day: event.notifyBeforeDay === true,
})

function App() {
  const [authUser, setAuthUser] = useState<ApiUser | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<Event[]>([])

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
  const [selectedDayForList, setSelectedDayForList] = useState(() => new Date().toISOString().slice(0, 10))
  const [eventTitle, setEventTitle] = useState('')
  const [eventMember, setEventMember] = useState<Member>('me')
  const [isAllDay, setIsAllDay] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [eventMemo, setEventMemo] = useState('')
  const [eventIcon, setEventIcon] = useState<EventIcon>('calendar')
  const [eventAmount, setEventAmount] = useState('')
  const [eventShared, setEventShared] = useState(true)
  const [eventNotifyBeforeDay, setEventNotifyBeforeDay] = useState(false)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [categories, setCategories] = useState<ApiCategory[]>([])
  const [categoryName, setCategoryName] = useState('')
  const [categoryIcon, setCategoryIcon] = useState('✦')
  const [categoryColor, setCategoryColor] = useState('#7a7ae6')
  const [formError, setFormError] = useState('')
  const [showFertilityOnly, setShowFertilityOnly] = useState(false)
  const [dataMessage, setDataMessage] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [periods, setPeriods] = useState<PeriodRecord[]>([])
  const [cycles, setCycles] = useState<CycleRecord[]>([])
  const [selfTests, setSelfTests] = useState<SelfTestRecord[]>([])
  const [selfTestDate, setSelfTestDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [selfTestType, setSelfTestType] = useState<'ovulation' | 'pregnancy'>('ovulation')
  const [selfTestResult, setSelfTestResult] = useState<'negative' | 'positive' | 'pending'>('negative')
  const [selfTestMemo, setSelfTestMemo] = useState('')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installable, setInstallable] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [notificationPreference, setNotificationPreference] = useState(false)

  const currentEvent = editingEventId !== null ? events.find((event) => event.id === editingEventId) ?? null : null

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const todayString = new Date().toLocaleDateString('sv-SE')
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const holidayMap = useMemo(() => buildHolidayMapForYear(year), [year])

  useEffect(() => {
    if (!authUser) return

    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
      const savedPreference = window.localStorage.getItem('couple-calendar-notify-enabled') === 'true'
      setNotificationPreference(savedPreference || Notification.permission === 'granted')
    } else {
      setNotificationPermission('unsupported')
      setNotificationPreference(false)
    }

    const handleBeforeInstallPrompt = (event: globalThis.Event) => {
      event.preventDefault()
      setDeferredPrompt(event as BeforeInstallPromptEvent)
      setInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [authUser])

  useEffect(() => {
    if (notificationPermission === 'granted') {
      window.localStorage.setItem('couple-calendar-notify-enabled', 'true')
      setNotificationPreference(true)
    } else if (notificationPermission === 'denied') {
      window.localStorage.setItem('couple-calendar-notify-enabled', 'false')
      setNotificationPreference(false)
    }
  }, [notificationPermission])

  useEffect(() => {
    if (notificationPreference) {
      window.localStorage.setItem('couple-calendar-notify-enabled', 'true')
    } else {
      window.localStorage.setItem('couple-calendar-notify-enabled', 'false')
    }
  }, [notificationPreference])

  const handleInstallPwa = async () => {
    if (!deferredPrompt) {
      setDataMessage('このブラウザではインストール案内が表示されません。Safari の「ホーム画面に追加」をご利用ください。')
      return
    }

    try {
      await deferredPrompt.prompt()
      await deferredPrompt.userChoice
      setDeferredPrompt(null)
      setInstallable(false)
      setDataMessage('PWA のインストール案内を表示しました。')
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : 'インストール案内の表示に失敗しました。')
    }
  }

  const handleEnableNotifications = async () => {
    if (!('Notification' in window)) {
      setDataMessage('この端末では通知を利用できません。iOS ではホーム画面に追加後に通知設定をご確認ください。')
      return
    }

    try {
      const permission = await Notification.requestPermission()
      setNotificationPermission(permission)
      setNotificationPreference(permission === 'granted')
      if (permission === 'granted') {
        setDataMessage('通知を有効にしました。予定の前日通知を使えるように準備しています。')
      } else {
        setDataMessage('通知は後で有効にできます。通知設定はブラウザの許可設定から変更できます。')
      }
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : '通知の設定に失敗しました。')
    }
  }

  useEffect(() => {
    if (!authUser) return

    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`
    getApiEvents(from, to)
      .then(({ events: apiEvents }) => {
        setEvents(apiEvents.map(apiEventToLocalEvent))
      })
      .catch(() => setDataMessage('Worker APIから予定を取得できませんでした。'))
  }, [authUser, year, month, daysInMonth])

  useEffect(() => {
    if (!authUser) return

    const refreshCategories = async () => {
      try {
        const response = await getCategories()
        setCategories(response.categories)
      } catch (caughtError) {
        setDataMessage(caughtError instanceof Error ? caughtError.message : 'カテゴリを取得できませんでした。')
      }
    }

    refreshCategories().catch(() => undefined)
  }, [authUser])

  useEffect(() => {
    if (!authUser) return

    const refreshFertilityData = async () => {
      try {
        const [periodsResponse, cyclesResponse, selfTestsResponse] = await Promise.all([
          getPeriods(),
          getCycles(),
          getSelfTests(),
        ])
        setPeriods(periodsResponse.periods)
        setCycles(cyclesResponse.cycles)
        setSelfTests(selfTestsResponse.self_tests)
      } catch (caughtError) {
        setDataMessage(caughtError instanceof Error ? caughtError.message : '生理・治療記録を取得できませんでした。')
      }
    }

    refreshFertilityData().catch(() => undefined)
  }, [authUser])

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
  const selectedDayEvents = useMemo(() => sortEvents(events.filter((event) => event.date === selectedDayForList)), [events, selectedDayForList])

  const categoryMap = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])

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
    setSelectedCategoryId(null)
    setEventAmount('')
    setEventShared(true)
    setEventNotifyBeforeDay(false)
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
    setSelectedCategoryId(event.categoryId ?? null)
    setEventAmount(event.amount !== null && event.amount !== undefined ? String(event.amount) : '')
    setEventShared(event.shared ?? true)
    setEventNotifyBeforeDay(event.notifyBeforeDay ?? false)
  }

  const openAddModal = (day: number) => {
    resetForm()
    setEditingEventId(null)
    const nextDate = getDateString(day)
    setSelectedDate(nextDate)
    setSelectedDayForList(nextDate)
    setModalMode('create')
    setIsModalOpen(true)
  }

  const openQuickAdd = () => {
    resetForm()
    setEditingEventId(null)
    setSelectedDate(selectedDayForList)
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
      categoryId: selectedCategoryId,
      amount: eventAmount.trim() === '' ? null : Number(eventAmount),
      shared: eventShared,
      notifyBeforeDay: eventNotifyBeforeDay,
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

  const latestPeriod = periods[0] ?? null
  const activePeriod = periods.find((period) => period.end_date === null) ?? null
  const cycleCards = [...cycles].sort((left, right) => new Date(right.start_date).getTime() - new Date(left.start_date).getTime())

  const refreshCategories = async () => {
    const response = await getCategories()
    setCategories(response.categories)
  }

  const handleCreateCategory = async () => {
    if (!categoryName.trim()) {
      setDataMessage('カテゴリ名を入力してください。')
      return
    }

    try {
      await createCategory({ name: categoryName.trim(), icon: categoryIcon, color: categoryColor })
      await refreshCategories()
      setCategoryName('')
      setCategoryIcon('✦')
      setCategoryColor('#7a7ae6')
      setDataMessage('カテゴリを追加しました。')
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : 'カテゴリの追加に失敗しました。')
    }
  }

  const handleDeleteCategory = async (categoryId: number) => {
    if (!window.confirm('このカテゴリを削除してよろしいですか？')) return

    try {
      await deleteCategory(categoryId)
      setCategories((currentCategories) => currentCategories.filter((category) => category.id !== categoryId))
      if (selectedCategoryId === categoryId) setSelectedCategoryId(null)
      setDataMessage('カテゴリを削除しました。')
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : 'カテゴリの削除に失敗しました。')
    }
  }

  const handleStartPeriod = async () => {
    try {
      await startPeriod(new Date().toISOString().slice(0, 10))
      const [periodsResponse, cyclesResponse, selfTestsResponse] = await Promise.all([
        getPeriods(),
        getCycles(),
        getSelfTests(),
      ])
      setPeriods(periodsResponse.periods)
      setCycles(cyclesResponse.cycles)
      setSelfTests(selfTestsResponse.self_tests)
      setDataMessage('生理開始を記録しました。')
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : '生理開始を記録できませんでした。')
    }
  }

  const handleEndPeriod = async () => {
    if (!activePeriod) return
    try {
      await endPeriod(activePeriod.id, new Date().toISOString().slice(0, 10))
      const [periodsResponse, cyclesResponse, selfTestsResponse] = await Promise.all([
        getPeriods(),
        getCycles(),
        getSelfTests(),
      ])
      setPeriods(periodsResponse.periods)
      setCycles(cyclesResponse.cycles)
      setSelfTests(selfTestsResponse.self_tests)
      setDataMessage('生理終了を記録しました。')
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : '生理終了を記録できませんでした。')
    }
  }

  const handleCycleResult = async (cycleId: number, result: '陽性' | '陰性') => {
    try {
      await updateCycle(cycleId, { result })
      const response = await getCycles()
      setCycles(response.cycles)
      setDataMessage(`周期の結果を${result}に更新しました。`)
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : '周期結果の更新に失敗しました。')
    }
  }

  const handleCreateSelfTest = async () => {
    if (!selfTestDate) {
      setDataMessage('検査日を選択してください。')
      return
    }

    try {
      await createSelfTest({
        type: selfTestType,
        result: selfTestResult,
        tested_at: `${selfTestDate}T09:00:00`,
        memo: selfTestMemo.trim() || undefined,
      })
      const response = await getSelfTests()
      setSelfTests(response.self_tests)
      setSelfTestMemo('')
      setDataMessage('自己検査を記録しました。')
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : '自己検査の記録に失敗しました。')
    }
  }

  const handleDeleteSelfTest = async (id: number) => {
    try {
      await deleteSelfTest(id)
      setSelfTests((currentSelfTests) => currentSelfTests.filter((selfTest) => selfTest.id !== id))
      setDataMessage('自己検査の記録を削除しました。')
    } catch (caughtError) {
      setDataMessage(caughtError instanceof Error ? caughtError.message : '自己検査の削除に失敗しました。')
    }
  }

  const isEditing = modalMode === 'edit'
  const selectedCategory = categories.find((category) => category.id === (currentEvent?.categoryId ?? selectedCategoryId)) ?? null

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
                  className={`day ${date === todayString ? 'today' : ''} ${date === selectedDayForList ? 'selected-day' : ''}`}
                  key={date}
                  onClick={() => {
                    setSelectedDayForList(date)
                    openAddModal(day)
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedDayForList(date)
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
                      const category = event.categoryId ? categoryMap.get(event.categoryId) ?? null : null
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
                          style={category ? { border: `1px solid ${category.color}33`, background: category.color ? `${category.color}1A` : undefined } : undefined}
                        >
                          <span className="event-icon">{category ? category.icon : icon.symbol}</span>
                          <span className="event-title">{event.title}</span>
                        </button>
                      )
                    })}
                    {dayEvents.length > 3 && <span className="event-overflow">+ 他{dayEvents.length - 3}件</span>}
                  </div>
                  {dayEvents.length > 0 && (
                    <div className="day-category-badges" aria-label={`${date}のカテゴリ`}>
                      {dayEvents.slice(0, 3).map((event) => {
                        const category = event.categoryId ? categoryMap.get(event.categoryId) ?? null : null
                        if (!category) return null
                        return (
                          <span key={`${event.id}-badge`} className="day-category-badge" style={{ borderColor: category.color, color: category.color, background: `${category.color}18` }}>
                            {category.icon}
                          </span>
                        )
                      })}
                    </div>
                  )}
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
                const category = event.categoryId ? categoryMap.get(event.categoryId) ?? null : null
                return (
                  <button type="button" className={`event-list-item ${event.member}`} key={event.id} onClick={() => openViewModal(event)}>
                    <span className="event-list-icon" style={category ? { background: `${category.color}1A`, color: category.color } : undefined}>{category ? category.icon : icon.symbol}</span>
                    <span className="event-list-content">
                      <strong>{event.title}</strong>
                      <small>{formatDate(event.date)} ・ {getTimeLabel(event)} ・ {getMemberLabel(event.member)}</small>
                    </span>
                    <span className="event-list-kind">{category ? `${category.name}` : icon.label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="event-list-empty">{showFertilityOnly ? '今月の妊活予定はありません。' : '今月の予定はありません。'}</p>
          )}
        </section>

        <section className="day-detail-panel" aria-labelledby="day-detail-title">
          <div className="day-detail-header">
            <div>
              <p className="eyebrow">SELECTED DAY</p>
              <h2 id="day-detail-title">{formatDate(selectedDayForList)}</h2>
            </div>
            <button type="button" className="add-button" onClick={openQuickAdd}>予定を追加</button>
          </div>

          {selectedDayEvents.length > 0 ? (
            <div className="day-detail-list">
              {selectedDayEvents.map((event) => {
                const icon = iconOptions.find((option) => option.value === event.icon) ?? iconOptions[0]
                const category = event.categoryId ? categoryMap.get(event.categoryId) ?? null : null
                return (
                  <button type="button" className="day-detail-item" key={event.id} onClick={() => openViewModal(event)}>
                    <span className="day-detail-icon" style={category ? { background: `${category.color}1A`, color: category.color } : undefined}>{category ? category.icon : icon.symbol}</span>
                    <span className="day-detail-copy">
                      <strong>{event.title}</strong>
                      <small>{getTimeLabel(event)} ・ {getMemberLabel(event.member)}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="day-detail-empty">この日の予定はまだありません。予定を追加してください。</p>
          )}
        </section>

        <section className="fertility-panel" aria-labelledby="fertility-records-title">
          <div className="fertility-header">
            <div>
              <p className="eyebrow">FERTILITY</p>
              <h2 id="fertility-records-title">生理・治療記録</h2>
            </div>
            <button type="button" className="period-button" onClick={activePeriod ? handleEndPeriod : handleStartPeriod}>
              {activePeriod ? '生理終了を記録' : '生理開始を記録'}
            </button>
          </div>

          <div className="period-summary">
            {latestPeriod ? (
              <>
                <strong>{latestPeriod.start_date} ～ {latestPeriod.end_date ?? '今日'}</strong>
                <span>{latestPeriod.end_date ? '完了' : '継続中'}</span>
              </>
            ) : (
              <>
                <strong>生理記録がまだありません</strong>
                <span>開始日を記録してください</span>
              </>
            )}
          </div>

          <div className="cycle-section">
            <div className="section-header">
              <h3>周期一覧</h3>
            </div>
            {cycleCards.length > 0 ? (
              <div className="cycle-list">
                {cycleCards.map((cycle, index) => (
                  <article className="cycle-card" key={cycle.id}>
                    <div className="cycle-card-header">
                      <span className="cycle-number">第{cycleCards.length - index}周期</span>
                      <span className={`cycle-status ${cycle.end_date ? 'closed' : 'open'}`}>{cycle.end_date ? '終了' : '進行中'}</span>
                    </div>
                    <p className="cycle-range">{cycle.start_date} ～ {cycle.end_date ?? '〜'}</p>
                    <p className="cycle-metadata">治療法: {cycle.treatment_type ?? '未設定'} / 回数: {cycle.event_count + cycle.self_test_count}</p>
                    <div className="cycle-result-row">
                      <button type="button" className={cycle.result === '陰性' ? 'result-button selected' : 'result-button'} onClick={() => handleCycleResult(cycle.id, '陰性')}>陰性</button>
                      <button type="button" className={cycle.result === '陽性' ? 'result-button selected positive' : 'result-button positive'} onClick={() => handleCycleResult(cycle.id, '陽性')}>陽性</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-note">周期の記録がまだありません。</p>
            )}
          </div>

          <div className="self-test-section">
            <div className="section-header">
              <h3>自己検査</h3>
            </div>
            <div className="self-test-form">
              <div className="form-group compact">
                <label htmlFor="selftest-date">検査日</label>
                <input id="selftest-date" type="date" value={selfTestDate} onChange={(event) => setSelfTestDate(event.target.value)} />
              </div>
              <div className="form-group compact">
                <label htmlFor="selftest-type">種類</label>
                <select id="selftest-type" value={selfTestType} onChange={(event) => setSelfTestType(event.target.value as 'ovulation' | 'pregnancy')}>
                  <option value="ovulation">排卵検査薬</option>
                  <option value="pregnancy">妊娠検査薬</option>
                </select>
              </div>
              <div className="form-group compact">
                <label htmlFor="selftest-result">結果</label>
                <select id="selftest-result" value={selfTestResult} onChange={(event) => setSelfTestResult(event.target.value as 'negative' | 'positive' | 'pending')}>
                  <option value="negative">陰性</option>
                  <option value="positive">陽性</option>
                  <option value="pending">判定中</option>
                </select>
              </div>
              <div className="form-group compact full-width">
                <label htmlFor="selftest-memo">メモ</label>
                <textarea id="selftest-memo" value={selfTestMemo} onChange={(event) => setSelfTestMemo(event.target.value)} rows={2} />
              </div>
              <button type="button" className="add-button selftest-submit" onClick={handleCreateSelfTest}>自己検査を記録</button>
            </div>

            <div className="self-test-list">
              {selfTests.length > 0 ? (
                selfTests.sort((left, right) => new Date(right.tested_at).getTime() - new Date(left.tested_at).getTime()).map((selfTest) => (
                  <div className="self-test-item" key={selfTest.id}>
                    <div>
                      <strong>{selfTest.type === 'ovulation' ? '排卵検査薬' : '妊娠検査薬'}</strong>
                      <small>{selfTest.tested_at.slice(0, 10)} / {selfTest.result === 'negative' ? '陰性' : selfTest.result === 'positive' ? '陽性' : '判定中'}</small>
                    </div>
                    {selfTest.memo && <p>{selfTest.memo}</p>}
                    <button type="button" className="remove-inline-button" onClick={() => handleDeleteSelfTest(selfTest.id)}>削除</button>
                  </div>
                ))
              ) : (
                <p className="empty-note">自己検査の記録はまだありません。</p>
              )}
            </div>
          </div>
        </section>

        <section className="category-panel" aria-labelledby="category-manager-title">
          <div className="section-header">
            <h3 id="category-manager-title">カテゴリ管理</h3>
          </div>
          <div className="category-create-form">
            <div className="form-group compact">
              <label htmlFor="category-name">カテゴリ名</label>
              <input id="category-name" type="text" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="例：妊活費" />
            </div>
            <div className="form-group compact">
              <label htmlFor="category-icon">アイコン</label>
              <input id="category-icon" type="text" value={categoryIcon} onChange={(event) => setCategoryIcon(event.target.value.slice(0, 2))} maxLength={2} />
            </div>
            <div className="form-group compact">
              <label htmlFor="category-color">色</label>
              <input id="category-color" type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} />
            </div>
            <button type="button" className="add-button category-submit" onClick={handleCreateCategory}>カテゴリ追加</button>
          </div>

          <div className="category-list">
            {categories.length > 0 ? (
              categories.map((category) => (
                <div className="category-item" key={category.id}>
                  <div className="category-chip" style={{ backgroundColor: `${category.color}22`, borderColor: category.color }}>
                    <span className="category-chip-icon" style={{ color: category.color }}>{category.icon}</span>
                    <span>{category.name}</span>
                  </div>
                  <button type="button" className="remove-inline-button" onClick={() => handleDeleteCategory(category.id)}>削除</button>
                </div>
              ))
            ) : (
              <p className="empty-note">カテゴリはまだありません。</p>
            )}
          </div>
        </section>

        <div className="legend">
          <div><span className="legend-dot me" />自分</div>
          <div><span className="legend-dot wife" />妻</div>
          <div><span className="legend-dot both" />ふたり</div>
          <span className="legend-hint">日付をタップして予定を追加</span>
        </div>

        <section className="notification-panel" aria-labelledby="notification-panel-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">PWA / PUSH</p>
              <h2 id="notification-panel-title">通知とホーム画面追加</h2>
            </div>
          </div>

          <div className="notification-grid">
            <div className="notification-card">
              <h3>ホーム画面に追加</h3>
              <p>iPhone / Android で使いやすいよう、アプリをPWAとして起動できます。</p>
              <button type="button" className="add-button" onClick={handleInstallPwa} disabled={!installable}>
                {installable ? 'インストールする' : 'インストール案内を準備中'}
              </button>
            </div>

            <div className="notification-card">
              <h3>通知の利用</h3>
              <p>予定の前日通知や当日通知を使うための許可状態を管理します。</p>
              <button type="button" className="add-button" onClick={handleEnableNotifications}>
                {notificationPermission === 'granted' ? '通知はオンです' : '通知を有効にする'}
              </button>
              <small className="notification-status">
                状態: {notificationPermission === 'unsupported' ? '未対応' : notificationPermission === 'granted' ? '許可済み' : notificationPermission === 'denied' ? '拒否済み' : '未設定'}
              </small>
            </div>
          </div>
        </section>
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
                  <div>
                    <dt>カテゴリ</dt>
                    <dd>{selectedCategory ? (
                      <span className="detail-tag" style={{ borderColor: selectedCategory.color, color: selectedCategory.color }}>
                        {selectedCategory.icon} {selectedCategory.name}
                      </span>
                    ) : 'なし'}</dd>
                  </div>
                  <div>
                    <dt>共有</dt>
                    <dd>{currentEvent.shared === false ? '非共有' : '共有中'}</dd>
                  </div>
                  <div>
                    <dt>通知</dt>
                    <dd>{currentEvent.notifyBeforeDay ? '前日に通知' : 'なし'}</dd>
                  </div>
                  <div>
                    <dt>金額</dt>
                    <dd>{currentEvent.amount !== null && currentEvent.amount !== undefined ? `${currentEvent.amount.toLocaleString()}円` : '未登録'}</dd>
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
                  <label>カテゴリ</label>
                  <select value={selectedCategoryId ?? ''} onChange={(event) => setSelectedCategoryId(event.target.value ? Number(event.target.value) : null)}>
                    <option value="">カテゴリなし</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
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

                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={eventShared} onChange={(event) => setEventShared(event.target.checked)} />
                    <span>相手と共有</span>
                  </label>
                </div>

                <div className="form-group checkbox-group">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={eventNotifyBeforeDay} onChange={(event) => setEventNotifyBeforeDay(event.target.checked)} />
                    <span>前日に通知する</span>
                  </label>
                </div>

                <div className="form-group">
                  <label htmlFor="event-amount">金額（任意）</label>
                  <input id="event-amount" type="number" min="0" step="100" value={eventAmount} onChange={(event) => setEventAmount(event.target.value)} placeholder="0" />
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
