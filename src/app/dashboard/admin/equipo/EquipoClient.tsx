'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ImportModal from './ImportModal'

type Member = {
  id: string
  email: string
  role: string
  full_name: string | null
  operator_id: string | null
  phone: string | null
  unit: string | null
  is_active: boolean
  image_count: number
}

type EditForm = {
  full_name: string
  email: string
  password: string
  role: 'admin' | 'operador'
  phone: string
  unit: string
}

type RoleFilter = 'todos' | 'admin' | 'operador'

type AddForm = {
  full_name: string
  email: string
  password: string
  role: 'admin' | 'operador'
  phone: string
  unit: string
}

const EMPTY_FORM: AddForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'operador',
  phone: '',
  unit: '',
}

const ROLE_STYLES: Record<string, string> = {
  admin:    'bg-blue-100 text-blue-700',
  operador: 'bg-emerald-100 text-emerald-700',
}

export default function EquipoClient({ members }: { members: Member[] }) {
  const router = useRouter()
  const [filter, setFilter]           = useState<RoleFilter>('todos')
  const [showAdd, setShowAdd]           = useState(false)
  const [form, setForm]                 = useState<AddForm>(EMPTY_FORM)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showImport, setShowImport]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const [deleteError, setDeleteError]   = useState<string | null>(null)
  const [editTarget, setEditTarget]       = useState<Member | null>(null)
  const [editForm, setEditForm]           = useState<EditForm | null>(null)
  const [editLoading, setEditLoading]     = useState(false)
  const [editError, setEditError]         = useState<string | null>(null)
  const [togglingId, setTogglingId]       = useState<string | null>(null)

  function field(key: keyof AddForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  function editField(key: keyof EditForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setEditForm(f => f ? { ...f, [key]: e.target.value } : f)
  }

  function openEdit(m: Member) {
    setEditTarget(m)
    setEditForm({
      full_name: m.full_name ?? '',
      email:     m.email,
      password:  '',
      role:      m.role as 'admin' | 'operador',
      phone:     m.phone ?? '',
      unit:      m.unit  ?? '',
    })
    setEditError(null)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget || !editForm) return
    setEditLoading(true)
    setEditError(null)
    try {
      const body: Record<string, string> = {
        full_name: editForm.full_name,
        email:     editForm.email,
        role:      editForm.role,
        phone:     editForm.phone,
        unit:      editForm.unit,
      }
      if (editForm.password) body.password = editForm.password

      const res = await fetch(`/api/admin/users/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al guardar')
      setEditTarget(null)
      setEditForm(null)
      router.refresh()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setEditLoading(false)
    }
  }

  const visible = filter === 'todos' ? members : members.filter(m => m.role === filter)

  const counts = {
    todos:    members.length,
    admin:    members.filter(m => m.role === 'admin').length,
    operador: members.filter(m => m.role === 'operador').length,
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear')
      setShowAdd(false)
      setForm(EMPTY_FORM)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget?.operator_id) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/operadores/${deleteTarget.operator_id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al eliminar')
      setDeleteTarget(null)
      router.refresh()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  async function handleToggleActive(m: Member) {
    if (!m.operator_id) return
    setTogglingId(m.id)
    try {
      const res = await fetch(`/api/admin/users/${m.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !m.is_active }),
      })
      if (res.ok) router.refresh()
    } finally {
      setTogglingId(null)
    }
  }

  function initial(member: Member) {
    return (member.full_name ?? member.email).charAt(0).toUpperCase()
  }

  function displayName(member: Member) {
    return member.full_name || member.email
  }

  return (
    <>
      {/* Filtros + botón */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-1">
          {(['todos', 'admin', 'operador'] as RoleFilter[]).map(r => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                filter === r ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
              <span className={`ml-1.5 text-xs ${filter === r ? 'text-blue-100' : 'text-gray-400'}`}>
                {counts[r]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 11l3 3m0 0l3-3m-3 3V4" />
            </svg>
            Importar contactos
          </button>
          <button
            onClick={() => { setShowAdd(true); setError(null) }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Agregar miembro
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Miembro</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Teléfono</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Rol</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Imágenes</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {visible.length > 0 ? visible.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                        !m.is_active ? 'bg-gray-300' : m.role === 'admin' ? 'bg-blue-500' : 'bg-emerald-500'
                      }`}>
                        {initial(m)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${m.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
                          {m.full_name ?? <span className="text-gray-400 font-normal">Sin nombre</span>}
                        </span>
                        {!m.is_active && m.role === 'operador' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
                            Inactivo
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs font-mono">
                    {m.phone ? `+${m.phone}` : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_STYLES[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {m.image_count > 0
                      ? <span className="text-sm font-semibold text-gray-700">{m.image_count.toLocaleString('es-MX')}</span>
                      : <span className="text-gray-300 text-sm">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {/* Toggle activo/inactivo — solo operadores */}
                      {m.role === 'operador' && (
                        <button
                          onClick={() => handleToggleActive(m)}
                          disabled={togglingId === m.id}
                          title={m.is_active ? 'Desactivar operador' : 'Activar operador'}
                          className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                            m.is_active
                              ? 'text-emerald-500 hover:bg-emerald-50'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                          </svg>
                        </button>
                      )}
                      {/* Editar */}
                      <button
                        onClick={() => openEdit(m)}
                        title="Editar"
                        className="p-1.5 rounded-lg text-[#F0F831] hover:bg-yellow-50 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {/* Eliminar */}
                      <button
                        onClick={() => { setDeleteTarget(m); setDeleteError(null) }}
                        disabled={!m.operator_id}
                        title={m.operator_id ? 'Eliminar' : 'Solo se pueden eliminar operadores'}
                        className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                    No hay miembros con ese rol
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal — Agregar miembro */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Agregar miembro</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleAdd} className="px-6 py-4 space-y-4">
              {error && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select value={form.role} onChange={field('role')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="operador">Operador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input type="text" required value={form.full_name} onChange={field('full_name')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Juan Pérez" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" required value={form.email} onChange={field('email')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="juan@empresa.com" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                <input type="password" required minLength={6} value={form.password} onChange={field('password')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Mínimo 6 caracteres" />
              </div>

              {form.role === 'operador' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono <span className="text-gray-400 font-normal">(con código de país)</span>
                    </label>
                    <input type="text" required value={form.phone} onChange={field('phone')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="5215512345678" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unidad <span className="text-gray-400 font-normal">(opcional)</span>
                    </label>
                    <input type="text" value={form.unit} onChange={field('unit')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej. Unidad 42" />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {loading ? 'Creando...' : 'Crear miembro'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Importar contactos */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onDone={() => router.refresh()}
        />
      )}

      {/* Modal — Editar miembro */}
      {editTarget && editForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Editar miembro</h2>
              <button onClick={() => setEditTarget(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleEdit} className="px-6 py-4 space-y-4">
              {editError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <select value={editForm.role} onChange={editField('role')} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="operador">Operador</option>
                  <option value="admin">Admin</option>
                </select>
                {editForm.role !== editTarget.role && (
                  <p className="mt-1 text-xs text-amber-600">
                    {editForm.role === 'admin'
                      ? 'Se quitará el tag "operador" en Whaapy.'
                      : 'Se agregará el tag "operador" en Whaapy.'}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={editField('full_name')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Juan Pérez"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={editForm.email}
                  onChange={editField('email')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nueva contraseña <span className="text-gray-400 font-normal">(dejar en blanco para no cambiar)</span>
                </label>
                <input
                  type="password"
                  minLength={6}
                  value={editForm.password}
                  onChange={editField('password')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              {editForm.role === 'operador' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono <span className="text-gray-400 font-normal">(con código de país)</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.phone}
                      onChange={editField('phone')}
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
                      value={editForm.unit}
                      onChange={editField('unit')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ej. Unidad 42"
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="flex-1 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {editLoading ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal — Confirmar eliminación */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 pt-6 pb-4 text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Peligro</h3>
              <p className="text-sm text-gray-500">
                Estás a punto de borrar a{' '}
                <span className="font-semibold text-gray-800">{displayName(deleteTarget)}</span>.
                Esta acción no se puede deshacer.
              </p>
              <p className="text-sm font-medium text-gray-700 mt-2">¿Estás seguro?</p>
            </div>

            {deleteError && (
              <div className="mx-6 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {deleteError}
              </div>
            )}

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null) }}
                disabled={deleting}
                className="flex-1 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
