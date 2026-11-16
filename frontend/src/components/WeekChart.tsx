import { useEffect, useState } from 'react'
import { fetchWeek } from '../api'
import type { WeekView } from '../types'
import { dayLabel, shiftDate } from '../lib/tasks'
import { StatusPill } from './TaskCard'

interface WeekChartProps {
  /** Bump to reload the current week, e.g. after approvals change the chart. */
  version: number
}

const DAY = { weekday: 'short', month: 'short', day: 'numeric' } as const

/** Seven day columns for the week. Print CSS prints only this section as a chore chart. */
export default function WeekChart({ version }: WeekChartProps) {
  const [week, setWeek] = useState<WeekView | null>(null)
  const [start, setStart] = useState<string | undefined>(undefined)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchWeek(start).then(
      (next) => {
        setWeek(next)
        setError('')
      },
      (err: Error) => setError(err.message),
    )
  }, [start, version])

  return (
    <section id="week-chart" className="card mb-6 border-ocean-200" aria-labelledby="week-heading">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="week-heading" className="text-2xl text-grape-900">
            📅 Week at a glance
          </h2>
          {week && (
            <p className="text-sm font-semibold text-grape-700">
              {dayLabel(week.days[0].date, DAY)} – {dayLabel(week.days[6].date, DAY)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {week && (
            <>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setStart(shiftDate(week.start, -7))}>
                ◀ Last week
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setStart(shiftDate(week.start, 7))}>
                Next week ▶
              </button>
            </>
          )}
          <button type="button" className="btn-sunny btn-sm" onClick={() => window.print()}>
            🖨️ Print
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 font-semibold text-rose-600">
          {error}
        </p>
      )}
      {!week && !error && <p className="text-grape-700">Loading the week…</p>}
      {week && (
        <div className="-mx-2 overflow-x-auto px-2 pb-2">
          <ol className="grid min-w-[52rem] grid-cols-7 gap-2 print:min-w-0">
            {week.days.map((day) => (
              <li key={day.date} className="flex min-h-[9rem] flex-col rounded-2xl bg-ocean-50/60 p-2">
                <h3 className="mb-2 text-center text-sm font-bold text-ocean-600">{dayLabel(day.date, DAY)}</h3>
                <ul className="flex flex-1 flex-col gap-1.5">
                  {day.items.map((item) => (
                    <li key={`${item.task_id}-${item.child_id}-${item.occurrence_id}`} className="rounded-xl bg-white p-2 text-sm shadow-chunky">
                      <p className="break-words font-bold text-grape-900">{item.title}</p>
                      <p className="text-grape-700">{item.child_name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StatusPill status={item.status} />
                        {item.awaiting_approval && <span className="chip bg-sunny-200 text-grape-900">⏳ Needs a yes</span>}
                      </div>
                    </li>
                  ))}
                  {day.items.length === 0 && <li className="text-center text-sm text-grape-400">Free day 🎈</li>}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}
