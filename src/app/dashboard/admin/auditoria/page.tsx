import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

const LIMIT = 50

const STATE_LABELS: Record<string, string> = {
  approved:        'Aprobada',
  duplicate_clean: 'Duplicado',
  manipulated:     'Manipulada',
  intercambiada:   'Intercambiada',
  invalid:         'Inválida',
  invalida:        'Inválida',
}

const STATE_COLORS: Record<string, string> = {
  approved:        'bg-emerald-100 text-emerald-700',
  duplicate_clean: 'bg-blue-100 text-blue-700',
  manipulated:     'bg-red-100 text-red-700',
  intercambiada:   'bg-purple-100 text-purple-700',
  invalid:         'bg-gray-100 text-gray-600',
  invalida:        'bg-gray-100 text-gray-600',
}

const ACTION_LABELS: Record<string, string> = {
  manual:              'Manual',
  cross_check:         'Cross-Check',
  crear_contacto:      'Crear contacto',
  importar_contactos:  'Importar contactos',
  editar_contacto:     'Editar contacto',
  eliminar_contacto:   'Eliminar contacto',
  exportar_imagenes:   'Exportar imágenes',
}

const ACTION_COLORS: Record<string, string> = {
  manual:              'bg-violet-100 text-violet-700',
  cross_check:         'bg-amber-100 text-amber-700',
  crear_contacto:      'bg-emerald-100 text-emerald-700',
  importar_contactos:  'bg-blue-100 text-blue-700',
  editar_contacto:     'bg-yellow-100 text-yellow-700',
  eliminar_contacto:   'bg-red-100 text-red-700',
  exportar_imagenes:   'bg-gray-100 text-gray-700',
}

function StateBadge({ state }: { state: string | null }) {
  if (!state) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATE_COLORS[state] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATE_LABELS[state] ?? state}
    </span>
  )
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page   = Math.max(1, parseInt(pageParam ?? '1', 10))
  const offset = (page - 1) * LIMIT

  const supabase = await createClient()

  const [{ data: logs }, { count }] = await Promise.all([
    supabase.schema('lusa').from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + LIMIT - 1),
    supabase.schema('lusa').from('audit_log')
      .select('*', { count: 'exact', head: true }),
  ])

  const total = count ?? 0
  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Log de auditoría</h1>
          <p className="text-sm text-gray-500 mt-1">{total.toLocaleString()} registros en total</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Usuario</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Acción</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Imagen</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Estado anterior</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Estado nuevo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Motivo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {!logs?.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    Sin registros de auditoría
                  </td>
                </tr>
              )}
              {logs?.map(log => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                    {new Date(log.created_at).toLocaleString('es-MX', {
                      timeZone: 'America/Mexico_City',
                      day:    '2-digit',
                      month:  '2-digit',
                      year:   'numeric',
                      hour:   '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                    {log.user_email}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {log.image_id ? (
                      <Link
                        href={`/dashboard/admin/imagenes/${log.image_id}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {log.image_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[160px] truncate" title={log.old_state ?? ''}>
                    {log.old_state
                      ? (STATE_LABELS[log.old_state]
                          ? <StateBadge state={log.old_state} />
                          : <span className="text-gray-500">{log.old_state}</span>)
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[160px] truncate" title={log.new_state ?? ''}>
                    {log.new_state
                      ? (STATE_LABELS[log.new_state]
                          ? <StateBadge state={log.new_state} />
                          : <span className="text-gray-500">{log.new_state}</span>)
                      : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-[220px] truncate" title={log.new_fraud_reason ?? ''}>
                    {log.new_fraud_reason ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`?page=${page - 1}`}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs"
                >
                  ← Anterior
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`?page=${page + 1}`}
                  className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-xs"
                >
                  Siguiente →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
