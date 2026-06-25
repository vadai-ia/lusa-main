import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const STATE_LABELS: Record<string, string> = {
  approved:        'Aprobadas',
  duplicate_clean: 'Duplicadas',
  intercambiada:   'Intercambiadas',
  invalida:        'Inválidas',
}

const STATE_COLORS: Record<string, { dot: string; text: string; bg: string }> = {
  approved:        { dot: 'bg-emerald-400', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  duplicate_clean: { dot: 'bg-blue-400',    text: 'text-blue-700',    bg: 'bg-blue-50' },
  intercambiada:   { dot: 'bg-purple-400',  text: 'text-purple-700',  bg: 'bg-purple-50' },
  invalida:        { dot: 'bg-gray-400',    text: 'text-gray-600',    bg: 'bg-gray-50' },
}

export default async function MiInformacionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: operator }] = await Promise.all([
    supabase.schema('lusa').from('profiles').select('full_name, email, role').eq('id', user.id).single(),
    supabase.schema('lusa').from('operators').select('id, phone, unit, is_active, created_at').eq('user_id', user.id).single(),
  ])

  if (!operator) redirect('/dashboard/operador')

  // Stats por estado (agrupa intercambiada→manipulated, invalida→invalid)
  const RAW_STATES = ['approved', 'duplicate_clean', 'intercambiada', 'manipulated', 'invalida', 'invalid']
  const rawResults = await Promise.all(
    RAW_STATES.map(state =>
      supabase.schema('lusa').from('images')
        .select('*', { count: 'exact', head: true })
        .eq('operator_id', operator.id)
        .eq('validation_state', state)
        .then(({ count }) => [state, count ?? 0] as [string, number])
    )
  )
  const raw = Object.fromEntries(rawResults)
  const stats = {
    approved:        raw.approved,
    duplicate_clean: raw.duplicate_clean,
    intercambiada:   (raw.intercambiada ?? 0) + (raw.manipulated ?? 0),
    invalida:        (raw.invalida ?? 0)       + (raw.invalid ?? 0),
  }
  const total = Object.values(stats).reduce((a, b) => a + b, 0)

  const tasaAprobacion = total > 0 ? Math.round((stats.approved / total) * 100) : 0

  const memberSince = operator.created_at
    ? new Date(operator.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })
    : '—'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi información</h1>
        <p className="text-sm text-gray-500 mt-1">Tus datos y estadísticas de actividad</p>
      </div>

      {/* Tarjeta de perfil */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white shrink-0" style={{ background: '#202E0B' }}>
            {(profile?.full_name ?? profile?.email ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {profile?.full_name ?? <span className="text-gray-400 font-normal">Sin nombre</span>}
            </h2>
            <p className="text-sm text-gray-500 truncate">{profile?.email}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#F0F831', color: '#202E0B' }}>
                Operador
              </span>
              {operator.is_active ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Activo
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  Inactivo
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5" style={{ borderTop: '1px solid #f1f5f9' }}>
          <InfoRow label="Teléfono" value={operator.phone ?? '—'} />
          <InfoRow label="Unidad" value={operator.unit ?? '—'} />
          <InfoRow label="Miembro desde" value={memberSince} />
        </div>
      </div>

      {/* Stats */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Estadísticas generales</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {/* Total */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:col-span-1">
            <p className="text-3xl font-bold text-gray-900">{total}</p>
            <p className="text-xs text-gray-400 mt-0.5">Total imágenes</p>
          </div>
          {/* Tasa aprobación */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-3xl font-bold" style={{ color: '#20F9E7' }}>{tasaAprobacion}%</p>
            <p className="text-xs text-gray-400 mt-0.5">Tasa de aprobación</p>
          </div>
          {/* Por estado */}
          {Object.entries(STATE_LABELS).map(([state, label]) => {
            const c = STATE_COLORS[state]
            return (
              <div key={state} className={`rounded-xl border border-gray-200 p-4 ${c.bg}`}>
                <p className={`text-3xl font-bold ${c.text}`}>{stats[state as keyof typeof stats] ?? 0}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value}</p>
    </div>
  )
}
