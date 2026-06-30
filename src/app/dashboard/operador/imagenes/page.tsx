import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Suspense } from 'react'
import ImageThumb from '../../../components/ImageThumb'
import OperadorFiltros from '../OperadorFiltros'
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

type SearchParams = Promise<{ estado?: string; desde?: string; hasta?: string; tipo_fecha?: string }>

export default async function MisImagenesPage({ searchParams }: { searchParams: SearchParams }) {
  const { estado, desde, hasta, tipo_fecha } = await searchParams
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: operator } = await supabase
    .schema('lusa')
    .from('operators')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  const opId    = operator?.id
  const dateCol = tipo_fecha === 'foto' ? 'fecha_foto' : 'created_at'

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function withEstado(q: any) {
    if (estado === 'invalida')      return q.in('validation_state', ['invalida', 'invalid'])
    if (estado) return q.eq('validation_state', estado)
    return q
  }

  const base = () => supabase.schema('lusa').from('images')
    .select('*', { count: 'exact', head: true })
    .eq('operator_id', opId)

  const [
    { count: total },
    { count: countAprobadas },
    { count: countDuplicadas },
    { count: countManipuladas },
    { count: countIntercambiadas },
    { count: countInvalidas },
  ] = await Promise.all([
    dated(base()),
    dated(base().eq('validation_state', 'approved')),
    dated(base().eq('validation_state', 'duplicate_clean')),
    dated(base().eq('validation_state', 'manipulated')),
    dated(base().eq('validation_state', 'intercambiada')),
    dated(base().in('validation_state', ['invalida', 'invalid'])),
  ])

  let query = supabase
    .schema('lusa')
    .from('images')
    .select('id, validation_state, fraud_reason, storage_path, media_url, processed_at, created_at')
    .eq('operator_id', opId)
    .order('created_at', { ascending: false })
    .limit(200)

  query = dated(query)
  query = withEstado(query)

  const { data: images } = await query
  const rows = images ?? []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  function storageUrl(path: string | null) {
    if (!path) return null
    return `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${path}`
  }

  const hasFilter = !!(estado || desde || hasta)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis imágenes</h1>
        <p className="text-sm text-gray-500 mt-1">{total ?? 0} imágenes en el período</p>
      </div>

      {/* Filtros */}
      <Suspense fallback={null}>
        <OperadorFiltros showEstado />
      </Suspense>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total',          value: total                ?? 0, style: 'text-gray-900' },
          { label: 'Aprobadas',      value: countAprobadas       ?? 0, style: 'text-emerald-600' },
          { label: 'Duplicadas',     value: countDuplicadas      ?? 0, style: 'text-blue-600' },
          { label: 'Manipuladas',    value: countManipuladas     ?? 0, style: 'text-red-600' },
          { label: 'Intercambiadas', value: countIntercambiadas  ?? 0, style: 'text-purple-600' },
          { label: 'Inválidas',      value: countInvalidas       ?? 0, style: 'text-gray-500' },
        ].map(({ label, value, style }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${style}`}>{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            {hasFilter ? 'Resultados filtrados' : 'Historial'}
          </h2>
          <span className="text-sm text-gray-400">{rows.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Imagen</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Motivo</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length > 0 ? rows.map((img) => {
                const src  = storageUrl(img.storage_path) ?? img.media_url
                const date = img.created_at ?? img.processed_at
                return (
                  <tr key={img.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      {src
                        ? <ImageThumb src={src} href={`/dashboard/operador/imagenes/${img.id}`} />
                        : <span className="text-gray-400 text-xs">Sin imagen</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(date).toLocaleString('es-MX')}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[img.validation_state] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATE_LABELS[img.validation_state] ?? img.validation_state}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 max-w-xs truncate">
                      {img.fraud_reason ?? '—'}
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/dashboard/operador/imagenes/${img.id}`}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-100 transition-colors"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-gray-400">
                    {hasFilter ? 'Sin imágenes con esos filtros' : 'No has enviado imágenes aún'}
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
