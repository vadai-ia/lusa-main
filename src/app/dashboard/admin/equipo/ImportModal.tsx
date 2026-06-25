'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'

type Row = { name: string; phone: string; role: string }
type Result = { name: string; email: string; status: 'ok' | 'error'; error?: string }
type Step = 'upload' | 'preview' | 'results'

const ROLE_OPTIONS = ['operador', 'admin']

function normalizeHeader(h: unknown): string {
  return String(h ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Para XLS/XLSX: celdas numéricas → string sin notación científica
function cellStr(val: unknown): string {
  if (val === null || val === undefined) return ''
  if (typeof val === 'number') return Math.round(val).toString()
  return String(val).trim()
}

function parseSheet(data: unknown[][]): Row[] {
  if (data.length < 2) return []
  const headers = (data[0] as unknown[]).map(normalizeHeader)
  const nameIdx  = headers.findIndex(h => h.includes('nombre') || h.includes('name'))
  const phoneIdx = headers.findIndex(h => h.includes('numero') || h.includes('telefono') || h.includes('phone') || h.includes('tel'))
  const roleIdx  = headers.findIndex(h => h.includes('rol') || h.includes('role'))
  return data.slice(1)
    .filter(row => (row as unknown[]).some(c => c !== '' && c !== null && c !== undefined))
    .map(row => {
      const r = row as unknown[]
      return {
        name:  cellStr(nameIdx  >= 0 ? r[nameIdx]  : r[0]).trim(),
        phone: cellStr(phoneIdx >= 0 ? r[phoneIdx] : r[1]).replace(/^\+/, '').replace(/\s/g, ''),
        role:  cellStr(roleIdx  >= 0 ? r[roleIdx]  : r[2]).toLowerCase() || 'operador',
      }
    })
    .filter(r => r.name || r.phone)
}

// Para CSV: parseo manual como texto puro (evita que xlsx convierta teléfonos a number)
function parseCSVLine(line: string): string[] {
  const cols: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  cols.push(cur.trim())
  return cols
}

function parseCSVText(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(normalizeHeader)
  const nameIdx  = headers.findIndex(h => h.includes('nombre') || h.includes('name'))
  const phoneIdx = headers.findIndex(h => h.includes('numero') || h.includes('telefono') || h.includes('phone') || h.includes('tel'))
  const roleIdx  = headers.findIndex(h => h.includes('rol') || h.includes('role'))
  return lines.slice(1)
    .map(line => {
      const cols = parseCSVLine(line)
      return {
        name:  (nameIdx  >= 0 ? cols[nameIdx]  : cols[0] ?? '').trim(),
        phone: (phoneIdx >= 0 ? cols[phoneIdx] : cols[1] ?? '').trim().replace(/^\+/, '').replace(/\s/g, ''),
        role:  (roleIdx  >= 0 ? cols[roleIdx]  : cols[2] ?? '').trim().toLowerCase() || 'operador',
      }
    })
    .filter(r => r.name || r.phone)
}

export default function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep]         = useState<Step>('upload')
  const [rows, setRows]         = useState<Row[]>([])
  const [results, setResults]   = useState<Result[]>([])
  const [importing, setImporting] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseError(null)
    setFileName(file.name)

    const isCSV = file.name.toLowerCase().endsWith('.csv')
    const reader = new FileReader()

    reader.onload = (ev) => {
      try {
        let parsed: Row[]
        if (isCSV) {
          // CSV: leer como texto para que el teléfono nunca se convierta a number
          parsed = parseCSVText(ev.target?.result as string)
        } else {
          // XLS/XLSX: usar xlsx
          const wb = XLSX.read(ev.target?.result, { type: 'binary' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }) as unknown[][]
          parsed = parseSheet(data)
        }
        if (parsed.length === 0) { setParseError('No se encontraron filas válidas.'); return }
        setRows(parsed)
        setStep('preview')
      } catch {
        setParseError('No se pudo leer el archivo. Usa formato CSV o XLS/XLSX.')
      }
    }

    if (isCSV) {
      reader.readAsText(file, 'UTF-8')
    } else {
      reader.readAsBinaryString(file)
    }
  }

  function updateRow(i: number, field: keyof Row, value: string) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleImport() {
    setImporting(true)
    try {
      const res = await fetch('/api/admin/users/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: rows }),
      })
      const data = await res.json()
      setResults(data.results ?? [])
      setStep('results')
    } catch {
      setParseError('Error de red al importar.')
    } finally {
      setImporting(false)
    }
  }

  const okCount  = results.filter(r => r.status === 'ok').length
  const errCount = results.filter(r => r.status === 'error').length

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Importar contactos</h2>
            {step === 'preview' && (
              <p className="text-xs text-gray-400 mt-0.5">{rows.length} fila{rows.length !== 1 ? 's' : ''} · {fileName}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Step: upload */}
          {step === 'upload' && (
            <div className="px-6 py-8 space-y-6">
              {/* Drop zone */}
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-200 rounded-xl p-10 text-center hover:border-[#20F9E7] hover:bg-[#20F9E7]/5 transition-all group"
              >
                <svg className="w-10 h-10 text-gray-300 group-hover:text-[#20F9E7] mx-auto mb-3 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-medium text-gray-600">Haz clic para seleccionar archivo</p>
                <p className="text-xs text-gray-400 mt-1">CSV · XLS · XLSX</p>
              </button>
              <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx" className="hidden" onChange={handleFile} />

              {parseError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{parseError}</p>
              )}

              {/* Formato esperado */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formato esperado</p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400">
                      <th className="pb-1.5 font-medium pr-4">Nombre</th>
                      <th className="pb-1.5 font-medium pr-4">Numero</th>
                      <th className="pb-1.5 font-medium">Rol</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600 font-mono">
                    <tr><td className="pr-4">Juan Pérez</td><td className="pr-4">5215512345678</td><td>operador</td></tr>
                    <tr><td className="pr-4">Ana García</td><td className="pr-4">5215598765432</td><td>operador</td></tr>
                  </tbody>
                </table>
                <p className="text-xs text-gray-400 mt-3">· Email se genera automáticamente: <span className="font-mono">juanperez@hotmail.com</span></p>
                <p className="text-xs text-gray-400">· Contraseña por defecto: <span className="font-mono">12345678</span></p>
              </div>
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Teléfono</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Rol</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <input
                          value={row.name}
                          onChange={e => updateRow(i, 'name', e.target.value)}
                          className="w-full text-sm text-gray-800 bg-transparent focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#20F9E7] rounded px-1"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          value={row.phone}
                          onChange={e => updateRow(i, 'phone', e.target.value)}
                          className="w-full text-sm text-gray-600 font-mono bg-transparent focus:outline-none focus:bg-white focus:ring-1 focus:ring-[#20F9E7] rounded px-1"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={row.role}
                          onChange={e => updateRow(i, 'role', e.target.value)}
                          className="text-xs bg-gray-100 border-0 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#20F9E7]"
                        >
                          {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Step: results */}
          {step === 'results' && (
            <div className="px-6 py-5 space-y-4">
              {/* Summary */}
              <div className="flex gap-3">
                <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{okCount}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Creados</p>
                </div>
                {errCount > 0 && (
                  <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-red-600">{errCount}</p>
                    <p className="text-xs text-red-500 mt-0.5">Con error</p>
                  </div>
                )}
              </div>

              {/* Detail */}
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 text-sm border-b border-gray-50 last:border-0 ${r.status === 'error' ? 'bg-red-50' : ''}`}>
                    {r.status === 'ok'
                      ? <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      : <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    }
                    <span className="font-medium text-gray-800 truncate flex-1">{r.name}</span>
                    {r.status === 'ok'
                      ? <span className="text-xs text-gray-400 font-mono truncate">{r.email}</span>
                      : <span className="text-xs text-red-500 truncate">{r.error}</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          {step === 'upload' && (
            <button onClick={onClose} className="flex-1 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setStep('upload'); setRows([]); setFileName('') }} className="py-2 px-4 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Atrás
              </button>
              <button
                onClick={handleImport}
                disabled={importing || rows.length === 0}
                className="flex-1 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
                style={{ background: '#20F9E7', color: '#202E0B' }}
              >
                {importing ? 'Importando...' : `Importar ${rows.length} contacto${rows.length !== 1 ? 's' : ''}`}
              </button>
            </>
          )}
          {step === 'results' && (
            <button
              onClick={() => { onDone(); onClose() }}
              className="flex-1 py-2 text-sm font-semibold rounded-lg transition-colors"
              style={{ background: '#20F9E7', color: '#202E0B' }}
            >
              Listo
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
