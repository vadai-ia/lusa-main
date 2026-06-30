import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ImageStateForm from './ImageStateForm'

const FRAUD_UI: Record<string, { badge: string; color: string; desc: string }> = {
  cross_operator_exact:   { badge: 'Copia exacta',              color: 'bg-red-100 text-red-700',      desc: 'MD5 idéntico — misma imagen enviada por otro operador' },
  cross_operator_similar: { badge: 'Imagen similar',            color: 'bg-orange-100 text-orange-700', desc: 'Hash visual similar — imagen casi idéntica de otro operador' },
  metadata_manipulation:  { badge: 'Metadata manipulada',       color: 'bg-red-100 text-red-700',      desc: 'Misma foto reenviada con fecha/hora alterada' },
  credential_sharing:     { badge: 'Credenciales compartidas',  color: 'bg-amber-100 text-amber-700',  desc: 'Misma foto enviada con número de unidad diferente' },
}

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

export default async function ImagenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: img } = await supabase.schema('lusa').from('images')
    .select(`
      id, validation_state, fraud_reason,
      storage_path, media_url,
      md5_hash, phash, whaapy_message_id,
      operator_id, from_phone,
      created_at, processed_at,
      ocr_text, objeto_detectado,
      fecha_foto, rumbo, direccion,
      latitud, longitud, altitud_m, velocidad_kmh,
      operador_overlay, unidad_overlay
    `)
    .eq('id', id)
    .single()

  if (!img) notFound()

  const { data: op } = img.operator_id
    ? await supabase.schema('lusa').from('operators')
        .select('name, phone, unit')
        .eq('id', img.operator_id)
        .single()
    : { data: null }

  // Imagen con la que hizo match (si aplica)
  const matchId   = img.fraud_reason?.includes('::') ? img.fraud_reason.split('::')[1] : null
  const fraudType = img.fraud_reason?.split('::')[0] ?? null

  const { data: matchImg } = matchId
    ? await supabase.schema('lusa').from('images')
        .select('id, storage_path, media_url, operator_id, created_at, fecha_foto, operador_overlay, unidad_overlay, validation_state')
        .eq('id', matchId)
        .single()
    : { data: null }

  const { data: matchOp } = matchImg?.operator_id
    ? await supabase.schema('lusa').from('operators')
        .select('name, phone, unit')
        .eq('id', matchImg.operator_id)
        .single()
    : { data: null }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const imgSrc = img.storage_path
    ? `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${img.storage_path}`
    : img.media_url

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/admin/imagenes" className="hover:text-gray-700 transition-colors">
          Imágenes
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate">{id}</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Detalle de imagen</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Imagen */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {imgSrc ? (
            <div className="relative">
              <img
                src={imgSrc}
                alt="Imagen del operador"
                className="w-full object-contain max-h-[600px] bg-gray-50"
              />
              <a
                href={imgSrc}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 right-3 px-3 py-1.5 bg-black/50 text-white text-xs font-medium rounded-lg hover:bg-black/70 transition-colors"
              >
                Abrir original
              </a>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-400">
              Sin imagen disponible
            </div>
          )}
        </div>

        {/* Panel derecho */}
        <div className="space-y-4">

          {/* Estado + cambio manual */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATE_STYLES[img.validation_state] ?? 'bg-gray-100 text-gray-600'}`}>
                {STATE_LABELS[img.validation_state] ?? img.validation_state}
              </span>
            </div>
            <ImageStateForm
              imageId={img.id}
              currentState={img.validation_state}
              currentFraudReason={img.fraud_reason}
            />
          </div>

          {/* Objeto detectado */}
          {img.objeto_detectado != null && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Objeto detectado</h2>
              <p className="text-lg font-semibold text-gray-900 capitalize">
                {img.objeto_detectado || <span className="text-gray-400 font-normal text-sm">No identificado</span>}
              </p>
            </div>
          )}

          {/* Datos del overlay */}
          {(img.fecha_foto ?? img.direccion ?? img.operador_overlay ?? img.rumbo) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Datos del overlay</h2>
              <dl className="space-y-2">
                {img.fecha_foto && (
                  <Row label="Fecha foto" value={new Date(img.fecha_foto).toLocaleString('es-MX', { timeZone: 'UTC' })} />
                )}
                {img.rumbo && (
                  <Row label="Rumbo" value={img.rumbo} />
                )}
                {img.velocidad_kmh != null && (
                  <Row label="Velocidad" value={`${img.velocidad_kmh} km/h`} />
                )}
                {img.altitud_m != null && (
                  <Row label="Altitud" value={`${img.altitud_m} m`} />
                )}
                {img.direccion && (
                  <Row label="Dirección" value={img.direccion} />
                )}
                {img.operador_overlay && (
                  <Row label="Operador" value={img.operador_overlay} />
                )}
                {img.unidad_overlay && (
                  <Row label="Unidad" value={img.unidad_overlay} />
                )}
              </dl>
            </div>
          )}

          {/* GPS */}
          {(img.latitud != null && img.longitud != null) && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Coordenadas GPS</h2>
              <dl className="space-y-2">
                <Row label="Latitud"  value={img.latitud.toFixed(6)} mono />
                <Row label="Longitud" value={img.longitud.toFixed(6)} mono />
              </dl>
              <a
                href={`https://maps.google.com/?q=${img.latitud},${img.longitud}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs text-blue-600 hover:underline"
              >
                Ver en Google Maps →
              </a>
            </div>
          )}

          {/* Operador registrado */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Operador registrado</h2>
            <dl className="space-y-2">
              <Row label="Nombre"   value={op?.name ?? img.from_phone ?? '—'} />
              <Row label="Teléfono" value={op?.phone ?? img.from_phone ?? '—'} />
              <Row label="Unidad"   value={op?.unit ?? '—'} />
            </dl>
            {img.operator_id && (
              <Link
                href={`/dashboard/admin/operadores/${img.operator_id}`}
                className="mt-3 inline-block text-xs text-blue-600 hover:underline"
              >
                Ver operador →
              </Link>
            )}
          </div>

          {/* Hashes */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Hashes</h2>
            <dl className="space-y-2">
              {img.md5_hash && <Row label="MD5"   value={img.md5_hash} mono />}
              {img.phash    && <Row label="dHash" value={img.phash}    mono />}
              {img.whaapy_message_id && <Row label="Msg ID" value={img.whaapy_message_id} mono />}
              <Row
                label="Recibida"
                value={img.created_at
                  ? new Date(img.created_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
                  : img.processed_at
                    ? new Date(img.processed_at).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })
                    : '—'}
              />
            </dl>
          </div>

          {/* OCR raw */}
          {img.ocr_text != null && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">OCR raw</h2>
              {img.ocr_text ? (
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                  {img.ocr_text}
                </pre>
              ) : (
                <span className="text-sm text-gray-400">Sin texto detectado</span>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Comparación de coincidencia ─────────────────────────────────── */}
      {matchImg && fraudType && (
        <div className="bg-white rounded-xl border-2 border-red-200">
          {/* Header */}
          <div className="px-5 py-4 border-b border-red-100 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="font-semibold text-gray-900">Coincidencia detectada</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FRAUD_UI[fraudType]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                  {FRAUD_UI[fraudType]?.badge ?? fraudType}
                </span>
              </div>
              <p className="text-xs text-gray-500">{FRAUD_UI[fraudType]?.desc}</p>
            </div>
            <Link
              href={`/dashboard/admin/imagenes/${matchImg.id}`}
              className="text-xs text-blue-600 hover:underline shrink-0"
            >
              Ver imagen coincidente →
            </Link>
          </div>

          {/* Comparación lado a lado */}
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* Esta imagen */}
            <CompareCard
              title="Esta imagen"
              imgSrc={imgSrc ?? null}
              operadorNombre={op?.name ?? img.from_phone ?? '—'}
              operadorUnidad={op?.unit ?? img.unidad_overlay ?? '—'}
              fechaFoto={img.fecha_foto}
              fechaSubida={img.created_at}
              operadorId={img.operator_id}
              supabaseUrl={supabaseUrl}
              highlight={
                fraudType === 'metadata_manipulation' ? 'fecha_foto' :
                fraudType === 'credential_sharing'    ? 'unidad'     : null
              }
            />

            {/* Imagen coincidente */}
            <CompareCard
              title="Imagen coincidente"
              imgSrc={
                matchImg.storage_path
                  ? `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${matchImg.storage_path}`
                  : matchImg.media_url
              }
              operadorNombre={matchOp?.name ?? '—'}
              operadorUnidad={matchOp?.unit ?? matchImg.unidad_overlay ?? '—'}
              fechaFoto={matchImg.fecha_foto}
              fechaSubida={matchImg.created_at}
              operadorId={matchImg.operator_id}
              supabaseUrl={supabaseUrl}
              highlight={
                fraudType === 'metadata_manipulation' ? 'fecha_foto' :
                fraudType === 'credential_sharing'    ? 'unidad'     : null
              }
            />
          </div>
        </div>
      )}

    </div>
  )
}

