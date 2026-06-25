'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const STATES = [
  { value: 'approved',        label: 'Aprobada',      color: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100', active: 'bg-emerald-600 border-emerald-600 text-white' },
  { value: 'duplicate_clean', label: 'Duplicado',     color: 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100',             active: 'bg-blue-600 border-blue-600 text-white' },
  { value: 'intercambiada',   label: 'Intercambiada', color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100',     active: 'bg-purple-600 border-purple-600 text-white' },
  { value: 'invalida',        label: 'Inválida',      color: 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100',             active: 'bg-gray-600 border-gray-600 text-white' },
]

// Normaliza estados legacy para el selector
function normalizeState(s: string): string {
  if (s === 'manipulated') return 'intercambiada'
  if (s === 'invalid')     return 'invalida'
  if (s === 'pending')     return 'approved'
  return s
}

interface Props {
  imageId: string
  currentState: string
  currentFraudReason: string | null
}

export default function ImageStateForm({ imageId, currentState, currentFraudReason }: Props) {
  const [selected, setSelected]       = useState(() => normalizeState(currentState))
  const [fraudReason, setFraudReason] = useState(currentFraudReason ?? '')
  const [loading, setLoading]         = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const router = useRouter()

  const changed     = selected !== normalizeState(currentState) || fraudReason !== (currentFraudReason ?? '')
  const needsReason = selected === 'intercambiada' || selected === 'invalida'

  async function save() {
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch(`/api/admin/imagenes/${imageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validation_state: selected, fraud_reason: fraudReason }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'Error al guardar')
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError('Error de red')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Botones de estado */}
      <div className="flex flex-wrap gap-2">
        {STATES.map(s => (
          <button
            key={s.value}
            onClick={() => { setSelected(s.value); setSaved(false) }}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
              selected === s.value ? s.active : s.color
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Motivo (obligatorio para manipulada/inválida) */}
      {needsReason && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Motivo {selected === 'manipulated' ? '(requerido)' : '(opcional)'}
          </label>
          <input
            type="text"
            value={fraudReason}
            onChange={e => { setFraudReason(e.target.value); setSaved(false) }}
            placeholder="Ej: fecha alterada, imagen reciclada…"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Guardar */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={loading || !changed}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Guardando…' : 'Guardar cambio'}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">✓ Guardado</span>
        )}
        {error && (
          <span className="text-sm text-red-600">{error}</span>
        )}
      </div>
    </div>
  )
}
