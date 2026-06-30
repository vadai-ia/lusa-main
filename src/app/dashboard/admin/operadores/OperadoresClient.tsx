'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Operator = {
  id: string
  name: string
  phone: string
  unit: string | null
  is_active: boolean
  user_id: string | null
  email: string | null
  incidencias: number
  last_image_at: string | null
}

type AddForm = {
  full_name: string
  email: string
  password: string
  phone: string
  unit: string
}

const EMPTY_FORM: AddForm = { full_name: '', email: '', password: '', phone: '', unit: '' }

export default function OperadoresClient({ operators }: { operators: Operator[] }) {
  const router = useRouter()
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState<AddForm>(EMPTY_FORM)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  function field(key: keyof AddForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/admin/operadores/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error al eliminar')
      router.refresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setDeletingId(null)
      setConfirmId(null)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddLoading(true)
    setAddError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, role: 'operador' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear operador')
      setShowModal(false)
      setForm(EMPTY_FORM)
      router.refresh()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Error al crear operador')
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <>
      {/* Botón agregar */}
      <div className="flex justify-end">
        <button
          onClick={() => { setShowModal(true); setAddError(null) }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar operador
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Nombre</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Teléfono</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Incidencias</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Unidad</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Email</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Última foto</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {operators.length > 0 ? operators.map((op) => (
                <tr key={op.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-gray-900">{op.name}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{op.phone}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {op.incidencias}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{op.unit ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500">{op.email ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {op.last_image_at
                      ? new Date(op.last_image_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      op.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {op.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {confirmId === op.id ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-600 font-medium">¿Confirmar?</span>
                        <button
                          onClick={() => handleDelete(op.id)}
                          disabled={deletingId === op.id}
                          className="px-2.5 py-1 bg-red-600 text-white text-xs font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          {deletingId === op.id ? 'Eliminando...' : 'Sí, eliminar'}
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          disabled={deletingId === op.id}
                          className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-200 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/admin/operadores/${op.id}`}
                          className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap"
                        >
                          Ver / Editar
                        </Link>
                        <Link
                          href={`/dashboard/admin/operadores/${op.id}/incidencias`}
                          className="px-2.5 py-1 bg-gray-50 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-100 transition-colors"
                        >
                          Incidencias
                        </Link>
                        <button
                          onClick={() => setConfirmId(op.id)}
                          className="px-2.5 py-1 bg-red-50 text-red-700 text-xs font-medium rounded-md hover:bg-red-100 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                    No hay operadores registrados aún
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal agregar operador */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Agregar operador</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAdd} className="px-6 py-4 space-y-4">
              {addError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {addError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input
                  type="text"
                  required
                  value={form.full_name}
                  onChange={field('full_name')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={field('email')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="juan@empresa.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={form.password}
                  onChange={field('password')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono <span className="text-gray-400 font-normal">(con código de país)</span></label>
                <input
                  type="text"
                  required
                  value={form.phone}
                  onChange={field('phone')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="5215512345678"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unidad <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={field('unit')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej. Unidad 42"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {addLoading ? 'Creando...' : 'Crear operador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
