'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback, useState, useRef, useEffect } from 'react'
import DateRangePicker from '../../../components/DateRangePicker'

const ESTADOS = [
  { value: 'approved',        label: 'Aprobada' },
  { value: 'duplicate_clean', label: 'Duplicada' },
  { value: 'intercambiada',   label: 'Intercambiada' },
  { value: 'invalida',        label: 'Inválida' },
]

const TIPO_FECHA = [
  { value: 'subida', label: 'Fecha de subida' },
  { value: 'foto',   label: 'Fecha de foto (OCR)' },
]

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

interface Operator { id: string; name: string }

const selectBase = [
  'appearance-none cursor-pointer',
  'pl-3 pr-7 py-1.5 rounded-lg text-xs font-medium',
  'border transition-all focus:outline-none',
  'bg-gray-50 border-gray-200 text-gray-500',
  'hover:border-gray-300',
].join(' ')

const selectActive = [
  'appearance-none cursor-pointer',
  'pl-3 pr-7 py-1.5 rounded-lg text-xs font-medium',
  'border transition-all focus:outline-none',
  'bg-[#20F9E7]/10 border-[#20F9E7] text-[#202E0B] font-semibold',
].join(' ')

export default function ImagenesFilters({ total, operators }: { total: number; operators: Operator[] }) {
  const router   = useRouter()
  const pathname = usePathname()
  const params   = useSearchParams()

  const estado     = params.get('estado')     ?? ''
  const desde      = params.get('desde')      ?? ''
  const hasta      = params.get('hasta')      ?? ''
  const tipo_fecha = params.get('tipo_fecha') ?? 'subida'
  const operador   = params.get('operador')   ?? ''
  const periodo    = params.get('periodo')    ?? ''

  const [search, setSearch] = useState('')
  const [open, setOpen]     = useState(false)
  const comboRef            = useRef<HTMLDivElement>(null)

  const selectedOp = operators.find(o => o.id === operador)
  const filtered   = operators.filter(o =>
    (o.name ?? '').toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    function onOut(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch('')
      }
    }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [])

  const update = useCallback((patches: Record<string, string>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patches)) {
      if (v) next.set(k, v); else next.delete(k)
    }
    router.push(`${pathname}?${next.toString()}`)
  }, [params, pathname, router])

  function handleQuick(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (!val) { update({ desde: '', hasta: '', periodo: '' }); return }
    const q = QUICK.find(q => q.label === val)
    if (q) update({ desde: q.desde(), hasta: q.hasta(), periodo: val })
  }

  const clearAll   = () => router.push(pathname)
  const hasFilters = !!(estado || desde || hasta || tipo_fecha !== 'subida' || operador)

  function selectOperator(id: string) {
    update({ operador: id }); setOpen(false); setSearch('')
  }

  // Chevron SVG for select
  const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E")`

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center gap-2 flex-wrap">

      {/* Tipo fecha */}
      <div className="relative">
        <select
          value={tipo_fecha}
          onChange={e => update({ tipo_fecha: e.target.value })}
          className={tipo_fecha !== 'subida' ? selectActive : selectBase}
          style={{ backgroundImage: chevron, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
        >
          <option value="" disabled>Tipo fecha</option>
          {TIPO_FECHA.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-5 bg-gray-200 shrink-0" />

      {/* Estado */}
      <div className="relative">
        <select
          value={estado}
          onChange={e => update({ estado: e.target.value })}
          className={estado ? selectActive : selectBase}
          style={{ backgroundImage: chevron, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
        >
          <option value="">Estado</option>
          {ESTADOS.map(e => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
      </div>

      <div className="w-px h-5 bg-gray-200 shrink-0" />

      {/* Operador — combobox buscable */}
      {operators.length > 0 && (
        <div className="relative" ref={comboRef}>
          <button
            onClick={() => { setOpen(o => !o); setSearch('') }}
            className={[
              'flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-lg text-xs font-medium border transition-all',
              operador
                ? 'bg-[#20F9E7]/10 border-[#20F9E7] text-[#202E0B] font-semibold'
                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300',
            ].join(' ')}
          >
            <span className="truncate max-w-32">
              {selectedOp ? selectedOp.name : 'Operador'}
            </span>
            <svg className={`w-3 h-3 shrink-0 transition-transform text-gray-400 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute top-full mt-1 left-0 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
              <div className="p-2 border-b border-gray-100">
                <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
                  <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    autoFocus
                    type="text"
                    placeholder="Buscar operador..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-transparent text-xs text-gray-700 placeholder-gray-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="max-h-52 overflow-y-auto py-1">
                <button
                  onClick={() => selectOperator('')}
                  className={`w-full text-left px-4 py-2 text-xs transition-colors ${!operador ? 'bg-[#20F9E7]/15 text-[#202E0B] font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  Todos los operadores
                </button>
                {filtered.length > 0 ? filtered.map(op => (
                  <button
                    key={op.id}
                    onClick={() => selectOperator(op.id)}
                    className={`w-full text-left px-4 py-2 text-xs transition-colors ${operador === op.id ? 'bg-[#20F9E7]/15 text-[#202E0B] font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                  >
                    {op.name ?? '(sin nombre)'}
                  </button>
                )) : (
                  <p className="px-4 py-3 text-xs text-gray-400 text-center">Sin resultados</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="w-px h-5 bg-gray-200 shrink-0" />

      {/* Periodo — select rápido + DateRangePicker */}
      <div className="relative">
        <select
          value={periodo}
          onChange={handleQuick}
          className={periodo ? selectActive : selectBase}
          style={{ backgroundImage: chevron, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
        >
          <option value="">Periodo</option>
          {QUICK.map(q => (
            <option key={q.label} value={q.label}>{q.label}</option>
          ))}
        </select>
      </div>

      <DateRangePicker
        desde={desde}
        hasta={hasta}
        onChange={(d, h) => update({ desde: d, hasta: h, periodo: '' })}
      />

      {/* Resultados + limpiar */}
      <div className="ml-auto flex items-center gap-3 pl-2">
        {hasFilters && (
          <button onClick={clearAll} className="text-xs text-gray-400 hover:text-gray-700 transition-colors font-medium">
            Limpiar
          </button>
        )}
        <span className="text-xs text-gray-400 font-medium">{total} resultado{total !== 1 ? 's' : ''}</span>
      </div>

    </div>
  )
}
