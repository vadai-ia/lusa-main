import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import ImageThumb from '../../../components/ImageThumb'
import ImagenesFilters from './ImagenesFilters'
import { mxDayBounds } from '@/lib/utils/dates'

const STATE_STYLES: Record<string, string> = {
  approved:        'bg-emerald-100 text-emerald-700',
  duplicate_clean: 'bg-blue-100 text-blue-700',
  intercambiada:   'bg-purple-100 text-purple-700',
  manipulated:     'bg-purple-100 text-purple-700',
  invalida:        'bg-gray-100 text-gray-600',
  invalid:         'bg-gray-100 text-gray-600',
}

const STATE_LABELS: Record<string, string> = {
  approved:        'Aprobada',
  duplicate_clean: 'Duplicada',
  intercambiada:   'Intercambiada',
  manipulated:     'Intercambiada',
  invalida:        'Inválida',
  invalid:         'Inválida',
}

const FRAUD_LABELS: Record<string, string> = {
  cross_operator_exact:   'Copia exacta entre operadores',
  cross_operator_similar: 'Imagen similar entre operadores',
  metadata_manipulation:  'Fecha/hora alterada',
  credential_sharing:     'Compartición de credenciales',
}

function fraudLabel(reason: string | null): string {
  if (!reason) return '—'
  const type = reason.split('::')[0]
  return FRAUD_LABELS[type] ?? reason
}

type SearchParams = Promise<{ estado?: string; desde?: string; hasta?: string; tipo_fecha?: string; operador?: string }>

export default async function ImagenesAdminPage({ searchParams }: { searchParams: SearchParams }) {
  const { estado, desde, hasta, tipo_fecha, operador } = await searchParams
  const supabase  = await createClient()
  const dateCol   = tipo_fecha === 'foto' ? 'fecha_foto' : 'created_at'

  let query = supabase.schema('lusa').from('images')
    .select('id, operator_id, validation_state, fraud_reason, media_url, storage_path, from_phone, created_at, processed_at')
    .order('created_at', { ascending: false })
    .limit(500)

  if (estado === 'intercambiada') query = query.in('validation_state', ['intercambiada', 'manipulated'])
  else if (estado === 'invalida') query = query.in('validation_state', ['invalida', 'invalid'])
  else if (estado)                query = query.eq('validation_state', estado)
  if (operador) query = query.eq('operator_id', operador)
  if (dateCol === 'created_at') {
    if (desde) query = query.gte('created_at', mxDayBounds(desde).start)
    if (hasta) query = query.lte('created_at', mxDayBounds(hasta).end)
  } else {
    if (desde) query = query.gte(dateCol, `${desde}T00:00:00`)
    if (hasta) query = query.lte(dateCol, `${hasta}T23:59:59`)
  }

  const { data: images } = await query

  const { data: operators, error: opError } = await supabase
    .schema('lusa')
    .from('operators')
    .select('id, name, profiles!inner(role)')
    .eq('profiles.role', 'operador')
    .order('name')

  if (opError) console.error('[imagenes] operators error:', opError)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!

  function storageUrl(path: string | null): string | null {
    if (!path) return null
    return `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${path}`
  }

  const opMap = Object.fromEntries((operators ?? []).map(o => [o.id, o]))
  const rows  = (images ?? []).map(img => ({ ...img, operator: opMap[img.operator_id] ?? null }))

  // Export URL builder (server-side, no useSearchParams needed)
  function exportUrl(format: 'csv' | 'xlsx') {
    const q = new URLSearchParams({ format })
    if (estado)     q.set('estado', estado)
    if (operador)   q.set('operador', operador)
    if (desde)      q.set('desde', desde)
    if (hasta)      q.set('hasta', hasta)
    if (tipo_fecha) q.set('tipo_fecha', tipo_fecha)
    return `/api/admin/export?${q.toString()}`
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Imágenes</h1>
        <p className="text-sm text-gray-500 mt-1">Todas las imágenes recibidas por operador</p>
      </div>

      {/* Resumen por estado */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(STATE_LABELS).map(([state, label]) => {
          const count = rows.filter(i => i.validation_state === state).length
          return (
            <div key={state} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-900">{count}</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[state]}`}>
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Filtros */}
      <ImagenesFilters total={rows.length} operators={operators ?? []} />

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-gray-900">Historial completo</h2>
            <span className="text-sm text-gray-400">{rows.length} registros</span>
          </div>
          {/* Botones de exportación y auditoría */}
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/admin/auditoria"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Auditoría
            </Link>
            <a
              href={exportUrl('csv')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar CSV
            </a>
            <a
              href={exportUrl('xlsx')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium rounded-lg hover:bg-emerald-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Exportar Excel
            </a>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Imagen</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Operador</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Teléfono</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Unidad</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Motivo</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length > 0 ? rows.map((img) => (
                <tr key={img.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3">
                    {storageUrl(img.storage_path) ?? img.media_url
                      ? <ImageThumb
                          src={(storageUrl(img.storage_path) ?? img.media_url)!}
                          href={`/dashboard/admin/imagenes/${img.id}`}
                        />
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="px-5 py-3 font-medium text-gray-900">
                    {img.operator?.name ?? img.from_phone ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    {img.operator?.phone ?? img.from_phone ?? '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {img.operator?.unit ?? '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[img.validation_state] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATE_LABELS[img.validation_state] ?? img.validation_state}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500 max-w-xs truncate">
                    {fraudLabel(img.fraud_reason)}
                  </td>
                  <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(img.created_at ?? img.processed_at).toLocaleString('es-MX')}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/admin/imagenes/${img.id}`}
                      className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-100 transition-colors"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                    No hay imágenes con esos filtros
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
