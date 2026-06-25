import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import MetricsCharts from './MetricsChartsWrapper'
import PanelFiltros from './PanelFiltros'
import { mxDayBounds } from '@/lib/utils/dates'

async function getStats(
  supabase: Awaited<ReturnType<typeof createClient>>,
  desde?: string,
  hasta?: string,
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function dated(q: any) {
    if (desde) q = q.gte('created_at', mxDayBounds(desde).start)
    if (hasta) q = q.lte('created_at', mxDayBounds(hasta).end)
    return q
  }

  const img = () => supabase.schema('lusa').from('images').select('*', { count: 'exact', head: true })

  const [
    { count: totalOperadores },
    { count: totalImagenes },
    { count: hoy },
    { count: duplicadas },
    { count: manipuladas },
    { count: disponibles },
  ] = await Promise.all([
    supabase.schema('lusa').from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'operador'),
    dated(img()),
    img().gte('created_at', today.toISOString()),
    dated(img().eq('validation_state', 'duplicate_clean')),
    dated(img().in('validation_state', ['manipulated', 'intercambiada'])),
    dated(img().eq('validation_state', 'approved')),
  ])

  return {
    totalOperadores: totalOperadores ?? 0,
    totalImagenes:   totalImagenes   ?? 0,
    hoy:             hoy             ?? 0,
    duplicadas:      duplicadas      ?? 0,
    manipuladas:     manipuladas     ?? 0,
    disponibles:     disponibles     ?? 0,
  }
}

const STATE_STYLES: Record<string, string> = {
  approved:        'bg-emerald-100 text-emerald-700',
  duplicate_clean: 'bg-blue-100 text-blue-700',
  manipulated:     'bg-red-100 text-red-700',
  intercambiada:   'bg-purple-100 text-purple-700',
  invalid:         'bg-gray-100 text-gray-600',
  invalida:        'bg-gray-100 text-gray-600',
}
const STATE_LABELS: Record<string, string> = {
  approved:        'Aprobada',
  duplicate_clean: 'Duplicado',
  manipulated:     'Manipulada',
  intercambiada:   'Intercambiada',
  invalid:         'Inválida',
  invalida:        'Inválida',
}

type SearchParams = Promise<{ desde?: string; hasta?: string }>

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const { desde, hasta } = await searchParams
  const supabase = await createClient()
  const stats = await getStats(supabase, desde, hasta)

  const hasFilter = !!(desde || hasta)

  let recentesQuery = supabase
    .schema('lusa')
    .from('images')
    .select('id, processed_at, created_at, validation_state, fraud_reason, operator_id')
    .order('created_at', { ascending: false })

  if (desde) recentesQuery = recentesQuery.gte('created_at', `${desde}T00:00:00`)
  if (hasta) recentesQuery = recentesQuery.lte('created_at', `${hasta}T23:59:59`)
  recentesQuery = recentesQuery.limit(hasFilter ? 200 : 6)

  const { data: recientes } = await recentesQuery

  const operadorIds = [...new Set((recientes ?? []).map(r => r.operator_id))]
  const { data: ops } = await supabase.schema('lusa').from('operators')
    .select('id, name').in('id', operadorIds)
  const opMap = Object.fromEntries((ops ?? []).map(o => [o.id, o.name]))

  const tasaAprobacion = stats.totalImagenes > 0
    ? Math.round((stats.disponibles / stats.totalImagenes) * 100)
    : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Panel general</h1>
        <p className="text-sm text-gray-500 mt-1">Resumen de actividad del sistema</p>
      </div>

      {/* Filtros de fecha */}
      <Suspense fallback={null}>
        <PanelFiltros />
      </Suspense>

      {/* Stats grid 2x3 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Operadores"
          value={stats.totalOperadores}
          color="blue"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          }
        />
        <StatCard
          label={hasFilter ? 'En el período' : 'Total imágenes'}
          value={stats.totalImagenes}
          color="emerald"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          }
        />
        <StatCard
          label="Hoy"
          value={stats.hoy}
          color="violet"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          }
        />
        <StatCard
          label="Duplicadas"
          value={stats.duplicadas}
          color="amber"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          }
        />
        <StatCard
          label="Manipuladas"
          value={stats.manipuladas}
          color="red"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          }
        />
        <StatCard
          label="Tasa de aprobación"
          value={`${tasaAprobacion}%`}
          color="teal"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          }
        />
      </div>

      {/* Charts */}
      <MetricsCharts />

      {/* Actividad reciente */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            {hasFilter ? 'Actividad del período' : 'Actividad reciente'}
          </h2>
          {hasFilter && (
            <span className="text-xs text-gray-400">{recientes?.length ?? 0} registros</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Operador</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recientes && recientes.length > 0 ? recientes.map(img => (
                <tr key={img.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-700 font-medium">{opMap[img.operator_id] ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(img.created_at ?? img.processed_at).toLocaleString('es-MX')}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[img.validation_state] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATE_LABELS[img.validation_state] ?? img.validation_state}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 max-w-xs truncate">{img.fraud_reason ?? '—'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-gray-400">Sin actividad en este período</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

type Color = 'blue' | 'emerald' | 'violet' | 'amber' | 'red' | 'teal'

const COLOR_MAP: Record<Color, { bg: string; icon: string; value: string }> = {
  blue:    { bg: 'bg-blue-50',    icon: 'text-blue-500',    value: 'text-blue-700' },
  emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-500', value: 'text-emerald-700' },
  violet:  { bg: 'bg-violet-50',  icon: 'text-violet-500',  value: 'text-violet-700' },
  amber:   { bg: 'bg-amber-50',   icon: 'text-amber-500',   value: 'text-amber-700' },
  red:     { bg: 'bg-red-50',     icon: 'text-red-500',     value: 'text-red-700' },
  teal:    { bg: 'bg-teal-50',    icon: 'text-teal-500',    value: 'text-teal-700' },
}

function StatCard({ label, value, color, icon }: {
  label: string
  value: number | string
  color: Color
  icon: React.ReactNode
}) {
  const c = COLOR_MAP[color]
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 ${c.bg} rounded-xl flex items-center justify-center shrink-0`}>
        <svg className={`w-5 h-5 ${c.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {icon}
        </svg>
      </div>
      <div>
        <p className={`text-2xl font-bold ${c.value}`}>{value}</p>
        <p className="text-xs text-gray-400 leading-tight">{label}</p>
      </div>
    </div>
  )
}
