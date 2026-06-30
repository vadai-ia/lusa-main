import { createClient } from '@/lib/supabase/server'
import EquipoClient from './EquipoClient'

export default async function EquipoPage() {
  const supabase = await createClient()

  const [{ data: profiles }, { data: operators }] = await Promise.all([
    supabase.schema('lusa').from('profiles').select('id, email, role, full_name').order('role'),
    supabase.schema('lusa').from('operators').select('id, user_id, phone, unit, is_active'),
  ])

  const opByUserId = Object.fromEntries(
    (operators ?? []).map(o => [o.user_id, { id: o.id, phone: o.phone as string | null, unit: o.unit as string | null, is_active: o.is_active as boolean ?? true }])
  )

  // Conteo de imágenes por operador
  const operatorIds = (operators ?? []).map(o => o.id)
  const { data: imgRows } = operatorIds.length > 0
    ? await supabase.schema('lusa').from('images').select('operator_id').in('operator_id', operatorIds)
    : { data: [] as { operator_id: string }[] }

  const countByOp = (imgRows ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.operator_id] = (acc[r.operator_id] ?? 0) + 1
    return acc
  }, {})

  const members = (profiles ?? []).map(p => ({
    ...p,
    operator_id:  opByUserId[p.id]?.id        ?? null,
    phone:        opByUserId[p.id]?.phone      ?? null,
    unit:         opByUserId[p.id]?.unit       ?? null,
    is_active:    opByUserId[p.id]?.is_active  ?? true,
    image_count:  countByOp[opByUserId[p.id]?.id ?? ''] ?? 0,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mi equipo</h1>
        <p className="text-sm text-gray-500 mt-1">{members.length} miembros registrados</p>
      </div>
      <EquipoClient members={members} />
    </div>
  )
}
