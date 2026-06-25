'use client'

import { useState, useRef, useEffect } from 'react'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameDay, isToday, isWithinInterval,
  addMonths, subMonths, isBefore, parseISO, isSameMonth,
} from 'date-fns'
import { es } from 'date-fns/locale'

interface Props {
  desde: string
  hasta: string
  onChange: (desde: string, hasta: string) => void
}

function toStr(d: Date) { return format(d, 'yyyy-MM-dd') }
function parse(s: string) { try { return s ? parseISO(s) : null } catch { return null } }

const DAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']

export default function DateRangePicker({ desde, hasta, onChange }: Props) {
  const [open, setOpen]           = useState(false)
  const [month, setMonth]         = useState(() => parse(desde) ?? new Date())
  const [localStart, setLocalStart] = useState<Date | null>(null)
  const [hover, setHover]         = useState<Date | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const committedStart = parse(desde)
  const committedEnd   = parse(hasta)

  // While user is picking, show localStart; once done, show committed
  const displayStart = localStart ?? committedStart
  const displayEnd   = localStart ? null : committedEnd
  const isSelecting  = !!localStart

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setLocalStart(null)
        setHover(null)
      }
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  function handleDay(day: Date) {
    if (!localStart && !committedStart) {
      // No selection yet — set local start (no URL update)
      setLocalStart(day)
    } else if (localStart) {
      if (isBefore(day, localStart)) {
        // Clicked before start — reset local start
        setLocalStart(day)
      } else if (isSameDay(day, localStart)) {
        // Same day — single-day range
        onChange(toStr(day), toStr(day))
        setLocalStart(null)
        setOpen(false)
      } else {
        // Commit both dates to URL in one update (fast!)
        onChange(toStr(localStart), toStr(day))
        setLocalStart(null)
        setHover(null)
        setOpen(false)
      }
    } else {
      // Had committed dates, start fresh
      setLocalStart(day)
    }
  }

  const previewEnd = isSelecting && hover && !isBefore(hover, localStart!)
    ? hover
    : displayEnd

  function inRange(day: Date) {
    if (!displayStart || !previewEnd) return false
    return isWithinInterval(day, { start: displayStart, end: previewEnd })
  }
  function isStart(day: Date) { return displayStart ? isSameDay(day, displayStart) : false }
  function isEnd(day: Date)   { return previewEnd   ? isSameDay(day, previewEnd)   : false }

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end:   endOfWeek(endOfMonth(month),     { weekStartsOn: 1 }),
  })

  const hasValue = !!desde || !!hasta
  const label = committedStart && committedEnd
    ? `${format(committedStart, 'd MMM', { locale: es })} — ${format(committedEnd, 'd MMM', { locale: es })}`
    : committedStart
    ? format(committedStart, 'd MMM yyyy', { locale: es })
    : 'Rango de fechas'

  return (
    <div className="relative" ref={ref}>

      {/* Trigger */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) setLocalStart(null) }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
          hasValue
            ? 'bg-[#20F9E7] text-[#202E0B] border-[#20F9E7] font-semibold'
            : 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-200'
        }`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{label}</span>
        {hasValue && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange('', ''); setLocalStart(null) }}
            className="ml-0.5 text-[#202E0B]/60 hover:text-[#202E0B] font-bold leading-none"
          >
            ×
          </span>
        )}
      </button>

      {/* Calendar */}
      {open && (
        <div className="absolute top-full mt-2 left-0 w-72 rounded-2xl border border-[#95F580]/30 shadow-2xl z-50 p-4"
          style={{ background: '#202E0B' }}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setMonth(m => subMonths(m, 1))}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            >
              <svg className="w-4 h-4 text-[#95F580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-white capitalize">
              {format(month, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              onClick={() => setMonth(m => addMonths(m, 1))}
              className="p-1.5 rounded-lg transition-colors hover:bg-white/10"
            >
              <svg className="w-4 h-4 text-[#95F580]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-xs font-medium py-1" style={{ color: '#95F580', opacity: 0.5 }}>
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const start   = isStart(day)
              const end     = isEnd(day)
              const range   = inRange(day)
              const today   = isToday(day)
              const current = isSameMonth(day, month)

              return (
                <div
                  key={i}
                  className={[
                    'relative h-9 flex items-center justify-center',
                    range && !start && !end ? 'bg-[#20F9E7]/15' : '',
                    start && previewEnd && !end ? 'bg-[#20F9E7]/15 rounded-l-full' : '',
                    end && displayStart && !start ? 'bg-[#20F9E7]/15 rounded-r-full' : '',
                    start && end ? 'rounded-full' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <button
                    onMouseEnter={() => isSelecting && setHover(day)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => handleDay(day)}
                    className={[
                      'w-8 h-8 rounded-full text-xs font-medium transition-all',
                      start || end
                        ? 'font-bold'
                        : today
                        ? 'font-semibold ring-1'
                        : current
                        ? 'hover:bg-white/10'
                        : 'hover:bg-white/5',
                    ].join(' ')}
                    style={{
                      background: start || end ? '#20F9E7' : undefined,
                      color: start || end
                        ? '#202E0B'
                        : today
                        ? '#F0F831'
                        : current
                        ? '#95F580'
                        : 'rgba(149,245,128,0.25)',
                      outline: today && !start && !end ? '1px solid #F0F831' : undefined,
                    }}
                  >
                    {format(day, 'd')}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Hint */}
          <p className="text-xs text-center mt-3" style={{ color: 'rgba(149,245,128,0.5)' }}>
            {!displayStart
              ? 'Seleccioná fecha inicio'
              : isSelecting
              ? 'Ahora seleccioná la fecha fin'
              : committedStart && committedEnd
              ? `${format(committedStart, 'd MMM', { locale: es })} — ${format(committedEnd, 'd MMM yyyy', { locale: es })}`
              : ''}
          </p>
        </div>
      )}
    </div>
  )
}
