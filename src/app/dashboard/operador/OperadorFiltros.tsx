'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'
import DateRangePicker from '../../components/DateRangePicker'

function fmt(d: Date) {
  return new Intl.DateTimeFormat('sv', { timeZone: 'America/Mexico_City' }).format(d)
}
function todayStr() { return fmt(new Date()) }
function daysAgoStr(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return fmt(d) }
function weekStartStr() {
  const d = new Date()
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay()
  d.setDate(d.getDate() + diff)
  return fmt(d)
}
function monthStartStr() { const d = new Date(); d.setDate(1); return fmt(d) }

const QUICK = [
  { label: 'Hoy',         desde: () => todayStr(),     hasta: () => todayStr() },
  { label: 'Esta semana', desde: () => weekStartStr(),  hasta: () => todayStr() },
  { label: '30 días',     desde: () => daysAgoStr(30),  hasta: () => todayStr() },
  { label: 'Este mes',    desde: () => monthStartStr(), hasta: () => todayStr() },
]

const ESTADOS = [
  { value: '',                label: 'Todas' },
  { value: 'approved',        label: 'Aprobada' },
  { value: 'duplicate_clean', label: 'Duplicada' },
  { value: 'intercambiada',   label: 'Intercambiada' },
  { value: 'invalida',        label: 'Inválida' },
]

const TIPO_FECHA = [
  { value: 'subida', label: 'Fecha de subida' },
  { value: 'foto',   label: 'Fecha de foto (OCR)' },
]

export default function OperadorFiltros({ showEstado = false }: { showEstado?: boolean }) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const estado     = params.get('estado')     ?? ''
  const desde      = params.get('desde')      ?? ''
  const hasta      = params.get('hasta')      ?? ''
  const tipo_fecha = params.get('tipo_fecha') ?? 'subida'

  const update = useCallback((patches: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patches)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    router.push(`${pathname}?${next.toString()}`)
  }, [params, pathname, router])

  const clearAll   = () => router.push(pathname)
  const hasFilters = !!(estado || desde || hasta || tipo_fecha !== 'subida')

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">Filtros</span>
          {hasFilters && <span className="w-2 h-2 rounded-full bg-[#20F9E7]" />}
        </div>
        {hasFilters && (
          <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-800 transition-colors font-medium">
            Limpiar todo
          </button>
        )}
      </div>

      <div className="px-5 py-4 space-y-3.5">

        {/* Tipo de fecha */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-gray-400 w-20 shrink-0 text-right">Tipo fecha</span>
          <div className="flex gap-1.5">
            {TIPO_FECHA.map(t => (
              <button
                key={t.value}
                onClick={() => update({ tipo_fecha: t.value })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  tipo_fecha === t.value
                    ? 'bg-[#202E0B] text-[#20F9E7] shadow-sm ring-1 ring-[#20F9E7]/40'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Estado — solo en Mis imágenes */}
        {showEstado && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-400 w-20 shrink-0 text-right">Estado</span>
            <div className="flex gap-1.5 flex-wrap">
              {ESTADOS.map(e => (
                <button
                  key={e.value}
                  onClick={() => update({ estado: e.value })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    estado === e.value
                      ? 'bg-[#20F9E7] text-[#202E0B] font-semibold shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Periodo */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-gray-400 w-20 shrink-0 text-right">Periodo</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK.map(q => {
              const qDesde = q.desde()
              const qHasta = q.hasta()
              const active  = desde === qDesde && hasta === qHasta
              return (
                <button
                  key={q.label}
                  onClick={() => update({ desde: qDesde, hasta: qHasta })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-[#20F9E7] text-[#202E0B] font-semibold shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {q.label}
                </button>
              )
            })}
            <span className="text-gray-300 text-xs px-1">|</span>
            <DateRangePicker
              desde={desde}
              hasta={hasta}
              onChange={(d, h) => update({ desde: d, hasta: h })}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
