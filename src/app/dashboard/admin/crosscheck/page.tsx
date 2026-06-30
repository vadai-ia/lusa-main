import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import RunCrossCheckButton from './RunCrossCheckButton'

const FRAUD_META: Record<string, { label: string; badge: string; desc: string }> = {
  cross_operator_exact:   { label: 'Copia exacta entre operadores',  badge: 'bg-red-100 text-red-700',    desc: 'MD5 idéntico — archivo binario exactamente igual' },
  cross_operator_similar: { label: 'Imagen similar entre operadores', badge: 'bg-orange-100 text-orange-700', desc: 'pHash igual — misma imagen, posiblemente recomprimida' },
  metadata_manipulation:  { label: 'Fecha o metadata alterada',       badge: 'bg-purple-100 text-purple-700', desc: 'Misma imagen, distinta fecha/hora en el overlay' },
  credential_sharing:     { label: 'Compartición de credenciales',    badge: 'bg-yellow-100 text-yellow-700', desc: 'Misma imagen, distinto número de unidad' },
}

function parseFraud(reason: string | null) {
  if (!reason || !reason.includes('::')) return null
  const [type, matchedId] = reason.split('::')
  return { type, matchedId }
}

function storageUrl(supabaseUrl: string, path: string | null): string | null {
  if (!path) return null
  return `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${path}`
}

function fmt(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'short' })
}

export default async function CrossCheckPage() {
  const supabase     = await createClient()
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!

  // 1. Todas las imágenes con fraude cruzado (fraud_reason contiene '::')
  const { data: fraudImages } = await supabase.schema('lusa').from('images')
    .select('id, operator_id, storage_path, fraud_reason, created_at, fecha_foto, unidad_overlay, operador_overlay')
    .in('validation_state', ['intercambiada', 'manipulated'])
    .like('fraud_reason', '%::%')
    .order('created_at', { ascending: false })
    .limit(200)

  // 2. Extraer IDs de imágenes originales para batch-fetch
  const cases = (fraudImages ?? []).map(img => ({
    img,
    parsed: parseFraud(img.fraud_reason),
  })).filter(c => c.parsed !== null)

  const matchedIds = [...new Set(cases.map(c => c.parsed!.matchedId))]

  // 3. Batch-fetch imágenes originales
  const { data: matchedRaw } = matchedIds.length > 0
    ? await supabase.schema('lusa').from('images')
        .select('id, operator_id, storage_path, created_at, fecha_foto, unidad_overlay, operador_overlay')
        .in('id', matchedIds)
    : { data: [] }

  const matchedMap = Object.fromEntries((matchedRaw ?? []).map(m => [m.id, m]))

  // 4. Batch-fetch operadores
  const allOpIds = [...new Set([
    ...(fraudImages ?? []).map(i => i.operator_id),
    ...(matchedRaw  ?? []).map(i => i.operator_id),
  ].filter(Boolean))]

  const { data: operators } = allOpIds.length > 0
    ? await supabase.schema('lusa').from('operators')
        .select('id, name, unit, phone')
        .in('id', allOpIds)
    : { data: [] }

  const opMap = Object.fromEntries((operators ?? []).map(o => [o.id, o]))

  // Conteo por tipo de fraude
  const countByType = cases.reduce<Record<string, number>>((acc, c) => {
    const t = c.parsed!.type
    acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Motor Cross-Check</h1>
          <p className="text-sm text-gray-500 mt-1">Fraudes detectados por comparación cruzada entre operadores</p>
        </div>
        <RunCrossCheckButton />
      </div>

      {/* Resumen por tipo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(FRAUD_META).map(([type, meta]) => (
          <div key={type} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-2xl font-bold text-gray-900">{countByType[type] ?? 0}</p>
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.badge}`}>
              {meta.label}
            </span>
          </div>
        ))}
      </div>

      {/* Lista de casos */}
      {cases.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-500 font-medium">Sin fraudes cruzados detectados</p>
          <p className="text-gray-400 text-sm mt-1">El motor revisará cada imagen nueva automáticamente</p>
        </div>
      ) : (
        <div className="space-y-4">
          {cases.map(({ img, parsed }) => {
            const fraud    = parsed!
            const meta     = FRAUD_META[fraud.type]
            const original = matchedMap[fraud.matchedId]
            const opNew    = opMap[img.operator_id]
            const opOrig   = original ? opMap[original.operator_id] : null

            return (
              <div key={img.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${meta?.badge ?? 'bg-gray-100 text-gray-600'}`}>
                      {meta?.label ?? fraud.type}
                    </span>
                    {meta?.desc && (
                      <span className="text-xs text-gray-400">{meta.desc}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{fmt(img.created_at)}</span>
                </div>

                {/* Side-by-side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                  {/* Imagen sospechosa (nueva) */}
                  <ImageCard
                    label="Imagen sospechosa"
                    labelColor="text-red-600"
                    imgUrl={storageUrl(supabaseUrl, img.storage_path)}
                    href={`/dashboard/admin/imagenes/${img.id}`}
                    operador={opNew?.name ?? img.operador_overlay ?? '—'}
                    unidad={opNew?.unit ?? img.unidad_overlay ?? '—'}
                    fecha={img.fecha_foto ?? img.created_at}
                  />

                  {/* Imagen original */}
                  {original ? (
                    <ImageCard
                      label="Imagen original"
                      labelColor="text-emerald-600"
                      imgUrl={storageUrl(supabaseUrl, original.storage_path)}
                      href={`/dashboard/admin/imagenes/${original.id}`}
                      operador={opOrig?.name ?? original.operador_overlay ?? '—'}
                      unidad={opOrig?.unit ?? original.unidad_overlay ?? '—'}
                      fecha={original.fecha_foto ?? original.created_at}
                    />
                  ) : (
                    <div className="p-5 flex items-center justify-center text-gray-300 text-sm">
                      Imagen original no encontrada
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ImageCard({ label, labelColor, imgUrl, href, operador, unidad, fecha }: {
  label: string
  labelColor: string
  imgUrl: string | null
  href: string
  operador: string
  unidad: string
  fecha: string | null
}) {
  return (
    <div className="p-5 space-y-3">
      <p className={`text-xs font-semibold uppercase tracking-wide ${labelColor}`}>{label}</p>

      {imgUrl ? (
        <Link href={href} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgUrl}
            alt={label}
            className="w-full h-48 object-cover rounded-lg border border-gray-100 hover:opacity-90 transition-opacity"
          />
        </Link>
      ) : (
        <div className="w-full h-48 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center text-gray-300 text-sm">
          Sin imagen
        </div>
      )}

      <div className="space-y-1 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-16 shrink-0">Operador</span>
          <span className="font-medium text-gray-900 truncate">{operador}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-16 shrink-0">Unidad</span>
          <span className="text-gray-700">{unidad}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 w-16 shrink-0">Fecha</span>
          <span className="text-gray-700">{fmt(fecha)}</span>
        </div>
      </div>

      <Link
        href={href}
        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
      >
        Ver detalle completo
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}
