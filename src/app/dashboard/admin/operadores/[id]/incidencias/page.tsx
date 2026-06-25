import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ImageThumb from '../../../../../components/ImageThumb'
import ImagenesFilters from '../../../imagenes/ImagenesFilters'
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

type SearchParams = Promise<{ estado?: string; desde?: string; hasta?: string }>

export default async function IncidenciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  const { id } = await params
  const { estado, desde, hasta } = await searchParams
  const supabase = await createClient()

  let imagesQuery = supabase.schema('lusa').from('images')
    .select('id, validation_state, fraud_reason, storage_path, media_url, objeto_detectado, processed_at, created_at')
    .eq('operator_id', id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (estado === 'intercambiada')      imagesQuery = imagesQuery.in('validation_state', ['intercambiada', 'manipulated'])
  else if (estado === 'invalida')      imagesQuery = imagesQuery.in('validation_state', ['invalida', 'invalid'])
  else if (estado)                     imagesQuery = imagesQuery.eq('validation_state', estado)
  if (desde)  imagesQuery = imagesQuery.gte('created_at', mxDayBounds(desde).start)
  if (hasta)  imagesQuery = imagesQuery.lte('created_at', mxDayBounds(hasta).end)

  const [{ data: op }, { data: images }] = await Promise.all([
    supabase.schema('lusa').from('operators')
      .select('id, name, phone, unit')
      .eq('id', id)
      .single(),
    imagesQuery,
  ])

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  function storageUrl(path: string | null) {
    if (!path) return null
    return `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${path}`
  }

  if (!op) notFound()

  const rows = images ?? []

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/admin/operadores" className="hover:text-gray-700 transition-colors">
          Operadores
        </Link>
        <span>/</span>
        <Link href={`/dashboard/admin/operadores/${id}`} className="hover:text-gray-700 transition-colors">
          {op.name}
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Incidencias</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Incidencias — {op.name}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {op.phone}{op.unit ? ` · ${op.unit}` : ''} · {rows.length} registros
        </p>
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
      <ImagenesFilters total={rows.length} operators={[]} />

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Historial de imágenes</h2>
          <span className="text-sm text-gray-400">{rows.length} registros</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Imagen</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Objeto</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Fecha</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Motivo</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.length > 0 ? rows.map((img) => {
                const src = storageUrl(img.storage_path) ?? img.media_url
                return (
                  <tr key={img.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      {src
                        ? <ImageThumb src={src} href={`/dashboard/admin/imagenes/${img.id}`} />
                        : <span className="text-gray-400 text-xs">—</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-gray-700 capitalize text-sm">
                      {img.objeto_detectado || <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-gray-600 whitespace-nowrap">
                      {new Date(img.created_at ?? img.processed_at).toLocaleString('es-MX')}
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
                        href={`/dashboard/admin/imagenes/${img.id}`}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-100 transition-colors"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-gray-400">
                    Este operador no tiene imágenes registradas
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
