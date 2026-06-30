import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import OperadorFiltros from './OperadorFiltros'
import { mxDayBounds } from '@/lib/utils/dates'

const STATE_STYLES: Record<string, string> = {
  approved:        'bg-emerald-100 text-emerald-700',
  duplicate_clean: 'bg-blue-100 text-blue-700',
  intercambiada:   'bg-purple-100 text-purple-700',
  manipulated:     'bg-red-100 text-red-700',
  invalida:        'bg-gray-100 text-gray-600',
  invalid:         'bg-gray-100 text-gray-600',
}
const STATE_LABELS: Record<string, string> = {
  approved:        'Aprobada',
  duplicate_clean: 'Duplicada',
  intercambiada:   'Intercambiada',
  manipulated:     'Manipulada',
  invalida:        'Inválida',
  invalid:         'Inválida',
}

type SearchParams = Promise<{ desde?: string; hasta?: string; tipo_fecha?: string }>

export default async function OperadorPage({ searchParams }: { searchParams: SearchParams }) {
  const { desde, hasta, tipo_fecha } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: operator } = await supabase
    .schema('lusa')
    .from('operators')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const opId      = operator?.id
  const dateCol   = tipo_fecha === 'foto' ? 'fecha_foto' : 'created_at'
  const hasFilter = !!(desde || hasta)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function dated(q: any) {
    if (dateCol === 'created_at') {
      if (desde) q = q.gte('created_at', mxDayBounds(desde).start)
      if (hasta) q = q.lte('created_at', mxDayBounds(hasta).end)
    } else {
      if (desde) q = q.gte(dateCol, `${desde}T00:00:00`)
      if (hasta) q = q.lte(dateCol, `${hasta}T23:59:59`)
    }
    return q
  }

  const base = () => supabase.schema('lusa').from('images')
    .select('*', { count: 'exact', head: true })
    .eq('operator_id', opId)

  const [
    { count: total },
    { count: aprobadas },
    { count: rechazadas },
  ] = await Promise.all([
    dated(base()),
    dated(base().eq('validation_state', 'approved')),
    dated(base().in('validation_state', ['manipulated', 'invalid', 'duplicate_clean'])),
  ])

  let tableQuery = supabase
    .schema('lusa')
    .from('images')
    .select('id, validation_state, fraud_reason, processed_at, created_at')
    .eq('operator_id', opId)
    .order('created_at', { ascending: false })

  if (dateCol === 'created_at') {
    if (desde) tableQuery = tableQuery.gte('created_at', mxDayBounds(desde).start)
    if (hasta) tableQuery = tableQuery.lte('created_at', mxDayBounds(hasta).end)
  } else {
    if (desde) tableQuery = tableQuery.gte(dateCol, `${desde}T00:00:00`)
    if (hasta) tableQuery = tableQuery.lte(dateCol, `${hasta}T23:59:59`)
  }
  tableQuery = tableQuery.limit(hasFilter ? 200 : 20)

  const { data: images } = await tableQuery

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi panel</h1>
        <p className="text-sm text-gray-500 mt-1">Tus imágenes procesadas</p>
      </div>

      {/* Filtros */}
      <Suspense fallback={null}>
        <OperadorFiltros />
      </Suspense>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: hasFilter ? 'En el período' : 'Total', value: total    ?? 0, color: 'blue-600' },
          { label: 'Aprobadas',                            value: aprobadas ?? 0, color: 'emerald-600' },
          { label: 'Rechazadas',                           value: rechazadas ?? 0, color: 'red-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className={`text-3xl font-bold text-${color}`}>{value}</p>
            <p className="text-sm text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            {hasFilter ? 'Actividad del período' : 'Historial de imágenes'}
          </h2>
          {hasFilter && (
            <span className="text-xs text-gray-400">{images?.length ?? 0} registros</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha subida</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {images && images.length > 0 ? images.map((img) => (
                <tr key={img.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(img.created_at ?? img.processed_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[img.validation_state] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATE_LABELS[img.validation_state] ?? img.validation_state}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{img.fraud_reason ?? '—'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} className="px-5 py-8 text-center text-gray-400">
                    {hasFilter ? 'Sin actividad en este período' : 'No tienes imágenes registradas aún'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
