'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RunCrossCheckButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ nuevos: number; total: number } | null>(null)
  const router = useRouter()

  async function run() {
    setLoading(true)
    setResult(null)
    try {
      const res  = await fetch('/api/admin/crosscheck/run', { method: 'POST' })
      const data = await res.json()
      setResult(data)
      router.refresh()
    } catch {
      setResult({ nuevos: -1, total: 0 })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={run}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Analizando…
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Ejecutar cross-check retroactivo
          </>
        )}
      </button>

      {result && (
        <span className={`text-sm font-medium ${result.nuevos < 0 ? 'text-red-600' : result.nuevos > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>
          {result.nuevos < 0
            ? 'Error al ejecutar'
            : result.nuevos === 0
            ? `Sin nuevos fraudes en ${result.total} imágenes`
            : `${result.nuevos} nuevo${result.nuevos !== 1 ? 's' : ''} caso${result.nuevos !== 1 ? 's' : ''} de fraude en ${result.total} imágenes`}
        </span>
      )}
    </div>
  )
}
