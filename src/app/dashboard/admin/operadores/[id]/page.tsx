import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import EditarOperadorForm from './EditarOperadorForm'

export default async function OperadorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: op }, { data: images }] = await Promise.all([
    supabase.schema('lusa').from('operators')
      .select('id, name, phone, unit, is_active, user_id')
      .eq('id', id)
      .single(),
    supabase.schema('lusa').from('images')
      .select('id, validation_state, processed_at')
      .eq('operator_id', id)
      .order('processed_at', { ascending: false })
      .limit(5),
  ])

  if (!op) notFound()

  const { data: profile } = await supabase.schema('lusa').from('profiles')
    .select('email, full_name')
    .eq('id', op.user_id)
    .single()

  const stats = {
    total:       images?.length ?? 0,
    approved:    images?.filter(i => i.validation_state === 'approved').length ?? 0,
    incidencias: images?.filter(i => i.validation_state !== 'approved').length ?? 0,
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/dashboard/admin/operadores" className="hover:text-gray-700 transition-colors">
          Operadores
        </Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{op.name}</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{op.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{profile?.email ?? '—'}</p>
        </div>
        <Link
          href={`/dashboard/admin/operadores/${id}/incidencias`}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
        >
          Ver incidencias
        </Link>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Imágenes (últimas 5)', value: stats.total },
          { label: 'Aprobadas',           value: stats.approved },
          { label: 'Con incidencias',     value: stats.incidencias },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Formulario editar */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Editar operador</h2>
        </div>
        <div className="p-5">
          <EditarOperadorForm
            id={id}
            initial={{
              name: op.name,
              phone: op.phone,
              unit: op.unit ?? '',
              is_active: op.is_active,
            }}
          />
        </div>
      </div>
    </div>
  )
}