function CompareCard({
  title, imgSrc, operadorNombre, operadorUnidad,
  fechaFoto, fechaSubida, operadorId, supabaseUrl: _su, highlight,
}: {
  title: string
  imgSrc: string | null
  operadorNombre: string
  operadorUnidad: string
  fechaFoto: string | null
  fechaSubida: string | null
  operadorId: string | null
  supabaseUrl: string
  highlight: 'fecha_foto' | 'unidad' | null
}) {
  return (
    <div className="p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      {imgSrc ? (
        <a href={imgSrc} target="_blank" rel="noopener noreferrer">
          <img src={imgSrc} alt={title} className="w-full max-h-64 object-contain rounded-lg bg-gray-50 border border-gray-100 hover:opacity-90 transition-opacity" />
        </a>
      ) : (
        <div className="w-full h-40 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 text-sm">Sin imagen</div>
      )}
      <dl className="space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="text-gray-500 w-24 shrink-0">Operador</dt>
          <dd className="text-gray-900 font-medium">{operadorNombre}</dd>
        </div>
        <div className={`flex gap-2 ${highlight === 'unidad' ? 'bg-amber-50 -mx-1 px-1 rounded' : ''}`}>
          <dt className="text-gray-500 w-24 shrink-0">Unidad</dt>
          <dd className={`font-medium ${highlight === 'unidad' ? 'text-amber-700' : 'text-gray-900'}`}>{operadorUnidad}</dd>
        </div>
        <div className={`flex gap-2 ${highlight === 'fecha_foto' ? 'bg-red-50 -mx-1 px-1 rounded' : ''}`}>
          <dt className="text-gray-500 w-24 shrink-0">Fecha foto</dt>
          <dd className={`font-medium ${highlight === 'fecha_foto' ? 'text-red-700' : 'text-gray-900'}`}>
            {fechaFoto ? new Date(fechaFoto).toLocaleString('es-MX', { timeZone: 'UTC' }) : '—'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-gray-500 w-24 shrink-0">Subida</dt>
          <dd className="text-gray-700">{fechaSubida ? new Date(fechaSubida).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) : '—'}</dd>
        </div>
        {operadorId && (
          <div className="pt-1">
            <Link href={`/dashboard/admin/operadores/${operadorId}`} className="text-xs text-blue-600 hover:underline">
              Ver operador →
            </Link>
          </div>
        )}
      </dl>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="text-gray-500 w-24 shrink-0">{label}</dt>
      <dd className={`text-gray-900 min-w-0 break-words ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
