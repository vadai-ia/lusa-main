import { createClient } from '@/lib/supabase/server'
import OperadoresClient from './OperadoresClient'

export default async function OperadoresPage() {
  const supabase = await createClient()

  const [{ data: operators }, { data: profiles }, { data: images }] = await Promise.all([
    supabase.schema('lusa').from('operators')
      .select('id, name, phone, unit, is_active, user_id, last_image_at')
      .order('name'),
    supabase.schema('lusa').from('profiles')
      .select('id, email')
      .eq('role', 'operador'),
    supabase.schema('lusa').from('images')
      .select('operator_id'),
  ])

  const emailMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.email]))

  const countMap: Record<string, number> = {}
  for (const img of images ?? []) {
    countMap[img.operator_id] = (countMap[img.operator_id] ?? 0) + 1
  }

  const rows = (operators ?? []).map(op => ({
    ...op,
    email:       emailMap[op.user_id] ?? null,
    incidencias: countMap[op.id]      ?? 0,
    last_image_at: op.last_image_at   ?? null,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operadores</h1>
          <p className="text-sm text-gray-500 mt-1">{rows.length} operadores registrados</p>
        </div>
      </div>
      <OperadoresClient operators={rows} />
    </div>
  )
}
