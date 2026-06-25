import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { notFound } from 'next/navigation'

const FRAUD_DESC: Record<string, string> = {
  cross_operator_exact:   'Esta imagen es una copia exacta de otra imagen registrada en el sistema.',
  cross_operator_similar: 'Esta imagen es muy similar a otra imagen registrada en el sistema.',
  metadata_manipulation:  'Esta imagen fue enviada anteriormente con una fecha/hora diferente.',
  credential_sharing:     'Esta imagen fue enviada con un número de unidad diferente.',
}

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

export default async function MiImagenDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data: operator } = await supabase
    .schema('lusa')
    .from('operators')
    .select('id')
    .eq('user_id', user?.id)
    .single()

  // Solo puede ver sus propias imágenes
  const { data: img } = await supabase
    .schema('lusa')
    .from('images')
    .select('id, validation_state, fraud_reason, storage_path, media_url, processed_at, created_at, fecha_foto, unidad_overlay')
    .eq('id', id)
    .eq('operator_id', operator?.id)
    .single()

  if (!img) notFound()

  // Imagen con la que hizo match
  const matchId   = img.fraud_reason?.includes('::') ? img.fraud_reason.split('::')[1] : null
  const fraudType = img.fraud_reason?.split('::')[0] ?? null

  const adminClient = createAdminClient()
  const { data: matchImg } = matchId
    ? await adminClient.schema('lusa').from('images')
        .select('storage_path, media_url, fecha_foto, unidad_overlay, created_at')
        .eq('id', matchId)
        .single()
    : { data: null }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const imgSrc = img.storage_path
    ? `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${img.storage_path}`
    : img.media_url

  const date = img.created_at ?? img.processed_at

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/operador/imagenes" className="hover:text-gray-700 transition-colors">
          Mis imágenes
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">Detalle</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Detalle de imagen</h1>

      {/* Imagen */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {imgSrc ? (
          <div className="relative">
            <img
              src={imgSrc}
              alt="Tu imagen"
              className="w-full object-contain max-h-[500px] bg-gray-50"
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
          <div className="flex items-center justify-center h-48 text-gray-400">
            Sin imagen disponible
          </div>
        )}
      </div>

      {/* Info */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Estado</span>
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${STATE_STYLES[img.validation_state] ?? 'bg-gray-100 text-gray-600'}`}>
            {STATE_LABELS[img.validation_state] ?? img.validation_state}
          </span>
        </div>

        {img.fraud_reason && (
          <div className="flex items-start justify-between gap-4">
            <span className="text-sm text-gray-500 shrink-0">Motivo</span>
            <span className="text-sm text-gray-700 text-right">{img.fraud_reason}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">Fecha enviada</span>
          <span className="text-sm text-gray-700">
            {new Date(date).toLocaleString('es-MX')}
          </span>
        </div>
      </div>

      {/* Comparación (solo si tiene match y estado manipulated/duplicate) */}
      {matchImg && fraudType && (
        <div className="bg-white rounded-xl border-2 border-red-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2">
            <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-gray-900">Motivo del rechazo</p>
              <p className="text-xs text-gray-500">{FRAUD_DESC[fraudType] ?? 'Coincidencia detectada en el sistema.'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-gray-100">
            {/* Tu imagen */}
            <div className="p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tu imagen</p>
              {imgSrc && (
                <img src={imgSrc} alt="Tu imagen" className="w-full max-h-48 object-contain rounded-lg bg-gray-50 border border-gray-100" />
              )}
              <dl className="space-y-1 text-xs">
                <div className={`flex gap-1.5 ${fraudType === 'metadata_manipulation' ? 'bg-red-50 rounded px-1' : ''}`}>
                  <dt className="text-gray-500 shrink-0">Fecha foto</dt>
                  <dd className={fraudType === 'metadata_manipulation' ? 'text-red-700 font-medium' : 'text-gray-700'}>
                    {img.fecha_foto ? new Date(img.fecha_foto).toLocaleString('es-MX', { timeZone: 'UTC' }) : '—'}
                  </dd>
                </div>
                <div className={`flex gap-1.5 ${fraudType === 'credential_sharing' ? 'bg-amber-50 rounded px-1' : ''}`}>
                  <dt className="text-gray-500 shrink-0">Subida</dt>
                  <dd className="text-gray-700">{new Date(date).toLocaleString('es-MX')}</dd>
                </div>
              </dl>
            </div>

            {/* Imagen coincidente */}
            <div className="p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Imagen coincidente</p>
              {(() => {
                const mSrc = matchImg.storage_path
                  ? `${supabaseUrl}/storage/v1/object/public/imagenes_lusa/${matchImg.storage_path}`
                  : matchImg.media_url
                return mSrc ? (
                  <img src={mSrc} alt="Imagen coincidente" className="w-full max-h-48 object-contain rounded-lg bg-gray-50 border border-gray-100" />
                ) : (
                  <div className="w-full h-32 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-center text-gray-400 text-xs">Sin imagen</div>
                )
              })()}
              <dl className="space-y-1 text-xs">
                <div className={`flex gap-1.5 ${fraudType === 'metadata_manipulation' ? 'bg-red-50 rounded px-1' : ''}`}>
                  <dt className="text-gray-500 shrink-0">Fecha foto</dt>
                  <dd className={fraudType === 'metadata_manipulation' ? 'text-red-700 font-medium' : 'text-gray-700'}>
                    {matchImg.fecha_foto ? new Date(matchImg.fecha_foto).toLocaleString('es-MX', { timeZone: 'UTC' }) : '—'}
                  </dd>
                </div>
                <div className={`flex gap-1.5 ${fraudType === 'credential_sharing' ? 'bg-amber-50 rounded px-1' : ''}`}>
                  <dt className="text-gray-500 shrink-0">Subida</dt>
                  <dd className="text-gray-700">{matchImg.created_at ? new Date(matchImg.created_at).toLocaleString('es-MX') : '—'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      )}

      <Link
        href="/dashboard/operador/imagenes"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← Volver a mis imágenes
      </Link>
    </div>
  )
}
